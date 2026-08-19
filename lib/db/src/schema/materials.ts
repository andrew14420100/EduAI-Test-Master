import { pgTable, text, integer, timestamp, unique } from "drizzle-orm/pg-core";

export const materialsTable = pgTable(
  "materials",
  {
    id: text("id").primaryKey(), // uuid
    ownerId: text("owner_id").notNull(), // Clerk user id
    title: text("title").notNull(),
    description: text("description"),
    contentType: text("content_type").notNull(),
    objectPath: text("object_path").notNull(), // stored path, not file bytes
    size: integer("size"), // file size in bytes, optional
    groupId: text("group_id"), // nullable, references studyGroupsTable.id
    // Content-grounded study pipeline; raw text is never exposed to clients.
    // Normalized text extracted from the uploaded object, when supported.
    extractedText: text("extracted_text"), // nullable — never exposed in list responses
    // 'pending' | 'processing' | 'ready' | 'unsupported' | 'failed'
    extractionStatus: text("extraction_status").notNull().default("pending"),
    // Italian human-readable reason when status is unsupported/failed
    extractionError: text("extraction_error"), // nullable
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    // One material per underlying storage object — prevents duplicate finalize.
    unique("materials_object_path_unique").on(table.objectPath),
  ],
);

export type InsertMaterial = typeof materialsTable.$inferInsert;
export type Material = typeof materialsTable.$inferSelect;
