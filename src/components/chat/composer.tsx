"use client";

import { forwardRef, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AgentAvatar } from "@/components/agent-avatar";
import { useI18n } from "@/components/i18n-provider";
import { ArrowUpIcon, StopIcon } from "@/components/ui/icons";
import type { AgentDef } from "@/lib/agents";
import { agentCopy } from "@/lib/i18n/dictionaries";

export type ComposerHandle = { focus: () => void; insert: (text: string) => void };

type Props = {
  team: AgentDef[];
  running: boolean;
  stopping: boolean;
  onSend: (text: string) => boolean | Promise<boolean>;
  onStop: () => void;
};

export const Composer = forwardRef<ComposerHandle, Props>(function Composer({ team, running, stopping, onSend, onStop }, ref) {
  const { t } = useI18n();
  const [value, setValue] = useState("");
  const [caret, setCaret] = useState(0);
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => taRef.current?.focus(),
    insert: (text: string) => {
      setValue((v) => (v && !v.endsWith(" ") ? v + " " : v) + text);
      requestAnimationFrame(() => {
        const ta = taRef.current;
        if (!ta) return;
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
        setCaret(ta.value.length);
      });
    },
  }));

  // Autosize up to ~8 lines.
  useLayoutEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "0px";
    ta.style.height = Math.min(ta.scrollHeight, 220) + "px";
  }, [value]);

  // @mention autocomplete based on the word before the caret.
  const mention = useMemo(() => {
    const before = value.slice(0, caret);
    const m = /(^|\s)@([a-zA-Z]*)$/.exec(before);
    if (!m) return null;
    const q = m[2].toLowerCase();
    const matches = team.filter(
      (a) =>
        a.name.toLowerCase().startsWith(q) ||
        a.role.toLowerCase().includes(q) ||
        agentCopy(t, a).role.toLowerCase().includes(q),
    );
    if (!matches.length) return null;
    const token = `${caret}:${m[2]}`;
    if (dismissed === token) return null;
    return { start: caret - m[2].length - 1, matches, token };
  }, [value, caret, team, dismissed, t]);

  function pick(agent: AgentDef) {
    if (!mention) return;
    const next = value.slice(0, mention.start) + `@${agent.name} ` + value.slice(caret);
    const pos = mention.start + agent.name.length + 2;
    setValue(next);
    setActive(0);
    requestAnimationFrame(() => {
      taRef.current?.focus();
      taRef.current?.setSelectionRange(pos, pos);
      setCaret(pos);
    });
  }

  async function send() {
    const text = value.trim();
    if (!text || running) return;
    setValue("");
    const ok = await onSend(text);
    if (!ok) setValue(text);
  }

  const canSend = value.trim().length > 0 && !running;

  return (
    <div className="relative">
      {mention && (
        <div className="absolute bottom-full left-0 mb-2 w-72 overflow-hidden rounded-lg border border-hairline bg-surface-card p-1 shadow-soft" role="listbox">
          {mention.matches.map((a, i) => (
            <button
              key={a.id}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(a);
              }}
              onMouseEnter={() => setActive(i)}
              className={`flex w-full items-center gap-2.5 rounded-sm px-2.5 py-2 text-left ${i === active ? "bg-surface-strong" : ""}`}
            >
              <AgentAvatar agent={a} size={24} />
              <span className="text-body-sm font-medium text-ink">{a.name}</span>
              <span className="truncate text-caption text-muted">{agentCopy(t, a).role}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2 rounded-xl border border-hairline-strong bg-surface-card p-2 pl-4 transition-[border-color,box-shadow] focus-within:border-ink focus-within:shadow-[inset_0_0_0_1px_var(--color-ink)]">
        <textarea
          ref={taRef}
          value={value}
          rows={1}
          disabled={running}
          onChange={(e) => {
            setValue(e.target.value);
            setCaret(e.target.selectionStart ?? e.target.value.length);
            setActive(0);
          }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
          onKeyDown={(e) => {
            if (mention) {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((i) => (i + 1) % mention.matches.length);
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => (i - 1 + mention.matches.length) % mention.matches.length);
                return;
              }
              if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                pick(mention.matches[Math.min(active, mention.matches.length - 1)]);
                return;
              }
              if (e.key === "Escape") {
                setDismissed(mention.token);
                return;
              }
            }
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder={running ? t.composer.placeholderBusy : t.composer.placeholder}
          aria-label={t.composer.label}
          className="max-h-[220px] min-h-[28px] flex-1 resize-none self-center bg-transparent py-1.5 text-body-md text-ink outline-none placeholder:text-muted disabled:cursor-not-allowed"
        />
        {running ? (
          <button
            onClick={onStop}
            disabled={stopping}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-pill border border-hairline-strong px-4 text-button text-ink transition-colors hover:border-ink disabled:text-muted-soft"
            aria-label={t.composer.stopLabel}
          >
            <StopIcon size={14} />
            {stopping ? t.composer.stopping : t.composer.stop}
          </button>
        ) : (
          <button
            onClick={() => void send()}
            disabled={!canSend}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-pill bg-primary text-on-primary transition-colors hover:bg-primary-active disabled:bg-surface-strong disabled:text-muted-soft"
            aria-label={t.composer.send}
          >
            <ArrowUpIcon size={18} />
          </button>
        )}
      </div>
    </div>
  );
});
