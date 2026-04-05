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
  researchCount,
  validationIssueCount,
  onBack,
  onRefresh
}: ResumeWorkspaceHeaderProps) {
  return (
    <section className="surface-panel-shell relative grid gap-4 rounded-(--radius-field) border border-(--surface-panel-border) p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <Button onClick={onBack} type="button" variant="ghost">
            <ArrowLeft className="size-4" />
            Back to Review Queue
          </Button>
          <Button onClick={onRefresh} type="button" variant="secondary">
            <RefreshCcw className="size-4" />
            Reload
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={toDraftStatusTone(draft.status)}>
            {formatDraftStatusLabel(draft.status)}
          </StatusBadge>
          <Badge variant="section">{validationIssueCount} {validationIssueCount === 1 ? 'check' : 'checks'}</Badge>
          <Badge variant="section">{researchCount} {researchCount === 1 ? 'research note' : 'research notes'}</Badge>
          {hasUnsavedChanges ? <StatusBadge tone="active">Unsaved edits</StatusBadge> : null}
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
        <div className="grid min-w-0 gap-3">
          <div className="grid gap-2">
            <p className="text-(length:--text-tiny) uppercase tracking-(--type-tracking-small) text-muted-foreground">
              Resume Workspace
            </p>
            <div className="grid min-w-0 gap-1">
              <h1 className="max-w-[20ch] font-display text-(length:--type-headline-responsive) font-semibold tracking-[-0.05em] text-(--headline-primary)">
                {jobTitle}
              </h1>
              <p className="text-(length:--type-body-lg) leading-7 text-foreground-soft">
                {jobCompany} • {jobLocation}
              </p>
            </div>
          </div>
          <p className="max-w-[72ch] text-(length:--type-body-md) leading-7 text-foreground-soft">
            Edit each section, export the PDF, and approve the final version before moving this job into Applications.
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
