import { NextResponse } from "next/server";
import { getProject, requestCancel } from "@/lib/data";
import { getT } from "@/lib/i18n/server";

/** Asks the running discussion to stop after the current message. */
export async function POST(_req: Request, ctx: RouteContext<"/api/projects/[id]/stop">) {
  const { id } = await ctx.params;
  if (!(await getProject(id))) return NextResponse.json({ error: (await getT()).t.errors.notFound }, { status: 404 });
  await requestCancel(id);
  return NextResponse.json({ ok: true });
}
