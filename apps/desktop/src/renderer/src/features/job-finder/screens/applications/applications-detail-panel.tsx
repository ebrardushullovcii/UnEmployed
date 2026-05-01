import { useMemo } from "react";
import type {
  ApplicationAttempt,
  ApplicationRecord,
  ApplyRunDetails,
  JobFinderWorkspaceSnapshot,
} from "@unemployed/contracts";
import { StatusBadge } from "../../components/status-badge";
import { ApplicationsDetailPanelActivitySections } from "./applications-detail-panel-activity-sections";
import { ApplicationsDetailPanelEmptyState } from "./applications-detail-panel-empty-state";
import { buildQueueEntries } from "./applications-detail-panel-helpers";
import { ApplicationsDetailPanelOverviewSections } from "./applications-detail-panel-overview-sections";
import { ApplicationsDetailPanelRecoverySections } from "./applications-detail-panel-recovery-sections";
import { type ApplicationsViewFilter } from "./applications-filters";
import { getApplicationStagePresentation } from "./applications-status";

interface ApplicationsDetailPanelProps {
  activeFilter: ApplicationsViewFilter;
  applyRunDetails: ApplyRunDetails | null;
  applyRunDetailsTarget: {
    jobId: string;
    runId: string;
  } | null;
  applyRunDetailsError: string | null;
  applyRunDetailsStatus: "idle" | "loading" | "ready" | "error";
  applicationRecords: readonly ApplicationRecord[];
  applyJobResults: JobFinderWorkspaceSnapshot["applyJobResults"];
  discoveryJobs: JobFinderWorkspaceSnapshot["discoveryJobs"];
  applyRunHistory: Array<{
    result: JobFinderWorkspaceSnapshot["applyJobResults"][number];
    run: JobFinderWorkspaceSnapshot["applyRuns"][number] | null;
  }>;
  effectiveSelectedApplyResult:
    | JobFinderWorkspaceSnapshot["applyJobResults"][number]
    | null;
  hasAnyApplications: boolean;
  hasVisibleApplications: boolean;
  isApplyPending: boolean;
  isApplyRequestPending: (requestId: string) => boolean;
  isApplyRunPending: (runId: string) => boolean;
  onApproveApplyRun: (runId: string) => void;
  onCancelApplyRun: (runId: string) => void;
  onResolveApplyConsentRequest: (
    requestId: string,
    action: "approve" | "decline",
  ) => void;
  onRevokeApplyRunApproval: (runId: string) => void;
  onSelectApplyRun: (runId: string) => void;
  onStartApplyCopilot: (jobId: string) => void;
  onStartAutoApply: (jobId: string) => void;
  onStartAutoApplyQueue: (jobIds: string[]) => void;
  selectedApplyRunId: string | null;
  selectedAttempt: ApplicationAttempt | null;
  selectedRecord: ApplicationRecord | null;
}

export function ApplicationsDetailPanel({
  activeFilter,
  applyRunDetails,
  applyRunDetailsTarget,
  applyRunDetailsError,
  applyRunDetailsStatus,
  applicationRecords,
  applyJobResults,
  discoveryJobs,
  applyRunHistory,
  effectiveSelectedApplyResult,
  hasAnyApplications,
  hasVisibleApplications,
  isApplyPending,
  isApplyRequestPending,
  isApplyRunPending,
  onApproveApplyRun,
  onCancelApplyRun,
  onResolveApplyConsentRequest,
  onRevokeApplyRunApproval,
  onSelectApplyRun,
  onStartApplyCopilot,
  onStartAutoApply,
  onStartAutoApplyQueue,
  selectedApplyRunId,
  selectedAttempt,
  selectedRecord,
}: ApplicationsDetailPanelProps) {
  const visibleApplyResult = effectiveSelectedApplyResult;
  const canRestageAutoRun =
    selectedRecord?.status === "approved" ||
    selectedRecord?.status === "ready_for_review";
  const selectedRunHistoryEntry = useMemo(
    () =>
      applyRunHistory.find(({ result }) => result.runId === selectedApplyRunId) ??
      null,
    [applyRunHistory, selectedApplyRunId],
  );
  const selectedApplyRunDetails = useMemo(
    () =>
      applyRunDetailsStatus === "ready" &&
      selectedRecord != null &&
      applyRunDetailsTarget?.jobId === selectedRecord.jobId &&
      applyRunDetailsTarget.runId === selectedApplyRunId &&
      applyRunDetails?.run?.id === selectedApplyRunId
        ? applyRunDetails
        : null,
    [
      applyRunDetails,
      applyRunDetailsStatus,
      applyRunDetailsTarget,
      selectedApplyRunId,
      selectedRecord,
    ],
  );
  const selectedRun = selectedApplyRunDetails
    ? selectedApplyRunDetails.run
    : (selectedRunHistoryEntry?.run ?? null);
  const visibleApplyRunId =
    selectedApplyRunDetails?.run.id ?? visibleApplyResult?.runId ?? null;
  const selectedQueueEntries = useMemo(
    () =>
      buildQueueEntries({
        applicationRecords,
        applyJobResults,
        discoveryJobs,
        selectedRun,
      }),
    [applicationRecords, applyJobResults, discoveryJobs, selectedRun],
  );
  const selectedQueueRecoveryEntries = selectedQueueEntries.filter(
    (entry) => entry.includeInRecovery,
  );
  const selectedQueueRecoveryJobIds = selectedQueueRecoveryEntries.map(
    (entry) => entry.jobId,
  );
  const excludedQueueRecoveryEntries = selectedQueueEntries.filter(
    (entry) => !entry.includeInRecovery,
  );
  const canRestageQueueRun =
    selectedRun?.mode === "queue_auto" && selectedQueueRecoveryJobIds.length > 0;
  const isSelectedRunPending = selectedRun ? isApplyRunPending(selectedRun.id) : false;
  const selectedStage = selectedRecord
    ? getApplicationStagePresentation(selectedRecord)
    : null;

  return (
    <section className="surface-panel-shell relative flex min-h-124 min-w-0 flex-col gap-6 overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border) px-8 py-5 xl:h-full xl:min-h-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-1">
          <p className="label-mono-xs">Details</p>
          {selectedRecord ? (
            <strong className="text-(length:--text-body) text-(--text-headline)">
              {selectedRecord.company}
            </strong>
          ) : (
            <strong className="text-(length:--text-body) text-muted-foreground">
              Nothing selected
            </strong>
          )}
        </div>
        <StatusBadge tone={selectedStage ? selectedStage.tone : "muted"}>
          {selectedRecord ? selectedStage?.label : "Nothing selected"}
        </StatusBadge>
      </div>
      {selectedRecord ? (
        <div className="grid min-h-0 min-w-0 flex-1 content-start gap-6 overflow-y-auto pr-1">
          <ApplicationsDetailPanelOverviewSections
            selectedAttempt={selectedAttempt}
            selectedRecord={selectedRecord}
            visibleApplyResult={visibleApplyResult}
            visibleApplyRunId={visibleApplyRunId}
          />
          <ApplicationsDetailPanelRecoverySections
            applyRunHistory={applyRunHistory}
            canRestageAutoRun={canRestageAutoRun}
            canRestageQueueRun={canRestageQueueRun}
            excludedQueueRecoveryEntries={excludedQueueRecoveryEntries}
            isApplyPending={isApplyPending}
            isApplyRunPending={isApplyRunPending}
            isSelectedRunPending={isSelectedRunPending}
            onApproveApplyRun={onApproveApplyRun}
            onCancelApplyRun={onCancelApplyRun}
            onRevokeApplyRunApproval={onRevokeApplyRunApproval}
            onSelectApplyRun={onSelectApplyRun}
            onStartApplyCopilot={onStartApplyCopilot}
            onStartAutoApply={onStartAutoApply}
            onStartAutoApplyQueue={onStartAutoApplyQueue}
            selectedApplyRunDetails={selectedApplyRunDetails}
            selectedApplyRunId={selectedApplyRunId}
            selectedQueueOutcomeEntries={selectedQueueEntries}
            selectedQueueRecoveryEntries={selectedQueueRecoveryEntries}
            selectedQueueRecoveryJobIds={selectedQueueRecoveryJobIds}
            selectedRecordJobId={selectedRecord.jobId}
            selectedRun={selectedRun}
            visibleApplyResult={visibleApplyResult}
          />
          <ApplicationsDetailPanelActivitySections
            applyRunDetailsError={applyRunDetailsError}
            applyRunDetailsStatus={applyRunDetailsStatus}
            isApplyRequestPending={isApplyRequestPending}
            onResolveApplyConsentRequest={onResolveApplyConsentRequest}
            selectedApplyRunDetails={selectedApplyRunDetails}
            selectedAttempt={selectedAttempt}
            selectedRecord={selectedRecord}
            visibleApplyResult={visibleApplyResult}
          />
        </div>
      ) : (
        <ApplicationsDetailPanelEmptyState
          activeFilter={activeFilter}
          hasAnyApplications={hasAnyApplications}
          hasVisibleApplications={hasVisibleApplications}
        />
      )}
    </section>
  );
}
