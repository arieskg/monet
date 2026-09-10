import path from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";
import type { ProfileIdentity, ProfileOwned, ProjectBinding, ProjectEvidenceBinding } from "../shared/profiles.js";

/**
 * Where Monet reads and writes design-system records.
 *
 * Monet is the tool; a workspace is the content. The repository ships one under `monet/` as a
 * starter, but nothing in the application assumes that directory — point `MONET_ROOT` or `--root`
 * at your own and every surface (UI, file service, MCP server, validator) follows.
 *
 * Resolution order, first match wins:
 *   1. `--root <path>` on the command line
 *   2. the `MONET_ROOT` environment variable
 *   3. the bundled starter workspace
 */

const BUNDLED_WORKSPACE = path.resolve(import.meta.dirname, "../monet");

function flagValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  const inline = argv.find((argument) => argument.startsWith(`${flag}=`));
  if (index < 0 && inline === undefined) return undefined;
  const value = index >= 0 ? argv[index + 1] : inline?.slice(flag.length + 1);
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value; no fallback is allowed.`);
  return value;
}
export function resolveExpectedProfileId(argv: readonly string[] = process.argv.slice(2), env: NodeJS.ProcessEnv = process.env): string | undefined {
  const value = flagValue(argv, "--profile") ?? env.MONET_PROFILE_ID;
  if (value !== undefined && !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value)) throw new Error("Expected Profile ID must be a UUID; no fallback is allowed.");
  return value;
}

export function resolveWorkspaceRoot(argv: readonly string[] = process.argv.slice(2), env: NodeJS.ProcessEnv = process.env): string {
  const configured = flagValue(argv, "--root") ?? env.MONET_ROOT;
  return configured ? path.resolve(configured) : BUNDLED_WORKSPACE;
}

export function isBundledWorkspace(root: string): boolean {
  return path.resolve(root) === BUNDLED_WORKSPACE;
}

let current = resolveWorkspaceRoot();

/** Root captured by the current Profile operation, or the single-profile CLI/test fallback. */
export function workspaceRoot(): string {
  return profileContext.getStore()?.root ?? current;
}

/** Legacy CLI/test configuration only. Never use this for UI selection or registered Profiles. */
export function setWorkspaceRoot(root: string): void {
  current = path.resolve(root);
}

export { BUNDLED_WORKSPACE };

/** Immutable scope captured by a bound service, request or provider job. Never UI selection. */
export interface ProfileScope {
  readonly root: string; readonly identity?: ProfileIdentity; readonly verify?: () => Promise<void>;
  readonly assertProject?: (binding: ProjectEvidenceBinding) => void;
  /** Registry-backed Project binding operations for this Profile only (Surfaces V1.1 connection layer). */
  readonly bindProject?: (id: string, name: string) => Promise<ProjectBinding>;
  readonly projectBinding?: (id: string) => ProjectBinding | undefined;
  readonly checkProjectRoot?: (root: string) => void;
}
const profileContext = new AsyncLocalStorage<ProfileScope>();
export function workspaceScope(): ProfileScope { return profileContext.getStore() ?? Object.freeze({ root: current }); }
export function withProfile<T>(scope: ProfileScope, work: () => T): T {
  return profileContext.run(scope, work);
}
export function profileOwnership(): ProfileOwned {
  const id = workspaceScope().identity?.id;
  return id ? { profile_id: id, scope_version: 2 } : {};
}
export function assertProfileOwnership(record: ProfileOwned): void {
  const identity = workspaceScope().identity;
  if (record.profile_id ? record.profile_id !== identity?.id || record.scope_version !== 2
    : record.scope_version !== undefined || identity && identity.origin.kind !== "enrolled") {
    throw Object.assign(new Error("Record belongs to a different Profile or has invalid Profile scope."), { status: 409 });
  }
}

export function assertProjectBinding(binding?: ProjectEvidenceBinding): void {
  if (!binding) return;
  const check = workspaceScope().assertProject;
  if (!check) throw Object.assign(new Error("Project evidence requires a registered Project/Profile binding."), { status: 409 });
  check(binding);
}
