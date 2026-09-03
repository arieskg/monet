import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { AiDecisionActions } from "../components/AiDecisionActions";
import { PageHeader, SaveNotice, StatusPill, StatusSelect } from "../components/Common";
import { JsonImportDialog } from "../components/JsonImportDialog";
import { TokenPreviewCard } from "../components/TokenPreview";
import { normalizeModeValues, resolveTokenSet, slugify, type Foundation, type Token, type TokenLevel, type TokenType } from "../domain";
import { useWorkspace } from "../WorkspaceContext";

const tokenTypes: TokenType[] = ["color", "dimension", "number", "font-family", "font-size", "font-weight", "duration", "cubic-bezier", "shadow", "border", "breakpoint", "z-index"];
const tokenLevels: TokenLevel[] = ["primitive", "semantic", "component"];

function newToken(foundation: Foundation): Token {
  const index = foundation.tokens.length + 1;
  return { id: `${foundation.id}-token-${index}`, name: `${foundation.id}.token-${index}`, foundation: foundation.id, type: "dimension", level: "primitive", value: "", description: "", order: foundation.tokens.length };
}

function parseTokenImport(value: unknown, foundation: Foundation): Token[] {
  const records = Array.isArray(value) ? value : [value];
  if (!records.length) throw new Error("Import at least one token object.");
  const names = new Set(foundation.tokens.map((token) => token.name));
  const ids = new Set(foundation.tokens.map((token) => token.id));
  return records.map((record, index) => {
    if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error("Each token must be a JSON object.");
    const candidate = record as Record<string, unknown>;
    const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
    if (!name) throw new Error("Every token needs a name.");
    if (names.has(name)) throw new Error(`The token name “${name}” already exists in this foundation.`);
    const type = candidate.type as TokenType;
    const level = candidate.level as TokenLevel;
    if (!tokenTypes.includes(type)) throw new Error(`Token “${name}” has an unsupported type.`);
    if (!tokenLevels.includes(level)) throw new Error(`Token “${name}” has an unsupported level.`);
    if (typeof candidate.value !== "string" && typeof candidate.value !== "number") throw new Error(`Token “${name}” needs a string or number value.`);
    const tokenValue: string | number = candidate.value;
    const id = slugify(typeof candidate.id === "string" && candidate.id.trim() ? candidate.id : `${foundation.id}-${name}`);
    if (ids.has(id)) throw new Error(`The token id “${id}” already exists in this foundation.`);
    names.add(name);
    ids.add(id);
    const modes = normalizeModeValues(candidate.modes);
    return { id, name, foundation: foundation.id, type, level, value: tokenValue, description: typeof candidate.description === "string" ? candidate.description : "", alias: typeof candidate.alias === "string" && candidate.alias ? candidate.alias : undefined, order: foundation.tokens.length + index, ...(modes ? { modes } : {}) };
  });
}

export function FoundationsPage() {
  const { workspace, reload } = useWorkspace();
  const { id } = useParams();
  const selected = workspace?.foundations.find((item) => item.id === id);
  const [draft, setDraft] = useState<Foundation | null>(null);
  const [tab, setTab] = useState<"overview" | "guidance" | "tokens" | "preview">("overview");
  const [tokenImportOpen, setTokenImportOpen] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState("");
  const loadedId = useRef<string | undefined>(undefined);
  useEffect(() => { if (loadedId.current !== selected?.id) { loadedId.current = selected?.id; setDraft(selected ? structuredClone(selected) : null); setTab("overview"); setSaveState("idle"); setSaveError(""); } }, [selected]);
  const resolution = useMemo(() => {
    if (!workspace || !draft) return { tokens: [], issues: [] };
    return resolveTokenSet(workspace.foundations.flatMap((foundation) => foundation.id === draft.id ? draft.tokens : foundation.tokens));
  }, [workspace, draft]);
  const resolvedDraft = resolution.tokens.filter((token) => token.foundation === draft?.id);
  async function save() { if (!draft) return; setSaveState("saving"); setSaveError(""); try { await api.saveFoundation(draft); await reload(); setSaveState("saved"); } catch (error) { setSaveState("error"); setSaveError(error instanceof Error ? error.message : "Unable to save foundation."); } }
  function updateToken(index: number, patch: Partial<Token>) { if (!draft) return; setDraft({ ...draft, tokens: draft.tokens.map((token, itemIndex) => itemIndex === index ? { ...token, ...patch, foundation: draft.id } : token) }); }
  /** The dark value is optional: clearing the field removes the mode entirely, so the token resolves to its light value in every mode again. */
  function updateDarkValue(index: number, raw: string) {
    const token = draft?.tokens[index];
    if (!token) return;
    if (!raw.trim()) { updateToken(index, { modes: undefined }); return; }
    const value = typeof token.value === "number" && Number.isFinite(Number(raw)) ? Number(raw) : raw;
    updateToken(index, { modes: { ...token.modes, dark: value } });
  }
  function removeToken(index: number) { if (!draft) return; setDraft({ ...draft, tokens: draft.tokens.filter((_, itemIndex) => itemIndex !== index).map((token, order) => ({ ...token, order })) }); }
  function moveToken(index: number, direction: -1 | 1) { if (!draft) return; const target = index + direction; if (target < 0 || target >= draft.tokens.length) return; const tokens = [...draft.tokens]; [tokens[index], tokens[target]] = [tokens[target]!, tokens[index]!]; setDraft({ ...draft, tokens: tokens.map((token, order) => ({ ...token, order })) }); }

  return <div className="page"><PageHeader eyebrow="Visual language" title="Foundations" description="Design intent and the machine-readable token values that implement it." />
    <div className="workspace-layout"><aside className="collection-rail">{workspace?.foundations.map((item) => <Link key={item.id} className={item.id === id ? "active" : ""} to={`/foundations/${item.id}`}><span><b>{item.name}</b><small>{item.tokens.length} tokens</small></span><StatusPill value={item.status} /></Link>)}</aside>
      <section className="editor-panel">{!draft ? <div className="blank-editor"><span className="eyebrow">Choose a foundation</span><h2>Intent first, values when useful.</h2><p>Tokens add precision without forcing every foundation into a token system.</p></div> : <>
        <div className="editor-toolbar"><span className="file-label">foundations/{draft.id}.json</span><div><SaveNotice state={saveState} /><AiDecisionActions kind="Foundation" value={draft} context={`${draft.name}: ${draft.description}`} onImport={(value) => { setDraft(value); setSaveState("idle"); setSaveError(""); }} /><button className="button primary" onClick={() => void save()}>Save foundation</button></div></div>
        <div className="foundation-heading"><div><span className="eyebrow">Foundation</span><h2>{draft.name}</h2><p>{draft.description}</p></div><StatusSelect value={draft.status} onChange={(value) => setDraft({ ...draft, status: value })} /></div>
        <nav className="detail-tabs" aria-label="Foundation details">{(["overview", "guidance", "tokens", "preview"] as const).map((item) => <button className={tab === item ? "active" : ""} key={item} onClick={() => setTab(item)}>{item[0]?.toUpperCase()}{item.slice(1)}{item === "tokens" ? ` · ${draft.tokens.length}` : ""}</button>)}</nav>
        {saveError && <div className="inline-warning"><b>Could not save</b><span>{saveError}</span></div>}
        {tab === "overview" && <div className="form-grid"><label>Name<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label>Description<textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label><label>Design rationale<textarea value={draft.rationale} onChange={(event) => setDraft({ ...draft, rationale: event.target.value })} /></label></div>}
        {tab === "guidance" && <div className="form-grid"><label>Usage guidance<textarea className="large-textarea" value={draft.guidance} onChange={(event) => setDraft({ ...draft, guidance: event.target.value })} /></label><label>Notes<textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label></div>}
        {tab === "tokens" && <div className="structured-token-editor"><div className="section-heading row"><div><span className="eyebrow">Canonical values</span><h3>Tokens</h3></div><div className="button-row"><button className="button ghost" onClick={() => setDraft({ ...draft, tokens: [...draft.tokens, newToken(draft)] })}>Add token</button><button className="button ghost" onClick={() => setTokenImportOpen(true)}>Import JSON</button></div></div>
          {resolution.issues.filter((issue) => draft.tokens.some((token) => token.name === issue.token)).map((issue) => <div className="token-issue" key={`${issue.type}-${issue.token}`}><b>{issue.type === "broken_reference" ? "Broken reference" : "Circular reference"}</b><span>{issue.message}</span></div>)}
          <div className="structured-token-head"><span>Name</span><span>Value / reference · dark value</span><span>Type</span><span>Level</span><span /></div>
          {draft.tokens.map((token, index) => <div className="structured-token-row" key={token.id}><div><input aria-label={`Token ${index + 1} name`} value={token.name} onChange={(event) => updateToken(index, { name: event.target.value })} /><input className="token-description-input" aria-label={`${token.name} description`} value={token.description} onChange={(event) => updateToken(index, { description: event.target.value })} placeholder="Description" /></div><div><input aria-label={`${token.name} value`} value={token.value} onChange={(event) => updateToken(index, { value: event.target.value })} placeholder="16px or {space.4}" /><input className="token-description-input" aria-label={`${token.name} alias`} value={token.alias ?? ""} onChange={(event) => updateToken(index, { alias: event.target.value || undefined })} placeholder="Optional alias" /><input className="token-description-input token-mode-input" aria-label={`${token.name} dark value`} value={token.modes?.dark === undefined ? "" : String(token.modes.dark)} onChange={(event) => updateDarkValue(index, event.target.value)} placeholder="Dark value (optional, e.g. {neutral.950})" /></div><select aria-label={`${token.name} type`} value={token.type} onChange={(event) => updateToken(index, { type: event.target.value as TokenType })}>{tokenTypes.map((type) => <option key={type}>{type}</option>)}</select><select aria-label={`${token.name} level`} value={token.level} onChange={(event) => updateToken(index, { level: event.target.value as TokenLevel })}>{tokenLevels.map((level) => <option key={level}>{level}</option>)}</select><div className="reorder-actions"><button aria-label={`Move ${token.name} up`} disabled={index === 0} onClick={() => moveToken(index, -1)}>↑</button><button aria-label={`Move ${token.name} down`} disabled={index === draft.tokens.length - 1} onClick={() => moveToken(index, 1)}>↓</button><button aria-label={`Remove ${token.name}`} onClick={() => removeToken(index)}>×</button></div></div>)}
        </div>}
        {tab === "preview" && <div className="registry-grid foundation-preview-grid">{resolvedDraft.map((token) => <TokenPreviewCard token={token} key={token.id} />)}{!resolvedDraft.length && <div className="no-candidates"><b>No tokens to preview.</b><p>This foundation can remain guidance-only until named values are useful.</p></div>}</div>}
      </>}</section></div>
    {tokenImportOpen && draft && <JsonImportDialog<Token[]> title="Import token JSON" description="Paste or choose one token object or an array of token objects. Imported tokens are added to this foundation as an unsaved draft." dialogId={`token-import-${draft.id}`} onClose={() => setTokenImportOpen(false)} onImport={(tokens) => { setDraft({ ...draft, tokens: [...draft.tokens, ...tokens] }); setTokenImportOpen(false); }} parse={(value) => parseTokenImport(value, draft)} primaryLabel="Add to draft" />}
  </div>;
}
