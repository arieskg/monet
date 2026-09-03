import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { PageHeader, SaveNotice } from "../components/Common";
import { resolveThemeTokenSet, uniqueSlug, type Theme } from "../domain";
import { useWorkspace } from "../WorkspaceContext";

function displayValue(value: string | number | null): string { return value === null ? "Unresolved" : String(value); }

export function ThemesPage() {
  const { workspace, reload } = useWorkspace();
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<Theme | null>(null);
  const [newName, setNewName] = useState("");
  const [tokenToAdd, setTokenToAdd] = useState("");
  const [query, setQuery] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    if (!workspace) return;
    const nextId = workspace.themes.some((theme) => theme.id === selectedId) ? selectedId : workspace.defaultThemeId;
    const theme = workspace.themes.find((item) => item.id === nextId) ?? workspace.themes[0];
    if (!theme) return;
    setSelectedId(theme.id);
    setDraft(structuredClone(theme));
    setSaveState("idle");
  }, [workspace, selectedId]);

  const baseTokens = useMemo(() => workspace?.baseResolvedTokens ?? [], [workspace]);
  const resolution = useMemo(() => resolveThemeTokenSet(baseTokens, draft), [baseTokens, draft]);
  const resolvedByName = useMemo(() => new Map(resolution.tokens.map((token) => [token.name, token])), [resolution.tokens]);
  const availableTokens = baseTokens.filter((token) => !draft || !Object.prototype.hasOwnProperty.call(draft.overrides, token.name));
  const visibleTokens = resolution.tokens.filter((token) => {
    const needle = query.trim().toLowerCase();
    return !needle || [token.name, token.foundation, token.description, String(token.resolved_value ?? "")].join(" ").toLowerCase().includes(needle);
  });

  async function save(theme = draft) {
    if (!theme) return;
    setSaveState("saving");
    try { await api.saveTheme(theme); await reload(); setSelectedId(theme.id); setSaveState("saved"); }
    catch { setSaveState("error"); }
  }

  async function createTheme() {
    if (!workspace || !newName.trim()) return;
    const id = uniqueSlug(newName, workspace.themes.map((theme) => theme.id));
    if (!id) return;
    const theme: Theme = { id, name: newName.trim(), overrides: {}, updated_at: "" };
    await api.saveTheme(theme);
    setNewName("");
    setSelectedId(id);
    await reload();
  }

  async function duplicate() {
    if (!draft) return;
    const copy = await api.duplicateTheme(draft.id);
    setSelectedId(copy.id);
    await reload();
  }

  async function remove() {
    if (!workspace || !draft || workspace.themes.length === 1 || !window.confirm(`Delete the ${draft.name} theme? Base Monet will not be changed.`)) return;
    await api.deleteTheme(draft.id);
    setSelectedId("");
    await reload();
  }

  async function makeDefault() {
    if (!draft) return;
    await api.setDefaultTheme(draft.id);
    await reload();
  }

  function addOverride() {
    if (!draft || !tokenToAdd) return;
    const token = baseTokens.find((item) => item.name === tokenToAdd);
    if (!token) return;
    setDraft({ ...draft, overrides: { ...draft.overrides, [token.name]: token.resolved_value ?? token.value } });
    setTokenToAdd("");
    setSaveState("idle");
  }

  function updateOverride(name: string, rawValue: string) {
    if (!draft) return;
    const base = baseTokens.find((token) => token.name === name);
    const value = typeof base?.value === "number" && rawValue.trim() !== "" && Number.isFinite(Number(rawValue)) ? Number(rawValue) : rawValue;
    setDraft({ ...draft, overrides: { ...draft.overrides, [name]: value } });
    setSaveState("idle");
  }

  function resetOverride(name: string) {
    if (!draft) return;
    const overrides = { ...draft.overrides };
    delete overrides[name];
    setDraft({ ...draft, overrides });
    setSaveState("idle");
  }

  if (!workspace || !draft) return null;
  const overrideEntries = Object.entries(draft.overrides);
  return <div className="page themes-page">
    <PageHeader eyebrow="Base + overrides" title="Themes" description="Adapt Monet for a product without copying the design system. Themes store only Foundation token overrides; Principles and Patterns always remain inherited." />
    <div className="themes-workspace">
      <aside className="theme-rail">
        <div className="theme-create"><label htmlFor="new-theme-name">New theme</label><div><input id="new-theme-name" value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="ConvoGym" /><button className="button primary micro" disabled={!newName.trim()} onClick={() => void createTheme()}>Create</button></div></div>
        <nav aria-label="Themes">{workspace.themes.map((theme) => <button className={theme.id === draft.id ? "active" : ""} key={theme.id} onClick={() => setSelectedId(theme.id)}><span><b>{theme.name}</b><small>{Object.keys(theme.overrides).length} overrides</small></span>{theme.id === workspace.defaultThemeId && <i>Default</i>}</button>)}</nav>
      </aside>
      <section className="theme-detail">
        <header className="theme-title"><div><span className="eyebrow">Theme</span><input className="theme-name-input" aria-label="Theme name" value={draft.name} onChange={(event) => { setDraft({ ...draft, name: event.target.value }); setSaveState("idle"); }} /><p><code>{draft.id}</code> inherits every base value unless it is listed below.</p></div><div className="theme-actions"><SaveNotice state={saveState} /><button className="button ghost" disabled={draft.id === workspace.defaultThemeId} onClick={() => void makeDefault()}>{draft.id === workspace.defaultThemeId ? "Default theme" : "Set default"}</button><button className="button ghost" onClick={() => void duplicate()}>Duplicate</button><button className="button ghost danger" disabled={workspace.themes.length === 1} onClick={() => void remove()}>Delete</button><button className="button primary" disabled={!draft.name.trim()} onClick={() => void save()}>Save theme</button></div></header>
        <section className="theme-equation" aria-label="Theme resolution"><span>Base Monet</span><b>+</b><span>{draft.name} overrides</span><b>=</b><strong>Resolved design system</strong></section>
        <section className="theme-overrides"><div className="section-heading row"><div><span className="eyebrow">Only what changes</span><h2>Overrides</h2><p>Reset any value to inherit the current Monet default again.</p></div><div className="add-override"><select aria-label="Token to override" value={tokenToAdd} onChange={(event) => setTokenToAdd(event.target.value)}><option value="">Choose a Foundation value…</option>{workspace.foundations.map((foundation) => <optgroup label={foundation.name} key={foundation.id}>{availableTokens.filter((token) => token.foundation === foundation.id).map((token) => <option value={token.name} key={token.name}>{token.name}</option>)}</optgroup>)}</select><button className="button ghost" disabled={!tokenToAdd} onClick={addOverride}>Add override</button></div></div>
          {overrideEntries.length ? <div className="override-list">{overrideEntries.map(([name, value]) => { const base = baseTokens.find((token) => token.name === name); const resolved = resolvedByName.get(name); return <div className="override-row" key={name}><div><b>{name}</b><small>{base?.foundation}</small></div><label>Theme value<input value={String(value)} onChange={(event) => updateOverride(name, event.target.value)} /></label><div><span>Base</span><code>{displayValue(base?.resolved_value ?? null)}</code></div><div><span>Resolved</span><code>{displayValue(resolved?.resolved_value ?? null)}</code></div><button className="button ghost micro" onClick={() => resetOverride(name)}>Reset</button></div>; })}</div> : <div className="empty-overrides"><b>This theme is pure Monet.</b><p>Add only the values this product genuinely needs to change.</p></div>}
        </section>
        <section className="theme-preview"><div className="section-heading row"><div><span className="eyebrow">Agent-ready resolution</span><h2>Resolved values</h2><p>Values affected directly or through an alias show their theme origin.</p></div><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter values…" aria-label="Filter resolved theme values" /></div>
          {resolution.issues.length > 0 && <div className="theme-issues" role="alert">{resolution.issues.map((issue) => <p key={`${issue.token}-${issue.type}`}>{issue.message}</p>)}</div>}
          <div className="resolved-token-table"><div className="resolved-token-head"><span>Foundation value</span><span>Base</span><span>Resolved</span><span>Origin</span></div>{visibleTokens.map((token) => <div className={token.source === "theme" ? "theme-sourced" : ""} key={token.name}><span><b>{token.name}</b><small>{token.foundation}</small></span><code>{displayValue(token.base_resolved_value)}</code><code>{displayValue(token.resolved_value)}</code><span>{token.source === "theme" ? <><b>{draft.name}</b><small>{token.override_dependencies.join(", ")}</small></> : "Base Monet"}</span></div>)}</div>
        </section>
      </section>
    </div>
  </div>;
}
