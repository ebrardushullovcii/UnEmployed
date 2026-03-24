import type { SavedJob } from '@unemployed/contracts'
import { Button } from '@renderer/components/ui/button'
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
    <section className="grid min-h-[31rem] min-w-0 content-start gap-6 rounded-[var(--radius-field)] border border-[var(--surface-panel-border)] bg-[var(--surface-panel)] p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-[var(--text-tiny)] uppercase tracking-[var(--tracking-label)] text-foreground-muted">Selected job</p>
        <StatusBadge tone={selectedJob ? getApplicationTone(selectedJob.status) : 'muted'}>
          {selectedJob ? formatStatusLabel(selectedJob.status) : 'No selection'}
        </StatusBadge>
      </div>

      {selectedJob ? (
        <>
          <div className="grid gap-2">
            <h2 className="text-[1.65rem] font-semibold tracking-[-0.03em] text-[var(--text-headline)]">{selectedJob.title}</h2>
            <p className="text-[0.9rem] text-foreground-muted">
              {selectedJob.company} - {selectedJob.location}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[var(--radius-field)] border border-[var(--surface-panel-border)] bg-[var(--surface-panel-raised)] p-4">
              <span className="text-[var(--text-tiny)] uppercase tracking-[var(--tracking-label)] text-foreground-muted">Fit score</span>
              <strong className="mt-2 block text-[1.1rem] text-[var(--text-headline)]">{selectedJob.matchAssessment.score}</strong>
            </div>
            <div className="rounded-[var(--radius-field)] border border-[var(--surface-panel-border)] bg-[var(--surface-panel-raised)] p-4">
              <span className="text-[var(--text-tiny)] uppercase tracking-[var(--tracking-label)] text-foreground-muted">Posted</span>
              <strong className="mt-2 block text-[1.1rem] text-[var(--text-headline)]">{formatDateOnly(selectedJob.postedAt)}</strong>
            </div>
          </div>

          <p className="text-[var(--text-body)] leading-7 text-foreground-soft">{selectedJob.summary}</p>

          <PreferenceList compact label="Discovery mode" values={[formatStatusLabel(selectedJob.discoveryMethod)]} />
          <PreferenceList compact label="Key skills" values={selectedJob.keySkills} />
          <PreferenceList label="Fit reasons" values={selectedJob.matchAssessment.reasons} />
          <PreferenceList label="Watch-outs" values={selectedJob.matchAssessment.gaps} />

          <div className="grid gap-2.5 sm:grid-cols-2">
            <Button className="h-11 w-full" disabled={busy} onClick={() => onQueueJob(selectedJob.id)} type="button" variant="primary">
              Save to review queue
            </Button>
            <Button className="h-11 w-full" disabled={busy} onClick={() => onDismissJob(selectedJob.id)} type="button" variant="secondary">
              Dismiss
            </Button>
          </div>
        </>
      ) : (
        <EmptyState
          className="min-h-[20rem]"
          description="Select a saved LinkedIn result to inspect match reasons and move it toward resume tailoring."
          title="Choose a job result"
        />
      )}
    </section>
  )
}
