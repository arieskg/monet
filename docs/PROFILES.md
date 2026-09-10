# Profiles V1

Profiles give each independent design identity its own storage and stable UUID. A Project consumes one Profile; Mode is an appearance choice. Existing Themes remain optional compatibility data inside a Profile. No Theme is part of a Profile or Project identity.

## Storage and ownership

The application library defaults to `~/.monet`. Set `MONET_LIBRARY` to choose another location. Its `library.json` contains versioned Profile registrations, the original enrollment ID, and minimal Project bindings. Roots are application-private canonical paths. Names are editable labels; identity never comes from a name, directory basename, or natural-language query.

Each registered root contains `profile.json` with a version, UUID, name, creation time, and origin (`enrolled`, `scratch`, `monet-starter`, or `fork`). Fork provenance records the source Profile and fingerprint; starter provenance records its package version and digest. Profiles do not inherit live data.

All existing workspace paths stay local to that Profile: Principles, Foundations/tokens, taxonomies, Primitive/Component decisions, Patterns, compatibility Themes, Sources, References/assets/analysis, decision logs, Surfaces, Gaps, proposals, receipts, journals and generated exports. Private evidence never joins the shared `Workspace` or MCP context.

New Profiles live at `<library>/profiles/<uuid>`. Creation stages a new directory, validates it, syncs its files, publishes it, and commits registration. `pending-profile.json` retains an interrupted publication for startup recovery. A pending publication blocks further library mutations rather than risking a second creation. Failed pre-publication creation removes only its own staging directory. Enrollment never overwrites a destination or copies records.

The frozen `presets/monet-starter.json` package is Monet's bundled 0.1.0 seed, taken from the repository's pre-Profile starter records. It has its own license and digest. Editing the original workspace cannot change future starter creation. Forks copy knowledge and Sources; References/assets require the explicit checkbox. Forks exclude private evidence, outstanding approvals, receipts, and separate decision logs. Embedded canonical Component history remains part of the copied decision. Starter license notices follow a fork.

## Enrollment and compatibility

The service resolves `--root` → `MONET_ROOT` → the bundled workspace as before. It enrolls that directory in place, recovering pending Apply work under its existing verification rules before adding an identity. Existing bytes, filenames, assets, revision hashes, Surface hashes and completed receipts remain unchanged. Themes are never reinterpreted as Profiles.

A new empty or absent root starts as a **scratch Profile**. The editing service initializes the same directories, empty taxonomies/registries and derived exports as explicit scratch creation, without adding a Theme or Monet example decisions. Start writing Principles/Foundations immediately, or choose **New Profile → Monet starter** for the full example catalog. Persisting the scratch identity before initialization lets a failed first run resume with the same UUID before registration. Populated legacy enrollments never enter this initializer. Forking a Theme-free Profile also remains Theme-free; starter/fork Themes are copied only when present.

Legacy records without scope belong to their enrolled enclosing workspace. Their old hash algorithms remain supported. New private records carry `profile_id` and `scope_version: 2`; new proposal revisions also carry `hash_schema: 2`, binding Profile identity into the revision hash. A legacy unapplied approval remains historical evidence, but requires a newly saved scoped revision and human approval before Apply. Old revisions are neither rehashed nor presented as newly approved.

Old `/api/...` routes remain bound to the workspace selected at **service startup**, even when that workspace is not the library's first enrollment. They never follow UI selection. New editor URLs use `/api/profiles/<uuid>/...` and assert the same UUID in `X-Monet-Profile`.

MCP and validation never enroll or initialize a workspace. An unregistered empty root still reads as empty. Malformed records remain errors. CLI root and Profile flags with missing/invalid values fail instead of falling back.

## UI workflow

The sidebar and mobile navigation offer Profile selection, creation, and renaming. Create an empty Profile, an independent Monet starter, or a knowledge fork of the current Profile. The chosen Profile appears in the browser URL and remains there during navigation/reload.

Switching opens a fresh document with an immutable API binding. This intentionally closes unsaved editors and clears page-local state, caches, modal state, selected records and pending responses. Submitted operations retain their captured server Profile and may finish there. The new document cannot receive an old document's promises. Other tabs retain their own bindings.

A failed Profile can still be selected from the boot/error screen; the selector allows returning to a healthy Profile. The library can list healthy registered Profiles even when another Profile's recovery fails.

## Services, jobs, locking and recovery

`ProfileScope` is immutable and carried through async continuations using `AsyncLocalStorage`. `createProfileStore` exposes domain operations bound to that scope; it does not expose arbitrary filesystem readers or unlocked proposal internals. `createProfileService` binds the existing shared read service and holds one owned read boundary for multi-read context/conformance operations. There is no combined cross-Profile retrieval index.

Canonical queues and recovery blocks are keyed by canonical root. Access ownership includes root and Profile ID: another Profile cannot borrow a transaction's read or write privilege. Proposal/Apply job keys include root, and Gap jobs use their absolute scoped file path. The bounded Surface import concurrency cap remains application-wide because it limits CPU/memory, not data ownership.

Gap provider work captures its Profile and knowledge snapshot, runs outside the canonical queue, and re-enters the guard before publishing. Its per-Gap lock rejects concurrent diagnosis/review/deletion. Reference and Source provider work retain their existing coordinated writers. Late work cannot follow editor selection or recreate a moved/replaced root. Bound scopes recheck root identity, inode, and registered UUID; writes also recheck storage before durable publication.

Safe Apply's canonical targets are unchanged: Principles, Patterns and the existing supported Component fields. Scope is checked on Gaps, revisions, approvals, journals and receipts. Recovery compares scoped ownership in addition to the existing hashes, exact approval, file allowlists, validation, rollback and durability checks. Foreign or inconsistent evidence is retained and recovery remains blocked. Receipt metadata remains directly inspectable for recovery diagnostics; it never grants access to canonical records.

Duplicate IDs are allowed **inside different Profiles**. Duplicate/overlapping registrations, copied Profile identities and linked storage are rejected. Internal symlinks and multiply linked files are unsupported to prevent storage aliases. A move keeps identity and requires an offline filesystem move followed by explicit registration repair; a still-present original prevents a move registration. A fork always receives a new UUID. V1 retains the existing requirement of one editing service per workspace; it is not a multi-process write coordinator or a sandbox against a concurrently hostile local filesystem.

## Surfaces, Gaps and Projects

New Surface records and comparison runs carry Profile scope. The selection can assert `profile_id`; a mismatch fails before saving. Theme selection is optional, and theme-free Profiles work with Mode alone. Saved original snapshots/bindings remain immutable; revising a legacy Surface adds a scoped run without rewriting old hashes.

Surface-to-Gap handoff records structured Profile, Surface, revision, snapshot-hash and run-hash provenance. Optional Project evidence uses `{ project_id, binding_revision }`. The server checks that binding against the selected Profile for new comparisons and Gaps.

New Gaps with Surface provenance must reference an existing saved Surface revision in that Profile. The server verifies stored record/run ownership and integrity, then matches the supplied revision, run hash and snapshot hash before publishing the Gap. This is a creation-time check: deleting a Surface later does not erase or invalidate a retained Gap's copied historical evidence. Free-form Gap prose remains user-authored, not authenticated provenance.

The application-level Project contract is `{ id, name, profileId, bindingRevision }`. New bindings begin at revision 1; reassignment is refused. One Profile may serve several Projects. The registry exposes validated binding and assertion methods to the connection layer. [Surfaces V1.1: Local Project Connection](PROJECTS.md) builds on this contract with Profile-bound project records, bounded discovery and isolated capture; V1 itself deliberately shipped no discovery, execution or capture.

## MCP, Build With It and exports

One read-only MCP process serves one captured root. `MONET_PROFILE_ID` or `--profile <uuid>` asserts its identity; disagreement with `--root`/`MONET_ROOT` fails. Existing unqualified resource addresses are aliases within that fixed connection. Qualified addresses use `monet://profiles/<uuid>/...`, and `.../tokens/<mode>` works without a Theme. A `profileId` tool argument is an assertion, never a request to retarget.

Every MCP delivery identifies its Profile. Compact/full context and conformance include a knowledge fingerprint; catalog and Profile-mode token results also carry it. Build With It shows the Profile and generates both root and expected-ID configuration. Project registrations, roots, private evidence, journals and credentials remain outside MCP responses.

The delivery fingerprint covers canonical decision knowledge, default resolution, Sources and References/analysis. The legacy decision fingerprints used by Gaps, Surface staleness and proposals retain their established algorithms. Neither fingerprint substitutes for Profile identity: independent copies may have equal content hashes.

UI exports identify the Profile and fingerprint, including individual collection downloads. Disk exports are generated within the captured Profile root. Existing `DESIGN_SYSTEM.md` and token/JSON file shapes remain compatible so historical receipt and recovery hashes are not invalidated; keep those compatibility files with their enclosing `profile.json`, or use the labeled UI export for portable delivery. No DESIGN.md export/import was added.

## Central API protections

All API routes now share loopback Host checks, the configured exact editor origin (`MONET_EDITOR_ORIGIN`, default `http://127.0.0.1:43140`), rejection of opaque/cross-site origins, JSON mutation content-type checks, and no-store JSON responses. Another local application port is not an allowed editor origin. Originless native clients remain supported; this is a browser isolation boundary, not authentication against local processes. Empty native commands retain compatibility.

## Remaining Theme dependencies

Existing `Workspace` fields (`activeThemeId`, `defaultThemeId`), preview/export controls, compatibility Theme resources, Reference suggestion types and old history still mention Themes. Their resolution remains in `shared/tokens.ts`. Removing Themes later requires adjusting those compatibility fields/controls/resources and defining how existing explicit overrides are retained or retired. It does not require changing Profile UUIDs, Project bindings, Gap ownership or new Surface ownership. Scratch Profile initialization and Profile-mode MCP resources demonstrate the Theme-free path now.

## Deliberate V1 limits and next work

- Profile switching reloads the document and discards unsaved UI edits; no draft transfer or silent cross-Profile saves.
- Additional-root enrollment and offline move repair are server registry operations; creation/selection/rename are the V1 UI workflows. No deletion, live inheritance, automatic updates, or Project reassignment.
- One editing process per workspace remains required. Local files/library are trusted administrative input; alias checks do not claim to defeat arbitrary concurrent OS-level mutation.
- Full-tree link verification repeats during reads/writes and becomes expensive with large Reference asset collections. Optimize only with equivalent alias/identity checks and adversarial coverage; no verification shortcuts were introduced in this pass.
- An orphaned pending publication with neither staging nor destination evidence fails startup closed. A future repair workflow should expose the retained evidence and permit deliberate administrative recovery without weakening publication checks.
- Before Surfaces V1.1: expose Project registration/connection UX using the binding contract, implement bounded inventory/discovery, and capture explicit routes from user-started fixture servers in an isolated browser. Add egress/redirect/service-worker controls and representative AriesKG/ConvoGym fidelity tests. Preserve static sanitizer, explicit mappings and scoped evidence.
- External preset catalog, DESIGN.md importing, arbitrary project execution and widened Safe Apply targets remain deferred.

## Implementation choices versus the assessment

The existing store implementation is retained behind immutable scope-bound adapters and async context rather than rewriting every file helper to accept a root parameter. V1 switching uses a fresh document to make stale-response isolation structural. Legacy disk export shapes are retained for recovery compatibility, with portable identity added to UI/MCP delivery. The starter is a frozen Monet-owned package rather than copying the mutable original workspace. These choices preserve the proposed ownership model and migration boundary.

## Verification and merge recommendation — 2026-09-10

Implemented on `codex/profiles-v1`; no merge to `main` was performed.

| Check | Final result |
| --- | --- |
| `pnpm check` | PASS: TypeScript/Vite build, ESLint, 37 test files / 509 tests, workspace validation |
| `pnpm test:mcp` | PASS: 2 files / 21 protocol tests |
| `pnpm test:surfaces:browser` | PASS: 3 Chromium tests, including actual Profile creation/navigation/switching and delayed-response isolation |
| Fable adversarial review suite | PASS: 14 tests in `server/profilesReview.test.ts`; also included in the full check |
| Focused Profile regression/review run | PASS: 2 files / 33 tests, including interrupted fresh-root initialization |
| `git diff --check` | PASS |
| Visual inspection | Profile controls and rendered light/dark Surface comparison inspected from the browser screenshot |

Adversarial coverage includes independent roots with identical IDs; queued canonical saves; simultaneous Safe Apply with identical proposal/canonical IDs; provider completion after switching and after an offline move; copied foreign Gaps/proposals/Surface runs; wrong-profile and wrong-project comparisons; MCP assertion/resource mismatch; immutable identities and registry snapshot ownership; duplicate, nested and symlink roots; failed enrollment/seed/publication; publication resume; name changes; legacy reapproval; byte-preserved completed legacy receipts and Surface runs; blocked recovery isolated from healthy Profiles; and the existing Apply durability, receipt-verification, rollback, privacy and mixed-read tests. HTTP tests exercise Origin, Host, opaque origin, cross-site metadata and JSON content-type checks across the API, including profile management and Safe Apply. Browser tests retain opaque-frame/script/network/navigation protections and exercise late async UI responses after a Profile switch.

The test pass also preserves two intentional legacy behaviors: concurrent Gap diagnoses are rejected immediately, and receipt metadata remains available for recovery diagnosis while canonical access is blocked.

The independent review's fresh-root P1 is resolved by restoring initialized scratch scaffolding and exports, without restoring a mandatory Theme. New roots and absent roots both work; failed initialization resumes with the same UUID. Existing populated enrollment remains byte-preserving. Both review registry fixes are present: generated enrollment names satisfy the identity schema, and rename checks Profile availability before writing pending publication state. The Surface provenance P2 is also fixed narrowly at Gap creation, with no historical rewrite or new dependency on live evidence for reading retained Gaps.

**Recommendation: MERGE.** All requested verification passes and no known blocking isolation or historical-integrity defect remains within the supported single-editing-process model. Remaining P2 follow-ups are full-tree verification performance and an administrative repair experience for orphaned pending publications (which continue to fail closed). Management UX for additional existing-root enrollment/offline moves and draft preservation across switching remain V1 limitations. Empty Profiles retain the existing file-based path for authoring new taxonomies; choose the starter/fork path when the existing component vocabulary is wanted immediately. Local Project Connection still needs its Project UX, bounded discovery, isolated capture/egress controls and representative project fidelity checks before Surfaces V1.1 can ship. Those features, live inheritance, external presets, DESIGN.md importing, Theme removal and broader Safe Apply mutations were not implemented. No merge to `main` was performed.
