import type { ResumeDraft, ResumeDraftPatch, ResumeTemplateDefinition } from '@unemployed/contracts'
import {
  ResumeThemePicker,
  type ResumeThemePickerRecommendationContext,
} from '../../components/resume-theme-picker'
import { ResumeSectionEditor } from './resume-section-editor'

type ResumeDraftSection = ResumeDraft['sections'][number]

interface ResumeWorkspaceEditorPanelProps {
  actionMessage: string | null
  availableResumeTemplates: readonly ResumeTemplateDefinition[]
  draft: ResumeDraft
  hasUnsavedChanges: boolean
  isWorkspacePending: boolean
  jobId: string
  onApplyPatch: (patch: ResumeDraftPatch, revisionReason?: string | null) => void
  onRegenerateSection: (jobId: string, sectionId: string) => void
  onSectionChange: (section: ResumeDraftSection) => void
  onThemeChange: (templateId: ResumeDraft['templateId']) => void
  onSelectEntry: (sectionId: string, entryId: string) => void
  onSelectSection: (sectionId: string) => void
  runWithSavedDraft: (next: () => void, successMessage?: string | null) => void
  selectedEntryId: string | null
  selectedSectionId: string | null
  recommendationContext?: ResumeThemePickerRecommendationContext | null
  withDraftPatch: (patch: ResumeDraftPatch) => ResumeDraftPatch
}

export function ResumeWorkspaceEditorPanel(props: ResumeWorkspaceEditorPanelProps) {
  const resumeThemeLabelId = 'resume-theme-label'
  const helperMessage = props.hasUnsavedChanges
    ? 'Unsaved edits are rendered in the live preview now, but save before export or approval.'
    : 'The live preview reuses the export renderer. Click a section in the preview to jump here.'

  return (
    <section className="surface-panel-shell relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border) xl:h-full">
      <div className="grid min-h-0 min-w-0 flex-1 content-start gap-4 overflow-x-hidden overflow-y-auto p-4 pr-3">
        <div className="grid gap-4 border-b border-(--surface-panel-border) pb-4">
          <div className="grid gap-1">
            <h2 className="font-display text-sm font-semibold text-(--text-headline)">
              Structured editing
            </h2>
            <p className="text-(length:--text-description) leading-6 text-foreground-soft">
              Keep the draft schema-safe while the preview shows the exact rendered layout and template.
            </p>
          </div>
          <p className="text-(length:--text-small) leading-6 text-foreground-soft">{helperMessage}</p>
          <div className="grid gap-2">
            <div className="grid gap-1">
              <p className="label-mono-xs" id={resumeThemeLabelId}>Resume template</p>
              <p className="text-(length:--text-description) leading-6 text-foreground-soft">
                This template belongs to this draft. Changing the family or variant creates a new review state, and the next export plus approval will use that exact selection.
              </p>
            </div>
            <ResumeThemePicker
              disabled={props.isWorkspacePending}
              id={resumeThemeLabelId}
              onChange={props.onThemeChange}
              recommendationContext={props.recommendationContext ?? null}
              selectedThemeId={props.draft.templateId}
              themes={props.availableResumeTemplates}
            />
          </div>
        </div>
        {props.draft.sections.map((section) => (
          <ResumeSectionEditor
            key={section.id}
            disabled={props.isWorkspacePending}
            isSelected={props.selectedSectionId === section.id}
            selectedEntryId={props.selectedSectionId === section.id ? props.selectedEntryId : null}
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
            onSelectEntry={props.onSelectEntry}
            onSelectSection={props.onSelectSection}
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
