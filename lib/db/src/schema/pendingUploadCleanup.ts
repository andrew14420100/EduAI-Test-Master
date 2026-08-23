import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Singleton state for the bounded abandoned-upload cleanup job.
 *
 * Keeping this separate from pending_uploads means cleanup can retain failed
 * rows for retry while still recording the operator-visible incident state.
 */
export const pendingUploadCleanupTable = pgTable("pending_upload_cleanup", {
  key: text("key").primaryKey(),
  status: text("status").notNull(),
  failureCount: integer("failure_count").notNull().default(0),
  lastFailureAt: timestamp("last_failure_at"),
  incidentStartedAt: timestamp("incident_started_at"),
  lastRecoveredAt: timestamp("last_recovered_at"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type PendingUploadCleanup = typeof pendingUploadCleanupTable.$inferSelect;