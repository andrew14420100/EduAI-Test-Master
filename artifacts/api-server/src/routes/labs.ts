import { Router, type IRouter, type Request, type Response } from "express";
import { randomUUID } from "crypto";
import { eq, and, inArray, sql } from "drizzle-orm";
import {
  db,
  labExercisesTable,
  labAttemptsTable,
  profilesTable,
} from "@workspace/db";
import { requireAuth, type AuthedRequest } from "../middlewares/requireAuth";
import { openai } from "@workspace/integrations-openai-ai-server";
import { hasLabsByDefault, subjectsForPath } from "../lib/labPath";

const router: IRouter = Router();

// Points fraction for partial AI-graded answers
const PARTIAL_SCORE = 0.5;

// ── AI grading for free_text exercises ────────────────────────────────────────

// Thrown when the AI grader does not return a usable evaluation. The route
// surfaces this as a 502 so the client can retry — we never save a fake 0.
export class GradingUnavailableError extends Error {
  constructor(message = "Valutazione IA non disponibile") {
    super(message);
    this.name = "GradingUnavailableError";
  }
}

async function gradeFreeTextOnce(
  prompt: string,
  correctAnswer: string,
  userAnswer: string,
): Promise<{ score: number; feedback: string } | null> {
  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    // gpt-5-mini is a reasoning model: reasoning consumes completion tokens
    // before any visible output, so this must be generous or content is empty.
    max_completion_tokens: 2500,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Sei un docente italiano. Valuta la risposta dello studente in modo oggettivo e restituisci esclusivamente JSON valido. " +
          "Il campo 'score' deve essere: 1.0 se la risposta è sostanzialmente corretta, 0.5 se parzialmente corretta, 0.0 se errata o irrilevante. " +
          "Il campo 'feedback' deve essere una spiegazione didattica in italiano (2-4 frasi) che chiarisca la risposta corretta senza copiare verbatim la chiave fornita.",
      },
      {
        role: "user",
        content:
          `ESERCIZIO:\n${prompt}\n\n` +
          `RISPOSTA ATTESA (non rivelare allo studente):\n${correctAnswer}\n\n` +
          `RISPOSTA DELLO STUDENTE:\n${userAnswer}\n\n` +
          `Restituisci: {"score": 0.0|0.5|1.0, "feedback": "..."}`,
      },
    ],
  });

  const raw = response.choices[0]?.message?.content ?? "";
  let parsed: { score?: unknown; feedback?: unknown };
  try {
    parsed = JSON.parse(raw) as { score?: unknown; feedback?: unknown };
  } catch {
    return null;
  }

  if (
    typeof parsed.score !== "number" ||
    ![0, 0.5, 1].includes(parsed.score) ||
    typeof parsed.feedback !== "string" ||
    parsed.feedback.trim().length <= 5
  ) {
    return null;
  }

  return { score: parsed.score, feedback: parsed.feedback.trim() };
}

async function gradeFreeText(
  prompt: string,
  correctAnswer: string,
  userAnswer: string,
): Promise<{ score: number; feedback: string }> {
  // One retry: transient truncation/parse issues should not fail the student.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const graded = await gradeFreeTextOnce(prompt, correctAnswer, userAnswer);
      if (graded) return graded;
    } catch {
      // network/model error — retry once, then fail explicitly below
    }
  }
  throw new GradingUnavailableError();
}

// ── GET /labs/exercises ────────────────────────────────────────────────────────

router.get("/labs/exercises", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as AuthedRequest).clerkUserId;

  try {
    // Load profile for level + labsEnabled
    const [profile] = await db
      .select({ level: profilesTable.level, labsEnabled: profilesTable.labsEnabled })
      .from(profilesTable)
      .where(eq(profilesTable.userId, userId));

    if (!profile) {
      res.status(404).json({ error: "Profilo non trovato" });
      return;
    }

    if (!profile.labsEnabled && !hasLabsByDefault(profile.level)) {
      res.status(403).json({
        error: "Laboratori non abilitati. Attivali dal tuo profilo.",
        labsEnabled: false,
      });
      return;
    }

    const subjects = subjectsForPath(profile.level);

    let exercises;
    if (subjects && subjects.length > 0) {
      exercises = await db
        .select({
          id: labExercisesTable.id,
          subject: labExercisesTable.subject,
          topic: labExercisesTable.topic,
          title: labExercisesTable.title,
          prompt: labExercisesTable.prompt,
          exerciseType: labExercisesTable.exerciseType,
          options: labExercisesTable.options,
          difficultyLevel: labExercisesTable.difficultyLevel,
          points: labExercisesTable.points,
          // Never expose correctIndex or correctAnswer
        })
        .from(labExercisesTable)
        .where(inArray(labExercisesTable.subject, subjects))
        .orderBy(labExercisesTable.subject, labExercisesTable.topic);
    } else {
      // Unknown path or no subjects — return a varied sample
      exercises = await db
        .select({
          id: labExercisesTable.id,
          subject: labExercisesTable.subject,
          topic: labExercisesTable.topic,
          title: labExercisesTable.title,
          prompt: labExercisesTable.prompt,
          exerciseType: labExercisesTable.exerciseType,
          options: labExercisesTable.options,
          difficultyLevel: labExercisesTable.difficultyLevel,
          points: labExercisesTable.points,
        })
        .from(labExercisesTable)
        .orderBy(labExercisesTable.subject, labExercisesTable.topic)
        .limit(30);
    }

    res.json({
      hasLabsByDefault: hasLabsByDefault(profile.level),
      labsEnabled: profile.labsEnabled,
      exercises,
    });
  } catch (err) {
    req.log.error({ err }, "Errore elenco esercizi laboratorio");
    res.status(500).json({ error: "Errore interno del server" });
  }
});

// ── GET /labs/exercises/:id ────────────────────────────────────────────────────

router.get("/labs/exercises/:id", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as AuthedRequest).clerkUserId;
  const exerciseId = req.params.id as string;

  try {
    // Verify labs access
    const [profile] = await db
      .select({ level: profilesTable.level, labsEnabled: profilesTable.labsEnabled })
      .from(profilesTable)
      .where(eq(profilesTable.userId, userId));

    if (!profile) {
      res.status(404).json({ error: "Profilo non trovato" });
      return;
    }
    if (!profile.labsEnabled && !hasLabsByDefault(profile.level)) {
      res.status(403).json({ error: "Laboratori non abilitati" });
      return;
    }

    const [exercise] = await db
      .select({
        id: labExercisesTable.id,
        subject: labExercisesTable.subject,
        topic: labExercisesTable.topic,
        title: labExercisesTable.title,
        prompt: labExercisesTable.prompt,
        exerciseType: labExercisesTable.exerciseType,
        options: labExercisesTable.options,
        difficultyLevel: labExercisesTable.difficultyLevel,
        points: labExercisesTable.points,
      })
      .from(labExercisesTable)
      .where(eq(labExercisesTable.id, exerciseId));

    if (!exercise) {
      res.status(404).json({ error: "Esercizio non trovato" });
      return;
    }

    res.json(exercise);
  } catch (err) {
    req.log.error({ err }, "Errore lettura esercizio laboratorio");
    res.status(500).json({ error: "Errore interno del server" });
  }
});

// ── POST /labs/attempts ────────────────────────────────────────────────────────

router.post("/labs/attempts", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as AuthedRequest).clerkUserId;
  const { exerciseId, userAnswer } = req.body as {
    exerciseId?: string;
    userAnswer?: string;
  };

  if (!exerciseId || typeof exerciseId !== "string" || exerciseId.trim() === "") {
    res.status(400).json({ error: "exerciseId obbligatorio" });
    return;
  }
  if (!userAnswer || typeof userAnswer !== "string" || userAnswer.trim() === "") {
    res.status(400).json({ error: "userAnswer obbligatorio" });
    return;
  }

  try {
    // Verify labs access
    const [profile] = await db
      .select({ level: profilesTable.level, labsEnabled: profilesTable.labsEnabled })
      .from(profilesTable)
      .where(eq(profilesTable.userId, userId));

    if (!profile) {
      res.status(404).json({ error: "Profilo non trovato" });
      return;
    }
    if (!profile.labsEnabled && !hasLabsByDefault(profile.level)) {
      res.status(403).json({ error: "Laboratori non abilitati" });
      return;
    }

    // Load the full exercise (with answer key — server-only)
    const [exercise] = await db
      .select()
      .from(labExercisesTable)
      .where(eq(labExercisesTable.id, exerciseId));

    if (!exercise) {
      res.status(404).json({ error: "Esercizio non trovato" });
      return;
    }

    // Grade the answer
    let score: number;
    let feedback: string;

    if (exercise.exerciseType === "multiple_choice") {
      const answerIndex = parseInt(userAnswer.trim(), 10);
      if (isNaN(answerIndex) || exercise.correctIndex === null) {
        res.status(400).json({ error: "Risposta non valida per un esercizio a scelta multipla" });
        return;
      }
      const correct = answerIndex === exercise.correctIndex;
      score = correct ? 1.0 : 0.0;
      const options = (exercise.options ?? []) as string[];
      const correctText = options[exercise.correctIndex] ?? "";
      feedback = correct
        ? `Corretto! "${correctText}" è effettivamente la risposta giusta.`
        : `Non corretto. La risposta esatta era: "${correctText}". Rileggi il concetto e riprova.`;
    } else {
      // free_text — grade with AI
      if (!exercise.correctAnswer) {
        res.status(500).json({ error: "Chiave di risposta non disponibile per questo esercizio" });
        return;
      }
      const result = await gradeFreeText(
        exercise.prompt,
        exercise.correctAnswer,
        userAnswer.trim(),
      );
      score = result.score;
      feedback = result.feedback;
    }

    const earnedPoints = Math.round(exercise.points * score);
    const attemptId = randomUUID();

    // Save attempt and award wallet points in a transaction
    await db.transaction(async (tx) => {
      await tx.insert(labAttemptsTable).values({
        id: attemptId,
        userId,
        exerciseId,
        userAnswer: userAnswer.trim(),
        score,
        feedback,
        earnedPoints,
      });

      if (earnedPoints > 0) {
        await tx
          .update(profilesTable)
          .set({
            wallet: sql`${profilesTable.wallet} + ${earnedPoints}`,
            updatedAt: new Date(),
          })
          .where(eq(profilesTable.userId, userId));
      }
    });

    // Return result (no correctIndex/correctAnswer exposed)
    res.status(201).json({
      id: attemptId,
      exerciseId,
      score,
      feedback,
      earnedPoints,
      totalPoints: exercise.points,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Errore salvataggio tentativo laboratorio");
    res.status(500).json({ error: "Errore interno del server" });
  }
});

// ── GET /labs/attempts ─────────────────────────────────────────────────────────

router.get("/labs/attempts", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as AuthedRequest).clerkUserId;

  try {
    const attempts = await db
      .select({
        id: labAttemptsTable.id,
        exerciseId: labAttemptsTable.exerciseId,
        userAnswer: labAttemptsTable.userAnswer,
        score: labAttemptsTable.score,
        feedback: labAttemptsTable.feedback,
        earnedPoints: labAttemptsTable.earnedPoints,
        createdAt: labAttemptsTable.createdAt,
        // Join exercise metadata
        exerciseTitle: labExercisesTable.title,
        exerciseSubject: labExercisesTable.subject,
        exerciseTopic: labExercisesTable.topic,
      })
      .from(labAttemptsTable)
      .innerJoin(labExercisesTable, eq(labAttemptsTable.exerciseId, labExercisesTable.id))
      .where(eq(labAttemptsTable.userId, userId))
      .orderBy(sql`${labAttemptsTable.createdAt} desc`)
      .limit(50);

    res.json(attempts);
  } catch (err) {
    req.log.error({ err }, "Errore storico tentativi laboratorio");
    res.status(500).json({ error: "Errore interno del server" });
  }
});

// ── PATCH /profile/labs-enabled ───────────────────────────────────────────────

router.patch(
  "/profile/labs-enabled",
  requireAuth,
  async (req: Request, res: Response) => {
    const userId = (req as AuthedRequest).clerkUserId;
    const { enabled } = req.body as { enabled?: boolean };

    if (typeof enabled !== "boolean") {
      res.status(400).json({ error: "Il campo 'enabled' deve essere true o false" });
      return;
    }

    try {
      const [updated] = await db
        .update(profilesTable)
        .set({ labsEnabled: enabled, updatedAt: new Date() })
        .where(eq(profilesTable.userId, userId))
        .returning();

      if (!updated) {
        res.status(404).json({ error: "Profilo non trovato" });
        return;
      }

      const { email: _email, ...pub } = updated;
      res.json({
        ...pub,
        labsEnabled: updated.labsEnabled || hasLabsByDefault(updated.level),
        hasLabsByDefault: hasLabsByDefault(updated.level),
      });
    } catch (err) {
      req.log.error({ err }, "Errore aggiornamento labs-enabled");
      res.status(500).json({ error: "Errore interno del server" });
    }
  },
);

export default router;
