import { describe, expect, it } from "vitest";
import { componentSelection, parseFrontmatter, parsePrinciple, removeSourceReferences, renderFrontmatter, renderPrinciple } from "./fileStore.js";
import { normalizeTokens, resolveThemeTokens, resolveTokens, themeModes } from "./tokens.js";

const modedFoundation = { id: "color", name: "Color", status: "selected" as const, description: "", rationale: "", guidance: "", notes: "", order: 0, updated_at: "", tokens: normalizeTokens("color", [
  { name: "neutral.100", value: "#ecf0f1", type: "color", level: "primitive" },
  { name: "neutral.950", value: "#1a2530", type: "color", level: "primitive" },
  { name: "purple.500", value: "#9b59b6", type: "color", level: "primitive" },
  { name: "color.background", value: "{neutral.100}", type: "color", level: "semantic", modes: { dark: "{neutral.950}" } },
  { name: "color.primary", value: "{purple.500}", type: "color", level: "semantic" },
  { name: "color.chrome", value: "{color.background}", type: "color", level: "semantic" },
]) };

describe("Monet Markdown records", () => {
  it("round-trips human-readable frontmatter and body", () => {
    const record = { id: "clarity", title: "Clarity", summary: "Make intent legible.", body: "# Clarity\n\nPrefer plain language.", status: "selected" as const, tags: ["content"], order: 2, updated_at: "2026-09-01T12:00:00.000Z", components: ["button"], foundations: ["typography"] };
    expect(parseFrontmatter(record.id, renderFrontmatter(record))).toEqual(record);
  });
  it("stores principles without summary, status, or tags", () => {
    const principle = { id: "clarity", title: "Clarity", body: "# Clarity\n\nMake intent legible.", order: 2, updated_at: "2026-09-01T12:00:00.000Z" };
    const rendered = renderPrinciple(principle);
    expect(rendered).not.toContain("summary:");
    expect(rendered).not.toContain("status:");
    expect(rendered).not.toContain("tags:");
    expect(parsePrinciple(principle.id, rendered)).toEqual(principle);
  });
  it("normalizes legacy foundation value maps without losing values", () => {
    expect(normalizeTokens("spacing", { 1: "4px", 2: "8px" }).map((token) => [token.name, token.value])).toEqual([["space.1", "4px"], ["space.2", "8px"]]);
  });
  it("detects circular token references", () => {
    const foundation = { id: "color", name: "Color", status: "selected" as const, description: "", rationale: "", guidance: "", notes: "", order: 0, updated_at: "", tokens: normalizeTokens("color", [
      { name: "color.a", value: "{color.b}", type: "color", level: "semantic" },
      { name: "color.b", value: "{color.a}", type: "color", level: "semantic" },
    ]) };
    expect(resolveTokens([foundation]).issues.some((issue) => issue.type === "circular_reference")).toBe(true);
  });
  it("resolves theme overrides through aliases and records their origin", () => {
    const foundation = { id: "color", name: "Color", status: "selected" as const, description: "", rationale: "", guidance: "", notes: "", order: 0, updated_at: "", tokens: normalizeTokens("color", [
      { name: "color.brand", value: "#111111", type: "color", level: "primitive" },
      { name: "color.action", value: "{color.brand}", type: "color", level: "semantic" },
    ]) };
    const result = resolveThemeTokens([foundation], { id: "convogym", name: "ConvoGym", overrides: { "color.brand": "#7c3aed" }, updated_at: "" });
    expect(result.tokens.find((token) => token.name === "color.action")).toMatchObject({ resolved_value: "#7c3aed", base_resolved_value: "#111111", source: "theme", theme_id: "convogym", override_dependencies: ["color.brand"] });
    expect(result.issues).toEqual([]);
  });
  it("keeps a token's dark value and drops modes it does not know", () => {
    const [token] = normalizeTokens("color", [{ name: "color.background", value: "#fff", modes: { dark: "#000", light: "#eee", sepia: "#ccc" } }]);
    expect(token?.modes).toEqual({ dark: "#000" });
    expect(normalizeTokens("color", [{ name: "color.surface", value: "#fff", modes: {} }])[0]).not.toHaveProperty("modes");
  });

  it("resolves a Foundation's dark value through aliases and leaves light untouched", () => {
    const light = resolveThemeTokens([modedFoundation], null, "light");
    const dark = resolveThemeTokens([modedFoundation], null, "dark");
    expect(light.tokens.find((token) => token.name === "color.chrome")).toMatchObject({ resolved_value: "#ecf0f1", source: "base", mode: "light", override_dependencies: [] });
    // A role that merely aliases a moded role follows it into dark and names the token whose dark value carried it.
    expect(dark.tokens.find((token) => token.name === "color.chrome")).toMatchObject({ resolved_value: "#1a2530", base_resolved_value: "#ecf0f1", source: "mode", theme_id: null, mode: "dark", override_dependencies: ["color.background"] });
    expect(dark.tokens.find((token) => token.name === "color.primary")).toMatchObject({ resolved_value: "#9b59b6", source: "base" });
    expect(dark.issues).toEqual([]);
  });

  it("layers theme overrides over mode values, with dark-only overrides winning in dark", () => {
    const theme = { id: "product", name: "Product", overrides: { "color.primary": "#6750a4" }, modes: { dark: { "color.background": "#000000" } }, updated_at: "" };
    const light = resolveThemeTokens([modedFoundation], theme, "light");
    const dark = resolveThemeTokens([modedFoundation], theme, "dark");
    // The general override applies in both modes; the dark-only override applies only in dark and outranks the Foundation's dark value.
    expect(light.tokens.find((token) => token.name === "color.primary")).toMatchObject({ resolved_value: "#6750a4", source: "theme", theme_id: "product" });
    expect(dark.tokens.find((token) => token.name === "color.primary")).toMatchObject({ resolved_value: "#6750a4", source: "theme", theme_id: "product" });
    expect(light.tokens.find((token) => token.name === "color.background")).toMatchObject({ resolved_value: "#ecf0f1", source: "base" });
    expect(dark.tokens.find((token) => token.name === "color.chrome")).toMatchObject({ resolved_value: "#000000", source: "theme", theme_id: "product", override_dependencies: ["color.background"] });
  });

  it("reports the modes a theme can resolve in from the values that exist", () => {
    const plain = { ...modedFoundation, tokens: modedFoundation.tokens.map((token) => ({ ...token, modes: undefined })) };
    expect(themeModes([modedFoundation], null)).toEqual(["light", "dark"]);
    expect(themeModes([plain], null)).toEqual(["light"]);
    expect(themeModes([plain], { id: "t", name: "T", overrides: {}, modes: { dark: { "color.primary": "#fff" } }, updated_at: "" })).toEqual(["light", "dark"]);
  });

  it("drops the selection of an undecided component and keeps it for a decided one", () => {
    const selection = { source: "ant-design", source_component: "InputNumber" };
    expect(componentSelection({ status: "undecided", selection })).toBeNull();
    expect(componentSelection({ status: "selected", selection })).toEqual(selection);
    expect(componentSelection({ status: "needs_review", selection: null })).toBeNull();
  });
  it("removes a source and every reference to it", () => {
    const now = "2026-09-01T13:00:00.000Z";
    const result = removeSourceReferences({
      sources: [{ id: "primer", name: "Primer", type: "reference", homepage: "", repository: "", framework: "React", package: "", license: "MIT", notes: "", enabled: true, mappings: [], updated_at: "" }],
      components: [{ id: "button", status: "selected", selection: { source: "primer", source_component: "Button" }, preferences: {}, behavior: {}, rationale: "", notes: "", use_when: [], avoid_when: [], foundations: [], primitives: [], candidates: [{ source: "primer", source_component: "Button", description: "", preview: "reference" }], history: [], updated_at: "" }],
      primitives: [{ id: "pressable", status: "selected", purpose: "", preferences: {}, tokens: [], inspiration: { source: "primer", source_item: "Button" }, notes: "", updated_at: "" }],
    }, "primer", now);
    expect(result.sources).toEqual([]);
    expect(result.components[0]?.selection).toBeNull();
    expect(result.components[0]?.candidates).toEqual([]);
    expect(result.components[0]?.history[0]?.old_selection).toBe("primer");
    expect(result.primitives[0]?.inspiration).toBeNull();
    expect(result.componentsChanged).toBe(true);
    expect(result.primitivesChanged).toBe(true);
  });
});
