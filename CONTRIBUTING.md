# Contributing to Monet

## Setup

Node 20.19+ or 22.12+ (Vite 7's range) and [pnpm](https://pnpm.io/).

```bash
pnpm install
pnpm dev        # UI at http://127.0.0.1:43140 plus the loopback file service
pnpm check      # build, lint, test, validate — run before every PR
```

Individual steps: `pnpm build`, `pnpm lint`, `pnpm test`, `pnpm validate`,
`pnpm test:mcp`. CI runs `pnpm check` on every push and pull request.

[mise](https://mise.jdx.dev/) is supported but not required: `.mise.toml` pins the
toolchain and mirrors the same tasks (`mise run check`), and every one of them is a
plain pnpm script underneath.

`pnpm-workspace.yaml` looks like a monorepo marker but is not one — pnpm 11 keeps
settings there, and this repository uses it to record that esbuild's build script is
intentionally not run. Deleting it breaks `pnpm install`.

## Two kinds of change

Monet is a tool; the directory it reads is a workspace. Keep the two apart.

**Tool changes** live in `server/`, `shared/`, `src/`, and `mcp/`. They must work
for any workspace, not just the bundled one. If a change needs a record that only
the starter workspace has, it belongs in the workspace instead.

**Workspace changes** live in `monet/`. That directory is a starter and worked
example, not the product. It is also the fixture the test suite asserts against, so
changing it can break tests — do it deliberately, and keep `pnpm validate` passing.
If you want a design system of your own, copy the directory and point `MONET_ROOT`
at your copy rather than editing this one.

## Layout

| Directory | Role |
| --- | --- |
| `shared/` | Domain model, retrieval, compact context. Runs in both Node and the browser. No filesystem, no DOM. |
| `server/` | File persistence, workspace resolution, validation, optional AI provider, loopback HTTP service. |
| `mcp/` | The MCP adapter. Validates protocol input, calls the shared service, strips internal fields. No retrieval logic of its own. |
| `src/` | The React workspace UI. |
| `docs/` | Architecture, MCP integration, and the workspace contract. |

The one-way rule: `src/` and `mcp/` may depend on `shared/`; `shared/` depends on
neither. `server/` owns everything that touches disk.

## Expectations

- **The workspace root is never hardcoded.** Read it through
  `server/workspace.ts`. A path literal pointing at `monet/` is a bug.
- **No provider-specific behavior.** Monet must work with any MCP client and with
  no AI provider configured. Anything that reaches an external CLI goes through
  `server/aiProvider.ts` and stays optional. That module's argument contract still
  matches the Codex CLI's flags; generalizing it is welcome, hardcoding a second
  provider is not.
- **A missing record set reads as empty.** `server/fileStore.ts` tolerates absent
  files and directories so a new workspace behaves the same through the UI, MCP, and
  `validate`. Only `initializeStore` writes; MCP and `validate` never do.
- **MCP stays read-only and thin.** No write tools, no remote transport, no auth.
- **Tests assert behavior, not snapshots.** Retrieval changes belong in
  `shared/retrievalEvaluation.test.ts` as natural task prompts with expected and
  forbidden IDs — not as an exact result set, and not as one alias per test
  phrase. Fix the mechanism, not the prompt.
- **Derived files stay derived.** `DESIGN_SYSTEM.md` and `tokens/` are generated;
  edit the canonical records and regenerate. Keep exports free of timestamps so
  they do not churn.
- Match the surrounding code: TypeScript throughout, comments that explain *why*.

## Reporting a retrieval problem

Retrieval is deterministic, so a report is reproducible. Include the query, the
records you expected, and the records you got:

```bash
MONET_ROOT=/path/to/workspace pnpm validate
```

Then add the case to `shared/retrievalEvaluation.test.ts` in the same shape as
the cases already there.
