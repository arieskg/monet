# Preset Profiles V1

Choose **New profile → Preset**, select a starting point, inspect its preview and
included decisions, give it a name, and create it. In **Projects**, choose
**Create new Profile → Preset** to create and connect one in the same resumable
operation. Blank and the existing frozen Monet Starter remain available.

The result is your own editable Profile. Saving decisions uses Monet's normal
editors. Modes live on Foundation values; none of these presets creates a Theme.
No account, AI provider, internet connection, component installation or upstream
service is involved in creation. Visiting an optional source link requires a browser
connection; the preview and full license notices are bundled.

The preview illustrates actual resolved tokens in a small Monet layout. It is
not an upstream component renderer and does not promise application conformance.
Use **Agent context** / **Build With It** with the new Profile selected to configure
your agent. Connect Projects and inspect Surfaces through their existing workflows.
These operations never redesign or execute a connected project automatically.

## Catalog 1.0.0

All packages have Monet schema version 1, package version 1 and adaptation version
1.0.0. Counts below describe actual instantiated canonical records, excluding
empty scaffolding and derived exports. A taxonomy category contains the five
included component concepts; one Source record maps them to their upstream docs.

| Preset | Useful for | Modes | Principles | Foundations | Tokens | Components | Patterns |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| Radix Product | SaaS applications, Productivity tools, Developer tools | light + dark | 2 | 7 | 85 | 5 | 2 |
| Carbon Product | Data-heavy applications, Dashboards and admin, Enterprise tools | light + dark | 2 | 8 | 69 | 5 | 2 |
| USWDS Public Service | Public-service forms, Content applications, Accessibility-oriented services | light | 5 | 7 | 53 | 5 | 2 |

### Radix Product

Rounded, quiet controls with a violet accent and balanced spacing. Violet + mauve, Medium rounded corners, System fonts, Layered shadows.

- **Principles:** `accessible-interaction`, `consistent-composition`.
- **Foundations:** `color` (37 tokens), `typography` (25 tokens), `spacing` (9 tokens), `radius` (8 tokens), `elevation` (6 tokens), `layout` (0 tokens), `borders` (0 tokens).
- **Components:** `button`, `text-input`, `table`, `dialog`, `card`.
- **Patterns:** `focused-editing`, `structured-summary`.
- **Taxonomy / Source:** `interface` / `radix-product`.

[Exact records and per-token provenance](../presets/catalog/radix-product.json).

- Selected violet/mauve, medium-radius, 100% configuration; not every Radix color, scale or variant.
- No Radix runtime, keyboard implementation, icons, font binaries or local font-metric patches.
- sRGB fallback shadows are mapped; display-P3 and color-mix enhancements are omitted.
- No general motion scale or formal Radix principle catalog is invented; principles below condense published guidance.
- Focus-ring styling and accent surface colors remain component-specific; no generic selected-surface contrast contract is claimed.
- Only five components and two compositions are covered; consult upstream for all other decisions.

### Carbon Product

Square controls and disciplined hierarchy for complex, data-rich tools. Blue accent, Square controls, Productive typography, 8px mini-unit spacing.

- **Principles:** `structured-rhythm`, `clear-task-hierarchy`.
- **Foundations:** `color` (19 tokens), `typography` (24 tokens), `spacing` (13 tokens), `radius` (2 tokens), `elevation` (1 token), `motion` (9 tokens), `layout` (1 token), `borders` (0 tokens).
- **Components:** `button`, `text-input`, `data-table`, `dialog`, `notification`.
- **Patterns:** `data-table-actions`, `transactional-dialog`.
- **Taxonomy / Source:** `interface` / `carbon-product`.

[Exact records and per-token provenance](../presets/catalog/carbon-product.json).

- White and Gray 100 are flattened into Profile modes; alternate Gray 10/90 configurations are omitted.
- One layer context is selected. Recursive layer switching and dynamic theme algorithms are not represented.
- IBM Plex family references retain upstream fallbacks; font binaries are not included, so installed fonts affect appearance.
- No components, icons, pictograms, brand assets or runtime accessibility behavior are bundled.
- Productive fixed typography is selected; expressive/fluid type, full responsive grids and motion choreography remain references.
- Only five component decisions and two compositions are included.
- Inherited light-mode link and error text on layer 01 each measure about 4.55:1: above the 4.5:1 text floor, below Monet’s 4.75:1 margin. These produce two validation warnings; upstream colors are preserved.

### USWDS Public Service

Readable public-service pages with strong form and accessibility guidance. Light mode, Serif headings, Clear field labels, Public-service patterns.

- **Principles:** `user-needs`, `earn-trust`, `accessibility`, `continuity`, `listen`.
- **Foundations:** `color` (15 tokens), `typography` (16 tokens), `spacing` (11 tokens), `radius` (5 tokens), `elevation` (1 token), `layout` (3 tokens), `borders` (2 tokens).
- **Components:** `button`, `text-input`, `table`, `alert`, `checkbox`.
- **Patterns:** `accessible-form`, `form-feedback`.
- **Taxonomy / Source:** `interface` / `uswds-public-service`.

[Exact records and per-token provenance](../presets/catalog/uswds-public-service.json).

- USWDS does not establish a general dark palette; no dark mode is invented.
- Monet chooses documented local system/Georgia font stacks and an unadjusted subset of the system type scale; this is not default Source Sans Pro/Merriweather font-metric output.
- No fonts, icons, government banner, identifier, seal, logo or official-government claim is included.
- Runtime accessibility, responsive templates, complete form workflows and component code are not included.
- No general motion scale is invented. Only a documented shadow utility example is included.
- Only five component decisions and two form compositions are included; this does not certify an application accessible.

## Evidence and licensing

[Research and ranking](research/preset-profiles-v1.md) was written before the
implementation. [Pinned source audit](research/preset-source-audit.json) records
candidate license evidence. Each selected package narrows that audit to the actual
incorporated source files, with their URLs, commits, hashes and license labels.
The byte-identical source snapshots are retained in `presets/evidence/` for offline
review, including the source copyright headers.

Radix retains three distinct MIT notices (Themes, Colors and website docs).
Carbon retains Apache-2.0 code/docs licenses and applicable IBM source notices,
with explicit modification disclosure. Neither Carbon repository contained an
upstream NOTICE file at the pinned revision. USWDS retains its public-domain/CC0
license documents and their third-party exceptions. Fonts, icons, logos, image
assets and runtime components are excluded. Source names identify provenance;
these are unofficial adaptations with no endorsement claim.

Every copied Profile includes:

- `profile.json`: its unique UUID and origin, including preset ID, version, package
  SHA-256 and the immutable receipt digest.
- `PRESET.json`: the full manifest, source hashes, all notices, per-record provenance,
  declared omissions/modes and initial native-file hashes.
- `PRESET-LICENSES.txt`: readable full notices and adaptation disclosure.

**Agent context** and **Export** display the retained snapshot and offer a download
containing provenance and full notices. These are reads of this Profile's saved
snapshot, so they keep working after a preset update/removal. Knowledge forks retain
both files. Record prose and source metadata also identify the adaptation in MCP
context and generated design-system documents. When redistributing adapted records,
include applicable notices with the exported material; standalone token/Markdown
exports do not embed the complete legal sidecar. The download contains it.

Provenance describes the starting copy. It does not claim that later user edits
remain upstream facts or match the initial hashes. Per-record categories distinguish
upstream facts, Monet adaptations and Monet-authored packaging/taxonomy. Token
values preserve source units or explain normalization; semantic aliases and chosen
configurations are adaptations. No missing motion scale, mode or principle catalog
is manufactured to fill an empty slot.

## Implementation and trust boundaries

`shared/presets.ts` defines the versioned contract and the shared Profile/onboarding
selection union. `server/presetSchema.ts` accepts a deliberately narrow native-record
subset. `server/presetCatalog.ts` reads the bundled module-relative catalog and
validates bounded regular files, checksums, identity/version, schema, unique record
and token IDs, links, provenance coverage, modes and ordinary workspace integrity.
No API accepts package bytes, URLs, paths, scripts or arbitrary write targets.

Creation pins the exact version and digest shown in the preview. A stale selection
fails before publication. The existing ProfileRegistry creates a private stage,
materializes only allowlisted native records and provenance, initializes empty
scaffolding, derives exports, validates and durably publishes the Profile. Native
seed contents are deterministic; UUID, name and creation time belong to the new
Profile. No reader consults the catalog to resolve that Profile's knowledge.

Interrupted preset publication verifies the retained receipt, initial file hashes,
notices and workspace validation before registration. Corrupt evidence remains
on disk and blocks recovery. Recovery of a completed stage needs no current catalog.
Inline Project onboarding reserves the same Profile/Project IDs and exact selection,
so a retry or lost response cannot duplicate the connection. If failure happens
before a durable seed exists and its version is no longer bundled, repair/reinstall
that version or begin a new onboarding request; there is no silent replacement.

The HTTP catalog is editor-only and passes the same Host/Origin/request protections
as the existing API. `/api/preset-origin` is Profile-scoped. Filesystem operations
stay in `server/`; shared retrieval and token resolution stay pure. MCP gains no
write tool or new dependency. The existing canonical write lock, Safe Apply targets,
private evidence ownership and Project capture boundaries remain in force.

Validation now checks Foundation modes even for Profiles with no compatibility
Theme, using the existing shared resolver and contrast contracts. Carbon intentionally
reports two light-mode margin warnings: its link/error text on layer 01 meets the
4.5:1 floor but misses Monet's 4.75:1 derived-role margin. No token is silently altered
to erase a warning. Radix and USWDS yield no findings for the included records.

## Maintenance and limits

See [catalog maintenance](../presets/README.md). Packages are reviewed data releases;
there is no runtime generator, downloader, importer, marketplace, synchronization,
inheritance or automatic update. Changing a package requires a new version/hash,
source/license review and verification. Existing Profiles stay independent.

V1 includes five component decisions and two compositions per preset, not the full
upstream catalogs. The records describe decisions; they do not ship implementations
or certify accessibility. Many state details remain linked guidance. No Primitives,
References, decision history, private evidence or Themes are seeded. Font availability
can change rendering. USWDS has light mode only; Radix/Carbon freeze one configuration.
More expressive axes and broader component coverage should be separate reviewed work.

Recommended additions: **Primer** for collaboration/developer workflows, **Spectrum**
for creative tools, then **GOV.UK** for service transactions. Each needs its own
configuration and source/asset audit. Material 3 offers consumer diversity once
Monet can accurately represent a deliberately frozen dynamic-color/state-layer model.

[Implementation verification and merge recommendation](PRESET-PROFILES-V1-REPORT.md).
