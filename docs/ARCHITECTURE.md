# Monet architecture

```text
React workspace (43140) ── JSON/loopback ── Node HTTP transport (43141) ──┐
                                                                         ├── reads
Local coding agent ───────── stdio ───────── Monet MCP transport ────────┘

shared Monet service + domain model
        ↓ WorkspaceReader
Node file store + bounded write orchestration
        ↕ atomic, allowlisted record writes
active workspace: Markdown + JSON
        ↕ Git
humans and coding agents
```

The transport-independent read boundary lives in `shared/service.ts`. It accepts a
small `WorkspaceReader` rather than importing the filesystem and provides typed
list/get operations for Principles, Foundations, Patterns, Components, Themes, and
References, plus reference search and resolved design-context assembly. The React
workspace reaches it through the existing aggregate HTTP route. The MCP transport
in `mcp/` instantiates that same service over `loadWorkspace`; neither
transport reads canonical files or generated exports directly.

Conformance review is the read path's second half and lives entirely below the transport.
`shared/review.ts` takes evidence a caller reports about an implementation — a literal and the
property it was written against, a token name, a component, a rendered foreground over a background —
and measures it against the same resolved tokens, contrast contracts, and component decisions the
rest of Monet reads. It parses no source and holds no framework knowledge: the caller extracts what
it wrote, which is cheap and framework-specific, and Monet answers the closed-set and arithmetic
questions, which need the whole design system. Every check either measures the evidence or declines
to, so an observation Monet cannot verify is reported as such rather than as a violation, and a
concept it has no scale or decision for is not applicable rather than a failure. The result never
asserts conformance, because Monet cannot see what was not submitted.

`shared/model.ts` is the canonical TypeScript domain contract for browser, server,
and future transports. A Component read is intentionally a joined view: taxonomy
owns its stable identity, name, aliases, category, and relationships, while the
optional component decision owns its status, inspiration, preferences, and advanced
guidance. `shared/tokens.ts` is the single normalization and theme-resolution
implementation. The compatibility modules under `server/` only re-export these
shared contracts.

## Themes and modes

Resolution has two axes. A **theme** is override-only product adaptation; a
**mode** is `light` or `dark`, an appearance the same theme can be resolved in.
Both are layered over the Foundations rather than copied from them:

```text
Foundation token value            (light: the value every token already carries)
  + Foundation token modes.dark   (the Foundation's dark decision for that role)
  + theme.overrides               (product overrides, every mode)
  + theme.modes.dark              (product overrides, dark only)
  → alias resolution → resolved tokens with provenance
```

Foundations own the dark decisions because a mode value is a semantic decision
about a role — what `color.surface` is on a dark screen — and not a product
deviation. A token opts in with `modes: { dark: value }`; light is never stored as
a mode, so a workspace written before modes existed reads as light-only without
any migration. A theme supports dark as soon as any token or the theme itself
supplies a dark value; `themeModes()` derives this, nothing declares it. A mode
that is not supported resolves as light and the workspace says which mode was
actually used, so a read-only caller never sees a silent substitution.

Provenance on every resolved token names the mode it was resolved in and the
highest layer that changed it: `theme` when a theme override contributed (mode
specific or not), `mode` when only a Foundation's dark value did, `base` when the
value is Base Monet's light value. `override_dependencies` names the tokens whose
replaced values carried the change, so a Borders token that only aliases
`color.border` reports that colour as the reason it changed in dark.

The bundled starter workspace keeps every fill role and every `color.on.*`
foreground identical across modes and moves only surfaces, text, borders, tinted
status surfaces, focus, shadows, and the scrim. That is a decision of the
workspace, not of the tool; `validate` holds a workspace to resolving in every
mode it claims, to a dark background that is actually dark, and to the contrast
contracts in `shared/contrast.ts` for every theme in every mode, naming the
layer — Foundation mode value, every-mode theme override, or mode-specific theme
override — that produced each failing value.

Canonical storage is relative to the active workspace root (see [workspace selection](WORKSPACE.md)):

| Entity | Canonical storage | Stable ID authority |
| --- | --- | --- |
| Principles | `principles/*.md` | filename slug |
| Foundations | `foundations/*.json` | record `id` (normally equal to filename) |
| Patterns | `patterns/*.md` | filename slug |
| Components | `taxonomy/components.json` + `components/decisions.json` | taxonomy entry `id` |
| Themes | `themes/*.json` + `themes/config.json`; dark values live on Foundation tokens as `modes.dark` | filename slug |
| References | `references/registry.json` + bounded assets; collection analysis is separate | registry record `id` |

`DESIGN_SYSTEM.md`, `design-system.json`, and `tokens/` are regenerated projections of the active workspace,
not alternate persistence APIs.

Preview sits entirely inside the React workspace as a derived projection:

```text
aggregate Workspace response
        ↓ pure compilePreview(workspace)
resolved visual variables + decision provenance + fallback report
        ↙                                      ↘
Elements specimen                     realistic Sample Page
```

It does not add a file-service endpoint or canonical record. The compiler consumes
the same resolved theme tokens and active Foundation, Primitive, Component, and
Pattern decisions as the rest of Monet, and the Preview page resolves the mode it
shows in the browser from the base tokens the workspace response already carries,
so switching between light and dark asks the file service for nothing. Component adapters are reused for the
Elements fixtures, while their styling remains scoped to Monet's resolved
Foundation values so a selected inspiration cannot override the design hierarchy.
The compiled representation is deliberately independent of page state so future
References and AI evaluation can inspect it directly.

The normal reactive path recompiles whenever the shared `WorkspaceContext` value
changes. The explicit Refresh Preview action calls the same context reload, keeps
the current compiled surface visible during the request, and compiles the latest
aggregate response during the in-place render. This adds no endpoint, persistence,
or parallel configuration.

The file service exposes one aggregate read model and bounded write routes for
principles, foundations, override-only themes, primitive taxonomy and decisions,
component decisions, patterns, sources, and references. A second read route
reports the running installation rather than the design system — which workspace
is open, whether it is the bundled starter, and whether the optional AI provider
is configured — because none of that is a workspace record and the UI's
onboarding, workspace, and agent-setup surfaces need it. Record IDs must be lowercase slugs; callers cannot supply
filesystem paths. Writes replace a temporary file atomically. Requests from
non-loopback browser origins are rejected and request bodies are bounded.

Markdown records use a small readable frontmatter contract. Structured records
use formatted JSON so the app does not require a custom database or YAML parser.
Foundation files own structured tokens; legacy key/value maps are normalized
without losing values. Reference resolution reports missing and circular
references. Theme resolution replaces only named Foundation token values, then
resolves aliases again and records direct or transitive override provenance. Themes
cannot override Principles or Patterns. Every accepted write regenerates readable,
structured, per-foundation, and per-theme resolved token exports, one file per
theme and mode.

Primitive taxonomy and decisions are separate from component taxonomy and
decisions, but both reuse status, source mapping, search, and relationship IDs.
Components may reference primitives; primitives may reference tokens. This is a
lightweight hierarchy rather than a runtime dependency graph. A primitive merge
consolidates its decision data and rewires component, source, and taxonomy
relationships to the retained stable ID.

Changing a component inspiration appends both in-record history and a standalone
Markdown decision note. This is intentionally smaller than event sourcing: Git
tracks exact changes while Monet preserves the reason a human cares about.
Component records remain backward-compatible, but selection, preferences, notes,
and status form the normal workflow; behavior, rationale, usage guidance,
Foundation links, and primitive links are optional Advanced guidance. Components
inherit Principles, resolved Foundations, and Patterns by default.

The source schema stores mapped, needs-review, unmapped, ignored, and no-equivalent
upstream components together with confidence, match type, primary-match, inventory,
and provenance metadata. Source refreshes run the configured provider command ephemerally
in a read-only sandbox with a strict output schema. The mapper receives the complete taxonomy and
cross-source mapping context, then its validated result is persisted atomically
without an approval gate. Invalid canonical IDs degrade to unmapped inventory rows;
explicit manual and exclusion decisions are preserved across later refreshes.

References are a separate visual-memory collection under `references/`.
`registry.json` keeps the user's annotation distinct from AI observations and stores
retrieval-oriented metadata such as UI type, patterns, components, visual qualities,
density, hierarchy, and natural-language retrieval context. Bounded local assets live
under `references/assets/` and are served through an ID-only route with restrictive
content headers. `analysis.json` stores collection-level recurring preferences and
staged design-system suggestions. Approving a suggestion changes only its review
status; it never mutates Principles, Themes, Foundations, Components, or Patterns.

## Optional AI-assisted features

Three features can shell out to a local AI CLI: source inventory mapping, reference
analysis, and Gap diagnosis. Other workspace operations, retrieval, validation,
conformance review, and MCP remain deterministic. The UI discloses provider availability;
Gaps retains its deterministic review when no provider is configured.

Gaps uses a separate editor-only contract (`shared/gaps.ts`) and HTTP endpoints.
`server/fileStore.ts` persists each report and bounded raster image together in one
atomic `gaps/<id>.json` record. `server/gapDiagnosis.ts` reuses the shared service over
a workspace snapshot and supplies full canonical knowledge alongside compact retrieval
to the optional provider. It validates evidence/record citations and saves diagnosis
only. Gaps never enters `Workspace`, design context, exports, or MCP. There is no apply
operation. See [Gaps](GAPS.md) for evidence boundaries and failure recovery.

The abstraction is provider-neutral; the argument contract is not yet general. Monet
invokes the command as:

```
<command> exec --ephemeral --sandbox read-only --output-schema <schema.json> -o <result.json> -
```

with the prompt on stdin, then reads the JSON the command wrote to `<result.json>`. That
shape currently matches the [Codex CLI](https://github.com/openai/codex). Another provider
works if it accepts the same flags, or behind a small wrapper script that translates them —
point `MONET_AI_COMMAND` at the wrapper. `MONET_CODEX_EXECUTABLE` predates the
provider-neutral name and still works. Generalizing the argument contract is future work,
not a supported configuration today.

For Gaps only, `MONET_AI_IMAGES=1` opts into the additional compatible argument
`--image <temporary-image>`. Leave it unset unless the CLI/wrapper and model can
inspect images. Otherwise the screenshot remains saved but analysis uses text and
structured evidence. The provider must report whether it actually inspected an
attached image; this status is shown with the diagnosis.
