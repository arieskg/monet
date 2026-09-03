import { describe, expect, it } from "vitest";
import { buildExportCollections, serializeExport, toYaml, workspaceWithTheme } from "../exportFormats";
import type { Workspace } from "../domain";

const workspace = {
  principles: [{ id: "clarity", title: "Clarity", body: "# Clarity\n\nMake intent obvious.", order: 0, updated_at: "" }],
  foundations: [], taxonomy: [], primitiveTaxonomy: [], primitives: [], components: [], patterns: [], sources: [], references: [], referenceAnalysis: { summary: "", recurring_preferences: [], suggestions: [], analyzed_at: "" }, decisionLog: [], themes: [{ id: "default", name: "Default", overrides: {}, updated_at: "" }], defaultThemeId: "default", activeThemeId: "default", baseResolvedTokens: [], resolvedTokens: [], tokenIssues: [], filesRoot: "/tmp/monet",
} satisfies Workspace;

describe("Monet collection exports", () => {
  it("exports principles independently in Markdown without legacy metadata", () => {
    const principles = buildExportCollections(workspace).find((item) => item.id === "principles");
    expect(principles).toBeDefined();
    expect(serializeExport(principles!, "md")).toContain("## Clarity\n\nMake intent obvious.");
    expect(serializeExport(principles!, "md")).not.toContain("status");
  });
  it("serializes structured collections as readable YAML", () => {
    expect(toYaml([{ title: "Clarity", enabled: true }])).toBe('-\n  title: "Clarity"\n  enabled: true\n');
  });
  it("offers every major collection without limiting the list", () => {
    expect(buildExportCollections(workspace).map((item) => item.id)).toEqual(["principles", "foundations", "tokens", "primitives", "components", "patterns", "themes", "sources", "references", "decisions"]);
  });
  it("exports component decisions using the binary labels", () => {
    const componentWorkspace = { ...workspace, taxonomy: [{ id: "actions", name: "Actions", entries: [{ id: "button", name: "Button", category: "actions", description: "Triggers an action.", aliases: [], relationships: [] }] }], components: [{ id: "button", status: "selected" as const, selection: null, preferences: {}, behavior: {}, rationale: "", notes: "", use_when: [], avoid_when: [], foundations: [], primitives: [], candidates: [], history: [], updated_at: "" }] };
    const components = buildExportCollections(componentWorkspace).find((item) => item.id === "components");
    expect(components?.markdown).toContain("- Decision: Use");
    expect(components?.markdown).not.toContain("- Status: selected");
  });
  it("exports a selected theme as resolved values while keeping its record override-only", () => {
    const token = { id: "radius-md", name: "radius.md", foundation: "radius", type: "dimension" as const, level: "primitive" as const, value: "7px", description: "", order: 0, resolved_value: "7px", valid: true };
    const themed = { ...workspace, themes: [...workspace.themes, { id: "convogym", name: "ConvoGym", overrides: { "radius.md": "4px" }, updated_at: "" }], baseResolvedTokens: [token] };
    const resolved = workspaceWithTheme(themed, "convogym");
    expect(resolved.resolvedTokens[0]).toMatchObject({ resolved_value: "4px", source: "theme", theme_id: "convogym" });
    expect(buildExportCollections(resolved).find((item) => item.id === "themes")?.data).toContainEqual({ id: "convogym", name: "ConvoGym", overrides: { "radius.md": "4px" } });
  });
});
