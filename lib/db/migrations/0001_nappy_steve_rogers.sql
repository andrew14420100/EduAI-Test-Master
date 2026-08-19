ALTER TABLE "materials" ADD COLUMN "extracted_text" text;--> statement-breakpoint
ALTER TABLE "materials" ADD COLUMN "extraction_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "materials" ADD COLUMN "extraction_error" text;