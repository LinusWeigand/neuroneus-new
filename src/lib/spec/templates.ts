// Spec templates. Building starts only when every required point is answered; open points
// are asked in this order (most important first).
//
// Web apps follow the usual PRD shape (problem, users, user stories, MVP scope with
// explicit non-goals, data, access, success criteria). Web games follow the one-page game
// design document (pitch, core loop, win/lose, controls, mechanics, progression, feedback,
// visual style, scope boundary). The stack is fixed and never part of a spec: a web app on
// Next.js, deployed to Vercel, with a Neon Postgres database only when data must be stored.
//
// Client-safe. Labels and questions for the UI live in the dictionaries (t.spec.items).

export type SpecKind = "web_app" | "web_game";

export type SpecItemDef = {
  key: string;
  required: boolean;
  /** For the models: what a real answer to this point contains. */
  guide: string;
};

export const WEB_APP_SPEC: SpecItemDef[] = [
  { key: "problem", required: true, guide: "The problem the app solves and its main goal, in one or two sentences." },
  { key: "users", required: true, guide: "Who uses it and in what situation (context, device, how often)." },
  { key: "core_flows", required: true, guide: "The 2 to 4 key things a user must be able to do, as user stories or step-by-step journeys." },
  { key: "mvp_scope", required: true, guide: "The must-have features of the first version." },
  { key: "out_of_scope", required: true, guide: "What is explicitly NOT in the first version." },
  { key: "data", required: true, guide: "What must be saved and for how long; whether data is per person, per device, or shared between people. 'Nothing needs saving' is a valid answer." },
  { key: "access", required: true, guide: "Whether people sign in, who may see or change what, public versus private." },
  { key: "content_language", required: true, guide: "The language(s) of the interface and where text, content or example data come from." },
  { key: "look_feel", required: true, guide: "The mood and personality of the design (e.g. calm and minimal, bold and playful, premium), references the human likes." },
  { key: "success", required: true, guide: "How we know version one works: concrete acceptance criteria or measurable outcomes." },
  { key: "edge_cases", required: false, guide: "Limits, empty and error situations, privacy or legal constraints worth designing for." },
];

export const WEB_GAME_SPEC: SpecItemDef[] = [
  { key: "pitch", required: true, guide: "One-sentence pitch and the genre (e.g. arcade, puzzle, platformer, card, word game)." },
  { key: "core_loop", required: true, guide: "What the player does every 30 seconds and what rewards that: the core loop." },
  { key: "goal", required: true, guide: "The objective and how a run ends: win and lose conditions, or endless with a score." },
  { key: "controls", required: true, guide: "How the player controls the game (keyboard, mouse, touch) and on which devices it must work." },
  { key: "mechanics", required: true, guide: "The key rules and things in the game (player, enemies, items, obstacles) and how they interact." },
  { key: "progression", required: true, guide: "How difficulty and variety evolve (levels, waves, speed-up) and how long a session lasts." },
  { key: "feedback", required: true, guide: "What the player sees and hears in response: score, HUD, effects, sounds, start and game-over screens." },
  { key: "visual_style", required: true, guide: "The visual style and perspective (pixel art, flat vector, neon, hand-drawn; top-down, side view) and mood." },
  { key: "players_saving", required: true, guide: "Single player or local multiplayer, and what is remembered: nothing, local high score, or an online leaderboard or saves shared between players." },
  { key: "out_of_scope", required: true, guide: "What is explicitly NOT in the first version (stretch ideas)." },
  { key: "theme_language", required: false, guide: "Theme or story, and the language of any in-game text." },
];

export function specTemplate(kind: SpecKind): SpecItemDef[] {
  return kind === "web_game" ? WEB_GAME_SPEC : WEB_APP_SPEC;
}

export type SpecAnswer = { value: string; source: "vision" | "chat" | "decision" };

export type ProjectSpec = {
  kind: SpecKind | null;
  answers: Record<string, SpecAnswer>;
  /** Whether the app must store data on a server (decides the Neon database). */
  needsDatabase: boolean | null;
};

export const EMPTY_SPEC: ProjectSpec = { kind: null, answers: {}, needsDatabase: null };

/** Open required points, most important first. Until the kind is known, that's the only question. */
export function openSpecPoints(spec: ProjectSpec | null): string[] {
  if (!spec?.kind) return ["kind"];
  return specTemplate(spec.kind)
    .filter((i) => i.required && !spec.answers[i.key]?.value?.trim())
    .map((i) => i.key);
}

export function specComplete(spec: ProjectSpec | null) {
  return openSpecPoints(spec).length === 0;
}

export function specProgress(spec: ProjectSpec | null) {
  if (!spec?.kind) return { answered: 0, total: 0 };
  const required = specTemplate(spec.kind).filter((i) => i.required);
  return { answered: required.filter((i) => spec.answers[i.key]?.value?.trim()).length, total: required.length };
}

/** The spec as plain text, for prompts and the repository's docs/SPEC.md. */
export function specText(spec: ProjectSpec, labels?: Record<string, string>) {
  if (!spec.kind) return "Kind not decided yet.";
  const lines = specTemplate(spec.kind).map((i) => {
    const answer = spec.answers[i.key]?.value?.trim();
    return `- ${labels?.[i.key] ?? i.key}: ${answer || "(open)"}`;
  });
  return `Kind: ${spec.kind === "web_game" ? "web game" : "web app"}\n${lines.join("\n")}`;
}
