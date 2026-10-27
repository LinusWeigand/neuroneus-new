import "server-only";
import { randomUUID } from "node:crypto";
import { generateText, NoObjectGeneratedError, Output, smoothStream, streamText } from "ai";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { type AgentDef, resolveAgents } from "@/lib/agents";
import { chatModelId, modelFor, reasoningFor, structuredModelId } from "@/lib/ai";
import { startBuild } from "@/lib/build/engine";
import { infraConfigured } from "@/lib/build/infra";
import { getDecisions, getMessages, isCancelRequested, toDecisionDTO, toMessageDTO } from "@/lib/data";
import { db, schema } from "@/lib/db";
import type { ProjectRow } from "@/lib/db/schema";
import { designName } from "@/lib/design/catalog";
import { chooseDesign } from "@/lib/design/choose";
import { appendDecisions } from "@/lib/github";
import { DICTIONARIES } from "@/lib/i18n/dictionaries";
import { extractSpec } from "@/lib/spec/extract";
import { EMPTY_SPEC, openSpecPoints, type ProjectSpec, specComplete, specTemplate } from "@/lib/spec/templates";
import { humanLanguage } from "@/lib/build/language";
import { recordUsage, type UsageScope } from "@/lib/usage";
import type {
  DecisionAnswer,
  DecisionCard,
  DecisionQuestion,
  MessageDTO,
  RunEvent,
  TurnInput,
} from "@/lib/types";
import {
  agentInstructions,
  agentPrompt,
  formatTranscript,
  type Mode,
  planInstructions,
  planPrompt,
  type ProjectContext,
  specSynthesisInstructions,
  synthesisInstructions,
  synthesisPrompt,
} from "./prompts";

type Emit = (event: RunEvent) => void;

// Azure's Responses API stores generations for 30 days by default. We don't need that.
const providerOptions = { azure: { store: false } };

/** A problem with the owner's input. The API turns the code into a localized message. */
export type RunErrorCode = "noAgents" | "cardMissing" | "alreadyDecided" | "missingAnswer";

export class RunInputError extends Error {
  constructor(
    readonly code: RunErrorCode,
    readonly detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code);
  }
}

/**
 * Runs one turn of the group chat: records the human's input, has the moderator plan a short
 * huddle (who speaks on what), lets the agents talk, then distills the open questions into a
 * decision card for the human.
 *
 * Cost: agents' messages run on the cheapest chat model; the plan, spec reading and the card
 * on a small model without reasoning. One plan call per huddle, not one per turn.
 */
export async function executeRun(args: {
  project: ProjectRow;
  runId: string;
  input: TurnInput;
  emit: Emit;
  /** Where build steps call back to; decisions kick off a build round. */
  origin?: string;
}) {
  const { project, runId, input } = args;
  let lastStatus: string | null = null;
  const emit: Emit = (event) => {
    if (event.type === "status") {
      if (event.label === lastStatus) return;
      lastStatus = event.label;
    }
    args.emit(event);
  };
  const team = resolveAgents(project.agentIds);
  if (team.length === 0) throw new RunInputError("noAgents");
  const scope: UsageScope = { projectId: project.id };

  const [history, locked, builtRounds] = await Promise.all([
    getMessages(project.id, 120),
    getDecisions(project.id),
    db.select({ tasks: schema.builds.tasks }).from(schema.builds).where(eq(schema.builds.projectId, project.id)),
  ]);
  let spec: ProjectSpec = project.spec ?? EMPTY_SPEC;
  if (!project.spec) {
    // Projects from before specs existed: read what the human already said into one.
    const told = [
      project.vision,
      ...history.filter((m) => m.authorType === "user" && m.kind === "chat").map((m) => m.content),
      ...locked.map((d) => `Decided: ${d.header}: ${d.choice}`),
    ];
    spec = await saveSpec(project.id, EMPTY_SPEC, await extractSpec({ scope, spec, text: told.join("\n\n"), source: "vision" }));
  }
  const wasComplete = specComplete(spec);
  const ctx: ProjectContext = {
    name: project.name,
    vision: project.vision,
    team,
    lockedDecisions: locked.map((d) => ({ header: d.header, choice: d.choice })),
    shipped: builtRounds.flatMap((b) => b.tasks.filter((t) => t.status === "done").map((t) => t.summary || t.title)),
    ...specContext(spec),
    language: humanLanguage(humanTexts(history, project)),
  };

  let mode: Mode;
  let mentioned: AgentDef[] = [];
  let repoLog: Promise<void> | null = null;

  if (input.kind === "message") {
    // A new message moves the conversation on; any unanswered card is superseded.
    for (const m of history) {
      if (m.kind === "decision_request" && m.data?.type === "decision_card" && m.data.status === "pending") {
        const data: DecisionCard = { ...m.data, status: "superseded" };
        const updated = await updateMessageData(m.id, data);
        if (updated) {
          Object.assign(m, updated);
          emit({ type: "message", message: updated });
        }
      }
    }
    const userMsg = await insertMessage({
      projectId: project.id,
      authorType: "user",
      kind: "chat",
      content: input.content,
      runId,
    });
    history.push(userMsg);
    emit({ type: "message", message: userMsg });

    // Read the message into the spec first, so the team works on what's really still open.
    emit({ type: "status", label: "reading" });
    spec = await saveSpec(project.id, spec, await extractSpec({
      scope,
      spec,
      text: input.content,
      source: "chat",
      context: formatTranscript(history.slice(-10, -1)),
    }));
    Object.assign(ctx, specContext(spec));

    mentioned = parseMentions(input.content, team);
    if (!wasComplete && specComplete(spec)) {
      mode = "ack";
      ctx.specJustCompleted = true;
    } else {
      mode = mentioned.length > 0 ? "direct" : "open";
    }
  } else {
    const request = history.find((m) => m.id === input.requestMessageId);
    if (!request || request.data?.type !== "decision_card") throw new RunInputError("cardMissing");
    if (request.data.status !== "pending") throw new RunInputError("alreadyDecided");

    const answers = sanitizeAnswers(request.data, input.answers);
    const card: DecisionCard = { ...request.data, status: "answered", answers };

    // Spec questions write straight into the spec.
    let kindChanged = false;
    for (const a of answers) {
      if (!a.questionId.startsWith("spec:")) continue;
      const key = a.questionId.slice(5);
      if (key === "kind") {
        const kind = a.value === "web_app" || a.value === "web_game" ? a.value : /game|spiel|play/i.test(a.choice) ? "web_game" : "web_app";
        kindChanged = kind !== spec.kind;
        spec = { ...spec, kind };
      } else {
        // Keep the substance: an option's label alone ("Minimal HUD") is too thin to build from.
        const option = request.data.questions.find((q) => q.id === a.questionId)?.options.find((o) => o.label === a.choice);
        const value = option ? `${option.label}: ${option.description}` : a.choice;
        spec = { ...spec, answers: { ...spec.answers, [key]: { value, source: "decision" } } };
      }
    }
    if (kindChanged) {
      // New template: fill what the human already told us before asking anything.
      const told = [project.vision, ...history.filter((m) => m.authorType === "user" && m.kind === "chat").map((m) => m.content)];
      spec = await extractSpec({ scope, spec, text: told.join("\n\n"), source: "vision" });
    }
    spec = await saveSpec(project.id, project.spec ?? EMPTY_SPEC, spec);
    Object.assign(ctx, specContext(spec));
    const updated = await updateMessageData(request.id, card);
    if (updated) {
      Object.assign(request, updated);
      emit({ type: "message", message: updated });
    }

    await db.insert(schema.decisions).values(
      answers.map((a) => ({
        projectId: project.id,
        requestMessageId: request.id,
        header: a.header,
        question: a.question,
        choice: a.choice,
        isCustom: a.isCustom,
        wasRecommended: a.wasRecommended,
      })),
    );
    ctx.lockedDecisions.push(...answers.map((a) => ({ header: a.header, choice: a.choice })));

    const answerMsg = await insertMessage({
      projectId: project.id,
      authorType: "user",
      kind: "decision_answer",
      content: answers.map((a) => `${a.header}: ${a.choice}`).join("\n"),
      data: { type: "decision_answer", requestMessageId: request.id, answers },
      runId,
    });
    history.push(answerMsg);
    emit({ type: "message", message: answerMsg });
    const all = await db
      .select()
      .from(schema.decisions)
      .where(eq(schema.decisions.projectId, project.id))
      .orderBy(schema.decisions.createdAt);
    emit({ type: "decisions", decisions: all.map(toDecisionDTO) });

    if (project.repoFullName) {
      const repo = project.repoFullName;
      repoLog = appendDecisions(repo, answers)
        .then(async ({ url }) => {
          const note = await insertMessage({
            projectId: project.id,
            authorType: "moderator",
            kind: "note",
            content: `Logged ${answers.length === 1 ? "1 decision" : `${answers.length} decisions`} to [${repo}/docs/DECISIONS.md](${url})`,
            data: { type: "repo_log", count: answers.length, repo, url },
            runId,
          });
          emit({ type: "message", message: note });
        })
        .catch((err) => console.error("[run] failed to log decisions to GitHub", err));
    }
    if (!specComplete(spec)) {
      // Still open points: a short round on the next ones, then the next card.
      mode = "spec";
    } else {
      mode = "ack";
      ctx.specJustCompleted = !wasComplete;
      // Decisions on a complete spec are the signal to build the next round.
      if (wasComplete && args.origin && project.repoFullName && infraConfigured()) {
        await startBuild(project.id, "build", args.origin).catch((err) => console.error("[run] build failed to start", err));
      }
    }
  }

  // The newest human message decides the language everyone answers in.
  ctx.language = humanLanguage(humanTexts(history, project));
  const cancelled = await discuss({ ctx, mode, mentioned, history, project, runId, emit });

  if (!cancelled && mode !== "ack") {
    await synthesize({ ctx, history, project, runId, emit });
  }
  if (ctx.specJustCompleted) {
    await specCompleted({ project: { ...project, spec }, spec, runId, emit, origin: args.origin });
  }
  emit({ type: "status", label: null });
  if (repoLog) await repoLog;
}

// ─── Discussion ─────────────────────────────────────────────────────────────

async function discuss(args: {
  ctx: ProjectContext;
  mode: Mode;
  mentioned: AgentDef[];
  history: MessageDTO[];
  project: ProjectRow;
  runId: string;
  emit: Emit;
}): Promise<boolean> {
  const { ctx, mode, mentioned, history, project, runId, emit } = args;
  if (await isCancelRequested(project.id, runId)) return true;

  emit({ type: "status", label: "reading" });
  const turns = await planHuddle({ ctx, mode, mentioned, history, projectId: project.id });

  let failures = 0;
  for (const turn of turns) {
    if (await isCancelRequested(project.id, runId)) return true;
    emit({ type: "status", label: null });
    emit({ type: "typing", agentId: turn.agent.id });
    const msg = await speak({ agent: turn.agent, focus: turn.focus, ctx, history, project, runId, emit });
    if (!msg) {
      if (++failures >= 2) throw new Error("The model failed twice in a row. Check the Azure deployment and quota.");
      continue;
    }
    failures = 0;
    history.push(msg);
  }
  return false;
}

const FALLBACK_FOCUS = "Add the one point from your area the others missed. Challenge anything you disagree with.";

type Turn = { agent: AgentDef; focus: string };

/**
 * The huddle's running order, planned in one call. Guardrails the model can't talk its way
 * around: required speakers always get a turn, nobody speaks twice in a row, at most maxTurns.
 */
async function planHuddle(args: {
  ctx: ProjectContext;
  mode: Mode;
  mentioned: AgentDef[];
  history: MessageDTO[];
  projectId: string;
}): Promise<Turn[]> {
  const { ctx, mode, mentioned } = args;
  const team = ctx.team;

  // Confirming a decision needs one voice, not a plan.
  if (mode === "ack") {
    const lead = ["nova", "atlas"].map((id) => team.find((a) => a.id === id)).find(Boolean) ?? team[0];
    return [
      {
        agent: lead,
        focus: ctx.specJustCompleted
          ? "Confirm in one or two sentences that the spec is complete, the team starts building now, and what the human sees first."
          : "Confirm in one or two sentences what the human just settled and what the team does next.",
      },
    ];
  }

  const maxTurns =
    mode === "open"
      ? team.length + (team.length >= 3 ? 1 : 0)
      : mode === "direct"
        ? Math.min(team.length, mentioned.length + 1)
        : Math.min(3, team.length);
  const required = mode === "open" ? team : mode === "direct" ? mentioned : [];

  let planned: { agentId: string; focus: string }[] = [];
  const model = structuredModelId();
  const ids = team.map((a) => a.id) as [string, ...string[]];
  const planSchema = z.object({ turns: z.array(z.object({ agentId: z.enum(ids), focus: z.string() })) });
  try {
    const { output, usage } = await generateText({
      model: modelFor(model),
      instructions: planInstructions(ctx, mode, mentioned, maxTurns),
      prompt: planPrompt(formatTranscript(args.history)),
      output: Output.object({ schema: planSchema }),
      reasoning: "none",
      maxOutputTokens: 600,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(20_000),
      providerOptions,
    });
    await recordUsage({ projectId: args.projectId }, "huddle_plan", model, usage);
    planned = output.turns;
  } catch (err) {
    // Some models occasionally emit several objects back to back; the first one is the answer.
    const recovered = NoObjectGeneratedError.isInstance(err) ? firstJsonObject(err.text, planSchema) : null;
    if (recovered) planned = recovered.turns;
    else console.warn("[run] huddle plan failed, using roster order:", err instanceof Error ? err.message : err);
  }

  const turns: Turn[] = [];
  const add = (agent: AgentDef | undefined, focus: string) => {
    if (!agent || turns.length >= maxTurns || turns.at(-1)?.agent.id === agent.id) return;
    if (turns.filter((t) => t.agent.id === agent.id).length >= 2) return;
    turns.push({ agent, focus: focus.trim() || FALLBACK_FOCUS });
  };
  // Required speakers first in direct mode; everyone else in the planned order.
  if (mode === "direct") for (const a of mentioned) add(a, planned.find((p) => p.agentId === a.id)?.focus ?? FALLBACK_FOCUS);
  for (const p of planned) {
    const agent = team.find((a) => a.id === p.agentId);
    // Leave room for required speakers who haven't been planned yet.
    const missing = required.filter((r) => r.id !== agent?.id && !turns.some((t) => t.agent.id === r.id));
    if (agent && !required.includes(agent) && missing.length >= maxTurns - turns.length) continue;
    if (agent && mode === "open" && turns.some((t) => t.agent.id === agent.id) && missing.length > 0) continue;
    add(agent, p.focus);
  }
  for (const r of required) if (!turns.some((t) => t.agent.id === r.id)) add(r, FALLBACK_FOCUS);
  if (turns.length === 0) add(team[0], FALLBACK_FOCUS);
  return turns;
}

async function speak(args: {
  agent: AgentDef;
  focus: string;
  ctx: ProjectContext;
  history: MessageDTO[];
  project: ProjectRow;
  runId: string;
  emit: Emit;
}): Promise<MessageDTO | null> {
  const { agent, focus, ctx, history, project, runId, emit } = args;
  const id = randomUUID();
  const createdAt = new Date();
  emit({ type: "start", id, agentId: agent.id, createdAt: createdAt.toISOString() });

  let text = "";
  let pending = "";
  let prefixChecked = false;
  const model = chatModelId();
  try {
    const result = streamText({
      model: modelFor(model),
      instructions: agentInstructions(agent, ctx),
      prompt: agentPrompt(agent, ctx, formatTranscript(history), focus),
      reasoning: reasoningFor(model, "low"),
      maxOutputTokens: 300,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(60_000),
      providerOptions,
      experimental_transform: smoothStream({ delayInMs: 14, chunking: "word" }),
    });
    for await (const chunk of result.textStream) {
      // The chat stays at requirements level: never render code formatting.
      const delta = chunk.replace(/`/g, "");
      if (!prefixChecked) {
        // Hold back the first characters so a "Nova:" style prefix never reaches the client.
        pending += delta;
        if (pending.length < agent.name.length + 6 && !pending.includes("\n")) continue;
        pending = stripNamePrefix(pending, agent).replace(/^\s+/, "");
        prefixChecked = true;
        if (pending) {
          text += pending;
          emit({ type: "delta", id, text: pending });
        }
        continue;
      }
      text += delta;
      emit({ type: "delta", id, text: delta });
    }
    if (!prefixChecked && pending) {
      const rest = stripNamePrefix(pending, agent).replace(/^\s+/, "");
      text += rest;
      if (rest) emit({ type: "delta", id, text: rest });
    }
    await recordUsage({ projectId: project.id }, "chat", model, await result.usage);
  } catch (err) {
    console.error(`[run] ${agent.name} failed to speak`, err);
    if (!text.trim()) {
      emit({ type: "discard", id });
      return null;
    }
    text = text.trimEnd() + "…";
  }

  text = text.trim();
  if (!text) {
    emit({ type: "discard", id });
    return null;
  }
  const msg = await insertMessage({
    id,
    projectId: project.id,
    authorType: "agent",
    agentId: agent.id,
    kind: "chat",
    content: text,
    runId,
    createdAt,
  });
  emit({ type: "end", message: msg });
  return msg;
}

function stripNamePrefix(text: string, agent: AgentDef) {
  const name = agent.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(`^\\s*\\**${name}\\**(\\s*\\([^)]*\\))?\\s*:\\s*`, "i"), "");
}

// ─── Decision synthesis ─────────────────────────────────────────────────────

const synthesisSchema = z.object({
  summary: z.string(),
  questions: z.array(
    z.object({
      header: z.string(),
      question: z.string(),
      options: z.array(
        z.object({
          label: z.string(),
          description: z.string(),
          recommended: z.boolean(),
          championedBy: z.array(z.string()),
        }),
      ),
    }),
  ),
});

async function synthesize(args: {
  ctx: ProjectContext;
  history: MessageDTO[];
  project: ProjectRow;
  runId: string;
  emit: Emit;
}) {
  const { ctx, history, project, runId, emit } = args;
  if (await isCancelRequested(project.id, runId)) return;
  emit({ type: "status", label: "preparing" });

  // While the spec is incomplete, the card asks the most important open points (up to 3).
  const points = ctx.specOpen.slice(0, 3);
  if (points[0]?.key === "kind") {
    await postCard(kindCard(ctx.language), project.id, runId, emit);
    emit({ type: "status", label: null });
    return;
  }

  let raw: z.infer<typeof synthesisSchema>;
  const model = structuredModelId();
  try {
    const { output, usage } = await generateText({
      model: modelFor(model),
      instructions: points.length ? specSynthesisInstructions(ctx, points) : synthesisInstructions(ctx),
      prompt: synthesisPrompt(ctx, formatTranscript(history)),
      output: Output.object({ schema: synthesisSchema }),
      reasoning: "none",
      maxOutputTokens: 3000,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(60_000),
      providerOptions,
    });
    raw = output;
    await recordUsage({ projectId: project.id }, "card", model, usage);
  } catch (err) {
    console.error("[run] decision synthesis failed", err);
    emit({ type: "status", label: null });
    return;
  }

  const card = normalizeCard(raw, ctx.team, points.length ? points.map((p) => `spec:${p.key}`) : undefined);
  emit({ type: "status", label: null });
  if (card) await postCard(card, project.id, runId, emit);
}

async function postCard(card: DecisionCard, projectId: string, runId: string, emit: Emit) {
  const msg = await insertMessage({
    projectId,
    authorType: "moderator",
    kind: "decision_request",
    content: card.summary,
    data: card,
    runId,
  });
  emit({ type: "message", message: msg });
}

const clip = (s: string, n: number) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t;
};

/** Cleans up a model-written card. `ids` (spec questions) pins each question to its spec point. */
export function normalizeCard(raw: z.infer<typeof synthesisSchema>, team: AgentDef[], ids?: string[]): DecisionCard | null {
  const teamIds = new Set(team.map((a) => a.id));
  const questions: DecisionQuestion[] = raw.questions
    .map((q, i) => {
      const options = q.options
        .filter((o) => o.label.trim())
        .slice(0, 3)
        .map((o) => ({
          label: clip(o.label, 60),
          description: clip(o.description, 200),
          recommended: o.recommended,
          championedBy: [...new Set(o.championedBy.filter((id) => teamIds.has(id)))],
        }));
      // Exactly one recommended option, always listed first.
      const rec = Math.max(0, options.findIndex((o) => o.recommended));
      options.forEach((o, j) => (o.recommended = j === rec));
      if (options.length) options.unshift(...options.splice(rec, 1));
      return {
        id: ids?.[i] ?? `q${i + 1}`,
        header: clip(q.header, 16),
        question: clip(q.question, 240),
        options,
      };
    })
    .slice(0, ids ? ids.length : 3)
    .filter((q) => q.question && q.options.length >= 2);

  if (questions.length === 0) return null;
  return { type: "decision_card", status: "pending", summary: clip(raw.summary, 280), questions };
}

function sanitizeAnswers(card: DecisionCard, answers: DecisionAnswer[]): DecisionAnswer[] {
  const out: DecisionAnswer[] = [];
  for (const q of card.questions) {
    const a = answers.find((x) => x.questionId === q.id);
    const choice = a?.choice?.trim();
    if (!choice) throw new RunInputError("missingAnswer", q.header);
    const option = q.options.find((o) => o.label === choice);
    out.push({
      questionId: q.id,
      header: q.header,
      question: q.question,
      choice: clip(choice, 500),
      isCustom: !option,
      wasRecommended: Boolean(option?.recommended),
      value: option?.value,
    });
  }
  return out;
}

// ─── Spec ───────────────────────────────────────────────────────────────────

const SPEC_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(DICTIONARIES.en.spec.items).map(([k, v]) => [k, v.label]),
);

function specContext(spec: ProjectSpec): Pick<ProjectContext, "kind" | "specSummary" | "specOpen"> {
  const guides = spec.kind ? Object.fromEntries(specTemplate(spec.kind).map((i) => [i.key, i.guide])) : {};
  const answered = Object.entries(spec.answers)
    .filter(([, a]) => a.value?.trim())
    .map(([k, a]) => `- ${SPEC_LABELS[k] ?? k}: ${a.value}`);
  return {
    kind: spec.kind,
    specSummary: answered.length ? answered.join("\n") : "(nothing answered yet)",
    specOpen: openSpecPoints(spec).map((key) => ({
      key,
      label: SPEC_LABELS[key] ?? key,
      guide:
        key === "kind"
          ? "Is this a web app (a tool, site or service people use) or a web game (something people play)?"
          : (guides[key] ?? ""),
    })),
  };
}

async function saveSpec(projectId: string, before: ProjectSpec, after: ProjectSpec) {
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    await db.update(schema.projects).set({ spec: after }).where(eq(schema.projects.id, projectId));
  }
  return after;
}

function humanTexts(history: MessageDTO[], project: ProjectRow) {
  const texts = history.filter((m) => m.authorType === "user" && m.kind === "chat").map((m) => m.content);
  return [...texts.reverse(), project.vision];
}

/** The first question when the description doesn't make it clear: app or game. */
function kindCard(language: "German" | "English"): DecisionCard {
  const de = language === "German";
  return {
    type: "decision_card",
    status: "pending",
    summary: de
      ? "Bevor das Team die Spezifikation aufbaut: Was soll entstehen?"
      : "Before the team shapes the spec: what are we making?",
    questions: [
      {
        id: "spec:kind",
        header: de ? "App oder Spiel" : "App or game",
        question: de ? "Ist das eine Web-App oder ein Web-Spiel?" : "Is this a web app or a web game?",
        options: [
          {
            label: de ? "Web-App" : "Web app",
            value: "web_app",
            description: de
              ? "Ein Werkzeug, eine Website oder ein Dienst, mit dem Menschen etwas erledigen."
              : "A tool, site or service people use to get something done.",
            recommended: false,
            championedBy: [],
          },
          {
            label: de ? "Web-Spiel" : "Web game",
            value: "web_game",
            description: de
              ? "Etwas, das man im Browser spielt: Arcade, Puzzle, Quiz und mehr."
              : "Something people play in the browser: arcade, puzzle, quiz and more.",
            recommended: false,
            championedBy: [],
          },
        ],
      },
    ],
  };
}

/** The spec just became complete: pick the design system, say so, and start building. */
async function specCompleted(args: { project: ProjectRow; spec: ProjectSpec; runId: string; emit: Emit; origin?: string }) {
  const { project, spec, runId, emit } = args;
  try {
    let slug = project.designSlug;
    if (!slug) {
      slug = await chooseDesign({ projectId: project.id }, { name: project.name, vision: project.vision, spec });
      await db.update(schema.projects).set({ designSlug: slug }).where(eq(schema.projects.id, project.id));
    }
    const kind = spec.kind ?? "web_app";
    const note = await insertMessage({
      projectId: project.id,
      authorType: "moderator",
      kind: "note",
      content: `Spec complete: ${kind === "web_game" ? "web game" : "web app"}, ${designName(slug)} design. The team starts building.`,
      data: { type: "spec_complete", kind, design: designName(slug) },
      runId,
    });
    emit({ type: "message", message: note });
  } catch (err) {
    // The build's own setup picks a design if this didn't; never let it block building.
    console.error("[run] spec completion note failed", err);
  }
  if (args.origin && project.repoFullName && infraConfigured()) {
    await startBuild(project.id, "build", args.origin).catch((err) => console.error("[run] build failed to start", err));
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function firstJsonObject<T>(text: string | undefined, schema: z.ZodType<T>): T | null {
  if (!text) return null;
  let depth = 0;
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) {
      try {
        const parsed = schema.safeParse(JSON.parse(text.slice(text.indexOf("{"), i + 1)));
        return parsed.success ? parsed.data : null;
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function parseMentions(content: string, team: AgentDef[]) {
  if (/@(all|team|everyone)\b/i.test(content)) return [];
  return team.filter((a) => new RegExp(`@${a.name}\\b`, "i").test(content));
}

async function insertMessage(values: typeof schema.messages.$inferInsert) {
  const [row] = await db.insert(schema.messages).values(values).returning();
  return toMessageDTO(row);
}

async function updateMessageData(id: string, data: DecisionCard) {
  const [row] = await db
    .update(schema.messages)
    .set({ data, updatedAt: sql`now()` })
    .where(eq(schema.messages.id, id))
    .returning();
  return row ? toMessageDTO(row) : null;
}
