import type {
  GroupedManualAnswerDecision,
  JobFinderWorkspaceSnapshot,
} from "@unemployed/contracts";
import { projectPlanSafeguardPauses } from "@unemployed/job-finder/plan-safeguard-pauses";
import { applicationRecordAwaitsUser } from "../screens/applications/applications-status";

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
  /**
   * Applications the Applications screen badges "Needs you". They belong to
   * the same population: an application paused on a site step the person has
   * to finish was badged NEEDS YOU while this count said "0 unresolved",
   * because it only ever counted live browser-step requests.
   */
  applicationRecords?:
    | readonly JobFinderWorkspaceSnapshot["applicationRecords"][number][]
    | undefined;
  groupedDecisions?: readonly GroupedManualAnswerDecision[] | undefined;
  requests?:
    | readonly JobFinderWorkspaceSnapshot["userActionRequests"][number][]
    | undefined;
}

/** The application-record ledger is the one application population. */
export function countApplicationLedgerEntries<TRecord extends { jobId: string }>(
  records: readonly TRecord[],
  jobIds?: ReadonlySet<string>,
): number {
  return jobIds
    ? records.filter((record) => jobIds.has(record.jobId)).length
    : records.length;
}

/**
 * Applications waiting on the person that no live request already represents.
 * Exported so the Needs you screen lists exactly what the badge counts.
 */
export function listApplicationsAwaitingUser({
  applicationRecords,
  requests,
}: Pick<
  NeedsYouCountInput,
  "applicationRecords" | "requests"
>): readonly JobFinderWorkspaceSnapshot["applicationRecords"][number][] {
  const records = applicationRecords ?? [];
  if (records.length === 0) return records;

  const coveredRecordIds = new Set(
    (requests ?? [])
      .filter((request) => !FINAL_ACTION_REQUEST_STATES.includes(request.state))
      .flatMap((request) =>
        request.scope?.type === "application" &&
        request.scope.applicationRecordId
          ? [request.scope.applicationRecordId]
          : [],
      ),
  );

  return records.filter(
    (record) =>
      !coveredRecordIds.has(record.id) && applicationRecordAwaitsUser(record),
  );
}

export function countNeedsYouItems({
  applicationRecords,
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

  return (
    unrepresentedRequests.length +
    pendingDecisions.length +
    listApplicationsAwaitingUser({ applicationRecords, requests }).length
  );
}

/** Convenience reader for callers that already hold the whole snapshot. */
export function countWorkspaceNeedsYouItems(
  workspace: JobFinderWorkspaceSnapshot,
): number {
  return projectPlanSafeguardPauses(workspace.intelligence?.safeguards, workspace.campaigns).length + countNeedsYouItems({
    applicationRecords: workspace.applicationRecords ?? [],
    groupedDecisions: workspace.intelligence?.groupedDecisions ?? [],
    requests: workspace.userActionRequests ?? [],
  });
}
