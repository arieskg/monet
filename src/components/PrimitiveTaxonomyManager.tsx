import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { slugify, type TaxonomyCategory, type TaxonomyEntry } from "../domain";
import { SaveNotice } from "./Common";
import { JsonImportDialog } from "./JsonImportDialog";
import { StringListInput } from "./StringListInput";

function parsePrimitiveImport(value: unknown, categories: TaxonomyCategory[]): TaxonomyEntry[] {
  const records = Array.isArray(value) ? value : [value];
  if (!records.length) throw new Error("Import at least one primitive object.");
  const existing = new Set(categories.flatMap((category) => category.entries.map((entry) => entry.id)));
  return records.map((record) => {
    if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error("Each primitive must be a JSON object.");
    const candidate = record as Record<string, unknown>;
    const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
    if (!name) throw new Error("Every primitive needs a name.");
    const id = typeof candidate.id === "string" && candidate.id.trim() ? slugify(candidate.id) : slugify(name);
    if (!id || existing.has(id)) throw new Error(`The primitive id “${id || name}” already exists or is invalid.`);
    const category = typeof candidate.category === "string" && categories.some((item) => item.id === candidate.category) ? candidate.category : categories[0]?.id;
    if (!category) throw new Error("The primitive needs a valid category.");
    existing.add(id);
    return { id, name, category, description: typeof candidate.description === "string" ? candidate.description : "", aliases: Array.isArray(candidate.aliases) ? candidate.aliases.filter((item): item is string => typeof item === "string") : [], relationships: Array.isArray(candidate.relationships) ? candidate.relationships.filter((item): item is string => typeof item === "string") : [], deprecated: Boolean(candidate.deprecated) };
  });
}

export function PrimitiveTaxonomyManager({ taxonomy, onClose, reload }: { taxonomy: TaxonomyCategory[]; onClose: () => void; reload: () => Promise<void> }) {
  const navigate = useNavigate();
  const [draft, setDraft] = useState(() => structuredClone(taxonomy));
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState(taxonomy[0]?.id ?? "");
  const [importOpen, setImportOpen] = useState(false);
  const [mergeTargets, setMergeTargets] = useState<Record<string, string>>({});
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const entries = draft.flatMap((category) => category.entries);

  function updateEntry(id: string, update: (entry: TaxonomyCategory["entries"][number]) => TaxonomyCategory["entries"][number]) {
    setDraft(draft.map((category) => ({ ...category, entries: category.entries.map((entry) => entry.id === id ? update(entry) : entry) })));
    setSaveState("idle");
  }

  function moveEntry(id: string, categoryId: string) {
    const entry = entries.find((item) => item.id === id);
    if (!entry || entry.category === categoryId) return;
    setDraft(draft.map((category) => ({
      ...category,
      entries: category.id === categoryId
        ? [...category.entries, { ...entry, category: categoryId }]
        : category.entries.filter((item) => item.id !== id),
    })));
    setSaveState("idle");
  }

  function addPrimitive() {
    const id = slugify(newName);
    if (!id || !newCategory || entries.some((entry) => entry.id === id)) return;
    setDraft(draft.map((category) => category.id === newCategory ? { ...category, entries: [...category.entries, { id, name: newName.trim(), category: newCategory, description: "", aliases: [], relationships: [], deprecated: false }] } : category));
    setNewName("");
    setSaveState("idle");
  }

  async function save() {
    setSaveState("saving");
    try { await api.savePrimitiveTaxonomy(draft); await reload(); setSaveState("saved"); }
    catch { setSaveState("error"); }
  }

  async function merge(source: string) {
    const target = mergeTargets[source];
    if (!target || !window.confirm(`Merge ${source} into ${target}? Existing component and source references will be rewired.`)) return;
    setSaveState("saving");
    try { await api.mergePrimitive(source, target); await reload(); await navigate(`/primitives/${target}`); onClose(); }
    catch { setSaveState("error"); }
  }

  return <section className="primitive-taxonomy-manager">
    <div className="section-heading row"><div><span className="eyebrow">Canonical vocabulary</span><h2>Manage primitive taxonomy</h2><p>IDs remain stable when names or categories change. Merge rewires existing references into the target primitive.</p></div><div className="manager-actions"><SaveNotice state={saveState} /><button className="button ghost" onClick={onClose}>Done</button><button className="button primary" onClick={() => void save()}>Save taxonomy</button></div></div>
    <div className="taxonomy-add-row"><input aria-label="New primitive name" placeholder="New primitive name" value={newName} onChange={(event) => setNewName(event.target.value)} /><select aria-label="New primitive category" value={newCategory} onChange={(event) => setNewCategory(event.target.value)}>{draft.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select><button className="button ghost" onClick={addPrimitive}>Add primitive</button><button className="button ghost" onClick={() => setImportOpen(true)}>Import JSON</button></div>
    <div className="taxonomy-manager-list">{draft.flatMap((category) => category.entries.map((entry) => <article key={entry.id} className={entry.deprecated ? "deprecated" : ""}>
      <div className="taxonomy-manager-main"><span className="eyebrow">{entry.id}</span><input aria-label={`${entry.id} name`} value={entry.name} onChange={(event) => updateEntry(entry.id, (item) => ({ ...item, name: event.target.value }))} /><select aria-label={`${entry.id} category`} value={entry.category} onChange={(event) => moveEntry(entry.id, event.target.value)}>{draft.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select><label><input type="checkbox" checked={Boolean(entry.deprecated)} onChange={(event) => updateEntry(entry.id, (item) => ({ ...item, deprecated: event.target.checked }))} /> Deprecated</label></div>
      <textarea aria-label={`${entry.id} description`} placeholder="Primitive description" value={entry.description} onChange={(event) => updateEntry(entry.id, (item) => ({ ...item, description: event.target.value }))} />
      <div className="taxonomy-manager-meta"><StringListInput aria-label={`${entry.id} aliases`} placeholder="Aliases, comma separated" value={entry.aliases} onChange={(aliases) => updateEntry(entry.id, (item) => ({ ...item, aliases }))} /><select aria-label={`${entry.id} merge target`} value={mergeTargets[entry.id] ?? ""} onChange={(event) => setMergeTargets({ ...mergeTargets, [entry.id]: event.target.value })}><option value="">Merge into…</option>{entries.filter((item) => item.id !== entry.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button className="button danger-text" disabled={!mergeTargets[entry.id]} onClick={() => void merge(entry.id)}>Merge</button></div>
    </article>))}</div>
    {importOpen && <JsonImportDialog<TaxonomyEntry[]> title="Import primitive JSON" description="Paste or choose one primitive object or an array of primitive objects. Imported primitives are added to the selected taxonomy category as an unsaved taxonomy draft." dialogId="primitive-import" onClose={() => setImportOpen(false)} onImport={(entries) => { setDraft(draft.map((category) => ({ ...category, entries: [...category.entries, ...entries.filter((entry) => entry.category === category.id)] }))); setImportOpen(false); setSaveState("idle"); }} parse={(value) => parsePrimitiveImport(value, draft)} primaryLabel="Add to draft" />}
  </section>;
}
