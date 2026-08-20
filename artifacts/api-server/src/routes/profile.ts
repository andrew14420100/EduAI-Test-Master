import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, isNull } from "drizzle-orm";
import { db, profilesTable } from "@workspace/db";
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
      // Bootstrap is idempotent: keep the saved study path untouched while
      // allowing Clerk username/email synchronization to complete.
      const [updated] = await db
        .update(profilesTable)
        .set({ username: username.trim(), updatedAt: new Date() })
        .where(eq(profilesTable.userId, userId))
        .returning();
      res.json(toPublicProfile(updated));
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
