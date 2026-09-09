import { cp, mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import type { Gap } from "../shared/gaps.js";
import { lineDiff } from "../shared/diff.js";
import { fieldValueText, lintProposal, parseFieldText, projectProposal, proposalEligibility, type ProposalChange } from "../shared/proposals.js";
import { resolveThemeTokens } from "../shared/tokens.js";
import { runProvider } from "./aiProvider.js";
import { createGap, deleteGap, diagnoseSavedGap, initializeStore, loadWorkspace, regenerateExports, saveComponents, savePrinciple } from "./fileStore.js";
import type { gapAnalysisSchema } from "./gapDiagnosis.js";
import type { proposalDraftSchema } from "./proposalDrafting.js";
import { approveProposal, createProposal, draftProposalWithAi, gapProposalOverview, getProposal, listProposals, ProposalStateError, rejectProposal, saveProposalRevision, supersedeProposal } from "./proposalStore.js";
import { BUNDLED_WORKSPACE, setWorkspaceRoot } from "./workspace.js";

vi.mock("./aiProvider.js", async (original) => ({ ...await original<typeof import("./aiProvider.js")>(), runProvider: vi.fn() }));

type Analysis = z.infer<typeof gapAnalysisSchema>;
type Draft = z.infer<typeof proposalDraftSchema>;
const finding = (classification: Analysis["findings"][number]["classification"], record_keys: string[]): Analysis["findings"][number] => ({
  classification, conclusion: `${classification} conclusion`, reasoning: "Because the evidence says so.", evidence_ids: ["problem"], record_keys, uncertainty: [], next_action: "Improve the guidance.",
});
const analysis = (...findings: Analysis["findings"]): Analysis => ({ conclusion: "Guidance could be stronger.", image_inspected: false, measured_errors: "not_assessed", findings });
const eligibleAnalysis = () => analysis(finding("weak_guidance", ["component:button"]), finding("missing_decision", ["component:card", "foundation:color"]));

let directory: string;
const canonicalFiles = ["components/decisions.json", "taxonomy/components.json", "patterns/dashboard.md", "foundations/color.json", "themes/default.json", "DESIGN_SYSTEM.md", "design-system.json", "tokens/tokens.json"];
async function canonicalSnapshot(): Promise<Map<string, Buffer>> {
  return new Map(await Promise.all(canonicalFiles.map(async (file) => [file, await readFile(path.join(directory, file))] as const)));
}

async function diagnosedGap(raw: Analysis = eligibleAnalysis(), problem = "Secondary actions on cards read as plain text"): Promise<Gap> {
  vi.stubEnv("MONET_AI_COMMAND", "provider");
  const gap = await createGap({ problem, context: "The ConvoGym training grid shows Start and Open on every exercise card." });
  vi.mocked(runProvider).mockResolvedValueOnce(raw);
  const result = await diagnoseSavedGap(gap.id);
  vi.stubEnv("MONET_AI_COMMAND", "");
  expect(result.diagnosis?.ai.status).toBe("complete");
  return result;
}

const buttonUseWhen = (workspace: Awaited<ReturnType<typeof loadWorkspace>>) => workspace.components.find((c) => c.id === "button")!.use_when;
const revisionInput = (useWhen: string[]) => ({ summary: "Make secondary actions recognizable", rationale: "Cards need a visible action affordance.", changes: [{ target: "component:button", field: "use_when", after: useWhen }] });

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "monet-proposals-test-"));
  await cp(BUNDLED_WORKSPACE, directory, { recursive: true, filter: (source) => !/\/(gaps|proposals)(\/|$)/.test(source) });
  setWorkspaceRoot(directory);
  await initializeStore();
  vi.stubEnv("MONET_AI_COMMAND", ""); vi.stubEnv("MONET_CODEX_EXECUTABLE", ""); vi.stubEnv("MONET_AI_IMAGES", "");
  vi.mocked(runProvider).mockReset();
});
afterEach(async () => { vi.unstubAllEnvs(); setWorkspaceRoot(BUNDLED_WORKSPACE); await rm(directory, { recursive: true, force: true }); });

describe("Proposal eligibility", () => {
  it("reads a missing proposals directory as empty and refuses proposals before diagnosis", async () => {
    await rm(path.join(directory, "proposals"), { recursive: true });
    expect(await listProposals()).toEqual([]);
    const gap = await createGap({ problem: "Undiagnosed" });
    const overview = await gapProposalOverview(gap.id);
    expect(overview.eligibility).toMatchObject({ eligible: false, reasons: [expect.stringContaining("Diagnose")] });
    await expect(createProposal({ gap_id: gap.id })).rejects.toBeInstanceOf(ProposalStateError);
  });

  it("allows only missing, weak, conflicting, and retrieval findings and explains every refusal", async () => {
    for (const [classification, keys] of [["implementation_violation", ["component:button"]], ["project_specific", []], ["insufficient_evidence", []]] as const) {
      const gap = await diagnosedGap(analysis(finding(classification, [...keys])));
      const eligibility = (await gapProposalOverview(gap.id)).eligibility;
      expect(eligibility.eligible).toBe(false);
      expect(eligibility.reasons.length).toBeGreaterThan(1);
    }
    for (const [classification, keys] of [["missing_decision", ["component:card"]], ["weak_guidance", ["component:button"]], ["conflicting_guidance", ["component:button", "pattern:dashboard"]], ["retrieval_relationship", ["component:card"]]] as const) {
      const gap = await diagnosedGap(analysis(finding(classification, [...keys])));
      const eligibility = (await gapProposalOverview(gap.id)).eligibility;
      expect(eligibility.eligible).toBe(true);
      expect(eligibility.targets.map((t) => t.key).sort()).toEqual([...keys].sort());
      expect(eligibility.allow_new_pattern).toBe(classification === "missing_decision");
    }
  });

  it("excludes contradicted findings and stale diagnoses", async () => {
    const contradicted = await diagnosedGap({ ...analysis(finding("missing_decision", ["foundation:color"])), measured_errors: "disputed" }, "contrast");
    expect(contradicted.diagnosis?.findings[0]?.contradiction).toBeFalsy();
    const gap = await createGap({ problem: "White on white", usages: [{ kind: "contrast", foreground: "#fff", background: "#fff", usage: "text" }] });
    vi.stubEnv("MONET_AI_COMMAND", "provider");
    vi.mocked(runProvider).mockResolvedValueOnce(analysis(finding("missing_decision", ["foundation:color"])));
    const diagnosed = await diagnoseSavedGap(gap.id);
    expect(diagnosed.diagnosis?.findings.find((f) => f.source === "ai")?.contradiction).toBe(true);
    const eligibility = (await gapProposalOverview(gap.id)).eligibility;
    expect(eligibility).toMatchObject({ eligible: false, reasons: [expect.stringContaining("contradiction"), expect.stringContaining("Implementation violations")] });

    const fresh = await diagnosedGap();
    expect((await gapProposalOverview(fresh.id)).eligibility.eligible).toBe(true);
    await savePrinciple("clarity", { id: "clarity", title: "Clarity", body: "Changed after the diagnosis.", order: 0, updated_at: "" });
    expect((await gapProposalOverview(fresh.id)).eligibility).toMatchObject({ eligible: false, reasons: [expect.stringContaining("Diagnose again")] });
    await expect(createProposal({ gap_id: fresh.id })).rejects.toThrow(/Diagnose again/);
  });
});

describe("Proposal revisions", () => {
  it("snapshots before values, records human authorship, computes checks, and never touches canonical records", async () => {
    const gap = await diagnosedGap();
    const snapshot = await canonicalSnapshot();
    const workspaceBefore = JSON.stringify(await loadWorkspace());
    const created = await createProposal({ gap_id: gap.id });
    expect(created).toMatchObject({ status: "draft", revisions: [], approval: null, allow_new_pattern: true, ai_available: false });
    expect(created.allowed_targets.map((t) => t.key).sort()).toEqual(["component:button", "component:card", "foundation:color"]);
    expect(created.targets.find((t) => t.key === "component:button")?.fields.use_when).toMatchObject({ type: "string_list", current: buttonUseWhen(await loadWorkspace()) });
    expect((await stat(path.join(directory, "proposals", `${created.id}.json`))).mode & 0o777).toBe(0o600);

    const useWhen = [...buttonUseWhen(await loadWorkspace()), "Secondary actions on a card or tile need a visible affordance"];
    const saved = await saveProposalRevision(created.id, revisionInput(useWhen));
    const revision = saved.revisions[0]!;
    expect(revision).toMatchObject({ number: 1, author: "human", summary: "Make secondary actions recognizable" });
    expect(revision.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(revision.changes[0]).toMatchObject({ target: "component:button", field: "use_when", type: "string_list", author: "human", before: buttonUseWhen(await loadWorkspace()), after: useWhen });
    expect(revision.target_fingerprints["component:button"]).toMatch(/^[a-f0-9]{64}$/);
    expect(revision.checks.validation.new_errors).toEqual([]);
    expect(revision.checks.ok).toBe(true);
    expect(saved.staleness).toMatchObject({ stale: false, changed_targets: [], knowledge_changed: false });
    expect((await getProposal(created.id)).revisions).toEqual(saved.revisions);
    expect(await listProposals(gap.id)).toEqual([expect.objectContaining({ id: created.id, revision: 1, approved_revision: null, summary: "Make secondary actions recognizable" })]);

    await regenerateExports();
    for (const [file, bytes] of snapshot) expect(await readFile(path.join(directory, file)), file).toEqual(bytes);
    expect(JSON.stringify(await loadWorkspace())).toBe(workspaceBefore);
    expect(JSON.stringify(await loadWorkspace())).not.toContain("Secondary actions on a card or tile");
  });

  it("rejects uncited targets, unknown fields, wrong shapes, duplicate slots, and unpermitted creation", async () => {
    const gap = await diagnosedGap(analysis(finding("weak_guidance", ["component:button"])));
    const proposal = await createProposal({ gap_id: gap.id });
    const attempt = (changes: unknown[]) => saveProposalRevision(proposal.id, { summary: "x", changes });
    await expect(attempt([{ target: "component:card", field: "notes", after: "x" }])).rejects.toThrow(/did not cite/);
    await expect(attempt([{ target: "component:button", field: "selection", after: "x" }])).rejects.toThrow(/no proposable field/);
    await expect(attempt([{ target: "component:button", field: "use_when", after: "not a list" }])).rejects.toThrow(/component:button\.use_when/);
    await expect(attempt([{ target: "component:button", field: "preferences", after: { "Not Snake": "x" } }])).rejects.toThrow(/snake_case/);
    await expect(attempt([{ target: "component:button", field: "status", after: "maybe" }])).rejects.toThrow(/status/);
    await expect(attempt([{ target: "component:button", field: "relationships", after: ["button"] }])).rejects.toThrow(/relate to itself/);
    await expect(attempt([{ target: "component:button", field: "notes", after: "a" }, { target: "component:button", field: "notes", after: "b" }])).rejects.toThrow(/changed twice/);
    await expect(attempt([{ target: "pattern:card-actions", operation: "create", field: "title", after: "Card actions" }])).rejects.toThrow(/missing decision/);
    await expect(attempt([{ target: "principle:clarity", operation: "create", field: "title", after: "x" }])).rejects.toThrow(/only a new pattern/);
    await expect(attempt([])).rejects.toThrow();
    expect((await getProposal(proposal.id)).revisions).toEqual([]);
  });

  it("lets AI draft revision 1 and keeps AI authorship only on untouched values", async () => {
    const gap = await diagnosedGap();
    const proposal = await createProposal({ gap_id: gap.id });
    const offline = await draftProposalWithAi(proposal.id);
    expect(offline.draft_failed).toMatch(/No AI provider/);
    expect(offline.revisions).toEqual([]);

    vi.stubEnv("MONET_AI_COMMAND", "provider");
    const current = await loadWorkspace();
    const draft: Draft = { summary: "Strengthen card action guidance", rationale: "Card actions were ambiguous.", changes: [
      { target: "component:button", operation: "amend", field: "use_when", value: JSON.stringify([...buttonUseWhen(current), "Actions inside a card that must read as actions before hover"]), note: "Adds the card case." },
      { target: "component:card", operation: "amend", field: "notes", value: "State which action is primary when a card carries more than one.", note: "" },
    ] };
    vi.mocked(runProvider).mockResolvedValueOnce(draft);
    const drafted = await draftProposalWithAi(proposal.id);
    expect(drafted.draft_failed).toBeUndefined();
    expect(drafted.revisions[0]).toMatchObject({ number: 1, author: "ai" });
    expect(drafted.revisions[0]!.changes.map((c) => c.author)).toEqual(["ai", "ai"]);
    expect(drafted.revisions[0]!.changes[0]!.before).toEqual(buttonUseWhen(current));
    const prompt = vi.mocked(runProvider).mock.calls[1]![0].prompt;
    expect(prompt).toContain("ALLOWED TARGETS"); expect(prompt).toContain("component:card"); expect(prompt).not.toContain(directory);
    await expect(draftProposalWithAi(proposal.id)).rejects.toThrow(/only before the first revision/);

    const edited = drafted.revisions[0]!.changes.map((c) => ({ target: c.target, field: c.field, after: c.field === "notes" ? "State which action is primary when a card carries more than one, and keep the rest secondary." : c.after }));
    const revised = await saveProposalRevision(proposal.id, { summary: draft.summary, rationale: draft.rationale, changes: edited });
    expect(revised.revisions[1]!.changes.map((c) => [c.field, c.author])).toEqual([["use_when", "ai"], ["notes", "human"]]);
    expect(revised.revisions[1]!.author).toBe("human");
  });

  it("saves nothing when the AI draft fails, malforms, or reaches past the cited records", async () => {
    vi.stubEnv("MONET_AI_COMMAND", "provider");
    const gap = await diagnosedGap(analysis(finding("weak_guidance", ["component:button"])));
    const proposal = await createProposal({ gap_id: gap.id });
    const file = path.join(directory, "proposals", `${proposal.id}.json`);
    const before = await readFile(file);
    const outside: Draft = { summary: "s", rationale: "r", changes: [{ target: "component:card", operation: "amend", field: "notes", value: "x", note: "" }] };
    const badShape: Draft = { summary: "s", rationale: "r", changes: [{ target: "component:button", operation: "amend", field: "use_when", value: "not json", note: "" }] };
    for (const outcome of [new Error("private stderr"), {}, outside, badShape]) {
      if (outcome instanceof Error) vi.mocked(runProvider).mockRejectedValueOnce(outcome); else vi.mocked(runProvider).mockResolvedValueOnce(outcome);
      const result = await draftProposalWithAi(proposal.id);
      expect(result.draft_failed).toBeTruthy();
      expect(result.draft_failed).not.toContain("private stderr");
      expect(result.revisions).toEqual([]);
      expect(await readFile(file)).toEqual(before);
    }
    expect((await draftProposalWithAi(proposal.id)).draft_failed).toBeTruthy();
  });
});

describe("Proposal approval, staleness, and closure", () => {
  it("approves only the exact current revision and clears approval on any new revision", async () => {
    const gap = await diagnosedGap();
    const proposal = await createProposal({ gap_id: gap.id });
    await expect(approveProposal(proposal.id, { revision: 1, hash: "a".repeat(64) })).rejects.toThrow(/Save a revision/);
    const useWhen = [...buttonUseWhen(await loadWorkspace()), "Card actions need a visible affordance"];
    const saved = await saveProposalRevision(proposal.id, revisionInput(useWhen));
    const revision = saved.revisions[0]!;
    await expect(approveProposal(proposal.id, { revision: 1, hash: "a".repeat(64) })).rejects.toThrow(/current revision 1 and its hash/);
    await expect(approveProposal(proposal.id, { revision: 2, hash: revision.hash })).rejects.toThrow(ProposalStateError);
    const approved = await approveProposal(proposal.id, { revision: 1, hash: revision.hash, note: "Looks right." });
    expect(approved).toMatchObject({ status: "approved", approval: { revision: 1, hash: revision.hash, note: "Looks right." } });
    await expect(approveProposal(proposal.id, { revision: 1, hash: revision.hash })).rejects.toThrow(/already approved/);
    expect((await listProposals())[0]).toMatchObject({ approved_revision: 1, status: "approved" });

    const revised = await saveProposalRevision(proposal.id, { ...revisionInput(useWhen), rationale: "Reworded." });
    expect(revised).toMatchObject({ status: "draft", approval: null });
    expect(revised.revisions.length).toBe(2);
    expect(revised.revisions[1]!.hash).not.toBe(revision.hash);
    const snapshot = await canonicalSnapshot();
    expect(JSON.stringify(await loadWorkspace())).not.toContain("Card actions need a visible affordance");
    for (const [file, bytes] of snapshot) expect(await readFile(path.join(directory, file))).toEqual(bytes);
  });

  it("detects changed, missing, re-diagnosed, and deleted bases and blocks approval until a new revision", async () => {
    const gap = await diagnosedGap();
    const proposal = await createProposal({ gap_id: gap.id });
    const workspace = await loadWorkspace();
    const saved = await saveProposalRevision(proposal.id, revisionInput([...buttonUseWhen(workspace), "Card actions"]));
    const button = workspace.components.find((c) => c.id === "button")!;
    await saveComponents("button", { ...button, notes: `${button.notes} Edited outside the proposal.` });
    const stale = await getProposal(proposal.id);
    expect(stale.staleness).toMatchObject({ stale: true, changed_targets: ["component:button"], missing_targets: [], knowledge_changed: true, diagnosis_changed: false, gap_missing: false });
    await expect(approveProposal(proposal.id, { revision: 1, hash: saved.revisions[0]!.hash })).rejects.toThrow(/component:button/);
    const refreshed = await saveProposalRevision(proposal.id, revisionInput([...buttonUseWhen(await loadWorkspace()), "Card actions"]));
    expect(refreshed.staleness.stale).toBe(false);
    expect(refreshed.revisions[1]!.target_fingerprints["component:button"]).not.toBe(saved.revisions[0]!.target_fingerprints["component:button"]);

    vi.stubEnv("MONET_AI_COMMAND", "provider");
    vi.mocked(runProvider).mockResolvedValueOnce(eligibleAnalysis());
    await diagnoseSavedGap(gap.id);
    expect((await getProposal(proposal.id)).staleness).toMatchObject({ stale: true, diagnosis_changed: true });
    await expect(approveProposal(proposal.id, { revision: 2, hash: refreshed.revisions[1]!.hash })).rejects.toThrow(/diagnosed again/);

    await deleteGap(gap.id);
    expect((await getProposal(proposal.id)).staleness).toMatchObject({ stale: true, gap_missing: true });
    await expect(saveProposalRevision(proposal.id, revisionInput(["x"]))).rejects.toThrow(/deleted/);
    expect((await rejectProposal(proposal.id, { reason: "Gap withdrawn." })).status).toBe("rejected");
  });

  it("blocks approval on prospective validation errors and lint errors, and carries warnings without blocking", async () => {
    const gap = await diagnosedGap();
    const proposal = await createProposal({ gap_id: gap.id });
    const broken = await saveProposalRevision(proposal.id, { summary: "New pattern", changes: [
      { target: "pattern:card-actions", operation: "create", field: "title", after: "Card actions" },
      { target: "pattern:card-actions", operation: "create", field: "summary", after: "How actions sit inside cards." },
      { target: "pattern:card-actions", operation: "create", field: "body", after: "# Card actions\n\nSee src/components/Card.tsx for the ConvoGym grid; use #3498db at 13px." },
      { target: "pattern:card-actions", operation: "create", field: "components", after: ["card", "nonexistent-widget"] },
    ] });
    const checks = broken.revisions[0]!.checks;
    expect(checks.ok).toBe(false);
    expect(checks.validation.new_errors).toEqual([expect.stringContaining('unknown component "nonexistent-widget"')]);
    expect(checks.lint.map((f) => [f.rule, f.level])).toEqual(expect.arrayContaining([["implementation_reference", "error"], ["product_term", "warning"], ["literal_value", "warning"]]));
    await expect(approveProposal(proposal.id, { revision: 1, hash: broken.revisions[0]!.hash })).rejects.toThrow(/validation or lint errors/);

    const fixed = await saveProposalRevision(proposal.id, { summary: "New pattern", changes: [
      { target: "pattern:card-actions", operation: "create", field: "title", after: "Card actions" },
      { target: "pattern:card-actions", operation: "create", field: "summary", after: "How actions sit inside cards." },
      { target: "pattern:card-actions", operation: "create", field: "body", after: "# Card actions\n\nOne primary action per card; secondary actions use the secondary button style so they read as actions before hover. Our product needs this." },
      { target: "pattern:card-actions", operation: "create", field: "components", after: ["card", "button"] },
      { target: "pattern:card-actions", operation: "create", field: "foundations", after: ["color"] },
    ] });
    expect(fixed.revisions[1]!.checks.validation.new_errors).toEqual([]);
    expect(fixed.revisions[1]!.checks.lint).toEqual([expect.objectContaining({ rule: "local_scope", level: "warning" })]);
    expect(fixed.revisions[1]!.checks.ok).toBe(true);
    expect((await approveProposal(proposal.id, { revision: 2, hash: fixed.revisions[1]!.hash })).status).toBe("approved");
    expect((await readdir(path.join(directory, "patterns"))).includes("card-actions.md")).toBe(false);
    expect((await loadWorkspace()).patterns.some((p) => p.id === "card-actions")).toBe(false);
  });

  it("rejects and supersedes, carrying eligible changes and their authorship into the successor", async () => {
    const gap = await diagnosedGap();
    const proposal = await createProposal({ gap_id: gap.id });
    const workspace = await loadWorkspace();
    const saved = await saveProposalRevision(proposal.id, { summary: "Two records", changes: [
      { target: "component:button", field: "use_when", after: [...buttonUseWhen(workspace), "Card actions"] },
      { target: "foundation:color", field: "notes", after: "Secondary actions rely on color.text-secondary over surface colors." },
    ] });
    vi.stubEnv("MONET_AI_COMMAND", "provider");
    vi.mocked(runProvider).mockResolvedValueOnce(analysis(finding("weak_guidance", ["component:button"])));
    await diagnoseSavedGap(gap.id);
    const successor = await supersedeProposal(proposal.id);
    expect(successor).toMatchObject({ status: "draft", supersedes: proposal.id, allow_new_pattern: false });
    expect(successor.allowed_targets.map((t) => t.key)).toEqual(["component:button"]);
    expect(successor.revisions[0]!.changes.map((c) => c.target)).toEqual(["component:button"]);
    expect(successor.revisions[0]!.changes[0]!.author).toBe("human");
    expect(successor.staleness.stale).toBe(false);
    const old = await getProposal(proposal.id);
    expect(old).toMatchObject({ status: "superseded", superseded_by: successor.id, approval: null });
    await expect(saveProposalRevision(proposal.id, revisionInput(["x"]))).rejects.toThrow(/superseded/);
    await expect(supersedeProposal(proposal.id)).rejects.toThrow(/superseded/);

    const rejected = await rejectProposal(successor.id, { reason: "Not general enough." });
    expect(rejected).toMatchObject({ status: "rejected", rejection: { reason: "Not general enough." } });
    await expect(saveProposalRevision(successor.id, revisionInput(["x"]))).rejects.toThrow(/rejected/);
    await expect(approveProposal(successor.id, { revision: 1, hash: saved.revisions[0]!.hash })).rejects.toThrow(/rejected/);
    expect((await listProposals(gap.id)).map((p) => p.status).sort()).toEqual(["rejected", "superseded"]);
  });
});

describe("Proposal projection, lint, and diff helpers", () => {
  const report = { problem: "ConvoGym cards hide actions", context: "", expected: "", notes: "", original_query: "", delivered_guidance: "", usages: [] } as Gap["report"];
  const change = (partial: Partial<ProposalChange>): ProposalChange => ({ target: "component:button", operation: "amend", field: "notes", type: "markdown", before: "old", after: "new", author: "human", note: "", ...partial });

  it("projects typed changes in memory, re-resolving tokens, and flags no-ops and cleared guidance", async () => {
    setWorkspaceRoot(BUNDLED_WORKSPACE);
    const workspace = await loadWorkspace();
    const accent = workspace.resolvedTokens.find((t) => t.name === "color.accent")!;
    const projected = projectProposal(workspace, [
      change({ target: "theme:default", field: "dark_overrides", type: "overrides", before: {}, after: { "color.accent": "#88aaff" } }),
      change({ target: "component:textarea", field: "aliases", type: "string_list", before: [], after: ["multiline input"] }),
      change({ target: "pattern:card-actions", operation: "create", field: "title", type: "text", before: null, after: "Card actions" }),
      change({ target: "component:button", field: "relationships", type: "id_list", before: [], after: ["card", "link"] }),
    ]);
    expect(projected.themes.find((t) => t.id === "default")?.modes?.dark).toEqual({ "color.accent": "#88aaff" });
    expect(projected.resolvedTokens.find((t) => t.name === "color.accent")?.resolved_value).toBe(accent.resolved_value);
    expect(resolveDark(projected)).toBe("#88aaff");
    expect(projected.taxonomy.flatMap((c) => c.entries).find((e) => e.id === "textarea")?.aliases).toEqual(["multiline input"]);
    expect(projected.patterns.find((p) => p.id === "card-actions")).toMatchObject({ title: "Card actions", status: "experimental" });
    expect(workspace.patterns.some((p) => p.id === "card-actions")).toBe(false);
    expect(workspace.themes.find((t) => t.id === "default")?.modes?.dark?.["color.accent"]).toBeUndefined();

    const lint = lintProposal([
      change({ before: "same", after: "same" }),
      change({ field: "rationale", before: "Existing rationale.", after: "  " }),
      change({ field: "use_when", type: "string_list", before: [], after: ["Use in ConvoGym exercise cards"] }),
    ], report, ["Button"], new Set(["component:button"]));
    expect(lint.map((f) => f.rule)).toEqual(["no_change", "clears_guidance", "product_term"]);
  });

  it("renders values as readable lines, parses them back, and diffs by line", () => {
    expect(fieldValueText("string_map", { density: "compact", radius: "token:radius.md" })).toBe("density: compact\nradius: token:radius.md");
    expect(parseFieldText("string_map", "density: compact\nradius: token:radius.md")).toEqual({ density: "compact", radius: "token:radius.md" });
    expect(parseFieldText("boolean_map", "closable: true")).toEqual({ closable: true });
    expect(() => parseFieldText("boolean_map", "closable: yes")).toThrow(/true or false/);
    expect(parseFieldText("overrides", "color.accent: #112233\nspace.unit: 4")).toEqual({ "color.accent": "#112233", "space.unit": 4 });
    expect(fieldValueText("tokens", [{ id: "a", name: "color.a", foundation: "color", type: "color", level: "semantic", value: "#fff", description: "Surface", order: 0, modes: { dark: "#000" } }])).toBe("color.a = #fff · dark #000 [color/semantic] — Surface");
    const diff = lineDiff("one\ntwo\nthree", "one\n2\nthree\nfour");
    expect(diff).toEqual([{ kind: "same", text: "one" }, { kind: "removed", text: "two" }, { kind: "added", text: "2" }, { kind: "same", text: "three" }, { kind: "added", text: "four" }]);
    expect(lineDiff("", "a")).toEqual([{ kind: "added", text: "a" }]);
  });

  it("evaluates eligibility without a server", () => {
    const gap: Pick<Gap, "diagnosis"> = { diagnosis: null };
    expect(proposalEligibility(gap, "f").eligible).toBe(false);
    const diagnosis = { workspace_fingerprint: "f", findings: [{ classification: "weak_guidance", record_keys: ["component:button"], conclusion: "c", contradiction: false, source: "ai" }], records: [{ key: "component:button", title: "Button", route: "/components/button" }], created_at: "" } as unknown as NonNullable<Gap["diagnosis"]>;
    expect(proposalEligibility({ diagnosis }, "f")).toMatchObject({ eligible: true, targets: [{ key: "component:button" }], allow_new_pattern: false });
    expect(proposalEligibility({ diagnosis }, "other").eligible).toBe(false);
  });
});

function resolveDark(workspace: Awaited<ReturnType<typeof loadWorkspace>>): string | number | null | undefined {
  const theme = workspace.themes.find((t) => t.id === workspace.activeThemeId) ?? null;
  return resolveThemeTokens(workspace.foundations, theme, "dark").tokens.find((t) => t.name === "color.accent")?.resolved_value;
}
