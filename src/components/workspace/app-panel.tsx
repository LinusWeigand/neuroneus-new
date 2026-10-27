"use client";

import { useEffect, useState } from "react";
import { AgentAvatarById } from "@/components/agent-avatar";
import { TypingDots } from "@/components/chat/message-list";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { CheckIcon, CloseIcon, RefreshIcon, StopIcon } from "@/components/ui/icons";
import { OrbField } from "@/components/ui/orb";
import { ActivityFeed, activityText, elapsed, LiveLine, RoundProgress, useNow } from "@/components/workspace/live-activity";
import { isBuildActive } from "@/components/workspace/use-project-chat";
import { compactNumber, type Dictionary } from "@/lib/i18n/dictionaries";
import { modelLabel, type ModelOption } from "@/lib/models";
import { openSpecPoints, specComplete, specProgress } from "@/lib/spec/templates";
import type { BuildDTO, BuildEventDTO, ProjectDTO } from "@/lib/types";

type Tone = "active" | "live" | "failed" | "idle";

/** The models the builder can use, and what "auto" means: one model for tasks, a stronger one for fixes. */
export type ModelInfo = { models: ModelOption[]; defaultBuild: string; fixBuild: string };

export function buildStatus(t: Dictionary, project: ProjectDTO, build: BuildDTO | null): { label: string; tone: Tone } {
  if (build && isBuildActive(build)) {
    const task = build.tasks[build.taskIndex];
    if (build.status === "queued") return { label: t.app.status.queued, tone: "active" };
    if (build.status === "setup") return { label: t.app.status.setup, tone: "active" };
    if (build.status === "planning") return { label: t.app.status.planning, tone: "active" };
    if (build.kind === "setup" || !task) return { label: t.app.status.deploying, tone: "active" };
    if (build.phase === "fix") return { label: t.app.status.fixing(task.title), tone: "active" };
    if (build.phase === "deploy") return { label: `${t.app.status.deploying} · ${task.title}`, tone: "active" };
    return { label: t.app.status.building(build.taskIndex + 1, build.tasks.length, task.title), tone: "active" };
  }
  if (build?.status === "failed") return { label: t.app.status.failed, tone: "failed" };
  if (project.appUrl) return { label: t.app.status.live, tone: "live" };
  return { label: t.app.status.notSetUp, tone: "idle" };
}

export function StatusDot({ tone }: { tone: Tone }) {
  const color = { active: "bg-ink animate-pulse", live: "bg-success", failed: "bg-error", idle: "bg-muted-soft" }[tone];
  return <span className={`size-2 shrink-0 rounded-full ${color}`} aria-hidden />;
}

/** The model the builder is working with right now, as a label ("GPT-5.4 mini"). */
export function buildModelLabel(info: ModelInfo, project: ProjectDTO, fixing: boolean) {
  return modelLabel(project.builderModel ?? (fixing ? info.fixBuild : info.defaultBuild), info.models);
}

/** The live app next to the chat: status, an embedded preview, and the round's progress. */
export function AppPanel({
  project,
  build,
  events,
  infraReady,
  modelInfo,
  onBuild,
  onStop,
}: {
  project: ProjectDTO;
  build: BuildDTO | null;
  events: BuildEventDTO[];
  infraReady: boolean;
  modelInfo: ModelInfo;
  onBuild: () => Promise<void>;
  onStop: () => Promise<void>;
}) {
  const { t, locale } = useI18n();
  const [reloads, setReloads] = useState(0);
  const [busy, setBusy] = useState(false);
  const active = isBuildActive(build);
  const now = useNow(active);
  const status = buildStatus(t, project, build);
  const host = project.appUrl?.replace(/^https?:\/\//, "");
  const activity = build?.activity ?? null;
  const taskEvents = events.filter((e) => e.taskIndex === null || e.taskIndex === build?.taskIndex);
  const doneCount = build?.tasks.filter((x) => x.status === "done").length ?? 0;
  const shippedSomething = build?.kind === "build" && doneCount > 0;
  const ready = specComplete(project.spec);
  const progress = specProgress(project.spec);
  const openPoints = openSpecPoints(project.spec);

  // Reload the preview whenever another step goes live, and say so briefly.
  const frameKey = `${build?.id ?? "none"}:${doneCount}:${build?.status === "done" ? "done" : ""}:${reloads}`;
  const [prevDone, setPrevDone] = useState(doneCount);
  // Which step's "Updated" chip is showing (null when none).
  const [flash, setFlash] = useState<number | null>(null);
  if (doneCount !== prevDone) {
    setPrevDone(doneCount);
    if (doneCount > prevDone) setFlash(doneCount);
  }
  useEffect(() => {
    if (flash === null) return;
    const id = setTimeout(() => setFlash(null), 4000);
    return () => clearTimeout(id);
  }, [flash]);
  const updated = flash !== null;

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* status row */}
      <div className="flex h-12 shrink-0 items-center gap-2.5 border-b border-hairline px-4">
        <StatusDot tone={status.tone} />
        <span className="min-w-0 flex-1 truncate text-caption font-medium text-ink">{status.label}</span>
        {active && build?.phaseStartedAt && (
          <span className="shrink-0 text-caption tabular-nums text-muted">{elapsed(build.phaseStartedAt, now)}</span>
        )}
        {project.appUrl && (
          <>
            <button
              onClick={() => setReloads((n) => n + 1)}
              className="inline-flex size-8 items-center justify-center rounded-pill text-muted hover:bg-surface-strong hover:text-ink"
              aria-label={t.app.reload}
              title={t.app.reload}
            >
              <RefreshIcon size={15} />
            </button>
            <a
              href={project.appUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 max-w-[45%] items-center gap-1.5 truncate rounded-pill border border-hairline-strong px-3 text-caption font-medium text-ink transition-colors hover:border-ink"
              title={project.appUrl}
            >
              <span className="truncate">{host}</span>
              <span aria-hidden>↗</span>
              <span className="sr-only">{t.app.open}</span>
            </a>
          </>
        )}
      </div>

      {/* preview */}
      <div className="relative min-h-0 flex-1 bg-canvas-soft">
        {project.appUrl ? (
          <>
            <iframe
              key={frameKey}
              src={project.appUrl}
              title={t.app.previewLabel}
              className="absolute inset-0 h-full w-full border-0 bg-white"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
            />
            {/* While the team works, a quiet pill on the preview says what's happening. */}
            {active && activity && (
              <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-3">
                <div className="flex max-w-full animate-rise items-center gap-2 rounded-pill border border-hairline bg-surface-card/95 py-1.5 pl-1.5 pr-3 shadow-soft backdrop-blur-sm">
                  {activity.agentId && <AgentAvatarById id={activity.agentId} size={22} />}
                  <span className="truncate text-caption text-ink">{activityText(t, activity)}</span>
                  <TypingDots />
                </div>
              </div>
            )}
            {updated && (
              <div className="pointer-events-none absolute right-3 top-3 animate-rise">
                <span className="inline-flex items-center gap-1.5 rounded-pill bg-surface-dark px-3 py-1 text-caption text-on-dark shadow-soft">
                  <CheckIcon size={12} strokeWidth={2.4} />
                  {t.live.updated}
                </span>
              </div>
            )}
          </>
        ) : (
          <div className="relative flex h-full items-center justify-center overflow-hidden p-8">
            <OrbField variant="card" />
            <div className="relative w-full max-w-[360px] text-center">
              <h3 className="text-display-sm text-ink">{active ? t.app.waitingTitle : t.app.noAppTitle}</h3>
              <p className="mt-3 text-body-sm text-body">
                {!infraReady ? t.app.notConfigured : active ? t.app.waitingLead : t.app.noAppLead}
              </p>
              {project.infraError && !active && (
                <p className="mt-3 text-caption text-error">
                  {t.app.setupFailed} {project.infraError}
                </p>
              )}
              {active && activity && (
                <div className="mt-6 rounded-lg border border-hairline bg-surface-card/90 px-3 py-2.5 text-left">
                  <LiveLine activity={activity} now={now} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* round tray */}
      <div className="scroll-quiet max-h-[46%] shrink-0 overflow-y-auto border-t border-hairline bg-canvas px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="text-caption-upper text-muted">
              {build && build.kind === "build" ? `${t.app.round(build.round)} · ${doneCount}/${build.tasks.length || "…"}` : ""}
            </span>
            {build && build.kind === "build" && build.tokens > 0 && (
              <span className="truncate text-caption tabular-nums text-muted-soft">{t.usage.tokens(compactNumber(build.tokens, locale))}</span>
            )}
          </span>
          {infraReady &&
            (active ? (
              <Button variant="outline" size="sm" icon={<StopIcon size={12} />} disabled={busy} onClick={() => act(onStop)}>
                {t.app.stop}
              </Button>
            ) : (
              <Button size="sm" disabled={busy || !project.repoFullName || !ready} onClick={() => act(onBuild)}>
                {t.app.buildNow}
              </Button>
            ))}
        </div>

        {build && active && <div className="mt-3"><RoundProgress build={build} /></div>}

        {/* Nothing gets developed before the spec is complete: say what's still open. */}
        {!ready && !active && (
          <div className="mt-2">
            <p className="text-caption text-body">
              {project.spec?.kind ? t.spec.gate(progress.answered, progress.total) : t.spec.gateKind}
            </p>
            {openPoints.length > 0 && project.spec?.kind && (
              <p className="mt-1.5 text-caption text-muted">
                {t.spec.openPoints}: {openPoints.map((k) => t.spec.items[k]?.label ?? k).join(" · ")}
              </p>
            )}
          </div>
        )}

        {/* Setup and planning have no task yet: show the live line on its own. */}
        {active && activity && (!build?.tasks.length || build.kind === "setup") && project.appUrl && (
          <div className="mt-3">
            <LiveLine activity={activity} now={now} />
          </div>
        )}

        {build && build.kind === "build" && build.tasks.length > 0 ? (
          <ol className="mt-3 space-y-1">
            {build.tasks.map((task, i) => {
              const current = active && i === build.taskIndex;
              const working = task.status === "working" || (current && task.status === "pending");
              return (
                <li key={task.id} className={current ? "rounded-lg bg-surface-card px-2.5 py-2 -mx-2.5 border border-hairline" : "py-1"}>
                  <div className="flex items-center gap-2.5">
                    <AgentAvatarById id={task.agentId} size={22} />
                    <span className={`min-w-0 flex-1 truncate text-body-sm ${task.status === "done" || current ? "text-ink" : "text-body"}`}>
                      {task.title}
                    </span>
                    <TaskState status={working ? "working" : task.status} t={t} />
                  </div>
                  {current && (
                    <div className="mt-2.5 pl-8">
                      {activity && <LiveLine activity={activity} now={now} modelLabel={buildModelLabel(modelInfo, project, build.phase === "fix")} />}
                      <ActivityFeed events={taskEvents} now={now} />
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        ) : (
          !active &&
          ready &&
          project.appUrl &&
          !shippedSomething && <p className="mt-2 text-caption text-body">{t.app.awaitingDecisions}</p>
        )}
        {build?.status === "failed" && build.error && (
          <p className="mt-2 line-clamp-3 text-caption text-error">{build.error}</p>
        )}
      </div>
    </div>
  );
}

function TaskState({ status, t }: { status: "pending" | "working" | "done" | "failed" | "skipped"; t: Dictionary }) {
  if (status === "working") {
    return (
      <span className="flex items-center gap-1.5 text-caption text-ink">
        <span className="size-1.5 animate-pulse rounded-full bg-ink" aria-hidden />
        {t.app.task.working}
      </span>
    );
  }
  if (status === "done") {
    return (
      <span className="flex items-center gap-1 text-caption text-success">
        <CheckIcon size={12} strokeWidth={2.2} />
        {t.app.task.done}
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="flex items-center gap-1 text-caption text-muted">
        <CloseIcon size={12} />
        {t.app.task.failed}
      </span>
    );
  }
  return <span className="text-caption text-muted-soft">{status === "skipped" ? t.app.task.skipped : t.app.task.pending}</span>;
}
