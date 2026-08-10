import type { ReviewQueueItem } from '@unemployed/contracts'

const MAX_FAKE_PROGRESS = 94
const MIN_PENDING_PROGRESS = 8
const MAX_REMEMBERED_OPERATIONS = 50

const displayedProgressByJobId = new Map<string, number>()

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }

  return Math.max(0, Math.min(100, Math.round(value)))
}

function rememberProgress(jobId: string, progress: number): void {
  if (!displayedProgressByJobId.has(jobId) && displayedProgressByJobId.size >= MAX_REMEMBERED_OPERATIONS) {
    const oldestJobId = displayedProgressByJobId.keys().next().value

    if (oldestJobId) {
      displayedProgressByJobId.delete(oldestJobId)
    }
  }

  displayedProgressByJobId.set(jobId, clampProgress(progress))
}

export function getDisplayedResumeProgress(item: ReviewQueueItem | null, isPending: boolean): number {
  const storedProgress = clampProgress(item?.progressPercent ?? 0)

  if (!isPending) {
    if (item) {
      displayedProgressByJobId.delete(item.jobId)
    }

    return storedProgress
  }

  const rememberedProgress = item ? (displayedProgressByJobId.get(item.jobId) ?? 0) : 0
  const progress = Math.min(MAX_FAKE_PROGRESS, Math.max(storedProgress, rememberedProgress, MIN_PENDING_PROGRESS))

  if (item) {
    rememberProgress(item.jobId, progress)
  }

  return progress
}

export function rememberDisplayedResumeProgress(item: ReviewQueueItem | null, progress: number): void {
  if (item) {
    rememberProgress(item.jobId, progress)
  }
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

export function resetRememberedResumeProgressForTests(): void {
  displayedProgressByJobId.clear()
}
