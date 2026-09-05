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

  it("suggests semantic roles rather than the primitive they point at", async () => {
    // #ecf0f1 is neutral.100 as well as three semantic roles in light. Primitives never move between
    // modes, so naming one would bury the roles the Color foundation tells product code to use.
    const result = await review([{ kind: "style", property: "background-color", value: "#ecf0f1" }]);
    expect(checks(result)).toEqual(["literal_colour_has_token"]);
    expect(result.findings[0]!.expected).not.toMatch(/neutral\./);
    expect(result.findings[0]!.expected).toMatch(/color\.background/);
    // Three surface roles carry this value and none fits `background-color` better than the others,
    // so there is nothing to put in `replacement` that a caller could apply without deciding first.
    expect(result.findings[0]!.replacement).toBeUndefined();
    expect(result.findings[0]!.expected).toBe("one of color.background, color.surface.disabled, color.surface.subtle");
  });

  it("reads the same literal as a different role in dark, and still flags the pinned light role", async () => {
    // In dark, #ecf0f1 is color.foreground; it is also the light value of three surface roles.
    const result = await review([{ kind: "style", property: "background-color", value: "#ecf0f1" }], "dark");
    expect(checks(result)).toEqual(["literal_colour_has_token", "light_value_in_other_mode"]);
    expect(result.findings[0]!.expected).toBe("color.foreground");
    expect(result.findings[1]!.expected).toMatch(/color\.background \(#[0-9a-f]{6} in dark\)/);
    // A text role is not a replacement for a background, and the light roles are three-way tied.
    expect(result.findings.map((finding) => finding.replacement)).toEqual([undefined, undefined]);
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
    const result = await review([{ id: "picker", kind: "component", component: "calendar" }]);
    expect(checks(result)).toEqual(["component_undecided"]);
    expect(result.findings[0]!.level).toBe("warning");
    expect(result.findings[0]!.related).toContain("monet://components/calendar");
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

/**
 * The contrast rules, which are the part of conformance most able to do damage. Monet applies a
 * minimum when the caller declares one or when the Color foundation documents the pairing, and in no
 * other case: an invented minimum turns every icon and disabled label into an error the tool cannot
 * substantiate, and a caller that learns to ignore Monet's errors has lost the useful ones too.
 */
describe("which contrast minimum applies, and when none does", () => {
  let service: MonetService;
  const review = (usages: DesignUsage[], mode?: "light" | "dark") => service.reviewDesignUsage({ usages, ...(mode ? { mode } : {}) });

  beforeAll(() => { service = createMonetService({ loadWorkspace }); });

  it("does not present an undocumented pairing of its own tokens as a Monet violation", async () => {
    // Muted body text on the primary fill measures 1.36:1, which would be dire if it were text.
    // Monet documents no contract for the pairing, so it reports the measurement and says so.
    const result = await review([{ id: "pair", kind: "contrast", foreground: "color.foreground.muted", background: "color.primary" }]);
    expect(checks(result)).toEqual(["contrast_pairing_undocumented"]);
    expect(result.findings[0]!.level).toBe("info");
    expect(result.findings[0]!.why).toMatch(/documents no contrast contract for this pairing/);
    expect(result.findings[0]!.observed).toMatch(/1\.36:1/);
    expect(result.coverage.not_applicable).toBe(1);
    expect(result.coverage.checked).toBe(0);
  });

  it("will not assume an undeclared pair carries text", async () => {
    // 3.45:1 fails the text floor and clears the non-text one. Without a declared usage Monet has
    // no basis to pick, and picking `text` by default would invent the error.
    const undeclared = await review([{ kind: "contrast", foreground: "#8a8a8a", background: "#ffffff" }]);
    expect(checks(undeclared)).toEqual(["contrast_usage_unspecified"]);
    expect(undeclared.findings[0]!.level).toBe("info");
    expect(undeclared.findings[0]!.expected).toMatch(/`text`, `non-text`, or `decorative`/);
    expect(undeclared.coverage.unverifiable).toBe(1);

    const declared = await review([{ kind: "contrast", foreground: "#8a8a8a", background: "#ffffff", usage: "text" }]);
    expect(checks(declared)).toEqual(["contrast_below_minimum"]);
    expect(declared.findings[0]!.level).toBe("error");
  });

  it("infers no minimum at all for a pair the caller calls decorative", async () => {
    const result = await review([
      { id: "deco", kind: "contrast", foreground: "#8a8a8a", background: "#ffffff", usage: "decorative" },
      { id: "faint", kind: "contrast", foreground: "color.border.subtle", background: "color.surface", usage: "decorative" },
    ]);
    expect(new Set(checks(result))).toEqual(new Set(["contrast_not_required"]));
    expect(result.findings.every((finding) => finding.level === "info")).toBe(true);
    expect(result.coverage.not_applicable).toBe(2);
    // The ratio is still reported, so a caller that declared `decorative` in error can see it.
    expect(result.findings[0]!.observed).toMatch(/:1 in light mode$/);
    expect(result.findings[0]!.why).toMatch(/resubmit it as `text` or `non-text`/);
  });

  it("holds a real WCAG failure to WCAG, without dressing it as a Monet rule", async () => {
    // Disabled foreground on the default surface is not a pairing the Color foundation documents,
    // and the caller declared it as text, so the floor applies and the finding says whose it is.
    const result = await review([{ kind: "contrast", foreground: "color.foreground.disabled", background: "color.surface", usage: "text" }]);
    expect(checks(result)).toEqual(["contrast_below_minimum"]);
    expect(result.findings[0]!.level).toBe("error");
    expect(result.findings[0]!.why).toMatch(/WCAG 4\.5:1 minimum/);
    expect(result.findings[0]!.why).toMatch(/not a Monet rule/);
  });

  it("names Monet's own contract when the pairing has one", async () => {
    // The same declaration on a documented pairing attributes the minimum to Monet, not to WCAG alone.
    const result = await review([{ kind: "contrast", foreground: "color.foreground", background: "color.surface", usage: "text" }]);
    expect(result.findings).toEqual([]);
    expect(result.coverage.checked).toBe(1);
  });

  it("applies the documented contract when the caller names two roles and no usage", () => {
    // A contract is what Monet actually knows about a pairing, so it decides the minimum on its own.
    // Here the workspace's own body text has been dimmed to 2.70:1 against the surface it is
    // documented on — a contract failure, reported without the caller declaring anything.
    const context = syntheticContext([]);
    const dimmed = { ...context.tokens[1]!, value: "#9d9e98", resolved_value: "#9d9e98" };
    const tokens = [context.tokens[0]!, dimmed];
    const result = reviewUsages(
      { usages: [{ kind: "contrast", foreground: "color.foreground", background: "color.surface" }] },
      { ...context, tokens, lightTokens: tokens },
    );
    expect(checks(result)).toEqual(["contrast_below_minimum"]);
    expect(result.findings[0]!.level).toBe("error");
    expect(result.findings[0]!.why).toMatch(/Monet documents this pairing/);
  });
});

describe("replacements Monet declines to name", () => {
  let service: MonetService;
  const review = (usages: DesignUsage[], mode?: "light" | "dark") => service.reviewDesignUsage({ usages, ...(mode ? { mode } : {}) });

  beforeAll(() => { service = createMonetService({ loadWorkspace }); });

  it("omits a replacement for white written as a foreground, where six roles carry it", async () => {
    // White is the foreground of five fills and the inverse foreground besides. All of them fit
    // `color` equally, so there is no token to name — but the finding is still worth reporting.
    const result = await review([{ id: "white", kind: "style", property: "color", value: "#ffffff" }]);
    expect(checks(result)).toEqual(["literal_colour_has_token"]);
    expect(result.findings[0]!.level).toBe("warning");
    expect(result.findings[0]!.replacement).toBeUndefined();
    expect(result.findings[0]!.expected).toMatch(/^one of color\.[a-z.]+, color\./);
    expect(result.findings[0]!.why).toMatch(/none of them fits `color` better than the others/);
  });

  it("names white unambiguously where the property does distinguish the roles", async () => {
    // The same literal against a background property has exactly one surface role, so Monet names it.
    const result = await review([{ kind: "style", property: "background-color", value: "#ffffff" }]);
    expect(result.findings[0]!.replacement).toBe("color.surface");
  });

  it("omits a replacement for a colour two roles share for different jobs", async () => {
    // #1abc9c is both color.secondary and color.success; a fill is a fill either way.
    const result = await review([{ kind: "style", property: "background-color", value: "#1abc9c" }]);
    expect(checks(result)).toEqual(["literal_colour_has_token"]);
    expect(result.findings[0]!.replacement).toBeUndefined();
    expect(result.findings[0]!.expected).toBe("one of color.secondary, color.success");
  });

  it("does not offer a role whose job contradicts the property it was written against", async () => {
    // color.border is the only role carrying #d8d7d0, but a border colour is not a background, so
    // Monet reports the match and stops short of recommending it.
    const result = await review([{ kind: "style", property: "background-color", value: "#d8d7d0" }]);
    expect(checks(result)).toEqual(["literal_colour_has_token"]);
    expect(result.findings[0]!.expected).toBe("color.border");
    expect(result.findings[0]!.replacement).toBeUndefined();
    expect(result.findings[0]!.why).toMatch(/not one Monet would write against `background-color`/);
  });
});

describe("component references as they are written in code", () => {
  let service: MonetService;
  const review = (usages: DesignUsage[]) => service.reviewDesignUsage({ usages });

  beforeAll(() => { service = createMonetService({ loadWorkspace }); });

  it("resolves CamelCase component names to the ids they mean", async () => {
    const camel = await review([
      { id: "text-input", kind: "component", component: "TextInput" },
      { id: "icon-button", kind: "component", component: "IconButton" },
      { id: "date-picker", kind: "component", component: "DatePicker" },
    ]);
    expect(checks(camel)).not.toContain("component_unknown");
    expect(camel.coverage.not_applicable).toBe(0);
    expect(camel.coverage.checked).toBe(3);

    // The CamelCase spelling reaches the same records as the ids, finding for finding.
    const ids = await review([
      { id: "text-input", kind: "component", component: "text-input" },
      { id: "icon-button", kind: "component", component: "icon-button" },
      { id: "date-picker", kind: "component", component: "date-picker" },
    ]);
    expect(camel.findings).toEqual(ids.findings);
  });

  it("resolves a CamelCase alias, and still has no opinion about a name it does not know", async () => {
    const alias = await review([{ kind: "component", component: "TextField" }]);
    expect(checks(alias)).not.toContain("component_unknown");
    const unknown = await review([{ kind: "component", component: "ConfettiCannon" }]);
    expect(checks(unknown)).toEqual(["component_unknown"]);
    expect(unknown.findings[0]!.level).toBe("info");
  });
});

describe("values a property cannot carry, and lengths that run backwards", () => {
  let service: MonetService;
  const review = (usages: DesignUsage[]) => service.reviewDesignUsage({ usages });

  beforeAll(() => { service = createMonetService({ loadWorkspace }); });

  it("rejects a token whose type the property cannot use", async () => {
    const result = await review([
      { id: "spacing-as-colour", kind: "style", property: "color", value: "token:space.4" },
      { id: "colour-as-padding", kind: "style", property: "padding", value: "{color.surface}" },
      { id: "fine", kind: "style", property: "background-color", value: "token:color.surface" },
    ]);
    expect(checks(result)).toEqual(["token_type_mismatch", "token_type_mismatch"]);
    expect(result.findings.every((finding) => finding.level === "error")).toBe(true);
    expect(result.findings.map((finding) => finding.usage_id).sort()).toEqual(["colour-as-padding", "spacing-as-colour"]);
    expect(result.findings.find((finding) => finding.usage_id === "colour-as-padding")!.why).toMatch(/`padding` takes a length/);
  });

  it("measures a negative length by its magnitude and never suggests space.0", async () => {
    const result = await review([
      { id: "on-scale", kind: "style", property: "margin-top", value: "-8px" },
      { id: "off-scale", kind: "style", property: "margin-left", value: "-13px" },
    ]);
    expect(result.findings.map((finding) => finding.usage_id)).toEqual(["off-scale"]);
    const [pull] = result.findings;
    expect(pull!.expected).toMatch(/the negation of a spacing step such as space\.3 \(12px\)/);
    expect(pull!.expected).not.toMatch(/space\.0/);
    // The token name is not substitutable for a negative value, so Monet names the step instead.
    expect(pull!.replacement).toBeUndefined();
  });

  it("has nothing to measure a negative length against on a scale that cannot run backwards", async () => {
    const result = await review([{ kind: "style", property: "font-size", value: "-4px" }]);
    expect(checks(result)).toEqual(["unverifiable"]);
    expect(result.findings[0]!.why).toMatch(/non-negative/);
  });

  it("calls a shorthand unverifiable and asks for the properties it bundles", async () => {
    const result = await review([
      { id: "border", kind: "style", property: "border", value: "1px solid #d8d7d0" },
      { id: "padding", kind: "style", property: "padding", value: "8px 16px" },
    ]);
    expect(new Set(checks(result))).toEqual(new Set(["unverifiable"]));
    expect(result.coverage.unverifiable).toBe(2);
    expect(result.coverage.not_applicable).toBe(0);
    expect(result.findings.find((finding) => finding.usage_id === "border")!.why).toMatch(/Submit the parts as separate observations/);
    expect(result.findings.find((finding) => finding.usage_id === "padding")!.why).toMatch(/against the spacing scale/);
  });

  it("still reads a single-value colour shorthand as a colour", async () => {
    const result = await review([{ kind: "style", property: "background", value: "#ffffff" }]);
    expect(checks(result)).toEqual(["literal_colour_has_token"]);
  });
});

describe("a mode the workspace cannot resolve", () => {
  it("warns rather than silently answering in light, as get_design_context does", () => {
    const context = syntheticContext([]);
    const result = reviewUsages(
      { mode: "dark", usages: [{ kind: "style", property: "background-color", value: "#ffffff" }] },
      context,
    );
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/has no dark mode/);
    expect(result.warnings[0]).toMatch(/must not be treated as dark-mode guidance/);
    expect(result.theme?.mode).toBe("light");
  });

  it("says nothing when the mode was resolved as asked", async () => {
    const service = createMonetService({ loadWorkspace });
    const result = await service.reviewDesignUsage({ mode: "dark", usages: [{ kind: "token", token: "color.surface" }] });
    expect(result.warnings).toEqual([]);
    expect(result.theme?.mode).toBe("dark");
  });
});
