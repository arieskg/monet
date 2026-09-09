import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { GapDiagnosis } from "../../shared/gaps";
import { Diagnosis } from "../pages/GapsPage";

function diagnosis(): GapDiagnosis {
  return {
    version: 1, created_at: "2026-09-09T12:00:00Z", workspace_fingerprint: "example",
    conclusion: "Measured contrast fails the WCAG floor.", interpretation: "AI thinks guidance is missing.", contradiction: true,
    findings: [
      { source: "deterministic", classification: "implementation_violation", conclusion: "Measured contrast fails the WCAG floor.", reasoning: "1:1 is below 4.5:1.", check: "contrast_below_minimum", basis: "wcag_floor", evidence_ids: ["usages"], record_keys: [], uncertainty: [], next_action: "Correct the contrast." },
      { source: "ai", classification: "implementation_violation", conclusion: "The button may use the wrong style.", reasoning: "Based on the report.", evidence_ids: ["problem"], record_keys: [], uncertainty: ["Not independently verified."], next_action: "Inspect the rendered style.", contradiction: true },
    ],
    evidence: [{ id: "problem", description: "User report" }, { id: "usages", description: "Submitted observations" }], records: [],
    retrieval: { query: "buttons", coverage: "partial", provenance: [], notices: [] },
    conformance: { theme: null, findings: [{ check: "contrast_below_minimum", level: "error", observed: "1:1", expected: "4.5:1", why: "WCAG floor", related: [] }], coverage: { submitted: 1, checked: 1, unverifiable: 0, not_applicable: 0, checks: [] }, scope: "Only submitted observations.", warnings: [] },
    knowledge_count: 1, ai: { status: "complete", message: "AI-assisted interpretation." },
    image_status: "provider_reported_inspected", image_observations: ["A pale button."], limitations: [],
  };
}
const render = (d: GapDiagnosis) => renderToStaticMarkup(<MemoryRouter><Diagnosis diagnosis={d} /></MemoryRouter>);

describe("Gap diagnosis trust boundary in the rendered UI", () => {
  it("separates measured and AI findings and shows the no-change notice outside collapsed details", () => {
    const html = render(diagnosis());
    const measured = html.split('aria-label="Measured checks"')[1]!.split("</section>")[0]!;
    const ai = html.split('aria-label="AI interpretation"')[1]!.split("</section>")[0]!;
    expect(measured).toContain("Deterministic check");
    expect(measured).toContain("contrast_below_minimum");
    expect(measured).toContain("WCAG floor");
    expect(measured).not.toContain("Suspected violation");
    expect(ai).toContain("Suspected violation");
    expect(ai).toContain("AI thinks guidance is missing.");
    expect(ai).toContain("AI finding demoted");
    expect(html).toContain("provider-reported / unverified");
    expect(html).toContain("A pale button.");
    expect(html.indexOf("No canonical Monet records were changed.")).toBeLessThan(html.indexOf("<details"));
    expect(html).toMatch(/<h2 id="diagnosis-heading">Measured contrast fails the WCAG floor\.<\/h2><p[^>]*>No canonical Monet records were changed\.<\/p>/);
  });

  it("labels AI-only implementation findings as suspected, with no measured finding", () => {
    const d = diagnosis(); d.findings = d.findings.filter((f) => f.source === "ai"); d.conformance.findings = [];
    d.conformance.coverage = { submitted: 0, checked: 0, unverifiable: 0, not_applicable: 0, checks: [] }; d.contradiction = false;
    const html = render(d);
    expect(html).toContain("Suspected violation");
    expect(html).toContain("0 of 0 submitted observations checked");
    expect(html).not.toContain("Implementation violation already covered");
  });

  it("renders old V1 records without new fields and keeps their measured error above AI prose", () => {
    const d = diagnosis(); delete d.interpretation; delete d.contradiction; delete d.image_observations;
    d.conclusion = "Old AI headline denying a violation.";
    const html = render(d);
    expect(html).toContain('<h2 id="diagnosis-heading">Measured contrast fails the WCAG floor.</h2>');
    expect(html).toContain("Old AI headline denying a violation.");
  });
});
