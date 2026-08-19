import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";

export const pendingUploadsTable = pgTable("pending_uploads", {
  objectPath: text("object_path").primaryKey(), // normalized /objects/... path
  ownerId: text("owner_id").notNull(), // Clerk user id
  name: text("name").notNull(), // expected file name
  contentType: text("content_type").notNull(), // expected content type
  size: integer("size").notNull(), // expected file size in bytes
  expiresAt: timestamp("expires_at").notNull(), // presigned URL expiry
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type InsertPendingUpload = typeof pendingUploadsTable.$inferInsert;
export type PendingUpload = typeof pendingUploadsTable.$inferSelect;
