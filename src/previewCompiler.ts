import type { ComponentDecision, ResolvedThemeToken, ThemeMode, Workspace } from "./domain";

export interface PreviewTokenSample {
  name: string;
  value: string | number;
  description: string;
  source: "base" | "mode" | "theme" | "default";
}

export interface PreviewComponentDecision {
  id: string;
  name: string;
  status: ComponentDecision["status"];
  sourceId: string | null;
  sourceName: string | null;
  sourceComponent: string | null;
  preferences: Record<string, string>;
  usesDefault: boolean;
}

export interface CompiledPreview {
  theme: { id: string; name: string };
  /** The mode the variables were resolved in, and every mode the theme can be resolved in. */
  mode: ThemeMode;
  modes: ThemeMode[];
  cssVariables: Record<string, string | number>;
  colors: PreviewTokenSample[];
  typography: PreviewTokenSample[];
  spacing: PreviewTokenSample[];
  radii: PreviewTokenSample[];
  borders: PreviewTokenSample[];
  shadows: PreviewTokenSample[];
  components: Record<string, PreviewComponentDecision>;
  activeFoundationIds: string[];
  activePatternIds: string[];
  activePrimitiveIds: string[];
  fallbackTokenNames: string[];
}

export const previewDefaults = {
  "color.background": "#ecf0f1",
  "color.surface": "#ffffff",
  "color.surface.subtle": "#ecf0f1",
  "color.foreground": "#2c3e50",
  "color.foreground.muted": "#5f605a",
  "color.foreground.inverse": "#ffffff",
  "color.foreground.disabled": "#9d9e98",
  "color.border": "#d8d7d0",
  "color.border.strong": "#5f605a",
  "color.surface.hover": "#f6f8f8",
  "color.surface.pressed": "#e4e6e4",
  "color.surface.selected": "#f3ebf6",
  "color.surface.disabled": "#ecf0f1",
  "color.primary": "#9b59b6",
  "color.primary.foreground": "#884ea0",
  "color.on.primary": "#ffffff",
  "color.secondary": "#1abc9c",
  "color.link": "#26709f",
  "color.info": "#26709f",
  "color.info.foreground": "#26709f",
  "color.info.surface": "#e7f3fb",
  "color.on.info": "#ffffff",
  "color.success": "#1abc9c",
  "color.success.foreground": "#0f715d",
  "color.success.surface": "#e4f7f3",
  "color.on.success": "#2c3e50",
  "color.warning": "#946118",
  "color.warning.foreground": "#946118",
  "color.warning.surface": "#f6efe4",
  "color.on.warning": "#ffffff",
  "color.danger": "#d0311e",
  "color.danger.foreground": "#d0311e",
  "color.danger.surface": "#f9e6e4",
  "color.on.danger": "#ffffff",
  "color.focus": "#9b59b6",
  "font.family.sans": '"Mona Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  "font.family.mono": 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", monospace',
  "font.size.xs": "12px",
  "font.size.sm": "14px",
  "font.size.md": "16px",
  "font.size.lg": "20px",
  "font.size.xl": "24px",
  "font.size.2xl": "32px",
  "font.weight.regular": 400,
  "font.weight.medium": 500,
  "font.weight.semibold": 600,
  "line.height.compact": 1.4,
  "line.height.body": 1.5,
  "line.height.heading": 1.3,
  "space.1": "4px",
  "space.2": "8px",
  "space.3": "12px",
  "space.4": "16px",
  "space.5": "20px",
  "space.6": "24px",
  "space.8": "32px",
  "radius.sm": "4px",
  "radius.md": "7px",
  "radius.lg": "12px",
  "radius.full": "9999px",
  "border.default": "1px solid #d8d7d0",
  "border.strong": "1px solid #5f605a",
  "border.focus": "2px solid #9b59b6",
  "shadow.raised": "0 1px 2px rgb(44 62 80 / 0.08), 0 2px 6px rgb(44 62 80 / 0.06)",
  "shadow.overlay": "0 4px 12px rgb(44 62 80 / 0.10), 0 12px 28px rgb(44 62 80 / 0.12)",
  "shadow.dialog": "0 8px 24px rgb(44 62 80 / 0.14), 0 24px 64px rgb(44 62 80 / 0.18)",
  "opacity.disabled": 0.5,
  "opacity.scrim": 0.4,
  "size.control.sm": "32px",
  "size.control.md": "40px",
} as const;

type DefaultTokenName = keyof typeof previewDefaults;

const requiredComponentIds = [
  "button", "text-input", "search-input", "checkbox", "radio", "link", "badge", "tag", "card", "tabs", "navigation-menu", "table", "data-table", "status-indicator", "pagination", "alert", "toast", "dialog", "popover",
] as const;

function resolvedSample(token: ResolvedThemeToken): PreviewTokenSample | null {
  if (!token.valid || token.resolved_value === null) return null;
  return { name: token.name, value: token.resolved_value, description: token.description, source: token.source };
}

function samples(workspace: Workspace, foundation: string, predicate: (token: ResolvedThemeToken) => boolean = () => true): PreviewTokenSample[] {
  return workspace.resolvedTokens
    .filter((token) => token.foundation === foundation && predicate(token))
    .map(resolvedSample)
    .filter((token): token is PreviewTokenSample => token !== null);
}

function compileComponent(workspace: Workspace, id: string): PreviewComponentDecision {
  const entry = workspace.taxonomy.flatMap((category) => category.entries).find((item) => item.id === id);
  const decision = workspace.components.find((item) => item.id === id);
  const source = workspace.sources.find((item) => item.id === decision?.selection?.source);
  return {
    id,
    name: entry?.name ?? id,
    status: decision?.status ?? "undecided",
    sourceId: decision?.selection?.source ?? null,
    sourceName: source?.name ?? decision?.selection?.source ?? null,
    sourceComponent: decision?.selection?.source_component ?? null,
    preferences: decision?.preferences ?? {},
    usesDefault: decision?.status !== "selected",
  };
}

export function compilePreview(workspace: Workspace): CompiledPreview {
  const byName = new Map(workspace.resolvedTokens.map((token) => [token.name, token]));
  const fallbackTokenNames: string[] = [];
  const value = <Name extends DefaultTokenName>(name: Name): (typeof previewDefaults)[Name] | string | number => {
    const token = byName.get(name);
    if (token?.valid && token.resolved_value !== null) return token.resolved_value;
    fallbackTokenNames.push(name);
    return previewDefaults[name];
  };

  const background = value("color.background");
  const surface = value("color.surface");
  const subtle = value("color.surface.subtle");
  const foreground = value("color.foreground");
  const muted = value("color.foreground.muted");
  const border = value("color.border");
  const primary = value("color.primary");
  const secondary = value("color.secondary");
  const danger = value("color.danger");
  const warning = value("color.warning");
  const radiusMedium = value("radius.md");
  const scrimOpacity = Number(value("opacity.scrim"));

  const cssVariables: Record<string, string | number> = {
    "--pv-background": background,
    "--pv-surface": surface,
    "--pv-surface-subtle": subtle,
    "--pv-foreground": foreground,
    "--pv-muted": muted,
    "--pv-inverse": value("color.foreground.inverse"),
    "--pv-disabled": value("color.foreground.disabled"),
    "--pv-border": border,
    "--pv-border-strong": value("color.border.strong"),
    "--pv-surface-hover": value("color.surface.hover"),
    "--pv-surface-pressed": value("color.surface.pressed"),
    "--pv-surface-selected": value("color.surface.selected"),
    "--pv-surface-disabled": value("color.surface.disabled"),
    "--pv-primary": primary,
    "--pv-primary-fg": value("color.primary.foreground"),
    "--pv-on-primary": value("color.on.primary"),
    "--pv-primary-soft": value("color.surface.selected"),
    "--pv-focus": value("color.focus"),
    "--pv-secondary": secondary,
    "--pv-link": value("color.link"),
    "--pv-info": value("color.info"),
    "--pv-info-fg": value("color.info.foreground"),
    "--pv-info-surface": value("color.info.surface"),
    "--pv-on-info": value("color.on.info"),
    "--pv-success": value("color.success"),
    "--pv-success-fg": value("color.success.foreground"),
    "--pv-success-surface": value("color.success.surface"),
    "--pv-on-success": value("color.on.success"),
    "--pv-warning": warning,
    "--pv-warning-fg": value("color.warning.foreground"),
    "--pv-warning-surface": value("color.warning.surface"),
    "--pv-on-warning": value("color.on.warning"),
    "--pv-danger": danger,
    "--pv-danger-fg": value("color.danger.foreground"),
    "--pv-danger-surface": value("color.danger.surface"),
    "--pv-on-danger": value("color.on.danger"),
    "--pv-font-sans": value("font.family.sans"),
    "--pv-font-mono": value("font.family.mono"),
    "--pv-font-xs": value("font.size.xs"),
    "--pv-font-sm": value("font.size.sm"),
    "--pv-font-md": value("font.size.md"),
    "--pv-font-lg": value("font.size.lg"),
    "--pv-font-xl": value("font.size.xl"),
    "--pv-font-2xl": value("font.size.2xl"),
    "--pv-weight-regular": value("font.weight.regular"),
    "--pv-weight-medium": value("font.weight.medium"),
    "--pv-weight-semibold": value("font.weight.semibold"),
    "--pv-leading-compact": value("line.height.compact"),
    "--pv-leading-body": value("line.height.body"),
    "--pv-leading-heading": value("line.height.heading"),
    "--pv-space-1": value("space.1"),
    "--pv-space-2": value("space.2"),
    "--pv-space-3": value("space.3"),
    "--pv-space-4": value("space.4"),
    "--pv-space-5": value("space.5"),
    "--pv-space-6": value("space.6"),
    "--pv-space-8": value("space.8"),
    "--pv-radius-sm": value("radius.sm"),
    "--pv-radius-md": radiusMedium,
    "--pv-radius-lg": value("radius.lg"),
    "--pv-radius-full": value("radius.full"),
    "--pv-border-default": value("border.default"),
    "--pv-border-strong-rule": value("border.strong"),
    "--pv-border-focus": value("border.focus"),
    "--pv-shadow-raised": value("shadow.raised"),
    "--pv-shadow-overlay": value("shadow.overlay"),
    "--pv-shadow-dialog": value("shadow.dialog"),
    "--pv-opacity-disabled": value("opacity.disabled"),
    "--pv-backdrop": `color-mix(in srgb, ${foreground} ${scrimOpacity * 100}%, transparent)`,
    "--pv-control-sm": value("size.control.sm"),
    "--pv-control-md": value("size.control.md"),
    // Existing local component adapters consume these aliases. Keeping them scoped
    // makes their anatomy reusable without allowing source profiles to replace Monet.
    "--canvas": background,
    "--surface": surface,
    "--surface-muted": subtle,
    "--ink": foreground,
    "--muted": muted,
    "--faint": muted,
    "--line": border,
    "--line-soft": subtle,
    "--accent": primary,
    "--accent-dark": primary,
    "--accent-soft": value("color.surface.selected"),
    "--secondary": secondary,
    "--info": value("color.info"),
    "--danger": danger,
    "--amber": warning,
    "--radius-sm": value("radius.sm"),
    "--radius-md": radiusMedium,
    "--radius-lg": value("radius.lg"),
    "--radius-full": value("radius.full"),
  };

  const activeTheme = workspace.themes.find((theme) => theme.id === workspace.activeThemeId)
    ?? workspace.themes.find((theme) => theme.id === workspace.defaultThemeId);
  const components = Object.fromEntries(requiredComponentIds.map((id) => [id, compileComponent(workspace, id)]));
  const withDefaults = (items: PreviewTokenSample[], names: DefaultTokenName[]): PreviewTokenSample[] => {
    const existing = new Set(items.map((item) => item.name));
    return [...items, ...names.filter((name) => !existing.has(name)).map((name) => ({ name, value: value(name), description: "Base Monet fallback.", source: "default" as const }))];
  };

  return {
    theme: { id: activeTheme?.id ?? workspace.activeThemeId, name: activeTheme?.name ?? "Base Monet" },
    mode: workspace.activeMode,
    modes: workspace.modes,
    cssVariables,
    colors: withDefaults(samples(workspace, "color", (token) => token.level === "semantic"), ["color.background", "color.surface", "color.surface.subtle", "color.foreground", "color.foreground.muted", "color.primary", "color.secondary", "color.link", "color.success", "color.warning", "color.danger"]),
    typography: samples(workspace, "typography", (token) => token.level === "semantic" && (token.type === "font-size" || token.type === "font-weight")),
    spacing: withDefaults(samples(workspace, "spacing", (token) => token.level === "primitive" && token.name !== "space.0"), ["space.1", "space.2", "space.3", "space.4", "space.5", "space.6", "space.8"]),
    radii: withDefaults(samples(workspace, "radius", (token) => token.level === "primitive"), ["radius.sm", "radius.md", "radius.lg", "radius.full"]),
    borders: withDefaults(samples(workspace, "borders"), ["border.default", "border.strong"]),
    shadows: withDefaults(samples(workspace, "elevation"), ["shadow.raised", "shadow.overlay"]),
    components,
    activeFoundationIds: workspace.foundations.filter((item) => item.status === "selected" || item.status === "experimental").map((item) => item.id),
    activePatternIds: workspace.patterns.filter((item) => item.status === "selected" || item.status === "experimental").map((item) => item.id),
    activePrimitiveIds: workspace.primitives.filter((item) => item.status === "selected" || item.status === "experimental").map((item) => item.id),
    fallbackTokenNames: [...new Set(fallbackTokenNames)],
  };
}
