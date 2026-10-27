import { NextResponse } from "next/server";
import { cancelBuild, latestBuild, selfOrigin, startBuild } from "@/lib/build/engine";
import { infraConfigured } from "@/lib/build/infra";
import { getProject } from "@/lib/data";
import { getT } from "@/lib/i18n/server";
import { specComplete } from "@/lib/spec/templates";

/** Starts a build round now (or queues one behind the round that's running). */
export async function POST(request: Request, ctx: RouteContext<"/api/projects/[id]/build">) {
  const { id } = await ctx.params;
  const { t } = await getT();
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: t.errors.notFound }, { status: 404 });
  if (!project.repoFullName) return NextResponse.json({ error: t.errors.noRepo }, { status: 409 });
  if (!infraConfigured()) return NextResponse.json({ error: t.errors.infraNotConfigured }, { status: 503 });
  // Development starts only when every spec point is answered.
  if (!specComplete(project.spec)) return NextResponse.json({ error: t.errors.specIncomplete }, { status: 409 });

  await startBuild(id, "build", selfOrigin(request));
  return NextResponse.json({ build: await latestBuild(id) });
}

/** Stops the running round after its current step. */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/projects/[id]/build">) {
  const { id } = await ctx.params;
  const { t } = await getT();
  if (!(await getProject(id))) return NextResponse.json({ error: t.errors.notFound }, { status: 404 });
  await cancelBuild(id);
  return NextResponse.json({ build: await latestBuild(id) });
}
