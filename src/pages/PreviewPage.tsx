import { useState, type ReactNode } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { PageHeader } from "../components/Common";
import { RegisteredPreview } from "../components/previewAdapters";
import { PreviewValidationAreas } from "../components/PreviewValidation";
import { compilePreview, type CompiledPreview, type PreviewComponentDecision, type PreviewTokenSample } from "../previewCompiler";
import { useWorkspace } from "../WorkspaceContext";

type PreviewView = "elements" | "sample";

function TokenOrigin({ token }: { token: PreviewTokenSample }) {
  return token.source === "theme" ? <i className="compiled-origin">Theme</i> : null;
}

function DecisionFixture({ model, componentId, title, children }: { model: CompiledPreview; componentId: string; title: string; children?: ReactNode }) {
  const decision = model.components[componentId];
  const density = decision?.preferences.density ?? decision?.preferences.size ?? "default";
  const radius = decision?.preferences.radius ?? "default";
  return <article className="compiled-element-card" data-component-id={componentId} data-density={density} data-radius={radius}>
    <header><div><span className="compiled-kicker">{componentId}</span><h3>{title}</h3></div><DecisionOrigin decision={decision} /></header>
    {children ?? <div className="candidate-demo component-preview monet compiled-component-fixture"><DecisionAdapter model={model} componentId={componentId} /></div>}
  </article>;
}

function DecisionAdapter({ model, componentId }: { model: CompiledPreview; componentId: string }) {
  const decision = model.components[componentId];
  return <RegisteredPreview componentId={componentId} sourceId={decision && !decision.usesDefault ? decision.sourceId ?? undefined : undefined} />;
}

function DecisionOrigin({ decision }: { decision?: PreviewComponentDecision }) {
  if (!decision || decision.usesDefault) return <span className="compiled-decision-origin">Monet default</span>;
  return <span className="compiled-decision-origin selected">{decision.sourceName ? `${decision.sourceName} · ${decision.sourceComponent}` : "Selected"}</span>;
}

function Provenance({ model }: { model: CompiledPreview }) {
  return <section className="compiled-provenance" aria-label="Preview inputs">
    <span><small>Theme</small><b>{model.theme.name}</b></span>
    <span><small>Foundations</small><b>{model.activeFoundationIds.length} active</b></span>
    <span><small>Components</small><b>{Object.values(model.components).filter((item) => !item.usesDefault).length} selected</b></span>
    <span><small>Patterns</small><b>{model.activePatternIds.length} active</b></span>
    <span><small>Fallbacks</small><b>{model.fallbackTokenNames.length || "None"}</b></span>
  </section>;
}

function ElementsView({ model }: { model: CompiledPreview }) {
  return <div className="compiled-elements">
    <section className="compiled-foundation-card compiled-colors"><header><span className="compiled-kicker">Foundation</span><h2>Colors</h2><p>Semantic roles from the resolved theme.</p></header><div>{model.colors.map((token) => <article key={token.name}><span style={{ background: String(token.value) }} /><b>{token.name.replace("color.", "")}</b><code>{String(token.value)}</code><TokenOrigin token={token} /></article>)}</div></section>
    <section className="compiled-foundation-card compiled-type"><header><span className="compiled-kicker">Foundation</span><h2>Typography hierarchy</h2><p>Product hierarchy at realistic interface scale.</p></header><div className="compiled-type-stack"><span><small>Page title · 2xl</small><strong>Design system overview</strong></span><span><small>Section heading · xl</small><b>Recent activity</b></span><span><small>Panel heading · lg</small><h3>Workspace health</h3></span><span><small>Body · md</small><p>Readable body content explains what changed and what needs attention next.</p></span><span><small>UI · sm</small><em>Compact controls, labels, and table values</em></span><span><small>Caption · xs</small><i>Updated just now</i></span></div></section>
    <section className="compiled-foundation-card compiled-spacing"><header><span className="compiled-kicker">Foundation</span><h2>Spacing</h2><p>The active scale, shown at actual size.</p></header><div>{model.spacing.map((token) => <span key={token.name}><i style={{ width: String(token.value) }} /><b>{token.name}</b><code>{String(token.value)}</code></span>)}</div></section>
    <section className="compiled-foundation-card compiled-geometry"><header><span className="compiled-kicker">Foundations</span><h2>Radius, borders, shadows</h2><p>Geometry and elevation in one consistency check.</p></header><div className="compiled-geometry-grid"><div><h3>Radius</h3>{model.radii.map((token) => <span key={token.name} style={{ borderRadius: String(token.value) }}><b>{token.name}</b><code>{String(token.value)}</code></span>)}</div><div><h3>Borders</h3>{model.borders.map((token) => <span key={token.name} style={{ border: String(token.value) }}><b>{token.name}</b><code>{String(token.value)}</code></span>)}</div><div><h3>Shadows</h3>{model.shadows.map((token) => <span key={token.name} style={{ boxShadow: String(token.value) }}><b>{token.name}</b><code>{String(token.value)}</code></span>)}</div></div></section>
    <div className="compiled-component-grid">
      <DecisionFixture model={model} componentId="button" title="Buttons" />
      <DecisionFixture model={model} componentId="text-input" title="Inputs / search"><div className="compiled-fixture-pair"><DecisionAdapter model={model} componentId="text-input" /><DecisionAdapter model={model} componentId="search-input" /></div></DecisionFixture>
      <DecisionFixture model={model} componentId="checkbox" title="Checkbox / radio"><div className="compiled-fixture-pair"><DecisionAdapter model={model} componentId="checkbox" /><DecisionAdapter model={model} componentId="radio" /></div></DecisionFixture>
      <DecisionFixture model={model} componentId="link" title="Links" />
      <DecisionFixture model={model} componentId="badge" title="Badges / tags"><div className="compiled-fixture-pair"><DecisionAdapter model={model} componentId="badge" /><DecisionAdapter model={model} componentId="tag" /></div></DecisionFixture>
      <DecisionFixture model={model} componentId="card" title="Cards" />
      <DecisionFixture model={model} componentId="tabs" title="Tabs / navigation"><div className="compiled-fixture-pair"><DecisionAdapter model={model} componentId="tabs" /><DecisionAdapter model={model} componentId="navigation-menu" /></div></DecisionFixture>
      <DecisionFixture model={model} componentId="table" title="Tables / status states"><div className="compiled-fixture-pair wide"><DecisionAdapter model={model} componentId="table" /><DecisionAdapter model={model} componentId="status-indicator" /></div></DecisionFixture>
    </div>
    <PreviewValidationAreas model={model} />
  </div>;
}

function SampleStatus({ kind, children }: { kind: "success" | "warning" | "neutral"; children: ReactNode }) {
  return <span className={`sample-status ${kind}`}><i />{children}</span>;
}

function SamplePageView({ model }: { model: CompiledPreview }) {
  const buttonDensity = model.components.button?.preferences.density ?? "default";
  const tableDensity = model.components.table?.preferences.density ?? "default";
  return <section className="sample-product" aria-label="Compiled sample product page" data-button-density={buttonDensity} data-table-density={tableDensity}>
    <aside className="sample-sidebar"><div className="sample-product-brand"><span>AC</span><b>Atlas Cloud</b></div><nav aria-label="Sample product navigation"><a className="active" href="#sample-overview">Overview</a><a href="#sample-projects">Projects</a><a href="#sample-team">Team</a><a href="#sample-reports">Reports</a></nav><div className="sample-user"><span>AK</span><div><b>Aries Kim</b><small>Workspace admin</small></div></div></aside>
    <div className="sample-main">
      <header className="sample-topbar"><label><span aria-hidden="true">⌕</span><input readOnly value="" placeholder="Search projects…" aria-label="Search projects" /></label><button className="sample-icon-button" type="button" aria-label="Notifications">●</button><button className="sample-button primary" type="button">New project</button></header>
      <main id="sample-overview" className="sample-content"><div className="sample-title"><div><span className="compiled-kicker">Workspace overview</span><h1>Good morning, Aries</h1><p>Here’s what is happening across your projects today.</p></div><div className="sample-title-actions"><button className="sample-button secondary" type="button">Export</button><button className="sample-button primary" type="button">Create report</button></div></div>
        <section className="sample-metrics" aria-label="Project metrics"><article><span>Active projects</span><b>12</b><small className="positive">↑ 8% this month</small></article><article><span>Tasks completed</span><b>184</b><small>72% of monthly goal</small></article><article><span>Team availability</span><b>86%</b><small className="positive">All systems healthy</small></article></section>
        <div className="sample-tabs" role="tablist" aria-label="Sample dashboard views"><button className="active" role="tab" aria-selected="true">Overview</button><button role="tab" aria-selected="false">Activity</button><button role="tab" aria-selected="false">Settings</button></div>
        <div className="sample-dashboard-grid">
          <section className="sample-panel sample-form"><header><div><h2>Create a project update</h2><p>Share a concise status with your team.</p></div><SampleStatus kind="neutral">Draft</SampleStatus></header><label>Update title<input readOnly value="September product release" /></label><label>Summary<textarea readOnly value="The release is on track. Design review is complete and engineering handoff begins Thursday." /></label><div className="sample-form-row"><fieldset><legend>Visibility</legend><label><input type="radio" name="sample-visibility" defaultChecked /> Team</label><label><input type="radio" name="sample-visibility" /> Private</label></fieldset><label className="sample-check"><input type="checkbox" defaultChecked /> Notify project members</label></div><footer><a href="#sample-guidelines">View posting guidelines</a><div><button className="sample-button secondary" type="button">Save draft</button><button className="sample-button primary" type="button">Publish update</button></div></footer></section>
          <section className="sample-panel sample-activity"><header><div><h2>Recent activity</h2><p>Updates from your team.</p></div><a href="#sample-all-activity">View all</a></header><ol><li><span>MJ</span><div><p><b>Maya</b> completed Design QA</p><small>Platform refresh · 18 min ago</small></div><SampleStatus kind="success">Done</SampleStatus></li><li><span>RB</span><div><p><b>Ravi</b> flagged a dependency</p><small>Mobile launch · 1 hr ago</small></div><SampleStatus kind="warning">Review</SampleStatus></li><li><span>SL</span><div><p><b>Sam</b> added a project note</p><small>Research synthesis · 3 hrs ago</small></div><SampleStatus kind="neutral">New</SampleStatus></li></ol></section>
        </div>
        <section className="sample-panel sample-table-panel"><header><div><h2>Projects</h2><p>Current delivery status across the workspace.</p></div><div className="sample-table-tools"><label><span aria-hidden="true">⌕</span><input readOnly value="" placeholder="Filter projects" aria-label="Filter projects" /></label><button className="sample-button secondary" type="button">Filter</button></div></header><div className="sample-table-scroll"><table><thead><tr><th>Project</th><th>Owner</th><th>Status</th><th>Progress</th><th>Due</th></tr></thead><tbody><tr><td><b>Platform refresh</b><small>Web application</small></td><td>Maya Chen</td><td><SampleStatus kind="success">On track</SampleStatus></td><td><span className="sample-progress"><i style={{ width: "78%" }} /></span><small>78%</small></td><td>Sep 18</td></tr><tr><td><b>Mobile launch</b><small>iOS and Android</small></td><td>Ravi Bose</td><td><SampleStatus kind="warning">At risk</SampleStatus></td><td><span className="sample-progress"><i style={{ width: "54%" }} /></span><small>54%</small></td><td>Sep 24</td></tr><tr><td><b>Research synthesis</b><small>Customer insights</small></td><td>Sam Lee</td><td><SampleStatus kind="neutral">Planning</SampleStatus></td><td><span className="sample-progress"><i style={{ width: "31%" }} /></span><small>31%</small></td><td>Oct 02</td></tr></tbody></table></div></section>
      </main>
    </div>
  </section>;
}

export function PreviewPage() {
  const { workspace, reload } = useWorkspace();
  const { view } = useParams();
  const [refreshing, setRefreshing] = useState(false);
  const activeView: PreviewView = view === "sample" ? "sample" : "elements";
  const model = workspace ? compilePreview(workspace) : null;
  async function refreshPreview() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await Promise.all([reload(), new Promise<void>((resolve) => window.setTimeout(resolve, 280))]);
    } finally {
      setRefreshing(false);
    }
  }
  if (!workspace || !model) return null;
  if (view && view !== "elements" && view !== "sample") return <Navigate to="/preview/elements" replace />;
  return <div className="page preview-page"><PageHeader eyebrow="Derived design system" title="Preview" description="A read-only visual compilation of the active theme, foundations, component decisions, and patterns. Make changes in their source sections; this page updates from the same workspace model." action={<div className="preview-header-actions"><button className="button preview-refresh-button" type="button" disabled={refreshing} aria-live="polite" onClick={() => void refreshPreview()}>{refreshing && <i aria-hidden="true" />}<span>{refreshing ? "Re-rendering…" : "Refresh Preview"}</span></button><nav className="preview-view-switch" aria-label="Preview view"><Link className={activeView === "elements" ? "active" : ""} to="/preview/elements">Elements</Link><Link className={activeView === "sample" ? "active" : ""} to="/preview/sample">Sample Page</Link></nav></div>} />
    <Provenance model={model} />
    <div className={`compiled-preview ${refreshing ? "is-refreshing" : ""}`} aria-busy={refreshing} style={model.cssVariables} data-theme={model.theme.id} data-foundations={model.activeFoundationIds.join(" ")} data-patterns={model.activePatternIds.join(" ")}>
      {activeView === "elements" ? <ElementsView model={model} /> : <SamplePageView model={model} />}
    </div>
  </div>;
}
