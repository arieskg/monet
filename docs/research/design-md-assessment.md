# DESIGN.md and awesome-design-md: an assessment for Monet

**Status:** research only. No Monet code, records, dependencies, MCP surface, or retrieval
behaviour was changed by this work.
**Date:** 2026-09-03.
**Evidence base:** the Google Labs `design.md` specification and CLI, all 74 `DESIGN.md`
files in `VoltAgent/awesome-design-md`, four first-party `DESIGN.md` files, and Monet's own
source at `1f2a5be`. Measurements below were produced by a throwaway parser run over the
corpus in a scratch directory; nothing was vendored into this repository.

---

## 1. Executive conclusion

DESIGN.md is not a blog convention. It is an Apache-2.0 format specification published by
Google Labs in April 2026 (`google-labs-code/design.md`, ~27.7k stars), with a normative
token schema, a fixed section order, a `lint`/`diff`/`export` CLI, and DTCG and Tailwind
exporters. Real design-system vendors — Atlassian, Ant Design, Clerk, Mintlify, Nuxt,
Resend, Vercel — now publish first-party files. Two of those vendors, Atlassian and Ant
Design, are already Sources in Monet's bundled workspace.

That changes the question from "should Monet care about a curated brand-file repo" to
"should Monet speak the format that is becoming the portable interchange for design context
in coding agents". The answer is yes, in one direction.

**Recommendation: Option B now (export only), with a narrowly scoped Option C later.**

- Monet should **emit** DESIGN.md. It is a small, deterministic projection of records Monet
  already holds, it gives Monet a delivery channel for every agent that cannot speak MCP,
  and it fits the existing "derived views of canonical records" architecture exactly.
- Monet should **not** import the awesome-design-md corpus, ship starter systems derived
  from it, or let any external document reach `get_design_context`. Doing so inverts
  Monet's thesis (your decisions) and its authority model (approved records are canonical).
- A later, narrow import path is defensible, but only as **evidence**: a first-party
  DESIGN.md attached to a Source Monet already tracks, parsed into observations, staged as
  proposals, applied only by a human. Monet already has that pipeline in References.

Positioning, in one line: **a DESIGN.md is a snapshot; Monet is the source it is built from.**

---

## 2. What DESIGN.md is

### 2.1 Origin and governance

| Fact | Value |
| --- | --- |
| Spec owner | Google Labs (`google-labs-code/design.md`), first shipped in Google Stitch |
| License | Apache-2.0 |
| Published | 2026-04-10; last push 2026-07-27 |
| Version | `alpha` — the spec says explicitly to expect breaking change |
| Canonical spec | `https://stitch.withgoogle.com/docs/design-md/specification`, mirrored at `docs/spec.md` |
| Tooling | `npx @google/design.md` — `lint`, `diff`, `export`, `spec` (v0.4.0) |

So there **is** a canonical schema, not only a convention. That is the single most important
correction to the framing of this task.

### 2.2 The format

Two layers in one file:

1. **YAML front matter** — machine-readable tokens. Normative.
2. **Markdown body** — human-readable rationale, in `##` sections. Contextual.

Token schema (from the spec, verbatim in structure):

```yaml
version: <string>            # optional, current: "alpha"
name: <string>
description: <string>        # optional
omitted: <string[] | {section, reason}[]>   # optional, documents deliberate gaps
colors:      { <name>: <Color> }
typography:  { <name>: { fontFamily, fontSize, fontWeight, lineHeight, letterSpacing, fontFeature, fontVariation } }
rounded:     { <level>: <Dimension> }
spacing:     { <level>: <Dimension | number> }
components:  { <name>: { <prop>: <string | "{path.to.token}"> } }
```

- `Color` is any CSS colour (hex, `rgb()`, `rgba()`, `oklch()`, `color-mix()`); hex is recommended.
- `Dimension` is `px`, `em`, or `rem`.
- `{path.to.token}` is the reference syntax, borrowed from DTCG.
- Component properties are a closed-ish set: `backgroundColor`, `textColor`, `typography`,
  `rounded`, `padding`, `size`, `height`, `width`. Unknown properties are accepted with a warning.
- Variants are separate sibling entries (`button-primary`, `button-primary-hover`), not nested state.

Section order is normative when present, and the eight sections are:
Overview · Colors · Typography · Layout · Elevation & Depth · Shapes · Components · Do's and Don'ts.

### 2.3 What the spec does *not* have

This list matters more than the schema, because it is where Monet is structurally ahead:

- **No mode axis.** No light/dark. Atlassian's file declares `theme: light` in front matter
  and would need a second document for dark. There is no override or theme layer at all.
- **No status.** A token or section is present, absent, or listed under `omitted`. There is
  no undecided / needs-review / experimental / do-not-use.
- **No provenance.** Nothing records where a value came from or what changed it.
- **Only four token groups.** No motion, opacity, layering/z-index, borders, sizing,
  interaction, breakpoints, or layout tokens. Those become prose or vanish.
- **No patterns.** Nothing describes a multi-component workflow.
- **No principles as records.** The Overview section is prose.
- **No retrieval.** The file is all-or-nothing context.
- **No accessibility contract** beyond the linter's component `backgroundColor`/`textColor`
  pair check at 4.5:1.

### 2.4 Linting

Seven rules: `broken-ref` (error), `contrast-ratio`, `missing-primary`, `orphaned-tokens`,
`missing-typography`, `section-order` (warnings), `token-summary`, `missing-sections` (info).
`export --format dtcg` emits W3C Design Tokens Format Module JSON. That DTCG bridge is the
most durable interop point in the whole ecosystem.

---

## 3. What awesome-design-md provides

### 3.1 Shape of the repository

`VoltAgent/awesome-design-md`, MIT, 74 brand directories under `design-md/`, each containing
`DESIGN.md` and a stub `README.md`. Median file 28.5 KB (min 4.4 KB, max 44 KB).

**The README is stale in a way worth recording:** it advertises `preview.html` and
`preview-dark.html` per brand. Those files no longer exist in the tree — every brand
`README.md` now says *"Design system details have been moved to: `getdesign.md/<brand>/design-md`.
You can also view previews, dark mode examples, and download options on getdesign.md."*
The repository is a funnel to a commercial site (`getdesign.md`, paid DESIGN.md requests,
LaunchKit). `CONTRIBUTING.md` states: *"We cannot accept DESIGN.md pull requests."* The
corpus is closed, curated, and commercially motivated.

### 3.2 Consistency: measured

| Measure | Result |
| --- | --- |
| Files with YAML front matter (spec v2 shape) | **64 / 74** |
| Files in the legacy numbered format (`## 1. Visual Theme & Atmosphere` … `## 9. Agent Prompt Guide`) | **10 / 74** |
| Front-matter top-level keys, across all 64 | identical set: `version, name, description, colors, typography, rounded, spacing, components` |
| Files with all 8 canonical sections | **63 / 74** |
| Canonical sections in spec order | **74 / 74** |
| Files with exactly the 8 spec sections and no extras | 13 |
| Component token references parsed | **6,172**, of which **0 broken** |
| Colour tokens | 1,529 across 64 files; 38 are `rgba(...)`, the rest hex |
| `### Do` / `### Don't` sub-headings | 63 / 74 each |
| `## Responsive Behavior` (incl. numbered v1 form) | 61 / 74, all with a `\| Name \| Width \| Key Changes \|` table |
| Typography section with a `\| Token \| Size \| Weight \| …\|` table | 63 / 74 |

Three non-spec `##` sections are effectively house style: **Responsive Behavior** (61),
**Iteration Guide** (50), **Known Gaps** (43). The spec says unknown sections must be
preserved, not rejected, so these are legal extensions.

Variation between brands is in *volume*, not *shape*: colours range 8–47 tokens, components
10–51, rounded 2–10. Nintendo 2001 and Dell 1996 fit the same skeleton as Stripe.

### 3.3 What is structured vs. free-form

- **Structured and mechanically reliable:** the entire front matter; the typography
  hierarchy table; the breakpoints table; Do/Don't bullet lists.
- **Semi-structured:** the Components prose, which follows a stable
  `**\`token-name\`** — description` + bullet-of-properties shape but is not guaranteed.
- **Free-form:** Overview, Whitespace Philosophy, Decorative Depth, Note on Font Substitutes,
  Known Gaps. These carry the interesting judgement and none of the parseable structure.

### 3.4 Agent guidance

Two mechanisms. The v2 files end with an **Iteration Guide** — a numbered list of working
rules ("focus on ONE component at a time and reference it by its `components:` token name",
"run `npx @google/design.md lint DESIGN.md` after edits"). The v1 files carry an **Agent
Prompt Guide** with a quick colour reference and literal example prompts. Both are static
instructions embedded in the document; neither is retrieval.

### 3.5 First-party files diverge sharply from the corpus

| File | Front matter | Sections | Note |
| --- | --- | --- | --- |
| `atlassian.design/DESIGN.md` (81 KB) | `version, revision: 0.0.7, theme: light, name, colors, typography, rounded, spacing, borders, surfaces, motion, components` | the 8 canonical **plus** Icons, Motion, Voice and tone, Accessibility, Responsive behaviour | extends the schema with three non-spec token groups |
| `vercel.com/design.md` (40 KB) | `name, description` only — **no tokens at all** | prose | reads as an agent brief, not a token file |
| `resend.com/design.md` (4.7 KB) | **none** | prose | plain Markdown |
| `ant.design/design.md` | — | — | listed first-party |

So: a "DESIGN.md" in the wild may have full tokens, partial tokens, or none. Any Monet
consumer must treat the token layer as optional and degrade to prose-only gracefully.

### 3.6 Licensing and attribution

- The **format** is Apache-2.0 — free to emit, no attribution burden on generated files.
- The **awesome-design-md corpus** is MIT with a disclaimer: *"The extracted design tokens
  represent publicly visible CSS values. We do not claim ownership of any site's visual
  identity."* MIT on the repo does not clear the underlying trade dress. A file titled
  "Design System Inspired by Tesla" reproducing Tesla's palette, type scale, and component
  language is a description of someone else's brand; MIT licensing of the description does
  not license the brand.
- **Practical rule for Monet:** never copy corpus content into the repository, never ship it
  as a starter, and if a user imports one, keep the source URL, retrieval date, and licence
  string on the record.

---

## 4. Mapping to Monet

### 4.1 Concept alignment

| DESIGN.md | Monet | Alignment |
| --- | --- | --- |
| front matter `colors` | Foundations/color semantic tokens (45 of 87) | **shape aligns, vocabulary does not** (§4.2) |
| front matter `typography` (composite objects) | Foundations/typography, 34 **atomic** tokens (`typography.body.size`, `typography.body.weight`) | **shape mismatch** (§4.3) |
| front matter `rounded` | Foundations/radius (8 tokens) | clean |
| front matter `spacing` | Foundations/spacing (18 tokens) | clean |
| front matter `components` | *no equivalent* | **gap** (§4.4) |
| `{path.to.token}` refs | Monet `{token.name}` aliases + `token:` preference values | conceptually identical, syntactically different |
| `## Overview` | closest: Principles + theme name | **DESIGN.md carries something Monet lacks** (§4.5) |
| `## Colors` / `## Typography` / `## Layout` / `## Elevation & Depth` / `## Shapes` prose | Foundation `description` + `rationale` + `guidance` | clean, Monet is richer |
| `## Components` prose | Component decision `notes`, `rationale`, `preferences`, `use_when`, `avoid_when` | Monet is much richer, differently shaped |
| `## Do's and Don'ts` | Principle `**Avoid.**` bullets, component `avoid_when`, pattern avoid lists | clean; Monet already parses these in `compactContext.ts` |
| `## Responsive Behavior` (non-spec) | Foundations/breakpoints (3 tokens) + interaction | Monet has the values, **not the guidance** |
| `## Iteration Guide` / `Agent Prompt Guide` (non-spec) | MCP `get_design_context` + workspace `AGENTS.md` | Monet's is live retrieval; theirs is a static list |
| `## Known Gaps` (non-spec) / `omitted:` | `status: undecided`, `notices: undecided_guidance / no_opinion / unsupported_capability` | **Monet is far stronger** |
| — | Patterns (13 records) | no DESIGN.md equivalent |
| — | Primitives (21) | no equivalent |
| — | References + `ReferenceCollectionAnalysis` | no equivalent |
| — | Themes, modes, provenance | no equivalent |
| — | Sources + 744 component mappings | no equivalent |

### 4.2 Colour naming is the real import obstacle

The corpus does **not** use the spec's recommended names. Measured across 64 v2 files:

| Role name | Files containing it |
| --- | --- |
| `primary` | 64 |
| `ink` | 64 |
| `on-primary` | 63 |
| `canvas` | 58 |
| `hairline` | 53 |
| `surface` | **9** |
| `warning` | 14 |
| `success` | 13 |
| `error` | 12 |
| `danger` | **1** |
| `background`, `foreground`, `border`, `focus` | **0** |

Monet's semantic vocabulary is `color.background`, `color.surface`, `color.foreground`,
`color.border`, `color.focus`, `color.on.*`, and 39 more. The overlap with the corpus is one
token: `primary`. Every other mapping (`ink`→`color.foreground`, `canvas`→`color.background`,
`hairline`→`color.border`) is an interpretation, not a lookup. **Colour import is a
translation problem, not a parsing problem.**

Secondary obstacle: `shared/contrast.ts::luminance()` accepts only `#rgb`/`#rrggbb` and
returns `null` otherwise. The 38 `rgba()` values in the corpus are unmeasurable by Monet's
validator, so any imported palette using them would silently skip contrast contracts.

### 4.3 Typography shape mismatch

DESIGN.md binds a role to a composite: `body-md: {fontFamily, fontSize, fontWeight, lineHeight, letterSpacing}`.
Monet decomposes: `typography.body.size` and `typography.body.weight` exist; there is no
`typography.body.lineHeight`, no `typography.body.letterSpacing`, and family is set only for
`typography.navigation.section.family`. Line heights and letter spacings exist as primitives
(`line.height.body`, `letter.spacing.tight`) but are not bound per role.

Both directions therefore need work:
- **import**: split a composite into Monet's atomic tokens, and invent role names.
- **export**: assemble composites by the `typography.<role>.<prop>` naming convention, then
  either omit `lineHeight`/`letterSpacing`/`fontFamily` or add semantic tokens for them.

### 4.4 The `components` block has no Monet home

Monet's 80 component decisions carry **188 distinct preference keys** over 369 values, only
86 of which are `token:` references. Top keys: `density` (33), `radius` (25), `border` (10),
`elevation` (10). These are *design intent* (`density: compact`, `primary_style: filled`,
`action_hierarchy: one primary action per region`), not style specs.

The literal styling exists nowhere in `shared/` or `server/`. It lives in
`src/components/previewAdapters.tsx` as React and CSS, and `src/previewCompiler.ts` emits
`cssVariables` plus per-component *decision metadata* (`PreviewComponentDecision`), not
resolved per-component style. Under Monet's one-way rule (`src/` may depend on `shared/`,
never the reverse) a DESIGN.md emitter in `shared/` cannot reach it.

This is not a defect to fix in passing. It is a genuine boundary: Monet deliberately says
"Button is compact, filled, uses `radius.control`" and leaves pixel values to the
implementation. The spec's `omitted:` field exists precisely for this, and using it is the
honest answer.

### 4.5 What DESIGN.md captures that Monet does not

1. **Brand atmosphere.** "Near-black product-focused marketing canvas… dense, technical, and
   quietly luxurious." Monet's eight principles are process values ("prefer hierarchy over
   decoration") — universal good practice, deliberately not identity. Monet has no record
   that says what *this* system feels like. The nearest thing is a theme's `name`.
2. **Responsive collapsing guidance.** Monet has 3 breakpoint tokens; it has no record of
   "3-up → 2-up at 1024px, nav collapses to hamburger below 768px".
3. **Font-substitution guidance** ("Inter at 500/600/700 is the closest free substitute").
4. **Per-component literal styling** (§4.4).
5. **Marketing/editorial component vocabulary** — `hero-band`, `pricing-card`, `cta-banner`,
   `customer-logo-tile`. Monet's taxonomy is application UI; these have no home and should
   not be forced into one.

### 4.6 Where Monet is stronger

Modes as a resolution axis with provenance; five-valued status; 13 foundations vs 4 token
groups; patterns; primitives; principles as records; references as evidence with staged
suggestions; sources with 744 upstream mappings; deterministic retrieval with coverage and
notices; contrast contracts validated for **every theme in every mode**; a decision history
that survives edits.

### 4.7 Verdict on the relationship

Not an import format. Not a bidirectional format.

**DESIGN.md is (a) an export target and (b) a reference/evidence format.** The two are
asymmetric and should be treated as separate features with separate risk profiles. Nothing
in this research supports treating it as a starter-template source.

---

## 5. Import assessment

### 5.1 What could be imported automatically

Deterministic, no judgement, no model:

- The whole front-matter token tree, verbatim, as **observations** — 64/64 sampled files parse.
- `{path.to.token}` reference graph, with resolution — 6,172 refs, 0 broken.
- Section segmentation by `##` heading, with alias folding (`Brand & Style`→Overview, etc.).
- Do/Don't bullets (63/74), breakpoint tables (61/74), typography hierarchy tables (63/74).
- Legacy v1 colour bullets via `- **Name** (\`#HEX\`): description` — a regex over 10 files.
- Provenance: source URL, retrieval date, checksum, licence string, format version.

### 5.2 What must remain a human-reviewed suggestion

- Every colour role mapping except `primary` (§4.2).
- **Which mode the values belong to.** Linear's file is dark-only; importing `canvas: #010102`
  as a Monet *light* `color.background` would be actively wrong, and nothing in the file
  declares it. Atlassian declares `theme: light`; the corpus declares nothing.
- Which of 10–51 brand components corresponds to a Monet taxonomy entry.
- Whether an Overview sentence becomes a principle, a foundation `guidance` edit, or nothing.
- Whether a Do/Don't line is a principle avoid-bullet or a component `avoid_when`.

### 5.3 What cannot be mapped reliably at all

- Component style specs → Monet component decisions (§4.4). No target field exists.
- Marketing/editorial components (§4.5.5).
- Elevation, motion, opacity, layering, borders, sizing, interaction — DESIGN.md carries
  these only as prose, so there is no value to import, only text to read.
- Anything from a token-less first-party file (Vercel, Resend).

### 5.4 Honest summary

Import produces a large volume of *observations* and a small number of *defensible
decisions*. The ratio is bad enough that a "one-click import" would mostly generate review
debt. That is the argument for making import evidence-shaped rather than record-shaped.

---

## 6. Export assessment

### 6.1 Feasibility

Strong. Monet already regenerates `DESIGN_SYSTEM.md` and per-theme, per-mode token exports
from canonical records on every save. A DESIGN.md emitter is one more projection over the
same resolved token set, and `shared/compactContext.ts` already contains most of the prose
extraction it needs (`leadParagraph`, `boldSectionBullets`, `patternAvoid`, `tokenValues`).

| DESIGN.md output | Monet source | Determinism |
| --- | --- | --- |
| `name` | active theme name | mechanical |
| `description` | **no source** — see open question Q1 | — |
| `colors` | 45 `color.*` semantic resolved tokens, name-mapped `color.foo.bar` → `foo-bar` | mechanical |
| `rounded` | Foundations/radius (8) | mechanical |
| `spacing` | Foundations/spacing (18) | mechanical |
| `typography` | assembled from `typography.<role>.size` / `.weight` by naming convention | mechanical **with a documented convention**; `lineHeight`/`letterSpacing`/`fontFamily` per role are missing (§4.3) |
| `components` | **not derivable** → emit `omitted: [{section: components, reason: "Monet records component intent, not literal styling"}]` | n/a |
| `## Overview` | principles lead paragraphs + Color/Typography foundation descriptions | mechanical, reads as summary |
| `## Colors` / `## Typography` / `## Layout` / `## Elevation & Depth` / `## Shapes` | Foundation `description` + `guidance` | mechanical |
| `## Components` | component decisions: name, status, preferences, notes, use/avoid | mechanical; **needs a size budget** (80 decisions, `monet/components/` is 276 KB) |
| `## Do's and Don'ts` | principle `**Avoid.**` bullets + `**How to apply.**` bullets | mechanical, reuses existing parser |

Foundations with **no DESIGN.md home**: motion, opacity, layering, sizing, interaction,
breakpoints, layout, borders — 8 of 13. They can be summarised into `## Layout` and
`## Elevation & Depth` prose, or declared in `omitted`. This loss is inherent to the format,
not to the implementation.

**Modes:** DESIGN.md has no mode axis, so a Monet workspace supporting light and dark emits
**one file per (theme, mode)** — e.g. `DESIGN.md` and `DESIGN.dark.md` — each carrying
`theme: light|dark` in front matter the way Atlassian does. This is the single largest
fidelity loss and must be stated in the output, not hidden.

### 6.2 Is export more valuable than import?

Yes, decisively, for four reasons.

1. **It closes Monet's only distribution gap.** Monet's agent surface today is MCP over
   stdio. Every agent that reads a repo root — and every tool that reads DESIGN.md
   specifically, including Stitch — is currently unreachable. Export makes Monet useful to
   them with zero configuration and no protocol.
2. **It is the only direction where Monet is the authority.** Export ships Monet's approved
   decisions outward. Import brings someone else's decisions in. Only one of those is
   consistent with the product thesis.
3. **The intermediate artifact is missing today.** `DESIGN_SYSTEM.md` is 166 KB — 4–6× the
   28.5 KB median DESIGN.md, and shaped as a human summary rather than agent context. The
   MCP compact brief is agent-shaped but reachable only over stdio. A DESIGN.md export is
   the missing small, portable, committable middle tier.
4. **It buys free external validation.** `npx @google/design.md lint` is an independent
   implementation of broken-ref and WCAG-AA checks. Running it over Monet's output in CI
   cross-checks `shared/contrast.ts` against someone else's arithmetic — at no runtime
   dependency cost, since the check would be dev-only.

### 6.3 Should export and the compact brief share a projection layer?

Share the **extraction helpers**, not the **output shape**.

They answer different questions. The compact brief answers "what does Monet say about *this
task*" — scoped, provenance-carrying, URI-linked, retrieval-driven. A DESIGN.md answers
"what is the whole system" — complete, flat, self-contained, no retrieval. Forcing one
projection to serve both would drag DESIGN.md's four-group vocabulary into the MCP brief, or
drag retrieval into a static file. Neither is wanted.

What they should share: `leadParagraph`, `boldSectionBullets`, `patternAvoid`,
`patternIntent`, `tokenValues`, `resourceUri` — the functions that turn a canonical record
into a presentable field. Those already live in `shared/compactContext.ts` and
`shared/service.ts`. The emitter belongs beside them in `shared/` (pure, no filesystem),
with `server/` responsible for writing bytes and the UI Export page offering it as one more
`ExportCollection` alongside the existing ten.

### 6.4 Does it help non-MCP users?

Yes, and it also helps MCP users: a committed DESIGN.md in a *product* repo gives that
repo's agents design context without requiring every contributor to configure a stdio
server. The two surfaces are complementary — the file is the floor, MCP is the ceiling.

---

## 7. References / evidence assessment

Monet's References subsystem is already the exact pipeline this task hypothesises:

```
Reference (asset + user annotation + source_url)
  → ReferenceAiMetadata          (AI observations, kept separate from the annotation)
  → ReferencePreference          (recurring observations with evidence_reference_ids + confidence)
  → ReferenceSuggestion          (target_type, target_id, proposal, rationale, evidence, status)
  → human approval
```

and `docs/ARCHITECTURE.md` already states the invariant that makes it safe:

> Approving a suggestion changes only its review status; it never mutates Principles, Themes,
> Foundations, Components, or Patterns.

A DESIGN.md fits this better than it fits any import path:

- `Reference.type` already admits `"file"` and `"url"`.
- The record already separates `annotation` (the user's words) from `ai` (observations) —
  exactly the separation an imported third-party document needs.
- `ReferenceSuggestion.target_type` already covers principle, theme, foundation, component,
  and pattern — the five things a DESIGN.md would propose changes to.
- Reference search is already a **separate MCP tool** (`search_references`) from
  `get_design_context`, and the compact brief keeps `references` in its own bucket. External
  material therefore cannot be confused with a decision by construction.

Two honest gaps:

1. **`ReferenceAiMetadata` is image-shaped** — `ui_types`, `visual_characteristics`,
   `density`, `hierarchy`, `mood`. A DESIGN.md's observations are token-shaped. Either the
   schema grows a variant, or document observations get their own store.
2. **There is no apply step.** Approving a suggestion today records approval; it does not
   write the record. A useful import loop needs "approved → applied", which is new
   behaviour and its own risk surface.

**Conclusion:** the References thesis is the right home, and it fits better than direct
import. But "reuses the existing pipeline" overstates it — one schema extension and one new
write path are required.

---

## 8. Authority model

### 8.1 Five tiers

| Tier | Contents | Storage | May answer `get_design_context`? | Written by |
| --- | --- | --- | --- | --- |
| **1 — Canonical** | Principles, Foundations + tokens, Themes, Components, Primitives, Patterns | `monet/` canonical records | **Yes. Only this tier.** | human, via UI or by editing files |
| **2 — Derived** | `DESIGN_SYSTEM.md`, `tokens/`, a DESIGN.md export | regenerated projections | No — it *is* tier 1, reprojected | the tool, on save |
| **3 — Proposals** | `ReferenceSuggestion` — target, proposal, rationale, evidence ids, `pending`/`approved`/`dismissed` | `references/analysis.json` | No | deterministic extraction or optional AI |
| **4 — Observations** | parsed tokens, sections, tables, bullets from an external document | beside the reference, never in a Foundation | No | deterministic parser |
| **5 — Source artifact** | the external DESIGN.md verbatim + URL + retrieved-at + checksum + licence + format version | `references/assets/` | Only via `search_references`, labelled external | user (paste or file) |

### 8.2 Invariants

1. **Tier 1 is written only by a human act.** No parser, no model, no import, and no
   approval flag may write a Foundation token, a theme override, or a component decision.
   Approval marks intent; a separate, explicit, diff-showing apply performs the write.
2. **Retrieval never mixes tiers.** `get_design_context` reads tier 1 only. Tier 5 stays in
   `search_references` and in the brief's separate `references` bucket. This is the current
   behaviour and must be preserved verbatim.
3. **Existence is not authority.** Importing a file creates tier-5 and tier-4 rows and
   nothing else. A brand DESIGN.md sitting in a workspace confers no more authority than a
   screenshot.
4. **Every derived row names its evidence.** Observations point at the source artifact;
   proposals point at observations. `ReferenceSuggestion.evidence_reference_ids` already
   does this.
5. **Interpretation is labelled.** A value a parser read is not the same as a value a model
   inferred. The `annotation` / `ai` split already encodes this and must extend to documents.
6. **Provenance survives.** A token whose value originated in an imported document keeps a
   pointer to it, so "why is our primary #5e6ad2" has an answer a year later.

### 8.3 The failure mode this prevents

"Start from Linear" is the concrete attack on this model: it takes tier-5 content and makes
it tier-1 in one click. Everything downstream then presents Linear's decisions as the user's
approved decisions, with Monet's own provenance machinery testifying that they are canonical.
The authority model is only worth having if it forecloses that, which means the feature that
would violate it should not be built (§11).

---

## 9. Parsing feasibility

### 9.1 Deterministic tiers

| Tier | Content | Method | Corpus coverage |
| --- | --- | --- | --- |
| **A. Fully mechanical** | front matter (all 5 token groups + metadata) | YAML subset parse | 64/64 v2 files |
| | `{path.to.token}` resolution | tree walk | 6,172 refs, 0 broken |
| | `##`/`###` section tree, with alias folding | heading scan | 74/74 |
| | Do/Don't bullets | `### Do` / `### Don't` + `- ` | 63/74 |
| | breakpoint tables | `\| Name \| Width \|` | 61/74 |
| | typography hierarchy tables | `\| Token \| Size \|` | 63/74 |
| **B. Regex heuristic** | v1 colour bullets `- **Name** (\`#HEX\`): desc` | pattern | 10/74 |
| | component prose blocks `**\`name\`** — desc` | pattern | most v2 files, unguaranteed |
| **C. Requires judgement** | role mapping, mode assignment, taxonomy mapping, "is this a principle" | human, optionally AI-assisted | all |

### 9.2 Is an AST Markdown parser needed?

No. Everything in tier A is a line-oriented scan over `##`/`###`/`- `/`| `. Monet already
parses its own Markdown records with a small frontmatter contract and no Markdown library,
and that approach is sufficient here. An AST parser would be a dependency bought for
robustness Monet does not currently need.

### 9.3 The YAML problem

This is the one real technical obstacle, and it collides with a stated architectural
preference. `docs/ARCHITECTURE.md`:

> Structured records use formatted JSON so the app does not require a custom database or YAML parser.

Options:
1. **Restricted-subset parser (~60 lines).** The observed front matter is two-space nested
   maps of scalars plus one optional list. A subset parser covers 64/64 files. It **must
   fail loudly** on anything outside the subset (anchors, block scalars, flow collections,
   multi-line strings) rather than guess — a silent misparse of a colour value is worse than
   a rejection. Note that a naive parser mis-handles inline `# comments` after values
   (nintendo-2001 uses them) and wrapped quoted `description` strings; both were observed
   during this research.
2. **Add a YAML dependency.** Contradicts a deliberate architectural stance for one feature.
3. **Export only.** Emitting YAML needs no parser — Monet already has a YAML *writer* in
   `src/exportFormats.ts::toYaml`, which handles exactly the map-of-scalars shape DESIGN.md
   front matter uses.

Option 3 is another reason export-first is the cheaper phase: **it needs no new parsing at all.**

### 9.4 Where AI belongs, if anywhere

Only in tier C, and only under the constraints Monet already applies to
`server/referenceAnalysis.ts`: an optional external CLI, a strict output schema, output
written to staged suggestions, never auto-applied, and the whole feature degrading to
"deterministic observations only" when `MONET_AI_COMMAND` is unset. Model output enters at
tier 3 and can never skip a tier.

---

## 10. Product differentiation

### 10.1 "Why not just copy `linear/DESIGN.md`?"

For the first hour of a greenfield project, you should. It is 24 KB, free, and produces a
coherent-looking UI immediately. Monet should not pretend otherwise, and should not try to
beat it at that job.

The comparison changes at the second week.

| | static DESIGN.md | Monet |
| --- | --- | --- |
| Whose taste | someone else's brand | **yours** |
| Editing | rewrite prose and hope the tokens still agree | edit one record; exports regenerate |
| Undecided state | none — silent where it has no opinion, and the agent invents one | `undecided` / `needs_review`, plus `no_opinion` and `undecided_guidance` notices telling the agent to prefer a familiar accessible solution and surface the choice |
| Context cost | all-or-nothing, 4–81 KB, every request | scoped brief, ~¼–⅓ of full, with `retrieval` explaining every inclusion |
| Why a value is what it is | not recorded | rationale, notes, decision history, `references` evidence |
| Light + dark | a second file, hand-maintained | one system, two resolutions, `mode_values` and provenance |
| Validation | `lint`: 7 rules, contrast on component pairs | contrast contracts for every role on every documented background, in **every theme × every mode**, plus broken refs, dangling links, and preference-contract checks |
| Component decisions | style values | intent, grounded in a real source (`shopify-polaris/Button`), with 744 upstream mappings |
| Workflows | none | 13 patterns, with reverse expansion from components |
| Evolution | rewritten wholesale | Git over canonical records; `DESIGN_SYSTEM.md` and `tokens/` change only when the system does |
| Portability | **total — every agent reads it** | MCP clients only, today |

### 10.2 The sharpened positioning

The last row is the whole argument for export, and it is the only row Monet currently loses.

- **DESIGN.md is a build artifact.** It is what a design system looks like when flattened for
  one consumer at one moment, in one mode.
- **Monet is the repository it is built from.** Decisions, status, evidence, provenance,
  modes, patterns, and validation — the things a flattened snapshot structurally cannot hold.

Shipping the export converts the strongest competing artifact into Monet's output format.
That is a better outcome than either ignoring it or importing it.

---

## 11. Strategic options

### Option A — No integration

Treat DESIGN.md as adjacent; stay MCP-first.

| | |
| --- | --- |
| User value | none |
| Complexity | zero |
| Architectural risk | none |
| Product risk | **high.** DESIGN.md is Apache-2.0, Google-backed, at 27.7k stars, with first-party adoption by vendors Monet already tracks as Sources. A design-context tool that cannot emit the emerging interchange format looks closed. |
| Maintenance | zero |
| Thesis fit | consistent but incomplete: Monet's decisions stay trapped behind stdio |

### Option B — Export only

Monet emits a spec-conformant DESIGN.md per theme × mode, as a derived projection.

| | |
| --- | --- |
| User value | **high.** Any agent, any editor, any repo. Commit it, diff it, hand it to Stitch. Non-MCP users get Monet's output for the first time. |
| Complexity | **low.** No parser, no dependency, no network. One pure emitter in `shared/`, one `ExportCollection` entry, optionally one CLI. YAML writing already exists (`toYaml`). |
| Architectural risk | **low**, with one named boundary: `components` is not derivable (§4.4) and must be declared `omitted`, not faked. |
| Product risk | low. Worst case: a lossy artifact. Mitigated by emitting `omitted` entries with reasons, so the file is honest about what Monet chose not to flatten. |
| Maintenance | low. Spec is `alpha` and will move; the emitter is small enough to follow it, and `npx @google/design.md lint` in CI catches drift. |
| Thesis fit | **excellent.** Ships the user's own approved decisions outward. Canonical stays canonical. |

### Option C — Reference / import workflow

DESIGN.md enters as tier-5 evidence → tier-4 observations → tier-3 proposals → human apply.

| | |
| --- | --- |
| User value | **medium.** Genuinely useful for a *first-party* DESIGN.md from a system you already use (Atlassian, Ant Design — both already Sources). Much weaker for a scraped brand file, where the output is mostly review debt (§5.4). |
| Complexity | **medium-high.** YAML subset parser (§9.3), observation storage, a `ReferenceAiMetadata` variant for documents, a proposal→apply write path that does not exist today, and a diff UI so the human can see what applying would change. |
| Architectural risk | **medium.** The apply path is the first place anything other than direct human editing writes tier-1 records. That boundary needs tests as strong as the contrast contracts. |
| Product risk | **medium.** Every import feature drifts toward "just apply it all". |
| Maintenance | medium — tracks an `alpha` spec *and* real-world files that ignore it (§3.5). |
| Thesis fit | good **if** scoped to first-party sources and evidence-shaped; poor if aimed at the brand corpus. |

### Option D — Full interoperability (import + export + references)

| | |
| --- | --- |
| User value | high in aggregate |
| Complexity | **high** — B and C at once, plus round-trip expectations Monet cannot honour (`components` cannot survive a round trip; modes cannot survive at all) |
| Architectural risk | **high.** Round-tripping invites a "DESIGN.md-shaped" internal model, which would flatten Monet's 13 foundations toward 4 groups and erode the mode axis. |
| Product risk | high. Also the shortest path to "Start from Linear", which the authority model exists to prevent. |
| Maintenance | high |
| Thesis fit | poor as one project; fine as B then C, sequenced, with the round-trip goal explicitly abandoned |

---

## 12. Recommendation

**Ship Option B. Defer Option C behind an explicit decision. Never ship D as a unit.**

Reasoning:

1. Export is where Monet has authority and DESIGN.md has reach. That is the whole trade.
2. Export needs no parser, no dependency, no network, and no MCP change — it fits the
   existing derived-projection architecture with one new pure module.
3. Import's value is concentrated in first-party files from systems Monet already tracks as
   Sources, which is a much smaller and better-defined feature than "import DESIGN.md", and
   it can be specified accurately only after the export work has forced a precise
   Monet↔DESIGN.md field mapping to be written down.
4. The corpus itself is a weak foundation to build on: closed to contributions, funnelling to
   a commercial site, with a README already stale relative to its own tree.

The immediate strategic gain is positional. Monet stops being an MCP-only tool and becomes a
design-decision system that *emits the ecosystem's format*, while keeping the properties a
flat file cannot have.

---

## 13. Proposed implementation phases

Four phases, each small enough for its own branch. **Nothing here is implemented.**

### Phase 1 — DESIGN.md export

**Goal.** Monet emits a spec-conformant DESIGN.md for a chosen theme and mode.

**Scope.** One new pure module in `shared/` (e.g. `shared/designMd.ts`) exporting
`toDesignMd(workspace | DesignContext, { themeId, mode }): string`. One new entry in
`buildExportCollections()`. Reuse `toYaml` for the front matter and the existing prose
extractors for the body.

**Architecture.** `shared/` computes the string; `server/` writes bytes if asked; `src/`
offers download. No MCP change. No retrieval change. No new dependency. No network.

**Canonical vs derived.** Output is **derived**, like `DESIGN_SYSTEM.md` and `tokens/`: no
timestamps, byte-identical for an unchanged workspace. It is not a record and is not written
into `monet/` in this phase — the file belongs in the user's *product* repo, not the
workspace.

**Explicit non-goals.** No import. No `components` block — emit
`omitted: [{section: components, reason: …}]`. No fabricated `lineHeight`/`letterSpacing`.
No round-trip guarantee. No writes into `monet/`.

**Tests.** Golden-file test against the bundled starter workspace for light and dark. A
determinism test (same workspace ⇒ identical bytes, twice). A completeness test asserting
every `color.*` semantic token appears. A test asserting an empty workspace emits a valid
minimal file. A test asserting every omitted foundation is either summarised in prose or
listed in `omitted`.

**Exit criteria.** `pnpm check` green; both mode outputs pass `npx @google/design.md lint`
with zero errors, run manually; the emitted file is under ~30 KB (corpus median).

### Phase 2 — Conformance check and CLI

**Goal.** Keep the emitter honest as the `alpha` spec moves, and make export scriptable.

**Scope.** `pnpm export-design-md [--root …] [--theme …] [--mode …] [--out …]`, modelled on
`server/validateCli.ts`. An **optional** CI step that runs `npx @google/design.md lint` over
the emitted files. Optional means: skipped when offline, never a build dependency, never in
`package.json` dependencies.

**Canonical vs derived.** Unchanged.

**Non-goals.** No runtime dependency on `@google/design.md`. No vendoring of the spec.

**Tests.** CLI smoke test on the bundled workspace and on an empty directory.

**Exit criteria.** A user can regenerate DESIGN.md in their product repo's CI from a Monet
workspace path, with no Monet UI running.

### Phase 3 — DESIGN.md as evidence (tier 5 + tier 4)

**Goal.** A user can attach a DESIGN.md — pasted or uploaded, **not fetched** — as a
Reference, and see deterministic observations from it. Nothing else happens.

**Scope.** Accept `type: "file"` references with a Markdown media type. A restricted YAML
front-matter parser that **rejects rather than guesses** (§9.3). Deterministic section,
table, and bullet extraction. Store source URL, retrieval date, checksum, licence string,
and format version on the record.

**Canonical vs derived.** Tier 5 and tier 4 only. **No Foundation, theme, or component
decision is written by this phase.**

**Non-goals.** No network fetch — Monet opens no outbound connections today and this phase
must not be the first. No proposals. No apply. No MCP change. No bundled corpus content.

**Tests.** Parser fixtures for the three real-world shapes (full tokens, tokens-only-partial,
no front matter) plus a malformed-YAML rejection case. A test asserting `get_design_context`
output is byte-identical before and after a DESIGN.md reference is added — the authority
invariant, made executable.

**Exit criteria.** A first-party DESIGN.md is legible inside Monet as evidence, and provably
invisible to the design brief.

### Phase 4 — Proposals and explicit apply (tier 3 → tier 1)

**Goal.** Turn observations into reviewable proposals, and let a human apply one at a time.

**Scope.** Extend the suggestion generator to accept document observations. Add a
`ReferenceAiMetadata` variant (or a sibling record) for document-shaped observations. Add an
apply action that shows a per-field diff and performs one bounded write through the existing
write routes.

**Canonical vs derived.** This is the **only** phase that writes tier 1, and only from an
explicit per-proposal human action showing the exact diff. Approval and apply stay separate
states.

**Non-goals.** No bulk apply. No "adopt whole system". No AI required — with
`MONET_AI_COMMAND` unset, deterministic observations still produce mechanical proposals for
the handful of unambiguous cases (`rounded`→radius, `spacing`→spacing). No starter systems.

**Tests.** An apply-path test asserting exactly one record changes and `pnpm validate` still
passes, including contrast in every theme × mode. A rejection test for an `rgba()` colour
whose contrast Monet cannot measure (§4.2). A test that a dismissed proposal writes nothing.

**Exit criteria.** A user can take one observation from Atlassian's first-party DESIGN.md to
an approved Monet decision, see the diff before it lands, and have `pnpm validate` stay green.

**Gate before starting Phase 3.** Phases 3–4 should begin only after Phase 1 has produced a
written, tested field mapping, and only if the answer to Q4 below is "first-party sources".

---

## 14. Open questions for Fable

1. **Where does a DESIGN.md `name` and `description` come from?** The spec requires `name`
   and recommends `description`. Monet has no system-level identity record — only a theme
   name ("Default"). Options: use the theme name and omit `description`; derive a
   description from principles; or add a small workspace-identity record. Adding a record to
   serve an export format is exactly the kind of tail-wagging-dog Monet should resist, but
   omitting `description` makes a weaker artifact. Which?

2. **Should Monet add per-role `lineHeight`, `letterSpacing`, and `fontFamily` semantic
   tokens?** Today typography is atomic and roles bind only `.size` and `.weight` (§4.3).
   Adding them would improve the export *and* arguably the design system itself — a role
   that does not name its line height is under-specified. But it is a workspace change
   driven by an export format. Is that a legitimate reason, or a tell that the export is
   pulling the model?

3. **Is `omitted: [components]` the right answer, or should Monet learn to express component
   styling?** §4.4 argues Monet deliberately records intent, not pixels, and that the styling
   lives in `src/` behind the one-way rule. Counter-argument: a DESIGN.md without
   `components` is meaningfully weaker to a consuming agent, and the agent will then invent
   button styling — the exact failure Monet exists to prevent. Is there a third path where a
   `shared/` projection derives a minimal component style set from preferences plus tokens
   (`radius: token:radius.control` → `rounded`, `primary_style: filled` → `backgroundColor:
   {colors.primary}`), and is that derivation a decision Monet is entitled to make?

4. **Should import be scoped to first-party DESIGN.md only?** §5.4 and §11-C argue the value
   is concentrated there and the review debt is concentrated in scraped brand files. A
   first-party-only rule is simple to state and easy to enforce (attach to an existing
   Source), but it is a product restriction, not a technical one, and users will paste brand
   files anyway. Enforce, warn, or allow?

5. **Is the "no outbound network" property worth keeping absolutely?** Monet's README leads
   with "nothing leaves your machine". Import-by-URL would be the first outbound connection
   in the product. Phase 3 assumes paste/upload only. Is that permanent, or a v1 constraint?

6. **How should a Monet workspace with dark mode present two files?** `DESIGN.md` +
   `DESIGN.dark.md` with `theme: light|dark` follows Atlassian's precedent but doubles the
   artifact and loses the relationship between them. A single file with a non-spec `modes:`
   key would preserve it but break conformance. Precedent-following or fidelity?

7. **Is `alpha` too early?** The spec says to expect breaking change, and the corpus already
   contains two incompatible generations of its own house format (64 v2, 10 v1). Is a
   deterministic emitter cheap enough to absorb a v2 spec, or should Monet wait for beta?

8. **Does an export-only stance actually differentiate, or does it commoditise Monet?** Once
   a user can generate a DESIGN.md, some will stop opening Monet. The argument in §10 is that
   the file is a snapshot and the source keeps its value — but that argument should be
   stress-tested, because it is the load-bearing assumption behind the recommendation.

---

## Appendix — sources consulted

| Source | Used for |
| --- | --- |
| `github.com/google-labs-code/design.md` — repo metadata, `docs/spec.md` | normative schema, section order, consumer behaviour, licence |
| `@google/design.md` on npm (v0.4.0) — README | CLI surface, lint rules, DTCG/Tailwind exporters |
| `blog.google` — Stitch DESIGN.md announcement | origin, intent |
| `github.com/VoltAgent/awesome-design-md` — README, CONTRIBUTING, LICENSE, all 74 `DESIGN.md`, brand `README.md` stubs | corpus census, conventions, attribution, commercial context |
| `github.com/VoltAgent/official-design-md` — README | first-party adopters |
| `atlassian.design/DESIGN.md`, `vercel.com/design.md`, `resend.com/design.md` | real-world divergence from the spec |
| Monet at `1f2a5be` — `shared/model.ts`, `shared/compactContext.ts`, `shared/contrast.ts`, `src/exportFormats.ts`, `src/previewCompiler.ts`, `server/referenceAnalysis.ts`, `docs/ARCHITECTURE.md`, `docs/MCP.md`, `AGENTS.md`, and the bundled workspace | domain model, projections, token inventory, invariants |

All corpus measurements in §3.2, §4.2, §4.4, and §9.1 were produced by a throwaway parser
over files downloaded to a scratch directory outside this repository. No third-party design
content was copied into Monet.
