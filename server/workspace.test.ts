import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { providerCommand, providerConfigured, providerUnavailableMessage, runProvider } from "./aiProvider.js";
import { initializeStore, loadWorkspace } from "./fileStore.js";
import { formatReport, isEmptyWorkspace, validateWorkspace } from "./validate.js";
import { BUNDLED_WORKSPACE, isBundledWorkspace, resolveWorkspaceRoot, setWorkspaceRoot } from "./workspace.js";

describe("Monet workspace resolution", () => {
  it("falls back to the bundled starter workspace", () => {
    expect(resolveWorkspaceRoot([], {})).toBe(BUNDLED_WORKSPACE);
    expect(isBundledWorkspace(BUNDLED_WORKSPACE)).toBe(true);
  });

  it("prefers an explicit --root over the environment", () => {
    expect(resolveWorkspaceRoot(["--root", "/tmp/mine"], { MONET_ROOT: "/tmp/other" })).toBe(path.resolve("/tmp/mine"));
    expect(resolveWorkspaceRoot(["--root=/tmp/mine"], {})).toBe(path.resolve("/tmp/mine"));
  });

  it("reads MONET_ROOT when no flag is given", () => {
    expect(resolveWorkspaceRoot([], { MONET_ROOT: "/tmp/other" })).toBe(path.resolve("/tmp/other"));
  });

  it("resolves a relative root against the working directory", () => {
    expect(path.isAbsolute(resolveWorkspaceRoot([], { MONET_ROOT: "./workspace" }))).toBe(true);
    expect(isBundledWorkspace(resolveWorkspaceRoot([], { MONET_ROOT: "./workspace" }))).toBe(false);
  });
});

describe("Monet optional AI provider", () => {
  it("treats an unset command as opting out rather than as an error", () => {
    expect(providerConfigured({})).toBe(false);
    expect(providerCommand({})).toBe("");
  });

  it("reads the provider-neutral variable and the older name", () => {
    expect(providerCommand({ MONET_AI_COMMAND: "my-cli" })).toBe("my-cli");
    expect(providerCommand({ MONET_CODEX_EXECUTABLE: "codex" })).toBe("codex");
    expect(providerCommand({ MONET_AI_COMMAND: "my-cli", MONET_CODEX_EXECUTABLE: "codex" })).toBe("my-cli");
  });

  it("explains what to configure instead of failing to spawn", async () => {
    const task = { label: "AI source mapping", prompt: "", schema: {}, modelVariable: "M", effortVariable: "E", timeoutVariable: "T" };
    await expect(runProvider(task, {})).rejects.toThrow(/optional AI-assisted feature and no provider is configured/);
    await expect(runProvider(task, {})).rejects.toThrow(/MONET_AI_COMMAND/);
    // The message names the feature so a person knows what they turned off.
    expect(providerUnavailableMessage("AI reference analysis")).toContain("AI reference analysis");
    expect(providerUnavailableMessage("AI reference analysis")).toContain("Everything else in Monet works without it");
  });

  it("reports a configured-but-missing command as configuration, not a crash", async () => {
    const task = { label: "AI source mapping", prompt: "", schema: {}, modelVariable: "M", effortVariable: "E", timeoutVariable: "T" };
    await expect(runProvider(task, { MONET_AI_COMMAND: "monet-provider-that-does-not-exist" }))
      .rejects.toThrow(/was not found/);
  });
});

describe("Monet workspace validation", () => {
  it("passes the bundled starter workspace with no errors", async () => {
    const workspace = await loadWorkspace();
    const findings = validateWorkspace(workspace);
    expect(findings.filter((finding) => finding.level === "error")).toEqual([]);
  });

  it("reports every broken reference it is given", () => {
    const workspace = {
      principles: [], foundations: [], taxonomy: [], primitiveTaxonomy: [], primitives: [],
      components: [{ id: "ghost", status: "undecided" as const, selection: { source: "ant-design", source_component: "Ghost" }, preferences: {}, behavior: {}, rationale: "", notes: "", use_when: [], avoid_when: [], foundations: ["missing"], primitives: [], candidates: [], history: [], updated_at: "" }],
      patterns: [{ id: "orphan", title: "Orphan", summary: "", body: "", status: "selected" as const, tags: [], order: 0, updated_at: "", components: ["nope"], foundations: ["gone"] }],
      sources: [], references: [], referenceAnalysis: { summary: "", recurring_preferences: [], suggestions: [], analyzed_at: "" },
      decisionLog: [], themes: [], defaultThemeId: "default", activeThemeId: "default",
      baseResolvedTokens: [], resolvedTokens: [], tokenIssues: [], filesRoot: "/tmp",
    };
    const details = validateWorkspace(workspace).map((finding) => finding.detail);
    expect(details).toEqual(expect.arrayContaining([
      expect.stringContaining('decision "ghost" has no entry'),
      expect.stringContaining('ghost links unknown Foundation "missing"'),
      expect.stringContaining('orphan links unknown component "nope"'),
      expect.stringContaining('orphan links unknown Foundation "gone"'),
      expect.stringContaining("ghost is undecided but still names an approved source inspiration"),
    ]));
    expect(formatReport("/tmp/ws", workspace, validateWorkspace(workspace))).toContain("FAIL");
  });

  it("summarises a healthy workspace as OK", async () => {
    const workspace = await loadWorkspace();
    const report = formatReport(BUNDLED_WORKSPACE, workspace, validateWorkspace(workspace));
    expect(report).toContain("bundled starter workspace");
    expect(report).toContain("principles");
    expect(report).toMatch(/OK/);
  });
});

describe("Monet new workspace", () => {
  const created: string[] = [];

  afterAll(async () => {
    setWorkspaceRoot(BUNDLED_WORKSPACE);
    await Promise.all(created.map((directory) => rm(directory, { recursive: true, force: true })));
  });

  async function emptyWorkspace(): Promise<string> {
    const directory = await mkdtemp(path.join(tmpdir(), "monet-new-workspace-"));
    created.push(directory);
    return directory;
  }

  it("reads an empty directory as an empty design system rather than an error", async () => {
    setWorkspaceRoot(await emptyWorkspace());
    const workspace = await loadWorkspace();
    expect(workspace.foundations).toEqual([]);
    expect(workspace.components).toEqual([]);
    expect(workspace.taxonomy).toEqual([]);
    expect(workspace.patterns).toEqual([]);
    expect(workspace.resolvedTokens).toEqual([]);
    expect(isEmptyWorkspace(workspace)).toBe(true);
    expect(validateWorkspace(workspace).filter((finding) => finding.level === "error")).toEqual([]);
  });

  it("serves a new workspace through the read-only surfaces without writing to it", async () => {
    const directory = await emptyWorkspace();
    setWorkspaceRoot(directory);
    // The MCP server and the validator both go through loadWorkspace. Neither may create files:
    // materializing a workspace is a write, and writes belong to the editing path alone.
    await loadWorkspace();
    validateWorkspace(await loadWorkspace());
    expect(await readdir(directory)).toEqual([]);
  });

  it("still surfaces a broken workspace instead of treating it as new", async () => {
    const directory = await emptyWorkspace();
    await mkdir(path.join(directory, "components"), { recursive: true });
    await writeFile(path.join(directory, "components", "decisions.json"), "{ not json", "utf8");
    setWorkspaceRoot(directory);
    await expect(loadWorkspace()).rejects.toThrow();
  });

  it("materializes a workspace only when the editing path asks for it", async () => {
    const directory = await emptyWorkspace();
    setWorkspaceRoot(directory);
    await initializeStore();
    const entries = await readdir(directory);
    expect(entries).toEqual(expect.arrayContaining(["foundations", "patterns", "principles", "taxonomy", "themes"]));
    const workspace = await loadWorkspace();
    expect(validateWorkspace(workspace).filter((finding) => finding.level === "error")).toEqual([]);
  });
});
