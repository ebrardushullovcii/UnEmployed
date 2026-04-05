import type { ApplicationAttempt, ApplicationRecord } from '@unemployed/contracts'
import { LockedScreenLayout } from '../../components/locked-screen-layout'
import { PageHeader } from '../../components/page-header'
import { ApplicationsDetailPanel } from './applications-detail-panel'
import { ApplicationsRecordsPanel } from './applications-records-panel'

export function ApplicationsScreen(props: {
  applicationRecords: readonly ApplicationRecord[]
  onSelectRecord: (recordId: string) => void
  selectedAttempt: ApplicationAttempt | null
  selectedRecord: ApplicationRecord | null
}) {
  const { applicationRecords, onSelectRecord, selectedAttempt, selectedRecord } = props

  return (
    <LockedScreenLayout
      contentClassName="xl:overflow-hidden"
      topClassName="pb-(--gap-section) pt-8"
      topContent={(
        <PageHeader
          eyebrow="Applied"
          title="Your applications"
          description="See each submission, follow-up, and status change in one place."
        />
      )}
    >
      <div className="grid min-h-124 min-w-0 items-stretch gap-4 xl:h-full xl:min-h-0 xl:grid-cols-[minmax(30rem,1.55fr)_minmax(20rem,1fr)] xl:overflow-hidden">
        <ApplicationsRecordsPanel
          applicationRecords={applicationRecords}
          onSelectRecord={onSelectRecord}
          selectedRecord={selectedRecord}
        />
        <ApplicationsDetailPanel selectedAttempt={selectedAttempt} selectedRecord={selectedRecord} />
      </div>
    </LockedScreenLayout>
  )
}
