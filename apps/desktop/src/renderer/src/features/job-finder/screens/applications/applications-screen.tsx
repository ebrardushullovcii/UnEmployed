import { useEffect, useMemo, useState } from 'react'
import type { ApplicationAttempt, ApplicationRecord } from '@unemployed/contracts'
import { LockedScreenLayout } from '../../components/locked-screen-layout'
import { PageHeader } from '../../components/page-header'
import { ApplicationsDetailPanel } from './applications-detail-panel'
import { ApplicationsRecordsPanel } from './applications-records-panel'

export type ApplicationsViewFilter = 'all' | 'needs_action' | 'in_progress' | 'submitted' | 'manual_only'

const APPLICATION_FILTERS: readonly ApplicationsViewFilter[] = [
  'all',
  'needs_action',
  'in_progress',
  'submitted',
  'manual_only'
]

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

export function ApplicationsScreen(props: {
  applicationAttempts: readonly ApplicationAttempt[]
  applicationRecords: readonly ApplicationRecord[]
  onSelectRecord: (recordId: string) => void
  selectedAttempt: ApplicationAttempt | null
  selectedRecord: ApplicationRecord | null
}) {
  const {
    applicationAttempts,
    applicationRecords,
    onSelectRecord,
    selectedAttempt,
    selectedRecord
  } = props
  const [activeFilter, setActiveFilter] = useState<ApplicationsViewFilter>('all')
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

  useEffect(() => {
    if (!effectiveSelectedRecord || effectiveSelectedRecord.id === selectedRecord?.id) {
      return
    }

    onSelectRecord(effectiveSelectedRecord.id)
  }, [effectiveSelectedRecord, onSelectRecord, selectedRecord?.id])

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
          hasAnyApplications={applicationRecords.length > 0}
          hasVisibleApplications={filteredApplicationRecords.length > 0}
          selectedAttempt={effectiveSelectedAttempt}
          selectedRecord={effectiveSelectedRecord}
        />
      </div>
    </LockedScreenLayout>
  )
}
