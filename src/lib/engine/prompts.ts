import type { AgentDef } from "@/lib/agents";
import { AGENT_BY_ID } from "@/lib/agents";
import type { DecisionAnswerData, DecisionCard, MessageDTO } from "@/lib/types";

/**
 * answer: the best-placed agent answers the human's question, nothing else. open: a short
 * huddle on what the human raised. direct: @mentioned agents reply. spec: a short round on the
 * next open spec points. ack: one agent confirms.
 */
export type Mode = "answer" | "open" | "direct" | "spec" | "ack";

/** What the human's latest message wants from the team. */
export type Intent = "question" | "request" | "answer" | "discuss" | "social";

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
  /** Where the live app stands right now (building, live at a URL, nothing yet). */
  status: string;
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

function statusLine(ctx: ProjectContext) {
  return ctx.status || "Nothing built yet.";
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
const SCOPE = `In the huddle the team talks requirements and architecture, not code.
- In scope: who it's for and the problem it solves, features and MVP scope, user flows, game design (core loop, rules, controls, progression, art direction, game feel) for games, constraints, quality goals (security, privacy, performance, reliability), the building blocks and how they fit together, data ownership, integrations, risks and tradeoffs.
- The stack is fixed and never up for debate or a question to the human: a Next.js web app on Vercel, a Neon Postgres database only if data must be stored on a server; 2D games run on Phaser, 3D games on Three.js. If the human asks about it, just answer.
- Leave out implementation details: no code, no function, variable, endpoint, table, column or file names, no schemas, no backticks.`;

// ─── Agent voice ────────────────────────────────────────────────────────────

/**
 * What every agent shares comes first and their own role and voice last, so consecutive
 * speakers reuse the same cached prompt prefix.
 */
export function agentInstructions(agent: AgentDef, ctx: ProjectContext, mode: Mode) {
  return `You are one of a small team of AI agents planning and building software together with a human in a group chat. The human is the product owner: their messages come first, and the team's job is to serve them.

Project: ${ctx.name}
Vision: ${ctx.vision}

Team:
${teamList(ctx.team)}

Decisions the human already locked (build on them, don't relitigate unless something is badly wrong):
${lockedList(ctx)}

Already built and live in the app:
${shippedList(ctx)}

Status right now: ${statusLine(ctx)}

${specBlock(ctx)}

${SCOPE}

You are ${agent.name}, the ${agent.role}. Your area: ${agent.owns.join(", ")}.
Your stance: ${agent.stance}

${mode === "answer" ? ANSWER_VOICE : huddleVoice(ctx)}
- Plain text only. No code formatting, no headings, no bullet lists, no emojis.
- Write in ${ctx.language}.
- Don't prefix your message with your name.`;
}

/** Answering the human: the question is the whole job. */
const ANSWER_VOICE = `The human asked something. Your only job in this message is to answer it.
- Your first sentence IS the answer: yes or no, the fact, the number, the recommendation. Never open by restating the question, never answer with a question, never change the subject.
- Then at most two short sentences with the reason or what it means for the product. Under 70 words in total.
- Ground every fact in the project above: the spec, the locked decisions, what's built and the status. If something isn't decided or built yet, say so plainly and give your recommendation. Never invent features, dates or progress.
- Questions about where things stand ("is it done?", "where can I play it?") are answered from the status line, including the link when there is one.
- Questions about technology get a short, honest answer. Questions outside your area still get answered as well as you can.
- Don't hand the human a list of decisions, don't say "needs a call", don't start a debate with teammates. If a teammate already answered above, add only what's missing in one sentence, or confirm briefly.`;

function huddleVoice(ctx: ProjectContext) {
  return `How you write: Slack between senior coworkers.
- Start from what the human just said: react to their latest message, not to a topic of your own. If they asked something, answer it.
- Hard limit: at most 2 short sentences, under 45 words. No greetings, no sign-offs, no recap of what others said.
- Be concrete: name the user, the number, the risk, the option. Never open with "Agree", "Good point" or similar.
- Stay on what matters for this project now. No generic best practice, no hypothetical problems nobody raised.
- If a teammate already made your point, add a different angle or disagree with @Name (exact team names only). Never invent people.
- Don't ask the human questions; the moderator collects decisions afterwards.${
    ctx.specOpen.length
      ? "\n- While spec points are open, propose concrete options for the open point closest to your area, with the tradeoff, so the human can decide quickly."
      : ""
  }`;
}

export function agentPrompt(agent: AgentDef, ctx: ProjectContext, transcript: string, focus: string, latest: string | null) {
  return `Chat so far:
${transcript}
${latest ? `\nThe human's latest message, which this turn is about:\n"""${latest}"""\n` : ""}
Private note from the moderator to you: ${focus}

Write your next message as ${agent.name}, in ${ctx.language}.`;
}

// ─── Moderator: routing ─────────────────────────────────────────────────────

/** One call reads what the human wants, so a question gets an answer instead of a huddle. */
export function routeInstructions(ctx: ProjectContext) {
  return `You route messages in a group chat where a small team of AI agents plans and builds software for a human. Read the human's latest message and decide what the team should do with it.

Project: ${ctx.name}
Vision: ${ctx.vision}
Status: ${statusLine(ctx)}
Spec: ${ctx.specOpen.length ? `${ctx.specOpen.length} point(s) still open` : "complete"}

Team (id — name, role: area):
${teamList(ctx.team, true)}

intent, the main thing the message wants:
- "question": the human asks something and wants an answer: about the project, the plan, the status, a feature, a term, a recommendation, the options on a card, the team's opinion on one specific thing, the technology. Any message whose point is a question is "question", even when phrased politely ("could you tell me...", "I wonder whether...").
- "request": the human tells the team to change, add, remove or fix something in the product ("make the player faster", "add a leaderboard", "the colors are ugly").
- "answer": the human gives information or decides open points without asking anything (preferences, details, answers to what the team asked).
- "discuss": the human explicitly wants ideas, a brainstorm, a debate or the team's broad thoughts ("what do you all think", "give me ideas", "pros and cons"), or describes a whole new direction.
- "social": greetings, thanks, acknowledgements, small talk.

responders: who replies, most relevant first. For "question", "request" and "social" exactly one agent (two only if the question plainly spans two areas): the one whose area the message is about. For "answer" and "discuss" pick 2 or 3 agents whose areas the message touches.

needsDecision: true only if the message leaves a real product choice open that the team can't settle without the human (e.g. a big request that could go two very different ways). False for questions, social messages and clear requests.`;
}

export function routePrompt(transcript: string, latest: string) {
  return `Recent chat:
${transcript}

The human's latest message:
"""${latest}"""

Route it.`;
}

// ─── Moderator: huddle plan ─────────────────────────────────────────────────

/** One call plans the whole huddle: who speaks, in which order, and on what. */
export function planInstructions(ctx: ProjectContext, mode: Exclude<Mode, "ack" | "answer">, mentioned: AgentDef[], maxTurns: number) {
  const modeRule =
    mode === "open"
      ? `Only agents with something relevant to say about the human's latest message speak: usually 2 or 3, never more than ${maxTurns}. Leave out agents whose area it doesn't touch.`
      : mode === "direct"
        ? `The human addressed ${mentioned.map((a) => a.name).join(" and ")}: they speak first. Add another agent only if their own area is directly affected.`
        : "A short round on the next open spec points: 2 or 3 turns, each from the agent closest to one of the next open points, proposing concrete options with the tradeoff. One point per turn, most important point first.";

  return `You moderate a fast, focused huddle between AI agents in a group chat with a human. Plan who speaks, in which order, and what each should address. You never speak yourself.

Project: ${ctx.name}

Team (id — name, role: area):
${teamList(ctx.team, true)}

${specBlock(ctx)}

Goal: respond to the human's latest message. ${
    ctx.specOpen.length
      ? "Where it fits, steer toward the most important open spec points and get concrete options on the table, so the human can answer them right after."
      : "Surface only the tradeoffs that actually matter for what the human raised, in as few messages as possible."
  } Think senior coworkers in Slack: brief, sharp, straight to the point. Never invent topics the human didn't raise and the spec doesn't need.

${SCOPE}

Rules:
- ${modeRule}
- At most ${maxTurns} turns. The same agent never speaks twice in a row.
- Order matters: the agent whose area is most at stake goes first; later speakers can challenge or sharpen earlier ones.
- "focus" is a private instruction (max 18 words) for that agent: exactly what to address about the human's message. Never repeat ground already covered in the chat.`;
}

export function planPrompt(transcript: string) {
  return `Chat so far:
${transcript}

Plan the huddle.`;
}

// ─── Moderator: decision synthesis ──────────────────────────────────────────

export function synthesisInstructions(ctx: ProjectContext) {
  return `You are the moderator of a group chat where AI agents plan software with a human. The huddle just ended. Distill it into the decisions only the human can make, if there are any.

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
- Ask only what genuinely blocks progress on what the human raised and only the human can decide. If the team converged or nothing needs deciding, return zero questions: an empty card is far better than an invented one.
- Every question is a product decision, never an implementation detail and never about the stack.
- At most 2 questions, most important first.
- header: 1 or 2 words separated by a space, max 14 characters (e.g. "Sign-in", "Sharing", "MVP scope").
- question: one sentence ending with "?".
- options: 2 or 3 per question. Exactly one has recommended=true: the team's best judgment, listed first.
- Options must be concrete, credible alternatives (e.g. "Shareable link", "Invite by email"), never vague fillers like "Something else". If the team raised only one option, add the single most credible concrete alternative.
- label: 1 to 5 words. description: one sentence, max 20 words, stating the consequence or tradeoff, not a restatement of the label.
- championedBy: ids of the agents who argued for that option (can be empty).
- summary: one sentence, max 25 words, on where the team landed and what is at stake.
- Write in ${ctx.language}.`;
}

export function synthesisPrompt(ctx: ProjectContext, transcript: string) {
  return `Chat so far:
${transcript}

Prepare the decision card for the human (or none, if nothing needs deciding). Every text in it is in ${ctx.language}.`;
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