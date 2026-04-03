import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SourceDebugRunDetails, SourceDebugRunRecord } from '@unemployed/contracts'

interface UseProfileSourceDebugReviewInput {
  getRunDetails: (runId: string) => Promise<SourceDebugRunDetails>
  onRunSourceDebug: (targetId: string) => void
  onVerifySourceInstructions: (targetId: string, instructionId: string) => void
  recentSourceDebugRuns: readonly SourceDebugRunRecord[]
  targetId: string
  targetLastDebugRunId: string | null
}

export function useProfileSourceDebugReview({
  getRunDetails,
  onRunSourceDebug,
  onVerifySourceInstructions,
  recentSourceDebugRuns,
  targetId,
  targetLastDebugRunId
}: UseProfileSourceDebugReviewInput) {
  const targetRuns = useMemo(
    () =>
      [...recentSourceDebugRuns]
        .filter((run) => run.targetId === targetId)
        .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()),
    [recentSourceDebugRuns, targetId]
  )
  const latestDebugRun = useMemo(
    () =>
      (targetLastDebugRunId
        ? targetRuns.find((run) => run.id === targetLastDebugRunId) ?? null
        : null) ?? targetRuns[0] ?? null,
    [targetLastDebugRunId, targetRuns]
  )
  const fallbackRunId = latestDebugRun?.id ?? targetRuns[0]?.id ?? null
  const [reviewOpen, setReviewOpen] = useState(false)
  const [selectedRunId, setSelectedRunId] = useState<string | null>(fallbackRunId)
  const [reviewDetails, setReviewDetails] = useState<SourceDebugRunDetails | null>(null)
  const [reviewLoading, setReviewLoading] = useState(false)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const normalizedRunId = useMemo(() => {
    if (selectedRunId && targetRuns.some((run) => run.id === selectedRunId)) {
      return selectedRunId
    }

    return fallbackRunId
  }, [fallbackRunId, selectedRunId, targetRuns])

  useEffect(() => {
    if (selectedRunId === normalizedRunId) {
      return
    }

    setSelectedRunId(normalizedRunId)
  }, [normalizedRunId, selectedRunId])

  useEffect(() => {
    if (!reviewOpen) {
      return
    }

    const nextRunId = normalizedRunId
    if (!nextRunId) {
      setReviewDetails(null)
      setReviewError(null)
      setReviewLoading(false)
      return
    }

    let cancelled = false
    setReviewDetails(null)
    setReviewLoading(true)
    setReviewError(null)

    void getRunDetails(nextRunId)
      .then((details) => {
        if (cancelled) {
          return
        }

        setReviewDetails(details)
        setReviewLoading(false)
      })
      .catch((error) => {
        if (cancelled) {
          return
        }

        setReviewDetails(null)
        setReviewError(error instanceof Error ? error.message : 'Unable to load source-debug run details.')
        setReviewLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [getRunDetails, normalizedRunId, reviewOpen])

  const handleCloseReview = useCallback(() => {
    setReviewOpen(false)
  }, [])

  const handleLoadRun = useCallback((runId: string) => {
    setSelectedRunId(runId)
  }, [])

  const handleReviewLatestRun = useCallback(() => {
    if (!latestDebugRun) {
      return
    }

    setSelectedRunId(latestDebugRun.id)
    setReviewOpen(true)
  }, [latestDebugRun])

  const handleRerun = useCallback(() => {
    setReviewOpen(false)
    onRunSourceDebug(targetId)
  }, [onRunSourceDebug, targetId])

  const handleVerify = useCallback((instructionId: string) => {
    onVerifySourceInstructions(targetId, instructionId)
  }, [onVerifySourceInstructions, targetId])

  return {
    latestDebugRun,
    reviewDetails,
    reviewError,
    reviewLoading,
    reviewOpen,
    selectedRunId,
    targetRuns,
    handleCloseReview,
    handleLoadRun,
    handleReviewLatestRun,
    handleRerun,
    handleVerify
  }
}
