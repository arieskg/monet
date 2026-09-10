import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { ApplicationReceipt } from "../../shared/proposals";
import { api } from "../api";
import { PageHeader, formatDate } from "../components/Common";
import { taxonomyEntries } from "../domain";
import { useWorkspace } from "../WorkspaceContext";

/** Applied Gap proposals, from their receipts. Rolled-back attempts are listed too: an audit log that hides failures is not one. */
export function AppliedProposals({ receipts }: { receipts: ApplicationReceipt[] }) {
  if (!receipts.length) return null;
  return <section className="decision-applications" aria-label="Applied Gap proposals">
    <span className="eyebrow">Gaps</span>
    <h2>Applied Gap proposals</h2>
    <p className="muted">Each receipt records which canonical records an approved proposal changed, the before and after file hashes, and the validation result. Rolled-back attempts stay on record.</p>
    <ul>{receipts.map((receipt) => <li key={receipt.id}>
      <time>{formatDate(receipt.finished_at)}</time>
      <span className={`status-pill ${receipt.outcome === "applied" ? "proposal-applied" : "proposal-rejected"}`}>{receipt.outcome === "applied" ? (receipt.recovered ? "Applied · recovered" : "Applied") : !receipt.restored ? "Restore unverified · editing blocked" : receipt.recovered ? "Rolled back at startup · verified" : "Rolled back · verified"}</span>
      <Link to={`/proposals/${receipt.proposal_id}`}>Proposal revision {receipt.revision}</Link>
      <span>{receipt.records.map((record, index) => <span key={record.key}>{index ? ", " : ""}{record.route ? <Link to={record.route}>{record.title}</Link> : record.title}</span>)}</span>
    </li>)}</ul>
  </section>;
}

export function DecisionsPage() {
  const { workspace } = useWorkspace();
  const [receipts, setReceipts] = useState<ApplicationReceipt[]>([]);
  const [receiptError, setReceiptError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { let active = true; api.applications().then((value) => { if (active) { setReceipts(value); setReceiptError(""); } }).catch((error) => { if (active) setReceiptError(error instanceof Error ? error.message : "Could not load application receipts."); }); return () => { active = false; }; }, [attempt]);
  if (!workspace) return null;
  const entries = taxonomyEntries(workspace);
  const history = workspace.components.flatMap((component) => component.history.map((item) => ({ ...item, componentId: component.id, componentName: entries.find((entry) => entry.id === component.id)?.name ?? component.id }))).sort((a, b) => b.date.localeCompare(a.date));
  return <div className="page narrow-page"><PageHeader eyebrow="Human rationale" title="Decision log" description="A concise record of meaningful design choices, written when a component’s inspiration changes or an approved Gap proposal is applied. Git remains the low-level file history." />
    <div className="decision-timeline">{history.length ? history.map((item) => <article key={`${item.componentId}-${item.date}`}><time>{formatDate(item.date)}</time><div><span className="eyebrow">Component</span><h2><Link to={`/components/${item.componentId}`}>{item.componentName}</Link></h2><p>{item.change}</p><div className="decision-change"><span>{item.old_selection ?? "No selection"}</span><i>→</i><strong>{item.new_selection ?? "No selection"}</strong></div>{item.rationale && <blockquote>{item.rationale}</blockquote>}</div></article>) : <div className="state-panel"><h2>No component changes yet</h2><p>Choosing an inspiration on a component writes a readable entry here, alongside the record itself.</p><Link className="button" to="/components">Browse components</Link></div>}</div>
    {receiptError && <div className="gap-error" role="alert">Could not load application receipts: {receiptError} <button className="button" onClick={() => setAttempt((value) => value + 1)}>Retry</button></div>}
    <AppliedProposals receipts={receipts} />
  </div>;
}
