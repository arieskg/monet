# ConvoGym consumer integration findings

Status: historical integration/comparison evidence, 2026-09-07–08. Monet findings
remain open; consumer action corrections completed at AriesKG `49d509d`. Local only;
no external publication is authorized for this follow-up.
Design authority: Monet `3790c61`, bundled workspace, Default theme, light/dark.
Consumer: AriesKG `apps/convogym`.

The consumer used the actual local stdio MCP server: initialize, catalog/resource
reads, scoped `get_design_context`, full relevant records, and
`review_design_usage`. The server was launched through `node --import tsx`
because the task did not have a pre-attached Monet tool. This is a client
configuration fact, not a Monet defect. No starter-workspace records changed.

This report owns the detailed historical retrieval/comparison evidence and stable
M1–M5 finding IDs. The companion [design-system feedback brief](convogym-design-system-feedback.md)
owns actionable recommendations, root-cause interpretation, priorities and reusable
validation scenarios for a future Monet agent. Read it for current follow-up scope;
update both documents when resolving a finding. No external issue has been posted.

## M1 — Context disclosure retrieved as Context Menu

**Impact: medium.** A plausible query can lead a consumer to the wrong interaction.

- **Task:** conversation turns, a text composer, voice controls, and a disclosure
  containing prep/context.
- **Query:** `Responsive conversation transcript with partner messages, text composer, voice controls and context disclosure`.
- **Expected:** disclosure, text-entry and scrolling guidance, with absent
  conversation-specific opinions distinguished from unrelated matches.
- **Actual:** `coverage: task_specific`, no notices. Components: `context-menu`,
  `alert`, `fieldset`, `field`, `label`, `dropdown-menu`; pattern: `settings`.
- **Problem:** contextual information is not a right-click menu, and a live
  conversation is not a settings form. Textarea and Accordion were omitted.
  The documented coverage field only promises at least one match, so this is
  not a claim that `task_specific` promises complete coverage.
- **Consumer decision:** familiar native disclosure, textarea and native scroll
  region, using foundations and targeted component lookup.
- **Improvement:** natural-language retrieval regressions distinguishing context
  disclosure from Context Menu and composer input from generic field utility.
  Fix concept matching, not ConvoGym-specific query aliases.

## M2 — Missing generated-document/Markdown composition guidance

**Impact: medium.** Individual rules are useful but do not compose into a
readable generated brief without several unrecorded consumer decisions.

- **Task:** headings, prose, lists, quotes, links, code and numeric tables in
  generated case props, including text before and after a table.
- **Queries:** `Readable generated Markdown case briefs, tables, numbers and prep materials inside exercise panels`; then `generated Markdown prose with headings lists blockquotes code links and tables`.
- **Expected:** readable-document hierarchy, measure, embedded heading ranks,
  prose versus code typography, overflow and numeric alignment, and a stated
  boundary for consumer content-safety/media decisions.
- **Actual:** first query returned Number Input, Table, Data Table, Card and
  Data tables/Filtering patterns. Follow-up returned Link/Table/Data Table/List
  plus collection controls, Data tables/Master-detail, and an undecided Tree
  notice. The catalog has no readable-document or Markdown pattern.
- **Problem:** collection workflows do not explain mixed generated documents.
  Consumers can end up with raw monospace output or unnecessary interactive
  data-grid affordances. The irrelevant Tree notice adds noise.
- **Consumer decision:** React Markdown + GFM; semantic prose; scoped headings;
  named, focusable horizontal table scrolling; sticky column headers; numeric
  alignment preserving source precision; wrapping rather than truncating case
  facts; no raw HTML execution or automatic remote media loading.
- **Improvement:** a framework-neutral readable/generated-document pattern that
  connects Typography, Table, Link and Scroll Area with a mixed-content example,
  narrow-width behavior, and explicit consumer choices for trusted/untrusted content.

## M3 — Contradictory Table divider roles

**Impact: low.** Different parts of the same record produce different results.

- **Task/context:** table row separators, `monet://components/table`, retrieved
  by both material queries above.
- **Expected:** one role for quiet horizontal rules.
- **Actual:** preference `row_dividers` is `token:border.subtle`; Notes prescribe
  “horizontal dividers in color.border”. These resolve to different colors.
  The Borders foundation names `border.subtle` for table rules.
- **Problem:** Notes conflict with an explicit preference and foundation.
- **Consumer decision:** `border.subtle`, following the documented precedence.
- **Improvement:** align Table Notes with its preference/Foundation; add an
  integrity check for repeated component role guidance where feasible.

## M4 — Font-delivery ownership is unspecified

**Impact: low.** Correct CSS family names can still render a different font.

- **Task/context:** actual Mona Sans typography in offline local practice;
  Typography foundation and resolved `font.family.sans`.
- **Expected:** who supplies the face, a source/license pointer, and deliberate
  fallback/offline guidance.
- **Actual:** a Mona Sans family string with system fallbacks. No font-delivery
  instruction or bundled font asset; Monet's `src/previewCompiler.ts` names
  the face, but its source has no `@font-face` and `public/` has no font files.
- **Problem:** a consumer may appear token-compliant while silently using a
  system fallback on a machine without the font installed.
- **Consumer decision:** bundle Fontsource's variable Mona Sans Latin font,
  registered under the canonical name; check loaded font state in the browser.
  This is not a request for a Monet runtime dependency.
- **Improvement:** state that consumers own font delivery, provide a source and
  license reference, and include an offline-friendly registration example and
  font-load verification in integration guidance.

## ConvoGym exceptions — not Monet defects

- **Focused Session:** the existing full-viewport conversation workspace omits
  the normal sidebar shell so dialogue and the composer dominate. Tokens and
  appearances are shared; prep is not a second design system.
- **Package copy:** a text-labeled button rather than an adjacent icon communicates
  the scope of the whole export package.
- **Generated material:** variable-height rows and full wrapped names preserve
  case facts rather than enforcing uniform, truncated data-grid rows.
- **Local disclosures:** prep and post-session folds do not persist open state or
  get URL addresses. They are temporary views, not a navigable document catalog.
- **Spoiler boundary:** private partner facts/props are omitted from exercise,
  prep, edit and copied remix previews. Unfinished Transcript URLs return to the
  Session. That boundary is a product requirement, not a missing Monet opinion.

## Validation evidence

The implemented consumer submitted 116 observations per mode to
`review_design_usage`: the 82 CSS token references, eight used component IDs,
and computed browser typography/spacing/radius/contrast samples including input
boundaries. Light and dark each reported 116 checked, no findings/warnings,
no unverifiable and no not-applicable observations. This is evidence review,
not a blanket conformance certification: Monet does not inspect source, layout
or omitted observations.

Browser validation covers the six surfaces at 1440×1000, 834×1112 and 390×844
in light/dark, with long names, mixed Markdown, narrow table scrolling,
generation loading/error recovery, empty history, keyboard navigation/focus,
confirmation cancellation, export, hidden-information boundaries and repeat
practice. A separate live Gemini exercise build and typed session completed
through the real local bridge. Physical microphone/speaker quality is not part
of this design integration test.

Canonical consumer implementation/refresh instructions are in
`apps/convogym/docs/MONET.md` in AriesKG. No scoring, evaluation, rubrics,
recommendations, dashboards or runtime dependency on Monet were introduced.

## M5 — Secondary/tertiary Button variants lack a resting-affordance example

**Impact: medium.** A consumer can use valid tokens and correct HTML controls
while making available actions look like ordinary text. This gap contributed
to the implementation error; it does not justify demoting primary actions.

- **Task:** distinguish Build from Copy prompt instead, card Start from Open,
  and routine exercise actions from destructive actions at rest, hover and focus.
- **Queries:** `Home page with a primary exercise builder and a library of cards. Each card has Start and Open. Build the exercise and Copy prompt instead are alternative actions. How should primary secondary and tertiary button emphasis work across page and card regions?`; and `Clickable secondary buttons and tertiary text actions with visible affordance at rest, hover and keyboard focus, including ghost buttons on same-color cards`.
- **Expected:** a concrete secondary-versus-tertiary treatment on a card surface,
  guidance for a filled page action alongside repeated card-level primary actions,
  and a resting indication of interactivity that does not depend on hover.
- **Actual:** both queries retrieve Button and Card, the primary-action principle,
  Color and Borders; `coverage: task_specific`, no notices. Button states
  `primary_style: filled`, `secondary_style: subtle`, `tertiary_style: minimal`,
  and `action_hierarchy: one primary action per region`. Card allows one primary
  at its bottom/header. These are sufficient to identify card Start's wrong rank.
  However, "subtle" and "minimal" have no explicit state/role composition example
  distinguishing a contained secondary button from a tertiary text action.
  The foundations distinguish structural from control borders, but their unfilled
  control examples name fields/check/select controls, not an outlined Button.
- **Retrieval nuance:** the full primary-action principle qualifies lowest emphasis
  with "that still reads as available". `shared/compactContext.ts:68` returns its
  lead paragraph and Avoid bullets, omitting that How-to-apply sentence. Its full
  resource is linked, and the integration had read it; this is a reinforcement
  opportunity rather than an unavailable-rule excuse.
- **Observed consequence:** ConvoGym's `.button.ghost` removes the border but
  inherits the same surface and foreground as its card. Copy, Edit, Remix and
  Start this one therefore have no visible resting container. Hover changes the
  surface only slightly; a focus ring appears after the control is discovered.
  The outlined Start uses the structural `border.default`: measured boundary
  contrast is 1.44:1 on the light card and 1.73:1 on the dark card. This is below
  Monet's stated 3:1 boundary target, not a claim that all text-labeled buttons
  automatically fail an external accessibility standard. Label contrast is strong.
- **Consumer decision at comparison time:** comparison only; no ConvoGym changes
  implemented in that pass. The approved follow-up below subsequently applied these fixes.
  Recommend filled primary Start within each card, a contained secondary Copy
  and routine command treatment, and visibly recognizable tertiary navigation.
  Use existing primary/on-primary, surface/foreground and strong-border roles.
- **Improvement:** add one framework-neutral Button state matrix and composed
  form-plus-card-grid example. Explain when subtle needs a resting border/fill,
  when minimal text treatment is sufficiently recognizable, and which existing
  roles apply. Include a touch/no-hover case. Retain the availability qualification
  in compact guidance, and recommend reviewing actual button boundaries and
  action ranks alongside token observations. Do not invent a new palette or
  claim evidence review automatically evaluates hierarchy.

## Historical comparison — implementation errors versus design-system gaps

Compared current ConvoGym `e661b7a` with its immediate parent `2d1692e` in
separate local checkouts. All six pages used the same synthetic data and states
at 1440×1000, 834×1112 and 390×844 in light/dark. Home actions were also inspected
at rest, hover and keyboard focus. Existing application code was unchanged.

- **Implementation regression:** Home card Start changed from `button primary`
  to `button`. The integration incorrectly treated the page-level Build action
  as a reason to demote card-level primaries. Monet already says one per logical
  region and explicitly allows one per Card. This is not a retrieval miss.
- **Implementation regression, with M5 contributing:** global ghost treatment
  removed containment from Copy prompt instead and other secondary commands.
  Correct button semantics and generous hit targets did not preserve resting
  affordance. A low-emphasis boundary alone does not establish primary rank.
- **Other tradeoffs:** moving Settings into the main navigation group loses its
  former secondary placement; Menu on narrow layouts gains room but costs direct
  access; a 720px builder improves reading measure but wraps examples and pushes
  desktop library actions down. These are consumer composition decisions.
- **Preserve improvements:** readable Markdown/numeric tables, clearer fields and
  selected states, real light/dark roles, explicit-save checkboxes, underlined
  Sessions links, compact history, and the reachable mobile conversation header
  and composer. Both versions already had a 2px keyboard focus ring; do not
  attribute that existing behavior to this integration.
- **Product-priority judgment:** making Practice again the sole filled Transcript
  action improves repeat-practice emphasis but weakens external-review emphasis.
  Monet cannot decide which is the user's intended next task. Do not silently
  restore two competing primaries or classify that tradeoff as a Monet defect.

The comparison pass itself changed no UI or design records and published nothing.
The approved correction pass below is separate from that historical comparison.


## Approved correction and validation follow-up — 2026-09-08

Consumer implementation: AriesKG `49d509d`. The four approved corrections are
complete: compact filled Start per card; underlined tertiary Open; contained
secondary commands with strong resting boundaries; Settings spaced apart from
practice navigation while preserving quiet selection. Related export/recovery,
Session transcript/voice controls and Session-title navigation now have resting
cues. Ordinary and destructive commands share boundary strength. No Monet
canonical record or retrieval behavior changed; M1–M5 therefore remain open.

A long-name fixture revealed an additional consumer sizing error in narrow
Sessions history: an `auto` grid track compressed the neighboring navigation link
to one character per line without horizontal overflow. Bounded flexible tracks
fix it. The earlier compact-history improvement applies to normal content; it did
not establish correctness for every long-name state. This is a consumer layout
bug, not evidence for a missing Monet rule. The follow-up adds a link-width check.

All six surfaces were rendered at the same three viewport sizes in both modes.
ConvoGym lint, typecheck, 99 unit tests, production build and 30 browser tests pass.
The browser assertions cover primary/secondary/tertiary distinctions, actual
secondary-boundary contrast ≥3:1, compact repeated primaries, 44px mobile targets,
actual taps, keyboard focus, Settings spacing, readable history and no horizontal
overflow. Screenshots were reviewed for composition and ordinary/destructive
hierarchy. Mobile uses viewport captures because full-page screenshots reset
coarse-pointer emulation in the tested Chrome/Playwright setup.

Fresh computed evidence and the current CSS roles were resubmitted to Monet:
116 observations per mode, no findings/warnings. As before, this measures only
submitted evidence; browser boundary/hierarchy/readability checks are separate.
Monet `pnpm check` passes (build, lint, 338 tests, workspace validation). No new
live-model or physical-audio quality claim is made for this visual correction.

The [feedback brief](convogym-design-system-feedback.md) includes portable before,
initial-Monet and corrected browser evidence, explains implementation errors versus
design/retrieval gaps, and prioritizes the remaining Monet work. Both reports and
the assets remain local and unpublished.
