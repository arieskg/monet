import type { Candidate, Source, SourceMapping, Status, TaxonomyEntry, ThemeMode, Workspace } from "../shared/model.js";

export type * from "../shared/model.js";
export { THEME_MODES } from "../shared/model.js";
export { normalizeModeValues, resolveThemeTokenSet, resolveTokenSet, tokenSetModes } from "../shared/tokens.js";

export const modeLabels: Record<ThemeMode, string> = { light: "Light", dark: "Dark" };

export const statuses: readonly Status[] = ["undecided", "selected", "needs_review", "experimental", "do_not_use"];
export const statusLabels: Record<Status, string> = { undecided: "Undecided", selected: "Selected", needs_review: "Needs review", experimental: "Experimental", do_not_use: "Do not use" };
export const componentDecisionStatuses = ["selected", "do_not_use"] as const;
export type ComponentDecisionStatus = (typeof componentDecisionStatuses)[number];
export const componentDecisionLabels: Record<ComponentDecisionStatus, string> = { selected: "Use", do_not_use: "No use" };

export function componentDecisionStatus(status: Status): ComponentDecisionStatus | "" {
  return componentDecisionStatuses.includes(status as ComponentDecisionStatus) ? status as ComponentDecisionStatus : "";
}

export function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

export function uniqueSlug(value: string, existingIds: Iterable<string>): string {
  const base = slugify(value);
  if (!base) return "";
  const existing = new Set(existingIds);
  if (!existing.has(base)) return base;
  let suffix = 2;
  while (existing.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

export function markdownExcerpt(value: string): string {
  return value.split("\n").map((line) => line.replace(/^#{1,6}\s+/, "").trim()).find(Boolean) ?? "";
}

export function taxonomyEntries(workspace: Workspace): TaxonomyEntry[] {
  return workspace.taxonomy.flatMap((category) => category.entries);
}

export function primitiveEntries(workspace: Workspace): TaxonomyEntry[] {
  return workspace.primitiveTaxonomy.flatMap((category) => category.entries);
}

export interface SourceMappingReview { source: Source; mapping: SourceMapping; mappingIndex: number }

export function mappingsNeedingReview(workspace: Workspace): SourceMappingReview[] {
  return workspace.sources.flatMap((source) => source.mappings.flatMap((mapping, mappingIndex) => mapping.status === "needs_review" ? [{ source, mapping, mappingIndex }] : []));
}

export function candidatesForComponent(workspace: Workspace, componentId: string, existing: Candidate[] = []): Candidate[] {
  const candidates = existing.filter((candidate) => {
    if (candidate.preview !== "reference") return true;
    const source = workspace.sources.find((item) => item.id === candidate.source);
    if (!source) return true;
    return source.mappings.some((mapping) => mapping.target_type === "component" && mapping.canonical_id === componentId && mapping.upstream === candidate.source_component && (mapping.status === "mapped" || mapping.status === "needs_review"));
  });
  for (const source of workspace.sources) {
    if (!source.enabled) continue;
    for (const mapping of [...source.mappings].sort((a, b) => Number(Boolean(b.primary)) - Number(Boolean(a.primary)))) {
      if (mapping.target_type !== "component" || mapping.canonical_id !== componentId || (mapping.status !== "mapped" && mapping.status !== "needs_review")) continue;
      if (candidates.some((candidate) => candidate.source === source.id && candidate.source_component === mapping.upstream)) continue;
      candidates.push({
        source: source.id,
        source_component: mapping.upstream,
        description: mapping.description ?? `${source.name} provides ${mapping.upstream} as an implementation reference for this concept.`,
        documentation: mapping.documentation || source.homepage || undefined,
        preview: "reference",
      });
    }
  }
  return candidates;
}

/** "3 overrides · 2 dark", so the count a person sees matches the two override maps a theme can carry. */
export function themeOverrideSummary(theme: { overrides: Record<string, unknown>; modes?: Partial<Record<string, Record<string, unknown>>> }): string {
  const general = Object.keys(theme.overrides).length;
  const dark = Object.keys(theme.modes?.dark ?? {}).length;
  return `${general} ${general === 1 ? "override" : "overrides"}${dark ? ` · ${dark} dark` : ""}`;
}

export interface SearchResult { type: string; id: string; title: string; description: string; route: string }
export function searchWorkspace(workspace: Workspace, query: string): SearchResult[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const contains = (...values: (string | string[] | undefined)[]) => values.flatMap((value) => Array.isArray(value) ? value : [value ?? ""]).join(" ").toLowerCase().includes(needle);
  return [
    ...workspace.principles.filter((item) => contains(item.title, item.body)).map((item) => ({ type: "Principle", id: item.id, title: item.title, description: markdownExcerpt(item.body), route: `/principles/${item.id}` })),
    ...workspace.foundations.filter((item) => contains(item.name, item.description, item.tokens.map((token) => token.name))).map((item) => ({ type: "Foundation", id: item.id, title: item.name, description: item.description, route: `/foundations/${item.id}` })),
    ...workspace.resolvedTokens.filter((item) => contains(item.name, item.description, item.alias, String(item.value))).map((item) => ({ type: "Token", id: item.id, title: item.name, description: `${item.type} · ${String(item.resolved_value ?? item.value)}`, route: `/tokens?token=${encodeURIComponent(item.name)}` })),
    ...primitiveEntries(workspace).filter((item) => contains(item.name, item.description, item.aliases, workspace.primitives.find((decision) => decision.id === item.id)?.tokens)).map((item) => ({ type: "Primitive", id: item.id, title: item.name, description: item.description, route: `/primitives/${item.id}` })),
    ...taxonomyEntries(workspace).filter((item) => contains(item.name, item.description, item.aliases)).map((item) => ({ type: "Component", id: item.id, title: item.name, description: item.description, route: `/components/${item.id}` })),
    ...workspace.patterns.filter((item) => contains(item.title, item.summary, item.tags, item.body)).map((item) => ({ type: "Pattern", id: item.id, title: item.title, description: item.summary, route: `/patterns/${item.id}` })),
    ...workspace.themes.filter((item) => contains(item.name, item.id, Object.keys(item.overrides), Object.keys(item.modes?.dark ?? {}))).map((item) => ({ type: "Theme", id: item.id, title: item.name, description: themeOverrideSummary(item), route: "/themes" })),
    ...workspace.sources.filter((item) => contains(item.name, item.notes, item.framework, item.mappings.map((mapping) => mapping.upstream))).map((item) => ({ type: "Source", id: item.id, title: item.name, description: item.notes, route: `/sources/${item.id}` })),
    ...workspace.references.filter((item) => contains(item.title, item.annotation, item.notes, item.source_domain, item.ai_tags, item.ai?.retrieval_text)).map((item) => ({ type: "Reference", id: item.id, title: item.title, description: item.annotation, route: `/references/${item.id}` })),
  ];
}
