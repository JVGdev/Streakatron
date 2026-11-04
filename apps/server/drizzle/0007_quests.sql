CREATE TABLE "quest_instances" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"template" text NOT NULL,
	"status" text DEFAULT 'offered' NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"target" integer NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"xp" integer NOT NULL,
	"tier" text NOT NULL,
	"task_id" text,
	"project_id" text,
	"goal_id" text,
	"focus_session_id" text,
	"parent_quest_id" text,
	"reroll_of" text,
	"missing" jsonb,
	"offered_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quest_instances_target" CHECK ("quest_instances"."target" >= 0 and "quest_instances"."progress" >= 0 and "quest_instances"."xp" >= 0),
	CONSTRAINT "quest_instances_shape" CHECK (("quest_instances"."status" = 'completed') = ("quest_instances"."completed_at" is not null)
        and ("quest_instances"."status" in ('expired', 'rerolled', 'cancelled')) = ("quest_instances"."closed_at" is not null)
        and "quest_instances"."period_start" <= "quest_instances"."period_end")
);
--> statement-breakpoint
ALTER TABLE "quest_instances" ADD CONSTRAINT "quest_instances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_instances" ADD CONSTRAINT "quest_instances_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_instances" ADD CONSTRAINT "quest_instances_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_instances" ADD CONSTRAINT "quest_instances_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_instances" ADD CONSTRAINT "quest_instances_focus_session_id_focus_sessions_id_fk" FOREIGN KEY ("focus_session_id") REFERENCES "public"."focus_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_instances" ADD CONSTRAINT "quest_instances_parent_quest_id_quest_instances_id_fk" FOREIGN KEY ("parent_quest_id") REFERENCES "public"."quest_instances"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_instances" ADD CONSTRAINT "quest_instances_reroll_of_quest_instances_id_fk" FOREIGN KEY ("reroll_of") REFERENCES "public"."quest_instances"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quest_instances_user_id_status_index" ON "quest_instances" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "quest_instances_user_id_period_start_index" ON "quest_instances" USING btree ("user_id","period_start");