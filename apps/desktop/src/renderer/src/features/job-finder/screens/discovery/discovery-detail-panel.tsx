import type { SavedJob } from '@unemployed/contracts'
import { Button } from '../../../../components/ui/button'
import { EmptyState } from '../../components/empty-state'
import { PreferenceList } from '../../components/preference-list'
import { StatusBadge } from '../../components/status-badge'
import { formatDateOnly, formatStatusLabel, getApplicationTone } from '../../lib/job-finder-utils'

interface DiscoveryDetailPanelProps {
  busy: boolean
  onDismissJob: (jobId: string) => void
  onQueueJob: (jobId: string) => void
  selectedJob: SavedJob | null
}

export function DiscoveryDetailPanel({
  busy,
  onDismissJob,
  onQueueJob,
  selectedJob
}: DiscoveryDetailPanelProps) {
  return (
    <section className="border-l border-border/10 bg-card px-6 py-6 grid content-start gap-6 min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="font-display text-[11px] font-bold uppercase tracking-[0.18em] text-primary">Deep Dive Match</p>
        <StatusBadge tone={selectedJob ? getApplicationTone(selectedJob.status) : 'muted'}>
          {selectedJob ? formatStatusLabel(selectedJob.status) : 'No selection'}
        </StatusBadge>
      </div>
      {selectedJob ? (
        <>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl font-black tracking-tight text-foreground">DEEP_DIVE_MATCH</h2>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-positive">QUERY_EXECUTION: SUCCESSFUL</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-px border border-border/20 bg-border/20">
            <div className="bg-secondary px-4 py-4">
              <span className="mb-1 block font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">Match Type</span>
              <span className="font-display text-xs font-bold uppercase text-foreground">ELITE_SYNERGY</span>
            </div>
            <div className="bg-secondary px-4 py-4">
              <span className="mb-1 block font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">Estimated salary</span>
              <span className="font-display text-xs font-bold uppercase text-positive">{formatDateOnly(selectedJob.postedAt).toUpperCase()}</span>
            </div>
          </div>
          <PreferenceList label="Fit explanation" values={selectedJob.matchAssessment.reasons} />
          <PreferenceList label="Skills gap analysis" values={selectedJob.matchAssessment.gaps} />
          <PreferenceList compact label="Key skills" values={selectedJob.keySkills} />
          <div className="flex flex-wrap items-stretch gap-2.5">
            <Button variant="primary" disabled={busy} onClick={() => onQueueJob(selectedJob.id)} type="button">
              Save to queue
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => onDismissJob(selectedJob.id)} type="button">
              Dismiss application
            </Button>
          </div>
        </>
      ) : (
        <EmptyState
          title="Choose a job result"
          description="Select a saved LinkedIn result to inspect match reasons and move it toward resume tailoring."
        />
      )}
    </section>
  )
}
