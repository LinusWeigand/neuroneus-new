"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useState, useTransition } from "react";
import { LOCALE_COOKIE, type Locale } from "@/lib/i18n/config";
import { DICTIONARIES, type Dictionary } from "@/lib/i18n/dictionaries";

type I18n = { locale: Locale; t: Dictionary; setLocale: (l: Locale) => void; switching: boolean };

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ initialLocale, children }: { initialLocale: Locale; children: React.ReactNode }) {
  const router = useRouter();
  // The client switches instantly; the refresh brings server-rendered parts along.
  const [chosen, setChosen] = useState<Locale | null>(null);
  const [switching, startTransition] = useTransition();
  const locale = chosen ?? initialLocale;

  const setLocale = useCallback(
    (next: Locale) => {
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
      document.documentElement.lang = next;
      setChosen(next);
      startTransition(() => router.refresh());
    },
    [router],
  );

  const value = useMemo(() => ({ locale, t: DICTIONARIES[locale], setLocale, switching }), [locale, setLocale, switching]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>.");
  return ctx;
}
