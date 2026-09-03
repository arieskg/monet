import type { ResolvedThemeToken, ThemeMode } from "./model.js";

/**
 * Colour measurement and the colour contracts a workspace is held to. `designIntegrity.test.ts`
 * asserts these against the bundled starter workspace and `server/validate.ts` runs them against
 * whichever workspace is active, in every theme and every mode, so the two cannot drift apart.
 */

/** Below this relative luminance a resolved page background reads as a dark surface. */
export const DARK_BACKGROUND_LUMINANCE = 0.4;
/** WCAG 2.1 minimums: normal text, and meaningful non-text boundaries and indicators. */
export const TEXT_MINIMUM = 4.5;
export const NON_TEXT_MINIMUM = 3;
/** Roles Monet derived rather than inherited are held clear of the text floor, so a later tint or state cannot cross it. */
export const DERIVED_TEXT_MINIMUM = 4.75;

/** Relative luminance per WCAG 2.1 of a `#rgb` or `#rrggbb` colour; null for any other value, which cannot be measured. */
export function luminance(value: string): number | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return null;
  const digits = match[1]!;
  const hex = digits.length === 3 ? [...digits].map((digit) => digit + digit).join("") : digits;
  const [r, g, b] = [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.1 contrast ratio between two colours, or null when either cannot be measured. */
export function contrast(a: string, b: string): number | null {
  const first = luminance(a);
  const second = luminance(b);
  if (first === null || second === null) return null;
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

/** Backgrounds a role is documented against, so a contrast claim is checked where the role is actually used. */
export const SURFACES = ["color.surface", "color.surface.hover", "color.surface.pressed", "color.surface.selected"];
const STATUS_ROLES = ["info", "success", "warning", "danger"];
const FILL_ROLES = ["primary", "secondary", "accent", "highlight", ...STATUS_ROLES];
/** Every semantic text role the Color foundation verifies on the default surface. */
export const TEXT_ROLES = ["color.foreground", "color.foreground.muted", "color.link", ...STATUS_ROLES.map((role) => `color.${role}.foreground`), "color.primary.foreground"];
/** Tinted status surfaces and state surfaces that carry ordinary `color.foreground` text. */
export const TINTED_SURFACES = [...STATUS_ROLES.map((role) => `color.${role}.surface`), "color.surface.hover", "color.surface.pressed", "color.surface.selected", "color.surface.disabled"];

/**
 * Identity fills carry fixed hues and sit just above the 4.5:1 floor by design. Every role Monet
 * derived instead of inheriting is held clear of it, so a later tint or state cannot cross the floor.
 */
export const DERIVED_TEXT_ROLES: [role: string, backgrounds: string[]][] = [
  ["color.foreground.muted", SURFACES],
  ["color.primary.foreground", ["color.surface", "color.surface.selected"]],
  ["color.link", ["color.surface"]],
  ["color.info.foreground", ["color.surface"]],
  ["color.warning.foreground", ["color.surface"]],
  ["color.danger.foreground", ["color.surface"]],
  ["color.success.foreground", ["color.surface", "color.success.surface"]],
  ["color.on.warning", ["color.warning"]],
];

export type ContrastKind = "text" | "non-text";
/** One documented pairing: `foreground` must reach `minimum` against `background` in every mode, or only in `modes`. */
export interface ContrastContract { foreground: string; background: string; kind: ContrastKind; minimum: number; modes?: ThemeMode[] }

function text(foreground: string, background: string, minimum = TEXT_MINIMUM, modes?: ThemeMode[]): ContrastContract {
  return { foreground, background, kind: "text", minimum, ...(modes ? { modes } : {}) };
}
function nonText(foreground: string, background: string): ContrastContract {
  return { foreground, background, kind: "non-text", minimum: NON_TEXT_MINIMUM };
}

/** The pairings the Color, Borders, and Interaction foundations document, as the test suite and `validate` both hold them. */
export const CONTRAST_CONTRACTS: readonly ContrastContract[] = [
  // Every fill role pairs with a verified foreground.
  ...FILL_ROLES.map((role) => text(`color.on.${role}`, `color.${role}`)),
  // Body, muted, link, status, and amethyst text are readable on the default surface.
  ...TEXT_ROLES.map((role) => text(role, "color.surface")),
  // Derived roles keep a margin above the floor on the backgrounds they are documented against.
  ...DERIVED_TEXT_ROLES.flatMap(([role, backgrounds]) => backgrounds.map((background) => text(role, background, DERIVED_TEXT_MINIMUM))),
  // Tinted status and state surfaces carry ordinary foreground text.
  ...TINTED_SURFACES.map((background) => text("color.foreground", background)),
  // Selection: amethyst text is covered above; color.primary is the fill and indicator, held to the non-text rule.
  nonText("color.primary", "color.surface.selected"),
  // The resting boundary of an unfilled control, on every surface a control rests on.
  ...SURFACES.map((background) => nonText("color.border.strong", background)),
  // The focus ring against the surface it is drawn on.
  nonText("color.focus", "color.surface"),
  // Status text on its own deep tint: promised only in dark, where the tints are deep enough to carry it.
  ...STATUS_ROLES.map((role) => text(`color.${role}.foreground`, `color.${role}.surface`, DERIVED_TEXT_MINIMUM, ["dark"])),
];

/** The WCAG floor for a pairing kind; a contract's `minimum` is never below it. */
export function contrastFloor(kind: ContrastKind): number {
  return kind === "text" ? TEXT_MINIMUM : NON_TEXT_MINIMUM;
}

/** A pairing that measured below its contract. `ratio < floor` fails WCAG; otherwise it only misses Monet's margin. */
export interface ContrastFailure extends ContrastContract { ratio: number; floor: number }

/**
 * Every documented pairing that a resolved token set fails in a mode. Pairings whose tokens are
 * absent or do not resolve to a measurable colour are skipped: a workspace with a different
 * vocabulary is not wrong, only unmeasured. Where several contracts name the same pairing the
 * strictest applies, so a pair is reported once. A contract limited to a mode holds a pairing that
 * mode actually redefines; when both tokens still carry their light values, the light rules apply.
 */
export function contrastFailures(tokens: readonly ResolvedThemeToken[], mode: ThemeMode): ContrastFailure[] {
  const byName = new Map(tokens.map((token) => [token.name, token]));
  const applicable = new Map<string, ContrastContract>();
  for (const contract of CONTRAST_CONTRACTS) {
    if (contract.modes && !contract.modes.includes(mode)) continue;
    const key = `${contract.foreground} ${contract.background}`;
    const current = applicable.get(key);
    if (!current || contract.minimum > current.minimum) applicable.set(key, contract);
  }
  return [...applicable.values()].flatMap((contract) => {
    const pair = [byName.get(contract.foreground), byName.get(contract.background)];
    if (contract.modes && mode !== "light" && pair.every((token) => token?.source === "base")) return [];
    const ratio = contrast(String(pair[0]?.resolved_value ?? ""), String(pair[1]?.resolved_value ?? ""));
    if (ratio === null || ratio >= contract.minimum) return [];
    return [{ ...contract, ratio, floor: contrastFloor(contract.kind) }];
  });
}
