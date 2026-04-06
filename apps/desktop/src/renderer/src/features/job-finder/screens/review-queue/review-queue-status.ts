import type { ReviewQueueItem } from '@unemployed/contracts'
import type { BadgeTone } from '../../lib/job-finder-types'

export interface ReviewQueueWorkflowStatus {
  label: string
  tone: BadgeTone
}

export function getReviewQueueWorkflowStatus(
  item: ReviewQueueItem | null
): ReviewQueueWorkflowStatus {
  if (!item) {
    return {
      label: 'Choose a job',
      tone: 'muted'
    }
  }

  if (item.assetStatus === 'failed') {
    return {
      label: 'Resume issue',
      tone: 'critical'
    }
  }

  if (item.assetStatus === 'not_started') {
    return {
      label: 'Needs resume',
      tone: 'muted'
    }
  }

  if (item.assetStatus === 'generating' || item.assetStatus === 'queued') {
    return {
      label: 'Preparing resume',
      tone: 'active'
    }
  }

  if (item.resumeReview.status === 'approved') {
    return {
      label: 'Ready to apply',
      tone: 'positive'
    }
  }

  if (item.resumeReview.status === 'stale') {
    return {
      label: 'Out of date',
      tone: 'critical'
    }
  }

  return {
    label: 'Needs approval',
    tone: 'active'
  }
}

export function isResumeGenerationInProgress(item: ReviewQueueItem | null): boolean {
  return item?.assetStatus === 'generating' || item?.assetStatus === 'queued'
}

export function needsResumeGeneration(item: ReviewQueueItem | null): boolean {
  return item?.assetStatus === 'not_started'
}

export function hasResumeGenerationFailure(item: ReviewQueueItem | null): boolean {
  return item?.assetStatus === 'failed'
}
