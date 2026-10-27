import "server-only";
import fs_sync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { DESIGN_SLUGS } from "./catalog";

// Reads DESIGN.md templates from the getdesign package, exactly what `npx getdesign add`
// would copy into a project. Package files ship to Vercel via outputFileTracingIncludes.

// Resolved from the project root: bundlers rewrite require.resolve() for external packages.
let dirCache: string | null = null;

function packageDir() {
  if (dirCache) return dirCache;
  const root = path.join(process.cwd(), "node_modules");
  const candidates = [path.join(root, "getdesign")];
  try {
    // pnpm keeps the real files in its store; follow that if the top-level link is missing.
    for (const entry of fs_sync.readdirSync(path.join(root, ".pnpm"))) {
      if (entry.startsWith("getdesign@")) candidates.push(path.join(root, ".pnpm", entry, "node_modules", "getdesign"));
    }
  } catch {}
  dirCache = candidates.find((dir) => fs_sync.existsSync(path.join(dir, "templates", "manifest.json"))) ?? candidates[0];
  return dirCache;
}

type ManifestEntry = { brand: string; file: string; description: string };
let manifest: ManifestEntry[] | null = null;

async function readManifest(): Promise<ManifestEntry[]> {
  manifest ??= JSON.parse(await fs.readFile(path.join(packageDir(), "templates", "manifest.json"), "utf8"));
  return manifest!;
}

/** The catalog with one-line descriptions, for the agent that picks a design. */
export async function designOptions(): Promise<{ slug: string; description: string }[]> {
  const entries = await readManifest();
  return DESIGN_SLUGS.map((slug) => ({
    slug,
    description: entries.find((e) => e.brand === slug)?.description ?? "",
  }));
}

/** The full DESIGN.md for a design in the catalog. */
export async function loadDesign(slug: string): Promise<string> {
  if (!DESIGN_SLUGS.includes(slug)) throw new Error(`Unknown design "${slug}".`);
  const entries = await readManifest();
  const file = entries.find((e) => e.brand === slug)?.file ?? `${slug}.md`;
  return fs.readFile(path.join(packageDir(), "templates", file), "utf8");
}
