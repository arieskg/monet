import { describe, expect, it } from "vitest";
import type { Foundation, Workspace } from "./model.js";
import { createMonetService, queryWantsDarkMode, searchReferenceRecords, type WorkspaceReader } from "./service.js";
import { resolveThemeTokens, themeModes } from "./tokens.js";

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
  themes: [{ id: "default", name: "Default", overrides: {}, updated_at: "" }], defaultThemeId: "default", activeThemeId: "default", activeMode: "light", modes: ["light"],
  baseResolvedTokens: [{ ...token, resolved_value: "16px", valid: true }],
  resolvedTokens: [{ ...token, resolved_value: "16px", valid: true, base_resolved_value: "16px", source: "base", theme_id: null, mode: "light", override_dependencies: [] }],
  tokenIssues: [], filesRoot: "/tmp/monet",
} satisfies Workspace;

const reader: WorkspaceReader = { loadWorkspace: async () => workspace };

const colorTokens = [
  { id: "neutral-100", name: "neutral.100", foundation: "color", type: "color" as const, level: "primitive" as const, value: "#ecf0f1", description: "", order: 0 },
  { id: "neutral-950", name: "neutral.950", foundation: "color", type: "color" as const, level: "primitive" as const, value: "#1a2530", description: "", order: 1 },
  { id: "color-background", name: "color.background", foundation: "color", type: "color" as const, level: "semantic" as const, value: "{neutral.100}", description: "Page background", order: 2, modes: { dark: "{neutral.950}" } },
  { id: "color-primary", name: "color.primary", foundation: "color", type: "color" as const, level: "semantic" as const, value: "#9b59b6", description: "Primary", order: 3 },
];
const colorFoundation = { id: "color", name: "Color", status: "selected" as const, description: "Colour roles", rationale: "", guidance: "", notes: "", order: 1, tokens: colorTokens, updated_at: "" };
/** A reader that resolves modes the way the file store does, so mode inference and variants can be tested without disk. */
function modedReader(foundations: Foundation[], theme = workspace.themes[0]!): WorkspaceReader {
  return {
    loadWorkspace: async (_themeId, mode) => {
      const modes = themeModes(foundations, theme);
      const activeMode = mode && modes.includes(mode) ? mode : "light";
      const resolution = resolveThemeTokens(foundations, theme, activeMode);
      return { ...workspace, foundations, components: [{ ...workspace.components[0]!, foundations: ["color"] }], patterns: [], modes, activeMode, resolvedTokens: resolution.tokens, tokenIssues: resolution.issues };
    },
  };
}

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

  it("recognises a dark-mode task without mistaking every mention of dark for one", () => {
    for (const query of ["build a dark mode dashboard", "dark-mode settings", "night theme for the app", "a dark UI", "dark theme toggle"]) expect(queryWantsDarkMode(query), query).toBe(true);
    for (const query of ["a dark red danger button", "keep the header in the dark blue-gray", "build a dashboard"]) expect(queryWantsDarkMode(query), query).toBe(false);
  });

  it("resolves a dark-mode task in dark mode when the theme supports it, and pairs every changed token with its light value", async () => {
    const service = createMonetService(modedReader([colorFoundation, ...workspace.foundations]));
    const context = await service.getDesignContext({ query: "dark mode button", componentIds: ["button"] });
    expect(context.mode).toBe("dark");
    expect(context.modes).toEqual(["light", "dark"]);
    expect(context.notices.map((notice) => notice.kind)).not.toContain("unsupported_capability");
    expect(context.resolvedTokens.find((token) => token.name === "color.background")).toMatchObject({ resolved_value: "#1a2530", source: "mode" });
    expect(context.modeVariants).toEqual({ "color.background": { dark: "#1a2530", light: "#ecf0f1" } });

    const light = await service.getDesignContext({ query: "dark mode button", componentIds: ["button"], mode: "light" });
    expect(light.mode).toBe("light");
    expect(light.modeVariants).toEqual({ "color.background": { light: "#ecf0f1", dark: "#1a2530" } });
    // Light values were explicitly requested for a dark task, so the brief says they are light values.
    expect(light.notices.map((notice) => notice.kind)).toContain("unsupported_capability");

    const plain = await service.getDesignContext({ componentIds: ["button"] });
    expect(plain.mode).toBe("light");
    expect(plain.notices).toEqual([]);
  });

  it("keeps reporting a missing dark palette when no token or theme supplies one", async () => {
    const lightOnly = { ...colorFoundation, tokens: colorTokens.map((token) => ({ ...token, modes: undefined })) };
    const service = createMonetService(modedReader([lightOnly, ...workspace.foundations]));
    const context = await service.getDesignContext({ query: "dark mode button", componentIds: ["button"], mode: "dark" });
    expect(context.mode).toBe("light");
    expect(context.modes).toEqual(["light"]);
    expect(context.modeVariants).toEqual({});
    expect(context.notices).toContainEqual(expect.objectContaining({ kind: "unsupported_capability", ids: ["dark-mode"] }));
  });

  it("reports unknown requested IDs instead of silently inventing records", async () => {
    const context = await createMonetService(reader).getDesignContext({ patternIds: ["missing-pattern"] });
    expect(context.warnings).toContain("Unknown pattern id: missing-pattern");
  });
});
