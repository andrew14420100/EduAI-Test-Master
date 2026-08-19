import { pgTable, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";

export type QuizQuestion = {
  question: string;
  options: string[]; // 4 options
};

export type QuizQuestionWithKey = QuizQuestion & {
  correctIndex: number;
  recoveryItemId?: string;
};

export const quizSessionsTable = pgTable("quiz_sessions", {
  id: text("id").primaryKey(), // uuid
  ownerId: text("owner_id").notNull(), // Clerk user id
  // First selected material — kept for backward-compatible attempt history.
  materialId: text("material_id").notNull(), // must be owned by same user
  // All selected material ids (JSON string array). Questions rotate across them.
  materialIds: jsonb("material_ids").notNull(),
  totalQuestions: integer("total_questions").notNull(), // 10, 20, or 30
  // stored as JSON array of QuizQuestionWithKey (includes correctIndex for server scoring)
  questionsWithKey: jsonb("questions_with_key").notNull(),
  // status: 'active' | 'completed' | 'expired'
  status: text("status").notNull().default("active"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  // idempotency key from the complete request, set on first completion
  idempotencyKey: text("idempotency_key"),
  // cached attempt result id (set on completion, so retries can return same attempt)
  attemptId: text("attempt_id"),
});

export type InsertQuizSession = typeof quizSessionsTable.$inferInsert;
export type QuizSession = typeof quizSessionsTable.$inferSelect;
