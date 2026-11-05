CREATE TABLE "task_series" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"repeat" jsonb NOT NULL,
	"start_date" date NOT NULL,
	"date_field" text DEFAULT 'due' NOT NULL,
	"stopped_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_series_date_field" CHECK ("task_series"."date_field" in ('due', 'scheduled'))
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "series_id" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "series_date" date;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "follows_task_id" text;--> statement-breakpoint
ALTER TABLE "task_series" ADD CONSTRAINT "task_series_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_series_running" ON "task_series" USING btree ("user_id") WHERE "task_series"."stopped_at" is null;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_series_id_task_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."task_series"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_follows_task_id_tasks_id_fk" FOREIGN KEY ("follows_task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_series_day" ON "tasks" USING btree ("series_id","series_date");--> statement-breakpoint
CREATE INDEX "tasks_follows_task_id_index" ON "tasks" USING btree ("follows_task_id");