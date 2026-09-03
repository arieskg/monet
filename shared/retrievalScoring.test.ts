import { describe, expect, it } from "vitest";
import { QUERY_SYNONYMS, expandQuery, retrievalTokens, scoreRetrieval, stem } from "./retrieval.js";

function score(query: string, fields: Parameters<typeof scoreRetrieval>[1]): number {
  return scoreRetrieval(query, fields)?.score ?? 0;
}

describe("Monet retrieval normalization", () => {
  it("folds the forms of one word onto a single stem", () => {
    const pairs: [string, string][] = [["delete", "deleting"], ["delete", "deleted"], ["edit", "editing"], ["doc", "docs"], ["action", "actions"], ["table", "tables"], ["filter", "filtering"]];
    for (const [a, b] of pairs) {
      expect(stem(a), `${a} vs ${b}`).toBe(stem(b));
    }
  });

  it("leaves words that only look like plurals alone", () => {
    for (const word of ["status", "access", "css", "this", "focus"]) expect(stem(word)).not.toBe(word.slice(0, -1));
  });

  it("drops task framing so only design words remain", () => {
    expect(retrievalTokens("please build me a new login form")).toEqual(["login", "form"]);
    expect(retrievalTokens("what should I use to show that a save failed")).toEqual(["show", "save", "fail"]);
  });

  it("expands task vocabulary into the words Monet's records use", () => {
    expect([...expandQuery("show a modal").expanded]).toEqual(expect.arrayContaining(["dialog", "overlay"]));
    expect([...expandQuery("sign in screen").expanded]).toEqual(expect.arrayContaining(["login", "authentication", "password"]));
    expect([...expandQuery("remove the record").expanded]).toEqual(expect.arrayContaining(["delet", "destructiv"]));
  });

  it("only fires a phrase synonym on the whole phrase", () => {
    expect([...expandQuery("build a command palette").expanded]).not.toContain("color");
    expect([...expandQuery("pick a color palette").expanded]).toEqual(expect.arrayContaining(["token"]));
  });

  it("keeps the synonym table free of self-referential entries", () => {
    for (const [trigger, additions] of Object.entries(QUERY_SYNONYMS)) {
      expect(additions, trigger).not.toContain(trigger);
      expect(new Set(additions).size, trigger).toBe(additions.length);
    }
  });
});

describe("Monet retrieval scoring", () => {
  it("does not penalize a record for the length of the sentence around the match", () => {
    const fields = { name: "Alert Dialog", summaryText: ["Confirming deletion that cannot be undone"] };
    const short = score("alert dialog", fields);
    const long = score("I want an alert dialog before someone deletes a project from the workspace list", fields);
    expect(short).toBeGreaterThanOrEqual(85);
    expect(long).toBe(short);
  });

  it("measures a match against the field it landed in, not against the query", () => {
    const focused = { name: "Toast", summaryText: ["Confirming a completed action"] };
    const diluted = { name: "Toast", summaryText: ["Confirming a completed action that did not otherwise change any part of the visible interface for the person who performed it"] };
    expect(score("confirming a completed action", focused)).toBeGreaterThan(score("confirming a completed action", diluted));
  });

  it("ranks a canonical name above a broad classification label", () => {
    const named = score("empty state", { name: "Empty State", categories: ["feedback"] });
    const categorized = score("form utility", { name: "Rating", categories: ["form-utility"] });
    expect(named).toBeGreaterThan(85);
    expect(categorized).toBeLessThan(58);
  });

  it("never lets a category alone carry a record over the retrieval floor", () => {
    for (const category of ["form-utility", "data-display", "overlays", "feedback"]) {
      expect(score(category.replace("-", " "), { name: "Unrelated Thing", categories: [category] })).toBeLessThan(58);
    }
  });

  it("treats one common word in an alias as a hint and one in a name as identity", () => {
    // "actions" must not resolve to Button through its `action` alias...
    expect(score("bulk actions on a table", { name: "Button", aliases: ["action", "cta"] })).toBeLessThan(58);
    // ...while a Foundation genuinely called Layout is what "the layout" is asking for.
    expect(score("review the layout", { name: "Layout" })).toBeGreaterThanOrEqual(58);
  });

  it("recognises a name from the word that makes it distinctive", () => {
    expect(score("password", { name: "Password Input" })).toBeGreaterThanOrEqual(85);
    expect(score("search", { name: "Search Input" })).toBeGreaterThanOrEqual(85);
    // "input" alone is shape, not identity, so it cannot single out one of the input controls.
    expect(score("input", { name: "Password Input" })).toBeLessThan(85);
  });

  it("adds corroboration in proportion to the evidence it corroborates", () => {
    // A demoted primary signal earns proportionally less help, so incidental prose cannot revive it.
    const demoted = { name: "Data Table", aliases: ["grid", "datagrid"], detailText: ["A grid of rows", "Grid density stays uniform", "Grid columns align by type"] };
    expect(score("card grid of documents", demoted)).toBeLessThan(58);
    // The same corroboration on a signal that earned it lifts the record instead.
    const earned = { name: "Data Table", aliases: ["sortable table"], summaryText: ["A collection users sort, filter, select from, and act on"] };
    expect(score("sortable table users can select from", earned)).toBeGreaterThanOrEqual(85);
  });

  it("scores every authored value on its own rather than as one blob", () => {
    const separate = { name: "Reference", summaryText: ["Quiet submit action", "A long unrelated sentence about something else entirely that shares no words"] };
    expect(score("quiet submit action", separate)).toBeGreaterThanOrEqual(58);
  });

  it("lets a one-word query satisfy a match it could not supply two terms for", () => {
    const fields = { name: "Linear Doc Pages", tags: ["documentation portal", "help center"], summaryText: ["documentation portal"] };
    expect(score("documentation", fields)).toBeGreaterThanOrEqual(58);
    // A second term is still worth more than one, so short queries gain no unfair advantage.
    expect(score("documentation portal", fields)).toBeGreaterThan(score("documentation", fields));
  });

  it("requires an alias to be matched as a unit before it claims identity", () => {
    // Monet's aliases are mostly `<word>-<shape>` compounds, so half of one is not a hit.
    for (const [query, alias] of [["location pins", "pin-input"], ["attach a file", "file-input"], ["a date range", "range-input"], ["night mode toggle", "toggle-group"], ["a product catalog", "product layout"]] as [string, string][]) {
      expect(score(query, { name: "Unrelated Record", aliases: [alias] }), `${query} → ${alias}`).toBeLessThan(58);
    }
    // A fully matched alias, or one contained in the query as a phrase, still identifies outright.
    expect(score("a pin input for the code", { name: "Unrelated Record", aliases: ["pin-input"] })).toBeGreaterThanOrEqual(85);
    expect(score("confirmation dialog", { name: "Unrelated Record", aliases: ["confirmation dialog"] })).toBeGreaterThanOrEqual(85);
  });

  it("treats one distinctive word out of a name's several as evidence, not identity", () => {
    // "Password Input" is identified by "password" because "input" is shape. "File Upload" is two
    // distinctive words, so "file" alone names part of the concept and has to be corroborated —
    // otherwise right-clicking a file resolves to the control for uploading one.
    expect(score("context menu on right click of a file", { name: "File Upload" })).toBeLessThan(62);
    // The whole name, however it is reached, still identifies outright.
    expect(score("drag and drop a file to attach it", { name: "File Upload" })).toBeGreaterThanOrEqual(62);
    expect(score("date range picker", { name: "Date Range Picker" })).toBeGreaterThanOrEqual(85);
  });

  it("still recognises a canonical name from its distinctive half", () => {
    // The asymmetry is deliberate: a name is the record's own word for itself, an alias is a pointer.
    expect(score("password", { name: "Password Input" })).toBeGreaterThanOrEqual(85);
    expect(score("password", { name: "Unrelated Record", aliases: ["password-input"] })).toBeLessThan(85);
  });

  it("scores the same evidence the same however many unrelated words surround it", () => {
    const fields = { name: "Linear Doc Pages", tags: ["documentation portal", "help center"], summaryText: ["documentation portal"] };
    const alone = score("documentation", fields);
    expect(score("documentation for the team", fields)).toBe(alone);
    expect(score("i need documentation somewhere in the product", fields)).toBe(alone);
  });

  it("returns nothing for a query with no design words at all", () => {
    expect(scoreRetrieval("please help me with this", { name: "Button" })).toBeNull();
  });
});
