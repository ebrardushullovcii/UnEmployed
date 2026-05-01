import type { ReviewQueueItem } from '@unemployed/contracts'

const MAX_FAKE_PROGRESS = 94
const MIN_PENDING_PROGRESS = 8

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }

  return Math.max(0, Math.min(100, Math.round(value)))
}

export function getDisplayedResumeProgress(item: ReviewQueueItem | null, isPending: boolean): number {
  const storedProgress = clampProgress(item?.progressPercent ?? 0)

  if (!isPending) {
    return storedProgress
  }

  return Math.max(storedProgress, MIN_PENDING_PROGRESS)
}

export function getNextDisplayedResumeProgress(currentProgress: number): number {
  const progress = clampProgress(currentProgress)

  if (progress >= MAX_FAKE_PROGRESS) {
    return MAX_FAKE_PROGRESS
  }

  const remaining = MAX_FAKE_PROGRESS - progress
  const step = Math.max(1, Math.ceil(remaining * 0.12))

  return Math.min(MAX_FAKE_PROGRESS, progress + step)
}
