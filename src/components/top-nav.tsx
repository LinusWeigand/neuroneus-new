import { LanguageSwitch } from "@/components/language-switch";
import { LinkButton } from "@/components/ui/button";
import { PlusIcon } from "@/components/ui/icons";
import { Wordmark } from "@/components/wordmark";
import { getT } from "@/lib/i18n/server";

// DESIGN.md → top-nav: canvas, 64px, wordmark left, primary pill right.
export async function TopNav() {
  const { t } = await getT();
  return (
    <header className="relative z-20 bg-transparent">
      <div className="mx-auto flex h-16 max-w-content items-center justify-between gap-3 px-4 sm:px-8">
        <Wordmark />
        <nav className="flex items-center gap-1 sm:gap-2">
          <a href="#projects" className="hidden h-10 items-center rounded-pill px-3 text-nav-link text-ink hover:bg-surface-strong md:inline-flex">
            {t.common.projects}
          </a>
          <a href="#agents" className="hidden h-10 items-center rounded-pill px-3 text-nav-link text-ink hover:bg-surface-strong md:inline-flex">
            {t.common.agents}
          </a>
          <LanguageSwitch className="mx-1" />
          <LinkButton href="/new" icon={<PlusIcon size={16} />} aria-label={t.common.newProject} className="max-sm:px-3">
            <span className="hidden sm:inline">{t.common.newProject}</span>
          </LinkButton>
        </nav>
      </div>
    </header>
  );
}
