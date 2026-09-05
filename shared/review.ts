import { CONTRAST_CONTRACTS, contrast, contrastFloor, type ContrastContract, type ContrastKind } from "./contrast.js";
import { resourceUri } from "./compactContext.js";
import type { Component, DesignReview, DesignReviewRequest, DesignUsage, ResolvedThemeToken, ReviewFinding, ThemeMode } from "./model.js";

/**
 * Design conformance: what Monet can prove about an implementation from evidence the calling agent
 * supplies, and nothing more.
 *
 * Monet never reads source. The caller reports what it built as a list of observations — a colour
 * it wrote, a token it referenced, a component it used, a foreground over a background — and this
 * module measures those against the canonical records. Every check answers a closed-set or
 * arithmetic question: is this token defined, is this colour in the resolved palette, is this
 * dimension on the scale its property belongs to, does this pair reach its contrast minimum, what
 * status does this component carry.
 *
 * Three rules keep the result honest. Monet reports only what the evidence supports: an observation
 * it cannot measure becomes an `info` finding naming the reason, never a violation. It never
 * asserts conformance, because it cannot see what was not submitted. And a concept it has no
 * decision or scale for is `not_applicable`, not a failure — silence from Monet is not disapproval.
 *
 * Two of those rules have teeth in specific places, and both are about refusing to guess. A contrast
 * minimum applies only where the caller declared one or the Color foundation documents the pairing;
 * an arbitrary pair of Monet's own tokens is not a Monet policy question, and assuming an undeclared
 * pair carries text would manufacture errors out of icons and disabled labels. And a `replacement`
 * is offered only where one token is the answer — several roles share a value routinely, and a tie
 * broken by name length is a guess wearing the costume of a recommendation.
 */

/** Properties whose value Monet reads as a colour. */
const COLOUR_PROPERTIES = new Set([
  "color", "background", "background-color", "border-color", "border-top-color", "border-right-color",
  "border-bottom-color", "border-left-color", "outline-color", "fill", "stroke", "caret-color",
  "text-decoration-color", "accent-color", "column-rule-color",
]);

/**
 * Properties whose value Monet holds to one Foundation's scale. Deliberately narrow: `width` and
 * `height` are absent because arbitrary container dimensions are not meant to sit on the sizing
 * scale, and holding them to it would manufacture violations.
 */
const DIMENSION_SCALES: readonly (readonly [RegExp, string])[] = [
  [/^(padding|margin)(-(top|right|bottom|left|inline|block)(-(start|end))?)?$/, "spacing"],
  [/^(gap|row-gap|column-gap)$/, "spacing"],
  [/^border(-(top|right|bottom|left|start|end))?(-(start|end))?-radius$/, "radius"],
  [/^border-radius$/, "radius"],
  [/^font-size$/, "typography"],
];

/**
 * Shorthands that pack several properties into one value. Monet measures one property against one
 * scale, so it cannot read these — but the parts they carry are things it does check, so a shorthand
 * is unverifiable rather than not applicable: saying nothing would read as approval of a value Monet
 * never looked at.
 */
const SHORTHAND_PROPERTIES = new Set([
  "border", "border-top", "border-right", "border-bottom", "border-left", "border-block", "border-inline",
  "outline", "background", "font", "flex", "grid", "grid-area", "transition", "animation", "box-shadow",
  "text-decoration", "list-style", "mask", "inset", "place-items", "place-content",
]);

/** A token reference written into a style value, in either of the two forms Monet's own records use. */
const TOKEN_IN_VALUE = /^(?:token:([A-Za-z0-9][A-Za-z0-9._-]*)|\{([^}]+)\})$/;
const CSS_VARIABLE = /^var\(\s*--/;

const HEX = /^#([0-9a-f]{3,8})$/i;
const RGB = /^rgba?\(\s*([0-9.]+%?)\s*[,\s]\s*([0-9.]+%?)\s*[,\s]\s*([0-9.]+%?)\s*(?:[,/]\s*([0-9.]+%?)\s*)?\)$/i;
const DIMENSION = /^(-?[0-9]*\.?[0-9]+)([a-z%]*)$/i;

function channel(raw: string): number | null {
  const value = raw.endsWith("%") ? Number.parseFloat(raw) * 2.55 : Number.parseFloat(raw);
  return Number.isFinite(value) ? Math.round(Math.min(255, Math.max(0, value))) : null;
}

/**
 * A colour as `#rrggbb`, or null when Monet cannot measure it. Named colours, `color-mix`, gradients
 * and any partially transparent value return null: they are unverifiable rather than wrong, because
 * comparing them to an opaque token value would be a guess.
 */
export function normalizeColour(value: string): string | null {
  const input = value.trim().toLowerCase();
  const hex = HEX.exec(input);
  if (hex) {
    const digits = hex[1]!;
    if (digits.length === 4 || digits.length === 8) {
      const alpha = digits.length === 4 ? digits[3]!.repeat(2) : digits.slice(6);
      if (alpha !== "ff") return null;
    }
    if (digits.length === 3 || digits.length === 4) return `#${[...digits.slice(0, 3)].map((digit) => digit + digit).join("")}`;
    if (digits.length === 6 || digits.length === 8) return `#${digits.slice(0, 6)}`;
    return null;
  }
  const rgb = RGB.exec(input);
  if (!rgb) return null;
  if (rgb[4] !== undefined && Number.parseFloat(rgb[4]) !== 1 && rgb[4] !== "100%") return null;
  const channels = [rgb[1]!, rgb[2]!, rgb[3]!].map(channel);
  if (channels.some((part) => part === null)) return null;
  return `#${channels.map((part) => part!.toString(16).padStart(2, "0")).join("")}`;
}

/** A dimension as a number and unit, or null when it is not a plain length. `0` is unitless by convention. */
export function normalizeDimension(value: string): { amount: number; unit: string } | null {
  const match = DIMENSION.exec(value.trim().toLowerCase());
  if (!match) return null;
  const amount = Number.parseFloat(match[1]!);
  if (!Number.isFinite(amount)) return null;
  return { amount, unit: amount === 0 ? "" : match[2]! };
}

function sameDimension(a: { amount: number; unit: string }, b: { amount: number; unit: string }): boolean {
  return a.amount === b.amount && (a.unit === b.unit || (a.amount === 0 && b.amount === 0));
}

function scaleFor(property: string): string | null {
  const name = property.trim().toLowerCase();
  for (const [pattern, foundation] of DIMENSION_SCALES) if (pattern.test(name)) return foundation;
  return null;
}

/** Whether a value carries more than one top-level part. Whitespace inside `rgb(...)` or `calc(...)` is not a seam. */
function isMultiPart(value: string): boolean {
  let depth = 0;
  for (const character of value.trim()) {
    if (character === "(") depth += 1;
    else if (character === ")") depth = Math.max(0, depth - 1);
    else if (depth === 0 && /\s/.test(character)) return true;
  }
  return false;
}

/** A value Monet would otherwise measure, written as a shorthand that bundles several properties into one. */
function isShorthandValue(property: string, value: string): boolean {
  return isMultiPart(value) && (SHORTHAND_PROPERTIES.has(property) || scaleFor(property) !== null);
}

/** The token types a property's value can legitimately carry, for the properties Monet reads at all. */
function expectedTokenTypes(property: string): { types: string[]; label: string } | null {
  if (COLOUR_PROPERTIES.has(property)) return { types: ["color"], label: "a colour" };
  return scaleFor(property) ? { types: ["dimension", "font-size"], label: "a length" } : null;
}

const BORDER_PROPERTIES = new Set(["border-color", "border-top-color", "border-right-color", "border-bottom-color", "border-left-color", "outline-color", "column-rule-color", "stroke"]);
const FOREGROUND_PROPERTIES = new Set(["color", "fill", "caret-color", "text-decoration-color"]);

/**
 * How well a colour role fits the property it was written against. Several roles routinely share a
 * value — white is a surface, an inverse foreground, and the foreground of four status fills — so
 * ranking by name alone picks an arbitrary one. The property is evidence the caller supplied, not
 * an inference about intent, so it is what orders equally-valued matches. Lower is a better fit.
 */
function colourAffinity(property: string, name: string): number {
  const surface = /(^|\.)(surface|background|scrim)($|\.)/.test(name);
  const foreground = name.startsWith("color.on.") || /(^|\.)foreground($|\.)/.test(name);
  const border = /(^|\.)(border|focus)($|\.)/.test(name);
  if (property === "background" || property === "background-color") return surface ? 0 : foreground ? 3 : border ? 2 : 1;
  if (BORDER_PROPERTIES.has(property)) return border ? 0 : foreground ? 3 : surface ? 2 : 1;
  if (FOREGROUND_PROPERTIES.has(property)) return foreground ? 0 : surface ? 3 : border ? 2 : 1;
  return 1;
}

/** At or above this an affinity means the role contradicts the property it was written against. */
const WEAK_AFFINITY = 2;

/**
 * The tokens worth naming, given a set that all carry the same value. Product code is meant to name
 * semantic roles, so a primitive is only ever suggested when no role resolves to the value — without
 * this every light value would also match the primitive it points at, which never moves between
 * modes, and the useful role would be buried behind it. Ordering is by fit to the property and then
 * by name, which only decides presentation: what Monet is willing to *recommend* is decided by
 * `soleReplacement`, so a tie is never broken into an answer.
 */
function preferSemantic(tokens: ResolvedThemeToken[], property = ""): ResolvedThemeToken[] {
  const semantic = tokens.filter((token) => token.level === "semantic");
  return (semantic.length ? semantic : tokens)
    .sort((a, b) => colourAffinity(property, a.name) - colourAffinity(property, b.name) || a.name.localeCompare(b.name));
}

/**
 * The one token Monet can put in `replacement`, or nothing when it cannot name one. Several roles
 * routinely carry the same value — white is a surface, an inverse foreground, and the foreground of
 * five fills — so a literal that matches more than one of them equally well has no single
 * answer, and a role whose kind contradicts the property it was written against is not an answer at
 * all. Monet still reports the finding and still names the candidates in `expected`; it stops short
 * of a `replacement` a caller could apply blind. Breaking the tie on name length or alphabet would
 * manufacture a winner out of a genuine ambiguity, which is worse than saying nothing.
 */
function soleReplacement(ranked: readonly ResolvedThemeToken[], property: string): string | undefined {
  const best = ranked[0];
  if (!best) return undefined;
  const affinity = colourAffinity(property, best.name);
  if (affinity >= WEAK_AFFINITY) return undefined;
  const tied = ranked.filter((token) => colourAffinity(property, token.name) === affinity);
  return tied.length === 1 ? best.name : undefined;
}

/**
 * A reference reduced to Monet's id shape. Components are named `TextInput` or `IconButton` in the
 * code an agent is reporting on and `text-input` or `icon-button` in the taxonomy, so the CamelCase
 * seams are split before the slug is formed; `HTMLInput` splits after the acronym rather than
 * between every capital. Exact id, name, and alias matching runs first and is unchanged.
 */
function slugifyReference(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function componentFor(components: Component[], reference: string): Component | undefined {
  const needle = reference.trim().toLowerCase();
  const slug = slugifyReference(reference);
  return components.find((item) => item.id === needle || item.id === slug)
    ?? components.find((item) => item.name.toLowerCase() === needle)
    ?? components.find((item) => item.aliases.some((alias) => alias.toLowerCase() === needle))
    ?? components.find((item) => slugifyReference(item.name) === slug)
    ?? components.find((item) => item.aliases.some((alias) => slugifyReference(alias) === slug));
}

interface Context {
  tokens: ResolvedThemeToken[];
  /** Base Monet's light values, used only to name a literal that hard-codes a light value in another mode. */
  lightTokens: ResolvedThemeToken[];
  components: Component[];
  mode: ThemeMode;
}

function tokenValue(token: ResolvedThemeToken): string {
  return String(token.resolved_value ?? token.value);
}

/** Resolves a contrast operand: a Monet token name reads as its resolved value, anything else as a literal. */
function operandColour(context: Context, raw: string): { colour: string | null; token?: ResolvedThemeToken } {
  const token = context.tokens.find((item) => item.name === raw.trim());
  if (token) return { colour: normalizeColour(tokenValue(token)), token };
  return { colour: normalizeColour(raw) };
}

type Outcome = "checked" | "unverifiable" | "not_applicable";
interface Result { outcome: Outcome; findings: ReviewFinding[]; checks: string[] }

function finding(usage: DesignUsage, base: Omit<ReviewFinding, "usage_id" | "location">): ReviewFinding {
  return { ...base, ...(usage.id ? { usage_id: usage.id } : {}), ...(usage.location ? { location: usage.location } : {}) };
}

function unverifiable(usage: DesignUsage, observed: string, why: string, expected = "a value Monet can measure"): Result {
  return {
    outcome: "unverifiable", checks: ["unverifiable"],
    findings: [finding(usage, { level: "info", check: "unverifiable", observed, expected, why, related: [] })],
  };
}

/**
 * A token observation. `property` is supplied only when the token was written into a style value,
 * where Monet also knows what kind of value the property takes.
 */
function reviewToken(context: Context, usage: DesignUsage, name: string, property?: string): Result {
  const token = context.tokens.find((item) => item.name === name);
  if (!token) {
    return {
      outcome: "checked", checks: ["unknown_token"],
      findings: [finding(usage, {
        level: "error", check: "unknown_token", observed: `token ${name}`,
        expected: "a token defined by a Monet Foundation",
        why: "No Foundation defines this token, so it resolves to nothing and the value falls back to whatever the framework decides.",
        related: [],
      })],
    };
  }
  if (!token.valid) {
    return {
      outcome: "checked", checks: ["token_does_not_resolve"],
      findings: [finding(usage, {
        level: "error", check: "token_does_not_resolve", observed: `token ${name}`,
        expected: `${name} to resolve to a value`,
        why: "The token exists but its reference chain does not resolve, so it carries no usable value in this theme and mode.",
        related: [resourceUri("foundations", token.foundation)],
      })],
    };
  }
  const expectation = property ? expectedTokenTypes(property) : null;
  const checks = expectation ? ["unknown_token", "token_type_mismatch"] : ["unknown_token"];
  if (expectation && !expectation.types.includes(token.type)) {
    return {
      outcome: "checked", checks,
      findings: [finding(usage, {
        level: "error", check: "token_type_mismatch", observed: `${property}: token ${name} (${token.type})`,
        expected: `a ${expectation.types.join(" or ")} token`,
        why: `\`${property}\` takes ${expectation.label}, and ${name} is a ${token.type} token from the ${token.foundation} Foundation, so this pairing cannot produce a usable value whatever the theme resolves to.`,
        related: [resourceUri("foundations", token.foundation)],
      })],
    };
  }
  return { outcome: "checked", checks, findings: [] };
}

function reviewColour(context: Context, usage: DesignUsage, property: string, value: string): Result {
  const colour = normalizeColour(value);
  if (!colour) return unverifiable(usage, `${property}: ${value}`, "Monet measures opaque hex and rgb() colours; this value is a named colour, a function, or partially transparent, so it cannot be compared to the palette.");

  const related = [resourceUri("foundations", "color")];
  const matches = preferSemantic(context.tokens.filter((token) => token.foundation === "color" && normalizeColour(tokenValue(token)) === colour), property);
  /**
   * Roles whose light value is this colour but whose value in this mode is not. Monet reports these
   * alongside any current-mode match rather than instead of it: a fill and its `color.on.*`
   * foreground keep their value across modes, so a literal can legitimately be in the dark palette
   * and still be a pinned light surface. Which one the author meant is not something Monet can know.
   */
  const moved = context.mode === "light" ? [] : preferSemantic(context.lightTokens.filter((token) => {
    if (token.foundation !== "color" || normalizeColour(tokenValue(token)) !== colour) return false;
    const current = context.tokens.find((item) => item.name === token.name);
    return Boolean(current) && normalizeColour(tokenValue(current!)) !== colour;
  }), property);

  const findings: ReviewFinding[] = [];
  const checks: string[] = [];
  if (matches.length) {
    const best = matches[0]!;
    const replacement = soleReplacement(matches, property);
    const named = matches.slice(0, 3).map((token) => token.name);
    checks.push("literal_colour_has_token");
    findings.push(finding(usage, {
      level: "warning", check: "literal_colour_has_token", observed: `${property}: ${value}`,
      expected: replacement
        ? `${replacement}${matches.length > 1 ? ` (also ${matches.slice(1, 3).map((token) => token.name).join(", ")})` : ""}`
        : named.length > 1 ? `one of ${named.join(", ")}` : named[0]!,
      why: replacement
        ? `This literal is the ${context.mode} value of ${replacement}. Naming the role instead keeps the value following the theme and the mode rather than pinning it.`
        : named.length > 1
          ? `This literal is the ${context.mode} value of ${named.length} Monet roles (${named.join(", ")}), and none of them fits \`${property}\` better than the others, so Monet will not choose between them. Name the role you mean and the value follows the theme and the mode.`
          : `This literal is the ${context.mode} value of ${best.name}, but that role is not one Monet would write against \`${property}\`, so it names the match without recommending it. Name the role this element actually plays instead of pinning the literal.`,
      ...(replacement ? { replacement } : {}), related,
    }));
  } else if (!moved.length) {
    checks.push("colour_outside_palette");
    findings.push(finding(usage, {
      level: "warning", check: "colour_outside_palette", observed: `${property}: ${value}`,
      expected: `a colour in the resolved ${context.mode} palette`,
      why: "No Monet colour token resolves to this value in this theme and mode, so it is outside the palette and will not follow a theme or mode change.",
      related,
    }));
  }

  if (moved.length) {
    const names = moved.slice(0, 3).map((token) => `${token.name} (${tokenValue(context.tokens.find((item) => item.name === token.name)!)} in ${context.mode})`);
    const replacement = soleReplacement(moved, property);
    checks.push("light_value_in_other_mode");
    findings.push(finding(usage, {
      level: "warning", check: "light_value_in_other_mode", observed: `${property}: ${value} in ${context.mode} mode`,
      expected: `one of ${names.join(", ")}`,
      why: `This is the light value of ${moved.length === 1 ? "a role that moves" : "roles that move"} in ${context.mode} mode, so hard-coding it keeps this element's light appearance. If you meant ${moved.length === 1 ? "that role" : "one of them"}, name it instead of the literal.`,
      ...(replacement ? { replacement } : {}), related,
    }));
  }
  return { outcome: "checked", checks, findings };
}

function reviewDimension(context: Context, usage: DesignUsage, property: string, value: string, foundation: string): Result {
  const dimension = normalizeDimension(value);
  if (!dimension) return unverifiable(usage, `${property}: ${value}`, "Monet compares plain lengths against a scale; this value is a calculation or a keyword, so no single scale step applies.");

  const scale = context.tokens
    .filter((token) => token.foundation === foundation && (token.type === "dimension" || token.type === "font-size"))
    .map((token) => ({ token, dimension: normalizeDimension(tokenValue(token)) }))
    .filter((entry): entry is { token: ResolvedThemeToken; dimension: { amount: number; unit: string } } => entry.dimension !== null);
  if (!scale.length) return { outcome: "not_applicable", checks: [], findings: [] };

  /**
   * Monet's scales are non-negative. A negative margin is a spacing step applied in the opposite
   * direction, so its magnitude is the thing to compare — measuring the signed value instead would
   * put every pull nearest to `space.0` and recommend deleting it. Elsewhere a negative length is
   * not a step in reverse at all, and Monet has no rule that gives it one.
   */
  const negative = dimension.amount < 0;
  if (negative && foundation !== "spacing") {
    return unverifiable(usage, `${property}: ${value}`, `The ${foundation} scale is non-negative, and a negative ${property} is not one of its steps applied in reverse, so Monet has nothing to measure it against.`);
  }
  const measured = { amount: Math.abs(dimension.amount), unit: dimension.unit };

  if (scale.some((entry) => sameDimension(entry.dimension, measured))) return { outcome: "checked", checks: ["off_scale_dimension"], findings: [] };

  const units = [...new Set(scale.map((entry) => entry.dimension.unit).filter(Boolean))];
  if (measured.amount !== 0 && !units.includes(measured.unit)) {
    return unverifiable(usage, `${property}: ${value}`, `The ${foundation} scale is expressed in ${units.join(", ")}; Monet cannot convert ${measured.unit || "a unitless value"} to compare them.`);
  }

  const nearest = scale
    .filter((entry) => entry.dimension.unit === measured.unit || entry.dimension.amount === 0)
    .sort((a, b) => Math.abs(a.dimension.amount - measured.amount) - Math.abs(b.dimension.amount - measured.amount))
    .slice(0, 2);
  const steps = nearest.map((entry) => `${entry.token.name} (${tokenValue(entry.token)})`).join(" or ");
  return {
    outcome: "checked", checks: ["off_scale_dimension"],
    findings: [finding(usage, {
      level: "warning", check: "off_scale_dimension", observed: `${property}: ${value}`,
      expected: nearest.length
        ? `${negative ? `the negation of a ${foundation} step such as ` : `a ${foundation} step such as `}${steps}`
        : `${negative ? "the negation of a step on the " : "a step on the "}${foundation} scale`,
      why: negative
        ? `No ${foundation} token carries this magnitude, so this pull is off the scale the rest of the system spaces against. Monet names the step rather than a replacement value, because the direction is yours to keep.`
        : `No ${foundation} token carries this value, so it is off the scale the rest of the system spaces against.`,
      ...(nearest.length && !negative ? { replacement: nearest[0]!.token.name } : {}),
      related: [resourceUri("foundations", foundation)],
    })],
  };
}

function reviewStyle(context: Context, usage: DesignUsage): Result {
  const property = (usage.property ?? "").trim().toLowerCase();
  const value = (usage.value ?? "").trim();
  if (!property || !value) return unverifiable(usage, `${property || "(no property)"}: ${value || "(no value)"}`, "A style observation needs both a property and the value that was authored against it.");

  const reference = TOKEN_IN_VALUE.exec(value);
  if (reference) return reviewToken(context, usage, (reference[1] ?? reference[2] ?? "").trim(), property);
  if (CSS_VARIABLE.test(value)) return unverifiable(usage, `${property}: ${value}`, "Monet does not map CSS custom property names to token names. Submit the Monet token this variable carries as a `token` observation.");
  if (isShorthandValue(property, value)) {
    const foundation = scaleFor(property);
    const guidance = foundation
      ? `\`${property}\` was written with several lengths at once, and Monet measures one value against one scale. Submit each side as its own observation — \`${property}-top\`, \`${property}-right\`, and so on — and every one of them can be measured against the ${foundation} scale.`
      : `\`${property}\` bundles several properties into one value, and Monet measures one property against one scale. Submit the parts as separate observations — the colour as \`${property === "outline" ? "outline-color" : "border-color"}\`, a length as \`border-radius\` or a spacing property — and each one can be measured.`;
    return unverifiable(usage, `${property}: ${value}`, guidance, "the properties this shorthand sets, submitted one at a time");
  }

  if (COLOUR_PROPERTIES.has(property)) return reviewColour(context, usage, property, value);
  const foundation = scaleFor(property);
  if (foundation) return reviewDimension(context, usage, property, value, foundation);
  return { outcome: "not_applicable", checks: [], findings: [] };
}

const STATUS_FINDINGS: Record<string, { level: "error" | "warning" | "info"; check: string; why: string }> = {
  do_not_use: { level: "error", check: "component_do_not_use", why: "Monet has decided against this concept. Replace it rather than restyling it." },
  undecided: { level: "warning", check: "component_undecided", why: "Monet catalogues this concept but has made no decision, so there is no approved styling or behaviour to follow. Surface the choice instead of establishing a standard in code." },
  needs_review: { level: "info", check: "component_needs_review", why: "Monet's decision for this concept is marked for review, so treat its current guidance as provisional." },
  experimental: { level: "info", check: "component_experimental", why: "Monet marks this concept experimental, so its guidance may change." },
};

function reviewComponent(context: Context, usage: DesignUsage): Result {
  const reference = (usage.component ?? "").trim();
  if (!reference) return unverifiable(usage, "(no component)", "A component observation needs the id, name, or alias of the concept that was used.");

  const component = componentFor(context.components, reference);
  if (!component) {
    return {
      outcome: "not_applicable", checks: ["component_unknown"],
      findings: [finding(usage, {
        level: "info", check: "component_unknown", observed: `component ${reference}`,
        expected: "a concept in the Monet taxonomy",
        why: "Monet's taxonomy does not name this concept, so it has no opinion about it. This is not a violation — use a familiar, accessible solution consistent with the rest of the system.",
        related: [],
      })],
    };
  }

  const findings: ReviewFinding[] = [];
  const status = component.decision?.status ?? "undecided";
  const rule = STATUS_FINDINGS[status];
  if (rule) {
    findings.push(finding(usage, {
      level: rule.level, check: rule.check, observed: `component ${component.name} (status ${status})`,
      expected: status === "do_not_use" ? "a concept Monet has approved" : "an approved Monet decision",
      why: rule.why, related: [resourceUri("components", component.id)],
    }));
  }
  if (component.deprecated) {
    findings.push(finding(usage, {
      level: "warning", check: "component_deprecated", observed: `component ${component.name}`,
      expected: "a concept that is not deprecated",
      why: "Monet's taxonomy marks this concept deprecated, so new work should not adopt it.",
      related: [resourceUri("components", component.id)],
    }));
  }
  return { outcome: "checked", checks: ["component_status"], findings };
}

/** The strictest documented contract for a pairing in this mode, when the caller named both tokens. */
function contractFor(mode: ThemeMode, foreground?: string, background?: string): ContrastContract | null {
  if (!foreground || !background) return null;
  const applicable = CONTRAST_CONTRACTS.filter((contract) => contract.foreground === foreground && contract.background === background && (!contract.modes || contract.modes.includes(mode)));
  return applicable.reduce<ContrastContract | null>((strictest, contract) => (!strictest || contract.minimum > strictest.minimum ? contract : strictest), null);
}

/**
 * A contrast observation.
 *
 * Which minimum applies is a fact about how the pair is used, and Monet has exactly two ways to
 * learn it: the caller declares it, or the Color foundation already documents a contract for the two
 * roles. Those are the only cases that produce a violation. A pair Monet was told nothing about is
 * not held to the text rule on the assumption that it carries text — that assumption turns every
 * icon, divider, and disabled label into an error, and an error Monet cannot substantiate is worse
 * than a gap it names. Two tokens with no documented contract are not a Monet policy question at
 * all: Monet reports the measured ratio and says plainly that it defines no contract for the
 * pairing, rather than dressing an arbitrary combination up as a system violation.
 */
function reviewContrast(context: Context, usage: DesignUsage): Result {
  const rawForeground = (usage.foreground ?? "").trim();
  const rawBackground = (usage.background ?? "").trim();
  if (!rawForeground || !rawBackground) return unverifiable(usage, `${rawForeground || "(none)"} on ${rawBackground || "(none)"}`, "A contrast observation needs both the foreground and the background that were actually rendered.");

  const foreground = operandColour(context, rawForeground);
  const background = operandColour(context, rawBackground);
  const unmeasurable = [[rawForeground, foreground], [rawBackground, background]] as const;
  const missing = unmeasurable.filter(([, resolved]) => resolved.colour === null).map(([raw]) => raw);
  if (missing.length) {
    return unverifiable(usage, `${rawForeground} on ${rawBackground}`, `Monet could not measure ${missing.join(" and ")} as an opaque colour or a known token, so the ratio cannot be computed. Submit the resolved colour, or the Monet token name.`);
  }

  const ratio = contrast(foreground.colour!, background.colour!);
  if (ratio === null) return unverifiable(usage, `${rawForeground} on ${rawBackground}`, "Monet could not compute a ratio from these two values.");

  const describe = `${rawForeground} (${foreground.colour}) on ${rawBackground} (${background.colour}) is ${ratio.toFixed(2)}:1 in ${context.mode} mode`;
  const related = [...new Set([...[foreground.token, background.token].flatMap((token) => token ? [resourceUri("foundations", token.foundation)] : []), resourceUri("foundations", "color")])];
  const declared = usage.usage;
  const contract = contractFor(context.mode, foreground.token?.name, background.token?.name);

  // The caller says this pair carries nothing that has to be legible — a decorative fill, a disabled
  // control, an element whose role Monet is not being asked about. There is no minimum to apply, and
  // inventing one would contradict the caller about their own implementation.
  if (declared === "decorative") {
    return {
      outcome: "not_applicable", checks: ["contrast_not_required"],
      findings: [finding(usage, {
        level: "info", check: "contrast_not_required", observed: describe,
        expected: "no minimum: the caller declared this pair decorative",
        why: "Monet measured the pair but applied no minimum, because WCAG sets none for decorative, disabled, or purely presentational content. If this pair does carry text or a meaningful boundary, resubmit it as `text` or `non-text`.",
        related,
      })],
    };
  }

  if (!declared && !contract) {
    // Two Monet roles, but not a pairing the Color foundation documents. Monet can measure it and
    // says so; what it will not do is present an arbitrary combination of its own tokens as a
    // violation of its own policy, because it has no policy about this combination.
    if (foreground.token && background.token) {
      return {
        outcome: "not_applicable", checks: ["contrast_pairing_undocumented"],
        findings: [finding(usage, {
          level: "info", check: "contrast_pairing_undocumented", observed: describe,
          expected: `no Monet contract: the Color foundation does not document ${foreground.token.name} on ${background.token.name}`,
          why: "Both sides are Monet roles, but Monet documents no contrast contract for this pairing, so there is no Monet minimum to measure it against and no violation to report. Declare `usage` as `text` or `non-text` if you want the WCAG minimum applied to it.",
          related,
        })],
      };
    }
    return {
      outcome: "unverifiable", checks: ["contrast_usage_unspecified"],
      findings: [finding(usage, {
        level: "info", check: "contrast_usage_unspecified", observed: describe,
        expected: "a declared `usage` of `text`, `non-text`, or `decorative`",
        why: "Which WCAG minimum applies depends on what this pair carries, and Monet does not document a contract for it. Monet will not assume it is text: declare the usage and the ratio will be measured against the right minimum.",
        related,
      })],
    };
  }

  const kind: ContrastKind = declared ?? contract!.kind;
  const floor = contrastFloor(kind);
  const documented = contract ? `Monet documents this pairing and holds it to ${contract.minimum}:1.` : "Monet documents no contract for this pairing, so this is the WCAG floor for the usage you declared, not a Monet rule.";
  if (ratio < floor) {
    return {
      outcome: "checked", checks: ["contrast_below_minimum"],
      findings: [finding(usage, {
        level: "error", check: "contrast_below_minimum", observed: describe,
        expected: `at least ${floor}:1 for ${kind === "text" ? "normal text" : "a meaningful non-text boundary or indicator"}`,
        why: `This pairing is below the WCAG ${floor}:1 minimum for ${kind}, so the content is not reliably legible. ${documented}`,
        related,
      })],
    };
  }

  if (contract && ratio < contract.minimum) {
    return {
      outcome: "checked", checks: ["contrast_below_margin"],
      findings: [finding(usage, {
        level: "warning", check: "contrast_below_margin", observed: describe,
        expected: `at least ${contract.minimum}:1, the margin Monet documents for this pairing`,
        why: `The pairing clears the ${floor}:1 WCAG floor but sits below the safety margin Monet holds this documented role pairing to, so a later tint or state change could cross the floor.`,
        related,
      })],
    };
  }
  return { outcome: "checked", checks: ["contrast_below_minimum"], findings: [] };
}

const SCOPE = "Monet checked only the observations supplied. It cannot see the implementation, so an empty result means nothing in this evidence contradicted the design system — not that the implementation conforms. Layout, hierarchy, density, visual design, and anything not described here were not reviewed.";

/**
 * Reviews submitted evidence against one theme resolved in one mode. `lightTokens` carries Base
 * Monet's light resolution so a literal that pins a light value in another mode can be named; pass
 * the same list when the mode is light.
 */
export function reviewUsages(
  request: DesignReviewRequest,
  resolved: { theme: { id: string; name: string } | null; tokens: ResolvedThemeToken[]; lightTokens: ResolvedThemeToken[]; components: Component[]; mode: ThemeMode; modes: ThemeMode[] },
): DesignReview {
  const context: Context = { tokens: resolved.tokens, lightTokens: resolved.lightTokens, components: resolved.components, mode: resolved.mode };
  const usages = request.usages ?? [];
  const warnings: string[] = [];
  // A mode the theme cannot resolve falls back to light rather than failing, exactly as
  // `get_design_context` does — and, exactly as there, the caller is told that the values behind
  // these findings are light ones rather than being left to assume the request was honoured.
  if (request.mode && !resolved.modes.includes(request.mode)) {
    const name = resolved.theme?.name ?? "active";
    warnings.push(`The ${name} theme has no ${request.mode} mode, so this evidence was reviewed against the light palette. Colour and contrast findings are light-mode readings and must not be treated as ${request.mode}-mode guidance.`);
  }
  const results = usages.map((usage): Result => {
    switch (usage.kind) {
      case "style": return reviewStyle(context, usage);
      case "token": {
        const name = (usage.token ?? "").trim();
        if (!name) return unverifiable(usage, "(no token)", "A token observation needs the token name the implementation referenced.");
        return reviewToken(context, usage, name);
      }
      case "component": return reviewComponent(context, usage);
      case "contrast": return reviewContrast(context, usage);
      default: return unverifiable(usage, `kind ${String((usage as DesignUsage).kind)}`, "Monet does not recognise this observation kind.");
    }
  });

  const order: Record<string, number> = { error: 0, warning: 1, info: 2 };
  return {
    theme: resolved.theme ? { id: resolved.theme.id, name: resolved.theme.name, mode: resolved.mode, modes: resolved.modes } : null,
    coverage: {
      submitted: usages.length,
      checked: results.filter((result) => result.outcome === "checked").length,
      unverifiable: results.filter((result) => result.outcome === "unverifiable").length,
      not_applicable: results.filter((result) => result.outcome === "not_applicable").length,
      checks: [...new Set(results.flatMap((result) => result.checks))].sort(),
    },
    scope: SCOPE,
    findings: results.flatMap((result) => result.findings).sort((a, b) => order[a.level]! - order[b.level]!),
    warnings,
  };
}
