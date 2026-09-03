import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import taxonomy from "../../monet/taxonomy/components.json";
import sources from "../../monet/sources/registry.json";
import { RegisteredPreview } from "../components/previewAdapters";

describe("Monet component preview adapters", () => {
  const componentIds = taxonomy.flatMap((category) => category.entries.map((entry) => entry.id));
  const sourceIds = sources.filter((source) => source.enabled).map((source) => source.id);
  const mappedPairs = sources.flatMap((source) => source.enabled ? source.mappings.flatMap((mapping) => mapping.target_type === "component" && (mapping.status === "mapped" || mapping.status === "needs_review") && mapping.canonical_id ? [{ componentId: mapping.canonical_id, sourceId: source.id }] : []) : []);

  it("provides a trusted visual adapter for every canonical component", () => {
    const missing = componentIds.filter((componentId) => renderToStaticMarkup(createElement(RegisteredPreview, { componentId })).includes("Preview not available"));
    expect(missing).toEqual([]);
  });

  it("shows a clear fallback for an unknown component", () => {
    expect(renderToStaticMarkup(createElement(RegisteredPreview, { componentId: "unknown-component" }))).toContain("Preview not available");
  });

  it("resolves every mapped component and source through the two-dimensional registry", () => {
    const missing = mappedPairs.filter(({ componentId, sourceId }) => !renderToStaticMarkup(createElement(RegisteredPreview, { componentId, sourceId })).includes(`data-preview-source="${sourceId}"`));
    expect(missing).toEqual([]);
  });

  it("renders distinct source structures for curated comparison components", () => {
    for (const componentId of ["button", "text-input", "select", "tabs", "dialog", "date-picker", "table"]) {
      const previews = sourceIds.map((sourceId) => renderToStaticMarkup(createElement(RegisteredPreview, { componentId, sourceId })));
      expect(new Set(previews).size, componentId).toBe(sourceIds.length);
    }
  });
});
