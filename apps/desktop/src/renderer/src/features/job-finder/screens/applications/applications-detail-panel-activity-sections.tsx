import type {
  ApplicationAttempt,
  ApplicationRecord,
  ApplyRunDetails,
  JobFinderWorkspaceSnapshot,
} from "@unemployed/contracts";
import { ApplicationsDetailPanelAttemptSection } from "./applications-detail-panel-attempt-section";
import { ApplicationsDetailPanelReviewDataSection } from "./applications-detail-panel-review-data-section";
import { ApplicationsDetailPanelTimelineSection } from "./applications-detail-panel-timeline-section";

export function ApplicationsDetailPanelActivitySections(props: {
  applyRunDetailsError: string | null;
  applyRunDetailsStatus: "idle" | "loading" | "ready" | "error";
  isApplyRequestPending: (requestId: string) => boolean;
  onResolveApplyConsentRequest: (
    requestId: string,
    action: "approve" | "decline",
  ) => void;
  selectedApplyRunDetails: ApplyRunDetails | null;
  selectedAttempt: ApplicationAttempt | null;
  selectedRecord: ApplicationRecord;
  visibleApplyResult: JobFinderWorkspaceSnapshot["applyJobResults"][number] | null;
}) {
  const {
    applyRunDetailsError,
    applyRunDetailsStatus,
    isApplyRequestPending,
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
        selectedApplyRunDetails={selectedApplyRunDetails}
        visibleApplyResult={visibleApplyResult}
      />
      <ApplicationsDetailPanelAttemptSection selectedAttempt={selectedAttempt} />
      <ApplicationsDetailPanelTimelineSection events={selectedRecord.events} />
    </>
  );
}
