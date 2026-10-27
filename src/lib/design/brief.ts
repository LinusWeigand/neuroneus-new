import "server-only";
import { generateText } from "ai";
import { modelFor, structuredModelId } from "@/lib/ai";
import { recordUsage, type UsageScope } from "@/lib/usage";

/**
 * A DESIGN.md is 5–10k tokens; the builder would carry it in every model step. The brief
 * keeps what every screen needs (exact tokens, type, component rules, do's and don'ts) in
 * about 1.5k tokens, and the builder looks up the full file only for the rest.
 */
export async function designBrief(scope: UsageScope, design: { name: string; markdown: string }): Promise<string | null> {
  const model = structuredModelId();
  try {
    const { text, usage } = await generateText({
      model: modelFor(model),
      reasoning: "low",
      maxOutputTokens: 4000,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(90_000),
      providerOptions: { azure: { store: false } },
      instructions: `You condense a design system (a DESIGN.md) into a brief for the engineer who builds every screen of an app with it. The engineer reads only the brief for most work, so it must be exact.

Write Markdown, at most 5500 characters, with these sections:
1. Tokens: every color with its exact value and role (background, surface, text, muted, border, accent, success, error...), radii, spacing scale, shadows. Exact values, never approximations.
2. Typography: font families (name the closest Google Font when the original is proprietary), and the scale: size, weight, line height and letter spacing per role (display, headings, body, caption, buttons).
3. Components: buttons (variants and states), inputs, cards, navigation, lists: what each looks like in a line or two.
4. Layout and feel: grid, density, imagery, motion.
5. Do's and don'ts: the rules that make it look right, and what breaks it.

No preamble, no brand history, nothing about the brand itself.`,
      prompt: `DESIGN.md of the ${design.name} design system:\n\n${design.markdown}`,
    });
    await recordUsage(scope, "design_brief", model, usage);
    const brief = text.trim();
    return brief.length > 400 ? `# Design brief: ${design.name}\n\nThe essentials of DESIGN.md. Exact values; DESIGN.md has the rest.\n\n${brief}\n` : null;
  } catch (err) {
    console.error("[design] brief failed", err);
    return null;
  }
}
