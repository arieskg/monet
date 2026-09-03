import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { AiDecisionActions } from "../components/AiDecisionActions";
import { JsonImportDialog } from "../components/JsonImportDialog";
import { PageHeader, SaveNotice, StatusSelect } from "../components/Common";
import { PrimitiveTaxonomyManager } from "../components/PrimitiveTaxonomyManager";
import { primitiveEntries, type PrimitiveDecision } from "../domain";
import { useWorkspace } from "../WorkspaceContext";

function emptyPrimitive(id: string, purpose: string): PrimitiveDecision { return { id, status: "undecided", purpose, preferences: {}, tokens: [], inspiration: null, notes: "", updated_at: "" }; }

function parsePreferenceImport(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Preferences must be a JSON object with string values.");
  const entries = Object.entries(value as Record<string, unknown>);
  if (!entries.length || entries.some(([key, item]) => !key.trim() || typeof item !== "string")) throw new Error("Preferences must be a non-empty object with string values.");
  const preferences: Record<string, string> = {};
  for (const [key, item] of entries) preferences[key.trim()] = (item as string).trim();
  return preferences;
}

function parseTokenRelationsImport(value: unknown): string[] {
  let source: unknown[] | null = null;
  if (Array.isArray(value)) source = value;
  else if (value && typeof value === "object" && Array.isArray((value as Record<string, unknown>).tokens)) source = (value as Record<string, unknown>).tokens as unknown[];
  if (!source || !source.length) throw new Error("Import a JSON array of token names, or an object with a tokens array.");
  const names = source.map((item) => typeof item === "string" ? item.trim() : "");
  if (names.some((name) => !name)) throw new Error("Every imported token name must be a non-empty string.");
  return [...new Set(names)];
}

export function PrimitivesPage() {
  const { workspace, reload } = useWorkspace();
  const { id } = useParams();
  const entries = workspace ? primitiveEntries(workspace) : [];
  const entry = entries.find((item) => item.id === id);
  const stored = workspace?.primitives.find((item) => item.id === id);
  const [draft, setDraft] = useState<PrimitiveDecision | null>(null);
  const [tokenToAdd, setTokenToAdd] = useState("");
  const [tokenImportOpen, setTokenImportOpen] = useState(false);
  const [preferenceImportOpen, setPreferenceImportOpen] = useState(false);
  const [managingTaxonomy, setManagingTaxonomy] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const loadedId = useRef<string | undefined>(undefined);
  useEffect(() => { if (loadedId.current !== entry?.id) { loadedId.current = entry?.id; setDraft(entry ? structuredClone(stored ?? emptyPrimitive(entry.id, entry.description)) : null); setSaveState("idle"); setTokenToAdd(""); } }, [entry, stored]);
  const usedBy = useMemo(() => workspace?.components.filter((component) => component.primitives.includes(id ?? "")) ?? [], [workspace, id]);
  const componentNames = useMemo(() => new Map(workspace?.taxonomy.flatMap((category) => category.entries).map((item) => [item.id, item.name]) ?? []), [workspace]);
  const inspirations = useMemo(() => workspace?.sources.flatMap((source) => source.mappings.filter((mapping) => mapping.target_type === "primitive" && mapping.canonical_id === id && (mapping.status === "mapped" || mapping.status === "needs_review")).sort((a, b) => Number(Boolean(b.primary)) - Number(Boolean(a.primary))).map((mapping) => ({ source, item: mapping.upstream }))) ?? [], [workspace, id]);
  async function save() { if (!draft) return; setSaveState("saving"); try { await api.savePrimitive(draft); await reload(); setSaveState("saved"); } catch { setSaveState("error"); } }
  function updatePreference(key: string, nextKey: string, value: string) { if (!draft) return; const preferences = Object.fromEntries(Object.entries(draft.preferences).flatMap(([name, current]) => name === key ? (nextKey ? [[nextKey, value]] : []) : [[name, current]])); setDraft({ ...draft, preferences }); }
  function addToken() { if (!draft || !tokenToAdd || draft.tokens.includes(tokenToAdd)) return; setDraft({ ...draft, tokens: [...draft.tokens, tokenToAdd] }); setTokenToAdd(""); }
  if (!workspace) return null;
  return <div className="page components-page"><PageHeader eyebrow="Low-level building blocks" title="Primitives" description="Composition, interaction, visual, and accessibility conventions that turn tokens into reliable components." action={<button className="button ghost" onClick={() => setManagingTaxonomy(!managingTaxonomy)}>{managingTaxonomy ? "Close taxonomy" : "Manage taxonomy"}</button>} />
    {managingTaxonomy ? <PrimitiveTaxonomyManager taxonomy={workspace.primitiveTaxonomy} reload={reload} onClose={() => setManagingTaxonomy(false)} /> : <div className="component-workspace"><aside className="taxonomy-rail">{workspace.primitiveTaxonomy.map((category) => <details key={category.id} open={category.entries.some((item) => item.id === id) || category.id === "layout"}><summary>{category.name}<span>{category.entries.length}</span></summary>{category.entries.map((item) => <Link key={item.id} className={`${item.id === id ? "active" : ""} ${item.deprecated ? "deprecated" : ""}`} to={`/primitives/${item.id}`}><span>{item.name}</span><i className={`mini-status ${workspace.primitives.find((decision) => decision.id === item.id)?.status ?? "undecided"}`} /></Link>)}</details>)}</aside>
      <section className="component-detail">{!entry || !draft ? <div className="component-index"><span className="eyebrow">{entries.length} canonical primitives</span><h2>Choose a primitive to define its contract.</h2><p>Primitives provide shared composition and behavior without becoming a user-facing component library.</p><div className="hierarchy-strip"><span>Tokens</span><i>→</i><strong>Primitives</strong><i>→</i><span>Components</span></div></div> : <>
        <div className="component-title"><div><span className="eyebrow">{workspace.primitiveTaxonomy.find((category) => category.id === entry.category)?.name} primitive</span><h2>{entry.name}</h2><p>{entry.description}</p><div className="alias-row">{entry.aliases.map((alias) => <span key={alias}>{alias}</span>)}</div></div><div><StatusSelect value={draft.status} onChange={(value) => setDraft({ ...draft, status: value })} /><SaveNotice state={saveState} /><AiDecisionActions kind="Primitive" value={draft} context={`${entry.name}: ${entry.description}. Aliases: ${entry.aliases.join(", ") || "none"}.`} onImport={(value) => { setDraft(value); setSaveState("idle"); }} /><button className="button primary" onClick={() => void save()}>Save primitive</button></div></div>
        <section className="primitive-purpose"><span className="eyebrow">Purpose</span><textarea value={draft.purpose} onChange={(event) => setDraft({ ...draft, purpose: event.target.value })} /></section>
        <div className="primitive-detail-grid"><section><div className="section-heading row"><div><span className="eyebrow">Implementation intent</span><h3>Preferences</h3></div><div className="button-row"><button className="button ghost" onClick={() => setDraft({ ...draft, preferences: { ...draft.preferences, [`preference-${Object.keys(draft.preferences).length + 1}`]: "" } })}>Add preference</button><button className="button ghost" onClick={() => setPreferenceImportOpen(true)}>Import JSON</button></div></div>{Object.entries(draft.preferences).map(([key, value]) => <div className="token-row" key={key}><input value={key} onChange={(event) => updatePreference(key, event.target.value, value)} /><input value={value} onChange={(event) => updatePreference(key, key, event.target.value)} /><button onClick={() => updatePreference(key, "", value)}>×</button></div>)}<label className="notes-field">Notes<textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label></section>
          <aside><div className="primitive-side-section"><span className="eyebrow">Uses tokens</span><div className="relation-chips">{draft.tokens.map((token) => <span key={token}><Link to={`/tokens?token=${encodeURIComponent(token)}`}>{token}</Link><button aria-label={`Remove ${token}`} onClick={() => setDraft({ ...draft, tokens: draft.tokens.filter((item) => item !== token) })}>×</button></span>)}</div><div className="relation-add"><select aria-label="Token to add" value={tokenToAdd} onChange={(event) => setTokenToAdd(event.target.value)}><option value="">Choose token…</option>{workspace.resolvedTokens.filter((token) => !draft.tokens.includes(token.name)).map((token) => <option key={token.id} value={token.name}>{token.name}</option>)}</select><button className="button ghost" onClick={addToken}>Add</button><button className="button ghost" onClick={() => setTokenImportOpen(true)}>Import JSON</button></div></div>
            <div className="primitive-side-section"><span className="eyebrow">Used by components</span>{usedBy.length ? <div className="used-by-list">{usedBy.map((component) => <Link key={component.id} to={`/components/${component.id}`}>{componentNames.get(component.id) ?? component.id}<i>→</i></Link>)}</div> : <p className="muted-copy">No component references this primitive yet.</p>}</div>
            <div className="primitive-side-section"><span className="eyebrow">Source inspirations</span>{inspirations.length ? inspirations.map(({ source, item }) => <button className={`inspiration-row ${draft.inspiration?.source === source.id && draft.inspiration.source_item === item ? "selected" : ""}`} key={`${source.id}-${item}`} onClick={() => setDraft({ ...draft, status: "selected", inspiration: { source: source.id, source_item: item } })}><span><b>{source.name}</b><small>{item}</small></span><i>{draft.inspiration?.source === source.id && draft.inspiration.source_item === item ? "Selected" : "Use"}</i></button>) : <p className="muted-copy">Add primitive mappings in Sources to compare naming and inspiration.</p>}</div>
          </aside></div>
      </>}</section></div>}
    {tokenImportOpen && draft && <JsonImportDialog title="Import token relationships" description="Paste or choose a JSON array of token names, or an object with a tokens array. Imported names are added to this primitive draft." dialogId={`primitive-token-import-${draft.id}`} onClose={() => setTokenImportOpen(false)} onImport={(tokens) => { setDraft({ ...draft, tokens: [...new Set([...draft.tokens, ...tokens])] }); setTokenImportOpen(false); }} parse={parseTokenRelationsImport} primaryLabel="Add to draft" />}
    {preferenceImportOpen && draft && <JsonImportDialog title="Import preferences JSON" description="Paste or choose a JSON object whose values are strings. Imported preferences are merged into this primitive draft." dialogId={`primitive-preference-import-${draft.id}`} onClose={() => setPreferenceImportOpen(false)} onImport={(preferences) => { setDraft({ ...draft, preferences: { ...draft.preferences, ...preferences } }); setPreferenceImportOpen(false); setSaveState("idle"); }} parse={parsePreferenceImport} primaryLabel="Add to draft" />}
  </div>;
}
