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
  onBack,
  onRefresh
}: ResumeWorkspaceHeaderProps) {
  const companyLocationDisplay = [jobCompany, jobLocation].filter(Boolean).join(' • ')

  return (
    <section className="surface-panel-shell relative grid gap-0.5 rounded-(--radius-field) border border-(--surface-panel-border) px-3.5 py-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          <Button onClick={onBack} size="compact" type="button" variant="ghost">
            <ArrowLeft className="size-4" />
            Back to Shortlisted
          </Button>
          <Button onClick={onRefresh} size="compact" type="button" variant="secondary">
            <RefreshCcw className="size-4" />
            Reload workspace
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge tone={toDraftStatusTone(draft.status)}>
            {formatDraftStatusLabel(draft.status)}
          </StatusBadge>
          <Badge aria-label={`Template: ${selectedThemeLabel}`} variant="section">Template: {selectedThemeLabel}</Badge>
          <Badge variant="section">Updated {formatTimestamp(draft.updatedAt)}</Badge>
          {draft.approvedAt ? (
            <Badge variant="section">Approved {formatTimestamp(draft.approvedAt)}</Badge>
          ) : null}
          {hasUnsavedChanges ? <StatusBadge tone="active">Unsaved draft</StatusBadge> : null}
        </div>
      </div>

      <div className="grid min-w-0 gap-0">
        <h1 className="max-w-[20ch] font-display text-[clamp(1.42rem,2.05vw,1.95rem)] font-semibold tracking-[-0.05em] text-(--headline-primary)">
          {jobTitle}
        </h1>
        {companyLocationDisplay ? (
          <p className="text-[0.78rem] leading-4 text-foreground-soft">
            {companyLocationDisplay}
          </p>
        ) : null}
      </div>
    </section>
  )
}
