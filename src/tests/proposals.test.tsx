import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { Gap } from "../../shared/gaps";
import { fieldEditorText, parseFieldText, type ProposalChecks, type ProposalRevision, type ProposalStaleness, type ProposalView } from "../../shared/proposals";
import { HumanReviewForm, ProposalSection } from "../pages/GapsPage";
import { ChangeDiff, ChecksPanel, IntegrityNotice, RevisionHistory, StalenessNotice } from "../pages/ProposalPage";
import { proposalActions } from "../proposalActions";

const render = (node: React.ReactElement) => renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>);

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
    revisions: [revision(1)], approval: null, rejection: null, superseded_by: null, supersedes: null, staleness, integrity: { ok: true, revisions: [] }, targets: [], ai_available: false, ...overrides };
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
    expect(render(<IntegrityNotice integrity={{ ok: true, revisions: [] }} />)).toBe("");
    const broken = render(<IntegrityNotice integrity={{ ok: false, revisions: [2] }} />);
    expect(broken).toContain('role="alert"');
    expect(broken).toContain("Revision 2 no longer matches its hash");
  });

  it("matches the server's closure rules: reject survives a deleted Gap, supersede does not, refresh only when re-snapshotting helps", () => {
    expect(proposalActions(view(), false)).toEqual({ reject: true, supersede: true, refresh: false, approve: true });
    expect(proposalActions(view(), true).approve).toBe(false);
    expect(proposalActions(view({ staleness: { ...staleness, stale: true, gap_missing: true } }), false)).toEqual({ reject: true, supersede: false, refresh: false, approve: false });
    expect(proposalActions(view({ staleness: { ...staleness, stale: true, changed_targets: ["component:button"] } }), false)).toMatchObject({ refresh: true, approve: false });
    expect(proposalActions(view({ staleness: { ...staleness, knowledge_changed: true } }), false)).toMatchObject({ refresh: true, approve: true });
    expect(proposalActions(view({ staleness: { ...staleness, stale: true, diagnosis_changed: true } }), false)).toMatchObject({ refresh: false, supersede: true, approve: false });
    expect(proposalActions(view({ integrity: { ok: false, revisions: [1] } }), false).approve).toBe(false);
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
      overview={{ eligibility: { eligible: true, reasons: [], basis: [{ finding_index: -1, classification: "weak_guidance", conclusion: "c", record_keys: ["component:button"], source: "human" }], targets: [{ key: "component:button", title: "Button", route: "/components/button" }], allow_new_pattern: true }, proposals: [{ id: "p1", gap_id: "g1", status: "approved", created_at: "", updated_at: "2026-09-09T12:00:00Z", summary: "Cover card actions", revision: 2, approved_revision: 2 }] }} />);
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
});
