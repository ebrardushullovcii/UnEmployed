import { FileOutput, RefreshCcw } from 'lucide-react'
import type { ResumeDraft, ResumeDraftPatch } from '@unemployed/contracts'
import { Button } from '@renderer/components/ui/button'
import { ResumeSectionEditor } from './resume-section-editor'

type ResumeDraftSection = ResumeDraft['sections'][number]

interface ResumeWorkspaceEditorPanelProps {
  actionMessage: string | null
  approvedExportId: string | null
  availableExportIdToApprove: string | null
  busy: boolean
  draft: ResumeDraft
  jobId: string
  onApplyPatch: (patch: ResumeDraftPatch, revisionReason?: string | null) => void
  onApproveResume: (jobId: string, exportId: string) => void
  onClearResumeApproval: (jobId: string) => void
  onExportPdf: (jobId: string) => void
  onRegenerateDraft: (jobId: string) => void
  onRegenerateSection: (jobId: string, sectionId: string) => void
  onSaveDraft: (draft: ResumeDraft) => void
  onSectionChange: (section: ResumeDraftSection) => void
  runWithSavedDraft: (next: () => void, successMessage?: string | null) => void
  runWithSavedDraftAsync: (next: () => Promise<void> | void, successMessage?: string | null) => void
  withDraftPatch: (patch: ResumeDraftPatch) => ResumeDraftPatch
}

export function ResumeWorkspaceEditorPanel(props: ResumeWorkspaceEditorPanelProps) {
  return (
    <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel) xl:h-full">
      <div className="flex min-w-0 flex-wrap items-center gap-2 border-b border-(--surface-panel-border) p-4">
        <Button
          disabled={props.busy}
          onClick={() =>
            props.runWithSavedDraft(
              () => props.onRegenerateDraft(props.jobId),
              'Resume draft saved before regenerate.',
            )
          }
          type="button"
          variant="secondary"
        >
          <RefreshCcw className="size-4" />
          Regenerate Draft
        </Button>
        <Button
          disabled={props.busy}
          onClick={() => props.onSaveDraft(props.draft)}
          type="button"
          variant="primary"
        >
          Save Draft
        </Button>
        <Button
          disabled={props.busy}
          onClick={() =>
            props.runWithSavedDraft(
              () => props.onExportPdf(props.jobId),
              'Resume draft saved before export.',
            )
          }
          type="button"
          variant="secondary"
        >
          <FileOutput className="size-4" />
          Export PDF
        </Button>
        {props.approvedExportId ? (
          <Button
            disabled={props.busy}
            onClick={() =>
              props.runWithSavedDraftAsync(
                () => props.onClearResumeApproval(props.jobId),
                'Resume draft saved before clearing approval.',
              )
            }
            type="button"
            variant="destructive"
          >
            Clear Approval
          </Button>
        ) : null}
        {!props.approvedExportId && props.availableExportIdToApprove ? (
          <Button
            disabled={props.busy}
            onClick={() =>
              props.runWithSavedDraft(
                () =>
                  props.onApproveResume(
                    props.jobId,
                    props.availableExportIdToApprove as string,
                  ),
                'Resume draft saved before approval.',
              )
            }
            type="button"
            variant="primary"
          >
            Approve Resume
          </Button>
        ) : null}
      </div>

      <div className="grid min-h-0 min-w-0 flex-1 content-start gap-4 overflow-x-hidden overflow-y-auto p-4 pr-3">
        {props.draft.sections.map((section) => (
          <ResumeSectionEditor
            key={section.id}
            disabled={props.busy}
            section={section}
            onChange={props.onSectionChange}
            onPatch={(patch, revisionReason) =>
              props.runWithSavedDraft(
                () =>
                  props.onApplyPatch(
                    props.withDraftPatch(patch),
                    revisionReason,
                  ),
                'Resume draft saved before applying the change.',
              )
            }
            onRegenerate={() =>
              props.runWithSavedDraft(
                () => props.onRegenerateSection(props.jobId, section.id),
                'Resume draft saved before section regenerate.',
              )
            }
          />
        ))}
      </div>

      <div className="border-t border-(--surface-panel-border) px-4 py-3">
        {props.actionMessage ? (
          <p className="font-mono text-[10px] uppercase tracking-(--tracking-normal) text-primary">
            {props.actionMessage}
          </p>
        ) : <div className="h-[14px]" />}
      </div>
    </section>
  )
}
