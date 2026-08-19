import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const ticketsTable = pgTable("tickets", {
  id: text("id").primaryKey(), // uuid
  userId: text("user_id").notNull(), // Clerk user id
  subject: text("subject").notNull(),
  category: text("category").notNull(), // e.g. "bug", "domanda", "altro"
  message: text("message").notNull(),
  status: text("status").notNull().default("open"), // open | closed | in_progress
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type InsertTicket = typeof ticketsTable.$inferInsert;
export type Ticket = typeof ticketsTable.$inferSelect;
