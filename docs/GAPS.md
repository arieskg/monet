# Gaps V1: capture and diagnosis

Gaps records places where a real product exposed a weakness in Monet. References
captures inspiration; conformance checks submitted observations against existing
decisions; Gaps asks why the guidance did not lead to the intended outcome.

This release ends at diagnosis and recommendation. It has no proposal approval,
apply operation, canonical record mutation, product-code fix, bulk learning, or
MCP write tool.

## Workflow

1. Open **Gaps** under **Build with it**, then **Report gap**.
2. Paste, drop, or upload a PNG, JPEG, or WebP screenshot (up to 10 MB). Images are
   prominent but optional: non-visual gaps are valid.
3. Describe **What went wrong?** Add product/task context and the expected outcome
   if useful. Additional evidence can include notes, the original task query,
   historical guidance, theme/mode, and a JSON array of conformance observations.
4. **Save gap** persists the report and image together before any analysis.
5. **Diagnose** inspects current Monet knowledge and any structured observations,
   then optionally asks the configured AI provider to interpret the evidence.
6. Review the conclusion, findings, evidence, relevant records, reasoning,
   uncertainty, and recommended next actions. Expand the retrieval/conformance
   details to see exactly what the deterministic checks established.

A diagnosed Gap can also carry one **human review**: a person's classification
with cited records, used by Proposals when no AI provider is configured. It is
part of the Gap record, is cleared by a new diagnosis, and is described in
[PROPOSALS.md](PROPOSALS.md). Reports are immutable in V1. A successful Diagnose again replaces the latest
diagnosis against current knowledge; it does not rewrite the original report. The UI can be closed
during a diagnosis. Reload the saved report to see a completed result. A service
restart interrupts a running analysis, but the saved report remains available for
retry. There is no persisted running state that can become permanently stuck.

## Storage and privacy

`gaps/<server-generated-id>.json` is relative to the active workspace selected by
`--root` or `MONET_ROOT`. Each versioned record contains the report, timestamps,
optional image metadata and base64 payload, and the latest diagnosis. The image
shares the report's atomic replacement, avoiding an asset/record transaction and
orphaned screenshots. Files are created with mode `0600`. A failed replacement
preserves the previously saved record and removes its temporary file.

The server validates input shape, text lengths, image byte size, base64 encoding,
and PNG/JPEG/WebP signatures. It accepts no caller-provided asset paths, report IDs,
or diagnoses. SVG, HTML, PDF, URLs, and other attachments are not supported in V1.
Signature checking is not a full image decoder; the UI reports an unreadable image
without losing the report. Image metadata is not stripped. Crop or redact sensitive
content before saving; files are local, not encrypted, and follow the workspace's
own backup/Git policy. The bundled starter ignores `monet/gaps/` in Git. Other
workspaces retain their own Git and backup policy; exclusion from Monet guidance
is not a promise that Git, backups, or the configured provider will forget evidence.

Use **Delete gap** on a saved report and confirm to remove its report, diagnosis,
and embedded screenshot together. Deletion is blocked during an active diagnosis
so completion cannot recreate the evidence. Later report/image GETs return 404.
Deletion does not remove copies already retained in Git, backups, or a provider.

List and detail responses omit image bytes. The ID-only image route serves the
saved bytes with a verified image MIME type, `nosniff`, sandbox CSP, and `no-store`.
The loopback service retains Monet's existing local-origin boundary; Gaps does not
introduce authentication or a remote transport.

Gaps is deliberately absent from `Workspace`, `DesignContext`, MCP, references,
preview compilation, `DESIGN_SYSTEM.md`, `design-system.json`, and token exports.
Later canonical saves also cannot leak Gap evidence into exports. Missing Gap
directories read as empty without creating files. Malformed records remain errors.
Only editor initialization materializes the directory.

## Diagnosis

`shared/gaps.ts` owns the editor-only contract and input schema.
`server/fileStore.ts` owns persistence and invokes `server/gapDiagnosis.ts`.
The diagnosis layer reuses the shared service over one workspace snapshot; it
does not add retrieval logic or ask MCP to write anything.

The pipeline:

1. Build an explicit projection of all Principles, Foundations (including tokens),
   Patterns, joined Components, primitives, and Themes. Exclude reference memory,
   source inventories, decision history, and filesystem paths.
2. Replay the original query, or a bounded query from product context/problem, using
   existing retrieval and relationship expansion. Keep its provenance and notices.
3. Supply compact output alongside full canonical knowledge so missing retrieval
   and lost compact qualifiers can be distinguished from missing decisions.
4. Run `reviewDesignUsage` on the supplied observations. Preserve its checked,
   unverifiable, and not-applicable coverage. No observations means no conformance
   claim. Images never become fabricated computed styles or interaction evidence.
5. Optionally run the provider with a strict output schema, then validate its output
   again at runtime. Reject unknown classifications, unknown record/evidence IDs,
   uncited existing-guidance findings, or invalid image claims. Conflicting guidance
   requires two distinct Monet records; a missing decision requires at least one
   nearest existing record examined. Every finding must cite report-derived evidence:
   screenshot, retrieval and catalog citations alone do not qualify. Inspection
   requires an attached image and explicit, nonempty `image_observations`.
6. Persist the diagnosis with a canonical-knowledge fingerprint, time, version,
   provider outcome, and explicit image-inspection status.

Findings may mix missing decisions, weak guidance, retrieval/relationship problems,
conflicting guidance, already-covered implementation violations, project-specific
choices, and insufficient evidence. The AI recommends; it is not a conformance
authority. The trust order is **measured evidence > user report > AI interpretation**.
Measured errors control the headline; the AI conclusion is saved separately as
interpretation. The UI separates **Measured checks** from **AI interpretation**,
labels AI implementation findings **Suspected violation**, and keeps the notice
that no canonical records changed visible under the diagnosis header. Each deterministic error preserves
its conformance check ID, its basis (`monet_rule` or `wcag_floor`), and relevant record
keys when the check refers to a Monet token or component. Literal contrast failures
against a WCAG floor do not claim to contradict Monet guidance.

The provider must state `measured_errors` as `acknowledged`, `disputed`, or
`not_assessed`. A mechanical possible-contradiction flag is set when measured errors
coexist with a disputed assessment, a missing-decision finding, or an insufficient-
evidence finding citing the measured usages. This conservative signal may flag
coexisting causes; it does not reconcile semantics or prove the AI wrong. Flagged
AI findings stay visible below measured checks. AI reasoning and image observations
remain unverified; citation validation does not increase their confidence. A missing
retrieval match never automatically becomes a missing decision. No findings never certifies the UI.

Current knowledge cannot reconstruct historical delivery. Original queries and
pasted guidance are labelled as user evidence; links open current records. Missing
appearance defaults to light and is disclosed. Unsupported themes/modes disclose
fallback rather than silently comparing against the wrong context.

## Optional provider and images

Use the existing `MONET_AI_COMMAND` compatible CLI contract. Optional Gap-specific
settings are `MONET_GAP_MODEL`, `MONET_GAP_REASONING_EFFORT`, and
`MONET_GAP_TIMEOUT_SECONDS` (default 300 seconds).

Image support defaults off. Set `MONET_AI_IMAGES=1` only when the configured CLI or
wrapper supports `--image <local-file>` and its model can inspect images. Monet
then stages one private temporary image, passes it through `server/aiProvider.ts`,
and removes the staged copy after completion or failure. Other AI workflows do not
automatically start sending images when this flag is enabled.

Without that capability, the provider receives text and structured evidence only;
the UI states **Screenshot saved · not inspected by AI**. An enabled provider can
also report that it could not inspect the image. Successful inspection is labelled
as provider-reported, not independently verified.

Diagnose discloses that the report/current knowledge, and optionally the screenshot,
go to the configured provider. A local CLI may itself use an external service.
Prompts explicitly treat screenshots, reports, historical guidance, and canonical
content as untrusted evidence, prohibit following embedded instructions, and request
diagnosis only. The configured CLI remains responsible for honoring its read-only
sandbox; this is not an OS security boundary for arbitrary wrappers.

With no provider, deterministic retrieval/conformance results are still saved.
Provider failure or invalid output saves a deterministic fallback only if there is
no prior successful diagnosis (a provider-free deterministic review counts as
successful). Otherwise the entire saved file remains byte-for-byte unchanged and
the response returns a separate `failed_retry` for the UI to display. An unavailable
provider also cannot replace a prior completed AI diagnosis. The failed attempt is
not persisted as diagnosis history; reloading retains the prior diagnosis. Provider
stderr/output is not copied into the Gap failure message. Failure before analysis or during persistence leaves the saved report and prior diagnosis
untouched. Retry does not duplicate the report.

## V1 limits and verification

- One raster image per report; no editing, closure state, or diagnosis history.
  Confirmed deletion is supported.
- Latest diagnosis only; no background job manager. Concurrent requests for the same
  Gap are rejected within the running editing service. Use one editing service per
  workspace, as with existing Monet saves.
- The AI receives the full canonical projection, capped at 600,000 characters.
  Oversized workspaces retain deterministic review and a clear limitation. Knowledge
  is never silently truncated to support a missing-decision claim.
- Screenshot interpretation and semantic sufficiency/conflict judgments remain
  AI-assisted and uncertain. Citation validation proves IDs exist, not that reasoning
  is correct. No new retrieval architecture or automatic engineering fix is included.
- Embedded images simplify atomic persistence but increase JSON read/write cost.
  The initial inbox is intended for a small local collection.

Run `pnpm check`. Gap tests cover empty reads, immutable capture, image bytes,
invalid input, atomic disk-failure recovery, provider failure/retry, concurrent runs,
privacy/export isolation, mixed findings, evidence citation validation, full-catalog
inspection, image capability/declined inspection, and deterministic violations.
Regressions also cover measured headline precedence, possible contradictions,
byte-preserving failed retries, citation requirements, image observations, deletion
and subsequent HTTP 404s, and rendered UI provenance and the visible no-change notice.
Provider contract tests exercise image staging/cleanup and early CLI exit with a
large prompt.

For manual checks use a copied or empty workspace, save a screenshot report, reload,
diagnose without a provider, retry with a failing provider, then a compatible fixture
provider. Also submit a non-visual report and inspect narrow/light/dark layouts.
Fixture providers test the transport and UI; they do not evaluate model quality.

## Proposal V2

Proposals (drafting, review, and approval) and Apply are documented in
[PROPOSALS.md](PROPOSALS.md). They build on this release exactly as planned:
separately persisted, editable typed change sets linked to a Gap diagnosis and
workspace fingerprint, approval bound to an exact revision, prospective
validation, stale-review protection, and a journaled, recoverable application
of the approved revision that leaves a receipt. The Gap record itself, its
screenshot, and the diagnosis never reach a canonical record: Apply writes only
the approved values, and its decision-log entry names the proposal and the
records changed, nothing from the report.
