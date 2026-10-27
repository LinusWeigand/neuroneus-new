import "server-only";
import { Client } from "pg";

// Each generated app gets its own Neon project. We keep only ids and names; the connection
// string is a secret, so it's fetched from the Neon API when needed instead of stored.

const API = "https://console.neon.tech/api/v2";

export function neonConfigured() {
  return Boolean(process.env.NEON_API_KEY);
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(API + path, {
    ...init,
    headers: {
      authorization: `Bearer ${process.env.NEON_API_KEY}`,
      accept: "application/json",
      "content-type": "application/json",
      ...init.headers,
    },
    signal: AbortSignal.timeout(30_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Neon ${res.status}: ${body.message ?? res.statusText}`);
  return body as T;
}

let orgIdCache: string | undefined;

async function orgId() {
  if (process.env.NEON_ORG_ID) return process.env.NEON_ORG_ID;
  if (orgIdCache) return orgIdCache;
  const { organizations } = await call<{ organizations: { id: string }[] }>("/users/me/organizations");
  if (!organizations?.length) throw new Error("No Neon organization found for this API key.");
  orgIdCache = organizations[0].id;
  return orgIdCache;
}

export type NeonDatabase = { projectId: string; databaseName: string; roleName: string };

export async function createDatabase(name: string): Promise<NeonDatabase> {
  const body = await call<{
    project: { id: string };
    databases: { name: string }[];
    roles: { name: string }[];
  }>("/projects", {
    method: "POST",
    body: JSON.stringify({
      project: {
        name: name.slice(0, 64),
        org_id: await orgId(),
        // Frankfurt, next to the app's functions (fra1).
        region_id: process.env.NEON_REGION || "aws-eu-central-1",
        pg_version: 17,
      },
    }),
  });
  return { projectId: body.project.id, databaseName: body.databases[0].name, roleName: body.roles[0].name };
}

/** False when the database project was deleted (e.g. in the Neon console). */
export async function databaseExists(projectId: string) {
  try {
    await call(`/projects/${projectId}`);
    return true;
  } catch (err) {
    if (err instanceof Error && /^Neon 404/.test(err.message)) return false;
    throw err;
  }
}

/** Deletes the database project with all its data. One that's already gone counts as deleted. */
export async function deleteDatabase(projectId: string) {
  try {
    await call(`/projects/${projectId}`, { method: "DELETE" });
  } catch (err) {
    if (!(err instanceof Error && /^Neon 404/.test(err.message))) throw err;
  }
}

export async function connectionUri(db: NeonDatabase, { pooled = true } = {}) {
  const q = new URLSearchParams({ database_name: db.databaseName, role_name: db.roleName, pooled: String(pooled) });
  const { uri } = await call<{ uri: string }>(`/projects/${db.projectId}/connection_uri?${q}`);
  return uri;
}

/** Runs the app's idempotent schema file against its database. Throws with Postgres' message. */
export async function applySchema(db: NeonDatabase, schemaSql: string) {
  const sql = schemaSql.trim();
  if (!sql || /^(--[^\n]*\n?\s*)*$/.test(sql)) return;
  const client = new Client({ connectionString: await connectionUri(db, { pooled: false }), connectionTimeoutMillis: 20_000 });
  await client.connect();
  try {
    await client.query("set statement_timeout = '30s'");
    await client.query(sql);
  } finally {
    await client.end();
  }
}
