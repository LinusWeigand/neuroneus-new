import "server-only";
import { generateText, Output } from "ai";
import { z } from "zod";
import type { AgentDef } from "@/lib/agents";
import { modelFor, plannerModelId, reasoningFor } from "@/lib/ai";
import { recordUsage, type UsageScope } from "@/lib/usage";
import { type BuildContext, codeMap } from "./agent";
import type { FileMap } from "./repo";

const planSchema = z.object({
  tasks: z.array(
    z.object({
      title: z.string(),
      detail: z.string(),
    }),
  ),
});

export type PlannedTask = { title: string; detail: string; agentId: string };

/** The tech lead's plan for one build round: small, independently deployable slices. */
export async function planRound(args: {
  scope: UsageScope;
  ctx: BuildContext;
  builder: AgentDef;
  files: FileMap;
  transcript: string;
  round: number;
}): Promise<PlannedTask[]> {
  const { ctx } = args;
  const max = args.round <= 1 ? 5 : 4;
  const model = plannerModelId({ game: Boolean(ctx.kit) });

  const { output, usage } = await generateText({
    model: modelFor(model),
    output: Output.object({ schema: planSchema }),
    reasoning: reasoningFor(model, "low"),
    maxOutputTokens: 6000,
    maxRetries: 1,
    abortSignal: AbortSignal.timeout(90_000),
    providerOptions: { azure: { store: false } },
    instructions: `You are the tech lead of a team of AI agents building a real ${ctx.kind === "web_game" ? "web game" : "web app"} (Next.js 16, TypeScript, Tailwind CSS 4${ctx.database ? ", Neon Postgres" : ", no server database"}, deployed on Vercel). Plan build round ${args.round}.

Project: ${ctx.name}
Vision: ${ctx.vision}

Spec (complete; build exactly this, nothing it puts out of scope):
${ctx.spec}

${
      ctx.kit
        ? `Art direction: ${ctx.designName} (docs/ART-DIRECTION.md, tokens in game/theme.ts). The game is built on the ${ctx.kit.toUpperCase()} game kit (docs/GAME-KIT.md): the title screen, HUD, pause, game over, touch controls, sound, backdrop, art primitives and juice already exist; ${ctx.kit === "2d" ? "game/scenes/play-scene.ts" : "game/world.ts"} is a SAMPLE game to replace.`
        : `Design system: ${ctx.designName ? `${ctx.designName} (DESIGN.md in the repo). Every task builds to it.` : "none."}`
    }

Decisions the human made (respect them):
${ctx.decisions.map((d) => `- ${d.header}: ${d.choice}`).join("\n") || "None yet."}

Already shipped:
${ctx.shipped.map((s) => `- ${s}`).join("\n") || "Nothing yet: the app is a placeholder starter page."}

${args.builder.name} (${args.builder.role}) implements every task.

Rules:
- 1 to ${max} tasks, in build order, highest user value first. Each task is a vertical slice that is deployable on its own and visibly improves the app.
- ${
      args.round <= 1
        ? ctx.kit
          ? `The first task replaces the sample with the real core loop, playable end to end and already beautiful: the player, the world and the main objects built from the kit's art primitives as docs/ART-DIRECTION.md describes, juice and sound on every event, game/config.ts (title, tagline, controls, lives, touch buttons) updated. Then the remaining mechanics and content, then difficulty and progression. The last task of the round is always a polish pass: every event has feedback and sound, idle animations, a lively world, the first ten seconds easy and fun, touch controls right.`
          : ctx.kind === "web_game"
          ? "The first task makes the game playable end to end on the canvas shell: start screen, the core loop, game over and restart, styled with DESIGN.md's tokens. Later tasks add mechanics, progression and feedback."
          : "The first task sets up DESIGN.md's tokens and fonts, and replaces the placeholder with the real app shell and the core feature, so the human sees the product take shape immediately."
        : ctx.kit
          ? "Build on what's shipped. Don't redo it. Keep the polish: every new mechanic comes with its art, feedback and sound."
          : "Build on what's shipped. Don't redo it."
    }
- Keep each task small enough for one engineer in one sitting: a few files, no more.
- MVP scope only. No authentication, payments, email or third-party APIs that need keys, unless the human decided otherwise.
- title: max 6 words, product language (what the user gets), written in ${ctx.language}.
- detail: an implementation brief for the engineer (English): user-visible behavior and acceptance criteria, pages and routes, data tables and columns, edge states, and the files to create or change. Max 120 words.`,
    prompt: `Recent conversation:
${args.transcript || "(none)"}

Current files (size in characters, exports):
${codeMap(args.files)}

Plan the round.`,
  });
  await recordUsage(args.scope, "plan", model, usage);

  return output.tasks
    .filter((t) => t.title.trim() && t.detail.trim())
    .slice(0, max)
    .map((t) => ({
      title: t.title.trim().slice(0, 80),
      detail: t.detail.trim().slice(0, 2000),
      agentId: args.builder.id,
    }));
}
