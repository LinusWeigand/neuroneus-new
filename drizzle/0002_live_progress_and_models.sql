CREATE TABLE "build_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"build_id" uuid NOT NULL,
	"task_index" integer,
	"agent_id" text,
	"kind" text NOT NULL,
	"path" text,
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "builds" ADD COLUMN "activity" jsonb;--> statement-breakpoint
ALTER TABLE "builds" ADD COLUMN "phase_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "builds" ADD COLUMN "agent_messages" jsonb;--> statement-breakpoint
ALTER TABLE "builds" ADD COLUMN "agent_turns" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "agent_models" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "build_events" ADD CONSTRAINT "build_events_build_id_builds_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."builds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "build_events_build_idx" ON "build_events" USING btree ("build_id","id");