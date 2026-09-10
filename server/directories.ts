import { opendir, realpath, lstat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PROJECT_LIMITS, type DirectoryListing } from "../shared/projects.js";

/**
 * Editor-only folder browsing so a non-technical user can pick a project directory. Names only:
 * no files, no hidden entries, no contents, and nothing is followed through symlinks.
 */
export async function listDirectories(input?: string | null): Promise<DirectoryListing> {
  const home = await realpath(os.homedir()).catch(() => os.homedir());
  const requested = input?.trim() ? path.resolve(input.trim()) : home;
  let current: string;
  try { current = await realpath(requested); if (!(await lstat(current)).isDirectory()) throw new Error("not a directory"); }
  catch { throw Object.assign(new Error("That folder does not exist or is not accessible."), { status: 400 }); }
  const entries: DirectoryListing["entries"] = [];
  let truncated = false;
  let scanned = 0;
  for await (const entry of await opendir(current)) {
    if (++scanned > PROJECT_LIMITS.entries) { truncated = true; break; }
    if (!entry.isDirectory() || entry.name.startsWith(".") || entry.name === "node_modules") continue;
    if (entries.length >= PROJECT_LIMITS.directories) { truncated = true; break; }
    entries.push({ name: entry.name, path: path.join(current, entry.name) });
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  return { path: current, parent: path.dirname(current) === current ? null : path.dirname(current), home, entries, truncated };
}
