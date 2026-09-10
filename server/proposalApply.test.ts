import { cp, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import type { Gap } from "../shared/gaps.js";
import { applyBlockers, approvalBlockers, type Proposal, type ProposalChangeInput, type ProposalView } from "../shared/proposals.js";
import { runProvider } from "./aiProvider.js";
import { ApplyError, applyProposal, getApplication, listApplications, planApplication, recoverApplications } from "./applicationStore.js";
import { createGap, deleteGap, diagnoseSavedGap, initializeStore, loadWorkspace, saveComponents, savePrimitiveTaxonomy } from "./fileStore.js";
import type { gapAnalysisSchema } from "./gapDiagnosis.js";
import { approveProposal, createProposal, draftProposalWithAi, getProposal, listProposals, ProposalStateError, rebaseProposal, rejectProposal, saveProposalRevision, supersedeProposal } from "./proposalStore.js";
import { BUNDLED_WORKSPACE, setWorkspaceRoot } from "./workspace.js";
import { createMonetService } from "../shared/service.js";
import { createMonetMcpServer } from "../mcp/server.js";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

/**
 * Fault injection at the filesystem and validation seams the transaction crosses: `rename` is the
 * commit step of every atomic write, `open` is how the journal is created, and the post-write
 * validation runs over a workspace that, unlike the prospective projection, carries the new
 * `decisions/` entry, which is how the validation fault targets only the final check.
 */
const faults = vi.hoisted(() => ({
  renameFail: "", renameFailTimes: 0, openFail: "", receiptFailTimes: 0, receiptPublished: false, receiptSyncFailTimes: 0,
  durabilityEvents: [] as string[],
  gate: null as null | { path: string; opened: Promise<void>; open: () => void; reached: Promise<void>; markReached: () => void },
  validation: false,
}));
vi.mock("node:fs/promises", async (original) => {
  const fs = await original<typeof import("node:fs/promises")>();
  return {
    ...fs,
    rename: async (from: string, to: string) => {
      if (faults.gate && to.includes(faults.gate.path)) { faults.gate.markReached(); await faults.gate.opened; }
      if (faults.renameFail && to.includes(faults.renameFail) && faults.renameFailTimes !== 0) { faults.renameFailTimes -= 1; throw new Error(`Simulated disk failure writing ${path.basename(to)}`); }
      const receipt = /\/applications\/[^/]+\.json$/.test(to) && !to.endsWith(".journal.json");
      if (receipt && faults.receiptFailTimes) { faults.receiptFailTimes--; throw new Error("Simulated receipt rename failure"); }
      await fs.rename(from, to);
      if (receipt) faults.receiptPublished = true;
      faults.durabilityEvents.push(`rename:${to}`);
    },
    open: async (file: string, flags?: string | number, mode?: number) => {
      if (faults.openFail && String(file).includes(faults.openFail)) throw new Error("Simulated disk failure creating the journal");
      const handle = await fs.open(file, flags, mode);
      const sync = handle.sync.bind(handle);
      handle.sync = async () => {
        if (String(file).endsWith("/applications") && faults.receiptPublished && faults.receiptSyncFailTimes) { faults.receiptSyncFailTimes--; throw new Error("Simulated receipt directory sync failure"); }
        await sync();
        faults.durabilityEvents.push(`sync:${file}`);
      };
      return handle;
    },
  };
});
vi.mock("./validate.js", async (original) => {
  const real = await original<typeof import("./validate.js")>();
  return { ...real, validateWorkspace: (workspace: Parameters<typeof real.validateWorkspace>[0]) => {
    const findings = real.validateWorkspace(workspace);
    return faults.validation && workspace.decisionLog.some((entry) => entry.title.startsWith("Applied Gap proposal")) ? [...findings, { level: "error" as const, check: "simulated", detail: "post-write failure" }] : findings;
  } };
});
vi.mock("./aiProvider.js", async (original) => ({ ...await original<typeof import("./aiProvider.js")>(), runProvider: vi.fn() }));

function gate(file: string) {
  let open = () => undefined as void; let markReached = () => undefined as void;
  const opened = new Promise<void>((resolve) => { open = resolve; });
  const reached = new Promise<void>((resolve) => { markReached = resolve; });
  faults.gate = { path: file, opened, open, reached, markReached };
  return faults.gate;
}

type Analysis = z.infer<typeof gapAnalysisSchema>;
const finding = (classification: Analysis["findings"][number]["classification"], record_keys: string[]): Analysis["findings"][number] => ({
  classification, conclusion: `${classification} conclusion`, reasoning: "Because the evidence says so.", evidence_ids: ["problem"], record_keys, uncertainty: [], next_action: "Improve the guidance.",
});
const analysis = (...findings: Analysis["findings"]): Analysis => ({ conclusion: "Guidance could be stronger.", image_inspected: false, measured_errors: "not_assessed", findings });
const PRINCIPLE = "principle:keep-primary-actions-obvious";
const wideAnalysis = () => analysis(finding("weak_guidance", ["component:button", PRINCIPLE, "pattern:dashboard", "foundation:color", "component:card"]), finding("missing_decision", ["component:card", "foundation:color"]));
const PROBLEM = "Secondary actions on cards read as plain text";
const CONTEXT = "The ConvoGym training grid shows Start and Open on every exercise card.";
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOm0AAAAASUVORK5CYII=";

let directory: string;
const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
/** Every canonical and derived file, hashed. Editor-only records (gaps, proposals, applications) are excluded on purpose. */
async function workspaceHashes(): Promise<Map<string, string>> {
  const hashes = new Map<string, string>();
  async function walk(relative: string): Promise<void> {
    for (const entry of await readdir(path.join(directory, relative), { withFileTypes: true })) {
      const child = relative ? `${relative}/${entry.name}` : entry.name;
      if (!relative && ["gaps", "proposals", "applications"].includes(entry.name)) continue;
      if (entry.isDirectory()) await walk(child); else hashes.set(child, sha256(await readFile(path.join(directory, child))));
    }
  }
  await walk("");
  return hashes;
}
function changedFiles(before: Map<string, string>, after: Map<string, string>): string[] {
  return [...new Set([...before.keys(), ...after.keys()])].filter((file) => before.get(file) !== after.get(file)).sort();
}
/** Byte-exact comparison via Buffer.equals: vitest's toEqual over large buffers is far too slow for CI. */
async function expectWorkspaceUnchanged(before: Map<string, string>): Promise<void> {
  const after = await workspaceHashes();
  expect(changedFiles(before, after)).toEqual([]);
}
async function canonicalText(): Promise<string> {
  const files = [...(await workspaceHashes()).keys()];
  return (await Promise.all(files.map((file) => readFile(path.join(directory, file), "utf8")))).join("\n");
}

async function diagnosedGap(raw: Analysis = wideAnalysis(), withImage = false): Promise<Gap> {
  vi.stubEnv("MONET_AI_COMMAND", "provider");
  const gap = await createGap({ problem: PROBLEM, context: CONTEXT, image: withImage ? { data_url: `data:image/png;base64,${PNG}`, filename: "grid.png" } : undefined });
  vi.mocked(runProvider).mockResolvedValueOnce(raw);
  const result = await diagnoseSavedGap(gap.id);
  vi.stubEnv("MONET_AI_COMMAND", "");
  expect(result.diagnosis?.ai.status).toBe("complete");
  return result;
}
const buttonUseWhen = (workspace: Awaited<ReturnType<typeof loadWorkspace>>) => workspace.components.find((c) => c.id === "button")!.use_when;
async function approvedProposal(changes: ProposalChangeInput[], raw: Analysis = wideAnalysis(), withImage = false): Promise<{ gap: Gap; proposal: ProposalView; revision: number; hash: string }> {
  const gap = await diagnosedGap(raw, withImage);
  const created = await createProposal({ gap_id: gap.id });
  const saved = await saveProposalRevision(created.id, { summary: "Make secondary actions recognizable", rationale: "Cards need a visible action affordance.", changes });
  const revision = saved.revisions[saved.revisions.length - 1]!;
  expect(revision.checks.ok, JSON.stringify(revision.checks)).toBe(true);
  const proposal = await approveProposal(created.id, { revision: revision.number, hash: revision.hash, note: "Reviewed." });
  return { gap, proposal, revision: revision.number, hash: revision.hash };
}
const NEW_PATTERN: ProposalChangeInput[] = [
  { target: "pattern:card-actions", operation: "create", field: "title", after: "Card actions" },
  { target: "pattern:card-actions", operation: "create", field: "summary", after: "How actions sit inside cards." },
  { target: "pattern:card-actions", operation: "create", field: "body", after: "# Card actions\n\nOne primary action per card; secondary actions use the secondary button style so they read as actions before hover.\n" },
  { target: "pattern:card-actions", operation: "create", field: "components", after: ["card", "button"] },
  { target: "pattern:card-actions", operation: "create", field: "foundations", after: ["color"] },
];
async function multiRecordChanges(): Promise<ProposalChangeInput[]> {
  const workspace = await loadWorkspace();
  const principle = workspace.principles.find((p) => `principle:${p.id}` === PRINCIPLE)!;
  const card = workspace.components.find((c) => c.id === "card")!;
  return [
    { target: "component:button", field: "use_when", after: [...buttonUseWhen(workspace), "Secondary actions on a card or tile need a visible affordance"] },
    { target: "component:card", field: "notes", after: `${card.notes} State which action is primary when a card carries more than one.` },
    { target: PRINCIPLE, field: "body", after: `${principle.body}\n\nActions inside cards are still actions: they need the same affordance as actions anywhere else.` },
    { target: "pattern:dashboard", field: "summary", after: "Answer a small number of known questions at a glance, with a visible action on every card that has one." },
    ...NEW_PATTERN,
  ];
}
const applicationFiles = async () => (await readdir(path.join(directory, "applications"))).filter((name) => name.endsWith(".json")).sort();
const proposalFile = (id: string) => path.join(directory, "proposals", `${id}.json`);

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "monet-apply-test-"));
  await cp(BUNDLED_WORKSPACE, directory, { recursive: true, filter: (source) => !/\/(gaps|proposals|applications)(\/|$)/.test(source) });
  setWorkspaceRoot(directory);
  await initializeStore();
  vi.stubEnv("MONET_AI_COMMAND", ""); vi.stubEnv("MONET_CODEX_EXECUTABLE", ""); vi.stubEnv("MONET_AI_IMAGES", "");
  vi.mocked(runProvider).mockReset();
  faults.renameFail = ""; faults.renameFailTimes = 0; faults.openFail = ""; faults.gate = null; faults.validation = false;
  faults.receiptFailTimes = 0; faults.receiptPublished = false; faults.receiptSyncFailTimes = 0; faults.durabilityEvents = [];
});
afterEach(async () => { faults.renameFail = ""; faults.renameFailTimes = 0; faults.openFail = ""; faults.gate = null; faults.validation = false; faults.receiptFailTimes = 0; faults.receiptSyncFailTimes = 0; vi.unstubAllEnvs(); setWorkspaceRoot(BUNDLED_WORKSPACE); await rm(directory, { recursive: true, force: true }); });

describe("Apply gates", () => {
  it("applies only a saved approved revision named by number and hash, and plans nothing for anything else", async () => {
    const gap = await diagnosedGap();
    const before = await workspaceHashes();
    const created = await createProposal({ gap_id: gap.id });
    const draft = await planApplication(created.id);
    expect(draft).toMatchObject({ ready: false, status: "draft", revision: null, records: [], applications: [] });
    expect(draft.blockers[0]).toMatchObject({ kind: "state", message: expect.stringContaining("Approve") });
    await expect(applyProposal(created.id, { revision: 1, hash: "a".repeat(64) })).rejects.toMatchObject({ kind: "state", status: 409 });
    const saved = await saveProposalRevision(created.id, { summary: "s", changes: [{ target: "component:button", field: "use_when", after: [...buttonUseWhen(await loadWorkspace()), "Card actions"] }] });
    const revision = saved.revisions[0]!;
    await expect(applyProposal(created.id, { revision: 1, hash: revision.hash })).rejects.toMatchObject({ kind: "state" });
    await approveProposal(created.id, { revision: 1, hash: revision.hash });
    await expect(applyProposal(created.id, { revision: 1, hash: "b".repeat(64) })).rejects.toThrow(/approved revision 1 and its hash/);
    await expect(applyProposal(created.id, { revision: 2, hash: revision.hash })).rejects.toMatchObject({ kind: "state" });
    await expect(applyProposal(created.id, { revision: 1 })).rejects.toThrow();
    await expect(applyProposal(created.id, { revision: 1, hash: revision.hash, force: true })).rejects.toThrow();
    const rejected = await rejectProposal(created.id, { reason: "Not now." });
    expect(rejected.status).toBe("rejected");
    await expect(applyProposal(created.id, { revision: 1, hash: revision.hash })).rejects.toMatchObject({ kind: "state", message: expect.stringContaining("rejected") });
    await expectWorkspaceUnchanged(before);
    expect(await applicationFiles()).toEqual([]);
    expect((await getProposal(created.id)).status).toBe("rejected");
  });

  it("reports every unsupported approved target and applies nothing rather than a subset", async () => {
    const workspace = await loadWorkspace();
    const { proposal, revision, hash } = await approvedProposal([
      { target: "component:button", field: "use_when", after: [...buttonUseWhen(workspace), "Card actions"] },
      { target: "component:button", field: "aliases", after: ["cta", "action button"] },
      { target: "foundation:color", field: "notes", after: "Secondary actions rely on color.text-secondary over surface colors." },
    ]);
    const before = await workspaceHashes();
    const plan = await planApplication(proposal.id);
    expect(plan.ready).toBe(false);
    expect(plan.unsupported).toEqual([
      { target: "component:button", field: "aliases", reason: expect.stringContaining("taxonomy") },
      { target: "foundation:color", field: "notes", reason: expect.stringContaining("Foundation") },
    ]);
    expect(plan.blockers).toEqual([{ kind: "unsupported", message: expect.stringContaining("Nothing is applied partially") }]);
    expect(plan.records.map((record) => record.key)).toEqual(["component:button", "foundation:color"]);
    await expect(applyProposal(proposal.id, { revision, hash })).rejects.toMatchObject({ kind: "unsupported" });
    await expectWorkspaceUnchanged(before);
    expect(await applicationFiles()).toEqual([]);
    expect((await getProposal(proposal.id)).status).toBe("approved");
  });

  it("refuses stale targets, corrupt revisions, re-diagnosed and deleted Gaps after approval, without writing", async () => {
    const workspace = await loadWorkspace();
    const button = workspace.components.find((c) => c.id === "button")!;
    const stale = await approvedProposal([{ target: "component:button", field: "use_when", after: [...button.use_when, "Card actions"] }]);
    await saveComponents("button", { ...button, notes: `${button.notes} Edited after approval.` });
    const before = await workspaceHashes();
    const plan = await planApplication(stale.proposal.id);
    expect(plan.ready).toBe(false);
    expect(plan.blockers[0]).toMatchObject({ kind: "stale", message: expect.stringContaining("component:button") });
    await expect(applyProposal(stale.proposal.id, { revision: stale.revision, hash: stale.hash })).rejects.toMatchObject({ kind: "stale" });

    const corrupt = await approvedProposal([{ target: PRINCIPLE, field: "body", after: "Rewritten by a proposal." }]);
    const stored = JSON.parse(await readFile(proposalFile(corrupt.proposal.id), "utf8")) as Proposal;
    stored.revisions[0]!.changes[0]!.after = "Smuggled in by hand.";
    await writeFile(proposalFile(corrupt.proposal.id), JSON.stringify(stored));
    expect((await planApplication(corrupt.proposal.id)).blockers[0]).toMatchObject({ kind: "integrity" });
    await expect(applyProposal(corrupt.proposal.id, { revision: corrupt.revision, hash: corrupt.hash })).rejects.toMatchObject({ kind: "integrity" });
    // A hand-edited approval pointing at a hash that matches the tampered content still fails: the stored hash and the approval must agree with the content.
    stored.approval!.hash = stored.revisions[0]!.hash;
    await writeFile(proposalFile(corrupt.proposal.id), JSON.stringify(stored));
    await expect(applyProposal(corrupt.proposal.id, { revision: corrupt.revision, hash: stored.revisions[0]!.hash })).rejects.toMatchObject({ kind: "integrity" });

    const rediagnosed = await approvedProposal([{ target: "pattern:dashboard", field: "summary", after: "A stronger dashboard summary." }]);
    vi.stubEnv("MONET_AI_COMMAND", "provider");
    vi.mocked(runProvider).mockResolvedValueOnce(wideAnalysis());
    await diagnoseSavedGap(rediagnosed.gap.id);
    await expect(applyProposal(rediagnosed.proposal.id, { revision: rediagnosed.revision, hash: rediagnosed.hash })).rejects.toMatchObject({ kind: "stale", message: expect.stringContaining("diagnosed") });
    await deleteGap(rediagnosed.gap.id);
    await expect(applyProposal(rediagnosed.proposal.id, { revision: rediagnosed.revision, hash: rediagnosed.hash })).rejects.toMatchObject({ kind: "stale", message: expect.stringContaining("deleted") });

    await expectWorkspaceUnchanged(before);
    expect(await applicationFiles()).toEqual([]);
    for (const id of [stale.proposal.id, corrupt.proposal.id, rediagnosed.proposal.id]) expect((await getProposal(id)).status).toBe("approved");
  });

  it("reruns validation against the live workspace and refuses before the first write when it fails", async () => {
    const workspace = await loadWorkspace();
    const card = workspace.components.find((c) => c.id === "card")!;
    const { proposal, revision, hash } = await approvedProposal([{ target: "component:card", field: "primitives", after: [...card.primitives, "spacer"] }]);
    await savePrimitiveTaxonomy(workspace.primitiveTaxonomy.map((category) => ({ ...category, entries: category.entries.filter((entry) => entry.id !== "spacer") })));
    const before = await workspaceHashes();
    const plan = await planApplication(proposal.id);
    expect(plan.staleness.stale).toBe(false);
    expect(plan.checks?.validation.new_errors).toEqual([expect.stringContaining('unknown primitive "spacer"')]);
    expect(plan.blockers).toEqual([{ kind: "validation", message: expect.stringContaining("validation") }]);
    await expect(applyProposal(proposal.id, { revision, hash })).rejects.toMatchObject({ kind: "validation" });
    await expectWorkspaceUnchanged(before);
    expect(await applicationFiles()).toEqual([]);
  });
});

describe("Apply transaction", () => {
  it("applies a multi-record proposal: only the intended records, the decision entry, and the exports change, and a receipt records it", async () => {
    const { gap, proposal, revision, hash } = await approvedProposal(await multiRecordChanges(), wideAnalysis(), true);
    const before = await workspaceHashes();
    const plan = await planApplication(proposal.id);
    expect(plan).toMatchObject({ ready: true, blockers: [], unsupported: [], revision, hash, checks: { ok: true } });
    expect(plan.records.map((record) => [record.key, record.operation, record.fields])).toEqual([["component:button", "amend", ["use_when"]], ["component:card", "amend", ["notes"]], [PRINCIPLE, "amend", ["body"]], ["pattern:dashboard", "amend", ["summary"]], ["pattern:card-actions", "create", ["title", "summary", "body", "components", "foundations"]]]);
    expect(plan.records.find((record) => record.key === "pattern:card-actions")).toMatchObject({ title: "Card actions", route: "/patterns/card-actions" });
    expect(plan.files).toEqual([{ path: "components/decisions.json", action: "update" }, { path: "patterns/card-actions.md", action: "create" }, { path: "patterns/dashboard.md", action: "update" }, { path: "principles/keep-primary-actions-obvious.md", action: "update" }, { path: expect.stringMatching(/^decisions\/.*proposal-/), action: "create" }]);
    expect(plan.derived).toEqual(expect.arrayContaining(["DESIGN_SYSTEM.md", "design-system.json", "tokens/tokens.json", "tokens/color.json", "tokens/themes/default.json"]));
    await expectWorkspaceUnchanged(before);

    const result = await applyProposal(proposal.id, { revision, hash });
    expect(result.outcome).toBe("applied");
    const receipt = result.receipt!;
    expect(receipt).toMatchObject({ version: 1, proposal_id: proposal.id, gap_id: gap.id, revision, hash, outcome: "applied", recovered: false, failure: null, restored: true, validation: { ok: true, new_errors: [] }, knowledge_fingerprint_before: plan.staleness.knowledge_changed ? expect.any(String) : proposal.revisions[0]!.knowledge_fingerprint });
    expect(receipt.knowledge_fingerprint_after).not.toBe(receipt.knowledge_fingerprint_before);
    expect(receipt.records).toEqual(plan.records);
    expect(result.proposal).toMatchObject({ status: "applied", application: { id: receipt.id, applied_at: receipt.finished_at } });

    const after = await workspaceHashes();
    const entry = [...after.keys()].find((file) => file.startsWith("decisions/") && file.includes("-proposal-"))!;
    expect(entry).toBeTruthy();
    expect(changedFiles(before, after)).toEqual(["DESIGN_SYSTEM.md", "components/decisions.json", entry, "design-system.json", "patterns/card-actions.md", "patterns/dashboard.md", "principles/keep-primary-actions-obvious.md"].sort());
    // The receipt's hashes are the real before and after bytes.
    for (const file of receipt.files) {
      expect(file.before_hash).toBe(before.get(file.path) ?? null);
      expect(file.after_hash).toBe(after.get(file.path));
      expect(file.action).toBe(before.has(file.path) ? "update" : "create");
    }
    expect(receipt.files.map((file) => file.path).sort()).toEqual(["components/decisions.json", entry, "patterns/card-actions.md", "patterns/dashboard.md", "principles/keep-primary-actions-obvious.md"].sort());

    const workspace = await loadWorkspace();
    expect(buttonUseWhen(workspace)).toContain("Secondary actions on a card or tile need a visible affordance");
    // Two components share one file: both decisions land, and neither loses its selection or history.
    expect(workspace.components.find((c) => c.id === "card")).toMatchObject({ notes: expect.stringContaining("State which action is primary"), selection: { source: "ant-design" } });
    expect(workspace.components.find((c) => c.id === "button")).toMatchObject({ selection: { source: "shopify-polaris" }, history: expect.any(Array) });
    expect(workspace.patterns.find((p) => p.id === "card-actions")).toMatchObject({ title: "Card actions", status: "experimental", components: ["card", "button"], foundations: ["color"] });
    expect(workspace.patterns.find((p) => p.id === "dashboard")?.summary).toContain("visible action on every card");
    expect(workspace.principles.find((p) => `principle:${p.id}` === PRINCIPLE)?.body).toContain("Actions inside cards are still actions");
    expect(await readFile(path.join(directory, "DESIGN_SYSTEM.md"), "utf8")).toContain("**Card actions** (experimental)");
    const decision = await readFile(path.join(directory, entry), "utf8");
    expect(decision).toContain(`Applied Gap proposal ${proposal.id}, revision ${revision}`);
    expect(decision).not.toContain("Make secondary actions recognizable");
    expect(decision).toContain("pattern:card-actions (new): title, summary, body, components, foundations");
    expect(decision).toContain(`application ${receipt.id}`);
    expect(workspace.decisionLog[0]?.title).toBe(`Applied Gap proposal ${proposal.id}, revision ${revision}`);

    // Private Gap evidence never reaches canonical records, exports, or history.
    const canonical = await canonicalText();
    for (const secret of [PROBLEM, CONTEXT, "ConvoGym", PNG, "grid.png", "Cards need a visible action affordance."]) expect(canonical, secret).not.toContain(secret);
    expect(JSON.stringify(receipt)).not.toContain("ConvoGym");

    expect(await applicationFiles()).toEqual([`${receipt.id}.json`]);
    expect(await getApplication(receipt.id)).toEqual(receipt);
    expect((await stat(path.join(directory, "applications", `${receipt.id}.json`))).mode & 0o777).toBe(0o600);
    expect(await listApplications()).toEqual([receipt]);
    expect(await listProposals(gap.id)).toEqual([expect.objectContaining({ id: proposal.id, status: "applied", approved_revision: revision, application_id: receipt.id })]);
    const applied = await planApplication(proposal.id);
    expect(applied).toMatchObject({ ready: false, status: "applied", blockers: [{ kind: "state", message: expect.stringContaining("already applied") }], applications: [receipt] });
    expect(applied.records).toEqual(plan.records);
    expect((await getProposal(proposal.id)).staleness.stale).toBe(true);
  });

  it("is idempotent: a duplicate request, sequential or concurrent, returns the same receipt and writes nothing more", async () => {
    const workspace = await loadWorkspace();
    const { proposal, revision, hash } = await approvedProposal([{ target: "component:button", field: "notes", after: `${workspace.components.find((c) => c.id === "button")!.notes} Inside a card, keep one primary action.` }]);
    const [first, second] = await Promise.all([applyProposal(proposal.id, { revision, hash }), applyProposal(proposal.id, { revision, hash })]);
    expect([first.outcome, second.outcome].sort()).toEqual(["already_applied", "applied"]);
    expect(first.receipt!.id).toBe(second.receipt!.id);
    const after = await workspaceHashes();
    const third = await applyProposal(proposal.id, { revision, hash });
    expect(third).toMatchObject({ outcome: "already_applied", receipt: { id: first.receipt!.id, outcome: "applied" }, proposal: { status: "applied" } });
    await expectWorkspaceUnchanged(after);
    expect(await applicationFiles()).toEqual([`${first.receipt!.id}.json`]);
    await expect(applyProposal(proposal.id, { revision: revision + 1, hash })).rejects.toMatchObject({ kind: "state", message: expect.stringContaining("already applied") });
    expect((await readdir(path.join(directory, "decisions"))).filter((name) => name.includes("-proposal-")).length).toBe(1);
  });

  it("makes an applied proposal terminal: no revision, approval, rejection, supersession, refresh, or draft", async () => {
    const workspace = await loadWorkspace();
    const { proposal, revision, hash } = await approvedProposal([{ target: "component:button", field: "use_when", after: [...buttonUseWhen(workspace), "Card actions"] }]);
    await applyProposal(proposal.id, { revision, hash });
    const applied = await getProposal(proposal.id);
    expect(applied.status).toBe("applied");
    expect(approvalBlockers(applied)).toEqual([expect.stringContaining("applied")]);
    expect(applyBlockers(applied)).toEqual([{ kind: "state", message: expect.stringContaining("already applied") }]);
    const input = { summary: "x", changes: [{ target: "component:button", field: "notes", after: "y" }] };
    for (const attempt of [() => saveProposalRevision(proposal.id, input), () => approveProposal(proposal.id, { revision, hash }), () => rejectProposal(proposal.id, {}), () => supersedeProposal(proposal.id), () => rebaseProposal(proposal.id), () => draftProposalWithAi(proposal.id)]) {
      await expect(attempt()).rejects.toBeInstanceOf(ProposalStateError);
    }
    expect((await getProposal(proposal.id)).status).toBe("applied");
    // A hand edit that claims an application without a receipt is refused as corrupt rather than trusted.
    const stored = JSON.parse(await readFile(proposalFile(proposal.id), "utf8")) as Proposal;
    await writeFile(proposalFile(proposal.id), JSON.stringify({ ...stored, application: null }));
    await expect(getProposal(proposal.id)).rejects.toThrow(/applied without an application receipt/);
  });
});

describe("Apply failure and recovery", () => {
  it("changes nothing when the journal cannot be written, and applies once the fault clears", async () => {
    const { proposal, revision, hash } = await approvedProposal(await multiRecordChanges());
    const before = await workspaceHashes();
    faults.openFail = ".journal.json";
    await expect(applyProposal(proposal.id, { revision, hash })).rejects.toThrow(/Simulated disk failure creating the journal/);
    await expectWorkspaceUnchanged(before);
    expect(await applicationFiles()).toEqual([]);
    expect((await getProposal(proposal.id)).status).toBe("approved");
    faults.openFail = "";
    expect((await applyProposal(proposal.id, { revision, hash })).outcome).toBe("applied");
  });

  it("rolls back after the first canonical write: every before byte restored, exports regenerated, receipt kept, proposal still approved", async () => {
    const { proposal, revision, hash } = await approvedProposal(await multiRecordChanges());
    const before = await workspaceHashes();
    const principleBefore = await readFile(path.join(directory, "principles", "keep-primary-actions-obvious.md"));
    // Principles are written first, then patterns: the first pattern write fails, so a principle is already on disk.
    faults.renameFail = "/patterns/"; faults.renameFailTimes = 1;
    let caught: unknown;
    try { await applyProposal(proposal.id, { revision, hash }); } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(ApplyError);
    const failure = caught as ApplyError;
    expect(failure.kind).toBe("write_failed");
    expect(failure.message).toContain("rolled back");
    expect(failure.message).toContain("restored to its previous bytes");
    expect(failure.receipt).toMatchObject({ outcome: "rolled_back", restored: true, recovered: false, failure: expect.stringContaining("Simulated disk failure writing card-actions.md"), validation: { ok: true } });
    expect(failure.receipt!.files.every((file) => file.after_hash === file.before_hash)).toBe(true);
    expect((await readFile(path.join(directory, "principles", "keep-primary-actions-obvious.md"))).equals(principleBefore)).toBe(true);
    await expectWorkspaceUnchanged(before);
    expect(await applicationFiles()).toEqual([`${failure.receipt!.id}.json`]);
    expect((await getProposal(proposal.id)).status).toBe("approved");
    expect((await planApplication(proposal.id))).toMatchObject({ ready: true, applications: [{ id: failure.receipt!.id, outcome: "rolled_back" }] });

    faults.renameFail = ""; faults.renameFailTimes = 0;
    const applied = await applyProposal(proposal.id, { revision, hash });
    expect(applied.outcome).toBe("applied");
    expect((await planApplication(proposal.id)).applications.map((receipt) => receipt.outcome)).toEqual(["applied", "rolled_back"]);
  });

  it("rolls back when export regeneration fails, and keeps the journal for startup recovery when the restore itself cannot be verified", async () => {
    const { proposal, revision, hash } = await approvedProposal(await multiRecordChanges());
    const before = await workspaceHashes();
    faults.renameFail = "DESIGN_SYSTEM.md"; faults.renameFailTimes = 1;
    await expect(applyProposal(proposal.id, { revision, hash })).rejects.toMatchObject({ kind: "write_failed", receipt: { outcome: "rolled_back", restored: true, failure: expect.stringContaining("DESIGN_SYSTEM.md") } });
    await expectWorkspaceUnchanged(before);
    expect((await applicationFiles()).filter((name) => name.endsWith(".journal.json"))).toEqual([]);

    faults.renameFail = "DESIGN_SYSTEM.md"; faults.renameFailTimes = -1;
    let caught: unknown;
    try { await applyProposal(proposal.id, { revision, hash }); } catch (error) { caught = error; }
    const failure = caught as ApplyError;
    expect(failure.kind).toBe("write_failed");
    expect(failure.message).toContain("Restore could not be verified");
    expect(failure.receipt).toMatchObject({ outcome: "rolled_back", restored: false, failure: expect.stringContaining("Recovery problems") });
    const journal = `${failure.receipt!.id}.journal.json`;
    expect(await applicationFiles()).toContain(journal);
    // Canonical records are back, but the exports could not be regenerated, and nothing may be applied over the leftover journal.
    const partial = await workspaceHashes();
    expect(changedFiles(before, partial)).toEqual([]);
    await expect(planApplication(proposal.id)).rejects.toMatchObject({ status: 503, message: expect.stringContaining("Restart Monet") });
    await expect(applyProposal(proposal.id, { revision, hash })).rejects.toMatchObject({ kind: "state" });

    faults.renameFail = ""; faults.renameFailTimes = 0;
    const recovered = await recoverApplications();
    expect(recovered).toEqual([{ application_id: failure.receipt!.id, proposal_id: proposal.id, outcome: "rolled_back", restored: true, failure: expect.stringContaining("Simulated") }]);
    expect(await applicationFiles()).not.toContain(journal);
    expect(await getApplication(failure.receipt!.id)).toMatchObject({ outcome: "rolled_back", restored: true, recovered: true });
    await expectWorkspaceUnchanged(before);
    expect((await getProposal(proposal.id)).status).toBe("approved");
    expect((await applyProposal(proposal.id, { revision, hash })).outcome).toBe("applied");
  });

  it("rolls back when the written workspace fails its final validation", async () => {
    const { proposal, revision, hash } = await approvedProposal(await multiRecordChanges());
    const before = await workspaceHashes();
    faults.validation = true;
    await expect(applyProposal(proposal.id, { revision, hash })).rejects.toMatchObject({ kind: "validation", status: 409, message: expect.stringContaining("did not pass validation"), receipt: { outcome: "rolled_back", restored: true, failure: expect.stringContaining("post-write failure"), validation: { ok: true } } });
    await expectWorkspaceUnchanged(before);
    expect((await getProposal(proposal.id)).status).toBe("approved");
    expect((await applicationFiles()).filter((name) => name.endsWith(".journal.json"))).toEqual([]);
    faults.validation = false;
    expect((await applyProposal(proposal.id, { revision, hash })).outcome).toBe("applied");
  });

  it("recovers an interrupted transaction at startup: uncommitted journals roll back, committed ones complete", async () => {
    const principlePath = path.join(directory, "principles", "keep-primary-actions-obvious.md");
    const original = await readFile(principlePath);
    const before = await workspaceHashes();
    // A crash mid-write: the journal is on disk, one record is half applied, and a decision entry exists.
    const applicationId = "11111111-2222-4333-8444-555555555555";
    const journal = { version: 1, application_id: applicationId, proposal_id: "missing-proposal", gap_id: "g", revision: 1, hash: "a".repeat(64), started_at: "2026-09-09T12:00:00.000Z", records: [{ key: PRINCIPLE, operation: "amend", title: "t", route: "", fields: ["body"] }],
      files: [{ path: "principles/keep-primary-actions-obvious.md", action: "update", before: original.toString("base64"), before_hash: sha256(original) }, { path: "decisions/2026-09-09t12-00-00-000z-proposal-crash.md", action: "create", before: null, before_hash: null }],
      derived: ["DESIGN_SYSTEM.md"], baseline_errors: [], knowledge_fingerprint_before: "f" };
    await writeFile(path.join(directory, "applications", `${applicationId}.journal.json`), JSON.stringify(journal));
    await writeFile(principlePath, "---\ntitle: \"Half written\"\norder: 0\nupdated_at: \"\"\n---\n\nGARBAGE FROM A CRASH\n");
    await writeFile(path.join(directory, "decisions", "2026-09-09t12-00-00-000z-proposal-crash.md"), "---\ntitle: \"crash\"\n---\n\ncrash\n");
    await writeFile(path.join(directory, "DESIGN_SYSTEM.md"), "stale exports written before the crash\n");
    expect(await recoverApplications()).toEqual([{ application_id: applicationId, proposal_id: "missing-proposal", outcome: "rolled_back", restored: true, failure: expect.stringContaining("stopped before") }]);
    expect((await readFile(principlePath)).equals(original)).toBe(true);
    await expectWorkspaceUnchanged(before);
    expect(await readFile(path.join(directory, "DESIGN_SYSTEM.md"), "utf8")).not.toContain("stale exports");
    expect(await applicationFiles()).toEqual([`${applicationId}.json`]);
    expect(await getApplication(applicationId)).toMatchObject({ outcome: "rolled_back", recovered: true, restored: true, files: [{ path: "principles/keep-primary-actions-obvious.md", after_hash: sha256(original) }, { path: "decisions/2026-09-09t12-00-00-000z-proposal-crash.md", after_hash: null }] });
    expect(await recoverApplications()).toEqual([]);

    // A crash after the receipt: the canonical change is complete and only the proposal record needs finishing.
    const { proposal, revision, hash } = await approvedProposal(await multiRecordChanges());
    faults.renameFail = "/proposals/"; faults.renameFailTimes = 1;
    let caught: unknown;
    try { await applyProposal(proposal.id, { revision, hash }); } catch (error) { caught = error; }
    const failure = caught as ApplyError;
    expect(failure.kind).toBe("write_failed");
    expect(failure.message).toContain("finish the bookkeeping");
    expect(failure.receipt?.outcome).toBe("applied");
    faults.renameFail = ""; faults.renameFailTimes = 0;
    const committed = await workspaceHashes();
    expect(JSON.parse(await readFile(proposalFile(proposal.id), "utf8")).status).toBe("approved");
    await expect(getProposal(proposal.id)).rejects.toMatchObject({ status: 503 });
    expect(await applicationFiles()).toContain(`${failure.receipt!.id}.journal.json`);
    await expect(planApplication(proposal.id)).rejects.toMatchObject({ status: 503, message: expect.stringContaining("Restart Monet") });
    expect(await recoverApplications()).toEqual([{ application_id: failure.receipt!.id, proposal_id: proposal.id, outcome: "completed", restored: true, failure: null }]);
    await expectWorkspaceUnchanged(committed);
    expect((await getProposal(proposal.id))).toMatchObject({ status: "applied", application: { id: failure.receipt!.id } });
    expect(await applicationFiles()).not.toContain(`${failure.receipt!.id}.journal.json`);
    expect((await applyProposal(proposal.id, { revision, hash })).outcome).toBe("already_applied");
  });

  it("serializes ordinary saves behind an in-flight Apply, and rechecks a queued Apply against a save that landed first", async () => {
    const workspace = await loadWorkspace();
    const button = workspace.components.find((c) => c.id === "button")!;
    const first = await approvedProposal([{ target: "component:button", field: "use_when", after: [...button.use_when, "Card actions"] }]);
    const applyGate = gate("DESIGN_SYSTEM.md");
    const applying = applyProposal(first.proposal.id, { revision: first.revision, hash: first.hash });
    await applyGate.reached;
    let saved = false;
    const saving = saveComponents("button", { ...button, notes: `${button.notes} Edited during apply.` }).then(() => { saved = true; }, (error: unknown) => error);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(saved, "the save must wait for the transaction").toBe(false);
    faults.gate = null;
    applyGate.open();
    const applied = await applying;
    expect(applied.outcome).toBe("applied");
    expect(await saving).toMatchObject({ status: 409, message: expect.stringContaining("Reload") });
    // Waiting is insufficient for a stale full-record save: it must see the newly applied version.
    const fresh = (await loadWorkspace()).components.find((c) => c.id === "button")!;
    expect(fresh.use_when).toContain("Card actions");
    await saveComponents("button", { ...fresh, notes: `${fresh.notes} Edited after refreshing.` });
    const merged = (await loadWorkspace()).components.find((c) => c.id === "button")!;
    expect(merged.notes).toContain("Edited after refreshing.");
    expect(merged.use_when).toContain("Card actions");
    expect(applied.receipt!.files.find((file) => file.path === "components/decisions.json")!.after_hash).not.toBe((await workspaceHashes()).get("components/decisions.json"));
    expect(await readFile(path.join(directory, "DESIGN_SYSTEM.md"), "utf8")).toContain("Edited after refreshing.");
    expect((await getProposal(first.proposal.id)).status).toBe("applied");

    // The other order: a save is mid-write when Apply arrives. Apply queues, then sees the changed target and refuses.
    const second = await approvedProposal([{ target: "component:button", field: "avoid_when", after: [...merged.avoid_when, "Navigation that should be a link"] }], analysis(finding("weak_guidance", ["component:button"])));
    const saveGate = gate("components/decisions.json");
    const laterSave = saveComponents("button", { ...merged, rationale: `${merged.rationale} Edited before apply.` });
    await saveGate.reached;
    const queuedApply = applyProposal(second.proposal.id, { revision: second.revision, hash: second.hash });
    await new Promise((resolve) => setTimeout(resolve, 30));
    faults.gate = null;
    saveGate.open();
    await laterSave;
    await expect(queuedApply).rejects.toMatchObject({ kind: "stale" });
    expect((await loadWorkspace()).components.find((c) => c.id === "button")!.rationale).toContain("Edited before apply.");
    expect((await getProposal(second.proposal.id)).status).toBe("approved");
  });
});

async function committedButUnreconciled() {
  const approved = await approvedProposal([{ target: "component:button", field: "notes", after: "Approved action guidance." }]);
  faults.renameFail = "/proposals/"; faults.renameFailTimes = 1;
  let failure: ApplyError | undefined;
  try { await applyProposal(approved.proposal.id, { revision: approved.revision, hash: approved.hash }); } catch (error) { failure = error as ApplyError; }
  faults.renameFail = ""; faults.renameFailTimes = 0;
  expect(failure?.receipt?.outcome).toBe("applied");
  return { ...approved, receipt: failure!.receipt! };
}

describe("Safe Apply merge-gate regressions", () => {
  it("blocks ordinary saves, initialization, reads, and Apply until recovery is verified", async () => {
    const workspace = await loadWorkspace();
    const button = workspace.components.find((item) => item.id === "button")!;
    const p = await approvedProposal(await multiRecordChanges());
    faults.renameFail = "DESIGN_SYSTEM.md"; faults.renameFailTimes = -1;
    await expect(applyProposal(p.proposal.id, { revision: p.revision, hash: p.hash })).rejects.toMatchObject({ receipt: { restored: false } });
    const before = await workspaceHashes();
    for (const operation of [
      () => saveComponents("button", { ...button, notes: "This save must not be acknowledged." }),
      () => savePrimitiveTaxonomy(workspace.primitiveTaxonomy), () => initializeStore(), () => loadWorkspace(),
      () => applyProposal(p.proposal.id, { revision: p.revision, hash: p.hash }),
    ]) await expect(operation()).rejects.toMatchObject({ status: 503 });
    await expect(recoverApplications()).rejects.toMatchObject({ status: 503, message: expect.stringContaining("could not be verified") });
    const receipts = await listApplications();
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({ outcome: "rolled_back", restored: false, recovered: true });
    expect((await applicationFiles()).some((file) => file.endsWith(".journal.json"))).toBe(true);
    await expectWorkspaceUnchanged(before);
    faults.renameFail = ""; faults.renameFailTimes = 0;
    // Clearing the I/O fault alone does not bypass recovery.
    await expect(saveComponents("button", button)).rejects.toMatchObject({ status: 503 });
    await recoverApplications();
    await saveComponents("button", { ...button, notes: "Saved only after verified recovery." });
    await recoverApplications();
    expect((await loadWorkspace()).components.find((item) => item.id === "button")?.notes).toBe("Saved only after verified recovery.");
  });

  it("makes a possibly committed proposal immutable until its exact approval is reconciled", async () => {
    const p = await committedButUnreconciled();
    const original = await readFile(proposalFile(p.proposal.id));
    for (const operation of [
      () => saveProposalRevision(p.proposal.id, { summary: "Later revision", changes: [{ target: "component:button", field: "notes", after: "Never approved." }] }),
      () => rejectProposal(p.proposal.id, {}), () => supersedeProposal(p.proposal.id), () => rebaseProposal(p.proposal.id),
      () => approveProposal(p.proposal.id, { revision: p.revision, hash: p.hash }), () => draftProposalWithAi(p.proposal.id),
      () => applyProposal(p.proposal.id, { revision: p.revision, hash: p.hash }),
    ]) await expect(operation()).rejects.toMatchObject({ status: 503 });
    expect((await readFile(proposalFile(p.proposal.id))).equals(original)).toBe(true);
    const committed = await workspaceHashes();
    await recoverApplications();
    await expectWorkspaceUnchanged(committed);
    expect(await getProposal(p.proposal.id)).toMatchObject({ status: "applied", approval: { revision: p.revision, hash: p.hash }, application: { id: p.receipt.id } });
    expect(await getApplication(p.receipt.id)).toMatchObject({ outcome: "applied", recovered: true, finished_at: p.receipt.finished_at });
    expect((await applyProposal(p.proposal.id, { revision: p.revision, hash: p.hash })).outcome).toBe("already_applied");
  });

  it.each(["later revision", "canonical bytes", "export bytes", "receipt identity", "journal before bytes"])("preserves all recovery evidence when %s disagree", async (fault) => {
    const p = await committedButUnreconciled();
    const journalFile = path.join(directory, "applications", `${p.receipt.id}.journal.json`);
    if (fault === "later revision") {
      const stored = JSON.parse(await readFile(proposalFile(p.proposal.id), "utf8")) as Proposal;
      stored.revisions.push({ ...stored.revisions[0]!, number: 2 });
      stored.approval = { ...stored.approval!, revision: 2 };
      await writeFile(proposalFile(p.proposal.id), JSON.stringify(stored));
    } else if (fault === "canonical bytes") {
      const journal = JSON.parse(await readFile(journalFile, "utf8")) as { files: { path: string; before: string }[] };
      const file = journal.files.find((item) => item.path === "components/decisions.json")!;
      await writeFile(path.join(directory, file.path), Buffer.from(file.before, "base64"));
    } else if (fault === "export bytes") await writeFile(path.join(directory, "DESIGN_SYSTEM.md"), "An inconsistent export.\n");
    else if (fault === "receipt identity") await writeFile(path.join(directory, "applications", `${p.receipt.id}.json`), JSON.stringify({ ...p.receipt, revision: 2 }));
    else {
      const journal = JSON.parse(await readFile(journalFile, "utf8"));
      journal.files[0].before_hash = "0".repeat(64);
      await writeFile(journalFile, JSON.stringify(journal));
    }
    const before = await workspaceHashes();
    const evidence = await Promise.all([journalFile, proposalFile(p.proposal.id), path.join(directory, "applications", `${p.receipt.id}.json`)].map((file) => readFile(file)));
    await expect(recoverApplications()).rejects.toMatchObject({ status: 503 });
    await expectWorkspaceUnchanged(before);
    const after = await Promise.all([journalFile, proposalFile(p.proposal.id), path.join(directory, "applications", `${p.receipt.id}.json`)].map((file) => readFile(file)));
    expect(after.every((bytes, i) => bytes.equals(evidence[i]!))).toBe(true);
    await expect(loadWorkspace()).rejects.toMatchObject({ status: 503 });
    await expect(initializeStore()).rejects.toMatchObject({ status: 503 });
  });

  it("keeps a published receipt as possible commit evidence when directory fsync fails", async () => {
    const p = await approvedProposal(await multiRecordChanges());
    faults.receiptSyncFailTimes = 1;
    await expect(applyProposal(p.proposal.id, { revision: p.revision, hash: p.hash })).rejects.toThrow("may have committed");
    const receipt = (await listApplications())[0]!;
    expect(receipt.outcome).toBe("applied");
    const committed = await workspaceHashes();
    expect(await applicationFiles()).toContain(`${receipt.id}.journal.json`);
    await expect(savePrimitiveTaxonomy([])).rejects.toMatchObject({ status: 503 });
    await recoverApplications();
    await expectWorkspaceUnchanged(committed);
    expect(await getApplication(receipt.id)).toMatchObject({ outcome: "applied", recovered: true });
  });

  it.each([1, 2])("recovers byte-exactly when %s receipt writes fail before publication", async (failures) => {
    const p = await approvedProposal(await multiRecordChanges());
    const before = await workspaceHashes();
    faults.receiptFailTimes = failures;
    await expect(applyProposal(p.proposal.id, { revision: p.revision, hash: p.hash })).rejects.toThrow();
    await expectWorkspaceUnchanged(before);
    if (failures === 2) {
      expect((await applicationFiles()).some((file) => file.endsWith(".journal.json"))).toBe(true);
      await expect(loadWorkspace()).rejects.toMatchObject({ status: 503 });
      await recoverApplications();
    }
    await expectWorkspaceUnchanged(before);
    expect((await listApplications())[0]).toMatchObject({ outcome: "rolled_back", restored: true, recovered: failures === 2 });
  });

  it("syncs canonical bytes and containing directories before publishing the receipt", async () => {
    const p = await approvedProposal(await multiRecordChanges());
    faults.durabilityEvents = [];
    const result = await applyProposal(p.proposal.id, { revision: p.revision, hash: p.hash });
    const events = faults.durabilityEvents;
    const receiptRename = events.indexOf(`rename:${path.join(directory, "applications", `${result.receipt!.id}.json`)}`);
    for (const file of [...result.receipt!.files, ...result.receipt!.derived_hashes!]) {
      const absolute = path.join(directory, file.path);
      const rename = events.indexOf(`rename:${absolute}`);
      expect(rename).toBeGreaterThan(0);
      expect(events.slice(0, rename).some((event) => event.startsWith(`sync:${absolute}.`) && event.endsWith(".tmp"))).toBe(true);
      expect(events.slice(rename + 1, receiptRename)).toContain(`sync:${path.dirname(absolute)}`);
    }
  });

  it("never copies private AI summaries, screenshots, observations, or reasoning to canonical audit entries", async () => {
    const gap = await diagnosedGap(wideAnalysis(), true);
    const created = await createProposal({ gap_id: gap.id });
    vi.stubEnv("MONET_AI_COMMAND", "provider");
    vi.mocked(runProvider).mockResolvedValueOnce({ summary: `${CONTEXT} ${PNG}`, rationale: `${PROBLEM}; PRIVATE AI REASONING`, changes: [{ target: "component:button", operation: "amend", field: "notes", value: "Keep secondary actions recognizable.", note: "grid.png PRIVATE SCREENSHOT OBSERVATION" }] });
    const drafted = await draftProposalWithAi(created.id);
    vi.stubEnv("MONET_AI_COMMAND", "");
    expect(drafted.draft_failed).toBeUndefined();
    const revision = drafted.revisions[0]!;
    expect(revision.author).toBe("ai");
    await approveProposal(created.id, { revision: revision.number, hash: revision.hash });
    const result = await applyProposal(created.id, { revision: revision.number, hash: revision.hash });
    const canonical = await canonicalText();
    const context = await createMonetService({ loadWorkspace }).getDesignContext({ componentIds: ["button"] });
    for (const secret of [PROBLEM, CONTEXT, PNG, "grid.png", "PRIVATE AI REASONING", "PRIVATE SCREENSHOT OBSERVATION"]) {
      expect(canonical).not.toContain(secret);
      expect(JSON.stringify(context)).not.toContain(secret);
    }
    const decision = (await loadWorkspace()).decisionLog[0]!;
    expect(decision.body).toContain(`Gap ${gap.id}; proposal ${created.id}, revision ${revision.number} (hash ${revision.hash}), application ${result.receipt!.id}`);
  });

  it.each([false, true])("HTTP/shared/MCP reads wait for a complete Apply outcome (rollback=%s)", async (fail) => {
    const p = await approvedProposal(await multiRecordChanges());
    const original = (await loadWorkspace()).principles.find((item) => `principle:${item.id}` === PRINCIPLE)!.body;
    const server = createMonetMcpServer(createMonetService({ loadWorkspace }));
    const client = new Client({ name: "apply-isolation-test", version: "1" });
    const isolated = new Client({ name: "separate-process-isolation-test", version: "1" });
    const stdio = new StdioClientTransport({ command: process.execPath, args: ["--import", "tsx", path.join(process.cwd(), "mcp/index.ts")], env: { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string")), MONET_ROOT: directory }, stderr: "pipe" });
    stdio.stderr?.on("data", () => undefined);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport); await client.connect(clientTransport);
    const paused = gate("/patterns/");
    if (fail) { faults.renameFail = "/patterns/"; faults.renameFailTimes = 1; }
    const applying = applyProposal(p.proposal.id, { revision: p.revision, hash: p.hash }).catch((error: unknown) => error);
    try {
      await paused.reached;
      let observed = false;
      const reading = loadWorkspace().then((workspace) => { observed = true; return workspace; });
      const mcp = client.readResource({ uri: `monet://principles/${PRINCIPLE.split(":")[1]}` }).then((response) => { observed = true; return response; });
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(observed).toBe(false);
      // Exercise the actual stdio MCP process, which cannot use the editing service's queue.
      await isolated.connect(stdio);
      await expect(isolated.readResource({ uri: `monet://principles/${PRINCIPLE.split(":")[1]}` })).rejects.toThrow("in progress or needs recovery");
      faults.gate = null; paused.open();
      await applying;
      const workspace = await reading;
      const expected = fail ? original : `${original}\n\nActions inside cards are still actions: they need the same affordance as actions anywhere else.`;
      expect(workspace.principles.find((item) => `principle:${item.id}` === PRINCIPLE)!.body).toBe(expected);
      const response = await mcp;
      expect(JSON.parse((response.contents[0] as { text: string }).text).body).toBe(expected);
      const separate = await isolated.readResource({ uri: `monet://principles/${PRINCIPLE.split(":")[1]}` });
      expect(JSON.parse((separate.contents[0] as { text: string }).text).body).toBe(expected);
    } finally { faults.gate = null; paused.open(); await applying; await client.close(); await isolated.close(); await server.close(); }
  });

  it("rejects a separate reader's mixed snapshot even when an entire Apply finishes between its file reads", async () => {
    const p = await approvedProposal(await multiRecordChanges());
    const module = pathToFileURL(path.join(process.cwd(), "server/writeLock.ts")).href;
    const first = path.join(directory, "principles/keep-primary-actions-obvious.md");
    const second = path.join(directory, "patterns/dashboard.md");
    const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `import { withWorkspaceRead } from ${JSON.stringify(module)}; import { readFile } from 'node:fs/promises'; import { once } from 'node:events'; try { const data = await withWorkspaceRead(async () => { const first = await readFile(${JSON.stringify(first)}, 'utf8'); console.log('READY'); await once(process.stdin, 'data'); const second = await readFile(${JSON.stringify(second)}, 'utf8'); return {first,second}; }); console.log('UNSAFE', data); } catch (error) { console.log('BLOCKED', error.status); } process.stdin.destroy();`], { env: { ...process.env, MONET_ROOT: directory }, stdio: ["pipe", "pipe", "pipe"] });
    let output = "";
    const exited = once(child, "exit");
    const ready = new Promise<void>((resolve, reject) => {
      child.stdout.on("data", (chunk) => { output += String(chunk); if (output.includes("READY")) resolve(); });
      child.on("error", reject);
      child.on("exit", () => { if (!output.includes("READY")) reject(new Error("Reader exited before becoming ready.")); });
    });
    try {
      await ready;
      await applyProposal(p.proposal.id, { revision: p.revision, hash: p.hash });
      child.stdin.write("continue\n");
      await exited;
      expect(output).toContain("BLOCKED 503");
      expect(output).not.toContain("UNSAFE");
    } finally { if (child.exitCode === null) { child.kill(); await exited; } }
  });

  it("never rolls back an applied proposal just because its receipt is missing", async () => {
    const p = await committedButUnreconciled();
    const proposal = JSON.parse(await readFile(proposalFile(p.proposal.id), "utf8")) as Proposal;
    await writeFile(proposalFile(p.proposal.id), JSON.stringify({ ...proposal, status: "applied", application: { id: p.receipt.id, applied_at: p.receipt.finished_at } }));
    await rm(path.join(directory, "applications", `${p.receipt.id}.json`));
    const committed = await workspaceHashes();
    await expect(recoverApplications()).rejects.toMatchObject({ status: 503 });
    await expectWorkspaceUnchanged(committed);
    expect(await applicationFiles()).toContain(`${p.receipt.id}.journal.json`);
  });
});
