import Link from "next/link";
import { connection } from "next/server";
import { AgentAvatar, AvatarStack } from "@/components/agent-avatar";
import { TopNav } from "@/components/top-nav";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { ArrowRightIcon, GitHubIcon } from "@/components/ui/icons";
import { OrbField } from "@/components/ui/orb";
import { AGENTS } from "@/lib/agents";
import { listProjects } from "@/lib/data";
import { agentCopy, relativeTime } from "@/lib/i18n/dictionaries";
import { getT } from "@/lib/i18n/server";

export default async function Home() {
  await connection();
  const [projects, { t, locale }] = await Promise.all([listProjects(), getT()]);

  return (
    <div className="relative min-h-screen overflow-x-clip">
      <TopNav />

      {/* hero-band */}
      <section className="relative">
        <OrbField variant="hero" />
        <div className="relative mx-auto flex max-w-content flex-col items-center px-4 pb-16 pt-16 text-center sm:px-8 sm:pb-24 sm:pt-24">
          <Badge tone="card">{t.home.badge}</Badge>
          <h1 className="mt-6 max-w-[880px] text-[32px] leading-[1.08] tracking-[-0.64px] font-display font-light sm:text-display-xl lg:text-display-mega text-balance">
            {t.home.title}
          </h1>
          <p className="mt-6 max-w-[560px] text-body-md text-body text-pretty">{t.home.lead}</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <LinkButton href="/new" icon={<ArrowRightIcon size={16} />} className="flex-row-reverse">
              {t.home.start}
            </LinkButton>
            <LinkButton href="#agents" variant="outline">
              {t.home.meet}
            </LinkButton>
          </div>
        </div>
      </section>

      {/* projects */}
      <section id="projects" className="relative mx-auto max-w-content scroll-mt-8 px-4 py-16 sm:px-8 sm:py-24">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <p className="text-caption-upper text-muted">{t.home.projectsEyebrow}</p>
            <h2 className="mt-2 text-display-md sm:text-display-lg">{t.home.projectsTitle}</h2>
          </div>
          {projects.length > 0 && (
            <LinkButton href="/new" variant="outline" size="sm">
              {t.common.newProject}
            </LinkButton>
          )}
        </div>

        {projects.length === 0 ? (
          <div className="relative overflow-hidden rounded-xxl bg-canvas-soft p-8 sm:p-12">
            <OrbField variant="card" />
            <div className="relative mx-auto max-w-[520px] text-center">
              <h3 className="text-display-sm sm:text-display-md">{t.home.emptyTitle}</h3>
              <p className="mt-3 text-body-md text-body">{t.home.emptyLead}</p>
              <LinkButton href="/new" className="mt-6">
                {t.home.start}
              </LinkButton>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <Link
                key={p.id}
                href={`/p/${p.id}`}
                className="group flex min-h-[188px] flex-col rounded-xl border border-hairline bg-surface-card p-6 transition-shadow duration-200 hover:shadow-soft"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-title-md text-ink">{p.name}</h3>
                  {p.running && <Badge>{t.home.talking}</Badge>}
                </div>
                <p className="mt-2 line-clamp-2 text-body-sm text-body">{p.vision}</p>
                <div className="mt-auto flex items-center justify-between gap-3 pt-6">
                  <AvatarStack ids={p.agentIds} size={26} />
                  <span className="flex items-center gap-2 text-caption text-muted">
                    {p.repoFullName && <GitHubIcon size={14} />}
                    {relativeTime(p.updatedAt, locale)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* agents */}
      <section id="agents" className="relative mx-auto max-w-content scroll-mt-8 px-4 pb-24 sm:px-8">
        <div className="mb-8 max-w-[640px]">
          <p className="text-caption-upper text-muted">{t.home.rosterEyebrow}</p>
          <h2 className="mt-2 text-display-md sm:text-display-lg">{t.home.rosterTitle}</h2>
          <p className="mt-3 text-body-md text-body">{t.home.rosterLead}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {AGENTS.map((a) => {
            const copy = agentCopy(t, a);
            return (
              <div key={a.id} className="rounded-xl border border-hairline bg-surface-card p-6">
                <div className="flex items-center gap-3">
                  <AgentAvatar agent={a} size={40} />
                  <div>
                    <p className="text-title-sm leading-tight text-ink">{a.name}</p>
                    <p className="text-caption text-muted">{copy.role}</p>
                  </div>
                </div>
                <p className="mt-4 text-body-sm text-body">{copy.tagline}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* footer */}
      <footer className="border-t border-hairline">
        <div className="mx-auto flex max-w-content flex-col gap-2 px-4 py-12 text-body-sm text-body sm:flex-row sm:items-center sm:justify-between sm:px-12">
          <span>{t.home.footerLeft}</span>
          <span className="text-muted">{t.home.footerRight}</span>
        </div>
      </footer>
    </div>
  );
}
