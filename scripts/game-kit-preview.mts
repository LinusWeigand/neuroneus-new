// Writes a complete sample game (starter app + game kit + an art direction) to a folder, to
// check that the kit builds and to look at it. Run the folder like any Next.js app.
//
//   pnpm game-kit <out-dir> [2d|3d] [theme-id]
//   cd <out-dir> && npm install && npm run build && npm start
import fs from "node:fs/promises";
import path from "node:path";
import { gameKitFiles, type GameRender, withGameDependencies } from "@/lib/build/game-kit";
import { ART_THEMES, artTheme } from "@/lib/design/art";
import { starterFiles } from "@/lib/build/template";

const [out, render = "2d", themeId = "neon-arcade"] = process.argv.slice(2);
if (!out) throw new Error("Usage: pnpm game-kit <out-dir> [2d|3d] [theme-id]");
const theme = artTheme(themeId);
if (!theme) throw new Error(`Unknown theme. One of: ${ART_THEMES.map((t) => t.id).join(", ")}`);
if (render !== "2d" && render !== "3d") throw new Error("Render must be 2d or 3d.");

const files = {
  ...starterFiles({ slug: "kit-preview", name: "Kit Preview", vision: "A sample game built on the game kit." }),
  ...(await gameKitFiles({ render: render as GameRender, theme, meta: { title: "Star Drift", tagline: "Collect the light. Dodge the dark." } })),
};
files["package.json"] = withGameDependencies(files["package.json"], render as GameRender);

for (const [file, content] of Object.entries(files)) {
  const full = path.join(out, file);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content);
}
console.log(`Wrote ${Object.keys(files).length} files (${render}, ${theme.name}) to ${out}`);
