import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { providerCommand, providerConfigured, providerUnavailableMessage, runProvider } from "./aiProvider.js";
import { initializeStore, loadWorkspace, regenerateExports, saveTheme } from "./fileStore.js";
import { formatReport, isEmptyWorkspace, validateWorkspace } from "./validate.js";
import { BUNDLED_WORKSPACE, isBundledWorkspace, resolveWorkspaceRoot, resolveExpectedProfileId, setWorkspaceRoot } from "./workspace.js";

describe("Monet workspace resolution", () => {
  it("rejects incomplete bindings without silently selecting another Profile", () => {
    expect(() => resolveWorkspaceRoot(["--root"], {})).toThrow(/no fallback/);
    expect(() => resolveWorkspaceRoot(["--root="], {})).toThrow(/no fallback/);
    expect(() => resolveExpectedProfileId(["--profile"], {})).toThrow(/no fallback/);
    expect(() => resolveExpectedProfileId(["--profile="], {})).toThrow(/no fallback/);
    expect(() => resolveExpectedProfileId([], { MONET_PROFILE_ID: "wrong" })).toThrow(/no fallback/);
  });
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
      decisionLog: [], themes: [], defaultThemeId: "default", activeThemeId: "default", activeMode: "light" as const, modes: ["light" as const],
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

  it("checks every theme in every mode and the modes themselves", () => {
    const foundation = {
      id: "color", name: "Color", status: "selected" as const, description: "", rationale: "", guidance: "", notes: "", order: 0, updated_at: "",
      tokens: [
        { id: "neutral-100", name: "neutral.100", foundation: "color", type: "color" as const, level: "primitive" as const, value: "#ecf0f1", description: "", order: 0 },
        { id: "color-background", name: "color.background", foundation: "color", type: "color" as const, level: "semantic" as const, value: "{neutral.100}", description: "", order: 1, modes: { dark: "{neutral.950}" } },
        { id: "color-surface", name: "color.surface", foundation: "color", type: "color" as const, level: "semantic" as const, value: "#ffffff", description: "", order: 2, modes: { dark: "#ffffff", sepia: "#f5e9d4" } as { dark: string } },
      ],
    };
    const workspace = {
      principles: [], foundations: [foundation], taxonomy: [], primitiveTaxonomy: [], primitives: [], components: [], patterns: [],
      sources: [], references: [], referenceAnalysis: { summary: "", recurring_preferences: [], suggestions: [], analyzed_at: "" }, decisionLog: [],
      themes: [{ id: "product", name: "Product", overrides: { "color.surface": "#fafafa" }, modes: { dark: { "color.ghost": "#000" } }, updated_at: "" }],
      defaultThemeId: "product", activeThemeId: "product", activeMode: "light" as const, modes: ["light" as const, "dark" as const],
      baseResolvedTokens: [], resolvedTokens: [{ ...foundation.tokens[1]!, resolved_value: "#ecf0f1", valid: true, base_resolved_value: "#ecf0f1", source: "base" as const, theme_id: null, mode: "light" as const, override_dependencies: [] }], tokenIssues: [], filesRoot: "/tmp",
    };
    const details = validateWorkspace(workspace).map((finding) => `${finding.level}: ${finding.detail}`);
    expect(details).toEqual(expect.arrayContaining([
      expect.stringContaining("error: product (dark): color.background: color.background references undefined token neutral.950"),
      expect.stringContaining('error: product (dark) overrides unknown token "color.ghost"'),
      expect.stringContaining('error: color.surface defines a value for unknown mode "sepia"'),
    ]));
    // The light resolution is fine, and light is never reported as a mode problem.
    expect(details.filter((detail) => detail.includes("(light)"))).toEqual([]);
  });

  it("warns when a declared dark mode still resolves to a light page", async () => {
    const workspace = await loadWorkspace();
    const lightened = {
      ...workspace,
      foundations: workspace.foundations.map((foundation) => ({ ...foundation, tokens: foundation.tokens.map((token) => token.name === "color.background" ? { ...token, modes: { dark: "{neutral.white}" } } : token) })),
    };
    const findings = validateWorkspace(lightened);
    expect(findings.filter((finding) => finding.level === "error")).toEqual([]);
    expect(findings.find((finding) => finding.check === "dark mode is actually dark")?.detail)
      .toBe("default has a dark mode from Foundation dark values, but color.background resolves to #ffffff, which is not dark (Foundation dark value)");
    expect(validateWorkspace(workspace).filter((finding) => finding.check === "dark mode is actually dark")).toEqual([]);

    // A theme can be the only reason a dark mode exists, and the warning says so rather than blaming the Foundations.
    const lightOnly = { ...workspace, foundations: workspace.foundations.map((foundation) => ({ ...foundation, tokens: foundation.tokens.map(({ modes: _modes, ...token }) => token) })) };
    const themeOnly = validateWorkspace({ ...lightOnly, themes: [{ id: "product", name: "Product", overrides: {}, modes: { dark: { "color.background": "#fafafa" } }, updated_at: "" }] });
    expect(themeOnly.filter((finding) => finding.level === "error")).toEqual([]);
    expect(themeOnly.find((finding) => finding.check === "dark mode is actually dark")?.detail)
      .toBe("product has a dark mode only from its own dark overrides, but color.background resolves to #fafafa, which is not dark (product dark override)");
    // Without dark values anywhere the workspace is light-only, and light-only says nothing about dark.
    const stillLight = validateWorkspace({ ...lightOnly, themes: [{ id: "product", name: "Product", overrides: {}, updated_at: "" }] });
    expect(stillLight.filter((finding) => finding.level === "error" || finding.detail.includes("(dark)") || finding.check === "dark mode is actually dark")).toEqual([]);
  });

  it("holds every theme to the colour contracts in every mode, and blames the layer that broke one", async () => {
    const workspace = await loadWorkspace();
    // A theme written before modes existed pins light values in `overrides`, which applies in every
    // mode: the light resolution is unchanged, and the dark resolution puts light text on a white surface.
    const legacy = { id: "legacy", name: "Legacy", overrides: { "color.surface": "#ffffff", "color.background": "#ecf0f1" }, updated_at: "" };
    const findings = validateWorkspace({ ...workspace, themes: [...workspace.themes, legacy] });
    const errors = findings.filter((finding) => finding.level === "error").map((finding) => `${finding.check}: ${finding.detail}`);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.filter((detail) => !detail.startsWith("colour pairings meet their contrast minimum: legacy (dark): "))).toEqual([]);
    expect(errors).toEqual(expect.arrayContaining([
      expect.stringMatching(/legacy \(dark\): color\.foreground on color\.surface is 1\.\d\d:1, below the 4\.5:1 text minimum \(color\.foreground: #[0-9a-f]{6}, Foundation dark value; color\.surface: #ffffff, legacy override, applied in every mode\)$/),
      expect.stringMatching(/legacy \(dark\): color\.border\.strong on color\.surface is [\d.]+:1, below the 3:1 non-text minimum/),
      expect.stringMatching(/legacy \(dark\): color\.focus on color\.surface is [\d.]+:1, below the 3:1 non-text minimum/),
    ]));
    // The theme's light resolution and the default theme are untouched.
    expect(findings.filter((finding) => finding.detail.includes("(light)") || finding.detail.startsWith("default "))).toEqual([]);
    expect(findings.find((finding) => finding.check === "dark mode is actually dark")?.detail)
      .toBe("legacy has a dark mode from Foundation dark values, but color.background resolves to #ecf0f1, which is not dark (legacy override, applied in every mode)");

    // A dark-only override outranks the every-mode override, which is the whole migration for such a theme.
    const migrated = { ...legacy, modes: { dark: { "color.surface": "{neutral.950}", "color.background": "{neutral.975}" } } };
    expect(validateWorkspace({ ...workspace, themes: [...workspace.themes, migrated] }).filter((finding) => finding.detail.startsWith("legacy"))).toEqual([]);

    // A margin miss on a derived role is a warning, and a floor miss on a fixed pairing is an error, in light as in dark.
    const tinted = { id: "tinted", name: "Tinted", overrides: { "color.link": "#2c7aab", "color.on.primary": "#d9c8e2" }, updated_at: "" };
    const tintedFindings = validateWorkspace({ ...workspace, themes: [tinted] }).filter((finding) => finding.detail.startsWith("tinted (light)"));
    expect(tintedFindings.map((finding) => `${finding.level}: ${finding.check}`)).toEqual(expect.arrayContaining([
      "warning: derived colour roles keep their contrast margin",
      "error: colour pairings meet their contrast minimum",
    ]));
    expect(tintedFindings.find((finding) => finding.level === "warning")?.detail).toMatch(/color\.link on color\.surface is 4\.\d\d:1, below Monet's 4\.75:1 margin for a derived role \(color\.link: #2c7aab, tinted override, applied in every mode; color\.surface: #ffffff, Base Monet value\)/);
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

  it("reads an older workspace with no dark values as light-only, and grows a dark mode from the records", async () => {
    const directory = await emptyWorkspace();
    setWorkspaceRoot(directory);
    await initializeStore();
    await mkdir(path.join(directory, "foundations"), { recursive: true });
    const foundation = { id: "color", name: "Color", status: "selected", description: "", rationale: "", guidance: "", notes: "", order: 0, updated_at: "", tokens: [
      { name: "neutral.100", value: "#ecf0f1", type: "color", level: "primitive" },
      { name: "color.background", value: "{neutral.100}", type: "color", level: "semantic" },
    ] };
    await writeFile(path.join(directory, "foundations", "color.json"), JSON.stringify(foundation), "utf8");
    // A pre-mode workspace: dark is not available, asking for it falls back to light, and no dark export is written.
    const before = await loadWorkspace(undefined, "dark");
    expect(before.modes).toEqual(["light"]);
    expect(before.activeMode).toBe("light");
    await regenerateExports();
    expect(await readdir(path.join(directory, "tokens", "themes"))).toEqual(["default.json"]);

    // Adding one dark value to a Foundation is the whole migration.
    foundation.tokens[1] = { ...foundation.tokens[1]!, modes: { dark: "#111921" } } as typeof foundation.tokens[number];
    await writeFile(path.join(directory, "foundations", "color.json"), JSON.stringify(foundation), "utf8");
    const after = await loadWorkspace(undefined, "dark");
    expect(after.modes).toEqual(["light", "dark"]);
    expect(after.activeMode).toBe("dark");
    expect(after.resolvedTokens.find((token) => token.name === "color.background")).toMatchObject({ resolved_value: "#111921", source: "mode" });
    await regenerateExports();
    expect((await readdir(path.join(directory, "tokens", "themes"))).sort()).toEqual(["default.dark.json", "default.json"]);
    const darkExport = JSON.parse(await readFile(path.join(directory, "tokens", "themes", "default.dark.json"), "utf8")) as { mode: string; theme: { modes: string[] }; tokens: Array<{ name: string; resolved_value: string }> };
    expect(darkExport.mode).toBe("dark");
    expect(darkExport.theme.modes).toEqual(["light", "dark"]);
    expect(darkExport.tokens.find((token) => token.name === "color.background")?.resolved_value).toBe("#111921");
    expect(await readFile(path.join(directory, "DESIGN_SYSTEM.md"), "utf8")).toContain("`color.background` = `#ecf0f1` · dark: `#111921`");

    // A theme's dark-only override is validated against real tokens and persisted without an empty light map.
    await expect(saveTheme("product", { id: "product", name: "Product", overrides: {}, modes: { dark: { "color.nope": "#000" } }, updated_at: "" })).rejects.toThrow("unknown token color.nope");
    const saved = await saveTheme("product", { id: "product", name: "Product", overrides: {}, modes: { dark: { "color.background": "#000000" }, light: { "color.background": "#ffffff" } } as never, updated_at: "" });
    expect(saved.modes).toEqual({ dark: { "color.background": "#000000" } });
    const themed = await loadWorkspace("product", "dark");
    expect(themed.resolvedTokens.find((token) => token.name === "color.background")).toMatchObject({ resolved_value: "#000000", source: "theme", theme_id: "product" });
    expect(validateWorkspace(themed).filter((finding) => finding.level === "error")).toEqual([]);
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
