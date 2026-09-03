import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { mappingsNeedingReview } from "../domain";
import { useWorkspace } from "../WorkspaceContext";
import { PageHeader } from "./Common";

export function SourcesHeader({ action }: { action?: ReactNode }) {
  return <PageHeader eyebrow="External catalog" title="Sources" description="Add reference systems, map their vocabulary into Monet, and resolve uncertain mappings in one workflow." action={action} />;
}

export function SourceViewTabs({ reviewCount }: { reviewCount?: number }) {
  const { workspace } = useWorkspace();
  const location = useLocation();
  const queueActive = location.pathname === "/sources/review";
  const unresolvedCount = reviewCount ?? (workspace ? mappingsNeedingReview(workspace).length : 0);

  return <nav className="source-view-tabs" aria-label="Source views" role="tablist">
    <Link id="sources-tab" role="tab" aria-selected={!queueActive} aria-controls="sources-panel" className={!queueActive ? "active" : ""} to="/sources">Sources</Link>
    <Link id="review-queue-tab" role="tab" aria-selected={queueActive} aria-controls="review-queue-panel" className={queueActive ? "active" : ""} to="/sources/review">Review Queue · <span aria-live="polite">{unresolvedCount}</span></Link>
  </nav>;
}
