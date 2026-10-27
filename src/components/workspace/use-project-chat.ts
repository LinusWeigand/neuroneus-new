"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import type { LiveStream } from "@/components/chat/message-list";
import { useI18n } from "@/components/i18n-provider";
import type {
  BuildDTO,
  BuildEventDTO,
  DecisionAnswer,
  DecisionDTO,
  MessageDTO,
  ProjectDTO,
  RunEvent,
  StatusKey,
  TurnInput,
} from "@/lib/types";

const ACTIVE_BUILD = ["queued", "setup", "planning", "building"];

export function isBuildActive(build: BuildDTO | null) {
  return Boolean(build && ACTIVE_BUILD.includes(build.status));
}

type State = {
  project: ProjectDTO;
  messages: MessageDTO[];
  decisions: DecisionDTO[];
  build: BuildDTO | null;
  /** The current build round's activity log, oldest first. */
  events: BuildEventDTO[];
  streams: LiveStream[];
  status: StatusKey | null;
  running: boolean;
  /** True when we lost the live stream (reload, network) and catch up by polling. */
  polling: boolean;
  stopping: boolean;
  error: string | null;
};

type Action =
  | { type: "event"; event: RunEvent }
  | { type: "begin"; optimistic?: MessageDTO }
  | { type: "fail"; error: string; optimisticId?: string }
  | {
      type: "sync";
      project: ProjectDTO;
      messages: MessageDTO[];
      decisions: DecisionDTO[];
      build: BuildDTO | null;
      /** Only what changed since the last sync: merge decisions instead of replacing them. */
      incremental: boolean;
    }
  | { type: "build"; build: BuildDTO | null }
  | { type: "activity"; project: ProjectDTO; build: BuildDTO | null; events: BuildEventDTO[] }
  | { type: "error"; error: string }
  | { type: "poll"; on: boolean }
  | { type: "stopping" }
  | { type: "project"; project: ProjectDTO }
  | { type: "dismiss" };

function upsert(list: MessageDTO[], m: MessageDTO) {
  const i = list.findIndex((x) => x.id === m.id);
  if (i >= 0) {
    const next = list.slice();
    next[i] = m;
    return next;
  }
  // Replace the optimistic copy of a user message once the server echoes it.
  const withoutOptimistic =
    m.authorType === "user" && m.kind === "chat" ? list.filter((x) => !(x.seq < 0 && x.content === m.content)) : list;
  return [...withoutOptimistic, m].sort((a, b) => (a.seq < 0 ? 1 : b.seq < 0 ? -1 : a.seq - b.seq));
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "begin":
      return {
        ...state,
        running: true,
        error: null,
        messages: action.optimistic ? [...state.messages, action.optimistic] : state.messages,
      };
    case "fail":
      return {
        ...state,
        running: false,
        streams: [],
        status: null,
        error: action.error,
        messages: action.optimisticId ? state.messages.filter((m) => m.id !== action.optimisticId) : state.messages,
      };
    case "sync": {
      // Merge rather than replace: a huddle we're streaming ourselves may be mid-flight.
      const messages = action.messages.reduce(upsert, state.messages);
      const known = new Set(state.decisions.map((d) => d.id));
      const decisions = action.incremental ? [...state.decisions, ...action.decisions.filter((d) => !known.has(d.id))] : action.decisions;
      const base = { ...state, project: action.project, messages, decisions, build: action.build };
      if (state.running && !state.polling) return base;
      return {
        ...base,
        running: action.project.running,
        polling: action.project.running ? state.polling : false,
        streams: action.project.running ? state.streams : [],
        status: action.project.running ? state.status : null,
        stopping: action.project.running ? state.stopping : false,
      };
    }
    case "build":
      return { ...state, build: action.build };
    case "activity": {
      const sameRound = state.build?.id === action.build?.id;
      const known = new Set(sameRound ? state.events.map((e) => e.id) : []);
      const events = [...(sameRound ? state.events : []), ...action.events.filter((e) => !known.has(e.id))].slice(-80);
      // Keep the huddle's own running flag; only refresh what the build poll owns.
      return { ...state, project: { ...action.project, running: state.project.running }, build: action.build, events };
    }
    case "error":
      return { ...state, error: action.error };
    case "poll":
      return { ...state, polling: action.on, running: action.on || state.running };
    case "stopping":
      return { ...state, stopping: true };
    case "project":
      return { ...state, project: action.project };
    case "dismiss":
      return { ...state, error: null };
    case "event": {
      const e = action.event;
      switch (e.type) {
        case "run":
          return { ...state, running: true };
        case "message":
          return { ...state, messages: upsert(state.messages, e.message) };
        case "typing":
          return state;
        case "start":
          return {
            ...state,
            status: null,
            streams: [...state.streams.filter((s) => s.id !== e.id), { id: e.id, agentId: e.agentId, text: "", createdAt: e.createdAt }],
          };
        case "delta":
          return { ...state, streams: state.streams.map((s) => (s.id === e.id ? { ...s, text: s.text + e.text } : s)) };
        case "end":
          return { ...state, streams: state.streams.filter((s) => s.id !== e.message.id), messages: upsert(state.messages, e.message) };
        case "discard":
          return { ...state, streams: state.streams.filter((s) => s.id !== e.id) };
        case "status":
          return { ...state, status: e.label };
        case "decisions":
          return { ...state, decisions: e.decisions };
        case "repo":
          return state;
        case "error":
          return { ...state, error: e.error };
        case "done":
          return { ...state, running: false, streams: [], status: null, stopping: false };
      }
    }
  }
  return state;
}

export function useProjectChat(initial: {
  project: ProjectDTO;
  messages: MessageDTO[];
  decisions: DecisionDTO[];
  build: BuildDTO | null;
  events: BuildEventDTO[];
}) {
  const [state, dispatch] = useReducer(reducer, {
    project: initial.project,
    messages: initial.messages,
    decisions: initial.decisions,
    build: initial.build,
    events: initial.events,
    streams: [],
    status: null,
    running: initial.project.running,
    polling: initial.project.running,
    stopping: false,
    error: null,
  });
  const projectId = initial.project.id;
  const { t } = useI18n();
  const busy = useRef(false);

  // After the first full sync, pollers fetch only what changed (database traffic is metered).
  const synced = useRef<{ seq: number; at: number } | null>(null);
  const refresh = useCallback(async () => {
    const q = synced.current ? `?${new URLSearchParams({ after: String(synced.current.seq), since: String(synced.current.at) })}` : "";
    const res = await fetch(`/api/projects/${projectId}${q}`, { cache: "no-store" });
    if (!res.ok) return;
    const body = (await res.json()) as {
      project: ProjectDTO;
      messages: MessageDTO[];
      decisions: DecisionDTO[];
      build: BuildDTO | null;
      incremental: boolean;
      syncedAt: number;
    };
    const seq = body.messages.reduce((max, m) => Math.max(max, m.seq), synced.current?.seq ?? 0);
    synced.current = { seq, at: body.syncedAt };
    dispatch({
      type: "sync",
      project: body.project,
      messages: body.messages,
      decisions: body.decisions,
      build: body.build,
      incremental: body.incremental,
    });
  }, [projectId]);

  // Catch-up polling when the live stream isn't ours (reload mid-run, other tab, dropped connection).
  useEffect(() => {
    if (!state.polling) return;
    let alive = true;
    const tick = async () => {
      // Nobody's looking: don't spend database traffic on a background tab.
      if (document.hidden) {
        if (alive) timer = setTimeout(tick, 1000);
        return;
      }
      try {
        await refresh();
      } catch {}
      if (alive) timer = setTimeout(tick, 2000);
    };
    let timer = setTimeout(tick, 600);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [state.polling, refresh]);

  // While the agents build, poll the cheap activity endpoint every 2 s (only while the tab is visible): the
  // "now" line, new log events and build state. The chat is fetched only when it grew.
  const building = isBuildActive(state.build);
  const cursor = useRef({ buildId: state.build?.id ?? "", after: state.events.at(-1)?.id ?? 0, seq: 0 });
  useEffect(() => {
    cursor.current.seq = state.messages.reduce((max, m) => Math.max(max, m.seq), 0);
  }, [state.messages]);
  useEffect(() => {
    if (!building) return;
    let alive = true;
    const tick = async () => {
      if (document.hidden) {
        if (alive) timer = setTimeout(tick, 1000);
        return;
      }
      try {
        const q = new URLSearchParams({ build: cursor.current.buildId, after: String(cursor.current.after) });
        const res = await fetch(`/api/projects/${projectId}/activity?${q}`, { cache: "no-store" });
        if (res.ok) {
          const body = (await res.json()) as {
            project: ProjectDTO;
            build: BuildDTO | null;
            events: BuildEventDTO[];
            lastSeq: number;
          };
          if (body.build?.id !== cursor.current.buildId) cursor.current.after = 0;
          cursor.current.buildId = body.build?.id ?? "";
          cursor.current.after = body.events.at(-1)?.id ?? cursor.current.after;
          dispatch({ type: "activity", project: body.project, build: body.build, events: body.events });
          if (body.lastSeq > cursor.current.seq) await refresh();
        }
      } catch {}
      if (alive) timer = setTimeout(tick, 2000);
    };
    let timer = setTimeout(tick, 400);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [building, projectId, refresh]);

  const run = useCallback(
    async (input: TurnInput): Promise<boolean> => {
      if (busy.current) return false;
      busy.current = true;
      const optimistic: MessageDTO | undefined =
        input.kind === "message"
          ? {
              id: `local-${Date.now()}`,
              seq: -1,
              authorType: "user",
              agentId: null,
              kind: "chat",
              content: input.content,
              data: null,
              createdAt: new Date().toISOString(),
            }
          : undefined;
      dispatch({ type: "begin", optimistic });

      let sawDone = false;
      let accepted = false;
      try {
        const res = await fetch(`/api/projects/${projectId}/turn`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        });
        if (!res.ok || !res.body) {
          const body = await res.json().catch(() => ({}));
          dispatch({ type: "fail", error: body.error ?? t.errors.unreachable, optimisticId: optimistic?.id });
          if (res.status === 409) dispatch({ type: "poll", on: true });
          return false;
        }
        accepted = true;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (!line) continue;
            const event = JSON.parse(line) as RunEvent;
            if (event.type === "done") sawDone = true;
            dispatch({ type: "event", event });
          }
        }
      } catch {
        // Network hiccup: the run continues server-side.
      } finally {
        busy.current = false;
      }
      if (accepted && !sawDone) dispatch({ type: "poll", on: true });
      // Answering decisions may have started a build round server-side: pick it up.
      if (accepted && sawDone && input.kind === "answers") void refresh().catch(() => {});
      return accepted;
    },
    [projectId, t, refresh],
  );

  const send = useCallback((content: string) => run({ kind: "message", content }), [run]);
  const answer = useCallback(
    async (requestMessageId: string, answers: DecisionAnswer[]) => {
      await run({ kind: "answers", requestMessageId, answers });
    },
    [run],
  );

  const stop = useCallback(async () => {
    dispatch({ type: "stopping" });
    await fetch(`/api/projects/${projectId}/stop`, { method: "POST" }).catch(() => {});
  }, [projectId]);

  const setProject = useCallback((project: ProjectDTO) => dispatch({ type: "project", project }), []);
  const dismissError = useCallback(() => dispatch({ type: "dismiss" }), []);

  const startBuild = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/build`, { method: "POST" }).catch(() => null);
    const body = await res?.json().catch(() => ({}));
    if (!res?.ok) {
      dispatch({ type: "error", error: body?.error ?? t.errors.unreachable });
      return;
    }
    dispatch({ type: "build", build: body.build });
  }, [projectId, t]);

  const stopBuild = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/build`, { method: "DELETE" }).catch(() => null);
    const body = await res?.json().catch(() => ({}));
    if (res?.ok) dispatch({ type: "build", build: body.build });
  }, [projectId]);

  return { state, send, answer, stop, setProject, dismissError, startBuild, stopBuild };
}
