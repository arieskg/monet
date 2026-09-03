# Monet

Monet is a file-backed workspace for a personal design system, and a read-only
MCP server that hands that design system to coding agents.

You keep principles, foundations, tokens, primitives, components, patterns, and
visual references as plain files in a directory you own. Monet gives you a local
UI to edit them, deterministic retrieval over them, and an MCP server so any
compatible client can ask "how do I build a login form" and get *your* answer.

There is no database, no account, no hosted service, and no model API. Monet
reads and writes files on your machine and speaks MCP over stdio.

## The tool and your workspace are separate things

| | |
| --- | --- |
| **Monet** | The application in this repository: UI, file service, retrieval, MCP server. |
| **A workspace** | A directory of design-system records. Yours. Monet never assumes a particular one. |

This repository ships one workspace under [`monet/`](monet/) as a **starter and
worked example** — a complete design system you can read, copy, or throw away.
It is example data, not the product.

**Copy it; do not edit it in place.** The bundled workspace is also the fixture
Monet's own tests assert against, so editing it there can break the test suite and
will conflict on every `git pull`. Your design system belongs in a directory you
own:

```bash
cp -r monet ~/my-design-system
export MONET_ROOT=~/my-design-system
```

An empty directory works too — Monet treats a workspace with no records as a new
one rather than an error, through the UI, the MCP server, and `validate` alike:

```bash
mkdir ~/my-design-system
MONET_ROOT=~/my-design-system pnpm dev
```

Every entrypoint accepts `--root <path>` as well, and both the UI and the MCP
server print which workspace they opened on startup.
[`docs/WORKSPACE.md`](docs/WORKSPACE.md) describes the file layout if you want to
build one from scratch; the fastest start is to copy `monet/` and edit it.

## Install

Requires **Node 20.19+ or 22.12+** (Vite 7's range; Node 21.x and 22.0-22.11 are
excluded) and [pnpm](https://pnpm.io/).

```bash
git clone <your-fork-or-this-repo> monet
cd monet
pnpm install
```

[mise](https://mise.jdx.dev/) is optional. If you use it, `.mise.toml` pins Node and
pnpm and mirrors the commands below as `mise run dev`, `mise run mcp`,
`mise run validate`, and `mise run check`.

## Run the workspace UI

```bash
pnpm dev                       # bundled starter workspace
MONET_ROOT=~/design pnpm dev   # your own workspace
```

Open `http://127.0.0.1:43140/`. The Vite application talks only to a loopback
file service on `127.0.0.1:43141`; nothing leaves your machine.

## Run the MCP server

```bash
pnpm mcp
MONET_ROOT=~/design pnpm mcp
```

The process speaks MCP on stdin/stdout and waits for a client. It exposes
resources and two read-only tools; it has no write operations and opens no
network listener. See [`docs/MCP.md`](docs/MCP.md) for client configuration and
[`mcp.example.json`](mcp.example.json) for a config you can copy.

Monet is client-neutral. Any MCP client that can launch a local stdio server
works, and nothing in the server is written for a particular one.

## Check a workspace

```bash
pnpm validate                       # is my workspace internally consistent?
MONET_ROOT=~/design pnpm validate
```

`validate` reports broken token references, dangling component and pattern
links, undecided records that still claim an approved source, and preference
values that break the compact contract. Errors mean tools reading the workspace
will misbehave; warnings mean a record is incomplete but usable.

```bash
pnpm check    # build, lint, test, and validate
```

## How records are stored

The workspace directory is canonical and human-editable. Principles and patterns
are Markdown with frontmatter; foundations, themes, taxonomies, component and
primitive decisions, sources, and references are JSON. The UI writes files
atomically and regenerates two derived views on save:

- `DESIGN_SYSTEM.md` — a readable summary of the whole system.
- `tokens/` — resolved token exports, per foundation and consolidated, plus
  per-theme exports with base/mode/theme provenance, one file per theme and mode.

Both are derived from the canonical records and carry no timestamps, so they
change only when the design system changes. A third snapshot,
`design-system.json`, is regenerated locally but deliberately not committed: it
duplicates the entire workspace, including the source and reference registries.

Preview is a read-only derived surface. Its Elements and Sample Page views
compile the workspace in memory from the active theme, foundations, component
preferences, primitives, and patterns, in either light or dark mode. It has no
save route and no Preview-specific records.

## Light and dark

A theme resolves in two modes over one semantic token system. Foundations carry
the dark decisions: a token's `value` is its light value and an optional
`modes.dark` is its dark value, so `color.surface` can point at a dark primitive
while everything that references `color.surface` follows. Themes stay
override-only and may add dark-only overrides. An MCP client that asks for a
dark-mode task receives dark tokens and the light counterparts of every token
that changes; a workspace with no dark values still says plainly that it has
none.

## Optional AI-assisted features

Two features can call a local AI CLI: source inventory mapping (Sources) and
reference analysis (References). **Both are optional.** Monet's workspace, UI,
retrieval, validation, and MCP server all work with nothing configured.

```bash
export MONET_AI_COMMAND=your-cli   # opt in
```

Monet does not depend on, bundle, or prefer any provider — but it is honest about
what the built-in call looks like. It invokes the command as:

```
<command> exec --ephemeral --sandbox read-only --output-schema <schema.json> -o <result.json> -
```

with the prompt on stdin, and reads the JSON the command writes to `<result.json>`.
That argument shape currently matches the [Codex CLI](https://github.com/openai/codex).
Another provider works if it accepts the same flags, or behind a small wrapper
script that translates them — point `MONET_AI_COMMAND` at the wrapper. Generalizing
the argument contract is future work, not a supported configuration today.

With nothing configured, those two features explain what to set rather than failing
with a spawn error.

## Documentation

- [`docs/MCP.md`](docs/MCP.md) — MCP resources, tools, retrieval, and client setup
- [`docs/WORKSPACE.md`](docs/WORKSPACE.md) — the workspace file contract
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — how the application is put together
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — development setup and expectations
- [`monet/README.md`](monet/README.md) — about the bundled starter workspace

## License

MIT. See [LICENSE](LICENSE).

The package is marked `private` because Monet is a clone-and-run application rather
than an npm library: there is no published entry point, and the flag guards against
an accidental `npm publish`. It has no bearing on the licence or on using the code.
