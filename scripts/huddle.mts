// Runs one huddle from the terminal, without the UI. Handy for tuning prompts.
//
//   pnpm huddle new                          # sample project, kicks off with its vision
//   pnpm huddle <projectId> "your message"   # one turn in an existing project
//
// Uses the database and Azure deployment from .env.local. No GitHub calls for "new".
import { AGENT_BY_ID } from "@/lib/agents";
import { acquireRunLock, getProject, releaseRunLock } from "@/lib/data";
import { db, schema } from "@/lib/db";
import { executeRun } from "@/lib/engine/run";
import type { RunEvent, TurnInput } from "@/lib/types";

const [arg, message] = process.argv.slice(2);
let id = arg;
if (!id || id === "new") {
  const [p] = await db
    .insert(schema.projects)
    .values({
      name: "Flatmate expenses",
      vision:
        "A mobile-first web app where flatmates track shared expenses, recurring bills and who owes whom, with a monthly settle-up.",
      agentIds: ["nova", "atlas", "iris", "forge"],
    })
    .returning();
  id = p.id;
  console.log(`project ${id}`);
}

const project = await getProject(id);
if (!project) throw new Error(`No project ${id}`);
const input: TurnInput = message?.startsWith("{")
  ? JSON.parse(message)
  : { kind: "message", content: message ?? project.vision };

const t0 = Date.now();
const at = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;
const emit = (e: RunEvent) => {
  if (e.type === "start") process.stdout.write(`\n[${at()}] ${AGENT_BY_ID[e.agentId]?.name}: `);
  else if (e.type === "delta") process.stdout.write(e.text);
  else if (e.type === "end") process.stdout.write(`  (${e.message.content.split(/\s+/).length} words)\n`);
  else if (e.type === "message" && e.message.kind === "decision_request")
    console.log(`\n[${at()}] decision card:\n${JSON.stringify(e.message.data, null, 2)}`);
  else if (e.type === "status" && e.label) console.log(`\n[${at()}] ${e.label}…`);
  else if (e.type === "error") console.error(`\n[${at()}] error: ${e.error}`);
};

const runId = `cli-${Date.now()}`;
if (!(await acquireRunLock(id, runId))) throw new Error("A discussion is already running in this project.");
try {
  await executeRun({ project, runId, input, emit });
} finally {
  await releaseRunLock(id, runId);
}
console.log(`\ndone in ${at()}`);
process.exit(0);
