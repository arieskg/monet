import { Link } from "react-router-dom";
import { PageHeader, formatDate } from "../components/Common";
import { taxonomyEntries } from "../domain";
import { useWorkspace } from "../WorkspaceContext";

export function DecisionsPage() {
  const { workspace } = useWorkspace();
  if (!workspace) return null;
  const entries = taxonomyEntries(workspace);
  const history = workspace.components.flatMap((component) => component.history.map((item) => ({ ...item, componentId: component.id, componentName: entries.find((entry) => entry.id === component.id)?.name ?? component.id }))).sort((a, b) => b.date.localeCompare(a.date));
  return <div className="page narrow-page"><PageHeader eyebrow="Human rationale" title="Decision log" description="A concise record of meaningful design choices, written when a component’s inspiration changes. Git remains the low-level file history." />
    <div className="decision-timeline">{history.length ? history.map((item) => <article key={`${item.componentId}-${item.date}`}><time>{formatDate(item.date)}</time><div><span className="eyebrow">Component</span><h2><Link to={`/components/${item.componentId}`}>{item.componentName}</Link></h2><p>{item.change}</p><div className="decision-change"><span>{item.old_selection ?? "No selection"}</span><i>→</i><strong>{item.new_selection ?? "No selection"}</strong></div>{item.rationale && <blockquote>{item.rationale}</blockquote>}</div></article>) : <div className="state-panel"><h2>No component changes yet</h2><p>Choosing an inspiration on a component writes a readable entry here, alongside the record itself.</p><Link className="button" to="/components">Browse components</Link></div>}</div>
  </div>;
}
