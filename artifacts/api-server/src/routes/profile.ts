import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
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
      // Update existing profile — only username can change here
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
      const [created] = await db
        .insert(profilesTable)
        .values({
          userId,
          username: username.trim(),
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
    if (
      err instanceof Error &&
      err.message.includes("unique constraint") &&
      err.message.includes("username")
    ) {
      res.status(400).json({ error: "Username già in uso" });
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
        .where(eq(profilesTable.userId, userId))
        .returning();

      if (!updated) {
        res.status(404).json({ error: "Profilo non trovato" });
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
