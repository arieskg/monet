import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, type ReferenceSaveInput } from "../api";
import { PageHeader, formatDate } from "../components/Common";
import { OptionalAiNotice } from "../components/OptionalAiNotice";
import { uniqueSlug, type Reference, type ReferenceCollectionAnalysis, type ReferenceSuggestionStatus, type ReferenceType } from "../domain";
import { useWorkspace } from "../WorkspaceContext";
import { searchReferenceRecords } from "../../shared/service.js";

const referenceTypes: { value: "all" | ReferenceType; label: string }[] = [
  { value: "all", label: "All types" }, { value: "image", label: "Images" }, { value: "url", label: "URLs" },
  { value: "html", label: "HTML" }, { value: "svg", label: "SVG" }, { value: "pdf", label: "PDF" }, { value: "file", label: "Design files" },
];

function emptyReference(): ReferenceSaveInput {
  return { id: "", title: "", type: "url", source_url: "", source_domain: "", annotation: "", notes: "", asset_path: "", asset_media_type: "", original_filename: "", preview_url: "", ai_tags: [], ai: null, created_at: "", updated_at: "" };
}

function inferredType(file: File): ReferenceType {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (file.type === "image/svg+xml" || extension === "svg") return "svg";
  if (file.type.startsWith("image/")) return "image";
  if (file.type === "text/html" || extension === "html" || extension === "htm") return "html";
  if (file.type === "application/pdf" || extension === "pdf") return "pdf";
  return "file";
}

function readFileData(file: File): Promise<string> {
  if (file.size > 10 * 1024 * 1024) return Promise.reject(new Error("Reference files must be no larger than 10 MB."));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("The selected file could not be read."));
    reader.onerror = () => reject(new Error("The selected file could not be read."));
    reader.readAsDataURL(file);
  });
}

function isDirectImageUrl(value: string): boolean {
  try { return /\.(avif|gif|jpe?g|png|svg|webp)(?:$|[?#])/i.test(new URL(value).pathname); }
  catch { return false; }
}

function ReferencePreview({ reference, dataUrl = "", large = false }: { reference: Reference; dataUrl?: string; large?: boolean }) {
  const [imageFailed, setImageFailed] = useState(false);
  const localAsset = reference.asset_path ? api.referenceAssetUrl(reference.id) : "";
  const imageSource = dataUrl || (["image", "svg"].includes(reference.type) ? localAsset : "") || reference.preview_url || (isDirectImageUrl(reference.source_url) ? reference.source_url : "");
  if (imageSource && !imageFailed) return <img className="reference-preview-image" src={imageSource} alt={`Preview of ${reference.title || "reference"}`} onError={() => setImageFailed(true)} />;
  if (large && reference.type === "html" && localAsset) return <iframe className="reference-preview-frame" src={localAsset} sandbox="" title={`Preview of ${reference.title}`} />;
  if (large && reference.type === "pdf" && localAsset) return <iframe className="reference-preview-frame" src={localAsset} title={`Preview of ${reference.title}`} />;
  const label = reference.source_domain || reference.original_filename || reference.type || "Reference";
  return <div className="reference-preview-placeholder"><span>{reference.type === "url" ? "↗" : reference.type.toUpperCase()}</span><b>{label}</b><small>{reference.type === "url" ? "Web reference" : "Stored reference file"}</small></div>;
}

function ReferenceDialog({ initial, isNew, existingIds, onClose }: { initial: ReferenceSaveInput; isNew: boolean; existingIds: string[]; onClose: () => void }) {
  const { reload } = useWorkspace();
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<ReferenceSaveInput>(() => structuredClone(initial));
  const [dataUrl, setDataUrl] = useState(initial.asset_data_url ?? "");
  const [state, setState] = useState<"idle" | "saving" | "analyzing" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    document.body.classList.add("dialog-open");
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && state !== "saving" && state !== "analyzing") onClose(); };
    window.addEventListener("keydown", escape);
    return () => { document.body.classList.remove("dialog-open"); window.removeEventListener("keydown", escape); };
  }, [onClose, state]);

  async function setReferenceFile(file: File) {
    setMessage("");
    try {
      const nextDataUrl = await readFileData(file);
      const type = inferredType(file);
      setDataUrl(nextDataUrl);
      setDraft((current) => ({ ...current, type, asset_data_url: nextDataUrl, asset_filename: file.name, asset_media_type: file.type, original_filename: file.name, title: current.title || file.name.replace(/\.[^.]+$/, "") }));
    } catch (error) { setMessage(error instanceof Error ? error.message : "The selected file could not be read."); }
  }

  function onPaste(event: ClipboardEvent<HTMLDivElement>) {
    const file = [...event.clipboardData.items].find((item) => item.kind === "file" && item.type.startsWith("image/"))?.getAsFile();
    if (file) { event.preventDefault(); void setReferenceFile(file); }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) void setReferenceFile(file);
  }

  async function save(shouldAnalyze: boolean) {
    setMessage("");
    if (!draft.title.trim()) { setMessage("Add a title."); return; }
    if (!draft.annotation.trim()) { setMessage("Describe what you like about this reference."); return; }
    if (!draft.source_url.trim() && !draft.asset_path && !dataUrl) { setMessage("Paste a URL or choose a reference file."); return; }
    const id = draft.id || uniqueSlug(draft.title, existingIds) || `reference-${Date.now()}`;
    setState("saving");
    try {
      const saved = await api.saveReference({ ...draft, id, asset_data_url: dataUrl || undefined });
      setDraft(saved);
      await reload();
      if (shouldAnalyze) {
        setState("analyzing");
        try {
          await api.analyzeReference(saved.id);
          await reload();
        } catch (error) {
          setState("error");
          setMessage(`Reference saved, but AI analysis failed. ${error instanceof Error ? error.message : "Try Analyze again."}`);
          return;
        }
      }
      setState("saved");
      void navigate(`/references/${saved.id}`, { replace: true });
      onClose();
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "The reference could not be saved.");
    }
  }

  async function remove() {
    if (isNew || !draft.id) { onClose(); return; }
    if (!window.confirm(`Delete “${draft.title}”? The stored reference asset and its collection evidence will also be removed.`)) return;
    setState("saving");
    try { await api.deleteReference(draft.id); await reload(); void navigate("/references", { replace: true }); onClose(); }
    catch (error) { setState("error"); setMessage(error instanceof Error ? error.message : "The reference could not be deleted."); }
  }

  const preview = { ...draft, id: draft.id || "draft" } as Reference;
  const busy = state === "saving" || state === "analyzing";
  return <div className="reference-dialog-backdrop" onPaste={onPaste} onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className="reference-dialog" role="dialog" aria-modal="true" aria-labelledby="reference-dialog-title">
      <header><div><span className="eyebrow">{isNew ? "Add reference" : draft.type}</span><h2 id="reference-dialog-title">{isNew ? "Save visual inspiration" : draft.title}</h2><p>{isNew ? "Keep the input light. Monet can organize the visual details after saving." : `Saved ${formatDate(draft.updated_at)}`}</p></div><button className="dialog-close" aria-label="Close reference" disabled={busy} onClick={onClose}>×</button></header>
      <div className="reference-dialog-layout">
        <div className="reference-asset-column">
          <div className="reference-large-preview"><ReferencePreview reference={preview} dataUrl={dataUrl} large /></div>
          <div className="reference-dropzone" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
            <input ref={fileInput} type="file" accept="image/*,.html,.htm,.svg,.pdf,.fig,.sketch,.xd" onChange={(event) => { const file = event.target.files?.[0]; if (file) void setReferenceFile(file); }} />
            <b>Drop, paste, or choose a file</b><span>Images, HTML, SVG, PDF, Figma, Sketch, or XD · up to 10 MB</span>
            <button className="button ghost" type="button" onClick={() => fileInput.current?.click()}>{draft.asset_path || dataUrl ? "Replace file" : "Choose file"}</button>
          </div>
        </div>
        <div className="reference-form">
          <label>Title<input autoFocus value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Messaging layout with calm hierarchy" /></label>
          <label>Source or URL <span className="optional-label">optional for uploads</span><input type="url" value={draft.source_url} onChange={(event) => setDraft({ ...draft, source_url: event.target.value, type: dataUrl || draft.asset_path ? draft.type : "url" })} placeholder="https://example.com/product" /></label>
          <label>What do you like about this?<textarea value={draft.annotation} onChange={(event) => setDraft({ ...draft, annotation: event.target.value })} placeholder="The narrow conversation column and restrained actions keep attention on the content." /></label>
          <label>Notes <span className="optional-label">optional</span><textarea className="compact-textarea" value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="Anything else Monet should remember" /></label>
          {!isNew && draft.ai && <div className="reference-ai-observations"><span className="eyebrow">AI observations</span><p>{draft.ai.retrieval_text}</p><div className="reference-tags">{draft.ai_tags.map((tag) => <span key={tag}>{tag}</span>)}</div></div>}
        </div>
      </div>
      {message && <div className="reference-form-message" role="alert">{message}</div>}
      <footer><span aria-live="polite">{state === "saving" ? "Saving reference…" : state === "analyzing" ? "Analyzing visual details…" : ""}</span><div className="button-row">{!isNew && <button className="button ghost danger-text" disabled={busy} onClick={() => void remove()}>Delete</button>}<button className="button ghost" disabled={busy} onClick={onClose}>Cancel</button>{!isNew && <button className="button ghost" disabled={busy} onClick={() => void save(true)}>Save & reanalyze</button>}<button className="button primary" disabled={busy} onClick={() => void save(isNew)}>{isNew ? "Save & analyze" : "Save changes"}</button></div></footer>
    </section>
  </div>;
}

function AnalysisPanel({ analysis, references, busy, aiConfigured, onAnalyze, onSuggestion }: { analysis: ReferenceCollectionAnalysis; references: Reference[]; busy: boolean; aiConfigured: boolean; onAnalyze: () => void; onSuggestion: (id: string, status: ReferenceSuggestionStatus) => void }) {
  const referenceNames = new Map(references.map((reference) => [reference.id, reference.title]));
  return <section className="reference-analysis-panel" aria-labelledby="reference-analysis-heading">
    <header><div><span className="eyebrow">Collection intelligence</span><h2 id="reference-analysis-heading">Recurring preferences</h2><p>{analysis.summary || (aiConfigured ? "Analyze the collection to find repeated visual preferences and design-system opportunities." : "Optional. With an AI provider configured, Monet reads the collection for repeated visual preferences and design-system opportunities. Everything else on this page works without one.")}</p></div><button className={aiConfigured ? "button primary" : "button ghost"} disabled={busy || !references.length} onClick={onAnalyze}>{busy ? "Analyzing…" : analysis.analyzed_at ? "Analyze again" : "Analyze references"}</button></header>
    {analysis.recurring_preferences.length > 0 && <div className="preference-grid">{analysis.recurring_preferences.map((preference) => <article key={preference.id}><div><b>{preference.title}</b><span className={`confidence ${preference.confidence}`}>{preference.confidence}</span></div><p>{preference.observation}</p><small>{preference.evidence_reference_ids.map((id) => referenceNames.get(id) ?? id).join(" · ")}</small></article>)}</div>}
    {analysis.suggestions.length > 0 && <div className="reference-suggestions"><div className="section-heading"><span className="eyebrow">Staged suggestions</span><h3>Potential design-system changes</h3><p>Approval keeps a suggestion for design-system review. It does not change Principles, Themes, Foundations, Components, or Patterns.</p></div>{analysis.suggestions.filter((suggestion) => suggestion.status !== "dismissed").map((suggestion) => <article key={suggestion.id} className={suggestion.status}><div className="suggestion-target"><span>{suggestion.target_type}{suggestion.target_id ? ` · ${suggestion.target_id}` : " · new"}</span>{suggestion.status === "approved" && <b>Approved</b>}</div><h4>{suggestion.title}</h4><p>{suggestion.proposal}</p><small>{suggestion.rationale}</small><div className="suggestion-actions"><span>{suggestion.evidence_reference_ids.map((id) => referenceNames.get(id) ?? id).join(" · ")}</span>{suggestion.status === "pending" && <><button className="button ghost micro" onClick={() => onSuggestion(suggestion.id, "dismissed")}>Dismiss</button><button className="button ghost micro" onClick={() => onSuggestion(suggestion.id, "approved")}>Approve for review</button></>}</div></article>)}</div>}
  </section>;
}

export function ReferencesPage() {
  const { workspace, environment, reload } = useWorkspace();
  const { id } = useParams();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [type, setType] = useState<"all" | ReferenceType>("all");
  const [tag, setTag] = useState("all");
  const [adding, setAdding] = useState(false);
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const selected = workspace?.references.find((reference) => reference.id === id);
  const references = useMemo(() => workspace?.references ?? [], [workspace?.references]);
  const tags = useMemo(() => [...new Set(references.flatMap((reference) => reference.ai_tags))].sort(), [references]);
  const visible = useMemo(() => searchReferenceRecords(references, query).filter((reference) => (type === "all" || reference.type === type) && (tag === "all" || reference.ai_tags.includes(tag))), [query, references, tag, type]);
  const filtered = Boolean(query || type !== "all" || tag !== "all");

  async function analyzeCollection() {
    setAnalysisBusy(true); setAnalysisError("");
    try { await api.analyzeReferences(); await reload(); }
    catch (error) { setAnalysisError(error instanceof Error ? error.message : "The collection could not be analyzed."); }
    finally { setAnalysisBusy(false); }
  }

  async function updateSuggestion(suggestionId: string, status: ReferenceSuggestionStatus) {
    if (!workspace) return;
    const next = { ...workspace.referenceAnalysis, suggestions: workspace.referenceAnalysis.suggestions.map((suggestion) => suggestion.id === suggestionId ? { ...suggestion, status } : suggestion) };
    try { await api.saveReferenceAnalysis(next); await reload(); }
    catch (error) { setAnalysisError(error instanceof Error ? error.message : "The suggestion could not be updated."); }
  }

  return <div className="page references-page">
    <PageHeader eyebrow="Inspiration" title="References" description="Save specific visual examples, record what matters to you, and let Monet build a retrievable preference memory." action={<div className="button-row"><button className="button ghost" disabled={!references.length || analysisBusy} onClick={() => void analyzeCollection()} title="Optional. Reads the collection with a configured AI provider.">{analysisBusy ? "Analyzing…" : "Analyze references"}</button><button className="button primary" onClick={() => setAdding(true)}>Add reference</button></div>} />
    <div className="reference-toolbar"><label className="reference-search"><span className="eyebrow">Search</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search titles, annotations, or AI tags" /></label><label><span className="eyebrow">Type</span><select value={type} onChange={(event) => setType(event.target.value as "all" | ReferenceType)}>{referenceTypes.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label><span className="eyebrow">Tag</span><select value={tag} onChange={(event) => setTag(event.target.value)}><option value="all">All tags</option>{tags.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>{filtered && <button className="button ghost" onClick={() => { setQuery(""); setType("all"); setTag("all"); }}>Clear filters</button>}</div>
    {!references.length ? <div className="reference-empty"><span className="eyebrow">Visual memory is empty</span><h2>Save the examples you keep coming back to.</h2><p>Add a screenshot, paste an image, upload a lightweight design file, or save a URL. Your annotation stays separate from Monet’s AI observations.</p><button className="button primary" onClick={() => setAdding(true)}>Add first reference</button></div> : visible.length === 0 ? <div className="reference-empty compact"><h2>No references match these filters.</h2><p>Try a broader search or clear the active type and tag filters.</p><button className="button ghost" onClick={() => { setQuery(""); setType("all"); setTag("all"); }}>Clear filters</button></div> : <div className="reference-grid" aria-live="polite">{visible.map((reference) => <button className="reference-card" key={reference.id} onClick={() => void navigate(`/references/${reference.id}`)}><div className="reference-card-preview"><ReferencePreview reference={reference} /></div><div className="reference-card-body"><div className="reference-card-title"><span><b>{reference.title}</b><small>{reference.source_domain || reference.original_filename || reference.type}</small></span><i>{reference.type}</i></div><p>{reference.annotation}</p><div className="reference-tags">{reference.ai_tags.slice(0, 5).map((value) => <span key={value}>{value}</span>)}{!reference.ai && <span className="unanalyzed">Not analyzed</span>}</div></div></button>)}</div>}
    <OptionalAiNotice feature="Reference analysis" />
    {(workspace?.referenceAnalysis.analyzed_at || references.length > 0) && <AnalysisPanel analysis={workspace?.referenceAnalysis ?? { summary: "", recurring_preferences: [], suggestions: [], analyzed_at: "" }} references={references} busy={analysisBusy} aiConfigured={Boolean(environment?.aiConfigured)} onAnalyze={() => void analyzeCollection()} onSuggestion={(suggestionId, status) => void updateSuggestion(suggestionId, status)} />}
    {analysisError && <div className="reference-analysis-error" role="alert">{analysisError}</div>}
    {adding && <ReferenceDialog initial={emptyReference()} isNew existingIds={references.map((reference) => reference.id)} onClose={() => setAdding(false)} />}
    {selected && <ReferenceDialog initial={selected} isNew={false} existingIds={references.map((reference) => reference.id)} onClose={() => void navigate("/references")} />}
  </div>;
}
