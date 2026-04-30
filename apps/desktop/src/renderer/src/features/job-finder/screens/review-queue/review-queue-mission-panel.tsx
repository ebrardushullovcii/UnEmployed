import { CheckCircle2, CircleDashed, Pencil, TriangleAlert } from 'lucide-react'
import type { BrowserSessionState, ReviewQueueItem, SavedJob, TailoredAsset } from '@unemployed/contracts'
import { Button, ProgressBar } from '@renderer/components/ui'
import { EmptyState } from '../../components/empty-state'
import { PreferenceList } from '../../components/preference-list'
import { StatusBadge } from '../../components/status-badge'
import { jobDescriptionToText } from '../../lib/job-description-text'
import {
  getApplyReadinessStatus,
  hasResumeGenerationFailure,
  isQueueStageReady,
  isResumeGenerationInProgress,
  needsResumeGeneration,
  type ApplySupportState
} from './review-queue-status'

interface ReviewQueueMissionPanelProps {
  actionMessage: string | null
  browserSession: BrowserSessionState
  isApplyPending: boolean
  isJobPending: (jobId: string) => boolean
  onClearQueueSelection: () => void
  onApproveApply: (jobId: string) => void
  onStartAutoApply: (jobId: string) => void
  onStartAutoApplyQueue: (jobIds: string[]) => void
  onStartApplyCopilot: (jobId: string) => void
  onEditResumeWorkspace: (jobId: string) => void
  onGenerateResume: (jobId: string) => void
  queue: readonly ReviewQueueItem[]
  queueSelection: readonly string[]
  selectedAsset: TailoredAsset | null
  selectedItem: ReviewQueueItem | null
  selectedJob: SavedJob | null
}

interface ApplyChecklistItem {
  description: string
  label: string
  state: 'attention' | 'complete' | 'in_progress' | 'blocked'
}

function assertChecklistStateUnreachable(value: never): never {
  void value
  throw new Error('Unhandled checklist state.')
}

function getChecklistTone(state: ApplyChecklistItem['state']) {
  switch (state) {
    case 'complete':
      return 'positive' as const
    case 'attention':
      return 'active' as const
    case 'in_progress':
      return 'active' as const
    case 'blocked':
      return 'critical' as const
  }

  return assertChecklistStateUnreachable(state)
}

function getChecklistIcon(state: ApplyChecklistItem['state']) {
  switch (state) {
    case 'complete':
      return CheckCircle2
    case 'in_progress':
      return CircleDashed
    case 'attention':
      return TriangleAlert
    case 'blocked':
      return TriangleAlert
  }

  return assertChecklistStateUnreachable(state)
}

function getApplySupportState(selectedJob: SavedJob | null): ApplySupportState {
  if (!selectedJob) {
    return 'incomplete'
  }

  if (selectedJob.applyPath === 'unknown') {
    return 'incomplete'
  }

  return selectedJob.applyPath === 'easy_apply' && selectedJob.easyApplyEligible
    ? 'supported'
    : 'manual_follow_up'
}

function getChecklistStateLabel(state: ApplyChecklistItem['state']) {
  switch (state) {
    case 'complete':
      return 'Ready'
    case 'in_progress':
      return 'In progress'
    case 'attention':
      return 'Heads-up'
    case 'blocked':
      return 'Blocked'
  }

  return assertChecklistStateUnreachable(state)
}

function getNextChecklistItem(checklist: readonly ApplyChecklistItem[]) {
  return checklist.find((item) => item.state !== 'complete') ?? null
}

function summarizeSelectedQueueTitles(items: readonly ReviewQueueItem[]): string {
  const visibleTitles = items.slice(0, 3).map((item) => item.title)
  const remainingCount = items.length - visibleTitles.length

  return remainingCount > 0
    ? `${visibleTitles.join(' • ')} +${remainingCount} more`
    : visibleTitles.join(' • ')
}

function getReadinessDescription(input: {
  selectedItem: ReviewQueueItem | null
  selectedJob: SavedJob | null
  hasGenerationFailure: boolean
  needsGeneration: boolean
  isGenerating: boolean
  hasReadyApprovedAsset: boolean
  resumeReviewStatus: ReviewQueueItem['resumeReview']['status'] | 'not_started'
  applySupportState: ApplySupportState
  browserActionMessage: string | null
}): string {
  const {
    selectedItem,
    selectedJob,
    hasGenerationFailure,
    needsGeneration,
    isGenerating,
    hasReadyApprovedAsset,
    resumeReviewStatus,
    applySupportState,
    browserActionMessage
  } = input

  if (!selectedItem) {
    return 'Select a shortlisted job to see what needs attention before you apply.'
  }

  if (!selectedJob) {
    return ''
  }

  if (hasGenerationFailure) {
    return 'The last tailored resume run failed. Try again or open the resume workspace before you continue.'
  }

  if (needsGeneration) {
    return 'Create a tailored resume first.'
  }

  if (isGenerating) {
    return 'Job Finder is still preparing the latest resume for this job.'
  }

  if (!hasReadyApprovedAsset) {
    return resumeReviewStatus === 'stale'
      ? 'The last approved PDF is out of date and needs a fresh approval.'
      : 'Open the resume workspace to export a PDF and approve it before applying.'
  }

  if (applySupportState === 'incomplete') {
    return 'The approved PDF is ready, but this selection is missing apply-path data. Refresh the job details before starting apply copilot.'
  }

  if (browserActionMessage) {
    return browserActionMessage
  }

  if (applySupportState === 'manual_follow_up') {
    return 'The approved PDF is ready, but saved job data does not confirm a supported Easy Apply path. Starting apply copilot can still stop with a manual-only next step.'
  }

  return 'The approved PDF is ready to use. Apply copilot can prepare the application and pause before final submit if the live form asks for unsupported information.'
}

export function ReviewQueueMissionPanel({
  actionMessage,
  browserSession,
  isApplyPending,
  isJobPending,
  onClearQueueSelection,
  onApproveApply,
  onStartAutoApply,
  onStartAutoApplyQueue,
  onStartApplyCopilot,
  onEditResumeWorkspace,
  onGenerateResume,
  queue,
  queueSelection,
  selectedAsset,
  selectedItem,
  selectedJob
}: ReviewQueueMissionPanelProps) {
  const needsGeneration = needsResumeGeneration(selectedItem)
  const hasGenerationFailure = hasResumeGenerationFailure(selectedItem)
  const isGenerating = isResumeGenerationInProgress(selectedItem)
  const applySupportState = getApplySupportState(selectedJob)
  const resumeReviewStatus = selectedItem?.resumeReview.status ?? 'not_started'
  const approvedResumeReview = selectedItem?.resumeReview.status === 'approved'
    ? selectedItem.resumeReview
    : null
  const hasApprovedResumeExport = approvedResumeReview !== null
  const hasReadyApprovedAsset =
    selectedAsset !== null &&
    selectedAsset.status === 'ready' &&
    selectedItem?.resumeAssetId === selectedAsset.id &&
    approvedResumeReview !== null &&
    selectedAsset.storagePath === approvedResumeReview.approvedFilePath
  const canApproveApply =
    browserSession.status === 'ready' &&
    hasApprovedResumeExport &&
    hasReadyApprovedAsset &&
    applySupportState !== 'incomplete'
  const primaryActionLabel = isGenerating
    ? 'Preparing resume...'
    : hasGenerationFailure
      ? 'Try again'
    : needsGeneration
      ? 'Create tailored resume'
      : 'Start apply copilot'
  const browserActionMessage =
    browserSession.status === 'ready'
      ? null
      : browserSession.status === 'login_required'
        ? 'Sign in to the browser before you start apply copilot.'
      : browserSession.status === 'blocked'
          ? 'Resolve the browser issue before you start apply copilot.'
          : 'Wait for the browser to finish starting before you start apply copilot.'
  const applyReadinessStatus = getApplyReadinessStatus({
    applySupportState,
    browserSession,
    hasGenerationFailure,
    hasReadyApprovedAsset,
    isGenerating,
    needsGeneration,
    resumeReviewStatus,
    selectedItem
  })
  const checklist: ApplyChecklistItem[] = [
    {
      label: 'Tailored resume ready',
      state: hasGenerationFailure ? 'blocked' : isGenerating ? 'in_progress' : needsGeneration ? 'blocked' : 'complete',
      description: hasGenerationFailure
        ? 'The last resume run failed. Try again or open the workspace to fix it.'
        : needsGeneration
          ? 'Create the first tailored resume for this job.'
          : isGenerating
            ? 'Job Finder is still preparing the latest draft.'
            : 'A tailored resume exists for this job.'
    },
    {
      label: 'Approved PDF ready',
      state: hasReadyApprovedAsset ? 'complete' : 'blocked',
      description: hasReadyApprovedAsset
        ? 'The current approved PDF will be used when you start apply copilot.'
        : resumeReviewStatus === 'approved'
          ? 'The approved PDF could not be matched to the latest ready export. Reopen the workspace and approve again.'
          : resumeReviewStatus === 'stale'
            ? 'Your last approved PDF is out of date. Export and approve a fresh version.'
            : 'Open the workspace to export a PDF and approve the version you want to use.'
    },
    {
      label: 'Apply path',
      state: applySupportState === 'incomplete' ? 'blocked' : applySupportState === 'manual_follow_up' ? 'attention' : 'complete',
      description: applySupportState === 'incomplete'
        ? 'This selection is missing saved apply-path data. Refresh the job details before you start apply copilot.'
        : applySupportState === 'manual_follow_up'
        ? 'Saved job data does not confirm a supported Easy Apply path. Starting can still stop with a manual-only next step in Applications.'
        : 'Saved job data still points to a supported Easy Apply path. Live questions can still pause copilot before final submission.'
    },
    {
      label: 'Browser ready',
      state: browserSession.status === 'ready' ? 'complete' : browserSession.status === 'unknown' ? 'in_progress' : 'blocked',
      description: browserSession.status === 'ready'
        ? 'The browser is ready for supported apply-copilot steps.'
        : browserActionMessage ?? 'Open or refresh the browser before continuing.'
    }
  ]
  const nextBlockedChecklistItem = getNextChecklistItem(checklist)
  const readinessDescription = getReadinessDescription({
    selectedItem,
    selectedJob,
    hasGenerationFailure,
    needsGeneration,
    isGenerating,
    hasReadyApprovedAsset,
    resumeReviewStatus,
    applySupportState,
    browserActionMessage
  })
  const selectedQueueItems = queue.filter((item) => queueSelection.includes(item.jobId))
  const selectedQueueReadyItems = selectedQueueItems.filter((item) => isQueueStageReady(item))
  const selectedQueueBlockedCount = selectedQueueItems.length - selectedQueueReadyItems.length
  const queueReadyCount = queue.filter((item) => isQueueStageReady(item)).length
  const canStageSelectedQueue = selectedQueueReadyItems.length > 0 && selectedQueueBlockedCount === 0
  const isSelectedJobPending = selectedItem ? isJobPending(selectedItem.jobId) : false
  const isSelectedQueuePending = selectedQueueReadyItems.some((item) => isJobPending(item.jobId))
  const isGenerationAction = needsGeneration || hasGenerationFailure
  const isPrimaryApplyPending = isApplyPending && !isGenerationAction
  const queueSummary = selectedQueueItems.length === 0
    ? queueReadyCount === 0
      ? 'No shortlisted jobs currently meet the approved-PDF requirement for queue staging.'
      : `Select up to ${queueReadyCount} approved jobs from the list to stage one bounded queue run.`
    : selectedQueueBlockedCount > 0
      ? 'Only jobs with an approved ready PDF can enter the queue. Remove the blocked selection to continue.'
      : `${selectedQueueReadyItems.length} selected job${selectedQueueReadyItems.length === 1 ? '' : 's'} will be staged into one safe non-submitting queue run.`

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
            {selectedItem && isGenerating ? <ProgressBar ariaLabel="Resume progress" percent={selectedItem?.progressPercent ?? 0} /> : null}
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
                    pending={isSelectedJobPending || isApplyPending}
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
                    pending={isApplyPending || isSelectedQueuePending}
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
                    pending={isSelectedJobPending || isApplyPending}
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
