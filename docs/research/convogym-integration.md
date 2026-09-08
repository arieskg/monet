# ConvoGym consumer integration findings

Status: open findings; local report, GitHub publication pending approval. 2026-09-07.
Design authority: Monet `3790c61`, bundled workspace, Default theme, light/dark.
Consumer: AriesKG `apps/convogym`.

The consumer used the actual local stdio MCP server: initialize, catalog/resource
reads, scoped `get_design_context`, full relevant records, and
`review_design_usage`. The server was launched through `node --import tsx`
because the task did not have a pre-attached Monet tool. This is a client
configuration fact, not a Monet defect. No starter-workspace records changed.

This report belongs with Monet's existing product/consumer research reports.
The repository's external issue tracker is GitHub Issues at `arieskg/monet`.
Automatic approval review blocked publishing this payload as potentially
non-public implementation information; no issue was sent. This local report is
the reviewable issue body and tracking record until publication is authorized.

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
