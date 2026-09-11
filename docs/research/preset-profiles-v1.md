# Preset Profiles V1 — research and catalog decision

Date: 2026-09-11. Written before implementation. Baseline: local and remote `main`
both resolve to `4e5bad0e0ed77e54f1a117f404badcaf29cea925`, containing Profiles V1
(`294f31a`), Surfaces V1.1 (`520dfc7`), and resumable Project/Profile onboarding
(`4e5bad0`). Implementation belongs on `codex/preset-profiles-v1`; do not merge
without reporting the result. Existing edits under the starter workspace are out
of scope.

## Decision

Ship **Radix Product**, **Carbon Product**, and **USWDS Public Service**, alongside
the existing Monet Starter and Blank choices. These are explicitly Monet
adaptations, not official upstream distributions or exhaustive implementations.
Choose a coherent subset of each system, including guidance, component decisions,
patterns, and scales. A smaller truthful system is preferable to invented coverage.

Radix offers approachable product controls, rounded geometry, a system font stack,
and well-defined light/dark scales. Carbon contributes a denser, square-edged,
typographically restrained data-product direction. USWDS contributes public-service
forms, long-form content, user research and accessibility principles, and a light
palette. That is more useful diversity than three interchangeable SaaS kits.

An upstream named “Theme” is flattened into a Profile's Foundation values and
`modes.dark`. No Monet Theme record is needed. A created Profile owns ordinary
records, exports, and independent history; updates to a bundled package never
modify it.

## Evidence and method

Inspected current upstream repository trees, license files, token definitions,
component guidance, and documentation. The source audit below pins the exact
repository revisions. Selected packages additionally record source-file SHA-256
hashes, source URLs, transformation notes, and per-record provenance. Repository
licenses were checked separately from documentation and assets. Website popularity
and an aggregator's license are not evidence of a right to redistribute a brand's
design materials.

Coverage key: **S** = strong explicit/structured coverage; **G** = useful guidance
or implementation evidence requiring interpretation; **L** = limited or outside
the system's purpose. These are qualitative research judgments, not measured
completeness scores. A system can have stronger coverage than this V1 adaptation.

| Candidate | Principles | Color / semantic roles | Type / spacing | Radius / borders / elevation | Motion / layout | Components / states | Patterns | Modes / accessibility |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Radix Themes + Colors | G | S / S | S / S | S / S / S | G / S | S / S | G | light + dark / S |
| Carbon | S | S / S | S / S | S / S / S | S / S | S / S | S | light + dark / S |
| USWDS | S | S / S | S / S | S / S / S | L / S | S / S | S | light; no general dark system / S |
| Primer | S | S / S | S / S | S / S / S | S / S | S / S | S | light + dark + additional accessibility modes / S |
| Ant Design | S | S / S | S / S | S / S / S | S / S | S / S | S | light + dark algorithms / G |
| Fluent 2 | S | S / S | S / S | S / S / S | S / S | S / S | S | light + dark + high contrast / S |
| Material 3 | S | S / S | S / S | S / S / S | S / S | S / S | S | generated light + dark palettes / S |
| Atlassian | S | S / S | S / S | S / S / S | S / S | S / S | S | light + dark / S |
| shadcn/ui + Tailwind | L | S / S | S / S | S / S / G | G / S | S / S | G | light + dark / G, implementation-dependent |
| Adobe Spectrum | S | S / S | S / S | S / S / S | S / S | S / S | S | light + dark and platform scales / S |
| GOV.UK | S | S / S | S / S | G / S / L | L / S | S / S | S | primarily light / S |
| DESIGN.md collections | varies | often values; semantics vary | varies | varies | often L / G | prose; often partial states | varies | format/file-dependent; not conformance evidence |

Primary coverage entry points: [Radix tokens](https://www.radix-ui.com/themes/docs/theme/overview),
[Carbon tokens and modes](https://carbondesignsystem.com/elements/themes/overview/),
[USWDS tokens](https://designsystem.digital.gov/design-tokens/),
[Primer primitives](https://github.com/primer/primitives),
[Ant design values](https://ant.design/docs/spec/values/),
[Fluent principles](https://fluent2.microsoft.design/design-principles),
[Material Web](https://github.com/material-components/material-web),
[shadcn theming](https://ui.shadcn.com/docs/theming),
[Tailwind theme variables](https://tailwindcss.com/docs/theme),
[Spectrum design data](https://github.com/adobe/spectrum-design-data), and
[GOV.UK styles, components and patterns](https://design-system.service.gov.uk/get-started/).

## Ranking and product usefulness

Rank balances compatibility, quality, diversity within the first catalog, license
clarity, maintenance, and immediate usefulness. It is not a ranking of visual quality.

| Rank | Candidate | Decision and useful products | Mapping and maintenance assessment |
| --- | --- | --- | --- |
| 1 | Radix | Select: SaaS, productivity, developer tools | CSS scales and explicit component variants translate naturally. Freeze violet + mauve, medium radius, 100% scale. Those choices are Monet adaptations, not universal Radix defaults. No React dependency required. |
| 2 | Carbon | Select: data-heavy apps, dashboards, admin | Structured token data, detailed component boundaries and grid guidance. Freeze White + Gray 100 as modes, a single layer context, and productive type. Do not pretend that one surface reproduces recursive Carbon layers. |
| 3 | USWDS | Select: public services, content, accessible forms | Explicit defaults and usage guidance; Sass unit and font-metric interpretation requires care. Preserve light-only support and document font fallback behavior. No official-government identifiers. |
| 4 | Primer | Next candidate: developer tools, collaborative workflows | Excellent semantic JSON and accessibility modes. Deferred because its V1 use cases overlap Radix/Carbon; richer modes exceed Monet's two-mode model. |
| 5 | Spectrum | Next candidate: creative/productivity applications | Strong machine-readable data and component schemas; density/platform axes require selecting one configuration. The old spectrum-tokens repo is a redirect placeholder: research must follow spectrum-design-data. |
| 6 | GOV.UK | Future: transactional service journeys | Particularly strong tested patterns, clear focus treatment. Overlaps USWDS's public-service niche in the initial catalog; fonts, crest and wordmark need separate treatment. |
| 7 | Ant Design | Future: complex business/admin apps | Clear MIT source, abundant components. Freeze evaluated algorithm outputs rather than shipping runtime theme algorithms. Overlaps Carbon, and full density/state combinations are substantial maintenance. |
| 8 | Fluent | Future: productivity applications | Strong token vocabulary; select platform, density and mode. Font/icon asset terms are explicitly separate from MIT code. Do not bundle Microsoft branding or font binaries on the strength of the code license. |
| 9 | Material 3 | Future: consumer applications | Valuable stylistic diversity, but dynamic color, state layers, elevation overlays and expressive motion are not simple scalar imports. Material Web currently states it is in maintenance mode. Pin a deliberate configuration and verify source-by-source before adopting. |
| 10 | shadcn / Tailwind | Defer: custom SaaS | Excellent implementation starting points, but Tailwind's utility scale is not a complete set of product decisions. Select one concrete shadcn style/version before mapping; avoid manufacturing a universal shadcn design system. |
| — | Atlassian | Reject for general bundled V1 | Current ADS license limits use to Atlassian-integrated add-ons and restricts adaptation/redistribution. Individually identified OSS code can carry other rights, but does not clear ADS documentation and assets as a general preset. |
| — | DESIGN.md aggregations | Discovery/reference only | Attribution, completeness, brand rights and authorship differ per file. A generic import is a distinct trust workflow and is not implemented here. |

## Licensing and provenance decisions

These findings apply to the materials inspected, not every asset in each ecosystem.
All selected presets must say they are adapted by Monet, identify the upstream,
preserve its notices, and avoid endorsement claims, logos, icons, screenshots,
font binaries and product-specific trade dress assets.

| Material | Actual license evidence | Redistribution action / separate concerns |
| --- | --- | --- |
| Radix Themes, Colors, website docs | Each repository has its own MIT LICENSE and WorkOS/Modulz copyright notice | Preserve all three notices, including distinct years/owners. Paraphrase guidance with citations; retain source hashes. Font-stack names are references only; local font-face metric adjustments are omitted. |
| Carbon code and website docs | Both repositories carry Apache-2.0 LICENSE; source files include IBM copyright headers | Carry both licenses and applicable source copyright notices; prominently mark the adaptation and modifications. No NOTICE file was found in the inspected source trees. This absence is recorded, not substituted with an invented upstream NOTICE. IBM Plex is separately OFL-1.1; no font binaries are included. |
| USWDS code and site guidance | Code LICENSE.md lists exceptions; remaining government code and site guidance are public domain in the US and CC0 worldwide | Preserve both license documents and attribution voluntarily. Do not copy the separately licensed Source Sans Pro, Merriweather, Public Sans, Font Awesome, Material Icons, or sprites. GSA marks and government identifiers are excluded. |
| Primer primitives | MIT, GitHub copyright | Candidate source can be adapted with the notice; audit React/docs and Octicons separately if selected. GitHub logos and marks are excluded. |
| Ant Design | MIT, Ant UED copyright in source repository | Preserve notice if selected; linked illustrations/icons/fonts need their own audit. The first-party DESIGN.md endpoint alone does not grant a new license. |
| Fluent UI | MIT, Microsoft copyright; LICENSE explicitly points to separate font/icon terms | Code-only adaptation is plausible; font/icon/logo redistribution is not cleared by MIT. Deferred asset review remains necessary. |
| Material Web | Apache-2.0 source repository | Retain license, change notices and any applicable NOTICE. Material website prose, Roboto font packages and Material Symbols are distinct materials and must be licensed independently. None incorporated in V1. |
| shadcn/ui; Tailwind CSS | MIT in both source repositories | Retain applicable notices if selected. Third-party registries, icon sets and fonts are not automatically covered. |
| Spectrum design data | Apache-2.0 in the current repository | Pin configuration and preserve source notices; Adobe fonts, icons and marks need separate asset review. None incorporated. |
| GOV.UK Frontend; website guidance | Frontend MIT (Crown copyright); guidance site declares OGL v3.0 with exceptions | Preserve MIT/OGL attribution for material actually used. GDS Transport, crown imagery and GOV.UK branding are not cleared for general reuse by the frontend license. None incorporated. |
| Atlassian ADS | [Current ADS license](https://atlassian.design/license/), updated 2025-03-13 | Do not adapt/bundle under this feature. Section 8's OSS exception must be evaluated per actual package, not applied to the full ADS. |
| VoltAgent lists | MIT for each repository's authored contents; official list expressly does not own linked materials | The list's MIT license cannot grant rights in linked brands or clear reverse-engineered observations. No files copied into the catalog. |
| Google Labs DESIGN.md | Apache-2.0 specification/tool repository | The format is reusable subject to its license; brand documents using the format retain their own licenses. No importer or format implementation added. |

Additional asset evidence: [IBM Plex license](https://github.com/IBM/plex/blob/master/LICENSE.txt),
[Fluent source license](https://github.com/microsoft/fluentui/blob/master/LICENSE),
[USWDS exceptions](https://github.com/uswds/uswds/blob/develop/LICENSE.md), and
[GOV.UK guidance license footer](https://design-system.service.gov.uk/get-started/).
For deferred candidates, asset review is intentionally incomplete because those
assets will not be incorporated. This is a reason to defer bundling, not a claim
that their entire ecosystems have been cleared.

## DESIGN.md findings

Rechecked [Google's format](https://github.com/google-labs-code/design.md),
[awesome-design-md](https://github.com/VoltAgent/awesome-design-md), and
[official-design-md](https://github.com/VoltAgent/official-design-md).
The specification supplies structured tokens plus narrative sections; it is not
just an arbitrary filename convention. The awesome list includes analyses of
brand sites. The official list links first-party documents (including Ant Design
and Atlassian), but is an index, not a license for those documents. First-party
authorship improves provenance, not necessarily redistribution rights or completeness.

The prior [DESIGN.md assessment](design-md-assessment.md) remains useful for export
and evidence-import planning. This task explicitly authorizes curated presets,
which is narrower than importing that corpus. No aggregator content becomes
canonical, no remote file is evaluated as instructions, and no generic importer,
scraper, marketplace, synchronization or AI-generation path is added.

## Mapping contract decided before implementation

**Direct:** scalar color values, font sizes/weights, spacing and radius scales,
duration/easing, supported light/dark values, named source component variants.
Every token identifies its upstream key and source. Retain upstream units where
possible; explain conversions (for example Carbon's 8px mini-unit).

**Adaptation:** choosing one upstream configuration, semantic aliases in Monet's
vocabulary, selecting component defaults, converting responsive typography to a
fixed productive style, condensing usage guidance, linking patterns to Monet
concept IDs. Label these choices as Monet adaptations and retain source links.

**Monet-authored additions:** catalog descriptions, suitability labels, record IDs,
taxonomy grouping, preview layout, and packaging explanations. Label them as such;
they must not be presented as upstream design facts. Do not invent missing design
principles, states, motion scales or dark colors.

**Reference/omitted:** runtime components, complete prop APIs, actual keyboard and
screen-reader implementations, responsive behaviors, font binaries/metric patches,
icons, illustrations, recursive layers, arbitrary dynamic-color algorithms,
high-contrast axes, density/platform variants and complete pattern libraries.
Use guidance and explicit omissions where a scalar record cannot express them.

Store a versioned native package with strict record validation and a checked-in
catalog checksum. Reject malformed packages, unknown package/schema versions,
broken links, mismatched identity/version/hash and unsupported mode declarations
before publication. Never accept a user-supplied package path or URL. Creation
uses the existing staged, durable Profile publication and recovery mechanism.

Snapshot provenance and licenses into the resulting Profile and copy them on
fork. Record hashes describe the initial imported records, not a guarantee that
later user edits still match upstream. Normal record text must retain short source
labels so guidance returned through existing MCP/context exports does not appear
Monet-authored. The provenance sidecar is metadata, not live inheritance or a new
canonical write target for Safe Apply.

Both the Profile picker and inline Project onboarding should offer Blank, Monet
Starter, and Preset. Browse suitability, modes, source, characteristics, omissions,
record coverage and a small sample of actual tokens/guidance. Pin the inspected
package's version and digest in the creation/onboarding request. Preview UI is a
Monet illustration of the starting records, not an upstream component renderer.

## Verification plan

Exercise every package through independent creation, repeat creation, edits and
forks; update a test catalog while keeping old Profile bytes unchanged; verify
all modes without Themes, provenance/notice preservation, strict package rejection,
and failure/recovery before and after publication. Test MCP context/resources,
Build With It, Project binding, Surfaces, Gaps and Safe Apply with matching record
IDs in distinct Profiles. Run `pnpm check`, `pnpm test:mcp`, and the browser suite,
including new preset selection/preview and inline onboarding coverage. Record
actual results and remaining limitations in the implementation report.

## Pinned repository audit

[preset-source-audit.json](preset-source-audit.json) records exact commits, inspected license-file hashes, and NOTICE paths for all inspected repositories. Selected package manifests narrow this to the exact source files incorporated.
