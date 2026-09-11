# Preset Profiles V1 — implementation report

Implemented on `codex/preset-profiles-v1`, based on main
`4e5bad0e0ed77e54f1a117f404badcaf29cea925`. Local and remote main were checked before
implementation: Profiles V1, Surfaces V1.1 and resumable Project onboarding were
already merged. This task has not merged or modified main.

## 1. Research findings

Structured native token sources and explicit component usage guidance provide a
stronger preset foundation than a palette or a brand-site reconstruction. The most
important adaptations are choosing a coherent configuration, mapping semantic
roles, describing behavior without claiming to implement it, and retaining license
boundaries between code, documentation and assets.

The [research/decision document](research/preset-profiles-v1.md) was written before
implementation. It includes coverage across principles, foundations, colors/semantic
tokens, type, spacing, radius, borders, elevation, motion, layout, components/states,
patterns, modes and accessibility; primary-source links; licensing decisions; and
an exact [candidate source audit](research/preset-source-audit.json).

## 2–4. Ranking, selected presets and deferrals

| Rank | Candidate | Decision |
| --- | --- | --- |
| 1 | Radix | V1: approachable SaaS, productivity and developer tools; explicit scales/variants and MIT source. |
| 2 | Carbon | V1: distinct square, dense data/admin direction, productive typography and detailed component guidance. |
| 3 | USWDS | V1: public-service forms/content, strong principles, accessible patterns and honest light-only coverage. |
| 4 | Primer | Next: strong structured semantics and collaboration workflows; overlaps the initial product/data choices. |
| 5 | Spectrum | Next: creative tools; select density/platform axes deliberately. |
| 6 | GOV.UK | Later: excellent transaction patterns; overlaps USWDS in this small catalog. |
| 7 | Ant Design | Later: freeze algorithm outputs; broad admin scope overlaps Carbon. |
| 8 | Fluent | Later: choose platform/density and separately review fonts/icons. |
| 9 | Material 3 | Later: consumer diversity, but dynamic color/state layers need careful representation; Material Web is in maintenance mode. |
| 10 | shadcn/Tailwind | Defer: choose an actual style/version; utility scales alone are not a full decision system. |
| — | Atlassian | Reject for general V1 bundling under the current restrictive ADS license; individually licensed OSS is a separate review. |
| — | DESIGN.md / VoltAgent lists | Discovery/reference only. A format or aggregator license does not clear every linked design document. |

The three external packages ship alongside the existing frozen **Monet Starter**
and **Blank**. None introduces a Monet Theme requirement.

## 5. Licensing and provenance

Radix carries separate MIT notices for Themes, Colors and website docs. Carbon
carries both Apache-2.0 licenses, applicable IBM source copyright headers and
modification disclosure; neither inspected repository had an upstream NOTICE file.
USWDS carries the actual public-domain/CC0 license files and their third-party
exceptions. No font binaries, icons, logos, brand images or runtime components are
included. Names describe unofficial provenance, not endorsement.

Every actual incorporated file is pinned by repository commit, URL and SHA-256;
its bytes remain in `presets/evidence/`. Every native record/token has provenance
classified as upstream fact, Monet adaptation or Monet-authored packaging. Full
notices, omissions and provenance are copied into the new Profile and retained on
fork. The Profile UI can inspect/download this snapshot after catalog removal.

## 6–8. Architecture, mapping and UX

Strict versioned native packages live in `presets/catalog/`. A checked-in index pins
ID/version/digest. Server-only loading validates bounded regular files, schema,
checksums, links, uniqueness, provenance coverage, modes and workspace integrity
before staging. Client requests select an inspected identity/version/hash; they
cannot supply source URLs, paths or packages. Creation is offline and deterministic
apart from the new Profile's identity/name/time.

ProfileRegistry reuses durable staged publication and retains its existing ownership
and write boundaries. Recovery verifies exact publication identity, archived
provenance, initial native-file hashes, notices and validation without consulting
today's catalog. Interrupted onboarding reuses its reserved Profile/Project IDs.
Existing Profiles contain ordinary editable records and have no live dependency on
this catalog. MCP remains read-only; Safe Apply targets and private evidence scopes
are unchanged.

Direct scalar facts keep source keys/units; selected configurations, normalized
aliases and condensed guidance are labeled adaptations. Taxonomy, grouping and
packaging are labeled Monet-authored. Missing decisions remain absent or in linked
guidance. Foundation mode values go through the existing shared resolver. Validation
now checks dark references and contrast even when a Profile has no Theme.

Both the Profile picker and inline Project onboarding offer Blank, Monet Starter and
Preset. A shared chooser shows descriptions, product suitability, characteristics,
source, supported modes, a token illustration, exact record counts, example guidance,
resolved tokens, omissions and bundled notices. Choosing a card pins that version.
Keyboard/mobile selection and incomplete-selection guards are covered by browser tests.

## 9. Exact coverage

| Preset | Principles | Foundations | Tokens | Components | Patterns | Modes |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Radix Product | 2 | 7 | 85 | 5 | 2 | Light, dark |
| Carbon Product | 2 | 8 | 69 | 5 | 2 | Light, dark |
| USWDS Public Service | 5 | 7 | 53 | 5 | 2 | Light |

Each also includes one taxonomy category with five component concepts and one
mapped Source record. All include color, typography, spacing, radius, elevation,
layout and border guidance; Carbon also includes motion. Radix components are
button/text-input/table/dialog/card; Carbon button/text-input/data-table/dialog/
notification; USWDS button/text-input/table/alert/checkbox.

The [guide](PRESETS.md#catalog-100) lists every principle, Foundation and token count,
component, pattern, taxonomy and Source ID. Each linked JSON package contains the
complete exact records, values and per-token provenance. No Primitives, References,
private evidence, decision histories or Themes are seeded.

## 10. Verification

| Check | Result |
| --- | --- |
| Full `pnpm check`, isolated implementation snapshot with pristine tracked main fixture | **PASS**: build, ESLint, 45 files / 581 tests, workspace validation |
| `pnpm test:surfaces:browser`, current checkout | **PASS**: all 22 browser tests, including five new preset cases |
| `pnpm validate`, current checkout | **PASS**: current workspace consistent |
| Separate `pnpm test:mcp`, current checkout | **PASS**: 3 files / 24 protocol tests |
| `git diff --check` | **PASS** |
| Visual inspection | Desktop Carbon dark preview, populated guidance/token inspection and narrow mobile chooser inspected |

The original current-checkout `pnpm check` exposed failures in pre-existing starter
fixture expectations and a `.DS_Store` text-scan artifact. All three were reproduced
using **untouched main application code plus the current workspace**: decision
candidate/history coverage, canonical source mapping coverage, and an Apply test
that reads every copied non-private file as text. The edited `monet/DESIGN_SYSTEM.md`,
`monet/components/decisions.json`, `monet/sources/registry.json` and ignored Finder
metadata were preserved.

To distinguish those baseline failures, the final full check used a temporary source
snapshot of this implementation with only the tracked starter fixture restored from
`4e5bad0e0ed77e54f1a117f404badcaf29cea925`. It reused the installed dependency tree
with `pnpm_config_verify_deps_before_run=false pnpm check`; no dependency or lockfile
change was needed. This is a clean-fixture pass, **not a claim that the dirty
checkout's full test command is green**. The actual current workspace separately
passes `pnpm validate`, all 24 MCP tests and the browser suite.

Durable preset test files use 30-second test budgets. The existing 6,100-file
Project-discovery fixture has a 60-second budget so file creation can complete
alongside the expanded fsync-heavy suite; assertions and production bounds are
unchanged. The full final run has no skipped tests.

The tests cover each preset's repeat/independent creation, identity uniqueness,
editing and forks; update/removal isolation; all modes without Themes; native-record,
source-evidence and notice validation; malformed/unsupported packages; interrupted
seed/publication and corrupt recovery evidence; retained onboarding identity/version;
MCP compact/full context and resources; Build With It; Projects, Surfaces, Gaps and
Safe Apply across Profiles; Host/Origin protections; mobile/keyboard UI; lost
responses and service restarts. No external provider is needed.

## 11. Known limitations

- These are reviewed coherent subsets, not exhaustive upstream systems or component
  implementations: five component decisions and two compositions each.
- Radix freezes violet/mauve, medium radius and 100% scale. Carbon freezes White/Gray
  100, productive type and one layer context. USWDS is light-only and deliberately
  substitutes local system/Georgia stacks for separately licensed font assets.
- Font availability affects rendering. No runtime keyboard/accessibility behavior,
  responsive implementation, recursive layers, density axes or dynamic color engine
  is supplied. The preview illustrates tokens; it is not a conformance certificate.
- Carbon preserves two upstream light-mode text pairs at about 4.55:1, above the 4.5:1
  floor but below Monet's 4.75:1 margin. These remain two explicit validation warnings.
- Standalone token/Markdown exports do not embed full license sidecars. Include the
  retained/downloadable notices when sharing adapted material.
- A pending seed with corrupt evidence fails closed and needs repair. Before a seed
  is durably published, a removed version must be restored or a new operation started;
  the server will not substitute another version.
- The existing short-desktop sidebar can place Agent context below the viewport;
  the preset desktop tests use the same tall viewport convention as existing UI tests.
  Mobile navigation and the preset modal work through the existing menu.
- Pre-existing edited starter data and ignored Finder metadata cause baseline test
  failures in the user's checkout; they were preserved, not folded into this change.

## 12. Future catalog

Prioritize Primer, Spectrum and GOV.UK with the configuration and license work above.
Broaden each existing preset only when source evidence supports the added decisions.
Generic DESIGN.md import, inheritance, auto-update, marketplaces, AI-generated presets,
Theme removal and semantic redesign of connected projects remain separate work.

## 13. Merge recommendation

**MERGE WITH FOLLOW-UP.** The scoped implementation is ready for review and
local dogfooding: all 581 tests pass with main's clean fixture and all 22 browser
tests pass in the current checkout. Merge only the feature changes; reconcile the
pre-existing starter edits/test expectations separately. Track the existing
short-viewport sidebar issue independently, and preserve the documented Carbon
margin warnings and preset coverage limits.

Research and implementation are separate feature-branch commits. No merge to main
has been performed. The user's existing starter modifications remain uncommitted
and excluded from those commits.
