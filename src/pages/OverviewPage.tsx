import { Link } from "react-router-dom";
import { PageHeader, formatDate } from "../components/Common";
import { WorkspaceNotice } from "../components/WorkspaceNotice";
import { componentDecisionCoverage, markdownExcerpt, primitiveEntries, taxonomyEntries, workspaceIsEmpty, type Status } from "../domain";
import { featureVisibility } from "../featureVisibility";
import { useWorkspace } from "../WorkspaceContext";

/** Enough to show the shape of recent work. The whole history lives in the decision log and in git. */
const RECENT_LIMIT = 8;

const workflow = [
  { step: "1", title: "Decide", body: "Record what your product uses, what it avoids, and why. One component at a time.", to: "/components", action: "Components" },
  { step: "2", title: "Retrieve", body: "A coding agent asks Monet for the guidance a task needs, over MCP.", to: "/agent", action: "Agent context" },
  { step: "3", title: "Build", body: "The agent implements with your tokens, your components, and your patterns.", to: "", action: "" },
  { step: "4", title: "Review", body: "It reports what it built and Monet checks that evidence against the records.", to: "/agent#review", action: "Conformance review" },
] as const;

function ProgressRow({ label, defined, total, to }: { label: string; defined: number; total: number; to: string }) {
  const percentage = total ? Math.round((defined / total) * 100) : 0;
  return <Link className="progress-row" to={to}><span><b>{label}</b><small>{defined} of {total} defined</small></span><span className="progress-track"><i style={{ width: `${percentage}%` }} /></span><strong>{percentage}%</strong></Link>;
}

function CountRow({ label, count, detail, to }: { label: string; count: number; detail: string; to: string }) {
  return <Link className="progress-row count-row" to={to}><span><b>{label}</b><small>{detail}</small></span><span /><strong>{count}</strong></Link>;
}

function WorkflowStrip() {
  return <section className="workflow-strip" aria-label="How Monet is used">
    <div className="section-heading"><span className="eyebrow">The loop</span><h2>Decide once, then build against it</h2><p>Monet is the design-decision half of the workflow. It never reads your source; it answers what to build and checks what you report back.</p></div>
    <ol>{workflow.map((item) => <li key={item.step}><span className="workflow-step">{item.step}</span><b>{item.title}</b><p>{item.body}</p>{item.to ? <Link to={item.to}>{item.action} →</Link> : <span className="workflow-elsewhere">In your project</span>}</li>)}</ol>
  </section>;
}

function NewWorkspace() {
  return <section className="new-workspace">
    <div className="section-heading"><span className="eyebrow">Empty workspace</span><h2>Nothing decided here yet</h2><p>Monet read this directory and found no records. That is a valid starting point, not an error — every surface, the MCP server and <code>pnpm validate</code> included, treats it as a new design system.</p></div>
    <ol className="new-workspace-steps">
      <li><b>Write a principle</b><p>The beliefs that decide the close calls. They ship with every answer Monet gives an agent.</p><Link className="button primary" to="/principles">Add a principle</Link></li>
      <li><b>Define a foundation</b><p>Colour, spacing, and typography as named token values everything else refers to.</p><Link className="button" to="/foundations">Add a foundation</Link></li>
      <li><b>Copy the starter instead</b><p>A complete worked example is bundled with the repository. Copy it, then point <code>MONET_ROOT</code> at your copy.</p><Link className="button" to="/settings">Workspace settings</Link></li>
    </ol>
  </section>;
}

export function OverviewPage() {
  const { workspace } = useWorkspace();
  if (!workspace) return null;
  const empty = workspaceIsEmpty(workspace);
  const allComponents = taxonomyEntries(workspace);
  const allPrimitives = primitiveEntries(workspace);
  const decisionById = new Map(workspace.components.map((item) => [item.id, item]));
  const componentDecisionCounts = allComponents.reduce((counts, item) => {
    const status = decisionById.get(item.id)?.status ?? "undecided";
    if (status === "selected") counts.use += 1;
    if (status === "do_not_use") counts.noUse += 1;
    return counts;
  }, { use: 0, noUse: 0 });
  const primitiveById = new Map(workspace.primitives.map((item) => [item.id, item]));
  const primitiveDefined = allPrimitives.filter((item) => (primitiveById.get(item.id)?.status ?? "undecided") !== "undecided").length;
  const primitiveIds = new Set(allPrimitives.map((item) => item.id));
  const undefinedPrimitiveRefs = [...new Set(workspace.components.flatMap((component) => component.primitives).filter((primitive) => !primitiveIds.has(primitive)))];
  const tokenNames = new Set(workspace.resolvedTokens.map((token) => token.name));
  const undefinedPrimitiveTokenRefs = [...new Set(workspace.primitives.flatMap((primitive) => primitive.tokens).filter((token) => !tokenNames.has(token)))];
  const defined = <T extends { status: Status }>(items: T[]) => items.filter((item) => item.status !== "undecided").length;
  const coverage = componentDecisionCoverage(workspace);
  const recent = [
    ...workspace.principles.map((item) => ({ ...item, summary: markdownExcerpt(item.body), type: "Principle", route: `/principles/${item.id}` })),
    ...workspace.foundations.map((item) => ({ ...item, title: item.name, summary: item.description, type: "Foundation", route: `/foundations/${item.id}` })),
    ...(featureVisibility.primitives ? workspace.primitives.map((item) => ({ ...item, title: allPrimitives.find((entry) => entry.id === item.id)?.name ?? item.id, summary: item.purpose, type: "Primitive", route: `/primitives/${item.id}` })) : []),
    ...workspace.components.map((item) => ({ ...item, title: allComponents.find((entry) => entry.id === item.id)?.name ?? item.id, summary: item.notes || Object.entries(item.preferences).map(([key, value]) => `${key}=${value}`).join(", ") || "Component preference record", type: "Component", route: `/components/${item.id}` })),
    ...workspace.patterns.map((item) => ({ ...item, type: "Pattern", route: `/patterns/${item.id}` })),
    ...workspace.themes.map((item) => ({ ...item, title: item.name, summary: `${Object.keys(item.overrides).length} Foundation overrides${item.id === workspace.defaultThemeId ? " · default" : ""}`, type: "Theme", route: "/themes" })),
  ].filter((item) => item.updated_at).sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, RECENT_LIMIT);

  // Connecting an agent is the half of the product nothing else in the UI leads to, so it is the
  // primary action for a system that already has something to say. An empty workspace has to be
  // filled before any of that is true.
  const actions = empty
    ? <Link className="button primary" to="/principles">Add your first principle</Link>
    : <><Link className="button primary" to="/agent">Connect an agent</Link><Link className="button" to="/components">Browse components</Link></>;

  return <div className="page overview-page"><PageHeader eyebrow="Design system workspace" title="Design decisions your agents can read." description="Monet keeps principles, foundations, components, patterns, and themes as plain files in a directory you own, and serves them to coding agents over the Model Context Protocol (MCP). Decide something once here and every build gets the same answer." action={<div className="button-row">{actions}</div>} />
    <WorkspaceNotice />
    <WorkflowStrip />
    {empty ? <NewWorkspace /> : <>
      <section className="overview-grid">
        <div className="progress-panel"><div className="section-heading"><span className="eyebrow">Coverage</span><h2>What this system has decided</h2></div>
          <CountRow label="Principles" count={workspace.principles.length} detail="active principles" to="/principles" />
          <ProgressRow label="Foundations" defined={defined(workspace.foundations)} total={workspace.foundations.length} to="/foundations" />
          {featureVisibility.tokenRegistry && <CountRow label="Tokens" count={workspace.resolvedTokens.length} detail="canonical values defined" to="/tokens" />}
          {featureVisibility.primitives && <ProgressRow label="Primitives" defined={primitiveDefined} total={allPrimitives.length} to="/primitives" />}
          <ProgressRow label="Components" defined={coverage.decided} total={coverage.total} to="/components" />
          <ProgressRow label="Patterns" defined={defined(workspace.patterns)} total={workspace.patterns.length} to="/patterns" />
          <CountRow label="Themes" count={workspace.themes.length} detail={`${workspace.themes.find((theme) => theme.id === workspace.defaultThemeId)?.name ?? "Default"} resolves by default`} to="/themes" />
        </div>
        <div className="status-panel"><div className="section-heading"><span className="eyebrow">Components</span><h2>Decisions</h2></div><div className="status-tally binary"><div><strong>{componentDecisionCounts.use}</strong><small>Use</small></div><div><strong>{componentDecisionCounts.noUse}</strong><small>Do not use</small></div></div><p className="status-panel-note">{coverage.total - coverage.decided} concepts are still open. An undecided concept is answered honestly rather than guessed at.</p></div>
      </section>
      {((featureVisibility.tokenRegistry && workspace.tokenIssues.length > 0) || (featureVisibility.primitives && (undefinedPrimitiveTokenRefs.length > 0 || undefinedPrimitiveRefs.length > 0 || allPrimitives.length - primitiveDefined > 0))) && <section className="coverage-warnings"><div className="section-heading"><span className="eyebrow">Model health</span><h2>Useful next decisions</h2></div><div>{featureVisibility.tokenRegistry && workspace.tokenIssues.length > 0 && <Link to="/tokens"><strong>{workspace.tokenIssues.length}</strong><span>broken or circular token references</span><i>Review →</i></Link>}{featureVisibility.primitives && undefinedPrimitiveTokenRefs.length > 0 && <Link to="/primitives"><strong>{undefinedPrimitiveTokenRefs.length}</strong><span>undefined primitive token associations</span><i>Repair →</i></Link>}{featureVisibility.primitives && allPrimitives.length - primitiveDefined > 0 && <Link to="/primitives"><strong>{allPrimitives.length - primitiveDefined}</strong><span>primitives still undecided</span><i>Browse →</i></Link>}{featureVisibility.primitives && undefinedPrimitiveRefs.length > 0 && <Link to="/components"><strong>{undefinedPrimitiveRefs.length}</strong><span>undefined primitive references</span><i>Repair →</i></Link>}</div></section>}
      <section className="recent-section"><div className="section-heading row"><div><span className="eyebrow">Workspace activity</span><h2>Recently changed</h2></div><Link className="button ghost" to="/decisions">Decision log</Link></div><div className="recent-list">{recent.length ? recent.map((item) => <Link to={item.route} key={`${item.type}-${item.id}`}><span><small>{item.type}</small><b>{item.title}</b><p>{item.summary}</p></span><time>{formatDate(item.updated_at)}</time></Link>) : <div className="state-panel"><h2>Nothing saved yet</h2><p>Records show up here the first time Monet writes them to disk.</p></div>}</div></section>
    </>}
  </div>;
}
