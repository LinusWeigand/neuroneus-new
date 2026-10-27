import "server-only";
import { generateText, Output } from "ai";
import { z } from "zod";
import { modelFor, structuredModelId } from "@/lib/ai";
import { recordUsage, type UsageScope } from "@/lib/usage";
import { type ProjectSpec, specText } from "@/lib/spec/templates";
import { type GameRender, hasGameKit } from "@/lib/build/game-kit";
import { chooseArt } from "./art-direction";
import { DESIGN_SLUGS } from "./catalog";
import { designOptions } from "./load";

/**
 * Picks the look: for a web app the design system that fits its audience and mood best, for
 * a game an art direction and whether it's 2D or 3D.
 */
export async function chooseDesign(
  scope: UsageScope,
  input: { name: string; vision: string; spec: ProjectSpec },
): Promise<{ slug: string; render: GameRender | null }> {
  if (input.spec.kind === "web_game") {
    const art = await chooseArt(scope, input);
    return { slug: art.slug, render: hasGameKit(art.render) ? art.render : "2d" };
  }
  return { slug: await chooseAppDesign(scope, input), render: null };
}

async function chooseAppDesign(scope: UsageScope, input: { name: string; vision: string; spec: ProjectSpec }): Promise<string> {
  const fallback = "linear.app";
  const model = structuredModelId();
  try {
    const options = await designOptions();
    const { output, usage } = await generateText({
      model: modelFor(model),
      output: Output.object({
        schema: z.object({ slug: z.enum(DESIGN_SLUGS as [string, ...string[]]), reason: z.string() }),
      }),
      reasoning: "none",
      maxOutputTokens: 1500,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(60_000),
      providerOptions: { azure: { store: false } },
      instructions: `You are the design lead. Pick the one design system (a DESIGN.md) this web app will be built with. Match the audience, the mood the human asked for, and the kind of product: content-heavy tools need calm, readable systems; consumer and playful products can take bolder ones. The brand name is only a style reference; nothing of the brand itself appears in the app.

Design systems (slug: description):
${options.map((o) => `- ${o.slug}: ${o.description}`).join("\n")}`,
      prompt: `Project: ${input.name}\nVision: ${input.vision}\n\nSpec:\n${specText(input.spec)}`,
    });
    await recordUsage(scope, "design", model, usage);
    return output.slug;
  } catch (err) {
    console.error("[design] choice failed, using the default", err);
    return fallback;
  }
}
