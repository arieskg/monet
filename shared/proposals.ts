import { z } from "zod";
import type { Gap, GapFinding, GapRecordLink } from "./gaps.js";
import type { ComponentDecision, PrimitiveDecision, Status, TaxonomyEntry, Theme, Token, Workspace } from "./model.js";
import { normalizeTokens, resolveThemeTokens, resolveTokens, themeModes } from "./tokens.js";

/**
 * Gaps V2 Phase 1: a Proposal is a separately persisted, editable, typed change set that a Gap
 * diagnosis justifies. It describes how canonical Monet records *would* change. Nothing in this
 * module, or in the server code built on it, writes a canonical record: the projection below is an
 * in-memory preview used for prospective validation and review only. Apply is a later phase.
 */

export const PROPOSAL_ELIGIBLE_CLASSIFICATIONS = ["missing_decision", "weak_guidance", "conflicting_guidance", "retrieval_relationship"] as const;
export type ProposalEligibleClassification = typeof PROPOSAL_ELIGIBLE_CLASSIFICATIONS[number];

export const PROPOSAL_RECORD_KINDS = ["principle", "foundation", "pattern", "component", "primitive", "theme"] as const;
export type ProposalRecordKind = typeof PROPOSAL_RECORD_KINDS[number];
export type ProposalFieldType = "text" | "markdown" | "status" | "string_list" | "id_list" | "string_map" | "boolean_map" | "tokens" | "overrides";
export type ProposalAuthor = "ai" | "human";
export type ProposalStatus = "draft" | "approved" | "rejected" | "superseded";

export interface ProposalFieldSpec { type: ProposalFieldType; label: string; /** Must be nonempty on a created record. */ required?: boolean }

/**
 * The fields a proposal may change, per record kind. Selection, candidates, decision history,
 * source mappings, references, and identities are deliberately absent: a proposal amends guidance,
 * it does not pick inspiration, rename records, or create taxonomy.
 */
export const PROPOSAL_FIELDS: Record<ProposalRecordKind, Record<string, ProposalFieldSpec>> = {
  principle: { title: { type: "text", label: "Title" }, body: { type: "markdown", label: "Body" } },
  foundation: {
    status: { type: "status", label: "Status" }, description: { type: "text", label: "Description" }, rationale: { type: "markdown", label: "Rationale" },
    guidance: { type: "markdown", label: "Guidance" }, notes: { type: "markdown", label: "Notes" }, tokens: { type: "tokens", label: "Tokens" },
  },
  pattern: {
    title: { type: "text", label: "Title", required: true }, summary: { type: "text", label: "Summary", required: true }, status: { type: "status", label: "Status" },
    tags: { type: "string_list", label: "Tags" }, body: { type: "markdown", label: "Body", required: true },
    components: { type: "id_list", label: "Linked components" }, foundations: { type: "id_list", label: "Linked Foundations" },
  },
  component: {
    aliases: { type: "string_list", label: "Aliases (retrieval)" }, relationships: { type: "id_list", label: "Related components" },
    status: { type: "status", label: "Status" }, rationale: { type: "markdown", label: "Rationale" }, notes: { type: "markdown", label: "Notes" },
    use_when: { type: "string_list", label: "Use when" }, avoid_when: { type: "string_list", label: "Avoid when" },
    preferences: { type: "string_map", label: "Preferences" }, behavior: { type: "boolean_map", label: "Behavior" },
    foundations: { type: "id_list", label: "Foundation deviations" }, primitives: { type: "id_list", label: "Primitives" },
  },
  primitive: {
    status: { type: "status", label: "Status" }, purpose: { type: "text", label: "Purpose" }, notes: { type: "markdown", label: "Notes" },
    preferences: { type: "string_map", label: "Preferences" }, tokens: { type: "string_list", label: "Tokens used" },
  },
  theme: { name: { type: "text", label: "Name" }, overrides: { type: "overrides", label: "Overrides (every mode)" }, dark_overrides: { type: "overrides", label: "Dark overrides" } },
};

/** The only kind of record a proposal may create, and only when a diagnosis found a missing decision. */
export const PROPOSAL_CREATABLE_KIND: ProposalRecordKind = "pattern";

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,79}$/;
const TOKEN_NAME_PATTERN = /^[a-z][a-z0-9.-]*$/;
const STATUSES = ["undecided", "selected", "needs_review", "experimental", "do_not_use"] as const satisfies readonly Status[];
const TOKEN_TYPES = ["color", "dimension", "number", "font-family", "font-size", "font-weight", "duration", "cubic-bezier", "shadow", "border", "breakpoint", "z-index"] as const;
const tokenSchema = z.object({
  id: z.string().max(120).optional(), name: z.string().regex(TOKEN_NAME_PATTERN, "Token names use lowercase letters, numbers, dots, and hyphens."),
  type: z.enum(TOKEN_TYPES), level: z.enum(["primitive", "semantic", "component"]), value: z.union([z.string().max(300), z.number()]),
  description: z.string().max(600).default(""), alias: z.string().max(120).optional(), order: z.number().optional(),
  modes: z.object({ dark: z.union([z.string().max(300), z.number()]).optional() }).strict().optional(),
}).strict();
const mapKey = z.string().regex(/^[a-z][a-z0-9_]*$/, "Keys are snake_case.");
const VALUE_SCHEMAS: Record<ProposalFieldType, z.ZodType> = {
  text: z.string().max(2000), markdown: z.string().max(30000), status: z.enum(STATUSES),
  string_list: z.array(z.string().trim().min(1).max(300)).max(100), id_list: z.array(z.string().regex(ID_PATTERN, "Ids are lowercase slugs.")).max(100),
  string_map: z.record(mapKey, z.string().max(300)).refine((value) => Object.keys(value).length <= 60, "At most 60 entries."),
  boolean_map: z.record(mapKey, z.boolean()).refine((value) => Object.keys(value).length <= 60, "At most 60 entries."),
  tokens: z.array(tokenSchema).max(400).refine((tokens) => new Set(tokens.map((token) => token.name)).size === tokens.length, "Token names must be unique."),
  overrides: z.record(z.string().regex(TOKEN_NAME_PATTERN, "Override keys are token names."), z.union([z.string().max(300), z.number()])).refine((value) => Object.keys(value).length <= 400, "At most 400 overrides."),
};

export function parseFieldValue(type: ProposalFieldType, value: unknown): unknown {
  return VALUE_SCHEMAS[type].parse(value);
}

export function parseRecordKey(key: string): { kind: ProposalRecordKind; id: string } | null {
  const separator = key.indexOf(":");
  if (separator < 0) return null;
  const kind = key.slice(0, separator) as ProposalRecordKind;
  const id = key.slice(separator + 1);
  return PROPOSAL_RECORD_KINDS.includes(kind) && ID_PATTERN.test(id) ? { kind, id } : null;
}

export const proposalChangeInputSchema = z.object({
  target: z.string().refine((key) => parseRecordKey(key) !== null, "Targets are `kind:id` record keys."),
  operation: z.enum(["amend", "create"]).default("amend"),
  field: z.string().regex(/^[a-z_]{1,40}$/),
  after: z.unknown(),
  note: z.string().trim().max(1000).default(""),
}).strict();
export const proposalRevisionInputSchema = z.object({
  summary: z.string().trim().min(1, "Summarize the proposal.").max(300),
  rationale: z.string().trim().max(6000).default(""),
  changes: z.array(proposalChangeInputSchema).min(1, "Add at least one change.").max(60),
}).strict();
export type ProposalChangeInput = z.input<typeof proposalChangeInputSchema>;
export type ProposalRevisionInput = z.input<typeof proposalRevisionInputSchema>;

export interface ProposalChange {
  target: string; operation: "amend" | "create"; field: string; type: ProposalFieldType;
  /** The record's value when this revision was saved; null for a created record. */
  before: unknown;
  after: unknown;
  /** Who wrote `after`: an AI draft left untouched, or a person. */
  author: ProposalAuthor;
  note: string;
}
export interface ProposalLintFinding { level: "error" | "warning"; rule: string; target: string; field: string; message: string }
export interface ProposalChecks {
  computed_at: string;
  /** Prospective `validateWorkspace` over the projected workspace, relative to the current one. */
  validation: { new_errors: string[]; new_warnings: string[]; resolved: string[]; baseline_errors: number; baseline_warnings: number };
  lint: ProposalLintFinding[];
  /** No new validation errors and no lint errors. Warnings never block. */
  ok: boolean;
}
export interface ProposalRevision {
  number: number; created_at: string; author: ProposalAuthor; summary: string; rationale: string; changes: ProposalChange[];
  /** sha256 of the canonical revision content. Approval binds to this exact value. */
  hash: string;
  knowledge_fingerprint: string;
  /** Content fingerprint of every amended record when the revision was saved. */
  target_fingerprints: Record<string, string>;
  checks: ProposalChecks;
}
export interface ProposalBasis { finding_index: number; classification: ProposalEligibleClassification; conclusion: string; record_keys: string[]; source: GapFinding["source"] }
export interface Proposal {
  version: 1; id: string; gap_id: string; diagnosis_created_at: string; created_at: string; updated_at: string;
  status: ProposalStatus;
  basis: ProposalBasis[];
  allowed_targets: GapRecordLink[];
  allow_new_pattern: boolean;
  revisions: ProposalRevision[];
  approval: { revision: number; hash: string; approved_at: string; note: string } | null;
  rejection: { rejected_at: string; reason: string } | null;
  superseded_by: string | null;
  supersedes: string | null;
}
export interface ProposalStaleness {
  stale: boolean;
  /** Amended records whose content changed since the latest revision, or created ids that now exist. */
  changed_targets: string[];
  missing_targets: string[];
  knowledge_changed: boolean;
  diagnosis_changed: boolean;
  gap_missing: boolean;
}
export interface ProposalTargetView { key: string; kind: ProposalRecordKind; title: string; route: string; exists: boolean; fields: Record<string, ProposalFieldSpec & { current: unknown }> }
export interface ProposalView extends Proposal { staleness: ProposalStaleness; targets: ProposalTargetView[]; ai_available: boolean }
export type ProposalSummary = Pick<Proposal, "id" | "gap_id" | "status" | "created_at" | "updated_at"> & { summary: string; revision: number; approved_revision: number | null };
export interface ProposalEligibility { eligible: boolean; reasons: string[]; basis: ProposalBasis[]; targets: GapRecordLink[]; allow_new_pattern: boolean }
export interface GapProposalOverview { eligibility: ProposalEligibility; proposals: ProposalSummary[] }
export type ProposalDraftResponse = ProposalView & { draft_failed?: string };

export const proposalStatusLabels: Record<ProposalStatus, string> = { draft: "Draft", approved: "Approved", rejected: "Rejected", superseded: "Superseded" };

/** Eligibility is decided from the saved diagnosis against the current knowledge fingerprint. */
export function proposalEligibility(gap: Pick<Gap, "diagnosis">, currentFingerprint: string): ProposalEligibility {
  const none = (reasons: string[]): ProposalEligibility => ({ eligible: false, reasons, basis: [], targets: [], allow_new_pattern: false });
  const diagnosis = gap.diagnosis;
  if (!diagnosis) return none(["Diagnose this Gap before proposing an improvement."]);
  if (diagnosis.workspace_fingerprint !== currentFingerprint) return none(["Monet's knowledge changed after this diagnosis. Diagnose again before proposing."]);
  const basis: ProposalBasis[] = [];
  const excluded: string[] = [];
  diagnosis.findings.forEach((finding, index) => {
    const eligible = (PROPOSAL_ELIGIBLE_CLASSIFICATIONS as readonly string[]).includes(finding.classification);
    if (eligible && finding.contradiction) excluded.push(`Finding ${index + 1} is flagged as a possible contradiction of measured checks.`);
    else if (eligible) basis.push({ finding_index: index, classification: finding.classification as ProposalEligibleClassification, conclusion: finding.conclusion, record_keys: [...new Set(finding.record_keys)], source: finding.source });
  });
  if (!basis.length) {
    const reasons = excluded.length ? excluded : ["No finding classifies this Gap as a missing decision, weak guidance, conflicting guidance, or retrieval problem."];
    if (diagnosis.findings.some((f) => f.classification === "implementation_violation")) reasons.push("Implementation violations are fixed in the product, not in Monet.");
    if (diagnosis.findings.some((f) => f.classification === "project_specific")) reasons.push("Project-specific choices stay local.");
    if (diagnosis.findings.some((f) => f.classification === "insufficient_evidence")) reasons.push("Insufficient evidence cannot justify a change to shared guidance.");
    return none(reasons);
  }
  const keys = new Set(basis.flatMap((b) => b.record_keys));
  const targets = diagnosis.records.filter((record) => keys.has(record.key) && parseRecordKey(record.key) !== null);
  const allow_new_pattern = basis.some((b) => b.classification === "missing_decision");
  if (!targets.length && !allow_new_pattern) return none(["The eligible findings cite no Monet record that a proposal could amend."]);
  return { eligible: true, reasons: [], basis, targets, allow_new_pattern };
}

const EMPTY_DECISION = (id: string): ComponentDecision => ({ id, status: "undecided", selection: null, preferences: {}, behavior: {}, rationale: "", notes: "", use_when: [], avoid_when: [], foundations: [], primitives: [], candidates: [], history: [], updated_at: "" });
const EMPTY_PRIMITIVE = (id: string): PrimitiveDecision => ({ id, status: "undecided", purpose: "", preferences: {}, tokens: [], inspiration: null, notes: "", updated_at: "" });

function taxonomyEntry(workspace: Workspace, id: string): TaxonomyEntry | undefined {
  return workspace.taxonomy.flatMap((category) => category.entries).find((entry) => entry.id === id);
}

/** Current values of every proposable field on one record, or null when the record does not exist. */
export function recordFieldValues(workspace: Workspace, key: string): Record<string, unknown> | null {
  const parsed = parseRecordKey(key);
  if (!parsed) return null;
  const { kind, id } = parsed;
  switch (kind) {
    case "principle": { const record = workspace.principles.find((item) => item.id === id); return record ? { title: record.title, body: record.body } : null; }
    case "foundation": { const record = workspace.foundations.find((item) => item.id === id); return record ? { status: record.status, description: record.description, rationale: record.rationale, guidance: record.guidance, notes: record.notes, tokens: record.tokens } : null; }
    case "pattern": { const record = workspace.patterns.find((item) => item.id === id); return record ? { title: record.title, summary: record.summary, status: record.status, tags: record.tags, body: record.body, components: record.components ?? [], foundations: record.foundations ?? [] } : null; }
    case "component": {
      const entry = taxonomyEntry(workspace, id);
      if (!entry) return null;
      const decision = workspace.components.find((item) => item.id === id) ?? EMPTY_DECISION(id);
      return { aliases: entry.aliases, relationships: entry.relationships, status: decision.status, rationale: decision.rationale, notes: decision.notes, use_when: decision.use_when, avoid_when: decision.avoid_when, preferences: decision.preferences, behavior: decision.behavior, foundations: decision.foundations, primitives: decision.primitives };
    }
    case "primitive": {
      if (!workspace.primitiveTaxonomy.flatMap((category) => category.entries).some((entry) => entry.id === id)) return null;
      const decision = workspace.primitives.find((item) => item.id === id) ?? EMPTY_PRIMITIVE(id);
      return { status: decision.status, purpose: decision.purpose, notes: decision.notes, preferences: decision.preferences, tokens: decision.tokens };
    }
    case "theme": { const record = workspace.themes.find((item) => item.id === id); return record ? { name: record.name, overrides: record.overrides, dark_overrides: record.modes?.dark ?? {} } : null; }
  }
}

/**
 * The workspace as it would read after the changes. In memory only: callers validate and review
 * this projection; nothing writes it. Token resolution is recomputed so Foundation and theme changes
 * are checked the way every other surface resolves them.
 */
export function projectProposal(workspace: Workspace, changes: readonly ProposalChange[]): Workspace {
  const next = structuredClone(workspace);
  const now = "";
  for (const change of changes) {
    const parsed = parseRecordKey(change.target);
    if (!parsed) throw new Error(`Unknown proposal target ${change.target}.`);
    const { kind, id } = parsed;
    const value = change.after;
    if (kind === "principle") {
      const record = next.principles.find((item) => item.id === id);
      if (!record) throw new Error(`Principle ${id} does not exist.`);
      if (change.field === "title") record.title = value as string; else if (change.field === "body") record.body = value as string;
    } else if (kind === "foundation") {
      const record = next.foundations.find((item) => item.id === id);
      if (!record) throw new Error(`Foundation ${id} does not exist.`);
      if (change.field === "tokens") record.tokens = normalizeTokens(id, value);
      else if (change.field === "status") record.status = value as Status;
      else if (["description", "rationale", "guidance", "notes"].includes(change.field)) (record as unknown as Record<string, unknown>)[change.field] = value;
    } else if (kind === "pattern") {
      let record = next.patterns.find((item) => item.id === id);
      if (!record && change.operation === "create") {
        record = { id, title: id, summary: "", body: "", status: "experimental", tags: [], order: next.patterns.length, updated_at: now, components: [], foundations: [] };
        next.patterns.push(record);
      }
      if (!record) throw new Error(`Pattern ${id} does not exist.`);
      if (change.field === "status") record.status = value as Status;
      else if (["title", "summary", "body", "tags", "components", "foundations"].includes(change.field)) (record as unknown as Record<string, unknown>)[change.field] = value;
    } else if (kind === "component") {
      const entry = next.taxonomy.flatMap((category) => category.entries).find((item) => item.id === id);
      if (!entry) throw new Error(`Component ${id} does not exist.`);
      if (change.field === "aliases") entry.aliases = value as string[];
      else if (change.field === "relationships") entry.relationships = (value as string[]).filter((related) => related !== id);
      else {
        let decision = next.components.find((item) => item.id === id);
        if (!decision) { decision = EMPTY_DECISION(id); next.components.push(decision); }
        if (change.field === "status") { decision.status = value as Status; if (decision.status === "undecided") decision.selection = null; }
        else if (["rationale", "notes", "use_when", "avoid_when", "preferences", "behavior", "foundations", "primitives"].includes(change.field)) (decision as unknown as Record<string, unknown>)[change.field] = value;
      }
    } else if (kind === "primitive") {
      if (!next.primitiveTaxonomy.flatMap((category) => category.entries).some((item) => item.id === id)) throw new Error(`Primitive ${id} does not exist.`);
      let decision = next.primitives.find((item) => item.id === id);
      if (!decision) { decision = EMPTY_PRIMITIVE(id); next.primitives.push(decision); }
      if (change.field === "status") decision.status = value as Status;
      else if (["purpose", "notes", "preferences", "tokens"].includes(change.field)) (decision as unknown as Record<string, unknown>)[change.field] = value;
    } else {
      const record = next.themes.find((item) => item.id === id);
      if (!record) throw new Error(`Theme ${id} does not exist.`);
      if (change.field === "name") record.name = value as string;
      else if (change.field === "overrides") record.overrides = value as Theme["overrides"];
      else if (change.field === "dark_overrides") {
        const dark = value as Theme["overrides"];
        if (Object.keys(dark).length) record.modes = { ...record.modes, dark }; else if (record.modes) { delete record.modes.dark; if (!Object.keys(record.modes).length) delete record.modes; }
      }
    }
  }
  const activeTheme = next.themes.find((theme) => theme.id === next.activeThemeId) ?? null;
  next.modes = themeModes(next.foundations, activeTheme);
  next.activeMode = next.modes.includes(next.activeMode) ? next.activeMode : "light";
  next.baseResolvedTokens = resolveTokens(next.foundations).tokens;
  const resolution = resolveThemeTokens(next.foundations, activeTheme, next.activeMode);
  next.resolvedTokens = resolution.tokens;
  next.tokenIssues = resolution.issues;
  return next;
}

/** Stable JSON: keys sorted recursively, so the same content always hashes the same. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function valuesEqual(a: unknown, b: unknown): boolean {
  return canonicalJson(a) === canonicalJson(b);
}

function tokenLine(token: Token): string {
  const dark = token.modes?.dark;
  return `${token.name} = ${String(token.value)}${token.alias ? ` (alias ${token.alias})` : ""}${dark !== undefined ? ` · dark ${String(dark)}` : ""} [${token.type}/${token.level}]${token.description ? ` — ${token.description}` : ""}`;
}

/** A value as the lines a person reads and diffs. Lists are one item per line; maps are `key: value`. */
export function fieldValueText(type: ProposalFieldType, value: unknown): string {
  if (value === null || value === undefined) return "";
  switch (type) {
    case "text": case "markdown": case "status": return String(value);
    case "string_list": case "id_list": return Array.isArray(value) ? value.map(String).join("\n") : "";
    case "string_map": case "boolean_map": case "overrides":
      return typeof value === "object" ? Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${key}: ${String(item)}`).join("\n") : "";
    case "tokens": return Array.isArray(value) ? (value as Token[]).map(tokenLine).join("\n") : "";
  }
}

/** The inverse of `fieldValueText` for the editable types. Tokens are edited as JSON. */
export function parseFieldText(type: ProposalFieldType, text: string): unknown {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const pairs = () => lines.map((line) => { const separator = line.indexOf(":"); if (separator < 0) throw new Error(`"${line}" needs a "key: value" shape.`); return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()] as const; });
  switch (type) {
    case "text": case "markdown": return text;
    case "status": return text.trim();
    case "string_list": case "id_list": return lines;
    case "string_map": return Object.fromEntries(pairs());
    case "boolean_map": return Object.fromEntries(pairs().map(([key, item]) => { if (item !== "true" && item !== "false") throw new Error(`${key} must be true or false.`); return [key, item === "true"]; }));
    case "overrides": return Object.fromEntries(pairs().map(([key, item]) => [key, /^-?\d+(\.\d+)?$/.test(item) ? Number(item) : item]));
    case "tokens": { const parsed: unknown = JSON.parse(text || "[]"); return parsed; }
  }
}

const STOP_TERMS = new Set(["Monet", "WCAG", "AI", "UI", "UX", "CSS", "HTML", "JSON", "API", "React", "Figma", "Web", "Mac", "iOS", "Android", "Windows", "Linux", "Chrome", "Safari", "Firefox", "The", "This", "That", "These", "Those", "When", "Where", "What", "Why", "How", "Use", "Avoid", "Button", "Buttons", "Card", "Cards", "Dark", "Light", "Mode", "Theme", "Token", "Tokens", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]);

/**
 * Terms from the Gap report that look like a product, screen, or team name rather than design
 * vocabulary. Heuristic on purpose: it flags, a person decides.
 */
export function productTerms(report: Gap["report"], knownTerms: Iterable<string>): string[] {
  const known = new Set([...knownTerms].map((term) => term.toLowerCase()));
  const text = [report.problem, report.context, report.expected, report.notes, report.original_query].join("\n");
  const terms = new Set<string>();
  for (const sentence of text.split(/[.!?\n]+/)) {
    sentence.trim().split(/\s+/).filter(Boolean).forEach((raw, index) => {
      const term = raw.replace(/^[("'[]+/, "").replace(/(?:'s)?[)"',;:\]]*$/, "");
      if (!/^[A-Z][A-Za-z0-9]{2,}$/.test(term) || STOP_TERMS.has(term) || known.has(term.toLowerCase())) return;
      // A sentence-initial capital proves nothing; CamelCase or a capital mid-sentence reads as a name.
      if (/[a-z0-9][A-Z]/.test(term) || index > 0) terms.add(term);
    });
  }
  return [...terms];
}

const LOCAL_PHRASES = /\b(our|this|the|their) (app|product|project|team|customer|customers|client|clients|site|codebase|repo|repository|company|startup|brand)\b|\b(in this project|our users|for us|we decided|we use|we want)\b/i;
const IMPLEMENTATION_REFERENCES = /https?:\/\/\S+|\b[\w-]+\/[\w./-]+\.(?:tsx?|jsx?|css|scss|less|html|vue|svelte|swift|kt|py|rb|go)\b|\b(?:src|components|pages|app)\/[\w/-]+\b/i;
const LITERAL_VALUES = /#[0-9a-f]{3,8}\b|\b\d+(?:\.\d+)?(?:px|rem|em)\b/i;
const TEXTUAL_TYPES: ReadonlySet<ProposalFieldType> = new Set(["text", "markdown", "string_list"]);

function changeText(change: ProposalChange): string {
  return TEXTUAL_TYPES.has(change.type) ? fieldValueText(change.type, change.after) : change.type === "string_map" ? Object.values(change.after as Record<string, string>).join("\n") : "";
}

/**
 * The generality lint: is this still design-system guidance, or a product's local decision written
 * into shared records? Errors block approval; warnings are for the reviewer to weigh.
 */
export function lintProposal(changes: readonly ProposalChange[], report: Gap["report"], knownTerms: Iterable<string>, allowedTargets: ReadonlySet<string>): ProposalLintFinding[] {
  const findings: ProposalLintFinding[] = [];
  const at = (change: ProposalChange, level: ProposalLintFinding["level"], rule: string, message: string) => findings.push({ level, rule, target: change.target, field: change.field, message });
  const terms = productTerms(report, knownTerms);
  const created = new Set(changes.filter((change) => change.operation === "create").map((change) => change.target));
  for (const change of changes) {
    if (change.operation === "amend" && valuesEqual(change.before, change.after)) at(change, "error", "no_change", "The proposed value equals the current value.");
    const text = changeText(change);
    const spec = PROPOSAL_FIELDS[parseRecordKey(change.target)!.kind][change.field];
    if (change.operation === "create" && spec?.required && !String(change.after ?? "").trim()) at(change, "error", "required_field", `${spec.label} is required on a new record.`);
    if (change.operation === "amend" && TEXTUAL_TYPES.has(change.type) && !text.trim() && fieldValueText(change.type, change.before).trim()) at(change, "warning", "clears_guidance", "This change removes existing guidance without replacing it.");
    if (!text) continue;
    const mentioned = terms.filter((term) => new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text));
    if (mentioned.length) at(change, "warning", "product_term", `Mentions ${mentioned.map((term) => `"${term}"`).join(", ")} from the Gap report. Shared guidance should not name one product.`);
    if (LOCAL_PHRASES.test(text)) at(change, "warning", "local_scope", `Reads as a product-local decision ("${LOCAL_PHRASES.exec(text)![0]}"). Phrase it as general guidance.`);
    if (IMPLEMENTATION_REFERENCES.test(text)) at(change, "error", "implementation_reference", `References a URL or product source path ("${IMPLEMENTATION_REFERENCES.exec(text)![0]}"). Monet records describe design decisions, not one implementation.`);
    if (LITERAL_VALUES.test(text) && parseRecordKey(change.target)!.kind !== "foundation") at(change, "warning", "literal_value", `Contains a literal value ("${LITERAL_VALUES.exec(text)![0]}"). Prefer naming the token that carries it.`);
  }
  for (const target of created) {
    const fields = changes.filter((change) => change.target === target);
    const links = fields.filter((change) => change.field === "components" || change.field === "foundations").flatMap((change) => change.after as string[]);
    const cited = [...allowedTargets].map((key) => parseRecordKey(key)).filter((key): key is { kind: ProposalRecordKind; id: string } => key !== null && (key.kind === "component" || key.kind === "foundation"));
    if (!links.some((id) => cited.some((key) => key.id === id))) {
      findings.push({ level: "error", rule: "new_record_unlinked", target, field: "components", message: "A new pattern must link at least one component or Foundation the diagnosis cited." });
    }
    for (const [field, spec] of Object.entries(PROPOSAL_FIELDS.pattern)) {
      if (spec.required && !fields.some((change) => change.field === field)) findings.push({ level: "error", rule: "required_field", target, field, message: `${spec.label} is required on a new record.` });
    }
  }
  return findings;
}
