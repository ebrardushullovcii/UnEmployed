import type {
  ResumeCoverageClaimChange,
  ResumeCoverageComparison,
  ResumeCoverageRoleComparison,
  ResumeDraft,
  ResumeDraftPatch,
  WorkHistoryReviewSuggestion,
} from "@unemployed/contracts";
import { ResumeCoverageComparisonPanel } from "./resume-coverage-comparison-panel";
import { ResumeIdentityEditor } from "./resume-identity-editor";
import { ResumeSectionEditor } from "./resume-section-editor";
import { ResumeWorkHistoryDecisions } from "./resume-workspace-work-history-decisions";
import { createResumeDraftPatch } from "./resume-section-editor-helpers";
import {
  isGeneratedResumeOrigin,
  listGeneratedResumeBullets,
} from "./resume-workspace-utils";

type ResumeDraftSection = ResumeDraft["sections"][number];
type DraftAcknowledgments = ResumeDraft["workHistoryReviewAcknowledgments"];

interface ResumeWorkspaceEditorPanelProps {
  actionMessage: string | null;
  coverageComparison: ResumeCoverageComparison | null;
  draft: ResumeDraft;
  hasUnsavedChanges: boolean;
  isWorkspacePending: boolean;
  jobId: string;
  onAcknowledgeWorkHistoryOmission: (
    suggestion: WorkHistoryReviewSuggestion,
  ) => void;
  onApplyPatch: (
    patch: ResumeDraftPatch,
    revisionReason?: string | null,
  ) => void;
  onDraftChange: (draft: ResumeDraft) => void;
  onRegenerateSection: (jobId: string, sectionId: string) => void;
  onRemoveWorkHistoryOmissionAcknowledgment: (acknowledgmentId: string) => void;
  onSectionChange: (section: ResumeDraftSection) => void;
  onSelectEntry: (sectionId: string, entryId: string) => void;
  onSelectSection: (sectionId: string) => void;
  runWithSavedDraft: (
    next: () => void | Promise<void>,
    successMessage?: string | null,
  ) => void;
  selectionScrollKey?: number;
  selectedEntryId: string | null;
  selectedSectionId: string | null;
  selectedTargetId: string | null;
  showGeneratedLineMarkers?: boolean;
  workHistoryAcknowledgments: DraftAcknowledgments;
  workHistoryReviewSuggestions: readonly WorkHistoryReviewSuggestion[];
}

export function ResumeWorkspaceEditorPanel(
  props: ResumeWorkspaceEditorPanelProps,
) {
  const helperMessage = props.hasUnsavedChanges
    ? "Live preview already shows these unsaved edits. Save before export or approval."
    : "Click the live page to jump to the matching structured field.";
  const generatedBulletCount = props.showGeneratedLineMarkers
    ? listGeneratedResumeBullets(props.draft).filter((bullet) =>
        isGeneratedResumeOrigin(bullet.origin),
      ).length
    : 0;

  const restoreClaim = (
    role: ResumeCoverageRoleComparison,
    claim: ResumeCoverageClaimChange,
  ) => {
    if (!role.sectionId || !role.entryId) {
      return;
    }
    const sectionId = role.sectionId;
    const entryId = role.entryId;

    props.runWithSavedDraft(
      () =>
        props.onApplyPatch(
          createResumeDraftPatch({
            entryId,
            idPrefix: `restore_${claim.field}`,
            newText: claim.text,
            operation:
              claim.field === "summary"
                ? "replace_entry_summary"
                : "insert_bullet",
            sectionId,
          }),
          `Restored original ${claim.field} for ${role.title}.`,
        ),
      "Saved your draft before restoring the original content.",
    );
  };

  const restoreRole = (role: ResumeCoverageRoleComparison) => {
    if (!role.sectionId || !role.entryId) {
      return;
    }
    const sectionId = role.sectionId;
    const entryId = role.entryId;
    props.runWithSavedDraft(
      () =>
        props.onApplyPatch(
          createResumeDraftPatch({
            entryId,
            idPrefix: "restore_role",
            newIncluded: true,
            operation: "toggle_include",
            sectionId,
          }),
          `Restored ${role.title} to the resume.`,
        ),
      "Saved your draft before restoring the role.",
    );
  };

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
          {props.draft.generationMethod === "ai" ? (
            <div
              className="rounded-(--radius-field) border border-(--surface-panel-border) bg-background/45 px-3 py-2 text-(length:--text-small) leading-5 text-foreground-soft"
              data-resume-ai-assistance-disclosure
              role="note"
            >
              This draft was created with AI assistance. Review the full draft
              against your experience and saved evidence before approval.
            </div>
          ) : null}
          {props.showGeneratedLineMarkers && generatedBulletCount > 0 ? (
            <div
              className="rounded-(--radius-field) border border-(--warning-border) bg-(--warning-surface) px-3 py-2 text-(length:--text-small) leading-5 text-(--warning-text)"
              data-resume-inference-disclosure
              role="note"
            >
              Aggressive tailoring generated {generatedBulletCount} bullet{" "}
              {generatedBulletCount === 1 ? "line" : "lines"} in this draft
              instead of reusing your resume wording. Marked lines below need a
              check against your saved evidence before approval.
            </div>
          ) : null}
        </div>
        <ResumeCoverageComparisonPanel
          comparison={props.coverageComparison}
          disabled={props.isWorkspacePending}
          onRestoreClaim={restoreClaim}
          onRestoreRole={restoreRole}
        />
        <ResumeWorkHistoryDecisions
          acknowledgments={props.workHistoryAcknowledgments}
          disabled={props.isWorkspacePending}
          draftId={props.draft.id}
          suggestions={props.workHistoryReviewSuggestions}
          onAcknowledge={props.onAcknowledgeWorkHistoryOmission}
          onRemoveAcknowledgment={
            props.onRemoveWorkHistoryOmissionAcknowledgment
          }
        />
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
            showGeneratedMarkers={Boolean(props.showGeneratedLineMarkers)}
            onChange={props.onSectionChange}
            onPatch={(patch, revisionReason) =>
              props.runWithSavedDraft(
                () => props.onApplyPatch(patch, revisionReason),
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
