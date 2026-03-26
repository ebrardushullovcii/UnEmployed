import type { AssetStatus, CandidateProfile, ResumeExtractionStatus } from '@unemployed/contracts'
import { Sparkles, Upload } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { PreferenceList } from '../preference-list'
import { StatusBadge } from '../status-badge'
import { formatDateOnly, formatResumeAnalysisSummary, formatStatusLabel, getAssetTone } from '../../lib/job-finder-utils'

interface ProfileResumePanelProps {
  busy: boolean
  onAnalyzeProfileFromResume: () => void
  onImportResume: () => void
  profile: CandidateProfile
}

const extractionStatusToAssetStatus: Record<ResumeExtractionStatus, AssetStatus> = {
  ready: 'ready',
  failed: 'failed',
  needs_text: 'queued',
  not_started: 'not_started'
}

export function ProfileResumePanel({
  busy,
  onAnalyzeProfileFromResume,
  onImportResume,
  profile
}: ProfileResumePanelProps) {
  const resumeAnalysisSummary = formatResumeAnalysisSummary(profile)
  const resumeTextReadyToAnalyze = Boolean(profile.baseResume.textContent?.trim())
  const resumeFileName = profile.baseResume.fileName.trim() || 'No resume imported yet'
  const hasImportedResume = resumeFileName !== 'No resume imported yet'
  const uploadedLabel = profile.baseResume.uploadedAt
    ? `Imported ${formatDateOnly(profile.baseResume.uploadedAt)}`
    : 'Import a resume to prefill the profile below.'
  const displayName = profile.preferredDisplayName?.trim() || profile.fullName.trim() || 'Profile name not set'
  const headline = profile.headline.trim() || 'Headline not set yet'
  const location = profile.currentLocation.trim() || 'Location not set yet'
  const experienceLabel = profile.yearsExperience === 1 ? '1 year' : `${profile.yearsExperience} years`

  return (
    <section className="relative overflow-hidden rounded-[var(--radius-field)] border border-[var(--surface-panel-border)] bg-[linear-gradient(135deg,var(--surface-panel-border-warm),var(--surface-overlay-subtle)_38%,var(--surface-overlay-soft))] p-5 sm:p-6">
      <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,var(--surface-panel-border-warm-strong),transparent)]" />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)]">
        <div className="grid gap-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="grid gap-2">
              <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-foreground-muted">Resume Source</p>
              <div className="grid gap-2">
                <h2 className="text-[1.35rem] font-semibold tracking-[-0.03em] text-[var(--text-headline)]">Import once, then refine the sections below</h2>
                <p className="max-w-[62ch] text-[var(--text-description)] leading-6 text-foreground-muted">
                  We extract text from your saved resume, prefill the profile fields, and keep review notes here so the rest of the page can stay focused on editing.
                </p>
              </div>
            </div>

            <StatusBadge tone={getAssetTone(extractionStatusToAssetStatus[profile.baseResume.extractionStatus])}>
              {formatStatusLabel(profile.baseResume.extractionStatus)}
            </StatusBadge>
          </div>

          <article className="grid gap-4 rounded-[var(--radius-panel)] border border-[var(--surface-panel-border-warm)] bg-[var(--surface-overlay-heavy)] p-4">
            <div className="grid gap-1.5">
              <strong className="text-[1.22rem] font-semibold text-[var(--text-headline)]">{resumeFileName}</strong>
              <span className="text-[var(--text-body)] text-foreground-soft">{uploadedLabel}</span>
              {resumeAnalysisSummary ? (
                <span className="text-[var(--text-description)] leading-6 text-foreground-muted">
                  {resumeAnalysisSummary}
                </span>
              ) : (
                <span className="text-[var(--text-description)] leading-6 text-foreground-muted">
                  After import, run analysis any time you want to refresh the structured profile fields from the stored resume text.
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-2.5">
              <Button className="h-11 px-4" disabled={busy} onClick={onImportResume} type="button" variant="secondary">
                <Upload className="size-4" />
                {hasImportedResume ? 'Replace resume' : 'Import resume'}
              </Button>
              <Button
                className="h-11 px-4"
                disabled={busy || !resumeTextReadyToAnalyze}
                onClick={onAnalyzeProfileFromResume}
                type="button"
                variant="primary"
              >
                <Sparkles className="size-4" />
                Analyze saved text
              </Button>
            </div>
          </article>

          {profile.baseResume.analysisWarnings.length > 0 ? (
            <article className="grid gap-3 rounded-[var(--radius-panel)] border border-[var(--surface-panel-border-warm)] bg-[var(--surface-overlay-strong)] p-4">
              <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-foreground-muted">Review Notes</p>
              <PreferenceList label="Check these items before saving" values={profile.baseResume.analysisWarnings} />
            </article>
          ) : null}
        </div>

        <aside className="grid gap-3 self-start rounded-[var(--radius-panel)] border border-[var(--surface-panel-border)] bg-[var(--surface-overlay-strong)] p-4">
          <div className="grid gap-1">
            <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-foreground-muted">Prefilled Snapshot</p>
            <p className="text-[var(--text-description)] leading-6 text-foreground-muted">
              Resume analysis fills these sections first. Use the tabs to review and tighten the details.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <div className="rounded-[var(--radius-field)] border border-[var(--field-border)] bg-[var(--field)] p-4">
              <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-foreground-muted">Name</span>
              <strong className="mt-2 block text-[1rem] text-[var(--text-headline)]">{displayName}</strong>
            </div>
            <div className="rounded-[var(--radius-field)] border border-[var(--field-border)] bg-[var(--field)] p-4">
              <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-foreground-muted">Headline</span>
              <strong className="mt-2 block text-[1rem] text-[var(--text-headline)]">{headline}</strong>
            </div>
            <div className="rounded-[var(--radius-field)] border border-[var(--field-border)] bg-[var(--field)] p-4">
              <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-foreground-muted">Location</span>
              <strong className="mt-2 block text-[1rem] text-[var(--text-headline)]">{location}</strong>
            </div>
            <div className="rounded-[var(--radius-field)] border border-[var(--field-border)] bg-[var(--field)] p-4">
              <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-foreground-muted">Experience</span>
              <strong className="mt-2 block text-[1rem] text-[var(--text-headline)]">{experienceLabel}</strong>
            </div>
          </div>
        </aside>
      </div>
    </section>
  )
}
