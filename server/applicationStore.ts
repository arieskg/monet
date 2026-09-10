import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { Gap } from "../shared/gaps.js";
import type { ComponentDecision, MarkdownDocument, Principle, Workspace } from "../shared/model.js";
import {
  applyBlockers, applySupport, emptyComponentDecision, parseRecordKey, recordFieldValues, valuesEqual,
  type ApplicationFile, type ApplicationReceipt, type ApplicationRecord, type ApplicationValidation, type ApplyBlocker, type ApplyErrorKind, type ApplyPlan, type ApplyResult, type Proposal, type ProposalChange, type ProposalRevision,
} from "../shared/proposals.js";
import { themeModes } from "../shared/tokens.js";
import { atomicWrite, cleanId, isMissing, loadWorkspace, readDirectoryOrEmpty, readJson, renderFrontmatter, writeComponentDecision, writeExports, writePatternRecord, writePrincipleRecord } from "./fileStore.js";
import { gapKnowledge, knowledgeFingerprint } from "./gapDiagnosis.js";
import { proposalInternals as proposals } from "./proposalStore.js";
import { validateWorkspace } from "./validate.js";
import { workspaceRoot, workspaceScope, profileOwnership, assertProfileOwnership } from "./workspace.js";
import { blockWorkspace, clearRecoveryBlock, recoveryBlock, withWorkspaceRead, withWorkspaceRecovery, withWorkspaceWrite, WorkspaceUnavailableError } from "./writeLock.js";
import { durableRemove } from "./durableFiles.js";

/**
 * Apply: the one path from a Proposal to canonical Monet records.
 *
 * It accepts only a saved, approved revision named by number and hash, re-verifies everything
 * approval verified (integrity, target fingerprints, per-field snapshots, prospective validation and
 * lint) under the workspace write lock, and then runs a file-backed transaction: journal the before
 * bytes durably, write through the existing record writers, regenerate exports once, read the
 * workspace back and validate it, write a receipt, mark the proposal applied, and only then drop
 * the journal. Any failure after writing starts restores every before byte, regenerates exports,
 * verifies the restore, and reports it. A journal left behind by a crash is recovered at startup.
 *
 * No AI is involved anywhere in this module; nothing here reads provider output.
 */

export class ApplyError extends Error {
  status: number;
  constructor(public kind: ApplyErrorKind, message: string, public receipt: ApplicationReceipt | null = null) {
    super(message);
    this.status = kind === "write_failed" ? 500 : 409;
  }
}

interface JournalFile { path: string; action: "update" | "create"; /** base64 of the bytes before the transaction; null when the file did not exist. */ before: string | null; before_hash: string | null }
interface Journal {
  profile_id?: string; scope_version?: 2;
  version: 1; application_id: string; proposal_id: string; gap_id: string; revision: number; hash: string; started_at: string;
  records: ApplicationRecord[]; files: JournalFile[]; derived: string[];
  /** Validation errors that existed before the transaction, so a rollback can tell restored from broken. */
  baseline_errors: string[];
  knowledge_fingerprint_before: string;
}
export interface RecoveryResult { application_id: string; proposal_id: string; outcome: "completed" | "rolled_back"; restored: boolean; failure: string | null }

const root = workspaceRoot;
const APPLICATIONS = "applications";
const receiptPath = (id: string) => path.join(root(), APPLICATIONS, `${id}.json`);
const journalPath = (id: string) => path.join(root(), APPLICATIONS, `${id}.journal.json`);
const sha256 = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const describe = (finding: { check: string; detail: string }) => `${finding.check}: ${finding.detail}`;
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 2000);

const durableWrite = atomicWrite;

async function readBytes(relative: string): Promise<Buffer | null> {
  try { return await readFile(path.join(root(), relative)); }
  catch (error) { if (isMissing(error)) return null; throw error; }
}

const FILE_ORDER: Record<string, number> = { principle: 0, pattern: 1, component: 2 };

/** The canonical file one change writes. Only the kinds Apply supports have one. */
function targetPath(target: string): string | null {
  const parsed = parseRecordKey(target);
  if (!parsed) return null;
  switch (parsed.kind) {
    case "principle": return `principles/${parsed.id}.md`;
    case "pattern": return `patterns/${parsed.id}.md`;
    case "component": return "components/decisions.json";
    default: return null;
  }
}

function derivedPaths(workspace: Workspace): string[] {
  return ["DESIGN_SYSTEM.md", "design-system.json", "tokens/tokens.json", ...workspace.foundations.map((foundation) => `tokens/${foundation.id}.json`),
    ...workspace.themes.flatMap((theme) => themeModes(workspace.foundations, theme).map((mode) => mode === "light" ? `tokens/themes/${theme.id}.json` : `tokens/themes/${theme.id}.${mode}.json`))];
}

function groupRecords(proposal: Proposal, changes: readonly ProposalChange[]): ApplicationRecord[] {
  const links = new Map(proposal.allowed_targets.map((target) => [target.key, target]));
  const groups = new Map<string, ApplicationRecord>();
  for (const change of changes) {
    const group = groups.get(change.target);
    if (group) { group.fields.push(change.field); continue; }
    const parsed = parseRecordKey(change.target);
    const link = links.get(change.target);
    const createdTitle = changes.find((item) => item.target === change.target && item.field === "title")?.after;
    groups.set(change.target, {
      key: change.target, operation: change.operation, fields: [change.field],
      title: link?.title ?? (typeof createdTitle === "string" && createdTitle ? createdTitle : parsed?.id ?? change.target),
      route: link?.route ?? (parsed?.kind === "pattern" ? `/patterns/${parsed.id}` : parsed?.kind === "principle" ? `/principles/${parsed.id}` : parsed?.kind === "component" ? `/components/${parsed.id}` : ""),
    });
  }
  return [...groups.values()];
}

/** Journals left behind by an interrupted or unrecovered application. Nothing may be applied over them. */
async function pendingJournals(): Promise<string[]> {
  return (await readDirectoryOrEmpty(path.join(root(), APPLICATIONS))).filter((name) => name.endsWith(".journal.json")).sort();
}

type Context = Awaited<ReturnType<typeof proposals.context>>;

/**
 * What Apply would do right now. Shared saved-state rules first, then the live checks approval ran:
 * every snapshot must still equal the record, and validation and lint must pass against the current
 * workspace. Unsupported changes are listed, never dropped: a proposal is applied whole or not at all.
 */
async function buildPlan(proposal: Proposal, gap: Gap | null, ctx: Context, applications: ApplicationReceipt[]): Promise<ApplyPlan> {
  const staleness = proposals.staleness(proposal, gap, ctx);
  const integrity = proposals.integrity(proposal);
  const blockers: ApplyBlocker[] = applyBlockers({ ...proposal, staleness, integrity });
  if (workspaceScope().identity && proposal.status !== "applied" && ((proposal.approval && !proposal.approval.profile_id) || (proposals.latest(proposal) && !proposals.latest(proposal)!.profile_id))) blockers.push({ kind: "state", message: "Save and approve a new Profile-bound revision before applying this historical proposal." });
  const revision = proposal.approval ? proposal.revisions.find((item) => item.number === proposal.approval!.revision) ?? null : proposals.latest(proposal) ?? null;
  const changes = revision?.changes ?? [];
  const unsupported = changes.flatMap((change) => { const support = applySupport(change); return support.supported ? [] : [{ target: change.target, field: change.field, reason: support.reason }]; });
  if (unsupported.length && proposal.status !== "applied") blockers.push({ kind: "unsupported", message: `${unsupported.length} approved change${unsupported.length === 1 ? "" : "s"} target${unsupported.length === 1 ? "s" : ""} records Apply cannot write yet: ${unsupported.map((item) => `${item.target}.${item.field}`).join(", ")}. Nothing is applied partially.` });
  let checks: ApplyPlan["checks"] = null;
  if (revision && gap && proposal.status === "approved" && !blockers.length) {
    for (const change of revision.changes) {
      if (change.operation === "create") { if (recordFieldValues(ctx.workspace, change.target) !== null) blockers.push({ kind: "stale", message: `${change.target} now exists; the approved revision expected to create it.` }); continue; }
      const current = recordFieldValues(ctx.workspace, change.target)?.[change.field] ?? null;
      if (!valuesEqual(change.before, current)) blockers.push({ kind: "stale", message: `${change.target}.${change.field} no longer matches the value the approved revision was written against. Refresh, review, and approve again.` });
    }
    for (const [key, fingerprint] of Object.entries(revision.target_fingerprints)) {
      if (proposals.targetFingerprint(ctx.workspace, key) !== fingerprint && !blockers.some((blocker) => blocker.message.startsWith(key))) blockers.push({ kind: "stale", message: `${key} changed after approval.` });
    }
    checks = proposals.computeChecks(ctx, revision.changes, gap, proposal);
    if (!checks.ok) blockers.push({ kind: "validation", message: "Prospective validation or the generality lint reports errors against the current workspace. Refresh the proposal, fix the errors in a new revision, and approve again." });
  }
  const records = groupRecords(proposal, changes);
  const targets = [...new Set(changes.map((change) => targetPath(change.target)).filter((item): item is string => item !== null))].sort();
  const files: ApplyPlan["files"] = targets.map((file) => ({ path: file, action: changes.some((change) => change.operation === "create" && targetPath(change.target) === file) ? "create" : "update" }));
  files.push({ path: `decisions/<applied-at>-proposal-${proposal.id.slice(0, 8)}.md`, action: "create" });
  return { proposal_id: proposal.id, status: proposal.status, revision: revision?.number ?? null, hash: revision?.hash ?? null, ready: proposal.status === "approved" && !blockers.length, blockers, unsupported, records, files, derived: derivedPaths(ctx.workspace), checks, staleness, integrity, applications };
}

export async function planApplication(id: string): Promise<ApplyPlan> {
  return withWorkspaceRead(async () => {
    const proposal = await proposals.readProposal(id);
    const gap = await proposals.gapOrNull(proposal.gap_id);
    const ctx = await proposals.context();
    return buildPlan(proposal, gap, ctx, await listApplications(proposal.id));
  });
}

/** Receipts are atomic audit metadata and remain inspectable during blocked recovery. They
 * never grant canonical access, and every receipt is still checked against its Profile. */
export async function listApplications(proposalId?: string): Promise<ApplicationReceipt[]> {
  const files = (await readDirectoryOrEmpty(path.join(root(), APPLICATIONS))).filter((name) => name.endsWith(".json") && !name.endsWith(".journal.json"));
  const receipts = await Promise.all(files.map((name) => readJson<ApplicationReceipt>(path.join(root(), APPLICATIONS, name))));
  receipts.forEach(assertProfileOwnership);
  return receipts.filter((receipt) => receipt.version === 1 && typeof receipt.id === "string" && (!proposalId || receipt.proposal_id === proposalId)).sort((a, b) => b.started_at.localeCompare(a.started_at));
}

export async function getApplication(id: string): Promise<ApplicationReceipt> {
  const receipt = await readJson<ApplicationReceipt>(receiptPath(cleanId(id)));
  assertProfileOwnership(receipt);
  if (receipt.version !== 1 || receipt.id !== id) throw new Error("Invalid application receipt.");
  return receipt;
}

async function receiptOrNull(id: string): Promise<ApplicationReceipt | null> {
  try { return await getApplication(id); }
  catch (error) { if (isMissing(error)) return null; throw error; }
}

/** Writes the approved values through the record writers, in a fixed order, from the workspace read under the lock. */
async function writeRecords(changes: readonly ProposalChange[], workspace: Workspace): Promise<void> {
  const byTarget = new Map<string, ProposalChange[]>();
  for (const change of changes) byTarget.set(change.target, [...(byTarget.get(change.target) ?? []), change]);
  const kindOf = (target: string) => parseRecordKey(target)?.kind ?? "";
  const ordered = [...byTarget].sort(([a], [b]) => (FILE_ORDER[kindOf(a)] ?? 9) - (FILE_ORDER[kindOf(b)] ?? 9) || a.localeCompare(b));
  for (const [target, group] of ordered) {
    const parsed = parseRecordKey(target);
    if (!parsed) throw new Error(`${target}: not a record key.`);
    const values = Object.fromEntries(group.map((change) => [change.field, change.after]));
    if (parsed.kind === "principle") {
      const current = workspace.principles.find((item) => item.id === parsed.id);
      if (!current) throw new Error(`${target}: the principle no longer exists.`);
      await writePrincipleRecord(parsed.id, { ...current, ...values } as Principle);
    } else if (parsed.kind === "pattern") {
      const current = workspace.patterns.find((item) => item.id === parsed.id);
      const creating = group.some((change) => change.operation === "create");
      if (!current && !creating) throw new Error(`${target}: the pattern no longer exists.`);
      if (current && creating) throw new Error(`${target}: the pattern already exists.`);
      // The same defaults the prospective projection used, so what was validated is what is written.
      const base: MarkdownDocument = current ?? { id: parsed.id, title: parsed.id, summary: "", body: "", status: "experimental", tags: [], order: workspace.patterns.length, updated_at: "", components: [], foundations: [] };
      await writePatternRecord(parsed.id, { ...base, ...values } as MarkdownDocument);
    } else if (parsed.kind === "component") {
      const current = workspace.components.find((item) => item.id === parsed.id) ?? emptyComponentDecision(parsed.id);
      await writeComponentDecision(parsed.id, { ...current, ...values } as ComponentDecision);
    } else {
      throw new Error(`${target}: Apply cannot write ${parsed.kind} records.`);
    }
  }
}

/**
 * The readable `decisions/` entry, the same mechanism a changed component inspiration uses. It
 * names the proposal, revision, hash, receipt, and the records and fields that changed. The Gap
 * report, screenshot, and rationale stay in the editor-only records and are never copied here.
 */
function decisionEntry(id: string, proposal: Proposal, revision: ProposalRevision, records: ApplicationRecord[], applicationId: string, now: string): string {
  const title = `Applied Gap proposal ${proposal.id}, revision ${revision.number}`;
  const summary = `Application ${applicationId}; approved revision ${revision.number}.`;
  const body = [`# ${title}`, "", "Records changed:", ...records.map((record) => `- ${record.key}${record.operation === "create" ? " (new)" : ""}: ${record.fields.join(", ")}`), "",
    `Gap ${proposal.gap_id}; proposal ${proposal.id}, revision ${revision.number} (hash ${revision.hash}), application ${applicationId}.`].join("\n");
  const tags = [...new Set(["gap", "proposal", ...records.flatMap((record) => { const parsed = parseRecordKey(record.key); return parsed ? [parsed.id] : []; })])];
  return renderFrontmatter({ id, title, summary, body, status: "selected", tags, order: 0, updated_at: now });
}

async function hashFiles(files: readonly JournalFile[]): Promise<ApplicationFile[]> {
  return Promise.all(files.map(async (file) => { const bytes = await readBytes(file.path); return { path: file.path, action: file.action, before_hash: file.before_hash, after_hash: bytes ? sha256(bytes) : null }; }));
}

function validation(workspace: Workspace, baseline: ReadonlySet<string>): ApplicationValidation {
  const findings = validateWorkspace(workspace);
  const errors = findings.filter((finding) => finding.level === "error");
  const new_errors = errors.map(describe).filter((detail) => !baseline.has(detail));
  return { ok: !new_errors.length, errors: errors.length, warnings: findings.length - errors.length, new_errors };
}

/**
 * Puts every journaled file back to its before bytes, regenerates the exports, and verifies the
 * result byte for byte. Problems are collected rather than thrown so the receipt can say exactly
 * what was and was not restored.
 */
async function restore(journal: Journal): Promise<{ restored: boolean; files: ApplicationFile[]; validation: ApplicationValidation | null; problems: string[] }> {
  const problems: string[] = [];
  for (const file of journal.files) {
    const absolute = path.join(root(), file.path);
    try {
      if (file.before === null) await durableRemove(absolute);
      else await atomicWrite(absolute, Buffer.from(file.before, "base64"));
    } catch (error) { problems.push(`${file.path}: ${errorMessage(error)}`); }
  }
  try { await writeExports(); } catch (error) { problems.push(`exports: ${errorMessage(error)}`); }
  const files = await hashFiles(journal.files);
  for (const file of files) if (file.after_hash !== file.before_hash) problems.push(`${file.path} does not match its before bytes after restore.`);
  let result: ApplicationValidation | null = null;
  try {
    result = validation(await loadWorkspace(), new Set(journal.baseline_errors));
    if (!result.ok) problems.push(`the restored workspace has new validation errors: ${result.new_errors.join("; ")}`);
  } catch (error) { problems.push(`the restored workspace could not be read: ${errorMessage(error)}`); }
  return { restored: !problems.length, files, validation: result, problems };
}

function receiptFrom(journal: Journal, outcome: ApplicationReceipt["outcome"], extra: Partial<ApplicationReceipt>): ApplicationReceipt {
  return { version: 1, ...(journal.profile_id ? { profile_id: journal.profile_id, scope_version: 2 as const } : {}), id: journal.application_id, proposal_id: journal.proposal_id, gap_id: journal.gap_id, revision: journal.revision, hash: journal.hash, outcome, started_at: journal.started_at, finished_at: new Date().toISOString(),
    recovered: false, failure: null, restored: true, records: journal.records, files: [], derived: journal.derived, validation: null, knowledge_fingerprint_before: journal.knowledge_fingerprint_before, knowledge_fingerprint_after: null, ...extra };
}

async function rollback(journal: Journal, kind: ApplyErrorKind, failure: string, recovered: boolean): Promise<ApplicationReceipt> {
  const { restored, files, validation: result, problems } = await restore(journal);
  const receipt = receiptFrom(journal, "rolled_back", { recovered, failure: restored ? failure : `${failure} Recovery problems: ${problems.join("; ")}`, restored, files, validation: result });
  await durableWrite(receiptPath(journal.application_id), `${JSON.stringify(receipt, null, 2)}\n`);
  // The journal outlives a restore that could not be verified, so the next start tries again.
  if (restored) await removeJournal(journal);
  if (!recovered) throw new ApplyError(kind, `${kind === "validation" ? "The written records did not pass validation, so" : "Writing failed, so"} the application was rolled back. ${restored ? "Every record was restored to its previous bytes and the exports were regenerated; nothing changed." : `Restore could not be verified: ${problems.join("; ")}. The journal is kept and Monet will retry recovery at the next start.`} Cause: ${failure}`, receipt);
  return receipt;
}

const applySchema = z.object({ revision: z.number().int().positive(), hash: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
const applying = new Map<string, Promise<unknown>>();

/**
 * Applies the approved revision named by the request. Duplicate requests for one proposal queue
 * behind each other rather than racing: the second one reads the applied state and returns the
 * same receipt. The proposal lock excludes concurrent edits; the workspace write lock excludes
 * ordinary saves for the whole transaction.
 */
export async function applyProposal(id: string, input: unknown): Promise<ApplyResult> {
  const { revision, hash } = applySchema.parse(input);
  const key = `${root()}:${id}`;
  const run = (applying.get(key) ?? Promise.resolve()).catch(() => undefined).then(() => withWorkspaceWrite(() => proposals.withLock(id, () => applyLocked(id, revision, hash))));
  applying.set(key, run);
  try { return await run; } finally { if (applying.get(key) === run) applying.delete(key); }
}

async function applyLocked(id: string, revision: number, hash: string): Promise<ApplyResult> {
  const proposal = await proposals.readProposal(id);
  const gap = await proposals.gapOrNull(proposal.gap_id);
  const ctx = await proposals.context();
  if (proposal.status === "applied") {
    if (proposal.approval?.revision !== revision || proposal.approval.hash !== hash) throw new ApplyError("state", `This proposal was already applied as revision ${proposal.approval?.revision ?? "?"}; the request named revision ${revision}.`);
    return { outcome: "already_applied", receipt: await receiptOrNull(proposal.application!.id), proposal: proposals.view(proposal, gap, ctx) };
  }
  const plan = await buildPlan(proposal, gap, ctx, []);
  if (proposal.status !== "approved" || !proposal.approval) throw new ApplyError("state", plan.blockers[0]?.message ?? "Approve the current revision before applying it.");
  if (proposal.approval.revision !== revision || proposal.approval.hash !== hash) throw new ApplyError("state", `Apply must name the approved revision ${proposal.approval.revision} and its hash exactly. Reload the proposal and review it again.`);
  const blocker = plan.blockers[0];
  if (blocker) throw new ApplyError(blocker.kind, blocker.message);
  const approved = proposal.revisions.find((item) => item.number === revision);
  // Belt and braces: the plan verified integrity through `current_ok`; the hash named by the request is checked against the stored content directly too.
  if (!approved || proposals.revisionHash(approved) !== hash || approved.hash !== hash) throw new ApplyError("integrity", "The approved revision's stored content does not match the hash named by the request.");
  if (!gap) throw new ApplyError("stale", "The Gap behind this proposal was deleted after approval.");
  return transaction(proposal, approved, gap, ctx, plan);
}

async function transaction(proposal: Proposal, approved: ProposalRevision, gap: Gap, ctx: Context, plan: ApplyPlan): Promise<ApplyResult> {
  const application_id = randomUUID();
  const started_at = new Date().toISOString();
  const entry = `decisions/${started_at.replace(/[:.]/g, "-").toLowerCase()}-proposal-${proposal.id.slice(0, 8)}.md`;
  const targets = [...new Set(approved.changes.map((change) => targetPath(change.target)))].sort();
  const files: JournalFile[] = [];
  for (const relative of [...targets, entry]) {
    if (relative === null) throw new ApplyError("unsupported", "A change targets a record kind Apply cannot write.");
    const bytes = await readBytes(relative);
    const created = relative === entry || approved.changes.some((change) => change.operation === "create" && targetPath(change.target) === relative);
    if (created && bytes !== null) throw new ApplyError("stale", `${relative} already exists; the approved revision expected to create it.`);
    // The decision file is the one target the writer creates on demand; every other update needs its file.
    if (!created && bytes === null && relative !== "components/decisions.json") throw new ApplyError("stale", `${relative} is missing; the approved revision expected to update it.`);
    files.push({ path: relative, action: bytes === null ? "create" : "update", before: bytes?.toString("base64") ?? null, before_hash: bytes ? sha256(bytes) : null });
  }
  const baseline = validateWorkspace(ctx.workspace).filter((finding) => finding.level === "error").map(describe);
  const journal: Journal = { version: 1, ...profileOwnership(), application_id, proposal_id: proposal.id, gap_id: proposal.gap_id, revision: approved.number, hash: approved.hash, started_at, records: plan.records, files, derived: plan.derived, baseline_errors: baseline, knowledge_fingerprint_before: ctx.fingerprint };
  // Before the first canonical write, the before bytes are on disk. A failure here changes nothing.
  await durableWrite(journalPath(application_id), `${JSON.stringify(journal, null, 2)}\n`);
  return commit(proposal, approved, gap, ctx, journal, plan, entry);
}

async function commit(proposal: Proposal, approved: ProposalRevision, gap: Gap, ctx: Context, journal: Journal, plan: ApplyPlan, entry: string): Promise<ApplyResult> {
  const { application_id, started_at, files, baseline_errors: baseline } = journal;
  let receipt: ApplicationReceipt;
  let publishingReceipt = false;
  try {
    await writeRecords(approved.changes, ctx.workspace);
    await atomicWrite(path.join(root(), entry), decisionEntry(path.basename(entry, ".md"), proposal, approved, plan.records, application_id, started_at));
    await writeExports();
    const after = await loadWorkspace();
    for (const change of approved.changes) {
      const value = recordFieldValues(after, change.target)?.[change.field] ?? null;
      // Markdown bodies are stored trimmed; every other value must read back exactly as approved.
      const same = valuesEqual(value, change.after) || (typeof value === "string" && typeof change.after === "string" && value === change.after.trim());
      if (!same) throw new ApplyError("validation", `${change.target}.${change.field} did not read back as the approved value after writing.`);
    }
    const result = validation(after, new Set(baseline));
    if (!result.ok) throw new ApplyError("validation", `Validation failed after writing: ${result.new_errors.join("; ")}`);
    const derived_hashes = await Promise.all(journal.derived.map(async (relative) => {
      const bytes = await readBytes(relative);
      if (bytes === null) throw new Error(`Missing generated export ${relative}.`);
      return { path: relative, hash: sha256(bytes) };
    }));
    receipt = receiptFrom(journal, "applied", { files: await hashFiles(files), derived_hashes, validation: result, knowledge_fingerprint_after: knowledgeFingerprint(gapKnowledge(after)) });
    // The receipt is the commit point: once it is on disk the canonical change is complete.
    publishingReceipt = true;
    await durableWrite(receiptPath(application_id), `${JSON.stringify(receipt, null, 2)}\n`);
  } catch (error) {
    if (publishingReceipt) {
      // A rename may have succeeded before directory fsync failed. Never undo a possible commit
      // or overwrite its evidence with a rollback receipt. Recovery must prove what happened.
      let bytes: Buffer | null;
      try { bytes = await readBytes(`${APPLICATIONS}/${application_id}.json`); }
      catch { throw new ApplyError("write_failed", "The receipt write could not be verified. The journal is kept and all workspace access is blocked until recovery."); }
      if (bytes !== null) throw new ApplyError("write_failed", `The receipt may have committed, but its durability could not be verified (${errorMessage(error)}). The journal is kept; restart Monet for verified recovery.`);
    }
    await rollback(journal, error instanceof ApplyError ? error.kind : "write_failed", errorMessage(error), false);
    throw new ApplyError("write_failed", "The application was rolled back."); // Unreachable: an in-request rollback always throws with its receipt.
  }
  try {
    const next: Proposal = { ...proposal, status: "applied", application: { id: application_id, applied_at: receipt.finished_at }, updated_at: receipt.finished_at };
    await proposals.writeProposal(next);
    await removeJournal(journal);
    return { outcome: "applied", receipt, proposal: proposals.view(next, gap, await proposals.context()) };
  } catch (error) {
    throw new ApplyError("write_failed", `The changes were applied and receipt ${application_id} was written, but the proposal record could not be updated (${errorMessage(error)}). The journal is kept; Monet will finish the bookkeeping at the next start.`, receipt);
  }
}

async function removeJournal(journal: Journal): Promise<void> {
  // Separate MCP processes detect an entire transaction between their before/after read checks.
  // Publish only after canonical state and receipt are durable, while the journal still guards it.
  await durableWrite(path.join(root(), APPLICATIONS, ".generation"), randomUUID());
  try { await durableRemove(journalPath(journal.application_id)); }
  catch (error) {
    // If unlink succeeded but syncing the deletion failed, put the guard/evidence back. Do not
    // make the running service writable just because the directory entry disappeared in memory.
    blockWorkspace("Journal removal could not be made durable. Workspace access is blocked until recovery can be verified.");
    await durableWrite(journalPath(journal.application_id), `${JSON.stringify(journal, null, 2)}\n`);
    throw error;
  }
}

const idSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/);
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const canonicalPath = z.string().regex(/^(?:(?:principles|patterns)\/[a-z0-9][a-z0-9-]{0,79}\.md|components\/decisions\.json|decisions\/[a-z0-9][a-z0-9-]*-proposal-[a-z0-9-]+\.md)$/);
const derivedPath = z.string().regex(/^(?:DESIGN_SYSTEM\.md|design-system\.json|tokens\/(?:themes\/)?[a-z0-9][a-z0-9.-]*\.json)$/);
const journalSchema = z.object({
  version: z.literal(1), profile_id: z.string().uuid().optional(), scope_version: z.literal(2).optional(), application_id: idSchema, proposal_id: idSchema, gap_id: idSchema,
  revision: z.number().int().positive(), hash: hashSchema, started_at: z.string(),
  records: z.array(z.object({ key: z.string(), operation: z.enum(["amend", "create"]), title: z.string(), route: z.string(), fields: z.array(z.string()) })),
  files: z.array(z.object({ path: canonicalPath, action: z.enum(["update", "create"]), before: z.string().nullable(), before_hash: hashSchema.nullable() })).min(1),
  derived: z.array(derivedPath), baseline_errors: z.array(z.string()), knowledge_fingerprint_before: z.string(),
}).strict();

function verifyJournal(raw: unknown, name: string): Journal {
  const journal = journalSchema.parse(raw);
  assertProfileOwnership(journal);
  if (`${journal.application_id}.journal.json` !== name || new Set(journal.files.map((file) => file.path)).size !== journal.files.length) throw new Error("Journal identity or file list is inconsistent.");
  for (const file of journal.files) {
    if (file.before === null) {
      if (file.before_hash !== null || file.action !== "create") throw new Error(`Invalid absent-file snapshot: ${file.path}.`);
    } else {
      const bytes = Buffer.from(file.before, "base64");
      if (bytes.toString("base64") !== file.before || sha256(bytes) !== file.before_hash || file.action !== "update") throw new Error(`Invalid before bytes: ${file.path}.`);
    }
  }
  return journal;
}

function verifyReceiptIdentity(journal: Journal, receipt: ApplicationReceipt): void {
  assertProfileOwnership(receipt);
  if (receipt.profile_id !== journal.profile_id || receipt.scope_version !== journal.scope_version || receipt.version !== 1 || receipt.id !== journal.application_id || receipt.proposal_id !== journal.proposal_id || receipt.gap_id !== journal.gap_id || receipt.revision !== journal.revision || receipt.hash !== journal.hash
    || receipt.started_at !== journal.started_at || receipt.knowledge_fingerprint_before !== journal.knowledge_fingerprint_before || typeof receipt.recovered !== "boolean" || !Number.isFinite(Date.parse(receipt.finished_at))
    || !valuesEqual(receipt.records, journal.records) || !valuesEqual(receipt.derived, journal.derived)
    || !Array.isArray(receipt.files) || receipt.files.length !== journal.files.length || new Set(receipt.files.map((file) => file.path)).size !== receipt.files.length) throw new Error("Receipt and journal disagree.");
  for (const before of journal.files) {
    const file = receipt.files.find((item) => item.path === before.path);
    if (!file || file.before_hash !== before.before_hash || file.action !== before.action) throw new Error(`Receipt and journal disagree about ${before.path}.`);
  }
}

function verifyProposalIdentity(journal: Journal, proposal: Proposal, receipt?: ApplicationReceipt): void {
  const approved = proposals.latest(proposal);
  if (approved?.profile_id !== journal.profile_id || proposal.approval?.profile_id !== journal.profile_id || !approved || approved.number !== journal.revision || approved.hash !== journal.hash || proposals.revisionHash(approved) !== journal.hash
    || proposal.gap_id !== journal.gap_id || proposal.approval?.revision !== journal.revision || proposal.approval.hash !== journal.hash
    || (proposal.status !== "approved" && !(receipt?.outcome === "applied" && proposal.status === "applied"))
    || (proposal.status === "applied" ? proposal.application?.id !== receipt?.id || proposal.application?.applied_at !== receipt?.finished_at : Boolean(proposal.application))
    || !valuesEqual(groupRecords(proposal, approved.changes), journal.records)) throw new Error("Proposal does not identify the exact committed approval; recovery will not mark a different revision applied.");
  const expectedTargets = [...new Set(approved.changes.map((change) => targetPath(change.target)))].sort();
  const actualTargets = journal.files.filter((file) => !file.path.startsWith("decisions/")).map((file) => file.path).sort();
  if (approved.changes.some((change) => !applySupport(change).supported) || !valuesEqual(expectedTargets, actualTargets) || journal.files.filter((file) => file.path.startsWith("decisions/")).length !== 1) throw new Error("The journal does not match the approved write targets.");
}

async function verifyCommit(journal: Journal, receipt: ApplicationReceipt): Promise<Proposal> {
  verifyReceiptIdentity(journal, receipt);
  const proposal = await proposals.readProposal(journal.proposal_id);
  verifyProposalIdentity(journal, proposal, receipt);
  for (const file of await hashFiles(journal.files)) {
    const expected = receipt.files.find((item) => item.path === file.path)!.after_hash;
    if (!hashSchema.safeParse(expected).success || file.after_hash !== expected) throw new Error(`Canonical after-hash does not match the receipt: ${file.path}.`);
  }
  const workspace = await loadWorkspace();
  if (!receipt.restored || !receipt.validation?.ok || !valuesEqual(validation(workspace, new Set(journal.baseline_errors)), receipt.validation)
    || knowledgeFingerprint(gapKnowledge(workspace)) !== receipt.knowledge_fingerprint_after) throw new Error("Canonical validation or knowledge fingerprint disagrees with the receipt.");
  if (!valuesEqual(derivedPaths(workspace), journal.derived) || !Array.isArray(receipt.derived_hashes) || receipt.derived_hashes.length !== journal.derived.length
    || new Set(receipt.derived_hashes.map((file) => file.path)).size !== journal.derived.length) throw new Error("The receipt cannot prove the generated exports. Recovery evidence is retained.");
  for (const relative of journal.derived) {
    const bytes = await readBytes(relative);
    if (bytes === null || sha256(bytes) !== receipt.derived_hashes.find((file) => file.path === relative)?.hash) throw new Error(`Export after-hash does not match the receipt: ${relative}.`);
  }
  return proposal;
}

/** Recovery is the only write-boundary exception. Any unproven state stops startup with evidence intact. */
export async function recoverApplications(): Promise<RecoveryResult[]> {
  return withWorkspaceRecovery(async () => {
    const results: RecoveryResult[] = [];
    const names = await pendingJournals();
    if (!names.length && recoveryBlock()) throw new WorkspaceUnavailableError("Recovery evidence could not be retained. Restart Monet or restore the journal before continuing.");
    for (const name of names) {
      try {
        const journal = verifyJournal(await readJson<unknown>(path.join(root(), APPLICATIONS, name)), name);
        const receipt = await receiptOrNull(journal.application_id);
        if (receipt) verifyReceiptIdentity(journal, receipt);
        if (receipt?.outcome === "applied") {
          const proposal = await verifyCommit(journal, receipt);
          // Rewriting also establishes durability after a receipt rename whose directory sync failed.
          await durableWrite(receiptPath(receipt.id), `${JSON.stringify({ ...receipt, recovered: true }, null, 2)}\n`);
          await proposals.writeProposal({ ...proposal, status: "applied", application: { id: receipt.id, applied_at: receipt.finished_at }, updated_at: receipt.finished_at });
          await removeJournal(journal);
          results.push({ application_id: journal.application_id, proposal_id: journal.proposal_id, outcome: "completed", restored: true, failure: null });
        } else {
          if (receipt && receipt.outcome !== "rolled_back") throw new Error("Unknown receipt outcome.");
          // An applied proposal with a missing/rollback receipt is contradictory commit evidence,
          // not permission to undo it. A deleted, uncommitted proposal does not prevent restoring
          // a valid journal's before bytes.
          let proposal: Proposal | null = null;
          try { proposal = await proposals.readProposal(journal.proposal_id); } catch (error) { if (!isMissing(error)) throw error; }
          if (proposal) verifyProposalIdentity(journal, proposal, receipt ?? undefined);
          const rolledBack = await rollback(journal, "write_failed", receipt?.failure ?? "Monet stopped before this application finished.", true);
          if (!rolledBack.restored) throw new Error(rolledBack.failure ?? "Restore could not be verified.");
          results.push({ application_id: journal.application_id, proposal_id: journal.proposal_id, outcome: "rolled_back", restored: true, failure: rolledBack.failure });
        }
      } catch (error) {
        throw new WorkspaceUnavailableError(`Recovery of ${name} could not be verified. Workspace access is blocked and recovery evidence is retained. ${errorMessage(error)}`);
      }
    }
    clearRecoveryBlock();
    return results;
  });
}
