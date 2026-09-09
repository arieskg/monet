import { mkdir } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { z, ZodError } from "zod";
import type { Gap } from "../shared/gaps.js";
import type { Workspace } from "../shared/model.js";
import {
  PROPOSAL_CREATABLE_KIND, PROPOSAL_FIELDS, canonicalJson, lintProposal, parseFieldValue, parseRecordKey, projectProposal, proposalEligibility, proposalRevisionInputSchema, recordFieldValues, valuesEqual,
  type GapProposalOverview, type Proposal, type ProposalAuthor, type ProposalChange, type ProposalChecks, type ProposalDraftResponse, type ProposalRevision, type ProposalRevisionInput, type ProposalStaleness, type ProposalSummary, type ProposalTargetView, type ProposalView,
} from "../shared/proposals.js";
import { providerConfigured } from "./aiProvider.js";
import { cleanId, getGap, isMissing, loadWorkspace, readDirectoryOrEmpty, readJson, writeJson } from "./fileStore.js";
import { gapKnowledge, knowledgeFingerprint, recordFingerprint, type GapKnowledgeRecord } from "./gapDiagnosis.js";
import { draftProposal } from "./proposalDrafting.js";
import { validateWorkspace } from "./validate.js";
import { workspaceRoot } from "./workspace.js";

/**
 * Proposals are editor-only records under `proposals/` in the active workspace. Like Gaps they are
 * absent from `Workspace`, exports, and MCP. This module reads canonical records to snapshot,
 * project, and validate; it never writes one. Apply belongs to a later phase with its own journal.
 */

/** A request that is well-formed but not allowed in the proposal's current state. */
export class ProposalStateError extends Error { status = 409; }

const root = workspaceRoot;
const locks = new Set<string>();

interface Context { workspace: Workspace; knowledge: GapKnowledgeRecord[]; fingerprint: string; records: Map<string, GapKnowledgeRecord> }
async function context(): Promise<Context> {
  const workspace = await loadWorkspace();
  const knowledge = gapKnowledge(workspace);
  return { workspace, knowledge, fingerprint: knowledgeFingerprint(knowledge), records: new Map(knowledge.map((record) => [record.key, record])) };
}

async function readProposal(id: string): Promise<Proposal> {
  const proposal = await readJson<Proposal>(path.join(root(), "proposals", `${cleanId(id)}.json`));
  if (proposal.version !== 1 || proposal.id !== id || !Array.isArray(proposal.revisions) || !Array.isArray(proposal.allowed_targets)) throw new Error("Invalid Proposal record.");
  return proposal;
}

async function writeProposal(proposal: Proposal): Promise<void> {
  await mkdir(path.join(root(), "proposals"), { recursive: true });
  await writeJson(path.join(root(), "proposals", `${proposal.id}.json`), proposal);
}

async function gapOrNull(id: string): Promise<Gap | null> {
  try { return await getGap(id); }
  catch (error) { if (isMissing(error)) return null; throw error; }
}

function latest(proposal: Proposal): ProposalRevision | undefined {
  return proposal.revisions[proposal.revisions.length - 1];
}

function summary(proposal: Proposal): ProposalSummary {
  return { id: proposal.id, gap_id: proposal.gap_id, status: proposal.status, created_at: proposal.created_at, updated_at: proposal.updated_at, summary: latest(proposal)?.summary ?? "", revision: latest(proposal)?.number ?? 0, approved_revision: proposal.approval?.revision ?? null };
}

function targetViews(proposal: Proposal, workspace: Workspace): ProposalTargetView[] {
  return proposal.allowed_targets.flatMap((target) => {
    const parsed = parseRecordKey(target.key);
    if (!parsed) return [];
    const current = recordFieldValues(workspace, target.key);
    const fields = Object.fromEntries(Object.entries(PROPOSAL_FIELDS[parsed.kind]).map(([name, spec]) => [name, { ...spec, current: current?.[name] ?? null }]));
    return [{ key: target.key, kind: parsed.kind, title: target.title, route: target.route, exists: current !== null, fields }];
  });
}

function staleness(proposal: Proposal, gap: Gap | null, ctx: Context): ProposalStaleness {
  const revision = latest(proposal);
  const changed_targets: string[] = [];
  const missing_targets: string[] = [];
  for (const [key, fingerprint] of Object.entries(revision?.target_fingerprints ?? {})) {
    const record = ctx.records.get(key);
    if (!record) missing_targets.push(key);
    else if (recordFingerprint(record) !== fingerprint) changed_targets.push(key);
  }
  for (const change of revision?.changes ?? []) {
    if (change.operation === "create" && ctx.records.has(change.target) && !changed_targets.includes(change.target)) changed_targets.push(change.target);
  }
  const diagnosis_changed = gap !== null && gap.diagnosis?.created_at !== proposal.diagnosis_created_at;
  return { changed_targets, missing_targets, knowledge_changed: revision ? revision.knowledge_fingerprint !== ctx.fingerprint : false, diagnosis_changed, gap_missing: gap === null,
    stale: changed_targets.length > 0 || missing_targets.length > 0 || diagnosis_changed || gap === null };
}

function view(proposal: Proposal, gap: Gap | null, ctx: Context): ProposalView {
  return { ...proposal, staleness: staleness(proposal, gap, ctx), targets: targetViews(proposal, ctx.workspace), ai_available: providerConfigured() };
}

function fieldError(target: string, field: string, error: unknown): Error {
  // Record-key failures nest the useful message one level down; surface it with the offending key.
  const flatten = (issues: z.core.$ZodIssue[]): string[] => issues.flatMap((issue) => "issues" in issue && Array.isArray(issue.issues) ? flatten(issue.issues as z.core.$ZodIssue[]).map((inner) => `${issue.path.join(".")}: ${inner}`) : [`${issue.path.join(".")}${issue.path.length ? ": " : ""}${issue.message}`]);
  const detail = error instanceof ZodError ? flatten(error.issues).join("; ") : error instanceof Error ? error.message : "invalid value";
  return new Error(`${target}.${field}: ${detail}`);
}

/**
 * Turns submitted changes into stored ones: every target must be a record the diagnosis cited (or
 * the one permitted new pattern), every field must exist for the kind, every value must parse as
 * its type, and `before` is snapshotted from the current record. Authorship is decided here, not
 * by the client: a value identical to the AI draft stays AI-authored; anything else is human.
 */
function normalizeChanges(proposal: Proposal, input: z.output<typeof proposalRevisionInputSchema>["changes"], workspace: Workspace, revisionAuthor: ProposalAuthor, authors?: ReadonlyMap<string, ProposalAuthor>): ProposalChange[] {
  const allowed = new Set(proposal.allowed_targets.map((target) => target.key));
  const aiDraft = proposal.revisions.find((revision) => revision.author === "ai");
  const seen = new Set<string>();
  const created = new Set<string>();
  return input.map((change) => {
    const parsed = parseRecordKey(change.target);
    if (!parsed) throw new Error(`${change.target}: not a record key.`);
    const spec = PROPOSAL_FIELDS[parsed.kind][change.field];
    if (!spec) throw new Error(`${change.target}.${change.field}: ${parsed.kind} records have no proposable field "${change.field}".`);
    const slot = `${change.target}.${change.field}`;
    if (seen.has(slot)) throw new Error(`${slot}: changed twice in one revision.`);
    seen.add(slot);
    const current = recordFieldValues(workspace, change.target);
    if (change.operation === "create") {
      if (parsed.kind !== PROPOSAL_CREATABLE_KIND) throw new Error(`${change.target}: only a new pattern can be created.`);
      if (!proposal.allow_new_pattern) throw new Error(`${change.target}: this diagnosis did not find a missing decision, so no new record may be created.`);
      if (current !== null) throw new Error(`${change.target}: a pattern with this id already exists; amend it instead.`);
      created.add(change.target);
      if (created.size > 1) throw new Error("A proposal may create at most one new pattern.");
    } else {
      if (!allowed.has(change.target)) throw new Error(`${change.target}: the diagnosis did not cite this record, so the proposal cannot change it.`);
      if (current === null) throw new Error(`${change.target}: this record no longer exists.`);
    }
    let after: unknown;
    try { after = parseFieldValue(spec.type, change.after); } catch (error) { throw fieldError(change.target, change.field, error); }
    if (parsed.kind === "component" && change.field === "relationships" && (after as string[]).includes(parsed.id)) throw new Error(`${slot}: a component cannot relate to itself.`);
    const before = change.operation === "create" ? null : current?.[change.field] ?? null;
    const draft = aiDraft?.changes.find((item) => item.target === change.target && item.field === change.field && item.operation === change.operation);
    const author: ProposalAuthor = revisionAuthor === "ai" || (draft && valuesEqual(draft.after, after)) ? "ai" : authors?.get(slot) ?? "human";
    return { target: change.target, operation: change.operation, field: change.field, type: spec.type, before, after, author, note: change.note };
  });
}

function computeChecks(ctx: Context, changes: ProposalChange[], gap: Gap, proposal: Proposal): ProposalChecks {
  const describe = (finding: { level: string; check: string; detail: string }) => `${finding.check}: ${finding.detail}`;
  const baseline = validateWorkspace(ctx.workspace);
  const projected = validateWorkspace(projectProposal(ctx.workspace, changes));
  const before = new Set(baseline.map((finding) => `${finding.level} ${describe(finding)}`));
  const after = new Set(projected.map((finding) => `${finding.level} ${describe(finding)}`));
  const knownTerms = ctx.knowledge.flatMap((record) => [record.title, record.key.slice(record.key.indexOf(":") + 1)]);
  const lint = lintProposal(changes, gap.report, knownTerms, new Set(proposal.allowed_targets.map((target) => target.key)));
  const validation = {
    new_errors: projected.filter((finding) => finding.level === "error" && !before.has(`error ${describe(finding)}`)).map(describe),
    new_warnings: projected.filter((finding) => finding.level === "warning" && !before.has(`warning ${describe(finding)}`)).map(describe),
    resolved: baseline.filter((finding) => !after.has(`${finding.level} ${describe(finding)}`)).map(describe),
    baseline_errors: baseline.filter((finding) => finding.level === "error").length,
    baseline_warnings: baseline.filter((finding) => finding.level === "warning").length,
  };
  return { computed_at: new Date().toISOString(), validation, lint, ok: !validation.new_errors.length && !lint.some((finding) => finding.level === "error") };
}

function revisionHash(revision: Pick<ProposalRevision, "summary" | "rationale" | "changes">): string {
  return createHash("sha256").update(canonicalJson({ summary: revision.summary, rationale: revision.rationale, changes: revision.changes })).digest("hex");
}

async function withLock<T>(id: string, work: () => Promise<T>): Promise<T> {
  if (locks.has(id)) throw new ProposalStateError("This proposal is already being updated. Reload in a moment.");
  locks.add(id);
  try { return await work(); } finally { locks.delete(id); }
}

export async function listProposals(gapId?: string): Promise<ProposalSummary[]> {
  const files = await readDirectoryOrEmpty(path.join(root(), "proposals"));
  const proposals = await Promise.all(files.filter((file) => file.endsWith(".json")).map((file) => readProposal(file.slice(0, -5))));
  return proposals.filter((proposal) => !gapId || proposal.gap_id === gapId).sort((a, b) => b.updated_at.localeCompare(a.updated_at)).map(summary);
}

export async function gapProposalOverview(gapId: string): Promise<GapProposalOverview> {
  const gap = await getGap(gapId);
  const ctx = await context();
  return { eligibility: proposalEligibility(gap, ctx.fingerprint), proposals: await listProposals(gap.id) };
}

const createSchema = z.object({ gap_id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/) }).strict();

async function newProposal(gap: Gap, ctx: Context, supersedes: string | null): Promise<Proposal> {
  const eligibility = proposalEligibility(gap, ctx.fingerprint);
  if (!eligibility.eligible) throw new ProposalStateError(eligibility.reasons.join(" "));
  const now = new Date().toISOString();
  return { version: 1, id: randomUUID(), gap_id: gap.id, diagnosis_created_at: gap.diagnosis!.created_at, created_at: now, updated_at: now, status: "draft",
    basis: eligibility.basis, allowed_targets: eligibility.targets, allow_new_pattern: eligibility.allow_new_pattern, revisions: [], approval: null, rejection: null, superseded_by: null, supersedes };
}

export async function createProposal(input: unknown): Promise<ProposalView> {
  const { gap_id } = createSchema.parse(input);
  const gap = await getGap(gap_id);
  const ctx = await context();
  const proposal = await newProposal(gap, ctx, null);
  await writeProposal(proposal);
  return view(proposal, gap, ctx);
}

export async function getProposal(id: string): Promise<ProposalView> {
  const proposal = await readProposal(id);
  return view(proposal, await gapOrNull(proposal.gap_id), await context());
}

function assertEditable(proposal: Proposal): void {
  if (proposal.status === "rejected") throw new ProposalStateError("This proposal was rejected. Create a new proposal from the Gap instead.");
  if (proposal.status === "superseded") throw new ProposalStateError("This proposal was superseded. Edit the newer proposal instead.");
}

async function appendRevision(proposal: Proposal, input: ProposalRevisionInput, author: ProposalAuthor, authors?: ReadonlyMap<string, ProposalAuthor>): Promise<ProposalView> {
  assertEditable(proposal);
  const parsed = proposalRevisionInputSchema.parse(input);
  const gap = await gapOrNull(proposal.gap_id);
  if (!gap) throw new ProposalStateError("The Gap behind this proposal was deleted. The proposal can be rejected but not revised.");
  const ctx = await context();
  const changes = normalizeChanges(proposal, parsed.changes, ctx.workspace, author, authors);
  const checks = computeChecks(ctx, changes, gap, proposal);
  const target_fingerprints = Object.fromEntries(changes.filter((change) => change.operation === "amend").map((change) => [change.target, recordFingerprint(ctx.records.get(change.target)!)]));
  const content = { summary: parsed.summary, rationale: parsed.rationale, changes };
  const revision: ProposalRevision = { number: (latest(proposal)?.number ?? 0) + 1, created_at: new Date().toISOString(), author, ...content, hash: revisionHash(content), knowledge_fingerprint: ctx.fingerprint, target_fingerprints, checks };
  // Approval binds to one exact revision; a new revision always clears it, even if it changes nothing but a note.
  const next: Proposal = { ...proposal, revisions: [...proposal.revisions, revision], approval: null, status: "draft", updated_at: revision.created_at };
  await writeProposal(next);
  return view(next, gap, ctx);
}

export async function saveProposalRevision(id: string, input: unknown): Promise<ProposalView> {
  return withLock(id, async () => appendRevision(await readProposal(id), input as ProposalRevisionInput, "human"));
}

/** AI drafts revision 1 only. A proposal with any saved revision is a person's work and stays so. */
export async function draftProposalWithAi(id: string): Promise<ProposalDraftResponse> {
  return withLock(id, async () => {
    const proposal = await readProposal(id);
    assertEditable(proposal);
    if (proposal.revisions.length) throw new ProposalStateError("AI drafting is available only before the first revision is saved.");
    const gap = await gapOrNull(proposal.gap_id);
    const ctx = await context();
    if (!gap) throw new ProposalStateError("The Gap behind this proposal was deleted.");
    if (!providerConfigured()) return { ...view(proposal, gap, ctx), draft_failed: "No AI provider is configured. Add changes manually; every proposal can be drafted by hand." };
    let input: ProposalRevisionInput;
    try { input = await draftProposal(proposal, gap, targetViews(proposal, ctx.workspace)); }
    catch { return { ...view(proposal, gap, ctx), draft_failed: "The AI draft failed or returned invalid changes. Nothing was saved; retry, or draft the changes manually." }; }
    try { return await appendRevision(proposal, input, "ai"); }
    catch (error) {
      if (error instanceof ProposalStateError) throw error;
      // The provider targeted a record it was not allowed to, or a value of the wrong shape. The message names the field, never provider output.
      return { ...view(proposal, gap, ctx), draft_failed: `The AI draft was rejected: ${error instanceof Error ? error.message : "invalid change"} Nothing was saved.` };
    }
  });
}

const approvalSchema = z.object({ revision: z.number().int().positive(), hash: z.string().regex(/^[a-f0-9]{64}$/), note: z.string().trim().max(1000).default("") }).strict();

export async function approveProposal(id: string, input: unknown): Promise<ProposalView> {
  return withLock(id, async () => {
    const { revision, hash, note } = approvalSchema.parse(input);
    const proposal = await readProposal(id);
    assertEditable(proposal);
    if (proposal.status === "approved") throw new ProposalStateError("This proposal is already approved.");
    const current = latest(proposal);
    if (!current) throw new ProposalStateError("Save a revision before approving.");
    if (current.number !== revision || current.hash !== hash) throw new ProposalStateError(`Approval must name the current revision ${current.number} and its hash. Reload the proposal and review it again.`);
    const gap = await gapOrNull(proposal.gap_id);
    const ctx = await context();
    const stale = staleness(proposal, gap, ctx);
    if (stale.stale) throw new ProposalStateError(stale.gap_missing ? "The Gap behind this proposal was deleted." : stale.diagnosis_changed ? "The Gap was diagnosed again after this proposal was created. Supersede it to re-derive the proposal." : `Target records changed since revision ${current.number}: ${[...stale.changed_targets, ...stale.missing_targets].join(", ")}. Save a new revision against the current records.`);
    if (!current.checks.ok) throw new ProposalStateError("This revision has validation or lint errors. Fix them in a new revision before approving.");
    const approved_at = new Date().toISOString();
    const next: Proposal = { ...proposal, status: "approved", approval: { revision, hash, approved_at, note }, updated_at: approved_at };
    await writeProposal(next);
    return view(next, gap, ctx);
  });
}

const rejectionSchema = z.object({ reason: z.string().trim().max(2000).default("") }).strict();

export async function rejectProposal(id: string, input: unknown): Promise<ProposalView> {
  return withLock(id, async () => {
    const { reason } = rejectionSchema.parse(input);
    const proposal = await readProposal(id);
    assertEditable(proposal);
    const rejected_at = new Date().toISOString();
    const next: Proposal = { ...proposal, status: "rejected", approval: null, rejection: { rejected_at, reason }, updated_at: rejected_at };
    await writeProposal(next);
    return view(next, await gapOrNull(proposal.gap_id), await context());
  });
}

/**
 * Supersession re-derives eligibility from the Gap's current diagnosis and carries the latest
 * changes forward as revision 1 of a new proposal. Changes whose targets the new diagnosis no
 * longer cites are dropped, and the old proposal is closed pointing at its successor.
 */
export async function supersedeProposal(id: string): Promise<ProposalView> {
  return withLock(id, async () => {
    const proposal = await readProposal(id);
    assertEditable(proposal);
    const gap = await gapOrNull(proposal.gap_id);
    if (!gap) throw new ProposalStateError("The Gap behind this proposal was deleted.");
    const ctx = await context();
    const successor = await newProposal(gap, ctx, proposal.id);
    const allowed = new Set(successor.allowed_targets.map((target) => target.key));
    const previous = latest(proposal);
    let result: ProposalView | null = null;
    if (previous) {
      const carried = previous.changes.filter((change) => change.operation === "create" ? successor.allow_new_pattern && !ctx.records.has(change.target) : allowed.has(change.target) && ctx.records.has(change.target));
      if (carried.length) {
        const authors = new Map(carried.map((change) => [`${change.target}.${change.field}`, change.author]));
        await writeProposal(successor);
        result = await appendRevision(successor, { summary: previous.summary, rationale: previous.rationale, changes: carried.map(({ target, operation, field, after, note }) => ({ target, operation, field, after, note })) }, "human", authors);
      }
    }
    if (!result) { await writeProposal(successor); result = view(successor, gap, ctx); }
    const closed_at = new Date().toISOString();
    await writeProposal({ ...proposal, status: "superseded", approval: null, superseded_by: successor.id, updated_at: closed_at });
    return result;
  });
}
