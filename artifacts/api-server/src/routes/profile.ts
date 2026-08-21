import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, isNull } from "drizzle-orm";
import {
  db,
  friendshipsTable,
  groupMembershipsTable,
  labAttemptsTable,
  materialsTable,
  mistakeItemsTable,
  ownedShopItemsTable,
  pendingUploadsTable,
  profilesTable,
  quickExplanationsTable,
  quizAttemptsTable,
  quizSessionsTable,
  studyGroupsTable,
  ticketMessagesTable,
  ticketsTable,
} from "@workspace/db";
import { requireAuth, type AuthedRequest } from "../middlewares/requireAuth";
import { generateInviteCode } from "../lib/inviteCode";
import { hasLabsByDefault } from "../lib/labPath";

const router: IRouter = Router();

function toPublicProfile(profile: typeof profilesTable.$inferSelect) {
  // Never expose email in the public profile response
  const { email: _email, ...pub } = profile;
  return {
    ...pub,
    // STEM/technical paths see labs regardless of the manual toggle
    labsEnabled: profile.labsEnabled || hasLabsByDefault(profile.level),
    hasLabsByDefault: hasLabsByDefault(profile.level),
  };
}

/**
 * GET /profile — get current user's profile
 */
router.get("/profile", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as AuthedRequest).clerkUserId;
  try {
    const [profile] = await db
      .select()
      .from(profilesTable)
      .where(eq(profilesTable.userId, userId));

    if (!profile) {
      res.status(404).json({ error: "Profilo non trovato" });
      return;
    }
    res.json(toPublicProfile(profile));
  } catch (err) {
    req.log.error({ err }, "Errore lettura profilo");
    res.status(500).json({ error: "Errore interno del server" });
  }
});

/**
 * DELETE /profile — permanently remove the current user's application data.
 * Clerk credentials are revoked by the client after this succeeds; this route
 * removes every server-side record owned by the authenticated Clerk user.
 */
router.delete("/profile", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as AuthedRequest).clerkUserId;
  try {
    await db.transaction(async (tx) => {
      const userTickets = await tx
        .select({ id: ticketsTable.id })
        .from(ticketsTable)
        .where(eq(ticketsTable.userId, userId));
      if (userTickets.length) {
        await tx.delete(ticketMessagesTable).where(
          inArray(ticketMessagesTable.ticketId, userTickets.map((ticket) => ticket.id)),
        );
        await tx.delete(ticketsTable).where(eq(ticketsTable.userId, userId));
      }
      await tx.delete(labAttemptsTable).where(eq(labAttemptsTable.userId, userId));
      await tx.delete(quizAttemptsTable).where(eq(quizAttemptsTable.userId, userId));
      await tx.delete(quizSessionsTable).where(eq(quizSessionsTable.userId, userId));
      await tx.delete(mistakeItemsTable).where(eq(mistakeItemsTable.userId, userId));
      await tx.delete(quickExplanationsTable).where(eq(quickExplanationsTable.userId, userId));
      await tx.delete(ownedShopItemsTable).where(eq(ownedShopItemsTable.userId, userId));
      await tx.delete(pendingUploadsTable).where(eq(pendingUploadsTable.ownerId, userId));
      await tx.delete(groupMembershipsTable).where(eq(groupMembershipsTable.userId, userId));
      await tx.delete(studyGroupsTable).where(eq(studyGroupsTable.ownerId, userId));
      await tx.delete(friendshipsTable).where(
        or(eq(friendshipsTable.userId, userId), eq(friendshipsTable.friendId, userId)),
      );
      await tx.delete(materialsTable).where(eq(materialsTable.ownerId, userId));
      await tx.delete(profilesTable).where(eq(profilesTable.userId, userId));
    });
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Errore eliminazione definitiva account");
    res.status(500).json({ error: "Impossibile eliminare definitivamente l'account." });
  }
});

/**
 * PUT /profile — upsert profile (create on first call, update on subsequent)
 */
router.put("/profile", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as AuthedRequest).clerkUserId;
  const { username, email } = req.body as {
    username?: string;
    email?: string;
  };

  if (!username || typeof username !== "string" || username.trim().length < 2) {
    res.status(400).json({ error: "Username non valido (minimo 2 caratteri)" });
    return;
  }
  if (username.length > 32) {
    res
      .status(400)
      .json({ error: "Username troppo lungo (massimo 32 caratteri)" });
    return;
  }

  try {
    const [existing] = await db
      .select()
      .from(profilesTable)
      .where(eq(profilesTable.userId, userId));

    if (existing) {
      // Bootstrap is idempotent. Never overwrite the persisted username or
      // study path with Clerk data: usernames are unique and the study path is
      // immutable after onboarding.
      res.json(toPublicProfile(existing));
    } else {
      // First-time creation — use request-provided username and email.
      // level starts as null (not yet onboarded).
      const inviteCode = generateInviteCode();
      let profileUsername = username.trim();
      const [usernameOwner] = await db
        .select({ userId: profilesTable.userId })
        .from(profilesTable)
        .where(eq(profilesTable.username, profileUsername))
        .limit(1);
      if (usernameOwner && usernameOwner.userId !== userId) {
        const suffix = `-${userId.slice(-4)}`;
        profileUsername = `${profileUsername.slice(0, 32 - suffix.length)}${suffix}`;
      }
      const [created] = await db
        .insert(profilesTable)
        .values({
          userId,
          username: profileUsername,
          email: email ?? "",
          level: null,
          wallet: 0,
          streak: 0,
          inviteCode,
        })
        .returning();
      res.json(toPublicProfile(created));
    }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    if (errorMessage.includes("profiles_username_unique")) {
      res.status(400).json({ error: "Username già in uso. Scegline uno diverso." });
      return;
    }
    req.log.error({ err }, "Errore upsert profilo");
    res.status(500).json({ error: "Errore interno del server" });
  }
});

/**
 * PATCH /profile/level — set the user's Italian study-path string
 */
router.patch(
  "/profile/level",
  requireAuth,
  async (req: Request, res: Response) => {
    const userId = (req as AuthedRequest).clerkUserId;
    const { level } = req.body as { level?: string };

    if (!level || typeof level !== "string" || level.trim().length === 0) {
      res.status(400).json({
        error:
          "Percorso di studio non valido (es. 'Liceo Scientifico')",
      });
      return;
    }

    try {
      const [updated] = await db
        .update(profilesTable)
        .set({ level: level.trim(), updatedAt: new Date() })
        .where(and(eq(profilesTable.userId, userId), isNull(profilesTable.level)))
        .returning();

      if (!updated) {
        const [profile] = await db
          .select({ userId: profilesTable.userId, level: profilesTable.level })
          .from(profilesTable)
          .where(eq(profilesTable.userId, userId));
        res.status(profile?.level ? 409 : 404).json({
          error: profile?.level
            ? "Il percorso di studio è già stato scelto e non può essere modificato."
            : "Profilo non trovato",
        });
        return;
      }
      res.json(toPublicProfile(updated));
    } catch (err) {
      req.log.error({ err }, "Errore aggiornamento percorso di studio");
      res.status(500).json({ error: "Errore interno del server" });
    }
  },
);

export default router;
