import { ArrowLeft, RefreshCcw } from 'lucide-react'
import type { ResumeDraft } from '@unemployed/contracts'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { StatusBadge } from '../../components/status-badge'
import { formatDraftStatusLabel, formatTimestamp, toDraftStatusTone } from './resume-workspace-utils'

interface ResumeWorkspaceHeaderProps {
  draft: ResumeDraft
  hasUnsavedChanges: boolean
  jobCompany: string
  jobLocation: string
  jobTitle: string
  selectedThemeLabel: string
  researchCount: number
  validationIssueCount: number
  onBack: () => void
  onRefresh: () => void
}

export function ResumeWorkspaceHeader({
  draft,
  hasUnsavedChanges,
  jobCompany,
  jobLocation,
  jobTitle,
  selectedThemeLabel,
  researchCount,
  validationIssueCount,
  onBack,
  onRefresh
}: ResumeWorkspaceHeaderProps) {
  const companyLocationDisplay = [jobCompany, jobLocation].filter(Boolean).join(' • ')

  return (
    <section className="surface-panel-shell relative grid gap-4 rounded-(--radius-field) border border-(--surface-panel-border) p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <Button onClick={onBack} type="button" variant="ghost">
            <ArrowLeft className="size-4" />
            Back to Shortlisted
          </Button>
          <Button onClick={onRefresh} type="button" variant="secondary">
            <RefreshCcw className="size-4" />
            Reload workspace
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={toDraftStatusTone(draft.status)}>
            {formatDraftStatusLabel(draft.status)}
          </StatusBadge>
          <Badge variant="section">{validationIssueCount} {validationIssueCount === 1 ? 'check' : 'checks'}</Badge>
          <Badge variant="section">{researchCount} {researchCount === 1 ? 'source' : 'sources'}</Badge>
          <Badge aria-label={`Template: ${selectedThemeLabel}`} variant="section">Template: {selectedThemeLabel}</Badge>
          {hasUnsavedChanges ? <StatusBadge tone="active">Unsaved draft</StatusBadge> : null}
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
        <div className="grid min-w-0 gap-3">
          <div className="grid min-w-0 gap-1">
            <h1 className="max-w-[20ch] font-display text-(length:--type-headline-responsive) font-semibold tracking-[-0.05em] text-(--headline-primary)">
              {jobTitle}
            </h1>
            {companyLocationDisplay ? (
              <p className="text-(length:--type-body-lg) leading-7 text-foreground-soft">
                {companyLocationDisplay}
              </p>
            ) : null}
          </div>
          <p className="max-w-[72ch] text-(length:--type-body-md) leading-7 text-foreground-soft">
            Pick the template that fits this job and save your draft. Then export and approve the exact PDF you want Job Finder to use before starting Apply Copilot.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
          <Badge variant="section">Updated {formatTimestamp(draft.updatedAt)}</Badge>
          {draft.approvedAt ? (
            <Badge variant="section">Approved {formatTimestamp(draft.approvedAt)}</Badge>
          ) : null}
        </div>
      </div>
    </section>
  )
}
