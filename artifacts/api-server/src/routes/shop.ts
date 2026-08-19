import { Router, type IRouter, type Request, type Response } from "express";
import { randomUUID } from "crypto";
import { eq, and, sql } from "drizzle-orm";
import { db, ownedShopItemsTable, profilesTable } from "@workspace/db";
import { requireAuth, type AuthedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

// ─── Server-side catalog (single source of truth) ──────────────────────────
// Format: itemId → { itemType, price }
// dark/tema/15, neon/tema/30, brilliant/distintivo/10, professor/distintivo/25
type CatalogEntry = { itemType: string; price: number };

const SHOP_CATALOG: Record<string, CatalogEntry> = {
  dark: { itemType: "tema", price: 15 },
  neon: { itemType: "tema", price: 30 },
  brilliant: { itemType: "distintivo", price: 10 },
  professor: { itemType: "distintivo", price: 25 },
};

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

      // Insert ownership record
      const [newItem] = await tx
        .insert(ownedShopItemsTable)
        .values({
          id: randomUUID(),
          userId,
          itemId,
          itemType,
          equipped: false,
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
      const [owned] = await db
        .select()
        .from(ownedShopItemsTable)
        .where(
          and(
            eq(ownedShopItemsTable.id, ownedItemId),
            eq(ownedShopItemsTable.userId, userId),
          ),
        );

      if (!owned) {
        res.status(400).json({ error: "Oggetto non posseduto" });
        return;
      }

      // Unequip all items of same type first
      await db
        .update(ownedShopItemsTable)
        .set({ equipped: false })
        .where(
          and(
            eq(ownedShopItemsTable.userId, userId),
            eq(ownedShopItemsTable.itemType, owned.itemType),
          ),
        );

      // Equip the selected item
      const [updated] = await db
        .update(ownedShopItemsTable)
        .set({ equipped: true })
        .where(
          and(
            eq(ownedShopItemsTable.id, ownedItemId),
            eq(ownedShopItemsTable.userId, userId),
          ),
        )
        .returning();

      res.json(updated);
    } catch (err) {
      req.log.error({ err }, "Errore equipaggiamento oggetto");
      res.status(500).json({ error: "Errore interno del server" });
    }
  },
);

export default router;
