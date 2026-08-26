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
import { ApplicationsDetailPanelTimelineSection } from "./applications-detail-panel-timeline-section";

export function ApplicationsDetailPanelActivitySections(props: {
  applyRunDetailsError: string | null;
  applyRunDetailsStatus: "idle" | "loading" | "ready" | "error";
  isApplyRequestPending: (requestId: string) => boolean;
  onExportApplicationPacket: (
    input: JobFinderApplyRunDetailsQuery,
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
  selectedApplyRunDetails: ApplyRunDetails | null;
  selectedAttempt: ApplicationAttempt | null;
  selectedRecord: ApplicationRecord;
  visibleApplyResult:
    | JobFinderWorkspaceSnapshot["applyJobResults"][number]
    | null;
}) {
  const {
    applyRunDetailsError,
    applyRunDetailsStatus,
    isApplyRequestPending,
    onExportApplicationPacket,
    onSaveApplicationAnswer,
    onClearApplicationAnswer,
    onResolveApplyConsentRequest,
    selectedApplyRunDetails,
    selectedAttempt,
    selectedRecord,
    visibleApplyResult,
  } = props;

  return (
    <>
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
      <ApplicationsDetailPanelPrivacyReceiptSection
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
