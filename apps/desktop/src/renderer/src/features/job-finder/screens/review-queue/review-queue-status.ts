import type { BrowserSessionState, ReviewQueueItem } from '@unemployed/contracts'
import type { BadgeTone } from '../../lib/job-finder-types'

export interface ReviewQueueWorkflowStatus {
  label: string
  tone: BadgeTone
}

export interface ApplyReadinessStatus {
  label: string
  tone: 'active' | 'critical' | 'muted' | 'positive'
}

export type ApplySupportState = 'incomplete' | 'manual_follow_up' | 'supported'

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

export function getApplyReadinessStatus(params: {
  applySupportState: ApplySupportState
  browserSession: BrowserSessionState
  hasGenerationFailure: boolean
  hasReadyApprovedAsset: boolean
  isGenerating: boolean
  needsGeneration: boolean
  resumeReviewStatus: ReviewQueueItem['resumeReview']['status'] | 'not_started'
  selectedItem: ReviewQueueItem | null
}): ApplyReadinessStatus {
  const {
    applySupportState,
    browserSession,
    hasGenerationFailure,
    hasReadyApprovedAsset,
    isGenerating,
    needsGeneration,
    resumeReviewStatus,
    selectedItem
  } = params

  if (!selectedItem) {
    return {
      label: 'Choose a job',
      tone: 'muted'
    }
  }

  if (hasGenerationFailure) {
    return {
      label: 'Resume issue',
      tone: 'critical'
    }
  }

  if (needsGeneration) {
    return {
      label: 'Needs resume',
      tone: 'muted'
    }
  }

  if (isGenerating) {
    return {
      label: 'Preparing resume',
      tone: 'active'
    }
  }

  if (!hasReadyApprovedAsset) {
    return {
      label: resumeReviewStatus === 'stale' ? 'Out of date' : 'Needs approval',
      tone: 'critical'
    }
  }

  if (applySupportState === 'incomplete') {
    return {
      label: 'Job data missing',
      tone: 'critical'
    }
  }

  if (applySupportState === 'manual_follow_up') {
    if (browserSession.status === 'blocked') {
      return {
        label: 'Browser blocked',
        tone: 'critical'
      }
    }

    if (browserSession.status === 'login_required') {
      return {
        label: 'Browser requires sign-in',
        tone: 'active'
      }
    }

    return {
      label: browserSession.status === 'unknown' ? 'Waiting for browser' : 'Apply path may be manual',
      tone: 'active'
    }
  }

  if (browserSession.status === 'ready') {
    return {
      label: 'Ready to start',
      tone: 'positive'
    }
  }

  if (browserSession.status === 'unknown') {
    return {
      label: 'Waiting for browser',
      tone: 'active'
    }
  }

  if (browserSession.status === 'login_required') {
    return {
      label: 'Browser requires sign-in',
      tone: 'active'
    }
  }

  return {
    label: 'Browser blocked',
    tone: 'critical'
  }
}
