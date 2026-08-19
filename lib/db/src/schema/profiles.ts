import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";

export const profilesTable = pgTable("profiles", {
  userId: text("user_id").primaryKey(), // Clerk user id
  username: text("username").notNull().unique(),
  email: text("email").notNull(), // never exposed publicly
  // Full Italian study-path string, e.g. "Liceo Scientifico". Null before onboarding.
  level: text("level"),
  wallet: integer("wallet").notNull().default(0),
  streak: integer("streak").notNull().default(0),
  inviteCode: text("invite_code").notNull().unique(), // stable 6-char code
  avatarObjectPath: text("avatar_object_path"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type InsertProfile = typeof profilesTable.$inferInsert;
export type Profile = typeof profilesTable.$inferSelect;
