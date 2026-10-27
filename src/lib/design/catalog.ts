// The design systems a generated app can be built with: every DESIGN.md listed in
// https://github.com/VoltAgent/awesome-claude-design, grouped as in that list. The files
// ship in the `getdesign` npm package (the same source as `npx getdesign add <slug>`).
// Client-safe: no file access here (see ./load.ts). Games use art directions instead (./art.ts).

import { artTheme, isArtSlug } from "./art";

export const DESIGN_CATALOG: { category: string; slugs: string[] }[] = [
  { category: "AI & LLM Platforms", slugs: ["claude", "cohere", "elevenlabs", "minimax", "mistral.ai", "ollama", "opencode.ai", "replicate", "runwayml", "together.ai", "voltagent", "x.ai"] },
  { category: "Developer Tools & IDEs", slugs: ["cursor", "expo", "lovable", "raycast", "superhuman", "vercel", "warp"] },
  { category: "Backend, Database & DevOps", slugs: ["clickhouse", "composio", "hashicorp", "mongodb", "posthog", "sanity", "sentry", "supabase"] },
  { category: "Productivity & SaaS", slugs: ["cal", "intercom", "linear.app", "mintlify", "notion", "resend", "zapier"] },
  { category: "Design & Creative Tools", slugs: ["airtable", "clay", "figma", "framer", "miro", "webflow"] },
  { category: "Fintech & Crypto", slugs: ["binance", "coinbase", "kraken", "mastercard", "revolut", "stripe", "wise"] },
  { category: "E-commerce & Retail", slugs: ["airbnb", "meta", "nike", "shopify"] },
  { category: "Media & Consumer Tech", slugs: ["apple", "ibm", "nvidia", "pinterest", "playstation", "spacex", "spotify", "theverge", "uber", "vodafone", "wired"] },
  { category: "Automotive", slugs: ["bmw", "bugatti", "ferrari", "lamborghini", "renault", "tesla"] },
];

export const DESIGN_SLUGS = DESIGN_CATALOG.flatMap((c) => c.slugs);

const NAMES: Record<string, string> = {
  "mistral.ai": "Mistral AI",
  "opencode.ai": "OpenCode",
  "together.ai": "Together AI",
  "x.ai": "xAI",
  "linear.app": "Linear",
  cal: "Cal.com",
  ibm: "IBM",
  bmw: "BMW",
  spacex: "SpaceX",
  theverge: "The Verge",
  posthog: "PostHog",
  hashicorp: "HashiCorp",
  clickhouse: "ClickHouse",
  mongodb: "MongoDB",
  playstation: "PlayStation",
  runwayml: "Runway",
  elevenlabs: "ElevenLabs",
  voltagent: "VoltAgent",
  minimax: "MiniMax",
  nvidia: "NVIDIA",
};

export function designName(slug: string) {
  if (isArtSlug(slug)) return artTheme(slug)?.name ?? slug.slice(4);
  return NAMES[slug] ?? slug.charAt(0).toUpperCase() + slug.slice(1);
}

/** The public preview page of a design on getdesign.md. Game art directions have none. */
export function designUrl(slug: string) {
  return isArtSlug(slug) ? null : `https://getdesign.md/${slug}/design-md`;
}
