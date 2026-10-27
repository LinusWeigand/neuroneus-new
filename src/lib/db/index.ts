import "server-only";
import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { __nnPool?: Pool };

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Connect a Neon database in Vercel (Storage → Neon).");
  }
  const pool = new Pool({ connectionString, max: 5, idleTimeoutMillis: 10_000 });
  // Lets Vercel Fluid compute close idle connections before a function suspends.
  attachDatabasePool(pool);
  return pool;
}

const pool = globalForDb.__nnPool ?? createPool();
if (process.env.NODE_ENV !== "production") globalForDb.__nnPool = pool;

export const db = drizzle(pool, { schema });
export { schema };
