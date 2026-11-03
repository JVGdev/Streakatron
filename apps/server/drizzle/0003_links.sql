CREATE TABLE "links" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"source_id" text NOT NULL,
	"source_field" text NOT NULL,
	"target_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "links" ADD CONSTRAINT "links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "links_source_id_source_field_target_id_index" ON "links" USING btree ("source_id","source_field","target_id");--> statement-breakpoint
CREATE INDEX "links_user_id_target_id_index" ON "links" USING btree ("user_id","target_id");