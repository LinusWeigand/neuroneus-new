import "server-only";
import type { LanguageModelUsage } from "ai";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { UsagePurpose, UsageSummary } from "@/lib/types";

// Every model call is recorded, so cost has a source: which project, what for, which model.
// Build calls also count against their round's token budget (builds.tokens).

const CHAT_PURPOSES: UsagePurpose[] = ["chat", "huddle_plan", "card", "spec"];

export type UsageScope = { projectId: string; buildId?: string | null };

export async function recordUsage(
  scope: UsageScope,
  purpose: UsagePurpose,
  model: string,
  usage: LanguageModelUsage | undefined,
) {
  if (!usage) return;
  const input = usage.inputTokens ?? 0;
  const output = usage.outputTokens ?? 0;
  if (!input && !output) return;
  try {
    await db.insert(schema.aiUsage).values({
      projectId: scope.projectId,
      buildId: scope.buildId ?? null,
      purpose,
      model,
      inputTokens: input,
      cachedTokens: usage.inputTokenDetails?.cacheReadTokens ?? 0,
      outputTokens: output,
      reasoningTokens: usage.outputTokenDetails?.reasoningTokens ?? 0,
    });
    if (scope.buildId) {
      await db
        .update(schema.builds)
        .set({ tokens: sql`${schema.builds.tokens} + ${input + output}` })
        .where(eq(schema.builds.id, scope.buildId));
    }
  } catch (err) {
    // Accounting must never break a discussion or a build.
    console.error("[usage] failed to record", err);
  }
}

/** The most tokens one build round may use; it stops after the current task when it runs out. */
export function roundTokenBudget() {
  const n = Number(process.env.BUILD_ROUND_TOKEN_BUDGET);
  return Number.isFinite(n) && n > 0 ? n : 6_000_000;
}

export async function projectUsage(projectId: string): Promise<UsageSummary> {
  const [byPurpose, rounds] = await Promise.all([
    db
      .select({
        purpose: schema.aiUsage.purpose,
        input: sql<number>`coalesce(sum(${schema.aiUsage.inputTokens}), 0)::int`,
        cached: sql<number>`coalesce(sum(${schema.aiUsage.cachedTokens}), 0)::int`,
        output: sql<number>`coalesce(sum(${schema.aiUsage.outputTokens}), 0)::int`,
        calls: sql<number>`count(*)::int`,
      })
      .from(schema.aiUsage)
      .where(eq(schema.aiUsage.projectId, projectId))
      .groupBy(schema.aiUsage.purpose),
    db
      .select({ round: schema.builds.round, tokens: schema.builds.tokens, createdAt: schema.builds.createdAt })
      .from(schema.builds)
      .where(and(eq(schema.builds.projectId, projectId), sql`${schema.builds.tokens} > 0`))
      .orderBy(desc(schema.builds.createdAt))
      .limit(12),
  ]);
  const summary: UsageSummary = {
    chat: { input: 0, cached: 0, output: 0, calls: 0 },
    build: { input: 0, cached: 0, output: 0, calls: 0 },
    rounds: rounds.map((r) => ({ round: r.round, tokens: r.tokens, createdAt: r.createdAt.toISOString() })),
  };
  for (const row of byPurpose) {
    const bucket = CHAT_PURPOSES.includes(row.purpose) ? summary.chat : summary.build;
    bucket.input += row.input;
    bucket.cached += row.cached;
    bucket.output += row.output;
    bucket.calls += row.calls;
  }
  return summary;
}
