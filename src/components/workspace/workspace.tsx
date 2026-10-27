"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AgentAvatar, AvatarStack } from "@/components/agent-avatar";
import { Composer, type ComposerHandle } from "@/components/chat/composer";
import { useI18n } from "@/components/i18n-provider";
import { LanguageSwitch } from "@/components/language-switch";
import { MessageList } from "@/components/chat/message-list";
import { Badge } from "@/components/ui/badge";
import { CloseIcon, GitHubIcon, MenuIcon, PanelIcon } from "@/components/ui/icons";
import { OrbField } from "@/components/ui/orb";
import { AgentAvatarById } from "@/components/agent-avatar";
import { AppPanel, buildStatus, type ModelInfo, StatusDot } from "@/components/workspace/app-panel";
import { activityText, elapsed, useNow } from "@/components/workspace/live-activity";
import { DetailsPanel } from "@/components/workspace/details-panel";
import { Sidebar } from "@/components/workspace/sidebar";
import { isBuildActive, useProjectChat } from "@/components/workspace/use-project-chat";
import { resolveAgents } from "@/lib/agents";
import { agentCopy } from "@/lib/i18n/dictionaries";
import type { BuildDTO, BuildEventDTO, DecisionDTO, MessageDTO, ProjectDTO } from "@/lib/types";

type PanelTab = "app" | "project";

export function Workspace(props: {
  project: ProjectDTO;
  messages: MessageDTO[];
  decisions: DecisionDTO[];
  projects: ProjectDTO[];
  showSignOut: boolean;
  aiReady: boolean;
  build: BuildDTO | null;
  events: BuildEventDTO[];
  infraReady: boolean;
  modelInfo: ModelInfo;
}) {
  const { t } = useI18n();
  const { state, send, answer, stop, setProject, dismissError, startBuild, stopBuild } = useProjectChat(props);
  const { project, messages, decisions, streams, running, status, error, stopping, build, events } = state;
  const team = useMemo(() => resolveAgents(project.agentIds), [project.agentIds]);
  const [navOpen, setNavOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [tab, setTab] = useState<PanelTab>(props.project.appUrl || props.build || props.infraReady ? "app" : "project");
  const appStatus = buildStatus(t, project, build);
  const composerRef = useRef<ComposerHandle>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const kicked = useRef(false);

  const latestPendingId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.kind === "decision_request" && m.data?.type === "decision_card" && m.data.status === "pending") return m.id;
    }
    return null;
  }, [messages]);

  // Kickoff: a fresh project opens with the vision as the first message to the team.
  useEffect(() => {
    if (kicked.current || search.get("kickoff") !== "1") return;
    kicked.current = true;
    router.replace(pathname, { scroll: false });
    if (messages.length === 0 && !running && props.aiReady) void send(project.vision);
  }, [search, router, pathname, messages.length, running, send, project.vision, props.aiReady]);

  // When the huddle ends, hand the keyboard back: to the composer, unless a decision card
  // is waiting (its number-key shortcuts must not land in the textarea).
  const wasRunning = useRef(running);
  useEffect(() => {
    if (wasRunning.current && !running && !latestPendingId) composerRef.current?.focus();
    wasRunning.current = running;
  }, [running, latestPendingId]);

  // Follow the conversation unless the reader scrolled up.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages, streams, status, running]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
  };

  const handleSend = async (text: string) => {
    stickToBottom.current = true;
    return send(text);
  };

  const projects = useMemo(
    () => props.projects.map((p) => (p.id === project.id ? { ...p, running } : p)),
    [props.projects, project.id, running],
  );

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas">
      {/* Left: projects */}
      <aside className="hidden w-[264px] shrink-0 border-r border-hairline lg:block">
        <Sidebar projects={projects} activeId={project.id} activeRunning={running} showSignOut={props.showSignOut} />
      </aside>
      {navOpen && (
        <Drawer side="left" onClose={() => setNavOpen(false)}>
          <Sidebar
            projects={projects}
            activeId={project.id}
            activeRunning={running}
            showSignOut={props.showSignOut}
            onNavigate={() => setNavOpen(false)}
          />
        </Drawer>
      )}

      {/* Center: the room */}
      <main className="relative flex min-w-0 flex-1 flex-col">
        <header className="relative z-10 flex h-16 shrink-0 items-center gap-3 border-b border-hairline bg-canvas/85 px-4 backdrop-blur-md sm:px-6">
          <button className="-ml-1 inline-flex size-9 items-center justify-center rounded-pill hover:bg-surface-strong lg:hidden" onClick={() => setNavOpen(true)} aria-label={t.workspace.openProjects}>
            <MenuIcon size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-title-sm text-ink">{project.name}</h1>
            <p className="flex items-center gap-1.5 text-caption text-muted">
              {running ? (
                <>
                  <span className="size-1.5 animate-pulse rounded-full bg-ink" /> {t.workspace.teamTalking}
                </>
              ) : (
                t.common.agentCount(team.length)
              )}
            </p>
          </div>
          <span className="hidden sm:inline-flex">
            <AvatarStack ids={project.agentIds} size={28} />
          </span>
          {project.repoUrl && (
            <a
              href={project.repoUrl}
              target="_blank"
              rel="noreferrer"
              className="hidden h-8 items-center gap-2 rounded-pill border border-hairline-strong px-3 text-caption font-medium text-ink transition-colors hover:border-ink md:inline-flex"
            >
              <GitHubIcon size={14} />
              {t.common.repository}
            </a>
          )}
          <LanguageSwitch />
          <button
            className="inline-flex h-8 shrink-0 items-center gap-2 rounded-pill border border-hairline-strong px-3 text-caption font-medium text-ink transition-colors hover:border-ink xl:hidden"
            onClick={() => {
              setTab("app");
              setPanelOpen(true);
            }}
            title={appStatus.label}
          >
            <StatusDot tone={appStatus.tone} />
            {t.app.tabApp}
          </button>
          <button
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-pill hover:bg-surface-strong xl:hidden"
            onClick={() => {
              setTab("project");
              setPanelOpen(true);
            }}
            aria-label={t.workspace.openDetails}
          >
            <PanelIcon size={18} />
          </button>
        </header>

        <div ref={scrollRef} onScroll={onScroll} className="scroll-quiet flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[780px] px-4 pb-8 pt-6 sm:px-6">
            <VisionCard project={project} />
            {!props.aiReady && (
              <div className="mt-6 rounded-xl border border-hairline bg-surface-card px-5 py-4 text-body-sm text-body">
                {t.workspace.aiMissing[0]} <code className="font-mono text-[0.9em]">AZURE_RESOURCE_NAME</code> {t.workspace.aiMissing[1]}{" "}
                <code className="font-mono text-[0.9em]">AZURE_API_KEY</code> {t.workspace.aiMissing[2]}
              </div>
            )}
            <div className="mt-6">
              <MessageList
                messages={messages}
                streams={streams}
                teamIds={project.agentIds}
                running={running}
                status={status}
                latestPendingId={latestPendingId}
                onAnswer={answer}
              />
            </div>
          </div>
        </div>

        <div className="shrink-0 px-4 pb-4 pt-2 sm:px-6 sm:pb-6">
          <div className="mx-auto w-full max-w-[780px]">
            {error && (
              <div className="mb-2 flex items-start justify-between gap-3 rounded-lg border border-hairline bg-surface-card px-4 py-2.5" role="alert">
                <p className="text-caption text-error">{error}</p>
                <button onClick={dismissError} aria-label={t.common.dismiss} className="text-muted hover:text-ink">
                  <CloseIcon size={14} />
                </button>
              </div>
            )}
            {build && isBuildActive(build) && (
              <BuildStrip
                build={build}
                project={project}
                className={tab === "app" ? "xl:hidden" : ""}
                onView={() => {
                  setTab("app");
                  if (!window.matchMedia("(min-width: 1280px)").matches) setPanelOpen(true);
                }}
              />
            )}
            <Composer ref={composerRef} team={team} running={running || !props.aiReady} stopping={stopping} onSend={handleSend} onStop={stop} />
            <p className="mt-2 hidden text-center text-caption text-muted-soft sm:block">
              {latestPendingId && !running ? t.workspace.hintPending : t.workspace.hintDefault}
            </p>
          </div>
        </div>
      </main>

      {/* Right: the live app, or team, decisions and repo */}
      <aside
        className={`hidden shrink-0 border-l border-hairline transition-[width] duration-200 xl:block ${
          tab === "app" ? "w-[min(46vw,780px)]" : "w-[320px]"
        }`}
      >
        <SidePanel
          tab={tab}
          onTab={setTab}
          app={
            <AppPanel
              project={project}
              build={build}
              events={events}
              infraReady={props.infraReady}
              modelInfo={props.modelInfo}
              onBuild={startBuild}
              onStop={stopBuild}
            />
          }
          details={
            <DetailsPanel
              project={project}
              team={team}
              decisions={decisions}
              onProject={setProject}
              modelInfo={props.modelInfo}
              onMention={(a) => composerRef.current?.insert(`@${a.name} `)}
            />
          }
        />
      </aside>
      {panelOpen && (
        <Drawer side="right" wide={tab === "app"} onClose={() => setPanelOpen(false)}>
          <SidePanel
            tab={tab}
            onTab={setTab}
            app={
            <AppPanel
              project={project}
              build={build}
              events={events}
              infraReady={props.infraReady}
              modelInfo={props.modelInfo}
              onBuild={startBuild}
              onStop={stopBuild}
            />
          }
            details={
              <DetailsPanel
                project={project}
                team={team}
                decisions={decisions}
                onProject={setProject}
                modelInfo={props.modelInfo}
                onMention={(a) => {
                  setPanelOpen(false);
                  composerRef.current?.insert(`@${a.name} `);
                }}
              />
            }
          />
        </Drawer>
      )}
    </div>
  );
}

function VisionCard({ project }: { project: ProjectDTO }) {
  const { t } = useI18n();
  const team = resolveAgents(project.agentIds);
  return (
    // gradient-orb-card: canvas-soft, 24px radius, 32px padding, a soft orb behind the copy
    <section className="relative overflow-hidden rounded-xxl bg-canvas-soft p-6 sm:p-8">
      <OrbField variant="card" />
      <div className="relative">
        <Badge tone="card">{t.workspace.visionBadge}</Badge>
        <h2 className="mt-4 text-display-sm sm:text-display-md">{project.name}</h2>
        <p className="mt-3 max-w-[60ch] whitespace-pre-wrap text-body-md text-body">{project.vision}</p>
        <div className="mt-6 flex flex-wrap gap-2">
          {team.map((a) => (
            <span key={a.id} className="inline-flex items-center gap-2 rounded-pill bg-surface-card/80 py-1 pl-1 pr-3 text-caption text-ink">
              <AgentAvatar agent={a} size={22} />
              <span className="font-medium">{a.name}</span>
              <span className="text-muted">{agentCopy(t, a).role}</span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Above the composer while the team builds: who's doing what, which step, how long. */
function BuildStrip({
  build,
  project,
  className,
  onView,
}: {
  build: BuildDTO;
  project: ProjectDTO;
  className: string;
  onView: () => void;
}) {
  const { t } = useI18n();
  const now = useNow(true);
  const task = build.kind === "build" ? build.tasks[build.taskIndex] : undefined;
  const status = buildStatus(t, project, build);
  const agentId = build.activity?.agentId ?? task?.agentId;
  return (
    <button
      onClick={onView}
      className={`mb-2 flex w-full animate-rise items-center gap-3 rounded-lg border border-hairline bg-surface-card px-3 py-2 text-left transition-shadow hover:shadow-soft ${className}`}
    >
      {agentId ? <AgentAvatarById id={agentId} size={24} /> : <StatusDot tone="active" />}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-caption font-medium text-ink">{task ? task.title : status.label}</span>
        <span className="block truncate text-caption text-muted">{build.activity ? activityText(t, build.activity) : status.label}</span>
      </span>
      {task && <span className="hidden shrink-0 text-caption tabular-nums text-muted sm:inline">{t.live.step(build.taskIndex + 1, build.tasks.length)}</span>}
      <span className="shrink-0 text-caption tabular-nums text-muted">{elapsed(build.phaseStartedAt, now)}</span>
      <span className="shrink-0 text-caption font-medium text-ink">{t.live.view} →</span>
    </button>
  );
}

function SidePanel({ tab, onTab, app, details }: { tab: PanelTab; onTab: (t: PanelTab) => void; app: React.ReactNode; details: React.ReactNode }) {
  const { t } = useI18n();
  const tabs: [PanelTab, string][] = [
    ["app", t.app.tabApp],
    ["project", t.app.tabProject],
  ];
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-16 shrink-0 items-center border-b border-hairline px-4">
        <div role="tablist" className="inline-flex h-8 items-center rounded-pill bg-surface-strong p-0.5">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => onTab(id)}
              className={`inline-flex h-7 items-center rounded-pill px-3.5 text-caption font-medium transition-[color,background-color,box-shadow] ${
                tab === id ? "bg-surface-card text-ink shadow-soft" : "text-muted hover:text-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1">{tab === "app" ? app : details}</div>
    </div>
  );
}

function Drawer({
  side,
  wide = false,
  onClose,
  children,
}: {
  side: "left" | "right";
  wide?: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-ink/20" onClick={onClose} />
      <div
        className={`absolute top-0 h-full bg-canvas shadow-soft ${wide ? "w-[min(100vw,680px)]" : "w-[300px] max-w-[86vw]"} ${
          side === "left" ? "left-0 border-r border-hairline" : "right-0 border-l border-hairline"
        }`}
      >
        <button onClick={onClose} className="absolute right-3 top-4 z-10 inline-flex size-8 items-center justify-center rounded-pill hover:bg-surface-strong" aria-label={t.common.close}>
          <CloseIcon size={16} />
        </button>
        {children}
      </div>
    </div>
  );
}
