import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Stores friendship connections made via invite codes
export const friendshipsTable = pgTable("friendships", {
  id: text("id").primaryKey(), // uuid
  userId: text("user_id").notNull(), // Clerk user id (user who used the invite)
  friendId: text("friend_id").notNull(), // Clerk user id (owner of the invite code)
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type InsertFriendship = typeof friendshipsTable.$inferInsert;
export type Friendship = typeof friendshipsTable.$inferSelect;
