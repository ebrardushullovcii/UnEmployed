import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ApplicationCrmBulkStageMutationInput,
  ApplicationCrmExportFormat,
  ApplicationCrmMutationInput,
  ApplicationCrmSettings,
  ApplicationAttempt,
  ApplicationRecord,
  ApplyRunDetails,
  ClearApplicationAnswerCommandInput,
  CompanyEntity,
  GlobalDailyApplicationPreparationCapacity,
  JobFinderWorkspaceSnapshot,
  RecordOutcomeInput,
  SaveApplicationAnswerCommandInput,
  JobFinderApplyConsentActionInput,
  JobFinderApplyRunActionInput,
  JobFinderApplyRunDetailsQuery,
  JobFinderExactApplicationTarget,
} from "@unemployed/contracts";
import { isListableCompanyName } from "@unemployed/contracts";
import { ArrowLeft } from "lucide-react";
import { Button } from "@renderer/components/ui/button";
import { LockedScreenLayout } from "../../components/locked-screen-layout";
import { EmptyState } from "../../components/empty-state";
import { PageHeaderStack } from "../../components/page-header";
import { ApplicationsDetailPanel } from "./applications-detail-panel";
import type {
  ConfirmFinishedInBrowserStatus,
  FinishInBrowserHandler,
  FinishInBrowserInput,
} from "./applications-detail-panel-recovery-actions-section";
import {
  APPLICATION_FILTER_LABELS,
  APPLICATION_FILTERS,
  type ApplicationsViewFilter,
} from "./applications-filters";
import {
  getLatestApplicationAttemptForRecord,
  matchesApplicationsFilter,
  pickLatestIsoTimestamp,
  resolveUnambiguousApplicationRecordIdByJobId,
  resolveVisibleRouteActionMessage,
} from "./applications-screen-helpers";
import { useApplicationsApplyRunDetails } from "./use-applications-apply-run-details";
import { ApplicationsRecordsPanel } from "./applications-records-panel";
import { StatusBadge } from "../../components/status-badge";
import {
  ApplicationsCrmViews,
  type ApplicationCrmView,
} from "./applications-crm-views";
import { ApplicationsCrmDetail } from "./applications-crm-detail";

export function ApplicationsScreen(props: {
  actionMessage?: string | null;
  applicationAttempts: readonly ApplicationAttempt[];
  applicationRecords: readonly ApplicationRecord[];
  applyRuns: JobFinderWorkspaceSnapshot["applyRuns"];
  applyJobResults: JobFinderWorkspaceSnapshot["applyJobResults"];
  companies?: readonly CompanyEntity[];
  dailyPreparationCapacity: GlobalDailyApplicationPreparationCapacity | null;
  discoveryJobs: JobFinderWorkspaceSnapshot["discoveryJobs"];
  isApplyPending: boolean;
  isApplyRequestPending: (requestId: string) => boolean;
  isApplyRunPending: (runId: string) => boolean;
  onApproveApplyRun: (input: JobFinderApplyRunActionInput) => void;
  onCancelApplyRun: (input: JobFinderApplyRunActionInput) => void;
  onGetApplyRunDetails: (
    input: JobFinderApplyRunDetailsQuery,
  ) => Promise<ApplyRunDetails>;
  onSaveApplicationAnswer: (
    command: SaveApplicationAnswerCommandInput,
  ) => Promise<ApplyRunDetails>;
  onClearApplicationAnswer: (
    command: ClearApplicationAnswerCommandInput,
  ) => Promise<ApplyRunDetails>;
  onExportApplicationPacket: (
    input: JobFinderApplyRunDetailsQuery,
  ) => Promise<void>;
  onResolveSubmissionOutcome?: (
    uncertainOutcomeId: string,
    resolution: "submitted" | "not_submitted",
  ) => Promise<void>;
  onResolveApplyConsentRequest: (
    input: JobFinderApplyConsentActionInput,
  ) => void;
  onRevokeApplyRunApproval: (input: JobFinderApplyRunActionInput) => void;
  onStartAutoApplyQueue: (jobIds: string[]) => void;
  onStartApplyCopilot: (input: JobFinderExactApplicationTarget) => void;
  onStartAutoApply: (input: JobFinderExactApplicationTarget) => void;
  onOpenCompany?: (companyId: string) => void;
  selectedApplyRunId: string | null;
  onSelectRecord: (recordId: string) => void;
  selectedAttempt: ApplicationAttempt | null;
  selectedRecord: ApplicationRecord | null;
  crmSettings?: ApplicationCrmSettings;
  onMutateApplicationCrm?: (
    command: ApplicationCrmMutationInput,
  ) => Promise<void>;
  onMutateApplicationCrmBulkStage?: (
    command: ApplicationCrmBulkStageMutationInput,
  ) => Promise<void>;
  onExportApplicationCrm?: (
    format: ApplicationCrmExportFormat,
    recordId: string,
  ) => Promise<void>;
  onRecordOutcome?: (input: RecordOutcomeInput) => Promise<void>;
  isRecordOutcomePending?: (jobId: string) => boolean;
  outcomeCampaignId?: string | null;
  getOutcomeResumeStrategyId?: (jobId: string) => string | null;
  safeguardsBlockerCount?: number;
  onOpenSafeguards?: () => void;
  /**
   * Opens or focuses the managed Job Finder browser on the paused application
   * so the user can finish a field the site tried to save on its own. It
   * reports what the hand-off actually did; the declared return type has to
   * match the leaf's or that outcome is under-reported on the way down.
   */
  onFinishInBrowser?: FinishInBrowserHandler;
  /**
   * Confirms the browser-owned step the user was sent out to finish, running
   * the same verification Needs you runs. The screen that sends the user to
   * the browser is the screen that takes them back in.
   */
  onConfirmFinishedInBrowser?: (input: FinishInBrowserInput) => void;
  /** True while a pending browser step exists for the visible result. */
  canConfirmFinishedInBrowser?: boolean;
  confirmFinishedInBrowserStatus?: ConfirmFinishedInBrowserStatus;
  confirmFinishedInBrowserBlockerText?: string | null;
  /** Route-owned tracker mode, so "Open tracker" is a link, not a tab. */
  workspaceView?: "workflow" | "crm";
  onWorkspaceViewChange?: (view: "workflow" | "crm") => void;
}) {
  const {
    applicationAttempts,
    applicationRecords,
    applyRuns,
    applyJobResults,
    dailyPreparationCapacity,
    discoveryJobs,
    isApplyPending,
    isApplyRequestPending,
    isApplyRunPending,
    onApproveApplyRun,
    onCancelApplyRun,
    onGetApplyRunDetails,
    onSaveApplicationAnswer,
    onClearApplicationAnswer,
    onExportApplicationPacket,
    onResolveSubmissionOutcome,
    onResolveApplyConsentRequest,
    onRevokeApplyRunApproval,
    onStartAutoApplyQueue,
    onStartApplyCopilot,
    onStartAutoApply,
    selectedApplyRunId,
    onSelectRecord,
    selectedAttempt,
    selectedRecord,
  } = props;
  const [activeFilter, setActiveFilter] =
    useState<ApplicationsViewFilter>("all");
  // Preparation is the product; the stage tracker is a deferred power surface
  // reached explicitly, not a peer tab that splits one application into two
  // competing screens. The route owns the mode so the tracker keeps a link.
  const [localWorkspaceView, setLocalWorkspaceView] = useState<
    "workflow" | "crm"
  >("workflow");
  const workspaceView = props.workspaceView ?? localWorkspaceView;
  const setWorkspaceView = (view: "workflow" | "crm") => {
    setLocalWorkspaceView(view);
    props.onWorkspaceViewChange?.(view);
  };
  const [crmView, setCrmView] = useState<ApplicationCrmView>("table");
  const [crmVisibleRecordIds, setCrmVisibleRecordIds] = useState<
    readonly string[] | null
  >(null);
  const [
    selectedApplyRunIdByApplicationRecordId,
    setSelectedApplyRunIdByApplicationRecordId,
  ] = useState<Record<string, string>>({});
  const selectRecordAndRevealDetails = useCallback(
    (recordId: string) => {
      onSelectRecord(recordId);
      if (
        typeof window.matchMedia !== "function" ||
        window.matchMedia("(min-width: 1280px)").matches
      ) {
        return;
      }
      window.requestAnimationFrame(() => {
        document
          .getElementById("applications-detail-content")
          ?.scrollIntoView({ block: "start" });
      });
    },
    [onSelectRecord],
  );
  const handleCrmVisibleRecordIdsChange = useCallback(
    (recordIds: readonly string[]) => {
      setCrmVisibleRecordIds((current) =>
        current !== null &&
        current.length === recordIds.length &&
        current.every((id, index) => id === recordIds[index])
          ? current
          : recordIds,
      );
    },
    [],
  );
  const filterCounts = useMemo(
    () =>
      Object.fromEntries(
        APPLICATION_FILTERS.map((filter) => [
          filter,
          applicationRecords.filter((record) =>
            matchesApplicationsFilter(record, filter),
          ).length,
        ]),
      ) as Record<ApplicationsViewFilter, number>,
    [applicationRecords],
  );
  const latestFinishedAutomaticRun = useMemo(
    () =>
      [...applyRuns]
        .filter(
          (run) =>
            run.mode !== "copilot" &&
            ["completed", "failed", "cancelled"].includes(run.state),
        )
        .sort(
          (left, right) =>
            new Date(right.updatedAt).getTime() -
            new Date(left.updatedAt).getTime(),
        )[0] ?? null,
    [applyRuns],
  );
  const latestFinishedAutomaticResults = useMemo(
    () =>
      latestFinishedAutomaticRun
        ? applyJobResults.filter(
            (result) => result.runId === latestFinishedAutomaticRun.id,
          )
        : [],
    [applyJobResults, latestFinishedAutomaticRun],
  );
  const latestRunAttentionCount = latestFinishedAutomaticResults.filter(
    (result) => result.state === "blocked" || result.state === "failed",
  ).length;
  const latestRunSkippedCount = latestFinishedAutomaticResults.filter(
    (result) => result.state === "skipped",
  ).length;
  const filteredApplicationRecords = useMemo(
    () =>
      applicationRecords.filter((record) =>
        matchesApplicationsFilter(record, activeFilter),
      ),
    [activeFilter, applicationRecords],
  );
  const isSelectedRecordHiddenByFilter =
    selectedRecord !== null &&
    filteredApplicationRecords.length > 0 &&
    !filteredApplicationRecords.some(
      (record) => record.id === selectedRecord.id,
    );
  const shouldPreserveHiddenSelection =
    workspaceView === "workflow" && isSelectedRecordHiddenByFilter;
  const effectiveSelectedRecord = shouldPreserveHiddenSelection
    ? null
    : (filteredApplicationRecords.find(
        (record) => record.id === selectedRecord?.id,
      ) ??
      filteredApplicationRecords[0] ??
      null);
  const effectiveSelectedAttempt = (() => {
    if (!effectiveSelectedRecord) {
      return null;
    }

    // Exact lineage from route selection stays authoritative.
    if (
      selectedAttempt &&
      selectedAttempt.applicationRecordId === effectiveSelectedRecord.id
    ) {
      return selectedAttempt;
    }

    // Otherwise the latest associated attempt may come from legacy history
    // whose applicationRecordId is null but whose job ownership is unique.
    return getLatestApplicationAttemptForRecord(
      effectiveSelectedRecord,
      applicationAttempts,
      applicationRecords,
    );
  })();
  const isSelectedRecordInCrmView =
    crmVisibleRecordIds !== null &&
    effectiveSelectedRecord !== null &&
    crmVisibleRecordIds.includes(effectiveSelectedRecord.id);
  const applyRunsById = useMemo(
    () => new Map(applyRuns.map((run) => [run.id, run])),
    [applyRuns],
  );
  const unambiguousRecordIdByJobId = useMemo(
    () => resolveUnambiguousApplicationRecordIdByJobId(applicationRecords),
    [applicationRecords],
  );
  const scopedApplyRunIds = useMemo(
    () => new Set(applyRuns.map((run) => run.id)),
    [applyRuns],
  );
  const applyResultsForSelectedRecord = useMemo(() => {
    if (!effectiveSelectedRecord) {
      return [];
    }

    return [...applyJobResults]
      .filter((result) => {
        if (result.applicationRecordId) {
          // Exact lineage is authoritative and is never re-attributed.
          return result.applicationRecordId === effectiveSelectedRecord.id;
        }

        // Legacy results predate application records; attach them only when
        // one scoped record owns the job inside a scoped run. Multiple records
        // for the same job keep ownership ambiguous, so nothing attaches.
        return (
          scopedApplyRunIds.has(result.runId) &&
          unambiguousRecordIdByJobId.get(result.jobId) ===
            effectiveSelectedRecord.id
        );
      })
      .sort(
        (left, right) =>
          new Date(right.updatedAt).getTime() -
          new Date(left.updatedAt).getTime(),
      );
  }, [
    applyJobResults,
    effectiveSelectedRecord,
    scopedApplyRunIds,
    unambiguousRecordIdByJobId,
  ]);
  const effectiveSelectedApplyRunId = useMemo(() => {
    if (!effectiveSelectedRecord) {
      return null;
    }

    const applicationRecordId = effectiveSelectedRecord.id;
    const locallySelectedRunId =
      selectedApplyRunIdByApplicationRecordId[applicationRecordId] ?? null;

    if (
      locallySelectedRunId &&
      applyResultsForSelectedRecord.some(
        (result) => result.runId === locallySelectedRunId,
      )
    ) {
      return locallySelectedRunId;
    }

    if (
      selectedApplyRunId &&
      applyResultsForSelectedRecord.some(
        (result) => result.runId === selectedApplyRunId,
      )
    ) {
      return selectedApplyRunId;
    }

    return applyResultsForSelectedRecord[0]?.runId ?? null;
  }, [
    applyResultsForSelectedRecord,
    effectiveSelectedRecord,
    selectedApplyRunId,
    selectedApplyRunIdByApplicationRecordId,
  ]);
  const effectiveSelectedApplyResult = useMemo(
    () =>
      applyResultsForSelectedRecord.find(
        (result) => result.runId === effectiveSelectedApplyRunId,
      ) ??
      applyResultsForSelectedRecord[0] ??
      null,
    [applyResultsForSelectedRecord, effectiveSelectedApplyRunId],
  );
  const applyRunHistory = useMemo(
    () =>
      applyResultsForSelectedRecord.map((result) => ({
        result,
        run: applyRunsById.get(result.runId) ?? null,
      })),
    [applyResultsForSelectedRecord, applyRunsById],
  );
  const latestApplyRunIdForSelectedRecord =
    applyResultsForSelectedRecord[0]?.runId ?? null;
  const effectiveSelectedJobId = effectiveSelectedRecord?.jobId ?? null;
  const effectiveSelectedRunId = effectiveSelectedApplyResult?.runId ?? null;
  const selectedApplyRun = effectiveSelectedRunId
    ? (applyRunsById.get(effectiveSelectedRunId) ?? null)
    : null;
  const effectiveSelectedRunUpdatedAt = pickLatestIsoTimestamp(
    selectedApplyRun?.updatedAt,
    effectiveSelectedApplyResult?.updatedAt,
  );
  const {
    applyRunDetails,
    applyRunDetailsError,
    applyRunDetailsStatus,
    applyRunDetailsTarget,
    replaceApplyRunDetails,
  } = useApplicationsApplyRunDetails({
    jobId: effectiveSelectedJobId,
    applicationRecordId: effectiveSelectedRecord?.id ?? null,
    onGetApplyRunDetails,
    runId: effectiveSelectedRunId,
    runUpdatedAt: effectiveSelectedRunUpdatedAt,
  });
  const showLatestAttemptDetails =
    !effectiveSelectedApplyRunId ||
    !latestApplyRunIdForSelectedRecord ||
    effectiveSelectedApplyRunId === latestApplyRunIdForSelectedRecord;

  const handleSelectApplyRun = useCallback(
    (runId: string) => {
      if (!effectiveSelectedRecord) {
        return;
      }

      setSelectedApplyRunIdByApplicationRecordId((current) => ({
        ...current,
        [effectiveSelectedRecord.id]: runId,
      }));
    },
    [effectiveSelectedRecord],
  );

  useEffect(() => {
    if (!effectiveSelectedRecord || !selectedApplyRunId) {
      return;
    }

    if (
      !applyResultsForSelectedRecord.some(
        (result) => result.runId === selectedApplyRunId,
      )
    ) {
      return;
    }

    setSelectedApplyRunIdByApplicationRecordId((current) => {
      if (current[effectiveSelectedRecord.id] === selectedApplyRunId) {
        return current;
      }

      return {
        ...current,
        [effectiveSelectedRecord.id]: selectedApplyRunId,
      };
    });
  }, [
    applyResultsForSelectedRecord,
    effectiveSelectedRecord,
    selectedApplyRunId,
  ]);

  useEffect(() => {
    if (
      !effectiveSelectedRecord ||
      effectiveSelectedRecord.id === selectedRecord?.id
    ) {
      return;
    }

    onSelectRecord(effectiveSelectedRecord.id);
  }, [effectiveSelectedRecord, onSelectRecord, selectedRecord?.id]);

  const hasCrmTrackerControls = Boolean(
    props.crmSettings &&
    props.onMutateApplicationCrm &&
    props.onExportApplicationCrm,
  );
  const hasUnassignedLegacyLineage =
    applicationAttempts.some(
      (attempt) =>
        !attempt.applicationRecordId &&
        !unambiguousRecordIdByJobId.has(attempt.jobId),
    ) ||
    applyJobResults.some(
      (result) =>
        !result.applicationRecordId &&
        (!unambiguousRecordIdByJobId.has(result.jobId) ||
          !scopedApplyRunIds.has(result.runId)),
    );
  // Retry, queue, and copilot refusals and backend errors are written as
  // route-owned statuses by the page controller; Applications owns their one
  // visible presentation. The controller's route scoping keeps sibling-route
  // messages from ever arriving here.
  const visibleActionMessage = resolveVisibleRouteActionMessage({
    actionMessage: props.actionMessage ?? null,
    dailyPreparationCapacity,
  });
  const crmEmptyState = !hasCrmTrackerControls
    ? {
        title: "Tracking tools unavailable",
        description:
          "Application tracking tools are not available right now, so this pane has nothing to manage.",
      }
    : applicationRecords.length === 0
      ? {
          title: "No applications to track yet",
          description:
            "Shortlist a job or prepare an application and its local stages, notes, and exports will appear here.",
        }
      : !effectiveSelectedRecord
        ? {
            title: "No application selected",
            description:
              "Choose an application in the tracker to review and update its local stages, notes, and reminders.",
          }
        : {
            title: "No application selected in this view",
            description:
              "The application you had selected is not shown by this view's search or lifecycle filter, so its tracking tools are unavailable here. Clearing the search box, switching the lifecycle view, or choosing Show all applications will bring it back.",
          };

  return (
    <LockedScreenLayout
      contentClassName="xl:overflow-hidden"
      // Applications is a two-pane route like Find jobs and Shortlisted, so it
      // needs the same viewport bound they pass. Without it the grid's `1fr`
      // row resolves to max-content, the workspace grid's `xl:h-full` resolves
      // against an indefinite height, `xl:overflow-hidden` clips nothing, and
      // the panes marked `data-locked-pane-scroll-region` never get a scroll
      // range — so the whole route scrolled as one page and the detail pane's
      // recovery action fell below the fold on any record with a long status
      // stack.
      lockContentHeight
      topContent={
        <>
          {/* One list, one state per application. The stage tracker — table,
              board, calendar, saved views, columns, export — is a separate
              destination reached by name, not a peer tab that renders a CRM
              beside a single record. */}
          <PageHeaderStack
            actions={
              workspaceView === "crm" ? (
                <Button
                  data-testid="applications-close-tracker"
                  onClick={() => setWorkspaceView("workflow")}
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  <ArrowLeft aria-hidden="true" className="size-4" />
                  Back to Applications
                </Button>
              ) : applicationRecords.length > 0 ? (
                <Button
                  className="border-(--control-border)"
                  data-testid="applications-open-tracker"
                  onClick={() => setWorkspaceView("crm")}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  Open tracker
                </Button>
              ) : null
            }
            description={
              workspaceView === "crm"
                ? "Stages you record yourself, plus notes, reminders and export. Recording a stage is a local note; it never submits anything."
                : "Review progress, resolve blockers, and continue applications."
            }
            title={workspaceView === "crm" ? "Tracker" : "Applications"}
          />
          {props.safeguardsBlockerCount !== undefined &&
          props.safeguardsBlockerCount > 0 ? (
            <section
              aria-label="Active safeguards"
              className="flex flex-wrap items-center justify-between gap-4 rounded-(--radius-field) border border-destructive/30 bg-destructive/10 px-4 py-3"
            >
              <p className="min-w-0 text-(length:--text-small) leading-6 text-foreground">
                {props.safeguardsBlockerCount} active safeguard{" "}
                {props.safeguardsBlockerCount === 1 ? "blocker" : "blockers"}{" "}
                {props.safeguardsBlockerCount === 1 ? "needs" : "need"}{" "}
                attention. Affected work is paused; job discovery may still be
                available.
              </p>
              {props.onOpenSafeguards ? (
                <Button
                  onClick={props.onOpenSafeguards}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Open Safeguards
                </Button>
              ) : null}
            </section>
          ) : null}
          {/* The completion banner used to persist as page furniture and
              re-render on every return from the tracker as if it were a fresh
              event. It now appears only while it still asks something of the
              user; once nothing needs attention the same run is history and
              lives in the record's own run history. */}
          {latestFinishedAutomaticRun && latestRunAttentionCount > 0 ? (
            <section className="flex flex-wrap items-center justify-between gap-4 rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel-tint) px-4 py-3">
              <div className="min-w-0">
                <p className="label-mono-xs">Latest automatic run</p>
                <p className="mt-1 text-(length:--text-small) leading-6 text-foreground-soft">
                  {latestFinishedAutomaticRun.totalJobs} job
                  {latestFinishedAutomaticRun.totalJobs === 1 ? "" : "s"} ·{" "}
                  {latestRunAttentionCount} need attention ·{" "}
                  {latestRunSkippedCount} skipped
                </p>
              </div>
              <StatusBadge tone="critical">
                {`${latestRunAttentionCount} unusual ${
                  latestRunAttentionCount === 1 ? "case" : "cases"
                }`}
              </StatusBadge>
            </section>
          ) : null}
          {hasUnassignedLegacyLineage ? (
            <p className="text-(length:--text-small) leading-6 text-foreground-soft">
              Unassigned legacy preparation history is retained for audit only.
              It is not attached to an application record and has no action
              controls.
            </p>
          ) : null}
          {visibleActionMessage ? (
            <p
              aria-atomic="true"
              aria-live="polite"
              className="min-w-0 break-words rounded-(--radius-small) border border-primary/25 bg-primary/5 px-3 py-2 text-(length:--text-small) leading-6 text-foreground"
              data-testid="applications-route-action-status"
              role="status"
            >
              {visibleActionMessage}
            </p>
          ) : null}
        </>
      }
    >
      <div
        className="grid min-w-0 items-stretch gap-4 xl:h-full xl:min-h-0 xl:grid-cols-[minmax(22rem,0.95fr)_minmax(30rem,1.45fr)] xl:items-start xl:overflow-hidden"
        id="applications-workspace-content"
      >
        {workspaceView === "crm" ? (
          <ApplicationsCrmViews
            {...(props.onMutateApplicationCrmBulkStage
              ? {
                  onBulkStageChange: async (recordIds, stage) => {
                    const recordsById = new Map(
                      applicationRecords.map((record) => [record.id, record]),
                    );
                    const missingRecordIds = recordIds.filter(
                      (recordId) => !recordsById.has(recordId),
                    );
                    if (missingRecordIds.length > 0) {
                      throw new Error(
                        "Some selected applications are no longer available. Refresh and try again.",
                      );
                    }
                    await props.onMutateApplicationCrmBulkStage?.({
                      items: recordIds.map((recordId) => ({
                        applicationRecordId: recordId,
                        expectedRevision:
                          recordsById.get(recordId)?.crm?.revision ?? 0,
                      })),
                      stage,
                      customStageId: null,
                      note: "Updated from the application tracker bulk action.",
                    });
                  },
                }
              : {})}
            onSelectRecord={onSelectRecord}
            onViewChange={setCrmView}
            onVisibleRecordIdsChange={handleCrmVisibleRecordIdsChange}
            records={applicationRecords}
            discoveryJobs={discoveryJobs}
            selectedRecordId={effectiveSelectedRecord?.id ?? null}
            view={crmView}
          />
        ) : (
          <ApplicationsRecordsPanel
            activeFilter={activeFilter}
            applicationRecords={filteredApplicationRecords}
            filterCounts={filterCounts}
            hasAnyApplications={applicationRecords.length > 0}
            onFilterChange={setActiveFilter}
            onSelectRecord={selectRecordAndRevealDetails}
            selectedRecord={effectiveSelectedRecord}
            discoveryJobs={discoveryJobs}
          />
        )}
        {workspaceView === "crm" ? (
          isSelectedRecordInCrmView &&
          effectiveSelectedRecord &&
          props.crmSettings &&
          props.onMutateApplicationCrm &&
          props.onExportApplicationCrm ? (
            <div
              className="min-h-0 overflow-auto pr-1"
              data-locked-pane-scroll-region
            >
              <ApplicationsCrmDetail
                isRecordOutcomePending={
                  props.isRecordOutcomePending?.(
                    effectiveSelectedRecord.jobId,
                  ) ?? false
                }
                key={effectiveSelectedRecord.id}
                onExport={props.onExportApplicationCrm}
                onMutate={props.onMutateApplicationCrm}
                {...(props.onRecordOutcome
                  ? { onRecordOutcome: props.onRecordOutcome }
                  : {})}
                outcomeResumeStrategyId={
                  props.getOutcomeResumeStrategyId?.(
                    effectiveSelectedRecord.jobId,
                  ) ?? null
                }
                outcomeCampaignId={props.outcomeCampaignId ?? null}
                record={effectiveSelectedRecord}
                relatedJobCanonicalUrl={
                  discoveryJobs.find(
                    (job) => job.id === effectiveSelectedRecord.jobId,
                  )?.canonicalUrl ?? null
                }
                settings={props.crmSettings}
              />
            </div>
          ) : (
            <div className="min-h-0 overflow-auto pr-1">
              <EmptyState
                description={crmEmptyState.description}
                title={crmEmptyState.title}
              />
            </div>
          )
        ) : shouldPreserveHiddenSelection ? (
          <section className="surface-panel-shell relative flex min-w-0 flex-col gap-6 overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border) px-8 py-5 xl:h-full xl:min-h-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="grid gap-1">
                <p className="label-mono-xs">Details</p>
                <strong className="text-(length:--text-body) text-muted-foreground">
                  Filtered selection
                </strong>
              </div>
              <StatusBadge tone="muted">Not shown</StatusBadge>
            </div>
            <div className="flex min-h-0 flex-1 items-start justify-center pt-12">
              <EmptyState
                title="Selected application not shown by this filter"
                description={`The selected application is not shown by the ${APPLICATION_FILTER_LABELS[activeFilter]} filter. Try another filter to review it.`}
              />
            </div>
          </section>
        ) : (
          <ApplicationsDetailPanel
            activeFilter={activeFilter}
            applyRunDetails={applyRunDetails}
            applyRunDetailsTarget={applyRunDetailsTarget}
            applyRunDetailsError={applyRunDetailsError}
            applyRunDetailsStatus={applyRunDetailsStatus}
            applicationRecords={applicationRecords}
            applyJobResults={applyJobResults}
            dailyPreparationCapacity={dailyPreparationCapacity}
            discoveryJobs={discoveryJobs}
            applyRunHistory={applyRunHistory}
            effectiveSelectedApplyResult={effectiveSelectedApplyResult}
            hasAnyApplications={applicationRecords.length > 0}
            hasVisibleApplications={filteredApplicationRecords.length > 0}
            isApplyPending={isApplyPending}
            isApplyRequestPending={isApplyRequestPending}
            isApplyRunPending={isApplyRunPending}
            onApproveApplyRun={onApproveApplyRun}
            onCancelApplyRun={onCancelApplyRun}
            {...(props.onOpenCompany
              ? { onOpenCompany: props.onOpenCompany }
              : {})}
            selectedRecordCompanyId={
              effectiveSelectedRecord
                ? ((props.companies ?? []).find(
                    (company) =>
                      isListableCompanyName(company.canonicalName) &&
                      company.applicationRecordIds.includes(
                        effectiveSelectedRecord.id,
                      ),
                  )?.id ?? null)
                : null
            }
            onExportApplicationPacket={onExportApplicationPacket}
            {...(onResolveSubmissionOutcome
              ? { onResolveSubmissionOutcome }
              : {})}
            onSaveApplicationAnswer={async (command) => {
              replaceApplyRunDetails(await onSaveApplicationAnswer(command));
            }}
            onClearApplicationAnswer={async (command) => {
              replaceApplyRunDetails(await onClearApplicationAnswer(command));
            }}
            onResolveApplyConsentRequest={onResolveApplyConsentRequest}
            onRevokeApplyRunApproval={onRevokeApplyRunApproval}
            onStartAutoApplyQueue={onStartAutoApplyQueue}
            onSelectApplyRun={handleSelectApplyRun}
            onStartApplyCopilot={onStartApplyCopilot}
            onStartAutoApply={onStartAutoApply}
            {...(props.onOpenSafeguards
              ? { onOpenSafeguards: props.onOpenSafeguards }
              : {})}
            canConfirmFinishedInBrowser={
              props.canConfirmFinishedInBrowser ?? false
            }
            confirmFinishedInBrowserStatus={
              props.confirmFinishedInBrowserStatus ?? "idle"
            }
            confirmFinishedInBrowserBlockerText={
              props.confirmFinishedInBrowserBlockerText ?? null
            }
            {...(props.onConfirmFinishedInBrowser
              ? {
                  onConfirmFinishedInBrowser: props.onConfirmFinishedInBrowser,
                }
              : {})}
            {...(props.onFinishInBrowser
              ? { onFinishInBrowser: props.onFinishInBrowser }
              : {})}
            selectedApplyRunId={effectiveSelectedApplyRunId}
            selectedAttempt={
              showLatestAttemptDetails ? effectiveSelectedAttempt : null
            }
            selectedRecord={effectiveSelectedRecord}
          />
        )}
      </div>
    </LockedScreenLayout>
  );
}
