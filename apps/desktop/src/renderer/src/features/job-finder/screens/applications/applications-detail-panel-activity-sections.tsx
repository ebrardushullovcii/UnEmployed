import { ApplicationsDisclosureSummary } from "./applications-disclosure-summary";
import type {
  ApplicationAttempt,
  ApplicationRecord,
  ApplyRunDetails,
  ClearApplicationAnswerCommandInput,
  JobFinderWorkspaceSnapshot,
  JobFinderApplyConsentActionInput,
  JobFinderApplyRunDetailsQuery,
  SaveApplicationAnswerCommandInput,
} from "@unemployed/contracts";
import { ApplicationsDetailPanelAttemptSection } from "./applications-detail-panel-attempt-section";
import { ApplicationsDetailPanelPrivacyReceiptSection } from "./applications-detail-panel-privacy-receipt-section";
import { ApplicationsDetailPanelReviewDataSection } from "./applications-detail-panel-review-data-section";
import { ApplicationsDetailPanelRunHistorySection } from "./applications-detail-panel-run-history-section";
import { ApplicationsDetailPanelTimelineSection } from "./applications-detail-panel-timeline-section";

export function ApplicationsDetailPanelActivitySections(props: {
  applyRunDetailsError: string | null;
  applyRunDetailsStatus: "idle" | "loading" | "ready" | "error";
  applyRunHistory: Array<{
    result: JobFinderWorkspaceSnapshot["applyJobResults"][number];
    run: JobFinderWorkspaceSnapshot["applyRuns"][number] | null;
  }>;
  isApplyRequestPending: (requestId: string) => boolean;
  onExportApplicationPacket: (
    input: JobFinderApplyRunDetailsQuery,
  ) => Promise<void>;
  onResolveSubmissionOutcome?: (
    uncertainOutcomeId: string,
    resolution: "submitted" | "not_submitted",
  ) => Promise<void>;
  onSaveApplicationAnswer: (
    command: SaveApplicationAnswerCommandInput,
  ) => Promise<void>;
  onClearApplicationAnswer: (
    command: ClearApplicationAnswerCommandInput,
  ) => Promise<void>;
  onResolveApplyConsentRequest: (
    input: JobFinderApplyConsentActionInput,
  ) => void;
  onSelectApplyRun: (runId: string) => void;
  selectedApplyRunDetails: ApplyRunDetails | null;
  selectedApplyRunId: string | null;
  selectedAttempt: ApplicationAttempt | null;
  selectedRecord: ApplicationRecord;
  visibleApplyResult:
    | JobFinderWorkspaceSnapshot["applyJobResults"][number]
    | null;
}) {
  const {
    applyRunDetailsError,
    applyRunDetailsStatus,
    applyRunHistory,
    isApplyRequestPending,
    onExportApplicationPacket,
    onResolveSubmissionOutcome,
    onSaveApplicationAnswer,
    onClearApplicationAnswer,
    onResolveApplyConsentRequest,
    onSelectApplyRun,
    selectedApplyRunDetails,
    selectedApplyRunId,
    selectedAttempt,
    selectedRecord,
    visibleApplyResult,
  } = props;
  // A live consent decision or an unresolved manual answer lives inside the
  // review data, so the collapsed block opens itself while one is waiting.
  const hasPendingReviewDecision =
    (visibleApplyResult?.pendingConsentRequestCount ?? 0) > 0 ||
    (selectedApplyRunDetails?.consentRequests.some(
      (request) => request.status === "pending",
    ) ??
      false);

  return (
    <>
      <details
        className="group min-w-0"
        data-testid="applications-technical-details"
        {...(hasPendingReviewDecision ? { open: true } : {})}
      >
        <ApplicationsDisclosureSummary data-testid="applications-technical-details-summary">
          Run details and history
        </ApplicationsDisclosureSummary>
        <div className="mt-3 grid min-w-0 gap-4">
          <ApplicationsDetailPanelRunHistorySection
            applyRunHistory={applyRunHistory}
            onSelectApplyRun={onSelectApplyRun}
            selectedApplyRunId={selectedApplyRunId}
          />
          <ApplicationsDetailPanelReviewDataSection
            applyRunDetailsError={applyRunDetailsError}
            applyRunDetailsStatus={applyRunDetailsStatus}
            isApplyRequestPending={isApplyRequestPending}
            onResolveApplyConsentRequest={onResolveApplyConsentRequest}
            onSaveApplicationAnswer={onSaveApplicationAnswer}
            onClearApplicationAnswer={onClearApplicationAnswer}
            selectedApplyRunDetails={selectedApplyRunDetails}
            visibleApplyResult={visibleApplyResult}
          />
          <ApplicationsDetailPanelAttemptSection
            selectedAttempt={selectedAttempt}
          />
        </div>
      </details>
      <ApplicationsDetailPanelPrivacyReceiptSection
        {...(onResolveSubmissionOutcome
          ? { onResolveOutcome: onResolveSubmissionOutcome }
          : {})}
        onExport={() => {
          const receipt = visibleApplyResult?.privacyReceipt;
          if (!receipt?.lineage.applicationRecordId) {
            return Promise.resolve();
          }

          return onExportApplicationPacket({
            runId: receipt.lineage.runId,
            jobId: receipt.lineage.jobId,
            applicationRecordId: receipt.lineage.applicationRecordId,
          });
        }}
        receipt={visibleApplyResult?.privacyReceipt ?? null}
      />
      <ApplicationsDetailPanelTimelineSection events={selectedRecord.events} />
    </>
  );
}
