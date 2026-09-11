import { stat } from "node:fs/promises";
import { loadWorkspace } from "./fileStore.js";
import { isBundledWorkspace, resolveWorkspaceRoot, setWorkspaceRoot } from "./workspace.js";
import { preferenceViolations } from "../shared/preferences.js";
import { joinComponents } from "../shared/service.js";
import { resolveThemeTokens, themeModes } from "../shared/tokens.js";
import { contrastFailures, DARK_BACKGROUND_LUMINANCE, luminance, type ContrastFailure } from "../shared/contrast.js";
import { THEME_MODES, type Foundation, type ResolvedThemeToken, type Theme, type ThemeMode, type Workspace } from "../shared/model.js";

/**
 * `monet validate` — the integrity checks a workspace has to pass, in a form a person can read.
 *
 * These are the same invariants the test suite asserts against the bundled workspace, run against
 * whichever workspace is active so someone maintaining their own gets the same guarantees. Errors
 * mean the workspace is inconsistent and tools reading it will misbehave; warnings mean a record is
 * incomplete but usable.
 */

interface Finding { level: "error" | "warning"; check: string; detail: string }

function check(level: Finding["level"], name: string, details: string[]): Finding[] {
  return details.map((detail) => ({ level, check: name, detail }));
}

/** One theme resolved in one mode it supports. */
interface ModeResolution { theme: Theme | null; mode: ThemeMode; tokens: ResolvedThemeToken[]; issues: { token: string; message: string }[] }

/**
 * Where a resolved value came from, named precisely enough to act on. A theme override that
 * applies in every mode is the usual reason a dark resolution fails: it was written before modes
 * existed and pins a light value, and the fix is a `modes.dark` override or dropping it.
 */
function origin(theme: Theme | null, mode: ThemeMode, token: ResolvedThemeToken): string {
  if (token.source === "base") return mode === "light" ? "Profile base value" : `light value; no ${mode} value`;
  const via = (name: string) => name === token.name ? "" : ` via ${name}`;
  return [...new Set(token.override_dependencies.map((name) => {
    if (mode !== "light" && Object.hasOwn(theme?.modes?.[mode] ?? {}, name)) return `${theme?.id ?? "Profile"} ${mode} override${via(name)}`;
    if (Object.hasOwn(theme?.overrides ?? {}, name)) return `${theme?.id ?? "Profile"} override${via(name)}, applied in every mode`;
    return `Foundation ${mode} value${via(name)}`;
  }))].join(", ");
}

/** Why a theme resolves in a mode other than light: the Foundations carry values for it, the theme does, or both. */
function modeOrigin(foundations: Foundation[], theme: Theme | null, mode: ThemeMode): string {
  const fromFoundations = foundations.some((foundation) => foundation.tokens.some((token) => token.modes?.[mode as Exclude<ThemeMode, "light">] !== undefined));
  const fromTheme = Object.keys(theme?.modes?.[mode as Exclude<ThemeMode, "light">] ?? {}).length > 0;
  if (fromFoundations && fromTheme) return `from Foundation ${mode} values and its own ${mode} overrides`;
  return fromFoundations ? `from Foundation ${mode} values` : `only from its own ${mode} overrides`;
}

function describeContrast({ theme, mode, tokens }: ModeResolution, failure: ContrastFailure): string {
  const byName = new Map(tokens.map((token) => [token.name, token]));
  const bound = failure.ratio < failure.floor ? `below the ${failure.floor}:1 ${failure.kind} minimum` : `below Monet's ${failure.minimum}:1 margin for a derived role`;
  const provenance = [failure.foreground, failure.background]
    .map((name) => `${name}: ${String(byName.get(name)?.resolved_value)}, ${origin(theme, mode, byName.get(name)!)}`).join("; ");
  return `${theme?.id ?? "Profile"} (${mode}): ${failure.foreground} on ${failure.background} is ${failure.ratio.toFixed(2)}:1, ${bound} (${provenance})`;
}

export function validateWorkspace(workspace: Workspace): Finding[] {
  const components = joinComponents(workspace);
  const componentIds = new Set(components.map((item) => item.id));
  const foundationIds = new Set(workspace.foundations.map((item) => item.id));
  const primitiveIds = new Set(workspace.primitiveTaxonomy.flatMap((category) => category.entries.map((entry) => entry.id)));
  const tokenNames = new Set(workspace.resolvedTokens.map((token) => token.name));
  // Every theme is resolved in every mode it supports, so a dark value that points at a missing
  // token, or a theme override that only breaks in dark, is caught before an agent reads it.
  const modeResolutions: ModeResolution[] = (workspace.themes.length ? workspace.themes : [null]).flatMap((theme) => themeModes(workspace.foundations, theme).map((mode) => ({ theme, mode, ...resolveThemeTokens(workspace.foundations, theme, mode) })));
  // The colour contracts the Color, Borders, and Interaction foundations document, measured on the
  // resolved values of every theme in every mode. A user's theme override is the usual way to break them.
  const contrast = modeResolutions.flatMap((resolution) => contrastFailures(resolution.tokens, resolution.mode).map((failure) => ({ resolution, failure })));

  return [
    ...check("error", "tokens resolve", [
      ...workspace.tokenIssues.map((issue) => `${issue.token}: ${issue.message}`),
      ...workspace.resolvedTokens.filter((token) => !token.valid).map((token) => `${token.name} does not resolve`),
    ]),
    ...check("error", "tokens resolve in every theme and mode", modeResolutions.flatMap(({ theme, mode, tokens, issues }) => [
      ...issues.map((issue) => `${theme?.id ?? "Profile"} (${mode}): ${issue.token}: ${issue.message}`),
      ...tokens.filter((token) => !token.valid).map((token) => `${theme?.id ?? "Profile"} (${mode}): ${token.name} does not resolve`),
    ])),
    ...check("error", "theme overrides name real tokens", workspace.themes.flatMap((theme) => [
      ...Object.keys(theme.overrides).filter((name) => !tokenNames.has(name)).map((name) => `${theme.id} overrides unknown token "${name}"`),
      ...Object.entries(theme.modes ?? {}).flatMap(([mode, overrides]) => Object.keys(overrides).filter((name) => !tokenNames.has(name)).map((name) => `${theme.id} (${mode}) overrides unknown token "${name}"`)),
    ])),
    ...check("error", "mode values name known modes", workspace.foundations.flatMap((foundation) => foundation.tokens.flatMap((token) =>
      Object.keys(token.modes ?? {}).filter((mode) => mode === "light" || !THEME_MODES.includes(mode as typeof THEME_MODES[number])).map((mode) => `${token.name} defines a value for unknown mode "${mode}"`)))),
    ...check("error", "token names are unique", (() => {
      const names = workspace.foundations.flatMap((foundation) => foundation.tokens.map((token) => token.name));
      return [...new Set(names.filter((name, index) => names.indexOf(name) !== index))].map((name) => `${name} is defined more than once`);
    })()),
    ...check("error", "colour pairings meet their contrast minimum", contrast
      .filter(({ failure }) => failure.ratio < failure.floor)
      .map(({ resolution, failure }) => describeContrast(resolution, failure))),
    ...check("error", "component records reference real concepts", workspace.components
      .filter((item) => !componentIds.has(item.id))
      .map((item) => `decision "${item.id}" has no entry in the component taxonomy`)),
    ...check("error", "component links resolve", workspace.components.flatMap((item) => [
      ...item.foundations.filter((id) => !foundationIds.has(id)).map((id) => `${item.id} links unknown Foundation "${id}"`),
      ...item.primitives.filter((id) => !primitiveIds.has(id)).map((id) => `${item.id} links unknown primitive "${id}"`),
    ])),
    ...check("error", "taxonomy relationships resolve", components.flatMap((item) =>
      item.relationships.filter((id) => !componentIds.has(id)).map((id) => `${item.id} relates to unknown component "${id}"`))),
    ...check("error", "pattern links resolve", workspace.patterns.flatMap((item) => [
      ...(item.components ?? []).filter((id) => !componentIds.has(id)).map((id) => `${item.id} links unknown component "${id}"`),
      ...(item.foundations ?? []).filter((id) => !foundationIds.has(id)).map((id) => `${item.id} links unknown Foundation "${id}"`),
    ])),
    ...check("error", "primitive token references resolve", workspace.primitives.flatMap((item) =>
      item.tokens.filter((name) => !tokenNames.has(name)).map((name) => `${item.id} uses unknown token "${name}"`))),
    ...check("error", "undecided records carry no selection", workspace.components
      .filter((item) => item.status === "undecided" && item.selection)
      .map((item) => `${item.id} is undecided but still names an approved source inspiration`)),
    ...check("error", "preferences follow the compact contract", [
      ...workspace.components.flatMap((item) => preferenceViolations(item.id, item.preferences, tokenNames)),
      ...workspace.primitives.flatMap((item) => preferenceViolations(item.id, item.preferences, tokenNames)),
    ]),
    ...check("warning", "derived colour roles keep their contrast margin", contrast
      .filter(({ failure }) => failure.ratio >= failure.floor)
      .map(({ resolution, failure }) => describeContrast(resolution, failure))),
    ...check("warning", "selected components explain themselves", workspace.components
      .filter((item) => item.status === "selected" && !(item.rationale.trim() && item.notes.trim() && item.use_when.length && item.avoid_when.length))
      .map((item) => `${item.id} is selected but has no rationale, notes, or usage boundaries`)),
    ...check("warning", "patterns carry the links retrieval depends on", workspace.patterns
      .filter((item) => !item.components?.length || !item.foundations?.length)
      .map((item) => `${item.id} has no component or Foundation links`)),
    ...check("warning", "dark mode is actually dark", modeResolutions.flatMap(({ theme, mode, tokens }) => {
      if (mode !== "dark") return [];
      const background = tokens.find((token) => token.name === "color.background");
      if (!background) return [];
      const value = luminance(String(background.resolved_value ?? ""));
      if (value === null || value < DARK_BACKGROUND_LUMINANCE) return [];
      return [`${theme?.id ?? "Profile"} has a dark mode ${modeOrigin(workspace.foundations, theme, mode)}, but color.background resolves to ${String(background.resolved_value)}, which is not dark (${origin(theme, mode, background)})`];
    })),
  ];
}

export function formatReport(root: string, workspace: Workspace, findings: Finding[]): string {
  const errors = findings.filter((finding) => finding.level === "error");
  const warnings = findings.filter((finding) => finding.level === "warning");
  const counts = [
    `${workspace.principles.length} principles`, `${workspace.foundations.length} foundations`,
    `${workspace.resolvedTokens.length} tokens`, `${workspace.themes.length} theme${workspace.themes.length === 1 ? "" : "s"} (${workspace.modes.join(", ")})`, `${workspace.patterns.length} patterns`,
    `${workspace.components.length} component decisions`, `${workspace.references.length} references`,
  ].join(", ");
  const lines = [
    `Workspace: ${root}${isBundledWorkspace(root) ? " (bundled starter workspace)" : ""}`,
    `Contents:  ${counts}`,
    "",
  ];
  for (const [heading, group] of [["Errors", errors], ["Warnings", warnings]] as const) {
    if (!group.length) continue;
    lines.push(`${heading} (${group.length}):`);
    for (const finding of group) lines.push(`  ${finding.check}: ${finding.detail}`);
    lines.push("");
  }
  lines.push(errors.length
    ? `FAIL — ${errors.length} error${errors.length === 1 ? "" : "s"}${warnings.length ? `, ${warnings.length} warning${warnings.length === 1 ? "" : "s"}` : ""}.`
    : warnings.length ? `OK with ${warnings.length} warning${warnings.length === 1 ? "" : "s"}.` : "OK — workspace is consistent.");
  return lines.join("\n");
}

/** A workspace with no records at all is new, not broken — but a missing directory is usually a typo. */
export function isEmptyWorkspace(workspace: Workspace): boolean {
  return !workspace.principles.length && !workspace.foundations.length && !workspace.patterns.length
    && !workspace.components.length && !workspace.taxonomy.length && !workspace.references.length;
}

export async function runValidate(): Promise<number> {
  const root = resolveWorkspaceRoot();
  setWorkspaceRoot(root);

  // An absent record set reads as empty, so the one thing worth checking up front is whether the
  // caller pointed at a directory at all. A mistyped path would otherwise look like a new workspace.
  const exists = await stat(root).then((entry) => entry.isDirectory(), () => false);
  if (!exists) {
    console.error(`No directory at ${root}.`);
    console.error("Create it, or set MONET_ROOT / pass --root <path> to point at a workspace directory.");
    return 1;
  }

  let workspace: Workspace;
  try {
    workspace = await loadWorkspace();
  } catch (error) {
    console.error(`Could not read the Monet workspace at ${root}.`);
    console.error(`  ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }

  const findings = validateWorkspace(workspace);
  console.log(formatReport(root, workspace, findings));
  if (isEmptyWorkspace(workspace)) {
    console.log("");
    console.log("This workspace has no records yet. Run the UI against it to start one, or copy the");
    console.log("bundled starter workspace: cp -r monet /path/to/your-design-system");
  }
  return findings.some((finding) => finding.level === "error") ? 1 : 0;
}
