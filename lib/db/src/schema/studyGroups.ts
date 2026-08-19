import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const studyGroupsTable = pgTable("study_groups", {
  id: text("id").primaryKey(), // uuid
  name: text("name").notNull(),
  description: text("description"),
  ownerId: text("owner_id").notNull(), // Clerk user id
  coverObjectPath: text("cover_object_path"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const groupMembershipsTable = pgTable("group_memberships", {
  id: text("id").primaryKey(), // uuid
  groupId: text("group_id").notNull(),
  userId: text("user_id").notNull(), // Clerk user id
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
});

export type InsertStudyGroup = typeof studyGroupsTable.$inferInsert;
export type StudyGroup = typeof studyGroupsTable.$inferSelect;
export type InsertGroupMembership = typeof groupMembershipsTable.$inferInsert;
export type GroupMembership = typeof groupMembershipsTable.$inferSelect;
