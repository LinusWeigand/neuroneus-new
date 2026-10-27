import "server-only";
import { createHmac } from "node:crypto";
import type { ModelMessage } from "ai";
import { and, asc, desc, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { AGENT_BY_ID, builderAgentFor, resolveAgents } from "@/lib/agents";
import { builderModelId } from "@/lib/ai";
import { getDecisions, getMessages, toMessageDTO } from "@/lib/data";
import { db, schema } from "@/lib/db";
import type { BuildRow, ProjectRow } from "@/lib/db/schema";
import { formatTranscript } from "@/lib/engine/prompts";
import type { BuildActivity, BuildDTO, BuildEventDTO, BuildEventKind, BuildNoteData, BuildStatus, BuildTask } from "@/lib/types";
import { recordUsage, roundTokenBudget } from "@/lib/usage";
import { type BuildContext, type BuilderReport, runBuilder } from "./agent";
import { clearBlobs, loadBlob, saveBlobs } from "./blobs";
import { isArtSlug } from "@/lib/design/art";
import { designName } from "@/lib/design/catalog";
import { DICTIONARIES } from "@/lib/i18n/dictionaries";
import { specComplete, specText } from "@/lib/spec/templates";
import { AGENT_AUTHOR, ensureInfra, neonOf, prepareApp, vercelOf } from "./infra";
import { humanLanguage } from "./language";
import { applySchema } from "./neon";
import { planRound } from "./planner";
import { commitChanges, type FileMap, readRepo } from "./repo";
import { buildErrors, deploy, getDeployment, latestLogLines, productionUrl } from "./vercel";

// A build round is a state machine advanced one short step at a time:
//
//   queued → setup → planning → building (implement → deploy, per task) → done
//                                          ↘ fix → deploy (up to MAX_FIXES), else roll back
//
// Each step runs in its own function invocation (well under the 300 s limit), holds a lease
// so only one step runs at a time, and kicks off the next step over HTTP. If a chain dies,
// the watchdog (polled by open workspaces) resumes it from the saved state.
//
// A task that needs longer than one step pauses at a model-step boundary, saves the agent's
// conversation and files, and continues in the next step (up to MAX_AGENT_TURNS).
//
// Everything that happens is reported live: `activity` (the "now" line, ~1/s) and
// build_events (the log), so the UI never sits still.
//
// One agent writes all the code. Each round has a token budget; when it runs out, the round
// ends after the current task. Large state (source snapshots, the builder's conversation)
// lives in build_blobs and is loaded only by the step that needs it.

const ACTIVE: BuildStatus[] = ["queued", "setup", "planning", "building"];
const LEASE_MS = 310_000; // longer than a step can live (maxDuration 300 s)
const AGENT_SOFT_MS = 185_000; // stop starting new model steps after this
const AGENT_HARD_MS = 262_000; // abort a model step that runs past this
const MAX_AGENT_TURNS = 3;
const DEPLOY_POLL_MS = 200_000;
const MAX_FIXES = 2;
const MAX_STEP_ERRORS = 3;
const DONE: BuildStatus[] = ["done", "failed", "cancelled"];

type TaskInProgress = { history: ModelMessage[]; files: FileMap };

const SPEC_LABELS = Object.fromEntries(Object.entries(DICTIONARIES.en.spec.items).map(([k, v]) => [k, v.label]));

// ─── Public API ─────────────────────────────────────────────────────────────

export function internalSecret() {
  const base = process.env.APP_PASSWORD || process.env.AZURE_API_KEY || "neuroneus-dev";
  return createHmac("sha256", base).update("neuroneus-internal-v1").digest("hex");
}

/** Where steps call back to. Prefer the stable production domain (never behind Vercel auth). */
export function selfOrigin(request: Request) {
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return prod ? `https://${prod}` : new URL(request.url).origin;
}

/**
 * Starts a build round, or queues one if a round is already running (it starts when the
 * current one ends). `setup` rounds only provision and deploy the starter app.
 */
export async function startBuild(projectId: string, kind: "setup" | "build", origin: string) {
  if (kind === "build") {
    // Never develop before the spec is complete.
    const [p] = await db.select({ spec: schema.projects.spec }).from(schema.projects).where(eq(schema.projects.id, projectId));
    if (!specComplete(p?.spec ?? null)) return null;
  }
  const active = await activeBuild(projectId);
  if (active) {
    if (kind === "build") {
      await db.update(schema.projects).set({ buildRequested: true }).where(eq(schema.projects.id, projectId));
    }
    return null;
  }
  const [{ max }] = await db
    .select({ max: sql<number | null>`max(${schema.builds.round})` })
    .from(schema.builds)
    .where(eq(schema.builds.projectId, projectId));
  const round = kind === "setup" ? 0 : Math.max(1, (max ?? 0) + 1);
  const [build] = await db
    .insert(schema.builds)
    .values({ projectId, round, kind, origin, phaseStartedAt: new Date() })
    .returning();
  await db.update(schema.projects).set({ buildRequested: false }).where(eq(schema.projects.id, projectId));
  await kick(build.id, origin);
  return build;
}

export async function cancelBuild(projectId: string) {
  const cancelled = await db
    .update(schema.builds)
    .set({ status: "cancelled", activity: null, finishedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(schema.builds.projectId, projectId), inArray(schema.builds.status, ACTIVE)))
    .returning({ id: schema.builds.id });
  await db.update(schema.projects).set({ buildRequested: false }).where(eq(schema.projects.id, projectId));
  await clearBlobs(cancelled.map((b) => b.id));
}

// Database traffic is metered (a full build row per poll once used up the monthly quota in
// hours). Hot paths (polling, the watchdog) select only what they show; the heavy state is
// in build_blobs.
const LIGHT = {
  id: schema.builds.id,
  round: schema.builds.round,
  kind: schema.builds.kind,
  status: schema.builds.status,
  phase: schema.builds.phase,
  taskIndex: schema.builds.taskIndex,
  tasks: schema.builds.tasks,
  error: schema.builds.error,
  activity: schema.builds.activity,
  phaseStartedAt: schema.builds.phaseStartedAt,
  tokens: schema.builds.tokens,
  leaseUntil: schema.builds.leaseUntil,
  origin: schema.builds.origin,
  createdAt: schema.builds.createdAt,
  updatedAt: schema.builds.updatedAt,
};
type LightBuild = { [K in keyof typeof LIGHT]: BuildRow[K] };

export async function activeBuild(projectId: string): Promise<LightBuild | null> {
  const [row] = await db
    .select(LIGHT)
    .from(schema.builds)
    .where(and(eq(schema.builds.projectId, projectId), inArray(schema.builds.status, ACTIVE)))
    .orderBy(desc(schema.builds.createdAt))
    .limit(1);
  return row ?? null;
}

export async function latestBuild(projectId: string): Promise<BuildDTO | null> {
  const row = await latestBuildRow(projectId);
  return row ? toBuildDTO(row) : null;
}

async function latestBuildRow(projectId: string): Promise<LightBuild | null> {
  const [row] = await db
    .select(LIGHT)
    .from(schema.builds)
    .where(eq(schema.builds.projectId, projectId))
    .orderBy(desc(schema.builds.createdAt))
    .limit(1);
  return row ?? null;
}

/** The latest build for pollers, resuming its chain first if it stalled (one query either way). */
export async function watchBuild(projectId: string, origin: string): Promise<BuildDTO | null> {
  const row = await latestBuildRow(projectId);
  if (row && ACTIVE.includes(row.status)) await resume(row, origin).catch((err) => console.error("[build] resume failed", err));
  return row ? toBuildDTO(row) : null;
}

export function toBuildDTO(b: LightBuild): BuildDTO {
  return {
    id: b.id,
    round: b.round,
    kind: b.kind,
    status: b.status,
    phase: b.phase ?? null,
    taskIndex: b.taskIndex,
    // The implementation brief stays server-side; the client shows titles and status only.
    tasks: b.tasks.map((t) => ({ id: t.id, title: t.title, agentId: t.agentId, status: t.status, summary: t.summary })),
    error: b.error,
    activity: ACTIVE.includes(b.status) ? (b.activity ?? null) : null,
    phaseStartedAt: b.phaseStartedAt?.toISOString() ?? null,
    tokens: b.tokens,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  };
}

/** The activity log of a build, oldest first. `after` returns only newer entries. */
export async function buildEvents(buildId: string, after = 0, limit = 40): Promise<BuildEventDTO[]> {
  const rows = after
    ? await db
        .select()
        .from(schema.buildEvents)
        .where(and(eq(schema.buildEvents.buildId, buildId), gt(schema.buildEvents.id, after)))
        .orderBy(asc(schema.buildEvents.id))
        .limit(limit)
    : (
        await db
          .select()
          .from(schema.buildEvents)
          .where(eq(schema.buildEvents.buildId, buildId))
          .orderBy(desc(schema.buildEvents.id))
          .limit(limit)
      ).reverse();
  return rows.map((e) => ({
    id: e.id,
    taskIndex: e.taskIndex,
    agentId: e.agentId,
    kind: e.kind,
    path: e.path,
    detail: e.detail,
    createdAt: e.createdAt.toISOString(),
  }));
}

/** Restarts a chain whose step died (crash, timeout, lost kick). Cheap; safe to call often. */
async function resume(b: LightBuild, origin: string) {
  const idle = !b.leaseUntil || b.leaseUntil.getTime() < Date.now();
  if (idle && Date.now() - b.updatedAt.getTime() > 25_000) {
    await db.update(schema.builds).set({ updatedAt: new Date() }).where(eq(schema.builds.id, b.id));
    await kick(b.id, b.origin || origin);
  }
}

/** Runs one step of a build, then schedules the next. Called by the internal step route. */
export async function runStep(buildId: string) {
  const build = await acquireLease(buildId);
  if (!build) return;

  let more = false;
  try {
    more = await advance(build);
    await patch(build.id, { stepErrors: 0 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[build] step failed (${build.status}/${build.phase ?? "-"})`, err);
    const errors = build.stepErrors + 1;
    if (errors >= MAX_STEP_ERRORS) {
      await failBuild(build, message);
    } else {
      await patch(build.id, { stepErrors: errors });
      more = true;
    }
  } finally {
    await db.update(schema.builds).set({ leaseUntil: null }).where(eq(schema.builds.id, build.id));
  }

  const origin = build.origin ?? "";
  if (more) {
    await kick(build.id, origin);
  } else {
    const [after] = await db.select({ status: schema.builds.status }).from(schema.builds).where(eq(schema.builds.id, build.id));
    if (!after || DONE.includes(after.status)) await clearBlobs(build.id);
    const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, build.projectId));
    if (project?.buildRequested) await startBuild(project.id, "build", origin);
  }
}

// ─── Steps ──────────────────────────────────────────────────────────────────

async function advance(build: BuildRow): Promise<boolean> {
  const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, build.projectId));
  if (!project) return false;

  switch (build.status) {
    case "queued":
      await transition(build.id, { status: "setup" });
      return true;

    case "setup": {
      const onStage = (stage: string) => setActivity(build.id, { kind: "setup", stage });
      try {
        if (build.kind === "setup") {
          // Right after creation: hosting and a placeholder, no database yet (the spec decides).
          const p = await ensureInfra(project, onStage);
          const files = await readRepo(p.repoFullName!);
          await saveBlobs(build.id, { files, good: files });
          await transition(build.id, { status: "building", phase: "deploy", tasks: [] });
        } else {
          // Spec complete: database if needed, design system, spec and conventions in the repo.
          const { files, artRefreshed } = await prepareApp(project, { projectId: project.id, buildId: build.id }, onStage);
          await saveBlobs(build.id, { files, good: files, ...(artRefreshed ? { art: true } : {}) });
          await transition(build.id, { status: "planning" });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await db.update(schema.projects).set({ infraError: message.slice(0, 500) }).where(eq(schema.projects.id, project.id));
        throw err;
      }
      return true;
    }

    case "planning": {
      await setActivity(build.id, { kind: "planning" });
      const ctx = await buildContext(project);
      const transcript = formatTranscript(await getMessages(project.id, 40), 10_000);
      const planned = await planRound({
        scope: { projectId: project.id, buildId: build.id },
        ctx,
        builder: builderAgentFor(resolveAgents(project.agentIds)),
        files: (await loadBlob<FileMap>(build.id, "files")) ?? {},
        transcript,
        round: build.round,
        artRefresh: Boolean(await loadBlob<boolean>(build.id, "art")),
      });
      if (planned.length === 0) {
        await transition(build.id, { status: "done", finishedAt: new Date() });
        return false;
      }
      const tasks: BuildTask[] = planned.map((t, i) => ({ id: `t${i + 1}`, ...t, status: "pending" }));
      await transition(build.id, { status: "building", phase: "implement", taskIndex: 0, tasks });
      await logEvent(build.id, { kind: "planned", detail: String(tasks.length) });
      await note(project.id, `Building round ${build.round}: ${tasks.map((t) => t.title).join(", ")}`, {
        type: "build_started",
        round: build.round,
        steps: tasks.map((t) => t.title),
      });
      return true;
    }

    case "building":
      if (build.phase === "deploy") return deployStep(build, project);
      return implementStep(build, project);

    default:
      return false;
  }
}

async function implementStep(build: BuildRow, project: ProjectRow): Promise<boolean> {
  const task = build.tasks[build.taskIndex];
  if (!task) {
    await finishRound(build, project);
    return false;
  }
  // Out of budget: no new task starts. (A task in progress or being fixed may finish.)
  if (build.phase === "implement" && build.agentTurns === 0 && build.tokens >= roundTokenBudget()) {
    const tasks = build.tasks.map((t, i) => (i >= build.taskIndex && t.status === "pending" ? { ...t, status: "skipped" as const } : t));
    await patch(build.id, { tasks, phase: null });
    await finishRound({ ...build, tasks }, project, { budget: true });
    return false;
  }
  const agent = AGENT_BY_ID[task.agentId] ?? builderAgentFor(resolveAgents(project.agentIds));
  const tasks = withTask(build.tasks, build.taskIndex, { status: "working" });
  await patch(build.id, { tasks });

  // `files` is what's committed; a task in progress keeps its own copy until it finishes.
  const committed = (await loadBlob<FileMap>(build.id, "files")) ?? {};
  const inProgress = build.agentTurns > 0 ? await loadBlob<TaskInProgress>(build.id, "task") : null;
  const fixing = build.phase === "fix";
  const model = builderModelId(project.builderModel, { fixing, game: isArtSlug(project.designSlug) });
  const report = liveReporter(build, agent.id);
  const started = Date.now();

  const result = await runBuilder({
    agent,
    ctx: await buildContext(project),
    task,
    files: inProgress?.files ?? committed,
    fixLog: fixing ? build.lastError : null,
    model,
    reasoning: fixing ? "medium" : "low",
    history: inProgress?.history ?? null,
    softDeadline: started + AGENT_SOFT_MS,
    hardDeadline: started + AGENT_HARD_MS,
    cacheKey: `build-${build.id}`,
    report,
  });
  await report.done();
  await recordUsage({ projectId: project.id, buildId: build.id }, "build", model, result.usage);

  if (!result.finished && build.agentTurns + 1 < MAX_AGENT_TURNS) {
    // Out of time for this step: save the conversation and files, and pick up in the next step.
    await saveBlobs(build.id, { task: { history: result.history, files: result.files } satisfies TaskInProgress });
    await patch(build.id, { agentTurns: build.agentTurns + 1 });
    await logEvent(build.id, { kind: "continued", agentId: agent.id, taskIndex: build.taskIndex });
    return true;
  }

  await commitChanges(
    project.repoFullName!,
    committed,
    result.files,
    fixing ? `Fix build: ${task.title}` : task.title,
    AGENT_AUTHOR(agent.name),
  );
  await saveBlobs(build.id, { files: result.files, task: null });
  await transition(build.id, {
    phase: "deploy",
    deploymentId: null,
    agentTurns: 0,
    tasks: withTask(tasks, build.taskIndex, result.summary ? { summary: result.summary } : {}),
  });
  return true;
}

async function deployStep(build: BuildRow, project: ProjectRow): Promise<boolean> {
  const vercel = vercelOf(project);
  const neon = neonOf(project);
  if (!vercel) throw new Error("The app's hosting is missing.");
  const agentId = build.tasks[build.taskIndex]?.agentId;

  let deploymentId = build.deploymentId;
  if (!deploymentId) {
    // Only a new deployment needs the source; polling steps never load it.
    const files = (await loadBlob<FileMap>(build.id, "files")) ?? {};
    if (neon) {
      await setActivity(build.id, { kind: "schema", agentId });
      try {
        await applySchema(neon, files["db/schema.sql"] ?? "");
      } catch (err) {
        return buildFailed(build, project, `Applying db/schema.sql failed: ${err instanceof Error ? err.message : err}`);
      }
    }
    const d = await deploy(vercel, files);
    deploymentId = d.id;
    await patch(build.id, { deploymentId });
    await logEvent(build.id, { kind: "deploy_started", agentId, taskIndex: build.taskIndex });
  }

  const started = Date.now();
  let stage = "";
  let d = await getDeployment(deploymentId);
  while (!["READY", "ERROR", "CANCELED"].includes(d.readyState) && Date.now() - started < DEPLOY_POLL_MS) {
    // Translate Vercel's build log into a handful of stages people understand.
    const next = deployStage(d.readyState, await latestLogLines(deploymentId).catch(() => []));
    if (next !== stage) {
      stage = next;
      await setActivity(build.id, { kind: "deploying", stage, agentId });
    }
    await new Promise((r) => setTimeout(r, 3000));
    d = await getDeployment(deploymentId);
  }
  if (d.readyState === "READY") {
    await logEvent(build.id, { kind: "deploy_ready", agentId, taskIndex: build.taskIndex });
    return deployed(build, project);
  }
  if (d.readyState === "ERROR" || d.readyState === "CANCELED") {
    await logEvent(build.id, { kind: "deploy_failed", agentId, taskIndex: build.taskIndex });
    const log = await buildErrors(deploymentId);
    return buildFailed(build, project, log || d.errorMessage || "The build failed without output.");
  }
  return true; // still building: the next step keeps polling
}

function deployStage(state: string, newestFirst: string[]) {
  if (state === "QUEUED") return "queued";
  if (state === "INITIALIZING") return "starting";
  const log = newestFirst.join("\n");
  if (/Deploying outputs|Build Completed|Uploading build outputs|Deployment completed/i.test(log)) return "publishing";
  if (/Collecting page data|Generating static pages|Finalizing page optimization|Collecting build traces/i.test(log)) return "pages";
  if (/Running TypeScript|Checking validity of types|Linting|Compiled successfully|Finished TypeScript/i.test(log)) return "checking";
  if (/Creating an optimized production build|next build|Compiling|Running "build"/i.test(log)) return "compiling";
  if (/Installing dependencies|npm install|added \d+ packages|Running "install"|Downloading/i.test(log)) return "installing";
  return "starting";
}

async function deployed(build: BuildRow, project: ProjectRow): Promise<boolean> {
  if (!project.appUrl && project.vercelProjectId) {
    const url = await productionUrl(project.vercelProjectId);
    await db.update(schema.projects).set({ appUrl: url }).where(eq(schema.projects.id, project.id));
  }
  if (build.kind === "setup") {
    await transition(build.id, { status: "done", phase: null, finishedAt: new Date() });
    return false;
  }
  // This version deployed: it's what a later task rolls back to.
  const files = await loadBlob<FileMap>(build.id, "files");
  if (files) await saveBlobs(build.id, { good: files });

  const task = build.tasks[build.taskIndex];
  const tasks = withTask(build.tasks, build.taskIndex, { status: "done" });
  if (task) {
    await message(project.id, task.agentId, task.summary || task.title);
  }
  const next = build.taskIndex + 1;
  if (next < tasks.length) {
    await transition(build.id, {
      tasks,
      taskIndex: next,
      phase: "implement",
      fixAttempts: 0,
      lastError: null,
      deploymentId: null,
    });
    return true;
  }
  await patch(build.id, { tasks, phase: null, deploymentId: null });
  await finishRound({ ...build, tasks }, project);
  return false;
}

async function buildFailed(build: BuildRow, project: ProjectRow, log: string): Promise<boolean> {
  if (build.kind === "setup") {
    await failBuild(build, `The starter app failed to deploy:\n${log.slice(0, 600)}`);
    return false;
  }
  if (build.fixAttempts < MAX_FIXES) {
    await transition(build.id, { phase: "fix", fixAttempts: build.fixAttempts + 1, lastError: log, deploymentId: null });
    return true;
  }

  // Couldn't fix it: put the repository back to the last version that deployed, and move on.
  const task = build.tasks[build.taskIndex];
  const [current, good] = await Promise.all([loadBlob<FileMap>(build.id, "files"), loadBlob<FileMap>(build.id, "good")]);
  if (!current || !good) throw new Error("The build lost its source snapshot; can't roll back.");
  await commitChanges(
    project.repoFullName!,
    current,
    good,
    `Roll back: ${task?.title ?? "task"}`,
    AGENT_AUTHOR("Neuroneus"),
  );
  await saveBlobs(build.id, { files: good });
  await logEvent(build.id, { kind: "rolled_back", agentId: task?.agentId, taskIndex: build.taskIndex });
  const tasks = withTask(build.tasks, build.taskIndex, { status: "failed" });
  if (task) {
    await note(project.id, `Rolled back "${task.title}": it didn't build.`, {
      type: "task_rolled_back",
      round: build.round,
      title: task.title,
    });
  }
  const next = build.taskIndex + 1;
  if (next < tasks.length) {
    await transition(build.id, {
      tasks,
      taskIndex: next,
      phase: "implement",
      fixAttempts: 0,
      lastError: null,
      deploymentId: null,
    });
    return true;
  }
  await patch(build.id, { tasks, phase: null, deploymentId: null });
  await finishRound({ ...build, tasks }, project);
  return false;
}

async function finishRound(build: BuildRow, project: ProjectRow, opts: { budget?: boolean } = {}) {
  await transition(build.id, { status: "done", finishedAt: new Date() });
  if (build.kind === "setup") return;
  const done = build.tasks.filter((t) => t.status === "done").length;
  const [fresh] = await db.select({ appUrl: schema.projects.appUrl }).from(schema.projects).where(eq(schema.projects.id, project.id));
  await note(
    project.id,
    `Round ${build.round} shipped: ${done} of ${build.tasks.length} steps live.${opts.budget ? " Stopped early: the round's token budget is used up." : ""}`,
    {
      type: "build_done",
      round: build.round,
      done,
      total: build.tasks.length,
      url: fresh?.appUrl ?? null,
      ...(opts.budget ? { budget: true } : {}),
    },
  );
}

async function failBuild(build: BuildRow, reason: string) {
  await transition(build.id, { status: "failed", error: reason.slice(0, 2000), finishedAt: new Date() });
  await note(build.projectId, `Build round ${build.round} stopped: ${reason.slice(0, 300)}`, {
    type: "build_failed",
    round: build.round,
    reason: reason.slice(0, 300),
  });
}

// ─── Live progress ──────────────────────────────────────────────────────────

/**
 * Bridges the builder's (very chatty) stream to the database: the "now" line is written
 * at most about once a second, log events as they happen, all in order.
 */
function liveReporter(build: BuildRow, agentId: string): BuilderReport & { done: () => Promise<void> } {
  let chain: Promise<unknown> = Promise.resolve();
  let current: BuildActivity | null = null;
  let pending: BuildActivity | null = null;
  let lastWrite = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    timer = null;
    if (!pending) return;
    const a = pending;
    pending = null;
    lastWrite = Date.now();
    chain = chain.then(() => setActivity(build.id, a)).catch(() => {});
  };

  return {
    activity(a) {
      // Keep the start time while the agent stays on the same thing, so timers don't reset.
      const same = current && current.kind === a.kind && (current.path ?? "") === (a.path ?? "");
      current = { ...a, agentId, since: same && current ? current.since : new Date().toISOString() };
      pending = current;
      const wait = 1000 - (Date.now() - lastWrite);
      if (wait <= 0) flush();
      else timer ??= setTimeout(flush, wait);
    },
    event(e) {
      chain = chain.then(() => logEvent(build.id, { ...e, agentId, taskIndex: build.taskIndex })).catch(() => {});
    },
    async done() {
      if (timer) clearTimeout(timer);
      flush();
      await chain;
    },
  };
}

async function setActivity(buildId: string, a: Omit<BuildActivity, "since"> & { since?: string }) {
  await db
    .update(schema.builds)
    .set({ activity: { ...a, since: a.since ?? new Date().toISOString() } })
    .where(eq(schema.builds.id, buildId));
}

async function logEvent(
  buildId: string,
  e: { kind: BuildEventKind; agentId?: string; taskIndex?: number; path?: string; detail?: string },
) {
  await db.insert(schema.buildEvents).values({
    buildId,
    kind: e.kind,
    agentId: e.agentId ?? null,
    taskIndex: e.taskIndex ?? null,
    path: e.path ?? null,
    detail: e.detail ?? null,
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function buildContext(project: ProjectRow): Promise<BuildContext> {
  const [decisions, done, recent] = await Promise.all([
    getDecisions(project.id),
    db.select({ tasks: schema.builds.tasks }).from(schema.builds).where(eq(schema.builds.projectId, project.id)),
    getMessages(project.id, 30),
  ]);
  const shipped = done.flatMap((b) => b.tasks.filter((t) => t.status === "done").map((t) => t.summary || t.title));
  const human = recent
    .filter((m) => m.authorType === "user" && m.kind === "chat")
    .map((m) => m.content)
    .reverse();
  return {
    name: project.name,
    vision: project.vision,
    kind: project.spec?.kind ?? "web_app",
    spec: project.spec ? specText(project.spec, SPEC_LABELS) : "",
    designName: project.designSlug ? designName(project.designSlug) : null,
    kit: project.spec?.kind === "web_game" && isArtSlug(project.designSlug) ? (project.spec.render ?? "2d") : null,
    database: Boolean(project.neonProjectId),
    decisions: decisions.map((d) => ({ header: d.header, choice: d.choice })),
    shipped,
    language: humanLanguage([...human, project.vision]),
  };
}

function withTask(tasks: BuildTask[], index: number, change: Partial<BuildTask>) {
  return tasks.map((t, i) => (i === index ? { ...t, ...change } : t));
}

async function patch(id: string, values: Partial<typeof schema.builds.$inferInsert>) {
  await db
    .update(schema.builds)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(schema.builds.id, id));
}

/** A patch that moves the build to a new phase: restarts the step timer and clears the "now" line. */
async function transition(id: string, values: Partial<typeof schema.builds.$inferInsert>) {
  await patch(id, { ...values, phaseStartedAt: new Date(), activity: null });
}

async function acquireLease(buildId: string) {
  const [row] = await db
    .update(schema.builds)
    .set({ leaseUntil: new Date(Date.now() + LEASE_MS), updatedAt: new Date() })
    .where(
      and(
        eq(schema.builds.id, buildId),
        inArray(schema.builds.status, ACTIVE),
        or(isNull(schema.builds.leaseUntil), lt(schema.builds.leaseUntil, new Date())),
      ),
    )
    .returning();
  return row ?? null;
}

async function kick(buildId: string, origin: string) {
  try {
    const res = await fetch(`${origin}/api/internal/build-step`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-neuroneus-internal": internalSecret() },
      body: JSON.stringify({ buildId }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) console.error(`[build] kick returned ${res.status}`);
  } catch (err) {
    // The watchdog picks the chain up again.
    console.error("[build] kick failed", err);
  }
}

async function message(projectId: string, agentId: string, content: string) {
  await db.insert(schema.messages).values({ projectId, authorType: "agent", agentId, kind: "chat", content });
}

async function note(projectId: string, content: string, data: BuildNoteData) {
  const [row] = await db
    .insert(schema.messages)
    .values({ projectId, authorType: "moderator", kind: "note", content, data })
    .returning();
  return toMessageDTO(row);
}
