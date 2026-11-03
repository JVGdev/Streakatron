CREATE TABLE "areas" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"description" jsonb,
	"description_text" text DEFAULT '' NOT NULL,
	"color" text DEFAULT 'stone' NOT NULL,
	"icon" text DEFAULT 'folder' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "board_columns" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"project_id" text NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "board_columns_category" CHECK ("board_columns"."category" in ('todo', 'in_progress', 'done'))
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"project_id" text NOT NULL,
	"title" text NOT NULL,
	"description" jsonb,
	"description_text" text DEFAULT '' NOT NULL,
	"kind" text NOT NULL,
	"target_minutes" integer,
	"period" text,
	"due_date" date,
	"status" text DEFAULT 'open' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goals_kind" CHECK ("goals"."kind" in ('outcome', 'commitment')),
	CONSTRAINT "goals_status" CHECK ("goals"."status" in ('open', 'achieved', 'dropped')),
	CONSTRAINT "goals_commitment_shape" CHECK ("goals"."kind" <> 'commitment' or ("goals"."target_minutes" is not null and "goals"."period" is not null))
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"area_id" text,
	"title" text NOT NULL,
	"description" jsonb,
	"description_text" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"status_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"next_action_task_id" text,
	"color" text DEFAULT 'stone' NOT NULL,
	"icon" text DEFAULT 'folder' NOT NULL,
	"start_date" date,
	"due_date" date,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_status" CHECK ("projects"."status" in ('active', 'parked', 'completed', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"entity_id" text NOT NULL,
	"title" text NOT NULL,
	"data" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"project_id" text,
	"goal_id" text,
	"parent_task_id" text,
	"column_id" text,
	"title" text NOT NULL,
	"description" jsonb,
	"description_text" text DEFAULT '' NOT NULL,
	"effort" text,
	"due_date" date,
	"scheduled_date" date,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_effort" CHECK ("tasks"."effort" is null or "tasks"."effort" in ('S', 'M', 'L')),
	CONSTRAINT "tasks_not_own_parent" CHECK ("tasks"."parent_task_id" is null or "tasks"."parent_task_id" <> "tasks"."id")
);
--> statement-breakpoint
ALTER TABLE "areas" ADD CONSTRAINT "areas_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_columns" ADD CONSTRAINT "board_columns_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_columns" ADD CONSTRAINT "board_columns_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_next_action_task_id_tasks_id_fk" FOREIGN KEY ("next_action_task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parent_task_id_tasks_id_fk" FOREIGN KEY ("parent_task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_column_id_board_columns_id_fk" FOREIGN KEY ("column_id") REFERENCES "public"."board_columns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "areas_user_id_sort_order_index" ON "areas" USING btree ("user_id","sort_order");--> statement-breakpoint
CREATE INDEX "board_columns_project_id_sort_order_index" ON "board_columns" USING btree ("project_id","sort_order");--> statement-breakpoint
CREATE INDEX "goals_project_id_index" ON "goals" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "projects_user_id_status_index" ON "projects" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "projects_area_id_index" ON "projects" USING btree ("area_id");--> statement-breakpoint
CREATE INDEX "snapshots_user_id_created_at_index" ON "snapshots" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "snapshots_expires_at_index" ON "snapshots" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "tasks_user_id_project_id_index" ON "tasks" USING btree ("user_id","project_id");--> statement-breakpoint
CREATE INDEX "tasks_column_id_sort_order_index" ON "tasks" USING btree ("column_id","sort_order");--> statement-breakpoint
CREATE INDEX "tasks_parent_task_id_index" ON "tasks" USING btree ("parent_task_id");--> statement-breakpoint
CREATE INDEX "tasks_goal_id_index" ON "tasks" USING btree ("goal_id");--> statement-breakpoint
CREATE INDEX "tasks_user_id_due_date_index" ON "tasks" USING btree ("user_id","due_date");