import { describe, expect, it } from "vitest";
import type { Reference } from "./model.js";
import { normalizeCollectionAnalysis, normalizeReferenceMetadata } from "./referenceAnalysis.js";

const reference: Reference = {
  id: "calm-chat",
  title: "Calm chat",
  type: "image",
  source_url: "",
  source_domain: "",
  annotation: "The narrow column keeps focus on the conversation.",
  notes: "",
  asset_path: "assets/calm-chat.png",
  asset_media_type: "image/png",
  original_filename: "chat.png",
  preview_url: "",
  ai_tags: [],
  ai: null,
  created_at: "",
  updated_at: "",
};

describe("AI reference analysis", () => {
  it("keeps structured observations retrieval-ready and derives compact tags", () => {
    const result = normalizeReferenceMetadata({
      ui_types: ["Chat interface"], components: ["Message composer"], patterns: ["Conversation thread"], visual_characteristics: ["Restrained chrome"],
      density: "comfortable", hierarchy: "content-first", layout: ["narrow column"], color: ["neutral palette"], typography: ["quiet labels"], mood: ["calm"],
      observations: ["Actions remain secondary."], retrieval_text: "A calm chat interface with a narrow conversation column.", preview_url: "",
    }, "2026-09-02T12:00:00.000Z");
    expect(result.ai.retrieval_text).toContain("narrow conversation");
    expect(result.ai_tags).toEqual(expect.arrayContaining(["chat interface", "message composer", "comfortable", "content-first"]));
    expect(result.ai.analyzed_at).toBe("2026-09-02T12:00:00.000Z");
  });

  it("retains explicit suggestion decisions and removes unknown evidence ids", () => {
    const previous = { summary: "", recurring_preferences: [], analyzed_at: "", suggestions: [{ id: "prefer-narrow-layouts", target_type: "foundation" as const, target_id: "layout", title: "Prefer narrow layouts", proposal: "Add focused content width guidance.", rationale: "Repeated evidence.", evidence_reference_ids: [reference.id], status: "approved" as const }] };
    const result = normalizeCollectionAnalysis({
      summary: "Focused content dominates.",
      recurring_preferences: [{ id: "content-focus", title: "Content focus", observation: "Primary content stays narrow.", evidence_reference_ids: [reference.id, "missing"], confidence: "high" }],
      suggestions: [{ id: "prefer-narrow-layouts", target_type: "foundation", target_id: "layout", title: "Prefer narrow layouts", proposal: "Add focused content width guidance.", rationale: "Repeated evidence.", evidence_reference_ids: [reference.id, "missing"] }],
    }, [reference], previous, "2026-09-02T12:00:00.000Z");
    expect(result.recurring_preferences[0]?.evidence_reference_ids).toEqual([reference.id]);
    expect(result.suggestions[0]?.status).toBe("approved");
    expect(result.suggestions[0]?.evidence_reference_ids).toEqual([reference.id]);
  });
});
