import { useEffect, useMemo, useState } from 'react'
import type { ResumeDraft, ResumeDraftRevision } from '@unemployed/contracts'
import { History, RotateCcw } from 'lucide-react'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { formatStatusLabel } from '@renderer/features/job-finder/lib/job-finder-utils'

const REVISION_PAGE_SIZE = 5
const MAX_VISIBLE_DIFF_PARTS = 3

const actorLabels = {
  assistant: 'Assistant',
  restore: 'Restore',
  system: 'System',
  user: 'You',
} satisfies Record<ResumeDraftRevision['actor'], string>

const mutationLabels = {
  assistant_patch: 'Assistant edit',
  manual_patch: 'Structured edit',
  manual_save: 'Saved draft',
  regenerate_draft: 'Full refresh',
  regenerate_section: 'Section refresh',
  restore: 'Restored version',
} satisfies Record<ResumeDraftRevision['mutationKind'], string>

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function formatDiffSummary(revision: ResumeDraftRevision): string {
  if (!revision.diff) {
    return 'Detailed change summary unavailable.'
  }

  const parts = [
    ...(revision.diff.templateChanged ? ['Template changed'] : []),
    ...(revision.diff.identityChanged ? ['Identity changed'] : []),
    ...(revision.diff.sectionOrderChanged ? ['Section order changed'] : []),
    ...(revision.diff.addedSectionIds.length > 0
      ? [
          `${revision.diff.addedSectionIds.length} section${
            revision.diff.addedSectionIds.length === 1 ? '' : 's'
          } added`,
        ]
      : []),
    ...(revision.diff.removedSectionIds.length > 0
      ? [
          `${revision.diff.removedSectionIds.length} section${
            revision.diff.removedSectionIds.length === 1 ? '' : 's'
          } removed`,
        ]
      : []),
    ...(revision.diff.changedSectionIds.length > 0
      ? [
          `${revision.diff.changedSectionIds.length} section${
            revision.diff.changedSectionIds.length === 1 ? '' : 's'
          } changed`,
        ]
      : []),
  ]

  if (parts.length === 0) {
    return 'No visible content changes recorded.'
  }

  const visibleParts = parts.slice(0, MAX_VISIBLE_DIFF_PARTS)
  const hiddenPartCount = parts.length - visibleParts.length
  return [
    ...visibleParts,
    ...(hiddenPartCount > 0
      ? [`+${hiddenPartCount} more change${hiddenPartCount === 1 ? '' : 's'}`]
      : []),
  ].join(' · ')
}

export function ResumeVersionHistoryPanel(props: {
  currentDraft: ResumeDraft
  isPending: boolean
  onRestore: (revisionId: string) => void
  revisions: readonly ResumeDraftRevision[]
}) {
  const [pageIndex, setPageIndex] = useState(0)
  const revisionSetKey = props.revisions.map((revision) => revision.id).join('\u0000')
  const sortedRevisions = useMemo(
    () =>
      [...props.revisions].sort(
        (left, right) =>
          right.createdAt.localeCompare(left.createdAt) ||
          right.id.localeCompare(left.id),
      ),
    [props.revisions],
  )
  const pageCount = Math.max(1, Math.ceil(sortedRevisions.length / REVISION_PAGE_SIZE))
  const safePageIndex = Math.min(pageIndex, pageCount - 1)
  const rangeStart = safePageIndex * REVISION_PAGE_SIZE
  const visibleRevisions = sortedRevisions.slice(
    rangeStart,
    rangeStart + REVISION_PAGE_SIZE,
  )

  useEffect(() => {
    setPageIndex(0)
  }, [revisionSetKey])

  return (
    <section className="surface-panel-shell relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border)">
      <header className="border-b border-(--surface-panel-border) px-3 py-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="grid gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-display text-(length:--text-label) font-bold uppercase tracking-(--tracking-caps) text-primary">
                Version history
              </p>
              <Badge variant="section">{sortedRevisions.length} saved</Badge>
            </div>
            <h2 className="font-display text-(length:--text-description) font-semibold text-(--text-headline)">
              Return to an earlier saved draft.
            </h2>
          </div>
          <div className="grid justify-items-end gap-1 text-right">
            <Badge variant="outline">Current draft</Badge>
            <span className="text-(length:--text-small) text-foreground-muted">
              {formatStatusLabel(props.currentDraft.status)} ·{' '}
              {props.currentDraft.sections.length} section
              {props.currentDraft.sections.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>
      </header>

      <div className="grid gap-2 p-2.5">
        {visibleRevisions.length > 0 ? (
          visibleRevisions.map((revision) => {
            const canRestore = revision.snapshotDraft !== null

            return (
              <article
                className="grid gap-2 rounded-(--radius-field) border border-(--field-border) bg-(--field) p-3"
                data-resume-revision-row
                key={revision.id}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="grid min-w-0 gap-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="section">{actorLabels[revision.actor]}</Badge>
                      <Badge variant="outline">
                        {mutationLabels[revision.mutationKind]}
                      </Badge>
                      {!canRestore ? <Badge variant="outline">Legacy snapshot</Badge> : null}
                    </div>
                    <h3 className="text-sm font-semibold text-(--text-headline)">
                      {revision.reason?.trim() || mutationLabels[revision.mutationKind]}
                    </h3>
                    <time
                      className="text-(length:--text-small) text-foreground-muted"
                      dateTime={revision.createdAt}
                    >
                      {formatTimestamp(revision.createdAt)}
                    </time>
                  </div>

                  {canRestore ? (
                    <Button
                      aria-label={`Restore version saved ${formatTimestamp(revision.createdAt)}`}
                      disabled={props.isPending}
                      onClick={() => props.onRestore(revision.id)}
                      size="compact"
                      type="button"
                      variant="secondary"
                    >
                      <RotateCcw className="size-3.5" />
                      Restore
                    </Button>
                  ) : null}
                </div>

                <p className="text-(length:--text-small) leading-5 text-foreground-soft">
                  {formatDiffSummary(revision)}
                </p>
                {!canRestore ? (
                  <p className="text-(length:--text-small) leading-5 text-foreground-muted">
                    This older record predates full draft snapshots and cannot be restored.
                  </p>
                ) : null}
              </article>
            )
          })
        ) : (
          <div className="grid place-items-center gap-2 rounded-(--radius-field) border border-dashed border-(--surface-panel-border) bg-background/60 px-4 py-7 text-center">
            <History className="size-5 text-foreground-muted" />
            <p className="text-sm font-medium text-(--text-headline)">
              No earlier versions yet
            </p>
            <p className="max-w-sm text-(length:--text-small) leading-5 text-foreground-muted">
              Saved manual and assistant changes will appear here.
            </p>
          </div>
        )}
      </div>

      {sortedRevisions.length > REVISION_PAGE_SIZE ? (
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-(--surface-panel-border) px-2.5 py-2">
          <span aria-live="polite" className="text-(length:--text-small) text-foreground-muted">
            {rangeStart + 1}–{Math.min(rangeStart + REVISION_PAGE_SIZE, sortedRevisions.length)} of{' '}
            {sortedRevisions.length}
          </span>
          <div className="flex gap-2">
            <Button
              disabled={props.isPending || safePageIndex === 0}
              onClick={() => setPageIndex((current) => Math.max(0, current - 1))}
              size="compact"
              type="button"
              variant="ghost"
            >
              Newer changes
            </Button>
            <Button
              disabled={props.isPending || safePageIndex >= pageCount - 1}
              onClick={() =>
                setPageIndex((current) => Math.min(pageCount - 1, current + 1))
              }
              size="compact"
              type="button"
              variant="ghost"
            >
              Older changes
            </Button>
          </div>
        </footer>
      ) : null}
    </section>
  )
}
