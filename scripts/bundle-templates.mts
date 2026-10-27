// Bundles the game kit (templates/game) into src/lib/build/game-kit.bundle.json, which the
// server imports. Vercel rejects functions that carry the templates as loose traced files, so
// they ship inside the server code instead. Runs before every build; commit the result too.
//
// The bundle also remembers a hash of every earlier version of each kit file (from git), so a
// game built on an older kit can be upgraded file by file, but only where the game still has
// an untouched kit version (never over the builder's own changes).
//
//   pnpm templates:bundle
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const root = path.join(process.cwd(), "templates", "game");
const out = path.join(process.cwd(), "src", "lib", "build", "game-kit.bundle.json");
const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

async function readTree(dir: string, base = dir): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  for (const entry of (await fs.readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === ".DS_Store") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) Object.assign(files, await readTree(full, base));
    else files[path.relative(base, full).split(path.sep).join("/")] = await fs.readFile(full, "utf8");
  }
  return files;
}

/** Hashes of every committed version of a file (empty when git or its history isn't there). */
function pastVersions(repoPath: string): string[] {
  try {
    const revs = execFileSync("git", ["log", "--format=%H", "--", repoPath], { encoding: "utf8" }).split("\n").filter(Boolean);
    return revs.flatMap((rev) => {
      try {
        return [hash(execFileSync("git", ["show", `${rev}:${repoPath}`], { encoding: "utf8", maxBuffer: 1 << 24 }))];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}

const previous = await fs
  .readFile(out, "utf8")
  .then((s) => (JSON.parse(s) as { history?: Record<string, string[]> }).history ?? {})
  .catch(() => ({}) as Record<string, string[]>);

const bundle: Record<string, Record<string, string>> = {};
const history: Record<string, string[]> = {};
for (const entry of await fs.readdir(root, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const files = await readTree(path.join(root, entry.name));
  bundle[entry.name] = files;
  for (const [file, content] of Object.entries(files)) {
    const key = `${entry.name}:${file}`;
    // A shallow clone (as on Vercel) knows less history: keep what the committed bundle knew.
    const known = new Set([...(previous[key] ?? []), ...pastVersions(`templates/game/${entry.name}/${file}`)]);
    known.delete(hash(content));
    if (known.size) history[key] = [...known].sort();
  }
}
await fs.writeFile(out, JSON.stringify({ ...bundle, history }, null, 1) + "\n");
console.log(
  `[templates] bundled ${Object.values(bundle).reduce((n, files) => n + Object.keys(files).length, 0)} files (${Object.values(history).reduce((n, h) => n + h.length, 0)} earlier versions known) into ${path.relative(process.cwd(), out)}`,
);
