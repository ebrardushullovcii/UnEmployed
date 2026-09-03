import type {
  ApplicationAttempt,
  ApplicationRecord,
  JobFinderWorkspaceSnapshot,
} from "@unemployed/contracts";
import {
  applyResultIsFieldSavePause,
  applyResultIsServiceWorkerBlocked,
  applyResultNeedsManualFieldFinish,
  applyResultNeedsResumeAttachment,
  FIELD_SAVE_PAUSE_ACTION,
  getManualFieldFinishReason,
  MANUAL_FIELD_FINISH_NEXT_STEP,
  SITE_BLOCKED_AUTOMATIC_PREP_NEXT_STEP,
} from "./applications-detail-panel-helpers";
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
  showFactStrip?: boolean;
}) {
  const {
    selectedAttempt,
    selectedRecord,
    visibleApplyResult,
    visibleApplyRunId,
    showFactStrip = true,
  } = props;
  const highlightedNextStep =
    selectedAttempt !== null &&
    selectedAttempt.nextActionLabel !== null &&
    new Date(selectedAttempt.updatedAt).getTime() >
      new Date(selectedRecord.lastUpdatedAt).getTime()
      ? selectedAttempt.nextActionLabel
      : getApplicationNextStepLabel(selectedRecord);
  const needsResumeAttachment =
    applyResultNeedsResumeAttachment(visibleApplyResult);
  const isServiceWorkerBlocked =
    applyResultIsServiceWorkerBlocked(visibleApplyResult);
  const needsManualFieldFinish =
    applyResultNeedsManualFieldFinish(visibleApplyResult);
  const isFieldSavePause = applyResultIsFieldSavePause(visibleApplyResult);
  // Manual-finish pauses put the one-line reason directly under the heading
  // and keep the headline to the action the user takes next.
  const manualFinishReason = getManualFieldFinishReason(visibleApplyResult);
  const readableHighlightedNextStep = isServiceWorkerBlocked
    ? SITE_BLOCKED_AUTOMATIC_PREP_NEXT_STEP
    : isFieldSavePause
      ? FIELD_SAVE_PAUSE_ACTION
      : needsManualFieldFinish
        ? MANUAL_FIELD_FINISH_NEXT_STEP
        : needsResumeAttachment
          ? "The approved resume is prepared but was not attached. Approve and retry the resume attachment before reviewing the final form."
          : (getApplicationReadableNextStepLabel(highlightedNextStep) ??
            highlightedNextStep);

  return (
    <>
      <h2 className="min-w-0 break-words font-semibold tracking-tight text-(--text-headline)">
        {selectedRecord.title}
      </h2>
      {highlightedNextStep ||
      isServiceWorkerBlocked ||
      needsManualFieldFinish ? (
        <section className="surface-card-tint grid min-w-0 gap-2 rounded-(--radius-field) border border-primary/35 bg-primary/5 px-5 py-4">
          <h3 className={`${APPLICATION_DETAIL_FACT_LABEL_CLASS} text-primary`}>
            Next step
          </h3>
          {manualFinishReason ? (
            <p
              className="max-w-prose text-(length:--text-small) leading-6 text-foreground-soft"
              data-testid="next-step-reason"
            >
              {manualFinishReason}
            </p>
          ) : null}
          {/* The instruction is the most important sentence here, not the
              largest object on the page. At section-title size it outweighed
              the job title and pushed the action row it describes below the
              fold at 1024x768. */}
          <strong className="block max-w-prose whitespace-normal break-words text-(length:--text-body) font-semibold leading-6 text-(--text-headline)">
            {readableHighlightedNextStep}
          </strong>
          {!isServiceWorkerBlocked &&
          !needsManualFieldFinish &&
          !needsResumeAttachment &&
          readableHighlightedNextStep !== highlightedNextStep &&
          highlightedNextStep ? (
            <p className="text-(length:--text-small) leading-6 text-gamma-soft">
              Saved follow-up: {highlightedNextStep}
            </p>
          ) : null}
        </section>
      ) : null}
      {showFactStrip ? (
        <ApplicationsDetailFactStrip
          selectedAttempt={selectedAttempt}
          selectedRecord={selectedRecord}
          visibleApplyResult={visibleApplyResult}
          visibleApplyRunId={visibleApplyRunId}
        />
      ) : null}
    </>
  );
}
