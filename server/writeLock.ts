import { AsyncLocalStorage } from "node:async_hooks";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { workspaceRoot, workspaceScope, withProfile, type ProfileScope } from "./workspace.js";

/** One editing process per workspace. This is coordination, not an interprocess write lock. */
const chains = new Map<string, Promise<unknown>>();
const access = new AsyncLocalStorage<{ mode: "read" | "write" | "recovery"; scope: ProfileScope }>();
const blocked = new Map<string, string>();

export function blockWorkspace(reason: string): void { blocked.set(workspaceRoot(), reason); }
export function clearRecoveryBlock(): void { blocked.delete(workspaceRoot()); }
export function recoveryBlock(): string | undefined { return blocked.get(workspaceRoot()); }

export class WorkspaceUnavailableError extends Error {
  status = 503;
  kind = "state" as const;
}

async function applicationState(): Promise<string> {
  if (recoveryBlock()) throw new WorkspaceUnavailableError(recoveryBlock());
  const generation = async () => {
    try { return await readFile(path.join(workspaceRoot(), "applications", ".generation"), "utf8"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return ""; throw error; }
  };
  const before = await generation();
  let names: string[];
  try { names = await readdir(path.join(workspaceRoot(), "applications")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return ""; throw error; }
  if (names.some((name) => name.endsWith(".journal.json"))) {
    throw new WorkspaceUnavailableError("An application is in progress or needs recovery. Workspace reads and writes are unavailable. Restart Monet to complete recovery before editing.");
  }
  // A durable generation changes before a completed journal disappears. Checking on both sides
  // of readdir also covers an Apply that finishes during directory enumeration in another process.
  const after = await generation();
  if (before !== after) throw new WorkspaceUnavailableError("An application completed during this read. Retry to load the committed workspace.");
  return after;
}

function exclusive<T>(mode: "read" | "write" | "recovery", work: () => Promise<T>): Promise<T> {
  const scope = workspaceScope();
  const run = (chains.get(scope.root) ?? Promise.resolve()).then(() => withProfile(scope, async () => { await scope.verify?.(); return access.run({ mode, scope }, work); }));
  const tail = run.catch(() => undefined);
  chains.set(scope.root, tail);
  void tail.then(() => { if (chains.get(scope.root) === tail) chains.delete(scope.root); });
  return run;
}

export function assertWorkspaceWrite(): void {
  if (!ownedAccess() || (access.getStore()?.mode !== "write" && access.getStore()?.mode !== "recovery")) throw new Error("Canonical writers require the workspace write boundary.");
}

export function withWorkspaceWrite<T>(work: () => Promise<T>): Promise<T> {
  if (access.getStore()) throw new Error("Do not nest workspace writes or promote a read to a write.");
  return exclusive("write", async () => { await applicationState(); return work(); });
}

export function withWorkspaceRead<T>(work: () => Promise<T>): Promise<T> {
  // Only the current transaction/recovery may read its own intermediate files. Other callers
  // wait on the queue; a leftover journal makes them explicitly unavailable instead.
  if (access.getStore()) { if (!ownedAccess()) throw new Error("Cross-profile access inside a transaction is forbidden."); return work(); }
  return exclusive("read", async () => {
    const before = await applicationState();
    const result = await work();
    if (before !== await applicationState()) throw new WorkspaceUnavailableError("An application completed during this read. Retry to load the committed workspace.");
    return result;
  });
}

/** Only startup/application recovery may bypass the journal guard. Never use for normal saves. */
export function withWorkspaceRecovery<T>(work: () => Promise<T>): Promise<T> {
  if (access.getStore()) throw new Error("Do not nest workspace recovery.");
  return exclusive("recovery", work);
}

function ownedAccess(): boolean {
  const owner = access.getStore()?.scope, scope = workspaceScope();
  return Boolean(owner && owner.root === scope.root && owner.identity?.id === scope.identity?.id);
}
