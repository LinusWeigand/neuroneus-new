import "server-only";
import fs from "node:fs";
import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import type { AgentDef } from "@/lib/agents";
import type { DecisionAnswer } from "@/lib/types";

// Every project lives as a repository in the GitHub org (GITHUB_ORG), created and written
// by the GitHub App installation, so no personal token is involved.

function readPrivateKey(): string | null {
  const raw = process.env.GITHUB_PRIVATE_KEY;
  if (raw) {
    if (raw.includes("BEGIN")) return raw.replace(/\\n/g, "\n");
    // Allow base64-encoded PEM, which is easier to paste into Vercel.
    return Buffer.from(raw, "base64").toString("utf8");
  }
  const path = process.env.GITHUB_PRIVATE_KEY_PATH;
  if (path && fs.existsSync(path)) return fs.readFileSync(path, "utf8");
  return null;
}

export function githubConfigured() {
  return Boolean(
    process.env.GITHUB_APP_ID && process.env.GITHUB_INSTALLATION_ID && process.env.GITHUB_ORG && readPrivateKey(),
  );
}

let client: Octokit | null = null;

export function octokit() {
  const privateKey = readPrivateKey();
  if (!githubConfigured() || !privateKey) {
    throw new Error("GitHub App is not configured (GITHUB_APP_ID, GITHUB_INSTALLATION_ID, GITHUB_ORG, GITHUB_PRIVATE_KEY).");
  }
  client ??= new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: process.env.GITHUB_APP_ID,
      privateKey,
      installationId: process.env.GITHUB_INSTALLATION_ID,
    },
    userAgent: "neuroneus",
    // Expected 404s (repo name probing) shouldn't spam the logs; real failures are thrown.
    log: { debug: () => {}, info: () => {}, warn: () => {}, error: console.error },
    request: {
      // Never let a slow GitHub call hold a request open indefinitely.
      fetch: (url: string, init?: RequestInit) => fetch(url, { ...init, signal: AbortSignal.timeout(20_000) }),
    },
  });
  return client;
}

const org = () => process.env.GITHUB_ORG!;

export function slugify(name: string) {
  return (
    name
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "project"
  );
}

export function status(err: unknown) {
  return typeof err === "object" && err && "status" in err ? (err as { status: number }).status : 0;
}

/** Deletes a project's repository. Only repositories in our org; one that's already gone counts as deleted. */
export async function deleteProjectRepo(fullName: string) {
  const [owner, repo] = fullName.split("/");
  if (!repo || owner?.toLowerCase() !== org().toLowerCase()) {
    throw new Error(`Refusing to delete ${fullName}: it isn't in the ${org()} organization.`);
  }
  try {
    await octokit().repos.delete({ owner, repo });
  } catch (err) {
    if (status(err) !== 404) throw err;
  }
}

async function repoExists(name: string) {
  try {
    await octokit().repos.get({ owner: org(), repo: name });
    return true;
  } catch (err) {
    if (status(err) === 404) return false;
    throw err;
  }
}

function b64(s: string) {
  return Buffer.from(s, "utf8").toString("base64");
}

function readme(name: string, vision: string, team: AgentDef[]) {
  const rows = team.map((a) => `| ${a.name} | ${a.role} | ${a.owns.join(", ")} |`).join("\n");
  return `# ${name}

> ${vision.trim().replace(/\n+/g, "\n> ")}

This project is planned and built by a team of AI agents on Neuroneus, together with its human owner.

## Team

| Agent | Role | Owns |
| --- | --- | --- |
${rows}

## Decisions

Every decision the owner makes in the team chat is logged in [docs/DECISIONS.md](docs/DECISIONS.md).
`;
}

export async function createProjectRepo(input: { name: string; vision: string; team: AgentDef[] }) {
  const gh = octokit();
  const base = slugify(input.name);
  let repoName = base;
  for (let i = 2; await repoExists(repoName); i++) {
    if (i > 20) throw new Error("Could not find a free repository name.");
    repoName = `${base}-${i}`;
  }

  const { data: repo } = await gh.repos.createInOrg({
    org: org(),
    name: repoName,
    description: input.vision.replace(/\s+/g, " ").slice(0, 300),
    private: process.env.GITHUB_REPO_VISIBILITY !== "public",
    has_wiki: false,
    auto_init: false,
  });

  // First commit on the empty repository.
  await gh.repos.createOrUpdateFileContents({
    owner: org(),
    repo: repoName,
    path: "README.md",
    message: "Kick off project",
    content: b64(readme(input.name, input.vision, input.team)),
  });

  return { fullName: repo.full_name, url: repo.html_url };
}

const DECISIONS_PATH = "docs/DECISIONS.md";
const DECISIONS_HEADER = `# Decisions

Decisions made by the project owner in the Neuroneus team chat, newest last.
`;

export async function appendDecisions(repoFullName: string, answers: DecisionAnswer[]) {
  const gh = octokit();
  const [owner, repo] = repoFullName.split("/");
  const stamp = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";
  const entry =
    `\n## ${stamp}\n\n` +
    answers
      .map(
        (a) =>
          `- **${a.header}**: ${a.choice}${a.isCustom ? " _(owner's own answer)_" : a.wasRecommended ? " _(team recommendation)_" : ""}\n  <sub>${a.question}</sub>`,
      )
      .join("\n") +
    "\n";

  for (let attempt = 0; attempt < 3; attempt++) {
    let sha: string | undefined;
    let current = DECISIONS_HEADER;
    try {
      const { data } = await gh.repos.getContent({ owner, repo, path: DECISIONS_PATH });
      if (!Array.isArray(data) && data.type === "file") {
        sha = data.sha;
        current = Buffer.from(data.content, "base64").toString("utf8");
      }
    } catch (err) {
      if (status(err) !== 404) throw err;
    }
    try {
      const { data } = await gh.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: DECISIONS_PATH,
        sha,
        message: `Log ${answers.length === 1 ? "decision" : `${answers.length} decisions`}: ${answers.map((a) => a.header).join(", ")}`,
        content: b64(current.trimEnd() + "\n" + entry),
      });
      return { url: data.content?.html_url ?? `https://github.com/${repoFullName}/blob/main/${DECISIONS_PATH}` };
    } catch (err) {
      // 409: someone else committed in between. Re-read and retry.
      if (status(err) !== 409 || attempt === 2) throw err;
    }
  }
  throw new Error("unreachable");
}
