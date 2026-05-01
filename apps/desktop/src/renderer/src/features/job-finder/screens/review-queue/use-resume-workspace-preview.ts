import { useCallback, useEffect, useRef, useState } from 'react'
import type { JobFinderResumePreview, ResumeDraft } from '@unemployed/contracts'
import { cloneDraft } from './resume-workspace-utils'
import { getPreviewErrorMessage } from './resume-workspace-screen-helpers'

export function useResumeWorkspacePreview(input: {
  draft: ResumeDraft | null
  hasUnsavedChanges: boolean
  onPreviewDraft: (draft: ResumeDraft) => Promise<JobFinderResumePreview>
}) {
  const { draft, hasUnsavedChanges, onPreviewDraft } = input
  const [preview, setPreview] = useState<JobFinderResumePreview | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewStatus, setPreviewStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const previewRequestRef = useRef(0)
  const previewTimeoutRef = useRef<number | null>(null)

  const refreshPreview = useCallback((targetDraft: ResumeDraft) => {
    const requestId = previewRequestRef.current + 1
    previewRequestRef.current = requestId
    setPreview(null)
    setPreviewStatus('loading')
    setPreviewError(null)

    void onPreviewDraft(cloneDraft(targetDraft))
      .then((nextPreview) => {
        if (previewRequestRef.current !== requestId) {
          return
        }

        setPreview(nextPreview)
        setPreviewStatus('ready')
      })
      .catch((error) => {
        if (previewRequestRef.current !== requestId) {
          return
        }

        setPreviewStatus('error')
        setPreviewError(getPreviewErrorMessage(error))
      })
  }, [onPreviewDraft])

  useEffect(() => {
    if (!draft) {
      if (previewTimeoutRef.current !== null) {
        window.clearTimeout(previewTimeoutRef.current)
        previewTimeoutRef.current = null
      }
      previewRequestRef.current += 1
      setPreview(null)
      setPreviewError(null)
      setPreviewStatus('idle')
      return
    }

    previewRequestRef.current += 1
    previewTimeoutRef.current = window.setTimeout(() => {
      refreshPreview(draft)
    }, hasUnsavedChanges ? 250 : 100)

    return () => {
      if (previewTimeoutRef.current !== null) {
        window.clearTimeout(previewTimeoutRef.current)
        previewTimeoutRef.current = null
      }
    }
  }, [draft, hasUnsavedChanges, refreshPreview])

  const resetPreview = useCallback(() => {
    if (previewTimeoutRef.current !== null) {
      window.clearTimeout(previewTimeoutRef.current)
      previewTimeoutRef.current = null
    }
    previewRequestRef.current += 1
    setPreview(null)
    setPreviewError(null)
    setPreviewStatus('idle')
  }, [])

  return {
    preview,
    previewError,
    previewStatus,
    refreshPreview,
    resetPreview,
  }
}
