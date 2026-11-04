ALTER TABLE "board_columns" DROP CONSTRAINT "board_columns_category";--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "spotlighted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "spotlighted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "board_columns" ADD CONSTRAINT "board_columns_category" CHECK ("board_columns"."category" in ('todo', 'in_progress', 'waiting', 'done'));