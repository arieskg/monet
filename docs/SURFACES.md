# Surfaces V1: static product comparisons

Surfaces applies user-approved token mappings to a safe static product snapshot.
It answers “what would these mappings look like here?” It does not redesign an
application, infer component semantics, run a production app, or certify conformance.

## Workflow

1. Open **Build with it → Surfaces → Import Surface**.
2. Paste/upload captured HTML and optional CSS. Capture happens outside Monet.
   Use one visible state and viewport per snapshot. The HTML must already contain
   the content: an application shell that needs JavaScript will remain empty.
3. Supply named PNG/JPEG/WebP assets for image elements. The editable asset name
   must match its HTML `src`, such as `assets/avatar.png`. No asset is fetched.
   An optional original screenshot is comparison evidence only.
4. Enter a title, product/state context, capture width/height and original mode.
   Redact sensitive content before importing. Remove unwanted files using the
   import controls. The temporary input remains in this page's memory until you leave.
5. **Inspect safe snapshot**, then inspect **Import fidelity** and the original
   screenshot. The baseline is explicitly labelled a sanitized snapshot.
6. Select a target theme/mode and approve mappings in the declaration worksheet.
   Equal values are suggestions, never automatic semantic matches. The worksheet
   is searchable and paginated. Each mapping replaces one whole CSS declaration;
   a mapped custom-property definition affects its existing CSS consumers.
7. **Preview approved mappings** updates the temporary comparison. **Save Surface**
   persists the sanitized snapshot and comparison, or **Save comparison revision**
   appends a revision. No canonical record is changed by either operation.
8. Compare equal document viewports with the display scale control. Changing the
   display scale does not change CSS media-query dimensions. The two panes scroll
   independently. A different responsive state requires a separate capture.
9. Select up to eight unresolved/import observations, describe the problem and
   expected outcome, then **Report selected evidence in Gaps**. Save the comparison
   first. The original screenshot is copied only if its checkbox is selected.
   Diagnose, propose, approve and Apply remain separate existing Gaps actions.

A saved revision retains its resolved values when Monet changes. A stale notice
invites a new comparison revision, while the original snapshot and earlier
revisions stay unchanged. Select the latest revision to edit mappings. Saved
comparisons are reproducible inputs, not a promise of pixel identity across browser,
font or sanitizer-version changes.

## Supported boundary and fidelity

- Structural HTML, native text/form/table elements, inline styles, embedded styles,
  and one additional stylesheet appended after embedded styles.
- A conservative CSS property/function allowlist, parsed with CSSTree. Rules keep
  order, selector specificity and `!important`; inline declarations stay inline.
- Simple type/class/ID/combinator selectors and a small static pseudo-class and
  pseudo-element set. Attribute, escaped, interactive and complex selectors are
  removed and reported. This limits compatibility with utility/framework CSS.
- Screen/width/height media queries, plus source `prefers-color-scheme` frozen to
  the captured mode. Unsupported conditions are removed, including print rules.
- Flat custom-property values and their consumers. Custom-property definitions
  containing `var()` are removed to bound expansion; flatten aliases at capture.
- Manual color, spacing, radius, typography, shadow and custom-property bindings.
  Arbitrary width/height/grid rules are preserved but never treated as spacing.
  Shorthands are not split into invented component properties. Equal values across
  several semantic tokens remain ambiguous. Units are not guessed or converted.
- Embedded raster image elements and an optional raster screenshot. Images are
  decoded, orientation-normalized and re-encoded to WebP; metadata is stripped.

No SVG, canvas, shadow DOM, scripts, archives, custom fonts, media, remote assets,
CSS image URLs, imports, keyframes, animation, transitions, screenshots-as-DOM,
computed-style inspector, synchronized scrolling, or interaction playback. Native
controls may retain browser behavior inside the sandbox; no application behavior
is wired up. Fonts fall back to those available on the user's machine.

The applied preview starts from the same sanitized source. It preserves source
structure and layout declarations. Token changes can still alter wrapping/geometry.
Unmapped colors retain their captured values, so dark previews may be incomplete.
Source appearance stays fixed; a like-for-like dark original needs its own capture.
Unsupported target modes explicitly disclose the resolved fallback.

## Architecture and evidence

- `shared/surfaces.ts`: editor-only contracts, schemas and pure mapping families /
  compatible-value suggestions. No DOM or filesystem.
- `server/surfaceSanitizer.ts`: parse5, sanitize-html, CSSTree and bounded Sharp
  decoding. Only safe content reaches the renderer. HTML is allowlisted again on
  historical rendering; resolved token values undergo the same CSS checks.
- `server/surfaceStore.ts`: temporary compilation, atomic evidence persistence,
  immutable snapshot and comparison history, shared service Conformance, and
  explicit Gap evidence copying. Canonical resolution runs inside the existing
  workspace read/write boundary; pending application journals block these actions.
- `src/pages/SurfacesPage.tsx`: import, fidelity review, declaration worksheet,
  sandboxed comparison, history and evidence selection.

The existing shared token/theme resolution is authoritative. No separate light or
dark palette or Preview defaults are introduced. Conformance reuses the shared
service, including its light-resolution comparison during a dark-mode review.
Only the first 200 supported declarations are submitted. Manual imports retain authored
declaration evidence. Project stylesheet captures contain live CSSOM/inline declarations,
which scripts may have generated; computed captures contain browser-resolved values from
one viewport and appearance, including inheritance and defaults. Neither establishes source
intent or token usage. Cascade, indirect variable consumers, contrast pairs, interaction,
component identity and role correctness are not established. No source parsing is
added to `shared/review.ts`, and no MCP tool changes are required.

The controlled **Preview** specimens remain separate. Surfaces does not inject
foreign DOM into the editor or reuse a specimen as an arbitrary component replacement.
References remain inspiration; Surfaces and copied Gaps are private product evidence.

## Persistence and recovery

`surfaces/<generated-uuid>.json` is relative to the active workspace root resolved
by `--root` / `MONET_ROOT` / bundled starter. Each file atomically contains the
sanitized snapshot, embedded assets/screenshot, import notices, and up to 20 saved
comparison revisions. Snapshots have content hashes; each run has an integrity
hash, snapshot hash, canonical-knowledge fingerprint, explicit theme/mode, approved
bindings, resolved values, findings and timestamp. V1's schema version also identifies
its compiler/sanitizer contract; future incompatible changes need version handling.

Temporary inspection writes nothing. Only the editor initializes the optional
`surfaces/` directory; missing records read as empty and malformed records remain
errors. Private file writes reuse durable atomic replacement with `0600` files.
A failed pre-publication save preserves old bytes and cleans its temporary file.
After an uncertain response or a post-rename durability failure, reload before
retrying: the revision may already be published. Revision checks reject stale edits.

Surfaces never enters `Workspace`, retrieval, MCP, references, `DESIGN_SYSTEM.md`,
`design-system.json` or token exports. The bundled starter ignores `monet/surfaces/`;
other workspaces retain their own Git/backup policy. Files are local, not encrypted.

Deleting a Surface removes its saved snapshot, assets and comparisons together.
A Gap contains a copy of the selected bounded text evidence and provenance, plus
its optional explicitly selected screenshot; deleting the Surface does not remove
that copy. Long selected observations are labelled excerpts. Gap diagnosis is not
triggered by copying, and no provider is called by Surfaces.

## Security contract

The renderer uses `iframe srcdoc` with an empty `sandbox` and `no-referrer`. There
is no `allow-scripts`, `allow-same-origin`, form, popup, download or navigation
permission. A CSP appears first in the generated head: deny by default; no scripts,
connections, fonts, objects, frames, base URLs or form actions; only sanitized
inline styles and generated raster data URLs. Imports never enter Monet's DOM.
There is no HTML-serving route or raw-input asset route: HTTP returns JSON only,
with `nosniff` and `no-store`. Thus no direct-navigation HTML endpoint is needed.

Active markup, URL attributes, event handlers, resource hints, hidden elements and
hidden-input values are removed. CSS values/functions/selectors are separately
parsed and allowlisted; sanitizing HTML alone is not treated as CSS sanitization.
Supported local image names are logical identifiers, never filesystem paths.
Decoders receive bytes only, and raster signatures are checked before decoding.

Surfaces routes require a loopback Host, reject cross-site fetch metadata and
opaque/foreign Origins, and require JSON for mutations. The exact editor origin
is `http://127.0.0.1:43140` by default; set `MONET_EDITOR_ORIGIN` for a different
local editor port/origin. The service's own loopback origin is also accepted.
Origin-less local CLI requests remain supported. This is a local browser boundary,
not authentication against other local processes. No remote transport is added.

Limits: 16 MB HTTP body; 300,000 characters of raw HTML and combined CSS each;
4,000 nodes / 48 HTML levels; 2,000 declarations / 24,000 CSS syntax nodes / eight
CSS nesting levels; 300-character selectors / 60 selector nodes; 500-character
values / 100 value nodes; bounded numeric lengths, literal grid repetition (1–64), and HTML sizing attributes (0–4096); 24 named
assets plus one screenshot; 3 MB and 12 megapixels per image / 48 megapixels total;
10 MB of repeated embedded image data; 12 MB sanitized snapshot; 24 MB saved record;
20 revisions. Image decoding has a three-second operation timeout, and two imports
may run concurrently. These reduce denial-of-service exposure; browser/decoder
vulnerabilities and hostile local processes are outside the sandbox's guarantee.

## Verification and follow-ups

Run `pnpm check` for build, lint, unit/integration/MCP tests and workspace integrity.
Run `pnpm test:surfaces:browser` separately for actual browser security and workflow
checks. The browser suite uses a disposable empty workspace, synthetic capture,
loopback service and Vite on port 43148. It never starts ConvoGym or another app.
On macOS it uses installed Chrome; elsewhere install Chromium with
`pnpm exec playwright install chromium`, or set `MONET_TEST_BROWSER_CHANNEL`.

Tests cover hostile/mutation-XSS markup, CSS exfiltration routes, hidden content,
media conditions, raster decoding, budgets, invalid mappings, revisions/staleness,
integrity, atomic failure, journal guards, export isolation, explicit Gap copies,
HTTP origin/Host checks, and real-browser parent/network/navigation/script isolation.
The workflow test also verifies computed results in the test harness, historical
mode reloads, narrow editor layout, and the Gap handoff. Those browser-test
measurements are not a product capability.

Follow up with representative real capture formats and additional browser engines
before widening CSS/asset support. Semantic AI mapping, component replacement and
automatic canonical learning are outside V1. Project profiles arrived with
[Profiles V1](PROFILES.md); capture automation from a connected local project is
[Surfaces V1.1: Local Project Connection](PROJECTS.md), which feeds this same import.
