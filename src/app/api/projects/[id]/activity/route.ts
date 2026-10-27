import { NextResponse } from "next/server";
import { buildEvents, selfOrigin, watchBuild } from "@/lib/build/engine";
import { getProject, lastMessageSeq, toProjectDTO } from "@/lib/data";
import { getT } from "@/lib/i18n/server";

/**
 * The cheap poll behind the live build view: build state, the "now" line, new log events
 * since `after`, and the newest message seq (the client fetches the chat only when it grew).
 */
export async function GET(request: Request, ctx: RouteContext<"/api/projects/[id]/activity">) {
  const { id } = await ctx.params;
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: (await getT()).t.errors.notFound }, { status: 404 });

  const url = new URL(request.url);
  const after = Number(url.searchParams.get("after")) || 0;
  const build = await watchBuild(id, selfOrigin(request));
  // A new round restarts the log; `after` refers to the round the client was watching.
  const sameRound = url.searchParams.get("build") === build?.id;
  const [events, lastSeq] = await Promise.all([
    build ? buildEvents(build.id, sameRound ? after : 0) : [],
    lastMessageSeq(id),
  ]);
  return NextResponse.json({ project: toProjectDTO(project), build, events, lastSeq });
}
