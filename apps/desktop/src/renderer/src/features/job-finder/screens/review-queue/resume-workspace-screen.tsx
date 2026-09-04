import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type {
  ResumeDraft,
  ResumeDraftPatch,
  ResumeValidationIssue,
  WorkHistoryReviewSuggestion,
} from "@unemployed/contracts";
import {
  getResumePreviewTargetContext,
  isBlockingResumeClaimAssessment,
  isBlockingResumeValidationIssue,
} from "@unemployed/contracts";
import {
  getResumeTemplateDeliveryLane,
  isResumeTemplateApprovalEligible,
} from "@unemployed/contracts";
import { Button } from "@renderer/components/ui/button";
import { EmptyState } from "../../components/empty-state";
import { LockedScreenLayout } from "../../components/locked-screen-layout";
import { ResumeClaimConfirmationPanel } from "./resume-claim-confirmation-panel";
import { ResumeWorkspaceEditorPanel } from "./resume-workspace-editor-panel";
import { ResumeWorkspaceHeader } from "./resume-workspace-header";
import { ResumeWorkspaceContextDisclosure } from "./resume-workspace-context-disclosure";
import { ResumeStrategyContextPanel } from "./resume-strategy-context-panel";
import { ResumeWorkspaceSidebar } from "./resume-workspace-sidebar";
import { ResumeGuidedEditsPopup } from "./resume-guided-edits-popup";
import { ResumeStudioPreviewPane } from "./resume-studio-preview-pane";
import {
  ResumeWorkspaceStudioShell,
  type ResumeStudioMobileTab,
} from "./resume-workspace-studio-shell";
import { getJobFinderScrollBehavior } from "../../lib/job-finder-scroll-behavior";
import { ResumeWorkspaceTemplatePanel } from "./resume-workspace-template-panel";
import { ResumeVersionHistoryPanel } from "./resume-version-history-panel";
import {
  cloneDraft,
  describeAcceptedAssistantEdits,
  describeResumeGenerationPath,
  findLatestAssistantEditRevisionId,
} from "./resume-workspace-utils";
import { orderResumeEntriesNewestFirst } from "./resume-section-editor-helpers";
import {
  buildResumeThemeRecommendationContext,
  buildWorkspaceStatusCopy,
  getAvailableExportToApprove,
  getSelectedTheme,
} from "./resume-workspace-screen-helpers";
import { buildResumeValidationAiPrompt } from "./resume-validation-issue-list";
import { findResumeValidationRestoreCandidate } from "./resume-validation-restore";
import {
  listUnresolvedWorkHistoryOmissionSuggestions,
  type ResumeWorkHistoryDecisionRequest,
} from "./resume-workspace-work-history-decisions";
import { useResumeWorkspaceSelection } from "./use-resume-workspace-selection";
import { useResumeWorkspacePreview } from "./use-resume-workspace-preview";
import type { ResumeWorkspaceScreenProps } from "./resume-workspace-screen.types";

/** The shell's own bottom padding below the route (`pb-3`). */
const STUDIO_BOTTOM_GUTTER = 12;
/**
 * Used only until the first measurement lands: the ≥1440 shell header, one
 * workspace title row, and the bottom gutter. A short first paint is
 * recoverable; an overlong one clips.
 */
const STUDIO_FALLBACK_TITLE_ROW = 72;
const STUDIO_FALLBACK_TOP_OFFSET =
  56 + STUDIO_FALLBACK_TITLE_ROW + STUDIO_BOTTOM_GUTTER;

export function ResumeWorkspaceScreen(props: ResumeWorkspaceScreenProps) {
  const [draft, setDraft] = useState<ResumeDraft | null>(
    props.workspace ? cloneDraft(props.workspace.draft) : null,
  );
  const [mobileStudioTab, setMobileStudioTab] =
    useState<ResumeStudioMobileTab>("preview");
  const [assistantOpenRequestKey, setAssistantOpenRequestKey] = useState(0);
  // An approval freezes one exact artifact. A Guided edits proposal that is
  // still pending at that moment would silently invalidate the approval the
  // moment it were accepted, so approval sets it aside and says so.
  const [setAsideProposalNote, setSetAsideProposalNote] = useState<
    string | null
  >(null);

  // The studio content area must end at the window bottom, not below it. A
  // fixed `100dvh - 4.25rem` height assumed one shell-header height and
  // ignored the workspace header above the studio, so the studio's own bottom
  // edge — the Assistant composer, the tools pane's last control — sat past
  // the viewport until the user scrolled the header away (60px too tall at a
  // 1280 window, where the shell header is taller still). Both offsets are
  // measured instead: the route scroll area's distance from the viewport top
  // is the shell chrome, and the locked layout's top row is the workspace
  // header. Neither depends on this element's own height, so there is no
  // measurement feedback loop.
  const [studioTopContentNode, setStudioTopContentNode] =
    useState<HTMLDivElement | null>(null);
  const [studioTopOffset, setStudioTopOffset] = useState(
    STUDIO_FALLBACK_TOP_OFFSET,
  );

  useEffect(() => {
    const anchor = studioTopContentNode;

    if (!anchor) {
      return;
    }

    // The locked layout wraps `topContent` in its own padded row; measuring
    // that row counts the padding the studio also has to give back.
    const topRow = anchor.parentElement ?? anchor;

    const updateOffset = () => {
      const scrollArea = topRow.closest<HTMLElement>(
        "[data-locked-screen-scroll-area]",
      );
      const shellChrome = scrollArea
        ? Math.max(0, scrollArea.getBoundingClientRect().top)
        : 0;

      // Every band that sits above the studio at scroll 0 has to come out of
      // the studio's height, or the pane container simply ends below the fold.
      // Subtracting only the shell chrome and the bottom gutter left the
      // container exactly `titleRow - gutter` past the window bottom — 41px at
      // both 1440x920 and 1280x720 — so the route grew a scroll whose entire
      // range existed to reveal a pane's bottom border. The title row is a
      // real, permanent band at the position the user arrives in, so it is
      // subtracted; scrolling it away leaves the studio short by that much
      // rather than clipped, which is the recoverable direction. Neither term
      // depends on this element's own height, so there is still no measurement
      // feedback loop.
      const titleRow = Math.max(0, topRow.getBoundingClientRect().height);

      setStudioTopOffset(
        Math.ceil(shellChrome + titleRow + STUDIO_BOTTOM_GUTTER),
      );
    };

    updateOffset();

    const observer =
      typeof ResizeObserver === "function"
        ? new ResizeObserver(updateOffset)
        : null;
    observer?.observe(topRow);
    // The shell header owns the only remaining permanent band above the
    // studio, so its height is what has to be watched.
    const scrollArea = topRow.closest<HTMLElement>(
      "[data-locked-screen-scroll-area]",
    );
    if (scrollArea) {
      observer?.observe(scrollArea);
    }
    window.addEventListener("resize", updateOffset);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateOffset);
    };
  }, [studioTopContentNode]);

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
  // Approval promises "Job Finder creates and verifies the application PDF in
  // the background"; the exact artifact it produced is what resolves that
  // promise, so the studio can stop describing work that already finished.
  const approvedExport =
    draft?.approvedExportId && props.workspace
      ? (props.workspace.exports.find(
          (artifact) => artifact.id === draft.approvedExportId,
        ) ?? null)
      : null;
  // Exactly the rule the export/approval validator and the Guided Edits
  // proposal gate use, so the studio can never disagree with either of them.
  const blockingClaimCount = props.workspace
    ? (props.workspace.validation?.claimAssessments.filter((assessment) =>
        isBlockingResumeClaimAssessment({
          assessment,
          draft: props.workspace!.draft,
        }),
      ).length ?? 0)
    : 0;
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

  const handleValidationIssueSelection = useCallback(
    (_issue: ResumeValidationIssue, targetId: string | null) => {
      if (targetId) {
        const targetContext = getResumePreviewTargetContext(targetId);
        handlePreviewTargetSelect({
          entryId: targetContext.entryId,
          sectionId: targetContext.sectionId,
          targetId,
        });
      } else {
        // Validation notes without a field target (for example work-history
        // review or page overflow) should not leave the previous field
        // selected while the editor is being opened.
        handlePreviewTargetSelect({
          entryId: null,
          sectionId: null,
          targetId: null,
        });
      }

      setMobileStudioTab("editor");
    },
    [handlePreviewTargetSelect],
  );

  const handleAskAiFix = useCallback(
    (issue: Parameters<typeof buildResumeValidationAiPrompt>[0]) => {
      // The Assistant is a floating panel, not a tab: opening it leaves the
      // studio exactly where the user left it.
      setAssistantOpenRequestKey((current) => current + 1);

      runWithSavedDraftAsync(
        () =>
          props.onSendAssistantMessage(
            props.jobId,
            buildResumeValidationAiPrompt(issue),
          ),
        "Saved your draft before sending this request.",
      );
    },
    [props.jobId, props.onSendAssistantMessage, runWithSavedDraftAsync],
  );

  // A blocked generated claim usually replaced text the user already had. The
  // exact same locator lookup powers the button's availability and its action,
  // so a visible "Restore previous text" always has something to restore.
  const resolveValidationRestoreCandidate = useCallback(
    (issue: ResumeValidationIssue) => {
      const savedDraft = props.workspace?.draft ?? null;

      if (!savedDraft) {
        return null;
      }

      return findResumeValidationRestoreCandidate({
        draft: savedDraft,
        issue,
        revisions: props.workspace?.revisions ?? [],
      });
    },
    [props.workspace?.draft, props.workspace?.revisions],
  );

  const canRestoreValidationIssuePreviousText = useCallback(
    (issue: ResumeValidationIssue) =>
      resolveValidationRestoreCandidate(issue) !== null,
    [resolveValidationRestoreCandidate],
  );

  const restoreValidationIssuePreviousText = useCallback(
    (issue: ResumeValidationIssue) => {
      const candidate = resolveValidationRestoreCandidate(issue);

      if (!candidate) {
        return;
      }

      runWithSavedDraft(() => {
        props.onDraftEdited?.();
        props.onApplyPatch(
          candidate.patch,
          "Restored the previous text for a blocked claim.",
        );
      }, "Saved your draft before restoring the previous text.");
    },
    [
      props.onApplyPatch,
      props.onDraftEdited,
      resolveValidationRestoreCandidate,
      runWithSavedDraft,
    ],
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

  const pendingAssistantProposalIds = props.assistantMessages
    .filter(
      (message) =>
        message.role === "assistant" && message.proposalStatus === "pending",
    )
    .map((message) => message.id);

  function setAsidePendingAssistantProposals(): void {
    const resolveProposal = props.onResolveAssistantProposal;

    if (!resolveProposal || pendingAssistantProposalIds.length === 0) {
      setSetAsideProposalNote(null);
      return;
    }

    for (const proposalId of pendingAssistantProposalIds) {
      // Reject with no selected patches: nothing from the proposal is applied,
      // so the approved artifact stays exactly what the preview showed.
      void resolveProposal(props.jobId, proposalId, "reject", []);
    }

    // The set-aside proposal is not deleted: it stays in the Assistant thread
    // with its own "Not applied" result, so "See the suggestion" below can put
    // the user back in front of exactly what was discarded.
    setSetAsideProposalNote(
      pendingAssistantProposalIds.length === 1
        ? "1 pending suggestion was set aside because you approved the resume. It is still in the Assistant thread."
        : `${pendingAssistantProposalIds.length} pending suggestions were set aside because you approved the resume. They are still in the Assistant thread.`,
    );
  }

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

  // The studio used to say "Job Finder used the built-in resume fallback
  // instead of the AI draft" while the preview beside it showed a paragraph
  // the assistant had just rewritten. The fallback sentence is now scoped to
  // the first draft, and accepted assistant edits get their own line with the
  // Undo that restores the pre-edit wording.
  const acceptedAssistantEdits = describeAcceptedAssistantEdits(
    props.assistantMessages,
  );
  const latestAssistantEditRevisionId = findLatestAssistantEditRevisionId(
    props.workspace.revisions,
  );
  // The editor panel owns the single provenance statement; the screen only
  // supplies the accepted-edit facts and the Undo that restores the pre-edit
  // wording.
  const undoAiEditAction =
    acceptedAssistantEdits && latestAssistantEditRevisionId ? (
      <Button
        data-resume-undo-ai-edit
        disabled={props.isWorkspacePending}
        onClick={() =>
          runWithSavedDraftAsync(
            () =>
              props.onRestoreRevision(
                props.jobId,
                latestAssistantEditRevisionId,
              ),
            "Saved your draft before undoing the AI edit.",
          )
        }
        size="sm"
        type="button"
        variant="outline"
      >
        Undo
      </Button>
    ) : null;

  const openAssistant = () => {
    setAssistantOpenRequestKey((current) => current + 1);
  };

  // "Edit this wording myself" opens the exact editor field a blocked proposal
  // lands on. It never writes the proposed text into the draft: the block says
  // the wording is unsupported, so the user writes their own.
  const editProposalWording = (targetId: string) => {
    const targetContext = getResumePreviewTargetContext(targetId);
    handlePreviewTargetSelect({
      entryId: targetContext.entryId,
      sectionId: targetContext.sectionId,
      targetId,
    });
    setMobileStudioTab("editor");
  };

  const editorPanel = (
    <ResumeWorkspaceEditorPanel
      actionMessage={props.actionMessage}
      acceptedAssistantEdits={acceptedAssistantEdits}
      {...(undoAiEditAction ? { undoAiEditAction } : {})}
      onOpenAssistant={openAssistant}
      coverageComparison={
        props.workspace.validation?.coverageComparison ?? null
      }
      draft={draft}
      hasUnsavedChanges={hasUnsavedChanges}
      isWorkspacePending={props.isWorkspacePending}
      job={props.workspace.job}
      jobId={props.jobId}
      onDraftChange={(nextDraft) => {
        // Direct user edits to identity fields revise the draft.
        props.onDraftEdited?.();
        setDraft(nextDraft);
      }}
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
        (draft.generationMethod === "ai" ||
          Boolean(describeResumeGenerationPath(props.workspace.tailoredAsset)))
      }
      tailoredAssetGeneration={props.workspace.tailoredAsset ?? null}
      tailoredAssetNotes={props.workspace.tailoredAsset?.notes ?? []}
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
      aiEditedTargetIds={acceptedAssistantEdits?.changedTargetIds ?? []}
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
      selectionScrollKey={selectionScrollKey}
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
  const prepareApplication = props.onPrepareApplication;

  return (
    <LockedScreenLayout
      contentClassName="overflow-hidden"
      topClassName="grid gap-1.5 pb-1"
      topContent={
        <div className="min-w-0" ref={setStudioTopContentNode}>
          <ResumeWorkspaceHeader
            draft={draft}
            jobCompany={job.company}
            jobLocation={job.location}
            jobCanonicalUrl={job.canonicalUrl}
            jobTitle={job.title}
            onBack={props.onBack}
          />
        </div>
      }
    >
      <section
        className="grid h-(--resume-studio-height) min-h-96 min-w-0 grid-rows-[minmax(0,1fr)] items-stretch overflow-hidden"
        data-resume-studio-content-area
        style={
          {
            "--resume-studio-height": `calc(100dvh - ${studioTopOffset}px)`,
          } as CSSProperties
        }
      >
        <ResumeWorkspaceStudioShell
          approvalBlockedReason={approvalBlockedReason}
          approvalStateLabel={approvalStateLabel}
          approvedExportPageCount={approvedExport?.pageCount ?? null}
          canApproveResume={Boolean(
            selectedTemplateApprovalEligible &&
            !approvalBlockedReason &&
            !exportBlockedReason &&
            !hasBlockingValidationIssues,
          )}
          canClearApproval={Boolean(draft.approvedExportId)}
          canRestoreValidationIssuePreviousText={
            canRestoreValidationIssuePreviousText
          }
          onRestoreValidationIssuePreviousText={
            restoreValidationIssuePreviousText
          }
          {...(setAsideProposalNote === null ? {} : { setAsideProposalNote })}
          onDismissSetAsideProposalNote={() => setSetAsideProposalNote(null)}
          onReviewSetAsideProposal={openAssistant}
          claimConfirmationPanel={claimConfirmationPanel}
          editorPanel={editorPanel}
          exportBlockedReason={exportBlockedReason}
          hasUnsavedChanges={hasUnsavedChanges}
          historyPanel={historyPanel}
          {...(props.isExportPending === undefined
            ? {}
            : { isExportPending: props.isExportPending })}
          isWorkspacePending={props.isWorkspacePending}
          mobileStudioTab={mobileStudioTab}
          onApproveCurrentPdf={() => {
            setAsidePendingAssistantProposals();
            runWithSavedDraftAsync(
              () =>
                availableExportToApprove
                  ? props.onApproveResume(
                      props.jobId,
                      availableExportToApprove.id,
                    )
                  : props.onApproveCurrentResume(props.jobId),
              "Saved your edits before approving this resume.",
            );
          }}
          onAskAiFix={handleAskAiFix}
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
          {...(prepareApplication
            ? {
                onPrepareApplication: () =>
                  runWithSavedDraftAsync(
                    prepareApplication,
                    "Saved your draft before preparing the application.",
                  ),
              }
            : {})}
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
          onSelectValidationIssue={handleValidationIssueSelection}
          onSetMobileStudioTab={setMobileStudioTab}
          previewPane={previewPane}
          selectedTemplateApprovalEligible={selectedTemplateApprovalEligible}
          supportingDetailsPanel={
            <ResumeWorkspaceContextDisclosure>
              <ResumeWorkspaceSidebar
                hasUnsavedChanges={hasUnsavedChanges}
                workspace={props.workspace}
              />
              <ResumeStrategyContextPanel
                context={props.workspace.strategyContext ?? null}
              />
            </ResumeWorkspaceContextDisclosure>
          }
          studioStatusMessage={studioStatusMessage}
          templatePanel={templatePanel}
          validationIssues={props.workspace.validation?.issues ?? []}
        />
      </section>
      {/* One Assistant, one placement: a floating panel over the studio at
          every width. It never takes a studio column, so opening, minimizing
          or closing it leaves the preview and tools panes exactly where they
          were. */}
      <ResumeGuidedEditsPopup
        assistantMessages={props.assistantMessages}
        assistantPending={props.assistantPending}
        draft={draft}
        isWorkspacePending={props.isWorkspacePending}
        openRequestKey={assistantOpenRequestKey}
        onSendAssistantMessage={(content) =>
          runWithSavedDraftAsync(
            () => props.onSendAssistantMessage(props.jobId, content),
            "Saved your draft before sending this request.",
          )
        }
        onReloadWorkspace={() =>
          runWithSavedDraftAsync(
            () => props.onRefresh(),
            "Saved your changes before reloading the latest version.",
          )
        }
        onRegenerateDraft={() =>
          runWithSavedDraft(
            () => props.onRegenerateDraft(props.jobId),
            "Saved your draft before writing a new AI draft.",
          )
        }
        onEditProposalWording={editProposalWording}
        onResolveProposal={resolveAssistantProposal}
        validation={props.workspace.validation ?? null}
      />
    </LockedScreenLayout>
  );
}
