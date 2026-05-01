import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ApplicationAttempt,
  ApplicationRecord,
  ApplyRunDetails,
  JobFinderWorkspaceSnapshot,
} from "@unemployed/contracts";
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

export function ApplicationsScreen(props: {
  applicationAttempts: readonly ApplicationAttempt[];
  applicationRecords: readonly ApplicationRecord[];
  applyRuns: JobFinderWorkspaceSnapshot["applyRuns"];
  applyJobResults: JobFinderWorkspaceSnapshot["applyJobResults"];
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
  onResolveApplyConsentRequest: (
    requestId: string,
    action: "approve" | "decline",
  ) => void;
  onRevokeApplyRunApproval: (runId: string) => void;
  onStartAutoApplyQueue: (jobIds: string[]) => void;
  onStartApplyCopilot: (jobId: string) => void;
  onStartAutoApply: (jobId: string) => void;
  selectedApplyRunId: string | null;
  onSelectRecord: (recordId: string) => void;
  selectedAttempt: ApplicationAttempt | null;
  selectedRecord: ApplicationRecord | null;
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
        <PageHeader
          eyebrow="Applications"
          title="Applications"
          description="Use this view to triage what needs attention, review the latest attempt, and keep each job moving forward."
        />
      }
    >
      <div className="grid min-h-124 min-w-0 items-stretch gap-4 xl:h-full xl:min-h-0 xl:grid-cols-[minmax(22rem,0.95fr)_minmax(30rem,1.45fr)] xl:overflow-hidden">
        <ApplicationsRecordsPanel
          activeFilter={activeFilter}
          applicationRecords={filteredApplicationRecords}
          filterCounts={filterCounts}
          hasAnyApplications={applicationRecords.length > 0}
          onFilterChange={setActiveFilter}
          onSelectRecord={onSelectRecord}
          selectedRecord={effectiveSelectedRecord}
        />
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
      </div>
    </LockedScreenLayout>
  );
}
