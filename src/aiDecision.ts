export type AiDecisionKind = "Principle" | "Pattern" | "Foundation" | "Primitive" | "Component" | "Source";

const status = "undecided | selected | needs_review | experimental | do_not_use";
const componentStatus = "selected (Use) | do_not_use (No use)";
const shapes: Record<AiDecisionKind, unknown> = {
  Principle: { id: "string (preserve)", title: "string", body: "Markdown string", order: "number", updated_at: "ISO date string (preserve)" },
  Pattern: { id: "string (preserve)", title: "string", summary: "string", body: "Markdown string", status, tags: ["string"], order: "number", updated_at: "ISO date string (preserve)", components: ["component-id"], foundations: ["foundation-id"] },
  Foundation: { id: "string (preserve)", name: "string", status, description: "string", rationale: "string", guidance: "string", notes: "string", order: "number", tokens: [{ id: "string", name: "dot.separated.name", foundation: "foundation-id", type: "color | dimension | number | font-family | font-size | font-weight | duration | cubic-bezier | shadow | border | breakpoint | z-index", level: "primitive | semantic | component", value: "string or number; references use {token.name}", description: "string", alias: "optional string", order: "number" }], updated_at: "ISO date string (preserve)" },
  Primitive: { id: "string (preserve)", status, purpose: "string", preferences: { "preference-name": "string" }, tokens: ["token.name"], inspiration: { source: "source-id", source_item: "upstream item" }, notes: "string", updated_at: "ISO date string (preserve)" },
  Component: { id: "string (preserve)", status: componentStatus, selection: { source: "source-id", source_component: "upstream component" }, preferences: { "preference-name": "string" }, notes: "short optional string", updated_at: "ISO date string (preserve)", behavior: { "optional-existing-behavior": true }, rationale: "optional existing string", use_when: ["optional existing string"], avoid_when: ["optional existing string"], foundations: ["optional existing foundation-id"], primitives: ["optional existing primitive-id"] },
  Source: { id: "string (preserve)", name: "string", type: "npm | github | registry | manual | reference", homepage: "URL string", repository: "URL string", framework: "string", package: "string", license: "string", notes: "string", enabled: "boolean", mappings: [{ upstream: "string", target_type: "component | primitive", canonical_id: "canonical id or null", status: "mapped | needs_review | unmapped | ignored | no_equivalent", confidence: "optional high | medium | low | none", match_type: "optional exact | equivalent | variant | composition | related", primary: "optional boolean", aliases: ["optional string"], documentation: "optional URL string", description: "optional string", category: "optional string", props_api: ["optional string"], usage_examples: ["optional string"], rationale: "optional string", mapped_by: "optional ai | manual" }], updated_at: "ISO date string (preserve)" },
};

export function buildDecisionInstructions(kind: AiDecisionKind, context = ""): string {
  return [
    `Help me refine a ${kind.toLowerCase()} decision in Monet, my personal design-system workspace.`,
    context ? `Decision context: ${context}` : "",
    kind === "Component" ? "Help refine this component decision while keeping it lightweight." : "Review the current record, make a concrete recommendation, and return the complete updated record.",
    kind === "Component"
      ? "Focus on the selected inspiration, a small number of meaningful preferences, an optional short note, and status. Preserve id and updated_at. Candidates and history stay outside this handoff, so do not add them."
      : "Preserve the record id. Preserve updated_at, history, candidates, and ordering unless a requested decision requires changing them.",
    kind === "Component" ? "Components inherit Monet Principles, Foundations, and Patterns. Do not repeat global accessibility, typography, spacing, color, or pattern guidance inside the component." : "",
    kind === "Component" ? "Preserve any existing behavior, rationale, use_when, avoid_when, foundations, and primitives values unless the user explicitly requests advanced guidance or the requested change requires editing them. You may omit unchanged optional advanced keys. Do not invent detailed rules simply to fill fields." : "",
    kind === "Source" ? "Map high- and medium-confidence matches immediately. Use needs_review for low-confidence but plausible matches, and leave a component unmapped only when no reasonable Monet concept exists. Do not wait for manual approval." : "",
    "Use only valid referenced IDs already present in the current record or context. Do not add commentary or Markdown fences around the result.",
    "Return exactly one valid JSON object matching this JSON data shape:",
    JSON.stringify(shapes[kind], null, 2),
  ].filter(Boolean).join("\n\n");
}

export function buildDecisionJson(kind: AiDecisionKind, value: { id: string }): string {
  if (kind !== "Component") return JSON.stringify(value, null, 2);
  const decision = { ...value } as Record<string, unknown>;
  delete decision.candidates;
  delete decision.history;
  for (const key of ["behavior", "rationale", "use_when", "avoid_when", "foundations", "primitives"]) {
    const field = decision[key];
    if (field === "" || (Array.isArray(field) && field.length === 0) || (object(field) && Object.keys(field).length === 0)) delete decision[key];
  }
  return JSON.stringify(decision, null, 2);
}

export function buildDecisionClipboardText(instructions: string, json: string): string {
  return [instructions.trim(), "Current record:", json.trim()].filter(Boolean).join("\n\n");
}

export function buildDecisionPrompt(kind: AiDecisionKind, value: { id: string }, context = ""): string {
  return buildDecisionClipboardText(buildDecisionInstructions(kind, context), buildDecisionJson(kind, value));
}

export function restoreProtectedDecisionFields(kind: AiDecisionKind, value: unknown, current: { id: string }): unknown {
  if (kind !== "Component" || !object(value)) return value;
  const record = current as Record<string, unknown>;
  const advanced = Object.fromEntries(["behavior", "rationale", "use_when", "avoid_when", "foundations", "primitives"].map((key) => [key, value[key] === undefined ? record[key] : value[key]]));
  return { ...value, ...advanced, selection: value.selection === undefined ? record.selection : value.selection, candidates: record.candidates, history: record.history };
}

function object(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function strings(value: unknown): value is string[] { return Array.isArray(value) && value.every((item) => typeof item === "string"); }
function field(record: Record<string, unknown>, key: string, type: "string" | "number" | "boolean"): boolean { return typeof record[key] === type; }
function recordOf(record: unknown, type: "string" | "boolean"): boolean { return object(record) && Object.values(record).every((value) => typeof value === type); }
function oneOf(value: unknown, values: readonly string[]): boolean { return typeof value === "string" && values.includes(value); }
function validStatus(value: unknown): boolean { return ["undecided", "selected", "needs_review", "experimental", "do_not_use"].includes(String(value)); }
function validComponentStatus(value: unknown): boolean { return oneOf(value, ["selected", "do_not_use"]); }
function base(value: unknown): value is Record<string, unknown> { return object(value) && field(value, "id", "string") && field(value, "updated_at", "string"); }

function markdown(value: unknown): boolean {
  return base(value) && field(value, "title", "string") && field(value, "summary", "string") && field(value, "body", "string") && validStatus(value.status) && strings(value.tags) && field(value, "order", "number") && (value.components === undefined || strings(value.components)) && (value.foundations === undefined || strings(value.foundations));
}

function principle(value: unknown): boolean {
  return base(value) && field(value, "title", "string") && field(value, "body", "string") && field(value, "order", "number");
}

function foundation(value: unknown): boolean {
  return base(value) && field(value, "name", "string") && validStatus(value.status) && field(value, "description", "string") && field(value, "rationale", "string") && field(value, "guidance", "string") && field(value, "notes", "string") && field(value, "order", "number") && Array.isArray(value.tokens) && value.tokens.every((token) => object(token) && field(token, "id", "string") && field(token, "name", "string") && field(token, "foundation", "string") && oneOf(token.type, ["color", "dimension", "number", "font-family", "font-size", "font-weight", "duration", "cubic-bezier", "shadow", "border", "breakpoint", "z-index"]) && oneOf(token.level, ["primitive", "semantic", "component"]) && (typeof token.value === "string" || typeof token.value === "number") && field(token, "description", "string") && field(token, "order", "number") && (token.alias === undefined || typeof token.alias === "string"));
}

function primitive(value: unknown): boolean {
  return base(value) && validStatus(value.status) && field(value, "purpose", "string") && recordOf(value.preferences, "string") && strings(value.tokens) && field(value, "notes", "string") && (value.inspiration === null || (object(value.inspiration) && field(value.inspiration, "source", "string") && field(value.inspiration, "source_item", "string")));
}

function component(value: unknown): boolean {
  return base(value) && validComponentStatus(value.status) && (value.selection === null || (object(value.selection) && field(value.selection, "source", "string") && field(value.selection, "source_component", "string"))) && recordOf(value.preferences, "string") && recordOf(value.behavior, "boolean") && field(value, "rationale", "string") && field(value, "notes", "string") && strings(value.use_when) && strings(value.avoid_when) && strings(value.foundations) && strings(value.primitives) && Array.isArray(value.candidates) && value.candidates.every((candidate) => object(candidate) && field(candidate, "source", "string") && field(candidate, "source_component", "string") && field(candidate, "description", "string") && oneOf(candidate.preview, ["adapter", "reference", "snippet"]) && (candidate.documentation === undefined || typeof candidate.documentation === "string") && (candidate.snippet === undefined || typeof candidate.snippet === "string") && (candidate.language === undefined || oneOf(candidate.language, ["tsx", "jsx", "html", "css", "text"]))) && Array.isArray(value.history) && value.history.every((item) => object(item) && field(item, "date", "string") && field(item, "change", "string") && (item.old_selection === null || typeof item.old_selection === "string") && (item.new_selection === null || typeof item.new_selection === "string") && field(item, "rationale", "string"));
}

function source(value: unknown): boolean {
  return base(value) && field(value, "name", "string") && oneOf(value.type, ["npm", "github", "registry", "manual", "reference"]) && field(value, "homepage", "string") && field(value, "repository", "string") && field(value, "framework", "string") && field(value, "package", "string") && field(value, "license", "string") && field(value, "notes", "string") && field(value, "enabled", "boolean") && Array.isArray(value.mappings) && value.mappings.every((mapping) => object(mapping) && field(mapping, "upstream", "string") && oneOf(mapping.target_type, ["component", "primitive"]) && (mapping.canonical_id === null || typeof mapping.canonical_id === "string") && oneOf(mapping.status, ["mapped", "needs_review", "unmapped", "ignored", "no_equivalent"]) && (mapping.confidence === undefined || oneOf(mapping.confidence, ["high", "medium", "low", "none"])) && (mapping.match_type === undefined || oneOf(mapping.match_type, ["exact", "equivalent", "variant", "composition", "related"])) && (mapping.primary === undefined || typeof mapping.primary === "boolean") && (mapping.aliases === undefined || strings(mapping.aliases)) && (mapping.documentation === undefined || typeof mapping.documentation === "string") && (mapping.description === undefined || typeof mapping.description === "string") && (mapping.category === undefined || typeof mapping.category === "string") && (mapping.props_api === undefined || strings(mapping.props_api)) && (mapping.usage_examples === undefined || strings(mapping.usage_examples)) && (mapping.rationale === undefined || typeof mapping.rationale === "string") && (mapping.mapped_by === undefined || oneOf(mapping.mapped_by, ["ai", "manual"])));
}

export function validateDecisionJson(kind: AiDecisionKind, value: unknown, expectedId: string): string | null {
  const valid = kind === "Principle" ? principle(value) : kind === "Pattern" ? markdown(value) : kind === "Foundation" ? foundation(value) : kind === "Primitive" ? primitive(value) : kind === "Component" ? component(value) : source(value);
  if (!valid) return `The JSON does not match Monet's ${kind.toLowerCase()} data shape.`;
  if ((value as { id: string }).id !== expectedId) return `The id must remain “${expectedId}”.`;
  return null;
}
