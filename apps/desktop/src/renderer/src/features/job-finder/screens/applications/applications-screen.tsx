import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ApplicationCrmExportFormat,
  ApplicationCrmMutationInput,
  ApplicationCrmSettings,
  ApplicationAttempt,
  ApplicationRecord,
  ApplyRunDetails,
  ClearApplicationAnswerCommandInput,
  CompanyEntity,
  JobFinderWorkspaceSnapshot,
  RecordOutcomeInput,
  SaveApplicationAnswerCommandInput,
} from "@unemployed/contracts";
import { Button } from "@renderer/components/ui/button";
import { LockedScreenLayout } from "../../components/locked-screen-layout";
import { PageHeader } from "../../components/page-header";
import { ApplicationsDetailPanel } from "./applications-detail-panel";
import {
  APPLICATION_FILTERS,
  type ApplicationsViewFilter,
} from "./applications-filters";
import {
  getLatestApplicationAttemptForRecord,
  matchesApplicationsFilter,
  pickLatestIsoTimestamp,
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
  applicationAttempts: readonly ApplicationAttempt[];
  applicationRecords: readonly ApplicationRecord[];
  applyRuns: JobFinderWorkspaceSnapshot["applyRuns"];
  applyJobResults: JobFinderWorkspaceSnapshot["applyJobResults"];
  companies?: readonly CompanyEntity[];
  discoveryJobs: JobFinderWorkspaceSnapshot["discoveryJobs"];
  isApplyPending: boolean;
  isApplyRequestPending: (requestId: string) => boolean;
  isApplyRunPending: (runId: string) => boolean;
  onApproveApplyRun: (runId: string) => void;
  onCancelApplyRun: (runId: string) => void;
  onGetApplyRunDetails: (
    runId: string,
    jobId: string,
  ) => Promise<ApplyRunDetails>;
  onSaveApplicationAnswer: (
    command: SaveApplicationAnswerCommandInput,
  ) => Promise<ApplyRunDetails>;
  onClearApplicationAnswer: (
    command: ClearApplicationAnswerCommandInput,
  ) => Promise<ApplyRunDetails>;
  onExportApplicationPacket: (runId: string, jobId: string) => Promise<void>;
  onResolveApplyConsentRequest: (
    requestId: string,
    action: "approve" | "decline",
  ) => void;
  onRevokeApplyRunApproval: (runId: string) => void;
  onStartAutoApplyQueue: (jobIds: string[]) => void;
  onStartApplyCopilot: (jobId: string) => void;
  onStartAutoApply: (jobId: string) => void;
  onOpenCompany?: (companyId: string) => void;
  selectedApplyRunId: string | null;
  onSelectRecord: (recordId: string) => void;
  selectedAttempt: ApplicationAttempt | null;
  selectedRecord: ApplicationRecord | null;
  crmSettings?: ApplicationCrmSettings;
  onMutateApplicationCrm?: (
    command: ApplicationCrmMutationInput,
  ) => Promise<void>;
  onExportApplicationCrm?: (
    format: ApplicationCrmExportFormat,
    recordId: string,
  ) => Promise<void>;
  onRecordOutcome?: (input: RecordOutcomeInput) => Promise<void>;
  isRecordOutcomePending?: (jobId: string) => boolean;
  getOutcomeResumeStrategyId?: (jobId: string) => string | null;
  safeguardsBlockerCount?: number;
  onOpenSafeguards?: () => void;
}) {
  const {
    applicationAttempts,
    applicationRecords,
    applyRuns,
    applyJobResults,
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
  const [workspaceView, setWorkspaceView] = useState<"workflow" | "crm">(
    "workflow",
  );
  const [crmView, setCrmView] = useState<ApplicationCrmView>("table");
  const [selectedApplyRunIdByJobId, setSelectedApplyRunIdByJobId] = useState<
    Record<string, string>
  >({});
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
  const effectiveSelectedRecord =
    filteredApplicationRecords.find(
      (record) => record.id === selectedRecord?.id,
    ) ??
    filteredApplicationRecords[0] ??
    null;
  const effectiveSelectedAttempt =
    effectiveSelectedRecord?.id === selectedRecord?.id
      ? selectedAttempt
      : effectiveSelectedRecord
        ? getLatestApplicationAttemptForRecord(
            effectiveSelectedRecord,
            applicationAttempts,
          )
        : null;
  const applyRunsById = useMemo(
    () => new Map(applyRuns.map((run) => [run.id, run])),
    [applyRuns],
  );
  const applyResultsForSelectedRecord = useMemo(() => {
    if (!effectiveSelectedRecord) {
      return [];
    }

    return [...applyJobResults]
      .filter((result) => result.jobId === effectiveSelectedRecord.jobId)
      .sort(
        (left, right) =>
          new Date(right.updatedAt).getTime() -
          new Date(left.updatedAt).getTime(),
      );
  }, [applyJobResults, effectiveSelectedRecord]);
  const effectiveSelectedApplyRunId = useMemo(() => {
    if (!effectiveSelectedRecord) {
      return null;
    }

    const jobId = effectiveSelectedRecord.jobId;
    const locallySelectedRunId = selectedApplyRunIdByJobId[jobId] ?? null;

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
    selectedApplyRunIdByJobId,
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

      setSelectedApplyRunIdByJobId((current) => ({
        ...current,
        [effectiveSelectedRecord.jobId]: runId,
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

    setSelectedApplyRunIdByJobId((current) => {
      if (current[effectiveSelectedRecord.jobId] === selectedApplyRunId) {
        return current;
      }

      return {
        ...current,
        [effectiveSelectedRecord.jobId]: selectedApplyRunId,
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

  return (
    <LockedScreenLayout
      contentClassName="xl:overflow-hidden"
      topClassName="pb-(--gap-section) pt-8"
      topContent={
        <div className="grid gap-4">
          <PageHeader
            eyebrow="Applications"
            title="Applications"
            description="See what needs attention, review the latest attempt, and keep each application moving."
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
                are pausing discovery and application preparation.
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
          {latestFinishedAutomaticRun ? (
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
              <StatusBadge
                tone={
                  latestRunAttentionCount > 0
                    ? "critical"
                    : latestFinishedAutomaticRun.state === "completed"
                      ? "positive"
                      : "muted"
                }
              >
                {latestRunAttentionCount > 0
                  ? `${latestRunAttentionCount} unusual ${latestRunAttentionCount === 1 ? "case" : "cases"}`
                  : latestFinishedAutomaticRun.state === "completed"
                    ? "No unusual cases"
                    : latestFinishedAutomaticRun.state}
              </StatusBadge>
            </section>
          ) : null}
          <div
            aria-label="Applications workspace view"
            className="flex w-fit gap-1 rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel-tint) p-1"
            role="group"
          >
            <Button
              aria-pressed={workspaceView === "workflow"}
              onClick={() => setWorkspaceView("workflow")}
              size="sm"
              type="button"
              variant={workspaceView === "workflow" ? "secondary" : "ghost"}
            >
              Preparation
            </Button>
            <Button
              aria-pressed={workspaceView === "crm"}
              onClick={() => setWorkspaceView("crm")}
              size="sm"
              type="button"
              variant={workspaceView === "crm" ? "secondary" : "ghost"}
            >
              Tracker
            </Button>
          </div>
        </div>
      }
    >
      <div className="grid min-h-124 min-w-0 items-stretch gap-4 xl:h-full xl:min-h-0 xl:grid-cols-[minmax(22rem,0.95fr)_minmax(30rem,1.45fr)] xl:overflow-hidden">
        {workspaceView === "crm" ? (
          <ApplicationsCrmViews
            {...(props.onMutateApplicationCrm
              ? {
                  onBulkStageChange: async (recordIds, stage) => {
                    for (const recordId of recordIds) {
                      const record = applicationRecords.find(
                        (candidate) => candidate.id === recordId,
                      );
                      if (!record) continue;
                      await props.onMutateApplicationCrm?.({
                        applicationRecordId: record.id,
                        expectedRevision: record.crm?.revision ?? 0,
                        mutation: {
                          type: "set_stage",
                          stage,
                          customStageId: null,
                          note: "Updated from the application tracker bulk action.",
                        },
                      });
                    }
                  },
                }
              : {})}
            onSelectRecord={onSelectRecord}
            onViewChange={setCrmView}
            records={applicationRecords}
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
            onSelectRecord={onSelectRecord}
            selectedRecord={effectiveSelectedRecord}
          />
        )}
        {workspaceView === "crm" &&
        effectiveSelectedRecord &&
        props.crmSettings &&
        props.onMutateApplicationCrm &&
        props.onExportApplicationCrm ? (
          <div className="min-h-0 overflow-auto pr-1">
            <ApplicationsCrmDetail
              isRecordOutcomePending={
                props.isRecordOutcomePending?.(effectiveSelectedRecord.jobId) ??
                false
              }
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
              record={effectiveSelectedRecord}
              settings={props.crmSettings}
            />
          </div>
        ) : (
          <ApplicationsDetailPanel
            activeFilter={activeFilter}
            applyRunDetails={applyRunDetails}
            applyRunDetailsTarget={applyRunDetailsTarget}
            applyRunDetailsError={applyRunDetailsError}
            applyRunDetailsStatus={applyRunDetailsStatus}
            applicationRecords={applicationRecords}
            applyJobResults={applyJobResults}
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
                      company.applicationRecordIds.includes(
                        effectiveSelectedRecord.id,
                      ) ||
                      company.jobIds.includes(effectiveSelectedRecord.jobId),
                  )?.id ?? null)
                : null
            }
            onExportApplicationPacket={onExportApplicationPacket}
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
