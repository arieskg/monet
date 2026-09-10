import { createHash } from "node:crypto";
import sanitizeHtml from "sanitize-html";
import { parse, parseFragment, serialize, type DefaultTreeAdapterMap } from "parse5";
import * as css from "css-tree";
import sharp from "sharp";
import { surfaceInputSchema, SURFACE_LIMITS, mappingFamily, type SurfaceSnapshot, type SurfaceIssue, type SurfaceDeclaration, type SurfaceBinding } from "../shared/surfaces.js";

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];
export class SurfaceError extends Error { constructor(message: string, public status = 400) { super(message); } }
export const SURFACE_CSP = "default-src 'none'; script-src 'none'; connect-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";
const TAGS = "html head body main section article header footer nav aside div span p h1 h2 h3 h4 h5 h6 a button input textarea select option optgroup label fieldset legend form ul ol li dl dt dd table caption colgroup col thead tbody tfoot tr th td strong b em i u s small sub sup code pre blockquote hr br img figure figcaption details summary time mark progress meter".split(" ");
const ATTRS = "id class title role aria-label aria-labelledby aria-describedby aria-hidden aria-current aria-selected aria-expanded aria-checked aria-disabled aria-pressed aria-valuenow aria-valuemin aria-valuemax aria-valuetext for type placeholder value checked selected disabled readonly multiple rows cols width height alt colspan rowspan scope span start reversed open min max low high optimum dir lang".split(" ");
const FUNCTIONS = new Set(["rgb", "rgba", "hsl", "hsla", "calc", "min", "max", "clamp", "var", "linear-gradient", "radial-gradient", "repeating-linear-gradient", "repeating-radial-gradient", "minmax", "repeat", "fit-content", "inset"]);
const PROPERTIES = new Set(("color background background-color background-image background-size background-position background-repeat border border-top border-right border-bottom border-left border-color border-top-color border-right-color border-bottom-color border-left-color border-width border-style border-radius border-top-left-radius border-top-right-radius border-bottom-left-radius border-bottom-right-radius outline outline-color outline-width outline-style outline-offset box-shadow opacity font font-family font-size font-weight font-style font-variant line-height letter-spacing text-align text-decoration text-decoration-line text-decoration-color text-decoration-style text-transform text-indent text-overflow white-space word-break overflow-wrap vertical-align display visibility box-sizing position top right bottom left inset z-index width height min-width max-width min-height max-height padding padding-top padding-right padding-bottom padding-left padding-inline padding-block padding-inline-start padding-inline-end padding-block-start padding-block-end margin margin-top margin-right margin-bottom margin-left margin-inline margin-block margin-inline-start margin-inline-end margin-block-start margin-block-end gap row-gap column-gap flex flex-grow flex-shrink flex-basis flex-direction flex-wrap order align-items align-self align-content justify-content justify-items justify-self grid-template-columns grid-template-rows grid-column grid-row grid-auto-flow grid-auto-columns grid-auto-rows overflow overflow-x overflow-y object-fit object-position list-style-type list-style-position border-collapse border-spacing table-layout caption-side cursor accent-color caret-color appearance content clip-path").split(" "));
const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: TAGS, allowedAttributes: { "*": [...ATTRS, "style"], img: ["src", "alt", "width", "height", "class", "id", "style"] },
  allowedSchemes: [], allowedSchemesByTag: { img: ["data"] }, allowProtocolRelative: false, parseStyleAttributes: false,
  transformTags: { img: (_tag, attribs) => ({ tagName: "img", attribs: { ...attribs, src: /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(attribs.src ?? "") ? attribs.src! : "" } }) },
};
const forbiddenChars = /[<>\\\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;
export function safeValue(property: string, value: string): boolean {
  if (property.length > 100 || !value || value.length > 500 || forbiddenChars.test(value) || !(/^(--[a-zA-Z0-9_-]+)$/.test(property) || PROPERTIES.has(property))) return false;
  try {
    const ast = css.parse(value, { context: "value" });
    let safe = true, nodes = 0, variables = 0;
    css.walk(ast, (node) => {
      if (++nodes > 100 || node.type === "Raw" || node.type === "Url" || node.type === "Function" && !FUNCTIONS.has(node.name.toLowerCase())) safe = false;
      if (node.type === "Function" && node.name.toLowerCase() === "var" && (++variables > 8 || property.startsWith("--"))) safe = false;
      if (node.type === "Function" && node.name.toLowerCase() === "repeat") {
        const first = node.children.first;
        if (first?.type !== "Number" || !Number.isInteger(Number(first.value)) || Number(first.value) < 1 || Number(first.value) > 64) safe = false;
      }
      if (node.type === "Dimension" && Math.abs(Number(node.value)) > 10000) safe = false;
      if (node.type === "Number" && Math.abs(Number(node.value)) > 10000) safe = false;
    });
    if (!property.startsWith("--") && variables === 0 && !css.lexer.matchProperty(property, ast).matched) safe = false;
    return safe;
  } catch { return false; }
}
function issueCollector(initial: SurfaceIssue[] = []) {
  const issues = [...initial];
  return { issues, add(kind: SurfaceIssue["kind"], location: string, detail: string) {
    const old = issues.find((i) => i.kind === kind && i.detail === detail);
    if (old) { old.count = (old.count ?? 1) + 1; return; }
    if (issues.length < 160) issues.push({ id: `import-${issues.length + 1}`, kind, location: location.slice(0, 150), detail, count: 1 });
    else { const last = issues[159]!; last.count = (last.count ?? 1) + 1; last.detail = "Additional import limitations (report capped at 160 entries)."; }
  } };
}
export function surfaceHash(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function walk(node: Node, fn: (element: Element) => void, depth = 0, budget = { nodes: 0 }): void {
  if (++budget.nodes > SURFACE_LIMITS.nodes || depth > SURFACE_LIMITS.depth) throw new SurfaceError("Snapshot exceeds the 4,000-node or 48-level depth limit.");
  if ("tagName" in node) fn(node);
  if ("childNodes" in node) for (const child of node.childNodes) walk(child, fn, depth + 1, budget);
}
function attr(node: Element, name: string): string { return node.attrs.find((a) => a.name === name)?.value ?? ""; }
function setAttr(node: Element, name: string, value: string): void { node.attrs = node.attrs.filter((a) => a.name !== name); node.attrs.push({ name, value }); }
function removeNode(node: Element): void {
  if (node.parentNode) node.parentNode.childNodes = node.parentNode.childNodes.filter((n) => n !== node);
  node.parentNode = null;
}

/** Accept bytes only. No decoder ever receives a caller-controlled filesystem path or URL. */
async function raster(dataUrl: string, budget: { pixels: number }): Promise<string> {
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match) throw new SurfaceError("Only PNG, JPEG and WebP image bytes are accepted.");
  const bytes = Buffer.from(match[2]!, "base64");
  if (!bytes.length || bytes.length > SURFACE_LIMITS.imageBytes || bytes.toString("base64") !== match[2]) throw new SurfaceError("Images must be valid base64 and no larger than 3 MB.");
  // Reject SVG and other decoder formats before decoding, even if they masquerade as raster MIME.
  const signature = match[1] === "png" ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : match[1] === "jpeg" ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  if (!signature) throw new SurfaceError("Image bytes do not match their raster MIME type.");
  try {
    const image = sharp(bytes, { limitInputPixels: SURFACE_LIMITS.pixels, failOn: "warning", animated: false });
    const metadata = await image.metadata();
    budget.pixels += (metadata.width ?? 0) * (metadata.height ?? 0);
    if (budget.pixels > 48_000_000) throw new Error("Total pixel budget exceeded");
    if (metadata.format !== match[1] || (metadata.pages ?? 1) > 1) throw new Error("Unsupported image");
    const safe = await image.rotate().webp({ quality: 95 }).timeout({ seconds: 3 }).toBuffer();
    if (safe.length > SURFACE_LIMITS.imageBytes) throw new Error("Image too large");
    return `data:image/webp;base64,${safe.toString("base64")}`;
  } catch { throw new SurfaceError("An image could not be decoded safely (3 MB, 12 megapixels, still images only)."); }
}

/** CSS syntax is parsed, never matched with text replacement. Unknown syntax fails closed. */
function transformCss(source: string, inline: boolean, location: string, mode: string, report: ReturnType<typeof issueCollector>, declarations: SurfaceDeclaration[], bindings: Map<string, string>): string {
  if (source.length > SURFACE_LIMITS.css) throw new SurfaceError("Combined CSS exceeds 300 KB.");
  let tree: css.CssNode;
  try { tree = css.parse(source, { context: inline ? "declarationList" : "stylesheet", parseCustomProperty: true }); }
  catch { report.add("unsupported", location, "Malformed CSS removed."); return ""; }
  let syntaxNodes = 0;
  css.walk(tree, () => { if (++syntaxNodes > 24000) throw new SurfaceError("CSS syntax complexity limit exceeded."); });
  function process(container: css.CssNode, context: string, depth = 0): void {
    if (depth > 8) throw new SurfaceError("CSS nesting exceeds eight levels.");
    if (!("children" in container) || !container.children) return;
    const children = container.children;
    children.forEach((node, item) => {
      if (node.type === "Declaration") {
        const property = node.property, value = css.generate(node.value);
        if (!safeValue(property, value)) { report.add("removed", context, `Unsupported or unsafe CSS property/value removed: ${property.slice(0, 80)}.`); children.remove(item); return; }
        if (declarations.length >= SURFACE_LIMITS.declarations) throw new SurfaceError("Snapshot exceeds 2,000 CSS declarations.");
        const id = `d${declarations.length + 1}`;
        declarations.push({ id, location: context.slice(0, 150), property, value, important: Boolean(node.important), mappable: mappingFamily(property) !== null });
        const replacement = bindings.get(id);
        if (replacement !== undefined) {
          if (!safeValue(property, replacement)) throw new SurfaceError("Unsafe resolved token value refused.");
          node.value = css.parse(replacement, { context: "value" }) as css.Value;
        }
      } else if (node.type === "Rule" && !inline && node.prelude.type === "SelectorList") {
        const selector = css.generate(node.prelude);
        let safe = selector.length <= 300 && !forbiddenChars.test(selector), parts = 0;
        css.walk(node.prelude, (part) => {
          if (++parts > 60 || part.type === "Raw" || part.type === "AttributeSelector" || part.type === "PseudoClassSelector" && !["root", "first-child", "last-child", "only-child", "empty", "disabled", "checked"].includes(part.name) || part.type === "PseudoElementSelector" && !["before", "after", "placeholder"].includes(part.name)) safe = false;
        });
        if (!safe) { report.add("unsupported", location, "Complex, attribute, escaped or interactive CSS selector removed."); children.remove(item); return; }
        process(node.block, `${context} ${selector}`, depth + 1);
      } else if (node.type === "Atrule" && node.name === "media" && node.block && node.prelude && !inline) {
        let query = css.generate(node.prelude);
        // Freeze source appearance, preserving width/height rules. No source mode switch in applied preview.
        query = query.replace(/\(prefers-color-scheme:(light|dark)\)/g, (_, captured: string) => captured === mode ? "(min-width:0px)" : "(max-width:0px)");
        if (!/^(?:(?:screen|all|and|not|only)|\s|,|\((?:min-|max-)?(?:width|height):\d{1,4}px\))+$/.test(query)) { report.add("unsupported", location, "Unsupported media query removed; only screen, width, height and captured appearance are supported."); children.remove(item); return; }
        node.prelude = css.parse(query, { context: "atrulePrelude", atrule: "media" }) as css.AtrulePrelude;
        process(node.block, `${context} @media ${query}`, depth + 1);
      } else { report.add("unsupported", context, "Unsupported CSS rule removed (imports, fonts, keyframes, nesting and unknown syntax are not supported)."); children.remove(item); }
    });
  }
  process(tree, location);
  return css.generate(tree);
}

export async function sanitizeSurface(raw: unknown): Promise<SurfaceSnapshot> {
  const input = surfaceInputSchema.parse(raw), report = issueCollector();
  const assets = new Map<string, string>(), decoded = new Map<string, string>();
  const pixelBudget = { pixels: 0 };
  let embeddedBytes = 0;
  async function imageBytes(data: string): Promise<string> {
    if (decoded.has(data)) return decoded.get(data)!;
    if (decoded.size >= 25) throw new SurfaceError("At most 24 unique assets and one screenshot are supported.");
    const result = await raster(data, pixelBudget); decoded.set(data, result); return result;
  }
  let total = 0;
  for (const asset of input.assets) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,200}$/.test(asset.filename) || asset.filename.split("/").some((p) => p === "." || p === "..") || assets.has(asset.filename)) throw new SurfaceError("Asset names must be unique relative names without traversal.");
    total += asset.data_url.length;
    if (total > 10 * 1024 * 1024) throw new SurfaceError("Combined assets exceed 10 MB of encoded data.");
    assets.set(asset.filename, await imageBytes(asset.data_url));
  }
  const document = parse(input.html);
  const sheets: string[] = [];
  // Traverse a copy because filtering is intentionally destructive.
  const elements: Element[] = []; walk(document, (el) => elements.push(el));
  for (const node of elements) {
    let ancestor: Node = node;
    while ("parentNode" in ancestor && ancestor.parentNode) ancestor = ancestor.parentNode;
    if (ancestor !== document) continue; // Discarded subtrees cannot contribute styles or assets.
    if (node.namespaceURI !== "http://www.w3.org/1999/xhtml" || ["script", "iframe", "object", "embed", "template", "noscript", "canvas", "svg", "math", "video", "audio"].includes(node.tagName) || attr(node, "type").toLowerCase() === "hidden" || node.attrs.some((a) => a.name === "hidden")) { report.add("removed", node.tagName, "Active, hidden-input or unsupported embedded content removed."); removeNode(node); continue; }
    if (node.tagName === "style") {
      const contents = node.childNodes.map((n) => "value" in n ? n.value : "").join("");
      if (attr(node, "type") && attr(node, "type").toLowerCase() !== "text/css") report.add("unsupported", "style", "Non-CSS style element removed.");
      else sheets.push(attr(node, "media") ? `@media ${attr(node, "media")} {${contents}}` : contents);
      removeNode(node); continue;
    }
    if (node.tagName === "img") {
      const source = attr(node, "src");
      embeddedBytes += assets.get(source)?.length ?? source.length;
      if (embeddedBytes > 10 * 1024 * 1024) throw new SurfaceError("Embedded images exceed 10 MB across all occurrences.");
      if (assets.has(source)) setAttr(node, "src", assets.get(source)!);
      else if (source.startsWith("data:image/")) setAttr(node, "src", await imageBytes(source));
      else { node.attrs = node.attrs.filter((a) => a.name !== "src"); setAttr(node, "alt", attr(node, "alt") || "Missing captured image"); report.add("missing_asset", "img", "Missing or remote image removed. Supply it as a named local raster asset."); }
    }
    if (node.tagName === "input") {
      const type = attr(node, "type").toLowerCase();
      if (!["", "text", "number", "email", "search", "checkbox", "radio", "range", "button", "submit"].includes(type)) { setAttr(node, "type", "text"); setAttr(node, "value", ""); report.add("removed", "input", "Sensitive or unsupported input type replaced with an empty text field."); }
    }
    node.attrs = node.attrs.filter((a) => {
      if (!["width", "height", "rows", "cols", "colspan", "rowspan"].includes(a.name)) return true;
      const value = Number(a.value);
      if (/^\d{1,4}$/.test(a.value) && value <= 4096) return true;
      report.add("removed", node.tagName, "Unbounded or non-numeric HTML sizing attribute removed."); return false;
    });
    for (const a of node.attrs) if (![...ATTRS, "style", "src"].includes(a.name) || a.name === "src" && node.tagName !== "img") report.add("removed", node.tagName, `HTML attribute removed: ${a.name.slice(0, 60)}.`);
    if (!TAGS.includes(node.tagName)) report.add("unsupported", node.tagName, "Unsupported HTML element removed; supported child content retained.");
  }
  let html = sanitizeHtml(serialize(document), SANITIZE_OPTIONS);
  const clean = parse(html), declarations: SurfaceDeclaration[] = [];
  const cssText = transformCss([...sheets, input.css].join("\n"), false, "stylesheet", input.mode, report, declarations, new Map());
  let index = 0;
  walk(clean, (node) => {
    index++;
    if (attr(node, "style")) setAttr(node, "style", transformCss(attr(node, "style"), true, `element ${index} <${node.tagName}>`, input.mode, report, declarations, new Map()));
  });
  html = serialize(clean);
  report.add("unsupported", "snapshot", "Static snapshot only: scripts, interactions, external fonts and network resources are unavailable; font fallback can change layout.");
  const screenshot = input.screenshot ? { filename: "capture.webp", data_url: await imageBytes(input.screenshot.data_url) } : undefined;
  const safeInput = { ...input, html, css: cssText, assets: [], screenshot };
  const snapshot: SurfaceSnapshot = { version: 1, hash: surfaceHash(safeInput), input: safeInput, issues: report.issues };
  if (JSON.stringify(snapshot).length > 12 * 1024 * 1024) throw new SurfaceError("Sanitized snapshot exceeds 12 MB.");
  return snapshot;
}

/** Reparse the immutable safe source for each projection; bindings cannot change selectors or structure. */
export function renderSurface(snapshot: SurfaceSnapshot, bindings: SurfaceBinding[] = []): { document: string; declarations: SurfaceDeclaration[] } {
  const report = issueCollector(), declarations: SurfaceDeclaration[] = [], values = new Map(bindings.map((b) => [b.declaration_id, b.value]));
  const style = transformCss(snapshot.input.css, false, "stylesheet", snapshot.input.mode, report, declarations, values);
  // Saved bytes are data too: apply the HTML allowlist again before rendering, even on history reads.
  const document = parse(sanitizeHtml(snapshot.input.html, SANITIZE_OPTIONS));
  let index = 0;
  walk(document, (node) => { index++; if (attr(node, "style")) setAttr(node, "style", transformCss(attr(node, "style"), true, `element ${index} <${node.tagName}>`, snapshot.input.mode, report, declarations, values)); });
  // The sanitized head can contain no active content. CSP is always the first element in the final document.
  let head: Element | undefined;
  walk(document, (node) => { if (node.tagName === "head") head = node; });
  if (!head) throw new SurfaceError("Snapshot has no document head.");
  const trusted = parseFragment(`<meta http-equiv="Content-Security-Policy" content="${SURFACE_CSP}"><meta charset="utf-8"><style>${style}</style>`).childNodes;
  for (const node of trusted) node.parentNode = head;
  head.childNodes.unshift(...trusted);
  return { document: serialize(document), declarations };
}
