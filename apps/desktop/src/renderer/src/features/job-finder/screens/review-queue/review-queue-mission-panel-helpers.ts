import { CheckCircle2, CircleDashed, TriangleAlert } from 'lucide-react'
import type { BrowserSessionState, ReviewQueueItem, SavedJob, TailoredAsset } from '@unemployed/contracts'
import {
  getApplyReadinessStatus,
  hasResumeGenerationFailure,
  isQueueStageReady,
  isResumeGenerationInProgress,
  needsResumeGeneration,
  type ApplySupportState,
} from './review-queue-status'

export interface ApplyChecklistItem {
  description: string
  label: string
  state: 'attention' | 'complete' | 'in_progress' | 'blocked'
}

function assertChecklistStateUnreachable(value: never): never {
  void value
  throw new Error('Unhandled checklist state.')
}

export function getChecklistTone(state: ApplyChecklistItem['state']) {
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

export function getChecklistIcon(state: ApplyChecklistItem['state']) {
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

export function getApplySupportState(selectedJob: SavedJob | null): ApplySupportState {
  if (!selectedJob || selectedJob.applyPath === 'unknown') {
    return 'incomplete'
  }

  return selectedJob.applyPath === 'easy_apply' && selectedJob.easyApplyEligible
    ? 'supported'
    : 'manual_follow_up'
}

export function getChecklistStateLabel(state: ApplyChecklistItem['state']) {
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

export function getNextChecklistItem(checklist: readonly ApplyChecklistItem[]) {
  return checklist.find((item) => item.state !== 'complete') ?? null
}

export function summarizeSelectedQueueTitles(items: readonly ReviewQueueItem[]): string {
  const visibleTitles = items.slice(0, 3).map((item) => item.title)
  const remainingCount = items.length - visibleTitles.length

  return remainingCount > 0
    ? `${visibleTitles.join(' • ')} +${remainingCount} more`
    : visibleTitles.join(' • ')
}

export function getReadinessDescription(input: {
  selectedItem: ReviewQueueItem | null
  selectedJob: SavedJob | null
  hasGenerationFailure: boolean
  needsGeneration: boolean
  isGenerating: boolean
  hasReadyApprovedAsset: boolean
  resumeReviewStatus: ReviewQueueItem['resumeReview']['status'] | 'not_started'
  applySupportState: ApplySupportState
  browserActionMessage: string | null
}) {
  const {
    selectedItem,
    selectedJob,
    hasGenerationFailure,
    needsGeneration,
    isGenerating,
    hasReadyApprovedAsset,
    resumeReviewStatus,
    applySupportState,
    browserActionMessage,
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

export function buildMissionPanelState(input: {
  browserSession: BrowserSessionState
  isApplyPending: boolean
  isJobPending: (jobId: string) => boolean
  queue: readonly ReviewQueueItem[]
  queueSelection: readonly string[]
  selectedAsset: TailoredAsset | null
  selectedItem: ReviewQueueItem | null
  selectedJob: SavedJob | null
}) {
  const {
    browserSession,
    isApplyPending,
    isJobPending,
    queue,
    queueSelection,
    selectedAsset,
    selectedItem,
    selectedJob,
  } = input
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
    selectedItem,
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
            : 'A tailored resume exists for this job.',
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
            : 'Open the workspace to export a PDF and approve the version you want to use.',
    },
    {
      label: 'Apply path',
      state: applySupportState === 'incomplete' ? 'blocked' : applySupportState === 'manual_follow_up' ? 'attention' : 'complete',
      description: applySupportState === 'incomplete'
        ? 'This selection is missing saved apply-path data. Refresh the job details before you start apply copilot.'
        : applySupportState === 'manual_follow_up'
          ? 'Saved job data does not confirm a supported Easy Apply path. Starting can still stop with a manual-only next step in Applications.'
          : 'Saved job data still points to a supported Easy Apply path. Live questions can still pause copilot before final submission.',
    },
    {
      label: 'Browser ready',
      state: browserSession.status === 'ready' ? 'complete' : browserSession.status === 'unknown' ? 'in_progress' : 'blocked',
      description: browserSession.status === 'ready'
        ? 'The browser is ready for supported apply-copilot steps.'
        : browserActionMessage ?? 'Open or refresh the browser before continuing.',
    },
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
    browserActionMessage,
  })
  const selectionSet = new Set(queueSelection)
  const selectedQueueItems: ReviewQueueItem[] = []
  const selectedQueueReadyItems: ReviewQueueItem[] = []
  let selectedQueueBlockedCount = 0
  let queueReadyCount = 0

  for (const item of queue) {
    const queueItemReady = isQueueStageReady(item)

    if (queueItemReady) {
      queueReadyCount += 1
    }

    if (!selectionSet.has(item.jobId)) {
      continue
    }

    selectedQueueItems.push(item)
    if (queueItemReady) {
      selectedQueueReadyItems.push(item)
    } else {
      selectedQueueBlockedCount += 1
    }
  }

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

  return {
    applyReadinessStatus,
    canApproveApply,
    canStageSelectedQueue,
    checklist,
    hasGenerationFailure,
    isGenerating,
    isGenerationAction,
    isPrimaryApplyPending,
    isSelectedJobPending,
    isSelectedQueuePending,
    needsGeneration,
    nextBlockedChecklistItem,
    primaryActionLabel,
    queueReadyCount,
    queueSummary,
    readinessDescription,
    selectedQueueItems,
    selectedQueueReadyItems,
  }
}
