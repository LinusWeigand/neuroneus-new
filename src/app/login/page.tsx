import type { Metadata } from "next";
import { Suspense } from "react";
import { LanguageSwitch } from "@/components/language-switch";
import { OrbField } from "@/components/ui/orb";
import { Wordmark } from "@/components/wordmark";
import { getT } from "@/lib/i18n/server";
import { LoginForm } from "./login-form";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t.meta.signIn };
}

export default async function LoginPage() {
  const { t } = await getT();
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden">
      <OrbField variant="hero" />
      <header className="relative mx-auto flex h-16 w-full max-w-content items-center justify-between px-4 sm:px-8">
        <Wordmark />
        <LanguageSwitch />
      </header>
      <main className="relative flex flex-1 items-center justify-center px-4 pb-24">
        <div className="w-full max-w-[400px] rounded-xxl border border-hairline bg-surface-card/90 p-8 backdrop-blur-sm">
          <h1 className="text-display-sm">{t.login.title}</h1>
          <p className="mt-2 text-body-sm text-body">{t.login.lead}</p>
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
