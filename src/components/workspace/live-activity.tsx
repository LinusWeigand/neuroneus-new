"use client";

import { useSyncExternalStore } from "react";
import { AgentAvatarById } from "@/components/agent-avatar";
import { TypingDots } from "@/components/chat/message-list";
import { useI18n } from "@/components/i18n-provider";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { BuildActivity, BuildDTO, BuildEventDTO } from "@/lib/types";

// The pieces that keep a build visibly alive: a ticking clock, the "now" line (what the
// agent is doing this second), the activity log, and a segmented round progress bar.

const tick = (onChange: () => void) => {
  const id = setInterval(onChange, 1000);
  return () => clearInterval(id);
};
const still = () => () => {};
const second = () => Math.floor(Date.now() / 1000) * 1000;

/**
 * The current time, ticking every second while `active`. Null during server rendering and
 * hydration, so timers never cause a server/client mismatch; they appear right after.
 */
export function useNow(active: boolean): number | null {
  return useSyncExternalStore(active ? tick : still, second, () => null);
}

export function elapsed(fromIso: string | null | undefined, now: number | null) {
  if (!fromIso || now === null) return "";
  const s = Math.max(0, Math.floor((now - new Date(fromIso).getTime()) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function shortAgo(iso: string, now: number | null) {
  if (now === null) return "";
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m}m` : `${Math.round(m / 60)}h`;
}

export function activityText(t: Dictionary, a: BuildActivity) {
  const file = a.path || t.live.aFile;
  switch (a.kind) {
    case "setup":
      return t.live.setup[a.stage ?? "default"] ?? t.live.setup.default;
    case "planning":
      return t.live.planning;
    case "playtesting":
      return t.live.playtesting;
    case "thinking":
      return t.live.thinking;
    case "listing":
      return t.live.listing;
    case "reading":
      return t.live.reading(file);
    case "searching":
      return t.live.searching(a.query ?? "…");
    case "writing":
      return t.live.writing(file);
    case "editing":
      return t.live.editing(file);
    case "deleting":
      return t.live.deleting(file);
    case "schema":
      return t.live.schema;
    case "deploying":
      return t.live.stages[a.stage ?? "starting"] ?? t.live.stages.starting;
  }
}

function eventText(t: Dictionary, e: BuildEventDTO) {
  const ev = t.live.events;
  const p = e.path ?? "";
  switch (e.kind) {
    case "read":
      return ev.read(p);
    case "searched":
      return ev.searched(e.detail ?? "");
    case "wrote":
      return ev.wrote(p, e.detail === "new");
    case "edited":
      return ev.edited(p);
    case "deleted":
      return ev.deleted(p);
    case "planned":
      return ev.planned(e.detail ?? "");
    default:
      return ev[e.kind]();
  }
}

/** What's happening right now, with a live timer and (when writing) a character count. */
export function LiveLine({ activity, now, modelLabel }: { activity: BuildActivity; now: number | null; modelLabel?: string | null }) {
  const { t } = useI18n();
  return (
    <div className="flex min-w-0 items-center gap-2.5" aria-live="polite">
      {activity.agentId ? (
        <AgentAvatarById id={activity.agentId} size={20} />
      ) : (
        <span className="size-5 shrink-0 animate-pulse rounded-full bg-surface-strong" aria-hidden />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-caption font-medium text-ink">{activityText(t, activity)}</span>
        <span className="flex items-center gap-1.5 text-caption text-muted">
          {activity.chars ? <span className="tabular-nums">{t.live.chars(activity.chars)}</span> : null}
          {activity.chars && modelLabel ? <span aria-hidden>·</span> : null}
          {modelLabel ? <span className="truncate">{t.live.model(modelLabel)}</span> : null}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2 text-caption tabular-nums text-muted">
        {elapsed(activity.since, now)}
        <TypingDots />
      </span>
    </div>
  );
}

/** The latest things the agent did on the current task, newest first. */
export function ActivityFeed({ events, now, limit = 5 }: { events: BuildEventDTO[]; now: number | null; limit?: number }) {
  const { t } = useI18n();
  const shown = events.slice(-limit).reverse();
  if (!shown.length) return null;
  return (
    <ol className="mt-2 space-y-1 border-l border-hairline pl-3">
      {shown.map((e, i) => (
        <li key={e.id} className={`flex items-baseline gap-2 text-caption ${i === 0 ? "animate-rise text-body" : "text-muted"}`}>
          <span className="min-w-0 flex-1 truncate">{eventText(t, e)}</span>
          <span className="shrink-0 tabular-nums text-muted-soft">{shortAgo(e.createdAt, now)}</span>
        </li>
      ))}
    </ol>
  );
}

/** One segment per task: done, in progress (with a moving sheen), or still to come. */
export function RoundProgress({ build }: { build: BuildDTO }) {
  if (build.kind !== "build" || build.tasks.length === 0) return null;
  return (
    <div className="flex gap-1" aria-hidden>
      {build.tasks.map((task, i) => {
        const working = task.status === "working" || (i === build.taskIndex && build.status === "building" && task.status === "pending");
        const tone =
          task.status === "done"
            ? "bg-success"
            : task.status === "failed"
              ? "bg-hairline-strong"
              : working
                ? "bg-ink/25 progress-sheen"
                : "bg-surface-strong";
        return <span key={task.id} className={`h-1.5 flex-1 rounded-pill ${tone}`} />;
      })}
    </div>
  );
}
