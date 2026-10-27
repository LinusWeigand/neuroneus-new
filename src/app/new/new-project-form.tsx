"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AgentAvatar, AvatarStack } from "@/components/agent-avatar";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { ArrowRightIcon, CheckIcon } from "@/components/ui/icons";
import { AGENTS, DEFAULT_TEAM, MAX_AGENTS, MIN_AGENTS, TEAM_PRESETS } from "@/lib/agents";
import { agentCopy } from "@/lib/i18n/dictionaries";

const inputClass =
  "w-full rounded-md border border-hairline-strong bg-surface-card px-4 text-body-md text-ink placeholder:text-muted-soft outline-none transition-[border-color,box-shadow] focus:border-ink focus:shadow-[inset_0_0_0_1px_var(--color-ink)]";

export function NewProjectForm() {
  const router = useRouter();
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [vision, setVision] = useState("");
  const [team, setTeam] = useState<string[]>(DEFAULT_TEAM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) =>
    setTeam((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : ids.length >= MAX_AGENTS ? ids : [...ids, id]));

  const activePreset = TEAM_PRESETS.find(
    (p) => p.agentIds.length === team.length && p.agentIds.every((id) => team.includes(id)),
  )?.id;

  const teamValid = team.length >= MIN_AGENTS && team.length <= MAX_AGENTS;
  const canSubmit = name.trim().length >= 2 && vision.trim().length >= 10 && teamValid && !submitting;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, vision, agentIds: team }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? t.newProject.failed);
      router.push(`/p/${body.project.id}?kickoff=1`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.newProject.failed);
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-12">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* Idea */}
        <div className="space-y-6">
          <div>
            <label htmlFor="name" className="text-body-strong text-ink">
              {t.newProject.nameLabel}
            </label>
            <input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.newProject.namePlaceholder}
              maxLength={80}
              autoFocus
              className={`${inputClass} mt-2 h-11`}
            />
          </div>
          <div>
            <label htmlFor="vision" className="text-body-strong text-ink">
              {t.newProject.visionLabel}
            </label>
            <p className="mt-0.5 text-caption text-muted">{t.newProject.visionHint}</p>
            <textarea
              id="vision"
              value={vision}
              onChange={(e) => setVision(e.target.value)}
              placeholder={t.newProject.visionPlaceholder}
              rows={7}
              maxLength={4000}
              className={`${inputClass} mt-2 resize-none py-3 leading-relaxed`}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(e);
              }}
            />
          </div>
        </div>

        {/* Team */}
        <div>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-body-strong text-ink">{t.newProject.teamLabel}</p>
              <p className="mt-0.5 text-caption text-muted">{t.newProject.teamHint(MIN_AGENTS, MAX_AGENTS)}</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={t.newProject.presetsLabel}>
            {TEAM_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setTeam(p.agentIds)}
                aria-pressed={activePreset === p.id}
                className={`inline-flex h-8 items-center rounded-pill px-3.5 text-caption font-medium transition-colors ${
                  activePreset === p.id
                    ? "bg-primary text-on-primary"
                    : "border border-hairline-strong bg-transparent text-ink hover:border-ink"
                }`}
              >
                {t.presets[p.id] ?? p.label}
              </button>
            ))}
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {AGENTS.map((a) => {
              const selected = team.includes(a.id);
              const disabled = !selected && team.length >= MAX_AGENTS;
              const copy = agentCopy(t, a);
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => toggle(a.id)}
                  disabled={disabled}
                  aria-pressed={selected}
                  className={`group relative flex items-start gap-3 rounded-xl border bg-surface-card p-4 text-left transition-[border-color,box-shadow,opacity] duration-150 ${
                    selected
                      ? "border-ink shadow-[inset_0_0_0_1px_var(--color-ink)]"
                      : "border-hairline hover:border-hairline-strong hover:shadow-soft"
                  } ${disabled ? "opacity-45" : ""}`}
                >
                  <AgentAvatar agent={a} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className="text-body-strong text-ink">{a.name}</span>
                      <span className="truncate text-caption text-muted">{copy.role}</span>
                    </span>
                    <span className="mt-0.5 block text-caption text-body">{copy.tagline}</span>
                  </span>
                  <span
                    className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
                      selected ? "border-ink bg-primary text-on-primary" : "border-hairline-strong text-transparent"
                    }`}
                    aria-hidden
                  >
                    <CheckIcon size={12} strokeWidth={2.2} />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Sticky action bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-canvas/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-content items-center justify-between gap-4 px-4 py-3 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <AvatarStack ids={team} size={28} />
            <span className="hidden text-caption text-body sm:inline">
              {t.common.agentCount(team.length)}
              {!teamValid && <span className="text-error"> · {t.newProject.pickRange(MIN_AGENTS, MAX_AGENTS)}</span>}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {error && <span className="hidden max-w-[360px] truncate text-caption text-error sm:inline">{error}</span>}
            <Button type="submit" disabled={!canSubmit} icon={submitting ? <Spinner /> : <ArrowRightIcon size={16} />} className="flex-row-reverse">
              {submitting ? t.newProject.submitting : t.newProject.submit}
            </Button>
          </div>
        </div>
        {error && <p className="px-4 pb-3 text-caption text-error sm:hidden">{error}</p>}
      </div>
    </form>
  );
}

function Spinner() {
  return (
    <span className="inline-block size-3.5 animate-spin rounded-full border-[1.5px] border-on-primary/40 border-t-on-primary" aria-hidden />
  );
}
