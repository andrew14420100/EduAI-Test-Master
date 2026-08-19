CREATE TABLE "mistake_items" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"material_id" text NOT NULL,
	"fingerprint" text NOT NULL,
	"question" text NOT NULL,
	"options" jsonb NOT NULL,
	"correct_index" integer NOT NULL,
	"times_missed" integer DEFAULT 1 NOT NULL,
	"last_wrong_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quick_explanations" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"session_id" text NOT NULL,
	"question_index" integer NOT NULL,
	"explanation" text NOT NULL,
	"charged_points" integer DEFAULT 2 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "mistake_items_owner_fingerprint_unique" ON "mistake_items" USING btree ("owner_id","fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "quick_explanations_owner_session_question_unique" ON "quick_explanations" USING btree ("owner_id","session_id","question_index");