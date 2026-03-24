import type { CandidateProfile } from '@unemployed/contracts'
import { Button } from '@renderer/components/ui/button'
import { PreferenceList } from '../preference-list'
import { StatusBadge } from '../status-badge'
import { formatDateOnly, formatResumeAnalysisSummary, formatStatusLabel, getAssetTone } from '../../lib/job-finder-utils'

interface ProfileOverviewTabProps {
  busy: boolean
  onAnalyzeProfileFromResume: () => void
  onImportResume: () => void
  profile: CandidateProfile
}

export function ProfileOverviewTab({
  busy,
  onAnalyzeProfileFromResume,
  onImportResume,
  profile
}: ProfileOverviewTabProps) {
  const resumeTextReadyToAnalyze = Boolean(profile.baseResume.textContent?.trim())
  const resumeFileName = profile.baseResume.fileName.trim() || 'Resume file unavailable'
  const uploadedLabel = profile.baseResume.uploadedAt
    ? `Uploaded ${formatDateOnly(profile.baseResume.uploadedAt)}`
    : 'Upload date unavailable'
  const displayName = profile.preferredDisplayName?.trim() || profile.fullName.trim() || 'Profile name not set'
  const headline = profile.headline.trim() || 'Headline not set'
  const location = profile.currentLocation.trim() || 'Location not set'
  const experienceLabel = profile.yearsExperience > 0 ? `${profile.yearsExperience} years` : 'Experience not set'

  return (
    <div className="grid gap-6">
      <section className="rounded-[var(--radius-field)] border border-[var(--surface-panel-border)] bg-[var(--surface-panel)] p-6 grid content-start gap-[var(--gap-card)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[var(--text-tiny)] uppercase tracking-[var(--tracking-label)] text-foreground-muted">Resume</p>
            <p className="text-[var(--text-description)] leading-6 text-foreground-muted">
              Upload once, clean up the stored text if needed, then run parsing into the structured sections below.
            </p>
          </div>
          <StatusBadge
            tone={getAssetTone(
              profile.baseResume.extractionStatus === 'ready'
                ? 'ready'
                : profile.baseResume.extractionStatus === 'failed'
                  ? 'failed'
                  : profile.baseResume.extractionStatus === 'needs_text'
                    ? 'queued'
                    : 'generating'
            )}
          >
            {formatStatusLabel(profile.baseResume.extractionStatus)}
          </StatusBadge>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.95fr)]">
          <article className="grid gap-4 rounded-[var(--radius-panel)] border border-[var(--surface-panel-border)] bg-[var(--surface-panel-raised)] p-4">
            <div className="grid gap-1.5">
              <strong className="text-[1.3rem] font-semibold text-[var(--text-headline)]">{resumeFileName}</strong>
              <span className="text-[var(--text-body)] text-foreground-soft">
                {uploadedLabel}
              </span>
              {profile.baseResume.lastAnalyzedAt ? (
                <span className="text-[var(--text-description)] leading-6 text-foreground-muted">
                  {formatResumeAnalysisSummary(profile)}
                </span>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2.5">
              <Button className="h-11 px-4" disabled={busy} onClick={onImportResume} type="button" variant="secondary">
                Replace resume
              </Button>
              <Button
                className="h-11 px-4"
                disabled={busy || !resumeTextReadyToAnalyze}
                onClick={onAnalyzeProfileFromResume}
                type="button"
                variant="primary"
              >
                Analyze saved text
              </Button>
            </div>
          </article>

          <article className="grid gap-4 rounded-[var(--radius-panel)] border border-[var(--surface-panel-border)] bg-[var(--surface-panel-raised)] p-4">
            <p className="text-[var(--text-tiny)] uppercase tracking-[var(--tracking-label)] text-foreground-muted">Current snapshot</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[var(--radius-field)] border border-[var(--field-border)] bg-[var(--field)] p-4">
                <span className="text-[var(--text-tiny)] uppercase tracking-[var(--tracking-heading)] text-foreground-muted">Name</span>
                <strong className="mt-2 block text-[1rem] text-[var(--text-headline)]">
                  {displayName}
                </strong>
              </div>
              <div className="rounded-[var(--radius-field)] border border-[var(--field-border)] bg-[var(--field)] p-4">
                <span className="text-[var(--text-tiny)] uppercase tracking-[var(--tracking-heading)] text-foreground-muted">Headline</span>
                <strong className="mt-2 block text-[1rem] text-[var(--text-headline)]">{headline}</strong>
              </div>
              <div className="rounded-[var(--radius-field)] border border-[var(--field-border)] bg-[var(--field)] p-4">
                <span className="text-[var(--text-tiny)] uppercase tracking-[var(--tracking-heading)] text-foreground-muted">Location</span>
                <strong className="mt-2 block text-[1rem] text-[var(--text-headline)]">{location}</strong>
              </div>
              <div className="rounded-[var(--radius-field)] border border-[var(--field-border)] bg-[var(--field)] p-4">
                <span className="text-[var(--text-tiny)] uppercase tracking-[var(--tracking-heading)] text-foreground-muted">Experience</span>
                <strong className="mt-2 block text-[1rem] text-[var(--text-headline)]">{experienceLabel}</strong>
              </div>
            </div>
          </article>
        </div>

        {profile.baseResume.analysisWarnings.length > 0 ? (
          <PreferenceList label="Review notes" values={profile.baseResume.analysisWarnings} />
        ) : null}
      </section>
    </div>
  )
}
