CREATE TABLE "focus_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"task_id" text,
	"project_id" text,
	"status" text NOT NULL,
	"planned_minutes" smallint NOT NULL,
	"break_minutes" smallint DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"paused_ms" integer DEFAULT 0 NOT NULL,
	"paused_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"minutes" smallint,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "focus_sessions_planned" CHECK ("focus_sessions"."planned_minutes" between 1 and 240),
	CONSTRAINT "focus_sessions_break" CHECK ("focus_sessions"."break_minutes" between 0 and 60),
	CONSTRAINT "focus_sessions_paused_ms" CHECK ("focus_sessions"."paused_ms" >= 0),
	CONSTRAINT "focus_sessions_shape" CHECK (("focus_sessions"."status" in ('running', 'paused')) = ("focus_sessions"."ended_at" is null)
        and ("focus_sessions"."status" = 'paused') = ("focus_sessions"."paused_at" is not null)
        and ("focus_sessions"."status" = 'completed') = ("focus_sessions"."minutes" is not null)),
	CONSTRAINT "focus_sessions_note" CHECK (char_length("focus_sessions"."note") <= 500)
);
--> statement-breakpoint
ALTER TABLE "focus_sessions" ADD CONSTRAINT "focus_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "focus_sessions" ADD CONSTRAINT "focus_sessions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "focus_sessions" ADD CONSTRAINT "focus_sessions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "focus_sessions_user_id_started_at_index" ON "focus_sessions" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "focus_sessions_one_open" ON "focus_sessions" USING btree ("user_id") WHERE "focus_sessions"."status" in ('running', 'paused');