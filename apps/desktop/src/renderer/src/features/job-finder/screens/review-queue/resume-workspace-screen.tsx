import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ResumeDraft, ResumeDraftPatch } from "@unemployed/contracts";
import {
  getResumeTemplateDeliveryLane,
  isResumeTemplateApprovalEligible,
} from "@unemployed/contracts";
import { EmptyState } from "../../components/empty-state";
import { LockedScreenLayout } from "../../components/locked-screen-layout";
import { ResumeWorkspaceEditorPanel } from "./resume-workspace-editor-panel";
import { ResumeWorkspaceHeader } from "./resume-workspace-header";
import { ResumeWorkspaceSecondaryRail } from "./resume-workspace-secondary-rail";
import { ResumeWorkspaceSidebar } from "./resume-workspace-sidebar";
import { ResumeGuidedEditsPopup } from "./resume-guided-edits-popup";
import { ResumeStudioPreviewPane } from "./resume-studio-preview-pane";
import { ResumeWorkspaceStudioShell } from "./resume-workspace-studio-shell";
import { ResumeWorkspaceTemplatePanel } from "./resume-workspace-template-panel";
import { cloneDraft } from "./resume-workspace-utils";
import { orderResumeEntriesNewestFirst } from "./resume-section-editor-helpers";
import {
  buildResumeThemeRecommendationContext,
  buildWorkspaceStatusCopy,
  getAvailableExportToApprove,
  getSelectedTheme,
} from "./resume-workspace-screen-helpers";
import { useResumeWorkspaceSelection } from "./use-resume-workspace-selection";
import { useResumeWorkspacePreview } from "./use-resume-workspace-preview";
import type { ResumeWorkspaceScreenProps } from "./resume-workspace-screen.types";

export function ResumeWorkspaceScreen(props: ResumeWorkspaceScreenProps) {
  const [draft, setDraft] = useState<ResumeDraft | null>(
    props.workspace ? cloneDraft(props.workspace.draft) : null,
  );
  const [mobileStudioTab, setMobileStudioTab] = useState<
    "preview" | "editor" | "assistant"
  >("preview");

  const hasAssistantMessages = props.assistantMessages.length > 0;
  const showCompactAssistantRail =
    !props.assistantPending && !hasAssistantMessages;

  const workspaceDraftRevisionKey = props.workspace
    ? `${props.workspace.draft.id}:${props.workspace.draft.updatedAt}`
    : null;

  useEffect(() => {
    if (!props.workspace) {
      setDraft(null);
      return;
    }

    setDraft((currentDraft) => {
      const persistedDraft = props.workspace?.draft;

      if (!persistedDraft) {
        return null;
      }

      if (
        currentDraft &&
        currentDraft.id === persistedDraft.id &&
        currentDraft.updatedAt === persistedDraft.updatedAt
      ) {
        return currentDraft;
      }

      return cloneDraft(persistedDraft);
    });
  }, [workspaceDraftRevisionKey, props.workspace?.draft]);

  const {
    handlePreviewTargetSelect,
    handleSelectEntry,
    handleSelectSection,
    selectionScrollKey,
    selectedEntryId,
    selectedSectionId,
    selectedTargetId,
  } = useResumeWorkspaceSelection({ draft });

  const serializedDraft = useMemo(
    () => (draft ? JSON.stringify(draft) : null),
    [draft],
  );
  const serializedWorkspaceDraft = useMemo(
    () => (props.workspace ? JSON.stringify(props.workspace.draft) : null),
    [props.workspace],
  );
  const hasUnsavedChanges =
    serializedDraft !== null && serializedWorkspaceDraft !== null
      ? serializedDraft !== serializedWorkspaceDraft
      : false;
  const lastDirtyValueRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (lastDirtyValueRef.current === hasUnsavedChanges) {
      return;
    }

    lastDirtyValueRef.current = hasUnsavedChanges;
    props.onDirtyChange(hasUnsavedChanges);
  }, [hasUnsavedChanges, props.onDirtyChange]);

  const availableExportToApprove = getAvailableExportToApprove({
    draft,
    hasUnsavedChanges,
    workspace: props.workspace,
  });

  const runWithSavedDraft = useCallback(
    (next: () => void, successMessage?: string | null) => {
      if (hasUnsavedChanges) {
        const currentDraft = draft;
        if (!currentDraft) {
          return;
        }
        props.onSaveDraftAndThen(
          cloneDraft(currentDraft),
          next,
          successMessage ?? "Changes saved.",
        );
        return;
      }

      next();
    },
    [draft, hasUnsavedChanges, props.onSaveDraftAndThen],
  );

  const runWithSavedDraftAsync = useCallback(
    (next: () => Promise<void> | void, successMessage?: string | null) => {
      runWithSavedDraft(() => {
        void next();
      }, successMessage);
    },
    [runWithSavedDraft],
  );

  const withDraftPatch = useCallback(
    (patch: ResumeDraftPatch): ResumeDraftPatch => {
      return {
        ...patch,
        draftId: draft?.id ?? patch.draftId,
      };
    },
    [draft],
  );

  const handleApplyPatch = useCallback(
    (patch: ResumeDraftPatch, revisionReason?: string | null) => {
      const scopedPatch = withDraftPatch(patch);
      props.onApplyPatch(scopedPatch, revisionReason);

      if (scopedPatch.origin === "assistant") {
        return;
      }

      if (
        scopedPatch.operation !== "move_entry" &&
        scopedPatch.operation !== "reset_entry_order"
      ) {
        return;
      }

      setDraft((currentDraft) => {
        if (!currentDraft || currentDraft.id !== scopedPatch.draftId) {
          return currentDraft;
        }

        return {
          ...currentDraft,
          sections: currentDraft.sections.map((section) => {
            if (section.id !== scopedPatch.targetSectionId) {
              return section;
            }

            if (scopedPatch.operation === "reset_entry_order") {
              return {
                ...section,
                entryOrderMode: "chronology",
                entries: orderResumeEntriesNewestFirst(section.entries),
              };
            }

            if (!scopedPatch.targetEntryId || !scopedPatch.anchorEntryId) {
              return section;
            }

            const withoutTarget = section.entries.filter(
              (entry) => entry.id !== scopedPatch.targetEntryId,
            );
            const movedEntry = section.entries.find(
              (entry) => entry.id === scopedPatch.targetEntryId,
            );
            const anchorIndex = withoutTarget.findIndex(
              (entry) => entry.id === scopedPatch.anchorEntryId,
            );

            if (!movedEntry || anchorIndex === -1) {
              return section;
            }

            const insertionIndex =
              scopedPatch.position === "after" ? anchorIndex + 1 : anchorIndex;
            const entries = [...withoutTarget];
            entries.splice(insertionIndex, 0, movedEntry);

            return {
              ...section,
              entryOrderMode: "manual",
              entries: entries.map((entry, index) => ({
                ...entry,
                sortOrder: index,
              })),
            };
          }),
        };
      });
    },
    [props.onApplyPatch, withDraftPatch],
  );

  const { preview, previewError, previewStatus, refreshPreview } =
    useResumeWorkspacePreview({
      draft,
      hasUnsavedChanges,
      onPreviewDraft: props.onPreviewDraft,
    });

  const handlePreviewSelection = useCallback(
    (selection: {
      sectionId: string | null;
      entryId: string | null;
      targetId: string | null;
    }) => {
      handlePreviewTargetSelect(selection);
      setMobileStudioTab("editor");
    },
    [handlePreviewTargetSelect],
  );

  if (!props.workspace || !draft) {
    return (
      <main className="grid min-h-full place-items-center px-6 py-10">
        <EmptyState
          title="Resume editor unavailable"
          description="We couldn't load this resume. Go back to Shortlisted and try another job."
        />
      </main>
    );
  }

  const job = props.workspace.job;
  const recommendationContext = buildResumeThemeRecommendationContext({
    draft,
    workspace: props.workspace,
  });

  const editorPanel = (
    <ResumeWorkspaceEditorPanel
      actionMessage={props.actionMessage}
      draft={draft}
      hasUnsavedChanges={hasUnsavedChanges}
      isWorkspacePending={props.isWorkspacePending}
      jobId={props.jobId}
      onDraftChange={(nextDraft) => setDraft(nextDraft)}
      onRegenerateSection={props.onRegenerateSection}
      onSectionChange={(nextSection) =>
        setDraft((currentDraft) =>
          currentDraft
            ? {
                ...currentDraft,
                sections: currentDraft.sections.map((entry) =>
                  entry.id === nextSection.id ? nextSection : entry,
                ),
              }
            : currentDraft,
        )
      }
      onSelectEntry={handleSelectEntry}
      onSelectSection={handleSelectSection}
      runWithSavedDraft={runWithSavedDraft}
      selectionScrollKey={selectionScrollKey}
      selectedEntryId={selectedEntryId}
      selectedSectionId={selectedSectionId}
      selectedTargetId={selectedTargetId}
      onApplyPatch={handleApplyPatch}
      withDraftPatch={(patch) => patch}
      workHistoryReviewSuggestions={
        props.workspace.workHistoryReviewSuggestions
      }
    />
  );

  const assistantRail = (
    <ResumeWorkspaceSecondaryRail
      assistantMessages={props.assistantMessages}
      assistantPending={props.assistantPending}
      compactWhenIdle={showCompactAssistantRail}
      isWorkspacePending={props.isWorkspacePending}
      onSendAssistantMessage={(content) =>
        runWithSavedDraftAsync(
          () => props.onSendAssistantMessage(props.jobId, content),
          "Saved your draft before sending this request.",
        )
      }
    />
  );

  const selectedTheme = getSelectedTheme(
    props.availableResumeTemplates,
    draft.templateId,
  );
  const selectedTemplateApprovalEligible = selectedTheme
    ? isResumeTemplateApprovalEligible(selectedTheme)
    : false;
  const selectedTemplateLane = selectedTheme
    ? getResumeTemplateDeliveryLane(selectedTheme)
    : "apply_safe";
  const fallbackThemeLabel = draft.templateId || "Archived template";

  const previewPane = (
    <ResumeStudioPreviewPane
      isDirty={hasUnsavedChanges}
      isPending={props.isWorkspacePending}
      onRetry={() => refreshPreview(draft)}
      onSelectTarget={handlePreviewSelection}
      preview={preview}
      previewError={previewError}
      previewStatus={previewStatus}
      selectedEntryId={selectedEntryId}
      selectedSectionId={selectedSectionId}
      selectedTargetId={selectedTargetId}
      templateLabel={selectedTheme?.label ?? fallbackThemeLabel}
    />
  );

  const templatePanel = (
    <ResumeWorkspaceTemplatePanel
      disabled={props.isWorkspacePending}
      recommendationContext={recommendationContext}
      selectedTemplateApprovalEligible={selectedTemplateApprovalEligible}
      selectedThemeId={draft.templateId}
      themes={props.availableResumeTemplates}
      onChange={(templateId) =>
        setDraft((currentDraft) =>
          currentDraft
            ? {
                ...currentDraft,
                templateId,
              }
            : currentDraft,
        )
      }
    />
  );
  const { approvalStateLabel, studioStatusMessage } = buildWorkspaceStatusCopy({
    availableExportToApprove,
    draft,
    hasUnsavedChanges,
    selectedTemplateApprovalEligible,
    selectedTemplateLane,
  });

  return (
    <LockedScreenLayout
      contentClassName="xl:overflow-hidden"
      topClassName="grid gap-2.5 pb-1.5 pt-2"
      topContent={
        <>
          <ResumeWorkspaceHeader
            draft={draft}
            hasUnsavedChanges={hasUnsavedChanges}
            jobCompany={job.company}
            jobLocation={job.location}
            jobTitle={job.title}
            onBack={props.onBack}
            onRefresh={() =>
              runWithSavedDraftAsync(
                () => props.onRefresh(),
                "Saved your changes before reloading the latest version.",
              )
            }
            selectedThemeLabel={selectedTheme?.label ?? fallbackThemeLabel}
          />
          <ResumeWorkspaceSidebar
            draft={draft}
            hasUnsavedChanges={hasUnsavedChanges}
            workspace={props.workspace}
          />
        </>
      }
    >
      <section className="grid min-h-124 min-w-0 items-stretch xl:h-full xl:min-h-0">
        <ResumeWorkspaceStudioShell
          approvalStateLabel={approvalStateLabel}
          assistantRail={assistantRail}
          canApproveCurrentPdf={Boolean(
            availableExportToApprove && selectedTemplateApprovalEligible,
          )}
          canClearApproval={Boolean(draft.approvedExportId)}
          editorPanel={editorPanel}
          hasUnsavedChanges={hasUnsavedChanges}
          isWorkspacePending={props.isWorkspacePending}
          mobileStudioTab={mobileStudioTab}
          onApproveCurrentPdf={() => {
            if (!availableExportToApprove) {
              return;
            }

            runWithSavedDraft(
              () =>
                props.onApproveResume(props.jobId, availableExportToApprove.id),
              "Saved your draft before approving the PDF.",
            );
          }}
          onClearApproval={() =>
            runWithSavedDraftAsync(
              () => props.onClearResumeApproval(props.jobId),
              "Saved your draft before clearing approval.",
            )
          }
          onExportPdf={() =>
            runWithSavedDraft(
              () => props.onExportPdf(props.jobId),
              "Saved your draft before exporting the PDF.",
            )
          }
          onRegenerateDraft={() =>
            runWithSavedDraft(
              () => props.onRegenerateDraft(props.jobId),
              "Saved your draft before refreshing the resume.",
            )
          }
          onSaveDraft={() => props.onSaveDraft(draft)}
          onSetMobileStudioTab={setMobileStudioTab}
          previewPane={previewPane}
          selectedTemplateApprovalEligible={selectedTemplateApprovalEligible}
          studioStatusMessage={studioStatusMessage}
          templatePanel={templatePanel}
        />
      </section>
      <ResumeGuidedEditsPopup
        assistantMessages={props.assistantMessages}
        assistantPending={props.assistantPending}
        isWorkspacePending={props.isWorkspacePending}
        onSendAssistantMessage={(content) =>
          runWithSavedDraftAsync(
            () => props.onSendAssistantMessage(props.jobId, content),
            "Saved your draft before sending this request.",
          )
        }
      />
    </LockedScreenLayout>
  );
}
