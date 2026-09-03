import { describe, expect, it } from "vitest";
import type { Source, Workspace } from "./model.js";
import { buildSourceMappingPrompt, normalizeAiMappings, preserveExplicitMappingDecisions, type AiMappingResult } from "./sourceMapping.js";

const source: Source = {
  id: "example",
  name: "Example UI",
  type: "reference",
  homepage: "https://example.com/components",
  repository: "https://example.com/repository",
  framework: "React",
  package: "@example/ui",
  license: "MIT",
  notes: "External component library.",
  enabled: true,
  mappings: [],
  updated_at: "",
};

const workspace = {
  principles: [], foundations: [], primitives: [], components: [], patterns: [], references: [], referenceAnalysis: { summary: "", recurring_preferences: [], suggestions: [], analyzed_at: "" }, decisionLog: [], themes: [{ id: "default", name: "Default", overrides: {}, updated_at: "" }], defaultThemeId: "default", activeThemeId: "default", activeMode: "light", modes: ["light"], baseResolvedTokens: [], resolvedTokens: [], tokenIssues: [], filesRoot: "/tmp/monet",
  taxonomy: [{ id: "controls", name: "Controls", entries: [
    { id: "button", name: "Button", category: "controls", description: "Triggers an action.", aliases: ["action"], relationships: [] },
    { id: "list", name: "List", category: "controls", description: "A collection of items.", aliases: ["item-group"], relationships: [] },
  ] }],
  primitiveTaxonomy: [{ id: "layout", name: "Layout", entries: [
    { id: "box", name: "Box", category: "layout", description: "Neutral container.", aliases: ["container"], relationships: [] },
  ] }],
  sources: [source, { ...source, id: "primer", name: "Primer", mappings: [{ upstream: "ActionList", target_type: "component", canonical_id: "list", status: "mapped", match_type: "equivalent", primary: true }] }],
} satisfies Workspace;

function result(mappings: AiMappingResult["mappings"]): AiMappingResult { return { mappings }; }

describe("AI source mapping", () => {
  it("builds a coverage-first prompt with taxonomy and cross-source evidence", () => {
    const prompt = buildSourceMappingPrompt(workspace, source);
    expect(prompt).toContain("Always choose and persist the closest useful Monet concept");
    expect(prompt).toContain('"id":"button"');
    expect(prompt).toContain("ActionList");
    expect(prompt).toContain("Low-confidence but plausible");
  });

  it("persists high and medium matches and marks plausible low matches for review", () => {
    const mappings = normalizeAiMappings(workspace, result([
      { upstream: "Button", aliases: [], description: "Action", documentation: null, category: "Controls", props_api: ["onPress"], usage_examples: [], target_type: "component", canonical_id: "button", status: "mapped", confidence: "high", match_type: "exact", primary: true, rationale: "Same concept." },
      { upstream: "ActionList", aliases: [], description: "Actions", documentation: null, category: "Navigation", props_api: [], usage_examples: [], target_type: "component", canonical_id: "list", status: "mapped", confidence: "medium", match_type: "equivalent", primary: true, rationale: "Interactive list." },
      { upstream: "ActionList", aliases: [], description: "Actions", documentation: null, category: "Navigation", props_api: [], usage_examples: [], target_type: "component", canonical_id: "button", status: "mapped", confidence: "low", match_type: "related", primary: true, rationale: "Contains actions." },
      { upstream: "ThemeProvider", aliases: [], description: "Context", documentation: null, category: "Utilities", props_api: [], usage_examples: [], target_type: "component", canonical_id: null, status: "unmapped", confidence: "none", match_type: "related", primary: false, rationale: "No component equivalent." },
    ]));
    expect(mappings.map((mapping) => [mapping.upstream, mapping.canonical_id, mapping.status])).toEqual([
      ["Button", "button", "mapped"],
      ["ActionList", "list", "mapped"],
      ["ActionList", "button", "needs_review"],
      ["ThemeProvider", null, "unmapped"],
    ]);
    expect(mappings.filter((mapping) => mapping.upstream === "ActionList" && mapping.primary)).toHaveLength(1);
  });

  it("rejects unknown canonical ids without discarding the discovered inventory item", () => {
    const mappings = normalizeAiMappings(workspace, result([
      { upstream: "Mystery", aliases: [], description: "", documentation: null, category: "", props_api: [], usage_examples: [], target_type: "component", canonical_id: "invented-id", status: "mapped", confidence: "medium", match_type: "equivalent", primary: true, rationale: "" },
    ]));
    expect(mappings[0]).toMatchObject({ upstream: "Mystery", canonical_id: null, status: "unmapped", confidence: "none", primary: false });
  });

  it("preserves explicit human decisions while retaining useful secondary AI mappings", () => {
    const generated = [
      { upstream: "ActionList", target_type: "component" as const, canonical_id: "button", status: "needs_review" as const, primary: true, mapped_by: "ai" as const },
      { upstream: "ActionList", target_type: "component" as const, canonical_id: "list", status: "mapped" as const, primary: false, mapped_by: "ai" as const },
      { upstream: "Provider", target_type: "component" as const, canonical_id: "button", status: "needs_review" as const, primary: true, mapped_by: "ai" as const },
    ];
    const merged = preserveExplicitMappingDecisions([
      { upstream: "ActionList", target_type: "component", canonical_id: "list", status: "mapped", primary: true, mapped_by: "manual" },
      { upstream: "Provider", target_type: "component", canonical_id: null, status: "no_equivalent", primary: false, mapped_by: "manual" },
    ], generated);
    expect(merged.filter((mapping) => mapping.upstream === "ActionList")).toHaveLength(2);
    expect(merged.find((mapping) => mapping.upstream === "ActionList" && mapping.canonical_id === "list")).toMatchObject({ primary: true, mapped_by: "manual" });
    expect(merged.filter((mapping) => mapping.upstream === "Provider")).toEqual([expect.objectContaining({ status: "no_equivalent", canonical_id: null })]);
  });
});
