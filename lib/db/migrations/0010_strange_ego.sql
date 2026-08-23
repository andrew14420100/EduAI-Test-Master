CREATE TABLE "pending_upload_cleanup" (
	"key" text PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"last_failure_at" timestamp,
	"last_recovered_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
