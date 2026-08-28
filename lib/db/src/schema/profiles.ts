import { pgTable, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";

export const profilesTable = pgTable("profiles", {
  userId: text("user_id").primaryKey(), // Clerk user id
  username: text("username").notNull().unique(),
  email: text("email").notNull(), // never exposed publicly
  firstName: text("first_name"),
  lastName: text("last_name"),
  birthDate: text("birth_date"),
  // Full Italian study-path string, e.g. "Liceo Scientifico". Null before onboarding.
  level: text("level"),
  institutionType: text("institution_type"),
  institutionName: text("institution_name"),
  studyYear: text("study_year"),
  studyAddress: text("study_address"),
  learningGoals: text("learning_goals"),
  studyInterests: text("study_interests"),
  examGoals: text("exam_goals"),
  wallet: integer("wallet").notNull().default(0),
  xp: integer("xp").notNull().default(0),
  streak: integer("streak").notNull().default(0),
  // ISO calendar date of the last authenticated activity. It makes daily
  // streak updates idempotent across repeated bootstrap calls.
  lastActiveDate: text("last_active_date"),
  inviteCode: text("invite_code").notNull().unique(), // stable 6-char code
  avatarObjectPath: text("avatar_object_path"),
  // Labs: true for STEM/technical paths by default, false for humanities.
  // Can be toggled manually via PATCH /profile/labs-enabled.
  labsEnabled: boolean("labs_enabled").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type InsertProfile = typeof profilesTable.$inferInsert;
export type Profile = typeof profilesTable.$inferSelect;
