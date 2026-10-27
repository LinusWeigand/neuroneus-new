import "server-only";
import { octokit, status } from "@/lib/github";

// The project repository is the durable source of truth for the generated app. Builds load
// it as a plain file map, edit that map, and write each finished task back as one commit.

export type FileMap = Record<string, string>;

const BINARY = /\.(png|jpe?g|gif|webp|avif|ico|pdf|zip|gz|woff2?|ttf|otf|eot|mp[34]|mov|wasm|lock)$/i;
const MAX_FILE_BYTES = 200_000;

function split(fullName: string) {
  const [owner, repo] = fullName.split("/");
  return { owner, repo };
}

async function headSha(fullName: string): Promise<string | null> {
  try {
    const { data } = await octokit().git.getRef({ ...split(fullName), ref: "heads/main" });
    return data.object.sha;
  } catch (err) {
    if (status(err) === 404 || status(err) === 409) return null; // empty repository
    throw err;
  }
}

/** All text files on main. Binary and very large files are skipped (agents work on source). */
export async function readRepo(fullName: string): Promise<FileMap> {
  const gh = octokit();
  const sha = await headSha(fullName);
  if (!sha) return {};
  const { data: commit } = await gh.git.getCommit({ ...split(fullName), commit_sha: sha });
  const { data: tree } = await gh.git.getTree({ ...split(fullName), tree_sha: commit.tree.sha, recursive: "true" });
  const blobs = tree.tree.filter(
    (e) => e.type === "blob" && e.path && e.sha && !BINARY.test(e.path) && (e.size ?? 0) <= MAX_FILE_BYTES,
  );
  const files: FileMap = {};
  // A handful of parallel reads keeps this fast without tripping secondary rate limits.
  for (let i = 0; i < blobs.length; i += 8) {
    await Promise.all(
      blobs.slice(i, i + 8).map(async (e) => {
        const { data } = await gh.git.getBlob({ ...split(fullName), file_sha: e.sha! });
        files[e.path!] = Buffer.from(data.content, "base64").toString("utf8");
      }),
    );
  }
  return files;
}

/** Writes the difference between two file maps to main as a single commit. Returns its sha, or null if nothing changed. */
export async function commitChanges(
  fullName: string,
  before: FileMap,
  after: FileMap,
  message: string,
  author: { name: string; email: string },
): Promise<string | null> {
  const gh = octokit();
  const changed = Object.keys(after).filter((p) => before[p] !== after[p]);
  const deleted = Object.keys(before).filter((p) => !(p in after));
  if (changed.length === 0 && deleted.length === 0) return null;

  const parent = await headSha(fullName);
  const baseTree = parent
    ? (await gh.git.getCommit({ ...split(fullName), commit_sha: parent })).data.tree.sha
    : undefined;

  const entries = await Promise.all(
    changed.map(async (path) => {
      const { data } = await gh.git.createBlob({ ...split(fullName), content: after[path], encoding: "utf-8" });
      return { path, mode: "100644" as const, type: "blob" as const, sha: data.sha };
    }),
  );
  const removals = deleted.map((path) => ({ path, mode: "100644" as const, type: "blob" as const, sha: null }));

  const { data: tree } = await gh.git.createTree({ ...split(fullName), base_tree: baseTree, tree: [...entries, ...removals] });
  const { data: commit } = await gh.git.createCommit({
    ...split(fullName),
    message,
    tree: tree.sha,
    parents: parent ? [parent] : [],
    author: { ...author, date: new Date().toISOString() },
  });
  if (parent) {
    await gh.git.updateRef({ ...split(fullName), ref: "heads/main", sha: commit.sha });
  } else {
    await gh.git.createRef({ ...split(fullName), ref: "refs/heads/main", sha: commit.sha });
  }
  return commit.sha;
}
