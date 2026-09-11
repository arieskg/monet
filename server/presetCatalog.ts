import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import type { ProfileIdentity } from "../shared/profiles.js";
import type { Workspace } from "../shared/model.js";
import { presetReceiptSchema, presetSelectionSchema, type PresetDetail, type PresetPackage, type PresetReceipt, type PresetSelection, type PresetSummary } from "../shared/presets.js";
import { resolveThemeTokens, resolveTokens, themeModes } from "../shared/tokens.js";
import { atomicWrite } from "./durableFiles.js";
import { renderFrontmatter, renderPrinciple, loadWorkspace } from "./fileStore.js";
import { parsePresetPackage } from "./presetSchema.js";
import { validateWorkspace } from "./validate.js";
import { withWorkspaceRead } from "./writeLock.js";
import { workspaceRoot, workspaceScope, withProfile } from "./workspace.js";

const bundled = fileURLToPath(new URL("../presets/catalog/", import.meta.url));
export const PRESET_RECEIPT = "PRESET.json";
export const PRESET_NOTICES = "PRESET-LICENSES.txt";
const sha256 = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const fail = (message: string) => Object.assign(new Error(message), { status: 409 });
async function boundedRead(file: string, limit = 2 * 1024 * 1024): Promise<string> {
  const stat = await lstat(file);
  if (!stat.isFile() || stat.nlink !== 1 || stat.size > limit) throw fail("Invalid preset package storage.");
  return readFile(file, "utf8");
}
export function presetRecordKeys(bundle: PresetPackage): string[] {
  const r = bundle.records;
  return [
    ...r.principles.map((v) => `principle:${v.id}`), ...r.foundations.map((v) => `foundation:${v.id}`),
    ...r.foundations.flatMap((v) => v.tokens.map((t) => `token:${t.name}`)), ...r.components.map((v) => `component:${v.id}`),
    ...r.patterns.map((v) => `pattern:${v.id}`), ...r.taxonomy.map((v) => `taxonomy:${v.id}`), ...r.sources.map((v) => `source:${v.id}`),
  ];
}
/** Validate the complete native projection in memory before even creating a Profile stage. */
export function validatePreset(bundle: PresetPackage): void {
  const { records: r, manifest: m } = bundle;
  const unique = (items: string[], label: string) => { if (new Set(items).size !== items.length) throw fail(`Duplicate preset ${label}.`); };
  const keys = presetRecordKeys(bundle);
  unique(keys, "record"); unique(m.provenance.map((p) => p.record), "provenance"); unique(m.sources.map((p) => p.id), "source");
  unique(r.taxonomy.flatMap((c) => c.entries.map((e) => e.id)), "component taxonomy entry");
  unique(r.foundations.flatMap((f) => f.tokens.map((t) => t.id)), "token identity");
  const sources = new Set(m.sources.map((s) => s.id)), provenance = new Set(m.provenance.map((p) => p.record));
  if (keys.some((key) => !provenance.has(key)) || m.provenance.some((p) => !keys.includes(p.record) || p.sources.some((s) => !sources.has(s)) || p.kind !== "monet-authored" && !p.sources.length)) throw fail("Preset provenance must cover every record and resolve its sources.");
  if (r.foundations.some((f) => f.tokens.some((t) => t.foundation !== f.id))) throw fail("Preset token Foundation mismatch.");
  const sourceIds = new Set(r.sources.map((s) => s.id));
  if (r.components.some((c) => c.selection && !sourceIds.has(c.selection.source))) throw fail("Preset component source is missing.");
  const componentIds = new Set(r.taxonomy.flatMap((c) => c.entries.map((e) => e.id)));
  if (r.sources.some((s) => s.mappings.some((m) => (!m.canonical_id || !componentIds.has(m.canonical_id)))) || r.taxonomy.some((c) => c.entries.some((e) => e.category !== c.id))) throw fail("Preset taxonomy/source mapping mismatch.");
  const modes = themeModes(r.foundations, null);
  if (JSON.stringify(modes) !== JSON.stringify(m.supported_modes)) throw fail("Preset declared modes do not match Foundation values.");
  const resolution = resolveThemeTokens(r.foundations, null, "light");
  const workspace: Workspace = { ...r, primitiveTaxonomy: [], primitives: [], references: [], referenceAnalysis: { summary: "", recurring_preferences: [], suggestions: [], analyzed_at: "" },
    decisionLog: [], themes: [], defaultThemeId: "", activeThemeId: "default", activeMode: "light", modes, baseResolvedTokens: resolveTokens(r.foundations).tokens,
    resolvedTokens: resolution.tokens, tokenIssues: resolution.issues, filesRoot: "",
  };
  const findings = validateWorkspace(workspace).filter((f) => f.level === "error");
  if (findings.length) throw fail(`Invalid preset records: ${findings.map((f) => f.detail).join("; ")}`);
}
export function presetFiles(bundle: PresetPackage): Record<string, string> {
  const json = (value: unknown) => JSON.stringify(value, null, 2) + "\n";
  return Object.fromEntries([
    ...bundle.records.principles.map((p) => [`principles/${p.id}.md`, renderPrinciple(p)]),
    ...bundle.records.foundations.map((f) => [`foundations/${f.id}.json`, json(f)]),
    ...bundle.records.patterns.map((p) => [`patterns/${p.id}.md`, renderFrontmatter(p)]),
    ["taxonomy/components.json", json(bundle.records.taxonomy)], ["components/decisions.json", json(bundle.records.components)], ["sources/registry.json", json(bundle.records.sources)],
  ]);
}
export function presetNotices(bundle: Pick<PresetPackage, "manifest">): string {
  const m = bundle.manifest;
  return `${m.name} ${m.version}\n${m.attribution}\n\nAdaptation ${m.adaptation_version}: records renamed, selected and condensed for Monet. See PRESET.json for exact sources, changes and omissions. Initial provenance describes the imported seed; later edits belong to this Profile.\n\n${m.notices.map((n) => `${n.title}\n${n.source_url}\n\n${n.text}`).join("\n\n")}\n`;
}
export class PresetCatalog {
  /** Alternate directory is only a server-side test/maintenance seam, never an API input. */
  constructor(private directory = bundled) {}
  private async entries(): Promise<PresetSelection[]> {
    const entries = z.array(presetSelectionSchema).min(1).max(20).parse(JSON.parse(await boundedRead(path.join(this.directory, "index.json"), 20000)));
    if (new Set(entries.map((e) => e.id)).size !== entries.length) throw fail("Duplicate preset catalog identity.");
    return entries;
  }
  async load(selection: PresetSelection): Promise<PresetPackage> {
    presetSelectionSchema.parse(selection);
    const entry = (await this.entries()).find((e) => e.id === selection.id);
    if (!entry) throw fail("Unknown preset. Choose a bundled preset.");
    if (entry.version !== selection.version || entry.sha256 !== selection.sha256) throw fail("This preset version is unavailable or changed. Inspect the current preset before creating a Profile.");
    const bytes = await boundedRead(path.join(this.directory, `${entry.id}.json`));
    if (sha256(bytes) !== entry.sha256) throw fail("Preset package checksum mismatch. Reinstall or repair the bundled package.");
    const bundle = parsePresetPackage(JSON.parse(bytes));
    if (bundle.manifest.id !== entry.id || bundle.manifest.version !== entry.version) throw fail("Preset package identity/version mismatch.");
    validatePreset(bundle);
    return bundle;
  }
  async list(): Promise<PresetSummary[]> {
    return Promise.all((await this.entries()).map(async (selection) => {
      const { manifest: m } = await this.load(selection);
      return { selection, name: m.name, description: m.description, best_for: m.best_for, characteristics: m.characteristics,
        supported_modes: m.supported_modes, upstream: m.upstream, attribution: m.attribution };
    }));
  }
  async detail(id: string): Promise<PresetDetail> {
    const entry = (await this.list()).find((e) => e.selection.id === id);
    if (!entry) throw fail("Unknown preset.");
    const bundle = await this.load(entry.selection);
    return { ...entry, ...bundle };
  }
}
/** Only used for a new, private staging directory owned by ProfileRegistry. */
export async function instantiatePreset(destination: string, selection: PresetSelection, bundle: PresetPackage): Promise<string> {
  const files = presetFiles(bundle);
  for (const [relative, contents] of Object.entries(files)) await atomicWrite(path.join(destination, relative), contents);
  const receipt: PresetReceipt = { version: 1, selection, manifest: bundle.manifest, initial_files: Object.fromEntries(Object.entries(files).map(([key, bytes]) => [key, sha256(bytes)])) };
  const bytes = JSON.stringify(receipt, null, 2) + "\n";
  await atomicWrite(path.join(destination, PRESET_RECEIPT), bytes);
  await atomicWrite(path.join(destination, PRESET_NOTICES), presetNotices(bundle));
  return sha256(bytes);
}
/** A snapshot read: no catalog lookup, so existing/forked Profiles work after removal or update. */
export async function readPresetReceipt(): Promise<PresetReceipt | null> {
  return withWorkspaceRead(async () => {
    try {
      const bytes = await boundedRead(path.join(workspaceRoot(), PRESET_RECEIPT));
      const origin = workspaceScope().identity?.origin;
      if (origin?.preset_receipt_sha256 && sha256(bytes) !== origin.preset_receipt_sha256) throw fail("Preset provenance snapshot checksum mismatch.");
      const receipt = presetReceiptSchema.parse(JSON.parse(bytes));
      if (origin?.preset && JSON.stringify(origin.preset) !== JSON.stringify(receipt.selection)) throw fail("Preset provenance identity mismatch.");
      return receipt;
    }
    catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT" && !workspaceScope().identity?.origin.preset) return null; throw e; }
  });
}

/** Recovery verifies the already-pinned seed, without requiring today's catalog. A missing or
 * altered file retains publication evidence and fails closed; it is never treated as a new root. */
export async function verifyPresetPublication(root: string, identity: ProfileIdentity): Promise<void> {
  try {
    if (!isDeepStrictEqual(JSON.parse(await boundedRead(path.join(root, "profile.json"))), identity)) throw fail("Preset publication identity mismatch.");
    await withProfile(Object.freeze({ root, identity }), async () => {
      const receipt = await readPresetReceipt();
      if (!receipt) throw fail("Missing preset provenance snapshot.");
      for (const [relative, hash] of Object.entries(receipt.initial_files)) {
        if (sha256(await boundedRead(path.join(root, relative))) !== hash) throw fail("Preset publication record checksum mismatch.");
      }
      if (await boundedRead(path.join(root, PRESET_NOTICES)) !== presetNotices(receipt)) throw fail("Preset publication notices mismatch.");
      const errors = validateWorkspace(await loadWorkspace()).filter((f) => f.level === "error");
      if (errors.length) throw fail("Preset publication records failed validation.");
    });
  } catch (e) { throw fail(`Preset publication requires repair; evidence retained. ${e instanceof Error ? e.message : "Invalid seed."}`); }
}
