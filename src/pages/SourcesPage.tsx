import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { AiDecisionActions } from "../components/AiDecisionActions";
import { SaveNotice } from "../components/Common";
import { JsonImportDialog } from "../components/JsonImportDialog";
import { SourcesHeader, SourceViewTabs } from "../components/SourceViews";
import { OptionalAiNotice } from "../components/OptionalAiNotice";
import { primitiveEntries, slugify, taxonomyEntries, type MappingConfidence, type MappingMatchType, type MappingStatus, type Source, type SourceMapping } from "../domain";
import { useWorkspace } from "../WorkspaceContext";

const mappingStatuses: MappingStatus[] = ["mapped", "needs_review", "unmapped", "ignored", "no_equivalent"];
const matchTypes: MappingMatchType[] = ["exact", "equivalent", "variant", "composition", "related"];
const mappingConfidences: MappingConfidence[] = ["high", "medium", "low", "none"];
const sourceTypes: Source["type"][] = ["npm", "github", "registry", "manual", "reference"];

function parseSourceImport(value: unknown, existingIds: string[]): Source {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("A source must be one JSON object.");
  const candidate = value as Record<string, unknown>;
  const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
  if (!name) throw new Error("A source needs a name.");
  const id = slugify(typeof candidate.id === "string" && candidate.id.trim() ? candidate.id : name);
  if (!id) throw new Error("The source needs a usable id or name.");
  if (existingIds.includes(id)) throw new Error(`The source id “${id}” already exists.`);
  const mappings = Array.isArray(candidate.mappings) ? candidate.mappings.map((mapping) => parseMappingImport(mapping)).filter(Boolean) as SourceMapping[] : [];
  return { id, name, type: sourceTypes.includes(candidate.type as Source["type"]) ? candidate.type as Source["type"] : "reference", homepage: typeof candidate.homepage === "string" ? candidate.homepage : "", repository: typeof candidate.repository === "string" ? candidate.repository : "", framework: typeof candidate.framework === "string" ? candidate.framework : "", package: typeof candidate.package === "string" ? candidate.package : "", license: typeof candidate.license === "string" ? candidate.license : "", notes: typeof candidate.notes === "string" ? candidate.notes : "", enabled: typeof candidate.enabled === "boolean" ? candidate.enabled : true, mappings, updated_at: "" };
}

function parseMappingImport(value: unknown): SourceMapping | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Each mapping must be a JSON object.");
  const candidate = value as Record<string, unknown>;
  const upstream = typeof candidate.upstream === "string" ? candidate.upstream.trim() : "";
  if (!upstream) throw new Error("Every mapping needs an upstream name.");
  const targetType = candidate.target_type === "primitive" ? "primitive" : "component";
  const status = mappingStatuses.includes(candidate.status as MappingStatus) ? candidate.status as MappingStatus : "unmapped";
  const confidence = mappingConfidences.includes(candidate.confidence as MappingConfidence) ? candidate.confidence as MappingConfidence : "none";
  const matchType = matchTypes.includes(candidate.match_type as MappingMatchType) ? candidate.match_type as MappingMatchType : "equivalent";
  const strings = (input: unknown): string[] => Array.isArray(input) ? input.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean) : [];
  return { upstream, target_type: targetType, canonical_id: typeof candidate.canonical_id === "string" && candidate.canonical_id ? candidate.canonical_id : null, status, confidence, match_type: matchType, primary: Boolean(candidate.primary), aliases: strings(candidate.aliases), documentation: typeof candidate.documentation === "string" ? candidate.documentation : undefined, description: typeof candidate.description === "string" ? candidate.description : undefined, category: typeof candidate.category === "string" ? candidate.category : undefined, props_api: strings(candidate.props_api), usage_examples: strings(candidate.usage_examples), rationale: typeof candidate.rationale === "string" ? candidate.rationale : undefined, mapped_by: candidate.mapped_by === "ai" ? "ai" : "manual" };
}

function parseMappingListImport(value: unknown): SourceMapping[] {
  const records = Array.isArray(value) ? value : [value];
  if (!records.length) throw new Error("Import at least one mapping object.");
  return records.map(parseMappingImport).filter((mapping): mapping is SourceMapping => Boolean(mapping));
}

export function SourcesPage() {
  const { workspace, reload } = useWorkspace();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const selected = workspace?.sources.find((item) => item.id === id);
  const entries = workspace ? taxonomyEntries(workspace) : [];
  const primitives = workspace ? primitiveEntries(workspace) : [];
  const [draft, setDraft] = useState<Source | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [refreshState, setRefreshState] = useState<"idle" | "running" | "success" | "error">("idle");
  const [refreshSummary, setRefreshSummary] = useState("");
  const [sourceImportOpen, setSourceImportOpen] = useState(false);
  const [mappingImportOpen, setMappingImportOpen] = useState(false);
  const loadedId = useRef<string | undefined>(undefined);
  const isNew = Boolean(draft && !workspace?.sources.some((source) => source.id === draft.id));
  const draftId = draft?.id;
  const requestedMapping = searchParams.get("mapping");
  const focusedMappingIndex = requestedMapping !== null && /^\d+$/.test(requestedMapping) ? Number(requestedMapping) : null;

  useEffect(() => {
    if (loadedId.current === selected?.id) return;
    loadedId.current = selected?.id;
    setDraft(selected ? structuredClone(selected) : null);
    setSaveState("idle");
    setRefreshState("idle");
    setRefreshSummary("");
  }, [selected]);

  useEffect(() => {
    if (!draftId || focusedMappingIndex === null) return;
    const mappingRow = document.getElementById(`source-mapping-${focusedMappingIndex}`);
    mappingRow?.scrollIntoView({ block: "center" });
    mappingRow?.focus({ preventScroll: true });
  }, [draftId, focusedMappingIndex]);

  function startNew() {
    const name = window.prompt("Name the source:");
    if (!name) return;
    const sourceId = slugify(name);
    loadedId.current = undefined;
    setDraft({ id: sourceId, name, type: "reference", homepage: "", repository: "", framework: "", package: "", license: "", notes: "", enabled: true, mappings: [], updated_at: "" });
  }

  function updateMapping(index: number, update: (mapping: SourceMapping) => SourceMapping) {
    if (!draft) return;
    setDraft({ ...draft, mappings: draft.mappings.map((mapping, mappingIndex) => mappingIndex === index ? update(mapping) : mapping) });
    setSaveState("idle");
  }

  function setPrimary(index: number, checked: boolean) {
    if (!draft) return;
    const upstream = draft.mappings[index]?.upstream.trim().toLocaleLowerCase();
    setDraft({ ...draft, mappings: draft.mappings.map((mapping, mappingIndex) => ({
      ...mapping,
      primary: mappingIndex === index ? checked : checked && mapping.upstream.trim().toLocaleLowerCase() === upstream ? false : mapping.primary,
      mapped_by: mappingIndex === index ? "manual" : mapping.mapped_by,
    })) });
    setSaveState("idle");
  }

  async function save() {
    if (!draft) return;
    if (isNew) { await refreshMappings(); return; }
    setSaveState("saving");
    try {
      await api.saveSource(draft);
      await reload();
      void navigate(`/sources/${draft.id}`);
      setSaveState("saved");
    } catch { setSaveState("error"); }
  }

  async function refreshMappings() {
    if (!draft) return;
    setRefreshState("running");
    setRefreshSummary("");
    setSaveState("saving");
    try {
      await api.saveSource(draft);
      const result = await api.refreshSource(draft.id);
      loadedId.current = result.source.id;
      setDraft(result.source);
      await reload();
      void navigate(`/sources/${result.source.id}`);
      setSaveState("saved");
      setRefreshState("success");
      setRefreshSummary(`${result.discovered} discovered · ${result.mapped} mapped · ${result.needs_review} in review queue · ${result.unmapped} unmapped`);
    } catch (error) {
      setSaveState("error");
      setRefreshState("error");
      // Source mapping is optional, so the reason it did not run matters more than the fact.
      // Without this the "no provider configured" message never reached the person who needs it.
      const reason = error instanceof Error && error.message ? error.message : "AI refresh failed.";
      setRefreshSummary(`${reason} Existing mappings were not replaced.`);
    }
  }

  async function remove() {
    if (!draft) return;
    if (isNew) { loadedId.current = undefined; setDraft(null); void navigate("/sources"); return; }
    if (!window.confirm(`Delete “${draft.name}” and remove its component and primitive references?`)) return;
    setSaveState("saving");
    try {
      await api.deleteSource(draft.id);
      await reload();
      loadedId.current = undefined;
      setDraft(null);
      void navigate("/sources");
    } catch { setSaveState("error"); }
  }

  return <div className="page">
    <SourcesHeader action={<div className="button-row"><button className="button primary" onClick={startNew}>Add source</button><button className="button ghost" onClick={() => setSourceImportOpen(true)}>Import JSON</button></div>} />
    <SourceViewTabs />
    <div className="workspace-layout" id="sources-panel" role="tabpanel" aria-labelledby="sources-tab">
      <aside className="collection-rail source-rail">{workspace?.sources.map((item) => <Link key={item.id} className={item.id === id ? "active" : ""} to={`/sources/${item.id}`}><span><b>{item.name}</b><small>{item.framework || item.type}</small></span><i className={item.enabled ? "enabled-pip" : "disabled-pip"} /></Link>)}</aside>
      <section className="editor-panel">{!draft ? <div className="blank-editor"><span className="eyebrow">Reference registry</span><h2>Choose a source to inspect its mappings.</h2><p>Sources describe inspiration and vocabulary. They do not imply a project dependency.</p></div> : <>
        <div className="editor-toolbar"><span className="file-label">sources/registry.json · {draft.id}</span><div><SaveNotice state={saveState} /><AiDecisionActions kind="Source" value={draft} context={`${draft.name}: ${draft.notes}`} onImport={(value) => { setDraft(value); setSaveState("idle"); }} /><button className={`button ghost ${isNew ? "" : "danger-text"}`} onClick={() => void remove()}>{isNew ? "Cancel" : "Delete"}</button><button className="button ghost" disabled={refreshState === "running"} onClick={() => void refreshMappings()} title="Optional. Discovers the upstream inventory with a configured AI provider.">{refreshState === "running" ? "Mapping…" : "AI refresh & map"}</button><button className="button primary" disabled={refreshState === "running"} onClick={() => void save()}>Save source</button></div></div>
        <div className="source-heading"><div><span className="eyebrow">{draft.type}</span><h2>{draft.name}</h2><p>{draft.notes}</p></div><label className="toggle-field"><input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} /><span>Enabled</span></label></div>
        <div className="form-grid two"><label>Name<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label>Type<select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as Source["type"] })}>{["npm", "github", "registry", "manual", "reference"].map((value) => <option key={value}>{value}</option>)}</select></label><label>Homepage<input value={draft.homepage} onChange={(event) => setDraft({ ...draft, homepage: event.target.value })} /></label><label>Repository<input value={draft.repository} onChange={(event) => setDraft({ ...draft, repository: event.target.value })} /></label><label>Framework<input value={draft.framework} onChange={(event) => setDraft({ ...draft, framework: event.target.value })} /></label><label>Package<input value={draft.package} onChange={(event) => setDraft({ ...draft, package: event.target.value })} /></label><label>License<input value={draft.license} onChange={(event) => setDraft({ ...draft, license: event.target.value })} /></label><label className="span-two">Notes<textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label></div>
        <div className="mapping-editor">
          <OptionalAiNotice feature="Source inventory mapping" />
          <div className="section-heading row"><div><span className="eyebrow">Taxonomy bridge</span><h3>Component and primitive mappings</h3><p>Which upstream names correspond to which Monet concepts. Add and edit them by hand, or let the optional AI refresh discover the upstream inventory and flag its weak matches for review.</p>{refreshSummary && <p className={`mapping-refresh-result ${refreshState}`}>{refreshSummary}</p>}</div><div className="button-row"><button className="button ghost" onClick={() => setDraft({ ...draft, mappings: [...draft.mappings, { upstream: "", target_type: "component", canonical_id: null, status: "unmapped", confidence: "none", primary: false, mapped_by: "manual" }] })}>Add mapping</button><button className="button ghost" onClick={() => setMappingImportOpen(true)}>Import JSON</button></div></div>
          <div className="mapping-head expanded"><span>Upstream name</span><span>Kind</span><span>Monet concept</span><span>Match</span><span>Status</span><span>Best</span><span /></div>
          {draft.mappings.map((mapping, index) => <div id={`source-mapping-${index}`} className={`mapping-row expanded ${focusedMappingIndex === index ? "focused-mapping" : ""}`} key={`${mapping.upstream}-${mapping.canonical_id ?? "none"}-${index}`} title={mapping.rationale || mapping.description} tabIndex={focusedMappingIndex === index ? -1 : undefined}>
            <input value={mapping.upstream} onChange={(event) => updateMapping(index, (item) => ({ ...item, upstream: event.target.value, mapped_by: "manual" }))} />
            <select aria-label={`${mapping.upstream || "Mapping"} kind`} value={mapping.target_type} onChange={(event) => updateMapping(index, (item) => ({ ...item, target_type: event.target.value as "component" | "primitive", canonical_id: null, status: "unmapped", confidence: "none", primary: false }))}><option value="component">Component</option><option value="primitive">Primitive</option></select>
            <select value={mapping.canonical_id ?? ""} onChange={(event) => updateMapping(index, (item) => ({ ...item, canonical_id: event.target.value || null, status: event.target.value ? "mapped" : "unmapped", confidence: event.target.value ? item.confidence === "none" ? "medium" : item.confidence : "none", primary: event.target.value ? item.primary : false, mapped_by: "manual" }))}><option value="">Unmapped</option>{(mapping.target_type === "primitive" ? primitives : entries).map((entry) => <option value={entry.id} key={entry.id}>{entry.name}</option>)}</select>
            <div className="mapping-signal"><select aria-label={`${mapping.upstream || "Mapping"} match type`} value={mapping.match_type ?? "equivalent"} onChange={(event) => updateMapping(index, (item) => ({ ...item, match_type: event.target.value as MappingMatchType, mapped_by: "manual" }))}>{matchTypes.map((value) => <option value={value} key={value}>{value}</option>)}</select><small>{mapping.confidence ?? "—"}</small></div>
            <select value={mapping.status} onChange={(event) => updateMapping(index, (item) => { const status = event.target.value as MappingStatus; const withoutTarget = status === "unmapped" || status === "ignored" || status === "no_equivalent"; return { ...item, status, canonical_id: withoutTarget ? null : item.canonical_id, confidence: withoutTarget ? "none" : item.confidence, primary: withoutTarget ? false : item.primary, mapped_by: "manual" }; })}>{mappingStatuses.map((value) => <option value={value} key={value}>{value === "needs_review" ? "review queue" : value.replaceAll("_", " ")}</option>)}</select>
            <input className="mapping-primary" type="checkbox" aria-label={`${mapping.upstream || "Mapping"} is primary`} disabled={!mapping.canonical_id} checked={Boolean(mapping.primary)} onChange={(event) => setPrimary(index, event.target.checked)} />
            <button aria-label={`Remove ${mapping.upstream || "mapping"}`} onClick={() => setDraft({ ...draft, mappings: draft.mappings.filter((_, itemIndex) => itemIndex !== index) })}>×</button>
          </div>)}
        </div>
      </>}</section>
    </div>
    {sourceImportOpen && <JsonImportDialog<Source> title="Import source JSON" description="Paste or choose one complete source JSON object. Monet normalizes missing optional fields and opens it as an unsaved source draft." dialogId="source-import" onClose={() => setSourceImportOpen(false)} onImport={(source) => { loadedId.current = undefined; setDraft(source); setSaveState("idle"); setRefreshState("idle"); setRefreshSummary(""); setSourceImportOpen(false); }} parse={(value) => parseSourceImport(value, workspace?.sources.map((source) => source.id) ?? [])} primaryLabel="Open as draft" />}
    {mappingImportOpen && draft && <JsonImportDialog title="Import mapping JSON" description="Paste or choose one mapping object or an array of mappings. Imported mappings are appended to this source draft." dialogId={`mapping-import-${draft.id}`} onClose={() => setMappingImportOpen(false)} onImport={(mappings) => { setDraft({ ...draft, mappings: [...draft.mappings, ...mappings] }); setMappingImportOpen(false); setSaveState("idle"); }} parse={parseMappingListImport} primaryLabel="Add to draft" />}
  </div>;
}
