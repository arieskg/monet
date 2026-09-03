import { describe, expect, it } from "vitest";
import { candidatesForComponent, componentDecisionLabels, componentDecisionStatus, mappingsNeedingReview, resolveThemeTokenSet, resolveTokenSet, searchWorkspace, slugify, uniqueSlug, type Workspace } from "../domain";

const workspace = {
  principles: [{ id: "simplicity", title: "Simplicity", body: "# Simplicity\n\nRemove noise", order: 0, updated_at: "" }],
  foundations: [{ id: "radius", name: "Radius", status: "selected", description: "Corner rounding", rationale: "", guidance: "", notes: "", order: 0, tokens: [{ id: "radius-md", name: "radius.md", foundation: "radius", type: "dimension", level: "primitive", value: "7px", description: "Default radius", order: 0 }], updated_at: "" }],
  taxonomy: [{ id: "overlays", name: "Overlays", entries: [{ id: "dropdown-menu", name: "Dropdown Menu", category: "overlays", description: "A list of actions", aliases: ["action-menu", "overflow-menu"], relationships: [] }] }],
  primitiveTaxonomy: [{ id: "interaction", name: "Interaction", entries: [{ id: "pressable", name: "Pressable", category: "interaction", description: "Normalizes press behavior", aliases: ["press"], relationships: [] }] }],
  primitives: [{ id: "pressable", status: "selected", purpose: "Normalize interaction", preferences: {}, tokens: ["radius.md"], inspiration: null, notes: "", updated_at: "" }],
  components: [], patterns: [],
  sources: [{ id: "primer", name: "Primer", type: "reference", homepage: "", repository: "", framework: "React", package: "", license: "MIT", notes: "", enabled: true, mappings: [{ upstream: "ActionMenu", target_type: "component", canonical_id: "dropdown-menu", status: "mapped" }], updated_at: "" }],
  references: [], referenceAnalysis: { summary: "", recurring_preferences: [], suggestions: [], analyzed_at: "" },
  decisionLog: [], themes: [{ id: "default", name: "Default", overrides: {}, updated_at: "" }], defaultThemeId: "default", activeThemeId: "default", activeMode: "light", modes: ["light"], baseResolvedTokens: [{ id: "radius-md", name: "radius.md", foundation: "radius", type: "dimension", level: "primitive", value: "7px", description: "Default radius", order: 0, resolved_value: "7px", valid: true }], resolvedTokens: [{ id: "radius-md", name: "radius.md", foundation: "radius", type: "dimension", level: "primitive", value: "7px", description: "Default radius", order: 0, resolved_value: "7px", valid: true, base_resolved_value: "7px", source: "base", theme_id: null, mode: "light", override_dependencies: [] }], tokenIssues: [], filesRoot: "/tmp/monet",
} satisfies Workspace;

describe("Monet domain", () => {
  it("creates stable safe record slugs", () => expect(slugify("  Destructive Actions! ")).toBe("destructive-actions"));
  it("reduces component decisions to use and no use without rewriting legacy states", () => {
    expect(componentDecisionLabels).toEqual({ selected: "Use", do_not_use: "No use" });
    expect(componentDecisionStatus("selected")).toBe("selected");
    expect(componentDecisionStatus("do_not_use")).toBe("do_not_use");
    expect(componentDecisionStatus("needs_review")).toBe("");
  });
  it("gives repeated principle titles collision-safe ids", () => expect(uniqueSlug("Simplicity", ["simplicity", "simplicity-2"])).toBe("simplicity-3"));
  it("does not cap search results", () => {
    const expanded = { ...workspace, principles: Array.from({ length: 30 }, (_, index) => ({ id: `clarity-${index}`, title: `Clarity ${index}`, body: "Clarity for every task", order: index, updated_at: "" })) };
    expect(searchWorkspace(expanded, "clarity")).toHaveLength(30);
  });
  it("searches canonical aliases", () => expect(searchWorkspace(workspace, "overflow").map((item) => item.title)).toContain("Dropdown Menu"));
  it("searches upstream source mappings", () => expect(searchWorkspace(workspace, "ActionMenu").map((item) => item.title)).toContain("Primer"));
  it("searches tokens and primitive aliases", () => {
    expect(searchWorkspace(workspace, "radius.md").map((item) => item.title)).toContain("radius.md");
    expect(searchWorkspace(workspace, "press").map((item) => item.title)).toContain("Pressable");
  });
  it("resolves semantic references and reports broken references", () => {
    const result = resolveTokenSet([
      { id: "blue", name: "blue.600", foundation: "color", type: "color", level: "primitive", value: "#2563eb", description: "", order: 0 },
      { id: "primary", name: "color.primary", foundation: "color", type: "color", level: "semantic", value: "{blue.600}", description: "", order: 1 },
      { id: "broken", name: "color.missing", foundation: "color", type: "color", level: "semantic", value: "{blue.900}", description: "", order: 2 },
    ]);
    expect(result.tokens.find((token) => token.name === "color.primary")?.resolved_value).toBe("#2563eb");
    expect(result.issues[0]?.type).toBe("broken_reference");
  });
  it("previews a theme without mutating base token values", () => {
    const base = workspace.baseResolvedTokens;
    const result = resolveThemeTokenSet(base, { id: "compact", name: "Compact", overrides: { "radius.md": "4px" }, updated_at: "" });
    expect(result.tokens[0]).toMatchObject({ resolved_value: "4px", base_resolved_value: "7px", source: "theme", theme_id: "compact" });
    expect(base[0]?.value).toBe("7px");
  });
  it("derives component candidates from verified source mappings without duplicates", () => {
    const derived = candidatesForComponent(workspace, "dropdown-menu");
    expect(derived).toMatchObject([{ source: "primer", source_component: "ActionMenu", preview: "reference" }]);
    expect(candidatesForComponent(workspace, "dropdown-menu", derived)).toHaveLength(1);
  });
  it("removes persisted derived candidates after a source mapping is excluded", () => {
    const excluded: Workspace = { ...workspace, sources: [{ ...workspace.sources[0]!, mappings: [{ ...workspace.sources[0]!.mappings[0]!, canonical_id: null, status: "ignored" }] }] };
    expect(candidatesForComponent(excluded, "dropdown-menu", [{ source: "primer", source_component: "ActionMenu", description: "Derived", preview: "reference" }])).toEqual([]);
  });
  it("collects source mappings that need review with stable source indexes", () => {
    const withReview: Workspace = { ...workspace, sources: [{ ...workspace.sources[0]!, mappings: [
      ...workspace.sources[0]!.mappings,
      { upstream: "AnchoredOverlay", target_type: "component", canonical_id: "dropdown-menu", status: "needs_review", confidence: "low", match_type: "related", primary: true },
    ] }] };
    expect(mappingsNeedingReview(withReview)).toMatchObject([{ source: { id: "primer" }, mapping: { upstream: "AnchoredOverlay" }, mappingIndex: 1 }]);
  });
});
