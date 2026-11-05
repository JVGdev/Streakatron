CREATE TABLE "weekly_reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"week_start" date NOT NULL,
	"reflection" jsonb,
	"reflection_text" text DEFAULT '' NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "goals" DROP CONSTRAINT "goals_kind";--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "target_count" integer;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "unit" text;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "commitment_id" text;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "commitment_from" date;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "weekly_reviews" ADD CONSTRAINT "weekly_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_reviews_user_id_week_start_index" ON "weekly_reviews" USING btree ("user_id","week_start");--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_commitment_id_commitments_id_fk" FOREIGN KEY ("commitment_id") REFERENCES "public"."commitments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_number_shape" CHECK ("goals"."kind" <> 'number' or "goals"."target_count" is not null);--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_count" CHECK ("goals"."count" >= 0);--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_kind" CHECK ("goals"."kind" in ('outcome', 'time', 'number'));