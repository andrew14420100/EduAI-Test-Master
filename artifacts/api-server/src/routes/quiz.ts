import { Router, type IRouter, type Request, type Response } from "express";
import { createHash, randomUUID } from "crypto";
import { eq, sql, and, inArray, lt, count } from "drizzle-orm";
import {
  db,
  quizAttemptsTable,
  quizSessionsTable,
  materialsTable,
  mistakeItemsTable,
  profilesTable,
  quickExplanationsTable,
} from "@workspace/db";
import { requireAuth, type AuthedRequest } from "../middlewares/requireAuth";
import type { QuizQuestionWithKey, QuizQuestion } from "@workspace/db";
import {
  generateFlashcards,
  toPublicQuestions,
  isMeaningfulText,
  type SourceMaterial,
} from "../lib/contentStudy";
import { generateExamQuestions, generateFlashcardsWithAi, generateQuickExplanation } from "../lib/studyAi";
import { awardAchievementBadges, badgeIdsForProgress } from "../lib/gamification";

const router: IRouter = Router();

// Max materials that can be turned into flashcards in a single request
const MAX_MATERIALS_FLASHCARDS = 20;
// Flashcards produced per material
const FLASHCARDS_PER_MATERIAL = 4;

// Coins earned per correct answer
const COINS_PER_CORRECT = 5;
const RECOVERY_COINS_PER_CORRECT = 2;
const QUICK_EXPLANATION_COST = 2;
// A process can stop after a debit and before the model response is persisted.
// A later retry reclaims any reservation older than this lease.
const QUICK_EXPLANATION_RESERVATION_TTL_MS = 2 * 60 * 1000;

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
    const { materialIds, totalQuestions, variant } = req.body as {
      materialIds?: unknown;
      totalQuestions?: number;
      variant?: unknown;
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

       const [learnerProfile] = await db
         .select({
           level: profilesTable.level,
           institutionType: profilesTable.institutionType,
           institutionName: profilesTable.institutionName,
           studyYear: profilesTable.studyYear,
           studyAddress: profilesTable.studyAddress,
           learningGoals: profilesTable.learningGoals,
           studyInterests: profilesTable.studyInterests,
           examGoals: profilesTable.examGoals,
         })
         .from(profilesTable)
         .where(eq(profilesTable.userId, userId));

       // The generated key remains server-only. Questions are written from
       // scratch by the model after reading the extracted material, rather than
       // turning source sentences into fill-in-the-blank prompts.
       let generated: QuizQuestionWithKey[];
       try {
         generated = await generateExamQuestions(
           ready.sources,
           totalQuestions,
            typeof variant === "string" ? variant.slice(0, 120) : `${Date.now()}-${randomUUID()}`,
             learnerProfile,
         );
       } catch (error) {
         req.log.error({ err: error }, "Generazione IA delle domande non riuscita");
          const providerMessage =
            error instanceof Error && /ApiKeyNotApproved|not approved|account.*restricted/i.test(error.message)
              ? "Il servizio IA non è al momento disponibile per questo account. Verifica lo stato dell’integrazione IA e riprova."
              : "Non è stato possibile preparare il fac-simile dai materiali selezionati. Riprova tra poco.";
         res.status(503).json({
            error: providerMessage,
         });
         return;
       }

       if (generated.length !== totalQuestions) {
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
      const resolvedRecoveryIds: string[] = [];
      const missedStandardQuestions: Array<QuizQuestionWithKey & { materialId: string }> = [];
      for (let i = 0; i < questionsWithKey.length; i++) {
        const question = questionsWithKey[i]!;
        const isCorrect = answers[i] !== null && answers[i] === question.correctIndex;
        if (isCorrect) {
          score++;
          if (question.recoveryItemId) resolvedRecoveryIds.push(question.recoveryItemId);
        } else if (!question.recoveryItemId) {
          missedStandardQuestions.push({ ...question, materialId: session.materialId });
        }
      }
      const isRecoverySession = questionsWithKey.some((question) => Boolean(question.recoveryItemId));
      const earnedCoins = isRecoverySession
        ? resolvedRecoveryIds.length * RECOVERY_COINS_PER_CORRECT
        : score * COINS_PER_CORRECT;
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

        const [{ completedQuizCount }] = await tx
          .select({ completedQuizCount: count() })
          .from(quizAttemptsTable)
          .where(eq(quizAttemptsTable.userId, userId));
        const [progressProfile] = await tx
          .select({ streak: profilesTable.streak })
          .from(profilesTable)
          .where(eq(profilesTable.userId, userId));
        await awardAchievementBadges(
          tx,
          userId,
          badgeIdsForProgress({
            streak: progressProfile?.streak ?? 0,
            score,
            totalQuestions: session.totalQuestions,
            completedQuizCount: Number(completedQuizCount),
          }),
        );

        if (missedStandardQuestions.length > 0) {
          for (const question of missedStandardQuestions) {
            const fingerprint = createHash("sha256")
              .update(`${session.materialId}|${question.question}|${question.options.join("\u0001")}`)
              .digest("hex");
            await tx
              .insert(mistakeItemsTable)
              .values({
                id: randomUUID(),
                ownerId: userId,
                materialId: question.materialId,
                fingerprint,
                question: question.question,
                options: question.options,
                correctIndex: question.correctIndex,
                timesMissed: 1,
                lastWrongAt: new Date(),
              })
              .onConflictDoUpdate({
                target: [mistakeItemsTable.ownerId, mistakeItemsTable.fingerprint],
                set: {
                  options: question.options,
                  correctIndex: question.correctIndex,
                  timesMissed: sql`${mistakeItemsTable.timesMissed} + 1`,
                  lastWrongAt: new Date(),
                },
              });
          }
        }

        if (resolvedRecoveryIds.length > 0) {
          await tx
            .delete(mistakeItemsTable)
            .where(
              and(
                eq(mistakeItemsTable.ownerId, userId),
                inArray(mistakeItemsTable.id, resolvedRecoveryIds),
              ),
            );
        }

        await tx
          .update(profilesTable)
          .set({
            wallet: sql`${profilesTable.wallet} + ${earnedCoins}`,
            xp: sql`${profilesTable.xp} + ${earnedCoins * 10}`,
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
 * GET /study/recovery — questions currently waiting for a targeted retry.
 */
router.get(
  "/study/recovery",
  requireAuth,
  async (req: Request, res: Response) => {
    const userId = (req as AuthedRequest).clerkUserId;
    try {
      const items = await db
        .select({
          id: mistakeItemsTable.id,
          materialId: mistakeItemsTable.materialId,
          question: mistakeItemsTable.question,
          timesMissed: mistakeItemsTable.timesMissed,
          lastWrongAt: mistakeItemsTable.lastWrongAt,
        })
        .from(mistakeItemsTable)
        .where(eq(mistakeItemsTable.ownerId, userId));
      res.json({ pendingCount: items.length, items });
    } catch (err) {
      req.log.error({ err }, "Errore elenco recupero errori");
      res.status(500).json({ error: "Errore interno del server" });
    }
  },
);

/**
 * POST /study/recovery/sessions — starts a short quiz using only unresolved errors.
 */
router.post(
  "/study/recovery/sessions",
  requireAuth,
  async (req: Request, res: Response) => {
    const userId = (req as AuthedRequest).clerkUserId;
    try {
      const items = await db
        .select()
        .from(mistakeItemsTable)
        .where(eq(mistakeItemsTable.ownerId, userId))
        .limit(10);
      if (items.length === 0) {
        res.status(422).json({ error: "Non hai ancora errori da ripassare." });
        return;
      }

      const questionsWithKey: QuizQuestionWithKey[] = items.map((item) => ({
        question: item.question,
        options: item.options as string[],
        correctIndex: item.correctIndex,
        recoveryItemId: item.id,
      }));
      const sessionId = randomUUID();
      const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
      await db.insert(quizSessionsTable).values({
        id: sessionId,
        ownerId: userId,
        materialId: items[0]!.materialId,
        materialIds: [...new Set(items.map((item) => item.materialId))] as unknown as Record<string, unknown>[],
        totalQuestions: questionsWithKey.length,
        questionsWithKey: questionsWithKey as unknown as Record<string, unknown>[],
        status: "active",
        expiresAt,
      });
      res.status(201).json({
        sessionId,
        questions: toPublicQuestions(questionsWithKey),
        expiresAt: expiresAt.toISOString(),
      });
    } catch (err) {
      req.log.error({ err }, "Errore creazione recupero errori");
      res.status(500).json({ error: "Errore interno del server" });
    }
  },
);

/**
 * POST /study/explanations — a short AI concept explanation, charged once per question.
 */
router.post(
  "/study/explanations",
  requireAuth,
  async (req: Request, res: Response) => {
    const userId = (req as AuthedRequest).clerkUserId;
    const { sessionId, questionIndex } = req.body as {
      sessionId?: unknown;
      questionIndex?: unknown;
    };
    if (typeof sessionId !== "string" || !Number.isInteger(questionIndex) || (questionIndex as number) < 0) {
      res.status(400).json({ error: "sessionId e questionIndex validi sono obbligatori" });
      return;
    }
    try {
      const [session] = await db
        .select()
        .from(quizSessionsTable)
        .where(and(eq(quizSessionsTable.id, sessionId), eq(quizSessionsTable.ownerId, userId)));
      const questions = session?.questionsWithKey as QuizQuestionWithKey[] | undefined;
      const question = questions?.[questionIndex as number];
      if (!session || !question) {
        res.status(404).json({ error: "Domanda della verifica non trovata" });
        return;
      }

      const explanationWhere = and(
        eq(quickExplanationsTable.ownerId, userId),
        eq(quickExplanationsTable.sessionId, sessionId),
        eq(quickExplanationsTable.questionIndex, questionIndex as number),
      );
      const reservationExpiry = new Date(
        Date.now() - QUICK_EXPLANATION_RESERVATION_TTL_MS,
      );

      // Reserve the points and the unique (user, session, question) slot
      // BEFORE calling the paid model. This prevents zero-balance or concurrent
      // requests from repeatedly consuming model capacity.
      const reservation = await db.transaction(async (tx) => {
        const [existing] = await tx
          .select()
          .from(quickExplanationsTable)
          .where(explanationWhere);
        if (existing?.status === "ready") {
          const [profile] = await tx
            .select()
            .from(profilesTable)
            .where(eq(profilesTable.userId, userId));
          return {
            kind: "ready" as const,
            explanation: existing.explanation,
            remainingPoints: profile?.wallet ?? 0,
          };
        }
        if (existing?.status === "pending") {
          if (existing.createdAt > reservationExpiry) {
            return { kind: "pending" as const };
          }

          // Recover a lease left behind by a crashed/timed-out request. The
          // conditional delete makes the refund safe if another retry wins.
          const reclaimed = await tx
            .delete(quickExplanationsTable)
            .where(
              and(
                eq(quickExplanationsTable.id, existing.id),
                eq(quickExplanationsTable.status, "pending"),
                lt(quickExplanationsTable.createdAt, reservationExpiry),
              ),
            )
            .returning();
          if (reclaimed.length === 0) {
            return { kind: "pending" as const };
          }
          await tx
            .update(profilesTable)
            .set({
              wallet: sql`${profilesTable.wallet} + ${reclaimed[0]!.chargedPoints}`,
              updatedAt: new Date(),
            })
            .where(eq(profilesTable.userId, userId));
        }

        const [profile] = await tx
          .update(profilesTable)
          .set({
            wallet: sql`${profilesTable.wallet} - ${QUICK_EXPLANATION_COST}`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(profilesTable.userId, userId),
              sql`${profilesTable.wallet} >= ${QUICK_EXPLANATION_COST}`,
            ),
          )
          .returning();
        if (!profile) return { kind: "insufficient" as const };

        const reservationId = randomUUID();
        const inserted = await tx
          .insert(quickExplanationsTable)
          .values({
            id: reservationId,
            ownerId: userId,
            sessionId,
            questionIndex: questionIndex as number,
            status: "pending",
            // The column is non-null for historic rows; pending values are never
            // returned to clients and are replaced before the row becomes ready.
            explanation: "",
            chargedPoints: QUICK_EXPLANATION_COST,
          })
          .onConflictDoNothing()
          .returning();

        if (inserted.length > 0) {
          return { kind: "reserved" as const, reservationId, remainingPoints: profile.wallet };
        }

        // A concurrent request won the unique-slot race after this transaction
        // checked for an existing row. Undo this request's debit before returning.
        await tx
          .update(profilesTable)
          .set({
            wallet: sql`${profilesTable.wallet} + ${QUICK_EXPLANATION_COST}`,
            updatedAt: new Date(),
          })
          .where(eq(profilesTable.userId, userId));
        const [raced] = await tx
          .select()
          .from(quickExplanationsTable)
          .where(explanationWhere);
        if (raced?.status === "ready") {
          return {
            kind: "ready" as const,
            explanation: raced.explanation,
            remainingPoints: profile.wallet,
          };
        }
        return { kind: "pending" as const };
      });

      if (reservation.kind === "ready") {
        res.json({
          explanation: reservation.explanation,
          chargedPoints: 0,
          remainingPoints: reservation.remainingPoints,
        });
        return;
      }
      if (reservation.kind === "pending") {
        res.status(409).json({ error: "La spiegazione rapida è già in preparazione. Attendi un momento." });
        return;
      }
      if (reservation.kind === "insufficient") {
        res.status(400).json({ error: "Ti servono almeno 2 punti per una spiegazione rapida." });
        return;
      }

      try {
        const explanation = await generateQuickExplanation(question.question, question.options);
        const [readyExplanation] = await db
          .update(quickExplanationsTable)
          .set({ status: "ready", explanation })
          .where(
            and(
              eq(quickExplanationsTable.id, reservation.reservationId),
              eq(quickExplanationsTable.status, "pending"),
            ),
          )
          .returning();
        if (!readyExplanation) throw new Error("RISERVAZIONE_SCOMPARSA");
        res.json({
          explanation,
          chargedPoints: QUICK_EXPLANATION_COST,
          remainingPoints: reservation.remainingPoints,
        });
      } catch (err) {
        // Refund only a still-pending reservation. If it became ready, the charge
        // is valid and a retry will return the stored explanation for free.
        await db.transaction(async (tx) => {
          const released = await tx
            .delete(quickExplanationsTable)
            .where(
              and(
                eq(quickExplanationsTable.id, reservation.reservationId),
                eq(quickExplanationsTable.status, "pending"),
              ),
            )
            .returning();
          if (released.length > 0) {
            await tx
              .update(profilesTable)
              .set({
                wallet: sql`${profilesTable.wallet} + ${QUICK_EXPLANATION_COST}`,
                updatedAt: new Date(),
              })
              .where(eq(profilesTable.userId, userId));
          }
        });
        req.log.error({ err }, "Errore generazione spiegazione rapida");
        res.status(503).json({ error: "La spiegazione rapida non è disponibile. Non ti sono stati addebitati punti." });
      }
    } catch (err) {
      req.log.error({ err }, "Errore spiegazione rapida");
      res.status(503).json({ error: "La spiegazione rapida non è disponibile. Non ti sono stati addebitati punti." });
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

       const [learnerProfile] = await db
         .select({
           level: profilesTable.level,
           institutionType: profilesTable.institutionType,
           institutionName: profilesTable.institutionName,
           studyYear: profilesTable.studyYear,
           studyAddress: profilesTable.studyAddress,
           learningGoals: profilesTable.learningGoals,
           studyInterests: profilesTable.studyInterests,
           examGoals: profilesTable.examGoals,
         })
         .from(profilesTable)
         .where(eq(profilesTable.userId, userId));

       const seed = uniqueIds.join(",") + "|" + userId;
      const flashcards = await generateFlashcardsWithAi(
        ready.sources,
        FLASHCARDS_PER_MATERIAL,
        `${seed}|${typeof (req.body as { variant?: unknown }).variant === "string" ? (req.body as { variant: string }).variant.slice(0, 120) : `${Date.now()}-${randomUUID()}`}`,
         learnerProfile,
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
