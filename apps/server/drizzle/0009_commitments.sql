CREATE TABLE "commitment_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"commitment_id" text NOT NULL,
	"local_date" date NOT NULL,
	"amount" integer NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"focus_session_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commitment_entries_amount" CHECK ("commitment_entries"."amount" >= 1),
	CONSTRAINT "commitment_entries_source" CHECK ("commitment_entries"."source" in ('manual', 'focus'))
);
--> statement-breakpoint
CREATE TABLE "commitments" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"project_id" text,
	"title" text NOT NULL,
	"description" jsonb,
	"description_text" text DEFAULT '' NOT NULL,
	"measure" text NOT NULL,
	"target" integer NOT NULL,
	"unit" text,
	"period" text NOT NULL,
	"schedule" jsonb,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commitments_measure" CHECK ("commitments"."measure" in ('check', 'count', 'minutes')),
	CONSTRAINT "commitments_period" CHECK ("commitments"."period" in ('day', 'week')),
	CONSTRAINT "commitments_shape" CHECK ("commitments"."target" >= 1
        and ("commitments"."measure" <> 'check' or "commitments"."period" <> 'day' or "commitments"."target" = 1)
        and ("commitments"."unit" is null or "commitments"."measure" = 'count')
        and ("commitments"."schedule" is null or "commitments"."period" = 'day'))
);
--> statement-breakpoint
ALTER TABLE "goals" DROP CONSTRAINT "goals_commitment_shape";--> statement-breakpoint
ALTER TABLE "goals" DROP CONSTRAINT "goals_kind";--> statement-breakpoint
ALTER TABLE "focus_sessions" ADD COLUMN "commitment_id" text;--> statement-breakpoint
ALTER TABLE "commitment_entries" ADD CONSTRAINT "commitment_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitment_entries" ADD CONSTRAINT "commitment_entries_commitment_id_commitments_id_fk" FOREIGN KEY ("commitment_id") REFERENCES "public"."commitments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitment_entries" ADD CONSTRAINT "commitment_entries_focus_session_id_focus_sessions_id_fk" FOREIGN KEY ("focus_session_id") REFERENCES "public"."focus_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "commitment_entries_commitment_id_local_date_index" ON "commitment_entries" USING btree ("commitment_id","local_date");--> statement-breakpoint
CREATE INDEX "commitment_entries_user_id_local_date_index" ON "commitment_entries" USING btree ("user_id","local_date");--> statement-breakpoint
CREATE UNIQUE INDEX "commitment_entries_one_per_session" ON "commitment_entries" USING btree ("focus_session_id") WHERE "commitment_entries"."focus_session_id" is not null;--> statement-breakpoint
CREATE INDEX "commitments_user_id_sort_order_index" ON "commitments" USING btree ("user_id","sort_order");--> statement-breakpoint
CREATE INDEX "commitments_project_id_index" ON "commitments" USING btree ("project_id");--> statement-breakpoint
ALTER TABLE "focus_sessions" ADD CONSTRAINT "focus_sessions_commitment_id_commitments_id_fk" FOREIGN KEY ("commitment_id") REFERENCES "public"."commitments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_time_shape" CHECK ("goals"."kind" <> 'time' or ("goals"."target_minutes" is not null and "goals"."period" is not null));--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_kind" CHECK ("goals"."kind" in ('outcome', 'time'));