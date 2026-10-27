import type { Metadata } from "next";
import { LanguageSwitch } from "@/components/language-switch";
import { OrbField } from "@/components/ui/orb";
import { Wordmark } from "@/components/wordmark";
import { getT } from "@/lib/i18n/server";
import { NewProjectForm } from "./new-project-form";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t.meta.newProject };
}

export default async function NewProjectPage() {
  const { t } = await getT();
  return (
    <div className="relative min-h-screen overflow-x-clip">
      <OrbField variant="quiet" />
      <header className="relative z-10 mx-auto flex h-16 max-w-content items-center justify-between px-4 sm:px-8">
        <Wordmark />
        <LanguageSwitch />
      </header>
      <main className="relative mx-auto max-w-content px-4 pb-40 pt-8 sm:px-8 sm:pt-16">
        <div className="max-w-[640px]">
          <p className="text-caption-upper text-muted">{t.newProject.eyebrow}</p>
          <h1 className="mt-2 text-[32px] font-display font-light leading-[1.1] tracking-[-0.64px] sm:text-display-xl">
            {t.newProject.title}
          </h1>
          <p className="mt-3 text-body-md text-body">{t.newProject.lead}</p>
        </div>
        <NewProjectForm />
      </main>
    </div>
  );
}
