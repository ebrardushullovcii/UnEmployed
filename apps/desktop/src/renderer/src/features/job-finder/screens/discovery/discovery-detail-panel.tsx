import type { JobDiscoveryTarget, SavedJob } from '@unemployed/contracts'
import { Button } from '@renderer/components/ui/button'
import { EmptyState } from '../../components/empty-state'
import { PreferenceList } from '../../components/preference-list'
import { StatusBadge } from '../../components/status-badge'
import { formatDateOnly, formatStatusLabel, getApplicationTone } from '../../lib/job-finder-utils'

interface DiscoveryDetailPanelProps {
  busy: boolean
  discoveryTargets: readonly JobDiscoveryTarget[]
  onDismissJob: (jobId: string) => void
  onQueueJob: (jobId: string) => void
  selectedJob: SavedJob | null
}

export function DiscoveryDetailPanel({
  busy,
  discoveryTargets,
  onDismissJob,
  onQueueJob,
  selectedJob
}: DiscoveryDetailPanelProps) {
  const discoveryTargetLabels = new Map(discoveryTargets.map((target) => [target.id, target.label]))

  return (
    <section className="flex min-h-124 min-w-0 flex-col gap-6 overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel) p-6 xl:h-full xl:min-h-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted">Selected job</p>
        <StatusBadge tone={selectedJob ? getApplicationTone(selectedJob.status) : 'muted'}>
          {selectedJob ? formatStatusLabel(selectedJob.status) : 'No selection'}
        </StatusBadge>
      </div>

      {selectedJob ? (
        <div className="grid min-h-0 flex-1 content-start gap-6 overflow-y-auto pr-1">
          <div className="grid gap-2">
            <h2 className="text-[1.65rem] font-semibold tracking-[-0.03em] text-(--text-headline)">{selectedJob.title}</h2>
            <p className="text-[0.9rem] text-foreground-muted">
              {selectedJob.company} - {selectedJob.location}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel-raised) p-4">
              <span className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted">Fit score</span>
              <strong className="mt-2 block text-[1.1rem] text-(--text-headline)">{selectedJob.matchAssessment.score}</strong>
            </div>
            <div className="rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel-raised) p-4">
              <span className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted">Posted</span>
              <strong className="mt-2 block text-[1.1rem] text-(--text-headline)">{formatDateOnly(selectedJob.postedAt)}</strong>
            </div>
          </div>

          <p className="text-(length:--text-body) leading-7 text-foreground-soft">{selectedJob.summary}</p>

          <PreferenceList compact label="Discovery mode" values={[formatStatusLabel(selectedJob.discoveryMethod)]} />
          <PreferenceList compact label="Provenance" values={selectedJob.provenance.map((entry) => discoveryTargetLabels.get(entry.targetId) ?? 'Configured target')} />
          <PreferenceList compact label="Key skills" values={selectedJob.keySkills} />
          <PreferenceList label="Fit reasons" values={selectedJob.matchAssessment.reasons} />
          <PreferenceList label="Watch-outs" values={selectedJob.matchAssessment.gaps} />

          <div className="grid gap-2.5 sm:grid-cols-2">
            <Button className="h-11 w-full" disabled={busy} onClick={() => onQueueJob(selectedJob.id)} type="button" variant="primary">
              Shortlist
            </Button>
            <Button className="h-11 w-full" disabled={busy} onClick={() => onDismissJob(selectedJob.id)} type="button" variant="secondary">
              Dismiss
            </Button>
          </div>
        </div>
      ) : (
        <EmptyState
          className="min-h-80"
          description="Select a saved discovery result to inspect fit reasons, provenance, and the next action toward resume tailoring."
          title="Choose a job result"
        />
      )}
    </section>
  )
}
