"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";

export function LoginForm() {
  const router = useRouter();
  const { t } = useI18n();
  const next = useSearchParams().get("next");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="mt-6 space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const res = await fetch("/api/auth", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ password }),
        });
        if (res.ok) {
          router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
          router.refresh();
        } else {
          const body = await res.json().catch(() => ({}));
          setError(body.error ?? t.login.failed);
          setBusy(false);
        }
      }}
    >
      <div>
        <label htmlFor="password" className="text-body-strong text-ink">
          {t.login.password}
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-2 h-11 w-full rounded-md border border-hairline-strong bg-surface-card px-4 text-body-md text-ink outline-none focus:border-ink focus:shadow-[inset_0_0_0_1px_var(--color-ink)]"
        />
        {error && <p className="mt-2 text-caption text-error">{error}</p>}
      </div>
      <Button type="submit" disabled={busy || !password} className="w-full">
        {busy ? t.login.submitting : t.login.submit}
      </Button>
    </form>
  );
}
