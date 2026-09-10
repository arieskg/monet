import { randomUUID } from "node:crypto";
import { mkdir, open, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { workspaceScope } from "./workspace.js";

export async function syncDirectory(directory: string): Promise<void> {
  const handle = await open(directory, "r");
  try { await handle.sync(); } finally { await handle.close(); }
}

/** Never acknowledge a rename as durable until both the file and its directory are synced. */
export async function atomicWrite(file: string, contents: string | Uint8Array): Promise<void> {
  const scope = workspaceScope();
  if (scope.verify) {
    if (!path.resolve(file).startsWith(scope.root + path.sep)) throw new Error("Write escaped its Profile root.");
    await scope.verify();
  }
  const directory = path.dirname(file);
  const created = await mkdir(directory, { recursive: true });
  if (created) {
    for (let current = directory; ; current = path.dirname(current)) {
      await syncDirectory(path.dirname(current));
      if (current === created) break;
    }
  }
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    const handle = await open(temp, "w", 0o600);
    try { await handle.writeFile(contents); await handle.sync(); } finally { await handle.close(); }
    await rename(temp, file);
    await syncDirectory(directory);
    // The containing directory may have been materialized by a caller just before this write.
    await syncDirectory(path.dirname(directory));
  } finally {
    await unlink(temp).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
  }
}

export async function durableRemove(file: string): Promise<void> {
  const scope = workspaceScope();
  if (scope.verify) {
    if (!path.resolve(file).startsWith(scope.root + path.sep)) throw new Error("Removal escaped its Profile root.");
    await scope.verify();
  }
  await unlink(file).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
  await syncDirectory(path.dirname(file));
}
