# Monet MCP integration

Monet exposes a design-system workspace to local coding agents through a read-only
Model Context Protocol server. The server uses stdio and delegates every read to the
same shared service used by Monet's UI transport, so an agent and the UI always see
the same records.

Which workspace it serves is set by `MONET_ROOT` or `--root`; with neither, it
serves the starter workspace bundled with the repository.

```text
Monet UI ──┐
           ├── shared Monet service ── file persistence
MCP stdio ─┘
```

The MCP adapter does not load catalog files, resolve tokens, expand relationships,
or search references itself. It validates protocol input, calls the shared service,
and removes internal filesystem fields from the response.

## Start locally

From the repository root:

```bash
pnpm install
pnpm mcp
```

To serve your own workspace instead of the bundled starter one:

```bash
MONET_ROOT=/path/to/your-design-system pnpm mcp
# or
pnpm mcp -- --root /path/to/your-design-system
```

The server writes protocol messages only to stdout. Its readiness line — which
names the workspace it opened — and any errors go to stderr so they cannot
corrupt the MCP stream.

## Client configuration

Monet is client-neutral: it is a local stdio MCP server with no provider-specific
behavior, so any compatible client works. [`mcp.example.json`](../mcp.example.json)
holds the snippet below; most clients accept this shape directly, and the rest
need the same three facts — a command, its arguments, and optionally `MONET_ROOT`.

```json
{
  "mcpServers": {
    "monet": {
      "command": "pnpm",
      "args": ["--dir", "/absolute/path/to/monet", "mcp"],
      "env": {
        "MONET_ROOT": "/absolute/path/to/your-design-system"
      }
    }
  }
}
```

Omit `env` to use the bundled starter workspace. The client must launch the
command as a child process and talk to it over stdin/stdout. Monet does not need
its UI or loopback file service running for MCP to work.

## Resources

All resources return `application/json` text.

| Resource | Contents |
| --- | --- |
| `monet://catalog` | Compact indexes and stable IDs for Principles, Foundations, Patterns, Components, Themes, and References |
| `monet://principles/{id}` | One canonical design principle |
| `monet://foundations/{id}` | One Foundation and its base token records |
| `monet://patterns/{id}` | One multi-component pattern |
| `monet://components/{id}` | Component taxonomy joined to its optional design decision |
| `monet://themes/{id}` | One override-only theme |
| `monet://themes/{id}/tokens` | Theme-resolved tokens, base values, override provenance, and token issues |
| `monet://references/{id}` | One reference record without internal asset paths |

Unknown or malformed resource IDs return MCP resource errors. Component resources
omit decision history and unselected candidate catalogs to keep agent context
focused; selected inspiration, preferences, guidance, and relationships remain.
Their top-level `status` is always explicit, including when an undecided component
has no decision record yet.

## Tools

### `get_design_context`

Calls the shared `getDesignContext()` operation. All fields are optional, but string
queries must be non-empty and every supplied ID must use Monet's lowercase slug
format.

```json
{
  "query": "build a settings page",
  "detail": "compact",
  "principleIds": ["simplicity"],
  "foundationIds": ["spacing"],
  "patternIds": ["forms"],
  "componentIds": ["text-input", "button"],
  "referenceIds": ["linear-doc-pages"],
  "themeId": "default"
}
```

The result preserves the shared service's `warnings` array. Unknown selector IDs and
dangling relationships are therefore visible to the caller rather than discarded.
An unknown theme is rejected because theme resolution would otherwise fall back to
the default theme.

### Response detail

`detail` is the only response option and defaults to `compact`.

`compact` returns an agent-oriented design brief: principles as their decision plus
what to avoid, Foundations as description and guidance, patterns as summary, intent,
avoid list, and an index of the sections the full record covers, components as
status, preferences, behavior, notes, and usage boundaries, and tokens as a flat
`name → resolved value` map. Every record carries a `monet://` `uri`, so an agent
reads the brief first and fetches whole records only where it needs them. Records the
query matched directly also carry their decision rationale; records that arrived by
expansion leave that at their resource. Theme provenance appears in
`theme_overrides` only for tokens whose active-theme value differs from Base Monet.

`full` returns the complete editor-shaped records: whole pattern bodies, Foundation
rationale and notes, and provenance-carrying `resolvedTokens`. Aggregate Foundation
records include `token_count` rather than a second copy of their token arrays.

Across representative scoped tasks the compact brief is roughly a quarter to a third
of the full payload. Use `full` when a client is inspecting Monet rather than
building with it.

### Coverage and notices

Every result reports whether Monet actually had something to say.

`coverage` is computed only from evidence the request itself produced — a name,
alias, tag, or text match, or an explicit ID selector. Records pulled in *because* of
a match (`relationship_expansion`, `reverse_pattern_expansion`) are consequences, not
evidence, and Monet's principles ship with every result regardless of the request.
Neither can vote, so a weak accidental hit can no longer dress itself up as an
answer by expanding a few Foundations behind itself.

| Value | Meaning |
| --- | --- |
| `task_specific` | At least one Foundation, pattern, component, or reference matched decisively, or the caller named a record by ID. |
| `partial` | Something matched, but only weakly. The result is a shortlist of candidates to confirm, capped at the best few, and weak matches do not expand Foundations or tokens. |
| `none` | Nothing task-specific matched. |

A result carrying principles alone is `none`, not a successful match. An unscoped
request — no query and no ID selectors — also reports `none`: it returns the whole
catalog, but nothing was *matched*, because no task was given.

`notices` carries compact, client-neutral explanations:

| Kind | Meaning |
| --- | --- |
| `no_opinion` | Monet has no task-specific guidance, or matched only weakly. Prefer a familiar accessible solution and surface the choice. |
| `undecided_guidance` | A retrieved concept is in the taxonomy but carries no decision. `ids` names them. |
| `unsupported_capability` | The request needs something Monet does not have. `ids` names the capability, for example `dark-mode`. |

The dark-mode notice is derived from the resolved palette rather than from a list of
known gaps: if the active theme resolves `color.background` to a light value and the
task asks for a dark mode, the result says the returned colour tokens are light-mode
values. It disappears on its own once a dark theme exists.

### Deterministic retrieval

`get_design_context` normalizes task text into lowercase design words, drops task
framing such as "build me a", and folds the forms of a word onto one stem so
`delete`/`deleting` and `doc`/`docs` match. A small vocabulary table expands the
query with the words Monet's records use — `modal` reaches Dialog, `sign in` reaches
password and authentication, `wizard` reaches Stepper — so one entry helps every
record that already talks about the concept.

Records are scored field by field, in descending weight: canonical name, aliases and
retrieval terms, tags, purpose-bearing prose (description, summary, `use_when`),
supporting prose (`avoid_when`, rationale, notes, preferences), and incidental text.
Two rules keep the result honest:

- **Coverage is measured against the matched field, not the query.** A long sentence
  no longer scores lower than a short one for the same evidence, and each authored
  value is scored on its own rather than concatenated into one blob.
- **Common words do not identify records.** A single shape word — `action`, `grid`,
  `input`, `panel` — is a hint wherever it lands on its own, so "bulk actions" no
  longer resolves to Button. In a canonical name the same word still counts, because
  a Foundation called Layout really is what "the layout" is asking for. A broad
  taxonomy category can never carry a record over the floor on its own.
- **A name and an alias claim identity differently.** A canonical name is the
  record's own word for itself, so its distinctive part is enough: Password Input is
  identified by "password". An alias is a pointer somebody added, and Monet's aliases
  are mostly `<word>-<shape>` compounds — `pin-input`, `file-input`, `range-input`,
  `toggle-group`, `product layout` — so an alias must appear in the query as a phrase
  or have every one of its own tokens matched before it counts as identity. Otherwise
  "location pins" becomes OTP Input and "a date range" becomes Slider. A half-matched
  alias is still evidence; it simply goes through the graded path.

The strongest signal leads and corroborating signals add a bounded bonus that scales
with it, so incidental prose cannot revive a deliberately demoted match. Components
Monet has decided outrank undecided taxonomy stubs. Matches must clear an absolute
floor and stay within reach of the best match of their kind, and every bucket in a
scoped result is capped; when nothing of a kind rose above weak, only the best few
candidates are returned. Scoring is independent of query length: a record is credited
against the terms it can actually answer, so the same evidence scores the same however
many unrelated words surround it. No embeddings or external index participate.

The vocabulary and alias tables live beside the scorer in `shared/retrieval.ts`.
Prefer a query synonym, which generalizes; reach for a record alias only when one
record owns a concept nothing else names.

The result's compact `retrieval` array explains each inclusion with the entity type,
stable ID, reason, and strength, plus a score for scored matches or `related_from`
for expansions. Exact selectors take precedence over inferred reasons, and records
trimmed from a bucket take their provenance entry with them. The compact brief omits
the `global_guidance` rows that only restate that principles always ship; `full`
keeps them.

Relationship expansion is shallow, bounded, and priced by what it costs:

- A decisive component match may follow at most one component-relationship hop, with
  per-record and aggregate bounds. A weak match expands nothing at all — not its
  relationships, not the workflow it belongs to, and not the Foundations it depends on.
- A solid component match may pull in one pattern that lists it, which answers "what
  workflow is this control part of" without letting a passing mention of Button
  import the seven patterns that name it.
- The single best strongly matched pattern contributes the decided components its
  roster names; a query touching several workflows cannot assemble the whole catalog.
- A component the query found brings its own Foundation links. A component that only
  arrived with a pattern does not, so second-order links stay out.
- Explicit pattern selectors retain aggregate component expansion.
- Newly expanded records never trigger another expansion pass.

### `search_references`

Calls the shared reference search with one required query:

```json
{ "query": "command palette" }
```

It returns the query, result count, public reference metadata, and compact retrieval
provenance. Matches use the same deterministic scorer and are returned in score order.
An empty result is a successful search with `count: 0`.

## Example agent interactions

1. Retrieve the complete index: read `monet://catalog`.
2. Build a settings page: call `get_design_context` with
   `{ "query": "build a settings page" }`.
3. Find command-palette inspiration: call `search_references` with
   `{ "query": "command palette" }`.
4. Go deeper on one record the brief cited: read the `uri` it carries, for example
   `monet://patterns/forms` for the full pattern document.

## Verification

Run the MCP adapter and in-memory protocol smoke tests:

```bash
pnpm test:mcp
```

Check the workspace the server would serve:

```bash
pnpm validate
```

Run every build, lint, test, and validation check:

```bash
pnpm check
```
