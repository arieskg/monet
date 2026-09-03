import { describe, expect, it } from "vitest";
import type { Workspace } from "./model.js";
import { createMonetService, searchReferenceRecords, type WorkspaceReader } from "./service.js";

const token = { id: "space-4", name: "space.4", foundation: "spacing", type: "dimension" as const, level: "primitive" as const, value: "16px", description: "Default gap", order: 0 };
const workspace = {
  principles: [{ id: "clarity", title: "Clarity", body: "Make system state clear.", order: 0, updated_at: "" }],
  foundations: [{ id: "spacing", name: "Spacing", status: "selected", description: "Consistent rhythm", rationale: "", guidance: "", notes: "", order: 0, tokens: [token], updated_at: "" }],
  taxonomy: [{ id: "actions", name: "Actions", entries: [
    { id: "button", name: "Button", category: "actions", description: "Triggers an action", aliases: ["cta"], relationships: [] },
    { id: "link", name: "Link", category: "actions", description: "Navigates", aliases: [], relationships: [] },
  ] }],
  primitiveTaxonomy: [], primitives: [],
  components: [{ id: "button", status: "selected", selection: null, preferences: { density: "compact" }, behavior: {}, rationale: "Calm actions", notes: "", use_when: [], avoid_when: [], foundations: ["spacing"], primitives: [], candidates: [], history: [], updated_at: "" }],
  patterns: [{ id: "forms", title: "Forms", summary: "Collect input clearly", body: "Use a clear submit action.", status: "selected", tags: ["input"], order: 0, updated_at: "", components: ["button"], foundations: ["spacing"] }],
  sources: [],
  references: [{ id: "calm-form", title: "Calm Form", type: "url", source_url: "https://example.com", source_domain: "example.com", annotation: "Quiet submit action", notes: "", asset_path: "", asset_media_type: "", original_filename: "", preview_url: "", ai_tags: ["form"], ai: { ui_types: ["settings form"], components: ["button"], patterns: ["inline validation"], visual_characteristics: ["calm"], density: "compact", hierarchy: "clear", layout: [], color: [], typography: [], mood: ["quiet"], observations: [], retrieval_text: "Compact settings form", analyzed_at: "" }, created_at: "", updated_at: "" }],
  referenceAnalysis: { summary: "", recurring_preferences: [], suggestions: [], analyzed_at: "" }, decisionLog: [],
  themes: [{ id: "default", name: "Default", overrides: {}, updated_at: "" }], defaultThemeId: "default", activeThemeId: "default",
  baseResolvedTokens: [{ ...token, resolved_value: "16px", valid: true }],
  resolvedTokens: [{ ...token, resolved_value: "16px", valid: true, base_resolved_value: "16px", source: "base", theme_id: null, override_dependencies: [] }],
  tokenIssues: [], filesRoot: "/tmp/monet",
} satisfies Workspace;

const reader: WorkspaceReader = { loadWorkspace: async () => workspace };

describe("Monet shared service", () => {
  it("provides stable list/get reads without exposing persistence", async () => {
    const service = createMonetService(reader);
    expect(await service.getFoundation("spacing")).toMatchObject({ name: "Spacing" });
    expect(await service.getFoundation("missing")).toBeNull();
    expect(await service.listPrinciples()).toEqual(workspace.principles);
  });

  it("joins canonical component identity to optional decisions", async () => {
    const components = await createMonetService(reader).listComponents();
    expect(components).toMatchObject([
      { id: "button", name: "Button", decision: { preferences: { density: "compact" } } },
      { id: "link", name: "Link", decision: null },
    ]);
  });

  it("searches user annotations and retrieval-oriented AI metadata", () => {
    expect(searchReferenceRecords(workspace.references, "compact settings")).toHaveLength(1);
    expect(searchReferenceRecords(workspace.references, "quiet submit")).toHaveLength(1);
    expect(searchReferenceRecords(workspace.references, "dashboard")).toEqual([]);
  });

  it("ranks service reference search with deterministic provenance", async () => {
    const results = await createMonetService(reader).searchReferences("quiet submit action");
    expect(results).toMatchObject([{
      reference: { id: "calm-form" },
      match: { entity_type: "reference", entity_id: "calm-form", reason: "text_match" },
    }]);
  });

  it("builds relevant context and expands existing component relationships", async () => {
    const context = await createMonetService(reader).getDesignContext({ componentIds: ["button"] });
    expect(context.principles.map((item) => item.id)).toEqual(["clarity"]);
    expect(context.components.map((item) => item.id)).toEqual(["button"]);
    expect(context.patterns.map((item) => item.id)).toEqual(["forms"]);
    expect(context.foundations.map((item) => item.id)).toEqual(["spacing"]);
    expect(context.resolvedTokens.map((item) => item.name)).toEqual(["space.4"]);
    expect(context.theme?.id).toBe("default");
  });

  it("does not cascade from components added by one pattern into unrelated patterns", async () => {
    const cascadingWorkspace = {
      ...workspace,
      taxonomy: [{ id: "actions", name: "Actions", entries: [
        ...workspace.taxonomy.flatMap((category) => category.entries),
        { id: "alert", name: "Alert", category: "feedback", description: "Shows feedback", aliases: [], relationships: [] },
      ] }],
      patterns: [
        ...workspace.patterns,
        { id: "errors", title: "Errors", summary: "Recover from failures", body: "Explain the problem.", status: "selected" as const, tags: ["feedback"], order: 1, updated_at: "", components: ["button", "alert"], foundations: [] },
        { id: "announcements", title: "Announcements", summary: "Share updates", body: "Use calm feedback.", status: "selected" as const, tags: ["feedback"], order: 2, updated_at: "", components: ["alert"], foundations: [] },
      ],
    } satisfies Workspace;
    const context = await createMonetService({ loadWorkspace: async () => cascadingWorkspace }).getDesignContext({ componentIds: ["button"] });
    expect(context.patterns.map((item) => item.id)).toEqual(["forms"]);
    expect(context.components.map((item) => item.id)).toEqual(["button"]);
  });

  it("reports unknown requested IDs instead of silently inventing records", async () => {
    const context = await createMonetService(reader).getDesignContext({ patternIds: ["missing-pattern"] });
    expect(context.warnings).toContain("Unknown pattern id: missing-pattern");
  });
});
