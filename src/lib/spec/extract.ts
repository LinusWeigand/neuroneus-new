import "server-only";
import { generateText, Output } from "ai";
import { z } from "zod";
import { modelFor, structuredModelId } from "@/lib/ai";
import { recordUsage, type UsageScope } from "@/lib/usage";
import { type ProjectSpec, type SpecKind, specTemplate, WEB_APP_SPEC, WEB_GAME_SPEC } from "./templates";

// Reads what the human wrote (the vision, a chat message) into the spec: classifies web app
// versus web game, and fills the points the text actually answers. It never invents an
// answer the human didn't give: open points are asked later, most important first.

const KIND_CONFIDENCE = 0.75;

const schema = z.object({
  kind: z.enum(["web_app", "web_game", "unknown"]),
  kindConfidence: z.number(),
  answers: z.array(z.object({ key: z.string(), value: z.string() })),
  needsDatabase: z.enum(["yes", "no", "unknown"]),
});

function templateBlock(name: string, items: typeof WEB_APP_SPEC) {
  return `${name}:\n${items.map((i) => `- ${i.key}: ${i.guide}`).join("\n")}`;
}

export async function extractSpec(args: {
  scope: UsageScope;
  spec: ProjectSpec;
  text: string;
  source: "vision" | "chat";
  /** Recent conversation, so short replies ("yes, the second one") can be understood. */
  context?: string;
}): Promise<ProjectSpec> {
  const { spec } = args;
  const known = spec.kind
    ? templateBlock(spec.kind === "web_game" ? "Web game spec" : "Web app spec", specTemplate(spec.kind))
    : `${templateBlock("Web app spec", WEB_APP_SPEC)}\n\n${templateBlock("Web game spec", WEB_GAME_SPEC)}`;
  const current = Object.entries(spec.answers)
    .map(([k, v]) => `- ${k}: ${v.value}`)
    .join("\n");

  let output: z.infer<typeof schema>;
  const model = structuredModelId();
  try {
    const result = await generateText({
      model: modelFor(model),
      output: Output.object({ schema }),
      reasoning: "none",
      maxOutputTokens: 3000,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(45_000),
      providerOptions: { azure: { store: false } },
      instructions: `You maintain the product spec for a software project. A team of AI agents builds it as a web app (Next.js on Vercel, plus a Neon Postgres database only if data must be stored on a server). The stack is fixed; never record stack, framework, hosting or native-app answers.

${spec.kind ? `The project is a ${spec.kind === "web_game" ? "web game" : "web app"}.` : `First classify the project: "web_app" (a tool, site, dashboard, service) or "web_game" (something played: arcade, puzzle, quiz game, etc.). Use "unknown" with low confidence if the text doesn't make it clear.`}

${known}

Already answered (keep unless the human clearly changes them):
${current || "(nothing yet)"}

Rules:
- Fill only the points the human's text actually answers. Never guess, never fill a point from general assumptions.
- A point may be answered by an explicit statement ("no login", "just me") as well as a detailed one.
- If the human changes an earlier answer, return the new value for that key.
- value: concise, faithful to what the human said, max 40 words, in the human's language.
- keys: only the keys listed for the project's kind (or for the kind you classified).
- needsDatabase: "yes" if data must be stored on a server (survives across devices, shared between people, accounts, online leaderboard), "no" if nothing is stored or it only lives on the device, "unknown" if not clear yet.`,
      prompt: `${args.context ? `Recent conversation:\n${args.context}\n\n` : ""}The human's ${args.source === "vision" ? "project description" : "new message"}:\n${args.text}`,
    });
    output = result.output;
    await recordUsage(args.scope, "spec", model, result.usage);
  } catch (err) {
    console.error("[spec] extraction failed", err);
    return spec;
  }

  let kind: SpecKind | null = spec.kind;
  if (!kind && output.kind !== "unknown" && output.kindConfidence >= KIND_CONFIDENCE) kind = output.kind;

  const allowed = new Set(kind ? specTemplate(kind).map((i) => i.key) : []);
  const answers = { ...spec.answers };
  for (const a of output.answers) {
    const value = a.value.trim();
    if (allowed.has(a.key) && value) answers[a.key] = { value: value.slice(0, 400), source: args.source };
  }
  const needsDatabase =
    output.needsDatabase === "yes" ? true : output.needsDatabase === "no" ? false : spec.needsDatabase;
  return { ...spec, kind, answers, needsDatabase };
}

/** Whether the finished spec needs a server database, when the conversation never said so plainly. */
export async function inferDatabase(scope: UsageScope, spec: ProjectSpec): Promise<boolean> {
  const relevant = ["data", "access", "players_saving"].map((k) => spec.answers[k]?.value).filter(Boolean).join("\n");
  if (!relevant) return false;
  const model = structuredModelId();
  try {
    const { output, usage } = await generateText({
      model: modelFor(model),
      output: Output.object({ schema: z.object({ needsDatabase: z.boolean() }) }),
      reasoning: "none",
      maxOutputTokens: 500,
      abortSignal: AbortSignal.timeout(30_000),
      providerOptions: { azure: { store: false } },
      prompt: `Does this app need a server-side database (data survives across devices, is shared between people, accounts, or an online leaderboard)? Data that only lives on one device (browser storage) does not.\n\n${relevant}`,
    });
    await recordUsage(scope, "database", model, usage);
    return output.needsDatabase;
  } catch {
    return true; // safer to have storage than to lose data
  }
}
