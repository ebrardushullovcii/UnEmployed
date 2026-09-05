import type {
  GroupedManualAnswerDecision,
  JobFinderWorkspaceSnapshot,
} from "@unemployed/contracts";

/**
 * The one renderer-side owner of the "Needs you" population.
 *
 * Before this module the same twenty lines existed twice — once in
 * `job-finder-shell.tsx` for the badge and once in `job-search-home-screen.tsx`
 * for Home's next action — and `campaign-dashboard.ts` derived a third,
 * un-collapsed number. One grouped decision covering three questions therefore
 * read as 1 in the badge, 3 on Home and 0 in the Needs you toolbar.
 *
 * The population is: every user action request that is not in a final state,
 * minus the requests a pending grouped decision already represents, plus one
 * entry per pending grouped decision. That is exactly what the Needs you screen
 * renders, so the badge and the page cannot disagree.
 */
const FINAL_ACTION_REQUEST_STATES: readonly string[] = [
  "resolved",
  "skipped",
  "cancelled",
  "expired",
  "superseded",
];

export interface NeedsYouCountInput {
  groupedDecisions?: readonly GroupedManualAnswerDecision[] | undefined;
  requests?: JobFinderWorkspaceSnapshot["userActionRequests"] | undefined;
}

export function countNeedsYouItems({
  groupedDecisions,
  requests,
}: NeedsYouCountInput): number {
  const unresolved = (requests ?? []).filter(
    (request) => !FINAL_ACTION_REQUEST_STATES.includes(request.state),
  );
  const pendingDecisions = (groupedDecisions ?? []).filter(
    (decision) => decision.approval === "pending",
  );
  // A pending grouped decision represents its member requests on the Needs you
  // screen, so the count counts the decision card instead of the hidden
  // ordinary member cards.
  const representedRequestIds = new Set(
    pendingDecisions.flatMap((decision) =>
      decision.lineage.map((entry) => entry.requestId),
    ),
  );
  const unrepresentedRequests = unresolved.filter(
    (request) => !representedRequestIds.has(request.id),
  );

  return unrepresentedRequests.length + pendingDecisions.length;
}

/** Convenience reader for callers that already hold the whole snapshot. */
export function countWorkspaceNeedsYouItems(
  workspace: JobFinderWorkspaceSnapshot,
): number {
  return countNeedsYouItems({
    groupedDecisions: workspace.intelligence?.groupedDecisions ?? [],
    requests: workspace.userActionRequests ?? [],
  });
}
