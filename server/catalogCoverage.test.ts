import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Source, TaxonomyCategory } from "./model.js";

const root = path.resolve(import.meta.dirname, "../monet");

describe("Monet source catalog coverage", () => {
  it("maps every canonical component covered by the audited design systems", async () => {
    const [sources, taxonomy] = await Promise.all([
      readFile(path.join(root, "sources/registry.json"), "utf8").then((value) => JSON.parse(value) as Source[]),
      readFile(path.join(root, "taxonomy/components.json"), "utf8").then((value) => JSON.parse(value) as TaxonomyCategory[]),
    ]);
    const mapped = new Map<string, number>();
    for (const source of sources) for (const mapping of source.mappings) {
      if (source.enabled && mapping.target_type === "component" && (mapping.status === "mapped" || mapping.status === "needs_review") && mapping.canonical_id) mapped.set(mapping.canonical_id, (mapped.get(mapping.canonical_id) ?? 0) + 1);
    }
    const canonicalIds = taxonomy.flatMap((category) => category.entries.map((entry) => entry.id));
    expect(canonicalIds.filter((id) => !mapped.has(id))).toEqual([]);
    expect(mapped.get("icon-button")).toBeGreaterThanOrEqual(8);
    expect(mapped.get("button-group")).toBeGreaterThanOrEqual(8);
    expect(mapped.get("floating-action-button")).toBeGreaterThanOrEqual(3);
    expect(mapped.get("text-input")).toBeGreaterThanOrEqual(8);
    expect(mapped.get("textarea")).toBeGreaterThanOrEqual(8);
  });
});
