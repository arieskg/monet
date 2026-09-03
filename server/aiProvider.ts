import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Monet's optional AI-assisted features — source inventory mapping and reference analysis.
 *
 * Everything else in Monet is deterministic and works with no provider installed: the workspace,
 * the UI, the file service, retrieval, and the MCP server never reach this module. These two
 * features shell out to a local CLI that can take a prompt on stdin and write JSON matching a
 * schema. Which CLI that is, is the user's choice; Monet does not depend on any provider.
 *
 * Configure with `MONET_AI_COMMAND`. When it is unset or the command is not installed, the feature
 * says so plainly instead of failing with a spawn error.
 *
 * The abstraction is provider-neutral but the argument contract is not yet general: the flags below
 * match the Codex CLI's shape. Another provider works if it accepts the same flags, or behind a
 * wrapper script that translates them. Generalizing the contract is future work.
 */

export const AI_COMMAND_VARIABLE = "MONET_AI_COMMAND";

export interface ProviderTask {
  /** Short name used in timeout and failure messages, for example "source mapping". */
  label: string;
  prompt: string;
  schema: unknown;
  /** Environment variable holding an optional model name for this task. */
  modelVariable: string;
  /** Environment variable holding an optional reasoning-effort setting for this task. */
  effortVariable: string;
  /** Environment variable holding an optional timeout in seconds for this task. */
  timeoutVariable: string;
}

/** The configured provider command, or "" when the user has not opted into the optional features. */
export function providerCommand(env: NodeJS.ProcessEnv = process.env): string {
  // MONET_CODEX_EXECUTABLE predates the provider-neutral name and still works.
  return (env[AI_COMMAND_VARIABLE] || env.MONET_CODEX_EXECUTABLE || "").trim();
}

export function providerConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(providerCommand(env));
}

export function providerUnavailableMessage(feature: string): string {
  return `${feature} is an optional AI-assisted feature and no provider is configured. `
    + `Set ${AI_COMMAND_VARIABLE} to a local CLI that accepts a prompt on stdin and writes JSON matching a supplied schema `
    + `(the built-in argument shape matches the Codex CLI; other providers need a compatible wrapper). `
    + `Everything else in Monet works without it.`;
}

function positiveSeconds(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Runs the configured provider over a prompt and parses the JSON it writes:
 *
 *   <command> exec --ephemeral --sandbox read-only --output-schema <schema> -o <result> -
 *
 * with the prompt on stdin. A provider that does not accept these flags needs a wrapper script;
 * the failure is reported with the command's own stderr so the user can see what it objected to.
 */
export async function runProvider<T>(task: ProviderTask, env: NodeJS.ProcessEnv = process.env): Promise<T> {
  const command = providerCommand(env);
  if (!command) throw new Error(providerUnavailableMessage(task.label));

  const directory = await mkdtemp(path.join(tmpdir(), `monet-${task.label.replace(/[^a-z0-9]+/gi, "-")}-`));
  const schemaPath = path.join(directory, "schema.json");
  const outputPath = path.join(directory, "result.json");
  await writeFile(schemaPath, JSON.stringify(task.schema), "utf8");
  const args = ["exec", "--ephemeral", "--sandbox", "read-only", "--output-schema", schemaPath, "-o", outputPath];
  if (env[task.modelVariable]) args.push("-m", env[task.modelVariable]!);
  if (env[task.effortVariable]) args.push("-c", `model_reasoning_effort=${JSON.stringify(env[task.effortVariable])}`);
  args.push("-");

  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(command, args, { cwd: path.resolve(import.meta.dirname, ".."), stdio: ["pipe", "ignore", "pipe"] });
      let stderr = "";
      const timeoutMs = positiveSeconds(env[task.timeoutVariable], 300) * 1_000;
      const timer = setTimeout(() => { child.kill("SIGTERM"); reject(new Error(`${task.label} timed out.`)); }, timeoutMs);
      child.stderr.on("data", (chunk: Buffer) => { stderr = `${stderr}${chunk.toString("utf8")}`.slice(-4_000); });
      child.on("error", (error: NodeJS.ErrnoException) => {
        clearTimeout(timer);
        // A missing command is a configuration state, not a crash, so it reads as one.
        reject(new Error(error.code === "ENOENT"
          ? `${providerUnavailableMessage(task.label)} The configured command "${command}" was not found.`
          : `Unable to start the configured AI provider "${command}": ${error.message}`));
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error(`${task.label} failed${stderr.trim() ? `: ${stderr.trim()}` : ` (exit ${code ?? "unknown"})`}`));
      });
      child.stdin.end(task.prompt);
    });
    return JSON.parse(await readFile(outputPath, "utf8")) as T;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
