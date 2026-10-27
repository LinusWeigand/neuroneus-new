"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AvatarStack } from "@/components/agent-avatar";
import { buttonClass } from "@/components/ui/button";
import { PlusIcon } from "@/components/ui/icons";
import { Wordmark } from "@/components/wordmark";
import { useI18n } from "@/components/i18n-provider";
import { relativeTime } from "@/lib/i18n/dictionaries";
import type { ProjectDTO } from "@/lib/types";

export function Sidebar({
  projects,
  activeId,
  activeRunning,
  showSignOut,
  onNavigate,
}: {
  projects: ProjectDTO[];
  activeId: string;
  activeRunning: boolean;
  showSignOut: boolean;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const { t, locale } = useI18n();
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 shrink-0 items-center px-5">
        <Wordmark />
      </div>
      <div className="px-3">
        <Link href="/new" className={buttonClass("outline", "sm", "w-full")} onClick={onNavigate}>
          <PlusIcon size={14} />
          {t.common.newProject}
        </Link>
      </div>
      <p className="mt-6 px-5 text-caption-upper text-muted">{t.common.projects}</p>
      <nav className="scroll-quiet mt-2 flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
        {projects.map((p) => {
          const active = p.id === activeId;
          const running = active ? activeRunning : p.running;
          return (
            <Link
              key={p.id}
              href={`/p/${p.id}`}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`block rounded-lg px-3 py-2.5 transition-colors ${
                active ? "border border-hairline bg-surface-card" : "border border-transparent hover:bg-surface-strong"
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-body-sm font-medium text-ink">{p.name}</span>
                {running && <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-ink" aria-label={t.workspace.teamTalking} />}
              </span>
              <span className="mt-1 flex items-center justify-between gap-2">
                <AvatarStack ids={p.agentIds} size={16} max={5} />
                <span className="text-caption text-muted" suppressHydrationWarning>
                  {relativeTime(p.updatedAt, locale)}
                </span>
              </span>
            </Link>
          );
        })}
      </nav>
      {showSignOut && (
        <div className="border-t border-hairline px-5 py-3">
          <button
            className="text-caption text-muted hover:text-ink"
            onClick={async () => {
              await fetch("/api/auth", { method: "DELETE" });
              router.push("/login");
            }}
          >
            {t.common.signOut}
          </button>
        </div>
      )}
    </div>
  );
}
