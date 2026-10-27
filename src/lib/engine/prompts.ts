import type { AgentDef } from "@/lib/agents";
import { AGENT_BY_ID } from "@/lib/agents";
import type { DecisionAnswerData, DecisionCard, MessageDTO } from "@/lib/types";

/** open: everyone weighs in. direct: @mentioned agents answer. spec: a short round on the next open spec points. ack: one agent confirms. */
export type Mode = "open" | "direct" | "spec" | "ack";

export type SpecPoint = { key: string; label: string; guide: string };

export type ProjectContext = {
  name: string;
  vision: string;
  team: AgentDef[];
  lockedDecisions: { header: string; choice: string }[];
  /** What the builders already shipped to the live app. */
  shipped: string[];
  /** "web app" / "web game" / null while undecided. */
  kind: "web_app" | "web_game" | null;
  /** The spec answered so far, as text. */
  specSummary: string;
  /** Open required spec points, most important first. Empty when the spec is complete. */
  specOpen: SpecPoint[];
  /** Set when this turn just completed the spec: the confirming agent announces the build. */
  specJustCompleted?: boolean;
  /** The human's language, decided in code: small models don't reliably follow "match the human". */
  language: "German" | "English";
};

function teamList(team: AgentDef[], withIds = false) {
  return team
    .map((a) => `- ${withIds ? `${a.id} — ` : ""}${a.name} (${a.role}): owns ${a.owns.join(", ").toLowerCase()}`)
    .join("\n");
}

function shippedList(ctx: ProjectContext) {
  if (!ctx.shipped.length) return "Nothing yet. Once the human decides, the team builds and deploys the app automatically.";
  return ctx.shipped.map((s) => `- ${s}`).join("\n");
}

function specBlock(ctx: ProjectContext) {
  const kind = ctx.kind === "web_game" ? "a web game" : ctx.kind === "web_app" ? "a web app" : "not decided yet (web app or web game?)";
  if (!ctx.specOpen.length) return `Spec (complete): this is ${kind}.\n${ctx.specSummary}`;
  return `Spec so far: this is ${kind}.
${ctx.specSummary}

Open spec points the human still has to answer, most important first (nothing gets built until all are answered):
${ctx.specOpen.map((p, i) => `${i + 1}. ${p.label}: ${p.guide}`).join("\n")}`;
}

function lockedList(ctx: ProjectContext) {
  if (!ctx.lockedDecisions.length) return "None yet.";
  return ctx.lockedDecisions.map((d) => `- ${d.header}: ${d.choice}`).join("\n");
}

/** About 2.5k tokens: the huddle needs the recent thread; the spec and decisions carry the rest. */
const MAX_TRANSCRIPT_CHARS = 10_000;

/** Renders the chat as a plain-text transcript all models read. Newest last. */
export function formatTranscript(messages: MessageDTO[], maxChars = MAX_TRANSCRIPT_CHARS): string {
  const lines: string[] = [];
  for (const m of messages) {
    if (m.kind === "chat") {
      if (m.authorType === "user") lines.push(`Human: ${m.content}`);
      else if (m.agentId) {
        const a = AGENT_BY_ID[m.agentId];
        lines.push(`${a ? `${a.name} (${a.role})` : m.agentId}: ${m.content}`);
      }
    } else if (m.kind === "decision_request" && m.data?.type === "decision_card") {
      const card = m.data as DecisionCard;
      const qs = card.questions
        .map((q) => `  - ${q.question} Options: ${q.options.map((o) => o.label + (o.recommended ? " (recommended)" : "")).join(" / ")}`)
        .join("\n");
      lines.push(`Moderator asked the human to decide:\n${qs}`);
    } else if (m.kind === "decision_answer" && m.data?.type === "decision_answer") {
      const data = m.data as DecisionAnswerData;
      lines.push(`Human decided:\n${data.answers.map((a) => `  - ${a.header}: ${a.choice}`).join("\n")}`);
    }
  }
  // Keep the most recent part of the conversation within budget.
  let out = "";
  for (let i = lines.length - 1; i >= 0; i--) {
    const next = lines[i] + "\n\n" + out;
    if (next.length > maxChars) {
      out = "[earlier messages omitted]\n\n" + out;
      break;
    }
    out = next;
  }
  return out.trim();
}

/** What the group chat is for. Every prompt shares it so the whole team stays at this altitude. */
const SCOPE = `This chat with the human is about requirements and architecture only.
- In scope: who it's for and the problem it solves, features and MVP scope, user flows, game design (core loop, rules, controls, progression) for games, constraints (budget, timeline, compliance), quality goals (security, privacy, performance, reliability), the building blocks and how they fit together, data ownership, integrations, risks and tradeoffs.
- The stack is fixed and never up for discussion or a question to the human: a web app (Next.js) deployed on Vercel, plus a Neon Postgres database only if data must be stored on a server. Never debate frameworks, languages, hosting, databases, or native apps versus web.
- Out of scope: implementation details. No code, no function, variable, endpoint, table, column or file names, no schemas or data structures, no library APIs, algorithms or config values, no backticks. If a point only matters once someone writes the code, leave it out.`;

// ─── Agent voice ────────────────────────────────────────────────────────────

/**
 * What every agent in the huddle shares comes first and their own role last, so consecutive
 * speakers reuse the same cached prompt prefix.
 */
export function agentInstructions(agent: AgentDef, ctx: ProjectContext) {
  return `You are one of a small team of AI agents planning and building software together with a human in a group chat.

Project: ${ctx.name}
Vision: ${ctx.vision}

Team:
${teamList(ctx.team)}

Decisions the human already locked (build on them, don't relitigate unless something is badly wrong):
${lockedList(ctx)}

Already built and live in the app:
${shippedList(ctx)}

${specBlock(ctx)}

${SCOPE}
${ctx.specOpen.length ? "\nWhile spec points are open, that's the team's job: propose concrete options for the open point closest to your area, with the tradeoff, so the human can decide quickly.\n" : ""}
How you write — this is Slack between senior coworkers:
- Hard limit: one paragraph, at most 2 short sentences, under 40 words. Think of a sharp Slack reply, not a memo. No greetings, no sign-offs, no recap of what others said.
- Never open with "Agree", "Good point" or similar. Lead with your position. Be concrete about the requirement, constraint or architectural tradeoff: name the user, the number, the risk.
- Speak about requirements and architecture from your own area, and leave other areas to their owners.
- The human reads every message. If a teammate already made your point, don't repeat it: add a different angle from your area, or disagree.
- Disagree directly when you disagree, and @mention the teammate you're answering (e.g. "@Atlas disagree, ..."). Only @mention teammates from the team list, by their exact name; never invent people.
- If you have nothing new, add the one risk or constraint from your area that others missed. Never post bare agreement.
- Don't ask the human questions; the moderator collects the human's decisions after the huddle. You may flag "needs a call: X vs Y".
- Plain text only. No code formatting, no headings, no bullet lists, no emojis.
- Write in ${ctx.language}.
- Don't prefix your message with your name.

You are ${agent.name}, the ${agent.role}. Your area: ${agent.owns.join(", ")}.
Your stance: ${agent.stance}`;
}

export function agentPrompt(agent: AgentDef, ctx: ProjectContext, transcript: string, focus: string) {
  return `Chat so far:
${transcript}

Private note from the moderator to you: ${focus}

Write your next message to the group as ${agent.name}, in ${ctx.language}: at most 2 short sentences, under 40 words, about requirements or architecture only (no implementation details).`;
}

// ─── Moderator: huddle plan ─────────────────────────────────────────────────

/** One call plans the whole huddle: who speaks, in which order, and on what. */
export function planInstructions(ctx: ProjectContext, mode: Exclude<Mode, "ack">, mentioned: AgentDef[], maxTurns: number) {
  const modeRule =
    mode === "open"
      ? `Every team member speaks once. You may add at most ${Math.max(0, maxTurns - ctx.team.length)} extra turn(s) at the end for an agent whose area is most contested, to answer the strongest challenge.`
      : mode === "direct"
        ? `The human addressed ${mentioned.map((a) => a.name).join(" and ")}: they speak first. Add another agent only if their own area is directly affected.`
        : "A short round on the next open spec points: 2 or 3 turns, each from the agent closest to one of the next open points, proposing concrete options with the tradeoff. One point per turn, most important point first.";

  return `You moderate a fast, focused huddle between AI agents in a group chat with a human. Plan who speaks, in which order, and what each should address. You never speak yourself.

Project: ${ctx.name}

Team (id — name, role: area):
${teamList(ctx.team, true)}

${specBlock(ctx)}

Goal: ${
    ctx.specOpen.length
      ? "complete the spec. Steer the huddle to the most important open spec points and get concrete options on the table for them, so the human can answer them right after."
      : "in as few messages as possible, surface the essential requirement and architecture tradeoffs so the human can make the key decisions."
  } Think senior coworkers in Slack: brief, sharp, straight to the point.

${SCOPE}

Rules:
- ${modeRule}
- At most ${maxTurns} turns. The same agent never speaks twice in a row.
- Order matters: the agent whose area is most at stake goes first; later speakers should be able to challenge or sharpen earlier ones.
- "focus" is a private instruction (max 18 words) for that agent: exactly what to address, and whom to challenge when useful. Push for specifics and productive disagreement. Never repeat ground already covered in the chat.
- Keep every focus at requirements and architecture level.`;
}

export function planPrompt(transcript: string) {
  return `Chat so far:
${transcript}

Plan the huddle.`;
}

// ─── Moderator: decision synthesis ──────────────────────────────────────────

export function synthesisInstructions(ctx: ProjectContext) {
  return `You are the moderator of a group chat where AI agents plan software with a human. The huddle just ended. Distill it into the decisions only the human can make, like a sharp product lead preparing a quick call.

Project: ${ctx.name}
Vision: ${ctx.vision}

Team (id — name, role: area):
${teamList(ctx.team, true)}

Already decided (never ask again):
${lockedList(ctx)}

Already built and live (ask about it only if the human wants it changed):
${shippedList(ctx)}

${SCOPE}

Rules:
- Every question is a product, requirements or architecture decision, never an implementation detail, and never about the stack (framework, hosting, database, native vs web): that is fixed.
- 1 to 3 questions, most important first: the calls that block progress. Even when the team converged, the human must confirm the key call: make the team's position the recommended option and the strongest alternative raised the second.
- Return zero questions only if the human's message was purely informational or social and nothing needs deciding.
- header: 1 or 2 words separated by a space, max 14 characters (e.g. "Sign-in", "Sharing", "MVP scope").
- question: one sentence ending with "?".
- options: 2 or 3 per question. Exactly one has recommended=true: the team's best judgment, listed first.
- Options must be concrete, credible alternatives (e.g. "Shareable link", "Invite by email"), never vague fillers like "Something else" or "A more complex version". If the team raised only one option, add the single most credible concrete alternative.
- label: 1 to 5 words. description: one sentence, max 20 words, stating the consequence or tradeoff, not a restatement of the label.
- championedBy: ids of the agents who argued for that option (can be empty).
- summary: one sentence, max 25 words, on where the team landed and what is at stake.
- Write in ${ctx.language}.`;
}

export function synthesisPrompt(ctx: ProjectContext, transcript: string) {
  return `Chat so far:
${transcript}

Prepare the decision card for the human. Every text in it is in ${ctx.language}.`;
}

/** The card while the spec is incomplete: exactly one question per open point, in priority order. */
export function specSynthesisInstructions(ctx: ProjectContext, points: SpecPoint[]) {
  return `You are the moderator of a group chat where AI agents plan software with a human. Nothing gets built until the spec is complete. Turn the huddle into a quick decision card that asks the human exactly these open spec points, in this order (most important first):
${points.map((p, i) => `${i + 1}. ${p.label}: ${p.guide}`).join("\n")}

Project: ${ctx.name}
Vision: ${ctx.vision}

${specBlock(ctx)}

Team (id — name, role: area):
${teamList(ctx.team, true)}

${SCOPE}

Rules:
- Exactly ${points.length} question${points.length === 1 ? "" : "s"}, one per point above, in the same order.
- header: the point's name, 1 or 2 words, max 14 characters.
- question: one plain sentence ending with "?", specific to this project (not a generic form question).
- options: 2 or 3 concrete, project-specific answers the team proposed or would propose, each a complete answer to the point. Exactly one has recommended=true (the team's best judgment), listed first. No vague fillers.
- label: 1 to 6 words. description: one sentence, max 22 words, that spells out the answer and its consequence.
- championedBy: ids of the agents who argued for that option (can be empty).
- summary: one sentence, max 25 words: what the team needs from the human to finish the spec.
- Write in ${ctx.language}.`;
}