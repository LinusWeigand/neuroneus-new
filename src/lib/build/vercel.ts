import "server-only";

// Generated apps are deployed through Vercel's API with the files inline, not through Vercel's
// GitHub integration: on the Hobby plan, Git-triggered deploys of private repos are blocked
// when the commit author (our GitHub App) isn't the account owner. API deploys carry no Git
// metadata, so that check doesn't apply. GitHub still holds the full history.

const API = "https://api.vercel.com";

function token() {
  return process.env.VERCEL_API_KEY || process.env.VERCEL_TOKEN;
}

export function vercelConfigured() {
  return Boolean(token());
}

let teamIdCache: string | null | undefined;

async function teamId(): Promise<string | null> {
  if (process.env.VERCEL_TEAM_ID) return process.env.VERCEL_TEAM_ID;
  if (teamIdCache !== undefined) return teamIdCache;
  const { user } = await call<{ user: { defaultTeamId?: string | null } }>("/v2/user", {}, false);
  teamIdCache = user.defaultTeamId ?? null;
  return teamIdCache;
}

async function call<T>(path: string, init: RequestInit = {}, scoped = true): Promise<T> {
  const url = new URL(API + path);
  if (scoped) {
    const team = await teamId();
    if (team) url.searchParams.set("teamId", team);
  }
  const res = await fetch(url, {
    ...init,
    headers: { authorization: `Bearer ${token()}`, "content-type": "application/json", ...init.headers },
    signal: AbortSignal.timeout(60_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`Vercel ${res.status}: ${body.error?.message ?? res.statusText}`) as Error & { status?: number; code?: string };
    err.status = res.status;
    err.code = body.error?.code;
    throw err;
  }
  return body as T;
}

export type VercelProject = { id: string; name: string };

/** Creates a Next.js project, retrying with a suffix if the name is taken. */
export async function createProject(baseName: string): Promise<VercelProject> {
  const base = baseName.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "app";
  for (let i = 1; i <= 20; i++) {
    const name = i === 1 ? base : `${base}-${i}`;
    try {
      const project = await call<VercelProject>("/v11/projects", {
        method: "POST",
        body: JSON.stringify({ name, framework: "nextjs", serverlessFunctionRegion: "fra1" }),
      });
      // Let the app be framed and opened without a Vercel login. It's a prototype; the
      // unguessable URL is its only protection, like any public preview.
      await call(`/v9/projects/${project.id}`, { method: "PATCH", body: JSON.stringify({ ssoProtection: null }) }).catch(
        (err) => console.warn("[vercel] could not relax deployment protection", err),
      );
      return { id: project.id, name: project.name };
    } catch (err) {
      const e = err as { status?: number; code?: string };
      if (e.status === 409 || e.code === "conflict") continue;
      throw err;
    }
  }
  throw new Error("Could not find a free Vercel project name.");
}

/** False when the project was deleted (e.g. in the Vercel dashboard). */
export async function projectExists(projectId: string) {
  try {
    await call(`/v9/projects/${projectId}`);
    return true;
  } catch (err) {
    if ((err as { status?: number }).status === 404) return false;
    throw err;
  }
}

/** Deletes the project with all its deployments. One that's already gone counts as deleted. */
export async function deleteProject(projectId: string) {
  try {
    await call(`/v9/projects/${projectId}`, { method: "DELETE" });
  } catch (err) {
    if ((err as { status?: number }).status !== 404) throw err;
  }
}

export async function setEnv(projectId: string, key: string, value: string) {
  await call(`/v10/projects/${projectId}/env?upsert=true`, {
    method: "POST",
    body: JSON.stringify({ key, value, type: "encrypted", target: ["production", "preview", "development"] }),
  });
}

export type Deployment = {
  id: string;
  url: string;
  readyState: "QUEUED" | "INITIALIZING" | "BUILDING" | "READY" | "ERROR" | "CANCELED";
  alias?: string[];
  errorMessage?: string;
};

export async function deploy(project: VercelProject, files: Record<string, string>) {
  return call<Deployment>("/v13/deployments?skipAutoDetectionConfirmation=1", {
    method: "POST",
    body: JSON.stringify({
      name: project.name,
      project: project.id,
      target: "production",
      files: Object.entries(files).map(([file, data]) => ({ file, data, encoding: "utf-8" })),
      projectSettings: { framework: "nextjs" },
    }),
  });
}

export async function getDeployment(id: string) {
  return call<Deployment>(`/v13/deployments/${id}`);
}

/** The stable production URL of a project (its first .vercel.app domain). */
export async function productionUrl(projectId: string): Promise<string | null> {
  const { domains } = await call<{ domains: { name: string; verified: boolean }[] }>(`/v9/projects/${projectId}/domains`);
  const domain = domains.find((d) => d.verified) ?? domains[0];
  return domain ? `https://${domain.name}` : null;
}

/** The newest lines of a running build's log, newest first: enough to tell which stage it's in. */
export async function latestLogLines(id: string): Promise<string[]> {
  const events = await call<{ text?: string; payload?: { text?: string } }[]>(
    `/v3/deployments/${id}/events?builds=1&direction=backward&limit=20`,
  );
  return (Array.isArray(events) ? events : []).map((e) => e.text ?? e.payload?.text ?? "").filter(Boolean);
}

/** The tail of a failed build's output: what the builder agent needs to fix it. */
export async function buildErrors(id: string): Promise<string> {
  const events = await call<{ type: string; text?: string; payload?: { text?: string } }[]>(
    `/v3/deployments/${id}/events?builds=1&direction=forward&limit=-1`,
  ).catch(() => []);
  const lines = (Array.isArray(events) ? events : [])
    .map((e) => e.text ?? e.payload?.text ?? "")
    .filter(Boolean);
  // Keep the part around the first error; a full npm/next log is mostly noise.
  const firstError = lines.findIndex((l) => /error|failed|cannot find|is not assignable|unexpected/i.test(l));
  const slice = firstError >= 0 ? lines.slice(Math.max(0, firstError - 5), firstError + 60) : lines.slice(-60);
  return slice.join("\n").slice(0, 8000);
}
