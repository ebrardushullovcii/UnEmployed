import type { AssetStatus, CandidateProfile, ResumeExtractionStatus } from '@unemployed/contracts'
import { Sparkles, Upload } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { formatDateOnly, formatResumeAnalysisSummary, getAssetTone } from '@renderer/features/job-finder/lib/job-finder-utils'
import { PreferenceList } from '../preference-list'
import { StatusBadge } from '../status-badge'

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

const extractionStatusToLabel: Record<ResumeExtractionStatus, string> = {
  ready: 'Ready to review',
  failed: 'Import failed',
  needs_text: 'Needs better text',
  not_started: 'Not imported'
}

function getResumePanelCopy(input: {
  extractionStatus: ResumeExtractionStatus
  hasImportedResume: boolean
  resumeTextReadyToAnalyze: boolean
}): { headline: string; description: string } {
  const { extractionStatus, hasImportedResume, resumeTextReadyToAnalyze } = input

  if (resumeTextReadyToAnalyze) {
    return {
      headline: 'Your saved resume can refresh this profile any time',
      description: 'Use the saved resume text to refresh profile suggestions after each update, then review the details in the tabs below.'
    }
  }

  if (hasImportedResume) {
    return extractionStatus === 'failed'
      ? {
          headline: 'This resume needs another import before it can help your profile',
          description: 'The last import did not produce usable text. Replace the file, then refresh your profile suggestions once the text is ready.'
        }
      : {
          headline: 'This resume needs cleaner text before it can help your profile',
          description: 'This file was imported, but Job Finder still needs cleaner text before it can refresh your profile suggestions.'
        }
  }

  return {
    headline: 'Import your resume to fill in your profile faster',
    description: 'Job Finder uses the saved text from your resume to suggest profile details you can review and tighten.'
  }
}

export function ProfileResumePanel({
  busy,
  onAnalyzeProfileFromResume,
  onImportResume,
  profile
}: ProfileResumePanelProps) {
  const resumeAnalysisSummary = formatResumeAnalysisSummary(profile)
  const resumeTextReadyToAnalyze = Boolean(profile.baseResume.textContent?.trim())
  const rawFileName = profile.baseResume.fileName.trim()
  const hasImportedResume = rawFileName.length > 0
  const resumeFileName = hasImportedResume ? rawFileName : 'No resume imported yet'
  const { headline: panelHeadline, description: panelDescription } = getResumePanelCopy({
    extractionStatus: profile.baseResume.extractionStatus,
    hasImportedResume,
    resumeTextReadyToAnalyze
  })
  const uploadedLabel = profile.baseResume.uploadedAt
    ? `Imported ${formatDateOnly(profile.baseResume.uploadedAt)}`
    : 'Import your resume to fill in this profile faster.'
  const extractionStatusLabel = (() => {
    const label = extractionStatusToLabel[profile.baseResume.extractionStatus]

    if (label) {
      return label
    }

    console.warn(`Unexpected resume extraction status: ${profile.baseResume.extractionStatus}`)
    return 'Not imported'
  })()
  const displayName = profile.preferredDisplayName?.trim() || profile.fullName.trim() || 'Name not set yet'
  const headline = profile.headline.trim() || 'Headline not set yet'
  const location = profile.currentLocation.trim() || 'Location not set yet'
  const experienceLabel = profile.yearsExperience === 1 ? '1 year' : `${profile.yearsExperience} years`

  return (
    <section className="relative overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border) bg-[linear-gradient(135deg,var(--surface-panel-border-warm),var(--surface-overlay-subtle)_38%,var(--surface-overlay-soft))] p-5 sm:p-6">
      <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,var(--surface-panel-border-warm-strong),transparent)]" />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)]">
        <div className="grid gap-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="grid gap-2">
              <p className="text-(length:--text-eyebrow) font-medium uppercase tracking-(--tracking-mono) text-foreground-muted">Resume</p>
              <div className="grid gap-2">
                <h2 className="text-[1.35rem] font-semibold tracking-[-0.03em] text-(--text-headline)">{panelHeadline}</h2>
                <p className="max-w-[62ch] text-(length:--text-description) leading-6 text-foreground-muted">
                  {panelDescription}
                </p>
              </div>
            </div>

            <StatusBadge tone={getAssetTone(extractionStatusToAssetStatus[profile.baseResume.extractionStatus])}>
              {extractionStatusLabel}
            </StatusBadge>
          </div>

          <article className="grid gap-4 rounded-(--radius-panel) border border-(--surface-panel-border-warm) bg-(--surface-overlay-heavy) p-4">
            <div className="grid gap-1.5">
              <strong className="text-[1.22rem] font-semibold text-(--text-headline)">{resumeFileName}</strong>
              <span className="text-(length:--text-body) text-foreground-soft">{uploadedLabel}</span>
              {resumeAnalysisSummary ? (
                <span className="text-(length:--text-description) leading-6 text-foreground-muted">
                  {resumeAnalysisSummary}
                </span>
              ) : (
                <span className="text-(length:--text-description) leading-6 text-foreground-muted">
                  Refresh your profile suggestions any time you want to pull in changes from the saved resume text.
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
                Refresh from resume
              </Button>
            </div>
          </article>

          {profile.baseResume.analysisWarnings.length > 0 ? (
            <article className="grid gap-3 rounded-(--radius-panel) border border-(--surface-panel-border-warm) bg-(--surface-overlay-strong) p-4">
              <p className="text-(length:--text-eyebrow) font-medium uppercase tracking-(--tracking-mono) text-foreground-muted">Review before saving</p>
              <PreferenceList label="Check these details before saving" values={profile.baseResume.analysisWarnings} />
            </article>
          ) : null}
        </div>

        <aside className="grid gap-3 self-start rounded-(--radius-panel) border border-(--surface-panel-border) bg-(--surface-overlay-strong) p-4">
          <div className="grid gap-1">
            <p className="text-(length:--text-eyebrow) font-medium uppercase tracking-(--tracking-mono) text-foreground-muted">Imported details</p>
            <p className="text-(length:--text-description) leading-6 text-foreground-muted">
              These details came from your resume. Use the tabs to confirm them and fix anything that needs a closer look.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <div className="rounded-(--radius-field) border border-(--field-border) bg-(--field) p-4">
              <span className="text-(length:--text-eyebrow) font-medium uppercase tracking-(--tracking-mono) text-foreground-muted">Name</span>
              <strong className="mt-2 block text-[1rem] text-(--text-headline)">{displayName}</strong>
            </div>
            <div className="rounded-(--radius-field) border border-(--field-border) bg-(--field) p-4">
              <span className="text-(length:--text-eyebrow) font-medium uppercase tracking-(--tracking-mono) text-foreground-muted">Headline</span>
              <strong className="mt-2 block text-[1rem] text-(--text-headline)">{headline}</strong>
            </div>
            <div className="rounded-(--radius-field) border border-(--field-border) bg-(--field) p-4">
              <span className="text-(length:--text-eyebrow) font-medium uppercase tracking-(--tracking-mono) text-foreground-muted">Location</span>
              <strong className="mt-2 block text-[1rem] text-(--text-headline)">{location}</strong>
            </div>
            <div className="rounded-(--radius-field) border border-(--field-border) bg-(--field) p-4">
              <span className="text-(length:--text-eyebrow) font-medium uppercase tracking-(--tracking-mono) text-foreground-muted">Experience</span>
              <strong className="mt-2 block text-[1rem] text-(--text-headline)">{experienceLabel}</strong>
            </div>
          </div>
        </aside>
      </div>
    </section>
  )
}
