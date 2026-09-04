import { getApplicationSubmissionAnswer } from "./applications-status";
import { useMemo } from "react";
import type {
  ApplicationAttempt,
  ApplicationRecord,
  ApplyRunDetails,
  ClearApplicationAnswerCommandInput,
  GlobalDailyApplicationPreparationCapacity,
  JobFinderWorkspaceSnapshot,
  SaveApplicationAnswerCommandInput,
  JobFinderApplyConsentActionInput,
  JobFinderApplyRunActionInput,
  JobFinderApplyRunDetailsQuery,
  JobFinderExactApplicationTarget,
} from "@unemployed/contracts";
import { Mic } from "lucide-react";
import { Button } from "@renderer/components/ui";
import { StatusBadge } from "../../components/status-badge";
import { ApplicationsDetailPanelActivitySections } from "./applications-detail-panel-activity-sections";
import { ApplicationsApplicationDocuments } from "./applications-application-documents";
import { ApplicationsDetailPanelEmptyState } from "./applications-detail-panel-empty-state";
import {
  APPLICATION_DETAIL_FACT_LABEL_CLASS,
  ApplicationsDetailFactStrip,
} from "./applications-detail-fact-strip";
import {
  buildQueueEntries,
  applicationNeedsPrimaryRecovery,
} from "./applications-detail-panel-helpers";
import { ApplicationsDetailPanelOverviewSections } from "./applications-detail-panel-overview-sections";
import type {
  ConfirmFinishedInBrowserStatus,
  FinishInBrowserHandler,
  FinishInBrowserInput,
} from "./applications-detail-panel-recovery-actions-section";
import { ApplicationsDetailPanelRecoverySections } from "./applications-detail-panel-recovery-sections";
import { ApplicationsDetailPanelSubmitApprovalSection } from "./applications-detail-panel-submit-approval-section";
import { type ApplicationsViewFilter } from "./applications-filters";
import { getApplicationStagePresentation } from "./applications-status";
import { formatApplicationEmployerLine } from "../../lib/job-employer-location-display";

function buildInterviewHelperApplicationHref(input: {
  record: ApplicationRecord;
  relatedJob: JobFinderWorkspaceSnapshot["discoveryJobs"][number] | null;
}) {
  const { record, relatedJob } = input;
  const employerLine = formatApplicationEmployerLine({
    company: record.company,
    ...(relatedJob?.canonicalUrl
      ? { canonicalUrl: relatedJob.canonicalUrl }
      : {}),
  });
  const notes = [
    record.nextActionLabel ? `Next step: ${record.nextActionLabel}` : null,
    record.lastActionLabel
      ? `Latest application activity: ${record.lastActionLabel}`
      : null,
    relatedJob?.summary ? `Job summary: ${relatedJob.summary}` : null,
  ].filter((entry): entry is string => Boolean(entry));
  const params = new URLSearchParams({
    source: "job_application",
    id: record.id,
    label: employerLine ? `${record.title} at ${employerLine}` : record.title,
    role: record.title,
    company: employerLine ?? "",
    sourceUrl: relatedJob?.canonicalUrl ?? "",
    notes:
      notes.join("\n\n") ||
      (employerLine
        ? `Application record for ${record.title} at ${employerLine}.`
        : `Application record for ${record.title}.`),
  });

  return `/interview-helper?${params.toString()}`;
}

interface ApplicationsDetailPanelProps {
  activeFilter: ApplicationsViewFilter;
  applyRunDetails: ApplyRunDetails | null;
  applyRunDetailsTarget: {
    applicationRecordId: string;
    jobId: string;
    runId: string;
  } | null;
  applyRunDetailsError: string | null;
  applyRunDetailsStatus: "idle" | "loading" | "ready" | "error";
  applicationRecords: readonly ApplicationRecord[];
  applyJobResults: JobFinderWorkspaceSnapshot["applyJobResults"];
  dailyPreparationCapacity: GlobalDailyApplicationPreparationCapacity | null;
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
  onApproveApplyRun: (input: JobFinderApplyRunActionInput) => void;
  onCancelApplyRun: (input: JobFinderApplyRunActionInput) => void;
  onOpenCompany?: (companyId: string) => void;
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
  onRevokeApplyRunApproval: (input: JobFinderApplyRunActionInput) => void;
  onSelectApplyRun: (runId: string) => void;
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
  selectedApplyRunId: string | null;
  selectedAttempt: ApplicationAttempt | null;
  selectedRecord: ApplicationRecord | null;
  selectedRecordCompanyId?: string | null;
}

export function ApplicationsDetailPanel({
  activeFilter,
  applyRunDetails,
  applyRunDetailsTarget,
  applyRunDetailsError,
  applyRunDetailsStatus,
  applicationRecords,
  applyJobResults,
  dailyPreparationCapacity,
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
  onOpenCompany,
  onExportApplicationPacket,
  onResolveSubmissionOutcome,
  onSaveApplicationAnswer,
  onClearApplicationAnswer,
  onResolveApplyConsentRequest,
  onRevokeApplyRunApproval,
  onSelectApplyRun,
  onStartApplyCopilot,
  onStartAutoApply,
  onStartAutoApplyQueue,
  onOpenSafeguards,
  onFinishInBrowser,
  onConfirmFinishedInBrowser,
  canConfirmFinishedInBrowser,
  confirmFinishedInBrowserStatus,
  confirmFinishedInBrowserBlockerText,
  selectedApplyRunId,
  selectedAttempt,
  selectedRecord,
  selectedRecordCompanyId,
}: ApplicationsDetailPanelProps) {
  const visibleApplyResult = effectiveSelectedApplyResult;
  const canRestageAutoRun =
    selectedRecord?.status === "approved" ||
    selectedRecord?.status === "ready_for_review";
  const selectedRunHistoryEntry = useMemo(
    () =>
      applyRunHistory.find(
        ({ result }) => result.runId === selectedApplyRunId,
      ) ?? null,
    [applyRunHistory, selectedApplyRunId],
  );
  const selectedApplyRunDetails = useMemo(
    () =>
      applyRunDetailsStatus === "ready" &&
      selectedRecord != null &&
      applyRunDetailsTarget?.jobId === selectedRecord.jobId &&
      applyRunDetailsTarget.applicationRecordId === selectedRecord.id &&
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
    selectedRun?.mode === "queue_auto" &&
    selectedQueueRecoveryJobIds.length > 0;
  const isSelectedRunPending = selectedRun
    ? isApplyRunPending(selectedRun.id)
    : false;
  const selectedStage = selectedRecord
    ? getApplicationStagePresentation(selectedRecord)
    : null;
  const selectedRecordJob = selectedRecord
    ? (discoveryJobs.find((job) => job.id === selectedRecord.jobId) ?? null)
    : null;
  const canPrepareInterview = selectedRecord
    ? selectedRecord.lastAttemptState === "submitted" ||
      ["submitted", "assessment", "interview", "offer"].includes(
        selectedRecord.status,
      )
    : false;
  const needsPrimaryRecovery = selectedRecord
    ? applicationNeedsPrimaryRecovery({
        lastAttemptState: selectedRecord.lastAttemptState,
        visibleApplyResult,
      })
    : false;

  // While the user is being sent to the browser to finish this application,
  // an optional cover-letter block advertised a feature its own copy says to
  // come back for later. It returns once the application is unblocked.
  const documentsSection =
    selectedRecord && !needsPrimaryRecovery ? (
      <ApplicationsApplicationDocuments
        applicationRecord={selectedRecord}
        applyRunDetails={selectedApplyRunDetails}
      />
    ) : null;

  const recoverySection = selectedRecord ? (
    <ApplicationsDetailPanelRecoverySections
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
      selectedQueueOutcomeEntries={selectedQueueEntries}
      selectedQueueRecoveryEntries={selectedQueueRecoveryEntries}
      selectedQueueRecoveryJobIds={selectedQueueRecoveryJobIds}
      selectedRecordJobId={selectedRecord.jobId}
      selectedApplicationRecordId={selectedRecord.id}
      selectedRun={selectedRun}
      visibleApplyResult={visibleApplyResult}
    />
  ) : null;

  const selectedRecordEmployerDisplay = selectedRecord
    ? formatApplicationEmployerLine({
        company: selectedRecord.company,
        ...(selectedRecordJob?.canonicalUrl
          ? { canonicalUrl: selectedRecordJob.canonicalUrl }
          : {}),
      })
    : null;

  /**
   * Convenience destinations (Companies, interview prep). Useful, but never
   * the next step — when the application is waiting on the user they render
   * after the recovery actions so the action row is not pushed below the
   * fold at 1024x768.
   */
  const submissionAnswer = selectedRecord
    ? getApplicationSubmissionAnswer(
        selectedRecord,
        selectedRecordEmployerDisplay,
      )
    : null;

  const convenienceLinks = selectedRecord ? (
    <>
      {selectedRecordCompanyId &&
      onOpenCompany &&
      selectedRecordEmployerDisplay ? (
        <div className="grid gap-2 @[34rem]/detail:grid-cols-2">
          <Button
            className="h-10 justify-start px-3.5 text-sm font-medium normal-case tracking-normal"
            onClick={() => onOpenCompany(selectedRecordCompanyId)}
            size="compact"
            type="button"
            variant="secondary"
          >
            View {selectedRecordEmployerDisplay} in Companies
          </Button>
          {canPrepareInterview ? (
            <Button
              asChild
              className="h-10 justify-start px-3.5 text-sm font-medium normal-case tracking-normal"
              size="compact"
              variant="secondary"
            >
              <a
                href={`#${buildInterviewHelperApplicationHref({
                  record: selectedRecord,
                  relatedJob: selectedRecordJob,
                })}`}
              >
                <Mic aria-hidden="true" className="size-4" focusable="false" />
                Prepare interview
              </a>
            </Button>
          ) : null}
        </div>
      ) : canPrepareInterview ? (
        <Button
          asChild
          className="h-10 justify-start px-3.5 text-sm font-medium normal-case tracking-normal"
          size="compact"
          variant="secondary"
        >
          <a
            href={`#${buildInterviewHelperApplicationHref({
              record: selectedRecord,
              relatedJob: selectedRecordJob,
            })}`}
          >
            <Mic aria-hidden="true" className="size-4" focusable="false" />
            Prepare interview
          </a>
        </Button>
      ) : null}
    </>
  ) : null;

  return (
    <section
      className="@container/detail surface-panel-shell relative flex min-w-0 flex-col gap-6 overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border) px-8 py-5 xl:h-full xl:min-h-0"
      id="applications-detail-content"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-1">
          <p className={APPLICATION_DETAIL_FACT_LABEL_CLASS}>Details</p>
          {selectedRecord ? (
            selectedRecordEmployerDisplay ? (
              <strong className="text-(length:--text-body) text-(--text-headline)">
                {selectedRecordEmployerDisplay}
              </strong>
            ) : (
              <strong className="text-(length:--text-body) text-(--text-headline)">
                {selectedRecord.title}
              </strong>
            )
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
        <div
          className="grid min-h-0 min-w-0 flex-1 content-start gap-5 overflow-y-auto pr-1"
          data-locked-pane-scroll-region
        >
          {/* The plain answer, uncollapsed, before anything else: did I
              apply, and is anything of mine on that site? Seven different
              state words described this record and none of them said "Not
              submitted". */}
          {submissionAnswer ? (
            <p
              className="grid gap-1 rounded-(--radius-field) border border-(--control-border) px-4 py-3"
              data-testid="applications-submission-answer"
            >
              <strong className="text-(length:--text-body) font-semibold text-(--text-headline)">
                {submissionAnswer.headline}
              </strong>
              <span className="text-(length:--text-small) leading-6 text-foreground-soft">
                {submissionAnswer.detail}
              </span>
            </p>
          ) : null}
          {needsPrimaryRecovery ? null : convenienceLinks}
          <ApplicationsDetailPanelOverviewSections
            selectedAttempt={selectedAttempt}
            selectedRecord={selectedRecord}
            visibleApplyResult={visibleApplyResult}
            visibleApplyRunId={visibleApplyRunId}
            showFactStrip={!needsPrimaryRecovery}
          />
          {needsPrimaryRecovery ? recoverySection : documentsSection}
          {needsPrimaryRecovery ? convenienceLinks : null}
          {needsPrimaryRecovery ? (
            <ApplicationsDetailFactStrip
              selectedAttempt={selectedAttempt}
              selectedRecord={selectedRecord}
              visibleApplyResult={visibleApplyResult}
              visibleApplyRunId={visibleApplyRunId}
            />
          ) : null}
          <ApplicationsDetailPanelSubmitApprovalSection
            approvalScopeEntries={selectedQueueEntries.map(
              ({ jobId, label }) => ({ jobId, label }),
            )}
            isApplyRunPending={isApplyRunPending}
            isSelectedRunPending={isSelectedRunPending}
            onApproveApplyRun={onApproveApplyRun}
            onCancelApplyRun={onCancelApplyRun}
            onRevokeApplyRunApproval={onRevokeApplyRunApproval}
            selectedApplicationTarget={{
              applicationRecordId: selectedRecord.id,
              jobId: selectedRecord.jobId,
            }}
            selectedApplyRunDetails={selectedApplyRunDetails}
          />
          {needsPrimaryRecovery ? documentsSection : recoverySection}
          <ApplicationsDetailPanelActivitySections
            applyRunDetailsError={applyRunDetailsError}
            applyRunDetailsStatus={applyRunDetailsStatus}
            applyRunHistory={applyRunHistory}
            isApplyRequestPending={isApplyRequestPending}
            onResolveApplyConsentRequest={onResolveApplyConsentRequest}
            onExportApplicationPacket={onExportApplicationPacket}
            {...(onResolveSubmissionOutcome
              ? { onResolveSubmissionOutcome }
              : {})}
            onSaveApplicationAnswer={onSaveApplicationAnswer}
            onClearApplicationAnswer={onClearApplicationAnswer}
            onSelectApplyRun={onSelectApplyRun}
            selectedApplyRunDetails={selectedApplyRunDetails}
            selectedApplyRunId={selectedApplyRunId}
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
