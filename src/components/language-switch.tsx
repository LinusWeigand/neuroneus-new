"use client";

import { useI18n } from "@/components/i18n-provider";
import { LOCALES } from "@/lib/i18n/config";

// A quiet segmented pill (surface-strong track, white thumb). Deliberately not the ink pill:
// DESIGN.md reserves ink for primary CTAs, and this sits right next to one.
export function LanguageSwitch({ className = "" }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();
  return (
    <div role="group" aria-label={t.lang.label} className={`inline-flex h-8 shrink-0 items-center rounded-pill bg-surface-strong p-0.5 ${className}`}>
      {LOCALES.map((l) => {
        const active = l === locale;
        return (
          <button
            key={l}
            type="button"
            lang={l}
            aria-pressed={active}
            title={t.lang.names[l]}
            onClick={() => !active && setLocale(l)}
            className={`inline-flex h-7 min-w-9 items-center justify-center rounded-pill px-2.5 text-caption font-medium transition-[color,background-color,box-shadow] duration-150 ${
              active ? "bg-surface-card text-ink shadow-soft" : "text-muted hover:text-ink"
            }`}
          >
            {l.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}
