import type { CSSProperties } from "react";
import type { OrbTone } from "@/lib/agents";

// DESIGN.md → atmospheric gradient orbs. Pure decoration: never a button fill, text color or
// component surface. They sit behind content and drift slowly.

const toneVar: Record<OrbTone, string> = {
  mint: "var(--color-gradient-mint)",
  peach: "var(--color-gradient-peach)",
  lavender: "var(--color-gradient-lavender)",
  sky: "var(--color-gradient-sky)",
  rose: "var(--color-gradient-rose)",
};

export function orbColor(tone: OrbTone) {
  return toneVar[tone];
}

type OrbProps = {
  tone: OrbTone;
  size: number | string;
  className?: string;
  style?: CSSProperties;
  drift?: boolean;
  delay?: number;
};

export function Orb({ tone, size, className = "", style, drift = true, delay = 0 }: OrbProps) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute rounded-full blur-3xl ${drift ? "animate-orb-drift" : ""} ${className}`}
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle at 50% 50%, ${toneVar[tone]} 0%, color-mix(in srgb, ${toneVar[tone]} 55%, transparent) 45%, transparent 72%)`,
        animationDelay: `${delay}s`,
        ...style,
      }}
    />
  );
}

/** A composed field of orbs for hero bands. */
export function OrbField({ variant = "hero" }: { variant?: "hero" | "card" | "quiet" }) {
  if (variant === "card") {
    return (
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <Orb tone="peach" size="70%" className="-left-[15%] -top-[35%] opacity-80" />
        <Orb tone="lavender" size="60%" className="-right-[10%] -bottom-[40%] opacity-80" delay={-6} />
      </div>
    );
  }
  if (variant === "quiet") {
    return (
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden [mask-image:linear-gradient(to_bottom,black_50%,transparent)]">
        <Orb tone="sky" size={420} className="-right-40 -top-48 opacity-50" />
        <Orb tone="mint" size={360} className="-left-48 top-1/3 opacity-40" delay={-8} />
      </div>
    );
  }
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden [mask-image:linear-gradient(to_bottom,black_60%,transparent)]"
    >
      <Orb tone="mint" size="min(52vw, 640px)" className="left-[4%] top-[2%] opacity-90" />
      <Orb tone="peach" size="min(46vw, 560px)" className="right-[6%] top-[-6%] opacity-90" delay={-5} />
      <Orb tone="lavender" size="min(40vw, 500px)" className="left-[34%] top-[28%] opacity-80" delay={-9} />
      <Orb tone="sky" size="min(34vw, 420px)" className="right-[18%] top-[42%] opacity-70" delay={-13} />
    </div>
  );
}
