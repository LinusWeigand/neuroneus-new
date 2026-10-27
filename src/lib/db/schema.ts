import {
  bigserial,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type {
  BuildActivity,
  BuildEventKind,
  BuildNoteData,
  BuildPhase,
  BuildStatus,
  BuildTask,
  DecisionAnswerData,
  DecisionCard,
  RepoLogData,
  UsagePurpose,
} from "@/lib/types";
import type { ProjectSpec } from "@/lib/spec/templates";

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  vision: text("vision").notNull(),
  agentIds: jsonb("agent_ids").$type<string[]>().notNull(),
  repoFullName: text("repo_full_name"),
  repoUrl: text("repo_url"),
  repoError: text("repo_error"),
  // Run lock: at most one discussion per project at a time.
  runId: text("run_id"),
  runStartedAt: timestamp("run_started_at", { withTimezone: true }),
  cancelRequested: boolean("cancel_requested").notNull().default(false),
  // The generated app: a Neon database and a Vercel project, created by the platform.
  neonProjectId: text("neon_project_id"),
  neonDatabase: text("neon_database"),
  neonRole: text("neon_role"),
  vercelProjectId: text("vercel_project_id"),
  vercelProjectName: text("vercel_project_name"),
  appUrl: text("app_url"),
  infraError: text("infra_error"),
  /** Web app or web game, and its spec. Building starts only when every required point is answered. */
  spec: jsonb("spec").$type<ProjectSpec | null>(),
  /** The DESIGN.md the app is built with (a slug from the awesome-claude-design catalog). */
  designSlug: text("design_slug"),
  /** The deployment the builder writes code with; null uses the platform default. */
  builderModel: text("builder_model"),
  /** Another build round was asked for while one was running. */
  buildRequested: boolean("build_requested").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seq: bigserial("seq", { mode: "number" }).notNull(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    authorType: text("author_type").$type<"user" | "agent" | "moderator">().notNull(),
    agentId: text("agent_id"),
    kind: text("kind").$type<"chat" | "decision_request" | "decision_answer" | "note">().notNull(),
    content: text("content").notNull(),
    data: jsonb("data").$type<DecisionCard | DecisionAnswerData | RepoLogData | BuildNoteData | null>(),
    runId: text("run_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** Bumped when `data` changes (a card gets answered), so pollers can fetch only what changed. */
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("messages_project_seq_idx").on(t.projectId, t.seq)],
);

export const decisions = pgTable(
  "decisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    requestMessageId: uuid("request_message_id").references(() => messages.id, {
      onDelete: "set null",
    }),
    header: text("header").notNull(),
    question: text("question").notNull(),
    choice: text("choice").notNull(),
    detail: text("detail"),
    isCustom: boolean("is_custom").notNull().default(false),
    wasRecommended: boolean("was_recommended").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("decisions_project_idx").on(t.projectId, t.createdAt)],
);

/**
 * One build round: set up infrastructure if needed, plan tasks, then implement → deploy each
 * task. Runs as a chain of short steps (each under the function time limit); `leaseUntil`
 * guarantees one step at a time and lets a watchdog resume a chain that died.
 */
export const builds = pgTable(
  "builds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    round: integer("round").notNull(),
    kind: text("kind").$type<"setup" | "build">().notNull(),
    status: text("status").$type<BuildStatus>().notNull().default("queued"),
    phase: text("phase").$type<BuildPhase>(),
    taskIndex: integer("task_index").notNull().default(0),
    tasks: jsonb("tasks").$type<BuildTask[]>().notNull().default([]),
    fixAttempts: integer("fix_attempts").notNull().default(0),
    lastError: text("last_error"),
    deploymentId: text("deployment_id"),
    stepErrors: integer("step_errors").notNull().default(0),
    /** What's happening right now, for the live progress UI. Updated about once a second. */
    activity: jsonb("activity").$type<BuildActivity | null>(),
    /** When the current task phase (or setup/planning) began; drives the elapsed timer. */
    phaseStartedAt: timestamp("phase_started_at", { withTimezone: true }),
    agentTurns: integer("agent_turns").notNull().default(0),
    /** Model tokens (input + output) the round has used so far, checked against its budget. */
    tokens: integer("tokens").notNull().default(0),
    error: text("error"),
    origin: text("origin"),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("builds_project_idx").on(t.projectId, t.createdAt)],
);

/** The build's activity log: one row per thing an agent did (read, wrote, deployed, ...). */
export const buildEvents = pgTable(
  "build_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    buildId: uuid("build_id")
      .notNull()
      .references(() => builds.id, { onDelete: "cascade" }),
    taskIndex: integer("task_index"),
    agentId: text("agent_id"),
    kind: text("kind").$type<BuildEventKind>().notNull(),
    path: text("path"),
    detail: text("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("build_events_build_idx").on(t.buildId, t.id)],
);

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

/**
 * A build's large state, kept off the builds row so polling never drags it along: the working
 * copy of the source ("files"), the last version that deployed ("good"), and a task in progress
 * ("task": the builder's conversation and uncommitted files). Gzipped JSON. Deleted when the
 * round ends; the repository has the source.
 */
export const buildBlobs = pgTable(
  "build_blobs",
  {
    buildId: uuid("build_id")
      .notNull()
      .references(() => builds.id, { onDelete: "cascade" }),
    name: text("name").$type<"files" | "good" | "task" | "art">().notNull(),
    data: bytea("data").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.buildId, t.name] })],
);

/** One row per model call: what it was for, which deployment, and the tokens it used. */
export const aiUsage = pgTable(
  "ai_usage",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    buildId: uuid("build_id").references(() => builds.id, { onDelete: "set null" }),
    purpose: text("purpose").$type<UsagePurpose>().notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    cachedTokens: integer("cached_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    reasoningTokens: integer("reasoning_tokens").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ai_usage_project_idx").on(t.projectId, t.createdAt)],
);

export type ProjectRow = typeof projects.$inferSelect;
export type BuildRow = typeof builds.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;
export type DecisionRow = typeof decisions.$inferSelect;
