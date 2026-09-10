import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import path from "node:path";

export const PROJECT_IGNORED = new Set(["node_modules", ".git", ".next", ".nuxt", ".svelte-kit", ".astro", ".cache", ".turbo", ".vercel", ".claude", "coverage", "test-results", "playwright-report", "__pycache__", ".venv", "venv", "vendor", "target"]);
export const privateProjectSegment = (name: string) => name.startsWith(".") && name !== ".well-known" || PROJECT_IGNORED.has(name);

/** Refuse links in every component and read only a bounded regular-file descriptor.
 * Hard links have no knowable parent boundary, so multiply linked files are excluded.
 * A hostile process racing filesystem mutations is outside the local-process threat model.
 */
export async function readProjectFile(root: string, relative: string, limit: number, whole = false): Promise<Buffer> {
  if (path.isAbsolute(relative) || relative.includes("\\") || relative.includes("\0")) throw new Error("Invalid project path.");
  const parts = relative.split("/");
  if (parts.some((part) => !part || part === ".." || privateProjectSegment(part))) throw new Error("Private project path.");
  if (await realpath(root) !== root || !(await lstat(root)).isDirectory()) throw new Error("Project root moved.");
  let current = root;
  for (const part of parts) {
    current = path.join(current, part);
    if ((await lstat(current)).isSymbolicLink()) throw new Error("Project links are not supported.");
  }
  const handle = await open(current, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.nlink !== 1 || whole && stat.size > limit) throw new Error("Unsupported project file.");
    const buffer = Buffer.alloc(Math.min(stat.size, limit) + (whole ? 1 : 0));
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    if (whole && offset > limit) throw new Error("Project file exceeds the limit.");
    return buffer.subarray(0, offset);
  } finally { await handle.close(); }
}
