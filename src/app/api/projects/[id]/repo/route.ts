import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { resolveAgents } from "@/lib/agents";
import { selfOrigin, startBuild } from "@/lib/build/engine";
import { infraConfigured } from "@/lib/build/infra";
import { getProject, toProjectDTO } from "@/lib/data";
import { db, schema } from "@/lib/db";
import { createProjectRepo, githubConfigured } from "@/lib/github";
import { getT } from "@/lib/i18n/server";

export const maxDuration = 60;

/** Retries creating the project's GitHub repository after a failure. */
export async function POST(request: Request, ctx: RouteContext<"/api/projects/[id]/repo">) {
  const { id } = await ctx.params;
  const { t } = await getT();
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: t.errors.notFound }, { status: 404 });
  if (project.repoFullName) return NextResponse.json({ project: toProjectDTO(project) });
  if (!githubConfigured()) return NextResponse.json({ error: t.errors.githubNotConfigured }, { status: 503 });

  try {
    const repo = await createProjectRepo({
      name: project.name,
      vision: project.vision,
      team: resolveAgents(project.agentIds),
    });
    const [saved] = await db
      .update(schema.projects)
      .set({ repoFullName: repo.fullName, repoUrl: repo.url, repoError: null })
      .where(eq(schema.projects.id, id))
      .returning();
    if (infraConfigured()) await startBuild(id, "setup", selfOrigin(request));
    return NextResponse.json({ project: toProjectDTO(saved) });
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 300) : "Unknown error";
    await db.update(schema.projects).set({ repoError: message }).where(eq(schema.projects.id, id));
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
