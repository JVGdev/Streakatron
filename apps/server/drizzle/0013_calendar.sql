CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"project_id" text,
	"title" text NOT NULL,
	"description" jsonb,
	"description_text" text DEFAULT '' NOT NULL,
	"date" date,
	"precision" text DEFAULT 'day' NOT NULL,
	"start_time" text,
	"duration_minutes" smallint,
	"repeat" jsonb,
	"reminder_minutes" integer,
	"spotlighted_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_precision" CHECK ("events"."precision" in ('day', 'month', 'tbd')),
	CONSTRAINT "events_shape" CHECK (("events"."precision" = 'tbd') = ("events"."date" is null)
        and ("events"."precision" = 'day' or ("events"."start_time" is null and "events"."repeat" is null and "events"."reminder_minutes" is null))
        and ("events"."duration_minutes" is null or "events"."start_time" is not null))
);
--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "due_precision" text DEFAULT 'day' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_user_id_date_index" ON "events" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "events_project_id_index" ON "events" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "events_reminders" ON "events" USING btree ("user_id") WHERE "events"."reminder_minutes" is not null and "events"."deleted_at" is null;