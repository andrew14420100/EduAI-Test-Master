import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";

export const quizAttemptsTable = pgTable("quiz_attempts", {
  id: text("id").primaryKey(), // uuid
  userId: text("user_id").notNull(), // Clerk user id
  materialId: text("material_id").notNull(),
  score: integer("score").notNull(),
  totalQuestions: integer("total_questions").notNull(),
  earnedCoins: integer("earned_coins").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type InsertQuizAttempt = typeof quizAttemptsTable.$inferInsert;
export type QuizAttempt = typeof quizAttemptsTable.$inferSelect;
