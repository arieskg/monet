import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { PageHeader, SaveNotice } from "../components/Common";
import { modeLabels, resolveThemeTokenSet, themeOverrideSummary, tokenSetModes, uniqueSlug, type Theme, type ThemeMode, type ThemeOverrides } from "../domain";
import { useWorkspace } from "../WorkspaceContext";

function displayValue(value: string | number | null): string { return value === null ? "Unresolved" : String(value); }

/** Which override map is being edited: the theme's general overrides, which apply in every mode, or its dark-only ones. */
type OverrideScope = "all" | "dark";
const scopeLabels: Record<OverrideScope, string> = { all: "Every mode", dark: "Dark mode only" };

function scopedOverrides(theme: Theme, scope: OverrideScope): ThemeOverrides {
  return scope === "all" ? theme.overrides : theme.modes?.dark ?? {};
}

/** A theme with one override map replaced. An emptied dark map is dropped so the record stays as small as it was. */
function withScopedOverrides(theme: Theme, scope: OverrideScope, overrides: ThemeOverrides): Theme {
  if (scope === "all") return { ...theme, overrides };
  const modes: NonNullable<Theme["modes"]> = { ...theme.modes, dark: overrides };
  if (!Object.keys(overrides).length) delete modes.dark;
  const rest: Theme = { ...theme };
  delete rest.modes;
  return Object.keys(modes).length ? { ...rest, modes } : rest;
}

export function ThemesPage() {
  const { workspace, reload } = useWorkspace();
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<Theme | null>(null);
  const [newName, setNewName] = useState("");
  const [tokenToAdd, setTokenToAdd] = useState("");
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<OverrideScope>("all");
  const [mode, setMode] = useState<ThemeMode>("light");
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
  const modes = useMemo(() => tokenSetModes(baseTokens, draft), [baseTokens, draft]);
  const activeMode: ThemeMode = modes.includes(mode) ? mode : "light";
  const resolution = useMemo(() => resolveThemeTokenSet(baseTokens, draft, activeMode), [baseTokens, draft, activeMode]);
  // Overrides are checked in the mode they apply to, so a dark-only override shows its dark resolution.
  const overrideResolution = useMemo(() => resolveThemeTokenSet(baseTokens, draft, scope === "dark" ? "dark" : "light"), [baseTokens, draft, scope]);
  const resolvedByName = useMemo(() => new Map(overrideResolution.tokens.map((token) => [token.name, token])), [overrideResolution.tokens]);
  const currentOverrides = draft ? scopedOverrides(draft, scope) : {};
  const availableTokens = baseTokens.filter((token) => !Object.prototype.hasOwnProperty.call(currentOverrides, token.name));
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
    if (!workspace || !draft || workspace.themes.length === 1 || !window.confirm(`Delete the ${draft.name} theme? Profile base will not be changed.`)) return;
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
    // Start from the value the token already resolves to in this scope's mode, so a dark override begins from the dark decision rather than the light one.
    const starting = resolvedByName.get(token.name)?.resolved_value ?? token.resolved_value ?? token.value;
    setDraft(withScopedOverrides(draft, scope, { ...currentOverrides, [token.name]: starting }));
    setTokenToAdd("");
    setSaveState("idle");
  }

  function updateOverride(name: string, rawValue: string) {
    if (!draft) return;
    const base = baseTokens.find((token) => token.name === name);
    const value = typeof base?.value === "number" && rawValue.trim() !== "" && Number.isFinite(Number(rawValue)) ? Number(rawValue) : rawValue;
    setDraft(withScopedOverrides(draft, scope, { ...currentOverrides, [name]: value }));
    setSaveState("idle");
  }

  function resetOverride(name: string) {
    if (!draft) return;
    const overrides = { ...currentOverrides };
    delete overrides[name];
    setDraft(withScopedOverrides(draft, scope, overrides));
    setSaveState("idle");
  }

  if (!workspace || !draft) return null;
  const overrideEntries = Object.entries(currentOverrides);
  const originLabel = (source: "base" | "mode" | "theme") => source === "theme" ? draft.name : source === "mode" ? `${modeLabels[activeMode]} mode` : "Profile base";
  return <div className="page themes-page">
    <PageHeader eyebrow="Base + overrides" title="Themes" description="Adapt Monet for a product without copying the design system. Themes store only Foundation token overrides; Principles and Patterns always remain inherited." />
    <div className="themes-workspace">
      <aside className="theme-rail">
        <div className="theme-create"><label htmlFor="new-theme-name">New theme</label><div><input id="new-theme-name" value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="ConvoGym" /><button className="button primary micro" disabled={!newName.trim()} onClick={() => void createTheme()}>Create</button></div></div>
        <nav aria-label="Themes">{workspace.themes.map((theme) => <button className={theme.id === draft.id ? "active" : ""} key={theme.id} onClick={() => setSelectedId(theme.id)}><span><b>{theme.name}</b><small>{themeOverrideSummary(theme)}</small></span>{theme.id === workspace.defaultThemeId && <i>Default</i>}</button>)}</nav>
      </aside>
      <section className="theme-detail">
        <header className="theme-title"><div><span className="eyebrow">Theme</span><input className="theme-name-input" aria-label="Theme name" value={draft.name} onChange={(event) => { setDraft({ ...draft, name: event.target.value }); setSaveState("idle"); }} /><p><code>{draft.id}</code> inherits every base value unless it is listed below.</p></div><div className="theme-actions"><SaveNotice state={saveState} /><button className="button ghost" disabled={draft.id === workspace.defaultThemeId} onClick={() => void makeDefault()}>{draft.id === workspace.defaultThemeId ? "Default theme" : "Set default"}</button><button className="button ghost" onClick={() => void duplicate()}>Duplicate</button><button className="button ghost danger" disabled={workspace.themes.length === 1} onClick={() => void remove()}>Delete</button><button className="button primary" disabled={!draft.name.trim()} onClick={() => void save()}>Save theme</button></div></header>
        <section className="theme-equation" aria-label="Theme resolution"><span>Profile base</span><b>+</b><span>{modes.includes("dark") ? "mode values" : "light values"}</span><b>+</b><span>{draft.name} overrides</span><b>=</b><strong>Resolved design system</strong></section>
        <section className="theme-overrides"><div className="section-heading row"><div><span className="eyebrow">Only what changes</span><h2>Overrides</h2><p>Reset any value to inherit the current Monet default again. Overrides for every mode apply in light and dark alike; dark-only overrides layer on top when the theme resolves in dark mode.</p></div><div className="add-override"><div className="preview-view-switch" role="group" aria-label="Override scope">{(["all", "dark"] as const).map((item) => <button type="button" className={scope === item ? "active" : ""} key={item} aria-pressed={scope === item} onClick={() => { setScope(item); setTokenToAdd(""); }}>{scopeLabels[item]}</button>)}</div><select aria-label="Token to override" value={tokenToAdd} onChange={(event) => setTokenToAdd(event.target.value)}><option value="">Choose a Foundation value…</option>{workspace.foundations.map((foundation) => <optgroup label={foundation.name} key={foundation.id}>{availableTokens.filter((token) => token.foundation === foundation.id).map((token) => <option value={token.name} key={token.name}>{token.name}</option>)}</optgroup>)}</select><button className="button ghost" disabled={!tokenToAdd} onClick={addOverride}>Add override</button></div></div>
          {overrideEntries.length ? <div className="override-list">{overrideEntries.map(([name, value]) => { const base = baseTokens.find((token) => token.name === name); const resolved = resolvedByName.get(name); return <div className="override-row" key={name}><div><b>{name}</b><small>{base?.foundation}</small></div><label>{scope === "dark" ? "Dark value" : "Theme value"}<input value={String(value)} onChange={(event) => updateOverride(name, event.target.value)} /></label><div><span>Base</span><code>{displayValue(base?.resolved_value ?? null)}</code></div><div><span>Resolved{scope === "dark" ? " · dark" : ""}</span><code>{displayValue(resolved?.resolved_value ?? null)}</code></div><button className="button ghost micro" onClick={() => resetOverride(name)}>Reset</button></div>; })}</div> : <div className="empty-overrides"><b>{scope === "dark" ? "No dark-only overrides." : (baseTokens.length ? "This theme inherits every base value." : "No foundation values yet.")}</b><p>{scope === "dark" ? "Dark mode follows the Foundations' dark values and this theme's general overrides." : (baseTokens.length ? "Add only the values this product needs to change." : "Set up Foundations first, then add theme overrides for values your product needs to change.")}</p></div>}
        </section>
        <section className="theme-preview"><div className="section-heading row"><div><span className="eyebrow">Agent-ready resolution</span><h2>Resolved values</h2><p>Values affected directly or through an alias show their mode or theme origin.</p></div><div className="theme-preview-controls"><div className="preview-view-switch" role="group" aria-label="Resolution mode">{modes.map((item) => <button type="button" className={activeMode === item ? "active" : ""} key={item} aria-pressed={activeMode === item} onClick={() => setMode(item)}>{modeLabels[item]}</button>)}</div><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter values…" aria-label="Filter resolved theme values" /></div></div>
          {resolution.issues.length > 0 && <div className="theme-issues" role="alert">{resolution.issues.map((issue) => <p key={`${issue.token}-${issue.type}`}>{issue.message}</p>)}</div>}
          <div className="resolved-token-table"><div className="resolved-token-head"><span>Foundation value</span><span>Base (light)</span><span>Resolved · {modeLabels[activeMode].toLowerCase()}</span><span>Origin</span></div>{visibleTokens.map((token) => <div className={token.source === "theme" ? "theme-sourced" : token.source === "mode" ? "mode-sourced" : ""} key={token.name}><span><b>{token.name}</b><small>{token.foundation}</small></span><code>{displayValue(token.base_resolved_value)}</code><code>{displayValue(token.resolved_value)}</code><span>{token.source === "base" ? "Profile base" : <><b>{originLabel(token.source)}</b><small>{token.override_dependencies.join(", ")}</small></>}</span></div>)}</div>
        </section>
      </section>
    </div>
  </div>;
}
