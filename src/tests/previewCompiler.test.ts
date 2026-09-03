import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PreviewValidationAreas } from "../components/PreviewValidation";
import type { ResolvedThemeToken, Workspace } from "../domain";
import { compilePreview, previewDefaults } from "../previewCompiler";
import generatedTokens from "../../monet/tokens/tokens.json";

function resolvedToken(name: string, foundation: string, resolvedValue: string, source: "base" | "theme" = "base"): ResolvedThemeToken {
  return {
    id: name.replaceAll(".", "-"), name, foundation, type: foundation === "color" ? "color" : "dimension", level: "semantic", value: resolvedValue,
    description: `${name} description`, order: 0, resolved_value: resolvedValue, valid: true, base_resolved_value: source === "theme" ? "#000000" : resolvedValue,
    source, theme_id: source === "theme" ? "product" : null, override_dependencies: source === "theme" ? [name] : [],
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
  activeThemeId: "product",
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
