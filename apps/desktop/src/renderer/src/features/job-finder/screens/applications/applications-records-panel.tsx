import type { ApplicationRecord } from '@unemployed/contracts'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
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
import { formatStatusLabel, getApplicationTone, getAttemptLabel } from '../../lib/job-finder-utils'
import type { ApplicationsViewFilter } from './applications-screen'

function getAttemptTone(value: ApplicationRecord['lastAttemptState']) {
  switch (value) {
    case 'submitted':
      return 'positive' as const
    case 'failed':
    case 'unsupported':
      return 'critical' as const
    case 'paused':
    case 'in_progress':
      return 'active' as const
    default:
      return 'muted' as const
  }
}

interface ApplicationsRecordsPanelProps {
  activeFilter: ApplicationsViewFilter
  applicationRecords: readonly ApplicationRecord[]
  filterCounts: Record<ApplicationsViewFilter, number>
  hasAnyApplications: boolean
  onFilterChange: (filter: ApplicationsViewFilter) => void
  onSelectRecord: (recordId: string) => void
  selectedRecord: ApplicationRecord | null
}

const filterOptions: Array<{ label: string; value: ApplicationsViewFilter }> = [
  { label: 'All', value: 'all' },
  { label: 'Needs action', value: 'needs_action' },
  { label: 'In progress', value: 'in_progress' },
  { label: 'Submitted', value: 'submitted' },
  { label: 'Manual only', value: 'manual_only' }
]

export function ApplicationsRecordsPanel({
  activeFilter,
  applicationRecords,
  filterCounts,
  hasAnyApplications,
  onFilterChange,
  onSelectRecord,
  selectedRecord
}: ApplicationsRecordsPanelProps) {
  const recordCount = applicationRecords.length

  return (
    <section className="surface-panel-shell relative flex min-h-124 min-w-0 flex-col overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border) xl:h-full xl:min-h-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-(--surface-panel-border) px-8 py-5">
        <div className="flex flex-wrap items-center gap-4">
          <h2 className="font-display text-lg font-bold uppercase tracking-(--tracking-heading) text-primary">Application tracker</h2>
          <Badge variant="section">{recordCount} {recordCount === 1 ? 'application' : 'applications'}</Badge>
        </div>

        <div className="flex flex-wrap gap-2">
          {filterOptions.map((filterOption) => (
            <Button
              aria-pressed={activeFilter === filterOption.value}
              className="rounded-full"
              key={filterOption.value}
              onClick={() => onFilterChange(filterOption.value)}
              size="sm"
              type="button"
              variant={activeFilter === filterOption.value ? 'secondary' : 'ghost'}
            >
              {filterOption.label}
              <span className="rounded-full border border-current/15 px-1.5 py-0.5 text-[10px] leading-none">
                {filterCounts[filterOption.value]}
              </span>
            </Button>
          ))}
        </div>
      </div>
      {applicationRecords.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center p-8">
          <EmptyState
            title={hasAnyApplications ? 'No applications in this view' : 'No applications yet'}
            description={hasAnyApplications ? 'Try another filter to review the rest of your application history.' : 'Applications appear here after you start one from Shortlisted.'}
          />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-(--surface-panel-border) hover:bg-transparent">
                <TableHead className="px-4 text-[10px] uppercase tracking-(--tracking-mono) text-muted-foreground">Job</TableHead>
                <TableHead className="px-4 text-[10px] uppercase tracking-(--tracking-mono) text-muted-foreground">Latest activity</TableHead>
                <TableHead className="px-4 text-[10px] uppercase tracking-(--tracking-mono) text-muted-foreground">Stage</TableHead>
                <TableHead className="px-4 text-[10px] uppercase tracking-(--tracking-mono) text-muted-foreground">Apply attempt</TableHead>
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
                  <TableCell className="px-4 py-4"><StatusBadge tone={getAttemptTone(record.lastAttemptState)}>{getAttemptLabel(record.lastAttemptState)}</StatusBadge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  )
}
