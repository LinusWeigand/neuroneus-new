// The game kit: what a web game starts from instead of a bare canvas. It's written as real
// files in templates/game/ (shared shell + a Phaser kit for 2D or a Three.js kit for 3D),
// bundled into game-kit.bundle.json for the server, plus files
// generated here from the chosen art direction: the theme tokens, fonts, CSS and the shell's
// config. The builder agent builds the actual game on top of it, so every game starts with
// polished menus, HUD, juice, lighting and sound instead of rectangles on a canvas.

import type { ArtTheme } from "@/lib/design/art";
import BUNDLE from "./game-kit.bundle.json";

export type GameRender = "2d" | "3d";

/** Pinned so a deploy months from now resolves the same engine. */
const ENGINES: Record<GameRender, { dependencies: Record<string, string>; devDependencies: Record<string, string> }> = {
  "2d": { dependencies: { phaser: "3.90.0" }, devDependencies: {} },
  "3d": { dependencies: { three: "0.186.0" }, devDependencies: { "@types/three": "0.186.0" } },
};

/** templates/game, bundled (pnpm templates:bundle): { shared: {path: content}, "2d": ..., "3d": ... }. */
const TEMPLATES = BUNDLE as Record<string, Record<string, string>>;

/** Whether the kit for a render path exists (the 3D kit may not ship yet). */
export function hasGameKit(render: GameRender) {
  return Boolean(TEMPLATES[render]);
}

/** Files that make up the kit (engine code, shell, docs), keyed by their path in the app. */
async function kitSources(render: GameRender) {
  const files = { ...TEMPLATES.shared, ...TEMPLATES[render] };
  // The stylesheet is composed with the theme tokens below, not shipped on its own.
  const css = files["app/game-ui.css"] ?? "";
  delete files["app/game-ui.css"];
  return { files, css };
}

export type GameMeta = { title: string; tagline: string };

/** Every file the kit adds or replaces in the app, for the given render path and theme. */
export async function gameKitFiles(input: { render: GameRender; theme: ArtTheme; meta: GameMeta }): Promise<Record<string, string>> {
  const { files, css } = await kitSources(input.render);
  return {
    ...files,
    ...themeFiles(input.theme, input.render, css),
    "game/config.ts": configFile(input.meta),
    "app/page.tsx": PAGE,
  };
}

/** The files that change with the theme alone (a new art direction re-themes the game). */
export async function gameThemeFiles(render: GameRender, theme: ArtTheme) {
  const { css } = await kitSources(render);
  return themeFiles(theme, render, css);
}

function themeFiles(theme: ArtTheme, render: GameRender, css: string) {
  return {
    "game/theme.ts": themeFile(theme),
    "app/globals.css": globalsCss(theme, css),
    "app/layout.tsx": layoutFile(theme, render),
  };
}

/** Adds the engine to package.json, keeping everything else as the agents left it. */
export function withGameDependencies(packageJson: string, render: GameRender) {
  try {
    const pkg = JSON.parse(packageJson);
    const engine = ENGINES[render];
    const other = ENGINES[render === "2d" ? "3d" : "2d"];
    for (const name of Object.keys(other.dependencies)) delete pkg.dependencies?.[name];
    for (const name of Object.keys(other.devDependencies)) delete pkg.devDependencies?.[name];
    pkg.dependencies = { ...(pkg.dependencies ?? {}), ...engine.dependencies };
    pkg.devDependencies = { ...(pkg.devDependencies ?? {}), ...engine.devDependencies };
    return JSON.stringify(pkg, null, 2) + "\n";
  } catch {
    return packageJson;
  }
}

// ─── Generated files ────────────────────────────────────────────────────────

const PAGE = `import { GameShell } from "@/components/game/game-shell";

export default function Page() {
  return <GameShell />;
}
`;

function luminance(color: string) {
  const n = parseInt(color.replace("#", ""), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Text color that reads on a fill: the theme's dark or light end, whichever contrasts more. */
function onColor(fill: string, theme: ArtTheme) {
  const ends = [theme.palette.ink, theme.palette.bg, "#ffffff", "#111111"];
  const l = luminance(fill);
  const contrast = (c: string) => {
    const lc = luminance(c);
    return (Math.max(l, lc) + 0.05) / (Math.min(l, lc) + 0.05);
  };
  return ends.reduce((best, c) => (contrast(c) > contrast(best) + 0.5 ? c : best));
}

function themeFile(t: ArtTheme) {
  const art = {
    shading: t.fx.pixelArt || t.panel === "paper" ? "cel" : "soft",
    outline: t.panel === "paper" ? t.palette.ink : null,
  };
  const theme = {
    name: t.name,
    palette: t.palette,
    backdrop: t.backdrop,
    world3d: t.world3d,
    fx: t.fx,
    art,
    music: t.music,
  };
  return `/**
 * The game's art direction as tokens: ${t.name}. Every color, light and effect in the game
 * comes from here (docs/ART-DIRECTION.md says how to use them); never hard-code colors.
 * Palette roles: primary = the player, secondary = world accents, accent = rewards,
 * danger = enemies and hazards, good = health and success.
 */
export type Theme = {
  name: string;
  palette: Record<"bg" | "bg2" | "surface" | "ink" | "muted" | "primary" | "secondary" | "accent" | "danger" | "good", string>;
  /** 2D backdrop recipe (game/kit/backdrop.ts). */
  backdrop: {
    sky: [string, string];
    orb: string | null;
    silhouettes: "mountains" | "hills" | "trees" | "city" | "dunes" | "none";
    particles: "stars" | "bubbles" | "snow" | "fireflies" | "dust" | "confetti";
    grid: boolean;
  };
  /** 3D environment: sky gradient, ground, fog density, sun. */
  world3d: { skyTop: string; skyBottom: string; ground: string; fog: number; sun: string; sunIntensity: number };
  /** bloom 0–1.5, vignette/grain/scanlines 0–1 (screen finish), glow 0–1 (UI glow). */
  fx: { bloom: number; vignette: number; grain: number; scanlines: number; glow: number; pixelArt: boolean };
  /** How sprites are shaded (soft gradients or flat cel shading) and outlined (null = a deep shade of the fill). */
  art: { shading: "soft" | "cel"; outline: string | null };
  music: { mood: "major" | "minor"; bpm: number };
};

export const THEME: Theme = ${JSON.stringify(theme, null, 2)};
`;
}

function configFile(meta: GameMeta) {
  return `import type { Action } from "@/game/input";

/** What the shell shows around the game. Keep it in sync with the game: title, controls, lives. */
export type GameConfig = {
  title: string;
  tagline: string;
  /** Lives per run; 0 hides the hearts in the HUD. */
  lives: number;
  orientation: "landscape" | "portrait";
  /** Shown on the title screen: [keys, what they do]. */
  controls: { desktop: [string, string][]; touch: string };
  /** On-screen controls on phones and tablets. */
  touch: { stick: boolean; buttons: { action: Action; label: string }[] };
};

export const GAME: GameConfig = {
  title: ${JSON.stringify(meta.title)},
  tagline: ${JSON.stringify(meta.tagline)},
  lives: 3,
  orientation: "landscape",
  controls: {
    desktop: [
      ["WASD / Arrows", "Move"],
      ["Space", "Dash"],
      ["Esc", "Pause"],
    ],
    touch: "Drag the stick to move, tap the button to dash",
  },
  touch: { stick: true, buttons: [{ action: "action", label: "Dash" }] },
};
`;
}

const PANELS: Record<ArtTheme["panel"], (t: ArtTheme) => { bg: string; border: string; blur: string }> = {
  glass: () => ({
    bg: "color-mix(in oklab, var(--surface) 62%, transparent)",
    border: "1px solid color-mix(in oklab, var(--ink) 14%, transparent)",
    blur: "14px",
  }),
  solid: () => ({ bg: "var(--surface)", border: "3px solid color-mix(in oklab, var(--ink) 10%, transparent)", blur: "0px" }),
  paper: () => ({ bg: "var(--surface)", border: "2.5px solid var(--ink)", blur: "0px" }),
  pixel: () => ({ bg: "var(--surface)", border: "4px solid var(--ink)", blur: "0px" }),
};

function globalsCss(t: ArtTheme, ui: string) {
  const p = t.palette;
  const panel = PANELS[t.panel](t);
  const tokens = Object.entries(p)
    .map(([k, v]) => `  --${k}: ${v};`)
    .join("\n");
  return `@import "tailwindcss";

/* Theme tokens: ${t.name}. Generated from game/theme.ts; keep the two in sync. */
:root {
${tokens}
  --on-primary: ${onColor(p.primary, t)};
  --on-accent: ${onColor(p.accent, t)};
  --radius: ${t.radius}px;
  --panel-bg: ${panel.bg};
  --panel-border: ${panel.border};
  --panel-blur: ${panel.blur};
  --glow: ${t.fx.glow};
  --fx-vignette: ${t.fx.vignette};
  --fx-grain: ${t.fx.grain};
  --fx-scanlines: ${t.fx.scanlines};
  --title-case: ${t.titleCase};
  --title-tracking: ${t.titleTracking};
  --font-display: var(--font-game-display);
  --font-body: var(--font-game-body);
}

@theme inline {
${Object.keys(p)
  .map((k) => `  --color-${k}: var(--${k});`)
  .join("\n")}
  --font-display: var(--font-game-display);
  --font-body: var(--font-game-body);
}

${ui.trim()}
`;
}

function fontCall(name: string, font: ArtTheme["fonts"]["display"], variable: string) {
  const opts = [`subsets: ["latin"]`, ...(font.weight ? [`weight: ${JSON.stringify(font.weight)}`] : []), `variable: "${variable}"`, `display: "swap"`];
  return `const ${name} = ${font.family}({ ${opts.join(", ")} });`;
}

function layoutFile(t: ArtTheme, render: GameRender) {
  const families = [...new Set([t.fonts.display.family, t.fonts.body.family])];
  return `import type { Metadata, Viewport } from "next";
import { ${families.join(", ")} } from "next/font/google";
import { GAME } from "@/game/config";
import "./globals.css";

// Fonts of the ${t.name} art direction: a display face for titles, HUD and in-game text, and a body face.
${fontCall("display", t.fonts.display, "--font-game-display")}
${fontCall("body", t.fonts.body, "--font-game-body")}

export const metadata: Metadata = {
  title: GAME.title,
  description: GAME.tagline,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: ${JSON.stringify(t.palette.bg)},
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={\`\${display.variable} \${body.variable}\`} data-render="${render}">
      <body>{children}</body>
    </html>
  );
}
`;
}
