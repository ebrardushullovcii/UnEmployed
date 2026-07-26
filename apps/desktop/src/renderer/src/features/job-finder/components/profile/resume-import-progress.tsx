import { useEffect, useState } from 'react'
import type { ResumeImportProgressEvent } from '@unemployed/contracts'
import { LoaderCircle } from 'lucide-react'

const stageLabels: Record<ResumeImportProgressEvent['stage'], string> = {
  saving_file: 'Saving your file',
  reading_document: 'Reading your resume',
  building_profile: 'Building profile suggestions',
  saving_results: 'Saving your review items',
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s elapsed`
  }

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}m ${remainingSeconds.toString().padStart(2, '0')}s elapsed`
}

export function ResumeImportProgress(props: {
  isPending: boolean
  progress: ResumeImportProgressEvent | null
}) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  useEffect(() => {
    if (!props.isPending) {
      setElapsedSeconds(0)
      return
    }

    const startedAt = Date.now()
    const updateElapsed = () => setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1_000))
    updateElapsed()
    const timer = window.setInterval(updateElapsed, 1_000)
    return () => window.clearInterval(timer)
  }, [props.isPending])

  if (!props.isPending) {
    return null
  }

  const stageLabel = props.progress ? stageLabels[props.progress.stage] : 'Choose a resume file'
  const message = props.progress?.message
    ?? 'Select a PDF, DOCX, TXT, or Markdown file. Processing starts after you choose it.'

  return (
    <div
      aria-atomic="true"
      aria-live="polite"
      className="grid gap-2 rounded-(--radius-field) border border-accent/30 bg-accent/8 p-4"
      role="status"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <LoaderCircle aria-hidden="true" className="size-4 shrink-0 animate-spin text-accent" />
          <strong className="text-sm font-semibold text-foreground">{stageLabel}</strong>
        </div>
        <span className="shrink-0 text-xs tabular-nums text-foreground-muted">
          {formatElapsed(elapsedSeconds)}
        </span>
      </div>
      <p className="text-sm leading-6 text-foreground-soft">{message}</p>
      {elapsedSeconds >= 45 ? (
        <p className="text-xs leading-5 text-foreground-muted">
          Larger or image-heavy resumes can take a couple of minutes. Keep this window open; your original file is not changed.
        </p>
      ) : null}
    </div>
  )
}
