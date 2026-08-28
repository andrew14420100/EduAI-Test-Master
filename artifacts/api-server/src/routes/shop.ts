import { Router, type IRouter, type Request, type Response } from "express";
import { randomUUID } from "crypto";
import { eq, and, sql } from "drizzle-orm";
import { db, ownedShopItemsTable, profilesTable } from "@workspace/db";
import { requireAuth, type AuthedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

// ─── Server-side catalog (single source of truth) ──────────────────────────
// Format: itemId → { itemType, price }
type CatalogEntry = { itemType: string; price: number };

const SHOP_CATALOG: Record<string, CatalogEntry> = {
  // Temi
  dark:           { itemType: "tema",        price: 15  },
  neon:           { itemType: "tema",        price: 40  },
  ocean:          { itemType: "tema",        price: 55  },
  forest:         { itemType: "tema",        price: 65  },
  sunset:         { itemType: "tema",        price: 75  },
  midnight:       { itemType: "tema",        price: 90  },
  ember:          { itemType: "tema",        price: 110 },
  arctic:         { itemType: "tema",        price: 130 },
  // Animazioni di completamento
  anim_confetti:  { itemType: "animazione_completamento", price: 25  },
  anim_stars:     { itemType: "animazione_completamento", price: 35  },
  anim_fire:      { itemType: "animazione_completamento", price: 50  },
  anim_aurora:    { itemType: "animazione_livello", price: 70  },
  anim_lightning: { itemType: "animazione_livello", price: 90  },
  anim_crown:     { itemType: "animazione_completamento", price: 120 },
  event_levelup:  { itemType: "animazione_livello", price: 45 },
  event_streak:   { itemType: "animazione_streak", price: 40 },
  event_upload:   { itemType: "animazione_upload", price: 35 },
  event_answer:   { itemType: "animazione_risposta", price: 30 },
  event_unlock:   { itemType: "animazione_sblocco", price: 55 },
  event_interface:{ itemType: "animazione_interfaccia", price: 60 },
  avatar_gold_frame: { itemType: "cornice_avatar", price: 95 },
  avatar_glow_frame: { itemType: "cornice_avatar", price: 160 },
  profile_stats_glow: { itemType: "decorazione_profilo", price: 75 },
  profile_stats_glitch: { itemType: "decorazione_profilo", price: 180 },
  // Stili carta
  card_glass:     { itemType: "stile_carta", price: 30  },
  card_gradient:  { itemType: "stile_carta", price: 45  },
  card_minimal:   { itemType: "stile_carta", price: 55  },
  card_neon:      { itemType: "stile_carta", price: 80  },
  card_paper:     { itemType: "stile_carta", price: 60  },
  // Titoli profilo
  title_studioso:   { itemType: "titolo",    price: 20  },
  title_stratega:   { itemType: "titolo",    price: 35  },
  title_pioniere:   { itemType: "titolo",    price: 50  },
  title_genio:      { itemType: "titolo",    price: 75  },
  title_maratoneta: { itemType: "titolo",    price: 95  },
  title_maestro:    { itemType: "titolo",    price: 130 },
  title_leggenda:   { itemType: "titolo",    price: 200 },
  title_professore: { itemType: "titolo",    price: 160 },
  // Distintivi
  badge_first_pass:   { itemType: "distintivo", price: 10  },
  badge_streak7:      { itemType: "distintivo", price: 40  },
  badge_100:          { itemType: "distintivo", price: 60  },
  badge_error_hunter: { itemType: "distintivo", price: 80  },
  badge_speed:        { itemType: "distintivo", price: 100 },
  badge_library:      { itemType: "distintivo", price: 120 },
  badge_grandmaster:  { itemType: "distintivo", price: 250 },
  // Loghi profilo, disponibili immediatamente come personalizzazione equipaggiabile
  app_icon_midnight: { itemType: "icona_futura", price: 110 },
  app_icon_neon:     { itemType: "icona_futura", price: 140 },
  app_icon_scholar:  { itemType: "icona_futura", price: 170 },
  app_icon_aurora:   { itemType: "icona_futura", price: 210 },
  app_icon_legend:   { itemType: "icona_futura", price: 260 },
};

/**
 * Theme selection is shared across a user's devices. Serializing mutations on
 * a per-user PostgreSQL advisory lock prevents an equip and a reset-to-light
 * request from interleaving and leaving a stale active palette.
 */
async function lockUserThemeSelection(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  userId: string,
) {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${userId}))`,
  );
}

/**
 * GET /shop/inventory — get owned/equipped items for current user
 */
router.get(
  "/shop/inventory",
  requireAuth,
  async (req: Request, res: Response) => {
    const userId = (req as AuthedRequest).clerkUserId;
    try {
      const items = await db
        .select()
        .from(ownedShopItemsTable)
        .where(eq(ownedShopItemsTable.userId, userId));
      res.json(items);
    } catch (err) {
      req.log.error({ err }, "Errore recupero inventario");
      res.status(500).json({ error: "Errore interno del server" });
    }
  },
);

/**
 * POST /shop/buy — purchase a shop item.
 *
 * Security:
 * - Only accepts itemId; price and type are resolved from server catalog.
 * - Rejects unknown item IDs.
 * - Uses a DB transaction to atomically: check ownership, check balance, debit, insert.
 * - Unique constraint on (userId, itemId) prevents duplicates.
 * - Returns 409 for duplicate purchase, 400 for insufficient funds.
 */
router.post("/shop/buy", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as AuthedRequest).clerkUserId;
  const { itemId } = req.body as { itemId?: string };

  if (!itemId || typeof itemId !== "string" || itemId.trim() === "") {
    res.status(400).json({ error: "itemId è obbligatorio" });
    return;
  }

  const catalogEntry = SHOP_CATALOG[itemId];
  if (!catalogEntry) {
    res.status(400).json({ error: "Oggetto non trovato nel catalogo" });
    return;
  }

  const { itemType, price } = catalogEntry;

  try {
    const item = await db.transaction(async (tx) => {
      // Check not already owned (inside transaction)
      const [alreadyOwned] = await tx
        .select()
        .from(ownedShopItemsTable)
        .where(
          and(
            eq(ownedShopItemsTable.userId, userId),
            eq(ownedShopItemsTable.itemId, itemId),
          ),
        );

      if (alreadyOwned) {
        // Throw a typed error so we can return 409 outside the transaction
        const err = new Error("ALREADY_OWNED");
        (err as Error & { code: string }).code = "ALREADY_OWNED";
        throw err;
      }

      // Check balance and debit atomically
      const updated = await tx
        .update(profilesTable)
        .set({
          wallet: sql`${profilesTable.wallet} - ${price}`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(profilesTable.userId, userId),
            sql`${profilesTable.wallet} >= ${price}`,
          ),
        )
        .returning({ wallet: profilesTable.wallet });

      if (updated.length === 0) {
        // Either profile missing or insufficient funds
        const [profile] = await tx
          .select({ wallet: profilesTable.wallet })
          .from(profilesTable)
          .where(eq(profilesTable.userId, userId));

        if (!profile) {
          const err = new Error("PROFILE_NOT_FOUND");
          (err as Error & { code: string }).code = "PROFILE_NOT_FOUND";
          throw err;
        }
        const err = new Error("INSUFFICIENT_FUNDS");
        (err as Error & { code: string }).code = "INSUFFICIENT_FUNDS";
        throw err;
      }

      // Insert ownership record. Profile logos become active immediately so the
      // selection survives a refresh without requiring a future app update.
      const [newItem] = await tx
        .insert(ownedShopItemsTable)
        .values({
          id: randomUUID(),
          userId,
          itemId,
          itemType,
          equipped: itemType === "icona_futura",
        })
        .returning();

      return newItem;
    });

    res.json(item);
  } catch (err) {
    const errWithCode = err as Error & { code?: string };
    if (errWithCode.code === "ALREADY_OWNED") {
      res.status(409).json({ error: "Oggetto già acquistato" });
      return;
    }
    if (errWithCode.code === "INSUFFICIENT_FUNDS") {
      res.status(400).json({ error: "Monete insufficienti" });
      return;
    }
    if (errWithCode.code === "PROFILE_NOT_FOUND") {
      res.status(400).json({ error: "Profilo non trovato" });
      return;
    }
    // Unique constraint violation from DB (concurrent purchase)
    const pgErr = err as Error & { code?: string; constraint?: string };
    if (pgErr.code === "23505") {
      res.status(409).json({ error: "Oggetto già acquistato" });
      return;
    }
    req.log.error({ err }, "Errore acquisto oggetto");
    res.status(500).json({ error: "Errore interno del server" });
  }
});

/**
 * POST /shop/themes/use-light — remove the equipped theme reward.
 * Light is the free, default palette; no owned item is required to return to it.
 */
router.post(
  "/shop/themes/use-light",
  requireAuth,
  async (req: Request, res: Response) => {
    const userId = (req as AuthedRequest).clerkUserId;
    try {
      await db.transaction(async (tx) => {
        await lockUserThemeSelection(tx, userId);
        await tx
          .update(ownedShopItemsTable)
          .set({ equipped: false })
          .where(
            and(
              eq(ownedShopItemsTable.userId, userId),
              eq(ownedShopItemsTable.itemType, "tema"),
            ),
          );
      });
      res.status(204).end();
    } catch (err) {
      req.log.error({ err }, "Errore ripristino tema chiaro");
      res.status(500).json({ error: "Impossibile ripristinare il tema chiaro" });
    }
  },
);

/**
 * POST /shop/equip — equip an owned shop item
 */
router.post(
  "/shop/equip",
  requireAuth,
  async (req: Request, res: Response) => {
    const userId = (req as AuthedRequest).clerkUserId;
    const { ownedItemId } = req.body as { ownedItemId?: string };

    if (!ownedItemId) {
      res.status(400).json({ error: "ownedItemId è obbligatorio" });
      return;
    }

    try {
      const updated = await db.transaction(async (tx) => {
        await lockUserThemeSelection(tx, userId);
        const [owned] = await tx
          .select()
          .from(ownedShopItemsTable)
          .where(
            and(
              eq(ownedShopItemsTable.id, ownedItemId),
              eq(ownedShopItemsTable.userId, userId),
            ),
          );

        if (!owned) return null;

        // Unequip all items of the selected type before equipping this item.
        await tx
          .update(ownedShopItemsTable)
          .set({ equipped: false })
          .where(
            and(
              eq(ownedShopItemsTable.userId, userId),
              eq(ownedShopItemsTable.itemType, owned.itemType),
            ),
          );

        const [equipped] = await tx
          .update(ownedShopItemsTable)
          .set({ equipped: true })
          .where(
            and(
              eq(ownedShopItemsTable.id, ownedItemId),
              eq(ownedShopItemsTable.userId, userId),
            ),
          )
          .returning();

        return equipped;
      });

      if (!updated) {
        res.status(400).json({ error: "Oggetto non posseduto" });
        return;
      }

      res.json(updated);
    } catch (err) {
      req.log.error({ err }, "Errore equipaggiamento oggetto");
      res.status(500).json({ error: "Errore interno del server" });
    }
  },
);

export default router;
