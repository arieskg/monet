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

## Starting your own

The fastest route is to copy the starter workspace and edit it:

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
| `foundations/*.json` | JSON | Canonical visual standards and their token records. One file per foundation. |
| `taxonomy/components.json` | JSON | The component catalog: id, name, category, description, aliases, relationships. |
| `taxonomy/primitives.json` | JSON | The primitive catalog, same shape. |
| `components/decisions.json` | JSON | Per-component decisions: status, selection, preferences, guidance, history. |
| `primitives/decisions.json` | JSON | Per-primitive decisions. |
| `patterns/*.md` | Markdown + frontmatter | Multi-component workflow guidance, with `components` and `foundations` links. |
| `themes/*.json` | JSON | Override-only themes. `themes/config.json` names the default. |
| `sources/registry.json` | JSON | External design systems used as inspiration, and their mappings. |
| `references/registry.json` | JSON | Visual reference memory. Assets live in `references/assets/`. |
| `decisions/*.md` | Markdown | A readable log of component inspiration changes. |

### Derived, written by Monet

| Path | Contents |
| --- | --- |
| `DESIGN_SYSTEM.md` | Readable summary of the whole system. |
| `tokens/*.json`, `tokens/tokens.json` | Resolved token exports, per foundation and consolidated. |
| `tokens/themes/*.json` | Per-theme resolved tokens with base/theme provenance. |
| `design-system.json` | Full structured snapshot. Regenerated locally; not worth committing. |

These are projections of the canonical records. Editing them has no effect — they
are overwritten on the next save. They carry no timestamps, so they change only
when the design system does.

## Rules the workspace has to follow

`pnpm validate` enforces these. They are what let tools read a workspace without
guessing.

- Every token reference resolves, and no token name is defined twice.
- Every component decision has a matching entry in the component taxonomy.
- Component `foundations` and `primitives` links, taxonomy `relationships`, and
  pattern `components`/`foundations` links all name records that exist.
- A component whose status is `undecided` carries no `selection`. `selection`
  means an approved source inspiration; candidates are not selections.
- Preference values are compact settings rather than prose: at most 80
  characters, no trailing period, and `token:<name>` references that resolve.

Warnings, which do not fail validation, cover records that are usable but
incomplete — a selected component with no rationale or usage boundaries, or a
pattern with no links for retrieval to follow.

## The bundled starter workspace is a fixture

`monet/` in this repository is an example, and Monet's tests assert against it. Copy
it rather than editing it in place: edits there can break the test suite and will
conflict whenever you pull.

## Editing by hand

The files are the source of truth, so editing them in an editor is expected and
safe. Run `pnpm validate` afterwards, and regenerate the derived views by saving
anything in the UI. Monet writes files atomically, so a crash mid-save cannot
leave a half-written record.
