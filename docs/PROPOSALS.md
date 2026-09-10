# Gaps V2: Proposals and Apply

A Proposal turns an eligible Gap diagnosis into a reviewed, typed change set
against canonical Monet records. Drafting, review, revision, and approval
modify nothing. **Apply** is the one step that writes: it takes an approved
revision, named by number and hash, through a journaled, recoverable
transaction and leaves a receipt. Revert, taxonomy creation, MCP writes, and
multi-project support are later phases.

## Workflow

1. Open a diagnosed Gap. Below the diagnosis, **Propose improvement** appears
   when the server reports the diagnosis eligible; otherwise the reasons are
   listed.
2. The proposal page shows the **basis** (the eligible findings), the records
   the proposal may amend, and the drafting area.
3. Draft revision 1 with the configured AI provider, or add changes by hand.
   Manual drafting needs no provider.
4. Each change is a before/after line diff labelled **AI-drafted** or
   **Human-edited**. Edit values by type, add or remove changes, and start one
   new pattern when a decision was missing.
5. **Save revision** re-snapshots current values and runs the checks.
6. **Approve revision N** binds approval to that exact revision and its hash.
   **Reject** closes the proposal; **Supersede** derives a new one from the
   Gap's current diagnosis and carries eligible changes forward.
7. On an approved proposal, **Approved → Apply approved changes** shows the
   exact records and files that would change, the live validation, integrity,
   and staleness state, and a warning that canonical Monet changes. **Apply
   approved changes** writes them. See [Apply](#apply).

## Eligibility

A Gap can back a proposal only when it has a diagnosis whose knowledge
fingerprint equals the current workspace fingerprint and at least one basis
finding is classified `missing_decision`, `weak_guidance`,
`conflicting_guidance`, or `retrieval_relationship` and is not flagged as a
possible contradiction of measured checks. A basis finding is either an AI
finding of the diagnosis or a **human review** of it.

`implementation_violation`, `project_specific`, and `insufficient_evidence`
findings never justify a proposal on their own. A stale diagnosis must be run
again first. Findings flagged as contradictions are excluded even when their
classification is otherwise eligible.

### Human review: the no-provider path

Without an AI provider the diagnosis is deterministic and can only report
measured violations or insufficient evidence, so no Gap would ever reach a
proposal. Instead of making `insufficient_evidence` eligible, a person records
a review of the diagnosis on the Gap page: one of the four eligible
classifications, a conclusion, optional reasoning, and at least one cited
record that exists in the current workspace (two distinct records for a
conflict). When the diagnosis measured conformance errors, the reviewer must
explicitly acknowledge them; the review never removes or excuses a measured
finding, and both appear in the proposal basis.

The review is bound to the diagnosis it classified and to the knowledge
fingerprint at the time. Diagnosing again clears it; a knowledge change makes
it inert until it is recorded again; replacing it makes proposals derived from
it stale. It is stored on the Gap record as editor-only evidence, labelled
**Human review with citations** wherever it is shown, and is never a canonical
write.

## Targets and changes

A proposal may amend only the records the eligible findings cited, by key
(`principle:`, `foundation:`, `pattern:`, `component:`, `primitive:`,
`theme:`). Each change names one field of one record and carries a typed value:
text, Markdown, status, a string list, an id list, a string map, a boolean map,
a Foundation token list, or a theme override map. Selection, candidates,
decision history, source mappings, references, and record identities cannot be
changed.

Proposals cannot express changes to fields outside that set, and the
projection never changes one implicitly. A component status change to
`undecided` while the record names a selected inspiration is refused by the
checks (`excluded_field_transition`) rather than silently clearing the
selection; the person clears it in the Components editor first, or keeps the
status.

Foundation tokens are edited as the JSON the Foundation file stores, so every
field round-trips, and the saved value is normalized the way `saveFoundation`
normalizes it (`id`, `foundation`, `order`, sorted). The review diff shows one
readable line per token; the editor and the diff are separate serializations.

When a `missing_decision` finding is present the proposal may also create
exactly one new pattern. It must set a title, summary, and body, and must link
at least one component or Foundation the diagnosis cited. No other record kind
can be created.

`shared/proposals.ts` owns the field table, value schemas, eligibility rules,
the in-memory projection, the generality lint, and the value text used for
diffs. `server/proposalStore.ts` persists proposals and enforces the rules;
`server/proposalDrafting.ts` is the optional AI path.

## Revisions, authorship, and approval

Every save appends a revision. The server, not the client, snapshots each
changed field's current value as `before`, decides authorship, computes checks,
fingerprints every amended record and the whole knowledge set, and hashes the
revision content (summary, rationale, and changes). A record fingerprint covers
every proposable field of that record, and the knowledge fingerprint includes
titles and names, so a change to any of them marks a proposal stale.

Authorship is a chain: a value unchanged from the previous revision keeps that
revision's author, a value equal to the AI draft is **AI-drafted**, and any
other value is **Human-edited**. A summary-only save, a later revision, a
refresh, and a supersession all preserve field-level provenance. AI drafting is
available only before the first revision is saved.

Approval names the current revision number and hash exactly. Before approving,
the server re-hashes the stored revision content and refuses a mismatch. A
proposal file edited outside Monet is flagged on every read: every corrupt
revision stays listed as evidence, but only the current revision's integrity
decides approvability, so saving a clean new revision recovers the workflow.
The same rule (`approvalBlockers`) is applied by the server and mirrored by the
UI. The server then verifies every snapshot still equals the live record, and reruns
prospective validation and the lint against the live workspace rather than
reading the stored checks. It is also refused when the proposal is stale,
rejected, or superseded. Any new revision clears approval and returns the
proposal to draft.

Saved revisions are rendered from their own stored snapshots. When a target
record has changed since, the current canonical value is shown separately and
labelled as such; approved, rejected, and earlier revisions never change
appearance because a record moved.

## Staleness

Each read recomputes staleness against current records: amended targets whose
content fingerprint changed, targets that no longer exist, a created pattern id
that now exists, a Gap that was diagnosed again, or a Gap that was deleted. A
stale proposal cannot be approved until it is **refreshed**: the same summary,
rationale, and proposed values are saved as a new revision with fresh snapshots
and fresh checks, keeping each change's author, so no content edit has to be
invented. A re-diagnosed or re-reviewed Gap requires supersession instead.
Changes to unrelated records are reported as informational knowledge drift and
do not block.

## Checks

**Prospective validation** projects the changes onto an in-memory copy of the
workspace, re-resolves tokens, and runs the same `validateWorkspace` checks as
`pnpm validate`. New errors block approval; new warnings and resolved findings
are shown.

The **generality lint** is a heuristic that flags text which looks
product-specific; it cannot prove that a change generalizes, and the UI says
so. Errors: a no-op change, a missing required field on a new record, a new
pattern that links no cited record, references to URLs or product source paths,
and a status transition that would require a field proposals cannot change.
Warnings: terms from the Gap report that look like product, screen, or team
names, product-local phrasing, cleared guidance, and literal colour or pixel
values in prose outside a Foundation. A reviewer decides.

## Storage and privacy

`proposals/<server-generated-id>.json` lives in the active workspace beside
`gaps/`, is created with mode `0600`, and is written atomically. Proposals are
absent from `Workspace`, exports, `DESIGN_SYSTEM.md`, `design-system.json`,
tokens, and MCP. The bundled starter ignores `monet/proposals/` in Git. Like
Gaps, proposals follow the workspace's own Git and backup policy.

AI drafting sends the Gap report, the diagnosis findings, and the cited records'
current values to the configured `MONET_AI_COMMAND` provider. Optional settings
are `MONET_PROPOSAL_MODEL`, `MONET_PROPOSAL_REASONING_EFFORT`, and
`MONET_PROPOSAL_TIMEOUT_SECONDS`. The prompt treats all evidence as untrusted
and asks for typed changes only; the result is validated like a manual
revision, and a failed or out-of-bounds draft saves nothing. Provider output is
never copied into the failure message.

## Routes

`POST /api/gap-reviews/:gapId` records a human review on the Gap.
`GET /api/gap-proposals/:gapId` reports eligibility and the Gap's proposals.
`POST /api/proposals` creates a proposal; `GET /api/proposals[?gap=]` lists;
`GET /api/proposals/:id` returns the proposal with staleness and target views.
`POST /api/proposal-revisions/:id`, `/api/proposal-drafts/:id`,
`/api/proposal-rebases/:id`, `/api/proposal-approvals/:id`,
`/api/proposal-rejections/:id`, and `/api/proposal-supersessions/:id` act on
one proposal. `GET /api/proposal-applications/:id` returns the apply plan and
`POST` applies; `GET /api/applications[?proposal=]` and
`GET /api/applications/:id` read receipts. State conflicts return 409, and an
Apply failure carries `kind` and, once writing started, the rollback receipt.
All routes keep the loopback local-origin boundary.

## Apply

Apply is the only path from a proposal to canonical Monet records. It is
deterministic and involves no AI: the provider has no role after drafting, and
nothing Apply writes comes from anywhere but the approved revision's stored
values.

### What can be applied

Apply V1 writes only through save paths that store and restore a record
faithfully today, and refuses everything else rather than approximating it:

| Target | Fields | Written through |
| --- | --- | --- |
| `principle:` | `title`, `body` | `principles/<id>.md` |
| `pattern:` | every proposable field, including the one new pattern | `patterns/<id>.md` |
| `component:` | `status`, `rationale`, `notes`, `use_when`, `avoid_when`, `preferences`, `behavior`, `foundations`, `primitives` | `components/decisions.json` |

Component `aliases` and `relationships` live in `taxonomy/components.json`,
which the editing service cannot write; Foundations (including tokens), themes,
and primitives are deferred until their save and recovery paths are proven the
same way. A proposal that contains any unsupported change is listed as such on
the plan and cannot be applied at all: **nothing is applied partially**. Make
those changes in their editors, or supersede the proposal without them.

`APPLY_SUPPORT` and `applySupport` in `shared/proposals.ts` are the table; the
UI and the server read the same one.

### Gates

`GET /api/proposal-applications/:id` returns the **plan**: what Apply would do
right now, computed against the live workspace without writing. `POST` with
`{ revision, hash }` applies. Under the proposal lock and the workspace write
lock, the server refuses unless all of the following hold:

- the proposal is `approved`, and the request names the approved revision
  number and hash exactly;
- that revision is the current one and its stored content re-hashes to the
  approved hash (a proposal file edited outside Monet fails here);
- the Gap still exists and was not diagnosed or reviewed again since;
- every amended record's content fingerprint equals the revision's, every
  `before` snapshot equals the live value, and a created pattern does not
  exist yet;
- prospective validation and the generality lint pass against the live
  workspace, rerun at that moment rather than read from the stored checks;
- every change is a supported target;
- no journal from an unrecovered application is on disk.

The shared rule for the saved state is `applyBlockers`; the server adds the
live checks. Refusals answer 409 with a `kind` (`state`, `integrity`, `stale`,
`unsupported`, `validation`) and write nothing.

### Transaction

Apply never leaves the workspace partially updated. The steps, in order:

1. Read every target file's current bytes (and confirm created files are
   absent) and write `applications/<id>.journal.json` with those bytes, their
   hashes, the records and derived files involved, and the validation errors
   that already existed. The journal is fsynced and renamed into place before
   any canonical write.
2. Write the records through the existing writers (`writePrincipleRecord`,
   `writePatternRecord`, `writeComponentDecision`), principles first, then
   patterns, then component decisions, from the workspace read under the lock.
3. Append a readable `decisions/<timestamp>-proposal-<id>.md` entry naming the
   proposal, revision, hash, receipt, and the records and fields changed.
4. Regenerate the derived exports once.
5. Read the workspace back, verify that every changed field now reads as the
   approved value (Markdown bodies are compared trimmed, as they are stored),
   and run `validateWorkspace`; any new error fails the transaction.
6. Write `applications/<id>.json`, the **receipt**. This is the commit point.
7. Mark the proposal `applied`, then remove the journal.

Any failure between steps 2 and 6 restores every journaled file to its before
bytes (created files are removed), regenerates the exports, verifies every
file's hash and the restored workspace's validation, writes a `rolled_back`
receipt, and answers with the receipt and a `kind` of `write_failed` or
`validation`. If the restore cannot be verified, the journal is kept, the
receipt says so, nothing can be applied until the next start, and the response
says to restart Monet. A failure after step 6 leaves the canonical change in
place and the journal on disk; recovery finishes the bookkeeping.

Ordinary saves take the same workspace write lock, so a save queued during an
application runs after it, and an application queued behind a save that
changed a target is refused as stale. Saves themselves remain last-writer-wins
whole-record writes, as before.

### Recovery

Before the file service listens it reads every `applications/*.journal.json`.
A journal whose receipt says `applied` was committed: the proposal is marked
`applied` if that was interrupted, and the journal is removed. Any other
journal is rolled back from its before bytes, the exports are regenerated, the
restore is verified, and a `rolled_back` receipt with `recovered: true` is
written; a restore that cannot be verified keeps the journal for the next
start. An unreadable journal stops startup, because the workspace may be
inconsistent and the journal holds the bytes needed to fix it by hand.

### Receipts and history

A receipt records the application id, proposal id, revision, hash, outcome,
start and finish times, whether recovery produced it, the failure message for a
rollback, whether the restore was verified, the records and fields changed,
every written file with its before and after hash, the derived files
regenerated, the final validation result, and the knowledge fingerprint before
and after. Receipts are editor-only: absent from `Workspace`, exports, and MCP,
listed by `GET /api/applications`, on the proposal page, and under **Applied
Gap proposals** on the Decision log page. The bundled starter ignores
`monet/applications/` in Git.

The `decisions/` entry carries the proposal summary, the record keys and fields,
and the identifiers. The Gap report, screenshot, proposal rationale, and basis
never leave the editor-only records. The summary is reviewer-written text and
is not linted; keep product names out of it.

An applied proposal is terminal: it cannot be revised, approved, rejected,
superseded, refreshed, or drafted. A duplicate Apply request for the same
revision returns the same receipt with `already_applied` and writes nothing;
concurrent duplicates queue behind each other. The proposal record keeps the
approval and gains `application: { id, applied_at }`; an `applied` status
without one is refused as corrupt.

### Revert

There is no rollback that bypasses approval, and no revert proposal yet.
Undoing an application means reporting a new Gap and going through Review →
Approve → Apply again. Generating a revert proposal from a receipt's before
snapshots needs a proposal basis that is not a diagnosis, which the eligibility
and staleness rules do not model today; it is deferred rather than bolted on.

## Limits

- Apply covers principles, patterns, and component decision fields only.
  Component `aliases` and `relationships` are proposable because retrieval
  gaps need them, but `taxonomy/components.json` has no editing-service write
  path; Foundations, themes, and primitives wait for the same proof.
- One new pattern per proposal, no other record creation.
- Receipts are per-workspace audit records; rolled-back attempts stay on
  record. Removing a receipt by hand makes an applied proposal report its
  receipt as missing.
- Recovery restores canonical bytes and regenerates exports; it does not
  restore file modes or timestamps, and it is single-workspace.
- The generality lint is heuristic and English-centric.
- Revision history is the stored revision list with its snapshots; no
  comments; no delete route (reject instead). Proposals are single-workspace,
  single-user records, and a human review records a classification, not an
  identity.
- The provider contract is the existing Codex-shaped CLI; drafting has no
  image input.
