import { Link } from "react-router-dom";
import { PageHeader, formatDate } from "../components/Common";
import { markdownExcerpt, primitiveEntries, taxonomyEntries, type Status } from "../domain";
import { featureVisibility } from "../featureVisibility";
import { useWorkspace } from "../WorkspaceContext";

function ProgressRow({ label, defined, total, to }: { label: string; defined: number; total: number; to: string }) {
  const percentage = total ? Math.round((defined / total) * 100) : 0;
  return <Link className="progress-row" to={to}><span><b>{label}</b><small>{defined} of {total} defined</small></span><span className="progress-track"><i style={{ width: `${percentage}%` }} /></span><strong>{percentage}%</strong></Link>;
}

function CountRow({ label, count, detail, to }: { label: string; count: number; detail: string; to: string }) {
  return <Link className="progress-row count-row" to={to}><span><b>{label}</b><small>{detail}</small></span><span /><strong>{count}</strong></Link>;
}

export function OverviewPage() {
  const { workspace } = useWorkspace();
  if (!workspace) return null;
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
  const recent = [
    ...workspace.principles.map((item) => ({ ...item, summary: markdownExcerpt(item.body), type: "Principle", route: `/principles/${item.id}` })),
    ...workspace.foundations.map((item) => ({ ...item, title: item.name, summary: item.description, type: "Foundation", route: `/foundations/${item.id}` })),
    ...(featureVisibility.primitives ? workspace.primitives.map((item) => ({ ...item, title: allPrimitives.find((entry) => entry.id === item.id)?.name ?? item.id, summary: item.purpose, type: "Primitive", route: `/primitives/${item.id}` })) : []),
    ...workspace.components.map((item) => ({ ...item, title: allComponents.find((entry) => entry.id === item.id)?.name ?? item.id, summary: item.notes || Object.entries(item.preferences).map(([key, value]) => `${key}=${value}`).join(", ") || "Component preference record", type: "Component", route: `/components/${item.id}` })),
    ...workspace.patterns.map((item) => ({ ...item, type: "Pattern", route: `/patterns/${item.id}` })),
    ...workspace.themes.map((item) => ({ ...item, title: item.name, summary: `${Object.keys(item.overrides).length} Foundation overrides${item.id === workspace.defaultThemeId ? " · default" : ""}`, type: "Theme", route: "/themes" })),
  ].filter((item) => item.updated_at).sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  return <div className="page overview-page"><PageHeader eyebrow="Personal design system" title="Make design intent durable." description="Browse the system, resolve one decision at a time, and leave portable guidance for the next project." action={<Link className="button primary" to="/components/button">Continue with Button</Link>} />
    <section className="overview-grid">
      <div className="progress-panel"><div className="section-heading"><span className="eyebrow">Coverage</span><h2>Design system progress</h2></div>
        <CountRow label="Principles" count={workspace.principles.length} detail="active principles" to="/principles" />
        <ProgressRow label="Foundations" defined={defined(workspace.foundations)} total={workspace.foundations.length} to="/foundations" />
        {featureVisibility.tokenRegistry && <CountRow label="Tokens" count={workspace.resolvedTokens.length} detail="canonical values defined" to="/tokens" />}
        {featureVisibility.primitives && <ProgressRow label="Primitives" defined={primitiveDefined} total={allPrimitives.length} to="/primitives" />}
        <ProgressRow label="Components" defined={componentDecisionCounts.use + componentDecisionCounts.noUse} total={allComponents.length} to="/components" />
        <ProgressRow label="Patterns" defined={defined(workspace.patterns)} total={workspace.patterns.length} to="/patterns" />
        <CountRow label="Themes" count={workspace.themes.length} detail={`${workspace.themes.find((theme) => theme.id === workspace.defaultThemeId)?.name ?? "Default"} resolves by default`} to="/themes" />
      </div>
      <div className="status-panel"><div className="section-heading"><span className="eyebrow">Components</span><h2>Decisions</h2></div><div className="status-tally binary"><div><span className="status-pill selected">Use</span><strong>{componentDecisionCounts.use}</strong><small>Use</small></div><div><span className="status-pill do_not_use">No use</span><strong>{componentDecisionCounts.noUse}</strong><small>No use</small></div></div></div>
    </section>
    {((featureVisibility.tokenRegistry && workspace.tokenIssues.length > 0) || (featureVisibility.primitives && (undefinedPrimitiveTokenRefs.length > 0 || undefinedPrimitiveRefs.length > 0 || allPrimitives.length - primitiveDefined > 0))) && <section className="coverage-warnings"><div className="section-heading"><span className="eyebrow">Model health</span><h2>Useful next decisions</h2></div><div>{featureVisibility.tokenRegistry && workspace.tokenIssues.length > 0 && <Link to="/tokens"><strong>{workspace.tokenIssues.length}</strong><span>broken or circular token references</span><i>Review →</i></Link>}{featureVisibility.primitives && undefinedPrimitiveTokenRefs.length > 0 && <Link to="/primitives"><strong>{undefinedPrimitiveTokenRefs.length}</strong><span>undefined primitive token associations</span><i>Repair →</i></Link>}{featureVisibility.primitives && allPrimitives.length - primitiveDefined > 0 && <Link to="/primitives"><strong>{allPrimitives.length - primitiveDefined}</strong><span>primitives still undecided</span><i>Browse →</i></Link>}{featureVisibility.primitives && undefinedPrimitiveRefs.length > 0 && <Link to="/components"><strong>{undefinedPrimitiveRefs.length}</strong><span>undefined primitive references</span><i>Repair →</i></Link>}</div></section>}
    <section className="recent-section"><div className="section-heading"><span className="eyebrow">Workspace activity</span><h2>Recently changed</h2></div><div className="recent-list">{recent.map((item) => <Link to={item.route} key={`${item.type}-${item.id}`}><span><small>{item.type}</small><b>{item.title}</b><p>{item.summary}</p></span><time>{formatDate(item.updated_at)}</time></Link>)}</div></section>
  </div>;
}
