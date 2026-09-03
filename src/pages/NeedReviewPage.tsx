import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { SourcesHeader, SourceViewTabs } from "../components/SourceViews";
import { mappingsNeedingReview, primitiveEntries, taxonomyEntries, type MappingMatchType, type MappingStatus, type SourceMapping } from "../domain";
import { useWorkspace } from "../WorkspaceContext";

const matchTypes: MappingMatchType[] = ["exact", "equivalent", "variant", "composition", "related"];

function itemKey(sourceId: string, mappingIndex: number): string { return `${sourceId}:${mappingIndex}`; }

export function ReviewQueuePage() {
  const { workspace, reload } = useWorkspace();
  const reviews = useMemo(() => workspace ? mappingsNeedingReview(workspace) : [], [workspace]);
  const components = workspace ? taxonomyEntries(workspace) : [];
  const primitives = workspace ? primitiveEntries(workspace) : [];
  const [drafts, setDrafts] = useState<Record<string, SourceMapping>>({});
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [kindFilter, setKindFilter] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [optimisticallyResolved, setOptimisticallyResolved] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setDrafts((current) => Object.fromEntries(reviews.map(({ source, mapping, mappingIndex }) => {
      const key = itemKey(source.id, mappingIndex);
      return [key, current[key] ?? structuredClone(mapping)];
    })));
  }, [reviews]);

  useEffect(() => {
    const reviewKeys = new Set(reviews.map(({ source, mappingIndex }) => itemKey(source.id, mappingIndex)));
    setOptimisticallyResolved((current) => new Set([...current].filter((key) => reviewKeys.has(key))));
  }, [reviews]);

  const queuedReviews = reviews.filter(({ source, mappingIndex }) => !optimisticallyResolved.has(itemKey(source.id, mappingIndex)));

  const visible = queuedReviews.filter(({ source, mapping }) => {
    const needle = query.trim().toLocaleLowerCase();
    const matchesQuery = !needle || [source.name, mapping.upstream, mapping.description, mapping.rationale, mapping.canonical_id, ...(mapping.aliases ?? [])].filter(Boolean).join(" ").toLocaleLowerCase().includes(needle);
    return matchesQuery && (!sourceFilter || source.id === sourceFilter) && (!kindFilter || mapping.target_type === kindFilter);
  });

  function update(key: string, change: (mapping: SourceMapping) => SourceMapping) {
    setDrafts((current) => current[key] ? { ...current, [key]: change(current[key]) } : current);
    setError("");
  }

  async function persist(sourceId: string, mappingIndex: number, next: SourceMapping) {
    if (!workspace) return;
    if ((next.status === "mapped" || next.status === "needs_review") && !next.canonical_id) { setError("Choose a Monet concept before approving this mapping."); return; }
    const source = workspace.sources.find((item) => item.id === sourceId);
    if (!source) { setError("This source is no longer available."); return; }
    const key = itemKey(sourceId, mappingIndex);
    setBusy(key);
    setError("");
    setOptimisticallyResolved((current) => new Set(current).add(key));
    const upstream = next.upstream.trim().toLocaleLowerCase();
    const mappings = source.mappings.map((mapping, index) => {
      if (index === mappingIndex) return next;
      if (next.primary && mapping.upstream.trim().toLocaleLowerCase() === upstream) return { ...mapping, primary: false };
      return mapping;
    });
    try {
      await api.saveSource({ ...source, mappings });
      await reload();
    } catch {
      setOptimisticallyResolved((current) => { const restored = new Set(current); restored.delete(key); return restored; });
      setError(`Couldn’t save the ${next.upstream} review. Your selections are still here.`);
    }
    finally { setBusy(""); }
  }

  function resolve(sourceId: string, mappingIndex: number, status: MappingStatus) {
    const key = itemKey(sourceId, mappingIndex);
    const draft = drafts[key];
    if (!draft) return;
    const excludesTarget = status === "ignored" || status === "no_equivalent" || status === "unmapped";
    void persist(sourceId, mappingIndex, {
      ...draft,
      canonical_id: excludesTarget ? null : draft.canonical_id,
      confidence: excludesTarget ? "none" : draft.confidence,
      primary: excludesTarget ? false : draft.primary,
      status,
      mapped_by: "manual",
    });
  }

  return <div className="page review-queue-page">
    <SourcesHeader />
    <SourceViewTabs reviewCount={queuedReviews.length} />
    <div id="review-queue-panel" role="tabpanel" aria-labelledby="review-queue-tab">
      {queuedReviews.length > 0 && <div className="review-toolbar">
        <label><span>Search reviews</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Source, upstream item, or Monet concept" /></label>
        <label><span>Source</span><select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}><option value="">All sources</option>{workspace?.sources.filter((source) => source.mappings.some((mapping) => mapping.status === "needs_review")).map((source) => <option value={source.id} key={source.id}>{source.name}</option>)}</select></label>
        <label><span>Kind</span><select value={kindFilter} onChange={(event) => setKindFilter(event.target.value)}><option value="">Components and primitives</option><option value="component">Components</option><option value="primitive">Primitives</option></select></label>
      </div>}
      {error && <div className="review-error" role="alert">{error}</div>}
      {queuedReviews.length === 0 ? busy ? <div className="review-empty compact" aria-live="polite"><h2>Updating review queue…</h2><p>Saving the resolution to the source registry.</p></div> : <div className="review-empty"><span aria-hidden="true">✓</span><h2>Review queue cleared</h2><p>Every plausible AI mapping has been resolved. New low-confidence matches will appear here after a source refresh.</p><Link className="button ghost" to="/sources">View sources</Link></div> : visible.length === 0 ? <div className="review-empty compact"><h2>No matching reviews</h2><p>Adjust the search or filters to see the rest of the queue.</p></div> : <div className="review-list">
        {visible.map(({ source, mapping, mappingIndex }) => {
          const key = itemKey(source.id, mappingIndex);
          const draft = drafts[key] ?? mapping;
          const targets = draft.target_type === "primitive" ? primitives : components;
          return <article className="review-card" key={key}>
            <header><div><span className="eyebrow">{source.name} · {draft.category || draft.target_type}</span><h2>{draft.upstream}</h2><div className="review-signals"><span>{draft.confidence ?? "low"} confidence</span><span>{draft.match_type ?? "related"}</span>{draft.primary && <span>primary</span>}</div></div><Link to={`/sources/${source.id}?mapping=${mappingIndex}`}>Open source ↗</Link></header>
            {(draft.description || draft.rationale) && <div className="review-context">{draft.description && <p>{draft.description}</p>}{draft.rationale && <blockquote>{draft.rationale}</blockquote>}</div>}
            {(draft.aliases?.length || draft.props_api?.length || draft.usage_examples?.length) ? <details className="review-evidence"><summary>Mapping evidence</summary>{draft.aliases?.length ? <p><b>Aliases</b>{draft.aliases.join(" · ")}</p> : null}{draft.props_api?.length ? <p><b>Props / API</b>{draft.props_api.join(" · ")}</p> : null}{draft.usage_examples?.length ? <p><b>Usage</b>{draft.usage_examples.join(" · ")}</p> : null}</details> : null}
            <div className="review-fields">
              <label><span>Kind</span><select value={draft.target_type} onChange={(event) => update(key, (item) => ({ ...item, target_type: event.target.value as "component" | "primitive", canonical_id: null, primary: false }))}><option value="component">Component</option><option value="primitive">Primitive</option></select></label>
              <label><span>Monet concept</span><select value={draft.canonical_id ?? ""} onChange={(event) => update(key, (item) => ({ ...item, canonical_id: event.target.value || null }))}><option value="">Choose a concept…</option>{targets.map((target) => <option value={target.id} key={target.id}>{target.name}</option>)}</select></label>
              <label><span>Match type</span><select value={draft.match_type ?? "related"} onChange={(event) => update(key, (item) => ({ ...item, match_type: event.target.value as MappingMatchType }))}>{matchTypes.map((type) => <option value={type} key={type}>{type}</option>)}</select></label>
              <label className="review-primary"><input type="checkbox" checked={Boolean(draft.primary)} disabled={!draft.canonical_id} onChange={(event) => update(key, (item) => ({ ...item, primary: event.target.checked }))} /><span>Primary match</span></label>
            </div>
            <footer><div><button className="button ghost" disabled={Boolean(busy)} onClick={() => resolve(source.id, mappingIndex, "ignored")}>Ignore</button><button className="button ghost" disabled={Boolean(busy)} onClick={() => resolve(source.id, mappingIndex, "no_equivalent")}>No equivalent</button></div><button className="button primary" disabled={Boolean(busy) || !draft.canonical_id} onClick={() => resolve(source.id, mappingIndex, "mapped")}>{busy === key ? "Saving…" : draft.canonical_id === mapping.canonical_id && draft.match_type === mapping.match_type ? "Approve mapping" : "Save correction"}</button></footer>
          </article>;
        })}
      </div>}
    </div>
  </div>;
}
