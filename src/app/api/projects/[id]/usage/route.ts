import { NextResponse } from "next/server";
import { isUuid } from "@/lib/data";
import { getT } from "@/lib/i18n/server";
import { projectUsage } from "@/lib/usage";

/** Model tokens the project used: the discussion, building, and the latest rounds. */
export async function GET(_request: Request, ctx: RouteContext<"/api/projects/[id]/usage">) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: (await getT()).t.errors.notFound }, { status: 404 });
  return NextResponse.json({ usage: await projectUsage(id) });
}
