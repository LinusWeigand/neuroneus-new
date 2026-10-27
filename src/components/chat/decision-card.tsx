"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AgentAvatarById, AvatarStack } from "@/components/agent-avatar";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { ArrowUpIcon, CheckIcon } from "@/components/ui/icons";
import { Orb } from "@/components/ui/orb";
import type { DecisionAnswer, DecisionCard as Card, DecisionQuestion } from "@/lib/types";

// The grooming step. A quick option menu: the team's recommended option, one or two
// alternatives, and "something else" for the owner's own answer. A click decides:
// it answers the question and moves on; the last answer submits the card.

type Choice = { kind: "option"; index: number } | { kind: "other"; text: string };

/** Pause after a pick so the selection is visible before the next question slides in. */
const ADVANCE_MS = 220;

export function DecisionCard({
  card,
  teamIds,
  active,
  onSubmit,
}: {
  card: Card;
  teamIds: string[];
  /** Only the latest pending card is interactive, and only while the team is idle. */
  active: boolean;
  onSubmit: (answers: DecisionAnswer[]) => Promise<void> | void;
}) {
  if (card.status === "answered") return <AnsweredCard card={card} />;
  if (card.status === "superseded") return <SupersededCard card={card} />;
  return <PendingCard card={card} teamIds={teamIds} active={active} onSubmit={onSubmit} />;
}

function toAnswers(qs: DecisionQuestion[], choices: Choice[]): DecisionAnswer[] {
  return qs.map((q, i) => {
    const c = choices[i];
    if (c.kind === "other") {
      return { questionId: q.id, header: q.header, question: q.question, choice: c.text.trim(), isCustom: true, wasRecommended: false };
    }
    const o = q.options[c.index];
    return { questionId: q.id, header: q.header, question: q.question, choice: o.label, isCustom: false, wasRecommended: o.recommended };
  });
}

function PendingCard({
  card,
  teamIds,
  active,
  onSubmit,
}: {
  card: Card;
  teamIds: string[];
  active: boolean;
  onSubmit: (answers: DecisionAnswer[]) => Promise<void> | void;
}) {
  const { t } = useI18n();
  const qs = card.questions;
  const [step, setStep] = useState(0);
  const [choices, setChoices] = useState<(Choice | null)[]>(() => qs.map(() => null));
  const [drafts, setDrafts] = useState<string[]>(() => qs.map(() => ""));
  const [submitting, setSubmitting] = useState(false);
  const advanceTimer = useRef<number | undefined>(undefined);
  const otherRef = useRef<HTMLInputElement>(null);
  const q = qs[step];
  const locked = !active || submitting;

  useEffect(() => () => window.clearTimeout(advanceTimer.current), []);

  const submit = useCallback(
    async (final: Choice[]) => {
      setSubmitting(true);
      try {
        await onSubmit(toAnswers(qs, final));
      } finally {
        // On success the card re-renders as answered; on failure it becomes clickable again.
        setSubmitting(false);
      }
    },
    [onSubmit, qs],
  );

  /** Answers the current question, then moves to the next open one or submits. */
  const pick = useCallback(
    (choice: Choice) => {
      if (locked) return;
      const next = choices.map((c, i) => (i === step ? choice : c));
      setChoices(next);
      window.clearTimeout(advanceTimer.current);
      const after = next.findIndex((c, i) => c === null && i > step);
      const open = after >= 0 ? after : next.findIndex((c) => c === null);
      if (open === -1) {
        advanceTimer.current = window.setTimeout(() => void submit(next as Choice[]), ADVANCE_MS);
      } else {
        advanceTimer.current = window.setTimeout(() => setStep(open), ADVANCE_MS);
      }
    },
    [locked, choices, step, submit],
  );

  const acceptRecommended = useCallback(() => {
    if (locked) return;
    const all: Choice[] = qs.map((x) => ({ kind: "option", index: Math.max(0, x.options.findIndex((o) => o.recommended)) }));
    setChoices(all);
    void submit(all);
  }, [locked, qs, submit]);

  const commitOther = useCallback(() => {
    const text = drafts[step].trim();
    if (text) pick({ kind: "other", text });
    else otherRef.current?.focus();
  }, [drafts, step, pick]);

  // Keyboard: 1–n picks an option, n+1 jumps to "something else", ←/→ move between questions.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "TEXTAREA" || target.tagName === "INPUT" || e.metaKey || e.ctrlKey || e.altKey) return;
      const n = Number(e.key);
      if (n >= 1 && n <= q.options.length) {
        e.preventDefault();
        pick({ kind: "option", index: n - 1 });
      } else if (n === q.options.length + 1) {
        e.preventDefault();
        otherRef.current?.focus();
      } else if (e.key === "ArrowRight" && step < qs.length - 1) {
        setStep(step + 1);
      } else if (e.key === "ArrowLeft" && step > 0) {
        setStep(step - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, q, step, qs.length, pick]);

  const answered = choices.filter(Boolean).length;
  const current = choices[step];

  return (
    <div
      className={`relative animate-rise overflow-hidden rounded-xxl border border-hairline bg-surface-card ${active ? "shadow-soft" : "opacity-70"}`}
      aria-busy={submitting}
    >
      {/* atmospheric bloom behind the header only */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-40 overflow-hidden">
        <Orb tone="lavender" size={360} className="-left-24 -top-56 opacity-60" />
        <Orb tone="peach" size={300} className="-right-20 -top-52 opacity-50" delay={-7} />
      </div>

      <div className="relative px-5 pb-5 pt-5 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <span className="text-caption-upper text-muted">
            {t.card.yourCall(qs.length)}
          </span>
          <AvatarStack ids={teamIds} size={22} />
        </div>
        <p className="mt-2 text-display-sm text-ink text-pretty">{card.summary}</p>

        {qs.length > 1 && (
          <div className="mt-5 flex flex-wrap gap-1.5" role="tablist" aria-label={t.card.tabs}>
            {qs.map((x, i) => (
              <button
                key={x.id}
                role="tab"
                aria-selected={i === step}
                onClick={() => setStep(i)}
                className={`inline-flex h-8 items-center gap-1.5 rounded-pill px-3 text-caption font-medium transition-colors ${
                  i === step ? "bg-primary text-on-primary" : "bg-surface-strong text-ink hover:bg-hairline"
                }`}
              >
                {choices[i] ? <CheckIcon size={12} strokeWidth={2.2} /> : <span className="tabular-nums opacity-60">{i + 1}</span>}
                {x.header}
              </button>
            ))}
          </div>
        )}

        <div className="mt-5" role="tabpanel" key={q.id}>
          <p className="animate-rise text-title-sm text-ink text-pretty">{q.question}</p>
          <div className="mt-3 overflow-hidden rounded-xl border border-hairline" role="radiogroup" aria-label={q.question}>
            {q.options.map((o, i) => {
              const selected = current?.kind === "option" && current.index === i;
              return (
                <button
                  key={o.label}
                  role="radio"
                  aria-checked={selected}
                  disabled={locked}
                  onClick={() => pick({ kind: "option", index: i })}
                  className={`group flex w-full items-start gap-3 border-b border-hairline px-4 py-3.5 text-left transition-colors last:border-b-0 disabled:cursor-default ${
                    selected ? "bg-canvas-soft" : "bg-surface-card enabled:hover:bg-canvas-soft"
                  }`}
                >
                  <span className="mt-0.5 w-4 shrink-0 text-caption tabular-nums text-muted">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-body-strong text-ink">{o.label}</span>
                      {o.recommended && (
                        <span className="rounded-pill bg-surface-strong px-2 py-0.5 text-caption-upper text-ink">{t.card.recommended}</span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-body-sm text-body">{o.description}</span>
                    {o.championedBy.length > 0 && (
                      <span className="mt-2 flex items-center gap-1.5 text-caption text-muted">
                        <span className="inline-flex">
                          {o.championedBy.map((id, j) => (
                            <span key={id} style={{ marginLeft: j ? -5 : 0 }}>
                              <AgentAvatarById id={id} size={18} ring />
                            </span>
                          ))}
                        </span>
                        {t.card.arguedFor(o.championedBy.length)}
                      </span>
                    )}
                  </span>
                  <Radio on={selected} />
                </button>
              );
            })}

            {/* Something else: type, then Enter or the arrow commits it like a click. */}
            <div className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${current?.kind === "other" ? "bg-canvas-soft" : "bg-surface-card"}`}>
              <span className="w-4 shrink-0 text-caption tabular-nums text-muted">{q.options.length + 1}</span>
              <input
                ref={otherRef}
                disabled={locked}
                value={drafts[step]}
                onChange={(e) => setDrafts((d) => d.map((v, i) => (i === step ? e.target.value : v)))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitOther();
                  } else if (e.key === "Escape") {
                    e.currentTarget.blur();
                  }
                }}
                placeholder={t.card.somethingElse}
                maxLength={500}
                className="h-8 min-w-0 flex-1 bg-transparent text-body-md text-ink outline-none placeholder:text-muted disabled:cursor-default"
                aria-label={t.card.ownAnswer}
              />
              {drafts[step].trim() ? (
                <button
                  onClick={commitOther}
                  disabled={locked}
                  className="inline-flex size-8 shrink-0 items-center justify-center rounded-pill bg-primary text-on-primary transition-colors hover:bg-primary-active disabled:bg-muted-soft"
                  aria-label={t.card.useMine}
                >
                  <ArrowUpIcon size={15} className="rotate-90" />
                </button>
              ) : (
                <Radio on={current?.kind === "other"} />
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 flex min-h-8 items-center justify-between gap-3">
          <span className="text-caption text-muted">
            {submitting ? (
              t.card.locking
            ) : !active ? (
              t.card.stillTalking
            ) : (
              <>
                <span className="sm:hidden">{t.card.tap}</span>
                <span className="hidden sm:inline">
                  {t.card.clickOrPress} <Kbd>1</Kbd>–<Kbd>{q.options.length + 1}</Kbd>
                  {qs.length > 1 && ` · ${t.card.decidedOf(answered, qs.length)}`}
                </span>
              </>
            )}
          </span>
          {qs.length > 1 && qs.every((x) => x.options.some((o) => o.recommended)) && (
            <Button variant="outline" size="sm" onClick={acceptRecommended} disabled={locked}>
              {t.card.acceptAll}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}


function Radio({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={`mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full border transition-colors ${
        on ? "border-ink bg-primary" : "border-hairline-strong bg-surface-card"
      }`}
    >
      {on && <span className="size-1.5 rounded-full bg-on-primary" />}
    </span>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="mx-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-xs border border-hairline-strong bg-surface-card px-1 font-sans text-[11px] text-body-strong">
      {children}
    </kbd>
  );
}

function AnsweredCard({ card }: { card: Card }) {
  const { t } = useI18n();
  return (
    <div className="animate-rise rounded-xl border border-hairline bg-surface-card px-5 py-4">
      <div className="flex items-center gap-2">
        <span className="flex size-5 items-center justify-center rounded-full bg-primary text-on-primary">
          <CheckIcon size={12} strokeWidth={2.4} />
        </span>
        <span className="text-caption-upper text-muted">
          {t.card.youDecided(card.answers?.length ?? 0)}
        </span>
      </div>
      <ul className="mt-3 space-y-2.5">
        {card.answers?.map((a) => (
          <li key={a.questionId} className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
            <span className="w-28 shrink-0 text-caption text-muted">{a.header}</span>
            <span className="text-body-sm text-ink">
              {a.choice}
              <span className="ml-2 text-caption text-muted">{a.isCustom ? t.card.tagYours : a.wasRecommended ? t.card.tagTeam : t.card.tagAlternative}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SupersededCard({ card }: { card: Card }) {
  const { t } = useI18n();
  return (
    <div className="rounded-xl border border-dashed border-hairline-strong px-5 py-3">
      <p className="text-caption text-muted">
        {t.card.skipped(card.questions.length, card.questions.map((q) => q.header).join(", "))}
      </p>
    </div>
  );
}
