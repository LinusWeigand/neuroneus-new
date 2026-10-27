// Bundles the game kit (templates/game) into src/lib/build/game-kit.bundle.json, which the
// server imports. Vercel rejects functions that carry the templates as loose traced files, so
// they ship inside the server code instead. Runs before every build; commit the result too.
//
//   pnpm templates:bundle
import fs from "node:fs/promises";
import path from "node:path";

const root = path.join(process.cwd(), "templates", "game");

async function readTree(dir: string, base = dir): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const entry of (await fs.readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === ".DS_Store") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) Object.assign(out, await readTree(full, base));
    else out[path.relative(base, full).split(path.sep).join("/")] = await fs.readFile(full, "utf8");
  }
  return out;
}

const bundle: Record<string, Record<string, string>> = {};
for (const entry of await fs.readdir(root, { withFileTypes: true })) {
  if (entry.isDirectory()) bundle[entry.name] = await readTree(path.join(root, entry.name));
}
const out = path.join(process.cwd(), "src", "lib", "build", "game-kit.bundle.json");
await fs.writeFile(out, JSON.stringify(bundle, null, 1) + "\n");
console.log(`[templates] bundled ${Object.values(bundle).reduce((n, files) => n + Object.keys(files).length, 0)} files into ${path.relative(process.cwd(), out)}`);
