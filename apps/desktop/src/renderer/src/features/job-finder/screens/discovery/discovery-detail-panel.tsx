import type { JobDiscoveryTarget, SavedJob } from '@unemployed/contracts'
import { Button } from '@renderer/components/ui/button'
import { EmptyState } from '../../components/empty-state'
import { PreferenceList } from '../../components/preference-list'
import { StatusBadge } from '../../components/status-badge'
import { jobDescriptionToText } from '../../lib/job-description-text'
import { buildIntelligenceSummaries } from '../../lib/source-intelligence-utils'
import { formatOptionalDateOnly, formatStatusLabel, getApplicationTone } from '../../lib/job-finder-utils'
import { formatNormalizedCompensation } from '../../lib/normalized-compensation'

interface DiscoveryDetailPanelProps {
  discoveryTargets: readonly JobDiscoveryTarget[]
  isJobPending: (jobId: string) => boolean
  onDismissJob: (jobId: string) => void
  onQueueJob: (jobId: string) => void
  selectedJob: SavedJob | null
}

export function DiscoveryDetailPanel({
  discoveryTargets,
  isJobPending,
  onDismissJob,
  onQueueJob,
  selectedJob
}: DiscoveryDetailPanelProps) {
  const discoveryTargetLabels = new Map(discoveryTargets.map((target) => [target.id, target.label]))
  const normalizedCompensation = formatNormalizedCompensation(selectedJob?.normalizedCompensation)
  const intelligenceSummaries = buildIntelligenceSummaries(
    selectedJob?.sourceIntelligence ?? null,
  )
  const isSelectedJobPending = selectedJob ? isJobPending(selectedJob.id) : false

  return (
    <section className="surface-panel-shell relative flex min-h-124 min-w-0 flex-col overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border) xl:h-full xl:min-h-0">
      <div className="flex flex-wrap items-start justify-between gap-3 px-6 pb-2 pt-6">
        <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted">Job details</p>
        {selectedJob ? (
          <StatusBadge tone={getApplicationTone(selectedJob.status)}>
            {formatStatusLabel(selectedJob.status)}
          </StatusBadge>
        ) : null}
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
                <span className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted">Fit</span>
                <strong className="mt-2 block text-(length:--text-section-title) text-(--text-headline)">{selectedJob.matchAssessment.score}%</strong>
              </div>
              <div className="surface-card-tint rounded-(--radius-field) border border-(--surface-panel-border) p-4">
                <span className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted">Posted</span>
                <strong className="mt-2 block text-(length:--text-section-title) text-(--text-headline)">{formatOptionalDateOnly(selectedJob.postedAt, selectedJob.postedAtText)}</strong>
              </div>
              <div className="surface-card-tint rounded-(--radius-field) border border-(--surface-panel-border) p-4">
                <span className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted">Work mode</span>
                <strong className="mt-2 block text-(length:--text-body) text-(--text-headline)">{selectedJob.workMode.length > 0 ? selectedJob.workMode.join(', ') : 'Not specified'}</strong>
              </div>
              <div className="surface-card-tint rounded-(--radius-field) border border-(--surface-panel-border) p-4">
                <span className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted">Apply</span>
                <strong className="mt-2 block text-(length:--text-body) text-(--text-headline)">{selectedJob.applyPath === 'easy_apply' ? 'Easy Apply' : selectedJob.applyPath === 'external_redirect' ? 'Apply on company site' : 'Manual application'}</strong>
              </div>
              {selectedJob.salaryText || normalizedCompensation ? (
                <div className="surface-card-tint rounded-(--radius-field) border border-(--surface-panel-border) p-4 sm:col-span-2">
                  <span className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted">Salary</span>
                  <strong className="mt-2 block text-(length:--text-body) text-(--text-headline)">
                    {selectedJob.salaryText ?? 'Provided through structured compensation metadata'}
                  </strong>
                  {normalizedCompensation ? (
                    <p className="mt-2 text-(length:--text-small) text-foreground-soft">Normalized: {normalizedCompensation}</p>
                  ) : null}
                </div>
              ) : null}
              {selectedJob.atsProvider ? (
                <div className="surface-card-tint rounded-(--radius-field) border border-(--surface-panel-border) p-4">
                  <span className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted">ATS or provider</span>
                  <strong className="mt-2 block text-(length:--text-body) text-(--text-headline)">{selectedJob.atsProvider}</strong>
                </div>
              ) : null}
              {selectedJob.applicationUrl ? (
                <div className="surface-card-tint rounded-(--radius-field) border border-(--surface-panel-border) p-4 sm:col-span-2">
                  <span className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted">Application route</span>
                  <strong className="mt-2 block break-all text-(length:--text-small) text-(--text-headline)">{selectedJob.applicationUrl}</strong>
                </div>
              ) : null}
            </div>

            <p className="text-(length:--text-body) leading-7 text-foreground-soft">
              {jobDescriptionToText(selectedJob.summary ?? selectedJob.description)}
            </p>

            <PreferenceList compact label="Found on" values={selectedJob.provenance.map((entry) => discoveryTargetLabels.get(entry.targetId) ?? 'Saved source')} />
            {intelligenceSummaries.length > 0 ? (
              <div className="grid gap-3">
                {intelligenceSummaries.map((summary, summaryIndex) => (
                  <div key={`${summary.title}_${summaryIndex}`} className="grid gap-2 rounded-(--radius-field) border border-(--surface-panel-border) p-4">
                    <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted">{summary.title}</p>
                    <dl className="grid gap-2 text-(length:--text-small) leading-6 text-foreground-soft">
                      {summary.items.map((item, itemIndex) => (
                        <div className="grid gap-0.5" key={`${summary.title}_${item.label}_${itemIndex}`}>
                          <dt className="font-medium text-foreground">{item.label}</dt>
                          <dd className="break-words">{item.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))}
              </div>
            ) : null}
            {selectedJob.keySkills.length > 0 ? <PreferenceList compact label="Skills mentioned" values={selectedJob.keySkills} /> : null}
            {selectedJob.keywordSignals.length > 0 ? <PreferenceList compact label="Targeting cues" values={selectedJob.keywordSignals.map((signal) => signal.label)} /> : null}
            {selectedJob.matchAssessment.reasons.length > 0 ? <PreferenceList label="Why it fits" values={selectedJob.matchAssessment.reasons} /> : null}
            {selectedJob.matchAssessment.gaps.length > 0 ? <PreferenceList label="Potential gaps" values={selectedJob.matchAssessment.gaps} /> : null}
            {selectedJob.screeningHints.remoteGeographies.length > 0 ? <PreferenceList compact label="Remote geography hints" values={selectedJob.screeningHints.remoteGeographies} /> : null}
            {selectedJob.screeningHints.sponsorshipText ? (
              <div className="grid gap-2">
                <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted">Screening hint</p>
                <p className="text-(length:--text-small) leading-6 text-foreground-soft">{selectedJob.screeningHints.sponsorshipText}</p>
              </div>
            ) : null}
            {selectedJob.screeningHints.relocationText ? (
              <div className="grid gap-2">
                <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted">Relocation</p>
                <p className="text-(length:--text-small) leading-6 text-foreground-soft">{selectedJob.screeningHints.relocationText}</p>
              </div>
            ) : null}
            {selectedJob.screeningHints.travelText ? (
              <div className="grid gap-2">
                <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted">Travel</p>
                <p className="text-(length:--text-small) leading-6 text-foreground-soft">{selectedJob.screeningHints.travelText}</p>
              </div>
            ) : null}
            {selectedJob.screeningHints.requiresSecurityClearance === true ? (
              <div className="grid gap-2">
                <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted">Security clearance</p>
                <p className="text-(length:--text-small) leading-6 text-foreground-soft">This listing mentions an active or required security clearance.</p>
              </div>
            ) : null}
            {(selectedJob.firstSeenAt || selectedJob.lastSeenAt || selectedJob.lastVerifiedActiveAt) ? (
              <div className="grid gap-2 md:grid-cols-3">
                <div>
                  <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted">First seen</p>
                  <p className="text-(length:--text-small) leading-6 text-foreground-soft">{formatOptionalDateOnly(selectedJob.firstSeenAt, 'Unknown')}</p>
                </div>
                <div>
                  <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted">Last seen</p>
                  <p className="text-(length:--text-small) leading-6 text-foreground-soft">{formatOptionalDateOnly(selectedJob.lastSeenAt, 'Unknown')}</p>
                </div>
                <div>
                  <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted">Last verified active</p>
                  <p className="text-(length:--text-small) leading-6 text-foreground-soft">{formatOptionalDateOnly(selectedJob.lastVerifiedActiveAt, 'Unknown')}</p>
                </div>
              </div>
            ) : null}
            {selectedJob.employerWebsiteUrl ? (
              <div className="grid gap-2">
                <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted">Company site</p>
                <p className="text-(length:--text-small) leading-6 text-foreground-soft">This job points to a company site that opens during the application flow.</p>
              </div>
            ) : null}

            <div className="grid gap-2.5 sm:grid-cols-2">
              <Button className="h-11 w-full" pending={isSelectedJobPending} onClick={() => onQueueJob(selectedJob.id)} type="button" variant="primary">
                Shortlist job
              </Button>
              <Button className="h-11 w-full" pending={isSelectedJobPending} onClick={() => onDismissJob(selectedJob.id)} type="button" variant="secondary">
                Hide result
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <EmptyState
          className="min-h-80"
          description="Choose a job to review its fit, source, and next step."
          title="Choose a job to review"
        />
      )}
    </section>
  )
}
