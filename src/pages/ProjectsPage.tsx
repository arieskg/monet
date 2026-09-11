import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, createProfileApi, directoryApi, PROFILE_SWITCH_EVENT } from "../api";
import { acknowledgeOnboarding, forgetOnboarding, pendingOnboarding, rememberOnboarding } from "../projectOnboarding";
import type { ProjectOnboardingInput } from "../../shared/projectOnboarding";
import { useWorkspace } from "../WorkspaceContext";
import { PageHeader } from "../components/Common";
import { ProfileSeedPicker, type ProfileSeedChoice } from "../components/ProfileSeedPicker";
import { Modal } from "../components/Modal";
import { CAPTURE_PRESETS, matchScreens, type DirectoryListing, type ProjectCaptureResult, type ProjectRecord, type ProjectScreen, type ProjectSummary, type ScreenFinderResult } from "../../shared/projects";
import type { ThemeMode } from "../../shared/model";

const message = (error: unknown) => error instanceof Error ? error.message : "Unable to complete this project request.";

function DirectoryBrowser({ start, onPick, onClose }: { start: string; onPick: (path: string) => void; onClose: () => void }) {
  const [listing, setListing] = useState<DirectoryListing | null>(null), [error, setError] = useState("");
  const [target, setTarget] = useState(start);
  useEffect(() => { let live = true; directoryApi.list(target || undefined).then((value) => { if (live) { setListing(value); setError(""); } }).catch((e) => { if (live) setError(message(e)); }); return () => { live = false; }; }, [target]);
  return <Modal className="profile-dialog-backdrop" label="Choose a project folder" onClose={onClose}><div className="profile-dialog directory-browser">
    <h2>Choose a project folder</h2>
    <p className="muted">Folder names only. Monet reads the folder when you connect it; nothing is installed or run.</p>
    {error && <p role="alert">{error}</p>}
    {listing && <>
      <div className="surface-toolbar"><code className="directory-path">{listing.path}</code></div>
      <div className="surface-toolbar"><button type="button" className="button ghost micro" disabled={!listing.parent} onClick={() => setTarget(listing.parent ?? "")}>↑ Up one level</button><button type="button" className="button ghost micro" onClick={() => setTarget(listing.home)}>Home</button></div>
      <ul className="directory-entries">{listing.entries.map((entry) => <li key={entry.path}><button type="button" onClick={() => setTarget(entry.path)}>{entry.name}/</button></li>)}{listing.entries.length === 0 && <li className="muted">No subfolders</li>}</ul>
      {listing.truncated && <p className="muted">Folder listing reached its scan or display limit.</p>}
      <div className="surface-toolbar"><button type="button" className="button" onClick={onClose}>Cancel</button><button type="button" className="button primary" onClick={() => onPick(listing.path)}>Use this folder</button></div>
    </>}
  </div></Modal>;
}

/** Pending work may finish in its bound Profile, but must never navigate a departed editor. */
function useLiveOperation() {
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    const leave = () => { live.current = false; };
    window.addEventListener("pagehide", leave);
    window.addEventListener(PROFILE_SWITCH_EVENT, leave);
    return () => { leave(); window.removeEventListener("pagehide", leave); window.removeEventListener(PROFILE_SWITCH_EVENT, leave); };
  }, []);
  return live;
}

function ProjectList() {
  const navigate = useNavigate();
  const { environment } = useWorkspace();
  const live = useLiveOperation();
  const [destination, setDestination] = useState<"current" | "new">("current");
  const [profileName, setProfileName] = useState<string | null>(null);
  const [seed, setSeed] = useState<ProfileSeedChoice>({ kind: "monet-starter" });
  const { kind } = seed;
  const [pending, setPending] = useState<ProjectOnboardingInput | null>(null);
  const submitting = useRef(false);
  const [items, setItems] = useState<ProjectSummary[] | null>(null), [error, setError] = useState(""), [attempt, setAttempt] = useState(0);
  const [root, setRoot] = useState(""), [name, setName] = useState(""), [browsing, setBrowsing] = useState(false), [busy, setBusy] = useState(false);
  useEffect(() => { let live = true; api.projects().then((value) => { if (live) { setItems(value); setError(""); } }).catch((e) => { if (live) setError(message(e)); }); return () => { live = false; }; }, [attempt]);
  useEffect(() => {
    if (!environment?.profile?.id) return;
    try {
      const saved = pendingOnboarding(environment.profile.id);
      if (saved) { setPending(saved); setRoot(saved.project.root); setName(saved.project.name ?? ""); setDestination("new"); setProfileName(saved.profile.name); setSeed(saved.profile); }
    } catch { setError("Saved onboarding could not be read. Restore browser storage before retrying this connection."); }
  }, [environment?.profile?.id]);
  const suggestedName = (name.trim() || root.trim().replace(/\/+$/, "").split("/").pop() || "New project").slice(0, 100);
  async function connect() {
    // Capture identity before the first await; never consult the selected Profile later.
    const currentId = environment?.profile?.id;
    if (!currentId || submitting.current) return;
    submitting.current = true;
    setBusy(true); setError("");
    try {
      let profileId = currentId, project;
      if (destination === "new") {
        if (kind === "fork" || kind === "preset" && !seed.preset) throw new Error("Choose a preset before creating a Profile.");
        const profile = kind === "preset" ? { name: (profileName ?? suggestedName).trim(), kind, preset: seed.preset! } : { name: (profileName ?? suggestedName).trim(), kind };
        const input = pending ?? { operation_id: crypto.randomUUID(), project: { root, ...(name.trim() ? { name: name.trim() } : {}) }, profile };
        rememberOnboarding(currentId, input);
        setPending(input);
        const result = await createProfileApi(currentId).onboardProject(input);
        profileId = result.profile_id; project = result.project;
        // Retain the resume pointer until the destination page actually opens.
        rememberOnboarding(currentId, input, { profileId, projectId: project.id });
      } else {
        project = await createProfileApi(currentId).connectProject({ root, ...(name.trim() ? { name: name.trim() } : {}) });
      }
      if (!live.current) return;
      if (profileId === currentId) void navigate(`/projects/${project.id}`);
      else window.location.assign(`/projects/${encodeURIComponent(project.id)}?profile=${encodeURIComponent(profileId)}`);
    } catch (caught) {
      if (live.current) setError(message(caught));
    } finally { submitting.current = false; if (live.current) setBusy(false); }
  }

  return <div className="page surfaces-page projects-page">
    <PageHeader eyebrow="Build with it" title="Local projects" description="Choose a project, choose its Profile, then find and capture a screen into Surfaces." />
    <p className="surface-notice">Connections are private to their chosen Profile. Monet reads the folder to list screens; it never installs dependencies, runs project scripts, or changes project files. Capture loads the running app in an isolated browser that can only reach the app’s own local port.</p>
    {error && <div className="gap-error" role="alert">{error}<button className="button" onClick={() => setAttempt((a) => a + 1)}>Reload projects</button></div>}
    <fieldset className="surface-panel" disabled={busy}><legend>1 · Choose a local project</legend>
      <div className="surface-toolbar"><label>Project folder<input disabled={Boolean(pending)} value={root} placeholder="/Users/you/code/my-app" onChange={(e) => setRoot(e.target.value)} /></label><button type="button" className="button" disabled={Boolean(pending)} onClick={() => setBrowsing(true)}>Browse…</button></div>
      <label>Name (optional)<input disabled={Boolean(pending)} value={name} maxLength={100} placeholder="Defaults to the folder name" onChange={(e) => setName(e.target.value)} /></label>
      <fieldset className="surface-panel" disabled={!root.trim() || Boolean(pending)}><legend>2 · Profile destination</legend>
        <label><input type="radio" name="destination" checked={destination === "current"} onChange={() => setDestination("current")} /> Use current Profile — {environment?.profile?.name ?? "Loading…"}</label>
        <label><input type="radio" name="destination" checked={destination === "new"} onChange={() => setDestination("new")} /> Create new Profile</label>
        {destination === "new" && <>
          <label>Profile name<input maxLength={100} value={profileName ?? suggestedName} onChange={(e) => setProfileName(e.target.value)} /></label>
          <ProfileSeedPicker value={seed} onChange={setSeed} />
          <p className="muted">Imported Surfaces remain observed evidence. Importing never adopts the app’s styles into this Profile.</p>
        </>}
      </fieldset>
      {pending && <p role="status">This connection is saved for retry. Resume uses the same Profile and Project IDs, including after a restart.</p>}
      <p className="muted">The Project and its captured Surfaces belong to the chosen Profile. If interrupted, return here to resume this connection.</p>
      <button className="button primary" disabled={!root.trim() || !environment?.profile?.id || destination === "new" && (!(profileName ?? suggestedName).trim() || kind === "preset" && !seed.preset)} onClick={() => void connect()}>{busy ? "Preparing project…" : pending ? "Resume connection" : "Connect and discover screens"}</button>
    </fieldset>
    {pending && !busy && <button className="button ghost" onClick={() => {
      if (window.confirm("Start a different connection? The saved operation and any created Profile are retained; this does not undo them.")) { forgetOnboarding(environment!.profile!.id); setPending(null); }
    }}>Start a different connection</button>}
    {browsing && <DirectoryBrowser start={root} onPick={(path) => { setRoot(path); setBrowsing(false); }} onClose={() => setBrowsing(false)} />}
    {items === null && !error ? <p role="status">Loading projects…</p> : items?.length ? <div className="project-list">{items.map((item) => <Link className="gap-row" key={item.id} to={`/projects/${item.id}`}><b>{item.name}</b><span>{item.framework} · {item.screens} screens</span><span>{new Date(item.scanned_at).toLocaleDateString()}</span></Link>)}</div> : items && <p className="muted">No projects connected to this Profile yet.</p>}
  </div>;
}

function ScreenRow({ screen, selected, onSelect, aiReason }: { screen: ProjectScreen; selected: boolean; onSelect: () => void; aiReason?: string }) {
  return <label className={`project-screen${selected ? " selected" : ""}`}><input type="radio" name="screen" checked={selected} onChange={onSelect} />
    <span><b>{screen.ai_label ?? screen.label}</b>{screen.ai_label && <i className="badge">AI label</i>}{screen.kind === "dynamic_route" && <i className="badge">needs {screen.parameters.join(", ") || "a value"}</i>}
      <br /><code>{screen.route}</code> <small className="muted">· {screen.source}</small>
      {screen.ai_summary && <><br /><small>{screen.ai_summary}</small></>}{aiReason && <><br /><small className="muted">AI: {aiReason}</small></>}
      {!screen.ai_summary && screen.hints.length > 0 && <><br /><small className="muted">{screen.hints.slice(0, 3).join(" · ")}</small></>}</span></label>;
}

function ProjectDetail({ id }: { id: string }) {
  const { environment } = useWorkspace();
  const live = useLiveOperation();
  const navigate = useNavigate();
  const [project, setProject] = useState<ProjectRecord | null>(null), [error, setError] = useState(""), [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(""), [query, setQuery] = useState(""), [finder, setFinder] = useState<ScreenFinderResult | null>(null);
  const [selected, setSelected] = useState(""), [route, setRoute] = useState("");
  const [sourceKind, setSourceKind] = useState<"dev_server" | "static">("dev_server"), [baseUrl, setBaseUrl] = useState(""), [staticDir, setStaticDir] = useState("");
  const [check, setCheck] = useState<{ ok: boolean; text: string } | null>(null);
  const [preset, setPreset] = useState(0), [width, setWidth] = useState(1280), [height, setHeight] = useState(900), [mode, setMode] = useState<ThemeMode>("light"), [strategy, setStrategy] = useState<"auto" | "stylesheet" | "computed">("auto");
  const [result, setResult] = useState<ProjectCaptureResult | null>(null);
  useEffect(() => { if (project && environment?.profile?.id) acknowledgeOnboarding(environment.profile.id, project.id); }, [project, environment?.profile?.id]);
  useEffect(() => {
    let live = true;
    api.project(id).then((next) => { if (!live) return; setProject(next); setError(""); const d = next.capture_defaults; setBaseUrl(d.base_url ?? ""); setWidth(d.width); setHeight(d.height); setMode(d.mode); setStrategy(d.strategy); setPreset(Math.max(0, CAPTURE_PRESETS.findIndex((p) => p.width === d.width && p.height === d.height)));
      if (next.inventory.kind === "static" && next.inventory.static_builds.length) { setSourceKind("static"); setStaticDir(next.inventory.static_builds[0]!); } else if (next.inventory.static_builds.length) setStaticDir(next.inventory.static_builds[0]!); })
      .catch((e) => { if (live) setError(message(e)); });
    return () => { live = false; };
  }, [id, attempt]);
  const screens = useMemo(() => project?.inventory.screens ?? [], [project]);
  const keywordMatches = useMemo(() => query.trim() ? matchScreens(screens, query) : null, [screens, query]);

  const current = screens.find((s) => s.id === selected);
  const aiMatches = finder?.query === query ? finder.ai.matches : [];
  const visible = keywordMatches ? [...new Set([...aiMatches.map((m) => m.screen_id), ...keywordMatches.map((m) => m.screen_id)])].map((id) => screens.find((s) => s.id === id)!).filter(Boolean) : screens;
  async function act<T>(label: string, work: () => Promise<T>, then: (value: T) => void) {
    setBusy(label); setError("");
    try { const value = await work(); if (live.current) then(value); } catch (caught) { if (live.current) setError(message(caught)); } finally { if (live.current) setBusy(""); }
  }
  function choose(screen: ProjectScreen) { setSelected(screen.id); setRoute(screen.kind === "dynamic_route" ? screen.route : ""); setResult(null); }
  const captureSource = sourceKind === "dev_server" ? { kind: "dev_server" as const, base_url: baseUrl } : { kind: "static" as const, directory: staticDir };
  const routeValue = route || current?.route || "/";
  const needsValue = /:\w+/.test(routeValue) || routeValue.includes("*");
  return <div className="page surfaces-page projects-page">
    <Link to="/projects">← Local projects</Link>
    <PageHeader eyebrow="Build with it" title={project?.name ?? "Project"} description={project ? `${project.inventory.framework} · ${project.root}` : "Loading project…"} action={project && <span className="surface-toolbar"><button className="button ghost" disabled={Boolean(busy)} onClick={() => void act("scan", () => api.rescanProject(id), (next) => { setProject(next); setFinder(null); })}>Rescan</button><button className="button ghost" disabled={Boolean(busy)} onClick={() => { if (window.confirm("Disconnect this project from the Profile? Saved Surfaces keep their capture history.")) void act("disconnect", () => api.disconnectProject(id), () => void navigate("/projects")); }}>Disconnect</button></span>} />
    {error && <div className="gap-error" role="alert">{error}<button className="button" onClick={() => setAttempt((a) => a + 1)}>Reload project</button></div>}
    {project && <>
      <section className="surface-panel"><h2>What Monet found</h2><p>Profile: <b>{environment?.profile?.name}</b> · Captures are implementation evidence; they do not create design decisions.</p>
        <p>{project.inventory.screens.length} screens · {project.inventory.entries.toLocaleString()} entries scanned{project.inventory.truncated ? " (stopped at the scan limit)" : ""} · {new Date(project.inventory.scanned_at).toLocaleString()}</p>
        {project.inventory.dev_command && <p>To capture the live app, start it yourself in a terminal, then check the connection below:</p>}{project.inventory.dev_command && <pre className="project-command">{project.inventory.dev_command}</pre>}
        {project.inventory.notices.length > 0 && <details><summary>{project.inventory.notices.length} discovery notices</summary><ul>{project.inventory.notices.map((n, i) => <li key={i}>{n}</li>)}</ul></details>}
        {project.inventory.ai && <p className="muted">{project.inventory.ai.message}</p>}
        {environment?.aiConfigured ? <button className="button ghost" disabled={Boolean(busy)} onClick={() => void act("interpret", () => api.interpretProject(id), setProject)}>{busy === "interpret" ? "Interpreting…" : "Suggest friendlier screen names with AI"}</button> : <p className="muted">Optional AI naming and natural-language search are off because no provider is configured. Deterministic discovery works without it.</p>}
      </section>
      <fieldset className="surface-panel" disabled={Boolean(busy)}><legend>1 · Choose a screen</legend>
        <div className="surface-toolbar"><label>Find a screen<input value={query} maxLength={300} placeholder="The page where the user chooses an exercise and presses Start" onChange={(e) => { setQuery(e.target.value); }} /></label>{environment?.aiConfigured && <button className="button ghost" disabled={!query.trim()} onClick={() => void act("find", () => api.findScreens(id, { query, ai: true }), setFinder)}>{busy === "find" ? "Asking…" : "Ask AI to find it"}</button>}</div>
        <p className="muted">Search screen names and visible text, or optionally ask AI to rank the discovered screens from your description. Select a result to capture it. AI cannot add screens or choose the capture address.</p>
        {finder?.query === query && finder.ai.status !== "not_requested" && <p className="muted" role="status">{finder.ai.message}</p>}
        <div className="project-screens">{visible.map((screen) => <ScreenRow key={screen.id} screen={screen} selected={selected === screen.id} onSelect={() => choose(screen)} aiReason={aiMatches.find((m) => m.screen_id === screen.id)?.reason} />)}{visible.length === 0 && <p className="muted">No screens match. Try other words, or select any screen and enter the exact path.</p>}</div>
        {current && <label>Path to capture<input value={routeValue} onChange={(e) => setRoute(e.target.value)} /></label>}
        {current && needsValue && <p className="surface-notice">Replace <code>{current.parameters.map((p) => `:${p}`).join(", ")}</code> with a real value from your running app, for example an id you can see in its address bar.</p>}
      </fieldset>
      <fieldset className="surface-panel" disabled={Boolean(busy)}><legend>2 · Where the screen runs</legend>
        <div className="surface-toolbar">{project.inventory.kind !== "static" && <label><input type="radio" name="source" checked={sourceKind === "dev_server"} onChange={() => setSourceKind("dev_server")} /> Running dev server</label>}{project.inventory.static_builds.length > 0 && <label><input type="radio" name="source" checked={sourceKind === "static"} onChange={() => setSourceKind("static")} /> Static files served by Monet</label>}</div>
        {sourceKind === "dev_server" && <div className="surface-toolbar"><label>Local app URL<input value={baseUrl} placeholder="http://127.0.0.1:5173" onChange={(e) => { setBaseUrl(e.target.value); setCheck(null); }} /></label><button className="button" disabled={!baseUrl.trim()} onClick={() => void act("check", () => api.checkProjectConnection(id, baseUrl), (value) => setCheck({ ok: value.reachable, text: value.message }))}>{busy === "check" ? "Checking…" : "Check connection"}</button>{check && <span role="status" className={check.ok ? "project-ok" : "project-warn"}>{check.text}</span>}</div>}
        {sourceKind === "static" && <label>Folder to serve<select value={staticDir} onChange={(e) => setStaticDir(e.target.value)}>{project.inventory.static_builds.map((d) => <option key={d} value={d}>{d || "project root"}</option>)}</select></label>}
        <p className="muted">Only loopback URLs are accepted. The capture browser is isolated: fresh profile, no storage, no service workers, and every request outside the app’s own port is blocked.</p>
      </fieldset>
      <fieldset className="surface-panel" disabled={Boolean(busy)}><legend>3 · Capture</legend>
        <div className="surface-toolbar"><label>Viewport<select value={preset} onChange={(e) => { const index = Number(e.target.value); setPreset(index); const p = CAPTURE_PRESETS[index]; if (p) { setWidth(p.width); setHeight(p.height); } }}>{CAPTURE_PRESETS.map((p, i) => <option key={p.label} value={i}>{p.label}</option>)}<option value={-1}>Custom</option></select></label>
          {preset === -1 && <><label>Width<input type="number" min={240} max={1920} value={width} onChange={(e) => setWidth(Number(e.target.value))} /></label><label>Height<input type="number" min={240} max={2160} value={height} onChange={(e) => setHeight(Number(e.target.value))} /></label></>}
          <label>Appearance<select value={mode} onChange={(e) => setMode(e.target.value as ThemeMode)}><option value="light">Light</option><option value="dark">Dark</option></select></label>
          <label>Styles<select value={strategy} onChange={(e) => setStrategy(e.target.value as typeof strategy)}><option value="auto">Automatic</option><option value="stylesheet">Keep stylesheets (mappable variables)</option><option value="computed">Inline computed styles (framework-safe)</option></select></label></div>
        <button className="button primary" disabled={!current || needsValue || sourceKind === "dev_server" && !baseUrl.trim()} onClick={() => void act("capture", () => api.captureScreen(id, { screen_id: selected, route: routeValue, source: captureSource, width, height, mode, strategy }), setResult)}>{busy === "capture" ? "Capturing… (up to a minute)" : "Capture this screen"}</button>
        <p className="muted">The capture shows whatever the app displays at that moment, including any real data on screen. Use test data for anything sensitive.</p>
      </fieldset>
      {result && <section className="surface-panel" aria-label="Capture result"><h2>Captured: {result.capture.screen_label}</h2>
        <p>{result.capture.route} · {result.capture.width}×{result.capture.height} · {result.capture.mode} · {result.capture.strategy === "stylesheet" ? "stylesheets kept" : "computed styles inlined"} · {result.capture.browser}</p>
        <p>{Math.round(result.fidelity.html_bytes / 1000)} KB HTML, {Math.round(result.fidelity.css_bytes / 1000)} KB CSS, {result.fidelity.assets} images{result.fidelity.rules ? ` · ${result.fidelity.rules_removed} of ${result.fidelity.rules} style rules outside the static boundary` : ""} · {result.preview.snapshot.issues.length} import notices</p>
        {result.capture.blocked.length > 0 && <details><summary>{result.capture.blocked.reduce((n, b) => n + b.count, 0)} outside requests blocked</summary><ul>{result.capture.blocked.map((b) => <li key={b.host}>{b.host} × {b.count}</li>)}</ul></details>}
        {result.capture.warnings.length > 0 && <details open><summary>{result.capture.warnings.length} capture notes</summary><ul>{result.capture.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></details>}
        {result.preview.snapshot.input.screenshot && <img className="surface-screenshot" src={result.preview.snapshot.input.screenshot.data_url} alt="Screenshot of the captured screen" />}
        <div className="surface-toolbar"><Link className="button primary" to={`/surfaces/new?capture=${encodeURIComponent(result.capture_id)}`}>Open in Surfaces</Link><span className="muted">Map tokens, preview and save there. The capture expires in 15 minutes if unsaved.</span></div>
      </section>}
    </>}
    {busy && <p role="status">{busy === "capture" ? "Capturing in an isolated browser…" : "Working…"}</p>}
  </div>;
}
export function ProjectsPage() { const { id } = useParams(); return id ? <ProjectDetail key={id} id={id} /> : <ProjectList />; }
