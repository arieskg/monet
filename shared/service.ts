import type { Component, ContextNotice, DesignContext, DesignContextRequest, DesignReview, DesignReviewRequest, Foundation, MarkdownDocument, ModeVariants, Principle, RankedReference, Reference, ResolvedThemeToken, RetrievalCoverage, RetrievalEntityType, RetrievalProvenance, RetrievalReason, Theme, ThemeMode, Workspace } from "./model.js";
import { retrievalAliases, scoreRetrieval, type RetrievalFields } from "./retrieval.js";
import { resolveThemeTokens } from "./tokens.js";
import { DARK_BACKGROUND_LUMINANCE, luminance } from "./contrast.js";
import { reviewUsages } from "./review.js";

export interface WorkspaceReader {
  loadWorkspace(themeId?: string, mode?: ThemeMode): Promise<Workspace>;
}

export interface MonetService {
  getWorkspace(themeId?: string, mode?: ThemeMode): Promise<Workspace>;
  listFoundations(): Promise<Foundation[]>;
  getFoundation(id: string): Promise<Foundation | null>;
  listPrinciples(): Promise<Principle[]>;
  getPrinciple(id: string): Promise<Principle | null>;
  listPatterns(): Promise<MarkdownDocument[]>;
  getPattern(id: string): Promise<MarkdownDocument | null>;
  listComponents(): Promise<Component[]>;
  getComponent(id: string): Promise<Component | null>;
  listThemes(): Promise<Theme[]>;
  getTheme(id: string): Promise<Theme | null>;
  listReferences(): Promise<Reference[]>;
  getReference(id: string): Promise<Reference | null>;
  searchReferences(query: string): Promise<RankedReference[]>;
  getDesignContext(request?: DesignContextRequest): Promise<DesignContext>;
  /** Checks evidence a caller reports about an implementation against the canonical records. Reads only. */
  reviewDesignUsage(request: DesignReviewRequest): Promise<DesignReview>;
}

function textIncludes(query: string, ...values: unknown[]): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return values.flatMap((value) => Array.isArray(value) ? value : [value]).filter((value): value is string => typeof value === "string").join(" ").toLowerCase().includes(needle);
}

const MIN_RETRIEVAL_SCORE = 58;
/** A match must also stay within reach of the best match of its kind, so weak tails do not ride in behind a strong hit. */
const RELATIVE_RETRIEVAL_FLOOR = 0.62;
const QUERY_LIMITS: Record<RetrievalEntityType, number> = { principle: 8, foundation: 6, pattern: 5, component: 12, reference: 5 };
/**
 * When nothing of a kind rose above weak, the result is a shortlist of candidates rather than an
 * answer, so only the head of it is worth returning. Without this a query Monet does not really
 * understand comes back as a wall of records bunched just above the floor.
 */
const WEAK_MATCH_LIMIT = 3;
/**
 * Expansion is priced by what it costs. Pulling in one workflow document to answer "what is this
 * control part of" is cheap and usually right, so a solid match earns it. Pulling in a component's
 * neighbourhood or a pattern's whole roster adds many records, so those need an unambiguous match.
 */
const REVERSE_PATTERN_STRENGTHS = new Set<RetrievalProvenance["strength"]>(["strong", "medium"]);
const EXPANSION_STRENGTHS = new Set<RetrievalProvenance["strength"]>(["strong"]);
/**
 * Reasons that represent evidence the request produced, as opposed to a consequence of that
 * evidence (`relationship_expansion`, `reverse_pattern_expansion`) or something that ships
 * regardless of the request (`global_guidance`, `full_context`).
 */
const PRIMARY_REASONS = new Set<RetrievalReason>(["explicit_selector", "direct_name_match", "alias_match", "tag_match", "text_match"]);
/** A scoped brief stays a brief. Records are already ordered by provenance, so the tail is the weakest evidence. */
const CONTEXT_LIMITS: Record<"foundation" | "pattern" | "component" | "reference", number> = { foundation: 8, pattern: 4, component: 12, reference: 5 };
const MAX_RELATED_COMPONENTS = 6;
const MAX_RELATED_PER_SOURCE = 3;
const MAX_REVERSE_PATTERNS = 1;
const MAX_PATTERN_COMPONENTS = 10;

interface ScoredRecord<T> { record: T; score: number; reason: RetrievalProvenance["reason"]; strength: RetrievalProvenance["strength"] }

/**
 * A component Monet actually decided is more useful than an undecided taxonomy stub that happens
 * to share a word, so status shifts the score rather than filtering: a stub that genuinely names
 * the concept still ranks, and one that merely shares a category no longer outranks a real record.
 */
function decisionBias(record: { decision?: { status: string } | null }): number {
  const status = record.decision?.status;
  if (status === "selected") return 6;
  if (status === "do_not_use" || status === "needs_review" || status === "experimental") return 0;
  return -12;
}

function rankRecords<T extends { id: string }>(kind: RetrievalEntityType, records: T[], query: string, fields: (record: T) => RetrievalFields, bias: (record: T) => number = () => 0): ScoredRecord<T>[] {
  const scored = records.flatMap((record) => {
    const score = scoreRetrieval(query, fields(record));
    if (!score) return [];
    const adjusted = Math.max(0, Math.min(100, score.score + bias(record)));
    return [{ record, ...score, score: adjusted }];
  }).sort((a, b) => b.score - a.score || a.record.id.localeCompare(b.record.id));
  const best = scored[0]?.score ?? 0;
  const floor = Math.max(MIN_RETRIEVAL_SCORE, best * RELATIVE_RETRIEVAL_FLOOR);
  const limit = scored[0]?.strength === "weak" ? WEAK_MATCH_LIMIT : QUERY_LIMITS[kind];
  return scored.filter((match) => match.score >= floor).slice(0, limit);
}

function provenanceKey(entityType: RetrievalEntityType, id: string): string {
  return `${entityType}:${id}`;
}

const reasonPriority: Record<RetrievalReason, number> = {
  explicit_selector: 9,
  direct_name_match: 8,
  alias_match: 7,
  tag_match: 6,
  text_match: 5,
  reverse_pattern_expansion: 4,
  relationship_expansion: 3,
  global_guidance: 2,
  full_context: 1,
};

function addProvenance(target: Map<string, RetrievalProvenance>, match: RetrievalProvenance): void {
  const key = provenanceKey(match.entity_type, match.entity_id);
  const current = target.get(key);
  if (!current || reasonPriority[match.reason] > reasonPriority[current.reason] || (match.score ?? 0) > (current.score ?? 0)) target.set(key, match);
}

function selectedInRetrievalOrder<T extends { id: string }>(records: T[], selected: Set<string>, entityType: RetrievalEntityType, provenance: Map<string, RetrievalProvenance>): T[] {
  return records.filter((record) => selected.has(record.id)).sort((a, b) => {
    const aMatch = provenance.get(provenanceKey(entityType, a.id));
    const bMatch = provenance.get(provenanceKey(entityType, b.id));
    const aRank = (aMatch ? reasonPriority[aMatch.reason] : 0) * 1_000 + (aMatch?.score ?? 0);
    const bRank = (bMatch ? reasonPriority[bMatch.reason] : 0) * 1_000 + (bMatch?.score ?? 0);
    return bRank - aRank;
  });
}

function relatedMatch(entityType: RetrievalEntityType, entityId: string, reason: "relationship_expansion" | "reverse_pattern_expansion", relatedFrom: string): RetrievalProvenance {
  return { entity_type: entityType, entity_id: entityId, reason, strength: "medium", related_from: relatedFrom };
}

function referenceFields(reference: Reference): RetrievalFields {
  return {
    name: reference.title,
    aliases: [reference.source_domain.replace(/\.[a-z]+$/, "")].filter(Boolean),
    tags: reference.ai_tags,
    summaryText: [reference.annotation, reference.ai?.retrieval_text, reference.ai?.ui_types, reference.ai?.patterns],
    detailText: [reference.notes, reference.ai?.components, reference.ai?.visual_characteristics, reference.ai?.layout],
    weakText: [reference.source_domain, reference.ai?.density, reference.ai?.hierarchy, reference.ai?.typography, reference.ai?.mood],
  };
}

/** Relative luminance of the resolved page background, used only to tell a dark surface from a light one. */
function backgroundLuminance(tokens: ResolvedThemeToken[]): number | null {
  return luminance(String(tokens.find((token) => token.name === "color.background")?.resolved_value ?? ""));
}

/** Whether a task is asking for a dark interface, so the mode can be inferred when the caller did not name one. */
export function queryWantsDarkMode(query: string): boolean {
  const text = ` ${query.toLowerCase()} `;
  return /(dark|night)[ -](mode|theme|ui|palette|scheme|interface|variant)|\bdark[ -]?mode\b/.test(text);
}

/**
 * Capabilities a task can ask for that Monet either has or does not. Detection is by what the
 * resolved workspace actually provides, not by a hardcoded list of things Monet lacks, so the
 * notice disappears on its own once the capability exists: a dark request answered with a
 * genuinely dark palette needs no notice, and one answered with a light palette says so.
 */
function capabilityNotices(query: string, tokens: ResolvedThemeToken[], theme: Theme | null, mode: ThemeMode, modes: ThemeMode[]): ContextNotice[] {
  if (!queryWantsDarkMode(query)) return [];
  const background = backgroundLuminance(tokens);
  if (background !== null && background < DARK_BACKGROUND_LUMINANCE) return [];
  const name = theme?.name ?? "active";
  const reason = mode === "dark"
    ? `The ${name} theme was resolved in dark mode but its color.background is still a light value.`
    : modes.includes("dark")
      ? `The ${name} theme has a dark mode, but this request was resolved in light mode; omit \`mode\` or pass \`mode: "dark"\` to receive the dark values.`
      : `The ${name} theme has no dark mode and resolves to a light palette.`;
  return [{
    kind: "unsupported_capability",
    ids: ["dark-mode"],
    message: `Monet has no dark palette for this request. ${reason} The returned colour tokens are light-mode values and must not be treated as dark-mode guidance.`,
  }];
}

/**
 * Tokens whose resolved value differs between the theme's modes. The active mode's values already
 * sit in `resolvedTokens`; this adds the other modes only where they diverge, so an agent building
 * both appearances gets every value that changes and nothing that does not.
 */
function modeVariants(workspace: Workspace, theme: Theme | null, tokens: ResolvedThemeToken[]): ModeVariants {
  const otherModes = workspace.modes.filter((mode) => mode !== workspace.activeMode);
  if (!otherModes.length) return {};
  const others = otherModes.map((mode) => [mode, new Map(resolveThemeTokens(workspace.foundations, theme, mode).tokens.map((token) => [token.name, token.resolved_value]))] as const);
  const variants: ModeVariants = {};
  for (const token of tokens) {
    const values = others.flatMap(([mode, resolved]) => resolved.has(token.name) && String(resolved.get(token.name)) !== String(token.resolved_value) ? [[mode, resolved.get(token.name) ?? null] as const] : []);
    if (values.length) variants[token.name] = { [workspace.activeMode]: token.resolved_value, ...Object.fromEntries(values) };
  }
  return variants;
}

export function searchReferenceRecords(references: Reference[], query: string): Reference[] {
  return references.filter((reference) => textIncludes(query,
    reference.title, reference.source_domain, reference.annotation, reference.notes,
    reference.ai_tags, reference.ai?.retrieval_text,
  ));
}

export function rankReferenceRecords(references: Reference[], query: string): RankedReference[] {
  return rankRecords("reference", references, query, referenceFields).map(({ record, score, reason, strength }) => ({
    reference: record,
    match: { entity_type: "reference", entity_id: record.id, reason, score, strength },
  }));
}

export function joinComponents(workspace: Pick<Workspace, "taxonomy" | "components">): Component[] {
  const decisions = new Map(workspace.components.map((decision) => [decision.id, decision]));
  return workspace.taxonomy.flatMap((category) => category.entries.map((entry) => ({ ...entry, decision: decisions.get(entry.id) ?? null })));
}

function requestedIds(request: DesignContextRequest): boolean {
  return [request.principleIds, request.foundationIds, request.patternIds, request.componentIds, request.referenceIds].some((ids) => Boolean(ids?.length));
}

/**
 * A pattern's opening paragraphs state what the pattern is for and when not to reach for it,
 * which is the part a task query actually addresses. The rest of the body is applied detail.
 */
/** Preference values name tokens as `token:<name>`; those are machine values, not prose to match on. */
function preferenceProse(value: string): string {
  return value.replace(/token:[A-Za-z0-9][A-Za-z0-9.-]*/g, " ").trim();
}

export function patternIntent(pattern: MarkdownDocument): string {
  return pattern.body.replace(/^#\s+[^\n]+\n+/, "").split(/\n##\s/)[0]?.trim() ?? "";
}

/** The `## Avoid` list every pattern ends with, kept as discrete lines. */
export function patternAvoid(pattern: MarkdownDocument): string[] {
  const section = pattern.body.split(/\n##\s+Avoid\s*\n/)[1];
  return section ? section.split("\n").flatMap((line) => line.startsWith("- ") ? [line.slice(2).trim()] : []) : [];
}

/** Headings of the applied-detail sections, so a compact brief can say what the full record covers. */
export function patternSections(pattern: MarkdownDocument): string[] {
  return [...pattern.body.matchAll(/^##\s+(.+)$/gm)].map((match) => match[1]!.trim()).filter((title) => title !== "Avoid");
}

function missingWarnings(kind: string, requested: string[] | undefined, available: Set<string>): string[] {
  return [...new Set(requested ?? [])].filter((id) => !available.has(id)).map((id) => `Unknown ${kind} id: ${id}`);
}

export function createMonetService(reader: WorkspaceReader): MonetService {
  const read = (themeId?: string, mode?: ThemeMode) => reader.loadWorkspace(themeId, mode);
  return {
    getWorkspace: read,
    async listFoundations() { return (await read()).foundations; },
    async getFoundation(id) { return (await read()).foundations.find((item) => item.id === id) ?? null; },
    async listPrinciples() { return (await read()).principles; },
    async getPrinciple(id) { return (await read()).principles.find((item) => item.id === id) ?? null; },
    async listPatterns() { return (await read()).patterns; },
    async getPattern(id) { return (await read()).patterns.find((item) => item.id === id) ?? null; },
    async listComponents() { return joinComponents(await read()); },
    async getComponent(id) { return joinComponents(await read()).find((item) => item.id === id) ?? null; },
    async listThemes() { return (await read()).themes; },
    async getTheme(id) { return (await read()).themes.find((item) => item.id === id) ?? null; },
    async listReferences() { return (await read()).references; },
    async getReference(id) { return (await read()).references.find((item) => item.id === id) ?? null; },
    async searchReferences(query) { return rankReferenceRecords((await read()).references, query); },
    async reviewDesignUsage(request) {
      const mode = request.mode ?? "light";
      const workspace = await read(request.themeId, mode);
      // A literal that pins a light value only reads as a mistake against another mode, so the
      // light resolution is loaded solely to name that case and is the same list when mode is light.
      const lightTokens = workspace.activeMode === "light" ? workspace.resolvedTokens : (await read(request.themeId, "light")).resolvedTokens;
      const theme = workspace.themes.find((item) => item.id === workspace.activeThemeId) ?? null;
      return reviewUsages(request, {
        theme: theme ? { id: theme.id, name: theme.name } : null,
        tokens: workspace.resolvedTokens, lightTokens,
        components: joinComponents(workspace),
        mode: workspace.activeMode, modes: workspace.modes,
      });
    },
    async getDesignContext(request = {}) {
      const query = request.query?.trim() ?? "";
      // A task that asks for dark mode is answered in dark mode when the theme has one. The caller
      // can always name a mode explicitly; inference only fills the gap when it does not.
      const requestedMode = request.mode ?? (queryWantsDarkMode(query) ? "dark" : "light");
      const workspace = await read(request.themeId, requestedMode);
      const components = joinComponents(workspace);
      const targeted = Boolean(query) || requestedIds(request);
      const principleIds = new Set(targeted ? request.principleIds ?? [] : workspace.principles.map((item) => item.id));
      const foundationIds = new Set(targeted ? request.foundationIds ?? [] : workspace.foundations.map((item) => item.id));
      const patternIds = new Set(targeted ? request.patternIds ?? [] : workspace.patterns.map((item) => item.id));
      const componentIds = new Set(targeted ? request.componentIds ?? [] : components.map((item) => item.id));
      const referenceIds = new Set(targeted ? request.referenceIds ?? [] : workspace.references.map((item) => item.id));
      const provenance = new Map<string, RetrievalProvenance>();
      const explicit = [
        ["principle", request.principleIds], ["foundation", request.foundationIds], ["pattern", request.patternIds],
        ["component", request.componentIds], ["reference", request.referenceIds],
      ] as const;
      for (const [entityType, ids] of explicit) for (const id of ids ?? []) addProvenance(provenance, { entity_type: entityType, entity_id: id, reason: "explicit_selector", strength: "strong" });

      const principleMatches = rankRecords("principle", workspace.principles, query, (item) => ({
        name: item.title, retrievalTerms: retrievalAliases("principle", item.id), summaryText: [item.body.split("\n\n").slice(0, 2)], detailText: [item.body],
      }));
      const foundationMatches = rankRecords("foundation", workspace.foundations, query, (item) => ({
        name: item.name, retrievalTerms: retrievalAliases("foundation", item.id),
        summaryText: [item.description, item.guidance], detailText: [item.rationale, item.notes],
        weakText: [item.tokens.flatMap((token) => [token.name, token.description])],
      }));
      const patternMatches = rankRecords("pattern", workspace.patterns, query, (item) => ({
        name: item.title, retrievalTerms: retrievalAliases("pattern", item.id), tags: item.tags,
        summaryText: [item.summary, patternIntent(item)], detailText: [item.body], weakText: [item.components, item.foundations],
      }));
      const componentMatches = rankRecords("component", components, query, (item) => ({
        name: item.name, aliases: item.aliases, retrievalTerms: retrievalAliases("component", item.id), categories: [item.category],
        // use_when says "this is the control for that job" and leads. avoid_when means the record is
        // about the topic but is arguing against itself for it, so it corroborates rather than leads.
        summaryText: [item.description, item.decision?.use_when],
        detailText: [item.decision?.avoid_when, item.decision?.rationale, item.decision?.notes, Object.values(item.decision?.preferences ?? {}).map(preferenceProse)],
        weakText: [item.relationships, item.decision?.selection?.source, item.decision?.selection?.source_component],
      }), decisionBias);
      const referenceMatches = rankReferenceRecords(workspace.references, query);

      for (const match of principleMatches) {
        principleIds.add(match.record.id);
        addProvenance(provenance, { entity_type: "principle", entity_id: match.record.id, reason: match.reason, score: match.score, strength: match.strength });
      }
      for (const match of foundationMatches) {
        foundationIds.add(match.record.id);
        addProvenance(provenance, { entity_type: "foundation", entity_id: match.record.id, reason: match.reason, score: match.score, strength: match.strength });
      }
      for (const match of patternMatches) {
        patternIds.add(match.record.id);
        addProvenance(provenance, { entity_type: "pattern", entity_id: match.record.id, reason: match.reason, score: match.score, strength: match.strength });
      }
      for (const match of componentMatches) {
        componentIds.add(match.record.id);
        addProvenance(provenance, { entity_type: "component", entity_id: match.record.id, reason: match.reason, score: match.score, strength: match.strength });
      }
      for (const { reference, match } of referenceMatches) {
        referenceIds.add(reference.id);
        addProvenance(provenance, match);
      }

      const directComponentMatches = new Map(componentMatches.filter((match) => match.strength !== "weak").map((match) => [match.record.id, match]));
      for (const id of request.componentIds ?? []) if (components.some((component) => component.id === id)) directComponentMatches.set(id, { record: components.find((component) => component.id === id)!, score: 100, reason: "explicit_selector", strength: "strong" });

      // Expansion is earned, not configured: only a strong or explicitly selected match may pull
      // in records the caller did not name, it goes one hop, and every hop is capped. A component
      // that merely shares a word with the query therefore cannot drag in its whole neighbourhood.
      const componentById = new Map(components.map((component) => [component.id, component]));
      // A pattern's roster names every control its workflow can involve, including concepts Monet
      // has not decided. Those add empty records to a brief, so the roster contributes only decided
      // components; a canonical relationship may still reach an undecided neighbour, because that
      // neighbour is the concept the query found and the undecided notice says so.
      const decided = (id: string) => componentById.get(id)?.decision && componentById.get(id)!.decision!.status !== "undecided";
      const expansionSources = [...directComponentMatches].filter(([, match]) => match.reason === "explicit_selector" || EXPANSION_STRENGTHS.has(match.strength));

      let relationshipAdditions = 0;
      for (const [id, match] of expansionSources) {
        let perSource = 0;
        for (const relatedId of match.record.relationships) {
          if (relationshipAdditions >= MAX_RELATED_COMPONENTS || perSource >= MAX_RELATED_PER_SOURCE) break;
          if (componentIds.has(relatedId) || !componentById.has(relatedId)) continue;
          componentIds.add(relatedId);
          addProvenance(provenance, relatedMatch("component", relatedId, "relationship_expansion", `component:${id}`));
          relationshipAdditions += 1;
          perSource += 1;
        }
      }

      // Reverse pattern lookup answers "which workflow is this control part of", so it runs from
      // the same earned matches and is ordered by how much of the pattern the query already hit.
      const reverseSources = new Map([...directComponentMatches].filter(([, match]) => match.reason === "explicit_selector" || REVERSE_PATTERN_STRENGTHS.has(match.strength)));
      const reverseCandidates = workspace.patterns.flatMap((pattern) => {
        const sources = (pattern.components ?? []).filter((id) => reverseSources.has(id));
        if (!sources.length || patternIds.has(pattern.id)) return [];
        const score = sources.reduce((total, id) => total + (reverseSources.get(id)?.score ?? 0), 0);
        return [{ pattern, sources, score }];
      }).sort((a, b) => b.sources.length - a.sources.length || b.score - a.score || a.pattern.order - b.pattern.order || a.pattern.id.localeCompare(b.pattern.id));
      for (const { pattern, sources } of reverseCandidates.slice(0, MAX_REVERSE_PATTERNS)) {
        patternIds.add(pattern.id);
        addProvenance(provenance, relatedMatch("pattern", pattern.id, "reverse_pattern_expansion", sources.map((id) => `component:${id}`).join(",")));
      }

      // A strongly matched pattern names the controls its workflow is built from, which is usually
      // the answer to "build me an X". Only the single best pattern contributes, and only its
      // decided components, so a query touching several workflows cannot assemble the whole catalog.
      const strongPatterns = patternMatches.filter((match) => EXPANSION_STRENGTHS.has(match.strength)).slice(0, 1);
      let patternComponentAdditions = 0;
      for (const match of strongPatterns) {
        for (const id of match.record.components ?? []) {
          if (patternComponentAdditions >= MAX_PATTERN_COMPONENTS) break;
          if (componentIds.has(id) || !decided(id)) continue;
          componentIds.add(id);
          addProvenance(provenance, relatedMatch("component", id, "relationship_expansion", `pattern:${match.record.id}`));
          patternComponentAdditions += 1;
        }
      }

      // Explicit pattern selectors retain aggregate behavior. Query- and
      // reverse-matched patterns provide their own guidance and Foundation links
      // without importing every generic component they mention.
      //
      // A weak pattern match does not, on the same rule that already governs components: an
      // incidental word overlap with a workflow document is not a reason to answer with the
      // Foundations that workflow depends on, and doing so dressed a shortlist up as an answer.
      const weakPatterns = new Set(patternMatches.filter((match) => match.strength === "weak").map((match) => match.record.id));
      for (const pattern of workspace.patterns) {
        if (!patternIds.has(pattern.id)) continue;
        for (const id of (weakPatterns.has(pattern.id) ? [] : pattern.foundations ?? [])) {
          foundationIds.add(id);
          addProvenance(provenance, relatedMatch("foundation", id, "relationship_expansion", `pattern:${pattern.id}`));
        }
        if (!(request.patternIds ?? []).includes(pattern.id)) continue;
        for (const id of pattern.components ?? []) {
          componentIds.add(id);
          addProvenance(provenance, relatedMatch("component", id, "relationship_expansion", `pattern:${pattern.id}`));
        }
      }
      // A component the query actually found brings the Foundations it depends on. A component that
      // only came along with a pattern does not: its Foundation links are second-order, and letting
      // them through is how a form brief ends up carrying motion and sizing guidance it never uses.
      // Neither does a weak match: an incidental word overlap is not a reason to pull in eight
      // Foundations, and doing so used to dress an accidental hit up as a confident answer.
      const directComponentIds = new Set([
        ...(request.componentIds ?? []),
        ...componentMatches.filter((match) => match.strength !== "weak").map((match) => match.record.id),
      ]);
      for (const component of components) {
        if (!directComponentIds.has(component.id)) continue;
        for (const id of component.decision?.foundations ?? []) {
          foundationIds.add(id);
          addProvenance(provenance, relatedMatch("foundation", id, "relationship_expansion", `component:${component.id}`));
        }
      }
      // Principles are global guidance and always participate in a design context.
      for (const principle of workspace.principles) {
        principleIds.add(principle.id);
        addProvenance(provenance, { entity_type: "principle", entity_id: principle.id, reason: targeted ? "global_guidance" : "full_context", strength: "medium" });
      }
      if (!targeted) {
        for (const [entityType, ids] of [["foundation", foundationIds], ["pattern", patternIds], ["component", componentIds], ["reference", referenceIds]] as const) {
          for (const id of ids) addProvenance(provenance, { entity_type: entityType, entity_id: id, reason: "full_context", strength: "medium" });
        }
      }

      const available = {
        principle: new Set(workspace.principles.map((item) => item.id)),
        foundation: new Set(workspace.foundations.map((item) => item.id)),
        pattern: new Set(workspace.patterns.map((item) => item.id)),
        component: new Set(components.map((item) => item.id)),
        reference: new Set(workspace.references.map((item) => item.id)),
      };
      const warnings = [
        ...missingWarnings("principle", request.principleIds, available.principle),
        ...missingWarnings("foundation", request.foundationIds, available.foundation),
        ...missingWarnings("pattern", request.patternIds, available.pattern),
        ...missingWarnings("component", request.componentIds, available.component),
        ...missingWarnings("reference", request.referenceIds, available.reference),
      ];
      for (const id of foundationIds) if (!available.foundation.has(id)) warnings.push(`Dangling foundation reference: ${id}`);
      for (const id of componentIds) if (!available.component.has(id)) warnings.push(`Dangling component reference: ${id}`);

      // Ordering already puts the best evidence first, so a scoped brief keeps the head of each
      // bucket and drops the tail. An unscoped request is asking for everything and is left whole.
      const bounded = <T extends { id: string }>(records: T[], ids: Set<string>, entityType: "foundation" | "pattern" | "component" | "reference"): T[] => {
        const ordered = selectedInRetrievalOrder(records, ids, entityType, provenance);
        return targeted ? ordered.slice(0, CONTEXT_LIMITS[entityType]) : ordered;
      };
      const foundations = bounded(workspace.foundations, foundationIds, "foundation");
      const selectedPatterns = bounded(workspace.patterns, patternIds, "pattern");
      const selectedComponents = bounded(components, componentIds, "component");
      const selectedReferences = bounded(workspace.references, referenceIds, "reference");
      const theme = workspace.themes.find((item) => item.id === workspace.activeThemeId) ?? null;
      const includedFoundations = new Set(foundations.map((item) => item.id));
      const resolvedTokens = workspace.resolvedTokens.filter((token) => includedFoundations.has(token.foundation));
      // Provenance describes the brief that was returned, so records trimmed from a bucket take
      // their explanation with them rather than pointing at something the caller cannot see.
      const included: Record<RetrievalEntityType, Set<string>> = {
        principle: new Set(selectedInRetrievalOrder(workspace.principles, principleIds, "principle", provenance).map((item) => item.id)),
        foundation: includedFoundations,
        pattern: new Set(selectedPatterns.map((item) => item.id)),
        component: new Set(selectedComponents.map((item) => item.id)),
        reference: new Set(selectedReferences.map((item) => item.id)),
      };

      // Coverage answers one question: did Monet recognise the request. Only evidence that the
      // request itself produced can answer it. Principles ship with every result, and expansions
      // are consequences of a match rather than matches — counting either let a single weak,
      // accidental word overlap present itself as a confident answer.
      const taskMatches = [...provenance.values()].filter((match) => match.entity_type !== "principle"
        && PRIMARY_REASONS.has(match.reason)
        && included[match.entity_type].has(match.entity_id));
      const decisive = taskMatches.some((match) => match.strength !== "weak");
      const coverage: RetrievalCoverage = !taskMatches.length ? "none" : decisive ? "task_specific" : "partial";
      const notices: ContextNotice[] = [];
      if (query && coverage === "none") {
        notices.push({
          kind: "no_opinion", ids: [],
          message: `Monet has no task-specific guidance for "${query}". The principles below are Monet's global guidance and are not an answer to this request; treat this as an unsupported task and prefer a familiar, accessible solution consistent with the rest of the system.`,
        });
      } else if (query && coverage === "partial") {
        notices.push({
          kind: "no_opinion", ids: taskMatches.map((match) => `${match.entity_type}:${match.entity_id}`),
          message: `Monet matched "${query}" only weakly. Confirm the records below are the right ones before relying on them, and surface the choice rather than inventing a standard.`,
        });
      }
      // A concept Monet has catalogued but not decided is a real answer to "does Monet have a
      // view on this" — it just is not guidance, and must not be presented as though it were.
      const undecided = selectedComponents.filter((item) => (item.decision?.status ?? "undecided") === "undecided");
      if (query && undecided.length) {
        const [subject, verb] = undecided.length === 1 ? ["It", "carries"] : ["They", "carry"];
        notices.push({
          kind: "undecided_guidance", ids: undecided.map((item) => item.id),
          message: `Monet has no decision for ${undecided.map((item) => item.name).join(", ")}. ${subject} ${verb} no selection or preferences, so surface the choice instead of inventing a standard.`,
        });
      }
      notices.push(...capabilityNotices(query, resolvedTokens, theme, workspace.activeMode, workspace.modes));

      return {
        query,
        theme,
        mode: workspace.activeMode,
        modes: workspace.modes,
        modeVariants: modeVariants(workspace, theme, resolvedTokens),
        coverage,
        notices,
        principles: selectedInRetrievalOrder(workspace.principles, principleIds, "principle", provenance),
        foundations,
        patterns: selectedPatterns,
        components: selectedComponents,
        references: selectedReferences,
        resolvedTokens,
        tokenIssues: workspace.tokenIssues.filter((issue) => foundations.some((foundation) => foundation.tokens.some((token) => token.name === issue.token))),
        retrieval: [...provenance.values()].filter((match) => included[match.entity_type].has(match.entity_id)),
        warnings: [...new Set(warnings)],
      };
    },
  };
}
