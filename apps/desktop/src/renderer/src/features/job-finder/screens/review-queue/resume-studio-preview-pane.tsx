import { AlertTriangle, CheckCircle2, FileWarning, LoaderCircle, RefreshCcw } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import type { JobFinderResumePreview } from '@unemployed/contracts'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/cn'

type PreviewStatus = 'idle' | 'loading' | 'ready' | 'error'

interface ResumeStudioPreviewPaneProps {
  isDirty: boolean
  isPending: boolean
  onRetry: () => void
  onSelectTarget: (selection: { sectionId: string | null; entryId: string | null }) => void
  preview: JobFinderResumePreview | null
  previewError: string | null
  previewStatus: PreviewStatus
  selectedEntryId: string | null
  selectedSectionId: string | null
  templateLabel?: string | null
}

function parseSelectionTarget(node: HTMLElement | null) {
  const entryTarget = node?.closest<HTMLElement>('[data-resume-entry-id]') ?? null
  const sectionTarget = node?.closest<HTMLElement>('[data-resume-section-id]') ?? null

  return {
    entryId: entryTarget?.dataset.resumeEntryId ?? null,
    sectionId:
      entryTarget?.dataset.resumeSectionId ??
      sectionTarget?.dataset.resumeSectionId ??
      null,
  }
}

export function ResumeStudioPreviewPane(props: ResumeStudioPreviewPaneProps) {
  const frameRef = useRef<HTMLIFrameElement | null>(null)

  const warningSummary = useMemo(() => {
    const warningCount = props.preview?.warnings.length ?? 0

    if (warningCount === 0) {
      return 'No preview warnings right now.'
    }

    return `${warningCount} preview ${warningCount === 1 ? 'warning' : 'warnings'} surfaced before export.`
  }, [props.preview?.warnings.length])

  useEffect(() => {
    const frame = frameRef.current
    const document = frame?.contentDocument

    if (!frame || !document || !props.preview) {
      return
    }

    const selectTargets = () => {
      const allTargets = document.querySelectorAll<HTMLElement>(
        '[data-resume-section-id], [data-resume-entry-id]',
      )

      allTargets.forEach((target) => {
        const isSelectedEntry =
          Boolean(props.selectedEntryId) &&
          target.dataset.resumeEntryId === props.selectedEntryId
        const isSelectedSection =
          !props.selectedEntryId &&
          Boolean(props.selectedSectionId) &&
          target.dataset.resumeSectionId === props.selectedSectionId

        if (isSelectedEntry || isSelectedSection) {
          target.setAttribute('data-resume-selected', 'true')
        } else {
          target.removeAttribute('data-resume-selected')
        }
      })
    }

    const handleClick = (event: MouseEvent) => {
      const selection = parseSelectionTarget(event.target as HTMLElement | null)

      if (!selection.sectionId && !selection.entryId) {
        return
      }

      event.preventDefault()
      props.onSelectTarget(selection)
    }

    selectTargets()
    document.addEventListener('click', handleClick)

    return () => {
      document.removeEventListener('click', handleClick)
    }
  }, [props.onSelectTarget, props.preview, props.selectedEntryId, props.selectedSectionId])

  return (
    <section className="surface-panel-shell relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border)">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-(--surface-panel-border) px-5 py-4">
        <div className="grid gap-1">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-[11px] font-bold uppercase tracking-(--tracking-caps) text-primary">
              Live preview
            </h2>
            {props.previewStatus === 'loading' ? (
              <span className="inline-flex items-center gap-1 text-xs text-foreground-soft">
                <LoaderCircle className="size-3.5 animate-spin" />
                Refreshing
              </span>
            ) : null}
            {props.previewStatus === 'ready' ? (
              <span className="inline-flex items-center gap-1 text-xs text-foreground-soft">
                <CheckCircle2 className="size-3.5" />
                {props.isDirty ? 'Unsaved edits rendered' : 'Saved draft rendered'}
              </span>
            ) : null}
          </div>
          <p className="text-sm leading-6 text-foreground-soft">
            This preview uses the export renderer. Click any section to jump to its structured controls.
          </p>
        </div>
        <Button
          disabled={props.isPending || props.previewStatus === 'loading'}
          onClick={props.onRetry}
          type="button"
          variant="secondary"
        >
          <RefreshCcw className="size-4" />
          Refresh preview
        </Button>
      </header>

      <div className="grid gap-3 border-b border-(--surface-panel-border) bg-(--surface-fill-soft) px-5 py-4">
        <div className="flex flex-wrap items-center gap-2 text-sm text-foreground-soft">
          <span className="inline-flex items-center gap-1">
            <FileWarning className="size-4" />
            {warningSummary}
          </span>
          {props.preview?.metadata ? (
            <span>
              Template: {props.templateLabel ?? props.preview.metadata.templateId.replaceAll('_', ' ')}
            </span>
          ) : null}
        </div>
        {props.preview?.warnings.length ? (
          <div className="grid gap-2">
            {props.preview.warnings.slice(0, 4).map((warning) => (
              <p
                className={cn(
                  'rounded-(--radius-field) border px-3 py-2 text-sm leading-6',
                  warning.severity === 'error'
                    ? 'border-critical/30 bg-critical/10 text-critical'
                    : warning.severity === 'warning'
                      ? 'border-amber-500/20 bg-amber-500/10 text-amber-200'
                      : 'border-(--surface-panel-border) bg-background/60 text-foreground-soft',
                )}
                key={warning.id}
              >
                {warning.message}
              </p>
            ))}
          </div>
        ) : null}
      </div>

      <div className="relative min-h-0 flex-1 bg-[linear-gradient(180deg,rgba(16,22,35,0.02),rgba(16,22,35,0.08))] p-3 sm:p-4">
        {props.previewStatus === 'error' ? (
          <div className="grid h-full place-items-center rounded-(--radius-field) border border-dashed border-critical/35 bg-critical/10 p-6 text-center">
            <div className="grid max-w-md gap-3">
              <div className="mx-auto flex size-11 items-center justify-center rounded-full border border-critical/25 bg-critical/10 text-critical">
                <AlertTriangle className="size-5" />
              </div>
              <h3 className="font-display text-base text-foreground">Preview unavailable</h3>
              <p className="text-sm leading-6 text-foreground-soft">
                {props.previewError ?? 'The current draft could not be rendered. Editing still works, and you can retry preview after the next change.'}
              </p>
            </div>
          </div>
        ) : props.preview ? (
          <iframe
            className="h-full w-full rounded-(--radius-field) border border-(--surface-panel-border) bg-white"
            ref={frameRef}
            sandbox="allow-same-origin"
            srcDoc={props.preview.html}
            title="Live resume preview"
          />
        ) : (
          <div className="grid h-full place-items-center rounded-(--radius-field) border border-dashed border-(--surface-panel-border) bg-background/70 p-6 text-center">
            <div className="grid max-w-md gap-3">
              <h3 className="font-display text-base text-foreground">Preview pending</h3>
              <p className="text-sm leading-6 text-foreground-soft">
                The studio is preparing a live preview from your current draft.
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
