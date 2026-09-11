import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, it } from "vitest";
import { PresetCatalog } from "./presetCatalog.js";
import { resolveThemeTokens } from "../shared/tokens.js";
import type { PresetDetail } from "../shared/presets.js";

const catalog = new PresetCatalog();
const token = (p: PresetDetail, name: string) => p.records.foundations.flatMap((f) => f.tokens).find((t) => t.name === name)!;
const provenance = (p: PresetDetail, record: string) => p.manifest.provenance.find((v) => v.record === record)!;
async function evidence(p: PresetDetail, suffix: string) {
  const source = p.manifest.sources.find((s) => s.url.endsWith(suffix))!;
  expect(source, suffix).toBeDefined();
  return { id: source.id, text: await readFile(path.resolve(import.meta.dirname, "../presets/evidence", p.selection.id, source.id + ".txt"), "utf8") };
}
it("distinguishes the Radix tint from upstream surface values and grounds Card variants in the actual prop definition", async () => {
  const p = await catalog.detail("radix-product");
  expect(token(p, "color.radix.accent-surface")).toBeUndefined();
  const tint = token(p, "color.monet.accent-tint");
  expect(tint.value).toBe("{color.violet.3}");
  const surface = await evidence(p, "/tokens/colors/violet.css");
  expect(surface.text).toContain("--violet-surface: #f9f6ffcc"); expect(surface.text).toContain("--violet-surface: #25193980");
  expect(provenance(p, "token:" + tint.name).sources).toContain(surface.id);
  for (const mode of p.supported_modes) {
    const resolved = resolveThemeTokens(p.records.foundations, null, mode).tokens;
    const value = resolved.find((t) => t.name === tint.name)!.resolved_value;
    expect(value).toBe(resolved.find((t) => t.name === "color.violet.3")!.resolved_value);
    expect(["#f9f6ffcc", "#25193980"]).not.toContain(value);
  }
  const card = await evidence(p, "/card.props.tsx");
  expect(card.text).toContain("const variants = ['surface', 'classic', 'ghost']");
  expect(provenance(p, "component:card").sources).toContain(card.id);
  expect(p.records.components.find((c) => c.id === "table")!.notes).not.toMatch(/numeric cell alignment are documented/);
  expect(provenance(p, "pattern:structured-summary").kind).toBe("monet-authored");
});
it("maps the Carbon card radius to the documented card token and identifies the selected input branch", async () => {
  const p = await catalog.detail("carbon-product"), layout = await evidence(p, "/dtcg/layout.json");
  const value = JSON.parse(layout.text)["border-radius"]["border-radius-04"];
  expect(value.$description).toContain("cards");
  expect(token(p, "radius.card").value).toBe(`${value.$value}px`);
  expect(provenance(p, "token:radius.card").sources).toContain(layout.id);
  const input = await evidence(p, "/text-input/_text-input.scss");
  expect(input.text).toContain("@if enabled('enable-v12-release')"); expect(input.text).toContain("border-radius: $border-radius-04");
  expect(p.records.components.find((c) => c.id === "text-input")!.notes).toContain("enable-v12-release disabled");
  expect(JSON.stringify(p.records.components.find((c) => c.id === "dialog"))).not.toMatch(/nest/i);
  expect(p.records.patterns.find((v) => v.id === "transactional-dialog")!.body).not.toMatch(/nest/i);
});
it("grounds USWDS normal weight, unit conversions and shadow in source definitions and preserves placeholder guidance", async () => {
  const p = await catalog.detail("uswds-public-service");
  const settings = await evidence(p, "/settings/_settings-typography.scss");
  const normal = Number(/\$theme-font-weight-normal:\s*(\d+)/.exec(settings.text)![1]);
  expect(token(p, "font.weight.regular").value).toBe(normal);
  expect(token(p, "font.weight.regular").description).toContain("$theme-font-weight-normal: 400");
  expect(settings.text).toContain("$theme-type-scale-md: 6");
  expect(token(p, "font.size.md").description).toContain("not USWDS $theme-type-scale-md");
  const grid = await evidence(p, "/tokens/units/grid-base.scss"), units = await evidence(p, "/tokens/units/spacing.scss");
  const base = Number(/:\s*(\d+)px/.exec(grid.text)![1]);
  const multiples = new Map([...units.text.matchAll(/(?:"([\d]+)"|(\d+)):\s*spacing-multiple\(([\d.]+)\)/g)].map((m) => [m[1] ?? m[2], Number(m[3])]));
  for (const t of p.records.foundations.find((f) => f.id === "spacing")!.tokens) {
    expect(t.value).toBe(`${multiples.get(t.name.slice("space.".length))! * base}px`);
    expect(provenance(p, "token:" + t.name).sources).toContain(grid.id);
  }
  const properties = await evidence(p, "/styles/_properties.scss");
  expect(properties.text).toContain("1: 0 units(1px) units(0.5) 0 rgba(0, 0, 0, 0.1)");
  expect(token(p, "shadow.1").value).toBe(`0 1px ${base * 0.5 / 16}rem 0 rgba(0, 0, 0, 0.1)`);
  expect(provenance(p, "token:shadow.1").sources).toContain(properties.id);
  const input = await evidence(p, "/text-input/guidance/usability.md");
  expect(input.text).toContain("**Avoid placeholder text.**");
  expect(p.records.components.find((c) => c.id === "text-input")!.notes).toContain("Avoid placeholder text, including when a separate label exists");
  expect(p.records.components.find((c) => c.id === "table")!.avoid_when).toEqual(["Row sorting with merged cells", "Row sorting with mobile stacked variants"]);
  expect(token(p, "color.border").description).toContain("editorial role choice");
});
it("keeps the fact/adaptation labels in all token descriptions consistent with their provenance", async () => {
  for (const item of await catalog.list()) {
    const p = await catalog.detail(item.selection.id);
    for (const f of p.records.foundations) for (const t of f.tokens) {
      const kind = provenance(p, "token:" + t.name).kind;
      expect(t.description.toLowerCase()).toMatch(new RegExp('^' + kind.replaceAll('-', ' ') + ':'));
    }
  }
});
