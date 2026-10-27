import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { AGENT_BY_ID, MAX_AGENTS, MIN_AGENTS, resolveAgents } from "@/lib/agents";
import { selfOrigin, startBuild } from "@/lib/build/engine";
import { infraConfigured } from "@/lib/build/infra";
import { listProjects, toProjectDTO } from "@/lib/data";
import { db, schema } from "@/lib/db";
import { createProjectRepo, githubConfigured } from "@/lib/github";
import { extractSpec } from "@/lib/spec/extract";
import { EMPTY_SPEC } from "@/lib/spec/templates";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { getT } from "@/lib/i18n/server";

export const maxDuration = 60;

export async function GET() {
  return NextResponse.json({ projects: await listProjects() });
}

const createSchema = (t: Dictionary) =>
  z.object({
    name: z.string().trim().min(2, t.errors.nameRequired).max(80),
    vision: z.string().trim().min(10, t.errors.visionRequired).max(4000),
    agentIds: z
      .array(z.string())
      .min(MIN_AGENTS, t.errors.pickMin(MIN_AGENTS))
      .max(MAX_AGENTS, t.errors.pickMax(MAX_AGENTS))
      .refine((ids) => ids.every((id) => AGENT_BY_ID[id]), t.errors.unknownAgent)
      .refine((ids) => new Set(ids).size === ids.length, t.errors.duplicateAgent),
  });

export async function POST(request: Request) {
  const { t } = await getT();
  const parsed = createSchema(t).safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? t.errors.invalidInput }, { status: 400 });
  }
  const { name, vision, agentIds } = parsed.data;

  // Classify (web app or game) and read the description into the spec right away, so the
  // kickoff huddle already knows which points are still open.
  const [created] = await db.insert(schema.projects).values({ name, vision, agentIds }).returning();
  const spec = await extractSpec({ scope: { projectId: created.id }, spec: EMPTY_SPEC, text: vision, source: "vision" });
  const [project] = await db.update(schema.projects).set({ spec }).where(eq(schema.projects.id, created.id)).returning();

  // The repository is part of the project, but a GitHub hiccup must not lose the project.
  let saved = project;
  if (githubConfigured()) {
    try {
      const repo = await createProjectRepo({ name, vision, team: resolveAgents(agentIds) });
      [saved] = await db
        .update(schema.projects)
        .set({ repoFullName: repo.fullName, repoUrl: repo.url, repoError: null })
        .where(eq(schema.projects.id, project.id))
        .returning();
    } catch (err) {
      console.error("[projects] repo creation failed", err);
      [saved] = await db
        .update(schema.projects)
        .set({ repoError: errorMessage(err) })
        .where(eq(schema.projects.id, project.id))
        .returning();
    }
  } else {
    [saved] = await db
      .update(schema.projects)
      .set({ repoError: "GitHub App is not configured." })
      .where(eq(schema.projects.id, project.id))
      .returning();
  }

  // Database, hosting and the starter app are set up in the background; the URL shows up
  // in the workspace within a minute or two.
  if (saved.repoFullName && infraConfigured()) {
    await startBuild(saved.id, "setup", selfOrigin(request)).catch((err) => console.error("[projects] setup failed to start", err));
  }

  return NextResponse.json({ project: toProjectDTO(saved) }, { status: 201 });
}

function errorMessage(err: unknown) {
  return err instanceof Error ? err.message.slice(0, 300) : "Unknown error";
}
