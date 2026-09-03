import { beforeAll, describe, expect, it } from "vitest";
import { loadWorkspace } from "../server/fileStore.js";
import { toCompactContext, type CompactDesignContext } from "./compactContext.js";
import { createMonetService, type MonetService } from "./service.js";
import type { DesignContext } from "./model.js";

describe("Monet compact design brief", () => {
  let service: MonetService;
  let full: DesignContext;
  let brief: CompactDesignContext;

  beforeAll(async () => {
    service = createMonetService({ loadWorkspace });
    full = await service.getDesignContext({ query: "build a login form" });
    brief = toCompactContext(full);
  });

  it("keeps the same records the full context retrieved", () => {
    expect(brief.components.map((item) => item.id)).toEqual(full.components.map((item) => item.id));
    expect(brief.patterns.map((item) => item.id)).toEqual(full.patterns.map((item) => item.id));
    expect(brief.foundations.map((item) => item.id)).toEqual(full.foundations.map((item) => item.id));
    expect(brief.coverage).toBe(full.coverage);
  });

  it("drops the provenance rows that only restate that principles always ship", () => {
    expect(full.retrieval.some((match) => match.reason === "global_guidance")).toBe(true);
    expect(brief.retrieval.some((match) => match.reason === "global_guidance")).toBe(false);
    // Every other explanation survives untouched.
    expect(brief.retrieval).toEqual(full.retrieval.filter((match) => match.reason !== "global_guidance"));
    expect(brief.principles.length).toBeGreaterThan(0);
  });

  it("carries the Avoid guidance every principle and pattern authored", async () => {
    // Both extractors key off an authored convention — `## Avoid` in a pattern, `**Avoid.**` in a
    // principle. If a record stops following the convention the guidance would vanish from briefs
    // in silence, so the whole corpus is checked rather than the handful in one brief.
    const everything = toCompactContext(await service.getDesignContext({}));
    expect(everything.patterns.length).toBeGreaterThan(0);
    expect(everything.principles.length).toBeGreaterThan(0);

    const patternsWithAvoid = (await service.listPatterns()).filter((pattern) => /\n##\s+Avoid\s*\n/.test(pattern.body)).map((pattern) => pattern.id);
    expect(patternsWithAvoid.length).toBe(everything.patterns.length);
    expect(everything.patterns.filter((item) => !item.avoid.length).map((item) => item.id)).toEqual([]);
    expect(everything.patterns.filter((item) => !item.intent.length || !item.covers.length).map((item) => item.id)).toEqual([]);

    const principlesWithAvoid = (await service.listPrinciples()).filter((principle) => principle.body.includes("**Avoid.**")).map((principle) => principle.id);
    expect(principlesWithAvoid.length).toBe(everything.principles.length);
    expect(everything.principles.filter((item) => !item.avoid.length).map((item) => item.id)).toEqual([]);
    expect(everything.principles.filter((item) => !item.decision.length).map((item) => item.id)).toEqual([]);
  });

  it("preserves the decision, its status, and the guidance an agent acts on", () => {
    const passwordInput = brief.components.find((item) => item.id === "password-input")!;
    expect(passwordInput.status).toBe("selected");
    expect(passwordInput.preferences).toMatchObject({ border: "token:color.border.strong" });
    expect(passwordInput.use_when?.length).toBeGreaterThan(0);
    expect(passwordInput.avoid_when?.length).toBeGreaterThan(0);
    expect(passwordInput.notes?.length).toBeGreaterThan(0);
    // A record the query actually found keeps the reasoning behind its decision.
    expect(passwordInput.rationale?.length).toBeGreaterThan(0);
  });

  it("carries an undecided status rather than quietly dropping the record", async () => {
    const wizard = toCompactContext(await service.getDesignContext({ query: "build an onboarding wizard" }));
    const stepper = wizard.components.find((item) => item.id === "stepper")!;
    expect(stepper.status).toBe("undecided");
    expect(stepper.preferences).toBeUndefined();
    expect(wizard.notices.map((notice) => notice.kind)).toContain("undecided_guidance");
  });

  it("leaves the justification of a supporting record at its resource", () => {
    const expanded = brief.components.find((item) => item.id === "textarea")!;
    expect(expanded.rationale).toBeUndefined();
    expect(expanded.preferences).toBeDefined();
    expect(expanded.uri).toBe("monet://components/textarea");
  });

  it("keeps pattern guidance rather than dumping or discarding the document", () => {
    const forms = brief.patterns.find((item) => item.id === "forms")!;
    expect(forms.summary.length).toBeGreaterThan(0);
    expect(forms.intent.length).toBeGreaterThan(0);
    expect(forms.avoid.length).toBeGreaterThan(0);
    expect(forms.covers).toEqual(expect.arrayContaining(["Validation", "Committing"]));
    expect(forms.uri).toBe("monet://patterns/forms");
    // The applied detail lives at the resource, not inline.
    expect(JSON.stringify(forms).length).toBeLessThan(full.patterns.find((item) => item.id === "forms")!.body.length);
  });

  it("returns tokens as name and value instead of token records", () => {
    expect(brief.tokens["space.4"]).toBe("16px");
    expect(brief.tokens["color.border.strong"]).toBe("#5f605a");
    expect(Object.keys(brief.tokens).length).toBe(full.resolvedTokens.length);
    expect(JSON.stringify(brief.tokens).length).toBeLessThan(JSON.stringify(full.resolvedTokens).length / 5);
  });

  it("reports theme provenance only where the theme actually changes a value", () => {
    // Base Monet's only theme is override-free, so nothing claims a theme origin.
    expect(brief.theme).toMatchObject({ id: "default" });
    expect(brief.theme_overrides).toBeUndefined();
    expect(full.resolvedTokens.every((token) => token.source === "base")).toBe(true);
  });

  it("gives every record a resource URI for the full text", () => {
    const uris = [
      ...brief.principles.map((item) => item.uri), ...brief.foundations.map((item) => item.uri),
      ...brief.patterns.map((item) => item.uri), ...brief.components.map((item) => item.uri),
    ];
    expect(uris.length).toBeGreaterThan(0);
    expect(uris.filter((uri) => !/^monet:\/\/[a-z]+\/[a-z0-9-]+$/.test(uri))).toEqual([]);
  });

  it("never exposes editor or filesystem detail", () => {
    const serialized = JSON.stringify(brief);
    for (const leak of ["candidates", "asset_path", "filesRoot", "updated_at", "history", "source_component", "base_resolved_value", "override_dependencies"]) {
      expect(serialized, leak).not.toContain(leak);
    }
  });

  it("does not repeat Foundation guidance inside the components that reference it", () => {
    const color = brief.foundations.find((item) => item.id === "color")!;
    expect(color.guidance.length).toBeGreaterThan(0);
    for (const component of brief.components) {
      expect(JSON.stringify(component), component.id).not.toContain(color.guidance.slice(0, 80));
    }
  });

  it("stays a fraction of the full context across representative tasks", async () => {
    const queries = ["build a login form", "add a confirmation modal before deleting a project", "build a data-heavy dashboard", "build a settings page", "table with inline editing and bulk actions"];
    for (const query of queries) {
      const context = await service.getDesignContext({ query });
      const compact = JSON.stringify(toCompactContext(context)).length;
      expect(compact, query).toBeLessThan(JSON.stringify(context).length * 0.4);
      // Roughly four characters per token; a scoped brief must stay well inside a working budget.
      expect(compact / 4, query).toBeLessThan(16_000);
    }
  });
});
