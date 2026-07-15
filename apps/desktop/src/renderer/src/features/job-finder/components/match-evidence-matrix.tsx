import type {
  FitRecommendation,
  JobRequirementAssessment,
  JobRequirementEvidenceStatus,
  MatchAssessment,
} from '@unemployed/contracts'
import type { BadgeTone } from '../lib/job-finder-types'
import { StatusBadge } from './status-badge'

const recommendationCopy: Record<FitRecommendation, { label: string; tone: BadgeTone }> = {
  strong_fit: { label: 'Strong fit', tone: 'positive' },
  apply_with_original: { label: 'Original CV is credible', tone: 'active' },
  review_before_applying: { label: 'Review before applying', tone: 'neutral' },
  skip: { label: 'Skip — hard conflict', tone: 'critical' },
}

const statusCopy: Record<JobRequirementEvidenceStatus, { label: string; tone: BadgeTone }> = {
  supported: { label: 'Supported', tone: 'positive' },
  partial: { label: 'Partial', tone: 'active' },
  missing: { label: 'Missing', tone: 'critical' },
  unknown: { label: 'Unknown', tone: 'neutral' },
  conflict: { label: 'Conflict', tone: 'critical' },
}

function RequirementRow({ requirement }: { requirement: JobRequirementAssessment }) {
  const status = statusCopy[requirement.status]

  return (
    <li className="grid gap-3 border-t border-(--surface-panel-border) py-4 first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="grid min-w-0 gap-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <strong className="text-(length:--text-small) text-(--text-headline)">{requirement.label}</strong>
            <span className="rounded-full border border-(--surface-panel-border) px-2 py-0.5 text-(length:--text-label-mono-xs) uppercase tracking-(--tracking-badge) text-foreground-muted">
              {requirement.importance}
            </span>
          </div>
          <p className="text-(length:--text-small) leading-6 text-foreground-soft">{requirement.explanation}</p>
        </div>
        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
      </div>

      <div className="grid gap-1.5 rounded-(--radius-small) border border-(--surface-panel-border) bg-background/25 px-3 py-2.5">
        <span className="text-(length:--text-label-mono-xs) uppercase tracking-(--tracking-badge) text-foreground-muted">Listing says</span>
        <p className="text-(length:--text-small) leading-6 text-foreground-soft">“{requirement.jobEvidence}”</p>
      </div>

      <div className="grid gap-2">
        <span className="text-(length:--text-label-mono-xs) uppercase tracking-(--tracking-badge) text-foreground-muted">Resume evidence</span>
        {requirement.resumeEvidence.length > 0 ? (
          <ul className="m-0 grid list-none gap-2 p-0">
            {requirement.resumeEvidence.slice(0, 2).map((evidence) => (
              <li className="grid gap-0.5 border-l-2 border-primary/35 pl-3" key={`${requirement.id}_${evidence.sourceKind}_${evidence.sourceId ?? evidence.label}`}>
                <strong className="text-(length:--text-small) font-medium text-foreground">{evidence.label}</strong>
                <span className="text-(length:--text-small) leading-6 text-foreground-soft">{evidence.detail}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-(length:--text-small) leading-6 text-foreground-muted">No explicit evidence was located in the imported resume.</p>
        )}
      </div>
    </li>
  )
}

export function MatchEvidenceMatrix({ assessment }: { assessment: MatchAssessment }) {
  const requirements = assessment.requirements ?? []
  const recommendation = recommendationCopy[assessment.recommendation ?? 'review_before_applying']
  const supportedCount = requirements.filter((requirement) => requirement.status === 'supported').length
  const requiredGapCount = requirements.filter(
    (requirement) => requirement.importance === 'required' && requirement.status !== 'supported',
  ).length

  return (
    <section aria-label="Requirement evidence" className="surface-card-tint grid min-w-0 gap-4 rounded-(--radius-field) border border-(--surface-panel-border) p-4">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <span className="text-(length:--text-label) uppercase tracking-(--tracking-heading) text-muted-foreground">Evidence ledger</span>
          <strong className="text-(length:--text-body) text-(--text-headline)">
            {requirements.length > 0 ? `${supportedCount} of ${requirements.length} detected requirements supported` : 'Requirement evidence unavailable'}
          </strong>
        </div>
        <StatusBadge tone={recommendation.tone}>{recommendation.label}</StatusBadge>
      </div>

      <p className="text-(length:--text-small) leading-6 text-foreground-soft">
        {assessment.recommendationRationale ?? 'Review the listing and resume evidence before applying.'}
      </p>

      {requiredGapCount > 0 ? (
        <div className="rounded-(--radius-small) border border-destructive/25 bg-destructive/5 px-3 py-2.5 text-(length:--text-small) leading-6 text-destructive">
          {requiredGapCount} required item{requiredGapCount === 1 ? '' : 's'} still {requiredGapCount === 1 ? 'needs' : 'need'} evidence or conflict with the saved profile.
        </div>
      ) : null}

      {requirements.length > 0 ? (
        <ul className="m-0 grid list-none p-0">
          {requirements.map((requirement) => <RequirementRow key={requirement.id} requirement={requirement} />)}
        </ul>
      ) : null}
    </section>
  )
}
