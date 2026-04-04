import { ArrowLeft, RefreshCcw } from 'lucide-react'
import type { ResumeDraft } from '@unemployed/contracts'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { StatusBadge } from '../../components/status-badge'
import { formatTimestamp, toDraftStatusTone } from './resume-workspace-utils'

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
    <section className="grid gap-4 rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel) p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <Button onClick={onBack} type="button" variant="ghost">
            <ArrowLeft className="size-4" />
            Back to Review Queue
          </Button>
          <Button onClick={onRefresh} type="button" variant="secondary">
            <RefreshCcw className="size-4" />
            Refresh
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={toDraftStatusTone(draft.status)}>
            {draft.status.replaceAll('_', ' ')}
          </StatusBadge>
          <Badge variant="section">{validationIssueCount} validation issues</Badge>
          <Badge variant="section">{researchCount} research pages</Badge>
          {hasUnsavedChanges ? <StatusBadge tone="active">Unsaved edits</StatusBadge> : null}
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
        <div className="grid min-w-0 gap-3">
          <div className="grid gap-2">
            <p className="text-(length:--text-tiny) uppercase tracking-[0.22em] text-muted-foreground">
              Resume Workspace
            </p>
            <div className="grid min-w-0 gap-1">
              <h1 className="max-w-[20ch] font-display text-[clamp(2.25rem,4vw,3.4rem)] font-semibold tracking-[-0.05em] text-(--headline-primary)">
                {jobTitle}
              </h1>
              <p className="text-[1.05rem] leading-7 text-foreground-soft">
                {jobCompany} • {jobLocation}
              </p>
            </div>
          </div>
          <p className="max-w-[72ch] text-[0.98rem] leading-7 text-foreground-soft">
            Edit structured resume sections, export the PDF, and approve the final tailored artifact before Easy Apply.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
          <Badge variant="section">Updated {formatTimestamp(draft.updatedAt)}</Badge>
          <Badge variant="section">Approved {formatTimestamp(draft.approvedAt)}</Badge>
        </div>
      </div>
    </section>
  )
}
