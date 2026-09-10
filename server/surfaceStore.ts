import { randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { surfaceImportSchema, surfaceRevisionSchema, surfaceSelectionSchema, storedSurfaceInputSchema, surfaceGapSchema, SURFACE_LIMITS, compatibleToken, equalStyleValue, type SurfaceSnapshot, type SurfaceRun, type SurfaceRecord, type SurfacePreview, type SurfaceSummary, type SurfaceIssue } from "../shared/surfaces.js";
import { createMonetService } from "../shared/service.js";
import type { Workspace } from "../shared/model.js";
import type { Gap } from "../shared/gaps.js";
import { atomicWrite, durableRemove } from "./durableFiles.js";
import { loadWorkspace, readDirectoryOrEmpty, cleanId, createGap } from "./fileStore.js";
import { workspaceRoot, profileOwnership, assertProfileOwnership, assertProjectBinding, workspaceScope } from "./workspace.js";
import { withWorkspaceRead, withWorkspaceWrite } from "./writeLock.js";
import { gapKnowledge, knowledgeFingerprint } from "./gapDiagnosis.js";
import { sanitizeSurface, renderSurface, safeValue, surfaceHash, SurfaceError } from "./surfaceSanitizer.js";
import { readCapture, releaseCapture } from "./captureLedger.js";
import type { SurfaceCapture } from "../shared/projects.js";

const recordFile = (id: string) => path.join(workspaceRoot(), "surfaces", `${cleanId(id)}.json`);
// Import decoding is bounded separately from the canonical read/write queue.
let activeImports = 0;
async function importSnapshot(input: unknown): Promise<SurfaceSnapshot> {
  if (activeImports >= 2) throw new SurfaceError("Two Surface imports are already running. Retry in a moment.", 429);
  activeImports++;
  try { return await sanitizeSurface(input); } finally { activeImports--; }
}
const fingerprint = (workspace: Workspace) => knowledgeFingerprint(gapKnowledge(workspace));

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const short = z.string().max(4000);
const issueSchema = z.object({ id: z.string().max(300), kind: z.enum(["removed", "unsupported", "missing_asset", "unmapped", "ambiguous", "invalid_mapping"]), location: z.string().max(300), detail: short, count: z.number().int().positive().optional() }).strict();
const reviewSchema = z.object({
  theme: z.object({ id: short, name: short, mode: z.enum(["light", "dark"]), modes: z.array(z.enum(["light", "dark"])) }).nullable(),
  coverage: z.object({ submitted: z.number().int().nonnegative(), checked: z.number().int().nonnegative(), unverifiable: z.number().int().nonnegative(), not_applicable: z.number().int().nonnegative(), checks: z.array(short).max(100) }),
  scope: z.string().max(10000), warnings: z.array(short).max(1000),
  findings: z.array(z.object({ level: z.enum(["error", "warning", "info"]), check: short, basis: z.enum(["monet_rule", "wcag_floor"]).optional(), usage_id: short.optional(), location: short.optional(), observed: short, expected: short, why: short, replacement: short.optional(), related: z.array(short).max(100) })).max(2000),
});
const ownershipSchema = { profile_id: z.string().uuid().optional(), scope_version: z.literal(2).optional() };
/** Stored capture provenance is validated on every read; it is evidence about the capture, never an instruction to reconnect. */
export const surfaceCaptureSchema = z.object({
  project_id: z.string().uuid(), binding_revision: z.number().int().positive(), project_name: z.string().max(100), screen_id: z.string().max(300), screen_label: z.string().max(300), route: z.string().max(500),
  source: z.discriminatedUnion("kind", [z.object({ kind: z.literal("dev_server"), base_url: z.string().max(200) }).strict(), z.object({ kind: z.literal("static"), directory: z.string().max(200) }).strict()]),
  strategy: z.enum(["stylesheet", "computed"]), captured_at: z.string().datetime(), width: z.number().int().min(240).max(1920), height: z.number().int().min(240).max(2160), mode: z.enum(["light", "dark"]),
  browser: z.string().max(200), blocked: z.array(z.object({ host: z.string().max(300), count: z.number().int().positive() }).strict()).max(40), warnings: z.array(z.string().max(300)).max(100),
}).strict();
const storedRecordSchema = z.object({ ...ownershipSchema, version: z.literal(1), id: z.string().uuid(), created_at: z.string().datetime(),
  snapshot: z.object({ version: z.literal(1), hash: hashSchema, input: storedSurfaceInputSchema, issues: z.array(issueSchema).max(160) }).strict(),
  capture: surfaceCaptureSchema.optional(),
  runs: z.array(z.object({ ...ownershipSchema, revision: z.number().int().min(1), created_at: z.string().datetime(), run_hash: hashSchema, snapshot_hash: hashSchema, workspace_fingerprint: hashSchema,
    project: surfaceSelectionSchema.shape.project, theme_id: z.string().max(80).optional(), mode: z.enum(["light", "dark"]), requested_mode: z.enum(["light", "dark"]),
    mappings: surfaceSelectionSchema.shape.mappings, bindings: z.array(z.object({ declaration_id: z.string().max(300), token: z.string().max(300), value: z.string().max(500) }).strict()).max(SURFACE_LIMITS.declarations),
    issues: z.array(issueSchema).max(SURFACE_LIMITS.declarations + 1), review: reviewSchema,
  }).strict()).min(1).max(SURFACE_LIMITS.revisions),
}).strict();

async function readRecord(id: string): Promise<SurfaceRecord> {
  const file = recordFile(id);
  if ((await stat(file)).size > 24 * 1024 * 1024) throw new SurfaceError("Saved Surface exceeds its storage limit.");
  const record = JSON.parse(await readFile(file, "utf8")) as SurfaceRecord;
  assertProfileOwnership(record);
  storedRecordSchema.parse(record); // Validate without rewriting key order or captured values.
  if (record.snapshot.input.assets.length || record.snapshot.input.screenshot && !/^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/.test(record.snapshot.input.screenshot.data_url)) throw new SurfaceError("Invalid saved raster evidence.");
  if (record.version !== 1 || record.id !== id || !record.snapshot || record.snapshot.version !== 1 || !Array.isArray(record.runs) || record.runs.length < 1 || record.runs.length > SURFACE_LIMITS.revisions) throw new SurfaceError("Invalid saved Surface.");
  storedSurfaceInputSchema.parse(record.snapshot.input);
  if (record.snapshot.hash !== surfaceHash(record.snapshot.input)) throw new SurfaceError("Surface snapshot integrity check failed.");
  for (const [index, run] of record.runs.entries()) {
    assertProfileOwnership(run);
    surfaceSelectionSchema.parse({ mappings: run.mappings, theme_id: run.theme_id, mode: run.mode });
    if (run.run_hash !== surfaceHash({ ...run, run_hash: undefined }) || run.revision !== index + 1 || run.snapshot_hash !== record.snapshot.hash || !Array.isArray(run.bindings) || !Array.isArray(run.issues) || !run.review || !run.workspace_fingerprint) throw new SurfaceError("Invalid Surface revision.");
    for (const binding of run.bindings) if (typeof binding.value !== "string" || binding.value.length > 500 || !run.mappings.some((m) => m.declaration_id === binding.declaration_id && m.token === binding.token)) throw new SurfaceError("Invalid saved mapping binding.");
  }
  return record;
}

/** Check copied provenance at handoff time; retained Gaps remain readable after Surface deletion. */
export const assertSurfaceProvenance = (provenance: NonNullable<Gap["report"]["provenance"]>): Promise<void> => withWorkspaceRead(async () => {
  if (provenance.profile_id !== workspaceScope().identity?.id) throw new SurfaceError("Gap provenance belongs to another Profile.", 409);
  const record = await readRecord(provenance.surface_id);
  const run = record.runs.find((candidate) => candidate.revision === provenance.revision);
  if (!run || run.run_hash !== provenance.run_hash || record.snapshot.hash !== provenance.snapshot_hash) throw new SurfaceError("Gap provenance does not match saved Surface evidence.", 409);
});
async function writeRecord(record: SurfaceRecord): Promise<void> {
  const json = JSON.stringify(record, null, 2);
  if (Buffer.byteLength(json) > 24 * 1024 * 1024) throw new SurfaceError("Saved Surface exceeds 24 MB; reduce the snapshot or mapping history.");
  await atomicWrite(recordFile(record.id), json);
}

async function compile(snapshot: SurfaceSnapshot, rawSelection: unknown, workspace: Workspace, revision: number, capture?: SurfaceCapture): Promise<SurfaceRun> {
  const selection = surfaceSelectionSchema.parse(rawSelection);
  // A captured Surface's evaluation target is fixed by its attested capture; a client may repeat it but never replace it.
  const project = capture ? { project_id: capture.project_id, binding_revision: capture.binding_revision } : selection.project;
  if (capture && selection.project && (selection.project.project_id !== capture.project_id || selection.project.binding_revision !== capture.binding_revision)) throw new SurfaceError("Comparison project evidence does not match the captured project.", 409);
  assertProjectBinding(project);
  if (selection.profile_id && selection.profile_id !== workspaceScope().identity?.id) throw new SurfaceError("Comparison target belongs to a different Profile.", 409);
  const declarations = renderSurface(snapshot).declarations;
  const issues: SurfaceIssue[] = [], bindings: SurfaceRun["bindings"] = [];
  const seen = new Set<string>();
  for (const mapping of selection.mappings) {
    if (seen.has(mapping.declaration_id)) throw new SurfaceError("Only one token mapping is allowed per declaration.");
    seen.add(mapping.declaration_id);
    const declaration = declarations.find((d) => d.id === mapping.declaration_id);
    if (!declaration?.mappable) throw new SurfaceError("Mapping names an unknown or unsupported declaration.");
    const token = workspace.resolvedTokens.find((t) => t.name === mapping.token);
    if (!token?.valid || token.resolved_value === null || !compatibleToken(declaration.property, token) || !safeValue(declaration.property, String(token.resolved_value)) || /var\s*\(/i.test(String(token.resolved_value))) {
      issues.push({ id: `mapping-${declaration.id}`, kind: "invalid_mapping", location: declaration.location, detail: `Mapping ${declaration.id} could not resolve ${mapping.token} safely for ${declaration.property}; captured value retained.` });
    } else bindings.push({ ...mapping, value: String(token.resolved_value) });
  }
  for (const d of declarations.filter((d) => d.mappable && !seen.has(d.id))) {
    const matches = workspace.resolvedTokens.filter((t) => t.valid && t.resolved_value !== null && compatibleToken(d.property, t) && equalStyleValue(d.value, String(t.resolved_value)));
    issues.push({ id: `unmapped-${d.id}`, kind: matches.length > 1 ? "ambiguous" : "unmapped", location: d.location, detail: `${d.id} ${d.property}: ${d.value} — ${matches.length > 1 ? "multiple equal-value tokens; role needs review" : "no approved token mapping"}.` });
  }
  if (selection.theme_id && workspace.activeThemeId !== selection.theme_id) throw new SurfaceError("Selected theme no longer exists. Choose a current theme.");
  if (workspace.activeMode !== selection.mode) issues.push({ id: "mode-fallback", kind: "unsupported", location: "mode", detail: `Requested ${selection.mode}; this theme resolved ${workspace.activeMode}.` });
  // Only authored declarations are submitted. No computed-style or contrast claims are fabricated.
  const service = createMonetService({ loadWorkspace });
  const usages = declarations.filter((d) => d.mappable && !d.property.startsWith("--")).slice(0, 200).map((d) => ({ id: d.id, kind: "style" as const, location: d.location, property: d.property, value: bindings.find((b) => b.declaration_id === d.id)?.value ?? d.value }));
  const review = await service.reviewDesignUsage({ themeId: workspace.activeThemeId, mode: workspace.activeMode, usages });
  review.scope = `Applied snapshot authored declarations only (first 200 supported declarations). These are not computed styles; variable references, cascade, interactions and rendered contrast are not established. ${review.scope}`;
  const run: SurfaceRun = { ...profileOwnership(), revision, run_hash: "", created_at: new Date().toISOString(), snapshot_hash: snapshot.hash, workspace_fingerprint: fingerprint(workspace), ...(project ? { project } : {}), ...(workspace.themes.length ? { theme_id: workspace.activeThemeId } : {}), mode: workspace.activeMode, requested_mode: selection.mode, mappings: selection.mappings, bindings, issues, review };
  run.run_hash = surfaceHash({ ...run, run_hash: undefined });
  return run;
}
function view(snapshot: SurfaceSnapshot, run: SurfaceRun, workspace: Workspace, record?: SurfaceRecord, capture?: SurfaceCapture): SurfacePreview {
  const original = renderSurface(snapshot);
  const tokens = workspace.resolvedTokens.filter((t) => t.valid && t.resolved_value !== null).map((t) => ({ name: t.name, value: String(t.resolved_value), type: t.type, foundation: t.foundation }));
  return { snapshot, run, original: original.document, applied: renderSurface(snapshot, run.bindings).document, declarations: original.declarations,
    tokens, candidates: Object.fromEntries(original.declarations.filter((d) => d.mappable).map((d) => [d.id, tokens.filter((t) => compatibleToken(d.property, t) && equalStyleValue(d.value, t.value)).map((t) => t.name)])),
    stale: run.workspace_fingerprint !== fingerprint(workspace), saved: record ? { id: record.id, revision: run.revision, revisions: record.runs.map((r) => r.revision) } : undefined, capture: record?.capture ?? capture };
}
/** Manual imports arrive as raw input; project captures arrive as a server-held capture id, optionally retitled. */
function resolveImport(raw: unknown): { input: unknown; selection: unknown; capture?: SurfaceCapture; captureId?: string } {
  const parsed = surfaceImportSchema.parse(raw);
  if (!parsed.capture_id) return { input: parsed.input, selection: parsed.selection };
  const entry = readCapture(parsed.capture_id);
  return { input: { ...entry.input, title: parsed.title ?? entry.input.title, context: parsed.context ?? entry.input.context }, selection: parsed.selection, capture: entry.capture, captureId: entry.id };
}

export async function previewSurface(raw: unknown): Promise<SurfacePreview> {
  const parsed = resolveImport(raw), selection = surfaceSelectionSchema.parse(parsed.selection);
  const snapshot = await importSnapshot(parsed.input);
  return withWorkspaceRead(async () => {
    const workspace = await loadWorkspace(selection.theme_id, selection.mode);
    return view(snapshot, await compile(snapshot, selection, workspace, 1, parsed.capture), workspace, undefined, parsed.capture);
  });
}
export async function saveSurface(raw: unknown): Promise<SurfacePreview> {
  const parsed = resolveImport(raw), selection = surfaceSelectionSchema.parse(parsed.selection);
  const snapshot = await importSnapshot(parsed.input);
  return withWorkspaceWrite(async () => {
    const workspace = await loadWorkspace(selection.theme_id, selection.mode);
    const run = await compile(snapshot, selection, workspace, 1, parsed.capture);
    const record: SurfaceRecord = { version: 1, ...profileOwnership(), id: randomUUID(), created_at: new Date().toISOString(), snapshot, ...(parsed.capture ? { capture: parsed.capture } : {}), runs: [run] };
    await writeRecord(record);
    if (parsed.captureId) releaseCapture(parsed.captureId);
    return view(snapshot, run, workspace, record);
  });
}
export const listSurfaces = (): Promise<SurfaceSummary[]> => withWorkspaceRead(async () => {
  const names = await readDirectoryOrEmpty(path.join(workspaceRoot(), "surfaces"));
  const records = [];
  for (const name of names.filter((n) => n.endsWith(".json"))) {
    const r = await readRecord(name.slice(0, -5));
    records.push({ id: r.id, title: r.snapshot.input.title, created_at: r.created_at, revision: r.runs.length, ...(r.capture ? { capture: { project_id: r.capture.project_id, project_name: r.capture.project_name, screen_label: r.capture.screen_label, route: r.capture.route } } : {}) });
  }
  return records.sort((a, b) => b.created_at.localeCompare(a.created_at));
});
export const getSurface = (id: string, revision?: number): Promise<SurfacePreview> => withWorkspaceRead(async () => {
  const record = await readRecord(id), run = record.runs.find((r) => r.revision === (revision ?? record.runs.length));
  if (!run) throw new SurfaceError("Surface revision not found.", 404);
  return view(record.snapshot, run, await loadWorkspace(run.theme_id, run.mode), record);
});
export const reviseSurface = (id: string, raw: unknown, persist = true): Promise<SurfacePreview> => withWorkspaceWrite(async () => {
  const { expected_revision, selection } = surfaceRevisionSchema.parse(raw), record = await readRecord(id);
  if (expected_revision !== record.runs.length) throw new SurfaceError("Surface changed in another view. Reload before saving mappings.", 409);
  if (persist && record.runs.length >= SURFACE_LIMITS.revisions) throw new SurfaceError("Surface has reached its 20-revision limit.");
  const workspace = await loadWorkspace(selection.theme_id, selection.mode);
  const run = await compile(record.snapshot, selection, workspace, record.runs.length + 1, record.capture);
  if (persist) { Object.assign(record, profileOwnership()); record.runs.push(run); await writeRecord(record); }
  return view(record.snapshot, run, workspace, record);
});
export const deleteSurface = (id: string): Promise<void> => withWorkspaceWrite(async () => { await readRecord(id); await durableRemove(recordFile(id)); });

/** User-initiated copy of bounded evidence. No diagnosis, proposal or canonical change is triggered. */
export const surfaceToGap = (id: string, raw: unknown) => withWorkspaceWrite(async () => {
  const input = surfaceGapSchema.parse(raw), record = await readRecord(id), run = record.runs.find((r) => r.revision === input.revision);
  if (!run) throw new SurfaceError("Save this comparison revision before reporting a Gap.");
  const all = [...record.snapshot.issues, ...run.issues];
  const issues = [...new Set(input.issue_ids)].map((key) => { const issue = all.find((i) => i.id === key); if (!issue) throw new SurfaceError("Unknown Surface evidence selection."); return issue; });
  return createGap({ ...(workspaceScope().identity ? { provenance: { profile_id: workspaceScope().identity!.id, surface_id: record.id, revision: run.revision, run_hash: run.run_hash, snapshot_hash: record.snapshot.hash } } : {}), problem: input.problem, expected: input.expected, context: record.snapshot.input.context,
    notes: `Surface ${record.snapshot.input.title}\nID ${record.id}; snapshot ${record.snapshot.hash}; revision ${run.revision}; run ${run.run_hash}\nKnowledge ${run.workspace_fingerprint}; theme ${run.theme_id}; mode ${run.mode}\nCopied static evidence; no rendered measurements or missing-decision claim.\n${issues.map((i) => `${i.id} [${i.kind}] ${i.location}: ${i.detail}`.slice(0, 560) + (i.location.length + i.detail.length > 500 ? " [excerpt; full evidence retained in Surface]" : "")).join("\n")}`,
    project: run.project, theme_id: run.theme_id, mode: run.mode, image: input.include_screenshot ? record.snapshot.input.screenshot : undefined });
});

// Untrusted HTTP revision query parameters must never become NaN/Infinity or select an unintended run.
export const surfaceRevisionQuery = z.coerce.number().int().min(1).max(SURFACE_LIMITS.revisions);
