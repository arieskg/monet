import { describe, expect, it } from "vitest";
import { loadWorkspace } from "../server/fileStore.js";
import { joinComponents, createMonetService } from "./service.js";
import { preferenceViolations } from "./preferences.js";
import type { ComponentDecision, Workspace } from "./model.js";

const workspace: Workspace = await loadWorkspace();
const service = createMonetService({ loadWorkspace });
const components = joinComponents(workspace);
const componentIds = new Set(components.map((item) => item.id));
const foundationIds = new Set(workspace.foundations.map((item) => item.id));
const primitiveIds = new Set(workspace.primitiveTaxonomy.flatMap((category) => category.entries.map((entry) => entry.id)));
const tokenNames = new Set(workspace.resolvedTokens.map((token) => token.name));

/** Backgrounds a role is documented against, so a contrast claim is checked where the role is actually used. */
const SURFACES = ["color.surface", "color.surface.hover", "color.surface.pressed", "color.surface.selected"];

/**
 * Identity fills carry fixed hues and sit just above the 4.5:1 floor by design. Every role Monet
 * derived instead of inheriting is held clear of it, so a later tint or state cannot cross the floor.
 */
const DERIVED_TEXT_ROLES: [role: string, backgrounds: string[]][] = [
  ["color.foreground.muted", SURFACES],
  ["color.primary.foreground", ["color.surface", "color.surface.selected"]],
  ["color.link", ["color.surface"]],
  ["color.info", ["color.surface"]],
  ["color.warning", ["color.surface"]],
  ["color.success.foreground", ["color.surface", "color.success.surface"]],
  ["color.on.warning", ["color.warning"]],
];
const DERIVED_TEXT_MINIMUM = 4.75;

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Relative luminance and contrast per WCAG 2.1, used to hold the Color foundation to its own stated minimums. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const [r, g, b] = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((first, second) => second - first) as [number, number];
  return (high + 0.05) / (low + 0.05);
}

function resolvedColor(name: string): string {
  const token = workspace.resolvedTokens.find((item) => item.name === name);
  expect(token, `missing token ${name}`).toBeDefined();
  expect(String(token!.resolved_value), `unresolved token ${name}`).toMatch(/^#[0-9a-f]{6}$/i);
  return String(token!.resolved_value);
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
  const controls = ["text-input", "textarea", "select", "search-input", "password-input", "combobox", "checkbox", "radio"];

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

  it("keeps that boundary above the 3:1 non-text minimum on every surface a control rests on", () => {
    const boundary = resolvedColor("color.border.strong");
    const failures = SURFACES.flatMap((name) => {
      const ratio = contrast(boundary, resolvedColor(name));
      return ratio < 3 ? [`color.border.strong on ${name} is ${ratio.toFixed(2)}:1`] : [];
    });
    expect(failures).toEqual([]);
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

  it("pairs every fill role with a foreground that meets the Color foundation's 4.5:1 minimum", () => {
    const pairs = ["primary", "secondary", "accent", "highlight", "info", "success", "warning", "danger"];
    const failures = pairs.flatMap((role) => {
      const ratio = contrast(resolvedColor(`color.on.${role}`), resolvedColor(`color.${role}`));
      return ratio < 4.5 ? [`color.on.${role} on color.${role} is ${ratio.toFixed(2)}:1`] : [];
    });
    expect(failures).toEqual([]);
  });

  it("keeps text roles readable on the default surface", () => {
    const surface = resolvedColor("color.surface");
    const roles = ["color.foreground", "color.foreground.muted", "color.link", "color.info", "color.warning", "color.danger", "color.success.foreground"];
    const failures = roles.flatMap((role) => {
      const ratio = contrast(resolvedColor(role), surface);
      return ratio < 4.5 ? [`${role} on color.surface is ${ratio.toFixed(2)}:1`] : [];
    });
    expect(failures).toEqual([]);
  });

  it("holds every derived role clear of the floor, not merely above it", () => {
    const failures = DERIVED_TEXT_ROLES.flatMap(([role, backgrounds]) => backgrounds.flatMap((background) => {
      const ratio = contrast(resolvedColor(role), resolvedColor(background));
      return ratio < DERIVED_TEXT_MINIMUM ? [`${role} on ${background} is ${ratio.toFixed(2)}:1`] : [];
    }));
    expect(failures).toEqual([]);
  });

  it("keeps the selection treatment the Color foundation prescribes readable on the selected surface", () => {
    const selected = resolvedColor("color.surface.selected");
    // Text and icons take the darker amethyst; color.primary is the fill and indicator, held to the 3:1 non-text rule.
    expect(contrast(resolvedColor("color.primary.foreground"), selected)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(resolvedColor("color.primary"), selected)).toBeGreaterThanOrEqual(3);
  });

  it("keeps the default foreground readable on every tinted status and state surface", () => {
    const foreground = resolvedColor("color.foreground");
    const surfaces = [
      "color.info.surface", "color.success.surface", "color.warning.surface", "color.danger.surface",
      "color.surface.hover", "color.surface.pressed", "color.surface.selected", "color.surface.disabled",
    ];
    const failures = surfaces.flatMap((name) => {
      const ratio = contrast(foreground, resolvedColor(name));
      return ratio < 4.5 ? [`color.foreground on ${name} is ${ratio.toFixed(2)}:1`] : [];
    });
    expect(failures).toEqual([]);
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
