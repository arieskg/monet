import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { lineDiff } from "../../shared/diff";
import { gapClassificationLabels } from "../../shared/gaps";
import { PROPOSAL_FIELDS, fieldEditorText, fieldValueText, parseFieldText, parseRecordKey, proposalStatusLabels, valuesEqual, type ApplicationReceipt, type ApplyErrorKind, type ApplyPlan, type ProposalChecks, type ProposalFieldType, type ProposalIntegrity, type ProposalRevision, type ProposalRevisionInput, type ProposalStaleness, type ProposalView } from "../../shared/proposals";
import { ApiError, api } from "../api";
import { PageHeader, formatDate } from "../components/Common";
import { statusLabels, statuses } from "../domain";
import { proposalActions } from "../proposalActions";

function message(error: unknown): string { return error instanceof Error ? error.message : "Something went wrong. Try again."; }

/**
 * One change as the person edits it. `before` is the snapshot this change is written against: the
 * saved revision's own snapshot for an existing change, the current record for a newly added one.
 * The current canonical value is shown separately when it differs, never substituted.
 */
interface DraftChange { target: string; operation: "amend" | "create"; field: string; type: ProposalFieldType; before: unknown; text: string; note: string; error: string }
const slot = (change: Pick<DraftChange, "target" | "field">) => `${change.target}.${change.field}`;
const TEXT_HINTS: Partial<Record<ProposalFieldType, string>> = {
  string_list: "One item per line.", id_list: "One record id per line.", string_map: "One `key: value` per line; keys are snake_case.",
  boolean_map: "One `key: true` or `key: false` per line.", overrides: "One `token.name: value` per line.",
  tokens: "The token list as JSON, exactly as the Foundation file stores it. Every field round-trips; the diff above shows one line per token.",
};

export function ChangeDiff({ type, before, after }: { type: ProposalFieldType; before: unknown; after: unknown }) {
  const lines = lineDiff(fieldValueText(type, before), fieldValueText(type, after));
  if (!lines.length) return <p className="proposal-diff-empty">Empty before and after.</p>;
  return <pre className="proposal-diff" aria-label="Before and after">{lines.map((line, index) => <span key={index} className={`proposal-diff-line ${line.kind}`}><i aria-hidden="true">{line.kind === "added" ? "+" : line.kind === "removed" ? "−" : " "}</i>{line.text || " "}</span>)}</pre>;
}

export function ChecksPanel({ checks, revision }: { checks: ProposalChecks; revision: number }) {
  const { validation, lint } = checks;
  const errors = lint.filter((finding) => finding.level === "error");
  const warnings = lint.filter((finding) => finding.level === "warning");
  return <section className="proposal-checks" aria-label="Checks">
    <span className="eyebrow">Checks · revision {revision} · {formatDate(checks.computed_at)}</span>
    <h3 className={checks.ok ? "proposal-checks-ok" : "proposal-checks-blocked"}>{checks.ok ? "Ready for approval" : "Approval blocked"}</h3>
    <p className="gap-evidence-line">Prospective validation runs Monet’s workspace integrity checks over the projected records. The generality lint is a heuristic: it flags text that looks product-specific and cannot prove a change generalizes. Both are rerun against the live workspace at approval. Warnings never block; errors do.</p>
    <div className="proposal-check-group">
      <b>Prospective validation</b>
      {validation.new_errors.length ? <ul className="proposal-check-errors">{validation.new_errors.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p>No new integrity errors.{validation.baseline_errors ? ` The workspace already has ${validation.baseline_errors} unrelated.` : ""}</p>}
      {validation.new_warnings.length > 0 && <ul className="proposal-check-warnings">{validation.new_warnings.map((item, index) => <li key={index}>{item}</li>)}</ul>}
      {validation.resolved.length > 0 && <p className="muted">Resolves: {validation.resolved.join("; ")}</p>}
    </div>
    <div className="proposal-check-group">
      <b>Generality lint (heuristic)</b>
      {!lint.length && <p>Nothing product-specific detected. This is a heuristic result, not proof the change generalizes; read the diff.</p>}
      {errors.length > 0 && <ul className="proposal-check-errors">{errors.map((finding, index) => <li key={index}><code>{finding.target}.{finding.field}</code> {finding.message}</li>)}</ul>}
      {warnings.length > 0 && <ul className="proposal-check-warnings">{warnings.map((finding, index) => <li key={index}><code>{finding.target}.{finding.field}</code> {finding.message}</li>)}</ul>}
    </div>
  </section>;
}

export function StalenessNotice({ staleness }: { staleness: ProposalStaleness }) {
  if (!staleness.stale && !staleness.knowledge_changed) return null;
  return <div className={staleness.stale ? "gap-error" : "proposal-note"} role={staleness.stale ? "alert" : "status"}>
    {staleness.gap_missing && <p><b>The Gap behind this proposal was deleted.</b> It can be rejected but not revised, refreshed, superseded, or approved.</p>}
    {staleness.diagnosis_changed && <p><b>The Gap’s diagnosis or human review changed.</b> Supersede this proposal to re-derive it from the current basis.</p>}
    {staleness.changed_targets.length > 0 && <p><b>Target records changed since the last revision:</b> {staleness.changed_targets.join(", ")}. The diffs below keep this revision’s snapshot; the current value is shown beside it. Refresh to re-snapshot without changing the proposal.</p>}
    {staleness.missing_targets.length > 0 && <p><b>Target records no longer exist:</b> {staleness.missing_targets.join(", ")}.</p>}
    {!staleness.stale && staleness.knowledge_changed && <p>Other Monet records changed since the last revision. The targets are unchanged; checks rerun at approval.</p>}
  </div>;
}

export function IntegrityNotice({ integrity }: { integrity: ProposalIntegrity }) {
  if (integrity.ok) return null;
  const list = integrity.revisions.join(", ");
  return integrity.current_ok
    ? <div className="proposal-note proposal-integrity-history" role="status"><p><b>Earlier revision {list} no longer matches its hash.</b> The proposal file was edited outside Monet at some point. That history is kept as saved and stays flagged; the current revision is intact, so the normal approval checks apply to it.</p></div>
    : <div className="gap-error" role="alert"><p><b>Revision {list} no longer matches its hash.</b> The proposal file was edited outside Monet. The current revision cannot be approved; save a new revision from this page to continue. Earlier corruption stays on record.</p></div>;
}

const short = (hash: string) => `${hash.slice(0, 12)}…`;
const APPLY_BLOCKER_LABELS: Record<ApplyErrorKind, string> = { state: "State", integrity: "Integrity", stale: "Stale", unsupported: "Unsupported target", validation: "Validation", write_failed: "Write failed", busy: "Busy" };

function RecordLinks({ records }: { records: ApplyPlan["records"] }) {
  return <ul className="proposal-apply-records">{records.map((record) => <li key={record.key}>{record.route ? <Link to={record.route}>{record.title}</Link> : record.title} <code>{record.key}</code> · {record.operation === "create" ? "new record" : "amend"} · {record.fields.join(", ")}</li>)}</ul>;
}

/** One earlier attempt, from its receipt. Rolled-back attempts stay listed: they are audit history, not clutter. */
function AttemptLine({ receipt }: { receipt: ApplicationReceipt }) {
  const label = receipt.outcome === "applied" ? "Applied" : receipt.recovered ? (receipt.restored ? "Recovery completed at startup: rolled back, every file restored" : "Recovery ran at startup but could not verify the restore") : receipt.restored ? "Write failed and was rolled back: every file restored" : "Write failed and the restore could not be verified";
  return <li><b>{label}</b> · {formatDate(receipt.finished_at)} · receipt <code className="gap-hash">{receipt.id}</code>{receipt.failure ? <> · {receipt.failure}</> : null}</li>;
}

/**
 * Approved → Apply approved changes. Everything a person needs before the one write this workflow
 * allows: the exact records and files, the live validation, integrity and staleness state, and a
 * plain statement that canonical Monet changes. The button follows the server's plan exactly.
 */
export function ApplyPanel({ plan, busy, onApply }: { plan: ApplyPlan; busy: boolean; onApply: () => void }) {
  const attempts = plan.applications.filter((receipt) => receipt.outcome !== "applied");
  const checks = plan.checks;
  return <section className="proposal-apply" aria-label="Apply">
    <span className="eyebrow">Approved → Apply approved changes</span>
    <h3 className={plan.ready ? "proposal-checks-ok" : "proposal-checks-blocked"}>{plan.ready ? "Ready to apply to canonical Monet" : "Apply is blocked"}</h3>
    <p className="proposal-apply-warning" role="note"><b>This modifies canonical Monet records.</b> Apply writes approved revision {plan.revision ?? "?"}{plan.hash ? ` (hash ${short(plan.hash)})` : ""} to the files below, regenerates the exports once, and records a receipt. Every check is rerun under the write lock immediately before writing; if anything fails after writing starts, every file is restored byte for byte. No AI is involved.</p>
    {plan.blockers.length > 0 && <ul className="proposal-check-errors proposal-apply-blockers" aria-label="Blockers">{plan.blockers.map((blocker, index) => <li key={index}><b>{APPLY_BLOCKER_LABELS[blocker.kind]}:</b> {blocker.message}</li>)}</ul>}
    {plan.unsupported.length > 0 && <div className="proposal-check-group"><b>Approved changes Apply cannot write yet</b><ul className="proposal-check-errors">{plan.unsupported.map((item) => <li key={`${item.target}.${item.field}`}><code>{item.target}.{item.field}</code> {item.reason}</li>)}</ul><p className="muted">Nothing is applied partially. Make these changes in their editors, or supersede the proposal without them.</p></div>}
    <div className="proposal-check-group"><b>Records to be changed</b>{plan.records.length ? <RecordLinks records={plan.records} /> : <p>None.</p>}</div>
    <div className="proposal-check-group"><b>Files written</b><ul className="proposal-apply-files">{plan.files.map((file) => <li key={file.path}><code>{file.path}</code> · {file.action}</li>)}</ul><p className="muted">Derived exports regenerated once: {plan.derived.join(", ")}.</p></div>
    <div className="proposal-check-group"><b>Current state</b><ul className="proposal-apply-state">
      <li>Integrity: {plan.integrity.current_ok ? "the approved revision matches its hash" : "the approved revision does not match its hash"}{plan.integrity.revisions.length && plan.integrity.current_ok ? ` (earlier revision ${plan.integrity.revisions.join(", ")} flagged)` : ""}.</li>
      <li>Staleness: {plan.staleness.stale ? `stale (${[...plan.staleness.changed_targets, ...plan.staleness.missing_targets].join(", ") || (plan.staleness.gap_missing ? "Gap deleted" : "diagnosis changed")})` : plan.staleness.knowledge_changed ? "targets unchanged; other records changed since the revision" : "current"}.</li>
      <li>Validation and lint against the live workspace: {checks ? (checks.ok ? `no new errors${checks.validation.new_warnings.length ? `, ${checks.validation.new_warnings.length} new warning${checks.validation.new_warnings.length === 1 ? "" : "s"}` : ""}${checks.validation.baseline_errors ? ` (${checks.validation.baseline_errors} pre-existing)` : ""}` : `blocked: ${[...checks.validation.new_errors, ...checks.lint.filter((finding) => finding.level === "error").map((finding) => `${finding.target}.${finding.field} ${finding.message}`)].join("; ")}`) : "not run (see blockers)"}.</li>
    </ul></div>
    {attempts.length > 0 && <div className="proposal-check-group"><b>Earlier attempts</b><ul className="proposal-apply-attempts">{attempts.map((receipt) => <AttemptLine key={receipt.id} receipt={receipt} />)}</ul></div>}
    <div className="gap-actions"><button className="button primary" disabled={busy || !plan.ready} onClick={onApply} title={plan.ready ? undefined : plan.blockers[0]?.message}>{busy ? "Applying…" : "Apply approved changes"}</button></div>
  </section>;
}

/** The receipt of an applied proposal: what changed, whether validation passed, and how to verify it in the product that reported the Gap. */
export function ApplicationPanel({ receipt, plan }: { receipt: ApplicationReceipt; plan: ApplyPlan | null }) {
  const validation = receipt.validation;
  return <section className="proposal-applied" aria-label="Applied" role="status">
    <span className="eyebrow">Applied · {formatDate(receipt.finished_at)}{receipt.recovered ? " · bookkeeping completed by recovery" : ""}</span>
    <h3 className="proposal-checks-ok">Applied to canonical Monet</h3>
    <p>Receipt <code className="gap-hash">{receipt.id}</code> · revision {receipt.revision} · hash <code className="gap-hash">{receipt.hash}</code>.</p>
    <div className="proposal-check-group"><b>Affected records</b><RecordLinks records={receipt.records} /></div>
    <div className="proposal-check-group"><b>Validation after writing</b><p>{validation ? (validation.ok ? `Passed: no new errors${validation.errors ? ` (${validation.errors} pre-existing)` : ""}, ${validation.warnings} warning${validation.warnings === 1 ? "" : "s"}.` : `Failed: ${validation.new_errors.join("; ")}`) : "Not recorded."}</p></div>
    <div className="proposal-check-group"><b>Files</b><ul className="proposal-apply-files">{receipt.files.map((file) => <li key={file.path}><code>{file.path}</code> · {file.action} · {file.before_hash ? short(file.before_hash) : "absent"} → {file.after_hash ? short(file.after_hash) : "absent"}</li>)}</ul><p className="muted">Exports regenerated: {receipt.derived.join(", ")}.</p></div>
    <div className="proposal-check-group"><b>Verify it in the product</b><p>Run the original task again against the updated guidance: ask your coding agent for the same design context the Gap reported (the MCP server now reads the changed records), confirm the new guidance is retrieved and applied, then check the reported screen. If the outcome did not improve, report a new Gap; it will cite the records as they are now.</p></div>
    {plan && plan.applications.some((item) => item.outcome !== "applied") && <div className="proposal-check-group"><b>Earlier attempts</b><ul className="proposal-apply-attempts">{plan.applications.filter((item) => item.outcome !== "applied").map((item) => <AttemptLine key={item.id} receipt={item} />)}</ul></div>}
  </section>;
}

export interface ApplyOutcome { kind: ApplyErrorKind | "applied" | "already_applied"; message: string; receipt: ApplicationReceipt | null }

/** The result of one Apply request, worded so stale, validation, rollback, unverified restore, and already-applied never read alike. */
export function ApplyOutcomeNotice({ outcome }: { outcome: ApplyOutcome }) {
  const receipt = outcome.receipt;
  const rolledBack = receipt?.outcome === "rolled_back";
  const success = outcome.kind === "applied" || outcome.kind === "already_applied";
  const title = outcome.kind === "applied" ? "Applied."
    : outcome.kind === "already_applied" ? "Already applied."
    : outcome.kind === "stale" ? "Not applied: the records changed after approval. Nothing was written."
    : outcome.kind === "integrity" ? "Not applied: the approved revision failed its integrity check. Nothing was written."
    : outcome.kind === "unsupported" ? "Not applied: the proposal contains changes Apply cannot write. Nothing was written."
    : outcome.kind === "validation" ? (rolledBack ? (receipt?.restored ? "Rolled back: the written records failed validation, and every file was restored." : "Rolled back, but the restore could not be verified.") : "Not applied: validation failed against the current workspace. Nothing was written.")
    : outcome.kind === "write_failed" ? (rolledBack ? (receipt?.restored ? "Write failed and was rolled back: every file was restored to its previous bytes." : "Write failed, and the restore could not be verified. Restart Monet to run recovery.") : receipt?.outcome === "applied" ? "Applied, but the proposal record could not be updated. Restart Monet to finish the bookkeeping." : "Write failed.")
    : outcome.kind === "busy" ? "Apply is busy. Reload in a moment." : "Not applied.";
  return <div className={success ? "proposal-note" : "gap-error"} role={success ? "status" : "alert"}><p><b>{title}</b> {outcome.message}{receipt ? <> Receipt <code className="gap-hash">{receipt.id}</code>.</> : null}</p></div>;
}

function fromRevision(revision: ProposalRevision | undefined): { summary: string; rationale: string; changes: DraftChange[] } {
  return { summary: revision?.summary ?? "", rationale: revision?.rationale ?? "", changes: (revision?.changes ?? []).map((change) => ({ target: change.target, operation: change.operation, field: change.field, type: change.type, before: change.before, text: fieldEditorText(change.type, change.after), note: change.note, error: "" })) };
}

function ValueEditor({ change, onChange, disabled }: { change: DraftChange; onChange: (text: string) => void; disabled: boolean }) {
  const label = `Proposed ${change.field}`;
  if (change.type === "status") return <select aria-label={label} value={change.text} disabled={disabled} onChange={(event) => onChange(event.target.value)}><option value="">Choose…</option>{statuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select>;
  if (change.type === "text") return <input aria-label={label} value={change.text} disabled={disabled} maxLength={2000} onChange={(event) => onChange(event.target.value)} />;
  return <textarea aria-label={label} className={change.type === "markdown" ? "proposal-markdown" : "proposal-structured"} value={change.text} disabled={disabled} onChange={(event) => onChange(event.target.value)} />;
}

/** A saved revision rendered from its own stored snapshots. Canonical records changing later never alter it. */
export function RevisionHistory({ revisions, approved }: { revisions: ProposalRevision[]; approved: number | null }) {
  if (!revisions.length) return null;
  return <details className="gap-details proposal-history"><summary>Earlier revisions ({revisions.length}) · rendered from their saved snapshots</summary>
    {revisions.map((revision) => <article key={revision.number} className="proposal-history-revision" aria-label={`Revision ${revision.number}`}>
      <span className="eyebrow">Revision {revision.number} · {revision.author === "ai" ? "AI draft" : "Human"} · {formatDate(revision.created_at)} · {revision.checks.ok ? "checks passed" : "blocked"}{approved === revision.number ? " · approved" : ""}</span>
      <p><b>{revision.summary}</b>{revision.rationale ? ` — ${revision.rationale}` : ""}</p>
      {revision.changes.map((change) => <div key={slot(change)} className="proposal-history-change">
        <p className="gap-evidence-line"><code>{change.target}</code> · {change.field} · <span className={`proposal-author ${change.author}`}>{change.author === "ai" ? "AI-drafted" : "Human-edited"}</span></p>
        <ChangeDiff type={change.type} before={change.before} after={change.after} />
      </div>)}
    </article>)}
  </details>;
}

export function ProposalPage() {
  const { id = "" } = useParams();
  return <ProposalDetail key={id} id={id} />;
}

function ProposalDetail({ id }: { id: string }) {
  const navigate = useNavigate();
  const [proposal, setProposal] = useState<ProposalView | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [editor, setEditor] = useState(() => fromRevision(undefined));
  const [addTarget, setAddTarget] = useState("");
  const [addField, setAddField] = useState("");
  const [newPatternId, setNewPatternId] = useState("");
  const [plan, setPlan] = useState<ApplyPlan | null>(null);
  const [planError, setPlanError] = useState("");
  const [applyOutcome, setApplyOutcome] = useState<ApplyOutcome | null>(null);

  useEffect(() => { let active = true; api.proposal(id).then((value) => { if (active) { setProposal(value); setEditor(fromRevision(value.revisions[value.revisions.length - 1])); setError(""); } }).catch((caught) => { if (active) setError(message(caught)); }); return () => { active = false; }; }, [id, attempt]);
  // The plan is the server's live answer to "what would Apply do now"; it is fetched only when there is something to apply or a receipt to show.
  const planWanted = proposal?.status === "approved" || proposal?.status === "applied";
  const planVersion = `${proposal?.status ?? ""}:${proposal?.updated_at ?? ""}:${attempt}`;
  useEffect(() => {
    if (!planWanted) { setPlan(null); return; }
    let active = true;
    setPlanError("");
    api.applyPlan(id).then((value) => { if (active) setPlan(value); }).catch((caught) => { if (active) setPlanError(message(caught)); });
    return () => { active = false; };
  }, [id, planWanted, planVersion]);

  const latest = proposal?.revisions[proposal.revisions.length - 1];
  const closed = proposal?.status === "rejected" || proposal?.status === "superseded" || proposal?.status === "applied";
  const editable = Boolean(proposal) && !closed && !proposal!.staleness.gap_missing;
  const dirty = useMemo(() => {
    const saved = fromRevision(latest);
    return saved.summary !== editor.summary || saved.rationale !== editor.rationale || saved.changes.length !== editor.changes.length
      || editor.changes.some((change, index) => { const prior = saved.changes[index]; return !prior || slot(prior) !== slot(change) || prior.text !== change.text || prior.note !== change.note; });
  }, [editor, latest]);
  const actions = proposal ? proposalActions(proposal, dirty) : { reject: false, supersede: false, refresh: false, approve: false };
  const targetByKey = useMemo(() => new Map((proposal?.targets ?? []).map((target) => [target.key, target])), [proposal]);
  const createdTargets = editor.changes.filter((change) => change.operation === "create").map((change) => change.target);

  /** Provenance for the value on screen: the saved change's author while the value is untouched, otherwise a person. */
  function authorOf(change: DraftChange): "ai" | "human" {
    const saved = latest?.changes.find((item) => slot(item) === slot(change) && item.operation === change.operation);
    if (saved && fieldEditorText(saved.type, saved.after) === change.text) return saved.author;
    const drafted = proposal?.revisions.find((revision) => revision.author === "ai")?.changes.find((item) => slot(item) === slot(change) && item.operation === change.operation);
    return drafted && fieldEditorText(drafted.type, drafted.after) === change.text ? "ai" : "human";
  }
  function currentOf(change: DraftChange): unknown {
    return targetByKey.get(change.target)?.fields[change.field]?.current ?? null;
  }
  function proposedOf(change: DraftChange): unknown {
    try { return parseFieldText(change.type, change.text); } catch { return change.text; }
  }
  const update = (index: number, patch: Partial<DraftChange>) => setEditor((current) => ({ ...current, changes: current.changes.map((change, i) => i === index ? { ...change, ...patch, error: "" } : change) }));

  function addChange() {
    const target = targetByKey.get(addTarget);
    const spec = target && PROPOSAL_FIELDS[target.kind][addField];
    if (!target || !spec || editor.changes.some((change) => change.target === addTarget && change.field === addField)) return;
    const current = target.fields[addField]?.current ?? null;
    setEditor((state) => ({ ...state, changes: [...state.changes, { target: addTarget, operation: "amend", field: addField, type: spec.type, before: current, text: fieldEditorText(spec.type, current), note: "", error: "" }] }));
    setAddField("");
  }
  function addNewPattern() {
    const patternId = newPatternId.trim();
    if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(patternId)) { setError("A pattern id is a lowercase slug such as card-actions."); return; }
    const target = `pattern:${patternId}`;
    if (targetByKey.has(target) || createdTargets.length) return;
    const fields = ["title", "summary", "body", "tags", "components", "foundations"] as const;
    setEditor((current) => ({ ...current, changes: [...current.changes, ...fields.map((field) => ({ target, operation: "create" as const, field, type: PROPOSAL_FIELDS.pattern[field]!.type, before: null, text: "", note: "", error: "" }))] }));
    setNewPatternId(""); setError("");
  }

  async function run(work: () => Promise<ProposalView | undefined>, done = "") {
    setBusy(true); setError(""); setNotice("");
    try { const next = await work(); if (next) { setProposal(next); setEditor(fromRevision(next.revisions[next.revisions.length - 1])); } if (done) setNotice(done); }
    catch (caught) { setError(message(caught)); }
    finally { setBusy(false); }
  }
  async function saveRevision() {
    const changes: ProposalRevisionInput["changes"] = [];
    for (const [index, change] of editor.changes.entries()) {
      try { changes.push({ target: change.target, operation: change.operation, field: change.field, after: parseFieldText(change.type, change.text), note: change.note }); }
      catch (caught) { update(index, { error: message(caught) }); setError(`${slot(change)}: ${message(caught)}`); return; }
    }
    await run(() => api.saveProposalRevision(id, { summary: editor.summary, rationale: editor.rationale, changes }), "Revision saved. Checks ran against the current records; approval, if any, was cleared.");
  }
  async function draft() {
    await run(async () => { const { draft_failed, ...view } = await api.draftProposal(id); if (draft_failed) { setNotice(""); setError(draft_failed); return view; } return view; }, "AI draft saved as revision 1. Every value is labelled AI-drafted until you edit it.");
  }
  async function approve() {
    if (!latest) return;
    if (!window.confirm(`Approve revision ${latest.number} exactly as saved (hash ${latest.hash.slice(0, 12)}…)? Checks are rerun against the live workspace first. Approval does not change any Monet record; Apply is a separate step offered afterwards.`)) return;
    await run(() => api.approveProposal(id, { revision: latest.number, hash: latest.hash, note: "" }), `Revision ${latest.number} approved.`);
  }
  async function reject() {
    const reason = window.prompt("Why is this proposal rejected? (optional)", "");
    if (reason === null) return;
    await run(() => api.rejectProposal(id, reason), "Proposal rejected.");
  }
  async function refresh() {
    await run(() => api.rebaseProposal(id), "Refreshed: the same proposed values were saved as a new revision against the current records.");
  }
  async function apply() {
    if (!proposal?.approval || !plan?.ready) return;
    const { revision, hash } = proposal.approval;
    if (!window.confirm(`Apply approved revision ${revision} (hash ${short(hash)}) to canonical Monet?\n\nThis modifies ${plan.records.length} record${plan.records.length === 1 ? "" : "s"}: ${plan.records.map((record) => record.key).join(", ")}. Exports are regenerated and a receipt is written. Every check is rerun first; a failure after writing starts restores every file.`)) return;
    setBusy(true); setError(""); setNotice(""); setApplyOutcome(null);
    try {
      const result = await api.applyProposal(id, { revision, hash });
      setProposal(result.proposal); setEditor(fromRevision(result.proposal.revisions[result.proposal.revisions.length - 1]));
      setApplyOutcome({ kind: result.outcome, message: result.outcome === "applied" ? `Revision ${revision} was written to canonical Monet, the exports were regenerated, and the workspace validated.` : "This revision had already been applied; nothing was written again.", receipt: result.receipt });
    } catch (caught) {
      setApplyOutcome({ kind: caught instanceof ApiError && caught.kind ? caught.kind : "write_failed", message: message(caught), receipt: caught instanceof ApiError ? caught.receipt : null });
      setAttempt((count) => count + 1);
    } finally { setBusy(false); }
  }
  async function supersede() {
    if (!window.confirm("Supersede this proposal? A new draft is derived from the Gap’s current diagnosis and eligible changes are carried forward with their authorship.")) return;
    setBusy(true); setError("");
    try { const next = await api.supersedeProposal(id); void navigate(`/proposals/${next.id}`); }
    catch (caught) { setError(message(caught)); setBusy(false); }
  }

  const header = proposal ? `${proposalStatusLabels[proposal.status]} · ${latest ? `revision ${latest.number}` : "no revision yet"} · created ${formatDate(proposal.created_at)}` : error ? "Unable to open this proposal" : "Loading proposal…";
  return <div className="page gap-page proposal-page">
    {proposal ? <Link className="gap-back" to={`/gaps/${proposal.gap_id}`}>← Gap report</Link> : <Link className="gap-back" to="/gaps">← Gaps</Link>}
    <PageHeader eyebrow="Gap proposal" title={latest?.summary || "Proposal"} description={header} action={proposal && !closed && <div className="gap-actions">
      <button className="button ghost" disabled={busy || !actions.reject} onClick={() => void reject()}>Reject</button>
      <button className="button ghost" disabled={busy || !actions.supersede} onClick={() => void supersede()}>Supersede</button>
      {actions.refresh && <button className="button" disabled={busy} onClick={() => void refresh()} title="Re-snapshot the same proposed values against the current records.">Refresh against current records</button>}
      <button className="button primary" disabled={busy || !actions.approve} onClick={() => void approve()} title={actions.approve ? undefined : "Save a revision that passes checks, with no unsaved edits, on current records."}>Approve revision {latest?.number ?? ""}</button>
    </div>} />
    <p className="gap-provider-note">A proposal describes how Monet records would change. Reviewing, editing, and approving it changes nothing. Only <b>Apply approved changes</b>, offered on an approved proposal, writes canonical records, through a journaled transaction that leaves a receipt.</p>
    {error && <div className="gap-error" role="alert">{error} <button className="button ghost micro" onClick={() => setAttempt((count) => count + 1)}>Reload</button></div>}
    {notice && <p className="proposal-note" role="status">{notice}</p>}
    {proposal && <>
      <IntegrityNotice integrity={proposal.integrity} />
      {proposal.status !== "applied" && <StalenessNotice staleness={proposal.staleness} />}
      {applyOutcome && <ApplyOutcomeNotice outcome={applyOutcome} />}
      {proposal.status === "approved" && proposal.approval && <p className="proposal-note" role="status"><b>Approved revision {proposal.approval.revision}</b> · {formatDate(proposal.approval.approved_at)} · hash <code className="gap-hash">{proposal.approval.hash}</code>. Saving a new revision clears this approval.</p>}
      {planError && <div className="gap-error" role="alert">Could not compute the apply plan: {planError} <button className="button ghost micro" onClick={() => setAttempt((count) => count + 1)}>Retry</button></div>}
      {proposal.status === "approved" && (plan ? <ApplyPanel plan={plan} busy={busy} onApply={() => void apply()} /> : !planError && <p role="status">Checking what Apply would change…</p>)}
      {proposal.status === "applied" && proposal.application && (() => { const receipt = plan?.applications.find((item) => item.id === proposal.application!.id) ?? applyOutcome?.receipt ?? null; return receipt ? <ApplicationPanel receipt={receipt} plan={plan} /> : <p className="proposal-note" role="status"><b>Applied</b> {formatDate(proposal.application.applied_at)} · receipt <code className="gap-hash">{proposal.application.id}</code>{plan ? " · the receipt file is missing from applications/." : planError ? "" : " · loading the receipt…"}</p>; })()}
      {proposal.status === "rejected" && <p className="proposal-note" role="status"><b>Rejected</b> {proposal.rejection?.rejected_at ? formatDate(proposal.rejection.rejected_at) : ""}{proposal.rejection?.reason ? ` · ${proposal.rejection.reason}` : ""}. Create a new proposal from the Gap if the idea returns.</p>}
      {proposal.status === "superseded" && proposal.superseded_by && <p className="proposal-note" role="status"><b>Superseded</b> by <Link to={`/proposals/${proposal.superseded_by}`}>the newer proposal</Link>.</p>}
      {proposal.supersedes && <p className="gap-evidence-line">Supersedes <Link to={`/proposals/${proposal.supersedes}`}>an earlier proposal</Link>.</p>}
      <div className="proposal-layout">
        <aside className="proposal-basis" aria-label="Basis">
          <span className="eyebrow">Basis · diagnosis {formatDate(proposal.diagnosis_created_at)}</span>
          {proposal.basis.map((item) => <article key={item.finding_index} className="proposal-basis-item"><span className="gap-classification">{gapClassificationLabels[item.classification]}</span><p className="gap-prose">{item.conclusion}</p><small>{item.source === "human" ? "Human review with citations" : item.source === "ai" ? "AI interpretation" : "Deterministic check"}</small></article>)}
          <b>Records this proposal may amend</b>
          <div className="gap-record-links">{proposal.targets.map((target) => target.route ? <Link key={target.key} to={target.route}>{target.title}</Link> : <span key={target.key}>{target.title}</span>)}</div>
          <p className="gap-evidence-line">{proposal.allow_new_pattern ? "One new pattern may be created because the diagnosis found a missing decision." : "No new records: the diagnosis did not find a missing decision."}</p>
          {proposal.revisions.length > 0 && <><b>Revisions</b><ol className="proposal-revisions">{proposal.revisions.map((revision) => <li key={revision.number}>{revision.number} · {revision.author === "ai" ? "AI draft" : "Human"} · {formatDate(revision.created_at)} · {revision.checks.ok ? "checks pass" : "blocked"}{proposal.approval?.revision === revision.number ? " · approved" : ""}</li>)}</ol></>}
        </aside>
        <section className="proposal-editor" aria-label="Proposed changes">
          {!proposal.revisions.length && proposal.status === "draft" && <div className="proposal-start">
            <span className="eyebrow">Revision 1</span>
            <h2>Draft the change</h2>
            <p>{proposal.ai_available ? "Let the configured AI provider draft typed changes to the cited records, or add changes yourself. Drafting sends the report, diagnosis, and the cited records to your provider." : "No AI provider is configured. Add changes to the cited records below; manual drafting needs nothing else."}</p>
            <div className="button-row"><button className="button" disabled={busy || !proposal.ai_available || editor.changes.length > 0} onClick={() => void draft()}>{busy ? "Drafting…" : "Draft with AI"}</button></div>
          </div>}
          {editable && <div className="proposal-add">
            <label>Record<select value={addTarget} onChange={(event) => { setAddTarget(event.target.value); setAddField(""); }}><option value="">Choose a cited record…</option>{proposal.targets.filter((target) => target.exists).map((target) => <option key={target.key} value={target.key}>{target.title} ({target.kind})</option>)}</select></label>
            <label>Field<select value={addField} disabled={!addTarget} onChange={(event) => setAddField(event.target.value)}><option value="">Choose a field…</option>{addTarget && Object.entries(PROPOSAL_FIELDS[targetByKey.get(addTarget)?.kind ?? "principle"]).filter(([field]) => !editor.changes.some((change) => change.target === addTarget && change.field === field)).map(([field, spec]) => <option key={field} value={field}>{spec.label}</option>)}</select></label>
            <button className="button" type="button" disabled={busy || !addTarget || !addField} onClick={addChange}>Add change</button>
            {proposal.allow_new_pattern && !createdTargets.length && <><label>New pattern id<input value={newPatternId} placeholder="card-actions" onChange={(event) => setNewPatternId(event.target.value)} /></label><button className="button" type="button" disabled={busy || !newPatternId.trim()} onClick={addNewPattern}>Add new pattern</button></>}
          </div>}
          <fieldset className="proposal-fields" disabled={!editable || busy}>
            <label>Summary<input value={editor.summary} maxLength={300} onChange={(event) => setEditor((current) => ({ ...current, summary: event.target.value }))} placeholder="One line: what changes and why" /></label>
            <label>Rationale<textarea value={editor.rationale} maxLength={6000} onChange={(event) => setEditor((current) => ({ ...current, rationale: event.target.value }))} placeholder="Why this generalizes beyond the reported product" /></label>
          </fieldset>
          {!editor.changes.length && <p className="proposal-empty">No changes yet. Add a change to a cited record{proposal.allow_new_pattern ? " or start a new pattern" : ""}.</p>}
          {editor.changes.map((change, index) => {
            const parsed = parseRecordKey(change.target);
            const target = targetByKey.get(change.target);
            const spec = parsed && PROPOSAL_FIELDS[parsed.kind][change.field];
            const author = authorOf(change);
            const current = currentOf(change);
            // On an applied proposal the record carries the applied value by design; that is not drift worth flagging.
            const drifted = change.operation === "amend" && proposal.status !== "applied" && !valuesEqual(change.before, current);
            return <article key={slot(change)} className="proposal-change" aria-label={`${change.target} ${change.field}`}>
              <header>
                <div><span className="eyebrow">{change.operation === "create" ? "New pattern" : parsed?.kind ?? "record"}</span><h3>{target?.route ? <Link to={target.route}>{target.title}</Link> : change.target} · {spec?.label ?? change.field}</h3></div>
                <span className={`proposal-author ${author}`}>{author === "ai" ? "AI-drafted" : "Human-edited"}</span>
              </header>
              <p className="gap-evidence-line">{change.operation === "create" ? "New record → proposed value" : latest?.changes.some((item) => slot(item) === slot(change)) ? `Revision ${latest.number} snapshot → proposed value` : "Current value → proposed value"}</p>
              <ChangeDiff type={change.type} before={change.before} after={proposedOf(change)} />
              {drifted && <div className="proposal-current" role="status">
                <span className="eyebrow">Current canonical value · differs from this revision’s snapshot</span>
                <ChangeDiff type={change.type} before={change.before} after={current} />
              </div>}
              {editable && <div className="proposal-change-edit">
                <ValueEditor change={change} disabled={busy} onChange={(text) => update(index, { text })} />
                {TEXT_HINTS[change.type] && <small>{TEXT_HINTS[change.type]}</small>}
                {change.error && <p className="gap-error" role="alert">{change.error}</p>}
                <input aria-label="Change note" value={change.note} maxLength={1000} placeholder="Note for reviewers (optional)" onChange={(event) => update(index, { note: event.target.value })} />
                <button className="button ghost micro" type="button" disabled={busy} onClick={() => setEditor((state) => ({ ...state, changes: state.changes.filter((_, i) => i !== index) }))}>Remove change</button>
              </div>}
              {!editable && change.note && <p className="gap-evidence-line">Note: {change.note}</p>}
            </article>;
          })}
          {editable && <div className="gap-actions">
            {dirty && <span className="proposal-dirty" role="status">Unsaved edits · checks reflect revision {latest?.number ?? 0}</span>}
            <button className="button primary" disabled={busy || !editor.changes.length || !editor.summary.trim() || !dirty} onClick={() => void saveRevision()}>{busy ? "Saving…" : `Save revision ${(latest?.number ?? 0) + 1}`}</button>
          </div>}
          {latest && <ChecksPanel checks={latest.checks} revision={latest.number} />}
          <RevisionHistory revisions={proposal.revisions.slice(0, -1)} approved={proposal.approval?.revision ?? null} />
        </section>
      </div>
    </>}
  </div>;
}

