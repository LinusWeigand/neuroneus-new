import type { ProjectSpec } from "@/lib/spec/templates";

// Shared types between server and client. Keep this file free of server imports.

export type DecisionOption = {
  label: string;
  description: string;
  recommended: boolean;
  /** Agent ids that argued for this option in the discussion. */
  championedBy: string[];
  /** A machine value behind the label (e.g. "web_game" for the app-or-game question). */
  value?: string;
};

export type DecisionQuestion = {
  id: string;
  /** Short chip label, max ~12 chars. */
  header: string;
  question: string;
  options: DecisionOption[];
};

export type DecisionAnswer = {
  questionId: string;
  header: string;
  question: string;
  choice: string;
  isCustom: boolean;
  wasRecommended: boolean;
  value?: string;
};

export type DecisionCard = {
  type: "decision_card";
  status: "pending" | "answered" | "superseded";
  summary: string;
  questions: DecisionQuestion[];
  answers?: DecisionAnswer[];
};

export type DecisionAnswerData = {
  type: "decision_answer";
  requestMessageId: string;
  answers: DecisionAnswer[];
};

/** A system note that decisions were committed to the project repository. */
export type RepoLogData = {
  type: "repo_log";
  count: number;
  repo: string;
  url: string;
};

/** A system note about a build round; the client renders it in the viewer's language. */
export type BuildNoteData =
  | { type: "build_started"; round: number; steps: string[] }
  | { type: "build_done"; round: number; done: number; total: number; url: string | null; budget?: boolean }
  | { type: "build_failed"; round: number; reason: string }
  | { type: "task_rolled_back"; round: number; title: string }
  | { type: "spec_complete"; kind: "web_app" | "web_game"; design: string | null };

export type BuildStatus = "queued" | "setup" | "planning" | "building" | "done" | "failed" | "cancelled";
export type BuildPhase = "implement" | "fix" | "deploy";

export type BuildTask = {
  id: string;
  title: string;
  /** Implementation brief for the builder. Internal: never shown in the chat. */
  detail: string;
  agentId: string;
  /** skipped: the round's token budget ran out before this task. */
  status: "pending" | "working" | "done" | "failed" | "skipped";
  /** One product-level sentence from the agent once the task shipped. */
  summary?: string;
};

/** The live "what's happening now" line. */
export type BuildActivity = {
  kind: "setup" | "planning" | "thinking" | "listing" | "reading" | "searching" | "writing" | "editing" | "deleting" | "schema" | "deploying";
  agentId?: string;
  path?: string;
  /** Characters written so far (writing/editing), or the search query. */
  chars?: number;
  query?: string;
  /** setup: database | hosting | starter. deploying: queued | starting | installing | compiling | checking | pages | publishing. */
  stage?: string;
  since: string;
};

export type BuildEventKind =
  | "listed"
  | "read"
  | "searched"
  | "wrote"
  | "edited"
  | "deleted"
  | "finished"
  | "continued"
  | "planned"
  | "deploy_started"
  | "deploy_ready"
  | "deploy_failed"
  | "rolled_back";

export type BuildEventDTO = {
  id: number;
  taskIndex: number | null;
  agentId: string | null;
  kind: BuildEventKind;
  path: string | null;
  detail: string | null;
  createdAt: string;
};

export type BuildDTO = {
  id: string;
  round: number;
  kind: "setup" | "build";
  status: BuildStatus;
  phase: BuildPhase | null;
  taskIndex: number;
  tasks: Omit<BuildTask, "detail">[];
  error: string | null;
  activity: BuildActivity | null;
  phaseStartedAt: string | null;
  /** Model tokens the round used so far. */
  tokens: number;
  createdAt: string;
  updatedAt: string;
};

/** What a model call was for. chat/plan_huddle/card/spec run in the group chat; the rest build. */
export type UsagePurpose =
  | "chat"
  | "huddle_plan"
  | "card"
  | "spec"
  | "database"
  | "design"
  | "design_brief"
  | "plan"
  | "build";

/** Token totals for a project, split into the discussion and building. */
export type UsageSummary = {
  chat: { input: number; cached: number; output: number; calls: number };
  build: { input: number; cached: number; output: number; calls: number };
  /** Totals per build round, newest first. */
  rounds: { round: number; tokens: number; createdAt: string }[];
};

/** Phases of a run the client shows as status lines; the client localizes them. */
export type StatusKey = "reading" | "preparing";

export type MessageDTO = {
  id: string;
  seq: number;
  authorType: "user" | "agent" | "moderator";
  agentId: string | null;
  kind: "chat" | "decision_request" | "decision_answer" | "note";
  content: string;
  data: DecisionCard | DecisionAnswerData | RepoLogData | BuildNoteData | null;
  createdAt: string;
};

export type DecisionDTO = {
  id: string;
  header: string;
  question: string;
  choice: string;
  isCustom: boolean;
  wasRecommended: boolean;
  createdAt: string;
};

export type ProjectDTO = {
  id: string;
  name: string;
  vision: string;
  agentIds: string[];
  repoFullName: string | null;
  repoUrl: string | null;
  repoError: string | null;
  /** The live app, deployed to Vercel. */
  appUrl: string | null;
  /** The app has its own Neon database. */
  hasDatabase: boolean;
  /** The model the builder writes code with; null means the platform default. */
  builderModel: string | null;
  spec: ProjectSpec | null;
  designSlug: string | null;
  infraError: string | null;
  running: boolean;
  createdAt: string;
  updatedAt: string;
};

/** Events streamed (as NDJSON) from the turn endpoint to the client. */
export type RunEvent =
  | { type: "run"; runId: string }
  | { type: "message"; message: MessageDTO }
  | { type: "typing"; agentId: string }
  | { type: "start"; id: string; agentId: string; createdAt: string }
  | { type: "delta"; id: string; text: string }
  | { type: "end"; message: MessageDTO }
  | { type: "discard"; id: string }
  | { type: "status"; label: StatusKey | null }
  | { type: "decisions"; decisions: DecisionDTO[] }
  | { type: "repo"; label: string; url: string }
  | { type: "error"; error: string }
  | { type: "done" };

export type TurnInput =
  | { kind: "message"; content: string }
  | { kind: "answers"; requestMessageId: string; answers: DecisionAnswer[] };
