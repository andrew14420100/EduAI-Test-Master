CREATE TABLE "lab_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"exercise_id" text NOT NULL,
	"user_answer" text NOT NULL,
	"score" real NOT NULL,
	"feedback" text NOT NULL,
	"earned_points" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lab_exercises" (
	"id" text PRIMARY KEY NOT NULL,
	"subject" text NOT NULL,
	"topic" text NOT NULL,
	"title" text NOT NULL,
	"prompt" text NOT NULL,
	"exercise_type" text NOT NULL,
	"options" jsonb,
	"correct_index" integer,
	"correct_answer" text,
	"difficulty_level" text DEFAULT 'medio' NOT NULL,
	"points" integer DEFAULT 10 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "labs_enabled" boolean DEFAULT false NOT NULL;