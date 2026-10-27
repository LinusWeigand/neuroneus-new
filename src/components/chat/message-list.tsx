"use client";

import { AgentAvatar, UserAvatar } from "@/components/agent-avatar";
import { RichText } from "@/components/chat/rich-text";
import { DecisionCard } from "@/components/chat/decision-card";
import { useI18n } from "@/components/i18n-provider";
import { AGENT_BY_ID } from "@/lib/agents";
import { agentCopy, clockTime, type Dictionary } from "@/lib/i18n/dictionaries";
import type { DecisionAnswer, MessageDTO, StatusKey } from "@/lib/types";

export type LiveStream = { id: string; agentId: string; text: string; createdAt: string };

type Row =
  | { type: "msg"; msg: MessageDTO; grouped: boolean }
  | { type: "stream"; stream: LiveStream; grouped: boolean };

const GROUP_WINDOW_MS = 5 * 60 * 1000;

function authorKey(m: { authorType: string; agentId: string | null }) {
  return m.authorType === "agent" ? `a:${m.agentId}` : m.authorType;
}

export function MessageList({
  messages,
  streams,
  teamIds,
  running,
  status,
  latestPendingId,
  onAnswer,
}: {
  messages: MessageDTO[];
  streams: LiveStream[];
  teamIds: string[];
  running: boolean;
  status: StatusKey | null;
  latestPendingId: string | null;
  onAnswer: (requestMessageId: string, answers: DecisionAnswer[]) => Promise<void>;
}) {
  const { t } = useI18n();
  const rows: Row[] = [];
  let prev: { key: string; at: number; kind: string } | null = null;
  const push = (item: { authorType: string; agentId: string | null; createdAt: string; kind: string }, row: (grouped: boolean) => Row) => {
    const key = authorKey(item);
    const at = new Date(item.createdAt).getTime();
    const grouped = Boolean(prev && prev.kind === "chat" && item.kind === "chat" && prev.key === key && at - prev.at < GROUP_WINDOW_MS);
    rows.push(row(grouped));
    prev = { key, at, kind: item.kind };
  };

  for (const m of messages) {
    // Answers are shown inside their (now answered) decision card.
    if (m.kind === "decision_answer") continue;
    push(m, (grouped) => ({ type: "msg", msg: m, grouped }));
  }
  for (const s of streams) {
    push({ authorType: "agent", agentId: s.agentId, createdAt: s.createdAt, kind: "chat" }, (grouped) => ({ type: "stream", stream: s, grouped }));
  }

  // Between speakers (the moderator is passing the floor) or while decisions are prepared.
  const waiting = running && streams.length === 0;

  return (
    <div className="flex flex-col">
      {rows.map((row) =>
        row.type === "stream" ? (
          <ChatRow key={row.stream.id} agentId={row.stream.agentId} createdAt={row.stream.createdAt} grouped={row.grouped}>
            {row.stream.text ? (
              <RichText text={row.stream.text} />
            ) : (
              <TypingDots />
            )}
          </ChatRow>
        ) : (
          <MessageRow key={row.msg.id} msg={row.msg} grouped={row.grouped} teamIds={teamIds} running={running} latestPendingId={latestPendingId} onAnswer={onAnswer} />
        ),
      )}
      {waiting && <ActivityRow label={status ? t.chat.status[status] : null} />}
    </div>
  );
}

function MessageRow({
  msg,
  grouped,
  teamIds,
  running,
  latestPendingId,
  onAnswer,
}: {
  msg: MessageDTO;
  grouped: boolean;
  teamIds: string[];
  running: boolean;
  latestPendingId: string | null;
  onAnswer: (requestMessageId: string, answers: DecisionAnswer[]) => Promise<void>;
}) {
  const { t } = useI18n();
  if (msg.kind === "decision_request" && msg.data?.type === "decision_card") {
    return (
      <div className="min-w-0 py-3 sm:pl-12">
        <DecisionCard
          card={msg.data}
          teamIds={teamIds}
          active={!running && msg.id === latestPendingId}
          onSubmit={(answers) => onAnswer(msg.id, answers)}
        />
      </div>
    );
  }
  if (msg.kind === "note") {
    const text = noteText(msg, t);
    return (
      <div className="flex items-center gap-3 py-3 sm:pl-12">
        <span className="h-px min-w-6 flex-1 bg-hairline" />
        <span className="min-w-0 text-center text-caption text-muted">
          <RichText text={text} />
        </span>
        <span className="h-px min-w-6 flex-1 bg-hairline" />
      </div>
    );
  }
  return (
    <ChatRow agentId={msg.authorType === "agent" ? msg.agentId : null} createdAt={msg.createdAt} grouped={grouped}>
      <RichText text={msg.content} />
    </ChatRow>
  );
}

function noteText(msg: MessageDTO, t: Dictionary): string {
  const d = msg.data;
  switch (d?.type) {
    case "build_started":
      return t.build.started(d.round, d.steps);
    case "build_done":
      return t.build.done(d.round, d.done, d.total) + (d.url ? ` · [${t.build.openApp}](${d.url})` : "") + (d.budget ? `. ${t.build.budget}` : "");
    case "build_failed":
      return t.build.failed(d.round, d.reason);
    case "task_rolled_back":
      return t.build.rolledBack(d.title);
    case "spec_complete":
      return t.build.specComplete(t.spec.kinds[d.kind] ?? d.kind, d.design);
  }
  const log = d?.type === "repo_log" ? d : legacyRepoLog(msg.content);
  return log ? t.chat.repoLog(log.count, `[${log.repo}/docs/DECISIONS.md](${log.url})`) : msg.content;
}

/** Notes saved before they carried structured data: "Logged 3 decisions to [repo/docs/DECISIONS.md](url)". */
function legacyRepoLog(content: string) {
  const m = /^Logged (\d+) decisions? to \[([^\]]+)\/docs\/DECISIONS\.md\]\((https?:\/\/[^)\s]+)\)$/.exec(content);
  return m ? { count: Number(m[1]), repo: m[2], url: m[3] } : null;
}

function ChatRow({
  agentId,
  createdAt,
  grouped,
  children,
}: {
  agentId: string | null;
  createdAt: string;
  grouped: boolean;
  children: React.ReactNode;
}) {
  const { t, locale } = useI18n();
  const agent = agentId ? AGENT_BY_ID[agentId] : null;
  return (
    <div className={`group flex animate-rise gap-3 rounded-lg px-2 -mx-2 hover:bg-canvas-soft/70 ${grouped ? "pt-0.5 pb-1" : "pt-3 pb-1"}`}>
      <div className="w-9 shrink-0 pt-0.5">
        {!grouped && (agent ? <AgentAvatar agent={agent} size={36} /> : <UserAvatar size={36} />)}
      </div>
      <div className="min-w-0 flex-1">
        {!grouped && (
          <div className="flex items-baseline gap-2">
            <span className="text-body-strong text-ink">{agent ? agent.name : t.chat.you}</span>
            {agent && <span className="text-caption text-muted">{agentCopy(t, agent).role}</span>}
            <time className="text-caption text-muted-soft" dateTime={createdAt} suppressHydrationWarning>
              {clockTime(createdAt, locale)}
            </time>
          </div>
        )}
        <div className="text-body-md text-body-strong">{children}</div>
      </div>
    </div>
  );
}

function ActivityRow({ label }: { label: string | null }) {
  return (
    <div className="flex items-center gap-3 px-2 -mx-2 pt-3 pb-1" aria-live="polite">
      <div className="w-9 shrink-0">
        <ModeratorGlyph />
      </div>
      <span className="flex h-9 items-center gap-2 text-caption text-muted">
        {label}
        <TypingDots />
      </span>
    </div>
  );
}

/** The moderator has no face: a quiet plate with a soft multi-tone bloom. */
function ModeratorGlyph() {
  return (
    <span className="relative flex size-9 items-center justify-center overflow-hidden rounded-full bg-surface-strong" aria-hidden>
      <span
        className="absolute inset-0 animate-orb-drift"
        style={{
          background:
            "radial-gradient(circle at 30% 30%, var(--color-gradient-mint) 0%, transparent 55%), radial-gradient(circle at 72% 68%, var(--color-gradient-lavender) 0%, transparent 55%), radial-gradient(circle at 70% 25%, var(--color-gradient-peach) 0%, transparent 45%)",
        }}
      />
    </span>
  );
}

export function TypingDots() {
  const { t } = useI18n();
  return (
    <span className="inline-flex h-6 items-center gap-1" aria-label={t.chat.typing}>
      {[0, 1, 2].map((i) => (
        <span key={i} className="size-1.5 animate-typing rounded-full bg-muted" style={{ animationDelay: `${i * 0.16}s` }} />
      ))}
    </span>
  );
}
