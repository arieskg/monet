/**
 * Runs inside the isolated capture browser, in the page being captured. It turns the live
 * rendered document into the same static input the manual Surface import accepts: HTML, CSS
 * text, and named raster assets. Its output is untrusted by construction (the project's own
 * scripts run in that page and could tamper with DOM APIs), so the server validates its shape
 * and runs the full Surface sanitizer over it, exactly as for a pasted capture.
 *
 * Two serializations share one pruned clone: "stylesheet" keeps authored CSS (custom properties
 * stay mappable), "computed" inlines a curated set of computed declarations per element so
 * framework/utility CSS that the sanitizer cannot keep still renders faithfully.
 */
export const CAPTURE_SCRIPT = String.raw`async (options) => {
  var limits = options.limits, warnings = [], doc = document, root = doc.documentElement;
  var wantComputed = options.strategy !== "stylesheet";
  var REMOVE = { script: 1, noscript: 1, template: 1, iframe: 1, object: 1, embed: 1, link: 1, base: 1, meta: 1, style: 1, slot: 1, dialog: 0 };
  var PLACEHOLDER = { svg: 1, canvas: 1, video: 1, audio: 1, math: 1 };
  var ATTRS = ("id class style title role aria-label aria-labelledby aria-describedby aria-hidden aria-current aria-selected aria-expanded aria-checked aria-disabled aria-pressed aria-valuenow aria-valuemin aria-valuemax aria-valuetext for type placeholder value checked selected disabled readonly multiple rows cols width height alt colspan rowspan scope span start reversed open min max low high optimum dir lang").split(" ");
  var ALLOWED = {}; for (var a = 0; a < ATTRS.length; a++) ALLOWED[ATTRS[a]] = 1;
  var BLOCK = {}; "html body div p h1 h2 h3 h4 h5 h6 section article header footer nav aside main ul ol form fieldset figure figcaption details summary pre blockquote hr dl dt dd legend address".split(" ").forEach(function (t) { BLOCK[t] = 1; });
  var TABLE = { table: "table", thead: "table-header-group", tbody: "table-row-group", tfoot: "table-footer-group", tr: "table-row", td: "table-cell", th: "table-cell", caption: "table-caption", colgroup: "table-column-group", col: "table-column", li: "list-item" };
  var INHERITED = ["color", "font-family", "font-size", "font-weight", "font-style", "line-height", "letter-spacing", "text-align", "text-transform", "white-space", "list-style-type", "text-indent", "word-break", "overflow-wrap", "visibility", "border-collapse", "border-spacing"];
  var liveAll = [root].concat(Array.prototype.slice.call(root.querySelectorAll("*")));
  if (liveAll.length > limits.elements) return { oversize: "This screen has " + liveAll.length + " elements; Surfaces supports about " + limits.elements + ". Capture a simpler state or a narrower screen.", warnings: warnings };
  for (var i = 0; i < liveAll.length; i++) liveAll[i].setAttribute("data-monet-capture", String(i));
  var styles = new Map(), hidden = new Set(), body = doc.body;
  for (var j = 0; j < liveAll.length; j++) {
    var el = liveAll[j];
    var cs = getComputedStyle(el); styles.set(el, cs);
    if (body && body.contains(el) && el !== body && cs.display === "none") hidden.add(el);
  }
  var clone = root.cloneNode(true);
  var cloneAll = [clone].concat(Array.prototype.slice.call(clone.querySelectorAll("[data-monet-capture]")));
  var assets = new Map(), assetOrder = [], assetBytes = 0, pseudo = 0, shadow = 0, unsupportedColors = 0, pairs = new Map();
  function isContainer(display, ws) { return /block|flex|grid|table|list-item|flow-root/.test(display) && !/^inline$/.test(display) && !/^pre/.test(ws); }
  for (var k = 0; k < cloneAll.length; k++) {
    var c = cloneAll[k]; var index = Number(c.getAttribute("data-monet-capture")); c.removeAttribute("data-monet-capture");
    var live = liveAll[index]; if (!live || !clone.contains(c)) continue;
    var tag = c.localName, lcs = styles.get(live);
    pairs.set(c, live);
    if (REMOVE[tag] || hidden.has(live)) { c.remove(); continue; }
    if (live.shadowRoot) shadow++;
    if (PLACEHOLDER[tag]) {
      var rect = live.getBoundingClientRect(); var span = doc.createElement("span");
      span.setAttribute("style", "display:inline-block;width:" + Math.round(rect.width) + "px;height:" + Math.round(rect.height) + "px;vertical-align:middle;background-color:" + (lcs && lcs.backgroundColor !== "rgba(0, 0, 0, 0)" ? lcs.backgroundColor : "rgba(127, 127, 127, 0.15)"));
      span.setAttribute("role", "img"); span.setAttribute("aria-label", live.getAttribute("aria-label") || tag + " placeholder");
      c.replaceWith(span); continue;
    }
    var attrs = Array.prototype.slice.call(c.attributes);
    for (var m = 0; m < attrs.length; m++) { var name = attrs[m].name.toLowerCase(); if (!ALLOWED[name] && !(name === "src" && tag === "img")) c.removeAttribute(attrs[m].name); }
    if (tag === "img") {
      var src = live.currentSrc || live.src || "";
      c.removeAttribute("srcset"); c.removeAttribute("sizes");
      if (src && !assets.has(src)) {
        if (assets.size >= limits.assets) { warnings.push("More than " + limits.assets + " images; later images were left out."); assets.set(src, null); }
        else { assets.set(src, { filename: "asset-" + (assets.size + 1), data_url: "" }); assetOrder.push(src); }
      }
      var entry = src ? assets.get(src) : null;
      if (entry) c.setAttribute("src", entry.filename); else c.removeAttribute("src");
      var irect = live.getBoundingClientRect();
      if (irect.width && irect.height) { c.setAttribute("width", String(Math.round(irect.width))); c.setAttribute("height", String(Math.round(irect.height))); }
    }
    if (tag === "input") {
      var type = (live.getAttribute("type") || "text").toLowerCase();
      if (type === "password" || type === "hidden" || type === "file") { c.remove(); continue; }
      if (type === "checkbox" || type === "radio") { if (live.checked) c.setAttribute("checked", ""); else c.removeAttribute("checked"); }
      else if (type !== "button" && type !== "submit" && type !== "range") c.setAttribute("value", String(live.value || ""));
    }
    if (tag === "textarea") c.textContent = String(live.value || "");
    if (tag === "select") { var opts = c.querySelectorAll("option"); for (var o = 0; o < opts.length && o < live.options.length; o++) { if (live.options[o].selected) opts[o].setAttribute("selected", ""); else opts[o].removeAttribute("selected"); } }
    if (lcs && isContainer(lcs.display, lcs.whiteSpace)) { var kids = Array.prototype.slice.call(c.childNodes); for (var n = 0; n < kids.length; n++) if (kids[n].nodeType === 3 && !/\S/.test(kids[n].nodeValue) || kids[n].nodeType === 8) kids[n].remove(); }
    if (lcs && wantComputed) { try { if (getComputedStyle(live, "::before").content !== "none" || getComputedStyle(live, "::after").content !== "none") pseudo++; } catch (e) {} }
  }
  var stylesheetHtml = "<!DOCTYPE html>" + clone.outerHTML;
  var css = "", styleRules = 0, cssTruncated = false, skippedRules = 0;
  function emit(list, depth) {
    if (!list || depth > 8) return;
    for (var r = 0; r < list.length; r++) {
      var rule = list[r]; if (css.length > limits.css) { cssTruncated = true; return; }
      var ctor = rule.constructor && rule.constructor.name;
      if (rule.type === 1) { styleRules++; css += rule.cssText + "\n"; }
      else if (rule.type === 3) { try { if (rule.styleSheet) emit(rule.styleSheet.cssRules, depth + 1); } catch (e) { warnings.push("An imported stylesheet was not readable and was skipped."); } }
      else if (rule.type === 4) { var media = rule.media.mediaText; if (/print/.test(media) && !/screen|all/.test(media)) continue; css += "@media " + media + "{\n"; emit(rule.cssRules, depth + 1); css += "}\n"; }
      else if (rule.type === 12) { try { if (CSS.supports(rule.conditionText)) emit(rule.cssRules, depth + 1); } catch (e) {} }
      else if (ctor === "CSSLayerBlockRule") emit(rule.cssRules, depth + 1);
      else skippedRules++;
    }
  }
  var sheets = [];
  try { sheets = Array.prototype.slice.call(doc.styleSheets).concat(doc.adoptedStyleSheets ? Array.prototype.slice.call(doc.adoptedStyleSheets) : []); } catch (e) { warnings.push("The page's stylesheets were not readable; authored CSS was not captured."); }
  for (var s = 0; s < sheets.length; s++) {
    var sheet = sheets[s]; if (sheet.disabled) continue;
    if (sheet.media && /^print$/i.test(sheet.media.mediaText || "")) continue;
    try { emit(sheet.cssRules, 0); } catch (e) { warnings.push("A stylesheet was not readable (cross-origin or blocked) and was skipped: " + (sheet.href ? String(sheet.href).slice(0, 120) : "inline")); }
  }
  if (cssTruncated) warnings.push("Stylesheets exceed the " + Math.round(limits.css / 1000) + " KB CSS limit; later rules were left out.");
  if (skippedRules) warnings.push(skippedRules + " font, keyframe, container, page or property rules are outside the static Surface boundary and were skipped.");
  var computedHtml = "";
  if (wantComputed) {
    function skipValue(v) { return !v || v === "none" || v === "normal" || v === "auto" || v === "0px" || v === "rgba(0, 0, 0, 0)" || v.indexOf("url(") >= 0; }
    function color(v) { if (/^rgba?\(/.test(v)) return v; unsupportedColors++; return ""; }
    var mapClone = pairs;
    if (mapClone.size) {
      mapClone.forEach(function (lel, cel) {
        if (!clone.contains(cel) || PLACEHOLDER[lel.localName] || cel.localName === "head" || cel.closest("head")) return;
        var c1 = styles.get(lel); if (!c1) return;
        var parent = lel.parentElement, pcs = parent ? styles.get(parent) : null, tag1 = cel.localName, decl = [];
        function put(prop, value) { if (!skipValue(value)) decl.push(prop + ":" + value); }
        for (var h = 0; h < INHERITED.length; h++) { var prop = INHERITED[h], val = c1.getPropertyValue(prop); if (!pcs || pcs.getPropertyValue(prop) !== val || tag1 === "body") { if (prop === "color") val = color(val); if (prop === "font-family" && val.length > 200) val = val.slice(0, 200); put(prop, val); } }
        put("background-color", color(c1.backgroundColor));
        var bg = c1.backgroundImage; if (/^(linear|radial|repeating-linear|repeating-radial)-gradient\(/.test(bg) && bg.indexOf("url(") < 0) put("background-image", bg);
        if (c1.opacity !== "1") put("opacity", c1.opacity);
        if (c1.boxShadow !== "none" && c1.boxShadow.indexOf("url(") < 0) put("box-shadow", c1.boxShadow);
        put("border-radius", c1.borderRadius);
        ["top", "right", "bottom", "left"].forEach(function (side) {
          var style = c1.getPropertyValue("border-" + side + "-style"), width = c1.getPropertyValue("border-" + side + "-width");
          if (style !== "none" && width !== "0px") { var bc = color(c1.getPropertyValue("border-" + side + "-color")); if (bc) put("border-" + side, width + " " + style + " " + bc); }
          put("padding-" + side, c1.getPropertyValue("padding-" + side)); put("margin-" + side, c1.getPropertyValue("margin-" + side));
        });
        var display = c1.display;
        var defaultDisplay = TABLE[tag1] || (BLOCK[tag1] ? "block" : (tag1 === "button" || tag1 === "input" || tag1 === "select" || tag1 === "textarea" || tag1 === "img" || tag1 === "meter" || tag1 === "progress") ? "inline-block" : "inline");
        if (display !== defaultDisplay) put("display", display);
        if (/flex|grid/.test(display)) {
          if (c1.flexDirection !== "row") put("flex-direction", c1.flexDirection); if (c1.flexWrap !== "nowrap") put("flex-wrap", c1.flexWrap);
          if (c1.alignItems !== "normal" && c1.alignItems !== "stretch") put("align-items", c1.alignItems);
          if (c1.justifyContent !== "normal" && c1.justifyContent !== "flex-start") put("justify-content", c1.justifyContent);
          if (c1.alignContent !== "normal") put("align-content", c1.alignContent); if (c1.justifyItems !== "normal" && c1.justifyItems !== "legacy") put("justify-items", c1.justifyItems);
          put("row-gap", c1.rowGap); put("column-gap", c1.columnGap);
          if (/grid/.test(display)) { put("grid-template-columns", c1.gridTemplateColumns); put("grid-template-rows", c1.gridTemplateRows); if (c1.gridAutoFlow !== "row") put("grid-auto-flow", c1.gridAutoFlow); put("grid-auto-columns", c1.gridAutoColumns === "auto" ? "" : c1.gridAutoColumns); put("grid-auto-rows", c1.gridAutoRows === "auto" ? "" : c1.gridAutoRows); }
        }
        var item = pcs && /flex|grid/.test(pcs.display);
        if (item) {
          if (c1.flexGrow !== "0") put("flex-grow", c1.flexGrow); if (c1.flexShrink !== "1") put("flex-shrink", c1.flexShrink); if (c1.flexBasis !== "auto") put("flex-basis", c1.flexBasis);
          if (c1.alignSelf !== "auto") put("align-self", c1.alignSelf); if (c1.order !== "0") put("order", c1.order);
          if (c1.gridColumn && c1.gridColumn !== "auto" && c1.gridColumn !== "auto / auto") put("grid-column", c1.gridColumn); if (c1.gridRow && c1.gridRow !== "auto" && c1.gridRow !== "auto / auto") put("grid-row", c1.gridRow);
        }
        if (c1.position !== "static") { put("position", c1.position); ["top", "right", "bottom", "left"].forEach(function (side) { put(side, c1.getPropertyValue(side)); }); if (c1.zIndex !== "auto") put("z-index", c1.zIndex); }
        var contentBox = parent ? parseFloat(pcs.width) - parseFloat(pcs.paddingLeft) - parseFloat(pcs.paddingRight) : 0;
        var sized = item || display === "inline-block" || display === "inline-flex" || display === "inline-grid" || c1.position === "absolute" || c1.position === "fixed" || tag1 === "img" || /table/.test(display);
        if (sized || (parent && display === "block" && Math.abs(parseFloat(c1.width) - contentBox) > 1)) put("width", c1.width);
        if (c1.maxWidth !== "none") put("max-width", c1.maxWidth); if (c1.minWidth !== "0px" && c1.minWidth !== "auto") put("min-width", c1.minWidth);
        if (c1.minHeight !== "0px" && c1.minHeight !== "auto") put("min-height", c1.minHeight); if (c1.maxHeight !== "none") put("max-height", c1.maxHeight);
        var scrolls = c1.overflowY !== "visible" || c1.overflowX !== "visible";
        if (scrolls) { put("overflow-x", c1.overflowX); put("overflow-y", c1.overflowY); if (lel !== body && tag1 !== "html") put("height", c1.height); }
        if (tag1 === "img" || sized && !item && display !== "inline-block") put("height", c1.height);
        if (c1.textDecorationLine !== "none") put("text-decoration-line", c1.textDecorationLine);
        if (c1.verticalAlign !== "baseline") put("vertical-align", c1.verticalAlign); if (c1.boxSizing !== "content-box") put("box-sizing", c1.boxSizing);
        if (c1.textOverflow !== "clip") put("text-overflow", c1.textOverflow); if (tag1 === "img" && c1.objectFit !== "fill") put("object-fit", c1.objectFit);
        if (/table/.test(display) && c1.tableLayout !== "auto") put("table-layout", c1.tableLayout);
        if (tag1 === "ul" || tag1 === "ol") { if (c1.listStylePosition !== "outside") put("list-style-position", c1.listStylePosition); }
        if (decl.length) cel.setAttribute("style", decl.join(";")); else cel.removeAttribute("style");
      });
      computedHtml = "<!DOCTYPE html>" + clone.outerHTML;
    }
    if (pseudo) warnings.push(pseudo + " elements use ::before/::after generated content, which computed-style capture does not reproduce.");
    if (unsupportedColors) warnings.push(unsupportedColors + " wide-gamut or non-RGB colours could not be expressed and were left out of the computed capture.");
  }
  if (shadow) warnings.push(shadow + " elements use shadow DOM; their internal content is not captured.");
  for (var f = 0; f < assetOrder.length; f++) {
    var url = assetOrder[f], record = assets.get(url); if (!record) continue;
    try {
      var response = await fetch(url, { credentials: "omit", cache: "force-cache" });
      if (!response.ok) throw new Error("status " + response.status);
      var blob = await response.blob();
      if (!/^image\/(png|jpeg|webp)$/.test(blob.type)) { warnings.push("An image was skipped: only PNG, JPEG and WebP are supported (" + (blob.type || "unknown type") + ")."); record.data_url = ""; continue; }
      if (blob.size > limits.assetBytes || assetBytes + blob.size > limits.totalAssetBytes) { warnings.push("An image was skipped because it exceeds the image size budget."); record.data_url = ""; continue; }
      assetBytes += blob.size;
      record.data_url = await new Promise(function (resolve) { var reader = new FileReader(); reader.onload = function () { resolve(typeof reader.result === "string" ? reader.result : ""); }; reader.onerror = function () { resolve(""); }; reader.readAsDataURL(blob); });
    } catch (e) { warnings.push("An image could not be read from the page and was left out."); record.data_url = ""; }
  }
  var out = [];
  assets.forEach(function (record) { if (record && record.data_url) out.push({ filename: record.filename, data_url: record.data_url }); });
  var count = 0, walker = doc.createTreeWalker(clone, 5); while (walker.nextNode()) count++;
  return { title: String(doc.title || "").slice(0, 300), html: stylesheetHtml, computed_html: computedHtml, css: css, style_rules: styleRules, assets: out, warnings: warnings.slice(0, 50), node_count: count + 1 };
}`;
