import { z } from "zod";
import type { ComponentDecision, Foundation, MarkdownDocument, Principle, Source, TaxonomyCategory, ThemeMode } from "./model.js";

const id = z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/);
const version = z.string().regex(/^\d+\.\d+\.\d+$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const text = z.string().min(1).max(30000);
const url = z.string().url().refine((value) => value.startsWith("https://"), "Sources must use HTTPS.");
export const presetSelectionSchema = z.object({ id, version, sha256: hash }).strict();
export type PresetSelection = z.infer<typeof presetSelectionSchema>;
/** Reused by the Profile picker and durable Project onboarding. */
export const profileSeedSchema = z.discriminatedUnion("kind", [
  z.object({ name: z.string().trim().min(1).max(100), kind: z.literal("scratch") }).strict(),
  z.object({ name: z.string().trim().min(1).max(100), kind: z.literal("monet-starter") }).strict(),
  z.object({ name: z.string().trim().min(1).max(100), kind: z.literal("preset"), preset: presetSelectionSchema }).strict(),
]);
export type ProfileSeed = z.infer<typeof profileSeedSchema>;

export const presetManifestSchema = z.object({
  package_version: z.literal(1), monet_schema: z.literal(1), id, name: text, version,
  adaptation_version: version, description: text, best_for: z.array(text).min(1).max(10),
  characteristics: z.array(text).min(1).max(12), supported_modes: z.union([z.tuple([z.literal("light")]), z.tuple([z.literal("light"), z.literal("dark")])]),
  upstream: z.object({ name: text, repository: url, documentation: url, revision: z.string().regex(/^[a-f0-9]{40}$/) }).strict(),
  license: text, attribution: text, notices: z.array(z.object({ title: text, text, source_url: url }).strict()).min(1).max(12),
  omissions: z.array(text).min(1).max(30),
  sources: z.array(z.object({ id, url, revision: z.string().regex(/^[a-f0-9]{40}$/), sha256: hash, license: text }).strict()).min(1).max(150),
  provenance: z.array(z.object({ record: z.string().regex(/^(principle|foundation|token|component|pattern|taxonomy|source):[a-z0-9][a-z0-9.-]*$/),
    kind: z.enum(["upstream-fact", "monet-adaptation", "monet-authored"]), sources: z.array(id).max(40), explanation: text,
  }).strict()).min(1).max(1000),
}).strict();
export type PresetManifest = z.infer<typeof presetManifestSchema>;

export interface PresetRecords {
  principles: Principle[]; foundations: Foundation[]; taxonomy: TaxonomyCategory[];
  components: ComponentDecision[]; patterns: MarkdownDocument[]; sources: Source[];
}
export interface PresetPackage { manifest: PresetManifest; records: PresetRecords }
export interface PresetSummary {
  selection: PresetSelection; name: string; description: string; best_for: string[];
  characteristics: string[]; supported_modes: ThemeMode[]; upstream: PresetManifest["upstream"]; attribution: string;
}
export interface PresetDetail extends PresetSummary {
  manifest: PresetManifest;
  /** Native records for inspection; preview renders a fixed illustration, never upstream code. */
  records: PresetRecords;
}
export const presetReceiptSchema = z.object({ version: z.literal(1), selection: presetSelectionSchema, manifest: presetManifestSchema,
  initial_files: z.record(z.string().regex(/^(principles|foundations|taxonomy|components|patterns|sources)\/[a-z0-9-]+\.(json|md)$/), hash),
}).strict();
export type PresetReceipt = z.infer<typeof presetReceiptSchema>;
