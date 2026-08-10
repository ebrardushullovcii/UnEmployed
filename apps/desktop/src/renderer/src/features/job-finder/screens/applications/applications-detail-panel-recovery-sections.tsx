import type { JobFinderWorkspaceSnapshot } from "@unemployed/contracts";
import type { QueueEntry } from "./applications-detail-panel-helpers";
import { ApplicationsDetailPanelRecoveryActionsSection } from "./applications-detail-panel-recovery-actions-section";
import { ApplicationsDetailPanelRunHistorySection } from "./applications-detail-panel-run-history-section";

export function ApplicationsDetailPanelRecoverySections(props: {
  applyRunHistory: Array<{
    result: JobFinderWorkspaceSnapshot["applyJobResults"][number];
    run: JobFinderWorkspaceSnapshot["applyRuns"][number] | null;
  }>;
  canRestageAutoRun: boolean;
  canRestageQueueRun: boolean;
  excludedQueueRecoveryEntries: QueueEntry[];
  isApplyPending: boolean;
  onSelectApplyRun: (runId: string) => void;
  onStartApplyCopilot: (jobId: string) => void;
  onStartAutoApply: (jobId: string) => void;
  onStartAutoApplyQueue: (jobIds: string[]) => void;
  selectedApplyRunId: string | null;
  selectedQueueOutcomeEntries: QueueEntry[];
  selectedQueueRecoveryEntries: QueueEntry[];
  selectedQueueRecoveryJobIds: string[];
  selectedRecordJobId: string;
  selectedRun: JobFinderWorkspaceSnapshot["applyRuns"][number] | null;
  visibleApplyResult: JobFinderWorkspaceSnapshot["applyJobResults"][number] | null;
}) {
  const {
    applyRunHistory,
    canRestageAutoRun,
    canRestageQueueRun,
    excludedQueueRecoveryEntries,
    isApplyPending,
    onSelectApplyRun,
    onStartApplyCopilot,
    onStartAutoApply,
    onStartAutoApplyQueue,
    selectedApplyRunId,
    selectedQueueOutcomeEntries,
    selectedQueueRecoveryEntries,
    selectedQueueRecoveryJobIds,
    selectedRecordJobId,
    selectedRun,
    visibleApplyResult,
  } = props;

  return (
    <>
      <ApplicationsDetailPanelRecoveryActionsSection
        applyRunHistoryCount={applyRunHistory.length}
        canRestageAutoRun={canRestageAutoRun}
        canRestageQueueRun={canRestageQueueRun}
        excludedQueueRecoveryEntries={excludedQueueRecoveryEntries}
        isApplyPending={isApplyPending}
        onStartApplyCopilot={onStartApplyCopilot}
        onStartAutoApply={onStartAutoApply}
        onStartAutoApplyQueue={onStartAutoApplyQueue}
        selectedQueueOutcomeEntries={selectedQueueOutcomeEntries}
        selectedQueueRecoveryEntries={selectedQueueRecoveryEntries}
        selectedQueueRecoveryJobIds={selectedQueueRecoveryJobIds}
        selectedRecordJobId={selectedRecordJobId}
        selectedRun={selectedRun}
        visibleApplyResult={visibleApplyResult}
      />
      <ApplicationsDetailPanelRunHistorySection
        applyRunHistory={applyRunHistory}
        onSelectApplyRun={onSelectApplyRun}
        selectedApplyRunId={selectedApplyRunId}
      />
    </>
  );
}
