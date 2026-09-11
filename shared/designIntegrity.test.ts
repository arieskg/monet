import { describe, expect, it } from "vitest";
import { loadWorkspace } from "../server/fileStore.js";
import { validateWorkspace } from "../server/validate.js";
import { joinComponents, createMonetService } from "./service.js";
import { preferenceViolations } from "./preferences.js";
import { resolveThemeTokens } from "./tokens.js";
import { contrast, contrastFailures, DERIVED_TEXT_MINIMUM, DERIVED_TEXT_ROLES, luminance, SURFACES, TEXT_ROLES, TINTED_SURFACES } from "./contrast.js";
import type { ComponentDecision, ResolvedThemeToken, ThemeMode, Workspace } from "./model.js";

const workspace: Workspace = await loadWorkspace();
const service = createMonetService({ loadWorkspace });
const components = joinComponents(workspace);
const componentIds = new Set(components.map((item) => item.id));
const foundationIds = new Set(workspace.foundations.map((item) => item.id));
const primitiveIds = new Set(workspace.primitiveTaxonomy.flatMap((category) => category.entries.map((entry) => entry.id)));
const tokenNames = new Set(workspace.resolvedTokens.map((token) => token.name));
const defaultTheme = workspace.themes.find((theme) => theme.id === workspace.defaultThemeId) ?? null;
/** The starter workspace resolved in each mode it supports, so every colour contract below is held in both. */
const MODE_TOKENS: [mode: ThemeMode, tokens: ResolvedThemeToken[]][] = workspace.modes.map((mode) => [mode, resolveThemeTokens(workspace.foundations, defaultTheme, mode).tokens]);

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** The starter workspace's colours are all six-digit hex, so the shared measurement never comes back null here. */
function contrastRatio(a: string, b: string): number {
  return contrast(a, b) ?? Number.NaN;
}

function lum(hex: string): number {
  return luminance(hex) ?? Number.NaN;
}

function resolvedColorIn(tokens: ResolvedThemeToken[], name: string): string {
  const token = tokens.find((item) => item.name === name);
  expect(token, `missing token ${name}`).toBeDefined();
  expect(String(token!.resolved_value), `unresolved token ${name}`).toMatch(/^#[0-9a-f]{6}$/i);
  return String(token!.resolved_value);
}

function resolvedColor(name: string): string {
  return resolvedColorIn(workspace.resolvedTokens, name);
}

function resolvedToken(name: string): string | number {
  const token = workspace.resolvedTokens.find((item) => item.name === name);
  expect(token, `missing token ${name}`).toBeDefined();
  expect(token!.valid, `unresolved token ${name}`).toBe(true);
  return token!.resolved_value!;
}

/** A selected component must say something Monet-specific; a source selection alone is not a decision. */
function decisionSignals(decision: ComponentDecision): number {
  return [
    Object.keys(decision.preferences).length, Object.keys(decision.behavior).length,
    decision.rationale.trim().length, decision.notes.trim().length,
    decision.use_when.length, decision.avoid_when.length,
  ].filter(Boolean).length;
}

describe("Monet principle identity", () => {
  it("keeps every principle's id, title, and heading in agreement", () => {
    expect(workspace.principles.map((item) => item.id)).toEqual(workspace.principles.map((item) => slug(item.title)));
    expect(workspace.principles.filter((item) => !item.body.startsWith(`# ${item.title}\n`)).map((item) => item.id)).toEqual([]);
  });

  it("gives every principle a distinct order and enough body to act on", () => {
    const orders = workspace.principles.map((item) => item.order);
    expect(new Set(orders).size).toBe(orders.length);
    expect(workspace.principles.filter((item) => item.body.length < 400).map((item) => item.id)).toEqual([]);
  });
});

describe("Monet record references", () => {
  it("resolves every component decision's Foundation and primitive links", () => {
    expect(workspace.components.flatMap((item) => item.foundations.filter((id) => !foundationIds.has(id)).map((id) => `${item.id}:${id}`))).toEqual([]);
    expect(workspace.components.flatMap((item) => item.primitives.filter((id) => !primitiveIds.has(id)).map((id) => `${item.id}:${id}`))).toEqual([]);
  });

  it("resolves every canonical relationship between component concepts", () => {
    expect(components.flatMap((item) => item.relationships.filter((id) => !componentIds.has(id)).map((id) => `${item.id}:${id}`))).toEqual([]);
  });

  it("gives every pattern the component and Foundation links retrieval depends on", () => {
    expect(workspace.patterns.filter((item) => !item.components?.length || !item.foundations?.length).map((item) => item.id)).toEqual([]);
  });

  it("resolves every token a primitive decision claims to use", () => {
    expect(workspace.primitives.flatMap((item) => item.tokens.filter((name) => !tokenNames.has(name)).map((name) => `${item.id}:${name}`))).toEqual([]);
  });

  it("keeps every relationship and pattern link a unique reference to another concept", () => {
    const selfReferencing = components.filter((item) => item.relationships.includes(item.id)).map((item) => item.id);
    const repeated = components.filter((item) => new Set(item.relationships).size !== item.relationships.length).map((item) => item.id);
    const repeatedLinks = workspace.patterns.filter((item) => new Set(item.components).size !== (item.components ?? []).length).map((item) => item.id);
    expect([...selfReferencing, ...repeated, ...repeatedLinks]).toEqual([]);
  });

  it("builds the master-detail workspace out of collection components rather than shell navigation", () => {
    const linked = new Set(workspace.patterns.find((item) => item.id === "master-detail")?.components ?? []);
    const category = new Map(components.map((item) => [item.id, item.category]));
    // The master is a collection column inside the app shell, and the detail is a region of the page.
    // Sidebar is the shell's primary destination navigation and Card is a bounded summary repeated
    // across a collection, so neither one is the master or the detail.
    expect([...linked].filter((id) => category.get(id) === "navigation")).toEqual([]);
    expect([...linked].filter((id) => id === "card")).toEqual([]);
    expect([...linked].filter((id) => category.get(id) === "data-display").length).toBeGreaterThan(0);
  });
});

describe("Monet decision substance", () => {
  it("never marks a component selected on a source inspiration alone", () => {
    const hollow = workspace.components.filter((item) => item.status === "selected" && decisionSignals(item) === 0);
    expect(hollow.map((item) => item.id)).toEqual([]);
  });

  it("gives every selected component rationale, guidance, and both usage boundaries", () => {
    const incomplete = workspace.components.filter((item) => item.status === "selected"
      && !(item.rationale.trim() && item.notes.trim() && item.use_when.length && item.avoid_when.length));
    expect(incomplete.map((item) => item.id)).toEqual([]);
  });

  it("keeps every undecided component honest about carrying no Monet decision", () => {
    const claimed = workspace.components.filter((item) => item.status === "undecided" && decisionSignals(item) > 0);
    expect(claimed.map((item) => item.id)).toEqual([]);
  });

  it("never leaves an undecided component holding a selection anything could read as approved", () => {
    const selected = workspace.components.filter((item) => item.status === "undecided" && item.selection);
    expect(selected.map((item) => item.id)).toEqual([]);
  });

  it("keeps the candidates and history of an undecided component that once auto-defaulted", () => {
    const cleared = workspace.components.filter((item) => item.status === "undecided"
      && item.history.some((entry) => entry.old_selection && !entry.new_selection));
    expect(cleared.length).toBeGreaterThan(0);
    expect(cleared.filter((item) => !item.candidates.length).map((item) => item.id)).toEqual([]);
  });
});

describe("Monet control boundaries", () => {
  const controls = ["text-input", "textarea", "select", "search-input", "password-input", "combobox", "checkbox", "radio",
    "number-input", "autocomplete", "multi-select", "date-input", "time-picker"];

  it("resolves every Borders role through the matching Color role", () => {
    const pairs: [border: string, color: string][] = [
      ["border.subtle", "color.border.subtle"], ["border.default", "color.border"],
      ["border.strong", "color.border.strong"], ["border.focus", "color.focus"],
    ];
    const mismatched = pairs.filter(([border, color]) => !String(resolvedToken(border)).includes(String(resolvedToken(color))));
    expect(mismatched.map(([border, color]) => `${border} does not resolve through ${color}`)).toEqual([]);
  });

  it("gives every unfilled control the same resting boundary", () => {
    const wrong = controls.flatMap((id) => {
      const border = workspace.components.find((item) => item.id === id)?.preferences.border;
      return border === "token:color.border.strong" ? [] : [`${id}: ${border ?? "no border preference"}`];
    });
    expect(wrong).toEqual([]);
  });

  it.each(MODE_TOKENS)("keeps that boundary above the 3:1 non-text minimum on every surface a control rests on in %s mode", (_mode, tokens) => {
    const boundary = resolvedColorIn(tokens, "color.border.strong");
    const failures = SURFACES.flatMap((name) => {
      const ratio = contrastRatio(boundary, resolvedColorIn(tokens, name));
      return ratio < 3 ? [`color.border.strong on ${name} is ${ratio.toFixed(2)}:1`] : [];
    });
    expect(failures).toEqual([]);
  });

  it.each(MODE_TOKENS)("keeps the focus indicator above 3:1 on the surface in %s mode", (_mode, tokens) => {
    expect(contrastRatio(resolvedColorIn(tokens, "color.focus"), resolvedColorIn(tokens, "color.surface"))).toBeGreaterThanOrEqual(3);
  });

  it("says the same thing in Color, Borders, and Interaction", () => {
    const records = ["color", "borders", "interaction"].map((id) => workspace.foundations.find((item) => item.id === id)!);
    expect(records.filter((item) => !item.guidance.includes("color.border.strong")).map((item) => item.id)).toEqual([]);
    const borders = records.find((item) => item.id === "borders")!;
    expect(borders.guidance).toContain("border.strong");
    // The Switch is the one listed control that fills its track, so it must explain itself rather than stay silent.
    expect(workspace.components.find((item) => item.id === "switch")?.preferences.off_track).toContain("token:color.border.strong");
  });
});

describe("Monet preference vocabulary", () => {
  it("keeps every component preference inside the compact contract", () => {
    expect(workspace.components.flatMap((item) => preferenceViolations(item.id, item.preferences, tokenNames))).toEqual([]);
  });

  it("keeps every primitive preference inside the same contract", () => {
    expect(workspace.primitives.flatMap((item) => preferenceViolations(item.id, item.preferences, tokenNames))).toEqual([]);
  });

  it("normalizes the high-traffic keys rather than leaving each record to invent a spelling", () => {
    const shared = ["density", "radius", "elevation"];
    const values = new Map<string, Set<string>>(shared.map((key) => [key, new Set<string>()]));
    for (const item of workspace.components) for (const key of shared) {
      const value = item.preferences[key];
      if (value) values.get(key)!.add(value);
    }
    expect([...values.get("density")!]).toEqual(["compact"]);
    expect([...values.get("radius")!].filter((value) => !value.startsWith("token:radius."))).toEqual([]);
    expect([...values.get("elevation")!].filter((value) => value !== "none" && !value.startsWith("token:shadow."))).toEqual([]);
  });
});

describe("Monet token contracts", () => {
  it("resolves every token without broken or circular references", () => {
    expect(workspace.tokenIssues).toEqual([]);
    expect(workspace.resolvedTokens.filter((token) => !token.valid).map((token) => token.name)).toEqual([]);
  });

  it("keeps token names and ids unique across Foundations", () => {
    const names = workspace.foundations.flatMap((foundation) => foundation.tokens.map((token) => token.name));
    const ids = workspace.foundations.flatMap((foundation) => foundation.tokens.map((token) => token.id));
    expect(names.length - new Set(names).size).toBe(0);
    expect(ids.length - new Set(ids).size).toBe(0);
  });

  it("provides an interaction state for every interactive semantic surface", () => {
    const required = [
      "color.surface.hover", "color.surface.pressed", "color.surface.selected", "color.surface.disabled",
      "color.foreground.disabled", "color.primary.hover", "color.primary.pressed",
      "color.danger.hover", "color.danger.pressed", "focus.ring.width", "focus.ring.offset",
    ];
    const available = new Set(workspace.resolvedTokens.map((token) => token.name));
    expect(required.filter((name) => !available.has(name))).toEqual([]);
  });

  it.each(MODE_TOKENS)("pairs every fill role with a foreground that meets the Color foundation's 4.5:1 minimum in %s mode", (_mode, tokens) => {
    const pairs = ["primary", "secondary", "accent", "highlight", "info", "success", "warning", "danger"];
    const failures = pairs.flatMap((role) => {
      const ratio = contrastRatio(resolvedColorIn(tokens, `color.on.${role}`), resolvedColorIn(tokens, `color.${role}`));
      return ratio < 4.5 ? [`color.on.${role} on color.${role} is ${ratio.toFixed(2)}:1`] : [];
    });
    expect(failures).toEqual([]);
  });

  it.each(MODE_TOKENS)("keeps text roles readable on the default surface in %s mode", (_mode, tokens) => {
    const surface = resolvedColorIn(tokens, "color.surface");
    const failures = TEXT_ROLES.flatMap((role) => {
      const ratio = contrastRatio(resolvedColorIn(tokens, role), surface);
      return ratio < 4.5 ? [`${role} on color.surface is ${ratio.toFixed(2)}:1`] : [];
    });
    expect(failures).toEqual([]);
  });

  it.each(MODE_TOKENS)("holds every derived role clear of the floor, not merely above it, in %s mode", (_mode, tokens) => {
    const failures = DERIVED_TEXT_ROLES.flatMap(([role, backgrounds]) => backgrounds.flatMap((background) => {
      const ratio = contrastRatio(resolvedColorIn(tokens, role), resolvedColorIn(tokens, background));
      return ratio < DERIVED_TEXT_MINIMUM ? [`${role} on ${background} is ${ratio.toFixed(2)}:1`] : [];
    }));
    expect(failures).toEqual([]);
  });

  it.each(MODE_TOKENS)("keeps the selection treatment the Color foundation prescribes readable on the selected surface in %s mode", (_mode, tokens) => {
    const selected = resolvedColorIn(tokens, "color.surface.selected");
    // Text and icons take the readable amethyst; color.primary is the fill and indicator, held to the 3:1 non-text rule.
    expect(contrastRatio(resolvedColorIn(tokens, "color.primary.foreground"), selected)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(resolvedColorIn(tokens, "color.primary"), selected)).toBeGreaterThanOrEqual(3);
  });

  it.each(MODE_TOKENS)("keeps the default foreground readable on every tinted status and state surface in %s mode", (_mode, tokens) => {
    const foreground = resolvedColorIn(tokens, "color.foreground");
    const failures = TINTED_SURFACES.flatMap((name) => {
      const ratio = contrastRatio(foreground, resolvedColorIn(tokens, name));
      return ratio < 4.5 ? [`color.foreground on ${name} is ${ratio.toFixed(2)}:1`] : [];
    });
    expect(failures).toEqual([]);
  });

  it.each(MODE_TOKENS)("holds every colour contract validate enforces in %s mode, so the suite and validate agree", (mode, tokens) => {
    expect(contrastFailures(tokens, mode).map((failure) => `${failure.foreground} on ${failure.background} is ${failure.ratio.toFixed(2)}:1`)).toEqual([]);
  });

  it("detects unreadable dark text and broken dark references in a Profile without Themes", () => {
    const profile = structuredClone(workspace);
    profile.themes = []; profile.defaultThemeId = "";
    const foreground = profile.foundations.flatMap((f) => f.tokens).find((t) => t.name === "color.foreground")!;
    foreground.modes = { dark: "{color.surface}" };
    const dark = resolveThemeTokens(profile.foundations, null, "dark");
    expect(contrastFailures(dark.tokens, "dark").some((f) => f.foreground === "color.foreground" && f.background === "color.surface" && f.ratio === 1)).toBe(true);
    expect(validateWorkspace(profile).some((f) => f.level === "error" && /Profile \(dark\): color.foreground on color.surface/.test(f.detail))).toBe(true);
    foreground.modes = { dark: "{missing.dark.token}" };
    expect(validateWorkspace(profile).some((f) => f.level === "error" && f.detail.includes("Profile (dark)") && f.detail.includes("missing.dark.token"))).toBe(true);
  });

  it("keeps the light status text roles identical to their fills, so light mode did not change", () => {
    for (const role of ["info", "warning", "danger"]) expect(resolvedColor(`color.${role}.foreground`), role).toBe(resolvedColor(`color.${role}`));
  });
});

describe("Monet dark mode", () => {
  const dark = new Map(resolveThemeTokens(workspace.foundations, defaultTheme, "dark").tokens.map((token) => [token.name, token]));
  const light = new Map(workspace.resolvedTokens.map((token) => [token.name, token]));

  it("is a mode the starter workspace supports", () => {
    expect(workspace.modes).toEqual(["light", "dark"]);
    expect(workspace.activeMode).toBe("light");
  });

  it("resolves every dark value without broken or circular references", () => {
    const resolution = resolveThemeTokens(workspace.foundations, defaultTheme, "dark");
    expect(resolution.issues).toEqual([]);
    expect(resolution.tokens.filter((token) => !token.valid).map((token) => token.name)).toEqual([]);
  });

  it("puts every dark value on a semantic role or a composite, never on a raw palette step", () => {
    const moded = workspace.foundations.flatMap((foundation) => foundation.tokens.filter((token) => token.modes?.dark !== undefined));
    expect(moded.length).toBeGreaterThan(20);
    expect(moded.filter((token) => token.level === "primitive" && token.type === "color").map((token) => token.name)).toEqual([]);
  });

  it("actually darkens the page and content surfaces", () => {
    const background = String(dark.get("color.background")!.resolved_value);
    const surface = String(dark.get("color.surface")!.resolved_value);
    expect(lum(background)).toBeLessThan(0.02);
    expect(lum(surface)).toBeLessThan(0.03);
    expect(lum(String(dark.get("color.foreground")!.resolved_value))).toBeGreaterThan(0.8);
    // The dark ramp keeps the light one's ordering: a higher neutral step is always darker.
    const steps = ["neutral.350", "neutral.400", "neutral.500", "neutral.600", "neutral.800", "neutral.900", "neutral.925", "neutral.950", "neutral.975"].map((name) => lum(String(light.get(name)!.resolved_value)));
    expect(steps.every((value, index) => index === 0 || value < steps[index - 1]!)).toBe(true);
  });

  it("keeps every fill and its verified foreground identical across modes", () => {
    const fixed = [
      "color.primary", "color.primary.hover", "color.primary.pressed", "color.secondary", "color.accent", "color.highlight",
      "color.info", "color.success", "color.warning", "color.danger", "color.danger.hover", "color.danger.pressed",
      ...["primary", "secondary", "accent", "highlight", "info", "success", "warning", "danger"].map((role) => `color.on.${role}`),
    ];
    const moved = fixed.filter((name) => dark.get(name)!.resolved_value !== light.get(name)!.resolved_value);
    expect(moved).toEqual([]);
    expect(fixed.filter((name) => dark.get(name)!.source !== "base")).toEqual([]);
  });

  it("moves the surfaces, text, borders, tints, focus, and shadows", () => {
    const expected = [
      "color.background", "color.surface", "color.surface.hover", "color.surface.pressed", "color.surface.selected", "color.surface.disabled",
      "color.foreground", "color.foreground.muted", "color.foreground.disabled", "color.border", "color.border.strong",
      "color.link", "color.focus", "color.primary.foreground", "color.info.foreground", "color.warning.foreground", "color.danger.foreground", "color.success.foreground",
      "color.info.surface", "color.success.surface", "color.warning.surface", "color.danger.surface",
      "border.default", "border.strong", "border.focus", "shadow.raised", "shadow.overlay", "shadow.dialog", "opacity.scrim",
    ];
    const unchanged = expected.filter((name) => String(dark.get(name)!.resolved_value) === String(light.get(name)!.resolved_value));
    expect(unchanged).toEqual([]);
    expect(expected.filter((name) => dark.get(name)!.source !== "mode")).toEqual([]);
    expect(dark.get("opacity.scrim")!.resolved_value).toBe(0.6);
  });

  it("keeps status text readable on its own deep tint, which the light tints do not promise", () => {
    // Light tinted surfaces carry color.foreground and the status colour lives on the icon; the dark
    // tints are deep enough that the lightened status text also reads on them, and that is held here
    // so a later tint cannot quietly take it away.
    const failures = ["info", "success", "warning", "danger"].flatMap((role) => {
      const ratio = contrastRatio(String(dark.get(`color.${role}.foreground`)!.resolved_value), String(dark.get(`color.${role}.surface`)!.resolved_value));
      return ratio < DERIVED_TEXT_MINIMUM ? [`color.${role}.foreground on color.${role}.surface is ${ratio.toFixed(2)}:1`] : [];
    });
    expect(failures).toEqual([]);
  });

  it("says so in the Color, Elevation, and Opacity guidance", () => {
    const records = ["color", "elevation", "opacity"].map((id) => workspace.foundations.find((item) => item.id === id)!);
    expect(records.filter((item) => !/dark mode/i.test(item.guidance)).map((item) => item.id)).toEqual([]);
  });
});

describe("Monet design context", () => {
  it("returns decided guidance for a high-traffic component without warnings", async () => {
    const context = await service.getDesignContext({ componentIds: ["data-table"] });
    const decision = context.components.find((item) => item.id === "data-table")?.decision;
    expect(context.warnings).toEqual([]);
    expect(decision?.status).toBe("selected");
    expect(decision?.rationale.length).toBeGreaterThan(0);
    expect(context.foundations.map((item) => item.id)).toContain("interaction");
  });
});
