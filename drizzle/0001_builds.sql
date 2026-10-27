CREATE TABLE "builds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"round" integer NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"phase" text,
	"task_index" integer DEFAULT 0 NOT NULL,
	"tasks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"files" jsonb,
	"good_files" jsonb,
	"fix_attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"deployment_id" text,
	"step_errors" integer DEFAULT 0 NOT NULL,
	"error" text,
	"origin" text,
	"lease_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "neon_project_id" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "neon_database" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "neon_role" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "vercel_project_id" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "vercel_project_name" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "app_url" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "infra_error" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "build_requested" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "builds" ADD CONSTRAINT "builds_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "builds_project_idx" ON "builds" USING btree ("project_id","created_at");