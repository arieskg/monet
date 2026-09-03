import { THEME_MODES, type Foundation, type ResolvedThemeToken, type ResolvedToken, type Theme, type ThemeMode, type ThemeOverrides, type Token, type TokenIssue, type TokenLevel, type TokenModeValues, type TokenType } from "./model.js";

const TYPES: TokenType[] = ["color", "dimension", "number", "font-family", "font-size", "font-weight", "duration", "cubic-bezier", "shadow", "border", "breakpoint", "z-index"];
const LEVELS: TokenLevel[] = ["primitive", "semantic", "component"];

function legacyName(foundation: string, key: string): string {
  if (foundation === "spacing") return `space.${key}`;
  if (foundation === "borders") return `border.${key}`;
  if (foundation === "elevation") return `shadow.${key}`;
  if (foundation === "layering") return `z.${key}`;
  if (foundation === "typography" && key.startsWith("font-")) return `font.family.${key.slice(5)}`;
  if (foundation === "typography" && key.startsWith("size-")) return `font.size.${key.slice(5)}`;
  return `${foundation}.${key}`;
}

function inferredType(foundation: string, name: string): TokenType {
  if (foundation === "color") return "color";
  if (["spacing", "sizing", "radius"].includes(foundation)) return "dimension";
  if (foundation === "typography" && name.includes("family")) return "font-family";
  if (foundation === "typography" && name.includes("size")) return "font-size";
  if (foundation === "typography" && name.includes("weight")) return "font-weight";
  if (foundation === "elevation") return "shadow";
  if (foundation === "borders") return "border";
  if (foundation === "opacity") return "number";
  if (foundation === "motion" && name.includes("ease")) return "cubic-bezier";
  if (foundation === "motion") return "duration";
  if (foundation === "breakpoints") return "breakpoint";
  if (foundation === "layering") return "z-index";
  return "dimension";
}

/** Mode values a token record carries. Light is the baseline and is never stored as a mode; unknown modes are dropped. */
export function normalizeModeValues(value: unknown): TokenModeValues | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter((entry): entry is [Exclude<ThemeMode, "light">, string | number] => entry[0] !== "light" && THEME_MODES.includes(entry[0] as ThemeMode) && (typeof entry[1] === "string" || typeof entry[1] === "number"));
  return entries.length ? Object.fromEntries(entries) : undefined;
}

export function normalizeTokens(foundationId: string, value: unknown): Token[] {
  if (Array.isArray(value)) return value.map((item, index) => {
    const token = item as Partial<Token>;
    const name = typeof token.name === "string" && token.name ? token.name : `${foundationId}.token-${index + 1}`;
    const modes = normalizeModeValues(token.modes);
    return {
      id: typeof token.id === "string" && token.id ? token.id : name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase(),
      name, foundation: foundationId,
      type: TYPES.includes(token.type as TokenType) ? token.type as TokenType : inferredType(foundationId, name),
      level: LEVELS.includes(token.level as TokenLevel) ? token.level as TokenLevel : "primitive",
      value: typeof token.value === "number" || typeof token.value === "string" ? token.value : "",
      description: typeof token.description === "string" ? token.description : "",
      ...(typeof token.alias === "string" && token.alias ? { alias: token.alias } : {}),
      order: typeof token.order === "number" ? token.order : index,
      ...(modes ? { modes } : {}),
    };
  }).sort((a, b) => a.order - b.order);
  if (value && typeof value === "object") return Object.entries(value as Record<string, unknown>).map(([key, raw], index) => {
    const name = legacyName(foundationId, key);
    return { id: name.replace(/[^a-z0-9]+/gi, "-").toLowerCase(), name, foundation: foundationId, type: inferredType(foundationId, name), level: "primitive", value: typeof raw === "number" || typeof raw === "string" ? raw : "", description: "", order: index };
  });
  return [];
}

export function normalizeFoundation(value: Foundation): Foundation {
  return { ...value, tokens: normalizeTokens(value.id, value.tokens) };
}

export function resolveTokens(foundations: Foundation[]): { tokens: ResolvedToken[]; issues: TokenIssue[] } {
  const all = foundations.flatMap((foundation) => foundation.tokens);
  const byName = new Map(all.map((token) => [token.name, token]));
  const issues: TokenIssue[] = [];
  const cache = new Map<string, string | number | null>();
  const resolving = new Set<string>();
  const resolve = (name: string): string | number | null => {
    if (cache.has(name)) return cache.get(name) ?? null;
    const token = byName.get(name);
    if (!token) return null;
    if (resolving.has(name)) { issues.push({ token: name, type: "circular_reference", message: `${name} participates in a circular reference.` }); cache.set(name, null); return null; }
    resolving.add(name);
    if (typeof token.value === "number") { resolving.delete(name); cache.set(name, token.value); return token.value; }
    let broken = false;
    const resolved = token.value.replace(/\{([^}]+)\}/g, (_match, reference: string) => {
      if (!byName.has(reference)) { broken = true; issues.push({ token: name, type: "broken_reference", message: `${name} references undefined token ${reference}.` }); return `{${reference}}`; }
      const value = resolve(reference);
      if (value === null) { broken = true; return `{${reference}}`; }
      return String(value);
    });
    resolving.delete(name);
    const result = broken ? null : resolved;
    cache.set(name, result);
    return result;
  };
  const tokens = all.map((token) => { const resolved_value = resolve(token.name); return { ...token, resolved_value, valid: resolved_value !== null }; });
  return { tokens, issues: issues.filter((issue, index) => issues.findIndex((other) => other.token === issue.token && other.type === issue.type && other.message === issue.message) === index) };
}

/** The theme override that applies to a token in a mode, if any: a mode-specific override wins over the theme's general one. */
function themeOverrideFor(theme: Theme | null, mode: ThemeMode, name: string): string | number | undefined {
  const modeOverrides: ThemeOverrides | undefined = mode === "light" ? undefined : theme?.modes?.[mode];
  if (modeOverrides && Object.prototype.hasOwnProperty.call(modeOverrides, name)) return modeOverrides[name];
  const overrides = theme?.overrides ?? {};
  if (Object.prototype.hasOwnProperty.call(overrides, name)) return overrides[name];
  return undefined;
}

/** The Foundation's own value for a token in a mode: its dark value when it has one, otherwise its light value. */
function modeValueFor(token: Token, mode: ThemeMode): string | number {
  if (mode === "light") return token.value;
  const value = token.modes?.[mode];
  return value === undefined ? token.value : value;
}

/**
 * Modes a theme can be resolved in. Light is always available because every token value is a light
 * value. Dark exists once any Foundation token or the theme itself supplies a dark value, so a
 * workspace never has to declare the capability separately from the decisions that make it real.
 */
export function themeModes(foundations: Foundation[], theme: Theme | null): ThemeMode[] {
  return THEME_MODES.filter((mode) => mode === "light"
    || foundations.some((foundation) => foundation.tokens.some((token) => token.modes?.[mode] !== undefined))
    || Object.keys(theme?.modes?.[mode] ?? {}).length > 0);
}

/**
 * Resolves every token for one theme in one mode. Precedence per token, highest first: the theme's
 * mode-specific override, the theme's general override, the Foundation's mode value, the
 * Foundation's light value. Aliases are resolved again over the layered values, so a semantic role
 * that points at a primitive follows the primitive into the mode. Provenance records which of
 * those layers actually changed each resolved value and through which tokens.
 */
export function resolveThemeTokens(foundations: Foundation[], theme: Theme | null, mode: ThemeMode = "light"): { tokens: ResolvedThemeToken[]; issues: TokenIssue[] } {
  const base = resolveTokens(foundations);
  const layered = new Map<string, "theme" | "mode">();
  const themedFoundations = foundations.map((foundation) => ({
    ...foundation,
    tokens: foundation.tokens.map((token) => {
      const override = themeOverrideFor(theme, mode, token.name);
      if (override !== undefined) { layered.set(token.name, "theme"); return { ...token, value: override }; }
      const modeValue = modeValueFor(token, mode);
      if (mode !== "light" && token.modes?.[mode] !== undefined) layered.set(token.name, "mode");
      return { ...token, value: modeValue };
    }),
  }));
  const resolved = resolveTokens(themedFoundations);
  const themedByName = new Map(themedFoundations.flatMap((foundation) => foundation.tokens).map((token) => [token.name, token]));
  const dependencyCache = new Map<string, string[]>();
  const dependencies = (name: string, visiting = new Set<string>()): string[] => {
    if (dependencyCache.has(name)) return dependencyCache.get(name)!;
    if (visiting.has(name)) return [];
    if (layered.has(name)) return [name];
    const token = themedByName.get(name);
    if (!token || typeof token.value !== "string") return [];
    const nextVisiting = new Set(visiting).add(name);
    const result = [...new Set([...token.value.matchAll(/\{([^}]+)\}/g)].flatMap((match) => dependencies(match[1] ?? "", nextVisiting)))];
    dependencyCache.set(name, result);
    return result;
  };
  const baseByName = new Map(base.tokens.map((token) => [token.name, token]));
  return {
    tokens: resolved.tokens.map((token) => {
      const overrideDependencies = dependencies(token.name);
      const source = overrideDependencies.some((name) => layered.get(name) === "theme") ? "theme" : overrideDependencies.length ? "mode" : "base";
      return {
        ...token,
        base_resolved_value: baseByName.get(token.name)?.resolved_value ?? null,
        source,
        theme_id: source === "theme" ? theme?.id ?? null : null,
        mode,
        override_dependencies: overrideDependencies,
      };
    }),
    issues: resolved.issues,
  };
}

/** Resolve a flat token list, retained for the browser editor API. */
export function resolveTokenSet(tokens: Token[]): { tokens: ResolvedToken[]; issues: TokenIssue[] } {
  const foundationIds = [...new Set(tokens.map((token) => token.foundation))];
  return resolveTokens(foundationIds.map((id) => ({ id, name: id, status: "selected", description: "", rationale: "", guidance: "", notes: "", order: 0, tokens: tokens.filter((token) => token.foundation === id), updated_at: "" })));
}

/** Resolve a flat base token list, retained for the browser theme editor API. */
export function resolveThemeTokenSet(baseTokens: Token[], theme: Theme | null, mode: ThemeMode = "light"): { tokens: ResolvedThemeToken[]; issues: TokenIssue[] } {
  return resolveThemeTokens(tokenFoundations(baseTokens), theme, mode);
}

/** Modes available to a flat token list and theme, for the browser, which holds tokens rather than Foundation records. */
export function tokenSetModes(baseTokens: Token[], theme: Theme | null): ThemeMode[] {
  return themeModes(tokenFoundations(baseTokens), theme);
}

function tokenFoundations(tokens: Token[]): Foundation[] {
  const foundationIds = [...new Set(tokens.map((token) => token.foundation))];
  return foundationIds.map((id) => ({ id, name: id, status: "selected" as const, description: "", rationale: "", guidance: "", notes: "", order: 0, tokens: tokens.filter((token) => token.foundation === id), updated_at: "" }));
}
