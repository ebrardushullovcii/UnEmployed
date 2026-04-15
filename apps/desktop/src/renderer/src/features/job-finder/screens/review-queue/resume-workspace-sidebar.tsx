import type { JobFinderResumeWorkspace, ResumeDraft } from '@unemployed/contracts'
import { StatusBadge } from '../../components/status-badge'
import { formatDraftStatusLabel, formatOptionalDate, toDraftStatusTone } from './resume-workspace-utils'

interface ResumeWorkspaceSidebarProps {
  draft: ResumeDraft
  hasUnsavedChanges: boolean
  workspace: JobFinderResumeWorkspace
}

function formatNormalizedCompensation(workspace: JobFinderResumeWorkspace): string | null {
  const compensation = workspace.job.normalizedCompensation
  const currencyPrefix = compensation.currency ? `${compensation.currency} ` : ''
  const interval = compensation.interval ? ` / ${compensation.interval}` : ''
  const minAmount = compensation.minAmount !== null ? `${currencyPrefix}${compensation.minAmount.toLocaleString()}` : null
  const maxAmount = compensation.maxAmount !== null ? `${currencyPrefix}${compensation.maxAmount.toLocaleString()}` : null
  const directRange = [minAmount, maxAmount].filter(Boolean).join(' – ')

  if (directRange) {
    return `${directRange}${interval}`
  }

  const annualizedRange = [compensation.minAnnualUsd, compensation.maxAnnualUsd]
    .filter((value): value is number => value !== null)
    .map((value) => `USD ${value.toLocaleString()}`)
    .join(' – ')

  return annualizedRange ? `${annualizedRange} annualized` : null
}

export function ResumeWorkspaceSidebar({ draft, hasUnsavedChanges, workspace }: ResumeWorkspaceSidebarProps) {
  const { job, research, sharedProfile, validation } = workspace
  const researchCount = research.length
  const validationCount = validation?.issues.length ?? 0
  const normalizedCompensation = formatNormalizedCompensation(workspace)

  return (
    <aside className="surface-panel-shell relative flex min-h-0 min-w-0 flex-col gap-4 overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border) p-5 xl:h-full">
      <div className="flex items-center justify-between gap-3">
        <p className="font-display text-[11px] font-bold uppercase tracking-(--tracking-caps) text-primary">
          Job context
        </p>
        <StatusBadge tone={toDraftStatusTone(draft.status)}>
          {formatDraftStatusLabel(draft.status)}
        </StatusBadge>
      </div>
      <div className="grid gap-2 text-sm text-foreground-soft">
        <p>{researchCount === 1 ? 'Saved source' : 'Saved sources'}: {researchCount}</p>
        <p>{validationCount === 1 ? 'Validation check' : 'Validation checks'}: {validationCount}</p>
        {hasUnsavedChanges ? (
          <p className="text-(--warning-text)">
            Unsaved edits stay local until you save or run another action.
          </p>
        ) : null}
      </div>

      <div className="grid min-h-0 flex-1 content-start gap-4 overflow-x-hidden overflow-y-auto pr-1">
        <div className="surface-card-tint grid min-w-0 gap-2 rounded-(--radius-field) border border-(--surface-panel-border) p-4">
          <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-caps) text-muted-foreground">
            Job details
          </p>
          <div className="grid gap-2 text-sm text-foreground-soft">
            <p>
              <strong className="text-foreground">Posted:</strong>{' '}
              {formatOptionalDate(job.postedAt, job.postedAtText)}
            </p>
            <p>
              <strong className="text-foreground">Work mode:</strong>{' '}
              {job.workMode.join(', ') || 'Not specified'}
            </p>
            {job.seniority ? (
              <p>
                <strong className="text-foreground">Seniority:</strong>{' '}
                {job.seniority}
              </p>
            ) : null}
            {job.employmentType ? (
              <p>
                <strong className="text-foreground">Employment:</strong>{' '}
                {job.employmentType}
              </p>
            ) : null}
            {job.department ? (
              <p>
                <strong className="text-foreground">Department:</strong>{' '}
                {job.department}
              </p>
            ) : null}
            {job.team ? (
              <p>
                <strong className="text-foreground">Team:</strong> {job.team}
              </p>
            ) : null}
            {job.salaryText ? (
              <p>
                <strong className="text-foreground">Compensation:</strong>{' '}
                {job.salaryText}
              </p>
            ) : null}
            {normalizedCompensation ? (
              <p>
                <strong className="text-foreground">Normalized comp:</strong>{' '}
                {normalizedCompensation}
              </p>
            ) : null}
            {job.applicationUrl ? (
              <p className="break-words">
                <strong className="text-foreground">Apply URL:</strong>{' '}
                {job.applicationUrl}
              </p>
            ) : null}
            {job.atsProvider ? (
              <p>
                <strong className="text-foreground">ATS or provider:</strong>{' '}
                {job.atsProvider}
              </p>
            ) : null}
            {job.employerWebsiteUrl ? (
              <p className="break-words">
                <strong className="text-foreground">Employer site:</strong>{' '}
                {job.employerWebsiteUrl}
              </p>
            ) : null}
          </div>
          {job.responsibilities.length ? (
            <div className="grid gap-1 text-sm text-foreground-soft">
              <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-caps) text-muted-foreground">
                Key responsibilities
              </p>
              {job.responsibilities.slice(0, 4).map((item, index) => (
                <p key={`${job.id}_responsibility_${index}`}>• {item}</p>
              ))}
            </div>
          ) : null}
          {job.minimumQualifications.length ? (
            <div className="grid gap-1 text-sm text-foreground-soft">
              <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-caps) text-muted-foreground">
                Requirements
              </p>
              {job.minimumQualifications.slice(0, 4).map((item, index) => (
                <p key={`${job.id}_minimum_qualification_${index}`}>• {item}</p>
              ))}
            </div>
          ) : null}
          {job.preferredQualifications.length ? (
            <div className="grid gap-1 text-sm text-foreground-soft">
              <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-caps) text-muted-foreground">
                Preferred qualifications
              </p>
              {job.preferredQualifications.slice(0, 3).map((item, index) => (
                <p key={`${job.id}_preferred_qualification_${index}`}>• {item}</p>
              ))}
            </div>
          ) : null}
          {job.keywordSignals.length ? (
            <div className="grid gap-1 text-sm text-foreground-soft">
              <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-caps) text-muted-foreground">
                Targeting cues
              </p>
              {job.keywordSignals.slice(0, 6).map((signal) => (
                <p key={signal.id}>• {signal.label}</p>
              ))}
            </div>
          ) : null}
          {job.screeningHints.sponsorshipText || job.screeningHints.relocationText || job.screeningHints.travelText || job.screeningHints.remoteGeographies.length ? (
            <div className="grid gap-1 text-sm text-foreground-soft">
              <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-caps) text-muted-foreground">
                Screening hints
              </p>
              {job.screeningHints.sponsorshipText ? <p>• {job.screeningHints.sponsorshipText}</p> : null}
              {job.screeningHints.relocationText ? <p>• {job.screeningHints.relocationText}</p> : null}
              {job.screeningHints.travelText ? <p>• {job.screeningHints.travelText}</p> : null}
              {job.screeningHints.remoteGeographies.map((value) => <p key={value}>• Remote geography: {value}</p>)}
            </div>
          ) : null}
        </div>

        <div className="surface-card-tint grid min-w-0 gap-2 rounded-(--radius-field) border border-(--surface-panel-border) p-4">
          <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-caps) text-muted-foreground">
            Shared profile inputs
          </p>
          {sharedProfile.narrativeSummary ? (
            <p className="text-sm leading-6 text-foreground-soft">{sharedProfile.narrativeSummary}</p>
          ) : null}
          {sharedProfile.nextChapterSummary ? (
            <p className="text-sm leading-6 text-foreground-soft">Next chapter: {sharedProfile.nextChapterSummary}</p>
          ) : null}
          {sharedProfile.selfIntroduction ? (
            <p className="text-sm leading-6 text-foreground-soft">Intro: {sharedProfile.selfIntroduction}</p>
          ) : null}
          {sharedProfile.highlightedProofs.length ? (
            <div className="grid gap-2 text-sm text-foreground-soft">
              {sharedProfile.highlightedProofs.map((proof) => (
                <div key={proof.id} className="grid gap-1">
                  <strong className="text-foreground">{proof.title}</strong>
                  <p>{proof.claim}</p>
                  {proof.heroMetric ? <p>Metric: {proof.heroMetric}</p> : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-foreground-soft">No reusable proof has been saved yet.</p>
          )}
        </div>

        <div className="surface-card-tint grid min-w-0 gap-2 rounded-(--radius-field) border border-(--surface-panel-border) p-4">
          <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-caps) text-muted-foreground">
            Saved research
          </p>
          {research.length ? (
            research.map((artifact) => (
              <div
                key={artifact.id}
                className="grid min-w-0 gap-1 text-sm text-foreground-soft"
              >
                <strong className="text-foreground">
                  {artifact.pageTitle ?? artifact.sourceUrl}
                </strong>
                <span className="break-all">{artifact.sourceUrl}</span>
              </div>
            ))
          ) : (
            <p className="text-sm text-foreground-soft">
              No research saved yet.
            </p>
          )}
        </div>
      </div>
    </aside>
  )
}
