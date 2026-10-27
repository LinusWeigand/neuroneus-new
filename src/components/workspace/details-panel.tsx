"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AgentAvatar } from "@/components/agent-avatar";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { GitHubIcon, RefreshIcon, TrashIcon } from "@/components/ui/icons";
import type { ModelInfo } from "@/components/workspace/app-panel";
import { type AgentDef, builderAgentFor } from "@/lib/agents";
import { designName, designUrl } from "@/lib/design/catalog";
import { specProgress, specTemplate } from "@/lib/spec/templates";
import { agentCopy, compactNumber } from "@/lib/i18n/dictionaries";
import type { DecisionDTO, ProjectDTO, UsageSummary } from "@/lib/types";

export function DetailsPanel({
  project,
  team,
  decisions,
  onProject,
  onMention,
  modelInfo,
}: {
  project: ProjectDTO;
  team: AgentDef[];
  decisions: DecisionDTO[];
  onProject: (p: ProjectDTO) => void;
  onMention: (agent: AgentDef) => void;
  modelInfo: ModelInfo;
}) {
  const { t } = useI18n();
  return (
    <div className="scroll-quiet h-full space-y-8 overflow-y-auto px-5 py-6">
      <SpecSection project={project} />

      <section>
        <h2 className="text-caption-upper text-muted">{t.details.team}</h2>
        <ul className="mt-2 divide-y divide-hairline">
          {team.map((a) => {
            const copy = agentCopy(t, a);
            return (
              <li key={a.id} className="py-3">
                {/* voice-row */}
                <button
                  onClick={() => onMention(a)}
                  className="group flex w-full items-start gap-3 text-left"
                  title={t.details.askTitle(a.name)}
                >
                  <AgentAvatar agent={a} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="text-body-sm font-medium text-ink">{a.name}</span>
                      <span className="text-caption text-muted opacity-0 transition-opacity group-hover:opacity-100">{t.details.ask}</span>
                    </span>
                    <span className="block text-caption text-muted">{copy.role}</span>
                    <span className="mt-1 block text-caption text-body">{copy.owns.join(" · ")}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {team.length > 0 && <BuildingSection project={project} builder={builderAgentFor(team)} modelInfo={modelInfo} onProject={onProject} />}

      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="text-caption-upper text-muted">{t.details.decisions}</h2>
          {decisions.length > 0 && <span className="text-caption text-muted">{decisions.length}</span>}
        </div>
        {decisions.length === 0 ? (
          <p className="mt-3 text-caption text-body">{t.details.decisionsEmpty(Boolean(project.repoFullName))}</p>
        ) : (
          <ol className="mt-3 space-y-3">
            {[...decisions].reverse().map((d) => (
              <li key={d.id} className="rounded-lg border border-hairline bg-surface-card px-3.5 py-3">
                <p className="text-caption text-muted">{d.header}</p>
                <p className="mt-0.5 text-body-sm text-ink">{d.choice}</p>
                <p className="mt-1 text-caption text-muted-soft">{d.isCustom ? t.details.yours : d.wasRecommended ? t.details.teamPick : t.details.alternative}</p>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section>
        <h2 className="text-caption-upper text-muted">{t.common.repository}</h2>
        <RepoCard project={project} onProject={onProject} />
      </section>

      <section>
        <h2 className="text-caption-upper text-muted">{t.details.vision}</h2>
        <p className="mt-2 whitespace-pre-wrap text-caption text-body">{project.vision}</p>
      </section>

      <DeleteProject project={project} />
    </div>
  );
}

/** The spec: web app or game, every point with its answer or "open", and the chosen design. */
function SpecSection({ project }: { project: ProjectDTO }) {
  const { t } = useI18n();
  const spec = project.spec;
  const progress = specProgress(spec);
  const items = spec?.kind ? specTemplate(spec.kind) : [];
  return (
    <section>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-caption-upper text-muted">{t.spec.title}</h2>
        <span className="rounded-pill bg-surface-strong px-2.5 py-0.5 text-caption font-medium text-ink">
          {spec?.kind ? t.spec.kinds[spec.kind] : t.spec.kindUnknown}
        </span>
      </div>
      {spec?.kind ? (
        <>
          <div className="mt-3 flex items-center gap-3">
            <div className="flex flex-1 gap-0.5" aria-hidden>
              {Array.from({ length: progress.total }, (_, i) => (
                <span key={i} className={`h-1.5 flex-1 rounded-pill ${i < progress.answered ? "bg-success" : "bg-surface-strong"}`} />
              ))}
            </div>
            <span className="shrink-0 text-caption tabular-nums text-muted">{t.spec.progress(progress.answered, progress.total)}</span>
          </div>
          <dl className="mt-3 space-y-2.5">
            {items.map((item) => {
              const answer = spec.answers[item.key]?.value;
              return (
                <div key={item.key}>
                  <dt className="flex items-center gap-2 text-caption text-muted">
                    {t.spec.items[item.key]?.label ?? item.key}
                    {!answer && item.required && (
                      <span className="rounded-pill bg-surface-strong px-2 py-px text-caption-upper text-muted">{t.spec.open}</span>
                    )}
                  </dt>
                  {answer && <dd className="mt-0.5 text-body-sm text-ink">{answer}</dd>}
                </div>
              );
            })}
          </dl>
        </>
      ) : (
        <p className="mt-3 text-caption text-body">{t.spec.gateKind}</p>
      )}
      {project.designSlug && (
        <a
          href={designUrl(project.designSlug)}
          target="_blank"
          rel="noreferrer"
          className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-hairline bg-surface-card px-3.5 py-2.5 transition-shadow hover:shadow-soft"
        >
          <span className="text-caption text-muted">{t.spec.design}</span>
          <span className="text-body-sm font-medium text-ink">
            {designName(project.designSlug)} <span aria-hidden>↗</span>
          </span>
        </a>
      )}
    </section>
  );
}

/** Who writes the code and with which model, and what the project has used so far. */
function BuildingSection({
  project,
  builder,
  modelInfo,
  onProject,
}: {
  project: ProjectDTO;
  builder: AgentDef;
  modelInfo: ModelInfo;
  onProject: (p: ProjectDTO) => void;
}) {
  const { t } = useI18n();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  async function change(model: string) {
    setSaving(true);
    setError(false);
    const res = await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ builderModel: model }),
    }).catch(() => null);
    const body = await res?.json().catch(() => null);
    if (res?.ok && body?.project) onProject(body.project);
    else setError(true);
    setSaving(false);
  }

  return (
    <section>
      <h2 className="text-caption-upper text-muted">{t.details.building}</h2>
      <div className="mt-3 flex items-center gap-3">
        <AgentAvatar agent={builder} size={32} />
        <span className="min-w-0">
          <span className="block text-body-sm font-medium text-ink">{t.details.builder(builder.name)}</span>
          <span className="block text-caption text-muted">{t.details.builderHint}</span>
        </span>
      </div>
      <label className="mt-3 flex items-center gap-2">
        <span className="shrink-0 text-caption text-muted">{t.models.label}</span>
        <span className="relative min-w-0 flex-1">
          <select
            value={project.builderModel ?? "auto"}
            disabled={saving}
            onChange={(e) => change(e.target.value)}
            aria-label={`${t.models.label}: ${builder.name}`}
            className="h-7 w-full appearance-none truncate rounded-pill border border-hairline-strong bg-surface-card pl-3 pr-7 text-caption text-ink outline-none transition-colors hover:border-ink focus:border-ink disabled:text-muted-soft"
          >
            <option value="auto">
              {t.models.auto} · {t.models.autoHint}
            </option>
            {modelInfo.models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} · {t.models.hints[m.hint]}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </span>
        </span>
      </label>
      {error && <p className="mt-1 text-caption text-error">{t.models.failed}</p>}
      <UsageCard projectId={project.id} />
    </section>
  );
}

/** Tokens the project used: the discussion (low-cost models) and building, with the latest rounds. */
function UsageCard({ projectId }: { projectId: string }) {
  const { t, locale } = useI18n();
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/projects/${projectId}/usage`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((body: { usage: UsageSummary }) => alive && setUsage(body.usage))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [projectId]);

  if (failed) return <p className="mt-3 text-caption text-error">{t.usage.failed}</p>;
  if (!usage) return null;
  const rows = [
    { label: t.usage.chat, ...usage.chat },
    { label: t.usage.build, ...usage.build },
  ];
  const empty = rows.every((r) => r.calls === 0);

  return (
    <div className="mt-4 rounded-lg border border-hairline bg-surface-card px-3.5 py-3">
      <p className="text-caption text-muted">{t.usage.title}</p>
      {empty ? (
        <p className="mt-1 text-caption text-body">{t.usage.none}</p>
      ) : (
        <dl className="mt-1.5 space-y-1.5">
          {rows.map((r) => (
            <div key={r.label} className="flex items-baseline justify-between gap-3">
              <dt className="text-body-sm text-ink">{r.label}</dt>
              <dd className="text-right text-caption tabular-nums text-body">
                {t.usage.tokens(compactNumber(r.input + r.output, locale))}
                {r.input > 0 && <span className="block text-muted-soft">{t.usage.cached(Math.round((r.cached / r.input) * 100))}</span>}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {usage.rounds.length > 0 && (
        <ul className="mt-2.5 space-y-0.5 border-t border-hairline pt-2">
          {usage.rounds.map((r) => (
            <li key={r.createdAt} className="flex justify-between gap-3 text-caption tabular-nums text-muted">
              <span>{t.usage.round(r.round)}</span>
              <span>{t.usage.tokens(compactNumber(r.tokens, locale))}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RepoCard({ project, onProject }: { project: ProjectDTO; onProject: (p: ProjectDTO) => void }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (project.repoFullName && project.repoUrl) {
    return (
      <a
        href={project.repoUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-3 flex items-center gap-3 rounded-lg border border-hairline bg-surface-card px-3.5 py-3 transition-shadow hover:shadow-soft"
      >
        <GitHubIcon size={18} />
        <span className="min-w-0">
          <span className="block truncate text-body-sm font-medium text-ink">{project.repoFullName.split("/")[1]}</span>
          <span className="block truncate text-caption text-muted">{project.repoFullName.split("/")[0]}</span>
        </span>
      </a>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-dashed border-hairline-strong px-3.5 py-3">
      <p className="text-caption text-body">{t.details.noRepo}</p>
      {(error || project.repoError) && <p className="mt-1 line-clamp-3 text-caption text-error">{error ?? project.repoError}</p>}
      <Button
        variant="outline"
        size="sm"
        className="mt-3"
        disabled={busy}
        icon={<RefreshIcon size={14} />}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const res = await fetch(`/api/projects/${project.id}/repo`, { method: "POST" });
          const body = await res.json().catch(() => ({}));
          if (res.ok) onProject(body.project);
          else setError(body.error ?? t.details.repoFailed);
          setBusy(false);
        }}
      >
        {busy ? t.details.creating : t.details.createRepo}
      </Button>
    </div>
  );
}

/** Deleting is final: the repository, the live app, its database and the history here all go. */
function DeleteProject({ project }: { project: ProjectDTO }) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const host = project.appUrl?.replace(/^https?:\/\//, "");
  const parts = [
    project.repoFullName ? t.details.deleteRepo(project.repoFullName) : null,
    host ? t.details.deleteApp(host) : null,
    project.hasDatabase ? t.details.deleteDatabase : null,
    t.details.deleteHistory,
  ].filter((p): p is string => Boolean(p));

  async function remove() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/projects/${project.id}`, { method: "DELETE" }).catch(() => null);
    const body = await res?.json().catch(() => null);
    if (res?.ok) {
      router.push("/");
      router.refresh();
      return;
    }
    setError(body?.error ?? t.details.deleteNetwork);
    setBusy(false);
  }

  function cancel() {
    setOpen(false);
    setTyped("");
    setError(null);
  }

  return (
    <section className="border-t border-hairline pt-6">
      {!open ? (
        <Button variant="outline" size="sm" icon={<TrashIcon size={14} />} onClick={() => setOpen(true)}>
          {t.details.delete}
        </Button>
      ) : (
        <div className="rounded-lg border border-hairline-strong bg-surface-card px-3.5 py-3">
          <p className="text-caption text-ink">{t.details.deleteLead}</p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-caption text-body">
            {parts.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <p className="mt-2 text-caption font-medium text-ink">{t.details.deleteWarning}</p>
          <label className="mt-3 block">
            <span className="text-caption text-muted">{t.details.deleteConfirmLabel(project.name)}</span>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              disabled={busy}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              className="mt-1 h-9 w-full rounded-md border border-hairline-strong bg-surface-card px-3 text-body-sm text-ink outline-none transition-[border-color,box-shadow] focus:border-ink focus:shadow-[inset_0_0_0_1px_var(--color-ink)] disabled:text-muted-soft"
            />
          </label>
          {error && <p className="mt-2 text-caption text-error">{error}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
            <Button size="sm" disabled={busy || typed.trim() !== project.name.trim()} onClick={remove}>
              {busy ? t.details.deleting : t.details.deleteConfirm}
            </Button>
            <Button variant="text" size="sm" disabled={busy} onClick={cancel}>
              {t.details.cancel}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
