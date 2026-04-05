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
  const exportIdToApprove = props.availableExportIdToApprove

  return (
    <section className="surface-panel-shell relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border) xl:h-full">
      <div className="flex min-w-0 flex-wrap items-center gap-2 border-b border-(--surface-panel-border) p-4">
        <Button
          disabled={props.busy}
          onClick={() =>
            props.runWithSavedDraft(
              () => props.onRegenerateDraft(props.jobId),
              'Saved your changes before regenerating the resume.',
            )
          }
          type="button"
          variant="secondary"
        >
          <RefreshCcw className="size-4" />
          Regenerate resume
        </Button>
        <Button
          disabled={props.busy}
          onClick={() => props.onSaveDraft(props.draft)}
          type="button"
          variant="primary"
        >
          Save changes
        </Button>
        <Button
          disabled={props.busy}
          onClick={() =>
            props.runWithSavedDraft(
              () => props.onExportPdf(props.jobId),
              'Saved your changes before exporting the PDF.',
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
                'Saved your changes before clearing the approved PDF.',
              )
            }
            type="button"
            variant="destructive"
          >
            Clear approved PDF
          </Button>
        ) : null}
        {!props.approvedExportId && exportIdToApprove ? (
          <Button
            disabled={props.busy}
            onClick={() =>
              props.runWithSavedDraft(
                () => props.onApproveResume(props.jobId, exportIdToApprove),
                'Saved your changes before approving the PDF.',
              )
            }
            type="button"
            variant="primary"
          >
            Approve PDF
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
                'Saved your changes before applying this update.',
              )
            }
            onRegenerate={() =>
              props.runWithSavedDraft(
                () => props.onRegenerateSection(props.jobId, section.id),
                'Saved your changes before regenerating this section.',
              )
            }
          />
        ))}
      </div>

      <div className="border-t border-(--surface-panel-border) px-4 py-3">
        {props.actionMessage ? (
          <p className="text-(length:--text-small) leading-6 text-primary">
            {props.actionMessage}
          </p>
        ) : <div className="h-action-message" />}
      </div>
    </section>
  )
}
