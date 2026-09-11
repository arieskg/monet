import { z } from "zod";
import { presetManifestSchema, type PresetPackage } from "../shared/presets.js";
import { parseFieldValue } from "../shared/proposals.js";

const id = z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/);
const text = z.string().max(30000), short = z.string().max(2000);
const ids = z.array(id).max(100), strings = z.array(short).max(100);
const status = z.enum(["undecided", "selected", "needs_review", "experimental", "do_not_use"]);
const meta = { id, updated_at: z.literal("") };
const token = z.object({ id: z.string().min(1).max(120), name: z.string().regex(/^[a-z][a-z0-9.-]*$/), foundation: id,
  type: z.enum(["color", "dimension", "number", "font-family", "font-size", "font-weight", "duration", "cubic-bezier", "shadow", "border", "breakpoint", "z-index"]),
  level: z.enum(["primitive", "semantic", "component"]), value: z.union([z.string().max(600), z.number()]), description: short,
  order: z.number().int().nonnegative(), modes: z.object({ dark: z.union([z.string().max(600), z.number()]) }).strict().optional(),
}).strict();
const principle = z.object({ ...meta, title: short, body: text, order: z.number().int().nonnegative() }).strict();
const foundation = z.object({ ...meta, name: short, status, description: short, rationale: text, guidance: text, notes: text, order: z.number().int().nonnegative(), tokens: z.array(token).max(400) }).strict();
const taxonomy = z.object({ id, name: short, entries: z.array(z.object({ id, name: short, category: id, description: short, aliases: strings, relationships: ids }).strict()).max(100) }).strict();
const component = z.object({ ...meta, status, selection: z.object({ source: id, source_component: short }).strict().nullable(),
  preferences: z.record(z.string(), short), behavior: z.record(z.string(), z.boolean()), rationale: text, notes: text,
  use_when: strings, avoid_when: strings, foundations: ids, primitives: z.array(z.never()), candidates: z.array(z.never()), history: z.array(z.never()),
}).strict();
const pattern = z.object({ ...meta, title: short, summary: short, body: text, status, tags: strings, order: z.number().int().nonnegative(), components: ids, foundations: ids }).strict();
const source = z.object({ ...meta, name: short, type: z.literal("reference"), homepage: z.string().url(), repository: z.string().url(),
  framework: short, package: short, license: short, notes: text, enabled: z.boolean(),
  mappings: z.array(z.object({ upstream: short, target_type: z.literal("component"), canonical_id: id, status: z.literal("mapped"),
    confidence: z.literal("high"), match_type: z.literal("equivalent"), primary: z.literal(true), documentation: z.string().url(), mapped_by: z.literal("manual"),
  }).strict()).max(100),
}).strict();
/** Strict seed schema, intentionally narrower than the editable workspace. No executable assets,
 * compatibility Themes, private evidence, arbitrary paths, or legacy normalization fallbacks. */
const schema = z.object({ manifest: presetManifestSchema, records: z.object({
  principles: z.array(principle).max(30), foundations: z.array(foundation).max(30), taxonomy: z.array(taxonomy).max(30),
  components: z.array(component).max(100), patterns: z.array(pattern).max(50), sources: z.array(source).min(1).max(10),
}).strict() }).strict();
export function parsePresetPackage(value: unknown): PresetPackage {
  const bundle = schema.parse(value);
  for (const decision of bundle.records.components) {
    parseFieldValue("string_map", decision.preferences);
    parseFieldValue("boolean_map", decision.behavior);
  }
  return bundle;
}
