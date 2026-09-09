# Gaps V2 Phase 1: Proposals

A Proposal turns an eligible Gap diagnosis into a reviewed, typed change set
against canonical Monet records. This phase covers drafting, review, revision,
and approval only. **Nothing in it modifies a canonical Monet record.** Apply,
the journal and recovery it needs, receipts, revert, taxonomy creation, MCP
writes, and multi-project support are later phases.

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
one proposal. State conflicts return
409. All routes keep the loopback local-origin boundary.

## Phase 1 limits

- No Apply: an approved proposal is a reviewed intent, not a change. Approval
  is cleared by any later revision and blocked while stale, so Apply can later
  require an approved, current revision.
- Component `aliases` and `relationships` are proposable because retrieval
  gaps need them, but they live in `taxonomy/components.json`, which has no
  editing-service write path today. Apply must add one.
- One new pattern per proposal, no other record creation.
- The generality lint is heuristic and English-centric.
- Revision history is the stored revision list with its snapshots; no
  comments; no delete route (reject instead). Proposals are single-workspace,
  single-user records, and a human review records a classification, not an
  identity.
- The provider contract is the existing Codex-shaped CLI; drafting has no
  image input.
