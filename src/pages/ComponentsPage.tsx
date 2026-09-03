import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { AiDecisionActions } from "../components/AiDecisionActions";
import { ComponentDecisionSelect, PageHeader, SaveNotice, formatDate } from "../components/Common";
import { JsonImportDialog } from "../components/JsonImportDialog";
import { StringListTextarea } from "../components/StringListInput";
import { CandidatePreview, ComponentPreview } from "../components/Preview";
import { candidatesForComponent, taxonomyEntries, type Candidate, type ComponentDecision, type SnippetLanguage, type Source, type TaxonomyEntry } from "../domain";
import { isSaveShortcut } from "../keyboard";
import { useWorkspace } from "../WorkspaceContext";

function emptyDecision(id: string): ComponentDecision { return { id, status: "undecided", selection: null, preferences: {}, behavior: {}, rationale: "", notes: "", use_when: [], avoid_when: [], foundations: [], primitives: [], candidates: [], history: [], updated_at: "" }; }

function parsePreferenceImport(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Preferences must be a JSON object with string values.");
  const entries = Object.entries(value as Record<string, unknown>);
  if (!entries.length || entries.some(([key, item]) => !key.trim() || typeof item !== "string")) throw new Error("Preferences must be a non-empty object with string values.");
  const preferences: Record<string, string> = {};
  for (const [key, item] of entries) preferences[key.trim()] = (item as string).trim();
  return preferences;
}

function parseCandidateImport(value: unknown): Candidate {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("An inspiration must be one JSON object.");
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.source !== "string" || !candidate.source.trim() || typeof candidate.source_component !== "string" || !candidate.source_component.trim()) throw new Error("An inspiration needs source and source_component fields.");
  const preview = candidate.preview === "adapter" || candidate.preview === "reference" || candidate.preview === "snippet" ? candidate.preview : "reference";
  if (candidate.description !== undefined && typeof candidate.description !== "string") throw new Error("The inspiration description must be a string.");
  if (candidate.documentation !== undefined && typeof candidate.documentation !== "string") throw new Error("The inspiration documentation must be a string.");
  if (candidate.snippet !== undefined && typeof candidate.snippet !== "string") throw new Error("The inspiration snippet must be a string.");
  if (candidate.language !== undefined && (typeof candidate.language !== "string" || !["tsx", "jsx", "html", "css", "text"].includes(candidate.language))) throw new Error("The inspiration language is not supported.");
  if (preview === "snippet" && typeof candidate.snippet !== "string") throw new Error("Snippet inspirations need a snippet field.");
  return { source: candidate.source.trim(), source_component: candidate.source_component.trim(), description: typeof candidate.description === "string" && candidate.description.trim() ? candidate.description.trim() : "Imported implementation reference.", documentation: typeof candidate.documentation === "string" && candidate.documentation.trim() ? candidate.documentation.trim() : undefined, preview, snippet: typeof candidate.snippet === "string" && candidate.snippet ? candidate.snippet : undefined, language: candidate.language as SnippetLanguage | undefined };
}

function TaxonomyBrowser({ current }: { current?: string }) {
  const { workspace } = useWorkspace();
  if (!workspace) return null;
  const decisions = new Map(workspace.components.map((item) => [item.id, item.status]));
  return <aside className="taxonomy-rail">{workspace.taxonomy.map((category) => <details key={category.id} open={category.entries.some((item) => item.id === current) || ["actions", "text-inputs", "selection"].includes(category.id)}><summary>{category.name}<span>{category.entries.length}</span></summary>{category.entries.map((item) => <Link key={item.id} className={item.id === current ? "active" : ""} to={`/components/${item.id}`}><span>{item.name}</span><i className={`mini-status ${decisions.get(item.id) ?? "undecided"}`} /></Link>)}</details>)}</aside>;
}

function ManualInspirationDialog({ entry, sources, onAdd, onClose }: { entry: TaxonomyEntry; sources: Source[]; onAdd: (candidate: Candidate) => void; onClose: () => void }) {
  const [source, setSource] = useState("manual");
  const [sourceComponent, setSourceComponent] = useState(entry.name);
  const [description, setDescription] = useState("");
  const [documentation, setDocumentation] = useState("");
  const [language, setLanguage] = useState<SnippetLanguage>("tsx");
  const [snippet, setSnippet] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) { if (event.key === "Escape") onClose(); }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);
  function add() {
    if (!source.trim() || !sourceComponent.trim() || !snippet.trim()) return;
    onAdd({ source: source.trim(), source_component: sourceComponent.trim(), description: description.trim() || `Manual ${entry.name} implementation reference.`, documentation: documentation.trim() || undefined, preview: "snippet", language, snippet: snippet.trim() });
  }
  return <div className="json-import-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="json-import-dialog inspiration-dialog" role="dialog" aria-modal="true" aria-labelledby="manual-inspiration-title">
      <header><div><span className="eyebrow">Manual reference</span><h2 id="manual-inspiration-title">Add {entry.name} inspiration</h2></div><button className="dialog-close" aria-label="Close manual inspiration" onClick={onClose}>×</button></header>
      <div className="snippet-instructions"><b>Snippet format</b><p>Paste one focused TSX, JSX, HTML, CSS, or plain-text usage example. Include complete opening and closing tags, omit Markdown code fences, and keep imports out unless they clarify the API. Monet stores and displays the code as text; it never executes pasted snippets.</p><code>{`<Button aria-label="Add item"><PlusIcon /></Button>`}</code></div>
      <div className="form-grid two manual-inspiration-form"><label>Source ID or label<input list={`source-options-${entry.id}`} value={source} onChange={(event) => setSource(event.target.value)} placeholder="material-ui or personal" /><datalist id={`source-options-${entry.id}`}>{sources.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</datalist></label><label>Upstream component<input value={sourceComponent} onChange={(event) => setSourceComponent(event.target.value)} placeholder={entry.name} /></label><label className="span-two">Description<input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What is worth borrowing from this example?" /></label><label>Documentation URL<input value={documentation} onChange={(event) => setDocumentation(event.target.value)} placeholder="https://…" /></label><label>Code language<select value={language} onChange={(event) => setLanguage(event.target.value as SnippetLanguage)}>{(["tsx", "jsx", "html", "css", "text"] as const).map((item) => <option key={item}>{item}</option>)}</select></label><label className="span-two">Code snippet<textarea className="snippet-input" autoFocus spellCheck={false} value={snippet} onChange={(event) => setSnippet(event.target.value)} placeholder={`Paste ${language.toUpperCase()} without Markdown fences…`} /></label></div>
      <footer><button className="button ghost" onClick={onClose}>Cancel</button><button className="button ghost" onClick={() => setImportOpen(true)}>Import JSON</button><button className="button primary" disabled={!source.trim() || !sourceComponent.trim() || !snippet.trim()} onClick={add}>Add to draft</button></footer>
    </section>
    {importOpen && <JsonImportDialog title={`Import ${entry.name} inspiration`} description="Paste or choose one inspiration JSON object. It will be added to the component draft for review." dialogId={`inspiration-import-${entry.id}`} onClose={() => setImportOpen(false)} onImport={(candidate) => { onAdd(candidate); setImportOpen(false); onClose(); }} parse={parseCandidateImport} primaryLabel="Add to draft" />}
  </div>;
}

function Compare({ entry, draft, onSelect, onRemove, onAdd }: { entry: TaxonomyEntry; draft: ComponentDecision; onSelect: (source: string, sourceComponent: string) => void; onRemove: (index: number) => void; onAdd: () => void }) {
  const { workspace } = useWorkspace();
  return <div className="compare-section"><div className="section-heading row compare-heading"><div><span className="eyebrow">Implementation references</span><h3>{draft.candidates.length} inspirations</h3></div><button className="button ghost" onClick={onAdd}>Add inspiration</button></div><div className="compare-grid">{draft.candidates.length ? draft.candidates.map((candidate, index) => { const source = workspace?.sources.find((item) => item.id === candidate.source); const selected = draft.selection?.source === candidate.source && draft.selection.source_component === candidate.source_component; return <article className={`candidate-card ${selected ? "selected" : ""}`} key={`${candidate.source}-${candidate.source_component}-${index}`}><header><span><small>{source?.framework || (candidate.preview === "snippet" ? "Manual snippet" : "Reference")}</small><h3>{source?.name ?? candidate.source}</h3></span>{selected && <span className="selected-mark">Selected</span>}</header><CandidatePreview componentId={entry.id} candidate={candidate} /><p>{candidate.description}</p><div className="candidate-meta"><span>{candidate.source_component}</span><span>{candidate.documentation && <a href={candidate.documentation} target="_blank" rel="noreferrer">Docs ↗</a>}{candidate.preview === "snippet" && <button className="candidate-remove" onClick={() => onRemove(index)}>Remove</button>}</span></div><button className={selected ? "button selected-button" : "button ghost"} onClick={() => onSelect(candidate.source, candidate.source_component)}>{selected ? "Current inspiration" : "Select inspiration"}</button></article>; }) : <div className="no-candidates"><b>No inspirations yet.</b><p>Add a source mapping or paste a manual implementation snippet.</p><button className="button ghost" onClick={onAdd}>Add inspiration</button></div>}</div></div>;
}

export function ComponentsPage() {
  const { workspace, reload } = useWorkspace();
  const { id } = useParams();
  const entries = workspace ? taxonomyEntries(workspace) : [];
  const entry = entries.find((item) => item.id === id);
  const stored = workspace?.components.find((item) => item.id === id);
  const [draft, setDraft] = useState<ComponentDecision | null>(null);
  const [addingInspiration, setAddingInspiration] = useState(false);
  const [preferenceImportOpen, setPreferenceImportOpen] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const loadedId = useRef<string | undefined>(undefined);
  useEffect(() => { if (loadedId.current !== entry?.id) { loadedId.current = entry?.id; const next = entry ? structuredClone(stored ?? emptyDecision(entry.id)) : null; if (next && workspace) next.candidates = candidatesForComponent(workspace, entry!.id, next.candidates); setDraft(next); setSaveState("idle"); setAddingInspiration(false); } }, [entry, stored, workspace]);
  useEffect(() => {
    if (!workspace || !entry) return;
    setDraft((current) => {
      if (!current || current.id !== entry.id) return current;
      const candidates = candidatesForComponent(workspace, entry.id, current.candidates);
      return candidates.length === current.candidates.length ? current : { ...current, candidates };
    });
  }, [entry, workspace]);
  const selectedSource = useMemo(() => workspace?.sources.find((source) => source.id === draft?.selection?.source), [workspace, draft?.selection?.source]);
  const selectedCandidate = draft?.selection ? draft.candidates.find((candidate) => candidate.source === draft.selection?.source && candidate.source_component === draft.selection.source_component) : undefined;
  const save = useCallback(async () => { if (!draft) return; setSaveState("saving"); try { await api.saveComponent(draft); await reload(); setSaveState("saved"); } catch { setSaveState("error"); } }, [draft, reload]);
  useEffect(() => {
    function saveOnShortcut(event: KeyboardEvent) {
      if (!draft || !isSaveShortcut(event)) return;
      event.preventDefault();
      void save();
    }
    window.addEventListener("keydown", saveOnShortcut);
    return () => window.removeEventListener("keydown", saveOnShortcut);
  }, [draft, save]);
  function select(source: string, sourceComponent: string) { if (!draft) return; setDraft({ ...draft, status: "selected", selection: { source, source_component: sourceComponent } }); }
  function updatePreference(key: string, nextKey: string, value: string) { if (!draft) return; const preferences = Object.fromEntries(Object.entries(draft.preferences).flatMap(([name, current]) => name === key ? (nextKey ? [[nextKey, value]] : []) : [[name, current]])); setDraft({ ...draft, preferences }); }
  function updateBehavior(key: string, nextKey: string, value: boolean) { if (!draft) return; const behavior = Object.fromEntries(Object.entries(draft.behavior).flatMap(([name, current]) => name === key ? (nextKey ? [[nextKey, value]] : []) : [[name, current]])); setDraft({ ...draft, behavior }); }

  return <div className="page components-page"><PageHeader eyebrow="Lightweight decisions" title="Components" description="Choose inspiration, record a few component-specific preferences, and inherit the rest from Monet." />
    <div className="component-workspace"><TaxonomyBrowser current={id} /><section className="component-detail">{!entry || !draft ? <div className="component-index"><span className="eyebrow">{entries.length} canonical concepts</span><h2>Choose a component to understand and decide.</h2><p>The taxonomy belongs to Monet. External libraries map into it without defining its structure.</p><div className="category-summary">{workspace?.taxonomy.map((category) => <div key={category.id}><b>{category.name}</b><span>{category.entries.length}</span><p>{category.entries.map((item) => item.name).join(" · ")}</p></div>)}</div></div> : <>
        <div className="component-title"><div><span className="eyebrow">{workspace?.taxonomy.find((category) => category.id === entry.category)?.name}</span><h2>{entry.name}</h2><p>{entry.description}</p><div className="alias-row">{entry.aliases.map((alias) => <span key={alias}>{alias}</span>)}</div></div><div><ComponentDecisionSelect value={draft.status} onChange={(value) => setDraft({ ...draft, status: value })} /><SaveNotice state={saveState} /><AiDecisionActions kind="Component" value={draft} context={`${entry.name}: ${entry.description}. Aliases: ${entry.aliases.join(", ") || "none"}. Available inspirations: ${draft.candidates.map((candidate) => `${candidate.source}/${candidate.source_component}`).join(", ") || "none"}.`} onImport={(value) => { setDraft(value); setSaveState("idle"); }} /><button className="button primary save-decision-button" onClick={() => void save()}><span>Save decision</span><kbd>⌃⌘S</kbd></button></div></div>
        <section className="component-primary-editor">
          <div className="component-primary-section"><span className="eyebrow">Selected inspiration</span>{draft.selection ? <div className="selected-inspiration"><div><strong>{selectedSource?.name ?? draft.selection.source}</strong><span>{draft.selection.source_component}</span></div><button className="button ghost micro" onClick={() => setDraft({ ...draft, selection: null })}>Clear</button></div> : <div className="selected-inspiration empty"><div><strong>Monet baseline</strong><span>No external inspiration selected</span></div></div>}</div>
          <div className="component-primary-section"><div className="section-heading row"><div><span className="eyebrow">A few meaningful choices</span><h3>Preferences</h3></div><div className="button-row"><button className="button ghost micro" onClick={() => setDraft({ ...draft, preferences: { ...draft.preferences, [`preference-${Object.keys(draft.preferences).length + 1}`]: "" } })}>Add preference</button><button className="button ghost micro" onClick={() => setPreferenceImportOpen(true)}>Import JSON</button></div></div>{Object.entries(draft.preferences).length ? Object.entries(draft.preferences).map(([key, value]) => <div className="token-row" key={key}><input aria-label="Preference name" value={key} onChange={(event) => updatePreference(key, event.target.value, value)} /><input aria-label={`${key} value`} value={value} onChange={(event) => updatePreference(key, key, event.target.value)} /><button aria-label={`Remove ${key}`} onClick={() => updatePreference(key, "", value)}>×</button></div>) : <p className="inheritance-note">No component-specific preferences. Global Monet guidance applies.</p>}</div>
          <label className="component-notes">Notes <small>Optional. Keep this short unless the component genuinely needs context.</small><textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="Only what an implementation agent would not infer from Monet…" /></label>
          <div className="component-inheritance"><b>Inherited automatically</b><span>Principles</span><span>Foundations</span><span>Patterns</span><p>Only component-specific deviations and preferences belong here.</p></div>
        </section>
        <details className="component-disclosure inspiration-browser"><summary><span><b>Choose inspiration</b><small>Compare {draft.candidates.length} implementation references</small></span><i>›</i></summary><div className="disclosure-body"><Compare entry={entry} draft={draft} onSelect={select} onRemove={(index) => setDraft({ ...draft, candidates: draft.candidates.filter((_, itemIndex) => itemIndex !== index) })} onAdd={() => setAddingInspiration(true)} /></div></details>
        <section className="component-live-preview"><header><div><span className="eyebrow">Trusted local adapter</span><h3>{entry.name} preview</h3></div><span>{selectedSource ? `${selectedSource.name} inspiration` : "Monet baseline"}</span></header><ComponentPreview componentId={entry.id} candidate={selectedCandidate} large /><p>This safe local fixture shows the selected inspiration through Monet's existing global foundations.</p></section>
        <details className="component-disclosure advanced-component"><summary><span><b>Advanced</b><small>Behavior, rationale, usage guidance, foundations, and primitives</small></span><i>›</i></summary><div className="disclosure-body advanced-component-body">
          <div className="advanced-field"><div className="section-heading row"><div><h3>Behavior</h3><p>Use only for component-specific behavior that global rules do not cover.</p></div><button className="button ghost micro" onClick={() => setDraft({ ...draft, behavior: { ...draft.behavior, [`behavior-${Object.keys(draft.behavior).length + 1}`]: true } })}>Add behavior</button></div>{Object.entries(draft.behavior).map(([key, value]) => <div className="behavior-row" key={key}><input aria-label="Behavior name" value={key} onChange={(event) => updateBehavior(key, event.target.value, value)} /><select aria-label={`${key} value`} value={String(value)} onChange={(event) => updateBehavior(key, key, event.target.value === "true")}><option value="true">Yes</option><option value="false">No</option></select><button aria-label={`Remove ${key}`} onClick={() => updateBehavior(key, "", value)}>×</button></div>)}</div>
          <label>Rationale <small>Why this choice is exceptional or non-obvious</small><textarea value={draft.rationale} onChange={(event) => setDraft({ ...draft, rationale: event.target.value })} /></label>
          <div className="guidance-grid four"><label>Use when <small>One situation per line</small><StringListTextarea value={draft.use_when} onChange={(use_when) => setDraft({ ...draft, use_when })} /></label><label>Avoid when <small>One situation per line</small><StringListTextarea value={draft.avoid_when} onChange={(avoid_when) => setDraft({ ...draft, avoid_when })} /></label><label>Foundation deviations <small>Only explicit component-specific links</small><StringListTextarea value={draft.foundations} onChange={(foundations) => setDraft({ ...draft, foundations })} /></label><label>Primitive IDs <small>One per line</small><StringListTextarea value={draft.primitives} onChange={(primitives) => setDraft({ ...draft, primitives })} /></label></div>
        </div></details>
        <details className="component-disclosure"><summary><span><b>History</b><small>{draft.history.length} recorded selection changes</small></span><i>›</i></summary><div className="disclosure-body history-list">{draft.history.length ? [...draft.history].reverse().map((item) => <article key={`${item.date}-${item.change}`}><time>{formatDate(item.date)}</time><h3>{item.change}</h3><p>{item.old_selection ?? "None"} → {item.new_selection ?? "None"}</p>{item.rationale && <blockquote>{item.rationale}</blockquote>}</article>) : <div className="no-candidates"><b>No decisions recorded yet.</b><p>Changing the selected inspiration creates a readable history entry.</p></div>}</div></details>
        {addingInspiration && <ManualInspirationDialog entry={entry} sources={workspace?.sources ?? []} onClose={() => setAddingInspiration(false)} onAdd={(candidate) => { setDraft({ ...draft, candidates: [...draft.candidates, candidate] }); setAddingInspiration(false); setSaveState("idle"); }} />}
        {preferenceImportOpen && <JsonImportDialog title="Import preferences JSON" description="Paste or choose a JSON object whose values are strings. Imported preferences are merged into this component draft." dialogId={`preference-import-${entry.id}`} onClose={() => setPreferenceImportOpen(false)} onImport={(preferences) => { setDraft({ ...draft, preferences: { ...draft.preferences, ...preferences } }); setPreferenceImportOpen(false); setSaveState("idle"); }} parse={parsePreferenceImport} primaryLabel="Add to draft" />}
      </>}</section></div>
  </div>;
}
