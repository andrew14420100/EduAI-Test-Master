import { pgTable, text, integer, real, jsonb, timestamp, boolean } from "drizzle-orm/pg-core";

// Exercise difficulty levels
export type ExerciseDifficulty = "base" | "medio" | "avanzato";
// Exercise types
export type ExerciseType = "multiple_choice" | "free_text";

export const labExercisesTable = pgTable("lab_exercises", {
  id: text("id").primaryKey(), // uuid
  subject: text("subject").notNull(), // e.g. "Ingegneria Informatica"
  topic: text("topic").notNull(), // e.g. "Algoritmi"
  title: text("title").notNull(),
  prompt: text("prompt").notNull(),
  exerciseType: text("exercise_type").notNull().$type<ExerciseType>(), // "multiple_choice" | "free_text"
  // JSONB array of strings for multiple_choice options (null for free_text)
  options: jsonb("options").$type<string[]>(),
  // For multiple_choice: correct option index (server-only, never exposed)
  correctIndex: integer("correct_index"),
  // For free_text: model answer hint for AI grading (server-only)
  correctAnswer: text("correct_answer"),
  difficultyLevel: text("difficulty_level").notNull().$type<ExerciseDifficulty>().default("medio"),
  points: integer("points").notNull().default(10),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const labAttemptsTable = pgTable("lab_attempts", {
  id: text("id").primaryKey(), // uuid
  userId: text("user_id").notNull(), // Clerk user id
  exerciseId: text("exercise_id").notNull(), // references lab_exercises.id
  userAnswer: text("user_answer").notNull(), // free text or stringified option index
  // 0..1 score: 1.0 = correct, 0.5 = partial, 0.0 = wrong
  score: real("score").notNull(),
  feedback: text("feedback").notNull(), // Italian explanation
  earnedPoints: integer("earned_points").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── Profile extension for labs toggle ────────────────────────────────────────
// We extend the profiles table by adding a labsEnabled column via migration.
// The column is referenced here so Drizzle knows about it.
// The actual profilesTable definition stays in profiles.ts.

export type InsertLabExercise = typeof labExercisesTable.$inferInsert;
export type LabExercise = typeof labExercisesTable.$inferSelect;
export type InsertLabAttempt = typeof labAttemptsTable.$inferInsert;
export type LabAttempt = typeof labAttemptsTable.$inferSelect;
