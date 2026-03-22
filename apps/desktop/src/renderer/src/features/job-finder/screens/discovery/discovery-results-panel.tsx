import { Filter } from 'lucide-react'
import type { BrowserSessionState, SavedJob } from '@unemployed/contracts'
import { Badge } from '../../../../components/ui/badge'
import { Button } from '../../../../components/ui/button'
import { cn } from '../../../../lib/cn'
import { EmptyState } from '../../components/empty-state'
import { StatusBadge } from '../../components/status-badge'
import { formatDateOnly, formatStatusLabel, getApplicationTone } from '../../lib/job-finder-utils'

interface DiscoveryResultsPanelProps {
  browserSession: BrowserSessionState
  jobs: readonly SavedJob[]
  onSelectJob: (jobId: string) => void
  selectedJob: SavedJob | null
}

export function DiscoveryResultsPanel({
  browserSession,
  jobs,
  onSelectJob,
  selectedJob
}: DiscoveryResultsPanelProps) {
  return (
    <section className="border border-border/10 bg-surface overflow-hidden min-w-0">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border/10 bg-background/90 px-4 py-4 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <p className="font-display text-[11px] font-bold uppercase tracking-[0.18em] text-foreground">Results Stream [{jobs.length}]</p>
          <Badge variant="outline">SORT: MATCH_DESC</Badge>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Filter className="size-4" />
        </div>
      </div>
      {browserSession.status !== 'ready' ? (
        <EmptyState
          title="LinkedIn session needs attention"
          description="Discovery is blocked until the browser runtime reports a ready session for the LinkedIn adapter."
        />
      ) : null}
      {browserSession.status === 'ready' && jobs.length === 0 ? (
        <EmptyState
          title="No jobs saved yet"
          description="The discovery surface is wired and ready, but there are no matching jobs in the current repository state."
        />
      ) : null}
      {browserSession.status === 'ready' && jobs.length > 0 ? (
        <div className="flex flex-col">
          {jobs.map((job) => (
            <Button
              key={job.id}
              className={cn(
                'w-full rounded-none border-0 border-b border-border/10 bg-transparent p-4 text-left text-foreground transition-colors hover:bg-secondary',
                selectedJob?.id === job.id ? 'border-l-4 border-l-primary bg-secondary' : ''
              )}
              onClick={() => onSelectJob(job.id)}
              type="button"
            >
              <div className="mb-2 flex items-start justify-between gap-3">
                <div>
                  <span className="mb-1 block font-mono text-[10px] text-muted-foreground">ID: {job.id.toUpperCase()}</span>
                  <strong className="font-display text-sm font-bold tracking-tight text-foreground">{job.title}</strong>
                  <span className="mt-1 block text-[11px] text-muted-foreground">{job.company} • {job.location}</span>
                </div>
                <div className="text-right">
                  <span className="font-display text-xl font-black text-primary">{job.matchAssessment.score}</span>
                  <span className="block font-mono text-[8px] uppercase tracking-[0.14em] text-muted-foreground">FIT_INDEX</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusBadge tone={getApplicationTone(job.status)}>{formatStatusLabel(job.status)}</StatusBadge>
                <Badge variant="outline">POSTED: {formatDateOnly(job.postedAt).toUpperCase()}</Badge>
              </div>
            </Button>
          ))}
        </div>
      ) : null}
    </section>
  )
}
