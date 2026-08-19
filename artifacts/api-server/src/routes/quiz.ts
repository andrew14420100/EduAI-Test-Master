import { Router, type IRouter, type Request, type Response } from "express";
import { randomUUID } from "crypto";
import { eq, sql, and, inArray } from "drizzle-orm";
import {
  db,
  quizAttemptsTable,
  quizSessionsTable,
  materialsTable,
  profilesTable,
} from "@workspace/db";
import { requireAuth, type AuthedRequest } from "../middlewares/requireAuth";
import type { QuizQuestionWithKey, QuizQuestion } from "@workspace/db";
import {
  generateQuestionsWithKey,
  generateFlashcards,
  toPublicQuestions,
  isMeaningfulText,
  type SourceMaterial,
} from "../lib/contentStudy";

const router: IRouter = Router();

// Max materials that can be turned into flashcards in a single request
const MAX_MATERIALS_FLASHCARDS = 20;
// Flashcards produced per material
const FLASHCARDS_PER_MATERIAL = 4;

// Coins earned per correct answer
const COINS_PER_CORRECT = 5;

// Valid session duration (1 hour)
const SESSION_TTL_MS = 60 * 60 * 1000;

// Valid question counts
const VALID_QUESTION_COUNTS = new Set([10, 20, 30]);

// Max materials that can be combined into a single unified quiz session
const MAX_MATERIALS_PER_SESSION = 20;

// ─── Deterministic content-grounded generation lives in ../lib/contentStudy ───

/**
 * Build the list of ready source materials for study generation, or return an
 * Italian error naming the unsupported/failed materials. `owned` must already
 * be verified as owned by the current user.
 */
function collectReadySources(
  orderedIds: string[],
  ownedById: Map<
    string,
    { id: string; title: string; extractionStatus: string; extractedText: string | null }
  >,
): { ok: true; sources: SourceMaterial[] } | { ok: false; message: string } {
  const notReady: string[] = [];
  const sources: SourceMaterial[] = [];

  for (const id of orderedIds) {
    const m = ownedById.get(id)!;
    if (m.extractionStatus !== "ready" || !isMeaningfulText(m.extractedText)) {
      notReady.push(m.title);
      continue;
    }
    sources.push({ id: m.id, title: m.title, text: m.extractedText! });
  }

  if (notReady.length > 0) {
    const list = notReady.map((t) => `"${t}"`).join(", ");
    return {
      ok: false,
      message:
        `Alcuni materiali non sono utilizzabili per lo studio (testo non estratto o formato che richiede OCR/trascrizione): ${list}. ` +
        `Rimuovili dalla selezione oppure carica una versione testuale.`,
    };
  }
  if (sources.length === 0) {
    return {
      ok: false,
      message:
        "Nessun materiale selezionato contiene testo utilizzabile per generare contenuti di studio.",
    };
  }
  return { ok: true, sources };
}

/**
 * POST /quiz/sessions — start a server-scored quiz session
 */
router.post(
  "/quiz/sessions",
  requireAuth,
  async (req: Request, res: Response) => {
    const userId = (req as AuthedRequest).clerkUserId;
    const { materialIds, totalQuestions } = req.body as {
      materialIds?: unknown;
      totalQuestions?: number;
    };

    if (
      !Array.isArray(materialIds) ||
      materialIds.length === 0 ||
      !materialIds.every((id) => typeof id === "string" && id.length > 0)
    ) {
      res.status(400).json({ error: "materialIds deve essere un array non vuoto di stringhe" });
      return;
    }

    // De-duplicate while preserving order, and enforce a reasonable maximum.
    const uniqueIds = [...new Set(materialIds as string[])];
    if (uniqueIds.length > MAX_MATERIALS_PER_SESSION) {
      res.status(400).json({
        error: `Puoi selezionare al massimo ${MAX_MATERIALS_PER_SESSION} materiali per verifica`,
      });
      return;
    }

    if (!totalQuestions || !VALID_QUESTION_COUNTS.has(totalQuestions)) {
      res.status(400).json({ error: "totalQuestions deve essere 10, 20 o 30" });
      return;
    }

    try {
      // Verify ALL materials exist and are owned by the current user.
      const owned = await db
        .select()
        .from(materialsTable)
        .where(
          and(
            inArray(materialsTable.id, uniqueIds),
            eq(materialsTable.ownerId, userId),
          ),
        );

      const ownedById = new Map(owned.map((m) => [m.id, m]));
      const missing = uniqueIds.filter((id) => !ownedById.has(id));
      if (missing.length > 0) {
        res.status(404).json({ error: "Uno o più materiali non sono stati trovati o non ti appartengono" });
        return;
      }

      // Readiness gate: all selected materials must be extractionStatus=ready
      // with meaningful extracted text. Otherwise return 422 naming them.
      const ready = collectReadySources(uniqueIds, ownedById);
      if (!ready.ok) {
        res.status(422).json({ error: ready.message });
        return;
      }

      // Generate content-grounded questions with answer key, rotating across
      // every selected material. Distinct contents yield distinct questions.
      const seed =
        uniqueIds.join(",") + "|" + userId + "|" + String(totalQuestions);
      const generated = generateQuestionsWithKey(
        ready.sources,
        totalQuestions,
        seed,
      );

      if (generated.length < totalQuestions) {
        res.status(422).json({
          error:
            `Il testo estratto dai materiali selezionati non basta a generare ${totalQuestions} domande diverse ` +
            `(disponibili: ${generated.length}). Seleziona più materiali oppure scegli meno domande.`,
        });
        return;
      }

      const questionsWithKey: QuizQuestionWithKey[] = generated.slice(
        0,
        totalQuestions,
      );

      const sessionId = randomUUID();
      const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

      await db.insert(quizSessionsTable).values({
        id: sessionId,
        ownerId: userId,
        materialId: uniqueIds[0]!, // first material for backward-compatible history
        materialIds: uniqueIds as unknown as Record<string, unknown>[],
        totalQuestions,
        questionsWithKey: questionsWithKey as unknown as Record<string, unknown>[],
        status: "active",
        expiresAt,
      });

      // Return questions WITHOUT correctIndex
      const questionsPublic: QuizQuestion[] = questionsWithKey.map(({ question, options }) => ({
        question,
        options,
      }));

      res.status(201).json({
        sessionId,
        questions: questionsPublic,
        expiresAt: expiresAt.toISOString(),
      });
    } catch (err) {
      req.log.error({ err }, "Errore creazione sessione quiz");
      res.status(500).json({ error: "Errore interno del server" });
    }
  },
);

/**
 * POST /quiz/sessions/:sessionId/complete — complete a quiz session (idempotent)
 */
router.post(
  "/quiz/sessions/:sessionId/complete",
  requireAuth,
  async (req: Request, res: Response) => {
    const userId = (req as AuthedRequest).clerkUserId;
    const sessionId = req.params.sessionId as string;
    const { answers, idempotencyKey } = req.body as {
      answers?: (number | null)[];
      idempotencyKey?: string;
    };

    if (!idempotencyKey || typeof idempotencyKey !== "string" || idempotencyKey.trim() === "") {
      res.status(400).json({ error: "idempotencyKey è obbligatorio" });
      return;
    }

    if (!Array.isArray(answers)) {
      res.status(400).json({ error: "answers deve essere un array" });
      return;
    }

    // Every answer must be null OR an integer in 0..3.
    const answersValid = answers.every(
      (a) => a === null || (typeof a === "number" && Number.isInteger(a) && a >= 0 && a <= 3),
    );
    if (!answersValid) {
      res.status(400).json({ error: "Ogni risposta deve essere null o un intero tra 0 e 3" });
      return;
    }

    // Helper: return the committed attempt for an already-completed session.
    const returnCompletedAttempt = async (attemptIdRef: string | null): Promise<boolean> => {
      if (!attemptIdRef) return false;
      const [existingAttempt] = await db
        .select()
        .from(quizAttemptsTable)
        .where(eq(quizAttemptsTable.id, attemptIdRef));
      if (existingAttempt) {
        res.json(existingAttempt);
        return true;
      }
      return false;
    };

    try {
      // Read session first for ownership / validation checks (no reward here).
      const [session] = await db
        .select()
        .from(quizSessionsTable)
        .where(eq(quizSessionsTable.id, sessionId));

      if (!session) {
        res.status(404).json({ error: "Sessione quiz non trovata" });
        return;
      }
      if (session.ownerId !== userId) {
        res.status(403).json({ error: "Accesso negato alla sessione" });
        return;
      }

      // Idempotent short-circuit: already completed → return committed attempt.
      if (session.status === "completed") {
        if (await returnCompletedAttempt(session.attemptId)) return;
        // Completed but attempt row missing (should not happen) — treat as conflict.
        res.status(409).json({ error: "La sessione risulta già completata." });
        return;
      }

      const now = new Date();
      if (session.expiresAt < now) {
        await db
          .update(quizSessionsTable)
          .set({ status: "expired" })
          .where(
            and(
              eq(quizSessionsTable.id, sessionId),
              eq(quizSessionsTable.status, "active"),
            ),
          );
        res.status(400).json({ error: "La sessione quiz è scaduta. Avvia una nuova sessione." });
        return;
      }

      if (answers.length !== session.totalQuestions) {
        res.status(400).json({
          error: `Il numero di risposte (${answers.length}) non corrisponde al numero di domande (${session.totalQuestions})`,
        });
        return;
      }

      // Score against the stored answer key.
      const questionsWithKey = session.questionsWithKey as unknown as QuizQuestionWithKey[];
      let score = 0;
      for (let i = 0; i < questionsWithKey.length; i++) {
        if (answers[i] !== null && answers[i] === questionsWithKey[i]!.correctIndex) {
          score++;
        }
      }
      const earnedCoins = score * COINS_PER_CORRECT;
      const attemptId = randomUUID();

      // Atomically CLAIM the session inside the transaction: only the request
      // that flips status active→completed (and stamps attemptId) proceeds to
      // reward. A concurrent request's UPDATE matches zero rows and must not
      // insert or award — it falls through to return the committed attempt.
      const claimResult = await db.transaction(async (tx) => {
        const claimed = await tx
          .update(quizSessionsTable)
          .set({
            status: "completed",
            completedAt: new Date(),
            idempotencyKey,
            attemptId,
          })
          .where(
            and(
              eq(quizSessionsTable.id, sessionId),
              eq(quizSessionsTable.ownerId, userId),
              eq(quizSessionsTable.status, "active"),
            ),
          )
          .returning();

        if (claimed.length === 0) {
          // Lost the race — do NOT insert/reward. Roll back cleanly.
          return { claimed: false as const };
        }

        // We own the completion: insert attempt + award coins once.
        await tx.insert(quizAttemptsTable).values({
          id: attemptId,
          userId,
          materialId: session.materialId,
          score,
          totalQuestions: session.totalQuestions,
          earnedCoins,
        });

        await tx
          .update(profilesTable)
          .set({
            wallet: sql`${profilesTable.wallet} + ${earnedCoins}`,
            updatedAt: new Date(),
          })
          .where(eq(profilesTable.userId, userId));

        return { claimed: true as const };
      });

      if (!claimResult.claimed) {
        // Another request already completed this session. Return its committed attempt.
        const [fresh] = await db
          .select()
          .from(quizSessionsTable)
          .where(eq(quizSessionsTable.id, sessionId));
        if (fresh && (await returnCompletedAttempt(fresh.attemptId))) return;
        res.status(409).json({ error: "La sessione è già stata completata." });
        return;
      }

      const [attempt] = await db
        .select()
        .from(quizAttemptsTable)
        .where(eq(quizAttemptsTable.id, attemptId));

      res.json(attempt);
    } catch (err) {
      req.log.error({ err }, "Errore completamento sessione quiz");
      res.status(500).json({ error: "Errore interno del server" });
    }
  },
);

/**
 * GET /quiz/attempts — list quiz attempts for current user
 */
router.get(
  "/quiz/attempts",
  requireAuth,
  async (req: Request, res: Response) => {
    const userId = (req as AuthedRequest).clerkUserId;
    try {
      const attempts = await db
        .select()
        .from(quizAttemptsTable)
        .where(eq(quizAttemptsTable.userId, userId));
      res.json(attempts);
    } catch (err) {
      req.log.error({ err }, "Errore lista tentativi quiz");
      res.status(500).json({ error: "Errore interno del server" });
    }
  },
);

/**
 * POST /study/flashcards — content-grounded flashcards for owned, ready materials.
 * Generated separately from quiz answer keys. No filename-only fallback.
 */
router.post(
  "/study/flashcards",
  requireAuth,
  async (req: Request, res: Response) => {
    const userId = (req as AuthedRequest).clerkUserId;
    const { materialIds } = req.body as { materialIds?: unknown };

    if (
      !Array.isArray(materialIds) ||
      materialIds.length === 0 ||
      !materialIds.every((id) => typeof id === "string" && id.length > 0)
    ) {
      res
        .status(400)
        .json({ error: "materialIds deve essere un array non vuoto di stringhe" });
      return;
    }

    const uniqueIds = [...new Set(materialIds as string[])];
    if (uniqueIds.length > MAX_MATERIALS_FLASHCARDS) {
      res.status(400).json({
        error: `Puoi selezionare al massimo ${MAX_MATERIALS_FLASHCARDS} materiali per le flashcard`,
      });
      return;
    }

    try {
      const owned = await db
        .select()
        .from(materialsTable)
        .where(
          and(
            inArray(materialsTable.id, uniqueIds),
            eq(materialsTable.ownerId, userId),
          ),
        );

      const ownedById = new Map(owned.map((m) => [m.id, m]));
      const missing = uniqueIds.filter((id) => !ownedById.has(id));
      if (missing.length > 0) {
        res.status(404).json({
          error: "Uno o più materiali non sono stati trovati o non ti appartengono",
        });
        return;
      }

      const ready = collectReadySources(uniqueIds, ownedById);
      if (!ready.ok) {
        res.status(422).json({ error: ready.message });
        return;
      }

      const seed = uniqueIds.join(",") + "|" + userId;
      const flashcards = generateFlashcards(
        ready.sources,
        FLASHCARDS_PER_MATERIAL,
        seed,
      );

      if (flashcards.length === 0) {
        res.status(422).json({
          error:
            "Non è stato possibile generare flashcard dai materiali selezionati: il testo estratto non contiene contenuti utilizzabili.",
        });
        return;
      }

      res.status(200).json({ flashcards });
    } catch (err) {
      req.log.error({ err }, "Errore generazione flashcard");
      res.status(500).json({ error: "Errore interno del server" });
    }
  },
);

export default router;
