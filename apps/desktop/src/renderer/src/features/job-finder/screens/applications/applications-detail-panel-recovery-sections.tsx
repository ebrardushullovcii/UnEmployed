import type {
  GlobalDailyApplicationPreparationCapacity,
  JobFinderExactApplicationTarget,
  JobFinderWorkspaceSnapshot,
} from "@unemployed/contracts";
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
  dailyPreparationCapacity: GlobalDailyApplicationPreparationCapacity | null;
  excludedQueueRecoveryEntries: QueueEntry[];
  isApplyPending: boolean;
  onSelectApplyRun: (runId: string) => void;
  onStartApplyCopilot: (input: JobFinderExactApplicationTarget) => void;
  onStartAutoApply: (input: JobFinderExactApplicationTarget) => void;
  onStartAutoApplyQueue: (jobIds: string[]) => void;
  selectedApplyRunId: string | null;
  selectedQueueOutcomeEntries: QueueEntry[];
  selectedQueueRecoveryEntries: QueueEntry[];
  selectedQueueRecoveryJobIds: string[];
  selectedRecordJobId: string;
  selectedApplicationRecordId: string;
  selectedRun: JobFinderWorkspaceSnapshot["applyRuns"][number] | null;
  visibleApplyResult:
    | JobFinderWorkspaceSnapshot["applyJobResults"][number]
    | null;
}) {
  const {
    applyRunHistory,
    canRestageAutoRun,
    canRestageQueueRun,
    dailyPreparationCapacity,
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
    selectedApplicationRecordId,
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
        dailyPreparationCapacity={dailyPreparationCapacity}
        excludedQueueRecoveryEntries={excludedQueueRecoveryEntries}
        isApplyPending={isApplyPending}
        onStartApplyCopilot={onStartApplyCopilot}
        onStartAutoApply={onStartAutoApply}
        onStartAutoApplyQueue={onStartAutoApplyQueue}
        selectedQueueOutcomeEntries={selectedQueueOutcomeEntries}
        selectedQueueRecoveryEntries={selectedQueueRecoveryEntries}
        selectedQueueRecoveryJobIds={selectedQueueRecoveryJobIds}
        selectedApplicationRecordId={selectedApplicationRecordId}
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
