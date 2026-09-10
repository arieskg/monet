import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useWorkspace } from "../WorkspaceContext";
import { PageHeader } from "../components/Common";
import { compatibleToken, type SurfaceInput, type SurfaceMapping, type SurfacePreview, type SurfaceSummary } from "../../shared/surfaces";
import type { ThemeMode } from "../../shared/model";

const message = (error: unknown) => error instanceof Error ? error.message : "Unable to complete this Surface request.";
const initial: SurfaceInput = { title: "", html: "", css: "", context: "", width: 1280, height: 900, mode: "light", assets: [] };
async function imageFile(file: File) {
  if (file.size > 3 * 1024 * 1024) throw new Error("Choose a PNG, JPEG or WebP image up to 3 MB.");
  const data_url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : ""); reader.onerror = () => reject(new Error("Unable to read image.")); reader.readAsDataURL(file);
  });
  return { filename: file.name, data_url };
}

export function SurfaceComparison({ preview }: { preview: SurfacePreview }) {
  const [zoom, setZoom] = useState(0.5);
  const { width, height } = preview.snapshot.input;
  return <section className="surface-comparison" aria-label="Surface comparison">
    <div className="surface-toolbar"><b>Original vs Monet · {width} × {height}</b><label>Preview scale <select value={zoom} onChange={(e) => setZoom(Number(e.target.value))}><option value={0.25}>25%</option><option value={0.5}>50%</option><option value={0.75}>75%</option><option value={1}>100%</option></select></label></div>
    <p className="muted">Equal document viewports. Scrolling is independent. Static appearance only; no scripts, navigation or interaction playback.</p>
    <div className="surface-panes">{[{ label: `Original · sanitized ${preview.snapshot.input.mode} snapshot`, html: preview.original }, { label: `Monet · ${preview.run.theme_id ?? "Profile base"} · ${preview.run.mode} · partially mapped`, html: preview.applied }].map((pane) => <div className="surface-pane" key={pane.label}><h3>{pane.label}</h3><div className="surface-viewport"><div style={{ width: width * zoom, height: height * zoom }}><iframe title={pane.label} sandbox="" referrerPolicy="no-referrer" srcDoc={pane.html} style={{ width, height, transform: `scale(${zoom})`, transformOrigin: "top left" }} /></div></div></div>)}</div>
  </section>;
}

function SurfaceEditor({ id, captureId }: { id?: string; captureId?: string }) {
  const { workspace } = useWorkspace();
  const navigate = useNavigate();
  const [input, setInput] = useState<SurfaceInput>(initial);
  const [captureTitle, setCaptureTitle] = useState(""), [captureContext, setCaptureContext] = useState("");
  const [preview, setPreview] = useState<SurfacePreview | null>(null);
  const [mappings, setMappings] = useState<SurfaceMapping[]>([]);
  const [theme, setTheme] = useState(workspace?.activeThemeId ?? "default");
  const [mode, setMode] = useState<ThemeMode>("light");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [dirty, setDirty] = useState(false), [unsavedPreview, setUnsavedPreview] = useState(false);
  const [attempt, setAttempt] = useState(0), [problem, setProblem] = useState(""), [expected, setExpected] = useState("");
  const [selectedIssues, setSelectedIssues] = useState<string[]>([]), [includeScreenshot, setIncludeScreenshot] = useState(false);
  const [gapId, setGapId] = useState("");
  const [mappingPage, setMappingPage] = useState(0), [mappingFilter, setMappingFilter] = useState("");
  useEffect(() => {
    if (!id && !captureId) return;
    let active = true;
    // A project capture is held by the service under its id; the editor only ever sees the sanitized preview.
    const load = id ? api.surface(id) : api.previewSurface({ capture_id: captureId! }, { mappings: [], mode: "light" });
    load.then((next) => { if (active) { setPreview(next); setMappings(next.run.mappings); setTheme(next.run.theme_id ?? ""); setMode(id ? next.run.requested_mode : next.snapshot.input.mode); setDirty(false); setUnsavedPreview(!id); setError(""); if (!id) { setCaptureTitle(next.snapshot.input.title); setCaptureContext(next.snapshot.input.context); } } }).catch((e) => { if (active) setError(message(e)); });
    return () => { active = false; };
  }, [id, captureId, attempt]);
  async function run(save: boolean) {
    setBusy(true); setError("");
    try {
      const selection = { mappings, ...(theme ? { theme_id: theme } : {}), ...(workspace?.profile ? { profile_id: workspace.profile.id } : {}), mode };
      const source = captureId ? { capture_id: captureId, ...(captureTitle.trim() ? { title: captureTitle.trim() } : {}), context: captureContext } : { input };
      const next = id && preview?.saved ? await api.reviseSurface(id, Math.max(...preview.saved.revisions), selection, save) : save ? await api.saveSurface(source, selection) : await api.previewSurface(source, selection);
      if (!id && save && next.saved) { void navigate(`/surfaces/${next.saved.id}`); return; }
      setPreview(next); setDirty(false); setUnsavedPreview(!save); setSelectedIssues([]); setGapId("");
    } catch (caught) { setError(message(caught)); }
    finally { setBusy(false); }
  }
  function changeInput(next: SurfaceInput) { setInput(next); setPreview(null); setMappings([]); setSelectedIssues([]); }
  async function files(files: FileList | null, kind: "html" | "css" | "assets" | "screenshot") {
    if (!files?.length) return;
    setBusy(true); setError("");
    try {
      if (kind === "html" || kind === "css") {
        const file = files[0]!; if (file.size > 300_000) throw new Error("HTML and CSS files must be at most 300 KB each.");
        changeInput({ ...input, [kind]: await file.text(), title: input.title || file.name.replace(/\.[^.]+$/, "") });
      } else if (kind === "screenshot") changeInput({ ...input, screenshot: await imageFile(files[0]!) });
      else {
        if ((input.assets?.length ?? 0) + files.length > 24) throw new Error("Use at most 24 raster assets.");
        const assets = [...(input.assets ?? [])]; for (const file of files) assets.push(await imageFile(file));
        changeInput({ ...input, assets });
      }
    } catch (caught) { setError(message(caught)); } finally { setBusy(false); }
  }
  async function remove() {
    if (!id || !window.confirm("Delete this Surface and its saved comparisons? Evidence already copied into Gaps is retained.")) return;
    setBusy(true); try { await api.deleteSurface(id); void navigate("/surfaces"); } catch (caught) { setError(message(caught)); } finally { setBusy(false); }
  }
  async function reportGap() {
    if (!id || !preview || dirty || unsavedPreview) return;
    setBusy(true); setError("");
    try { const gap = await api.surfaceGap(id, { revision: preview.run.revision, problem, expected, issue_ids: selectedIssues, include_screenshot: includeScreenshot }); setGapId(gap.id); }
    catch (caught) { setError(message(caught)); } finally { setBusy(false); }
  }
  const issues = preview ? [...preview.snapshot.issues, ...preview.run.issues] : [];
  const visibleMappings = (preview?.declarations ?? []).filter((d) => d.mappable && `${d.property} ${d.value} ${d.location}`.toLowerCase().includes(mappingFilter.toLowerCase()));
  const historical = Boolean(preview?.saved && preview.run.revision < Math.max(...preview.saved.revisions));
  return <div className="page surfaces-page">
    <Link to="/surfaces">← Surfaces</Link>
    <PageHeader eyebrow="Build with it" title={id ? preview?.snapshot.input.title ?? "Saved Surface" : "Import a Surface"} description="Preview approved token mappings on a static product snapshot." action={id && <button className="button ghost" disabled={busy} onClick={() => void remove()}>Delete Surface</button>} />
    <p className="surface-notice">Private imported evidence. Surfaces never changes canonical Monet records, executes app code, fetches missing assets, or sends content to AI. Redact sensitive visible content before importing. Saved files follow your workspace’s Git and backup policy.</p>
    {error && <div className="gap-error" role="alert">{error}{id && <button className="button" onClick={() => setAttempt((a) => a + 1)}>Reload Surface</button>}</div>}
    {(id || captureId) && !preview && !error && <p role="status">{captureId ? "Loading captured screen…" : "Loading Surface…"}</p>}
    {!id && captureId && preview && <fieldset className="surface-panel" disabled={busy}><legend>Captured from a local project</legend>
      <label>Surface title<input value={captureTitle} maxLength={300} onChange={(e) => setCaptureTitle(e.target.value)} /></label>
      <label>Product / state context<input value={captureContext} maxLength={2000} onChange={(e) => setCaptureContext(e.target.value)} /></label>
      <p className="muted">The captured document stays with the service until you save it. Inspect the safe snapshot below, approve mappings, then <b>Save Surface</b>.</p>
    </fieldset>}
    {!id && !captureId && <fieldset className="surface-import" disabled={busy}><legend>Captured HTML, CSS and assets</legend>
      <label>Surface title<input value={input.title} maxLength={300} onChange={(e) => changeInput({ ...input, title: e.target.value })} /></label>
      <label>Product / state context<input value={input.context ?? ""} maxLength={2000} placeholder="Example: exercise library, signed-in, resting state" onChange={(e) => changeInput({ ...input, context: e.target.value })} /></label>
      <div className="surface-import-columns"><label>HTML file<input type="file" accept=".html,.htm" onChange={(e) => void files(e.target.files, "html")} /><textarea aria-label="Captured HTML" value={input.html} onChange={(e) => changeInput({ ...input, html: e.target.value })} placeholder="Paste captured HTML…" rows={8} maxLength={300000} /></label><label>Additional CSS file<input type="file" accept=".css" onChange={(e) => void files(e.target.files, "css")} /><textarea aria-label="Captured CSS" value={input.css ?? ""} onChange={(e) => changeInput({ ...input, css: e.target.value })} placeholder="Paste CSS (appended after embedded styles)…" rows={8} maxLength={300000} /></label></div>
      <div className="surface-toolbar"><label>Capture width<input type="number" min={240} max={1920} value={input.width} onChange={(e) => changeInput({ ...input, width: Number(e.target.value) })} /></label><label>Capture height<input type="number" min={240} max={2160} value={input.height} onChange={(e) => changeInput({ ...input, height: Number(e.target.value) })} /></label><label>Captured appearance<select value={input.mode} onChange={(e) => changeInput({ ...input, mode: e.target.value as ThemeMode })}><option value="light">Light</option><option value="dark">Dark</option></select></label></div>
      <label>Local raster assets · PNG / JPEG / WebP<input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(e) => void files(e.target.files, "assets")} /></label>
      {(input.assets ?? []).map((asset, index) => <div className="surface-toolbar" key={index}><label>HTML image reference<input value={asset.filename} onChange={(e) => changeInput({ ...input, assets: input.assets?.map((a, i) => i === index ? { ...a, filename: e.target.value } : a) })} /></label><button className="button ghost" onClick={() => changeInput({ ...input, assets: input.assets?.filter((_, i) => i !== index) })}>Remove asset</button></div>)}
      <label>Optional original screenshot<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => void files(e.target.files, "screenshot")} /></label>{input.screenshot && <button className="button ghost" onClick={() => changeInput({ ...input, screenshot: undefined })}>Remove screenshot</button>}
      <p className="muted">One state per import. No archives, app URLs, fonts or SVG. Use named raster assets for &lt;img&gt;; CSS image URLs are removed.</p>
      <button className="button primary" disabled={!input.title.trim() || !input.html.trim()} onClick={() => void run(false)}>Inspect safe snapshot</button>
    </fieldset>}
    {preview && <>
      {preview.capture && <section className="surface-panel"><h2>Capture provenance</h2><p><b>{preview.capture.project_name}</b> · {preview.capture.screen_label} · <code>{preview.capture.route}</code> · {preview.capture.source.kind === "dev_server" ? preview.capture.source.base_url : `static files (${preview.capture.source.directory || "root"})`} · {preview.capture.width}×{preview.capture.height} · {preview.capture.mode} · {preview.capture.strategy === "stylesheet" ? "stylesheets kept" : "computed styles inlined"} · {new Date(preview.capture.captured_at).toLocaleString()}</p><p className="muted">Recorded by the service at capture time; the Project stays bound to this Profile. {preview.capture.blocked.length ? `${preview.capture.blocked.reduce((n, b) => n + b.count, 0)} outside requests were blocked during capture.` : "No outside requests were attempted during capture."}</p>{preview.capture.warnings.length > 0 && <details><summary>{preview.capture.warnings.length} capture notes</summary><ul>{preview.capture.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></details>}</section>}
      <section className="surface-panel"><h2>Import fidelity</h2><p>Compare the sanitized baseline with your capture before interpreting the applied result. Removing content or substituting fonts can change layout.</p><details><summary>{preview.snapshot.issues.length} import notices</summary><ul>{preview.snapshot.issues.map((i) => <li key={i.id}>{i.detail} {i.count && i.count > 1 ? `(${i.count} occurrences)` : ""}</li>)}</ul></details>{preview.snapshot.input.screenshot && <details><summary>Original screenshot · comparison evidence only</summary><img className="surface-screenshot" src={preview.snapshot.input.screenshot.data_url} alt="User-supplied original capture" /></details>}</section>
      {preview.stale && <p className="surface-notice" role="status">Monet has changed since this saved comparison. Historical values remain frozen. Preview and save a new revision to use current tokens.</p>}
      {preview.saved && <label>Saved comparison revision<select disabled={busy} value={unsavedPreview ? "draft" : preview.run.revision} onChange={(e) => { setBusy(true); api.surface(preview.saved!.id, Number(e.target.value)).then((next) => { setPreview(next); setMappings(next.run.mappings); setTheme(next.run.theme_id ?? ""); setMode(next.run.requested_mode); setDirty(false); setUnsavedPreview(false); setSelectedIssues([]); }).catch((caught) => setError(message(caught))).finally(() => setBusy(false)); }}>{unsavedPreview && <option value="draft">Unsaved comparison</option>}{preview.saved.revisions.map((r) => <option key={r} value={r}>Revision {r}</option>)}</select></label>}
      <fieldset className="surface-panel" disabled={busy || historical}><legend>Approve mappings</legend><p>Equal values suggest candidates, not semantic roles. Selecting a token approves only this declaration. Custom-property mappings affect its existing consumers through CSS; their roles are not inferred.</p>
        <div className="surface-toolbar"><label>Target theme<select value={theme} onChange={(e) => { setTheme(e.target.value); setDirty(true); }}><option value={theme} hidden>{theme}</option>{workspace?.themes.map((t) => <option value={t.id} key={t.id}>{t.name}</option>)}</select></label><label>Target mode<select value={mode} onChange={(e) => { setMode(e.target.value as ThemeMode); setDirty(true); }}><option value="light">Light</option><option value="dark">Dark</option></select></label></div>
        <div className="surface-toolbar"><label>Find declarations<input value={mappingFilter} onChange={(e) => { setMappingFilter(e.target.value); setMappingPage(0); }} /></label><button className="button ghost" disabled={mappingPage === 0} onClick={() => setMappingPage((p) => p - 1)}>Previous</button><span>{visibleMappings.length} matches · page {mappingPage + 1}</span><button className="button ghost" disabled={(mappingPage + 1) * 25 >= visibleMappings.length} onClick={() => setMappingPage((p) => p + 1)}>Next</button></div>
        <div className="surface-mappings"><table><thead><tr><th>Captured declaration</th><th>Approved Monet token</th></tr></thead><tbody>{visibleMappings.slice(mappingPage * 25, (mappingPage + 1) * 25).map((d) => <tr key={d.id}><td><code>{d.id} · {d.property}: {d.value}{d.important ? " !important" : ""}</code><small>{d.location}</small></td><td><select aria-label={`Token for ${d.id}`} value={mappings.find((m) => m.declaration_id === d.id)?.token ?? ""} onChange={(e) => { setMappings((previous) => [...previous.filter((m) => m.declaration_id !== d.id), ...(e.target.value ? [{ declaration_id: d.id, token: e.target.value }] : [])]); setDirty(true); }}><option value="">Leave unresolved</option>{preview.tokens.filter((t) => compatibleToken(d.property, t)).map((t) => <option key={t.name} value={t.name}>{preview.candidates[d.id]?.includes(t.name) ? "Equal value · " : ""}{t.name} · {t.value}</option>)}</select></td></tr>)}</tbody></table></div>
        <p>{preview.run.bindings.length} declarations mapped in the displayed comparison. {preview.declarations.filter((d) => !d.mappable).length} layout/other declarations retained without mapping. Candidate values reflect the last generated comparison.</p>
        <div className="surface-toolbar"><button className="button" onClick={() => void run(false)}>Preview approved mappings</button><button className="button primary" onClick={() => void run(true)}>{id ? "Save comparison revision" : "Save Surface"}</button></div>
      </fieldset>
      {historical && <p className="surface-notice">Historical comparison. Select the latest saved revision to edit mappings.</p>}
      {dirty && <p className="surface-notice" role="status">Mapping or theme choices changed. The comparison below still shows the last generated result.</p>}
      <SurfaceComparison preview={preview} />
      <section className="surface-panel"><h2>Conformance evidence</h2><p>{preview.run.review.scope}</p><p>{preview.run.review.coverage.checked} of {preview.run.review.coverage.submitted} submitted declarations checked; {preview.run.review.coverage.unverifiable} unverifiable; {preview.run.review.coverage.not_applicable} not applicable.</p><details><summary>{preview.run.review.findings.length} findings</summary><ul>{preview.run.review.findings.map((f, i) => <li key={i}><b>{f.level} · {f.check}</b> {f.location}: {f.observed} — {f.why}</li>)}</ul></details></section>
      <section className="surface-panel"><h2>Unresolved evidence → Gaps</h2><p>Unmapped styles and import limitations do not establish missing guidance. Select up to eight observations and describe the problem you see.</p><div className="surface-issues">{issues.map((i) => <label key={i.id}><input type="checkbox" checked={selectedIssues.includes(i.id)} disabled={busy || !selectedIssues.includes(i.id) && selectedIssues.length >= 8} onChange={(e) => setSelectedIssues((previous) => e.target.checked ? [...previous, i.id] : previous.filter((key) => key !== i.id))} /><span><b>{i.kind}</b> · {i.location}<br />{i.detail}</span></label>)}</div><label>What went wrong?<textarea value={problem} maxLength={4000} onChange={(e) => setProblem(e.target.value)} /></label><label>Expected outcome<textarea value={expected} maxLength={2000} onChange={(e) => setExpected(e.target.value)} /></label>{preview.snapshot.input.screenshot && <label className="surface-check"><input type="checkbox" checked={includeScreenshot} onChange={(e) => setIncludeScreenshot(e.target.checked)} />Copy original screenshot into the Gap</label>}<p className="muted">Copies selected text evidence and provenance, plus the screenshot only if selected. Diagnosis and proposals remain separate actions.</p><button className="button" disabled={busy || !id || dirty || unsavedPreview || !problem.trim() || !selectedIssues.length || Boolean(gapId)} onClick={() => void reportGap()}>Report selected evidence in Gaps</button>{(!id || unsavedPreview || dirty) && <p>Save the comparison before reporting a Gap.</p>}{gapId && <p role="status">Gap saved. <Link to={`/gaps/${gapId}`}>Open Gap</Link></p>}</section>
    </>}
    {busy && <p role="status">Processing Surface…</p>}
  </div>;
}
function SurfaceList() {
  const [items, setItems] = useState<SurfaceSummary[] | null>(null), [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { let active = true; api.surfaces().then((result) => { if (active) { setItems(result); setError(""); } }).catch((e) => { if (active) setError(message(e)); }); return () => { active = false; }; }, [attempt]);
  return <div className="page surfaces-page"><PageHeader eyebrow="Build with it" title="Surfaces" description="Bring a static product snapshot into Monet. Compare approved token mappings in context." action={<span className="surface-toolbar"><Link className="button" to="/projects">Capture from a local project</Link><Link className="button primary" to="/surfaces/new">Import Surface</Link></span>} />{error ? <div role="alert">{error}<button className="button" onClick={() => setAttempt((a) => a + 1)}>Retry</button></div> : items === null ? <p role="status">Loading Surfaces…</p> : items.length === 0 ? <div className="surface-panel"><h2>See Monet on your own UI</h2><p>Connect a local project and capture a screen, or import captured HTML, CSS and local raster assets. Static snapshots stay private to the editor and never change your design system.</p><p><Link to="/projects">Connect a local project</Link> · <Link to="/surfaces/new">Import your first Surface</Link></p></div> : items.map((item) => <Link className="gap-row" key={item.id} to={`/surfaces/${item.id}`}><b>{item.title}</b><span>{item.capture ? `${item.capture.project_name} · ${item.capture.route} · ` : ""}Revision {item.revision} · {new Date(item.created_at).toLocaleDateString()}</span></Link>)}</div>;
}
export function SurfacesPage() {
  const { id } = useParams(); const [search] = useSearchParams();
  const captureId = id === "new" ? search.get("capture") ?? undefined : undefined;
  return id ? <SurfaceEditor key={`${id}:${captureId ?? ""}`} id={id === "new" ? undefined : id} captureId={captureId} /> : <SurfaceList />;
}
