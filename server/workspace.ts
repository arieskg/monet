import path from "node:path";

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
  if (index >= 0 && argv[index + 1]) return argv[index + 1];
  const inline = argv.find((argument) => argument.startsWith(`${flag}=`));
  return inline?.slice(flag.length + 1) || undefined;
}

export function resolveWorkspaceRoot(argv: readonly string[] = process.argv.slice(2), env: NodeJS.ProcessEnv = process.env): string {
  const configured = flagValue(argv, "--root") ?? env.MONET_ROOT;
  return configured ? path.resolve(configured) : BUNDLED_WORKSPACE;
}

export function isBundledWorkspace(root: string): boolean {
  return path.resolve(root) === BUNDLED_WORKSPACE;
}

let current = resolveWorkspaceRoot();

/** The active workspace root. Read through a function so a caller can retarget before any read. */
export function workspaceRoot(): string {
  return current;
}

/** Point Monet at a different workspace. Used by the CLI entrypoints and by tests. */
export function setWorkspaceRoot(root: string): void {
  current = path.resolve(root);
}

export { BUNDLED_WORKSPACE };
