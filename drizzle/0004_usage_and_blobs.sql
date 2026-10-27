CREATE TABLE "ai_usage" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"build_id" uuid,
	"purpose" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"cached_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"reasoning_tokens" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "build_blobs" (
	"build_id" uuid NOT NULL,
	"name" text NOT NULL,
	"data" "bytea" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "build_blobs_build_id_name_pk" PRIMARY KEY("build_id","name")
);
--> statement-breakpoint
ALTER TABLE "builds" ADD COLUMN "tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "builder_model" text;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_build_id_builds_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."builds"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "build_blobs" ADD CONSTRAINT "build_blobs_build_id_builds_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."builds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_usage_project_idx" ON "ai_usage" USING btree ("project_id","created_at");--> statement-breakpoint
-- Rounds in flight keep their state: the blobs move off the builds row as plain JSON (new
-- writes are gzipped; readers accept both). Finished rounds don't need it: the repo has the source.
INSERT INTO "build_blobs" ("build_id", "name", "data")
SELECT "id", 'files', convert_to("files"::text, 'UTF8') FROM "builds"
WHERE "files" IS NOT NULL AND "status" IN ('queued', 'setup', 'planning', 'building');--> statement-breakpoint
INSERT INTO "build_blobs" ("build_id", "name", "data")
SELECT "id", 'good', convert_to("good_files"::text, 'UTF8') FROM "builds"
WHERE "good_files" IS NOT NULL AND "status" IN ('queued', 'setup', 'planning', 'building');--> statement-breakpoint
INSERT INTO "build_blobs" ("build_id", "name", "data")
SELECT "id", 'task', convert_to("agent_messages"::text, 'UTF8') FROM "builds"
WHERE "agent_messages" IS NOT NULL AND "status" IN ('queued', 'setup', 'planning', 'building');
