import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { lineDiff } from "../../shared/diff";
import { gapClassificationLabels } from "../../shared/gaps";
import { PROPOSAL_FIELDS, fieldValueText, parseFieldText, parseRecordKey, proposalStatusLabels, type ProposalChecks, type ProposalFieldType, type ProposalRevision, type ProposalRevisionInput, type ProposalStaleness, type ProposalView } from "../../shared/proposals";
import { api } from "../api";
import { PageHeader, formatDate } from "../components/Common";
import { statusLabels, statuses } from "../domain";

function message(error: unknown): string { return error instanceof Error ? error.message : "Something went wrong. Try again."; }

/** One change as the person edits it: the proposed value as text, plus where it came from. */
interface DraftChange { target: string; operation: "amend" | "create"; field: string; type: ProposalFieldType; text: string; note: string; error: string }
const slot = (change: Pick<DraftChange, "target" | "field">) => `${change.target}.${change.field}`;
const TEXT_HINTS: Partial<Record<ProposalFieldType, string>> = {
  string_list: "One item per line.", id_list: "One record id per line.", string_map: "One `key: value` per line; keys are snake_case.",
  boolean_map: "One `key: true` or `key: false` per line.", overrides: "One `token.name: value` per line.", tokens: "A JSON array of token objects.",
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
    <p className="gap-evidence-line">Prospective validation runs Monet’s workspace integrity checks over the projected records. The generality lint asks whether the change still reads as shared guidance. Warnings never block; errors do.</p>
    <div className="proposal-check-group">
      <b>Prospective validation</b>
      {validation.new_errors.length ? <ul className="proposal-check-errors">{validation.new_errors.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p>No new integrity errors.{validation.baseline_errors ? ` The workspace already has ${validation.baseline_errors} unrelated.` : ""}</p>}
      {validation.new_warnings.length > 0 && <ul className="proposal-check-warnings">{validation.new_warnings.map((item, index) => <li key={index}>{item}</li>)}</ul>}
      {validation.resolved.length > 0 && <p className="muted">Resolves: {validation.resolved.join("; ")}</p>}
    </div>
    <div className="proposal-check-group">
      <b>Generality lint</b>
      {!lint.length && <p>Nothing product-specific detected.</p>}
      {errors.length > 0 && <ul className="proposal-check-errors">{errors.map((finding, index) => <li key={index}><code>{finding.target}.{finding.field}</code> {finding.message}</li>)}</ul>}
      {warnings.length > 0 && <ul className="proposal-check-warnings">{warnings.map((finding, index) => <li key={index}><code>{finding.target}.{finding.field}</code> {finding.message}</li>)}</ul>}
    </div>
  </section>;
}

export function StalenessNotice({ staleness }: { staleness: ProposalStaleness }) {
  if (!staleness.stale && !staleness.knowledge_changed) return null;
  return <div className={staleness.stale ? "gap-error" : "proposal-note"} role={staleness.stale ? "alert" : "status"}>
    {staleness.gap_missing && <p><b>The Gap behind this proposal was deleted.</b> It can be rejected but not revised or approved.</p>}
    {staleness.diagnosis_changed && <p><b>The Gap was diagnosed again.</b> Supersede this proposal to re-derive it from the current diagnosis.</p>}
    {staleness.changed_targets.length > 0 && <p><b>Target records changed since the last revision:</b> {staleness.changed_targets.join(", ")}. Review the current values and save a new revision before approving.</p>}
    {staleness.missing_targets.length > 0 && <p><b>Target records no longer exist:</b> {staleness.missing_targets.join(", ")}.</p>}
    {!staleness.stale && staleness.knowledge_changed && <p>Other Monet records changed since the last revision. The targets are unchanged; checks will rerun on the next save.</p>}
  </div>;
}

function fromRevision(revision: ProposalRevision | undefined): { summary: string; rationale: string; changes: DraftChange[] } {
  return { summary: revision?.summary ?? "", rationale: revision?.rationale ?? "", changes: (revision?.changes ?? []).map((change) => ({ target: change.target, operation: change.operation, field: change.field, type: change.type, text: fieldValueText(change.type, change.after), note: change.note, error: "" })) };
}

function ValueEditor({ change, onChange, disabled }: { change: DraftChange; onChange: (text: string) => void; disabled: boolean }) {
  const label = `Proposed ${change.field}`;
  if (change.type === "status") return <select aria-label={label} value={change.text} disabled={disabled} onChange={(event) => onChange(event.target.value)}><option value="">Choose…</option>{statuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select>;
  if (change.type === "text") return <input aria-label={label} value={change.text} disabled={disabled} maxLength={2000} onChange={(event) => onChange(event.target.value)} />;
  return <textarea aria-label={label} className={change.type === "markdown" ? "proposal-markdown" : "proposal-structured"} value={change.text} disabled={disabled} onChange={(event) => onChange(event.target.value)} />;
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

  useEffect(() => { let active = true; api.proposal(id).then((value) => { if (active) { setProposal(value); setEditor(fromRevision(value.revisions[value.revisions.length - 1])); setError(""); } }).catch((caught) => { if (active) setError(message(caught)); }); return () => { active = false; }; }, [id, attempt]);

  const latest = proposal?.revisions[proposal.revisions.length - 1];
  const aiDraft = proposal?.revisions.find((revision) => revision.author === "ai");
  const closed = proposal?.status === "rejected" || proposal?.status === "superseded";
  const editable = Boolean(proposal) && !closed && !proposal!.staleness.gap_missing;
  const dirty = useMemo(() => {
    const saved = fromRevision(latest);
    return saved.summary !== editor.summary || saved.rationale !== editor.rationale || saved.changes.length !== editor.changes.length
      || editor.changes.some((change, index) => { const prior = saved.changes[index]; return !prior || slot(prior) !== slot(change) || prior.text !== change.text || prior.note !== change.note; });
  }, [editor, latest]);
  const targetByKey = useMemo(() => new Map((proposal?.targets ?? []).map((target) => [target.key, target])), [proposal]);
  const createdTargets = editor.changes.filter((change) => change.operation === "create").map((change) => change.target);

  function authorOf(change: DraftChange): "ai" | "human" {
    const drafted = aiDraft?.changes.find((item) => slot(item) === slot(change) && item.operation === change.operation);
    return drafted && fieldValueText(drafted.type, drafted.after) === change.text ? "ai" : "human";
  }
  function beforeOf(change: DraftChange): unknown {
    if (change.operation === "create") return null;
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
    setEditor((current) => ({ ...current, changes: [...current.changes, { target: addTarget, operation: "amend", field: addField, type: spec.type, text: fieldValueText(spec.type, target.fields[addField]?.current), note: "", error: "" }] }));
    setAddField("");
  }
  function addNewPattern() {
    const patternId = newPatternId.trim();
    if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(patternId)) { setError("A pattern id is a lowercase slug such as card-actions."); return; }
    const target = `pattern:${patternId}`;
    if (targetByKey.has(target) || createdTargets.length) return;
    const fields = ["title", "summary", "body", "tags", "components", "foundations"] as const;
    setEditor((current) => ({ ...current, changes: [...current.changes, ...fields.map((field) => ({ target, operation: "create" as const, field, type: PROPOSAL_FIELDS.pattern[field]!.type, text: "", note: "", error: "" }))] }));
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
    if (!window.confirm(`Approve revision ${latest.number} exactly as saved (hash ${latest.hash.slice(0, 12)}…)? Approval does not change any Monet record; Apply is a later step.`)) return;
    await run(() => api.approveProposal(id, { revision: latest.number, hash: latest.hash, note: "" }), `Revision ${latest.number} approved.`);
  }
  async function reject() {
    const reason = window.prompt("Why is this proposal rejected? (optional)", "");
    if (reason === null) return;
    await run(() => api.rejectProposal(id, reason), "Proposal rejected.");
  }
  async function supersede() {
    if (!window.confirm("Supersede this proposal? A new draft is derived from the Gap’s current diagnosis and eligible changes are carried forward.")) return;
    setBusy(true); setError("");
    try { const next = await api.supersedeProposal(id); void navigate(`/proposals/${next.id}`); }
    catch (caught) { setError(message(caught)); setBusy(false); }
  }

  const canApprove = Boolean(proposal && latest && editable && proposal.status === "draft" && !dirty && latest.checks.ok && !proposal.staleness.stale);
  const header = proposal ? `${proposalStatusLabels[proposal.status]} · ${latest ? `revision ${latest.number}` : "no revision yet"} · created ${formatDate(proposal.created_at)}` : error ? "Unable to open this proposal" : "Loading proposal…";
  return <div className="page gap-page proposal-page">
    {proposal ? <Link className="gap-back" to={`/gaps/${proposal.gap_id}`}>← Gap report</Link> : <Link className="gap-back" to="/gaps">← Gaps</Link>}
    <PageHeader eyebrow="Gap proposal" title={latest?.summary || "Proposal"} description={header} action={proposal && !closed && <div className="gap-actions">
      <button className="button ghost" disabled={busy || !editable} onClick={() => void reject()}>Reject</button>
      <button className="button ghost" disabled={busy || !editable} onClick={() => void supersede()}>Supersede</button>
      <button className="button primary" disabled={busy || !canApprove} onClick={() => void approve()} title={canApprove ? undefined : "Save a revision that passes checks, with no unsaved edits, on current records."}>Approve revision {latest?.number ?? ""}</button>
    </div>} />
    <p className="gap-provider-note">A proposal describes how Monet records would change. Reviewing, editing, and approving it changes nothing: no canonical Monet record is modified in this phase, and Apply is not available.</p>
    {error && <div className="gap-error" role="alert">{error} <button className="button ghost micro" onClick={() => setAttempt((count) => count + 1)}>Reload</button></div>}
    {notice && <p className="proposal-note" role="status">{notice}</p>}
    {proposal && <>
      <StalenessNotice staleness={proposal.staleness} />
      {proposal.status === "approved" && proposal.approval && <p className="proposal-note" role="status"><b>Approved revision {proposal.approval.revision}</b> · {formatDate(proposal.approval.approved_at)} · hash <code className="gap-hash">{proposal.approval.hash}</code>. Saving a new revision clears this approval.</p>}
      {proposal.status === "rejected" && <p className="proposal-note" role="status"><b>Rejected</b> {proposal.rejection?.rejected_at ? formatDate(proposal.rejection.rejected_at) : ""}{proposal.rejection?.reason ? ` · ${proposal.rejection.reason}` : ""}. Create a new proposal from the Gap if the idea returns.</p>}
      {proposal.status === "superseded" && proposal.superseded_by && <p className="proposal-note" role="status"><b>Superseded</b> by <Link to={`/proposals/${proposal.superseded_by}`}>the newer proposal</Link>.</p>}
      {proposal.supersedes && <p className="gap-evidence-line">Supersedes <Link to={`/proposals/${proposal.supersedes}`}>an earlier proposal</Link>.</p>}
      <div className="proposal-layout">
        <aside className="proposal-basis" aria-label="Basis">
          <span className="eyebrow">Basis · diagnosis {formatDate(proposal.diagnosis_created_at)}</span>
          {proposal.basis.map((item) => <article key={item.finding_index} className="proposal-basis-item"><span className="gap-classification">{gapClassificationLabels[item.classification]}</span><p className="gap-prose">{item.conclusion}</p><small>{item.source === "ai" ? "AI interpretation" : "Deterministic check"}</small></article>)}
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
            return <article key={slot(change)} className="proposal-change" aria-label={`${change.target} ${change.field}`}>
              <header>
                <div><span className="eyebrow">{change.operation === "create" ? "New pattern" : parsed?.kind ?? "record"}</span><h3>{target?.route ? <Link to={target.route}>{target.title}</Link> : change.target} · {spec?.label ?? change.field}</h3></div>
                <span className={`proposal-author ${author}`}>{author === "ai" ? "AI-drafted" : "Human-edited"}</span>
              </header>
              <ChangeDiff type={change.type} before={beforeOf(change)} after={proposedOf(change)} />
              {editable && <div className="proposal-change-edit">
                <ValueEditor change={change} disabled={busy} onChange={(text) => update(index, { text })} />
                {TEXT_HINTS[change.type] && <small>{TEXT_HINTS[change.type]}</small>}
                {change.error && <p className="gap-error" role="alert">{change.error}</p>}
                <input aria-label="Change note" value={change.note} maxLength={1000} placeholder="Note for reviewers (optional)" onChange={(event) => update(index, { note: event.target.value })} />
                <button className="button ghost micro" type="button" disabled={busy} onClick={() => setEditor((current) => ({ ...current, changes: current.changes.filter((_, i) => i !== index) }))}>Remove change</button>
              </div>}
              {!editable && change.note && <p className="gap-evidence-line">Note: {change.note}</p>}
            </article>;
          })}
          {editable && <div className="gap-actions">
            {dirty && <span className="proposal-dirty" role="status">Unsaved edits · checks reflect revision {latest?.number ?? 0}</span>}
            <button className="button primary" disabled={busy || !editor.changes.length || !editor.summary.trim() || !dirty} onClick={() => void saveRevision()}>{busy ? "Saving…" : `Save revision ${(latest?.number ?? 0) + 1}`}</button>
          </div>}
          {latest && <ChecksPanel checks={latest.checks} revision={latest.number} />}
        </section>
      </div>
    </>}
  </div>;
}
