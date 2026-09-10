# Working on Monet

This file is for agents changing **the Monet codebase**. It is not design guidance,
and Monet is not the design system for whatever repository contains this checkout.

If you are here to *apply* a design system rather than to build the tool, you want
the workspace instead: `monet/AGENTS.md` in the bundled starter workspace, or the
equivalent file in whichever workspace `MONET_ROOT` points at.

## What Monet is

A local tool with two faces over the same data:

- a React UI plus a loopback file service for editing a design-system workspace, and
- a read-only MCP server that hands that workspace to coding agents.

No database, no hosted service, no model API. Files on disk, and MCP over stdio.

## Layout and the one-way rule

| Directory | Role |
| --- | --- |
| `shared/` | Domain model, retrieval, compact context, preference contract. Runs in Node and the browser. No filesystem, no DOM. |
| `server/` | Everything that touches disk: workspace resolution, file store, validation, the optional AI provider, the loopback HTTP service. |
| `mcp/` | The MCP adapter. Validates protocol input, calls the shared service, strips internal fields. No retrieval logic of its own. |
| `src/` | The React workspace UI. |
| `monet/` | The bundled **starter workspace**. Example data, not application code. |

`src/` and `mcp/` may depend on `shared/`. `shared/` depends on neither. Only
`server/` reads or writes files.

## Rules that are easy to break

- **Never hardcode the workspace root.** It comes from `server/workspace.ts`
  (`--root` → `MONET_ROOT` → bundled starter). A path literal pointing at `monet/`
  is a bug, and so is assuming the bundled workspace's contents exist.
- **A missing record set reads as empty.** `server/fileStore.ts` tolerates absent
  files and directories so a brand-new workspace works identically through the UI,
  MCP, and `validate`. Malformed JSON still throws — new is not the same as broken.
- **Writes live in one place.** `initializeStore` materializes directories for the
  editing path. MCP and `validate` must never write to a workspace.
- **No provider-specific behavior.** Monet works with any MCP client and with no AI
  provider configured. Anything reaching an external CLI goes through
  `server/aiProvider.ts` and stays optional.
- **MCP stays read-only and thin.** No write tools, no remote transport, no auth,
  and no client-specific instructions. Conformance review is a read: `review_design_usage`
  validates protocol input and calls `shared/review.ts`, which never touches the workspace.
- **Gaps and Proposals are editor-only; only Apply writes canonical records.** `gaps/`,
  `proposals/`, and `applications/` hold private product evidence, reviewed change intents, and
  receipts. They stay out of `Workspace`, exports, and MCP, and `server/proposalStore.ts` projects
  changes in memory for validation only. The one canonical write is `server/applicationStore.ts`:
  an approved revision named by number and hash, rechecked under the workspace write lock, written
  through a journal that is rolled back or recovered at startup. Do not add another write behind
  approval, widen its target table without a proven save and restore path, or let anything a
  provider produced reach it.
- **Canonical writes are serialized.** Every save in `server/fileStore.ts` runs behind
  `server/writeLock.ts`; a new write path must too, and must not call a locked function from inside
  another locked one.
- **Conformance measures evidence, never source.** `shared/review.ts` parses no code and knows no
  framework. A check either measures what the caller submitted or reports it unverifiable; it never
  infers a violation from missing information, and a concept Monet has no scale or decision for is
  not applicable rather than a failure.
- **Derived files stay derived.** `DESIGN_SYSTEM.md` and `tokens/` are generated
  from the canonical records and carry no timestamps. Edit the records, regenerate.
- **Modes are values, not copies.** Light is a token's `value`; dark is its
  optional `modes.dark`. Resolution layers theme overrides over mode values over
  base values in `shared/tokens.ts`, and every surface (UI, exports, MCP,
  `validate`) resolves through that one function. Never add a parallel dark
  palette, a dark theme file, or a mode branch in product-facing code.
- **The starter workspace is a fixture.** Tests assert against it, so changing
  `monet/` can break the suite. Change it deliberately, and keep `pnpm validate`
  passing.

## Testing expectations

- Retrieval changes belong in `shared/retrievalEvaluation.test.ts` as natural task
  prompts with expected and forbidden IDs. Never pin an exact result set, and never
  add one alias per test phrase — fix the mechanism, not the prompt.
- Workspace invariants belong in `shared/designIntegrity.test.ts` and
  `server/validate.ts`, which should agree. Colour contracts — which roles must
  reach which contrast on which backgrounds — live once in `shared/contrast.ts`,
  and both read them; add a pairing there, not in either consumer.

## Checks

```bash
pnpm check      # build, lint, test, validate — run before finishing
pnpm validate   # workspace integrity only
pnpm test:mcp   # MCP protocol surface only
```

`CONTRIBUTING.md` has the human-facing version of the same setup.
