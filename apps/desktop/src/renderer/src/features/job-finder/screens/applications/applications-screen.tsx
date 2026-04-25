import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  ApplicationAttempt,
  ApplicationRecord,
  ApplyRunDetails,
  JobFinderWorkspaceSnapshot,
} from '@unemployed/contracts'
import { LockedScreenLayout } from '../../components/locked-screen-layout'
import { PageHeader } from '../../components/page-header'
import { ApplicationsDetailPanel } from './applications-detail-panel'
import { APPLICATION_FILTERS, type ApplicationsViewFilter } from './applications-filters'
import { ApplicationsRecordsPanel } from './applications-records-panel'

function getLatestApplicationAttemptForRecord(
  record: ApplicationRecord,
  applicationAttempts: readonly ApplicationAttempt[]
) {
  return [...applicationAttempts]
    .filter((attempt) => attempt.jobId === record.jobId)
    .sort(
      (left, right) =>
        new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
    )[0] ?? null
}

function isTerminalApplicationStatus(status: ApplicationRecord['status']) {
  return (
    status === 'submitted' ||
    status === 'rejected' ||
    status === 'offer' ||
    status === 'withdrawn' ||
    status === 'archived'
  )
}

function matchesApplicationsFilter(
  record: ApplicationRecord,
  filter: ApplicationsViewFilter
) {
  const needsAction =
    record.lastAttemptState === 'paused' ||
    record.lastAttemptState === 'failed' ||
    record.lastAttemptState === 'unsupported' ||
    (Boolean(record.nextActionLabel) &&
      !isTerminalApplicationStatus(record.status) &&
      record.lastAttemptState !== 'in_progress')
  const submitted = record.status === 'submitted'
  const manualOnly = record.lastAttemptState === 'unsupported'
  const inProgress =
    record.lastAttemptState === 'in_progress' ||
    (!needsAction &&
      !submitted &&
      (record.status === 'drafting' ||
        record.status === 'ready_for_review' ||
        record.status === 'approved' ||
        record.status === 'assessment' ||
        record.status === 'interview'))

  switch (filter) {
    case 'needs_action':
      return needsAction
    case 'in_progress':
      return inProgress
    case 'submitted':
      return submitted
    case 'manual_only':
      return manualOnly
    default:
      return true
  }
}

function pickLatestIsoTimestamp(...values: Array<string | null | undefined>) {
  let latestValue: string | null = null
  let latestTimestamp = Number.NEGATIVE_INFINITY

  for (const value of values) {
    if (!value) {
      continue
    }

    const parsedTimestamp = Date.parse(value)
    if (Number.isNaN(parsedTimestamp) || parsedTimestamp <= latestTimestamp) {
      continue
    }

    latestTimestamp = parsedTimestamp
    latestValue = value
  }

  return latestValue
}

export function ApplicationsScreen(props: {
  applicationAttempts: readonly ApplicationAttempt[]
  applicationRecords: readonly ApplicationRecord[]
  applyRuns: JobFinderWorkspaceSnapshot['applyRuns']
  applyJobResults: JobFinderWorkspaceSnapshot['applyJobResults']
  busy: boolean
  discoveryJobs: JobFinderWorkspaceSnapshot['discoveryJobs']
  onApproveApplyRun: (runId: string) => void
  onCancelApplyRun: (runId: string) => void
  onGetApplyRunDetails: (runId: string, jobId: string) => Promise<ApplyRunDetails>
  onResolveApplyConsentRequest: (
    requestId: string,
    action: 'approve' | 'decline'
  ) => void
  onRevokeApplyRunApproval: (runId: string) => void
  onStartAutoApplyQueue: (jobIds: string[]) => void
  onStartApplyCopilot: (jobId: string) => void
  onStartAutoApply: (jobId: string) => void
  selectedApplyRunId: string | null
  onSelectRecord: (recordId: string) => void
  selectedAttempt: ApplicationAttempt | null
  selectedRecord: ApplicationRecord | null
}) {
  const {
    applicationAttempts,
    applicationRecords,
    applyRuns,
    applyJobResults,
    busy,
    discoveryJobs,
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
    selectedRecord
  } = props
  const [activeFilter, setActiveFilter] = useState<ApplicationsViewFilter>('all')
  const [selectedApplyRunIdByJobId, setSelectedApplyRunIdByJobId] = useState<
    Record<string, string>
  >({})
  const [applyRunDetails, setApplyRunDetails] = useState<ApplyRunDetails | null>(null)
  const [applyRunDetailsTarget, setApplyRunDetailsTarget] = useState<{
    jobId: string
    runId: string
  } | null>(null)
  const [applyRunDetailsStatus, setApplyRunDetailsStatus] = useState<
    'idle' | 'loading' | 'ready' | 'error'
  >('idle')
  const [applyRunDetailsError, setApplyRunDetailsError] = useState<string | null>(null)
  const lastFetchedApplyRunRef = useRef<{
    jobId: string
    runId: string
    updatedAt: string | null
  } | null>(null)
  const filterCounts = useMemo(
    () =>
      Object.fromEntries(
        APPLICATION_FILTERS.map((filter) => [
          filter,
          applicationRecords.filter((record) => matchesApplicationsFilter(record, filter)).length
        ])
      ) as Record<ApplicationsViewFilter, number>,
    [applicationRecords]
  )
  const filteredApplicationRecords = useMemo(
    () => applicationRecords.filter((record) => matchesApplicationsFilter(record, activeFilter)),
    [activeFilter, applicationRecords]
  )
  const effectiveSelectedRecord =
    filteredApplicationRecords.find((record) => record.id === selectedRecord?.id) ??
    filteredApplicationRecords[0] ??
    null
  const effectiveSelectedAttempt =
    effectiveSelectedRecord?.id === selectedRecord?.id
      ? selectedAttempt
      : effectiveSelectedRecord
        ? getLatestApplicationAttemptForRecord(effectiveSelectedRecord, applicationAttempts)
        : null
  const applyRunsById = useMemo(
    () => new Map(applyRuns.map((run) => [run.id, run])),
    [applyRuns],
  )
  const applyResultsForSelectedRecord = useMemo(() => {
    if (!effectiveSelectedRecord) {
      return []
    }

    return [...applyJobResults]
      .filter((result) => result.jobId === effectiveSelectedRecord.jobId)
      .sort(
        (left, right) =>
          new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
      )
  }, [applyJobResults, effectiveSelectedRecord])
  const effectiveSelectedApplyRunId = useMemo(() => {
    if (!effectiveSelectedRecord) {
      return null
    }

    const jobId = effectiveSelectedRecord.jobId
    const locallySelectedRunId = selectedApplyRunIdByJobId[jobId] ?? null

    if (
      locallySelectedRunId &&
      applyResultsForSelectedRecord.some((result) => result.runId === locallySelectedRunId)
    ) {
      return locallySelectedRunId
    }

    if (
      selectedApplyRunId &&
      applyResultsForSelectedRecord.some((result) => result.runId === selectedApplyRunId)
    ) {
      return selectedApplyRunId
    }

    return applyResultsForSelectedRecord[0]?.runId ?? null
  }, [
    applyResultsForSelectedRecord,
    effectiveSelectedRecord,
    selectedApplyRunId,
    selectedApplyRunIdByJobId,
  ])
  const effectiveSelectedApplyResult = useMemo(
    () =>
      applyResultsForSelectedRecord.find(
        (result) => result.runId === effectiveSelectedApplyRunId,
      ) ?? applyResultsForSelectedRecord[0] ?? null,
    [applyResultsForSelectedRecord, effectiveSelectedApplyRunId],
  )
  const applyRunHistory = useMemo(
    () =>
      applyResultsForSelectedRecord.map((result) => ({
        result,
        run: applyRunsById.get(result.runId) ?? null,
      })),
    [applyResultsForSelectedRecord, applyRunsById],
  )
  const latestApplyRunIdForSelectedRecord = applyResultsForSelectedRecord[0]?.runId ?? null
  const effectiveSelectedJobId = effectiveSelectedRecord?.jobId ?? null
  const effectiveSelectedRunId = effectiveSelectedApplyResult?.runId ?? null
  const selectedApplyRun = effectiveSelectedRunId
    ? applyRunsById.get(effectiveSelectedRunId) ?? null
    : null
  const effectiveSelectedRunUpdatedAt = pickLatestIsoTimestamp(
    selectedApplyRun?.updatedAt,
    effectiveSelectedApplyResult?.updatedAt,
  )
  const showLatestAttemptDetails =
    !effectiveSelectedApplyRunId ||
    !latestApplyRunIdForSelectedRecord ||
    effectiveSelectedApplyRunId === latestApplyRunIdForSelectedRecord

  const handleSelectApplyRun = useCallback(
    (runId: string) => {
      if (!effectiveSelectedRecord) {
        return
      }

      setSelectedApplyRunIdByJobId((current) => ({
        ...current,
        [effectiveSelectedRecord.jobId]: runId,
      }))
    },
    [effectiveSelectedRecord],
  )

  useEffect(() => {
    if (!effectiveSelectedRecord || !selectedApplyRunId) {
      return
    }

    if (
      !applyResultsForSelectedRecord.some((result) => result.runId === selectedApplyRunId)
    ) {
      return
    }

    setSelectedApplyRunIdByJobId((current) => {
      if (current[effectiveSelectedRecord.jobId] === selectedApplyRunId) {
        return current
      }

      return {
        ...current,
        [effectiveSelectedRecord.jobId]: selectedApplyRunId,
      }
    })
  }, [applyResultsForSelectedRecord, effectiveSelectedRecord, selectedApplyRunId])

  useEffect(() => {
    if (!effectiveSelectedRecord || effectiveSelectedRecord.id === selectedRecord?.id) {
      return
    }

    onSelectRecord(effectiveSelectedRecord.id)
  }, [effectiveSelectedRecord, onSelectRecord, selectedRecord?.id])

  useEffect(() => {
    let cancelled = false

    if (!effectiveSelectedJobId || !effectiveSelectedRunId) {
      lastFetchedApplyRunRef.current = null
      setApplyRunDetails(null)
      setApplyRunDetailsTarget(null)
      setApplyRunDetailsStatus('idle')
      setApplyRunDetailsError(null)
      return () => {
        cancelled = true
      }
    }

    const lastFetchedUpdatedAt = lastFetchedApplyRunRef.current?.updatedAt
    const selectedRunUpdatedAtMs =
      effectiveSelectedRunUpdatedAt == null
        ? Number.NaN
        : Date.parse(effectiveSelectedRunUpdatedAt)
    const lastFetchedUpdatedAtMs =
      lastFetchedUpdatedAt == null ? Number.NaN : Date.parse(lastFetchedUpdatedAt)
    const hasValidParsedUpdatedAt =
      !Number.isNaN(selectedRunUpdatedAtMs) && !Number.isNaN(lastFetchedUpdatedAtMs)

    if (
      lastFetchedApplyRunRef.current?.jobId === effectiveSelectedJobId &&
      lastFetchedApplyRunRef.current?.runId === effectiveSelectedRunId &&
      applyRunDetailsStatus === 'ready' &&
      applyRunDetailsTarget?.jobId === effectiveSelectedJobId &&
      applyRunDetailsTarget?.runId === effectiveSelectedRunId &&
      (effectiveSelectedRunUpdatedAt == null ||
        (lastFetchedUpdatedAt != null &&
          hasValidParsedUpdatedAt &&
          selectedRunUpdatedAtMs <= lastFetchedUpdatedAtMs))
    ) {
      return () => {
        cancelled = true
      }
    }

    setApplyRunDetails(null)
    setApplyRunDetailsTarget(null)
    setApplyRunDetailsStatus('loading')
    setApplyRunDetailsError(null)

    void onGetApplyRunDetails(effectiveSelectedRunId, effectiveSelectedJobId)
      .then((details) => {
        if (cancelled) {
          return
        }

        lastFetchedApplyRunRef.current = {
          jobId: effectiveSelectedJobId,
          runId: effectiveSelectedRunId,
          updatedAt: pickLatestIsoTimestamp(
            details.run.updatedAt,
            details.result?.updatedAt,
            effectiveSelectedRunUpdatedAt,
          ),
        }
        setApplyRunDetails(details)
        setApplyRunDetailsTarget({
          jobId: effectiveSelectedJobId,
          runId: effectiveSelectedRunId,
        })
        setApplyRunDetailsStatus('ready')
      })
      .catch((error) => {
        if (cancelled) {
          return
        }

        lastFetchedApplyRunRef.current = null
        setApplyRunDetails(null)
        setApplyRunDetailsTarget(null)
        setApplyRunDetailsStatus('error')
        setApplyRunDetailsError(
          error instanceof Error
            ? error.message
            : 'Apply run details could not be loaded.',
        )
      })

    return () => {
      cancelled = true
    }
  }, [
    effectiveSelectedJobId,
    effectiveSelectedRunId,
    effectiveSelectedRunUpdatedAt,
    applyRunDetailsStatus,
    applyRunDetailsTarget,
    onGetApplyRunDetails,
  ])

  return (
    <LockedScreenLayout
      contentClassName="xl:overflow-hidden"
      topClassName="pb-(--gap-section) pt-8"
      topContent={(
        <PageHeader
          eyebrow="Applications"
          title="Applications"
          description="Use this view to triage what needs attention, review the latest attempt, and keep each job moving forward."
        />
      )}
    >
      <div className="grid min-h-124 min-w-0 items-stretch gap-4 xl:h-full xl:min-h-0 xl:grid-cols-[minmax(30rem,1.55fr)_minmax(20rem,1fr)] xl:overflow-hidden">
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
          busy={busy}
          discoveryJobs={discoveryJobs}
          applyRunHistory={applyRunHistory}
          effectiveSelectedApplyResult={effectiveSelectedApplyResult}
          hasAnyApplications={applicationRecords.length > 0}
          hasVisibleApplications={filteredApplicationRecords.length > 0}
          onApproveApplyRun={onApproveApplyRun}
          onCancelApplyRun={onCancelApplyRun}
          onResolveApplyConsentRequest={onResolveApplyConsentRequest}
          onRevokeApplyRunApproval={onRevokeApplyRunApproval}
          onStartAutoApplyQueue={onStartAutoApplyQueue}
          onSelectApplyRun={handleSelectApplyRun}
          onStartApplyCopilot={onStartApplyCopilot}
          onStartAutoApply={onStartAutoApply}
          selectedApplyRunId={effectiveSelectedApplyRunId}
          selectedAttempt={showLatestAttemptDetails ? effectiveSelectedAttempt : null}
          selectedRecord={effectiveSelectedRecord}
        />
      </div>
    </LockedScreenLayout>
  )
}
