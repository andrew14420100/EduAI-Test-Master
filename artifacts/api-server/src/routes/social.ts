import { Router, type IRouter, type Request, type Response } from "express";
import { randomUUID } from "crypto";
import { and, eq, inArray, or } from "drizzle-orm";
import { db, profilesTable, friendshipsTable } from "@workspace/db";
import { requireAuth, type AuthedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

/**
 * GET /social/invite — get invite code and friends summary
 */
router.get(
  "/social/invite",
  requireAuth,
  async (req: Request, res: Response) => {
    const userId = (req as AuthedRequest).clerkUserId;
    try {
      const [profile] = await db
        .select({ inviteCode: profilesTable.inviteCode })
        .from(profilesTable)
        .where(eq(profilesTable.userId, userId));

      if (!profile) {
        res.status(404).json({ error: "Profilo non trovato" });
        return;
      }

      // Get friends: connections where I am either side
      const friendships = await db
        .select()
        .from(friendshipsTable)
        .where(
          or(
            eq(friendshipsTable.userId, userId),
            eq(friendshipsTable.friendId, userId),
          ),
        );

      // Collect friend user IDs (the other side of each friendship)
      const friendIds = friendships.map((f) =>
        f.userId === userId ? f.friendId : f.userId,
      );

      let friends: { username: string; level: string | null }[] = [];
      if (friendIds.length > 0) {
        const friendProfiles = await db
          .select({
            username: profilesTable.username,
            level: profilesTable.level,
          })
          .from(profilesTable)
          .where(inArray(profilesTable.userId, friendIds));
        friends = friendProfiles;
      }

      res.json({ inviteCode: profile.inviteCode, friends });
    } catch (err) {
      req.log.error({ err }, "Errore recupero inviti");
      res.status(500).json({ error: "Errore interno del server" });
    }
  },
);

/**
 * POST /social/use-invite — use an invite code to connect with a friend
 */
router.post(
  "/social/use-invite",
  requireAuth,
  async (req: Request, res: Response) => {
    const userId = (req as AuthedRequest).clerkUserId;
    const { code } = req.body as { code?: string };

    if (!code || typeof code !== "string" || code.trim().length !== 6) {
      res.status(400).json({ error: "Codice invito non valido (6 caratteri)" });
      return;
    }

    try {
      // Find the owner of the invite code
      const [codeOwner] = await db
        .select({ userId: profilesTable.userId })
        .from(profilesTable)
        .where(eq(profilesTable.inviteCode, code.trim().toUpperCase()));

      if (!codeOwner) {
        res.status(400).json({ error: "Codice invito non trovato" });
        return;
      }

      if (codeOwner.userId === userId) {
        res.status(400).json({ error: "Non puoi usare il tuo stesso codice invito" });
        return;
      }

      // Check if friendship already exists
      const [existing] = await db
        .select()
        .from(friendshipsTable)
        .where(
          or(
            and(
              eq(friendshipsTable.userId, userId),
              eq(friendshipsTable.friendId, codeOwner.userId),
            ),
            and(
              eq(friendshipsTable.userId, codeOwner.userId),
              eq(friendshipsTable.friendId, userId),
            ),
          ),
        );

      if (!existing) {
        await db.insert(friendshipsTable).values({
          id: randomUUID(),
          userId,
          friendId: codeOwner.userId,
        });
      }

      // Return updated invite summary
      const [profile] = await db
        .select({ inviteCode: profilesTable.inviteCode })
        .from(profilesTable)
        .where(eq(profilesTable.userId, userId));

      const friendships = await db
        .select()
        .from(friendshipsTable)
        .where(
          or(
            eq(friendshipsTable.userId, userId),
            eq(friendshipsTable.friendId, userId),
          ),
        );

      const friendIds = friendships.map((f) =>
        f.userId === userId ? f.friendId : f.userId,
      );

      let friends: { username: string; level: string | null }[] = [];
      if (friendIds.length > 0) {
        const friendProfiles = await db
          .select({
            username: profilesTable.username,
            level: profilesTable.level,
          })
          .from(profilesTable)
          .where(inArray(profilesTable.userId, friendIds));
        friends = friendProfiles;
      }

      res.json({ inviteCode: profile?.inviteCode ?? "", friends });
    } catch (err) {
      req.log.error({ err }, "Errore utilizzo codice invito");
      res.status(500).json({ error: "Errore interno del server" });
    }
  },
);

export default router;
