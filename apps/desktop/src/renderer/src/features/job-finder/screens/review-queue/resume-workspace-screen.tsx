import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ResumeDraft,
  ResumeDraftPatch,
  WorkHistoryReviewSuggestion,
} from "@unemployed/contracts";
import { isBlockingResumeValidationIssue } from "@unemployed/contracts";
import {
  getResumeTemplateDeliveryLane,
  isResumeTemplateApprovalEligible,
} from "@unemployed/contracts";
import { EmptyState } from "../../components/empty-state";
import { LockedScreenLayout } from "../../components/locked-screen-layout";
import { ResumeClaimConfirmationPanel } from "./resume-claim-confirmation-panel";
import { ResumeWorkspaceEditorPanel } from "./resume-workspace-editor-panel";
import { ResumeWorkspaceHeader } from "./resume-workspace-header";
import { ResumeWorkspaceContextDisclosure } from "./resume-workspace-context-disclosure";
import { ResumeStrategyContextPanel } from "./resume-strategy-context-panel";
import { ResumeWorkspaceSecondaryRail } from "./resume-workspace-secondary-rail";
import { ResumeWorkspaceSidebar } from "./resume-workspace-sidebar";
import { ResumeGuidedEditsPopup } from "./resume-guided-edits-popup";
import { ResumeStudioPreviewPane } from "./resume-studio-preview-pane";
import { ResumeWorkspaceStudioShell } from "./resume-workspace-studio-shell";
import { getJobFinderScrollBehavior } from "../../lib/job-finder-scroll-behavior";
import { ResumeWorkspaceTemplatePanel } from "./resume-workspace-template-panel";
import { ResumeVersionHistoryPanel } from "./resume-version-history-panel";
import { cloneDraft } from "./resume-workspace-utils";
import { orderResumeEntriesNewestFirst } from "./resume-section-editor-helpers";
import {
  buildResumeThemeRecommendationContext,
  buildWorkspaceStatusCopy,
  getAvailableExportToApprove,
  getSelectedTheme,
} from "./resume-workspace-screen-helpers";
import {
  listUnresolvedWorkHistoryOmissionSuggestions,
  type ResumeWorkHistoryDecisionRequest,
} from "./resume-workspace-work-history-decisions";
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
  const blockingClaimCount =
    props.workspace?.validation?.claimAssessments.filter(
      (assessment) =>
        assessment.status === "unsupported" ||
        (assessment.status === "review" &&
          (assessment.claimOrigin === "ai_generated" ||
            assessment.claimOrigin === "assistant_edited" ||
            assessment.claimOrigin === "deterministic_fallback")),
    ).length ?? 0;
  const hasBlockingValidationIssues = Boolean(
    props.workspace?.validation?.issues.some(isBlockingResumeValidationIssue),
  );
  const exportBlockedReason =
    !hasUnsavedChanges && blockingClaimCount > 0
      ? `${blockingClaimCount} generated or unsupported claim${blockingClaimCount === 1 ? "" : "s"} must be removed, rewritten, or grounded in candidate evidence before this resume can be exported.`
      : null;
  const unresolvedWorkHistorySuggestions = props.workspace
    ? listUnresolvedWorkHistoryOmissionSuggestions({
        acknowledgments: props.workspace.draft.workHistoryReviewAcknowledgments,
        draftId: props.workspace.draft.id,
        suggestions: props.workspace.workHistoryReviewSuggestions,
      })
    : [];
  const unresolvedWorkHistoryCount = unresolvedWorkHistorySuggestions.length;
  const approvalBlockedReason =
    unresolvedWorkHistoryCount > 0
      ? `${unresolvedWorkHistoryCount} hidden work-history role${unresolvedWorkHistoryCount === 1 ? " is" : "s are"} waiting on an explicit kept-omitted decision. Approval stays disabled until every entry below has one.`
      : null;

  const runWithSavedDraft = useCallback(
    (next: () => void | Promise<void>, successMessage?: string | null) => {
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

      try {
        const result = next();
        void Promise.resolve(result).catch((error: unknown) => {
          console.error("Resume workspace follow-up action failed.", error);
        });
      } catch (error) {
        console.error("Resume workspace follow-up action failed.", error);
      }
    },
    [draft, hasUnsavedChanges, props.onSaveDraftAndThen],
  );

  const runWithSavedDraftAsync = useCallback(
    (next: () => Promise<void> | void, successMessage?: string | null) => {
      runWithSavedDraft(() => next(), successMessage);
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

      if (scopedPatch.origin === "assistant") {
        props.onApplyPatch(scopedPatch, revisionReason);
        return;
      }

      // Any user-directed patch revises the studio draft — content patches
      // land through the saved-workspace refresh, order patches below also
      // mutate the local draft — so retire any exact-request retry captured
      // before this edit. Signalling first lets this patch's own save capture
      // its post-edit epoch and keep a truthful Retry if it fails.
      props.onDraftEdited?.();
      props.onApplyPatch(scopedPatch, revisionReason);

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
    [props.onApplyPatch, props.onDraftEdited, withDraftPatch],
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

  const acknowledgeWorkHistoryOmission = useCallback(
    (suggestion: WorkHistoryReviewSuggestion) => {
      const decision: ResumeWorkHistoryDecisionRequest = {
        intent: "acknowledge",
        suggestion: {
          id: suggestion.id,
          profileRecordId: suggestion.profileRecordId,
          kind: suggestion.kind,
          action: suggestion.action,
          messageContentHash: suggestion.messageContentHash,
        },
      };

      runWithSavedDraftAsync(
        () => props.onSetWorkHistoryReviewAcknowledgment(props.jobId, decision),
        "Saved your draft before recording this decision.",
      );
    },
    [
      props.jobId,
      props.onSetWorkHistoryReviewAcknowledgment,
      runWithSavedDraftAsync,
    ],
  );

  const removeWorkHistoryOmissionAcknowledgment = useCallback(
    (acknowledgmentId: string) => {
      runWithSavedDraftAsync(
        () =>
          props.onSetWorkHistoryReviewAcknowledgment(props.jobId, {
            intent: "remove",
            acknowledgmentId,
          }),
        "Saved your draft before updating this decision.",
      );
    },
    [
      props.jobId,
      props.onSetWorkHistoryReviewAcknowledgment,
      runWithSavedDraftAsync,
    ],
  );

  const resolveAssistantProposal = useCallback(
    (
      proposalId: string,
      action: "accept" | "reject",
      patchIds: readonly string[],
    ) => {
      const resolveProposal = props.onResolveAssistantProposal;

      if (!resolveProposal) {
        return;
      }

      runWithSavedDraftAsync(() => {
        resolveProposal(props.jobId, proposalId, action, patchIds);
      }, "Saved your draft before resolving this proposal.");
    },
    [props.jobId, props.onResolveAssistantProposal, runWithSavedDraftAsync],
  );

  if (!props.workspace || !draft) {
    return (
      <main className="grid min-h-full place-items-center px-6 py-10">
        <EmptyState
          title="Loading Resume Studio"
          description="Loading the saved draft, validation, and version history."
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
      coverageComparison={
        props.workspace.validation?.coverageComparison ?? null
      }
      draft={draft}
      hasUnsavedChanges={hasUnsavedChanges}
      isWorkspacePending={props.isWorkspacePending}
      jobId={props.jobId}
      onDraftChange={(nextDraft) => {
        // Direct user edits to identity fields revise the draft.
        props.onDraftEdited?.();
        setDraft(nextDraft);
      }}
      onRegenerateSection={props.onRegenerateSection}
      onSectionChange={(nextSection) => {
        // Direct user edits to a section revise the draft.
        props.onDraftEdited?.();
        setDraft((currentDraft) =>
          currentDraft
            ? {
                ...currentDraft,
                sections: currentDraft.sections.map((entry) =>
                  entry.id === nextSection.id ? nextSection : entry,
                ),
              }
            : currentDraft,
        );
      }}
      onSelectEntry={handleSelectEntry}
      onSelectSection={handleSelectSection}
      runWithSavedDraft={runWithSavedDraft}
      selectionScrollKey={selectionScrollKey}
      selectedEntryId={selectedEntryId}
      selectedSectionId={selectedSectionId}
      selectedTargetId={selectedTargetId}
      onApplyPatch={handleApplyPatch}
      showGeneratedLineMarkers={
        props.workspace.strategyContext?.tailoringStrength === "aggressive" &&
        draft.generationMethod === "ai"
      }
      workHistoryAcknowledgments={
        props.workspace.draft.workHistoryReviewAcknowledgments
      }
      workHistoryReviewSuggestions={
        props.workspace.workHistoryReviewSuggestions
      }
      onAcknowledgeWorkHistoryOmission={acknowledgeWorkHistoryOmission}
      onRemoveWorkHistoryOmissionAcknowledgment={
        removeWorkHistoryOmissionAcknowledgment
      }
    />
  );

  const assistantRail = (
    <ResumeWorkspaceSecondaryRail
      assistantMessages={props.assistantMessages}
      assistantPending={props.assistantPending}
      compactWhenIdle={showCompactAssistantRail}
      draft={draft}
      isWorkspacePending={props.isWorkspacePending}
      onSendAssistantMessage={(content) =>
        runWithSavedDraftAsync(
          () => props.onSendAssistantMessage(props.jobId, content),
          "Saved your draft before sending this request.",
        )
      }
      onResolveProposal={resolveAssistantProposal}
      validation={props.workspace.validation ?? null}
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
      onChange={(templateId) => {
        // Picking a template revises the draft's presentation settings.
        props.onDraftEdited?.();
        setDraft((currentDraft) =>
          currentDraft
            ? {
                ...currentDraft,
                templateId,
              }
            : currentDraft,
        );
      }}
    />
  );
  const historyPanel = (
    <ResumeVersionHistoryPanel
      currentDraft={draft}
      isPending={props.isWorkspacePending}
      onRestore={(revisionId) =>
        runWithSavedDraftAsync(
          () => props.onRestoreRevision(props.jobId, revisionId),
          "Saved your current edits before restoring the earlier draft.",
        )
      }
      revisions={props.workspace.revisions}
    />
  );
  // Confirmations bind to the saved draft's exact revision, locator, and
  // content hash, so the panel reads the committed snapshot rather than the
  // live editing draft. The returned workspace snapshot flows back through
  // props and refreshes every row.
  const claimConfirmationPanel = props.onSetResumeClaimConfirmation ? (
    <ResumeClaimConfirmationPanel
      claimAssessments={props.workspace.validation?.claimAssessments ?? []}
      draft={props.workspace.draft}
      hasUnsavedChanges={hasUnsavedChanges}
      isWorkspacePending={props.isWorkspacePending}
      jobId={props.jobId}
      onSetResumeClaimConfirmation={props.onSetResumeClaimConfirmation}
    />
  ) : null;
  const { approvalStateLabel, studioStatusMessage } = buildWorkspaceStatusCopy({
    approvalBlockedReason,
    availableExportToApprove,
    draft,
    hasUnsavedChanges,
    selectedTemplateApprovalEligible,
    selectedTemplateLane,
  });

  return (
    <LockedScreenLayout
      contentClassName="xl:overflow-hidden"
      topClassName="grid gap-1.5 pb-1 pt-1.5"
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
          />
          <ResumeWorkspaceContextDisclosure
            claimCount={
              props.workspace.validation?.claimAssessments.length ?? 0
            }
          >
            <ResumeWorkspaceSidebar
              hasUnsavedChanges={hasUnsavedChanges}
              workspace={props.workspace}
            />
            <ResumeStrategyContextPanel
              context={props.workspace.strategyContext ?? null}
            />
          </ResumeWorkspaceContextDisclosure>
        </>
      }
    >
      <section className="grid min-h-124 min-w-0 items-stretch xl:h-full xl:min-h-0">
        <ResumeWorkspaceStudioShell
          approvalBlockedReason={approvalBlockedReason}
          approvalStateLabel={approvalStateLabel}
          assistantRail={assistantRail}
          canApproveCurrentPdf={Boolean(
            availableExportToApprove &&
            selectedTemplateApprovalEligible &&
            !approvalBlockedReason &&
            !hasBlockingValidationIssues,
          )}
          canClearApproval={Boolean(draft.approvedExportId)}
          claimConfirmationPanel={claimConfirmationPanel}
          editorPanel={editorPanel}
          exportBlockedReason={exportBlockedReason}
          hasUnsavedChanges={hasUnsavedChanges}
          historyPanel={historyPanel}
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
          onContinueToShortlisted={props.onBack}
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
              "Saved your draft before refreshing it.",
            )
          }
          onReviewBlockingIssues={() => {
            const details = document.getElementById(
              "resume-proof-details",
            ) as HTMLDetailsElement | null;
            if (details) {
              details.open = true;
              details.scrollIntoView({
                behavior: getJobFinderScrollBehavior(),
                block: "start",
              });
              details.querySelector("summary")?.focus();
            }
          }}
          onSaveDraft={() => props.onSaveDraft(draft)}
          onSetMobileStudioTab={setMobileStudioTab}
          previewPane={previewPane}
          selectedTemplateApprovalEligible={selectedTemplateApprovalEligible}
          studioStatusMessage={studioStatusMessage}
          templatePanel={templatePanel}
          validationIssues={props.workspace.validation?.issues ?? []}
        />
      </section>
      <ResumeGuidedEditsPopup
        assistantMessages={props.assistantMessages}
        assistantPending={props.assistantPending}
        draft={draft}
        isWorkspacePending={props.isWorkspacePending}
        onSendAssistantMessage={(content) =>
          runWithSavedDraftAsync(
            () => props.onSendAssistantMessage(props.jobId, content),
            "Saved your draft before sending this request.",
          )
        }
        onResolveProposal={resolveAssistantProposal}
        validation={props.workspace.validation ?? null}
      />
    </LockedScreenLayout>
  );
}
