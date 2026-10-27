import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { ProjectRow } from "@/lib/db/schema";
import { artTheme, isArtSlug } from "@/lib/design/art";
import { ART_DIRECTION_VERSION, writeArtDirection } from "@/lib/design/art-direction";
import { designName } from "@/lib/design/catalog";
import { designBrief } from "@/lib/design/brief";
import { chooseDesign } from "@/lib/design/choose";
import { loadDesign } from "@/lib/design/load";
import { deleteProjectRepo, slugify } from "@/lib/github";
import { DICTIONARIES } from "@/lib/i18n/dictionaries";
import { inferDatabase } from "@/lib/spec/extract";
import { specText } from "@/lib/spec/templates";
import type { UsageScope } from "@/lib/usage";
import { connectionUri, createDatabase, databaseExists, deleteDatabase, type NeonDatabase, neonConfigured } from "./neon";
import { commitChanges, type FileMap, readRepo } from "./repo";
import { type GameRender, gameKitFiles, gameThemeFiles, hasGameKit, upgradeKit, withGameDependencies } from "./game-kit";
import { agentsMd, databaseFiles, gameFiles, starterFiles, withNeonDependency } from "./template";
import { createProject, deleteProject, projectExists, setEnv, vercelConfigured, type VercelProject } from "./vercel";

export const AGENT_AUTHOR = (name: string) => ({ name: `${name} (Neuroneus)`, email: "agents@neuroneus.dev" });

export function infraConfigured() {
  return neonConfigured() && vercelConfigured();
}

export function neonOf(p: ProjectRow): NeonDatabase | null {
  return p.neonProjectId && p.neonDatabase && p.neonRole
    ? { projectId: p.neonProjectId, databaseName: p.neonDatabase, roleName: p.neonRole }
    : null;
}

export function vercelOf(p: ProjectRow): VercelProject | null {
  return p.vercelProjectId && p.vercelProjectName ? { id: p.vercelProjectId, name: p.vercelProjectName } : null;
}

async function save(id: string, values: Partial<typeof schema.projects.$inferInsert>) {
  const [row] = await db
    .update(schema.projects)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(schema.projects.id, id))
    .returning();
  return row;
}

/**
 * Makes sure the project has everything its app needs: a repository with the starter app,
 * a Neon database, and a Vercel project wired to it. Each piece is created only if missing,
 * so this is safe to run at the start of every build.
 */
export type SetupStage = "database" | "hosting" | "starter" | "design" | "conventions";

export async function ensureInfra(
  project: ProjectRow,
  onStage: (stage: SetupStage) => Promise<void> = async () => {},
  opts: { database: boolean } = { database: false },
): Promise<ProjectRow> {
  if (!project.repoFullName) throw new Error("The project has no GitHub repository yet.");
  if (!infraConfigured()) throw new Error("Set NEON_API_KEY and VERCEL_API_KEY to build and deploy apps.");
  let p = project;
  const slug = p.repoFullName!.split("/")[1] || slugify(p.name);

  // Resources deleted by hand (dashboards) are recreated instead of failing every build.
  if (neonOf(p) && !(await databaseExists(p.neonProjectId!))) {
    p = await save(p.id, { neonProjectId: null, neonDatabase: null, neonRole: null });
  }
  if (vercelOf(p) && !(await projectExists(p.vercelProjectId!))) {
    p = await save(p.id, { vercelProjectId: null, vercelProjectName: null, appUrl: null });
  }

  // The database is created only when the spec needs one.
  let neon = neonOf(p);
  if (!neon && opts.database) {
    await onStage("database");
    neon = await createDatabase(slug);
    p = await save(p.id, { neonProjectId: neon.projectId, neonDatabase: neon.databaseName, neonRole: neon.roleName });
  }

  let vercel = vercelOf(p);
  if (!vercel) {
    await onStage("hosting");
    vercel = await createProject(slug);
    p = await save(p.id, { vercelProjectId: vercel.id, vercelProjectName: vercel.name });
  }
  // Idempotent (upsert), and keeps the app pointed at the right database.
  if (neon) await setEnv(vercel.id, "DATABASE_URL", await connectionUri(neon));

  const files = await readRepo(p.repoFullName!);
  if (!files["package.json"]) {
    await onStage("starter");
    const starter = { ...files, ...starterFiles({ slug, name: p.name, vision: p.vision }) };
    await commitChanges(p.repoFullName!, files, starter, "Add the starter app", AGENT_AUTHOR("Neuroneus"));
  }

  if (p.infraError) p = await save(p.id, { infraError: null });
  return p;
}

/**
 * Turns the placeholder into the project the spec describes, before the first task: decides
 * the database, picks and installs the look (a design system for apps, an art direction and
 * the game kit for games), and writes the spec and the agents' conventions into the repository.
 * Safe to run every round: it only commits what changed.
 */
export async function prepareApp(
  project: ProjectRow,
  scope: UsageScope,
  onStage: (stage: SetupStage) => Promise<void> = async () => {},
): Promise<{ project: ProjectRow; files: FileMap }> {
  const spec = project.spec;
  if (!spec?.kind) throw new Error("The spec isn't complete yet.");
  let p = project;

  let database = spec.needsDatabase;
  if (database === null) {
    database = await inferDatabase(scope, spec);
    p = await save(p.id, { spec: { ...spec, needsDatabase: database } });
  }
  p = await ensureInfra(p, onStage, { database });

  const before = await readRepo(p.repoFullName!);
  const files: FileMap = { ...before };
  const marker = (() => {
    try {
      return JSON.parse(before[".neuroneus.json"] ?? "{}") as { design?: string; kit?: GameRender; art?: number };
    } catch {
      return {};
    }
  })();
  // A game gets the game kit unless it was already built on the old canvas shell.
  const game = spec.kind === "web_game";
  const untouched = !marker.design && (before["app/page.tsx"] ?? "").includes("The team is shaping the spec");
  const kitGame = game && (Boolean(marker.kit) || untouched || isArtSlug(p.designSlug));

  if (!p.designSlug || (kitGame && !isArtSlug(p.designSlug))) {
    await onStage("design");
    const chosen = await chooseDesign(scope, { name: p.name, vision: p.vision, spec });
    p = await save(p.id, { designSlug: chosen.slug, ...(chosen.render ? { spec: { ...p.spec!, render: chosen.render } } : {}) });
  }

  await onStage("conventions");
  const designChanged = marker.design !== p.designSlug;
  let render: GameRender | null = null;
  if (kitGame && isArtSlug(p.designSlug)) {
    // The game kit, themed with the art direction, and the game's own art bible on top.
    const theme = artTheme(p.designSlug!)!;
    render = p.spec?.render && hasGameKit(p.spec.render) ? p.spec.render : "2d";
    const direction =
      !files["docs/ART-DIRECTION.md"] || designChanged || marker.kit !== render || marker.art !== ART_DIRECTION_VERSION
        ? await writeArtDirection(scope, { name: p.name, vision: p.vision, spec: p.spec!, theme, render })
        : null;
    if (marker.kit !== render) {
      Object.assign(files, await gameKitFiles({ render, theme, meta: { title: direction?.title ?? p.name, tagline: direction?.tagline ?? "" } }));
      for (const old of ["game/loop.ts", "components/game-canvas.tsx"]) delete files[old];
      if (files["package.json"]) files["package.json"] = withGameDependencies(files["package.json"], render);
    } else {
      if (designChanged) Object.assign(files, await gameThemeFiles(render, theme));
      // Kit upgrades: new kit modules and fixes reach games built on an older kit, wherever
      // the game still has the untouched kit file. The builder's own changes stay.
      upgradeKit(render, files);
    }
    if (direction) files["docs/ART-DIRECTION.md"] = direction.markdown;
  } else {
    // `npx getdesign add <slug>`, done server-side: the template goes in as DESIGN.md, with a
    // short brief of it that the builder keeps in context instead of the whole file.
    if (!files["DESIGN.md"] || designChanged) files["DESIGN.md"] = await loadDesign(p.designSlug!);
    if (!files["docs/DESIGN-BRIEF.md"] || designChanged) {
      const brief = await designBrief(scope, { name: designName(p.designSlug!), markdown: files["DESIGN.md"] });
      if (brief) files["docs/DESIGN-BRIEF.md"] = brief;
      else delete files["docs/DESIGN-BRIEF.md"];
    }
    if (game) {
      for (const [path, content] of Object.entries(gameFiles())) files[path] ??= content;
    }
  }
  if (neonOf(p)) {
    for (const [path, content] of Object.entries(databaseFiles())) files[path] ??= content;
    if (files["package.json"]) files["package.json"] = withNeonDependency(files["package.json"]);
  }
  const labels = Object.fromEntries(Object.entries(DICTIONARIES.en.spec.items).map(([k, v]) => [k, v.label]));
  const vision = p.vision.replace(/\s+/g, " ");
  files["docs/SPEC.md"] = `# Spec: ${p.name}\n\n> ${vision}\n\n${specText(spec, labels)}\n`;
  files["AGENTS.md"] = agentsMd({ kind: spec.kind, designName: designName(p.designSlug!), database: Boolean(neonOf(p)), kit: render });
  files[".neuroneus.json"] =
    JSON.stringify(
      { kind: spec.kind, design: p.designSlug, database: Boolean(neonOf(p)), ...(render ? { kit: render, art: ART_DIRECTION_VERSION } : {}) },
      null,
      2,
    ) + "\n";

  await commitChanges(
    p.repoFullName!,
    before,
    files,
    `Prepare the ${spec.kind === "web_game" ? "game" : "app"}: ${designName(p.designSlug!)} design, spec and conventions`,
    AGENT_AUTHOR("Neuroneus"),
  );
  return { project: p, files };
}

export type TeardownPart = "hosting" | "database" | "repository";

/**
 * Deletes everything the project owns outside this app: the Vercel project (the live app),
 * the Neon database and the GitHub repository. Each piece is cleared from the project as soon
 * as it's gone, so a retry after a failure only deletes what's left. Returns what failed.
 */
export async function teardownProject(project: ProjectRow): Promise<{ part: TeardownPart; message: string }[]> {
  const failures: { part: TeardownPart; message: string }[] = [];
  const remove = async (
    part: TeardownPart,
    present: unknown,
    run: () => Promise<void>,
    clear: Partial<typeof schema.projects.$inferInsert>,
  ) => {
    if (!present) return;
    try {
      await run();
      await save(project.id, clear);
    } catch (err) {
      failures.push({ part, message: err instanceof Error ? err.message : String(err) });
    }
  };
  await remove("hosting", project.vercelProjectId, () => deleteProject(project.vercelProjectId!), {
    vercelProjectId: null,
    vercelProjectName: null,
    appUrl: null,
  });
  await remove("database", project.neonProjectId, () => deleteDatabase(project.neonProjectId!), {
    neonProjectId: null,
    neonDatabase: null,
    neonRole: null,
  });
  await remove("repository", project.repoFullName, () => deleteProjectRepo(project.repoFullName!), {
    repoFullName: null,
    repoUrl: null,
  });
  return failures;
}
