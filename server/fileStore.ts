import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { GAP_IMAGE_LIMIT, gapInputSchema, type Gap, type GapImage, type GapSummary } from "../shared/gaps.js";
import { diagnoseGap } from "./gapDiagnosis.js";
import type { ComponentDecision, Foundation, MappingConfidence, MappingMatchType, MappingStatus, MarkdownDocument, Principle, PrimitiveDecision, Reference, ReferenceCollectionAnalysis, ReferenceSuggestionStatus, ReferenceType, Source, SourceMapping, Status, TaxonomyCategory, Theme, ThemeMode, Workspace } from "./model.js";
import { THEME_MODES } from "../shared/model.js";
import { analyzeReference, analyzeReferenceCollection } from "./referenceAnalysis.js";
import { generateSourceMappings, type MappingRefreshResult } from "./sourceMapping.js";
import { normalizeFoundation, normalizeTokens, resolveThemeTokens, resolveTokens, themeModes } from "./tokens.js";
import { workspaceRoot } from "./workspace.js";

const STATUSES: Status[] = ["undecided", "selected", "needs_review", "experimental", "do_not_use"];
const MAPPING_STATUSES: MappingStatus[] = ["mapped", "needs_review", "unmapped", "ignored", "no_equivalent"];
const MAPPING_CONFIDENCES: MappingConfidence[] = ["high", "medium", "low", "none"];
const MAPPING_MATCH_TYPES: MappingMatchType[] = ["exact", "equivalent", "variant", "composition", "related"];
/**
 * Every read and write goes through the active workspace root rather than a path baked in at
 * import time, so `MONET_ROOT` or `--root` can point Monet at any workspace before it starts.
 */
const root = workspaceRoot;
const EMPTY_REFERENCE_ANALYSIS: ReferenceCollectionAnalysis = { summary: "", recurring_preferences: [], suggestions: [], analyzed_at: "" };
const REFERENCE_TYPES: ReferenceType[] = ["image", "url", "html", "svg", "pdf", "file"];
const REFERENCE_SUGGESTION_STATUSES: ReferenceSuggestionStatus[] = ["pending", "approved", "dismissed"];
const ASSET_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "avif", "svg", "html", "htm", "pdf", "fig", "sketch", "xd"]);

export interface ReferenceSaveInput extends Reference {
  asset_data_url?: string;
  asset_filename?: string;
}

function cleanId(id: string): string {
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(id)) throw new Error("Invalid record id.");
  return id;
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function status(value: unknown): Status {
  return STATUSES.includes(value as Status) ? value as Status : "undecided";
}

function list(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function referenceDomain(value: string): string {
  if (!value) return "";
  try { return new URL(value).hostname.replace(/^www\./, ""); }
  catch { return ""; }
}

function referenceType(value: unknown, mediaType = "", filename = "", sourceUrl = ""): ReferenceType {
  if (REFERENCE_TYPES.includes(value as ReferenceType)) return value as ReferenceType;
  const extension = filename.split(".").pop()?.toLowerCase();
  if (mediaType === "image/svg+xml" || extension === "svg") return "svg";
  if (mediaType.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "avif"].includes(extension ?? "")) return "image";
  if (mediaType === "text/html" || extension === "html" || extension === "htm") return "html";
  if (mediaType === "application/pdf" || extension === "pdf") return "pdf";
  return sourceUrl ? "url" : "file";
}

function normalizeReference(input: Reference, id: string, previous?: Reference, touch = true): Reference {
  const now = new Date().toISOString();
  const sourceUrl = text(input.source_url).trim();
  const mediaType = text(input.asset_media_type);
  const filename = text(input.original_filename);
  return {
    id,
    title: text(input.title, id).trim() || id,
    type: referenceType(input.type, mediaType, filename, sourceUrl),
    source_url: sourceUrl,
    source_domain: referenceDomain(sourceUrl),
    annotation: text(input.annotation).trim(),
    notes: text(input.notes).trim(),
    asset_path: previous?.asset_path ?? "",
    asset_media_type: previous?.asset_media_type ?? mediaType,
    original_filename: previous?.original_filename ?? filename,
    preview_url: text(input.preview_url),
    ai_tags: list(input.ai_tags),
    ai: input.ai && typeof input.ai === "object" ? input.ai : null,
    created_at: previous?.created_at || text(input.created_at, now),
    updated_at: touch ? now : text(input.updated_at, now),
  };
}

function assetExtension(filename: string, mediaType: string): string {
  const fromName = filename.split(".").pop()?.toLowerCase() ?? "";
  if (ASSET_EXTENSIONS.has(fromName)) return fromName === "jpeg" ? "jpg" : fromName;
  const byMedia: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp", "image/avif": "avif", "image/svg+xml": "svg", "text/html": "html", "application/pdf": "pdf" };
  return byMedia[mediaType] ?? "";
}

async function writeReferenceAsset(id: string, dataUrl: string, filename: string): Promise<{ asset_path: string; asset_media_type: string; original_filename: string }> {
  const match = /^data:([^;,]+);base64,([a-z0-9+/=\r\n]+)$/i.exec(dataUrl);
  if (!match) throw new Error("The selected reference file could not be read.");
  const mediaType = match[1]!.toLowerCase();
  const extension = assetExtension(filename, mediaType);
  if (!extension) throw new Error("Use an image, HTML, SVG, PDF, Figma, Sketch, or Adobe XD file.");
  const bytes = Buffer.from(match[2]!, "base64");
  if (!bytes.length || bytes.length > 10 * 1024 * 1024) throw new Error("Reference files must be no larger than 10 MB.");
  const assetName = `${id}.${extension}`;
  await atomicWrite(path.join(root(), "references", "assets", assetName), bytes);
  return { asset_path: `assets/${assetName}`, asset_media_type: mediaType, original_filename: filename };
}

function overrideMap(value: unknown): Record<string, string | number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter((entry): entry is [string, string | number] => typeof entry[1] === "string" || typeof entry[1] === "number"));
}

/** A theme's mode-specific override maps. Light is the baseline and never a mode; empty maps are dropped so a theme without them stays as it was. */
function themeModeOverrides(value: unknown): Theme["modes"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter((entry): entry is [Exclude<ThemeMode, "light">, unknown] => entry[0] !== "light" && THEME_MODES.includes(entry[0] as ThemeMode))
    .map(([mode, overrides]) => [mode, overrideMap(overrides)] as const)
    .filter(([, overrides]) => Object.keys(overrides).length);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function themeRecord(id: string, raw: Partial<Theme>, updatedAt: string): Theme {
  const modes = themeModeOverrides(raw.modes);
  return { id, name: text(raw.name, id).trim() || id, overrides: overrideMap(raw.overrides), ...(modes ? { modes } : {}), updated_at: updatedAt };
}

function sourceMapping(input: SourceMapping): SourceMapping {
  const canonicalId = typeof input.canonical_id === "string" && input.canonical_id ? input.canonical_id : null;
  const rawStatus = String(input.status);
  let mappingStatus: MappingStatus = MAPPING_STATUSES.includes(rawStatus as MappingStatus) ? rawStatus as MappingStatus : "unmapped";
  if (!canonicalId && (mappingStatus === "mapped" || mappingStatus === "needs_review")) mappingStatus = "unmapped";
  if (canonicalId && mappingStatus === "unmapped") mappingStatus = "mapped";
  const confidence = MAPPING_CONFIDENCES.includes(input.confidence as MappingConfidence) ? input.confidence : canonicalId ? undefined : "none";
  const matchType = MAPPING_MATCH_TYPES.includes(input.match_type as MappingMatchType) ? input.match_type : undefined;
  return {
    ...input,
    upstream: text(input.upstream).trim(),
    target_type: input.target_type === "primitive" ? "primitive" : "component",
    canonical_id: mappingStatus === "ignored" || mappingStatus === "no_equivalent" ? null : canonicalId,
    status: mappingStatus,
    confidence,
    match_type: matchType,
    primary: canonicalId && mappingStatus !== "ignored" && mappingStatus !== "no_equivalent" ? Boolean(input.primary) : false,
    aliases: list(input.aliases),
    props_api: list(input.props_api),
    usage_examples: list(input.usage_examples),
  };
}

function parseFrontmatter(id: string, source: string): MarkdownDocument {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(source);
  const metadata: Record<string, unknown> = {};
  if (match) {
    for (const line of (match[1] ?? "").split("\n")) {
      const separator = line.indexOf(":");
      if (separator < 0) continue;
      const key = line.slice(0, separator).trim();
      const raw = line.slice(separator + 1).trim();
      try { metadata[key] = JSON.parse(raw); } catch { metadata[key] = raw; }
    }
  }
  return {
    id,
    title: text(metadata.title, id),
    summary: text(metadata.summary),
    body: (match?.[2] ?? source).trim(),
    status: status(metadata.status),
    tags: list(metadata.tags),
    order: typeof metadata.order === "number" ? metadata.order : 0,
    updated_at: text(metadata.updated_at),
    components: list(metadata.components),
    foundations: list(metadata.foundations),
  };
}

function renderFrontmatter(document: MarkdownDocument): string {
  const fields: [string, unknown][] = [
    ["title", document.title], ["summary", document.summary], ["status", document.status],
    ["tags", document.tags], ["order", document.order], ["updated_at", document.updated_at],
  ];
  if (document.components?.length) fields.push(["components", document.components]);
  if (document.foundations?.length) fields.push(["foundations", document.foundations]);
  return `---\n${fields.map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join("\n")}\n---\n\n${document.body.trim()}\n`;
}

function parsePrinciple(id: string, source: string): Principle {
  const document = parseFrontmatter(id, source);
  return { id, title: document.title, body: document.body, order: document.order, updated_at: document.updated_at };
}

function renderPrinciple(principle: Principle): string {
  const fields: [string, unknown][] = [
    ["title", principle.title], ["order", principle.order], ["updated_at", principle.updated_at],
  ];
  return `---\n${fields.map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join("\n")}\n---\n\n${principle.body.trim()}\n`;
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, "utf8")) as T;
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === "ENOENT";
}

/**
 * A record set that is not on disk yet reads as empty, everywhere.
 *
 * This is what lets a brand-new workspace behave the same through every transport: the read-only
 * MCP server and the validator open an empty directory and see an empty design system rather than
 * an ENOENT, without either of them writing anything. Materializing the directory structure stays
 * a write, and writes belong to `initializeStore`.
 *
 * Only a genuinely absent path is tolerated. Malformed JSON and permission errors still throw,
 * because those are broken workspaces rather than new ones.
 */
async function readJsonOrEmpty<T>(file: string, fallback: T): Promise<T> {
  try { return await readJson<T>(file); }
  catch (error) { if (isMissing(error)) return fallback; throw error; }
}

async function readDirectoryOrEmpty(directory: string): Promise<string[]> {
  try { return await readdir(directory); }
  catch (error) { if (isMissing(error)) return []; throw error; }
}

async function atomicWrite(file: string, contents: string | Uint8Array): Promise<void> {
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, contents, { mode: 0o600 });
    await rename(temp, file);
  } finally { await unlink(temp).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; }); }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await atomicWrite(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function readMarkdownDirectory(directory: string): Promise<MarkdownDocument[]> {
  const entries = (await readDirectoryOrEmpty(directory)).filter((name) => name.endsWith(".md")).sort();
  return Promise.all(entries.map(async (name) => parseFrontmatter(name.slice(0, -3), await readFile(path.join(directory, name), "utf8"))));
}

async function readPrinciplesDirectory(directory: string): Promise<Principle[]> {
  const entries = (await readDirectoryOrEmpty(directory)).filter((name) => name.endsWith(".md")).sort();
  return Promise.all(entries.map(async (name) => parsePrinciple(name.slice(0, -3), await readFile(path.join(directory, name), "utf8"))));
}

/**
 * An undecided component carries no selection. `selection` is the approved source inspiration, so
 * leaving one on an undecided record makes the workspace, the exports, and the MCP payload look as
 * though a decision exists. The candidates keep the same sources available without claiming one.
 */
export function componentSelection(input: Pick<ComponentDecision, "status" | "selection">): ComponentDecision["selection"] {
  if (status(input.status) === "undecided") return null;
  return input.selection && typeof input.selection === "object" ? input.selection : null;
}

function sortDocuments<T extends { order: number; title?: string; name?: string }>(items: T[]): T[] {
  return items.sort((a, b) => a.order - b.order || (a.title ?? a.name ?? "").localeCompare(b.title ?? b.name ?? ""));
}

async function readThemes(): Promise<{ themes: Theme[]; defaultThemeId: string }> {
  const directory = path.join(root(), "themes");
  const files = (await readDirectoryOrEmpty(directory)).filter((name) => name.endsWith(".json") && name !== "config.json").sort();
  const themes = await Promise.all(files.map(async (name) => {
    const raw = await readJson<Theme>(path.join(directory, name));
    return themeRecord(cleanId(name.slice(0, -5)), raw, text(raw.updated_at));
  }));
  let defaultThemeId = themes[0]?.id ?? "default";
  try {
    const config = await readJson<{ default_theme?: unknown }>(path.join(directory, "config.json"));
    if (typeof config.default_theme === "string" && themes.some((theme) => theme.id === config.default_theme)) defaultThemeId = config.default_theme;
  } catch { /* initializeStore creates the config; tolerate older workspaces. */ }
  return { themes, defaultThemeId };
}

export async function loadWorkspace(requestedThemeId?: string, requestedMode?: ThemeMode): Promise<Workspace> {
  const foundationFiles = (await readDirectoryOrEmpty(path.join(root(), "foundations"))).filter((name) => name.endsWith(".json")).sort();
  const foundations = await Promise.all(foundationFiles.map(async (name) => normalizeFoundation(await readJson<Foundation>(path.join(root(), "foundations", name)))));
  const baseResolution = resolveTokens(foundations);
  const { themes, defaultThemeId } = await readThemes();
  const activeTheme = themes.find((theme) => theme.id === requestedThemeId) ?? themes.find((theme) => theme.id === defaultThemeId) ?? themes[0] ?? null;
  const modes = themeModes(foundations, activeTheme);
  // A mode the theme cannot resolve falls back to light rather than failing: light is the value
  // every token already carries, and the workspace's `modes` says what was actually available.
  const activeMode: ThemeMode = requestedMode && modes.includes(requestedMode) ? requestedMode : "light";
  const resolution = resolveThemeTokens(foundations, activeTheme, activeMode);
  const components = (await readJsonOrEmpty<ComponentDecision[]>(path.join(root(), "components", "decisions.json"), [])).map((item) => ({
    ...item,
    selection: componentSelection(item),
    preferences: item.preferences && typeof item.preferences === "object" ? item.preferences : {},
    behavior: item.behavior && typeof item.behavior === "object" ? item.behavior : {},
    rationale: text(item.rationale), notes: text(item.notes), use_when: list(item.use_when), avoid_when: list(item.avoid_when), foundations: list(item.foundations), primitives: list(item.primitives), candidates: Array.isArray(item.candidates) ? item.candidates : [], history: Array.isArray(item.history) ? item.history : [],
  }));
  const sources = (await readJsonOrEmpty<Source[]>(path.join(root(), "sources", "registry.json"), [])).map((source) => ({ ...source, mappings: (Array.isArray(source.mappings) ? source.mappings : []).map(sourceMapping) }));
  const references = (await readJsonOrEmpty<Reference[]>(path.join(root(), "references", "registry.json"), [])).map((reference) => normalizeReference(reference, cleanId(reference.id), reference, false));
  const referenceAnalysis = await readJsonOrEmpty<ReferenceCollectionAnalysis>(path.join(root(), "references", "analysis.json"), EMPTY_REFERENCE_ANALYSIS);
  return {
    principles: sortDocuments(await readPrinciplesDirectory(path.join(root(), "principles"))),
    foundations: sortDocuments(foundations),
    taxonomy: await readJsonOrEmpty<TaxonomyCategory[]>(path.join(root(), "taxonomy", "components.json"), []),
    primitiveTaxonomy: await readJsonOrEmpty<TaxonomyCategory[]>(path.join(root(), "taxonomy", "primitives.json"), []),
    primitives: await readJsonOrEmpty<PrimitiveDecision[]>(path.join(root(), "primitives", "decisions.json"), []),
    components,
    patterns: sortDocuments(await readMarkdownDirectory(path.join(root(), "patterns"))),
    sources,
    references,
    referenceAnalysis,
    decisionLog: (await readMarkdownDirectory(path.join(root(), "decisions"))).sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    themes,
    defaultThemeId,
    activeThemeId: activeTheme?.id ?? "default",
    activeMode,
    modes,
    baseResolvedTokens: baseResolution.tokens,
    resolvedTokens: resolution.tokens,
    tokenIssues: resolution.issues,
    filesRoot: root(),
  };
}

export async function regenerateExports(): Promise<void> {
  const workspace = await loadWorkspace();
  const activeTheme = workspace.themes.find((theme) => theme.id === workspace.activeThemeId) ?? null;
  const darkResolution = workspace.modes.includes("dark")
    ? new Map(resolveThemeTokens(workspace.foundations, activeTheme, "dark").tokens.map((token) => [token.name, token.resolved_value]))
    : null;
  const entries = workspace.taxonomy.flatMap((category) => category.entries.map((entry) => ({ ...entry, categoryName: category.name })));
  const primitiveEntries = workspace.primitiveTaxonomy.flatMap((category) => category.entries);
  const selected = workspace.components.filter((item) => item.status === "selected" || item.status === "do_not_use");
  const selectedPrimitives = workspace.primitives.filter((item) => item.status !== "undecided");
  const system = [
    "# Monet Design System", "", "This file is generated from the canonical Monet workspace files.", "",
    "## Principles", "", ...workspace.principles.flatMap((item) => [`### ${item.title}`, "", item.body.replace(/^#\s+[^\n]+\n*/, "").trim(), ""]),
    "## Foundations", "", ...workspace.foundations.map((item) => `- **${item.name}** (${item.status}) — ${item.description}`), "",
    "## Active theme", "", `${workspace.themes.find((theme) => theme.id === workspace.activeThemeId)?.name ?? "Default"} (${workspace.activeThemeId})`, "",
    "Theme files contain overrides only. Resolved values below are Base Monet plus the active theme, in light mode.",
    ...(darkResolution ? ["", `This theme also resolves in dark mode. Where a token's dark value differs it is listed as \`dark:\`; every other token keeps its light value in both modes. The complete dark resolution is in \`tokens/themes/${workspace.activeThemeId}.dark.json\`.`] : []), "",
    "## Tokens", "", ...workspace.foundations.flatMap((foundation) => [
      `### ${foundation.name}`,
      "",
      ...foundation.tokens.map((token) => {
        const resolved = workspace.resolvedTokens.find((item) => item.name === token.name);
        const dark = darkResolution?.get(token.name);
        const darkNote = dark !== undefined && dark !== null && String(dark) !== String(resolved?.resolved_value ?? token.value) ? ` · dark: \`${String(dark)}\`` : "";
        return `- \`${token.name}\` = \`${String(resolved?.resolved_value ?? token.value)}\`${darkNote}${resolved?.source === "theme" ? ` — theme override: ${resolved.override_dependencies.join(", ")}` : token.description ? ` — ${token.description}` : ""}`;
      }),
      "",
    ]),
    "## Primitive decisions", "", ...selectedPrimitives.map((item) => {
      const taxonomy = primitiveEntries.find((entry) => entry.id === item.id);
      return `### ${taxonomy?.name ?? item.id}\n\n- Status: ${item.status}\n- Purpose: ${item.purpose || taxonomy?.description || "Not documented"}\n- Tokens: ${item.tokens.map((token) => `\`${token}\``).join(", ") || "None documented"}\n- Preferences: ${Object.entries(item.preferences).map(([key, value]) => `${key}=${value}`).join(", ") || "None documented"}\n- Notes: ${item.notes || "None"}`;
    }), "",
    "## Component decisions", "", ...selected.map((item) => {
      const taxonomy = entries.find((entry) => entry.id === item.id);
      const inspiration = item.selection ? `${workspace.sources.find((source) => source.id === item.selection?.source)?.name ?? item.selection.source} ${item.selection.source_component}` : "No inspiration selected";
      const advanced = [
        Object.keys(item.behavior).length ? `- Advanced behavior: ${Object.entries(item.behavior).map(([key, value]) => `${key}=${value}`).join(", ")}` : "",
        item.rationale ? `- Advanced rationale: ${item.rationale}` : "",
        item.use_when.length ? `- Advanced use when: ${item.use_when.join("; ")}` : "",
        item.avoid_when.length ? `- Advanced avoid when: ${item.avoid_when.join("; ")}` : "",
        item.foundations.length ? `- Advanced Foundation deviations: ${item.foundations.map((foundation) => `\`${foundation}\``).join(", ")}` : "",
        item.primitives.length ? `- Advanced primitives: ${item.primitives.map((primitive) => `\`${primitive}\``).join(", ")}` : "",
      ].filter(Boolean).join("\n");
      return `### ${taxonomy?.name ?? item.id}\n\n- Decision: ${item.status === "selected" ? "Use" : "No use"}\n- Inspiration: ${inspiration}\n- Preferences: ${Object.entries(item.preferences).map(([key, value]) => `${key}=${value}`).join(", ") || "None documented"}\n- Notes: ${item.notes || "None"}\n- Inherits: Monet Principles, Foundations, and Patterns${advanced ? `\n${advanced}` : ""}`;
    }), "", "## Patterns", "", ...workspace.patterns.map((item) => `- **${item.title}** (${item.status}) — ${item.summary}`), "",
    "## Reference memory", "", ...workspace.references.map((item) => `- **${item.title}** (${item.type}) — User preference: ${item.annotation || "Not annotated"}${item.ai_tags.length ? ` · AI tags: ${item.ai_tags.join(", ")}` : ""}`), "",
  ].join("\n");
  await atomicWrite(path.join(root(), "DESIGN_SYSTEM.md"), `${system}\n`);
  await mkdir(path.join(root(), "tokens"), { recursive: true });
  for (const foundation of workspace.foundations) {
    const resolved = workspace.resolvedTokens.filter((token) => token.foundation === foundation.id);
    await writeJson(path.join(root(), "tokens", `${foundation.id}.json`), { foundation: foundation.id, tokens: resolved });
  }
  // Exports carry no timestamp. They are derived entirely from the canonical records, so a stamp
  // would rewrite every file on every save and make each commit look like a change that was not one.
  await writeJson(path.join(root(), "tokens", "tokens.json"), { tokens: workspace.resolvedTokens, issues: workspace.tokenIssues });
  // One resolved file per theme and mode. The light file keeps the theme's plain name so existing
  // consumers keep working; each further mode adds `<theme>.<mode>.json` beside it.
  await mkdir(path.join(root(), "tokens", "themes"), { recursive: true });
  for (const theme of workspace.themes) {
    const modes = themeModes(workspace.foundations, theme);
    for (const mode of modes) {
      const themed = resolveThemeTokens(workspace.foundations, theme, mode);
      const file = mode === "light" ? `${theme.id}.json` : `${theme.id}.${mode}.json`;
      await writeJson(path.join(root(), "tokens", "themes", file), { theme: { id: theme.id, name: theme.name, modes }, mode, tokens: themed.tokens, issues: themed.issues });
    }
    for (const mode of THEME_MODES) {
      if (modes.includes(mode) || mode === "light") continue;
      await unlink(path.join(root(), "tokens", "themes", `${theme.id}.${mode}.json`)).catch(() => undefined);
    }
  }
  await writeJson(path.join(root(), "design-system.json"), { ...workspace, filesRoot: undefined, decisionLog: undefined });
}

export async function savePrinciple(id: string, input: Principle): Promise<void> {
  const safeId = cleanId(id);
  const existing = await readPrinciplesDirectory(path.join(root(), "principles"));
  const prior = existing.find((item) => item.id === safeId);
  const principle: Principle = {
    id: safeId,
    title: text(input.title, safeId),
    body: text(input.body),
    order: Number.isFinite(input.order) ? input.order : prior?.order ?? existing.length,
    updated_at: new Date().toISOString(),
  };
  await atomicWrite(path.join(root(), "principles", `${safeId}.md`), renderPrinciple(principle));
  await regenerateExports();
}

export async function saveMarkdown(kind: "patterns", id: string, input: MarkdownDocument): Promise<void> {
  const safeId = cleanId(id);
  const existing = await readMarkdownDirectory(path.join(root(), kind));
  const prior = existing.find((item) => item.id === safeId);
  const document: MarkdownDocument = {
    id: safeId, title: text(input.title, safeId), summary: text(input.summary), body: text(input.body), status: status(input.status),
    tags: list(input.tags), order: Number.isFinite(input.order) ? input.order : prior?.order ?? existing.length,
    updated_at: new Date().toISOString(), components: list(input.components), foundations: list(input.foundations),
  };
  await atomicWrite(path.join(root(), kind, `${safeId}.md`), renderFrontmatter(document));
  await regenerateExports();
}

export async function deleteMarkdown(kind: "principles" | "patterns", id: string): Promise<void> {
  await unlink(path.join(root(), kind, `${cleanId(id)}.md`));
  await regenerateExports();
}

export async function saveFoundation(id: string, input: Foundation): Promise<void> {
  const safeId = cleanId(id);
  const tokens = normalizeTokens(safeId, input.tokens);
  const names = tokens.map((token) => token.name);
  if (names.some((name) => !/^[a-z][a-z0-9.-]*$/.test(name))) throw new Error("Token names must use lowercase letters, numbers, dots, and hyphens.");
  if (new Set(names).size !== names.length) throw new Error("Token names must be unique.");
  const record: Foundation = { ...input, id: safeId, name: text(input.name, safeId), status: status(input.status), tokens, updated_at: new Date().toISOString() };
  const workspace = await loadWorkspace();
  const prospective = workspace.foundations.map((foundation) => foundation.id === safeId ? record : foundation);
  const circular = resolveTokens(prospective).issues.find((issue) => issue.type === "circular_reference");
  if (circular) throw new Error(circular.message);
  // A dark value may alias a different token than the light one, so the dark resolution is checked too.
  const darkCircular = themeModes(prospective, null).includes("dark") ? resolveThemeTokens(prospective, null, "dark").issues.find((issue) => issue.type === "circular_reference") : undefined;
  if (darkCircular) throw new Error(`In dark mode, ${darkCircular.message}`);
  await writeJson(path.join(root(), "foundations", `${safeId}.json`), record);
  await regenerateExports();
}

export async function saveTheme(id: string, input: Theme): Promise<Theme> {
  const safeId = cleanId(id);
  const workspace = await loadWorkspace();
  const knownTokens = new Set(workspace.baseResolvedTokens.map((token) => token.name));
  const theme = themeRecord(safeId, input, new Date().toISOString());
  const overrideNames = [...Object.keys(theme.overrides), ...Object.values(theme.modes ?? {}).flatMap((overrides) => Object.keys(overrides))];
  const unknown = overrideNames.find((name) => !knownTokens.has(name));
  if (unknown) throw new Error(`Theme override references unknown token ${unknown}.`);
  for (const mode of themeModes(workspace.foundations, theme)) {
    const resolution = resolveThemeTokens(workspace.foundations, theme, mode);
    if (resolution.issues.length) throw new Error(resolution.issues[0]!.message);
  }
  await writeJson(path.join(root(), "themes", `${safeId}.json`), theme);
  await regenerateExports();
  return theme;
}

export async function duplicateTheme(id: string, requestedName?: string): Promise<Theme> {
  const safeId = cleanId(id);
  const workspace = await loadWorkspace();
  const source = workspace.themes.find((theme) => theme.id === safeId);
  if (!source) throw new Error("Theme not found.");
  const name = text(requestedName, `${source.name} copy`).trim() || `${source.name} copy`;
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 72) || `${safeId}-copy`;
  let nextId = base;
  let suffix = 2;
  while (workspace.themes.some((theme) => theme.id === nextId)) nextId = `${base}-${suffix++}`;
  return saveTheme(nextId, { ...source, id: nextId, name });
}

export async function setDefaultTheme(id: string): Promise<void> {
  const safeId = cleanId(id);
  const workspace = await loadWorkspace();
  if (!workspace.themes.some((theme) => theme.id === safeId)) throw new Error("Theme not found.");
  await writeJson(path.join(root(), "themes", "config.json"), { default_theme: safeId });
  await regenerateExports();
}

export async function deleteTheme(id: string): Promise<void> {
  const safeId = cleanId(id);
  const workspace = await loadWorkspace();
  if (!workspace.themes.some((theme) => theme.id === safeId)) throw new Error("Theme not found.");
  if (workspace.themes.length === 1) throw new Error("Monet must keep at least one theme.");
  await unlink(path.join(root(), "themes", `${safeId}.json`));
  if (workspace.defaultThemeId === safeId) {
    const fallback = workspace.themes.find((theme) => theme.id !== safeId)!;
    await writeJson(path.join(root(), "themes", "config.json"), { default_theme: fallback.id });
  }
  await regenerateExports();
}

export async function saveComponents(id: string, input: ComponentDecision): Promise<void> {
  const safeId = cleanId(id);
  const workspace = await loadWorkspace();
  const index = workspace.components.findIndex((item) => item.id === safeId);
  const previous = index >= 0 ? workspace.components[index] : undefined;
  const selection = componentSelection(input);
  const oldSource = previous?.selection?.source ?? null;
  const newSource = selection?.source ?? null;
  const changed = oldSource !== newSource;
  const now = new Date().toISOString();
  const next: ComponentDecision = {
    ...input, id: safeId, status: status(input.status), selection,
    preferences: input.preferences && typeof input.preferences === "object" ? input.preferences : {}, behavior: input.behavior && typeof input.behavior === "object" ? input.behavior : {},
    rationale: text(input.rationale), notes: text(input.notes), use_when: list(input.use_when), avoid_when: list(input.avoid_when), foundations: list(input.foundations), primitives: list(input.primitives), candidates: Array.isArray(input.candidates) ? input.candidates : [],
    updated_at: now, history: [...(previous?.history ?? [])],
  };
  if (changed) {
    const change = newSource ? `Selected ${newSource} inspiration.`
      : next.status === "undecided" ? "Cleared the selected inspiration when the record became undecided."
      : "Cleared selected inspiration.";
    next.history.push({ date: now, change, old_selection: oldSource, new_selection: newSource, rationale: input.rationale });
    const stamp = now.replace(/[:.]/g, "-").toLowerCase();
    const title = `${safeId}: ${oldSource ?? "none"} → ${newSource ?? "none"}`;
    await atomicWrite(path.join(root(), "decisions", `${stamp}-${safeId}.md`), renderFrontmatter({ id: `${stamp}-${safeId}`, title, summary: input.rationale || "Component inspiration changed.", body: `# ${title}\n\n${input.rationale || "No rationale recorded."}`, status: "selected", tags: ["component", safeId], order: 0, updated_at: now }));
  }
  if (index >= 0) workspace.components[index] = next; else workspace.components.push(next);
  await writeJson(path.join(root(), "components", "decisions.json"), workspace.components);
  await regenerateExports();
}

export async function savePrimitive(id: string, input: PrimitiveDecision): Promise<void> {
  const safeId = cleanId(id);
  const workspace = await loadWorkspace();
  const index = workspace.primitives.findIndex((item) => item.id === safeId);
  const next: PrimitiveDecision = {
    ...input, id: safeId, status: status(input.status), purpose: text(input.purpose), notes: text(input.notes),
    preferences: input.preferences && typeof input.preferences === "object" ? input.preferences : {}, tokens: list(input.tokens), updated_at: new Date().toISOString(),
  };
  if (index >= 0) workspace.primitives[index] = next; else workspace.primitives.push(next);
  await writeJson(path.join(root(), "primitives", "decisions.json"), workspace.primitives);
  await regenerateExports();
}

export async function savePrimitiveTaxonomy(input: TaxonomyCategory[]): Promise<void> {
  if (!Array.isArray(input)) throw new Error("Primitive taxonomy must be an array.");
  const seen = new Set<string>();
  const taxonomy = input.map((category) => ({
    id: cleanId(category.id),
    name: text(category.name, category.id),
    entries: (Array.isArray(category.entries) ? category.entries : []).map((entry) => {
      const id = cleanId(entry.id);
      if (seen.has(id)) throw new Error(`Primitive id ${id} is duplicated.`);
      seen.add(id);
      return {
        id,
        name: text(entry.name, id),
        category: cleanId(category.id),
        description: text(entry.description),
        aliases: list(entry.aliases),
        relationships: list(entry.relationships).filter((relationship) => relationship !== id),
        deprecated: Boolean(entry.deprecated),
      };
    }),
  }));
  await writeJson(path.join(root(), "taxonomy", "primitives.json"), taxonomy);
  await regenerateExports();
}

export async function mergePrimitive(sourceId: string, targetId: string): Promise<void> {
  const source = cleanId(sourceId);
  const target = cleanId(targetId);
  if (source === target) throw new Error("A primitive cannot be merged into itself.");
  const workspace = await loadWorkspace();
  const entries = workspace.primitiveTaxonomy.flatMap((category) => category.entries);
  const sourceEntry = entries.find((entry) => entry.id === source);
  const targetEntry = entries.find((entry) => entry.id === target);
  if (!sourceEntry || !targetEntry) throw new Error("Both merge primitives must exist.");

  const taxonomy = workspace.primitiveTaxonomy.map((category) => ({
    ...category,
    entries: category.entries.filter((entry) => entry.id !== source).map((entry) => entry.id === target ? {
      ...entry,
      aliases: [...new Set([...entry.aliases, sourceEntry.name, source, ...sourceEntry.aliases])],
      relationships: [...new Set([...entry.relationships, ...sourceEntry.relationships].map((relationship) => relationship === source ? target : relationship))].filter((relationship) => relationship !== target),
    } : {
      ...entry,
      relationships: [...new Set(entry.relationships.map((relationship) => relationship === source ? target : relationship))].filter((relationship) => relationship !== entry.id),
    }),
  }));

  const now = new Date().toISOString();
  const sourceDecision = workspace.primitives.find((decision) => decision.id === source);
  const targetDecision = workspace.primitives.find((decision) => decision.id === target);
  const primitives = workspace.primitives.filter((decision) => decision.id !== source && decision.id !== target);
  if (sourceDecision || targetDecision) primitives.push({
    ...(sourceDecision ?? { id: target, status: "undecided" as const, purpose: "", preferences: {}, tokens: [], inspiration: null, notes: "", updated_at: "" }),
    ...(targetDecision ?? {}),
    id: target,
    status: targetDecision && targetDecision.status !== "undecided" ? targetDecision.status : sourceDecision?.status ?? "undecided",
    purpose: targetDecision?.purpose || sourceDecision?.purpose || "",
    preferences: { ...(sourceDecision?.preferences ?? {}), ...(targetDecision?.preferences ?? {}) },
    tokens: [...new Set([...(targetDecision?.tokens ?? []), ...(sourceDecision?.tokens ?? [])])],
    inspiration: targetDecision?.inspiration ?? sourceDecision?.inspiration ?? null,
    notes: [targetDecision?.notes, sourceDecision?.notes].filter(Boolean).filter((value, index, values) => values.indexOf(value) === index).join("\n\n"),
    updated_at: now,
  });
  const components = workspace.components.map((component) => ({ ...component, primitives: [...new Set(component.primitives.map((primitive) => primitive === source ? target : primitive))] }));
  const sources = workspace.sources.map((item) => ({ ...item, mappings: item.mappings.map((mapping) => mapping.target_type === "primitive" && mapping.canonical_id === source ? { ...mapping, canonical_id: target } : mapping) }));

  await writeJson(path.join(root(), "taxonomy", "primitives.json"), taxonomy);
  await writeJson(path.join(root(), "primitives", "decisions.json"), primitives);
  await writeJson(path.join(root(), "components", "decisions.json"), components);
  await writeJson(path.join(root(), "sources", "registry.json"), sources);
  await regenerateExports();
}

export async function saveSource(id: string, input: Source): Promise<void> {
  const safeId = cleanId(id);
  const workspace = await loadWorkspace();
  const index = workspace.sources.findIndex((item) => item.id === safeId);
  const next: Source = { ...input, id: safeId, name: text(input.name, safeId), mappings: (Array.isArray(input.mappings) ? input.mappings : []).map((mapping) => ({ ...sourceMapping(mapping), mapped_by: mapping.mapped_by ?? "manual" })), updated_at: new Date().toISOString() };
  if (index >= 0) workspace.sources[index] = next; else workspace.sources.push(next);
  await writeJson(path.join(root(), "sources", "registry.json"), workspace.sources);
  await regenerateExports();
}

export async function refreshSourceMappings(id: string): Promise<MappingRefreshResult> {
  const safeId = cleanId(id);
  const workspace = await loadWorkspace();
  const index = workspace.sources.findIndex((item) => item.id === safeId);
  if (index < 0) throw new Error("Source not found.");
  const source = workspace.sources[index]!;
  const mappings = await generateSourceMappings(workspace, source);
  const next: Source = { ...source, mappings, updated_at: new Date().toISOString() };
  workspace.sources[index] = next;
  await writeJson(path.join(root(), "sources", "registry.json"), workspace.sources);
  await regenerateExports();
  const discovered = new Set(mappings.map((mapping) => mapping.upstream.trim().toLocaleLowerCase())).size;
  return {
    source: next,
    discovered,
    mapped: mappings.filter((mapping) => mapping.status === "mapped").length,
    needs_review: mappings.filter((mapping) => mapping.status === "needs_review").length,
    unmapped: mappings.filter((mapping) => mapping.status === "unmapped").length,
  };
}

export function removeSourceReferences(workspace: Pick<Workspace, "sources" | "components" | "primitives">, safeId: string, now: string) {
  const source = workspace.sources.find((item) => item.id === safeId);
  if (!source) throw new Error("Source not found.");
  const sources = workspace.sources.filter((item) => item.id !== safeId);
  const components = workspace.components.map((component) => {
    const selected = component.selection?.source === safeId;
    const candidates = component.candidates.filter((candidate) => candidate.source !== safeId);
    if (!selected && candidates.length === component.candidates.length) return component;
    return {
      ...component,
      selection: selected ? null : component.selection,
      candidates,
      updated_at: now,
      history: selected ? [...component.history, {
        date: now,
        change: `Removed deleted ${source.name} inspiration.`,
        old_selection: safeId,
        new_selection: null,
        rationale: "The source was removed from Monet's catalog.",
      }] : component.history,
    };
  });
  const primitives = workspace.primitives.map((primitive) => primitive.inspiration?.source === safeId ? { ...primitive, inspiration: null, updated_at: now } : primitive);
  return {
    sources,
    components,
    primitives,
    componentsChanged: components.some((component, index) => component !== workspace.components[index]),
    primitivesChanged: primitives.some((primitive, index) => primitive !== workspace.primitives[index]),
  };
}

export async function deleteSource(id: string): Promise<void> {
  const safeId = cleanId(id);
  const workspace = await loadWorkspace();
  const { sources, components, primitives, componentsChanged, primitivesChanged } = removeSourceReferences(workspace, safeId, new Date().toISOString());
  await writeJson(path.join(root(), "sources", "registry.json"), sources);
  if (componentsChanged) await writeJson(path.join(root(), "components", "decisions.json"), components);
  if (primitivesChanged) await writeJson(path.join(root(), "primitives", "decisions.json"), primitives);
  await regenerateExports();
}

export async function saveReference(id: string, input: ReferenceSaveInput): Promise<Reference> {
  const safeId = cleanId(id);
  const workspace = await loadWorkspace();
  const index = workspace.references.findIndex((item) => item.id === safeId);
  const previous = index >= 0 ? workspace.references[index] : undefined;
  let next = normalizeReference(input, safeId, previous);
  if (input.asset_data_url) {
    const asset = await writeReferenceAsset(safeId, input.asset_data_url, text(input.asset_filename, input.original_filename || `${safeId}.png`));
    next = { ...next, ...asset, type: referenceType(input.type, asset.asset_media_type, asset.original_filename, next.source_url) };
    if (previous?.asset_path && previous.asset_path !== next.asset_path) await unlink(path.join(root(), "references", previous.asset_path)).catch(() => undefined);
  }
  if (!next.annotation) throw new Error("Describe what you like about this reference.");
  if (!next.source_url && !next.asset_path) throw new Error("Add a URL or choose a reference file.");
  if (next.source_url) {
    try { if (!["http:", "https:"].includes(new URL(next.source_url).protocol)) throw new Error(); }
    catch { throw new Error("Use a complete http or https source URL."); }
  }
  if (index >= 0) workspace.references[index] = next; else workspace.references.unshift(next);
  await writeJson(path.join(root(), "references", "registry.json"), workspace.references);
  await regenerateExports();
  return next;
}

export async function analyzeSavedReference(id: string): Promise<Reference> {
  const safeId = cleanId(id);
  const workspace = await loadWorkspace();
  const index = workspace.references.findIndex((item) => item.id === safeId);
  if (index < 0) throw new Error("Reference not found.");
  const current = workspace.references[index]!;
  const result = await analyzeReference(current, path.join(root(), "references", "assets"));
  const next = { ...current, ...result, preview_url: result.preview_url || current.preview_url, updated_at: new Date().toISOString() };
  workspace.references[index] = next;
  await writeJson(path.join(root(), "references", "registry.json"), workspace.references);
  await regenerateExports();
  return next;
}

export async function deleteReference(id: string): Promise<void> {
  const safeId = cleanId(id);
  const workspace = await loadWorkspace();
  const reference = workspace.references.find((item) => item.id === safeId);
  if (!reference) throw new Error("Reference not found.");
  const references = workspace.references.filter((item) => item.id !== safeId);
  const analysis: ReferenceCollectionAnalysis = {
    ...workspace.referenceAnalysis,
    recurring_preferences: workspace.referenceAnalysis.recurring_preferences.map((item) => ({ ...item, evidence_reference_ids: item.evidence_reference_ids.filter((referenceId) => referenceId !== safeId) })).filter((item) => item.evidence_reference_ids.length),
    suggestions: workspace.referenceAnalysis.suggestions.map((item) => ({ ...item, evidence_reference_ids: item.evidence_reference_ids.filter((referenceId) => referenceId !== safeId) })).filter((item) => item.evidence_reference_ids.length),
  };
  await writeJson(path.join(root(), "references", "registry.json"), references);
  await writeJson(path.join(root(), "references", "analysis.json"), analysis);
  if (reference.asset_path) await unlink(path.join(root(), "references", reference.asset_path)).catch(() => undefined);
  await regenerateExports();
}

export async function analyzeReferences(): Promise<ReferenceCollectionAnalysis> {
  const workspace = await loadWorkspace();
  if (!workspace.references.length) throw new Error("Add at least one reference before analyzing the collection.");
  const analysis = await analyzeReferenceCollection(workspace);
  await writeJson(path.join(root(), "references", "analysis.json"), analysis);
  await regenerateExports();
  return analysis;
}

export async function saveReferenceAnalysis(input: ReferenceCollectionAnalysis): Promise<ReferenceCollectionAnalysis> {
  const workspace = await loadWorkspace();
  const knownIds = new Set(workspace.referenceAnalysis.suggestions.map((item) => item.id));
  const statuses = new Map((Array.isArray(input.suggestions) ? input.suggestions : []).filter((item) => knownIds.has(item.id) && REFERENCE_SUGGESTION_STATUSES.includes(item.status)).map((item) => [item.id, item.status]));
  const next = { ...workspace.referenceAnalysis, suggestions: workspace.referenceAnalysis.suggestions.map((item) => ({ ...item, status: statuses.get(item.id) ?? item.status })) };
  await writeJson(path.join(root(), "references", "analysis.json"), next);
  await regenerateExports();
  return next;
}

export async function readReferenceAsset(id: string): Promise<{ contents: Buffer; mediaType: string; filename: string }> {
  const safeId = cleanId(id);
  const workspace = await loadWorkspace();
  const reference = workspace.references.find((item) => item.id === safeId);
  if (!reference?.asset_path) throw new Error("Reference asset not found.");
  return { contents: await readFile(path.join(root(), "references", reference.asset_path)), mediaType: reference.asset_media_type || "application/octet-stream", filename: reference.original_filename || path.basename(reference.asset_path) };
}

// Gap evidence is editor-only. Keeping the image in the same atomic record means a failed save
// cannot strand an asset or create a report whose screenshot was never persisted.
interface StoredGap extends Omit<Gap, "image"> { image: (GapImage & { data_url: string }) | null }
function publicGap(stored: StoredGap): Gap {
  return { ...stored, image: stored.image ? { media_type: stored.image.media_type, filename: stored.image.filename, bytes: stored.image.bytes } : null };
}

export function decodeGapImage(dataUrl: string): { bytes: Buffer; mediaType: GapImage["media_type"] } {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match) throw new Error("Choose a PNG, JPEG, or WebP image.");
  const bytes = Buffer.from(match[2]!, "base64");
  if (!bytes.length || bytes.length > GAP_IMAGE_LIMIT || bytes.toString("base64") !== match[2]) throw new Error("Images must be valid base64 and no larger than 10 MB.");
  const mediaType = match[1] as GapImage["media_type"];
  const valid = mediaType === "image/png" ? bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && bytes.toString("ascii", 12, 16) === "IHDR"
    : mediaType === "image/jpeg" ? bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes.at(-2) === 255 && bytes.at(-1) === 217
    : bytes.length >= 16 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  if (!valid) throw new Error("The image contents do not match its PNG, JPEG, or WebP format.");
  return { bytes, mediaType };
}

async function readStoredGap(id: string, directory = root()): Promise<StoredGap> {
  const gap = await readJson<StoredGap>(path.join(directory, "gaps", `${cleanId(id)}.json`));
  if (gap.version !== 1 || gap.id !== id || !gap.created_at || !gap.report) throw new Error("Invalid Gap record.");
  gapInputSchema.omit({ image: true }).parse(gap.report);
  return gap;
}

export async function listGaps(): Promise<GapSummary[]> {
  const files = await readDirectoryOrEmpty(path.join(root(), "gaps"));
  const gaps = await Promise.all(files.filter((f) => f.endsWith(".json")).map((f) => readStoredGap(f.slice(0, -5))));
  return gaps.sort((a, b) => b.created_at.localeCompare(a.created_at)).map((g) => ({
    id: g.id, created_at: g.created_at, problem: g.report.problem, context: g.report.context,
    image: publicGap(g).image, diagnosed: Boolean(g.diagnosis),
  }));
}

export async function getGap(id: string): Promise<Gap> { return publicGap(await readStoredGap(id)); }

export async function createGap(input: unknown): Promise<Gap> {
  const { image, ...report } = gapInputSchema.parse(input);
  let savedImage: StoredGap["image"] = null;
  if (image) {
    const decoded = decodeGapImage(image.data_url);
    savedImage = { data_url: image.data_url, media_type: decoded.mediaType, bytes: decoded.bytes.length,
      filename: path.basename(image.filename).replace(/[\x00-\x1f\x7f]/g, "") || "screenshot" };
  }
  const gap: StoredGap = { version: 1, id: randomUUID(), created_at: new Date().toISOString(), report, image: savedImage, diagnosis: null };
  await writeJson(path.join(root(), "gaps", `${gap.id}.json`), gap);
  return publicGap(gap);
}

const gapAnalyses = new Set<string>();
export async function diagnoseSavedGap(id: string): Promise<Gap> {
  const directory = root();
  const file = path.join(directory, "gaps", `${cleanId(id)}.json`);
  if (gapAnalyses.has(file)) throw new Error("This Gap is already being diagnosed. Reload in a moment.");
  gapAnalyses.add(file);
  try {
    const gap = await readStoredGap(id, directory);
    const workspace = await loadWorkspace(gap.report.theme_id, gap.report.mode);
    const decoded = gap.image ? decodeGapImage(gap.image.data_url) : null;
    const image = decoded ? { bytes: decoded.bytes, extension: decoded.mediaType === "image/png" ? "png" as const : decoded.mediaType === "image/jpeg" ? "jpg" as const : "webp" as const } : undefined;
    const diagnosis = await diagnoseGap(publicGap(gap), workspace, image);
    const next = { ...gap, diagnosis };
    await writeJson(file, next);
    return publicGap(next);
  } finally { gapAnalyses.delete(file); }
}

export async function readGapImage(id: string): Promise<{ contents: Buffer; mediaType: string }> {
  const gap = await readStoredGap(id);
  if (!gap.image) throw new Error("This Gap has no screenshot.");
  const decoded = decodeGapImage(gap.image.data_url);
  return { contents: decoded.bytes, mediaType: decoded.mediaType };
}

/**
 * Prepares a workspace directory for use, so pointing MONET_ROOT at an empty directory starts a
 * new design system rather than failing on the first missing file. Existing files are never
 * touched; only what is absent is created.
 */
export async function initializeStore(): Promise<void> {
  const directories = ["decisions", "tokens", "primitives", "themes", "foundations", "principles", "patterns", "taxonomy", "components", "sources", "gaps"];
  await Promise.all([
    ...directories.map((name) => mkdir(path.join(root(), name), { recursive: true })),
    mkdir(path.join(root(), "references", "assets"), { recursive: true }),
  ]);
  const seeds: [file: string[], value: unknown][] = [
    [["taxonomy", "components.json"], []],
    [["taxonomy", "primitives.json"], []],
    [["components", "decisions.json"], []],
    [["primitives", "decisions.json"], []],
    [["sources", "registry.json"], []],
  ];
  for (const [file, value] of seeds) {
    try { await readFile(path.join(root(), ...file), "utf8"); }
    catch { await writeJson(path.join(root(), ...file), value); }
  }
  try { await readFile(path.join(root(), "references", "registry.json"), "utf8"); }
  catch { await writeJson(path.join(root(), "references", "registry.json"), []); }
  try { await readFile(path.join(root(), "references", "analysis.json"), "utf8"); }
  catch { await writeJson(path.join(root(), "references", "analysis.json"), EMPTY_REFERENCE_ANALYSIS); }
  try { await readFile(path.join(root(), "themes", "default.json"), "utf8"); }
  catch { await writeJson(path.join(root(), "themes", "default.json"), { id: "default", name: "Default", overrides: {}, updated_at: new Date().toISOString() }); }
  try { await readFile(path.join(root(), "themes", "config.json"), "utf8"); }
  catch { await writeJson(path.join(root(), "themes", "config.json"), { default_theme: "default" }); }
  const foundationFiles = (await readdir(path.join(root(), "foundations"))).filter((name) => name.endsWith(".json"));
  for (const name of foundationFiles) {
    const file = path.join(root(), "foundations", name);
    const raw = await readJson<Foundation>(file);
    if (!Array.isArray(raw.tokens)) await writeJson(file, normalizeFoundation(raw));
  }
  try {
    await Promise.all([
      readFile(path.join(root(), "DESIGN_SYSTEM.md"), "utf8"),
      readFile(path.join(root(), "design-system.json"), "utf8"),
      readFile(path.join(root(), "tokens", "tokens.json"), "utf8"),
    ]);
  } catch {
    await regenerateExports();
  }
}

export { parseFrontmatter, parsePrinciple, renderFrontmatter, renderPrinciple };
