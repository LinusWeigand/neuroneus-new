import "server-only";
import { hasToolCall, isStepCount, type LanguageModelUsage, type ModelMessage, streamText, tool } from "ai";
import { z } from "zod";
import type { AgentDef } from "@/lib/agents";
import { modelFor, reasoningFor } from "@/lib/ai";
import type { BuildActivity, BuildEventKind } from "@/lib/types";
import type { FileMap } from "./repo";

// The builder: one agent implementing one task on an in-memory copy of the app's source.
// It can't run commands; Vercel's build is the compiler, and a failed build comes back to
// the agent as a "fix" task with the build output.
//
// It streams, so the UI can show what it's doing while it thinks and writes, and it can
// pause at a step boundary near the time limit and hand its conversation to the next step.
//
// Tokens are the cost, and every model step re-sends the whole conversation. So:
// - what every task needs (conventions, design brief, spec, a map of the code) is in the
//   instructions up front, stable first so the provider's prompt cache can reuse it;
// - read_files fetches several files in one step;
// - a long conversation is compacted: file contents that went stale are dropped.

export type BuildContext = {
  name: string;
  vision: string;
  kind: "web_app" | "web_game";
  /** The complete spec as text. */
  spec: string;
  designName: string | null;
  /** Games on the game kit: 2D (Phaser) or 3D (Three.js). Null for apps and older games. */
  kit: "2d" | "3d" | null;
  database: boolean;
  decisions: { header: string; choice: string }[];
  shipped: string[];
  /** The language the human writes in; summaries and titles come back in it. */
  language: "German" | "English";
};

export type BuilderReport = {
  /** The live "now" line. Called often; the caller throttles persistence. */
  activity: (a: Omit<BuildActivity, "since" | "agentId">) => void;
  /** Something the agent finished doing, for the activity log. */
  event: (e: { kind: BuildEventKind; path?: string; detail?: string }) => void;
};

const MAX_FILES = 300;
const MAX_FILE_CHARS = 150_000;
const MAX_STEPS = 30;
const PROTECTED = /^(\.git\/|node_modules\/|\.next\/|\.env)/;
/** Preloaded into the instructions, so the builder never spends a step reading them. */
const PRELOADED = ["AGENTS.md", "docs/DESIGN-BRIEF.md", "docs/ART-DIRECTION.md", "docs/GAME-KIT.md"];
/** Compact the conversation once it's this long (characters, roughly 4 per token). */
const COMPACT_AT = 200_000;
/** Messages at the end that always stay verbatim. */
const KEEP_RECENT = 6;

function checkPath(path: string) {
  const p = path.trim().replace(/^\.\//, "");
  if (!p || p.startsWith("/") || p.includes("..") || p.includes("\\") || PROTECTED.test(p)) {
    throw new Error(`Invalid path "${path}". Use a relative path inside the project, like app/page.tsx.`);
  }
  return p;
}

/** Every file with its size and, for code, what it exports: enough to know where to look. */
export function codeMap(files: FileMap) {
  return Object.keys(files)
    .sort()
    .map((p) => {
      const exports = /\.(tsx?|mjs|js)$/.test(p) ? exportsOf(files[p]) : [];
      return `${p} (${files[p].length})${exports.length ? ` — ${exports.join(", ")}` : ""}`;
    })
    .join("\n");
}

function exportsOf(source: string) {
  const names: string[] = [];
  const re = /^export\s+(default\s+)?(?:async\s+)?(?:function\*?|const|let|class|type|interface|enum)\s+([A-Za-z0-9_$]+)/gm;
  for (const m of source.matchAll(re)) names.push(m[1] ? `default ${m[2]}` : m[2]);
  if (names.length === 0 && /^export\s+default\b/m.test(source)) names.push("default");
  return names.length > 8 ? [...names.slice(0, 8), "…"] : names;
}

function instructions(
  agent: AgentDef,
  ctx: BuildContext,
  files: FileMap,
  task: { title: string; detail: string },
  fix: string | null,
) {
  const decisions = ctx.decisions.length ? ctx.decisions.map((d) => `- ${d.header}: ${d.choice}`).join("\n") : "None yet.";
  const shipped = ctx.shipped.length ? ctx.shipped.map((s) => `- ${s}`).join("\n") : "Nothing yet (starter app).";
  const what = ctx.kind === "web_game" ? "web game" : "web app";
  const brief = files["docs/DESIGN-BRIEF.md"];
  const preloaded = PRELOADED.filter((p) => files[p])
    .map((p) => `<file path="${p}">\n${files[p].trim()}\n</file>`)
    .join("\n\n");
  const design = ctx.kit
    ? `the ${ctx.designName ?? "theme's"} art direction. docs/ART-DIRECTION.md (below) says what every character, object, effect and screen looks like; game/theme.ts has the tokens; docs/GAME-KIT.md (below) is the kit you build with. The result must look and feel like a polished indie game: kit art primitives with the theme's palette roles, motion with weight, feedback and sound on every event. Never plain shapes, emoji or hard-coded colors.`
    : !ctx.designName
    ? "keep it clean and consistent."
    : brief
      ? `the ${ctx.designName} design system. docs/DESIGN-BRIEF.md (below) has its tokens and rules; follow it strictly for every pixel and never invent colors or styles outside it. DESIGN.md has the full system: read the section you need (search it) only when the brief doesn't cover a component.`
      : `the ${ctx.designName} design system in DESIGN.md. Follow it strictly for every pixel: its tokens, typography, components and do's and don'ts. Never invent colors or styles outside it. Search it for the sections you need.`;

  // Stable parts first (the same for every task of the project), the task last: the prompt
  // cache reuses everything up to the first difference.
  return `You are ${agent.name}, the ${agent.role} and the only engineer writing code on a team of AI agents building a real ${what} for a human. Implement one task at a time in the codebase.

How to work:
- The project's conventions, design brief and spec are below, with a map of every file (size in characters, and what code files export). Files shown in full below need no reading.
- Read only the files the task touches, several at once with read_files. Use search to find usages instead of reading whole files.
- Make complete, focused changes. The app must build under strict TypeScript and the feature must work end to end, including empty, loading and error states.
- You cannot run commands. Be careful with imports, types and Next.js 16 APIs; check that every import you add exists.
- Use edit_file for small changes and write_file for new files or full rewrites.
- Work in few steps: batch reads, then write. Don't re-read a file you just wrote.${
    ctx.kit
      ? "\n- Game: the kit's files are mapped below; read the ones you build on (e.g. the sample scene, kit/textures, kit/fx) before writing. Before you finish, check the quality bar in docs/GAME-KIT.md and fix what falls short."
      : ""
  }
- When done, call finish with one sentence for the product owner: what they can now do in the app, in plain product language, no code, file or library names. Write it in ${ctx.language}.

Project: ${ctx.name}
Vision: ${ctx.vision}

Spec (the source of truth; don't build what it puts out of scope):
${ctx.spec}

Design: ${design}
Database: ${ctx.database ? "Neon Postgres (see AGENTS.md)." : "none. Keep state in the browser (React state, localStorage)."}

${preloaded}

Decisions the human made:
${decisions}

Already shipped:
${shipped}

Files:
${codeMap(files)}

Your task: ${task.title}
${task.detail}
${
  fix
    ? `
The last deploy of this task FAILED to build. Fix the cause with the smallest change that keeps the task's intent. Build output:
\`\`\`
${fix.slice(0, 6000)}
\`\`\`
`
    : ""
}`;
}

/** Saved conversations must replay without server-side state: drop reasoning and provider item refs. */
function portable(messages: ModelMessage[]): ModelMessage[] {
  return messages.map((m) => {
    if (m.role !== "assistant" || !Array.isArray(m.content)) return m;
    return {
      ...m,
      content: m.content
        .filter((p) => p.type !== "reasoning")
        .map((p) => {
          const copy = { ...p } as Record<string, unknown>;
          delete copy.providerOptions;
          return copy as typeof p;
        }),
    };
  });
}

const size = (messages: ModelMessage[]) => JSON.stringify(messages).length;

/**
 * Shrinks a long conversation without losing what matters: file contents that went stale
 * (the file was changed or read again later) and the payload of files already written are
 * replaced by a short note. Runs only past COMPACT_AT, so the prompt cache stays warm the
 * rest of the time. If that's not enough, every older file content goes.
 */
export function compact(messages: ModelMessage[], force = false): ModelMessage[] {
  if (!force && size(messages) < COMPACT_AT) return messages;
  const calls = new Map<string, { tool: string; paths: string[]; at: number }>();
  const lastTouch = new Map<string, number>();
  messages.forEach((m, at) => {
    if (m.role !== "assistant" || !Array.isArray(m.content)) return;
    for (const p of m.content) {
      if (p.type !== "tool-call") continue;
      const input = (p.input ?? {}) as { path?: unknown; paths?: unknown };
      const paths = [input.path, ...(Array.isArray(input.paths) ? input.paths : [])].filter((x): x is string => typeof x === "string");
      calls.set(p.toolCallId, { tool: p.toolName, paths, at });
      for (const path of paths) lastTouch.set(path, at);
    }
  });

  const keepFrom = messages.length - KEEP_RECENT;
  const shrink = (aggressive: boolean) =>
    messages.map((m, i): ModelMessage => {
      if (i >= keepFrom) return m;
      if (m.role === "assistant" && Array.isArray(m.content)) {
        return {
          ...m,
          content: m.content.map((p) => {
            if (p.type !== "tool-call" || p.toolName !== "write_file") return p;
            const input = p.input as { path?: string; content?: unknown };
            if (typeof input?.content !== "string" || input.content.length < 400) return p;
            return { ...p, input: { ...input, content: `[${input.content.length} characters written; read the file to see them]` } };
          }),
        };
      }
      if (m.role === "tool") {
        return {
          ...m,
          content: m.content.map((p) => {
            if (p.type !== "tool-result") return p;
            const call = calls.get(p.toolCallId);
            if (!call || (call.tool !== "read_file" && call.tool !== "read_files")) return p;
            const stale = call.paths.length > 0 && call.paths.every((path) => (lastTouch.get(path) ?? -1) > call.at);
            if (!stale && !aggressive) return p;
            const value = `[Content of ${call.paths.join(", ")} omitted to save space${stale ? ": changed or read again later" : ""}. Read it again if you need it.]`;
            return { ...p, output: { type: "text" as const, value } };
          }),
        };
      }
      return m;
    });

  const light = shrink(false);
  return size(light) < COMPACT_AT * 0.7 ? light : shrink(true);
}

function addUsage(total: LanguageModelUsage, u: LanguageModelUsage): LanguageModelUsage {
  const n = (a?: number, b?: number) => (a ?? 0) + (b ?? 0);
  return {
    inputTokens: n(total.inputTokens, u.inputTokens),
    inputTokenDetails: {
      noCacheTokens: n(total.inputTokenDetails.noCacheTokens, u.inputTokenDetails?.noCacheTokens),
      cacheReadTokens: n(total.inputTokenDetails.cacheReadTokens, u.inputTokenDetails?.cacheReadTokens),
      cacheWriteTokens: n(total.inputTokenDetails.cacheWriteTokens, u.inputTokenDetails?.cacheWriteTokens),
    },
    outputTokens: n(total.outputTokens, u.outputTokens),
    outputTokenDetails: {
      textTokens: n(total.outputTokenDetails.textTokens, u.outputTokenDetails?.textTokens),
      reasoningTokens: n(total.outputTokenDetails.reasoningTokens, u.outputTokenDetails?.reasoningTokens),
    },
    totalTokens: n(total.totalTokens, u.totalTokens),
  };
}

const NO_USAGE: LanguageModelUsage = {
  inputTokens: 0,
  inputTokenDetails: { noCacheTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
  outputTokens: 0,
  outputTokenDetails: { textTokens: 0, reasoningTokens: 0 },
  totalTokens: 0,
};

const ACTIVITY_FOR_TOOL: Record<string, BuildActivity["kind"]> = {
  list_files: "listing",
  read_file: "reading",
  read_files: "reading",
  search: "searching",
  write_file: "writing",
  edit_file: "editing",
  delete_file: "deleting",
  finish: "thinking",
};

export async function runBuilder(args: {
  agent: AgentDef;
  ctx: BuildContext;
  task: { title: string; detail: string };
  files: FileMap;
  fixLog: string | null;
  model: string;
  reasoning: "low" | "medium";
  /** The conversation so far, when this task continues from an earlier step. */
  history: ModelMessage[] | null;
  /** Stop starting new model steps after this (ms epoch); the task continues next step. */
  softDeadline: number;
  /** Abort outright after this (ms epoch). */
  hardDeadline: number;
  /** Requests with the same key are routed to the same prompt cache. */
  cacheKey: string;
  report: BuilderReport;
}): Promise<{ files: FileMap; summary: string | null; finished: boolean; history: ModelMessage[]; usage: LanguageModelUsage }> {
  const files: FileMap = { ...args.files };
  const { report } = args;
  let summary: string | null = null;
  let usage = NO_USAGE;

  const readOne = (path: string) => {
    const p = checkPath(path);
    if (!(p in files)) return `File not found: ${p}`;
    report.event({ kind: "read", path: p });
    return files[p].length > 60_000 ? files[p].slice(0, 60_000) + "\n[truncated]" : files[p];
  };

  const tools = {
    list_files: tool({
      description: "List all files in the project with their sizes in characters (the instructions already have this map).",
      inputSchema: z.object({}),
      execute: async () => {
        report.event({ kind: "listed" });
        return codeMap(files);
      },
    }),
    read_file: tool({
      description: "Read one file's full content.",
      inputSchema: z.object({ path: z.string() }),
      execute: async ({ path }) => readOne(path),
    }),
    read_files: tool({
      description: "Read several files at once (up to 8). Prefer this over several read_file calls.",
      inputSchema: z.object({ paths: z.array(z.string()).min(1).max(8) }),
      execute: async ({ paths }) => paths.map((p) => `<file path="${p}">\n${readOne(p)}\n</file>`).join("\n\n"),
    }),
    search: tool({
      description: "Case-insensitive text search across all files. Returns path:line: text for each match.",
      inputSchema: z.object({ query: z.string().min(1) }),
      execute: async ({ query }) => {
        const q = query.toLowerCase();
        const hits: string[] = [];
        for (const [p, content] of Object.entries(files)) {
          content.split("\n").forEach((line, i) => {
            if (hits.length < 60 && line.toLowerCase().includes(q)) hits.push(`${p}:${i + 1}: ${line.trim().slice(0, 200)}`);
          });
        }
        report.event({ kind: "searched", detail: query.slice(0, 80) });
        return hits.length ? hits.join("\n") : "No matches.";
      },
    }),
    write_file: tool({
      description: "Create a file or replace its entire content.",
      inputSchema: z.object({ path: z.string(), content: z.string() }),
      execute: async ({ path, content }) => {
        const p = checkPath(path);
        if (!(p in files) && Object.keys(files).length >= MAX_FILES) return "Too many files in the project.";
        if (content.length > MAX_FILE_CHARS) return "File too large; split it up.";
        const created = !(p in files);
        files[p] = content;
        report.event({ kind: "wrote", path: p, detail: created ? "new" : undefined });
        return `Wrote ${p} (${content.length} chars).`;
      },
    }),
    edit_file: tool({
      description: "Replace one exact occurrence of `find` with `replace` in a file. `find` must match exactly once.",
      inputSchema: z.object({ path: z.string(), find: z.string().min(1), replace: z.string() }),
      execute: async ({ path, find, replace }) => {
        const p = checkPath(path);
        const content = files[p];
        if (content === undefined) return `File not found: ${p}`;
        const count = content.split(find).length - 1;
        if (count === 0) return `No match for the given text in ${p}. Read the file and try again.`;
        if (count > 1) return `The text matches ${count} times in ${p}; include more surrounding lines.`;
        files[p] = content.replace(find, () => replace);
        report.event({ kind: "edited", path: p });
        return `Edited ${p}.`;
      },
    }),
    delete_file: tool({
      description: "Delete a file.",
      inputSchema: z.object({ path: z.string() }),
      execute: async ({ path }) => {
        const p = checkPath(path);
        if (!(p in files)) return `File not found: ${p}`;
        delete files[p];
        report.event({ kind: "deleted", path: p });
        return `Deleted ${p}.`;
      },
    }),
    finish: tool({
      description: "Call when the task is complete. `summary`: one sentence for the product owner, product language only.",
      inputSchema: z.object({ summary: z.string() }),
      execute: async ({ summary: s }) => {
        summary = s.trim();
        report.event({ kind: "finished" });
        return "Done.";
      },
    }),
  };

  const opening: ModelMessage[] = args.history?.length
    ? [
        ...args.history,
        { role: "user", content: "You ran out of time in the previous session. Continue the task where you left off, then call finish." },
      ]
    : [
        {
          role: "user",
          content: args.fixLog ? "Fix the build, then call finish." : "Implement the task, then call finish.",
        },
      ];

  let history: ModelMessage[] = args.history ?? opening;
  try {
    const result = streamText({
      model: modelFor(args.model),
      // Built from the files the task starts with, so it stays identical (and cached) across steps.
      instructions: instructions(args.agent, args.ctx, args.files, args.task, args.fixLog),
      messages: opening,
      tools,
      stopWhen: [isStepCount(MAX_STEPS), hasToolCall("finish"), () => Date.now() > args.softDeadline],
      prepareStep: ({ messages }) => {
        const compacted = compact(messages);
        return compacted === messages ? undefined : { messages: compacted };
      },
      onStepFinish: (step) => {
        usage = addUsage(usage, step.usage);
      },
      reasoning: reasoningFor(args.model, args.reasoning),
      maxOutputTokens: 24_000,
      maxRetries: 2,
      abortSignal: AbortSignal.timeout(Math.max(10_000, args.hardDeadline - Date.now())),
      providerOptions: { azure: { store: false, promptCacheKey: args.cacheKey } },
    });

    // Turn the raw stream into "what's happening now": thinking, or writing which file how far.
    const inputs = new Map<string, { tool: string; buf: string }>();
    for await (const part of result.fullStream) {
      switch (part.type) {
        case "start-step":
        case "reasoning-start":
          report.activity({ kind: "thinking" });
          break;
        case "tool-input-start":
          inputs.set(part.id, { tool: part.toolName, buf: "" });
          report.activity({ kind: ACTIVITY_FOR_TOOL[part.toolName] ?? "thinking" });
          break;
        case "tool-input-delta": {
          const input = inputs.get(part.id);
          if (!input) break;
          input.buf += part.delta;
          const path = /"paths?"\s*:\s*\[?\s*"([^"]+)"/.exec(input.buf)?.[1];
          const query = /"query"\s*:\s*"([^"]*)/.exec(input.buf)?.[1];
          report.activity({
            kind: ACTIVITY_FOR_TOOL[input.tool] ?? "thinking",
            path,
            query,
            chars: input.tool === "write_file" || input.tool === "edit_file" ? input.buf.length : undefined,
          });
          break;
        }
        case "tool-result":
          inputs.delete(part.toolCallId);
          break;
      }
    }
    // The saved conversation is what the next step starts from: compact it the same way.
    history = compact(portable([...opening, ...(await result.responseMessages)]));
  } catch (err) {
    // Hard timeout or a model error: keep whatever was written. The deploy decides if it holds.
    console.warn(`[builder] ${args.agent.name} stopped:`, err instanceof Error ? err.message : err);
  }
  return { files, summary, finished: summary !== null, history, usage };
}
