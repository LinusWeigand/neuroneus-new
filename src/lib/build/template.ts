// What a generated app is made of, besides the agents' own code:
//
// - starterFiles: a known-good Next.js 16 + Tailwind 4 placeholder, deployed right after the
//   project is created. No database: that's added only when the spec needs one.
// - gameFiles: a canvas game shell (fixed-timestep loop, input, high-DPI canvas) for web games.
// - databaseFiles: Neon client + schema file, when the spec needs server-side data.
// - agentsMd: the conventions the builder agents follow, including "build to DESIGN.md".
//
// Versions are pinned so a deploy months from now resolves the same dependency tree.

import type { SpecKind } from "@/lib/spec/templates";

const NEON_VERSION = "1.2.0";

export function starterFiles(input: { slug: string; name: string; vision: string }): Record<string, string> {
  const name = JSON.stringify(input.name);
  const vision = JSON.stringify(input.vision.replace(/\s+/g, " ").slice(0, 400));

  return {
    "package.json":
      JSON.stringify(
        {
          name: input.slug,
          version: "0.1.0",
          private: true,
          scripts: { dev: "next dev", build: "next build", start: "next start" },
          dependencies: { next: "16.3.8", react: "19.2.8", "react-dom": "19.2.8" },
          devDependencies: {
            "@tailwindcss/postcss": "4.3.3",
            "@types/node": "20.19.43",
            "@types/react": "19.3.0",
            "@types/react-dom": "19.3.0",
            tailwindcss: "4.3.3",
            typescript: "5.9.3",
          },
        },
        null,
        2,
      ) + "\n",

    "tsconfig.json":
      JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            lib: ["dom", "dom.iterable", "esnext"],
            allowJs: false,
            skipLibCheck: true,
            strict: true,
            noEmit: true,
            esModuleInterop: true,
            module: "esnext",
            moduleResolution: "bundler",
            resolveJsonModule: true,
            isolatedModules: true,
            jsx: "react-jsx",
            incremental: true,
            plugins: [{ name: "next" }],
            paths: { "@/*": ["./*"] },
          },
          include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
          exclude: ["node_modules"],
        },
        null,
        2,
      ) + "\n",

    "next.config.ts": `import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default nextConfig;
`,

    "next-env.d.ts": `/// <reference types="next" />
/// <reference types="next/image-types/global" />
`,

    "postcss.config.mjs": `export default {
  plugins: { "@tailwindcss/postcss": {} },
};
`,

    ".gitignore": `node_modules
.next
.vercel
.env*
*.tsbuildinfo
`,

    "app/globals.css": `@import "tailwindcss";

body {
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}
`,

    "app/layout.tsx": `import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: ${name},
  description: ${vision},
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-neutral-900 antialiased">{children}</body>
    </html>
  );
}
`,

    "app/page.tsx": `export default function Home() {
  return (
    <main className="grid min-h-screen place-items-center p-8">
      <div className="max-w-xl text-center">
        <p className="text-xs font-medium uppercase tracking-widest text-neutral-500">Coming soon</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">{${name}}</h1>
        <p className="mt-4 text-neutral-600">{${vision}}</p>
        <p className="mt-10 text-sm text-neutral-400">The team is shaping the spec. Building starts once it's complete.</p>
      </div>
    </main>
  );
}
`,
  };
}

/** A canvas game shell. Compiles on its own; the first build task wires it into a page. */
export function gameFiles(): Record<string, string> {
  return {
    "game/loop.ts": `/**
 * Fixed-timestep game loop: \`update(dt)\` runs at a steady rate (default 60 Hz) no matter the
 * frame rate, \`render()\` once per animation frame. Returns a function that stops the loop.
 */
export function startLoop(update: (dt: number) => void, render: () => void, step = 1 / 60) {
  let last = performance.now();
  let acc = 0;
  let frame = 0;
  let running = true;
  const tick = (now: number) => {
    if (!running) return;
    acc += Math.min(0.25, (now - last) / 1000); // clamp after tab switches
    last = now;
    while (acc >= step) {
      update(step);
      acc -= step;
    }
    render();
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => {
    running = false;
    cancelAnimationFrame(frame);
  };
}
`,

    "game/input.ts": `/** Keyboard and pointer (mouse and touch) state, polled by the game every update. */
export function createInput(target: HTMLElement) {
  const keys = new Set<string>();
  const pointer = { x: 0, y: 0, down: false };

  const onKey = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    if (e.type === "keydown") keys.add(key);
    else keys.delete(key);
    if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) e.preventDefault();
  };
  const onPointer = (e: PointerEvent) => {
    const rect = target.getBoundingClientRect();
    pointer.x = e.clientX - rect.left;
    pointer.y = e.clientY - rect.top;
    if (e.type === "pointerdown") pointer.down = true;
    if (e.type === "pointerup" || e.type === "pointercancel") pointer.down = false;
  };
  const onBlur = () => {
    keys.clear();
    pointer.down = false;
  };

  window.addEventListener("keydown", onKey);
  window.addEventListener("keyup", onKey);
  window.addEventListener("blur", onBlur);
  target.addEventListener("pointerdown", onPointer);
  target.addEventListener("pointermove", onPointer);
  window.addEventListener("pointerup", onPointer);
  window.addEventListener("pointercancel", onPointer);

  return {
    keys,
    pointer,
    isDown: (key: string) => keys.has(key.toLowerCase()),
    dispose() {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("blur", onBlur);
      target.removeEventListener("pointerdown", onPointer);
      target.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerup", onPointer);
      window.removeEventListener("pointercancel", onPointer);
    },
  };
}

export type Input = ReturnType<typeof createInput>;
`,

    "components/game-canvas.tsx": `"use client";

import { useEffect, useRef } from "react";
import { createInput, type Input } from "@/game/input";
import { startLoop } from "@/game/loop";

export type Game = {
  update(dt: number, input: Input): void;
  render(ctx: CanvasRenderingContext2D, width: number, height: number): void;
};

/**
 * A canvas that fills its container, sharp on high-DPI screens, running \`create()\`'s game
 * with a fixed-timestep loop. Pass a stable function (defined at module level).
 */
export function GameCanvas({ create, className }: { create: () => Game; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const game = create();
    const input = createInput(canvas);
    let width = 0;
    let height = 0;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    const stop = startLoop(
      (dt) => game.update(dt, input),
      () => game.render(ctx, width, height),
    );
    return () => {
      stop();
      observer.disconnect();
      input.dispose();
    };
  }, [create]);

  return <canvas ref={ref} className={className} style={{ display: "block", width: "100%", height: "100%", touchAction: "none" }} />;
}
`,
  };
}

export function databaseFiles(): Record<string, string> {
  return {
    "lib/db.ts": `import { neon } from "@neondatabase/serverless";

/**
 * Tagged-template SQL against this app's Neon Postgres database. Values are sent as
 * parameters, never concatenated:  const rows = await sql\`select * from items where id = \${id}\`
 */
export const sql = neon(process.env.DATABASE_URL!);
`,
    "db/schema.sql": `-- The database schema. Idempotent statements only (CREATE TABLE IF NOT EXISTS,
-- ALTER TABLE ... ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS).
-- Applied automatically before every deploy.
`,
  };
}

/** Adds the Neon driver to package.json (keeps everything else as the agents left it). */
export function withNeonDependency(packageJson: string) {
  try {
    const pkg = JSON.parse(packageJson);
    pkg.dependencies = { ...(pkg.dependencies ?? {}), "@neondatabase/serverless": NEON_VERSION };
    return JSON.stringify(pkg, null, 2) + "\n";
  } catch {
    return packageJson;
  }
}

export function agentsMd(input: { kind: SpecKind; designName: string | null; database: boolean }) {
  const design = input.designName
    ? `## Design: follow DESIGN.md strictly
This app is built to the ${input.designName} design system in \`DESIGN.md\` (\`docs/DESIGN-BRIEF.md\` has its tokens and rules in short). Every screen follows it:
- Implement its color, radius, spacing and shadow tokens once in \`app/globals.css\` (Tailwind \`@theme\`) and use only those tokens. Never invent colors.
- Use its typography scale. Load fonts with \`next/font/google\`; when DESIGN.md names a proprietary font, use the closest Google Font it suggests or the nearest match.
- Build buttons, inputs, cards and navigation as DESIGN.md describes them, including states.
- Respect its do's and don'ts.
`
    : "";

  const data = input.database
    ? `## Data
- \`import { sql } from "@/lib/db"\` and query with tagged templates. Never build SQL strings by hand.
- Every schema change goes into \`db/schema.sql\` as idempotent SQL. It runs before each deploy. Never drop tables or columns.
- \`DATABASE_URL\` is set in every environment. Pages that read the database must render per request: \`export const dynamic = "force-dynamic";\`
`
    : `## Data
- There is no server database. Keep state in React; persist what must survive a reload on the device with \`localStorage\` (guard for server rendering).
`;

  const game =
    input.kind === "web_game"
      ? `## Game
- Game logic lives in \`game/\` as plain TypeScript (state + \`update(dt, input)\`), separate from rendering.
- Render with Canvas 2D through \`components/game-canvas.tsx\` (fixed-timestep loop, input, high-DPI canvas are already there). Keep allocations out of the update loop.
- Support the controls the spec names. On touch devices show on-screen controls; never rely on hover.
- Screens: start, playing, paused (pause when the tab loses focus), game over with instant restart. HUD and menus are HTML over the canvas, styled to DESIGN.md.
- No external image or audio files: draw with shapes, paths, gradients, emoji or inline SVG; make sounds with the Web Audio API, muted until the player interacts.
- Use DESIGN.md's palette for the game art too, so menus and world feel like one product.
`
      : "";

  return `# Conventions for the agents building this ${input.kind === "web_game" ? "game" : "app"}

Stack (fixed): Next.js 16 (App Router), React 19, TypeScript (strict), Tailwind CSS 4${input.database ? ", Neon Postgres" : ""}, deployed on Vercel.
The spec is in \`docs/SPEC.md\`. Build exactly what it says; don't add features it puts out of scope.
The app is deployed automatically after every task; a failing build blocks the deploy.

${design}
## Next.js 16
- Routes live in \`app/\`. Components are Server Components by default; add \`"use client"\` only for interactivity (state, effects, event handlers, canvas).
- \`params\` and \`searchParams\` are Promises: \`const { id } = await params\`.
- \`cookies()\` and \`headers()\` from \`next/headers\` are async.
- Mutations: Server Actions (\`"use server"\`) or Route Handlers (\`app/api/.../route.ts\`). Call \`revalidatePath\` after writes.
- Middleware is called Proxy in Next.js 16 (\`proxy.ts\`). Avoid it unless the task needs it.

${data}
${game}
## Code
- Keep changes focused on the task. Prefer editing existing files over adding new ones.
- No new dependencies unless clearly necessary; pin exact versions in package.json.
- Accessible markup: labels for inputs, buttons for actions, sensible headings, visible focus.
- Handle empty, loading and error states the user can see. Works on phones and desktops.
`;
}
