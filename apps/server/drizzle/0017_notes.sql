CREATE TABLE "notes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"description" jsonb,
	"description_text" text DEFAULT '' NOT NULL,
	"color" text DEFAULT 'yellow' NOT NULL,
	"project_id" text,
	"focus_session_id" text,
	"focus_minute" smallint,
	"x" integer NOT NULL,
	"y" integer NOT NULL,
	"z" integer DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notes_color" CHECK ("notes"."color" in ('yellow', 'pink', 'blue', 'green', 'orange', 'lilac')),
	CONSTRAINT "notes_minute" CHECK ("notes"."focus_minute" is null or "notes"."focus_minute" >= 1)
);
--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_focus_session_id_focus_sessions_id_fk" FOREIGN KEY ("focus_session_id") REFERENCES "public"."focus_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notes_user_id_index" ON "notes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notes_focus_session_id_index" ON "notes" USING btree ("focus_session_id");