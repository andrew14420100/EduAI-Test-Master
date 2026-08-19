import { Router, type IRouter, type Request, type Response } from "express";
import { randomUUID } from "crypto";
import { eq, and, inArray, sql, exists, or, isNull } from "drizzle-orm";
import {
  db,
  labExercisesTable,
  labAttemptsTable,
  profilesTable,
  materialsTable,
} from "@workspace/db";
import { requireAuth, type AuthedRequest } from "../middlewares/requireAuth";
import { openai } from "@workspace/integrations-openai-ai-server";
import { hasLabsByDefault, subjectsForPath } from "../lib/labPath";

const router: IRouter = Router();

// Points fraction for partial AI-graded answers
const PARTIAL_SCORE = 0.5;

router.post("/materials/:materialId/labs", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as AuthedRequest).clerkUserId;
  const materialId = req.params.materialId as string;
  try {
    const [material] = await db.select().from(materialsTable)
      .where(and(eq(materialsTable.id, materialId), eq(materialsTable.ownerId, userId)));
    if (!material) { res.status(404).json({ error: "Materiale non trovato" }); return; }
    if (material.extractionStatus !== "ready" || !material.extractedText?.trim()) {
      res.status(409).json({ error: "Il materiale non è ancora pronto per creare i laboratori." }); return;
    }
    let exercises: Array<{ topic?: string; title?: string; prompt?: string; solution?: string; difficulty?: string; points?: number }> = [];
    for (let attempt = 0; attempt < 2 && exercises.length < 15; attempt++) {
      const response = await openai.chat.completions.create({
        model: "gpt-5-mini",
        max_completion_tokens: 12000,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Sei un docente italiano. Crea esattamente 15 laboratori pratici originali basati solo sul materiale fornito. Non creare domande teoriche o a scelta multipla. Ogni esercizio deve richiedere calcoli, dati, procedimenti, pseudocodice o applicazione concreta. Rispondi solo JSON con {\"exercises\":[{\"topic\":\"...\",\"title\":\"...\",\"prompt\":\"...\",\"solution\":\"...\",\"difficulty\":\"base|medio|avanzato\",\"points\":number}]}." },
          { role: "user", content: `Materiale: ${material.title}\n\nCONTENUTO:\n${material.extractedText.slice(0, 120000)}` },
        ],
      });
      const raw = (response.choices[0]?.message?.content ?? "{}")
        .replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      try {
        const parsed = JSON.parse(raw) as { exercises?: Array<{ topic?: string; title?: string; prompt?: string; solution?: string; difficulty?: string; points?: number }> };
        exercises = (parsed.exercises ?? []).filter((item) => item.topic && item.title && item.prompt && item.solution).slice(0, 15);
      } catch (parseError) {
        req.log.warn({ materialId, attempt, parseError }, "Risposta IA laboratori non valida, nuovo tentativo");
      }
    }
    if (exercises.length < 15) { res.status(502).json({ error: "L'IA non ha prodotto 15 esercizi validi. Riprova." }); return; }
    const rows = exercises.map((item) => ({
      id: randomUUID(), sourceMaterialId: materialId, subject: material.title,
      topic: item.topic!, title: item.title!, prompt: item.prompt!,
      exerciseType: "free_text" as const, options: null, correctIndex: null,
      correctAnswer: item.solution!, difficultyLevel: (["base", "medio", "avanzato"].includes(item.difficulty ?? "") ? item.difficulty : "medio") as "base" | "medio" | "avanzato",
      points: Math.max(5, Math.min(25, Math.round(item.points ?? 10))),
    }));
    await db.insert(labExercisesTable).values(rows);
    res.status(201).json({ created: rows.length, materialId });
  } catch (err) {
    req.log.error({ err, materialId }, "Generazione laboratori da materiale fallita");
    res.status(500).json({ error: "Impossibile creare i laboratori. Riprova più tardi." });
  }
});

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
        .where(and(
          inArray(labExercisesTable.subject, subjects),
          or(
            isNull(labExercisesTable.sourceMaterialId),
            exists(db.select({ id: materialsTable.id }).from(materialsTable).where(eq(materialsTable.id, labExercisesTable.sourceMaterialId))),
          ),
        ))
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
        .where(and(
          or(
            isNull(labExercisesTable.sourceMaterialId),
            exists(db.select({ id: materialsTable.id }).from(materialsTable).where(eq(materialsTable.id, labExercisesTable.sourceMaterialId))),
          ),
        ))
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

    // Labs are practical: every answer is written by the student and evaluated
    // against the private solution. Legacy multiple-choice rows are converted
    // to a solution string here so old seeded exercises keep working.
    const expectedSolution = exercise.correctAnswer
      ?? ((exercise.options ?? []) as string[])[exercise.correctIndex ?? -1];
    if (!expectedSolution) {
      res.status(500).json({ error: "Soluzione non disponibile per questo esercizio" });
      return;
    }
    const result = await gradeFreeText(
      exercise.prompt,
      expectedSolution,
      userAnswer.trim(),
    );
    score = result.score;
    feedback = result.feedback;

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
