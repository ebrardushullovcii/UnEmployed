import type { ApplicationRecord } from '@unemployed/contracts'
import { Badge } from '@renderer/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@renderer/components/ui/table'
import { cn } from '@renderer/lib/utils'
import { EmptyState } from '../../components/empty-state'
import { StatusBadge } from '../../components/status-badge'
import { formatStatusLabel, getApplicationTone } from '../../lib/job-finder-utils'

interface ApplicationsRecordsPanelProps {
  applicationRecords: readonly ApplicationRecord[]
  onSelectRecord: (recordId: string) => void
  selectedRecord: ApplicationRecord | null
}

export function ApplicationsRecordsPanel({
  applicationRecords,
  onSelectRecord,
  selectedRecord
}: ApplicationsRecordsPanelProps) {
  const recordCount = applicationRecords.length

  return (
    <section className="surface-panel-shell relative flex min-h-124 min-w-0 flex-col overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border) xl:h-full xl:min-h-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-(--surface-panel-border) px-8 py-5">
        <div className="flex items-center gap-4">
          <h2 className="font-display text-lg font-bold uppercase tracking-(--tracking-heading) text-primary">Applications</h2>
          <Badge variant="section">{recordCount} {recordCount === 1 ? 'application' : 'applications'}</Badge>
        </div>
      </div>
      {applicationRecords.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center p-8">
          <EmptyState
            title="No applications yet"
            description="Applications appear here after you move a shortlisted job into Applied, or when you manually track an application."
          />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-(--surface-panel-border) hover:bg-transparent">
                <TableHead className="px-4 text-[10px] uppercase tracking-(--tracking-mono) text-muted-foreground">Job</TableHead>
                <TableHead className="px-4 text-[10px] uppercase tracking-(--tracking-mono) text-muted-foreground">Last update</TableHead>
                <TableHead className="px-4 text-[10px] uppercase tracking-(--tracking-mono) text-muted-foreground">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {applicationRecords.map((record) => (
                <TableRow
                  key={record.id}
                  className={cn(
                    'border-(--surface-panel-border) text-[0.85rem] tracking-normal hover:bg-(--surface-panel-raised)',
                    selectedRecord?.id === record.id ? 'border-l-2 border-l-primary bg-(--surface-panel-raised)' : ''
                  )}
                >
                  <TableCell className="px-4 py-4 align-top">
                    <button
                      aria-current={selectedRecord?.id === record.id ? 'true' : undefined}
                      className="grid w-full gap-1 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
                      onClick={() => onSelectRecord(record.id)}
                      type="button"
                    >
                      <strong className="font-display text-[1rem] font-semibold tracking-[-0.015em] text-foreground">{record.title}</strong>
                      <span className="text-[0.8rem] text-muted-foreground">{record.company}</span>
                    </button>
                  </TableCell>
                  <TableCell className="px-4 py-4 text-[0.8rem] text-foreground-soft">{record.lastActionLabel}</TableCell>
                  <TableCell className="px-4 py-4"><StatusBadge tone={getApplicationTone(record.status)}>{formatStatusLabel(record.status)}</StatusBadge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  )
}
