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

Apply holds the shared workspace boundary through the entire transaction. Its
internal reads can see its own writes; normal reads and writes queue behind it.
A leftover journal blocks canonical access with HTTP 503, including ordinary
saves and proposal mutations. Only recovery can bypass this guard.

1. Read the target files and durably write `applications/<id>.journal.json`
   with their exact before bytes, hashes, approved identity, affected records,
   derived paths, and baseline validation errors. No canonical write precedes
   the journal.
2. Write principles, patterns, then component decisions through their existing
   record writers. Writes use a temporary file, file fsync, atomic rename, and
   directory fsync. Sync failures are errors, never silently ignored.
3. Write a deterministic `decisions/<timestamp>-proposal-<id>.md` audit entry
   containing identifiers, record keys, and changed field names only.
4. Regenerate and durably write the exports.
5. Read back the approved values and validate the resulting workspace. Capture
   canonical before/after hashes, export after-hashes, and the knowledge
   fingerprint in the receipt.
6. Durably write `applications/<id>.json`. Successful receipt persistence is
   the **commit point**, after all canonical and derived bytes are durable.
7. Durably mark the exact proposal revision `applied`, publish a new opaque
   `applications/.generation`, and durably remove the journal. Only then can
   normal workspace access resume.

A failure before receipt publication restores every journaled canonical file
to its exact before bytes, durably removes created files, regenerates exports,
verifies the restore, and writes a rollback receipt. An unverified restore
keeps its journal and blocks all subsequent canonical access.

A receipt rename can succeed before a later fsync fails. An existing receipt
then represents a **possible commit**: Apply keeps it and the journal and
blocks access. It never replaces possible commit evidence with a rollback
receipt. Recovery must prove the outcome. Failures while marking the proposal
or removing the journal likewise keep recovery evidence and block access.

Principle, Pattern, and Component full-record saves compare the submitted
`updated_at` with the current record under the lock. A stale save returns 409;
it must reload and review the current record. This includes saves queued
before Apply finished. Writers advance the version even within one millisecond.

### Read visibility and UI refresh

HTTP/UI and shared service reads use the same process queue as canonical
writes. They wait for a complete commit or rollback, or fail with a temporary
unavailable/recovery error; they never return an intermediate Apply workspace.

Read-only MCP processes also check the on-disk journal before and after loading
canonical files. The durable generation changes before journal removal, so a
reader that spans an entire transaction discards its result and asks the caller
to retry. MCP never creates a lock file, performs recovery, or writes anything.
This is read coordination, not interprocess write locking.

The Apply UI clears its cached workspace and closes canonical editors until a
fresh WorkspaceContext load succeeds. New Patterns and changed records then
appear throughout the UI. Late responses from older workspace requests are
discarded. If refresh fails, editing stays paused with a reload action; a
successful Apply is not presented as a rollback because refresh failed.

### Recovery

Recovery runs before initialization or listening. Journals are checked for
valid identities, allowed file paths, and matching before-byte hashes. An
unreadable or inconsistent journal stops startup without discarding it.

An `applied` receipt is not sufficient proof of commit. Recovery verifies its
identity against the journal; requires the proposal's latest revision and
approval to match the receipt's exact revision/hash; verifies canonical and
export after-hashes, knowledge fingerprint, and validation; and only then
reconciles that proposal to `applied`. It preserves the original commit time
and sets `recovered: true`. A later revision, mismatched receipt, missing file,
or inconsistent bytes stops recovery with the evidence intact. Older receipts
without export hashes cannot automatically finalize a leftover committed
journal; already completed historical receipts remain readable.

A journal with no receipt, or a matching rollback receipt, restores the
validated before bytes, regenerates exports, and records a verified rollback
with `recovered: true`. Failure to prove the restore keeps the journal and
prevents startup. Clearing the underlying I/O fault does not itself enable
writes: recovery must complete first.

### Receipts and history

Receipts record the approved identity, outcomes and times, recovery flag,
validation, affected records, canonical before/after hashes, generated export
hashes, and knowledge fingerprints. They remain editor-only. The Decision log
page distinguishes a verified rollback from an unverified restore and shows
receipt-loading failures with a retry action.

Canonical `decisions/` entries are generated only from the Gap and Proposal
ids, approved revision/hash, affected canonical keys and field names, and
application id. No free-form proposal summary, rationale, note, AI reasoning,
Gap description, product context, or screenshot observation is copied into
canonical history. Approved canonical field values remain subject to review
and the generality lint; that lint is not a proof of privacy for arbitrary
text deliberately approved as shared guidance.

An applied proposal is terminal. While a possible commit awaits reconciliation,
the journal guard also prevents revision, rejection, supersession, approval,
refresh, or drafting. After recovery, duplicate Apply for the same approved
revision returns its original receipt without writing again.

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
- Exactly one Monet editing-service process may access a workspace. Multiple
  editing services and hand edits racing Apply are unsupported. Synchronization
  is single-process; there is no distributed or interprocess write lock.
- Durability requires a filesystem supporting file and directory fsync. Sync
  failures fail closed. Tests inject crash states and I/O failures; they cannot
  prove storage hardware honors flush requests.
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
