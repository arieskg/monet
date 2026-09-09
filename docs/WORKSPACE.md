# The Monet workspace

A workspace is a directory of design-system records. Monet is the tool that reads
and writes it. Nothing in the application assumes a particular directory: set
`MONET_ROOT`, or pass `--root <path>`, and every surface follows.

```bash
export MONET_ROOT=/path/to/your-design-system
pnpm dev        # UI
pnpm mcp        # MCP server
pnpm validate   # integrity check
```

With neither set, Monet uses the starter workspace bundled at `monet/`.
Use `MONET_ROOT` for the combined `pnpm dev` command; `--root <path>` can be
passed directly to `pnpm mcp`, `pnpm validate`, or `pnpm dev:server`.

## Starting your own

Stop any running dev server with Ctrl+C. From the Monet repository root, copy the
starter to a destination that does not already exist, then restart with your copy:

```bash
cp -r monet ~/my-design-system
MONET_ROOT=~/my-design-system pnpm dev
```

Starting from an empty directory also works. A record set that is not on disk yet
reads as empty, so the UI, the MCP server, and `validate` all treat a new workspace
as new rather than broken. The file service materializes the directories on first
run — the read-only surfaces never write.

```bash
mkdir ~/my-design-system
MONET_ROOT=~/my-design-system pnpm dev
```

## Layout

Every path is relative to the workspace root.

| Path | Format | Contents |
| --- | --- | --- |
| `principles/*.md` | Markdown + frontmatter | Always-active design philosophy. `title`, `order`, `updated_at`. |
| `foundations/*.json` | JSON | Canonical visual standards and their token records. One file per foundation. A token's `value` is its light value; an optional `modes.dark` is its dark value. |
| `taxonomy/components.json` | JSON | The component catalog: id, name, category, description, aliases, relationships. |
| `taxonomy/primitives.json` | JSON | The primitive catalog, same shape. |
| `components/decisions.json` | JSON | Per-component decisions: status, selection, preferences, guidance, history. |
| `primitives/decisions.json` | JSON | Per-primitive decisions. |
| `patterns/*.md` | Markdown + frontmatter | Multi-component workflow guidance, with `components` and `foundations` links. |
| `themes/*.json` | JSON | Override-only themes. `overrides` applies in every mode; an optional `modes.dark` map applies in dark only. `themes/config.json` names the default. |
| `sources/registry.json` | JSON | External design systems used as inspiration, and their mappings. |
| `references/registry.json` | JSON | Visual reference memory. Assets live in `references/assets/`. |
| `decisions/*.md` | Markdown | A readable log of component inspiration changes. |

Private editor feedback lives separately in `gaps/<id>.json`: each Gap holds its
report, optional bounded screenshot, and latest diagnosis. These are not canonical
design decisions and never enter generated guidance, token exports, or MCP context.
Missing Gaps read as empty. See [Gaps](GAPS.md) for storage, provider, and privacy details.

### Derived, written by Monet

| Path | Contents |
| --- | --- |
| `DESIGN_SYSTEM.md` | Readable summary of the whole system. |
| `tokens/*.json`, `tokens/tokens.json` | Resolved token exports, per foundation and consolidated, in light mode. |
| `tokens/themes/<theme>.json`, `tokens/themes/<theme>.dark.json` | Per-theme resolved tokens with base/mode/theme provenance, one file per mode the theme supports. |
| `design-system.json` | Full structured snapshot. Regenerated locally; not worth committing. |

These are projections of the canonical records. Editing them has no effect — they
are overwritten on the next save. They carry no timestamps, so they change only
when the design system does.

## Rules the workspace has to follow

`pnpm validate` enforces these. They are what let tools read a workspace without
guessing.

- Every token reference resolves, and no token name is defined twice.
- Every theme resolves in every mode it supports, including its dark values and
  dark-only overrides; a theme override names a real token; a token's `modes`
  names only `dark`.
- Every documented colour pairing meets its contrast minimum in every theme and
  mode: text roles on the surfaces they are verified against at 4.5:1, control
  boundaries, focus, and selection indicators at 3:1, and derived roles clear of
  the floor at 4.75:1. Pairings whose tokens a workspace does not define are not
  measured. The list lives in `shared/contrast.ts`, where the test suite reads it
  too. A miss below the WCAG floor is an error; a miss of Monet's margin alone is
  a warning.
- Every component decision has a matching entry in the component taxonomy.
- Component `foundations` and `primitives` links, taxonomy `relationships`, and
  pattern `components`/`foundations` links all name records that exist.
- A component whose status is `undecided` carries no `selection`. `selection`
  means an approved source inspiration; candidates are not selections.
- Preference values are compact settings rather than prose: at most 80
  characters, no trailing period, and `token:<name>` references that resolve.

Warnings, which do not fail validation, cover records that are usable but
incomplete — a selected component with no rationale or usage boundaries, a
pattern with no links for retrieval to follow, or a declared dark mode whose
`color.background` still resolves to a light value.

## Light and dark

A workspace is light-only until a token or theme supplies a dark value. There is
no switch to flip and nothing to migrate: add `"modes": { "dark": "{neutral.950}" }`
to a semantic token and the theme gains a dark mode, the Preview and Export pages
offer it, `tokens/themes/<theme>.dark.json` appears on the next save, and an MCP
client asking for dark mode receives dark values. Put dark values on the semantic
roles rather than duplicating the palette, so `color.surface` can point at a dark
primitive while the primitive itself stays what it is.

## The bundled starter workspace is a fixture

`monet/` in this repository is an example, and Monet's tests assert against it. Copy
it rather than editing it in place: edits there can break the test suite and can
conflict when you pull updates.

## Editing by hand

The files are the source of truth, so editing them in an editor is expected and
safe. Run `pnpm validate` afterwards, and regenerate the derived views by saving
anything in the UI. Monet writes files atomically, so a crash mid-save cannot
leave a half-written record.
