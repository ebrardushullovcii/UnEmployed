import type {
  ResumeDraft,
  ResumeDraftPatch,
  WorkHistoryReviewSuggestion,
} from "@unemployed/contracts";
import { ResumeIdentityEditor } from "./resume-identity-editor";
import { ResumeSectionEditor } from "./resume-section-editor";

type ResumeDraftSection = ResumeDraft["sections"][number];

interface ResumeWorkspaceEditorPanelProps {
  actionMessage: string | null;
  draft: ResumeDraft;
  hasUnsavedChanges: boolean;
  isWorkspacePending: boolean;
  jobId: string;
  onApplyPatch: (
    patch: ResumeDraftPatch,
    revisionReason?: string | null,
  ) => void;
  onDraftChange: (draft: ResumeDraft) => void;
  onRegenerateSection: (jobId: string, sectionId: string) => void;
  onSectionChange: (section: ResumeDraftSection) => void;
  onSelectEntry: (sectionId: string, entryId: string) => void;
  onSelectSection: (sectionId: string) => void;
  runWithSavedDraft: (next: () => void, successMessage?: string | null) => void;
  selectionScrollKey?: number;
  selectedEntryId: string | null;
  selectedSectionId: string | null;
  selectedTargetId: string | null;
  withDraftPatch: (patch: ResumeDraftPatch) => ResumeDraftPatch;
  workHistoryReviewSuggestions: readonly WorkHistoryReviewSuggestion[];
}

export function ResumeWorkspaceEditorPanel(
  props: ResumeWorkspaceEditorPanelProps,
) {
  const helperMessage = props.hasUnsavedChanges
    ? "Live preview already shows these unsaved edits. Save before export or approval."
    : "Click the live page to jump to the matching structured field.";

  return (
    <section className="surface-panel-shell relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border) xl:overflow-visible">
      <div
        className="grid min-h-0 min-w-0 flex-1 content-start gap-2.5 overflow-x-hidden overflow-y-auto p-2.5 pr-2 xl:overflow-visible"
        data-resume-editor-scroll-region
      >
        <div className="grid gap-1 border-b border-(--surface-panel-border) pb-2">
          <div className="grid gap-0.5">
            <h2 className="font-display text-sm font-semibold text-(--text-headline)">
              Structured edits
            </h2>
            <p className="text-(length:--text-description) leading-5 text-foreground-soft xl:hidden">
              Change the schema-safe content behind the preview without leaving
              this draft.
            </p>
          </div>
          <p className="text-(length:--text-small) leading-5 text-foreground-soft xl:hidden">
            {helperMessage}
          </p>
        </div>
        <ResumeIdentityEditor
          disabled={props.isWorkspacePending}
          identity={props.draft.identity}
          selectedTargetId={props.selectedTargetId}
          onChange={(identity) =>
            props.onDraftChange({
              ...props.draft,
              identity,
            })
          }
        />
        {props.draft.sections.map((section) => (
          <ResumeSectionEditor
            key={section.id}
            disabled={props.isWorkspacePending}
            isSelected={props.selectedSectionId === section.id}
            selectedEntryId={
              props.selectedSectionId === section.id
                ? props.selectedEntryId
                : null
            }
            selectedTargetId={
              props.selectedSectionId === section.id
                ? props.selectedTargetId
                : null
            }
            section={section}
            onChange={props.onSectionChange}
            onPatch={(patch, revisionReason) =>
              props.runWithSavedDraft(
                () =>
                  props.onApplyPatch(
                    props.withDraftPatch(patch),
                    revisionReason,
                  ),
                "Saved your draft before applying this update.",
              )
            }
            onSelectEntry={props.onSelectEntry}
            onSelectSection={props.onSelectSection}
            onRegenerate={() =>
              props.runWithSavedDraft(
                () => props.onRegenerateSection(props.jobId, section.id),
                "Saved your draft before refreshing this section.",
              )
            }
            workHistoryReviewSuggestions={props.workHistoryReviewSuggestions.filter(
              (suggestion) => suggestion.sectionId === section.id,
            )}
            {...(props.selectionScrollKey === undefined
              ? {}
              : { selectionScrollKey: props.selectionScrollKey })}
          />
        ))}
      </div>

      <div className="border-t border-(--surface-panel-border) px-2.5 py-1.5">
        {props.actionMessage ? (
          <p className="text-(length:--text-small) leading-5 text-primary">
            {props.actionMessage}
          </p>
        ) : (
          <div className="h-action-message" />
        )}
      </div>
    </section>
  );
}
