import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { AiDecisionActions } from "../components/AiDecisionActions";
import { PageHeader, SaveNotice, StatusPill, StatusSelect } from "../components/Common";
import { JsonImportDialog } from "../components/JsonImportDialog";
import { StringListInput } from "../components/StringListInput";
import { statuses, uniqueSlug, type MarkdownDocument, type Principle } from "../domain";
import { validateDecisionJson } from "../aiDecision";
import { useWorkspace } from "../WorkspaceContext";

function MarkdownPreview({ source }: { source: string }) {
  return <div className="markdown-preview">{source.split(/\n+/).map((line, index) => {
    if (line.startsWith("# ")) return <h2 key={index}>{line.slice(2)}</h2>;
    if (line.startsWith("## ")) return <h3 key={index}>{line.slice(3)}</h3>;
    if (/^\d+\. /.test(line)) return <p className="numbered" key={index}>{line}</p>;
    if (line.startsWith("- ")) return <p className="bullet" key={index}>{line.slice(2)}</p>;
    return line ? <p key={index}>{line}</p> : null;
  })}</div>;
}

function isMarkdownDocument(value: Principle | MarkdownDocument): value is MarkdownDocument {
  return "status" in value;
}

function importedId(candidate: Record<string, unknown>, title: string, existingIds: string[]): string {
  return uniqueSlug(typeof candidate.id === "string" && candidate.id.trim() ? candidate.id : title, existingIds);
}

function parsePrincipleImport(value: unknown, existingIds: string[]): Principle {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("A principle must be one JSON object.");
  const candidate = value as Record<string, unknown>;
  const title = typeof candidate.title === "string" ? candidate.title.trim() : "";
  if (!title) throw new Error("A principle needs a title.");
  const principle: Principle = { id: importedId(candidate, title, existingIds), title, body: typeof candidate.body === "string" ? candidate.body : `# ${title}\n\n`, order: 0, updated_at: "" };
  const validationError = validateDecisionJson("Principle", principle, principle.id);
  if (validationError) throw new Error(validationError);
  return principle;
}

function parsePatternImport(value: unknown, existingIds: string[]): MarkdownDocument {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("A pattern must be one JSON object.");
  const candidate = value as Record<string, unknown>;
  const title = typeof candidate.title === "string" ? candidate.title.trim() : "";
  if (!title) throw new Error("A pattern needs a title.");
  const pattern: MarkdownDocument = { id: importedId(candidate, title, existingIds), title, summary: typeof candidate.summary === "string" ? candidate.summary : "", body: typeof candidate.body === "string" ? candidate.body : `# ${title}\n\n`, status: statuses.includes(candidate.status as MarkdownDocument["status"]) ? candidate.status as MarkdownDocument["status"] : "undecided", tags: Array.isArray(candidate.tags) ? candidate.tags.filter((tag): tag is string => typeof tag === "string") : [], order: 0, updated_at: "", components: Array.isArray(candidate.components) ? candidate.components.filter((item): item is string => typeof item === "string") : [], foundations: Array.isArray(candidate.foundations) ? candidate.foundations.filter((item): item is string => typeof item === "string") : [] };
  const validationError = validateDecisionJson("Pattern", pattern, pattern.id);
  if (validationError) throw new Error(validationError);
  return pattern;
}

function DocumentWorkspace({ kind }: { kind: "principles" | "patterns" }) {
  const { workspace, reload } = useWorkspace();
  const { id } = useParams();
  const navigate = useNavigate();
  const documents = kind === "principles" ? workspace?.principles ?? [] : workspace?.patterns ?? [];
  const selected = documents.find((item) => item.id === id);
  const [draft, setDraft] = useState<MarkdownDocument | Principle | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [creating, setCreating] = useState(false);
  const [naming, setNaming] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const loadedId = useRef<string | undefined>(undefined);
  const singular = kind === "principles" ? "Principle" : "Pattern";
  useEffect(() => { if (loadedId.current !== selected?.id) { loadedId.current = selected?.id; setDraft(selected ? structuredClone(selected) : null); setSaveState("idle"); setCreating(false); } }, [selected]);

  async function save() {
    if (!draft) return;
    setSaveState("saving");
    try {
      if (kind === "principles" && !isMarkdownDocument(draft)) await api.savePrinciple(draft);
      else if (kind === "patterns" && isMarkdownDocument(draft)) await api.savePattern(draft);
      else throw new Error("Document type does not match its collection.");
      await reload(); setSaveState("saved"); void navigate(`/${kind}/${draft.id}`);
    } catch { setSaveState("error"); }
  }
  async function remove() {
    if (!draft || !window.confirm(`Delete “${draft.title}” from Monet’s canonical files?`)) return;
    if (kind === "principles") await api.deletePrinciple(draft.id); else await api.deletePattern(draft.id);
    await reload(); void navigate(`/${kind}`);
  }
  function startNew() {
    setNewTitle("");
    setNaming(true);
  }
  function createNew() {
    const title = newTitle.trim();
    if (!title) return;
    const newId = uniqueSlug(title, documents.map((document) => document.id));
    if (!newId) return;
    setDraft(kind === "principles"
      ? { id: newId, title, body: `# ${title}\n\n`, order: documents.length, updated_at: "" }
      : { id: newId, title, summary: "", body: `# ${title}\n\n`, status: "undecided", tags: [], order: documents.length, updated_at: "", components: [], foundations: [] });
    setCreating(true);
    setNaming(false);
  }

  return <div className="page"><PageHeader eyebrow={kind === "principles" ? "Design intent" : "Multi-component guidance"} title={kind === "principles" ? "Principles" : "Patterns"} description={kind === "principles" ? "Human-written beliefs that guide every visual and interaction choice." : "Reusable guidance for workflows that combine components and foundations."} action={<div className="button-row"><button className="button primary" onClick={startNew}>New {singular.toLowerCase()}</button><button className="button ghost" onClick={() => setImportOpen(true)}>Import JSON</button></div>} />
    <div className="workspace-layout"><aside className="collection-rail">{documents.map((item) => <Link key={item.id} className={item.id === id ? "active" : ""} to={`/${kind}/${item.id}`}><span><b>{item.title}</b>{isMarkdownDocument(item) && <small>{item.summary}</small>}</span>{isMarkdownDocument(item) && <StatusPill value={item.status} />}</Link>)}</aside>
      <section className="editor-panel">{!draft && !creating ? documents.length === 0 ? <div className="blank-editor">{kind === "principles"
        ? <><span className="eyebrow">No principles yet</span><h2>Start with what you believe.</h2><p>Principles are the few sentences that settle the close calls — why you prefer a familiar pattern, when you let a screen get denser. They are short, human-written, and they ship with every answer Monet gives a coding agent.</p><button className="button primary" onClick={startNew}>Write the first principle</button></>
        : <><span className="eyebrow">No patterns yet</span><h2>Write down the workflows, not just the parts.</h2><p>A pattern is guidance for something built out of several components at once — a form, an empty state, a destructive confirmation. Add one when the components alone stop being enough to answer how a screen should behave.</p><button className="button primary" onClick={startNew}>Write the first pattern</button></>}</div>
        : <div className="blank-editor"><span className="eyebrow">Select a {singular.toLowerCase()}</span><h2>Open a document to refine it.</h2><p>These records remain readable Markdown files outside Monet.</p></div> : draft && <>
        <div className="editor-toolbar"><span className="file-label">{kind}/{draft.id}.md</span><div><SaveNotice state={saveState} /><AiDecisionActions kind={singular} value={draft} context={isMarkdownDocument(draft) ? `${draft.title}: ${draft.summary}` : draft.title} onImport={(value) => { setDraft(value); setSaveState("idle"); }} /><button className="button ghost danger-text" onClick={() => void remove()}>Delete</button><button className="button primary" onClick={() => void save()}>Save</button></div></div>
        <div className="form-grid two"><label>Title<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label><label>Order<input type="number" value={draft.order} onChange={(event) => setDraft({ ...draft, order: Number(event.target.value) })} /></label>{kind === "patterns" && isMarkdownDocument(draft) && <><StatusSelect value={draft.status} onChange={(value) => setDraft({ ...draft, status: value })} /><label className="span-two">Summary<input value={draft.summary} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} /></label><label>Tags<StringListInput value={draft.tags} onChange={(tags) => setDraft({ ...draft, tags })} placeholder="clarity, layout" /></label><label>Components<StringListInput value={draft.components ?? []} onChange={(components) => setDraft({ ...draft, components })} placeholder="button, dialog" /></label><label>Foundations<StringListInput value={draft.foundations ?? []} onChange={(foundations) => setDraft({ ...draft, foundations })} placeholder="color, spacing" /></label></>}</div>
        <div className="split-editor"><label><span>Markdown</span><textarea value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} /></label><div><span>Preview</span><MarkdownPreview source={draft.body} /></div></div>
      </>}</section></div>
    {naming && <div className="json-import-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setNaming(false); }}><section className="json-import-dialog compact-dialog" role="dialog" aria-modal="true" aria-labelledby={`new-${kind}-title`}><header><div><span className="eyebrow">New document</span><h2 id={`new-${kind}-title`}>Name the new {singular.toLowerCase()}</h2></div><button className="dialog-close" aria-label={`Close new ${singular.toLowerCase()} dialog`} onClick={() => setNaming(false)}>×</button></header><p>Monet creates a unique file ID, even when another {singular.toLowerCase()} has the same title.</p><label className="dialog-field">Title<input autoFocus value={newTitle} onChange={(event) => setNewTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") createNew(); }} /></label><footer><button className="button ghost" onClick={() => setNaming(false)}>Cancel</button><button className="button primary" disabled={!newTitle.trim()} onClick={createNew}>Create draft</button></footer></section></div>}
    {importOpen && <JsonImportDialog<Principle | MarkdownDocument> title={`Import ${singular} JSON`} description={`Paste or choose one complete ${singular.toLowerCase()} JSON object. Monet assigns a unique id when necessary and opens it as an unsaved draft.`} dialogId={`document-import-${kind}`} onClose={() => setImportOpen(false)} onImport={(value) => { loadedId.current = undefined; setDraft(value); setCreating(true); setSaveState("idle"); setImportOpen(false); }} parse={(value) => kind === "principles" ? parsePrincipleImport(value, documents.map((document) => document.id)) : parsePatternImport(value, documents.map((document) => document.id))} primaryLabel="Open as draft" />}
  </div>;
}

export function PrinciplesPage() { return <DocumentWorkspace kind="principles" />; }
export function PatternsPage() { return <DocumentWorkspace kind="patterns" />; }
