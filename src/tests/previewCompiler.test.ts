import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PreviewValidationAreas } from "../components/PreviewValidation";
import type { ResolvedThemeToken, Workspace } from "../domain";
import { workspaceWithTheme } from "../exportFormats";
import { compilePreview, previewDefaults } from "../previewCompiler";
import generatedTokens from "../../monet/tokens/tokens.json";

function resolvedToken(name: string, foundation: string, resolvedValue: string, source: "base" | "theme" = "base"): ResolvedThemeToken {
  return {
    id: name.replaceAll(".", "-"), name, foundation, type: foundation === "color" ? "color" : "dimension", level: "semantic", value: resolvedValue,
    description: `${name} description`, order: 0, resolved_value: resolvedValue, valid: true, base_resolved_value: source === "theme" ? "#000000" : resolvedValue,
    source, theme_id: source === "theme" ? "product" : null, mode: "light", override_dependencies: source === "theme" ? [name] : [],
  };
}

const workspace = {
  principles: [],
  foundations: [{ id: "color", name: "Color", status: "selected", description: "", rationale: "", guidance: "", notes: "", order: 0, tokens: [], updated_at: "" }],
  taxonomy: [{ id: "actions", name: "Actions", entries: [{ id: "button", name: "Button", category: "actions", description: "", aliases: [], relationships: [] }] }],
  primitiveTaxonomy: [],
  primitives: [{ id: "pressable", status: "selected", purpose: "", preferences: {}, tokens: [], inspiration: null, notes: "", updated_at: "" }],
  components: [{ id: "button", status: "selected", selection: { source: "ant-design", source_component: "Button" }, preferences: { density: "compact", radius: "medium" }, behavior: {}, rationale: "", notes: "", use_when: [], avoid_when: [], foundations: [], primitives: [], candidates: [], history: [], updated_at: "" }],
  patterns: [{ id: "forms", title: "Forms", summary: "", body: "", status: "selected", tags: [], order: 0, updated_at: "" }],
  sources: [{ id: "ant-design", name: "Ant Design", type: "reference", homepage: "", repository: "", framework: "React", package: "", license: "", notes: "", enabled: true, mappings: [], updated_at: "" }],
  references: [], referenceAnalysis: { summary: "", recurring_preferences: [], suggestions: [], analyzed_at: "" },
  decisionLog: [],
  themes: [{ id: "product", name: "Product", overrides: { "color.primary": "#6750a4" }, updated_at: "" }],
  defaultThemeId: "product",
  activeThemeId: "product", activeMode: "light", modes: ["light"],
  baseResolvedTokens: [],
  resolvedTokens: [
    resolvedToken("color.primary", "color", "#6750a4", "theme"),
    resolvedToken("color.background", "color", "#f7f7fb"),
    resolvedToken("color.surface", "color", "#ffffff"),
    resolvedToken("color.foreground", "color", "#20212a"),
  ],
  tokenIssues: [],
  filesRoot: "/tmp/monet",
} satisfies Workspace;

describe("Monet preview fallbacks", () => {
  it("keeps every fallback equal to the resolved token it stands in for", () => {
    const resolved = new Map(generatedTokens.tokens.map((token) => [token.name, String(token.resolved_value)]));
    const drifted = Object.entries(previewDefaults).flatMap(([name, fallback]) => {
      const value = resolved.get(name);
      return value !== undefined && value !== String(fallback) ? [`${name}: ${String(fallback)} != ${value}`] : [];
    });
    expect(drifted).toEqual([]);
  });
});

describe("Preview compiler", () => {
  it("derives theme values, active decisions, and provenance from the workspace", () => {
    const preview = compilePreview(workspace);
    expect(preview.theme).toEqual({ id: "product", name: "Product" });
    expect(preview.cssVariables["--pv-primary"]).toBe("#6750a4");
    expect(preview.colors.find((token) => token.name === "color.primary")).toMatchObject({ value: "#6750a4", source: "theme" });
    expect(preview.components.button).toMatchObject({ sourceName: "Ant Design", sourceComponent: "Button", preferences: { density: "compact" }, usesDefault: false });
    expect(preview.activeFoundationIds).toEqual(["color"]);
    expect(preview.activePatternIds).toEqual(["forms"]);
    expect(preview.activePrimitiveIds).toEqual(["pressable"]);
  });

  it("falls back to Monet defaults without creating workspace state", () => {
    const preview = compilePreview({ ...workspace, resolvedTokens: [], components: [], patterns: [], primitives: [] });
    expect(preview.cssVariables["--pv-primary"]).toBe("#9b59b6");
    expect(preview.fallbackTokenNames).toContain("color.primary");
    expect(preview.colors.find((token) => token.name === "color.primary")).toMatchObject({ value: "#9b59b6", source: "default" });
    expect(preview.spacing).not.toHaveLength(0);
    expect(preview.components.button).toMatchObject({ status: "undecided", usesDefault: true });
    expect(preview.components).toHaveProperty("dialog");
    expect(preview.components).toHaveProperty("data-table");
    expect(preview.cssVariables["--pv-opacity-disabled"]).toBe(0.5);
    expect(typeof preview.cssVariables["--pv-shadow-dialog"]).toBe("string");
    expect(String(preview.cssVariables["--pv-backdrop"])).toContain("color-mix");
    expect(workspace.resolvedTokens[0]?.resolved_value).toBe("#6750a4");
  });

  it("recompiles directly from changed resolved decisions", () => {
    const changed = { ...workspace, resolvedTokens: workspace.resolvedTokens.map((token) => token.name === "color.primary" ? { ...token, resolved_value: "#005fcc" } : token) };
    expect(compilePreview(changed).cssVariables["--pv-primary"]).toBe("#005fcc");
    expect(compilePreview(workspace).cssVariables["--pv-primary"]).toBe("#6750a4");
  });

  it("compiles the same workspace in dark mode from its base tokens, with on-fill and text roles", () => {
    const darkable = {
      ...workspace,
      baseResolvedTokens: [
        { id: "neutral-100", name: "neutral.100", foundation: "color", type: "color" as const, level: "primitive" as const, value: "#ecf0f1", description: "", order: 0, resolved_value: "#ecf0f1", valid: true },
        { id: "neutral-975", name: "neutral.975", foundation: "color", type: "color" as const, level: "primitive" as const, value: "#111921", description: "", order: 1, resolved_value: "#111921", valid: true },
        { id: "color-background", name: "color.background", foundation: "color", type: "color" as const, level: "semantic" as const, value: "{neutral.100}", description: "", order: 2, resolved_value: "#ecf0f1", valid: true, modes: { dark: "{neutral.975}" } },
        { id: "color-on-primary", name: "color.on.primary", foundation: "color", type: "color" as const, level: "semantic" as const, value: "#ffffff", description: "", order: 3, resolved_value: "#ffffff", valid: true },
        { id: "color-danger-foreground", name: "color.danger.foreground", foundation: "color", type: "color" as const, level: "semantic" as const, value: "#d0311e", description: "", order: 4, resolved_value: "#d0311e", valid: true, modes: { dark: "#f0857a" } },
      ],
    };
    const light = compilePreview(workspaceWithTheme(darkable, "product", "light"));
    const dark = compilePreview(workspaceWithTheme(darkable, "product", "dark"));
    expect(light).toMatchObject({ mode: "light", modes: ["light", "dark"] });
    expect(dark).toMatchObject({ mode: "dark", modes: ["light", "dark"] });
    expect(dark.cssVariables["--pv-background"]).toBe("#111921");
    expect(dark.cssVariables["--pv-danger-fg"]).toBe("#f0857a");
    expect(dark.cssVariables["--pv-on-primary"]).toBe("#ffffff");
    expect(dark.colors.find((token) => token.name === "color.background")).toMatchObject({ value: "#111921", source: "mode" });
    expect(light.cssVariables["--pv-background"]).toBe("#ecf0f1");
    // A workspace with no dark values cannot be previewed dark: the request falls back to light and says so.
    const lightOnly = compilePreview(workspaceWithTheme(workspace, "product", "dark"));
    expect(lightOnly).toMatchObject({ mode: "light", modes: ["light"] });
  });

  it("renders all read-only validation areas from the compiled model", () => {
    const markup = renderToStaticMarkup(createElement(PreviewValidationAreas, { model: compilePreview(workspace) }));
    expect(markup).toContain("Interaction states");
    expect(markup).toContain("Feedback states");
    expect(markup).toContain("Publish this design system?");
    expect(markup).toContain("Dense data");
    expect(markup).toContain("Enter a complete email address.");
    expect(markup).toContain("Actions for Platform refresh");
  });
});
