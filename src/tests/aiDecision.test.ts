import { describe, expect, it } from "vitest";
import { buildDecisionClipboardText, buildDecisionInstructions, buildDecisionJson, buildDecisionPrompt, restoreProtectedDecisionFields, validateDecisionJson } from "../aiDecision";

const source = {
  id: "react-aria",
  name: "React Aria",
  type: "reference",
  homepage: "https://react-spectrum.adobe.com/react-aria/",
  repository: "https://github.com/adobe/react-spectrum",
  framework: "React",
  package: "react-aria-components",
  license: "Apache-2.0",
  notes: "Accessibility behavior reference.",
  enabled: true,
  mappings: [{ upstream: "Button", target_type: "component", canonical_id: "button", status: "mapped" }],
  updated_at: "2026-09-01T12:00:00.000Z",
};

const component = {
  id: "button", status: "selected", selection: { source: "material-ui", source_component: "Button" }, preferences: {}, behavior: {}, rationale: "", notes: "", use_when: [], avoid_when: [], foundations: [], primitives: [], candidates: [{ source: "material-ui", source_component: "Button", description: "Reference", preview: "adapter" }], history: [{ date: "2026-09-01T12:00:00.000Z", change: "Selected inspiration", old_selection: null, new_selection: "material-ui", rationale: "Reference" }], updated_at: "",
};

describe("AI decision handoff", () => {
  it("copies the data shape and current record into the prompt", () => {
    const prompt = buildDecisionPrompt("Source", source, "Choose what to borrow from its accessibility model.");
    expect(prompt).toContain('"id": "string (preserve)"');
    expect(prompt).toContain('"id": "react-aria"');
    expect(prompt).toContain("Choose what to borrow from its accessibility model.");
    expect(prompt).toContain("Return exactly one valid JSON object");
  });

  it("accepts a complete record with the preserved id", () => {
    expect(validateDecisionJson("Source", source, source.id)).toBeNull();
  });

  it("limits component prompts and imports to use or no use", () => {
    expect(buildDecisionPrompt("Component", component)).toContain("selected (Use) | do_not_use (No use)");
    expect(validateDecisionJson("Component", component, component.id)).toBeNull();
    expect(validateDecisionJson("Component", { ...component, status: "needs_review" }, component.id)).toContain("data shape");
  });

  it("includes the selected inspiration but keeps candidate and history data out of the AI JSON", () => {
    const json: unknown = JSON.parse(buildDecisionJson("Component", component));
    expect(json).toHaveProperty("selection.source", "material-ui");
    expect(json).not.toHaveProperty("candidates");
    expect(json).not.toHaveProperty("history");
    expect(buildDecisionPrompt("Component", component)).toContain("material-ui");
    expect(buildDecisionPrompt("Component", component)).toContain("Do not invent detailed rules");
  });

  it("combines customized instructions and JSON for the clipboard", () => {
    const instructions = `${buildDecisionInstructions("Component")}\n\nPrioritize keyboard behavior.`;
    const copied = buildDecisionClipboardText(instructions, buildDecisionJson("Component", component));
    expect(copied).toContain("Prioritize keyboard behavior.");
    expect(copied).toContain("Current record:");
    expect(copied).toContain('"id": "button"');
  });

  it("restores protected component inspiration fields when importing AI JSON", () => {
    const aiJson: unknown = JSON.parse(buildDecisionJson("Component", component));
    const restored = restoreProtectedDecisionFields("Component", aiJson, component) as typeof component;
    expect(restored.selection).toEqual(component.selection);
    expect(restored.candidates).toEqual(component.candidates);
    expect(restored.history).toEqual(component.history);
    expect(validateDecisionJson("Component", restored, component.id)).toBeNull();
  });

  it("preserves omitted Advanced component fields", () => {
    const current = { ...component, rationale: "Keep this rationale.", use_when: ["Only when necessary"] };
    const aiJson: unknown = JSON.parse(buildDecisionJson("Component", current));
    const lightweight = { ...(aiJson as Record<string, unknown>) };
    delete lightweight.rationale;
    delete lightweight.use_when;
    const restored = restoreProtectedDecisionFields("Component", lightweight, current) as typeof current;
    expect(restored.rationale).toBe("Keep this rationale.");
    expect(restored.use_when).toEqual(["Only when necessary"]);
  });

  it("rejects incomplete records and changed ids", () => {
    expect(validateDecisionJson("Source", { id: source.id }, source.id)).toContain("data shape");
    expect(validateDecisionJson("Source", { ...source, id: "other" }, source.id)).toContain("must remain");
  });
});
