import type {
  AssetStatus,
  CandidateProfile,
  ResumeExtractionStatus,
  ResumeImportFieldCandidateSummary,
  ResumeImportRun
} from '@unemployed/contracts'
import { Sparkles, Upload } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { formatDateOnly, formatResumeAnalysisSummary, formatStatusLabel, getAssetTone } from '@renderer/features/job-finder/lib/job-finder-utils'
import { getVisibleYearsExperience } from '@renderer/features/job-finder/lib/profile-resume-panel-utils'
import { PreferenceList } from '../preference-list'
import { StatusBadge } from '../status-badge'

const PROFILE_PLACEHOLDER_HEADLINE = 'Import your resume to begin'
const PROFILE_PLACEHOLDER_SUMMARY =
  'Import a resume or paste resume text to build your profile, targeting, and tailored documents.'

function isPlaceholderValue(value: string | null | undefined, placeholder: string) {
  return value?.trim().toLowerCase() === placeholder.toLowerCase()
}

function getImportedIdentityStatus(input: {
  headline: string
  latestResumeImportReviewCandidates: readonly ResumeImportFieldCandidateSummary[]
  summary: string
}) {
  const reviewKeys = new Set(
    input.latestResumeImportReviewCandidates
      .filter((candidate) => candidate.target.section === 'identity')
      .map((candidate) => candidate.target.key),
  )

  const headlinePending =
    isPlaceholderValue(input.headline, PROFILE_PLACEHOLDER_HEADLINE) ||
    reviewKeys.has('headline')
  const summaryPending =
    isPlaceholderValue(input.summary, PROFILE_PLACEHOLDER_SUMMARY) ||
    reviewKeys.has('summary')

  if (headlinePending && summaryPending) {
    return {
      headline: 'Imported identity still needs review',
      headlinePending,
      description:
        'Headline and summary still need a quick confirmation before this imported profile reads as complete.',
    }
  }

  if (headlinePending) {
    return {
      headline: 'Imported headline still needs review',
      headlinePending,
      description:
        'Confirm or edit the imported headline so your profile and tailored resumes describe your target clearly.',
    }
  }

  if (summaryPending) {
    return {
      headline: 'Imported summary still needs review',
      headlinePending,
      description:
        'Confirm or tighten the imported summary so this profile is ready to reuse across discovery and resumes.',
    }
  }

  return null
}

interface ProfileResumePanelProps {
  importDisabledReason?: string | null
  isAnalyzeProfilePending: boolean
  isImportResumePending: boolean
  latestResumeImportReviewCandidates: readonly ResumeImportFieldCandidateSummary[]
  latestResumeImportRun: ResumeImportRun | null
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

function shouldHideAnalysisWarning(value: string): boolean {
  const normalized = value.trim().toLowerCase()

  return (
    normalized.includes('pdfplumber is unavailable') ||
    normalized.includes('pypdf is unavailable') ||
    normalized.includes('python resume parser sidecar returned no usable parse') ||
    normalized.includes('python resume parser sidecar fallback:') ||
    normalized.includes('fell back to the deterministic staged resume importer after the model call failed') ||
    normalized.includes('primary ai import stage failed:') ||
    normalized.includes('fell back to the deterministic resume parser after the model call failed') ||
    normalized.includes('primary ai extraction failed:')
  )
}

function getFallbackResumeImportWarning(warnings: readonly string[]): string | null {
  const normalizedWarnings = warnings.map((warning) => warning.trim().toLowerCase())
  const usedFallback = normalizedWarnings.some((warning) =>
    warning.includes('python resume parser sidecar fallback:')
    || warning.includes('python resume parser sidecar returned no usable parse')
    || warning.includes('fell back to the deterministic staged resume importer after the model call failed')
    || warning.includes('fell back to the deterministic resume parser after the model call failed')
    || warning.includes('primary ai import stage failed:')
    || warning.includes('primary ai extraction failed:'),
  )

  if (!usedFallback) {
    return null
  }

  return 'This import used a fallback parsing path, so review the imported details more closely before saving them.'
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
  importDisabledReason,
  isAnalyzeProfilePending,
  isImportResumePending,
  latestResumeImportReviewCandidates,
  latestResumeImportRun,
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
    if (latestResumeImportRun) {
      return formatStatusLabel(latestResumeImportRun.status)
    }

    const label = extractionStatusToLabel[profile.baseResume.extractionStatus]

    if (label) {
      return label
    }

    console.warn(`Unexpected resume extraction status: ${profile.baseResume.extractionStatus}`)
    return 'Not imported'
  })()
  const displayName = profile.preferredDisplayName?.trim() || profile.fullName.trim() || 'Name not set yet'
  const importedIdentityStatus = getImportedIdentityStatus({
    headline: profile.headline,
    latestResumeImportReviewCandidates,
    summary: profile.summary,
  })
  const headline =
    importedIdentityStatus?.headline &&
    importedIdentityStatus?.headlinePending &&
    isPlaceholderValue(profile.headline, PROFILE_PLACEHOLDER_HEADLINE)
      ? importedIdentityStatus.headline
      : profile.headline.trim() || 'Headline not set yet'
  const location = profile.currentLocation.trim() || 'Location not set yet'
  const visibleYearsExperience = getVisibleYearsExperience({
    profileYearsExperience: profile.yearsExperience,
    reviewCandidates: latestResumeImportReviewCandidates,
  })
  const experienceLabel = visibleYearsExperience === 1 ? '1 year' : `${visibleYearsExperience} years`
  const latestRunSummary = latestResumeImportRun
    ? latestResumeImportRun.status === 'review_ready'
      ? `${latestResumeImportRun.candidateCounts.autoApplied} auto-applied, ${latestResumeImportRun.candidateCounts.needsReview} waiting for review.`
      : latestResumeImportRun.status === 'applied'
        ? `${latestResumeImportRun.candidateCounts.autoApplied} auto-applied, import ready to use.`
        : latestResumeImportRun.status === 'failed'
          ? 'The latest resume import failed. Replace the file or refresh the import before relying on these details.'
          : latestResumeImportRun.status === 'queued' ||
              latestResumeImportRun.status === 'parsing' ||
              latestResumeImportRun.status === 'extracting' ||
              latestResumeImportRun.status === 'reconciling'
            ? 'The latest resume import is still in progress.'
            : null
    : null
  const visibleAnalysisWarnings = profile.baseResume.analysisWarnings.filter(
    (warning) => !shouldHideAnalysisWarning(warning)
  )
  const fallbackResumeImportWarning = getFallbackResumeImportWarning(profile.baseResume.analysisWarnings)

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
              ) : latestRunSummary ? (
                <span className="text-(length:--text-description) leading-6 text-foreground-muted">
                  {latestRunSummary}
                </span>
              ) : (
                <span className="text-(length:--text-description) leading-6 text-foreground-muted">
                  Refresh your profile suggestions any time you want to pull in changes from the saved resume text.
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-2.5">
              <Button className="h-11 px-4" disabled={Boolean(importDisabledReason)} pending={isImportResumePending} onClick={onImportResume} type="button" variant="secondary">
                <Upload className="size-4" />
                {hasImportedResume ? 'Replace resume' : 'Import resume'}
              </Button>
              <Button
                className="h-11 px-4"
                disabled={isAnalyzeProfilePending || !resumeTextReadyToAnalyze || Boolean(importDisabledReason)}
                pending={isAnalyzeProfilePending}
                onClick={onAnalyzeProfileFromResume}
                type="button"
                variant="primary"
              >
                <Sparkles className="size-4" />
                Refresh from resume
              </Button>
            </div>
            {importDisabledReason ? (
              <p className="text-sm leading-6 text-foreground-soft">{importDisabledReason}</p>
            ) : null}
          </article>

          {visibleAnalysisWarnings.length > 0 || fallbackResumeImportWarning || latestResumeImportReviewCandidates.length > 0 ? (
            <article className="grid gap-3 rounded-(--radius-panel) border border-(--surface-panel-border-warm) bg-(--surface-overlay-strong) p-4">
              <p className="text-(length:--text-eyebrow) font-medium uppercase tracking-(--tracking-mono) text-foreground-muted">Review before saving</p>
              {fallbackResumeImportWarning ? (
                <PreferenceList label="Import quality note" values={[fallbackResumeImportWarning]} />
              ) : null}
              {visibleAnalysisWarnings.length > 0 ? (
                <PreferenceList label="Check these details before saving" values={visibleAnalysisWarnings} />
              ) : null}
              {importedIdentityStatus ? (
                <PreferenceList
                  label="What to confirm next"
                  values={[importedIdentityStatus.description]}
                />
              ) : null}
              {latestResumeImportReviewCandidates.length > 0 ? (
                <PreferenceList
                  label="Imported suggestions waiting for confirmation"
                  values={latestResumeImportReviewCandidates.map((candidate) => candidate.label)}
                />
              ) : null}
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
