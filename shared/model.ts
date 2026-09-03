export type Status = "undecided" | "selected" | "needs_review" | "experimental" | "do_not_use";

export interface Principle { id: string; title: string; body: string; order: number; updated_at: string }
export interface MarkdownDocument { id: string; title: string; summary: string; body: string; status: Status; tags: string[]; order: number; updated_at: string; components?: string[]; foundations?: string[] }
export type TokenType = "color" | "dimension" | "number" | "font-family" | "font-size" | "font-weight" | "duration" | "cubic-bezier" | "shadow" | "border" | "breakpoint" | "z-index";
export type TokenLevel = "primitive" | "semantic" | "component";
export interface Token { id: string; name: string; foundation: string; type: TokenType; level: TokenLevel; value: string | number; description: string; alias?: string; order: number }
export interface TokenIssue { token: string; type: "broken_reference" | "circular_reference"; message: string }
export interface ResolvedToken extends Token { resolved_value: string | number | null; valid: boolean }
export interface ResolvedThemeToken extends ResolvedToken { base_resolved_value: string | number | null; source: "base" | "theme"; theme_id: string | null; override_dependencies: string[] }
export interface Foundation { id: string; name: string; status: Status; description: string; rationale: string; guidance: string; notes: string; order: number; tokens: Token[]; updated_at: string }
export interface Theme { id: string; name: string; overrides: Record<string, string | number>; updated_at: string }
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
export interface Workspace { principles: Principle[]; foundations: Foundation[]; taxonomy: TaxonomyCategory[]; primitiveTaxonomy: TaxonomyCategory[]; primitives: PrimitiveDecision[]; components: ComponentDecision[]; patterns: MarkdownDocument[]; sources: Source[]; references: Reference[]; referenceAnalysis: ReferenceCollectionAnalysis; decisionLog: MarkdownDocument[]; themes: Theme[]; defaultThemeId: string; activeThemeId: string; baseResolvedTokens: ResolvedToken[]; resolvedTokens: ResolvedThemeToken[]; tokenIssues: TokenIssue[]; filesRoot: string }

export interface DesignContextRequest { query?: string; themeId?: string; principleIds?: string[]; foundationIds?: string[]; patternIds?: string[]; componentIds?: string[]; referenceIds?: string[] }
/** Whether task-specific guidance was actually found, as opposed to falling back to global principles. */
export type RetrievalCoverage = "task_specific" | "partial" | "none";
export type ContextNoticeKind = "no_opinion" | "undecided_guidance" | "unsupported_capability";
export interface ContextNotice { kind: ContextNoticeKind; message: string; ids: string[] }
export type RetrievalReason = "explicit_selector" | "direct_name_match" | "alias_match" | "tag_match" | "text_match" | "relationship_expansion" | "reverse_pattern_expansion" | "global_guidance" | "full_context";
export type RetrievalStrength = "strong" | "medium" | "weak";
export type RetrievalEntityType = "principle" | "foundation" | "pattern" | "component" | "reference";
export interface RetrievalProvenance { entity_type: RetrievalEntityType; entity_id: string; reason: RetrievalReason; strength: RetrievalStrength; score?: number; related_from?: string }
export interface RankedReference { reference: Reference; match: RetrievalProvenance }
export interface DesignContext { query: string; theme: Theme | null; coverage: RetrievalCoverage; notices: ContextNotice[]; principles: Principle[]; foundations: Foundation[]; patterns: MarkdownDocument[]; components: Component[]; references: Reference[]; resolvedTokens: ResolvedThemeToken[]; tokenIssues: TokenIssue[]; retrieval: RetrievalProvenance[]; warnings: string[] }
