import type {
  ApplicationAttempt,
  ApplicationRecord,
  JobFinderWorkspaceSnapshot,
} from "@unemployed/contracts";
import { applyResultNeedsResumeAttachment } from "./applications-detail-panel-helpers";
import {
  getApplicationNextStepLabel,
  getApplicationReadableNextStepLabel,
} from "./applications-status";
import {
  APPLICATION_DETAIL_FACT_LABEL_CLASS,
  ApplicationsDetailFactStrip,
} from "./applications-detail-fact-strip";

export function ApplicationsDetailPanelOverviewSections(props: {
  selectedAttempt: ApplicationAttempt | null;
  selectedRecord: ApplicationRecord;
  visibleApplyResult:
    | JobFinderWorkspaceSnapshot["applyJobResults"][number]
    | null;
  visibleApplyRunId: string | null;
}) {
  const {
    selectedAttempt,
    selectedRecord,
    visibleApplyResult,
    visibleApplyRunId,
  } = props;
  const highlightedNextStep =
    selectedAttempt?.nextActionLabel ??
    getApplicationNextStepLabel(selectedRecord);
  const needsResumeAttachment =
    applyResultNeedsResumeAttachment(visibleApplyResult);
  const readableHighlightedNextStep = needsResumeAttachment
    ? "The approved resume is prepared but was not attached. Approve and retry the resume attachment before reviewing the final form."
    : (getApplicationReadableNextStepLabel(highlightedNextStep) ??
      highlightedNextStep);

  return (
    <>
      <h2 className="min-w-0 break-words text-(length:--text-section-title) font-semibold tracking-tight text-(--text-headline)">
        {selectedRecord.title}
      </h2>
      {highlightedNextStep ? (
        <section className="surface-card-tint grid min-w-0 gap-1.5 rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-3">
          <h3 className={`${APPLICATION_DETAIL_FACT_LABEL_CLASS} text-primary`}>
            Next step
          </h3>
          <strong className="block max-w-full whitespace-normal break-words text-(length:--text-body) leading-7 text-(--text-headline)">
            {readableHighlightedNextStep}
          </strong>
          {!needsResumeAttachment &&
          readableHighlightedNextStep !== highlightedNextStep &&
          highlightedNextStep ? (
            <p className="text-(length:--text-small) leading-6 text-foreground-soft">
              Saved follow-up: {highlightedNextStep}
            </p>
          ) : null}
        </section>
      ) : null}
      <ApplicationsDetailFactStrip
        selectedAttempt={selectedAttempt}
        selectedRecord={selectedRecord}
        visibleApplyResult={visibleApplyResult}
        visibleApplyRunId={visibleApplyRunId}
      />
    </>
  );
}
