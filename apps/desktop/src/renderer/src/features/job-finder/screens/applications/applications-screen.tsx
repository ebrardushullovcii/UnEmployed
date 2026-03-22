import type { ApplicationAttempt, ApplicationRecord } from '@unemployed/contracts'
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
    <section className="grid gap-[1.65rem]">
      <PageHeader
        eyebrow="Applications"
        title="Applications Log"
        description="Tracked statuses, follow-ups, and timeline events for the first set of saved application records."
      />

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(30rem,1.55fr)_minmax(20rem,1fr)]">
        <ApplicationsRecordsPanel
          applicationRecords={applicationRecords}
          onSelectRecord={onSelectRecord}
          selectedRecord={selectedRecord}
        />
        <ApplicationsDetailPanel selectedAttempt={selectedAttempt} selectedRecord={selectedRecord} />
      </div>
    </section>
  )
}
