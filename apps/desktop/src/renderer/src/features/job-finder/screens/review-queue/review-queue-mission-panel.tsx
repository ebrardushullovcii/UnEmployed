import { Pencil } from 'lucide-react'
import type { BrowserSessionState, ReviewQueueItem, SavedJob, TailoredAsset } from '@unemployed/contracts'
import { Button, ProgressBar } from '@renderer/components/ui'
import { EmptyState } from '../../components/empty-state'
import { PreferenceList } from '../../components/preference-list'
import { StatusBadge } from '../../components/status-badge'
import { jobDescriptionToText } from '../../lib/job-description-text'
import {
  buildMissionPanelState,
  getChecklistIcon,
  getChecklistStateLabel,
  getChecklistTone,
  summarizeSelectedQueueTitles,
} from './review-queue-mission-panel-helpers'

interface ReviewQueueMissionPanelProps {
  actionMessage: string | null
  browserSession: BrowserSessionState
  displayedProgress: number
  isApplyPending: boolean
  isJobPending: (jobId: string) => boolean
  onClearQueueSelection: () => void
  onApproveApply: (jobId: string) => void
  onStartAutoApply: (jobId: string) => void
  onStartAutoApplyQueue: (jobIds: string[]) => void
  onStartApplyCopilot: (jobId: string) => void
  onEditResumeWorkspace: (jobId: string) => void
  onGenerateResume: (jobId: string) => void
  onRemoveReviewJob: (jobId: string) => void
  queue: readonly ReviewQueueItem[]
  queueSelection: readonly string[]
  selectedAsset: TailoredAsset | null
  selectedItem: ReviewQueueItem | null
  selectedJob: SavedJob | null
}

export function ReviewQueueMissionPanel({
  actionMessage,
  browserSession,
  displayedProgress,
  isApplyPending,
  isJobPending,
  onClearQueueSelection,
  onApproveApply,
  onStartAutoApply,
  onStartAutoApplyQueue,
  onStartApplyCopilot,
  onEditResumeWorkspace,
  onGenerateResume,
  onRemoveReviewJob,
  queue,
  queueSelection,
  selectedAsset,
  selectedItem,
  selectedJob
}: ReviewQueueMissionPanelProps) {
  const {
    applyReadinessStatus,
    canApproveApply,
    canStageSelectedQueue,
    checklist,
    isGenerating,
    isGenerationAction,
    isPrimaryApplyPending,
    isSelectedJobPending,
    isSelectedQueuePending,
    nextBlockedChecklistItem,
    primaryActionLabel,
    queueReadyCount,
    queueSummary,
    readinessDescription,
    selectedQueueItems,
    selectedQueueReadyItems,
  } = buildMissionPanelState({
    browserSession,
    isApplyPending,
    isJobPending,
    queue,
    queueSelection,
    selectedAsset,
    selectedItem,
    selectedJob,
  })

  return (
    <section className="surface-panel-shell relative flex min-h-124 min-w-0 flex-col overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border) xl:h-full xl:min-h-0">
      <div className="flex flex-wrap items-start justify-between gap-3 px-6 pb-2 pt-6">
        <h3 className="font-display text-(length:--text-small) font-bold uppercase tracking-(--tracking-caps) text-primary">Apply copilot readiness</h3>
      </div>
      <div className="grid min-h-0 min-w-0 flex-1 content-start gap-4 overflow-x-hidden overflow-y-auto px-6 pb-6 pt-4">
        {readinessDescription ? (
          <div className="surface-card-tint min-w-0 rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-4">
            <div className="mb-2 flex min-w-0 flex-wrap items-center justify-between gap-2">
              <span className="text-(length:--text-label) uppercase tracking-(--tracking-heading) text-muted-foreground">Current state</span>
              <StatusBadge tone={applyReadinessStatus.tone}>{applyReadinessStatus.label}</StatusBadge>
            </div>
            <p className="text-(length:--text-small) leading-6 text-foreground-soft">
              {readinessDescription}
            </p>
            {selectedItem && isGenerating ? <ProgressBar ariaLabel="Resume progress" percent={displayedProgress} /> : null}
          </div>
        ) : null}
        {selectedItem && selectedJob ? (
          <>
            <div className="surface-card-tint grid min-w-0 gap-2 rounded-(--radius-field) border border-(--surface-panel-border) p-4">
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <span className="text-(length:--text-label) uppercase tracking-(--tracking-heading) text-muted-foreground">Checklist</span>
                {nextBlockedChecklistItem ? (
                  <StatusBadge tone={getChecklistTone(nextBlockedChecklistItem.state)}>
                    Next: {nextBlockedChecklistItem.label}
                  </StatusBadge>
                ) : (
                  <StatusBadge tone="positive">Ready to start</StatusBadge>
                )}
              </div>
              <ul className="m-0 grid gap-3 list-none p-0" role="list">
                {checklist.map((item) => {
                  const Icon = getChecklistIcon(item.state)

                  return (
                    <li key={item.label} className="grid gap-2 rounded-(--radius-small) border border-(--surface-panel-border) bg-(--surface-overlay-subtle) px-3 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <Icon className="mt-0.5 size-4 shrink-0 text-current" />
                          <strong className="text-(length:--text-small) text-(--text-headline)">{item.label}</strong>
                        </div>
                        <StatusBadge tone={getChecklistTone(item.state)}>
                          {getChecklistStateLabel(item.state)}
                        </StatusBadge>
                      </div>
                      <p className="text-(length:--text-small) leading-6 text-foreground-soft">{item.description}</p>
                    </li>
                  )
                })}
              </ul>
            </div>
            <div className="surface-card-tint grid min-w-0 gap-3 rounded-(--radius-field) border border-(--surface-panel-border) p-4">
              <div className="grid gap-1">
                <span className="text-(length:--text-label) uppercase tracking-(--tracking-heading) text-muted-foreground">Job summary</span>
                <strong className="text-(length:--text-body) text-(--text-headline)">{selectedJob.title}</strong>
              </div>
              <p className="text-(length:--text-body) leading-7 text-foreground-soft">
                {jobDescriptionToText(selectedJob.summary ?? selectedJob.description)}
              </p>
              {selectedJob.employerWebsiteUrl ? (
                <p className="min-w-0 break-words text-(length:--text-small) leading-6 text-foreground-soft">
                  Company site: {selectedJob.employerWebsiteUrl}
                </p>
              ) : null}
            </div>
            <div className="surface-card-tint min-w-0 rounded-(--radius-field) border border-(--surface-panel-border) p-4">
              <PreferenceList label="Why it fits" values={selectedJob.matchAssessment.reasons} />
            </div>
            <div className="surface-card-tint grid min-w-0 gap-3 rounded-(--radius-field) border border-(--surface-panel-border) p-4">
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <div className="grid gap-1">
                  <span className="text-(length:--text-label) uppercase tracking-(--tracking-heading) text-muted-foreground">Queue staging</span>
                  <strong className="text-(length:--text-body) text-(--text-headline)">
                    {selectedQueueItems.length > 0
                      ? `${selectedQueueItems.length} selected`
                      : `${queueReadyCount} ready for queue`}
                  </strong>
                </div>
                {selectedQueueItems.length > 0 ? (
                  <Button
                    onClick={onClearQueueSelection}
                    size="compact"
                    type="button"
                    variant="ghost"
                  >
                    Clear selection
                  </Button>
                ) : null}
              </div>
              <p className="text-(length:--text-small) leading-6 text-foreground-soft">
                {queueSummary}
              </p>
              {selectedQueueReadyItems.length > 0 ? (
                <p className="text-(length:--text-small) leading-6 text-foreground-soft">
                  {summarizeSelectedQueueTitles(selectedQueueReadyItems)}
                </p>
              ) : null}
            </div>
            {actionMessage ? <p aria-atomic="true" aria-live="polite" className="min-w-0 break-words text-(length:--text-small) leading-6 text-primary" role="status">{actionMessage}</p> : null}
            <div className="grid min-w-0 gap-2.5">
              <Button
                className="h-11 w-full justify-start px-4 text-sm font-semibold normal-case tracking-normal"
                pending={isSelectedJobPending || isPrimaryApplyPending}
                variant="primary"
                disabled={isSelectedJobPending || isPrimaryApplyPending || isGenerating || (isGenerationAction ? false : !canApproveApply)}
                onClick={() => {
                  if (isGenerationAction) {
                    onGenerateResume(selectedItem.jobId)
                    return
                  }

                  onStartApplyCopilot(selectedItem.jobId)
                }}
                type="button"
              >
                {primaryActionLabel}
              </Button>

              <div className="grid gap-1.5 rounded-(--radius-field) border border-(--surface-panel-border) bg-background/20 p-2.5">
                <p className="text-(length:--text-label-mono-xs) uppercase tracking-(--tracking-badge) text-muted-foreground">More actions</p>
                <div className="grid gap-2">
                  <Button
                    className="h-10 w-full justify-start px-3.5 text-sm font-medium normal-case tracking-normal disabled:bg-transparent disabled:text-foreground-soft"
                    pending={isApplyPending}
                    disabled={isSelectedJobPending || isApplyPending || isGenerating || !canApproveApply}
                    onClick={() => onStartAutoApply(selectedItem.jobId)}
                    size="compact"
                    type="button"
                    variant="outline"
                  >
                    Stage automatic submit run
                  </Button>
                  <Button
                    className="h-10 w-full justify-start px-3.5 text-sm font-medium normal-case tracking-normal disabled:bg-transparent disabled:text-foreground-soft"
                    pending={isApplyPending}
                    disabled={isApplyPending || isSelectedQueuePending || !canStageSelectedQueue}
                    onClick={() => onStartAutoApplyQueue(selectedQueueReadyItems.map((item) => item.jobId))}
                    size="compact"
                    type="button"
                    variant="outline"
                  >
                    {selectedQueueReadyItems.length > 0
                      ? `Stage queue for ${selectedQueueReadyItems.length} job${selectedQueueReadyItems.length === 1 ? '' : 's'}`
                      : 'Stage selected queue'}
                  </Button>
                  <Button
                    className="h-10 w-full justify-start px-3.5 text-sm font-medium normal-case tracking-normal disabled:bg-transparent disabled:text-foreground-soft"
                    disabled={isSelectedJobPending}
                    onClick={() => onRemoveReviewJob(selectedItem.jobId)}
                    size="compact"
                    type="button"
                    variant="outline"
                  >
                    Remove from shortlisted
                  </Button>
                  <Button
                    className="h-10 w-full justify-start px-3.5 text-sm font-medium normal-case tracking-normal disabled:bg-transparent disabled:text-foreground-soft"
                    pending={isApplyPending}
                    disabled={isSelectedJobPending || isApplyPending || isGenerating || !canApproveApply}
                    onClick={() => onApproveApply(selectedItem.jobId)}
                    size="compact"
                    type="button"
                    variant="outline"
                  >
                    Run legacy submit path
                  </Button>
                </div>
              </div>

              <Button
                className="h-auto w-full justify-start px-0 text-left text-sm font-medium normal-case tracking-normal text-foreground-soft hover:text-foreground"
                onClick={() => onEditResumeWorkspace(selectedItem.jobId)}
                size="sm"
                type="button"
                variant="ghost"
              >
                <Pencil aria-hidden="true" className="size-4" focusable="false" />
                Open resume workspace
              </Button>
            </div>
          </>
        ) : selectedItem ? (
          <EmptyState
            title="Job not loaded"
            description="The selected job could not be loaded. Try selecting another job or refreshing the page."
          />
        ) : (
          <EmptyState
            title="Choose a job"
            description="Select a shortlisted job to see what its resume needs next and when it is ready to apply."
          />
        )}
      </div>
    </section>
  )
}
