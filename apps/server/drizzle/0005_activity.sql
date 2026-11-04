CREATE TABLE "activity" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"entity_id" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"local_date" date NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_xp" CHECK ("activity"."xp" >= 0)
);
--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_user_id_local_date_index" ON "activity" USING btree ("user_id","local_date");--> statement-breakpoint
CREATE INDEX "activity_user_id_type_entity_id_index" ON "activity" USING btree ("user_id","type","entity_id");