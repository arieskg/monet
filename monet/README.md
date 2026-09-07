# Starter workspace

This directory is an **example workspace**, not part of the Monet application. It
is a complete, opinionated design system you can read, copy, or replace.

Monet uses it only as the default when no workspace is configured, and its own test
suite uses it as a fixture. Treat it as read-only: copy it and point `MONET_ROOT` or
`--root` at your copy, so your edits neither break tests nor conflict on `git pull`:

Stop the dev server with Ctrl+C first. From the application repository root, use
a destination that does not already exist:

```bash
cp -r monet ~/my-design-system
MONET_ROOT=~/my-design-system pnpm dev
```

`docs/WORKSPACE.md` in the repository root describes the file contract if you are
building a workspace from scratch. The quickest start is to copy this directory
and edit it.

A workspace is the canonical, portable source of truth for its design system. The
web application is an editor over these files; it is not the owner of a separate
database.

- `principles/` contain always-active Markdown guidance with only title, order, and timestamp metadata.
- `patterns/` contain Markdown guidance with decision metadata and linked concept IDs.
- `foundations/` contains design intent plus canonical structured token records. A token's `value` is its light value; semantic roles that differ in dark mode carry a `modes.dark` value.
- `themes/` contains override-only themes; a theme may add `modes.dark` overrides that apply only in dark mode.
- `tokens/` contains generated per-foundation and consolidated resolved token exports, plus `tokens/themes/<theme>.json` (light) and `tokens/themes/<theme>.dark.json` (dark) per theme.
- `taxonomy/primitives.json` and `primitives/decisions.json` define low-level building blocks between tokens and components.
- `taxonomy/components.json`, `components/`, and `sources/` contain the user-facing taxonomy, decisions, and external mappings.
- `decisions/` records human-readable changes to component inspirations.
- `DESIGN_SYSTEM.md` is a regenerated readable summary; `design-system.json` is a
  regenerated structured snapshot that is deliberately not committed.
- `AGENTS.md` tells coding agents how to apply the system.

External libraries are inspirations unless a target project explicitly adopts
one as a dependency. A component's `selection` is the source inspiration Monet
approved; a record whose status is `undecided` carries no selection, only
`candidates` and the history of how it got there.

Component and primitive `preferences` are compact settings rather than prose:
one short phrase each, with `token:<name>` naming a Monet token wherever a token
supplies the value. The contract lives in `shared/preferences.ts` and is enforced
by the integrity tests. Explanation belongs in `rationale`, `notes`, `behavior`,
`use_when`, and `avoid_when`, which is also where retrieval looks for it.

Saving and editing sources by hand works without AI. **AI refresh & map** requires
the optional AI command to be configured. It is off by default; see
`docs/ARCHITECTURE.md` in the application repository for the invocation contract. Plausible mappings are persisted immediately; weak matches remain usable
with `needs_review`, and explicit manual or exclusion decisions survive refreshes.

The conceptual hierarchy is Principles → Foundations → Tokens → Primitives →
Components → Patterns. Token records are maintained only through Foundations;
the Token Registry and `tokens/` files are aggregate views of that same data.
Primitive names, categories, aliases, descriptions, deprecation state, and
merges are maintained in the canonical primitive taxonomy.

The Token Registry and Primitives application surfaces are already designed
and implemented, but are intentionally hidden until the surrounding design
system is more intact. Their canonical files remain active and portable; this
is a temporary presentation decision, not a removal of either layer.
