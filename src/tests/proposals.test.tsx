import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { Gap } from "../../shared/gaps";
import { applyBlockers, applySupport, fieldEditorText, parseFieldText, type ApplicationReceipt, type ApplyPlan, type ProposalChecks, type ProposalRevision, type ProposalStaleness, type ProposalView } from "../../shared/proposals";
import { AppliedProposals } from "../pages/DecisionsPage";
import { HumanReviewForm, ProposalSection } from "../pages/GapsPage";
import { ApplicationPanel, ApplyOutcomeNotice, ApplyPanel, ChangeDiff, ChecksPanel, IntegrityNotice, RevisionHistory, StalenessNotice } from "../pages/ProposalPage";
import { proposalActions } from "../proposalActions";

const render = (node: React.ReactElement) => renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>);
/** An asymmetric matcher with the type the compared field has, so object literals stay lint-clean. */
const containing = (text: string): string => expect.stringContaining(text) as string;

function checks(overrides: Partial<ProposalChecks> = {}): ProposalChecks {
  return { computed_at: "2026-09-09T12:00:00Z", validation: { new_errors: [], new_warnings: [], resolved: [], baseline_errors: 0, baseline_warnings: 2 }, lint: [], ok: true, ...overrides };
}
function revision(number: number, overrides: Partial<ProposalRevision> = {}): ProposalRevision {
  return { number, created_at: "2026-09-09T12:00:00Z", author: "human", summary: `Revision ${number}`, rationale: "", hash: "a".repeat(64), knowledge_fingerprint: "k", target_fingerprints: {}, checks: checks(),
    changes: [{ target: "component:button", operation: "amend", field: "notes", type: "markdown", before: "Old notes.", after: "New notes.", author: "ai", note: "" }], ...overrides };
}
const staleness: ProposalStaleness = { stale: false, changed_targets: [], missing_targets: [], knowledge_changed: false, diagnosis_changed: false, gap_missing: false };
function view(overrides: Partial<ProposalView> = {}): ProposalView {
  return { version: 1, id: "p1", gap_id: "g1", diagnosis_created_at: "2026-09-09T11:00:00Z", created_at: "", updated_at: "", status: "draft", basis: [], allowed_targets: [], allow_new_pattern: false,
    revisions: [revision(1)], approval: null, rejection: null, superseded_by: null, supersedes: null, staleness, integrity: { ok: true, revisions: [], current_ok: true }, targets: [], ai_available: false, ...overrides };
}
function gap(overrides: Partial<Gap> = {}): Gap {
  return { version: 1, id: "g1", created_at: "2026-09-09T10:00:00Z", image: null, report: { problem: "Cards", context: "", expected: "", notes: "", original_query: "", delivered_guidance: "", usages: [] },
    diagnosis: { version: 1, created_at: "2026-09-09T11:00:00Z", workspace_fingerprint: "k", conclusion: "c", findings: [], evidence: [], records: [], retrieval: { query: "", coverage: "none", provenance: [], notices: [] },
      conformance: { theme: null, coverage: { submitted: 0, checked: 0, unverifiable: 0, not_applicable: 0, checks: [] }, scope: "", findings: [], warnings: [] }, knowledge_count: 1, ai: { status: "unavailable", message: "" }, image_status: "not_supplied", limitations: [] }, review: null, ...overrides };
}
const records = [{ key: "component:button", title: "Button", route: "/components/button" }, { key: "foundation:color", title: "Color", route: "/foundations/color" }];

describe("Proposal review surfaces", () => {
  it("renders typed before/after values as a readable line diff, including tokens as one line each", () => {
    const html = render(<ChangeDiff type="string_list" before={["Submitting a form", "Confirming a workflow"]} after={["Submitting a form", "Actions inside a card"]} />);
    expect(html).toContain('class="proposal-diff-line same"');
    expect(html).toMatch(/removed"><i[^>]*>−<\/i>Confirming a workflow/);
    expect(html).toMatch(/added"><i[^>]*>\+<\/i>Actions inside a card/);
    const map = render(<ChangeDiff type="string_map" before={{ density: "compact" }} after={{ density: "comfortable", radius: "token:radius.md" }} />);
    expect(map).toContain("density: compact");
    expect(map).toContain("radius: token:radius.md");
    expect(render(<ChangeDiff type="markdown" before="" after="" />)).toContain("Empty before and after.");
    const token = { id: "color-accent", name: "color.accent", foundation: "color", type: "color", level: "semantic", value: "{raspberry.500}", description: "Accent", order: 3 };
    const tokens = render(<ChangeDiff type="tokens" before={[token]} after={[{ ...token, value: "{raspberry.600}" }]} />);
    expect(tokens).toMatch(/removed"><i[^>]*>−<\/i>color\.accent = \{raspberry\.500\} \[color\/semantic\] — Accent/);
    expect(tokens).toMatch(/added"><i[^>]*>\+<\/i>color\.accent = \{raspberry\.600\}/);
    expect(tokens).not.toContain("&quot;foundation&quot;");
  });

  it("edits tokens as the JSON the Foundation stores and round-trips every field", () => {
    const tokens = [{ id: "color-accent", name: "color.accent", foundation: "color", type: "color", level: "semantic", value: "{raspberry.500}", description: "Accent", order: 3, modes: { dark: "#88aaff" } }];
    const text = fieldEditorText("tokens", tokens);
    expect(text).toContain('"foundation": "color"');
    expect(text).toContain('"dark": "#88aaff"');
    expect(parseFieldText("tokens", text)).toEqual(tokens);
    expect(fieldEditorText("tokens", [])).toBe("[]");
    expect(parseFieldText("tokens", "[]")).toEqual([]);
    expect(fieldEditorText("string_list", ["a", "b"])).toBe("a\nb");
  });

  it("states plainly whether approval is blocked, lists findings by level, and calls the lint a heuristic", () => {
    const blocked = render(<ChecksPanel revision={2} checks={checks({ ok: false, validation: { new_errors: ['pattern links resolve: card-actions links unknown component "widget"'], new_warnings: [], resolved: [], baseline_errors: 0, baseline_warnings: 0 },
      lint: [{ level: "error", rule: "implementation_reference", target: "pattern:card-actions", field: "body", message: "References a URL or product source path." }, { level: "warning", rule: "product_term", target: "pattern:card-actions", field: "body", message: 'Mentions "ConvoGym".' }] })} />);
    expect(blocked).toContain("Approval blocked");
    expect(blocked.split("proposal-check-errors")[1]).toContain("unknown component");
    expect(blocked.split("proposal-check-errors")[2]).toContain("References a URL");
    expect(blocked).toContain("Mentions &quot;ConvoGym&quot;.");
    expect(blocked).toContain("Generality lint (heuristic)");
    expect(blocked).toContain("cannot prove a change generalizes");
    const ready = render(<ChecksPanel revision={1} checks={checks()} />);
    expect(ready).toContain("Ready for approval");
    expect(ready).toContain("not proof the change generalizes");
  });

  it("raises stale bases and broken integrity as alerts and keeps knowledge drift informational", () => {
    expect(render(<StalenessNotice staleness={staleness} />)).toBe("");
    expect(render(<StalenessNotice staleness={{ ...staleness, knowledge_changed: true }} />)).toContain('role="status"');
    const stale = render(<StalenessNotice staleness={{ ...staleness, stale: true, changed_targets: ["component:button"], diagnosis_changed: true }} />);
    expect(stale).toContain('role="alert"');
    expect(stale).toContain("component:button");
    expect(stale).toContain("diagnosis or human review changed");
    expect(render(<StalenessNotice staleness={{ ...staleness, stale: true, gap_missing: true }} />)).toContain("can be rejected but not revised");
    expect(render(<IntegrityNotice integrity={{ ok: true, revisions: [], current_ok: true }} />)).toBe("");
    const broken = render(<IntegrityNotice integrity={{ ok: false, revisions: [2], current_ok: false }} />);
    expect(broken).toContain('role="alert"');
    expect(broken).toContain("Revision 2 no longer matches its hash");
    expect(broken).toContain("cannot be approved");
    const historical = render(<IntegrityNotice integrity={{ ok: false, revisions: [1], current_ok: true }} />);
    expect(historical).toContain('role="status"');
    expect(historical).toContain("Earlier revision 1 no longer matches its hash");
    expect(historical).toContain("current revision is intact");
  });

  it("matches the server's closure rules: reject survives a deleted Gap, supersede does not, refresh only when re-snapshotting helps", () => {
    expect(proposalActions(view(), false)).toEqual({ reject: true, supersede: true, refresh: false, approve: true });
    expect(proposalActions(view(), true).approve).toBe(false);
    expect(proposalActions(view({ staleness: { ...staleness, stale: true, gap_missing: true } }), false)).toEqual({ reject: true, supersede: false, refresh: false, approve: false });
    expect(proposalActions(view({ staleness: { ...staleness, stale: true, changed_targets: ["component:button"] } }), false)).toMatchObject({ refresh: true, approve: false });
    expect(proposalActions(view({ staleness: { ...staleness, knowledge_changed: true } }), false)).toMatchObject({ refresh: true, approve: true });
    expect(proposalActions(view({ staleness: { ...staleness, stale: true, diagnosis_changed: true } }), false)).toMatchObject({ refresh: false, supersede: true, approve: false });
    expect(proposalActions(view({ integrity: { ok: false, revisions: [1], current_ok: false } }), false).approve).toBe(false);
    // Corruption in an earlier revision is kept as evidence but does not block a clean current revision.
    expect(proposalActions(view({ integrity: { ok: false, revisions: [1], current_ok: true } }), false).approve).toBe(true);
    expect(proposalActions(view({ status: "rejected" }), false)).toEqual({ reject: false, supersede: false, refresh: false, approve: false });
    expect(proposalActions(view({ status: "approved" }), false).approve).toBe(false);
    expect(proposalActions(view({ revisions: [] }), false)).toMatchObject({ refresh: false, approve: false });
  });

  it("renders earlier revisions from their stored snapshots, unaffected by what the record says now", () => {
    const html = render(<RevisionHistory approved={1} revisions={[revision(1), revision(2, { author: "human", changes: [{ target: "component:button", operation: "amend", field: "notes", type: "markdown", before: "Old notes.", after: "Newer notes.", author: "human", note: "" }] })]} />);
    expect(html).toContain("Earlier revisions (2)");
    expect(html).toContain("Revision 1 · Human");
    expect(html).toContain("· approved");
    expect(html).toContain("AI-drafted");
    expect(html).toContain("Human-edited");
    expect(html).toMatch(/removed"><i[^>]*>−<\/i>Old notes\./);
    expect(html).toMatch(/added"><i[^>]*>\+<\/i>New notes\./);
    expect(html).toMatch(/added"><i[^>]*>\+<\/i>Newer notes\./);
    expect(render(<RevisionHistory approved={null} revisions={[]} />)).toBe("");
  });

  it("offers Propose improvement only for eligible diagnoses, explains refusals, and always offers a human review", () => {
    const eligible = render(<ProposalSection gap={gap()} records={records} busy={false} error="" onCreate={() => undefined} onGapChange={() => undefined}
      overview={{ eligibility: { eligible: true, reasons: [], basis: [{ finding_index: -1, classification: "weak_guidance", conclusion: "c", record_keys: ["component:button"], source: "human" }], targets: [{ key: "component:button", title: "Button", route: "/components/button" }], allow_new_pattern: true }, proposals: [{ id: "p1", gap_id: "g1", status: "approved", created_at: "", updated_at: "2026-09-09T12:00:00Z", summary: "Cover card actions", revision: 2, approved_revision: 2, application_id: null }] }} />);
    expect(eligible).toContain('class="button primary"');
    expect(eligible).toContain("records the review cited");
    expect(eligible).toContain('href="/proposals/p1"');
    expect(eligible).toContain("approved 2");
    expect(eligible).toContain("Record a human review of this diagnosis");
    const refused = render(<ProposalSection gap={gap()} records={records} busy={false} error="" onCreate={() => undefined} onGapChange={() => undefined}
      overview={{ eligibility: { eligible: false, reasons: ["Insufficient evidence cannot justify a change to shared guidance on its own. A person can review the diagnosis, classify the Gap, and cite the records concerned."], basis: [], targets: [], allow_new_pattern: false }, proposals: [] }} />);
    expect(refused).toContain("No proposal from this diagnosis yet");
    expect(refused).toContain("A person can review");
    expect(refused).not.toContain('class="button primary"');
    expect(refused).toContain("Cited records");
    expect(refused).toContain('value="component:button"');
    expect(render(<ProposalSection gap={gap({ diagnosis: null })} records={records} busy={false} error="" onCreate={() => undefined} onGapChange={() => undefined} overview={null} />)).toBe("");
  });

  it("asks a reviewer to acknowledge measured errors and shows the recorded review for the current diagnosis", () => {
    const measured = gap();
    measured.diagnosis!.conformance.findings = [{ level: "error", check: "contrast_below_minimum", observed: "1:1", expected: "4.5:1", why: "WCAG floor", related: [] }];
    const html = render(<HumanReviewForm gap={measured} records={records} onSaved={() => undefined} />);
    expect(html).toContain("does not excuse them");
    expect(html).toContain('type="checkbox"');
    expect(render(<HumanReviewForm gap={gap()} records={records} onSaved={() => undefined} />)).not.toContain('type="checkbox"');
    const reviewed = gap({ review: { classification: "missing_decision", conclusion: "c", reasoning: "", record_keys: ["component:button"], acknowledges_measured_errors: false, created_at: "2026-09-09T12:30:00Z", diagnosis_created_at: "2026-09-09T11:00:00Z", workspace_fingerprint: "k" } });
    const current = render(<HumanReviewForm gap={reviewed} records={records} onSaved={() => undefined} />);
    expect(current).toContain("Human review recorded");
    expect(current).toContain("Missing design decision · cites component:button");
    expect(current).toContain("Replace review");
    const inert = render(<HumanReviewForm gap={gap({ review: { ...reviewed.review!, diagnosis_created_at: "2026-09-08T00:00:00Z" } })} records={records} onSaved={() => undefined} />);
    expect(inert).toContain("Record a human review of this diagnosis");
    expect(inert).not.toContain("Replace review");
  });

  it("applies only approved proposals and mirrors the server's apply gates", () => {
    const approval = { revision: 1, hash: "a".repeat(64), approved_at: "", note: "" };
    expect(applyBlockers(view({ status: "approved", approval }))).toEqual([]);
    expect(applyBlockers(view()).map((b) => b.kind)).toEqual(["state"]);
    expect(applyBlockers(view({ status: "applied", approval }))).toEqual([{ kind: "state", message: containing("already applied") }]);
    expect(applyBlockers(view({ status: "rejected" }))[0]?.kind).toBe("state");
    expect(applyBlockers(view({ status: "approved", approval: { ...approval, hash: "b".repeat(64) } }))).toEqual([{ kind: "integrity", message: containing("no longer names the current revision") }]);
    expect(applyBlockers(view({ status: "approved", approval, integrity: { ok: false, revisions: [1], current_ok: false } }))).toEqual([{ kind: "integrity", message: containing("does not match its approved hash") }]);
    expect(applyBlockers(view({ status: "approved", approval, staleness: { ...staleness, stale: true, changed_targets: ["component:button"] } }))).toEqual([{ kind: "stale", message: containing("component:button") }]);
    expect(applyBlockers(view({ status: "approved", approval, staleness: { ...staleness, stale: true, gap_missing: true } }))[0]?.message).toContain("deleted");
    expect(applyBlockers(view({ status: "approved", approval, staleness: { ...staleness, stale: true, diagnosis_changed: true } }))[0]?.message).toContain("Supersede");
    expect(applyBlockers(view({ status: "approved", approval, staleness: { ...staleness, knowledge_changed: true } }))).toEqual([]);
    expect(applySupport({ target: "principle:clarity", field: "body" })).toEqual({ supported: true, reason: "" });
    expect(applySupport({ target: "pattern:forms", field: "components" }).supported).toBe(true);
    expect(applySupport({ target: "component:button", field: "use_when" }).supported).toBe(true);
    expect(applySupport({ target: "component:button", field: "aliases" })).toMatchObject({ supported: false, reason: containing("taxonomy") });
    expect(applySupport({ target: "foundation:color", field: "tokens" })).toMatchObject({ supported: false, reason: containing("Foundation") });
    expect(applySupport({ target: "theme:default", field: "overrides" }).supported).toBe(false);
    expect(applySupport({ target: "primitive:box", field: "notes" }).supported).toBe(false);
    expect(proposalActions(view({ status: "applied", approval }), false)).toEqual({ reject: false, supersede: false, refresh: false, approve: false });
  });

  it("shows exactly what Apply would change, the live state, and a plain warning, and enables the button only when the server says ready", () => {
    const base: ApplyPlan = { proposal_id: "p1", status: "approved", revision: 2, hash: "c".repeat(64), ready: true, blockers: [], unsupported: [],
      records: [{ key: "component:button", operation: "amend", title: "Button", route: "/components/button", fields: ["use_when", "notes"] }, { key: "pattern:card-actions", operation: "create", title: "Card actions", route: "/patterns/card-actions", fields: ["title", "body"] }],
      files: [{ path: "components/decisions.json", action: "update" }, { path: "patterns/card-actions.md", action: "create" }], derived: ["DESIGN_SYSTEM.md", "design-system.json"],
      checks: checks({ validation: { new_errors: [], new_warnings: ["patterns carry the links retrieval depends on: card-actions has no component or Foundation links"], resolved: [], baseline_errors: 1, baseline_warnings: 2 } }), staleness, integrity: { ok: true, revisions: [], current_ok: true }, applications: [] };
    const ready = render(<ApplyPanel plan={base} busy={false} onApply={() => undefined} />);
    expect(ready).toContain("Approved → Apply approved changes");
    expect(ready).toContain("Ready to apply to canonical Monet");
    expect(ready).toContain("This modifies canonical Monet records.");
    expect(ready).toContain('href="/components/button"');
    expect(ready).toContain("new record · title, body");
    expect(ready).toContain("patterns/card-actions.md</code> · create");
    expect(ready).toContain("DESIGN_SYSTEM.md, design-system.json");
    expect(ready).toContain("matches its hash");
    expect(ready).toContain("Staleness: current");
    expect(ready).toContain("no new errors, 1 new warning (1 pre-existing)");
    expect(ready).toContain("No AI is involved");
    expect(ready).toMatch(/<button class="button primary"[^>]*>Apply approved changes<\/button>/);
    expect(ready).not.toMatch(/<button class="button primary" disabled/);

    const blocked = render(<ApplyPanel busy={false} onApply={() => undefined} plan={{ ...base, ready: false, checks: null, staleness: { ...staleness, stale: true, changed_targets: ["component:button"] }, blockers: [{ kind: "stale", message: "Target records changed after approval: component:button." }, { kind: "unsupported", message: "1 approved change targets records Apply cannot write yet." }],
      unsupported: [{ target: "foundation:color", field: "notes", reason: "Foundation records and tokens are not applied automatically yet." }],
      applications: [{ version: 1, id: "r1", proposal_id: "p1", gap_id: "g1", revision: 2, hash: "c".repeat(64), outcome: "rolled_back", started_at: "", finished_at: "2026-09-09T13:00:00Z", recovered: true, failure: "Monet stopped before this application finished.", restored: true, records: [], files: [], derived: [], validation: null, knowledge_fingerprint_before: "k", knowledge_fingerprint_after: null }] }} />);
    expect(blocked).toContain("Apply is blocked");
    expect(blocked).toContain("<b>Stale:</b> Target records changed after approval: component:button.");
    expect(blocked).toContain("<b>Unsupported target:</b>");
    expect(blocked).toContain("foundation:color.notes</code> Foundation records and tokens are not applied automatically yet.");
    expect(blocked).toContain("Nothing is applied partially.");
    expect(blocked).toContain("Staleness: stale (component:button)");
    expect(blocked).toContain("not run (see blockers)");
    expect(blocked).toContain("Recovery completed at startup: rolled back, every file restored");
    expect(blocked).toMatch(/<button class="button primary" disabled/);
  });

  it("distinguishes applied, already applied, stale, validation, rollback, unverified restore, and recovery outcomes", () => {
    const receipt = (overrides: Partial<ApplicationReceipt>): ApplicationReceipt => ({ version: 1, id: "r1", proposal_id: "p1", gap_id: "g1", revision: 2, hash: "c".repeat(64), outcome: "applied", started_at: "", finished_at: "2026-09-09T13:00:00Z", recovered: false, failure: null, restored: true,
      records: [{ key: "component:button", operation: "amend", title: "Button", route: "/components/button", fields: ["use_when"] }], files: [{ path: "components/decisions.json", action: "update", before_hash: "1".repeat(64), after_hash: "2".repeat(64) }], derived: ["DESIGN_SYSTEM.md"], validation: { ok: true, errors: 1, warnings: 3, new_errors: [] }, knowledge_fingerprint_before: "k", knowledge_fingerprint_after: "k2", ...overrides });
    const notice = (kind: Parameters<typeof ApplyOutcomeNotice>[0]["outcome"]["kind"], item: ApplicationReceipt | null) => render(<ApplyOutcomeNotice outcome={{ kind, message: "Detail.", receipt: item }} />);
    expect(notice("applied", receipt({}))).toContain("<b>Applied.</b>");
    expect(notice("applied", receipt({}))).toContain('role="status"');
    expect(notice("already_applied", receipt({}))).toContain("Already applied.");
    expect(notice("stale", null)).toContain("records changed after approval. Nothing was written.");
    expect(notice("stale", null)).toContain('role="alert"');
    expect(notice("validation", null)).toContain("validation failed against the current workspace. Nothing was written.");
    expect(notice("validation", receipt({ outcome: "rolled_back" }))).toContain("failed validation, and every file was restored");
    expect(notice("write_failed", receipt({ outcome: "rolled_back" }))).toContain("rolled back: every file was restored to its previous bytes");
    expect(notice("write_failed", receipt({ outcome: "rolled_back", restored: false }))).toContain("restore could not be verified. Restart Monet");
    expect(notice("write_failed", receipt({}))).toContain("proposal record could not be updated. Restart Monet to finish the bookkeeping");
    expect(notice("unsupported", null)).toContain("cannot write. Nothing was written.");
    expect(notice("integrity", null)).toContain("integrity check");

    const applied = render(<ApplicationPanel receipt={receipt({})} plan={null} />);
    expect(applied).toContain("Applied to canonical Monet");
    expect(applied).toContain('href="/components/button"');
    expect(applied).toContain("Passed: no new errors (1 pre-existing), 3 warnings.");
    expect(applied).toContain("111111111111… → 222222222222…");
    expect(applied).toContain("Verify it in the product");
    expect(applied).toContain("report a new Gap");
    expect(render(<ApplicationPanel receipt={receipt({ recovered: true })} plan={null} />)).toContain("completed by recovery");

    const log = render(<AppliedProposals receipts={[receipt({}), receipt({ id: "r0", outcome: "rolled_back", recovered: true })]} />);
    expect(log).toContain("Applied Gap proposals");
    expect(log).toContain('href="/proposals/p1"');
    expect(log).toContain(">Applied<");
    expect(log).toContain("Rolled back at startup");
    expect(render(<AppliedProposals receipts={[]} />)).toBe("");
  });
});