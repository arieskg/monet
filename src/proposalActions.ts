import { approvalBlockers, type ProposalView } from "../shared/proposals";

/** Which closure and refresh actions the server would accept, so the buttons match its rules. */
export function proposalActions(proposal: ProposalView, dirty: boolean): { reject: boolean; supersede: boolean; refresh: boolean; approve: boolean } {
  const closed = proposal.status === "rejected" || proposal.status === "superseded";
  const latest = proposal.revisions[proposal.revisions.length - 1];
  const { staleness } = proposal;
  return {
    reject: !closed,
    supersede: !closed && !staleness.gap_missing,
    refresh: !closed && Boolean(latest) && !staleness.gap_missing && !staleness.diagnosis_changed && (staleness.changed_targets.length > 0 || staleness.missing_targets.length > 0 || staleness.knowledge_changed),
    approve: !dirty && approvalBlockers(proposal).length === 0,
  };
}
