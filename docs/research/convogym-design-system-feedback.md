# ConvoGym feedback for Monet design knowledge and retrieval

Date: 2026-09-08. Status: actionable local research; not externally published.
Consumer corrections are complete at AriesKG commit `49d509d`. Monet changes
recommended below have **not** been implemented.

## Purpose and source of truth

Use this brief to improve Monet from a real application integration. It owns the
prioritized recommendations, root-cause interpretation and suggested regression
scenarios. [ConvoGym integration findings](convogym-integration.md) owns the
historical query results, M1–M5 evidence and comparison record. Keep their IDs
stable; update both documents' status when resolving a finding. This is separate
from the consumer's implementation/refresh guide, AriesKG
`apps/convogym/docs/MONET.md`.

## Executive summary

ConvoGym is a local-first conversation practice application. Its main flow is
Describe → Build exercise → Review/Prep → Conversation → Transcript → Practice
again or copy a package for external review. Its six surfaces are Home, Exercise,
Session, Transcript, Sessions and Settings. It does not score or evaluate practice.

The agent consumed Monet's bundled Default workspace at `3790c61` through actual
stdio MCP initialization, scoped `get_design_context`, full record/resource reads,
resolved light/dark tokens and `review_design_usage`. A local CSS adapter contains
82 used canonical roles; Monet is neither a runtime service nor a component-library
dependency. Typography, fields, selected navigation and shared appearance roles
provided a useful, consistent foundation. Content composition still required
consumer decisions where Monet had no relevant pattern.

The largest integration regression was incorrectly demoting each card's Start.
Monet already permits one primary action **per logical region**. The consumer
misapplied adequate guidance. A related system weakness deserves action: “subtle”
and “minimal” can be interpreted as removing resting affordance entirely. Quiet
interface ≠ quiet actions. People must recognize available controls and the likely
next action without hovering. Improve examples and preserve decision-critical
qualifiers in compact context, rather than introducing a new palette or forbidding
repeated primaries across independent cards.

## Evidence and reproduction

- Immediately pre-Monet consumer: `2d1692e`.
- Initial Monet integration: `e661b7a`, the immediate successor.
- Targeted correction: `49d509d`; this is the version represented by corrected
  screenshots below. The two earlier versions were rendered from separate git
  checkouts using the same synthetic data, routes and states.
- Viewports: desktop 1440×1000, tablet 834×1112, mobile 390×844; all in light and
  dark. Comparison included all six surfaces, plus Home action rest/hover/focus,
  builder loading/error, prep, transcript and navigation states.
- Correction validation: five browser scenarios × six configurations = 30 passing
  tests. ConvoGym lint, typecheck, 99 unit tests and production build pass. Monet
  `pnpm check` passes: build, lint, 338 tests and workspace validation.
- Test fixtures and reproduction: AriesKG `apps/convogym/e2e/design.spec.ts` and
  `playwright.config.ts`; run `pnpm test:browser` from that application. Fixtures
  isolate browser storage and model endpoints; no account or private conversation
  is needed. Physical audio quality is outside this visual review.

Representative assets are actual browser captures with synthetic/built-in content.
Before/initial card crops use the same 373px-wide card at desktop-light. Corrected
captures show the composition, not just the button in isolation:

| Before integration | Initial Monet integration |
| --- | --- |
| ![Pre-Monet card: wide filled Start and contained Open](convogym-feedback-assets/pre-card.png) | ![Initial Monet card: outlined Start and borderless Open](convogym-feedback-assets/initial-card.png) |
| ![Pre-Monet builder action pair](convogym-feedback-assets/pre-builder.png) | ![Initial Monet builder action pair](convogym-feedback-assets/initial-builder.png) |

[Corrected builder and navigation](convogym-feedback-assets/corrected-home.png),
[repeated cards, desktop dark](convogym-feedback-assets/corrected-grid-dark.png),
[repeated cards, mobile light](convogym-feedback-assets/corrected-grid-mobile.png),
[ordinary versus destructive exercise commands](convogym-feedback-assets/corrected-exercise.png),
[reachable Session controls, mobile dark](convogym-feedback-assets/corrected-session.png),
[readable long-name history, mobile dark](convogym-feedback-assets/corrected-history.png).

## What worked, and what the comparison actually shows

| Area | Pre-Monet → initial Monet observation | Classification and ownership |
| --- | --- | --- |
| Selected navigation | Filled, prominent selection → quieter selected surface and accent edge | **Monet improvement.** Current location remains recognizable without competing with task actions. Preserve this treatment. |
| Card Start/Open | Wide filled Start plus contained Open → low-emphasis outlined Start and uncontained Open | **Regression.** Start is an implementation error despite adequate guidance. Open's missing resting cue illustrates M5. Corrected to compact filled Start and an underlined link. |
| Builder/routine commands | Contained Copy, Edit and similar controls → same-surface borderless labels | **Regression.** Semantics and good label contrast did not preserve discoverability; M5 contributed. Corrected with existing secondary surface/foreground/strong-border roles. |
| Destructive versus ordinary actions | Routine controls had boundaries → Delete retained an edge while routine ghost commands lost theirs | **Regression.** Consumer variant composition made danger stand out for the wrong reason. Corrected to equal boundary strength; danger retains semantic text color and deliberate confirmation treatment. |
| Settings placement | Separated configuration → same navigation group spacing as practice | **Regression in workflow hierarchy.** Consumer composition decision, not a missing Monet rule. Restored a spatial gap while retaining quiet selection. |
| Generated materials | Raw/monospace presentation → semantic prose, headings, links and numeric tables | **Monet improvement in the integrated result**, supported by foundations; the mixed-document renderer and safety decisions were consumer-owned because M2 is unresolved. Do not imply Monet supplied the missing composition. |
| Prep/context | Less consistent grouping → shared fact/material sections with disclosures | **Monet improvement in hierarchy/consistency.** Preserve readable grouping and focused Session access to context. Native disclosure choice was consumer-owned after M1. |
| Fields/forms | Weaker boundaries/less consistent state treatment → semantic strong field edges, selected choices and explicit-save checkboxes | **Monet improvement.** Clearer entry and selection states in both appearances. Retain labels, pending/save feedback and native semantics. |
| Focus/hover | Existing 2px keyboard focus → retained 2px ring with shared roles | **Neutral for the presence/width of focus.** Both versions had it. Consistent appearance roles help, but focus/hover cannot replace resting affordance. |
| Session layout | Narrow controls could be crowded → wrapping header, reachable End/composer, shared light/dark surfaces | **Monet improvement in the integration.** Responsive layout implementation plus foundation roles improved usability. Keep the focused shell. |
| History | Heavier presentation → compact rows and underlined navigation | **Monet improvement for ordinary content.** Follow-up long-name fixture exposed a consumer grid-sizing bug on narrow layouts; fixed in `49d509d`. Do not generalize this success to all content lengths. |
| Builder measure/density | Wider builder → 720px reading measure; examples wrap and library actions move lower | **Unclear / subjective.** Readability versus scan depth; no evidence requiring another redesign or a new Monet rule. |
| Narrow navigation | Direct destinations → Menu drawer below the sidebar breakpoint | **Unclear / subjective.** Gains workspace, adds an access step. Retain current implementation; no demonstrated missing responsive-navigation rule. |
| Transcript next action | More competing emphasis → Practice again is sole filled action | **Unclear / subjective.** Supports repetition; external review could be a different product priority. Monet cannot choose that priority. Secondary copy/export must still look available. |

The correction also made Session transcript toggles, voice controls, export/import
and recovery commands visibly contained, and the Session title a recognizable
navigation link. These were the same resting-affordance issue, not additional
feature work. Long-name history was a consumer CSS sizing error: an unconstrained
`auto` track compressed the adjacent link to approximately one character per line.
Two bounded flexible tracks retain the compact layout below the desktop breakpoint.

## Findings for Monet

### M1 — Context disclosure is confused with Context Menu

**Context:** A responsive conversation contains messages, a composer, voice
controls and prep/context disclosure.

**Expected Monet guidance:** Relevant disclosure, text-entry and scrolling
components; unrelated menu interactions should not dominate this task.

**Observed behavior:** Query `Responsive conversation transcript with partner
messages, text composer, voice controls and context disclosure` retrieved Context
Menu, Alert, Fieldset, Field, Label and Dropdown Menu, plus Settings. Textarea and
Accordion were absent. `coverage: task_specific`, no notices. That coverage label
only guarantees at least one match; it does not promise completeness.

**Result in ConvoGym:** The agent used native disclosure, textarea and a native
scroll region after foundations and targeted lookup. Blind application could have
produced the wrong interaction.

**Root cause classification:** **Retrieval problem.** Useful individual components
already exist; this is not evidence that Monet needs a dedicated chat component.

**Recommended Monet improvement:** Improve semantic ranking/context interpretation
for “context disclosure” and “composer”; test paraphrases that separate information
disclosure from contextual menus. Avoid product-specific aliases or exact-result
snapshots. Priority: **High**, because wrong component guidance can change behavior.

### M2 — No readable generated-document composition

**Context:** Generated case material mixes headings, prose, lists, quotes, links,
code and numeric tables inside an exercise/prep panel.

**Expected Monet guidance:** Embedded heading hierarchy, readable measure, prose
versus code typography, long text, numeric precision/alignment and narrow overflow;
state which content-trust/media decisions belong to the consumer.

**Observed behavior:** `Readable generated Markdown case briefs, tables, numbers
and prep materials inside exercise panels` retrieved Number Input, Table, Data
Table, Card and data-table/filtering patterns. Follow-up `generated Markdown prose
with headings lists blockquotes code links and tables` returned Link/Table/Data
Table/List plus collection controls, Master-detail and an irrelevant undecided Tree
notice. There was no readable-document/Markdown pattern in the catalog.

**Result in ConvoGym:** React Markdown + GFM, scoped semantic prose, wrapping facts,
numeric alignment preserving precision, and named focusable horizontal table
regions. No raw HTML execution or automatic remote media loading. These decisions
were assembled by the consumer rather than delivered as a coherent Monet pattern.

**Root cause classification:** **Missing Monet rule/pattern**, plus a **retrieval
problem** that overweights collection workflows. Existing typography/table rules
were useful but insufficient composition guidance.

**Recommended Monet improvement:** Add one framework-neutral readable-document
pattern linking Typography, Table, Link and Scroll Area, with a mixed-content
example and narrow behavior. Distinguish static numeric information from editable
numeric inputs and data-grid operations. Describe trust/media as explicit consumer
choices rather than prescribe a React library. Priority: **Medium**.

### M3 — Table divider instructions conflict

**Context:** Quiet horizontal separators in generated case tables.

**Expected Monet guidance:** One unambiguous semantic role for row dividers.

**Observed behavior:** Table's `row_dividers` preference is `token:border.subtle`,
while Notes prescribe horizontal dividers in `color.border`. These resolve to
different colors. Borders foundation also names `border.subtle` for table rules.

**Result in ConvoGym:** Used `border.subtle`, following foundation/preference
precedence. A different agent could reasonably notice the contradictory Notes.

**Root cause classification:** **Ambiguous Monet rule** from conflicting records.
This is not a ranking problem; the contradiction is in delivered knowledge.

**Recommended Monet improvement:** Align Notes with the authoritative preference;
add a targeted integrity assertion where structured roles are repeated. Do not add
a brittle general natural-language contradiction detector. Priority: **Medium**
for deterministic consistency, though visual impact here was low.

### M4 — A font-family token does not deliver the font

**Context:** Render Mona Sans reliably in a local/offline consumer.

**Expected Monet guidance:** Delivery ownership, source/license pointer, registration,
fallback behavior and a loaded-font verification step.

**Observed behavior:** `font.family.sans` names Mona Sans with system fallbacks.
Typography did not explain delivery. `src/previewCompiler.ts` names the family but
has no face registration; no font assets were found in `public/` at review time.

**Result in ConvoGym:** Bundled Fontsource variable Mona Sans Latin, registered
under the canonical name, then checked loaded state in the browser. A correct
family string alone would silently permit system fallback.

**Root cause classification:** **Missing Monet rule** for consumption ownership.

**Recommended Monet improvement:** Document consumer-owned font delivery, provide
a source/license reference and offline-friendly example, and distinguish declared
family from loaded face. Do not require a Monet runtime font service. Priority: **Low**.

### M5 — “Subtle/minimal” does not specify resting affordance

**Context:** Build + Copy, repeated card Start + Open, and ordinary commands beside
Delete on same-color cards; both appearances, touch, keyboard and mouse.

**Expected Monet guidance:** Recognizable secondary containment, tertiary navigation
and button examples; primary rank per region; resting/hover/focus/disabled states;
control versus structural boundaries and destructive-relative emphasis.

**Observed behavior:** Scoped action-hierarchy and resting-affordance queries
returned Button, Card, the primary-action principle, Color and Borders with
`task_specific` coverage and no notices. Button specifies filled primary, subtle
secondary, minimal tertiary, one primary per region. Card permits a primary in its
header/footer. There is no concrete state/role composition explaining subtle versus
minimal on a same-color surface. Unfilled-control border examples focus on fields,
checkboxes and selects rather than Buttons.

The full principle says to use the lowest emphasis variant “that still reads as
available.” `shared/compactContext.ts` compacts the lead paragraph and Avoid
bullets, dropping that How-to-apply qualifier. The full resource is linked and the
integration read it. This is a reinforcement gap, not an unavailable-rule excuse.

**Result in ConvoGym:** `.button.ghost` removed boundaries while inheriting the
card's surface/foreground. Copy, Edit, Remix and Start this one looked like text.
Initial outlined Start used structural `border.default`: boundary contrast measured
1.44:1 light and 1.73:1 dark, below Monet's 3:1 control-boundary target. Labels had
strong contrast (10.98:1/13.54:1); hover fill differences were only 1.07:1/1.16:1.
A later focus ring did not solve discovery. These figures apply to the measured
pairings, not a claim that every text-labeled control requires a border under an
external accessibility standard.

**Root cause classification:** **Interaction between Monet guidance and
implementation**, with **ambiguous Monet rule/examples** and **retrieval compaction**
contributing. Separately, demoting card Start was an **implementation mistake despite
adequate Monet guidance**. Do not record it as a missing primary-action rule.

**Recommended Monet improvement:** Add a compact Button state matrix and composed
builder/card-grid example. Show filled primary, contained secondary and recognizable
minimal text navigation or tertiary command; identify existing roles. Explain that
link semantics, button semantics and visual emphasis are separate choices: Open
navigates, Copy executes a command, and either still needs a recognizable resting
cue. Include ordinary/destructive neighbors and a no-hover case. Preserve the
availability qualifier in compact output. Priority: **High**.

## Legitimate consumer exceptions and limits

These do not warrant new global Monet rules:

- Focused Session omits the normal sidebar but shares tokens and appearance.
- Whole-package copy uses a text label to state scope, rather than an adjacent-value
  icon. Case facts wrap instead of truncating to uniform data-grid rows.
- Prep and post-session disclosures are temporary, without persistent open state
  or document-catalog URLs. Private partner information stays hidden before/during
  practice; this is a product requirement, not missing design knowledge.
- Settings placement and Transcript's repeat-versus-review priority are consumer
  workflow choices. Current evidence does not justify new responsive navigation
  rules, an alternate theme, wider Start buttons or a mandatory chat component.

Monet evidence review checked 116 submitted observations per mode both at initial
integration and after correction, with no findings/warnings: 82 token references,
eight component IDs and 26 computed values/pairings. This **did not certify action
hierarchy**. The initial submitted observations did not measure these button
boundaries or the collapsed history track. Corrected browser assertions separately
measure secondary boundaries ≥3:1, link affordance, primary width/rank, touch targets
and history-link width; human screenshot review evaluates the composition.

Full-page screenshots in the tested Chrome/Playwright combination reset touch
emulation during a test. Mobile viewport captures, actual coarse-pointer checks and
a real tap preserve the validity of touch assertions. This is test-harness behavior,
not a Monet defect. Desktop/tablet screenshots can capture full pages. No horizontal
overflow alone is insufficient evidence: a one-character-wide wrapped link can pass.

## Focused priorities: design knowledge versus MCP delivery

| Priority | Design-system work | MCP/retrieval work | Acceptance evidence |
| --- | --- | --- | --- |
| **High — M5** | Button state matrix; ordinary/destructive pair; compact repeated primaries + tertiary navigation example; link/command distinction | Retain availability qualifier in compact principle; deliver region/composition context with Button/Card | Cold resting view and touch reveal actions; secondary is recognizable without competing with primary; natural hierarchy prompts retain the guardrail |
| **High — M1** | Reuse existing disclosure/input/scroll guidance | Distinguish semantic disclosure/composer from Context Menu/settings; improve ranking with paraphrases | Relevant disclosure/input records present; irrelevant contextual-menu/settings matches do not dominate |
| **Medium — M2** | One readable generated-document pattern with mixed content and narrow tables | Retrieve document composition for prose+tables, suppress input/grid/tree noise when inapplicable | Static case briefs get coherent content guidance, not merely a collection of components |
| **Medium — M3** | Reconcile Table divider Notes and preference | No ranking change needed | Foundation, preference and Notes agree; targeted integrity test |
| **Low — M4** | Explicit consumer font ownership/source/license/fallback guidance | Make delivery guidance reachable from typography consumption tasks | Consumer can verify the intended loaded face without runtime coupling |

Avoid dumping every full rule into compact responses. Preserve constraints that
change an implementation decision and link to fuller records/examples. Retrieval
cannot fix knowledge that does not exist, and adding knowledge will not by itself
fix misleading concept matching. Do not make conformance review infer a failure
from missing observations; improve the evidence-submission examples instead.

## Small reusable regression suite for Monet

Use natural task prompts and rendered compositions, rather than hardcoded ConvoGym
labels. For retrieval tests, assert expected and forbidden IDs where appropriate;
do not pin an exact result set or add an alias for each prompt.

| Scenario | Retrieval/knowledge expectation | Rendered acceptance |
| --- | --- | --- |
| Builder plus 6–12 cards, each Start + Open | Button/Card and primary-per-region rule; availability qualifier survives compaction | Primary in each independent card; compact repeated fill; recognizable tertiary navigation at rest |
| Build + Copy alternative | Secondary/tertiary roles and state example | Contained secondary command; primary immediately obvious in light/dark; hover is additional feedback |
| Edit/Remix beside Delete, then confirmation | Destructive-actions guidance with ordinary controls | Delete has semantic warning without being the only visibly bounded action; confirmation and keyboard focus remain clear |
| Responsive application navigation with Settings | Existing shell/navigation guidance | Quiet active selection; practice/configuration separation; operable drawer, returned focus and no overflow; no requirement to invent another navigation rule |
| Prose before/after numeric table with code/links | Readable-document pattern plus relevant foundations; no Number Input or unrelated Tree emphasis | Scoped headings, preserved precision, readable facts, contained keyboard-accessible table/code scrolling |
| Long case and history names on narrow screens | Wrapping and layout guidance; no automatic truncation prescription | Facts and navigation remain readable; measure usable column width as well as absence of overflow |
| Focused conversation with composer/context disclosure | Disclosure/Textarea/scroll guidance; Context Menu is not a substitute | Reachable End and composer, recognizable transcript toggle, no forced sidebar, keyboard access to context |
| Every action composition on light/dark and no-hover touch | Semantic foreground/surface/control-border roles, focus and target guidance | ≥44px coarse targets in this consumer, visible resting cues, focus ring and working tap; label contrast alone is insufficient |

## Suggested next-agent workflow

1. Read this brief and the M1–M5 raw evidence; inspect current Monet records before
   assuming the observed revision still matches. Reproduce retrieval using natural
   prompts and the active workspace, without hardcoding the bundled root.
2. Address the focused priorities above. For design knowledge, edit canonical
   records and regenerate derived output; do not hand-edit generated exports.
   Keep the shared-layer/MCP boundaries and read-only MCP contract.
3. Add paraphrase retrieval regressions in `shared/retrievalEvaluation.test.ts`,
   compact guardrail coverage in `shared/compactContext.test.ts`, and relevant
   record invariants in `shared/designIntegrity.test.ts`/validation. Reuse centralized
   color contracts instead of parallel contrast rules.
4. Render the small compositions in both appearances and narrow/touch conditions.
   Review hierarchy/resting cues alongside measured tokens. Run `pnpm check`.
5. Reconcile resolution status in this brief and the raw report. Consumer fixes are
   already complete; don't re-demote Start or restore the entire pre-Monet design.
   External publication requires separate authorization.
