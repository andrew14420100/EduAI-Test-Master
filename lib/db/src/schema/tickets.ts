import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const ticketsTable = pgTable("tickets", {
  id: text("id").primaryKey(), // uuid
  userId: text("user_id").notNull(), // Clerk user id
  subject: text("subject").notNull(),
  category: text("category").notNull(), // e.g. "bug", "domanda", "altro"
  message: text("message").notNull(),
  status: text("status").notNull().default("open"), // open | closed | in_progress
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  readAt: timestamp("read_at"),
  closedAt: timestamp("closed_at"),
  closedBy: text("closed_by"),
});

export const ticketMessagesTable = pgTable("ticket_messages", {
  id: text("id").primaryKey(),
  ticketId: text("ticket_id").notNull(),
  authorId: text("author_id").notNull(),
  authorRole: text("author_role").notNull(), // user | admin
  message: text("message").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type InsertTicket = typeof ticketsTable.$inferInsert;
export type Ticket = typeof ticketsTable.$inferSelect;
export type TicketMessage = typeof ticketMessagesTable.$inferSelect;
