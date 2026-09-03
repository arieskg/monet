import { beforeAll, describe, expect, it } from "vitest";
import { loadWorkspace } from "../server/fileStore.js";
import type { DesignContext } from "./model.js";
import { createMonetService, type MonetService } from "./service.js";

function ids(context: DesignContext, key: "foundations" | "patterns" | "components" | "references"): string[] {
  return context[key].map((item) => item.id);
}

describe("Monet deterministic retrieval workflows", () => {
  let service: MonetService;

  beforeAll(() => {
    service = createMonetService({ loadWorkspace });
  });

  it("retrieves scoped settings-page guidance", async () => {
    const context = await service.getDesignContext({ query: "build a settings page" });
    expect(ids(context, "foundations")).toEqual(expect.arrayContaining(["layout", "spacing", "typography"]));
    // Settings is the record that owns this task. It hands field mechanics to Forms in its own
    // opening paragraph, which the compact brief carries, so the agent is pointed there by the
    // corpus rather than by a coincidental alias overlap between the two pattern names.
    expect(ids(context, "patterns")).toContain("settings");
    const settings = context.patterns.find((item) => item.id === "settings")!;
    expect(settings.body).toContain("follow the Forms pattern");
    expect(ids(context, "components")).toEqual(expect.arrayContaining(["field", "text-input", "switch"]));
    expect(ids(context, "components")).not.toContain("data-table");
    expect(context.retrieval).toContainEqual(expect.objectContaining({ entity_type: "pattern", entity_id: "settings", reason: "direct_name_match" }));
  });

  it("retrieves command-palette composition without dashboard fan-out", async () => {
    const context = await service.getDesignContext({ query: "build a command palette / search experience" });
    expect(ids(context, "components")).toEqual(expect.arrayContaining(["command-palette", "search-input", "dialog", "keyboard-shortcut"]));
    // Both named concepts match outright, so either may lead; neither may be buried under expansion.
    expect(context.components.slice(0, 2).map((item) => item.id).sort()).toEqual(["command-palette", "search-input"]);
    expect(ids(context, "patterns")).toContain("filtering");
    expect(ids(context, "components")).not.toContain("data-table");
    expect(ids(context, "patterns")).not.toContain("loading");
  });

  it("retrieves data-heavy dashboard context without command or form workflows", async () => {
    const context = await service.getDesignContext({ query: "build a data-heavy dashboard" });
    expect(ids(context, "foundations")).toEqual(expect.arrayContaining(["layout", "spacing", "typography"]));
    // The Dashboard pattern owns this workflow and names the controls it is built from, including
    // its own loading, empty and error guidance. Retrieval returns that record rather than
    // reassembling the workflow out of four adjacent pattern documents.
    expect(ids(context, "patterns")).toContain("dashboard");
    expect(ids(context, "components")).toEqual(expect.arrayContaining(["data-table", "statistic", "skeleton", "empty-state"]));
    expect(ids(context, "components")).not.toContain("command-palette");
    expect(ids(context, "patterns")).not.toContain("forms");
    const dashboard = context.patterns.find((item) => item.id === "dashboard")!;
    expect(dashboard.body).toContain("## Loading, empty, and error states");
  });

  it("retrieves core review foundations without inventing component scope", async () => {
    const context = await service.getDesignContext({ query: "review an existing UI against my Monet design system" });
    expect(ids(context, "foundations")).toEqual(expect.arrayContaining(["color", "layout", "spacing", "typography"]));
    expect(context.components).toEqual([]);
    expect(context.patterns).toEqual([]);
  });

  it("finds references from structured tags rather than only from their title", async () => {
    const context = await service.getDesignContext({ query: "a documentation portal with a sectioned card grid" });
    expect(ids(context, "references")).toContain("linear-doc-pages");
    expect(ids(context, "components")).toContain("card");
    const results = await service.searchReferences("documentation portal");
    expect(results[0]).toMatchObject({
      reference: { id: "linear-doc-pages" },
      match: { entity_type: "reference", entity_id: "linear-doc-pages", strength: "strong" },
    });
  });

  it("lets a decisive overlay match reach the workflow that governs it", async () => {
    const context = await service.getDesignContext({ query: "add a confirmation modal before deleting a project" });
    expect(ids(context, "components")).toEqual(expect.arrayContaining(["alert-dialog", "dialog"]));
    expect(ids(context, "patterns")).toEqual(expect.arrayContaining(["destructive-actions", "overlays"]));
    // Every expansion says what pulled it in.
    const expansions = context.retrieval.filter((match) => match.reason === "relationship_expansion" || match.reason === "reverse_pattern_expansion");
    expect(expansions.every((match) => Boolean(match.related_from))).toBe(true);
  });

  it("does not let a generic control drag in the workflows that merely mention it", async () => {
    const context = await service.getDesignContext({ query: "a button that submits the form" });
    // Button appears in seven patterns. A passing mention must not import all of them.
    expect(context.patterns.length).toBeLessThanOrEqual(2);
    expect(ids(context, "patterns")).not.toEqual(expect.arrayContaining(["dashboard", "data-tables", "master-detail"]));
  });

  it("keeps expansion one hop from the record that earned it", async () => {
    const context = await service.getDesignContext({ componentIds: ["dialog"] });
    const expanded = context.retrieval.filter((match) => match.entity_type === "component" && match.reason === "relationship_expansion");
    const dialog = context.components.find((item) => item.id === "dialog")!;
    // Dialog's own relationships arrive; their relationships do not.
    expect(expanded.map((match) => match.entity_id).sort()).toEqual([...dialog.relationships].sort());
    expect(expanded.every((match) => match.related_from === "component:dialog")).toBe(true);
  });

  it("keeps master-detail expansion to the collection column it is actually built from", async () => {
    const context = await service.getDesignContext({ patternIds: ["master-detail"] });
    expect(ids(context, "components")).toEqual(expect.arrayContaining(["list", "data-table"]));
    expect(ids(context, "components")).not.toContain("sidebar");
    expect(ids(context, "components")).not.toContain("card");
  });

  it("reports coverage from evidence the request produced, not from its consequences", async () => {
    const confident = await service.getDesignContext({ query: "build a login form" });
    expect(confident.coverage).toBe("task_specific");
    expect(confident.retrieval.some((match) => match.strength !== "weak" && match.entity_type !== "principle"
      && ["direct_name_match", "alias_match", "tag_match", "text_match"].includes(match.reason))).toBe(true);

    // One weak, accidental overlap is a candidate, not an answer, and its expansions cannot vote.
    const accidental = await service.getDesignContext({ query: "rich text editor toolbar" });
    expect(accidental.coverage).toBe("partial");
    expect(accidental.notices.map((notice) => notice.kind)).toContain("no_opinion");
    expect(accidental.components.length).toBeGreaterThan(0);
    expect(accidental.components.every((item) => item.decision !== undefined)).toBe(true);
    expect(accidental.foundations).toEqual([]);
    expect(accidental.resolvedTokens).toEqual([]);
  });

  it("does not let a weak component match pull in the Foundations it depends on", async () => {
    const context = await service.getDesignContext({ query: "let users pick which columns to show" });
    const weakOnly = context.retrieval.filter((match) => match.entity_type === "component").every((match) => match.strength === "weak");
    expect(weakOnly).toBe(true);
    expect(context.foundations).toEqual([]);
    expect(context.retrieval.filter((match) => match.entity_type === "foundation")).toEqual([]);
  });

  it("does not report task coverage for an unscoped request that matched nothing", async () => {
    const everything = await service.getDesignContext({});
    expect(everything.coverage).toBe("none");
    expect(everything.notices).toEqual([]);
    // Nothing was withheld; there was simply no task to have an opinion about.
    expect(everything.components.length).toBeGreaterThan(0);
    expect(everything.patterns.length).toBeGreaterThan(0);
    expect(everything.retrieval.every((match) => match.reason === "full_context" || match.reason === "relationship_expansion")).toBe(true);
  });

  it("treats an explicit selector as the confident evidence it is", async () => {
    const context = await service.getDesignContext({ componentIds: ["button"] });
    expect(context.coverage).toBe("task_specific");
    expect(context.foundations.length).toBeGreaterThan(0);
  });

  it("names the source a reference came from, so a query can reach it by product", async () => {
    const context = await service.getDesignContext({ query: "make a card grid of documents like Linear docs" });
    expect(ids(context, "references")).toContain("linear-doc-pages");
    expect(context.retrieval).toContainEqual(expect.objectContaining({ entity_type: "reference", entity_id: "linear-doc-pages", reason: "direct_name_match" }));
  });
});
