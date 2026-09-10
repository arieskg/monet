import type { Component, ContextNotice, DesignContext, MarkdownDocument, ModeVariants, Principle, ResolvedThemeToken, RetrievalCoverage, RetrievalProvenance, Status, ThemeMode } from "./model.js";
import { patternAvoid, patternIntent, patternSections } from "./service.js";

/**
 * A compact design brief: the decisions an agent needs to build the thing, with a resource URI on
 * every record so the full text is one fetch away. It is a projection of the same retrieval result
 * the full context returns — nothing is retrieved differently, only serialized differently.
 *
 * Three rules keep it honest. Guidance an agent acts on is never truncated mid-thought: a record
 * either carries a field whole or points at the resource that has it. Nothing is repeated across
 * entities, so Foundation guidance lives on the Foundation and components link to it by id. And
 * editor-only material — candidates, decision history, token record metadata, file paths — never
 * appears at all.
 */

/** Monet's own resource addressing, shared by the compact brief and the MCP resource templates. */
export const RESOURCE_SCHEME = "monet";

export function resourceUri(kind: "principles" | "foundations" | "patterns" | "components" | "references" | "themes", id: string): string {
  return `${RESOURCE_SCHEME}://${kind}/${id}`;
}

export interface CompactPrinciple { id: string; title: string; decision: string; avoid: string[]; uri: string }
export interface CompactFoundation { id: string; name: string; status: Status; description: string; guidance: string; uri: string }
export interface CompactPattern { id: string; title: string; summary: string; intent: string; avoid: string[]; covers: string[]; components: string[]; uri: string }
export interface CompactComponent {
  id: string; name: string; category: string; status: Status; description: string;
  preferences?: Record<string, string>; behavior?: Record<string, boolean>;
  rationale?: string; notes?: string; use_when?: string[]; avoid_when?: string[];
  source_inspiration?: string; foundations?: string[]; related?: string[]; uri: string;
}
export interface CompactReference { id: string; title: string; source: string; annotation: string; summary: string; tags: string[]; uri: string }

export interface CompactDesignContext {
  profile?: { id: string; name: string }; knowledgeFingerprint?: string;
  query: string;
  coverage: RetrievalCoverage;
  notices: ContextNotice[];
  /** The theme and the mode the `tokens` were resolved in, plus every mode the theme supports. */
  theme: { id: string; name: string; mode: ThemeMode; modes: ThemeMode[] } | null;
  principles: CompactPrinciple[];
  foundations: CompactFoundation[];
  patterns: CompactPattern[];
  components: CompactComponent[];
  references: CompactReference[];
  /** Resolved `name = value` pairs for the Foundations in this brief. */
  tokens: Record<string, string | number>;
  /** Only tokens whose active-theme value differs from Base Monet, so provenance costs nothing elsewhere. */
  theme_overrides?: Record<string, { base: string | number | null; theme: string | number | null }>;
  /** Only tokens whose value differs between modes, with the value in each mode, so a light brief carries its dark counterparts and vice versa. */
  mode_values?: ModeVariants;
  token_issues?: string[];
  retrieval: RetrievalProvenance[];
  warnings: string[];
}

/** First paragraph after the `# Title` heading: the rule itself, before its justification. */
function leadParagraph(body: string): string {
  return body.replace(/^#\s+[^\n]+\n+/, "").split(/\n\s*\n/)[0]?.trim() ?? "";
}

/** Bullets under a `**Avoid.**` run-in heading, the shape every Monet principle uses. */
function boldSectionBullets(body: string, heading: string): string[] {
  const section = body.split(new RegExp(`\\*\\*${heading}\\.?\\*\\*\\s*`))[1];
  if (!section) return [];
  return section.split(/\n\s*\n/)[0]!.split("\n").flatMap((line) => line.startsWith("- ") ? [line.slice(2).trim()] : []);
}

function compactPrinciple(principle: Principle): CompactPrinciple {
  return {
    id: principle.id, title: principle.title,
    decision: leadParagraph(principle.body),
    avoid: boldSectionBullets(principle.body, "Avoid"),
    uri: resourceUri("principles", principle.id),
  };
}

function compactPattern(pattern: MarkdownDocument): CompactPattern {
  return {
    id: pattern.id, title: pattern.title, summary: pattern.summary,
    intent: patternIntent(pattern),
    avoid: patternAvoid(pattern),
    // The applied detail stays in the resource; naming its sections lets an agent decide whether
    // it needs them without the brief carrying five kilobytes of prose it may never read.
    covers: patternSections(pattern),
    components: pattern.components ?? [],
    uri: resourceUri("patterns", pattern.id),
  };
}

function omitEmpty<T extends Record<string, unknown>>(record: T): Partial<T> {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => Array.isArray(value)
    ? value.length
    : value && typeof value === "object" ? Object.keys(value).length : Boolean(value))) as Partial<T>;
}

/**
 * Records the query actually found carry their full decision, including the rationale that
 * explains the opinion. Records that arrived by expansion carry what to do — preferences, notes,
 * usage boundaries — and leave the justification at their resource URI, so supporting cast does
 * not cost as much as the subject of the request.
 */
const DIRECT_REASONS = new Set(["explicit_selector", "direct_name_match", "alias_match", "tag_match", "text_match"]);

function compactComponent(component: Component, direct: boolean): CompactComponent {
  const decision = component.decision;
  return {
    id: component.id, name: component.name, category: component.category,
    status: decision?.status ?? "undecided",
    description: component.description,
    ...omitEmpty({
      preferences: decision?.preferences ?? {},
      behavior: decision?.behavior ?? {},
      rationale: direct ? decision?.rationale ?? "" : "",
      notes: decision?.notes ?? "",
      use_when: decision?.use_when ?? [],
      avoid_when: decision?.avoid_when ?? [],
      source_inspiration: decision?.selection ? `${decision.selection.source}/${decision.selection.source_component}` : "",
      foundations: decision?.foundations ?? [],
      related: component.relationships,
    }),
    uri: resourceUri("components", component.id),
  };
}

function compactReference(reference: CompactReferenceInput): CompactReference {
  return {
    id: reference.id, title: reference.title, source: reference.source_domain,
    annotation: reference.annotation,
    summary: reference.ai?.retrieval_text ?? "",
    // The full tag vocabulary is long and largely restates the summary; the leading tags carry
    // the classification an agent matches on, and the resource has the rest.
    tags: (reference.ai_tags ?? []).slice(0, 12),
    uri: resourceUri("references", reference.id),
  };
}

type CompactReferenceInput = DesignContext["references"][number];

function tokenValues(tokens: ResolvedThemeToken[]): Record<string, string | number> {
  return Object.fromEntries(tokens.map((token) => [token.name, token.resolved_value ?? String(token.value)]));
}

function themeOverrides(tokens: ResolvedThemeToken[]): Record<string, { base: string | number | null; theme: string | number | null }> {
  return Object.fromEntries(tokens
    .filter((token) => token.source === "theme" && String(token.resolved_value) !== String(token.base_resolved_value))
    .map((token) => [token.name, { base: token.base_resolved_value, theme: token.resolved_value }]));
}

export function toCompactContext(context: DesignContext): CompactDesignContext {
  const direct = new Set(context.retrieval.filter((match) => DIRECT_REASONS.has(match.reason)).map((match) => `${match.entity_type}:${match.entity_id}`));
  const overrides = themeOverrides(context.resolvedTokens);
  const issues = context.tokenIssues.map((issue) => `${issue.token}: ${issue.message}`);
  return {
    ...(context.profile ? { profile: context.profile, knowledgeFingerprint: context.knowledgeFingerprint } : {}),
    query: context.query,
    coverage: context.coverage,
    notices: context.notices,
    theme: context.theme ? { id: context.theme.id, name: context.theme.name, mode: context.mode, modes: context.modes } : null,
    principles: context.principles.map(compactPrinciple),
    foundations: context.foundations.map((foundation) => ({
      id: foundation.id, name: foundation.name, status: foundation.status,
      description: foundation.description, guidance: foundation.guidance,
      uri: resourceUri("foundations", foundation.id),
    })),
    patterns: context.patterns.map(compactPattern),
    components: context.components.map((component) => compactComponent(component, direct.has(`component:${component.id}`))),
    references: context.references.map(compactReference),
    tokens: tokenValues(context.resolvedTokens),
    ...(Object.keys(overrides).length ? { theme_overrides: overrides } : {}),
    ...(Object.keys(context.modeVariants).length ? { mode_values: context.modeVariants } : {}),
    ...(issues.length ? { token_issues: issues } : {}),
    // Principles ship with every brief, so a provenance row saying so on each of them is noise the
    // agent cannot act on. Their entries are dropped here; the full context still carries them.
    retrieval: context.retrieval.filter((match) => match.reason !== "global_guidance"),
    warnings: context.warnings,
  };
}
