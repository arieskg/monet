import { beforeAll, describe, expect, it } from "vitest";
import { loadWorkspace } from "../server/fileStore.js";
import { createMonetService, type MonetService } from "./service.js";
import { normalizeColour, normalizeDimension, reviewUsages } from "./review.js";
import type { Component, DesignReview, DesignUsage, ResolvedThemeToken } from "./model.js";

/**
 * Conformance evaluation. Two halves, for two different jobs.
 *
 * The realistic half runs the service against the bundled workspace with evidence an agent could
 * plausibly report after building a screen, and asserts on what Monet concludes. The synthetic half
 * builds a tiny resolved context so statuses the bundled workspace does not happen to contain —
 * `do_not_use`, deprecated — are still covered.
 *
 * The suite spends as much effort on what Monet must *not* say as on what it must. A conformance
 * tool that invents violations from partial evidence is worse than no tool, so every "does not
 * report" case here is a guard against a specific false positive.
 */

const checks = (review: DesignReview) => review.findings.map((finding) => finding.check);
const levels = (review: DesignReview, check: string) => review.findings.filter((finding) => finding.check === check).map((finding) => finding.level);

describe("value normalisation", () => {
  it("reads the colour formats Monet can measure and refuses the rest", () => {
    expect(normalizeColour("#FFF")).toBe("#ffffff");
    expect(normalizeColour("#ffffff")).toBe("#ffffff");
    expect(normalizeColour("#ffffffff")).toBe("#ffffff");
    expect(normalizeColour("rgb(155, 89, 182)")).toBe("#9b59b6");
    expect(normalizeColour("rgba(155, 89, 182, 1)")).toBe("#9b59b6");
    // Partially transparent, named, and computed colours are unverifiable rather than wrong.
    expect(normalizeColour("rgba(0, 0, 0, 0.5)")).toBeNull();
    expect(normalizeColour("#00000080")).toBeNull();
    expect(normalizeColour("rebeccapurple")).toBeNull();
    expect(normalizeColour("color-mix(in srgb, red, blue)")).toBeNull();
    expect(normalizeColour("linear-gradient(#fff, #000)")).toBeNull();
  });

  it("reads plain lengths and refuses expressions", () => {
    expect(normalizeDimension("16px")).toEqual({ amount: 16, unit: "px" });
    expect(normalizeDimension("0")).toEqual({ amount: 0, unit: "" });
    expect(normalizeDimension("0.5rem")).toEqual({ amount: 0.5, unit: "rem" });
    expect(normalizeDimension("calc(100% - 8px)")).toBeNull();
    expect(normalizeDimension("8px 16px")).toBeNull();
    expect(normalizeDimension("auto")).toBeNull();
  });
});

describe("design conformance review against the bundled workspace", () => {
  let service: MonetService;
  const review = (usages: DesignUsage[], mode?: "light" | "dark") => service.reviewDesignUsage({ usages, ...(mode ? { mode } : {}) });

  beforeAll(() => { service = createMonetService({ loadWorkspace }); });

  it("reports nothing for an implementation that uses Monet's own vocabulary", async () => {
    const result = await review([
      { id: "1", kind: "token", token: "color.surface" },
      { id: "2", kind: "token", token: "color.foreground" },
      { id: "3", kind: "style", property: "padding", value: "16px", location: "Card.tsx:12" },
      { id: "4", kind: "style", property: "gap", value: "8px" },
      { id: "5", kind: "style", property: "border-radius", value: "7px" },
      { id: "6", kind: "style", property: "font-size", value: "14px" },
      { id: "7", kind: "component", component: "button" },
    ]);
    expect(result.findings).toEqual([]);
    expect(result.coverage.checked).toBe(7);
    expect(result.coverage.unverifiable).toBe(0);
    // A clean result still says plainly that it is not a conformance certificate.
    expect(result.scope).toMatch(/not that the implementation conforms/);
  });

  it("names the token behind a raw hex that is already in the palette", async () => {
    const result = await review([{ id: "bg", kind: "style", property: "background-color", value: "#FFFFFF", location: "Panel.tsx:4" }]);
    expect(checks(result)).toEqual(["literal_colour_has_token"]);
    const [finding] = result.findings;
    expect(finding!.level).toBe("warning");
    expect(finding!.replacement).toBe("color.surface");
    expect(finding!.usage_id).toBe("bg");
    expect(finding!.location).toBe("Panel.tsx:4");
    expect(finding!.related).toContain("monet://foundations/color");
  });

  it("recognises the same colour written as rgb()", async () => {
    const result = await review([{ kind: "style", property: "color", value: "rgb(155, 89, 182)" }]);
    expect(checks(result)).toEqual(["literal_colour_has_token"]);
    expect(result.findings[0]!.replacement).toMatch(/^color\./);
  });

  it("flags a colour that is in no Monet token", async () => {
    const result = await review([{ kind: "style", property: "background-color", value: "#ff00aa" }]);
    expect(checks(result)).toEqual(["colour_outside_palette"]);
    expect(levels(result, "colour_outside_palette")).toEqual(["warning"]);
  });

  it("rejects an unknown token name as an error", async () => {
    const result = await review([
      { id: "typo", kind: "token", token: "color.surface.pressd" },
      { id: "real", kind: "token", token: "color.surface.pressed" },
    ]);
    expect(checks(result)).toEqual(["unknown_token"]);
    expect(result.findings[0]!.level).toBe("error");
    expect(result.findings[0]!.usage_id).toBe("typo");
  });

  it("reads a token reference written inline in a style value", async () => {
    const result = await review([
      { kind: "style", property: "padding", value: "token:space.4" },
      { kind: "style", property: "color", value: "{color.foreground}" },
      { kind: "style", property: "padding", value: "token:space.nope" },
    ]);
    expect(checks(result)).toEqual(["unknown_token"]);
  });

  it("flags spacing off the scale and accepts spacing on it", async () => {
    const result = await review([
      { id: "bad", kind: "style", property: "padding", value: "13px" },
      { id: "good", kind: "style", property: "margin-top", value: "24px" },
      { id: "zero", kind: "style", property: "gap", value: "0" },
    ]);
    expect(checks(result)).toEqual(["off_scale_dimension"]);
    expect(result.findings[0]!.usage_id).toBe("bad");
    // The suggestion has to be actionable: name the nearest real step.
    expect(result.findings[0]!.expected).toMatch(/space\.[0-9]+ \(1[26]px\)/);
    expect(result.findings[0]!.replacement).toMatch(/^space\./);
  });

  it("holds radius and font-size to their own scales", async () => {
    const result = await review([
      { id: "r", kind: "style", property: "border-radius", value: "5px" },
      { id: "f", kind: "style", property: "font-size", value: "15px" },
      { id: "ok", kind: "style", property: "border-top-left-radius", value: "12px" },
    ]);
    expect(result.findings).toHaveLength(2);
    expect(result.findings.map((finding) => finding.usage_id).sort()).toEqual(["f", "r"]);
    expect(result.findings.find((finding) => finding.usage_id === "r")!.related).toContain("monet://foundations/radius");
    expect(result.findings.find((finding) => finding.usage_id === "f")!.related).toContain("monet://foundations/typography");
  });

  it("computes contrast from two literal colours and fails a pairing below the minimum", async () => {
    const result = await review([{ id: "pale", kind: "contrast", foreground: "#9d9e98", background: "#ffffff", usage: "text" }]);
    expect(checks(result)).toEqual(["contrast_below_minimum"]);
    expect(result.findings[0]!.level).toBe("error");
    expect(result.findings[0]!.observed).toMatch(/:1/);
  });

  it("passes a pairing the Color foundation already verifies", async () => {
    const result = await review([
      { kind: "contrast", foreground: "color.foreground", background: "color.surface", usage: "text" },
      { kind: "contrast", foreground: "color.on.primary", background: "color.primary", usage: "text" },
      { kind: "contrast", foreground: "color.border.strong", background: "color.surface", usage: "non-text" },
    ]);
    expect(result.findings).toEqual([]);
    expect(result.coverage.checked).toBe(3);
  });

  it("applies the non-text minimum rather than the text one when the caller says so", async () => {
    // 3.2:1 clears the 3:1 non-text floor and fails the 4.5:1 text floor, so the caller's
    // declaration decides. Monet must not silently hold a boundary to the text rule.
    const asText = await review([{ kind: "contrast", foreground: "#8a8a8a", background: "#ffffff", usage: "text" }]);
    const asBoundary = await review([{ kind: "contrast", foreground: "#8a8a8a", background: "#ffffff", usage: "non-text" }]);
    expect(checks(asText)).toEqual(["contrast_below_minimum"]);
    expect(asBoundary.findings).toEqual([]);
  });

  it("resolves tokens in dark mode and reports the mode it used", async () => {
    const result = await review([{ kind: "contrast", foreground: "color.foreground", background: "color.surface", usage: "text" }], "dark");
    expect(result.theme?.mode).toBe("dark");
    expect(result.theme?.modes).toContain("dark");
    expect(result.findings).toEqual([]);
  });

  it("catches a literal that pins a light value in dark mode", async () => {
    // #ffffff is genuinely in the dark palette — fills and their color.on.* foregrounds keep their
    // value across modes — so Monet reports both readings rather than guessing which was meant.
    const result = await review([{ id: "surface", kind: "style", property: "background-color", value: "#ffffff" }], "dark");
    expect(checks(result)).toContain("light_value_in_other_mode");
    const mismatch = result.findings.find((item) => item.check === "light_value_in_other_mode")!;
    expect(mismatch.level).toBe("warning");
    expect(mismatch.expected).toMatch(/color\.surface \(#[0-9a-f]{6} in dark\)/);
    expect(mismatch.why).toMatch(/keeps this element's light appearance/);
  });

  it("suggests the semantic role rather than the primitive it points at", async () => {
    // #ecf0f1 is neutral.100 as well as color.background in light. Primitives never move between
    // modes, so suggesting one would bury the role the Color foundation tells product code to name.
    const result = await review([{ kind: "style", property: "background-color", value: "#ecf0f1" }]);
    expect(checks(result)).toEqual(["literal_colour_has_token"]);
    expect(result.findings[0]!.replacement).toBe("color.background");
    expect(result.findings[0]!.expected).not.toMatch(/neutral\./);
  });

  it("reads the same literal as a different role in dark, and still flags the pinned light role", async () => {
    // In dark, #ecf0f1 is color.foreground; it is also the light value of color.background.
    const result = await review([{ kind: "style", property: "background-color", value: "#ecf0f1" }], "dark");
    expect(checks(result)).toEqual(["literal_colour_has_token", "light_value_in_other_mode"]);
    expect(result.findings[0]!.replacement).toBe("color.foreground");
    expect(result.findings[1]!.replacement).toBe("color.background");
  });

  it("separates a colour that keeps its value across modes from one that moves", async () => {
    // #9b59b6 is color.primary, which is identical in both modes, and it is also the light value of
    // color.focus, which lightens in dark. Both are true, so Monet states both rather than picking.
    const result = await review([{ kind: "style", property: "background-color", value: "#9b59b6" }], "dark");
    expect(checks(result)).toEqual(["literal_colour_has_token", "light_value_in_other_mode"]);
    expect(result.findings[0]!.replacement).toBe("color.primary");
    expect(result.findings[1]!.expected).toMatch(/color\.focus \(#dc95ff in dark\)/);
  });

  it("does not raise a mode mismatch in light mode at all", async () => {
    const result = await review([{ kind: "style", property: "background-color", value: "#9b59b6" }]);
    expect(checks(result)).toEqual(["literal_colour_has_token"]);
  });

  it("warns that a component Monet has not decided carries no approved styling", async () => {
    const result = await review([{ id: "picker", kind: "component", component: "date-input" }]);
    expect(checks(result)).toEqual(["component_undecided"]);
    expect(result.findings[0]!.level).toBe("warning");
    expect(result.findings[0]!.related).toContain("monet://components/date-input");
    expect(result.findings[0]!.why).toMatch(/surface the choice/i);
  });

  it("treats a taxonomy entry with no decision record as undecided", async () => {
    const result = await review([{ kind: "component", component: "chart" }]);
    expect(checks(result)).toEqual(["component_undecided"]);
  });

  it("resolves a component by name and by alias, not only by id", async () => {
    const byName = await review([{ kind: "component", component: "Multi Select" }]);
    const byId = await review([{ kind: "component", component: "multi-select" }]);
    expect(checks(byName)).toEqual(checks(byId));
  });

  it("mixes valid and invalid evidence without letting one contaminate the other", async () => {
    const result = await review([
      { id: "a", kind: "token", token: "color.surface" },
      { id: "b", kind: "style", property: "padding", value: "13px" },
      { id: "c", kind: "style", property: "background-color", value: "#ffffff" },
      { id: "d", kind: "component", component: "button" },
      { id: "e", kind: "token", token: "space.nope" },
      { id: "f", kind: "style", property: "gap", value: "16px" },
    ]);
    expect(result.coverage.submitted).toBe(6);
    expect(result.findings.map((finding) => finding.usage_id)).toEqual(["e", "b", "c"]);
    // Errors lead, so an agent fixing code sees the blocking problem first.
    expect(result.findings.map((finding) => finding.level)).toEqual(["error", "warning", "warning"]);
  });
});

describe("what Monet refuses to conclude", () => {
  let service: MonetService;
  const review = (usages: DesignUsage[], mode?: "light" | "dark") => service.reviewDesignUsage({ usages, ...(mode ? { mode } : {}) });

  beforeAll(() => { service = createMonetService({ loadWorkspace }); });

  it("returns an empty review for empty evidence rather than a pass", async () => {
    const result = await review([]);
    expect(result.findings).toEqual([]);
    expect(result.coverage.submitted).toBe(0);
    expect(result.coverage.checked).toBe(0);
    expect(result.scope).toMatch(/cannot see the implementation/);
  });

  it("reports incomplete observations as unverifiable, never as violations", async () => {
    const result = await review([
      { id: "no-value", kind: "style", property: "padding" },
      { id: "no-property", kind: "style", value: "16px" },
      { id: "no-token", kind: "token" },
      { id: "no-component", kind: "component" },
      { id: "half-pair", kind: "contrast", foreground: "#000000" },
    ]);
    expect(new Set(checks(result))).toEqual(new Set(["unverifiable"]));
    expect(result.findings.every((finding) => finding.level === "info")).toBe(true);
    expect(result.coverage.unverifiable).toBe(5);
    expect(result.coverage.checked).toBe(0);
  });

  it("will not compare a colour it cannot measure", async () => {
    const result = await review([
      { id: "alpha", kind: "style", property: "background-color", value: "rgba(0, 0, 0, 0.5)" },
      { id: "named", kind: "style", property: "color", value: "tomato" },
      { id: "mix", kind: "style", property: "color", value: "color-mix(in srgb, #fff, #000)" },
    ]);
    expect(new Set(checks(result))).toEqual(new Set(["unverifiable"]));
    expect(result.coverage.unverifiable).toBe(3);
  });

  it("will not guess which token a CSS custom property carries", async () => {
    const result = await review([{ kind: "style", property: "color", value: "var(--app-text)" }]);
    expect(checks(result)).toEqual(["unverifiable"]);
    expect(result.findings[0]!.why).toMatch(/custom property/i);
  });

  it("will not hold a dimension in a unit the scale does not use", async () => {
    // The bundled spacing scale is in px. Monet cannot convert rem without assuming a root size,
    // so it says so rather than inventing an off-scale violation.
    const result = await review([{ kind: "style", property: "padding", value: "0.875rem" }]);
    expect(checks(result)).toEqual(["unverifiable"]);
    expect(result.findings[0]!.why).toMatch(/cannot convert/i);
  });

  it("does not hold properties Monet documents no scale for", async () => {
    const result = await review([
      { kind: "style", property: "width", value: "317px" },
      { kind: "style", property: "z-index", value: "9999" },
      { kind: "style", property: "grid-template-columns", value: "1fr 2fr" },
      { kind: "style", property: "line-height", value: "1.37" },
    ]);
    expect(result.findings).toEqual([]);
    expect(result.coverage.not_applicable).toBe(4);
    expect(result.coverage.checked).toBe(0);
  });

  it("says it has no opinion about a concept outside the taxonomy instead of failing it", async () => {
    const result = await review([{ kind: "component", component: "confetti-cannon" }]);
    expect(checks(result)).toEqual(["component_unknown"]);
    expect(result.findings[0]!.level).toBe("info");
    expect(result.findings[0]!.why).toMatch(/not a violation/i);
    expect(result.coverage.not_applicable).toBe(1);
  });

  it("does not compute a ratio when either side is not a measurable colour", async () => {
    const result = await review([
      { kind: "contrast", foreground: "color.foreground", background: "var(--surface)" },
      { kind: "contrast", foreground: "not.a.token", background: "#ffffff" },
    ]);
    expect(new Set(checks(result))).toEqual(new Set(["unverifiable"]));
  });
});

/** A minimal resolved context, for statuses and shapes the bundled workspace does not contain. */
function syntheticContext(components: Component[]) {
  const token = (name: string, value: string, level: "primitive" | "semantic" = "semantic"): ResolvedThemeToken => ({
    id: name.replace(/\./g, "-"), name, foundation: "color", type: "color", level, value,
    description: "", order: 0, resolved_value: value, valid: true,
    base_resolved_value: value, source: "base", theme_id: null, mode: "light", override_dependencies: [],
  });
  const tokens = [token("color.surface", "#ffffff"), token("color.foreground", "#2c3e50")];
  return { theme: { id: "default", name: "Default" }, tokens, lightTokens: tokens, components, mode: "light" as const, modes: ["light" as const] };
}

function taxonomyComponent(id: string, status: Component["decision"] extends null ? never : string, deprecated = false): Component {
  return {
    id, name: id, category: "test", description: "", aliases: [], relationships: [], ...(deprecated ? { deprecated: true } : {}),
    decision: { id, status: status as never, selection: null, preferences: {}, behavior: {}, rationale: "", notes: "", use_when: [], avoid_when: [], foundations: [], primitives: [], candidates: [], history: [], updated_at: "" },
  };
}

describe("component statuses the bundled workspace does not contain", () => {
  it("treats a do_not_use concept as an error and a deprecated one as a warning", () => {
    const components = [taxonomyComponent("carousel", "do_not_use"), taxonomyComponent("legacy-tabs", "selected", true), taxonomyComponent("beta-tree", "experimental")];
    const result = reviewUsages(
      { usages: [{ id: "1", kind: "component", component: "carousel" }, { id: "2", kind: "component", component: "legacy-tabs" }, { id: "3", kind: "component", component: "beta-tree" }] },
      syntheticContext(components),
    );
    expect(result.findings.find((finding) => finding.usage_id === "1")).toMatchObject({ level: "error", check: "component_do_not_use" });
    expect(result.findings.find((finding) => finding.usage_id === "2")).toMatchObject({ level: "warning", check: "component_deprecated" });
    expect(result.findings.find((finding) => finding.usage_id === "3")).toMatchObject({ level: "info", check: "component_experimental" });
  });

  it("reports both a status and a deprecation on the same concept", () => {
    const result = reviewUsages(
      { usages: [{ kind: "component", component: "old-thing" }] },
      syntheticContext([taxonomyComponent("old-thing", "undecided", true)]),
    );
    expect(checks(result).sort()).toEqual(["component_deprecated", "component_undecided"]);
  });

  it("reports a token whose reference chain does not resolve", () => {
    const context = syntheticContext([]);
    const broken: ResolvedThemeToken = { ...context.tokens[0]!, id: "color-broken", name: "color.broken", value: "{missing.token}", resolved_value: null, valid: false };
    const result = reviewUsages({ usages: [{ kind: "token", token: "color.broken" }] }, { ...context, tokens: [...context.tokens, broken], lightTokens: [...context.tokens, broken] });
    expect(checks(result)).toEqual(["token_does_not_resolve"]);
    expect(result.findings[0]!.level).toBe("error");
  });

  it("reports nothing about a scale the workspace does not define", () => {
    // A workspace with no radius tokens must not produce radius findings.
    const result = reviewUsages({ usages: [{ kind: "style", property: "border-radius", value: "5px" }] }, syntheticContext([]));
    expect(result.findings).toEqual([]);
    expect(result.coverage.not_applicable).toBe(1);
  });
});
