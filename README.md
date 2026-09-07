<p align="center">
  <img src="public/monet-mark-2c.svg" width="76" height="76" alt="" />
</p>

<h1 align="center">Monet</h1>

<p align="center"><b>Design decisions your coding agents can use.</b></p>

<p align="center">
  <a href="https://github.com/arieskg/monet/actions/workflows/check.yml"><img src="https://github.com/arieskg/monet/actions/workflows/check.yml/badge.svg" alt="check status" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license" /></a>
</p>

Monet is a local editor for the design decisions behind your UI. Store your principles,
colour and spacing tokens, component choices, and patterns as files you own. A coding
agent retrieves the guidance relevant to its task through the **Model Context Protocol
(MCP)**, then submits evidence for Monet to check against those same decisions.

Instead of pasting a long design prompt into every task, keep one reusable workspace.
Agents can ask which tokens exist, which components to use or avoid, and what changes
in dark mode. An undecided choice stays explicit instead of becoming a guess.

**Define → Retrieve → Build → Review.** Try the bundled example with the four commands below.
No account or AI provider is required.

![Monet's actual Overview page, showing the example workspace and the Define, Retrieve, Build, Review workflow](docs/images/monet-overview.png)

## Try it locally

Requires **Node 22.13 or later** and
**[pnpm 11.18.0](https://pnpm.io/installation)**, the version pinned in `package.json`.
The Node minimum comes from pnpm 11; Node 20 is not supported.

```bash
git clone https://github.com/arieskg/monet.git
cd monet
pnpm install
pnpm dev
```

Open **http://127.0.0.1:43140**. The editor's file service runs on loopback port 43141.
Both ports must be free; stop an earlier dev server with **Ctrl+C** before restarting.

Explore **Overview → Principles / Foundations / Components / Patterns → Preview**.
The bundled workspace is example data, not a required design style. Before editing,
stop the server and copy it from the repository root to a destination that does not exist:

```bash
cp -r monet ~/my-design-system
MONET_ROOT=~/my-design-system pnpm dev
```

Monet is the application; **a workspace is your directory of design-system records**.
An empty directory also works. The UI explains how to start with principles and
foundations; copying the example is the quickest way to get a full component catalog.
See the [workspace guide](docs/WORKSPACE.md) for the file contract and manual editing.

## Connect a coding agent

Open **Agent context** in the app for configuration with your actual paths, or adapt this
example to your MCP client's local stdio configuration:

```json
{
  "mcpServers": {
    "monet": {
      "command": "pnpm",
      "args": ["--dir", "/absolute/path/to/monet", "mcp"],
      "env": { "MONET_ROOT": "/absolute/path/to/your-design-system" }
    }
  }
}
```

Use absolute paths, and make sure the client can find `pnpm` on its PATH. Omit `env` to
read the bundled example. Let the client launch the server; the UI does not need to be
running. `pnpm mcp` starts the same server manually and waits for protocol input, so a
quiet terminal after the readiness message is expected. Stop it with Ctrl+C.

Try asking your agent:

> Use Monet's `get_design_context` for “build a settings page” before implementing it.
> Afterwards, submit the actual tokens, values, components, and colour pairings you used
> to `review_design_usage`. Explain any findings and anything Monet could not verify.

The [MCP guide](docs/MCP.md) documents the three tools (`get_design_context`,
`search_references`, `review_design_usage`), resources, arguments, and examples.
Monet supports local stdio clients without client-specific behavior.

## What you get

- **Reusable decisions:** principles, foundations, semantic tokens, component and primitive
  records, patterns, themes, and saved visual references in Markdown and JSON.
- **Task-specific context:** deterministic retrieval and compact briefs with links to full
  records. No embeddings, external index, or model call.
- **Light and dark:** semantic token roles with optional dark values and theme overrides.
  Preview and export resolved values; choose the app's own appearance separately in Settings.
- **Portable exports:** saving regenerates `DESIGN_SYSTEM.md` and `tokens/` from canonical
  records. Edit the records, not these derived views.
- **Workspace validation:** `MONET_ROOT=~/my-design-system pnpm validate` checks your copy
  for broken references and design-system integrity problems.
- **Read-only MCP:** tools and resources read the chosen workspace. They do not write files
  or open a network listener.

## What review means

Monet checks **deterministic evidence supplied by the caller** against resolved token
scales, component decisions, and contrast contracts. It does not inspect your repository,
verify that the evidence is complete, or judge a rendered layout. Missing evidence can be
unverifiable; a concept with no applicable rule is not applicable. **An absence of findings
does not prove correctness or conformance.** See [review limitations](docs/MCP.md#limitations).

## Optional AI features

Source inventory mapping and visual-reference analysis can use a local AI CLI. Both are
off by default; all core editing, retrieval, validation, review, and MCP features work
without one. Set `MONET_AI_COMMAND` to opt in. Its current argument contract requires a
compatible CLI or wrapper; see [the exact invocation](docs/ARCHITECTURE.md#optional-ai-assisted-features).
The configured CLI may send data to its provider. Monet itself has no model API or account.

## Documentation and contributing

- [Workspace guide](docs/WORKSPACE.md) — configuration, canonical files, exports, and modes
- [MCP guide](docs/MCP.md) — setup, tools, resources, and evidence review
- [Architecture](docs/ARCHITECTURE.md) — application internals and optional AI
- [Starter workspace](monet/README.md) — what the example contains
- [Contributing](CONTRIBUTING.md) — setup, expectations, and checks

Run `pnpm check` before contributing: it builds, lints, tests, and validates the starter.
[mise](https://mise.jdx.dev/) is optional; `.mise.toml` configures the same toolchain and tasks.

## License

[MIT](LICENSE). Monet is a clone-and-run application. The package remains `private` to
prevent accidental npm publication; that does not restrict use under its license.
