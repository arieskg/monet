import { useEffect, useState, type CSSProperties } from "react";
import type { PresetDetail, PresetSelection, ProfileSeed } from "../../shared/presets";
import type { ThemeMode } from "../../shared/model";
import { resolveThemeTokens } from "../../shared/tokens";
import { profileApi } from "../api";

export interface ProfileSeedChoice { kind: ProfileSeed["kind"] | "fork"; preset?: PresetSelection }

export function ProfileSeedPicker({ value, onChange, allowFork = false, label = "Starting point", disabled = false }: {
  value: ProfileSeedChoice; onChange: (value: ProfileSeedChoice) => void; allowFork?: boolean; label?: string; disabled?: boolean;
}) {
  const [catalog, setCatalog] = useState<PresetDetail[] | null>(null), [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0), [mode, setMode] = useState<ThemeMode>("light");
  useEffect(() => {
    if (value.kind !== "preset") return;
    let live = true;
    void profileApi.presets().then((items) => Promise.all(items.map((item) => profileApi.preset(item.selection.id)))).then((items) => {
      if (live) { setCatalog(items); setError(""); }
    }).catch((e: unknown) => { if (live) setError(e instanceof Error ? e.message : "Unable to load presets."); });
    return () => { live = false; };
  }, [value.kind, attempt]);
  const selected = catalog?.find((item) => item.selection.id === value.preset?.id && item.selection.sha256 === value.preset.sha256 && item.selection.version === value.preset.version);
  return <fieldset className="preset-picker" disabled={disabled}>
    <label>{label}<select aria-label={label} value={value.kind} onChange={(e) => onChange({ kind: e.target.value as ProfileSeedChoice["kind"] })}>
      <option value="scratch">Blank</option><option value="monet-starter">Monet Starter</option><option value="preset">Preset</option>
      {allowFork && <option value="fork">Copy current profile’s knowledge</option>}
    </select></label>
    <p className="muted">{value.kind === "scratch" ? "Start with no design decisions." : value.kind === "monet-starter" ? "Start with Monet’s general-purpose design system." : value.kind === "preset" ? "Choose a curated starting point. Your Profile will be an independent, editable copy." : "Copy this Profile’s knowledge into an independent Profile."}</p>
    {value.kind === "preset" && <>
      {error && <p role="alert">{error} <button type="button" className="button ghost micro" onClick={() => setAttempt((a) => a + 1)}>Retry presets</button></p>}
      {!catalog && !error && <p role="status">Loading bundled presets…</p>}
      <div className="preset-catalog" aria-label="Curated presets">{catalog?.map((item) => <button type="button" key={item.selection.id} className={`preset-option${selected?.selection.id === item.selection.id ? " selected" : ""}`} aria-pressed={selected?.selection.id === item.selection.id} onClick={() => { setMode("light"); onChange({ kind: "preset", preset: item.selection }); }}>
        <strong>{item.name}</strong><span>{item.description}</span><small>{item.supported_modes.includes("dark") ? "Light + dark" : "Light only"}</small>
      </button>)}</div>
      {catalog && !selected && <p role="status">{value.preset ? "The saved preset version is no longer in this catalog. A published Profile can still resume; new creation requires choosing an available version." : "Select a preset to inspect its colors, guidance and included decisions."}</p>}
      {selected && <PresetPreview detail={selected} mode={mode} onMode={setMode} />}
    </>}
  </fieldset>;
}

function PresetPreview({ detail, mode, onMode }: { detail: PresetDetail; mode: ThemeMode; onMode: (mode: ThemeMode) => void }) {
  const effectiveMode = detail.supported_modes.includes(mode) ? mode : "light";
  const tokens = resolveThemeTokens(detail.records.foundations, null, effectiveMode).tokens;
  const token = (name: string, fallback = "") => String(tokens.find((t) => t.name === name)?.resolved_value ?? fallback);
  const style = { "--preset-bg": token("color.background"), "--preset-surface": token("color.surface"), "--preset-ink": token("color.foreground"), "--preset-muted": token("color.foreground.muted"), "--preset-accent": token("color.primary"), "--preset-on-accent": token("color.on.primary"), "--preset-border": token("color.border"), "--preset-radius": token("radius.control", "0px"), "--preset-font": token("font.family.sans", "system-ui"), "--preset-heading": token("font.family.heading", token("font.family.sans", "system-ui")), "--preset-body-size": token("font.size.md", "16px"), "--preset-heading-size": token("font.size.heading", "24px") } as CSSProperties;
  const r = detail.records;
  return <section className="preset-detail" aria-label={`${detail.name} preview`}>
    <h3>{detail.name}</h3><p>Best for: {detail.best_for.join(" · ")}</p><p className="muted">{detail.characteristics.join(" · ")}</p>
    <p>Based on <a href={detail.upstream.documentation} target="_blank" rel="noreferrer">{detail.upstream.name}</a> · Preset {detail.selection.version}</p>
    <label>Preview mode<select value={effectiveMode} onChange={(e) => onMode(e.target.value as ThemeMode)}>{detail.supported_modes.map((m) => <option key={m} value={m}>{m === "light" ? "Light" : "Dark"}</option>)}</select></label>
    <div className="preset-sample" style={style} aria-label="Preset token illustration">
      <div className="preset-sample-heading">A place to get things done</div><p>Clear decisions for your next application.</p>
      <div className="preset-sample-panel"><b>Project details</b><div className="preset-sample-field">Project name</div><span className="preset-sample-action">Continue</span></div>
    </div>
    <p className="muted">Layout illustration using these preset tokens. Your application supplies the components and behavior; fonts use local fallbacks.</p>
    <p>{r.principles.length} principles · {r.foundations.length} foundations · {tokens.length} tokens · {r.components.length} component decisions · {r.patterns.length} patterns</p>
    <details><summary>Included decisions and guidance</summary>
      <p><b>Foundations:</b> {r.foundations.map((f) => f.name).join(", ")}</p>
      <p><b>Components:</b> {r.taxonomy.flatMap((c) => c.entries.map((e) => e.name)).join(", ")}</p>
      {r.patterns.map((p) => <p key={p.id}><b>{p.title}:</b> {p.summary}</p>)}
      <p><b>Example decision — Button:</b> {r.components.find((c) => c.id === "button")?.notes.split("\n\n")[0]}</p>
      <div className="preset-token-table"><table><caption>Resolved starting tokens — {effectiveMode}</caption><thead><tr><th>Token</th><th>Value</th></tr></thead><tbody>{tokens.map((t) => <tr key={t.name}><td>{t.name}</td><td>{String(t.resolved_value)}</td></tr>)}</tbody></table></div>
    </details>
    <details><summary>What this preset leaves open</summary><ul>{detail.manifest.omissions.map((o) => <li key={o}>{o}</li>)}</ul></details>
    <details><summary>Sources and license notices</summary><p>{detail.attribution}</p><p>{detail.manifest.license} · Adaptation {detail.manifest.adaptation_version}</p>{detail.manifest.notices.map((n) => <details key={n.title}><summary>{n.title}</summary><pre className="preset-license">{n.text}</pre></details>)}<p><a href={detail.upstream.repository} target="_blank" rel="noreferrer">Upstream repository</a></p></details>
  </section>;
}
