export type Status = "undecided" | "selected" | "needs_review" | "experimental" | "do_not_use";

export interface Principle { id: string; title: string; body: string; order: number; updated_at: string }
export interface MarkdownDocument { id: string; title: string; summary: string; body: string; status: Status; tags: string[]; order: number; updated_at: string; components?: string[]; foundations?: string[] }
export type TokenType = "color" | "dimension" | "number" | "font-family" | "font-size" | "font-weight" | "duration" | "cubic-bezier" | "shadow" | "border" | "breakpoint" | "z-index";
export type TokenLevel = "primitive" | "semantic" | "component";
/**
 * The modes a theme can be resolved in. Light is the baseline every token value describes; dark is
 * the only other mode Monet knows, and a token or theme opts into it by supplying a dark value.
 */
export type ThemeMode = "light" | "dark";
export const THEME_MODES: readonly ThemeMode[] = ["light", "dark"];
/** Mode-specific values for a token. Light is never listed: the token's `value` is the light value. */
export type TokenModeValues = Partial<Record<Exclude<ThemeMode, "light">, string | number>>;
export interface Token { id: string; name: string; foundation: string; type: TokenType; level: TokenLevel; value: string | number; description: string; alias?: string; order: number; modes?: TokenModeValues }
export interface TokenIssue { token: string; type: "broken_reference" | "circular_reference"; message: string }
export interface ResolvedToken extends Token { resolved_value: string | number | null; valid: boolean }
/**
 * A token resolved for one theme in one mode. `source` names the highest layer that changed it:
 * `theme` when a theme override (mode-specific or not) contributed, `mode` when only a Foundation's
 * mode value did, and `base` when the resolved value is Base Monet's light value.
 */
export interface ResolvedThemeToken extends ResolvedToken { base_resolved_value: string | number | null; source: "base" | "mode" | "theme"; theme_id: string | null; mode: ThemeMode; override_dependencies: string[] }
export interface Foundation { id: string; name: string; status: Status; description: string; rationale: string; guidance: string; notes: string; order: number; tokens: Token[]; updated_at: string }
export type ThemeOverrides = Record<string, string | number>;
/** Override-only. `overrides` applies in every mode; `modes.dark` adds overrides that apply only in dark. */
export interface Theme { id: string; name: string; overrides: ThemeOverrides; modes?: Partial<Record<Exclude<ThemeMode, "light">, ThemeOverrides>>; updated_at: string }
export interface TaxonomyEntry { id: string; name: string; category: string; description: string; aliases: string[]; relationships: string[]; deprecated?: boolean }
export interface TaxonomyCategory { id: string; name: string; entries: TaxonomyEntry[] }
export type SnippetLanguage = "tsx" | "jsx" | "html" | "css" | "text";
export interface Candidate { source: string; source_component: string; description: string; documentation?: string; preview: "adapter" | "reference" | "snippet"; snippet?: string; language?: SnippetLanguage }
export interface DecisionHistory { date: string; change: string; old_selection: string | null; new_selection: string | null; rationale: string }
export interface ComponentDecision { id: string; status: Status; selection: { source: string; source_component: string } | null; preferences: Record<string, string>; behavior: Record<string, boolean>; rationale: string; notes: string; use_when: string[]; avoid_when: string[]; foundations: string[]; primitives: string[]; candidates: Candidate[]; history: DecisionHistory[]; updated_at: string }

/** The canonical component taxonomy entry joined to its optional system decision. */
export interface Component extends TaxonomyEntry { decision: ComponentDecision | null }

export interface PrimitiveDecision { id: string; status: Status; purpose: string; preferences: Record<string, string>; tokens: string[]; inspiration: { source: string; source_item: string } | null; notes: string; updated_at: string }
export type MappingStatus = "mapped" | "needs_review" | "unmapped" | "ignored" | "no_equivalent";
export type MappingConfidence = "high" | "medium" | "low" | "none";
export type MappingMatchType = "exact" | "equivalent" | "variant" | "composition" | "related";
export interface SourceMapping { upstream: string; target_type: "component" | "primitive"; canonical_id: string | null; status: MappingStatus; confidence?: MappingConfidence; match_type?: MappingMatchType; primary?: boolean; aliases?: string[]; documentation?: string; description?: string; category?: string; props_api?: string[]; usage_examples?: string[]; rationale?: string; mapped_by?: "ai" | "manual" }
export interface Source { id: string; name: string; type: "npm" | "github" | "registry" | "manual" | "reference"; homepage: string; repository: string; framework: string; package: string; license: string; notes: string; enabled: boolean; mappings: SourceMapping[]; updated_at: string }
export type ReferenceType = "image" | "url" | "html" | "svg" | "pdf" | "file";
export interface ReferenceAiMetadata { ui_types: string[]; components: string[]; patterns: string[]; visual_characteristics: string[]; density: string; hierarchy: string; layout: string[]; color: string[]; typography: string[]; mood: string[]; observations: string[]; retrieval_text: string; analyzed_at: string }
export interface Reference { id: string; title: string; type: ReferenceType; source_url: string; source_domain: string; annotation: string; notes: string; asset_path: string; asset_media_type: string; original_filename: string; preview_url: string; ai_tags: string[]; ai: ReferenceAiMetadata | null; created_at: string; updated_at: string }
export type ReferenceSuggestionTarget = "principle" | "theme" | "foundation" | "component" | "pattern";
export type ReferenceSuggestionStatus = "pending" | "approved" | "dismissed";
export interface ReferencePreference { id: string; title: string; observation: string; evidence_reference_ids: string[]; confidence: "high" | "medium" | "low" }
export interface ReferenceSuggestion { id: string; target_type: ReferenceSuggestionTarget; target_id: string | null; title: string; proposal: string; rationale: string; evidence_reference_ids: string[]; status: ReferenceSuggestionStatus }
export interface ReferenceCollectionAnalysis { summary: string; recurring_preferences: ReferencePreference[]; suggestions: ReferenceSuggestion[]; analyzed_at: string }
export interface Workspace { principles: Principle[]; foundations: Foundation[]; taxonomy: TaxonomyCategory[]; primitiveTaxonomy: TaxonomyCategory[]; primitives: PrimitiveDecision[]; components: ComponentDecision[]; patterns: MarkdownDocument[]; sources: Source[]; references: Reference[]; referenceAnalysis: ReferenceCollectionAnalysis; decisionLog: MarkdownDocument[]; themes: Theme[]; defaultThemeId: string; activeThemeId: string; /** The mode `resolvedTokens` were resolved in. */ activeMode: ThemeMode; /** Modes the active theme can be resolved in; light is always present. */ modes: ThemeMode[]; baseResolvedTokens: ResolvedToken[]; resolvedTokens: ResolvedThemeToken[]; tokenIssues: TokenIssue[]; filesRoot: string }

export interface DesignContextRequest { query?: string; themeId?: string; /** Resolution mode. When omitted, a query that asks for dark mode resolves dark if the theme supports it. */ mode?: ThemeMode; principleIds?: string[]; foundationIds?: string[]; patternIds?: string[]; componentIds?: string[]; referenceIds?: string[] }
/** Whether task-specific guidance was actually found, as opposed to falling back to global principles. */
export type RetrievalCoverage = "task_specific" | "partial" | "none";
export type ContextNoticeKind = "no_opinion" | "undecided_guidance" | "unsupported_capability";
export interface ContextNotice { kind: ContextNoticeKind; message: string; ids: string[] }
export type RetrievalReason = "explicit_selector" | "direct_name_match" | "alias_match" | "tag_match" | "text_match" | "relationship_expansion" | "reverse_pattern_expansion" | "global_guidance" | "full_context";
export type RetrievalStrength = "strong" | "medium" | "weak";
export type RetrievalEntityType = "principle" | "foundation" | "pattern" | "component" | "reference";
export interface RetrievalProvenance { entity_type: RetrievalEntityType; entity_id: string; reason: RetrievalReason; strength: RetrievalStrength; score?: number; related_from?: string }
export interface RankedReference { reference: Reference; match: RetrievalProvenance }
/** Resolved values of one token in every mode the theme supports, listed only where the modes differ. */
export type ModeVariants = Record<string, Partial<Record<ThemeMode, string | number | null>>>;
export interface DesignContext { query: string; theme: Theme | null; /** The mode `resolvedTokens` were resolved in. */ mode: ThemeMode; /** Modes the theme supports. */ modes: ThemeMode[]; /** Tokens in this context whose resolved value differs between modes. */ modeVariants: ModeVariants; coverage: RetrievalCoverage; notices: ContextNotice[]; principles: Principle[]; foundations: Foundation[]; patterns: MarkdownDocument[]; components: Component[]; references: Reference[]; resolvedTokens: ResolvedThemeToken[]; tokenIssues: TokenIssue[]; retrieval: RetrievalProvenance[]; warnings: string[] }

/**
 * Design conformance review. The calling agent describes what it built as a list of observations;
 * Monet checks those observations against the canonical records and reports what contradicts them.
 *
 * Monet never sees the implementation, so a review is bounded by the evidence supplied: an empty
 * `findings` array means nothing in the submitted observations contradicted the design system, not
 * that the implementation conforms. `coverage` says how much of the evidence was actually checkable.
 */
export type DesignUsageKind = "style" | "token" | "component" | "contrast";
export interface DesignUsage {
  /** The caller's handle for this observation, echoed on every finding it produces. Opaque to Monet. */
  id?: string;
  /** Where the caller saw it — a path, a selector, a component name. Opaque to Monet. */
  location?: string;
  kind: DesignUsageKind;
  /** `style`: the CSS-shaped property the value was authored against, such as `background-color` or `padding`. */
  property?: string;
  /** `style`: the literal value as authored, such as `#3498db` or `13px`. */
  value?: string;
  /** `token`: the Monet token name the implementation referenced. */
  token?: string;
  /** `component`: the Monet component id, name, or alias the implementation used. */
  component?: string;
  /** `contrast`: the colours actually rendered against each other, as literals or Monet token names. */
  foreground?: string;
  background?: string;
  /**
   * `contrast`: what the pair carries, which decides the minimum. `text` and `non-text` name a WCAG
   * minimum; `decorative` covers decorative, disabled, and presentational pairs that have none. Never
   * inferred: an undeclared pair is measured against a documented Monet contract if one exists, and
   * otherwise reported without a minimum.
   */
  usage?: "text" | "non-text" | "decorative";
}
export type ReviewLevel = "error" | "warning" | "info";
export interface ReviewFinding {
  level: ReviewLevel;
  /** Stable machine-readable check id, so a caller can filter or suppress by rule. */
  check: string;
  /** The submitted usage this came from, echoed verbatim. */
  usage_id?: string;
  location?: string;
  /** What Monet read in the submitted evidence. */
  observed: string;
  /** The Monet token, decision, or contract it is measured against. */
  expected: string;
  /** Why it matters, in one sentence. */
  why: string;
  /** The value Monet would use instead, when it can name one unambiguously. */
  replacement?: string;
  /** `monet://` resources that carry the decision behind this finding. */
  related: string[];
}
export interface DesignReviewCoverage {
  submitted: number;
  /** Observations Monet could measure against a canonical record. */
  checked: number;
  /** Observations Monet understood but could not measure, each reported as an `info` finding. */
  unverifiable: number;
  /** Observations naming something Monet documents no scale or decision for. Not a violation. */
  not_applicable: number;
  /** The check ids that ran against this evidence. */
  checks: string[];
}
export interface DesignReview {
  theme: { id: string; name: string; mode: ThemeMode; modes: ThemeMode[] } | null;
  coverage: DesignReviewCoverage;
  /** States what this result does and does not establish, so absence of findings is not read as conformance. */
  scope: string;
  findings: ReviewFinding[];
  warnings: string[];
}
export interface DesignReviewRequest { usages: DesignUsage[]; themeId?: string; /** Mode the evidence was observed in. Defaults to light. */ mode?: ThemeMode }
