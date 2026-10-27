import "server-only";
import { promisify } from "node:util";
import { gunzip, gzip } from "node:zlib";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";

// A build's large state (source snapshots, the builder's conversation) lives in build_blobs,
// gzipped, and is read only by the step that needs it. Database traffic is metered: the build
// row itself stays small enough to poll.

type BlobName = "files" | "good" | "task" | "art";

const zip = promisify(gzip);
const unzip = promisify(gunzip);

export async function loadBlob<T>(buildId: string, name: BlobName): Promise<T | null> {
  const [row] = await db
    .select({ data: schema.buildBlobs.data })
    .from(schema.buildBlobs)
    .where(and(eq(schema.buildBlobs.buildId, buildId), eq(schema.buildBlobs.name, name)));
  if (!row) return null;
  // Gzip starts with 1f 8b; rows moved over by the migration are plain JSON.
  const gzipped = row.data[0] === 0x1f && row.data[1] === 0x8b;
  const text = (gzipped ? await unzip(row.data) : row.data).toString("utf8");
  return JSON.parse(text) as T;
}

export async function saveBlobs(buildId: string, blobs: Partial<Record<BlobName, unknown | null>>) {
  for (const [name, value] of Object.entries(blobs) as [BlobName, unknown][]) {
    if (value === undefined) continue;
    if (value === null) {
      await db.delete(schema.buildBlobs).where(and(eq(schema.buildBlobs.buildId, buildId), eq(schema.buildBlobs.name, name)));
      continue;
    }
    const data = await zip(Buffer.from(JSON.stringify(value), "utf8"));
    await db
      .insert(schema.buildBlobs)
      .values({ buildId, name, data })
      .onConflictDoUpdate({
        target: [schema.buildBlobs.buildId, schema.buildBlobs.name],
        set: { data, updatedAt: sql`now()` },
      });
  }
}

/** A finished round's state isn't needed anymore: the repository has the source. */
export async function clearBlobs(buildIds: string | string[]) {
  const ids = Array.isArray(buildIds) ? buildIds : [buildIds];
  if (ids.length) await db.delete(schema.buildBlobs).where(inArray(schema.buildBlobs.buildId, ids));
}
