import type {
  GlobalDailyApplicationPreparationCapacity,
  JobFinderExactApplicationTarget,
  JobFinderWorkspaceSnapshot,
} from "@unemployed/contracts";
import type { QueueEntry } from "./applications-detail-panel-helpers";
import {
  ApplicationsDetailPanelRecoveryActionsSection,
  type ConfirmFinishedInBrowserStatus,
  type FinishInBrowserHandler,
  type FinishInBrowserInput,
} from "./applications-detail-panel-recovery-actions-section";

/**
 * Recovery keeps only the action group here; the per-run history now lives in
 * the collapsed Technical details block rendered by the activity sections.
 */
export function ApplicationsDetailPanelRecoverySections(props: {
  canRestageAutoRun: boolean;
  canRestageQueueRun: boolean;
  dailyPreparationCapacity: GlobalDailyApplicationPreparationCapacity | null;
  excludedQueueRecoveryEntries: QueueEntry[];
  isApplyPending: boolean;
  onStartApplyCopilot: (input: JobFinderExactApplicationTarget) => void;
  onStartAutoApply: (input: JobFinderExactApplicationTarget) => void;
  onStartAutoApplyQueue: (jobIds: string[]) => void;
  onOpenSafeguards?: () => void;
  /**
   * Pass-through only. The declared return type has to match the leaf's, or
   * the outcome the leaf uses to decide what the hand-off status claims would
   * be under-reported at every intermediate hop.
   */
  onFinishInBrowser?: FinishInBrowserHandler;
  onConfirmFinishedInBrowser?: (input: FinishInBrowserInput) => void;
  canConfirmFinishedInBrowser?: boolean;
  confirmFinishedInBrowserStatus?: ConfirmFinishedInBrowserStatus;
  confirmFinishedInBrowserBlockerText?: string | null;
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
    canRestageAutoRun,
    canRestageQueueRun,
    dailyPreparationCapacity,
    excludedQueueRecoveryEntries,
    isApplyPending,
    onStartApplyCopilot,
    onStartAutoApply,
    onStartAutoApplyQueue,
    onOpenSafeguards,
    onFinishInBrowser,
    onConfirmFinishedInBrowser,
    canConfirmFinishedInBrowser,
    confirmFinishedInBrowserStatus,
    confirmFinishedInBrowserBlockerText,
    selectedQueueOutcomeEntries,
    selectedQueueRecoveryEntries,
    selectedQueueRecoveryJobIds,
    selectedApplicationRecordId,
    selectedRecordJobId,
    selectedRun,
    visibleApplyResult,
  } = props;

  return (
    <ApplicationsDetailPanelRecoveryActionsSection
      canRestageAutoRun={canRestageAutoRun}
      canRestageQueueRun={canRestageQueueRun}
      dailyPreparationCapacity={dailyPreparationCapacity}
      excludedQueueRecoveryEntries={excludedQueueRecoveryEntries}
      isApplyPending={isApplyPending}
      onStartApplyCopilot={onStartApplyCopilot}
      onStartAutoApply={onStartAutoApply}
      onStartAutoApplyQueue={onStartAutoApplyQueue}
      {...(onOpenSafeguards ? { onOpenSafeguards } : {})}
      {...(onFinishInBrowser ? { onFinishInBrowser } : {})}
      {...(onConfirmFinishedInBrowser ? { onConfirmFinishedInBrowser } : {})}
      canConfirmFinishedInBrowser={canConfirmFinishedInBrowser ?? false}
      confirmFinishedInBrowserStatus={confirmFinishedInBrowserStatus ?? "idle"}
      confirmFinishedInBrowserBlockerText={
        confirmFinishedInBrowserBlockerText ?? null
      }
      selectedQueueOutcomeEntries={selectedQueueOutcomeEntries}
      selectedQueueRecoveryEntries={selectedQueueRecoveryEntries}
      selectedQueueRecoveryJobIds={selectedQueueRecoveryJobIds}
      selectedApplicationRecordId={selectedApplicationRecordId}
      selectedRecordJobId={selectedRecordJobId}
      selectedRun={selectedRun}
      visibleApplyResult={visibleApplyResult}
    />
  );
}
