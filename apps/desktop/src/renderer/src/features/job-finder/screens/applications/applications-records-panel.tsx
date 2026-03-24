import type { ApplicationRecord } from '@unemployed/contracts'
import { Filter, Search } from 'lucide-react'
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
  return (
    <section className="rounded-[var(--radius-field)] border border-[var(--surface-panel-border)] bg-[var(--surface-panel)] min-w-0 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--surface-panel-border)] px-8 py-5">
        <div className="flex items-center gap-4">
          <h2 className="font-display text-lg font-bold uppercase tracking-[var(--tracking-heading)] text-primary">Applications Log</h2>
          <Badge variant="section">{applicationRecords.length} active</Badge>
        </div>
        <div className="flex items-center gap-3 text-muted-foreground">
          <Badge variant="outline">ALL</Badge>
          <Badge variant="outline">INTERVIEW</Badge>
          <Badge variant="outline">PENDING</Badge>
          <Filter className="size-4" />
          <Search className="size-4" />
        </div>
      </div>
      {applicationRecords.length === 0 ? (
        <div className="p-8">
          <EmptyState
            title="No application records yet"
            description="Successful submissions and paused attempts will appear here once the apply workflow is active."
          />
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="border-[var(--surface-panel-border)] hover:bg-transparent">
              <TableHead className="px-4 font-mono text-[10px] uppercase tracking-[var(--tracking-mono)] text-muted-foreground">ID_STAMP</TableHead>
              <TableHead className="px-4 font-mono text-[10px] uppercase tracking-[var(--tracking-mono)] text-muted-foreground">Position entity</TableHead>
              <TableHead className="px-4 font-mono text-[10px] uppercase tracking-[var(--tracking-mono)] text-muted-foreground">Last action</TableHead>
              <TableHead className="px-4 font-mono text-[10px] uppercase tracking-[var(--tracking-mono)] text-muted-foreground">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {applicationRecords.map((record) => (
              <TableRow
                key={record.id}
                className={cn(
                  'cursor-pointer border-[var(--surface-panel-border)] text-[0.85rem] tracking-normal hover:bg-[var(--surface-panel-raised)]',
                  selectedRecord?.id === record.id ? 'border-l-2 border-l-primary bg-[var(--surface-panel-raised)]' : ''
                )}
                onClick={() => onSelectRecord(record.id)}
              >
                <TableCell className="px-4 py-4 font-mono text-[10px] text-muted-foreground">#{record.id.slice(0, 7).toUpperCase()}</TableCell>
                <TableCell className="px-4 py-4 align-top">
                  <div className="grid gap-1">
                    <strong className="font-display text-[1rem] font-semibold tracking-[-0.015em] text-foreground">{record.title}</strong>
                    <span className="text-[0.8rem] text-muted-foreground">{record.company}</span>
                  </div>
                </TableCell>
                <TableCell className="px-4 py-4 text-[0.8rem] text-foreground-soft">{record.lastActionLabel}</TableCell>
                <TableCell className="px-4 py-4"><StatusBadge tone={getApplicationTone(record.status)}>{formatStatusLabel(record.status)}</StatusBadge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  )
}
