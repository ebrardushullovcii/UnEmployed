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
  onStartAutoApplyQueue: (jobIds: string[]) => void;
  onOpenSafeguards?: () => void;
  onOpenNeedsYou?: () => void;
  onAllowSiteSaves?: (host: string | null) => void;
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
  pausedQuestionCount?: number | null;
  selectedRecordJobId: string;
  selectedApplicationRecordId: string;
  selectedRecordLatestBlockerCode?: string | null;
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
    onStartAutoApplyQueue,
    onOpenSafeguards,
    onOpenNeedsYou,
    onAllowSiteSaves,
    onFinishInBrowser,
    onConfirmFinishedInBrowser,
    canConfirmFinishedInBrowser,
    confirmFinishedInBrowserStatus,
    confirmFinishedInBrowserBlockerText,
    selectedQueueOutcomeEntries,
    selectedQueueRecoveryEntries,
    selectedQueueRecoveryJobIds,
    selectedApplicationRecordId,
    selectedRecordLatestBlockerCode,
    pausedQuestionCount,
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
      onStartAutoApplyQueue={onStartAutoApplyQueue}
      {...(onOpenSafeguards ? { onOpenSafeguards } : {})}
      {...(onOpenNeedsYou ? { onOpenNeedsYou } : {})}
      {...(onAllowSiteSaves ? { onAllowSiteSaves } : {})}
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
      {...(selectedRecordLatestBlockerCode !== undefined
        ? { selectedRecordLatestBlockerCode }
        : {})}
      pausedQuestionCount={pausedQuestionCount ?? null}
      selectedRecordJobId={selectedRecordJobId}
      selectedRun={selectedRun}
      visibleApplyResult={visibleApplyResult}
    />
  );
}
