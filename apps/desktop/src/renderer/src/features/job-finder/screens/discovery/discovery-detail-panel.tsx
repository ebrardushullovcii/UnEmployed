import type { JobDiscoveryTarget, SavedJob } from '@unemployed/contracts'
import { Button } from '@renderer/components/ui/button'
import { EmptyState } from '../../components/empty-state'
import { PreferenceList } from '../../components/preference-list'
import { StatusBadge } from '../../components/status-badge'
import { formatOptionalDateOnly, formatStatusLabel, getApplicationTone } from '../../lib/job-finder-utils'

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
    <section className="surface-panel-shell relative flex min-h-124 min-w-0 flex-col overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border) xl:h-full xl:min-h-0">
      <div className="flex flex-wrap items-start justify-between gap-3 px-6 pb-2 pt-6">
        <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted">Selected job</p>
        <StatusBadge tone={selectedJob ? getApplicationTone(selectedJob.status) : 'muted'}>
          {selectedJob ? formatStatusLabel(selectedJob.status) : 'No selection'}
        </StatusBadge>
      </div>

      {selectedJob ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-5">
          <div className="grid min-h-full content-start gap-6">
            <div className="grid gap-3">
              <h2 className="text-(length:--text-section-title) font-semibold tracking-[-0.03em] text-(--text-headline)">{selectedJob.title}</h2>
              <p className="text-(length:--text-description) text-foreground-muted">
                {selectedJob.company} • {selectedJob.location}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="surface-card-tint rounded-(--radius-field) border border-(--surface-panel-border) p-4">
                <span className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted">Fit score</span>
                <strong className="mt-2 block text-(length:--text-section-title) text-(--text-headline)">{selectedJob.matchAssessment.score}%</strong>
              </div>
              <div className="surface-card-tint rounded-(--radius-field) border border-(--surface-panel-border) p-4">
                <span className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted">Posted</span>
                <strong className="mt-2 block text-(length:--text-section-title) text-(--text-headline)">{formatOptionalDateOnly(selectedJob.postedAt, selectedJob.postedAtText)}</strong>
              </div>
            </div>

            <p className="text-(length:--text-body) leading-7 text-foreground-soft">{selectedJob.summary ?? selectedJob.description}</p>

            <PreferenceList compact label="Found on" values={selectedJob.provenance.map((entry) => discoveryTargetLabels.get(entry.targetId) ?? 'Saved source')} />
            <PreferenceList compact label="Key skills" values={selectedJob.keySkills} />
            <PreferenceList label="Why it fits" values={selectedJob.matchAssessment.reasons} />
            <PreferenceList label="Watch outs" values={selectedJob.matchAssessment.gaps} />

            <div className="grid gap-2.5 sm:grid-cols-2">
              <Button className="h-11 w-full" disabled={busy} onClick={() => onQueueJob(selectedJob.id)} type="button" variant="primary">
                Shortlist
              </Button>
              <Button className="h-11 w-full" disabled={busy} onClick={() => onDismissJob(selectedJob.id)} type="button" variant="secondary">
                Dismiss
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <EmptyState
          className="min-h-80"
          description="Select a saved result to see why it fits, where it was found, and whether it should move to Shortlisted."
          title="Choose a job result"
        />
      )}
    </section>
  )
}
