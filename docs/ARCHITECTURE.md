# Monet architecture

```text
React workspace (43140) ── JSON/loopback ── Node HTTP transport (43141) ──┐
                                                                         ├── reads
Local coding agent ───────── stdio ───────── Monet MCP transport ────────┘

shared Monet service + domain model
        ↓ WorkspaceReader
Node file store + bounded write orchestration
        ↕ atomic, allowlisted record writes
monet/ Markdown + JSON
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

`shared/model.ts` is the canonical TypeScript domain contract for browser, server,
and future transports. A Component read is intentionally a joined view: taxonomy
owns its stable identity, name, aliases, category, and relationships, while the
optional component decision owns its status, inspiration, preferences, and advanced
guidance. `shared/tokens.ts` is the single normalization and theme-resolution
implementation. The compatibility modules under `server/` only re-export these
shared contracts.

Canonical storage remains unchanged:

| Entity | Canonical storage | Stable ID authority |
| --- | --- | --- |
| Principles | `monet/principles/*.md` | filename slug |
| Foundations | `monet/foundations/*.json` | record `id` (normally equal to filename) |
| Patterns | `monet/patterns/*.md` | filename slug |
| Components | `monet/taxonomy/components.json` + `monet/components/decisions.json` | taxonomy entry `id` |
| Themes | `monet/themes/*.json` + `monet/themes/config.json` | filename slug |
| References | `monet/references/registry.json` + bounded assets; collection analysis is separate | registry record `id` |

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
Pattern decisions as the rest of Monet. Component adapters are reused for the
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
component decisions, patterns, sources, and references. Record IDs must be lowercase slugs; callers cannot supply
filesystem paths. Writes replace a temporary file atomically. Requests from
non-loopback browser origins are rejected and request bodies are bounded.

Markdown records use a small readable frontmatter contract. Structured records
use formatted JSON so the app does not require a custom database or YAML parser.
Foundation files own structured tokens; legacy key/value maps are normalized
without losing values. Reference resolution reports missing and circular
references. Theme resolution replaces only named Foundation token values, then
resolves aliases again and records direct or transitive override provenance. Themes
cannot override Principles or Patterns. Every accepted write regenerates readable,
structured, per-foundation, and per-theme resolved token exports.

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
and provenance metadata. Source refreshes run Codex ephemerally in a read-only
sandbox with a strict output schema. The mapper receives the complete taxonomy and
cross-source mapping context, then its validated result is persisted atomically
without an approval gate. Invalid canonical IDs degrade to unmapped inventory rows;
explicit manual and exclusion decisions are preserved across later refreshes.

References are a separate visual-memory collection under `monet/references/`.
`registry.json` keeps the user's annotation distinct from AI observations and stores
retrieval-oriented metadata such as UI type, patterns, components, visual qualities,
density, hierarchy, and natural-language retrieval context. Bounded local assets live
under `references/assets/` and are served through an ID-only route with restrictive
content headers. `analysis.json` stores collection-level recurring preferences and
staged design-system suggestions. Approving a suggestion changes only its review
status; it never mutates Principles, Themes, Foundations, Components, or Patterns.
