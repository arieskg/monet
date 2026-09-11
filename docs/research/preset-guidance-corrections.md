# Preset Profiles V1 — final guidance audit

This review addresses the package-accuracy findings against implementation commit
`f3da01f` on `codex/preset-profiles-v1`. The initial architecture and licensing
model remain intact. Releases below affect future creation only; no automatic
migration or update is introduced. Main has not been merged.

## P1 disposition

Source IDs below are scoped to the named package and resolve to its bundled,
commit-pinned evidence and SHA-256 manifest entries.

| Finding | Final record and evidence |
| --- | --- |
| 1. Radix accent surface | Renamed to `color.monet.accent-tint`, including the token ID and provenance key. Its opaque violet-3 value is retained as an explicit Monet choice. Colors sources 004/005 and Themes 011/015 distinguish it from actual sRGB `--violet-surface` values `#f9f6ffcc` / `#25193980`. |
| 2. Radix Card ghost | Retained only after adding Themes `card.props.tsx` as source 025: the actual prop definition includes surface/classic/ghost and defaults to surface. Source 022 supports the linked/button `asChild` guidance. Removed the uncited nested-interactive avoidance rule. |
| 3. Radix Table alignment | Removed the numeric-alignment claim. Source 020 supports header-cell types, Cell `justify`, and the surface backplate. The preset does not prescribe numeric alignment or implement sorting/selection/pagination. Removed unsupported avoidance conditions. |
| 4. Radix structured summary | Removed inherited numeric-alignment and ghost-preference statements. Explicitly Monet-authored composition, with sources 022/020/014 for Card, Table and layout. |
| 5. Carbon card radius | Changed `radius.card` from the square-control alias to `4px`. Source 006’s `border-radius.border-radius-04` supplies value 4 and explicitly names cards. The semantic role remains a Monet adaptation. |
| 6. Carbon nested modals | Removed the nesting prohibition from dialog notes/avoidance and transactional-dialog. Source 021 supports short, non-frequent tasks, modal variants and actions/focus; sources 020/013 support input/action guidance. |
| 7. USWDS regular weight | Corrected source 004 attribution to `$theme-font-weight-normal: 400`. Value remains 400; `regular` is explicitly Monet’s normalized name. No upstream regular setting is claimed. |
| 8. USWDS Table | Removed page-layout and narrative prohibitions. Sources 030/031/032 support headers, formatting, summable-number alignment, captions and mobile variants. Avoidance now contains only source 030’s explicit sorting restrictions for merged cells/mobile stacked variants. |
| 9. USWDS Text Input | Preserved the stronger “avoid placeholder text” recommendation even with a separate label. Source 027 explains disappearing instructions and 028 explains contrast. Notes retain answer-length, textarea, interaction-before-validation and accessible-control guidance from 027–029. |
| 10. USWDS generic border | Kept gray-cool-50 `#71767a`, citing palette source 016. Explicitly a Monet editorial role choice, with no claim that it is the upstream default input border. |

Radix color Foundation, semantic-role descriptions, provenance and omissions now
explain that light mauve-1/2 differ from Radix’s white background/solid panel and
translucent surface styling (source 011). Dark opaque steps are identified separately;
no translucent panel equivalence is claimed.

Carbon radius/borders Foundations, input notes and omissions identify the
`enable-v12-release` **disabled** configuration. Source 019 shows that its enabled
branch adds 4px corners and a full gradient border; square buttons are independently
supported by sources 017/018. The adaptation notice now correctly names
`button/_mixins.scss`, rather than calling it a type mixin, alongside text input.

## Mapping P2s addressed

USWDS `font.size.md` remains a 16px Monet body alias, explicitly distinct from
upstream md step 6 (17px); source 004 defines body as sm and source 008 defines
the scale. Font-specific normalization remains omitted. The typography Foundation,
token description, manifest explanation and omissions agree.

Spacing now cites the real `spacing-multiple` function and 8px grid-base definition,
not just a table calling an unexplained function. All 11 selected values are pixel
equivalents at a 16px reference root, labeled adaptations. Shadow 1 now cites the
actual `$system-properties` recipe and those unit definitions, retaining
`0 1px 0.25rem 0 rgba(0, 0, 0, 0.1)` as a resolved adaptation. It does not infer a
component elevation policy. Foundation notes and manifest bindings were updated.
All 207 token-description kind labels agree with their provenance categories.

## Added pinned evidence

Only the four files needed to establish the prop definition and unit/property
mappings were added. They use already-retained MIT or CC0 notices; no new fonts,
assets, dependencies or upstream code execution is involved.

- **radix-product/source-025** — [card.props.tsx](https://github.com/radix-ui/themes/blob/1faff10ac26ae17f09944d418c6949b93fc6b566/packages/radix-ui-themes/src/components/card.props.tsx); MIT.
  SHA-256: `e0a235c62fef9eceee6eb1a79417613d3b1cdcb8bf9e67f265d433b5eec495ab`.
- **uswds-public-service/source-040** — [spacing-multiple.scss](https://github.com/uswds/uswds/blob/a0f9d94081e052365611ebb3eb56fa269b3d52fd/packages/uswds-core/src/styles/functions/units/spacing-multiple.scss); CC0-1.0.
  SHA-256: `b19a54823119a0010c243cb7ae9cec24acdaa625f570f674a93f44e60a7e6a4e`.
- **uswds-public-service/source-041** — [grid-base.scss](https://github.com/uswds/uswds/blob/a0f9d94081e052365611ebb3eb56fa269b3d52fd/packages/uswds-core/src/styles/tokens/units/grid-base.scss); CC0-1.0.
  SHA-256: `49c151610597ae5b35e2cb263e1b1844eba6eb02b91480b63c78a44615f5e30c`.
- **uswds-public-service/source-042** — [_properties.scss](https://github.com/uswds/uswds/blob/a0f9d94081e052365611ebb3eb56fa269b3d52fd/packages/uswds-core/src/styles/_properties.scss); CC0-1.0.
  SHA-256: `5ee7890d9d5e5f9d884d2919203bca09d157062262713d542298b14be21c145c`.

## Release versions and hashes

Package format and Monet schema remain version 1. Preset version and adaptation
version both change as listed. Radix uses a major version because a token name was
removed; Carbon and USWDS use minor versions for corrected mappings/guidance.
Catalog hashes cover the exact checked-in package bytes.

- **radix-product 2.0.0** — SHA-256 `3e5c19e30aad433609c9aface471a31fc1112879017b4bbab91725a8e34097c9`.
- **carbon-product 1.1.0** — SHA-256 `3f5a91c61d2cf4bf7885ea59267aa62059024e548401935936a80eee2122ace4`.
- **uswds-public-service 1.1.0** — SHA-256 `aef6a10a235e4a4be965d9330865b5704010f9439b50f97a0d14e3d33371bbc9`.

## UX and documentation

- Preset selection cards display **Best for** before selection.
- Generated `DESIGN_SYSTEM.md` links to `PRESET.json` and `PRESET-LICENSES.txt`,
  identifies the starting version, and distinguishes later edits. This appears at
  creation or the next normal export write, without rewriting existing Profiles
  merely because the catalog changed. Standalone exports still require notices.
- Missing `PRESET.json` on a published Profile yields a clear status message while
  normal records remain usable. No catalog snapshot is manufactured. Malformed
  provenance remains an error; missing evidence during publication still blocks
  recovery. Server and browser tests cover that distinction.
- The [Profile guide](../PRESETS.md) now documents corrected mappings, configuration
  assumptions, provenance removal and validation warnings. The original report is
  marked as historical and links here.

## Verification

| Check | Final result |
| --- | --- |
| Current checkout `pnpm check` | Build and lint pass; **584 pass / 3 baseline failures** in 46 test files. The test failure prevents the chained validation step. |
| Isolated corrected-code snapshot, pristine tracked starter, `pnpm_config_verify_deps_before_run=false pnpm check` | **PASS**: build, lint, all **587 tests / 46 files**, workspace validation. |
| Separate `pnpm test:mcp` | **PASS**: **24 tests / 3 files**. |
| Focused preset browser suite | **PASS**: all **6 cases**. |
| Full `pnpm test:surfaces:browser` | **PASS**: all **23 cases**, including the 6 preset cases. |
| Current checkout `pnpm validate` | **PASS**: current workspace consistent. |
| `git diff --check` | **PASS**. |

The three current-checkout failures match the baseline reproduced on untouched main
application code during implementation: `shared/designIntegrity.test.ts` expects
retained candidate/history data; `server/catalogCoverage.test.ts` expects the
original source mappings; and `server/proposalApply.test.ts` reads the copied
`.DS_Store` as text. The user's three tracked starter edits and ignored Finder file
were hash-checked unchanged. They are excluded from the correction commit.
The isolated verification used the same corrected application, packages and tests
with only the pristine tracked starter fixture. This is not a claim that the user's
dirty checkout has a passing full check.

Review covered every changed record against the manifest bindings above: Radix
color/Card/Table/structured-summary; Carbon radius/borders/input/dialog/transaction;
USWDS typography/spacing/elevation/border/input/table; and each package’s Source
version metadata, omissions and notices. Regression tests bind the corrected values
and key claims to bundled evidence. Catalog validation checks all evidence hashes,
notice coverage and native records.

The scalar audit compared all **361 resolved values** across supported modes with
`f3da01f`, accounting for the Radix token rename. Only Carbon `radius.card` changed:
`0px` to `4px` in light and dark. No other scalar value changed.

Three actual 1.0.0 Profiles were created before editing the catalog. After reopening
with the corrected catalog and creating three new Profiles, **all 98 files** in the
original three Profiles remained byte-identical, including their original 1.0.0
receipts. Automated tests additionally cover repeated deterministic native seeds,
independent identities/editing and update/removal isolation.

## Remaining P2s and recommendation

No reported guidance/provenance P1 remains open. The requested md/spacing/shadow/kind
P2 corrections are included. Radix now has two ordinary component-coverage warnings
because evidence supplies no general Card/Table avoidance list. Filling these solely
to remove a warning would reintroduce unsupported rules. Carbon’s two unchanged
contrast-margin warnings remain documented; USWDS has no validation findings.

**MERGE WITH FOLLOW-UP.** The accuracy corrections are ready based on the verification
results above. Follow up separately on the pre-existing starter-fixture
test expectations/Finder artifact and the existing short-desktop navigation issue.
Do not bundle those unrelated edits into this branch. Broader coverage, decorative
swatches and preset-browser redesign remain outside this release. No merge to main
has been performed.
