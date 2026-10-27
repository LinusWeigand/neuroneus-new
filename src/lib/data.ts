import "server-only";
import { and, asc, desc, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { DecisionRow, MessageRow, ProjectRow } from "@/lib/db/schema";
import type { DecisionDTO, MessageDTO, ProjectDTO } from "@/lib/types";

const { projects, messages, decisions } = schema;

/** A run older than this is considered dead (crashed function) and its lock can be taken over. */
const STALE_RUN_MS = 6 * 60 * 1000;

export function isRunning(p: Pick<ProjectRow, "runId" | "runStartedAt">) {
  return Boolean(p.runId && p.runStartedAt && Date.now() - p.runStartedAt.getTime() < STALE_RUN_MS);
}

export function toProjectDTO(p: ProjectRow): ProjectDTO {
  return {
    id: p.id,
    name: p.name,
    vision: p.vision,
    agentIds: p.agentIds,
    repoFullName: p.repoFullName,
    repoUrl: p.repoUrl,
    repoError: p.repoError,
    appUrl: p.appUrl,
    hasDatabase: Boolean(p.neonProjectId),
    builderModel: p.builderModel,
    spec: p.spec ?? null,
    designSlug: p.designSlug,
    infraError: p.infraError,
    running: isRunning(p),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export function toMessageDTO(m: MessageRow): MessageDTO {
  return {
    id: m.id,
    seq: m.seq,
    authorType: m.authorType,
    agentId: m.agentId,
    kind: m.kind,
    content: m.content,
    data: m.data ?? null,
    createdAt: m.createdAt.toISOString(),
  };
}

export function toDecisionDTO(d: DecisionRow): DecisionDTO {
  return {
    id: d.id,
    header: d.header,
    question: d.question,
    choice: d.choice,
    isCustom: d.isCustom,
    wasRecommended: d.wasRecommended,
    createdAt: d.createdAt.toISOString(),
  };
}

export async function listProjects() {
  const rows = await db.select().from(projects).orderBy(desc(projects.updatedAt)).limit(100);
  return rows.map(toProjectDTO);
}

export async function getProject(id: string) {
  if (!isUuid(id)) return null;
  const [row] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  return row ?? null;
}

/**
 * What changed since a poller's last sync: messages added after `afterSeq`, messages updated
 * since `since` (a card got answered), and decisions made since `since`. Pollers ask for this
 * instead of the whole conversation every two seconds.
 */
export async function getChanges(projectId: string, afterSeq: number, since: Date) {
  const [changed, newDecisions] = await Promise.all([
    db
      .select()
      .from(messages)
      .where(and(eq(messages.projectId, projectId), or(gt(messages.seq, afterSeq), gt(messages.updatedAt, since))))
      .orderBy(asc(messages.seq))
      .limit(200),
    db
      .select()
      .from(decisions)
      .where(and(eq(decisions.projectId, projectId), gt(decisions.createdAt, since)))
      .orderBy(asc(decisions.createdAt)),
  ]);
  return { messages: changed.map(toMessageDTO), decisions: newDecisions.map(toDecisionDTO) };
}

export async function getMessages(projectId: string, limit = 400) {
  // Latest `limit` messages, returned oldest first.
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.projectId, projectId))
    .orderBy(desc(messages.seq))
    .limit(limit);
  return rows.reverse().map(toMessageDTO);
}

export async function getDecisions(projectId: string) {
  const rows = await db
    .select()
    .from(decisions)
    .where(eq(decisions.projectId, projectId))
    .orderBy(asc(decisions.createdAt));
  return rows.map(toDecisionDTO);
}

/** Atomically takes the project's run lock. Returns false if another discussion is in progress. */
export async function acquireRunLock(projectId: string, runId: string) {
  const staleBefore = new Date(Date.now() - STALE_RUN_MS);
  const rows = await db
    .update(projects)
    .set({ runId, runStartedAt: new Date(), cancelRequested: false, updatedAt: new Date() })
    .where(
      and(eq(projects.id, projectId), or(isNull(projects.runId), lt(projects.runStartedAt, staleBefore))),
    )
    .returning({ id: projects.id });
  return rows.length > 0;
}

export async function releaseRunLock(projectId: string, runId: string) {
  await db
    .update(projects)
    .set({ runId: null, runStartedAt: null, cancelRequested: false, updatedAt: new Date() })
    .where(and(eq(projects.id, projectId), eq(projects.runId, runId)));
}

export async function isCancelRequested(projectId: string, runId: string) {
  const [row] = await db
    .select({ cancel: projects.cancelRequested, runId: projects.runId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  // If the lock was taken over or released, this run must stop too.
  return !row || row.cancel || row.runId !== runId;
}

export async function requestCancel(projectId: string) {
  await db
    .update(projects)
    .set({ cancelRequested: true })
    .where(and(eq(projects.id, projectId), sql`${projects.runId} is not null`));
}

export function isUuid(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

/** The newest message sequence number, so pollers know when to fetch the conversation. */
export async function lastMessageSeq(projectId: string) {
  const [row] = await db
    .select({ seq: messages.seq })
    .from(messages)
    .where(eq(messages.projectId, projectId))
    .orderBy(desc(messages.seq))
    .limit(1);
  return row?.seq ?? 0;
}
