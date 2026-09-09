import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { ProposalChecks, ProposalStaleness } from "../../shared/proposals";
import { ProposalSection } from "../pages/GapsPage";
import { ChangeDiff, ChecksPanel, StalenessNotice } from "../pages/ProposalPage";

const render = (node: React.ReactElement) => renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>);

function checks(overrides: Partial<ProposalChecks> = {}): ProposalChecks {
  return { computed_at: "2026-09-09T12:00:00Z", validation: { new_errors: [], new_warnings: [], resolved: [], baseline_errors: 0, baseline_warnings: 2 }, lint: [], ok: true, ...overrides };
}

describe("Proposal review surfaces", () => {
  it("renders typed before/after values as a readable line diff", () => {
    const html = render(<ChangeDiff type="string_list" before={["Submitting a form", "Confirming a workflow"]} after={["Submitting a form", "Actions inside a card"]} />);
    expect(html).toContain('class="proposal-diff-line same"');
    expect(html).toMatch(/removed"><i[^>]*>−<\/i>Confirming a workflow/);
    expect(html).toMatch(/added"><i[^>]*>\+<\/i>Actions inside a card/);
    const map = render(<ChangeDiff type="string_map" before={{ density: "compact" }} after={{ density: "comfortable", radius: "token:radius.md" }} />);
    expect(map).toContain("density: compact");
    expect(map).toContain("radius: token:radius.md");
    expect(render(<ChangeDiff type="markdown" before="" after="" />)).toContain("Empty before and after.");
  });

  it("states plainly whether approval is blocked and lists validation and lint findings by level", () => {
    const blocked = render(<ChecksPanel revision={2} checks={checks({ ok: false, validation: { new_errors: ['pattern links resolve: card-actions links unknown component "widget"'], new_warnings: ["patterns carry the links retrieval depends on: card-actions has no component or Foundation links"], resolved: [], baseline_errors: 0, baseline_warnings: 0 },
      lint: [{ level: "error", rule: "implementation_reference", target: "pattern:card-actions", field: "body", message: "References a URL or product source path." }, { level: "warning", rule: "product_term", target: "pattern:card-actions", field: "body", message: 'Mentions "ConvoGym".' }] })} />);
    expect(blocked).toContain("Approval blocked");
    expect(blocked).toContain("Checks · revision 2");
    expect(blocked.split("proposal-check-errors")[1]).toContain("unknown component");
    expect(blocked.split("proposal-check-errors")[2]).toContain("References a URL");
    expect(blocked).toContain("Mentions &quot;ConvoGym&quot;.");
    expect(blocked).toContain("Warnings never block; errors do.");
    const ready = render(<ChecksPanel revision={1} checks={checks()} />);
    expect(ready).toContain("Ready for approval");
    expect(ready).toContain("No new integrity errors.");
    expect(ready).toContain("Nothing product-specific detected.");
  });

  it("raises stale bases as alerts and keeps unrelated knowledge drift informational", () => {
    const base: ProposalStaleness = { stale: false, changed_targets: [], missing_targets: [], knowledge_changed: false, diagnosis_changed: false, gap_missing: false };
    expect(render(<StalenessNotice staleness={base} />)).toBe("");
    const drift = render(<StalenessNotice staleness={{ ...base, knowledge_changed: true }} />);
    expect(drift).toContain('role="status"');
    expect(drift).toContain("Other Monet records changed");
    const stale = render(<StalenessNotice staleness={{ ...base, stale: true, changed_targets: ["component:button"], diagnosis_changed: true }} />);
    expect(stale).toContain('role="alert"');
    expect(stale).toContain("component:button");
    expect(stale).toContain("diagnosed again");
    expect(render(<StalenessNotice staleness={{ ...base, stale: true, gap_missing: true }} />)).toContain("was deleted");
  });

  it("offers Propose improvement only for eligible diagnoses and explains refusals", () => {
    const eligible = render(<ProposalSection gapId="abc12345-gap" diagnosedAt="2026-09-09T12:00:00Z" busy={false} error="" onCreate={() => undefined}
      overview={{ eligibility: { eligible: true, reasons: [], basis: [], targets: [{ key: "component:button", title: "Button", route: "/components/button" }], allow_new_pattern: true }, proposals: [{ id: "p1", gap_id: "abc12345-gap", status: "approved", created_at: "", updated_at: "2026-09-09T12:00:00Z", summary: "Cover card actions", revision: 2, approved_revision: 2 }] }} />);
    expect(eligible).toContain("Propose improvement");
    expect(eligible).toContain("or one new pattern");
    expect(eligible).toContain('href="/components/button"');
    expect(eligible).toContain('href="/proposals/p1"');
    expect(eligible).toContain("Approved");
    expect(eligible).toContain("approved 2");
    const refused = render(<ProposalSection gapId="abc12345-gap" diagnosedAt="2026-09-09T12:00:00Z" busy={false} error="" onCreate={() => undefined}
      overview={{ eligibility: { eligible: false, reasons: ["Implementation violations are fixed in the product, not in Monet."], basis: [], targets: [], allow_new_pattern: false }, proposals: [] }} />);
    expect(refused).toContain("No proposal from this diagnosis");
    expect(refused).toContain("fixed in the product");
    expect(refused).not.toContain('class="button primary"');
    expect(render(<ProposalSection gapId="abc12345-gap" diagnosedAt={null} busy={false} error="" onCreate={() => undefined} overview={null} />)).toBe("");
  });
});
