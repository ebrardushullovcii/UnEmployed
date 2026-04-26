import { FileOutput, RefreshCcw } from 'lucide-react'
import type { ResumeDraft, ResumeDraftPatch, ResumeTemplateDefinition } from '@unemployed/contracts'
import { Button } from '@renderer/components/ui/button'
import { ResumeThemePicker } from '../../components/resume-theme-picker'
import { ResumeSectionEditor } from './resume-section-editor'

type ResumeDraftSection = ResumeDraft['sections'][number]

interface ResumeWorkspaceEditorPanelProps {
  actionMessage: string | null
  approvedExportId: string | null
  availableExportIdToApprove: string | null
  availableResumeTemplates: readonly ResumeTemplateDefinition[]
  draft: ResumeDraft
  hasUnsavedChanges: boolean
  isWorkspacePending: boolean
  jobId: string
  onApplyPatch: (patch: ResumeDraftPatch, revisionReason?: string | null) => void
  onApproveResume: (jobId: string, exportId: string) => void
  onClearResumeApproval: (jobId: string) => void
  onExportPdf: (jobId: string) => void
  onRegenerateDraft: (jobId: string) => void
  onRegenerateSection: (jobId: string, sectionId: string) => void
  onSaveDraft: (draft: ResumeDraft) => void
  onSectionChange: (section: ResumeDraftSection) => void
  onThemeChange: (templateId: ResumeDraft['templateId']) => void
  runWithSavedDraft: (next: () => void, successMessage?: string | null) => void
  runWithSavedDraftAsync: (next: () => Promise<void> | void, successMessage?: string | null) => void
  withDraftPatch: (patch: ResumeDraftPatch) => ResumeDraftPatch
}

export function ResumeWorkspaceEditorPanel(props: ResumeWorkspaceEditorPanelProps) {
  const exportIdToApprove = props.availableExportIdToApprove
  const helperMessage = props.hasUnsavedChanges
    ? 'Unsaved edits will be saved before you export, approve, reload, or send a request to the assistant.'
    : props.approvedExportId
      ? 'This draft already has an approved PDF. Clear approval if you want a fresh version used for applications.'
      : exportIdToApprove
        ? 'The latest PDF matches this draft and is ready to approve.'
        : 'Save your draft, then export a PDF to review it before applying.'

  return (
    <section className="surface-panel-shell relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border) xl:h-full">
      <div className="flex min-w-0 flex-wrap items-center gap-2 border-b border-(--surface-panel-border) p-4">
        <Button
          pending={props.isWorkspacePending}
          onClick={() => props.onSaveDraft(props.draft)}
          type="button"
          variant="primary"
        >
          Save draft
        </Button>
        <Button
          pending={props.isWorkspacePending}
          onClick={() =>
            props.runWithSavedDraft(
              () => props.onRegenerateDraft(props.jobId),
              'Saved your draft before refreshing the resume.',
            )
          }
          type="button"
          variant="secondary"
        >
          <RefreshCcw className="size-4" />
          Refresh draft
        </Button>
        <Button
          pending={props.isWorkspacePending}
          onClick={() =>
            props.runWithSavedDraft(
              () => props.onExportPdf(props.jobId),
              'Saved your draft before exporting the PDF.',
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
            pending={props.isWorkspacePending}
            onClick={() =>
              props.runWithSavedDraftAsync(
                () => props.onClearResumeApproval(props.jobId),
                'Saved your draft before clearing approval.',
              )
            }
            type="button"
            variant="destructive"
          >
            Clear approval
          </Button>
        ) : null}
        {!props.approvedExportId && exportIdToApprove ? (
          <Button
            pending={props.isWorkspacePending}
            onClick={() =>
              props.runWithSavedDraft(
                () => props.onApproveResume(props.jobId, exportIdToApprove),
                'Saved your draft before approving the PDF.',
              )
            }
            type="button"
            variant="primary"
          >
            Approve current PDF
          </Button>
        ) : null}
      </div>

      <div className="grid min-h-0 min-w-0 flex-1 content-start gap-4 overflow-x-hidden overflow-y-auto p-4 pr-3">
        <div className="grid gap-4 border-b border-(--surface-panel-border) pb-4">
          <p className="text-(length:--text-small) leading-6 text-foreground-soft">{helperMessage}</p>
          <div className="grid gap-2">
            <div className="grid gap-1">
              <p className="label-mono-xs">Resume theme</p>
              <p className="text-(length:--text-description) leading-6 text-foreground-soft">
                This theme belongs to this draft. Changing it creates a new review state and the next export plus approval will use that exact theme.
              </p>
            </div>
            <ResumeThemePicker
              disabled={props.isWorkspacePending}
              onChange={props.onThemeChange}
              selectedThemeId={props.draft.templateId}
              themes={props.availableResumeTemplates}
            />
          </div>
        </div>
        {props.draft.sections.map((section) => (
          <ResumeSectionEditor
            key={section.id}
            disabled={props.isWorkspacePending}
            section={section}
            onChange={props.onSectionChange}
            onPatch={(patch, revisionReason) =>
              props.runWithSavedDraft(
                () =>
                  props.onApplyPatch(
                    props.withDraftPatch(patch),
                    revisionReason,
                  ),
                'Saved your draft before applying this update.',
              )
            }
            onRegenerate={() =>
              props.runWithSavedDraft(
                () => props.onRegenerateSection(props.jobId, section.id),
                'Saved your draft before refreshing this section.',
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
