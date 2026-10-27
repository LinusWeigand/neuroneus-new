import { waitUntil } from "@vercel/functions";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { z } from "zod";
import { aiConfigured } from "@/lib/ai";
import { acquireRunLock, getProject, releaseRunLock } from "@/lib/data";
import { selfOrigin } from "@/lib/build/engine";
import { executeRun, RunInputError } from "@/lib/engine/run";
import { getT } from "@/lib/i18n/server";
import type { RunEvent, TurnInput } from "@/lib/types";

// A full huddle (moderator + every agent + decision synthesis) takes 15–60 s.
export const maxDuration = 300;

const inputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("message"), content: z.string().trim().min(1).max(8000) }),
  z.object({
    kind: z.literal("answers"),
    requestMessageId: z.string().uuid(),
    answers: z
      .array(
        z.object({
          questionId: z.string(),
          header: z.string(),
          question: z.string(),
          choice: z.string().trim().min(1).max(500),
          isCustom: z.boolean(),
          wasRecommended: z.boolean(),
        }),
      )
      .min(1)
      .max(5),
  }),
]);

/**
 * Starts one turn of the group chat and streams its events as NDJSON. The run keeps going
 * (and keeps persisting) if the client disconnects; the client then catches up by polling.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/projects/[id]/turn">) {
  const { id } = await ctx.params;
  const { t } = await getT();
  if (!aiConfigured()) {
    return NextResponse.json({ error: t.errors.aiNotConfigured }, { status: 503 });
  }
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: t.errors.invalidInput }, { status: 400 });
  const input = parsed.data as TurnInput;

  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: t.errors.notFound }, { status: 404 });

  const runId = nanoid();
  if (!(await acquireRunLock(id, runId))) {
    return NextResponse.json({ error: t.errors.busy }, { status: 409 });
  }

  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let open = true;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
    cancel() {
      open = false;
    },
  });
  const emit = (event: RunEvent) => {
    if (!open) return;
    try {
      controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
    } catch {
      open = false;
    }
  };

  const work = (async () => {
    emit({ type: "run", runId });
    try {
      await executeRun({ project, runId, input, emit, origin: selfOrigin(request) });
    } catch (err) {
      console.error("[turn] run failed", err);
      emit({
        type: "error",
        error:
          err instanceof RunInputError
            ? err.code === "missingAnswer"
              ? t.errors.missingAnswer(err.detail ?? "")
              : t.errors[err.code]
            : t.errors.generic,
      });
    } finally {
      await releaseRunLock(id, runId).catch((err) => console.error("[turn] failed to release lock", err));
      emit({ type: "done" });
      if (open) {
        open = false;
        try {
          controller.close();
        } catch {}
      }
    }
  })();
  waitUntil(work);

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
