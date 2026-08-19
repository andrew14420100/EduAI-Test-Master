import { integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const mistakeItemsTable = pgTable(
  "mistake_items",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    materialId: text("material_id").notNull(),
    fingerprint: text("fingerprint").notNull(),
    question: text("question").notNull(),
    options: jsonb("options").notNull(),
    correctIndex: integer("correct_index").notNull(),
    timesMissed: integer("times_missed").notNull().default(1),
    lastWrongAt: timestamp("last_wrong_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("mistake_items_owner_fingerprint_unique").on(table.ownerId, table.fingerprint)],
);

export const quickExplanationsTable = pgTable(
  "quick_explanations",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    sessionId: text("session_id").notNull(),
    questionIndex: integer("question_index").notNull(),
    explanation: text("explanation").notNull(),
    chargedPoints: integer("charged_points").notNull().default(2),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("quick_explanations_owner_session_question_unique").on(
      table.ownerId,
      table.sessionId,
      table.questionIndex,
    ),
  ],
);

export type MistakeItem = typeof mistakeItemsTable.$inferSelect;
export type QuickExplanation = typeof quickExplanationsTable.$inferSelect;