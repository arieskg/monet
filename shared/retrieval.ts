import type { RetrievalReason, RetrievalStrength } from "./model.js";

/** Task-framing words that carry no design meaning. Matched against both the raw and stemmed form. */
const STOP_WORD_SOURCE = [
  "a", "able", "add", "against", "an", "and", "any", "are", "be", "build", "building", "can",
  "create", "creating", "do", "existing", "find", "for", "from", "get", "help", "how", "i", "if",
  "im", "implement", "in", "into", "is", "it", "let", "like", "make", "making", "me", "monet",
  "my", "need", "new", "of", "on", "onto", "or", "our", "out", "please", "reference", "relevant", "should",
  "about", "after", "against", "all", "also", "before", "both", "but", "each", "every", "not",
  "only", "over", "same", "such", "under", "very",
  "so", "some", "support", "than", "that", "the", "their", "them", "then", "there", "these",
  "they", "this", "to", "up", "use", "using", "want", "we", "what", "when", "where", "which",
  "while", "will", "with", "would", "you", "your",
];

/**
 * Words that name a shape rather than a concept. One of these on its own never identifies a
 * record, so a single-token name or alias hit on one is demoted from a strong match to
 * supporting evidence. Multi-word phrases containing them are unaffected: "text input" and
 * "card grid" still read as specific, while "input" and "grid" alone do not.
 */
const BROAD_TERM_SOURCE = [
  "action", "app", "area", "bar", "block", "box", "button", "cell", "column", "content", "control",
  "data", "design", "detail", "element", "field", "form", "grid", "group", "icon", "input", "item",
  "label", "layout", "line", "link", "list", "menu", "mode", "option", "page", "panel", "part",
  "region", "row", "screen", "section", "set", "state", "style", "surface", "system", "tab", "text",
  "tile", "type", "ui", "value", "view", "widget",
];

export type RetrievalEntityKind = "principle" | "foundation" | "pattern" | "component" | "reference";

/**
 * Vocabulary equivalences between the words people use for a task and the words Monet's records
 * use. These expand the *query*, so one entry helps every record that already talks about the
 * concept rather than tying a single record to a single phrase. Add an entry only for a genuine
 * naming difference in the UI domain — never to make one test prompt pass.
 */
export const QUERY_SYNONYMS: Record<string, string[]> = {
  "sign in": ["login", "authentication", "credential", "password"],
  "log in": ["login", "authentication", "credential", "password"],
  "sign up": ["registration", "authentication", "credential", "password"],
  "sign out": ["logout", "authentication"],
  login: ["authentication", "credential", "password"],
  signin: ["login", "authentication", "credential", "password"],
  signup: ["registration", "authentication", "credential", "password"],
  register: ["registration", "authentication", "credential"],
  auth: ["authentication", "credential"],
  password: ["credential"],
  modal: ["dialog", "overlay"],
  popup: ["dialog", "overlay", "popover"],
  lightbox: ["dialog", "overlay"],
  wizard: ["stepper", "step", "sequence"],
  onboarding: ["stepper", "step", "sequence", "empty"],
  dropdown: ["select", "menu"],
  combo: ["combobox", "select"],
  autocomplete: ["combobox", "suggestion"],
  typeahead: ["combobox", "suggestion"],
  snackbar: ["toast", "notification"],
  chip: ["tag", "badge"],
  pill: ["tag", "badge"],
  loader: ["spinner", "loading"],
  spinner: ["loading"],
  skeleton: ["loading", "placeholder"],
  remove: ["delete", "destructive"],
  destroy: ["delete", "destructive"],
  discard: ["delete", "destructive"],
  delete: ["destructive"],
  deletion: ["delete", "destructive"],
  confirm: ["confirmation", "dialog"],
  confirmation: ["dialog", "destructive"],
  bulk: ["batch", "multiple", "selection"],
  inline: ["editing"],
  crud: ["create", "edit", "delete", "table", "form"],
  sidebar: ["navigation"],
  navbar: ["navigation", "menu"],
  breadcrumbs: ["breadcrumb", "navigation"],
  upload: ["file"],
  dropzone: ["file", "upload"],
  // Drag-and-drop is the dropzone concept, and an attachment is the file it produces. Both are
  // vocabulary rather than a pointer at one record, so they reach anything that talks about files.
  "drag and drop": ["dropzone", "file", "upload"],
  attach: ["attachment", "file", "upload"],
  attachment: ["file", "upload"],
  avatar: ["profile", "identity"],
  tooltip: ["hint"],
  responsive: ["breakpoint", "viewport", "mobile"],
  mobile: ["breakpoint", "viewport", "narrow"],
  desktop: ["breakpoint", "viewport", "wide"],
  metric: ["statistic", "kpi"],
  kpi: ["statistic", "metric"],
  analytics: ["dashboard", "statistic"],
  filter: ["filtering"],
  sort: ["sorting", "order"],
  paginate: ["pagination", "paging"],
  blank: ["empty"],
  placeholder: ["empty", "loading"],
  fail: ["error", "failure", "recovery"],
  failure: ["error", "recovery"],
  broken: ["error", "failure"],
  retry: ["error", "recovery"],
  phone: ["mobile", "breakpoint", "viewport", "narrow"],
  tablet: ["breakpoint", "viewport"],
  validation: ["error", "invalid"],
  accessibility: ["a11y", "contrast", "keyboard"],
  a11y: ["accessibility", "contrast", "keyboard"],
  review: ["consistency", "hierarchy", "contrast", "spacing", "typography", "color", "layout"],
  audit: ["consistency", "hierarchy", "contrast", "spacing", "typography", "color", "layout"],
  critique: ["consistency", "hierarchy", "contrast", "spacing", "typography", "color", "layout"],
  theme: ["token", "palette"],
  // Phrase-triggered: a bare "palette" is as likely to be a command palette as a colour one.
  "color palette": ["token", "swatch"],
  "colour palette": ["color", "token", "swatch"],
};

/**
 * Record-oriented terms for task language that a record's own name and prose do not express.
 * Kept deliberately small: prefer a query synonym above, which generalizes, and reach for a
 * record alias only when a specific record owns a concept nothing else names.
 */
export const RETRIEVAL_ALIASES: Record<Exclude<RetrievalEntityKind, "reference">, Record<string, string[]>> = {
  principle: {},
  foundation: {
    color: ["contrast", "color palette", "dark mode", "theming"],
    interaction: ["hover state", "focus state", "pressed state", "disabled state", "selected state"],
    layout: ["page structure", "content width", "responsive layout"],
    layering: ["stacking order", "z index"],
    breakpoints: ["responsive", "mobile", "viewport"],
    typography: ["type scale", "font"],
  },
  pattern: {
    "app-shell": ["application shell", "page chrome", "product layout"],
    dashboard: ["analytics", "metrics overview", "reporting"],
    "data-tables": ["table workflow", "bulk actions", "inline editing", "row selection"],
    "destructive-actions": ["confirmation", "irreversible action", "delete workflow"],
    "empty-states": ["blank slate", "zero state", "no results"],
    "error-handling": ["failure", "recovery", "validation"],
    filtering: ["faceted search", "refine results"],
    forms: ["settings form", "data entry", "authentication form", "login form", "signup form"],
    loading: ["progress feedback", "pending state"],
    "master-detail": ["split view", "list detail", "inbox layout"],
    navigation: ["information architecture", "wayfinding"],
    overlays: ["modal", "layered surface", "transient surface"],
    settings: ["preferences", "account settings", "configuration"],
  },
  component: {
    "alert-dialog": ["confirmation dialog", "destructive confirmation", "are you sure"],
    "command-palette": ["command launcher", "quick actions"],
    "data-table": ["bulk actions", "inline editing", "sortable table", "row selection"],
    "date-picker": ["calendar picker"],
    "empty-state": ["zero state", "blank slate", "no results"],
    field: ["form field", "labelled control"],
    "file-upload": ["file picker", "attachment"],
    "password-input": ["password field", "credential input"],
    "search-input": ["search box", "query field"],
    stepper: ["wizard", "multi step flow", "onboarding flow"],
    switch: ["immediate setting", "preference toggle"],
    tabs: ["tabbed view"],
    toast: ["transient confirmation"],
  },
};

export interface RetrievalFields {
  /** Canonical display name. A phrase or full-coverage hit here is the strongest signal. */
  name: string;
  /** Canonical taxonomy aliases and vocabulary terms, scored like the name. */
  aliases?: readonly string[];
  retrievalTerms?: readonly string[];
  /** Broad classification labels. Never sufficient on their own. */
  categories?: readonly string[];
  /** Authored tags, more specific than a category but weaker than a name. */
  tags?: readonly string[];
  /** Purpose-bearing prose: description, summary, use_when, avoid_when. */
  summaryText?: readonly unknown[];
  /** Supporting prose: rationale, notes, preferences, pattern body. */
  detailText?: readonly unknown[];
  /** Incidental prose: relationships, upstream source names, domains. */
  weakText?: readonly unknown[];
}

export interface RetrievalScore {
  score: number;
  reason: Extract<RetrievalReason, "direct_name_match" | "alias_match" | "tag_match" | "text_match">;
  strength: RetrievalStrength;
}

/**
 * Conservative morphological folding. It only needs to make the forms of one word collide
 * ("delete"/"deleting", "doc"/"docs", "action"/"actions"), not to be linguistically correct,
 * so every rule is length-guarded and the result is never used for display.
 */
export function stem(token: string): string {
  let value = token;
  if (value.length > 4 && value.endsWith("ies")) value = `${value.slice(0, -3)}y`;
  else if (value.length > 4 && /(?:ss|sh|ch|x|z)es$/.test(value)) value = value.slice(0, -2);
  else if (value.length > 3 && value.endsWith("s") && !/(?:ss|us|is)$/.test(value)) value = value.slice(0, -1);
  if (value.length > 5 && value.endsWith("ing")) value = value.slice(0, -3);
  else if (value.length > 4 && value.endsWith("ed")) value = value.slice(0, -2);
  if (value.length > 4 && value.endsWith("e")) value = value.slice(0, -1);
  if (value.length > 4 && value.endsWith("ly")) value = value.slice(0, -2);
  return value;
}

/**
 * A tier is a list of separate authored fields, not one document. Concatenating them and measuring
 * coverage over the whole blob is what made a fully matched annotation look like a weak hit inside
 * a long record, so every value is kept apart and scored on its own.
 */
function textValues(values: readonly unknown[]): string[] {
  return values.flatMap((value) => Array.isArray(value) ? value : [value]).filter((value): value is string => typeof value === "string" && Boolean(value.trim()));
}

/** Both spellings of every constant word, so a list stays readable while matching stemmed tokens. */
function stemmed(source: readonly string[]): Set<string> {
  return new Set(source.flatMap((word) => [word, stem(word)]));
}

const STOP_WORDS = stemmed(STOP_WORD_SOURCE);
const BROAD_TERMS = stemmed(BROAD_TERM_SOURCE);

export function retrievalTokens(value: string): string[] {
  return [...new Set(value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/)
    .filter((token) => token && !STOP_WORDS.has(token))
    .map(stem)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token)))];
}

/** Query terms plus their vocabulary equivalents, which score slightly below the words actually typed. */
export function expandQuery(query: string): { terms: Set<string>; expanded: Set<string> } {
  const normalized = ` ${query.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
  const terms = new Set(retrievalTokens(query));
  const expanded = new Set<string>();
  for (const [trigger, additions] of Object.entries(QUERY_SYNONYMS)) {
    const matched = trigger.includes(" ")
      ? normalized.includes(` ${trigger} `)
      : terms.has(stem(trigger));
    if (!matched) continue;
    for (const addition of additions) for (const token of retrievalTokens(addition)) if (!terms.has(token)) expanded.add(token);
  }
  return { terms, expanded };
}

function normalizedPhrase(value: string): string {
  return retrievalTokens(value).join(" ");
}

interface Hit {
  /** Weighted count of matched terms: a typed term counts 1, a synonym-expanded term counts less. */
  weight: number;
  /** Distinct matched terms, used for the "one broad word is not enough" rule. */
  matched: string[];
  /** Share of the field's own tokens that the query accounted for. */
  fieldCoverage: number;
  /**
   * Coverage of the tokens that make the field distinctive. "Password Input" is identified by
   * "password"; "input" is shape. Measuring against the distinctive tokens is what lets a name
   * be recognised from the word that actually names it, without letting shape words alone do it.
   */
  distinctiveCoverage: number;
  /** How many distinctive tokens the field has, and how many of them the query accounted for. */
  distinctiveTokens: number;
  distinctiveMatches: number;
}

const EXPANDED_TERM_WEIGHT = 0.65;

function hit(terms: Set<string>, expanded: Set<string>, value: string): Hit {
  const tokens = retrievalTokens(value);
  const matched = tokens.filter((token) => terms.has(token) || expanded.has(token));
  const weight = matched.reduce((total, token) => total + (terms.has(token) ? 1 : EXPANDED_TERM_WEIGHT), 0);
  const distinctive = tokens.filter((token) => !BROAD_TERMS.has(token));
  const distinctiveMatched = matched.filter((token) => !BROAD_TERMS.has(token));
  return {
    weight, matched,
    fieldCoverage: tokens.length ? matched.length / tokens.length : 0,
    distinctiveCoverage: distinctive.length ? distinctiveMatched.length / distinctive.length : 0,
    distinctiveTokens: distinctive.length,
    distinctiveMatches: distinctiveMatched.length,
  };
}

/**
 * Field evidence, deliberately independent of how long the query is. A match is worth more when
 * it accounts for more of the field and when more distinct terms land, and saturates so that a
 * long field cannot win by accumulating incidental words.
 */
function evidence(current: Hit, ceiling: number, saturation: number, distinctiveIdentity: boolean): number {
  if (!current.weight) return 0;
  const coverage = distinctiveIdentity ? Math.max(current.fieldCoverage, current.distinctiveCoverage * 0.8) : current.fieldCoverage;
  const density = 0.55 * Math.min(1, current.weight / saturation) + 0.45 * coverage;
  return ceiling * density;
}

/**
 * Two matched terms is full marks, but a record can only be credited against the terms it could
 * plausibly answer. Counting every word in the sentence instead made the same evidence worth less
 * as soon as unrelated words were typed around it — "documentation" and "documentation for the
 * team" would score a documentation record differently. Counting the terms this record matches
 * anywhere keeps a one-word query honest without reintroducing that length penalty.
 */
const ALIAS_SATURATION = 2;

function recordSaturation(terms: Set<string>, expanded: Set<string>, values: readonly string[]): number {
  const matched = new Set(values.flatMap((value) => hit(terms, expanded, value).matched));
  return Math.min(2, Math.max(1, matched.size));
}

function specific(matched: string[]): boolean {
  return matched.length > 1 || matched.some((token) => !BROAD_TERMS.has(token));
}

function strength(score: number): RetrievalStrength {
  if (score >= 85) return "strong";
  if (score >= 62) return "medium";
  return "weak";
}

interface Signal { score: number; reason: RetrievalScore["reason"] }

/**
 * A canonical name is a record's identity, so matching it on a common word still means the caller
 * named the record — Layout really is what "review the layout" is asking for. An alias is a loose
 * pointer, so the same common word there is only a hint: "actions" must not resolve to Button.
 */
const BROAD_NAME_FACTOR = 0.8;
const BROAD_ALIAS_FACTOR = 0.5;
/** One distinctive word out of a name's several names part of the concept, rather than the whole of it. */
const PARTIAL_NAME_FACTOR = 0.8;

/**
 * Identity is claimed differently by a canonical name and by an alias.
 *
 * A name is the record's own word for itself, so its distinctive part is enough: "Password Input"
 * is identified by "password", because "input" is shape rather than identity.
 *
 * An alias is a pointer somebody added, and Monet's aliases are mostly `<word>-<shape>` compounds —
 * `pin-input`, `file-input`, `range-input`, `toggle-group`, `product layout`. Letting the
 * distinctive half alone claim identity turns every one of those into a trap: "location pins"
 * becomes OTP Input, "a file" becomes File Upload, "date range" becomes Slider. So an alias must be
 * contained in the query as a phrase, or have every one of its own tokens matched, before it counts
 * as identity. A half-matched alias is still evidence — it just goes through the graded path.
 */
function nameSignals(terms: Set<string>, expanded: Set<string>, queryPhrase: string, values: readonly string[], reason: RetrievalScore["reason"], exactScore: number, ceiling: number, broadFactor: number, distinctiveIdentity: boolean, saturation: number): Signal[] {
  return values.flatMap((value) => {
    const phrase = normalizedPhrase(value);
    if (!phrase) return [];
    const current = hit(terms, expanded, value);
    if (!current.weight) return [];
    const whole = ` ${queryPhrase} `.includes(` ${phrase} `)
      || current.fieldCoverage === 1
      || (distinctiveIdentity && current.distinctiveCoverage === 1);
    const factor = specific(current.matched) ? 1 : broadFactor;
    if (whole) return [{ score: exactScore * factor * (current.weight / Math.max(1, current.matched.length)), reason }];
    // A name built from several distinctive words is identified by more than one of them. "File
    // Upload" met by "file" alone is the trap the alias rule already covers — "right click of a
    // file" is not a request to upload one — so one distinctive word out of several is graded as
    // evidence rather than identity, and has to be corroborated to survive the retrieval floor.
    const partOfTheName = distinctiveIdentity && current.distinctiveTokens > 1 && current.distinctiveMatches === 1;
    const partial = evidence(current, ceiling, saturation, distinctiveIdentity) * (partOfTheName ? PARTIAL_NAME_FACTOR : 1);
    return partial ? [{ score: partial * factor, reason }] : [];
  });
}

/** A tier match made only of shape words is not identification either, on the same rule as names and aliases. */
const BROAD_TEXT_FACTOR = 0.6;

/**
 * Scores each value in a tier on its own and keeps the best two, so one precisely matched line of
 * usage guidance reads as evidence while a record cannot win by listing many loosely related ones.
 */
function tierSignals(terms: Set<string>, expanded: Set<string>, values: readonly string[], ceiling: number, reason: RetrievalScore["reason"], saturation: number): Signal[] {
  return values
    .map((value) => hit(terms, expanded, value))
    .filter((current) => current.weight > 0)
    .map((current) => ({ score: evidence(current, ceiling, saturation, false) * (specific(current.matched) ? 1 : BROAD_TEXT_FACTOR), reason }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);
}

/**
 * Combines the strongest signal with a bounded contribution from corroborating ones, so a record
 * that matches its name and its usage guidance outranks one that only matches its name.
 */
export function scoreRetrieval(query: string, fields: RetrievalFields): RetrievalScore | null {
  const { terms, expanded } = expandQuery(query);
  if (!terms.size) return null;
  const queryPhrase = [...terms, ...expanded].join(" ");
  const aliases = [...(fields.aliases ?? []), ...(fields.retrievalTerms ?? [])];
  const tags = fields.tags ?? [];
  const categories = fields.categories ?? [];
  const summary = textValues(fields.summaryText ?? []);
  const detail = textValues(fields.detailText ?? []);
  const weak = textValues(fields.weakText ?? []);
  const saturation = recordSaturation(terms, expanded, [fields.name, ...aliases, ...tags, ...categories, ...summary, ...detail, ...weak]);

  const signals: Signal[] = [
    ...nameSignals(terms, expanded, normalizedPhrase(query), [fields.name], "direct_name_match", 100, 74, BROAD_NAME_FACTOR, true, saturation),
    // An alias is matched as a unit or it is weak evidence, so it never gets the relaxed count
    // credit a record earns for having little else to match. Half of "product layout" is not a hit.
    ...nameSignals(terms, expanded, queryPhrase, aliases, "alias_match", 92, 70, BROAD_ALIAS_FACTOR, false, ALIAS_SATURATION),
  ];

  signals.push(...tierSignals(terms, expanded, tags, 66, "tag_match", saturation));
  // Categories name a drawer of the taxonomy, not a decision, so they can support a record that
  // already matched but can never carry one over the retrieval floor on their own.
  signals.push(...tierSignals(terms, expanded, categories, 34, "tag_match", saturation));
  signals.push(...tierSignals(terms, expanded, summary, 72, "text_match", saturation));
  signals.push(...tierSignals(terms, expanded, detail, 58, "text_match", saturation));
  signals.push(...tierSignals(terms, expanded, weak, 40, "text_match", saturation));

  const ranked = signals.filter((signal) => signal.score > 0).sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (!best) return null;
  // Corroboration is a bonus on evidence, so it scales with the evidence. Without that, a handful
  // of incidental prose hits can lift a record the primary signal deliberately demoted.
  const supporting = ranked.slice(1).reduce((total, signal) => total + signal.score, 0);
  const corroboration = Math.min(14, 0.22 * supporting, 0.18 * best.score);
  const score = Math.round(Math.min(100, best.score + corroboration));
  return { score, reason: best.reason, strength: strength(score) };
}

export function retrievalAliases(kind: Exclude<RetrievalEntityKind, "reference">, id: string): string[] {
  return RETRIEVAL_ALIASES[kind][id] ?? [];
}
