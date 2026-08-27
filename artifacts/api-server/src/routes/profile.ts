import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, inArray, isNull, or } from "drizzle-orm";
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
      await tx.delete(quizSessionsTable).where(eq(quizSessionsTable.ownerId, userId));
      await tx.delete(mistakeItemsTable).where(eq(mistakeItemsTable.ownerId, userId));
      await tx.delete(quickExplanationsTable).where(eq(quickExplanationsTable.ownerId, userId));
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
  const { username, email, firstName, lastName, birthDate } = req.body as {
    username?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    birthDate?: string;
  };

  if (!username || typeof username !== "string" || !/^[A-Za-z0-9_]{3,20}$/.test(username.trim())) {
    res.status(400).json({
      error: "Username non valido (usa 3–20 caratteri, lettere, numeri e underscore)",
    });
    return;
  }

  try {
    const [existing] = await db
      .select()
      .from(profilesTable)
      .where(eq(profilesTable.userId, userId));

    if (existing) {
      // Bootstrap calls keep the current values, while an explicit profile
      // update can change the app username or the verified email.
      const nextUsername = username.trim();
      const usernameChanged = nextUsername !== existing.username;
      const emailChanged = Boolean(email && email !== existing.email);
      const profileDetails = {
        ...(existing.firstName ? {} : firstName?.trim() ? { firstName: firstName.trim() } : {}),
        ...(existing.lastName ? {} : lastName?.trim() ? { lastName: lastName.trim() } : {}),
        ...(existing.birthDate ? {} : birthDate?.trim() ? { birthDate: birthDate.trim() } : {}),
      };
      if (usernameChanged || emailChanged || Object.keys(profileDetails).length > 0) {
        if (usernameChanged) {
          const [usernameOwner] = await db
            .select({ userId: profilesTable.userId })
            .from(profilesTable)
            .where(eq(profilesTable.username, nextUsername))
            .limit(1);
          if (usernameOwner && usernameOwner.userId !== userId) {
            res.status(400).json({ error: "Username già in uso. Scegline uno diverso." });
            return;
          }
        }
        const [updated] = await db
          .update(profilesTable)
          .set({
            ...(usernameChanged ? { username: nextUsername } : {}),
            ...(emailChanged ? { email } : {}),
            ...profileDetails,
            updatedAt: new Date(),
          })
          .where(eq(profilesTable.userId, userId))
          .returning();
        res.json(toPublicProfile(updated ?? existing));
      } else {
        res.json(toPublicProfile(existing));
      }
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
          firstName: firstName?.trim() || null,
          lastName: lastName?.trim() || null,
          birthDate: birthDate?.trim() || null,
          level: null,
          wallet: 0,
          xp: 0,
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
 * PATCH /profile/onboarding — save the required learner profile and optional
 * study preferences. The study path is immutable once it has been selected.
 */
router.patch("/profile/onboarding", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as AuthedRequest).clerkUserId;
  const body = req.body as {
    firstName?: unknown;
    lastName?: unknown;
    birthDate?: unknown;
    level?: unknown;
    institutionType?: unknown;
    institutionName?: unknown;
    studyYear?: unknown;
    studyAddress?: unknown;
    learningGoals?: unknown;
    studyInterests?: unknown;
    examGoals?: unknown;
  };
  const clean = (value: unknown) => typeof value === "string" ? value.trim() : "";
  const firstName = clean(body.firstName);
  const lastName = clean(body.lastName);
  const birthDate = clean(body.birthDate);
  const level = clean(body.level);
  const institutionType = clean(body.institutionType);
  const institutionName = clean(body.institutionName);
  const studyYear = clean(body.studyYear);
  const studyAddress = clean(body.studyAddress);
  const learningGoals = clean(body.learningGoals);
  const studyInterests = clean(body.studyInterests);
  const examGoals = clean(body.examGoals);
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(birthDate)
    && !Number.isNaN(new Date(`${birthDate}T00:00:00.000Z`).getTime());

  if (
    firstName.length < 2 || firstName.length > 80
    || lastName.length < 2 || lastName.length > 80
    || !validDate
    || !level
    || !["scuola_superiore", "universita", "altro"].includes(institutionType)
    || institutionName.length < 2 || institutionName.length > 160
    || studyYear.length < 1 || studyYear.length > 80
    || studyAddress.length < 2 || studyAddress.length > 160
    || learningGoals.length > 500 || studyInterests.length > 500 || examGoals.length > 500
  ) {
    res.status(400).json({
      error: "Completa nome, cognome, data di nascita, percorso, istituto, classe/anno e indirizzo di studi.",
    });
    return;
  }

  try {
    const [existing] = await db
      .select()
      .from(profilesTable)
      .where(eq(profilesTable.userId, userId));
    if (!existing) {
      res.status(404).json({ error: "Profilo non trovato" });
      return;
    }
    if (existing.level && existing.level !== level) {
      res.status(409).json({ error: "Il percorso di studio è già stato scelto e non può essere modificato." });
      return;
    }

    const [updated] = await db
      .update(profilesTable)
      .set({
        firstName,
        lastName,
        birthDate,
        level: existing.level ?? level,
        institutionType,
        institutionName,
        studyYear,
        studyAddress,
        learningGoals: learningGoals || null,
        studyInterests: studyInterests || null,
        examGoals: examGoals || null,
        updatedAt: new Date(),
      })
      .where(eq(profilesTable.userId, userId))
      .returning();
    res.json(toPublicProfile(updated ?? existing));
  } catch (err) {
    req.log.error({ err }, "Errore salvataggio onboarding");
    res.status(500).json({ error: "Impossibile salvare il profilo di onboarding." });
  }
});

/**
 * PATCH /profile/username — explicit account username update.
 * Kept separate from the idempotent Clerk profile bootstrap endpoint.
 */
router.patch("/profile/username", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as AuthedRequest).clerkUserId;
  const { username } = req.body as { username?: unknown };
  const nextUsername = typeof username === "string" ? username.trim() : "";

  if (!/^[A-Za-z0-9_]{3,20}$/.test(nextUsername)) {
    res.status(400).json({
      error: "Username non valido (usa 3–20 caratteri, lettere, numeri e underscore)",
    });
    return;
  }

  try {
    const [owner] = await db
      .select({ userId: profilesTable.userId })
      .from(profilesTable)
      .where(eq(profilesTable.username, nextUsername))
      .limit(1);
    if (owner && owner.userId !== userId) {
      res.status(409).json({ error: "Username già in uso. Scegline uno diverso." });
      return;
    }

    const [updated] = await db
      .update(profilesTable)
      .set({ username: nextUsername, updatedAt: new Date() })
      .where(eq(profilesTable.userId, userId))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Profilo non trovato" });
      return;
    }
    res.json(toPublicProfile(updated));
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    if (errorMessage.includes("profiles_username_unique")) {
      res.status(409).json({ error: "Username già in uso. Scegline uno diverso." });
      return;
    }
    req.log.error({ err }, "Errore aggiornamento username");
    res.status(500).json({ error: "Impossibile aggiornare il nome utente" });
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
