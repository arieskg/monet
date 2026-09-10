import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { GAP_IMAGE_LIMIT, GAP_REVIEW_CLASSIFICATIONS, gapClassificationLabels, gapInputSchema, gapReviewInputSchema, type Gap, type GapDiagnosis, type GapInput, type GapRecordLink, type GapSummary } from "../../shared/gaps";
import { proposalStatusLabels, type GapProposalOverview } from "../../shared/proposals";
import { api } from "../api";
import { PageHeader, formatDate } from "../components/Common";
import { useWorkspace } from "../WorkspaceContext";

function message(error: unknown): string { return error instanceof Error ? error.message : "Something went wrong. Try again."; }

function ImagePreview({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? <p role="alert">The saved image could not be displayed. Your report is still available.</p>
    : <img src={src} alt={alt} onError={() => setFailed(true)} />;
}

function ProviderNote({ hasImage }: { hasImage: boolean }) {
  const { environment } = useWorkspace();
  return <p className="gap-provider-note">{environment?.aiConfigured
    ? `Diagnose sends this report and current Monet guidance to your configured AI provider. ${!hasImage ? "This report has no screenshot; analysis uses text and structured evidence." : environment.aiImages ? "The screenshot is included; the result states whether the provider inspected it." : "Image input is not enabled for this provider. The screenshot stays saved; analysis uses text and structured evidence."}`
    : "AI diagnosis is optional. Without a configured provider, Diagnose retrieves guidance and checks structured evidence for you to review."} Raw reports and screenshots stay outside canonical guidance, exports and MCP. They follow your workspace Git and backup policy.</p>;
}

function GapCapture() {
  const navigate = useNavigate();
  const { workspace } = useWorkspace();
  const fileInput = useRef<HTMLInputElement>(null);
  const imageRequest = useRef(0);
  const [draft, setDraft] = useState({ problem: "", context: "", expected: "", notes: "", original_query: "", delivered_guidance: "", theme_id: "", mode: "" });
  const [image, setImage] = useState<GapInput["image"]>();
  const [usages, setUsages] = useState("");
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const [imageError, setImageError] = useState("");
  const [dragging, setDragging] = useState(false);

  async function chooseImage(file: File) {
    const request = ++imageRequest.current;
    setImageError("");
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) { setReading(false); setImageError("Choose a PNG, JPEG, or WebP image."); return; }
    if (!file.size || file.size > GAP_IMAGE_LIMIT) { setReading(false); setImageError("Images must be no larger than 10 MB."); return; }
    setReading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not read image."));
        reader.onerror = () => reject(new Error("Could not read image. Try selecting it again."));
        reader.readAsDataURL(file);
      });
      if (request === imageRequest.current) setImage({ data_url: dataUrl, filename: file.name });
    } catch (caught) { if (request === imageRequest.current) setImageError(message(caught)); }
    finally { if (request === imageRequest.current) setReading(false); }
  }

  async function save(event: FormEvent) {
    event.preventDefault(); setError("");
    let observations: unknown = [];
    try { observations = usages.trim() ? JSON.parse(usages) : []; }
    catch { setError("Structured observations must be a JSON array. Your report and screenshot are still here."); return; }
    const parsed = gapInputSchema.safeParse({ ...draft, theme_id: draft.theme_id || undefined, mode: draft.mode || undefined, usages: observations, image });
    if (!parsed.success) { setError(parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")); return; }
    setBusy(true);
    try { const saved = await api.createGap(parsed.data); void navigate(`/gaps/${saved.id}`); }
    catch (caught) { setError(message(caught)); setBusy(false); }
  }

  const field = (name: keyof typeof draft) => ({ value: draft[name], onChange: (event: { target: { value: string } }) => setDraft((current) => ({ ...current, [name]: event.target.value })) });
  return <div className="page gap-page">
    <Link className="gap-back" to="/gaps">← Gaps</Link>
    <PageHeader eyebrow="Product feedback" title="Report a gap" description="Show where a real product exposed a weakness in Monet." />
    <form className="gap-capture" onSubmit={(event) => void save(event)} onPaste={(event) => {
      if (busy) return;
      const file = [...event.clipboardData.items].find((item) => item.kind === "file" && item.type.startsWith("image/"))?.getAsFile();
      if (file) { event.preventDefault(); void chooseImage(file); }
    }}>
      <fieldset disabled={busy}>
        <div className={`gap-upload ${dragging ? "dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); if (!busy) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); const file = event.dataTransfer.files[0]; if (file && !busy) void chooseImage(file); }}>
          <span className="eyebrow">Screenshot · optional</span>
          {image ? <div className="gap-image-preview"><ImagePreview key={image.data_url} src={image.data_url} alt="Screenshot to include in this Gap" /></div> : <div className="gap-upload-prompt"><span aria-hidden="true">▧</span><h2>Start with what you saw</h2><p>Paste an image, drag it here, or choose a file.<br />Non-visual gaps are welcome, too.</p></div>}
          <input ref={fileInput} className="gap-file-input" type="file" aria-label="Upload screenshot" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void chooseImage(file); event.target.value = ""; }} />
          <div className="button-row"><button type="button" className="button" onClick={() => fileInput.current?.click()}>{image ? "Replace screenshot" : "Choose image"}</button>{image && <button type="button" className="button ghost" onClick={() => { imageRequest.current++; setReading(false); setImage(undefined); setImageError(""); }}>Remove image</button>}</div>
          <small aria-live="polite">{reading ? "Reading image…" : image ? image.filename : "PNG, JPEG, WebP · up to 10 MB"}</small>
          {imageError && <p className="gap-error" role="alert">{imageError}</p>}
        </div>
        <div className="gap-fields">
          <label>What went wrong? <span className="gap-required">Required</span><textarea required maxLength={6000} {...field("problem")} placeholder="Secondary actions looked like plain text on the cards, even after following Monet’s Button guidance." /></label>
          <label>Product / task context <span className="optional-label">optional</span><textarea maxLength={4000} {...field("context")} placeholder="A training app with a grid of exercises, each with Start and Open actions. Used on touch and desktop." /></label>
          <label>What should have happened? <span className="optional-label">optional</span><textarea maxLength={4000} {...field("expected")} placeholder="Actions should be recognizable before hover, with one clear primary action per card." /></label>
          <details className="gap-details"><summary>Additional evidence and context</summary>
            <label>Notes / observed states<textarea maxLength={6000} {...field("notes")} placeholder="Viewport, input method, reproduction steps, record IDs, or other observations" /></label>
            <label>Original agent request<input maxLength={500} {...field("original_query")} placeholder="The task originally sent to Monet" /></label>
            <label>Guidance the agent received<textarea maxLength={12000} {...field("delivered_guidance")} placeholder="Paste relevant excerpts, if available" /></label>
            <div className="gap-context-row"><label>Theme<select {...field("theme_id")}><option value="">Workspace default</option>{workspace?.themes.map((theme) => <option key={theme.id} value={theme.id}>{theme.name}</option>)}</select></label><label>Appearance<select {...field("mode")}><option value="">Not specified</option><option value="light">Light</option><option value="dark">Dark</option></select></label></div>
            <label>Structured conformance observations <span className="optional-label">JSON array</span><textarea className="gap-json" value={usages} onChange={(event) => setUsages(event.target.value)} placeholder={'[{"kind":"style","property":"padding","value":"13px"}]'} /></label>
            <p className="muted">Use the same observations as <code>review_design_usage</code>: style, token, component, or contrast evidence. Monet does not extract them from pixels.</p>
          </details>
        </div>
      </fieldset>
      {error && <p className="gap-error" role="alert">{error}</p>}
      <p className="gap-provider-note">Saving keeps the report and screenshot together in this workspace. You can choose Diagnose after saving. Include only product data you intend to retain.</p>
      <div className="gap-actions"><Link className="button ghost" to="/gaps">Cancel</Link><button className="button primary" disabled={busy || reading} type="submit">{busy ? "Saving gap…" : "Save gap"}</button></div>
    </form>
  </div>;
}

export function Diagnosis({ diagnosis: d }: { diagnosis: GapDiagnosis }) {
  const evidence = new Map(d.evidence.map((e) => [e.id, e.description]));
  const hasMeasuredErrors = d.conformance.findings.some((f) => f.level === "error");
  return <section className="gap-diagnosis" aria-labelledby="diagnosis-heading">
    <span className="eyebrow">{hasMeasuredErrors ? "Measured diagnosis" : d.ai.status === "complete" ? "AI interpretation" : "Deterministic review"} · {formatDate(d.created_at)}</span>
    <h2 id="diagnosis-heading">{hasMeasuredErrors ? d.findings.find((f) => f.source === "deterministic" && f.classification === "implementation_violation")?.conclusion ?? "Submitted observations fail measured checks." : d.conclusion}</h2>
    <p className="gap-provider-note">No canonical Monet records were changed.</p>
    <p className="gap-evidence-line">Trust order: measured evidence &gt; user report &gt; AI interpretation.</p>
    {d.contradiction && <p className="gap-error" role="status">Possible contradiction: AI interpretation may deny a measured violation. Measured checks take precedence; review the interpretation separately.</p>}
    <p className={d.ai.status === "failed" ? "gap-error" : "gap-provider-note"} role={d.ai.status === "failed" ? "alert" : undefined}>{d.ai.message}</p>
    <p className="gap-image-status">{d.image_status === "not_supplied" ? "No screenshot supplied." : d.image_status === "not_inspected" ? "Screenshot saved · not inspected by AI" : "Screenshot inspection · provider-reported / unverified"}</p>
    {(["deterministic", "ai"] as const).map((source) => <section key={source} aria-label={source === "deterministic" ? "Measured checks" : "AI interpretation"}>
      <h3>{source === "deterministic" ? "Measured checks" : "AI interpretation"}</h3>
      {source === "deterministic" && <p className="gap-evidence-line">{d.conformance.coverage.checked} of {d.conformance.coverage.submitted} submitted observations checked. These checks do not certify the UI.</p>}
      {source === "ai" && <><p className="gap-provider-note">AI findings are unverified interpretations. Citation checks do not establish correctness.</p>{d.ai.status === "complete" && <p className="gap-prose">{d.interpretation ?? d.conclusion}</p>}
        {d.image_observations?.length ? <div><b>Provider-reported image observations · unverified</b><ul>{d.image_observations.map((o, i) => <li key={i}>{o}</li>)}</ul></div> : null}</>}
    {d.findings.filter((f) => f.source === source).map((finding, index) => <article className="gap-finding" key={index}>
      <span className="gap-classification">{finding.classification === "implementation_violation" ? finding.source === "ai" ? "Suspected violation" : "Measured violation" : gapClassificationLabels[finding.classification]}</span>
      <p className="gap-evidence-line"><b>Source:</b> {finding.source === "ai" ? "AI interpretation" : "Deterministic check"}{finding.check && <> · Check: <code>{finding.check}</code></>}{finding.basis && <> · Basis: {finding.basis === "wcag_floor" ? "WCAG floor" : "Monet rule"}</>}</p>
      {finding.contradiction && <p className="gap-error">Possible contradiction with measured checks · AI finding demoted for review.</p>}
      <h3>{finding.conclusion}</h3><p className="gap-prose">{finding.reasoning}</p>
      <p className="gap-evidence-line"><b>Evidence:</b> {finding.evidence_ids.map((id) => evidence.get(id) ?? id).join(" · ")}</p>
      {finding.record_keys.length > 0 && <div className="gap-record-links">{finding.record_keys.map((key) => { const record = d.records.find((r) => r.key === key); return record?.route ? <Link key={key} to={record.route}>{record.title}</Link> : <span key={key}>{record?.title ?? key}</span>; })}</div>}
      {finding.uncertainty.length > 0 && <div className="gap-uncertainty"><b>Uncertainty / missing information</b><ul>{finding.uncertainty.map((text, i) => <li key={i}>{text}</li>)}</ul></div>}
      <div className="gap-next"><b>Recommended next action</b><p>{finding.next_action}</p></div>
    </article>)}
    </section>)}
    <details className="gap-details"><summary>Evidence considered and relevant Monet records</summary>
      <ul>{d.evidence.map((e) => <li key={e.id}>{e.description}</li>)}</ul>
      <div className="gap-record-links">{d.records.map((r) => r.route ? <Link key={r.key} to={r.route}>{r.title}</Link> : <span key={r.key}>{r.title}</span>)}</div>
      <p>{d.knowledge_count} canonical records available for inspection. Record links open current versions.</p>
    </details>
    <details className="gap-details"><summary>Retrieval and conformance checks</summary>
      <p><b>Replay query:</b> {d.retrieval.query}</p><p><b>Retrieval coverage:</b> {d.retrieval.coverage}. This describes matching, not completeness.</p>
      <ul>{d.retrieval.notices.map((n, i) => <li key={i}>{n}</li>)}</ul>
      <ul>{d.retrieval.provenance.map((r, i) => <li key={i}>{r.entity_id} · {r.reason.replaceAll("_", " ")}{r.related_from ? ` from ${r.related_from}` : ""}</li>)}</ul>
      <p>{d.conformance.coverage.checked} of {d.conformance.coverage.submitted} observations checked; {d.conformance.coverage.unverifiable} unverifiable, {d.conformance.coverage.not_applicable} not applicable.</p>
      <p>{d.conformance.scope}</p>
      {d.conformance.findings.map((f, i) => <p key={i}><b>{f.level}: {f.observed}</b><br />{f.why} Expected: {f.expected}</p>)}
      {d.conformance.warnings.map((w, i) => <p key={i}>{w}</p>)}
    </details>
    <details className="gap-details"><summary>Scope and limitations</summary><ul>{d.limitations.map((l, i) => <li key={i}>{l}</li>)}</ul><p>Recommendations only. No canonical records were changed.</p><small>Knowledge fingerprint: <code className="gap-hash">{d.workspace_fingerprint}</code></small></details>
  </section>;
}

/**
 * A person classifies the diagnosis and cites the records concerned. This is how a Gap reaches a
 * proposal when no AI provider is configured; it records who said what, and it never excuses a
 * measured error. Records are offered from the current workspace so every citation resolves.
 */
export function HumanReviewForm({ gap, records, onSaved }: { gap: Gap; records: GapRecordLink[]; onSaved: (gap: Gap) => void }) {
  const measured = Boolean(gap.diagnosis?.conformance.findings.some((finding) => finding.level === "error"));
  const [draft, setDraft] = useState({ classification: "weak_guidance" as typeof GAP_REVIEW_CLASSIFICATIONS[number], conclusion: "", reasoning: "", record_keys: [] as string[], acknowledges_measured_errors: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(event: FormEvent) {
    event.preventDefault(); setError("");
    const parsed = gapReviewInputSchema.safeParse(draft);
    if (!parsed.success) { setError(parsed.error.issues.map((issue) => issue.message).join(" ")); return; }
    setBusy(true);
    try { onSaved(await api.saveGapReview(gap.id, parsed.data)); }
    catch (caught) { setError(message(caught)); }
    finally { setBusy(false); }
  }
  const current = gap.review && gap.review.diagnosis_created_at === gap.diagnosis?.created_at ? gap.review : null;
  return <details className="gap-details gap-review"><summary>{current ? "Human review recorded · revise" : "Record a human review of this diagnosis"}</summary>
    {current && <p className="gap-evidence-line">Recorded {formatDate(current.created_at)}: {gapClassificationLabels[current.classification]} · cites {current.record_keys.join(", ")}.</p>}
    <p className="muted">State how you classify this Gap after reading the diagnosis and the records, and cite the records concerned. The review is Gap evidence; it changes no canonical record.{measured ? " The diagnosis measured conformance errors; a review does not excuse them." : ""}</p>
    <form onSubmit={(event) => void save(event)}>
      <fieldset disabled={busy} className="gap-fields">
        <label>Classification<select value={draft.classification} onChange={(event) => setDraft((state) => ({ ...state, classification: event.target.value as typeof state.classification }))}>{GAP_REVIEW_CLASSIFICATIONS.map((item) => <option key={item} value={item}>{gapClassificationLabels[item]}</option>)}</select></label>
        <label>Conclusion <span className="gap-required">Required</span><textarea required maxLength={2000} value={draft.conclusion} onChange={(event) => setDraft((state) => ({ ...state, conclusion: event.target.value }))} placeholder="What the guidance fails to say, in one or two sentences" /></label>
        <label>Reasoning <span className="optional-label">optional</span><textarea maxLength={6000} value={draft.reasoning} onChange={(event) => setDraft((state) => ({ ...state, reasoning: event.target.value }))} /></label>
        <label>Cited records <span className="gap-required">At least one{draft.classification === "conflicting_guidance" ? ", two for a conflict" : ""}</span>
          <select multiple size={8} value={draft.record_keys} onChange={(event) => setDraft((state) => ({ ...state, record_keys: [...event.target.selectedOptions].map((option) => option.value) }))}>{records.map((record) => <option key={record.key} value={record.key}>{record.title} ({record.key})</option>)}</select></label>
        {measured && <label className="gap-review-check"><input type="checkbox" checked={draft.acknowledges_measured_errors} onChange={(event) => setDraft((state) => ({ ...state, acknowledges_measured_errors: event.target.checked }))} /> I have read the measured conformance errors; this review does not excuse them.</label>}
      </fieldset>
      {error && <p className="gap-error" role="alert">{error}</p>}
      <div className="gap-actions"><button className="button" type="submit" disabled={busy}>{busy ? "Saving review…" : current ? "Replace review" : "Save review"}</button></div>
    </form>
  </details>;
}

/** Gap → Propose improvement. Eligibility is decided by the server from the saved diagnosis, any human review, and current knowledge. */
export function ProposalSection({ gap, records, overview, error, onCreate, onGapChange, busy }: { gap: Gap; records: GapRecordLink[]; overview: GapProposalOverview | null; error: string; onCreate: () => void; onGapChange: (gap: Gap) => void; busy: boolean }) {
  if (!gap.diagnosis) return null;
  return <section className="gap-proposals" aria-label="Proposals">
    <span className="eyebrow">Next · Propose improvement</span>
    {error && <p className="gap-error" role="alert">{error}</p>}
    {!overview && !error && <p role="status">Checking whether this diagnosis can back a proposal…</p>}
    {overview && (overview.eligibility.eligible
      ? <><h2>Turn this diagnosis into a reviewed change</h2><p>A proposal drafts typed changes to the records the {overview.eligibility.basis.some((item) => item.source === "human") ? "review" : "diagnosis"} cited{overview.eligibility.allow_new_pattern ? ", or one new pattern," : ""} for review and approval. Nothing changes in Monet until the proposal is approved and then applied.</p>
        <div className="gap-record-links">{overview.eligibility.targets.map((target) => target.route ? <Link key={target.key} to={target.route}>{target.title}</Link> : <span key={target.key}>{target.title}</span>)}</div>
        <button className="button primary" disabled={busy} onClick={onCreate}>{busy ? "Creating…" : "Propose improvement"}</button></>
      : <><h2>No proposal from this diagnosis yet</h2><ul>{overview.eligibility.reasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul></>)}
    <HumanReviewForm key={`${gap.diagnosis.created_at}:${gap.review?.created_at ?? ""}`} gap={gap} records={records} onSaved={onGapChange} />
    {overview && overview.proposals.length > 0 && <div className="gap-proposal-list"><b>Proposals for this Gap</b>{overview.proposals.map((proposal) => <Link key={proposal.id} className="gap-proposal-row" to={`/proposals/${proposal.id}`}><span className={`status-pill proposal-${proposal.status}`}>{proposalStatusLabels[proposal.status]}</span><span>{proposal.summary || "No revision yet"}</span><small>{proposal.revision ? `revision ${proposal.revision}` : "empty"}{proposal.application_id ? ` · applied ${proposal.approved_revision ?? ""}`.trimEnd() : proposal.approved_revision ? ` · approved ${proposal.approved_revision}` : ""} · {formatDate(proposal.updated_at)}</small></Link>)}</div>}
    <p className="gap-evidence-line">Proposals and reviews stay outside canonical guidance, exports, and MCP.</p>
  </section>;
}

function GapDetail({ id }: { id: string }) {
  const navigate = useNavigate();
  const [failedRetry, setFailedRetry] = useState<GapDiagnosis | null>(null);
  const [gap, setGap] = useState<Gap | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [overview, setOverview] = useState<GapProposalOverview | null>(null);
  const [overviewError, setOverviewError] = useState("");
  const [creating, setCreating] = useState(false);
  useEffect(() => { let active = true; api.gap(id).then((value) => { if (active) { setGap(value); setError(""); } }).catch((e) => { if (active) setError(message(e)); }); return () => { active = false; }; }, [id, attempt]);
  const { workspace } = useWorkspace();
  const diagnosedAt = gap?.diagnosis?.created_at ?? null;
  const reviewedAt = gap?.review?.created_at ?? null;
  useEffect(() => {
    if (!diagnosedAt) return;
    let active = true;
    setOverview(null); setOverviewError("");
    api.gapProposals(id).then((value) => { if (active) setOverview(value); }).catch((e) => { if (active) setOverviewError(message(e)); });
    return () => { active = false; };
  }, [id, diagnosedAt, reviewedAt, attempt]);
  // Every citable record in the current workspace, keyed the way diagnoses and proposals key them.
  const citable: GapRecordLink[] = workspace ? [
    ...workspace.principles.map((item) => ({ key: `principle:${item.id}`, title: item.title, route: `/principles/${item.id}` })),
    ...workspace.foundations.map((item) => ({ key: `foundation:${item.id}`, title: item.name, route: `/foundations/${item.id}` })),
    ...workspace.patterns.map((item) => ({ key: `pattern:${item.id}`, title: item.title, route: `/patterns/${item.id}` })),
    ...workspace.taxonomy.flatMap((category) => category.entries).map((item) => ({ key: `component:${item.id}`, title: item.name, route: `/components/${item.id}` })),
    ...workspace.themes.map((item) => ({ key: `theme:${item.id}`, title: item.name, route: "/themes" })),
  ] : [];
  async function propose() {
    setCreating(true); setOverviewError("");
    try { const created = await api.createProposal(id); void navigate(`/proposals/${created.id}`); }
    catch (caught) { setOverviewError(message(caught)); setCreating(false); }
  }
  async function diagnose() {
    setBusy(true); setError("");
    try { const { failed_retry, ...saved } = await api.diagnoseGap(id); setGap(saved); setFailedRetry(failed_retry ?? null); }
    catch (caught) { setError(`Your Gap is saved. ${message(caught)} You can reload or retry Diagnose.`); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!window.confirm("Delete this Gap, its diagnosis and screenshot evidence? This cannot be undone. Copies in Git, backups or your provider are not removed.")) return;
    setBusy(true); setError("");
    try { await api.deleteGap(id); void navigate("/gaps"); }
    catch (caught) { setError(message(caught)); setBusy(false); }
  }
  return <div className="page gap-page">
    <Link className="gap-back" to="/gaps">← Gaps</Link>
    <PageHeader eyebrow="Product feedback" title="Gap report" description={gap ? `Saved ${formatDate(gap.created_at)} · ${gap.diagnosis ? "Review diagnosis" : "Ready to diagnose"}` : error ? "Unable to open this report" : "Loading report…"} action={gap && <div className="gap-actions"><button className="button ghost" disabled={busy} onClick={() => void remove()}>Delete gap</button><button className="button primary" disabled={busy} onClick={() => void diagnose()}>{busy ? "Diagnosing…" : gap.diagnosis ? "Diagnose again" : "Diagnose"}</button></div>} />
    {error && <div className="gap-error" role="alert">{error} <button className="button ghost micro" onClick={() => setAttempt((a) => a + 1)}>Reload report</button></div>}
    {failedRetry && <div className="gap-error" role="alert"><b>Retry did not complete. Previous diagnosis preserved.</b><p>{failedRetry.ai.message}</p></div>}
    {gap && <><ProviderNote hasImage={Boolean(gap.image)} /><div className="gap-detail-layout"><section className="gap-report" aria-label="Submitted evidence">
      {gap.image ? <div className="gap-saved-image"><a href={api.gapImageUrl(gap.id)} target="_blank" rel="noreferrer" aria-label="Open saved screenshot"><ImagePreview src={api.gapImageUrl(gap.id)} alt="User-submitted product screenshot" /></a><small>{gap.image.filename} · saved with this report</small></div> : <p className="gap-no-image">Non-visual report · no screenshot</p>}
      <h2>What went wrong</h2><p className="gap-prose">{gap.report.problem}</p>
      {gap.report.context && <><h3>Product / task context</h3><p className="gap-prose">{gap.report.context}</p></>}
      {gap.report.expected && <><h3>Expected outcome</h3><p className="gap-prose">{gap.report.expected}</p></>}
      <details className="gap-details"><summary>Additional submitted evidence</summary>{[gap.report.notes, gap.report.original_query, gap.report.delivered_guidance].filter(Boolean).map((v, i) => <p key={i} className="gap-prose">{v}</p>)}<p>Theme: {gap.report.theme_id || "workspace default"} · appearance: {gap.report.mode || "not specified"}</p><pre>{JSON.stringify(gap.report.usages, null, 2)}</pre></details>
    </section><div aria-live="polite">{busy && <p className="gap-progress" role="status">Inspecting current Monet knowledge and checking the evidence… Your report is already saved. You can leave this page and reload later.</p>}{gap.diagnosis ? <><Diagnosis diagnosis={gap.diagnosis} /><ProposalSection gap={gap} records={citable} overview={overview} error={overviewError} busy={creating} onCreate={() => void propose()} onGapChange={setGap} /></> : <section className="gap-empty-diagnosis"><span className="eyebrow">Next · Diagnose</span><h2>Understand why Monet fell short</h2><p>Compare this report with current guidance, relationships, retrieval, and any conformance observations. Monet may find more than one cause.</p><p>Diagnosis ends with a recommendation. It does not change your design system.</p></section>}</div></div></>}
  </div>;
}

function GapList() {
  const [gaps, setGaps] = useState<GapSummary[] | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { let active = true; api.gaps().then((value) => { if (active) { setGaps(value); setError(""); } }).catch((e) => { if (active) setError(message(e)); }); return () => { active = false; }; }, [attempt]);
  return <div className="page gap-page"><PageHeader eyebrow="Learn from real use" title="Gaps" description="Report where Monet’s guidance fell short. Understand the cause before changing the system." action={<Link className="button primary" to="/gaps/new">Report gap</Link>} />
    {error ? <div className="gap-error" role="alert">{error} <button className="button" onClick={() => setAttempt((a) => a + 1)}>Retry</button></div> : !gaps ? <p role="status">Loading gaps…</p> : gaps.length === 0 ? <div className="gap-empty"><span aria-hidden="true">▧</span><h2>What did Monet miss?</h2><p>A screenshot and a few words can reveal missing guidance, a retrieval problem, or a rule the implementation overlooked.</p><Link className="button" to="/gaps/new">Report your first gap</Link><small>Images are optional. Non-visual feedback belongs here, too.</small></div> : <div className="gap-list">{gaps.map((g) => <Link className="gap-row" to={`/gaps/${g.id}`} key={g.id}><div className="gap-thumbnail">{g.image ? <ImagePreview src={api.gapImageUrl(g.id)} alt="" /> : <span aria-hidden="true">▤</span>}</div><div><span className="eyebrow">{g.diagnosed ? "Diagnosis available" : "Ready to diagnose"} · {formatDate(g.created_at)}</span><h2>{g.problem}</h2>{g.context && <p>{g.context}</p>}</div><span aria-hidden="true">→</span></Link>)}</div>}
  </div>;
}

export function GapsPage() {
  const { id } = useParams();
  return id === "new" ? <GapCapture /> : id ? <GapDetail key={id} id={id} /> : <GapList />;
}
