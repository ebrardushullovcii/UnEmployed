import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CandidateProfile,
  DiscoveryActivityEvent,
  JobFinderResumeWorkspace,
  JobFinderSettings,
  JobFinderWorkspaceSnapshot,
  JobSearchPreferences,
  ResumeAssistantMessage,
  ResumeDraft,
  ResumeDraftPatch,
} from "@unemployed/contracts";
import { useJobFinderWorkspace } from "@renderer/features/job-finder/hooks/use-job-finder-workspace";
import type { ActionState } from "@renderer/features/job-finder/lib/job-finder-types";
import { useLocation, useNavigate } from "react-router-dom";
import {
  buildSourceDebugOutcomeMessage,
  type JobFinderPageContext,
} from "./job-finder-page-routes";

type SelectedState = string | null;

function useResettableSelection(initialValue: SelectedState) {
  const [value, setValue] = useState<SelectedState>(initialValue);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  return [value, setValue] as const;
}

function getActiveResumeWorkspaceJobId(pathname: string): string | null {
  const match = pathname.match(/\/job-finder\/review-queue\/([^/]+)\/resume$/);
  return match?.[1] ?? null;
}

function getLatestApplicationAttempt(
  workspace: JobFinderWorkspaceSnapshot,
  selectedApplicationRecordId: string | null,
) {
  const selectedApplicationRecord =
    workspace.applicationRecords.find(
      (record) => record.id === selectedApplicationRecordId,
    ) ??
    workspace.applicationRecords[0] ??
    null;

  const selectedApplicationAttempt = selectedApplicationRecord
    ? ([...workspace.applicationAttempts]
        .filter((attempt) => attempt.jobId === selectedApplicationRecord.jobId)
        .sort(
          (left, right) =>
            new Date(right.updatedAt).getTime() -
            new Date(left.updatedAt).getTime(),
        )[0] ?? null)
    : null;

  return {
    selectedApplicationAttempt,
    selectedApplicationRecord,
  };
}

export function useJobFinderPageController() {
  const location = useLocation();
  const navigate = useNavigate();
  const workspaceState = useJobFinderWorkspace();
  const [actionState, setActionState] = useState<ActionState>({
    busy: false,
    message: null,
  });
  const [liveDiscoveryEvents, setLiveDiscoveryEvents] = useState<
    DiscoveryActivityEvent[]
  >([]);
  const [resumeWorkspace, setResumeWorkspace] =
    useState<JobFinderResumeWorkspace | null>(null);
  const [resumeAssistantMessages, setResumeAssistantMessages] = useState<
    readonly ResumeAssistantMessage[]
  >([]);
  const [resumeAssistantPending, setResumeAssistantPending] = useState(false);
  const [resumeWorkspaceDirty, setResumeWorkspaceDirty] = useState(false);
  const activeResumeWorkspaceJobId = getActiveResumeWorkspaceJobId(
    location.pathname,
  );

  const [selectedDiscoveryJobId, setSelectedDiscoveryJobId] =
    useResettableSelection(
      workspaceState.status === "ready"
        ? workspaceState.workspace.selectedDiscoveryJobId
        : null,
    );
  const [selectedReviewJobId, setSelectedReviewJobId] = useResettableSelection(
    workspaceState.status === "ready"
      ? workspaceState.workspace.selectedReviewJobId
      : null,
  );
  const [selectedApplicationRecordId, setSelectedApplicationRecordId] =
    useResettableSelection(
      workspaceState.status === "ready"
        ? workspaceState.workspace.selectedApplicationRecordId
        : null,
    );

  const runAction = useCallback(
    async <TResult,>(
      action: () => Promise<TResult>,
      onSuccess: (result: TResult) => void | Promise<void>,
      successMessage:
        | string
        | null
        | ((result: TResult) => string | null),
    ) => {
      try {
        setActionState({ busy: true, message: null });
        const result = await action();
        const resolvedSuccessMessage =
          typeof successMessage === "function"
            ? successMessage(result)
            : successMessage;

        try {
          await onSuccess(result);
        } catch (error) {
          const detail =
            error instanceof Error
              ? error.message
              : "The workspace view could not refresh automatically.";
          setActionState({
            busy: false,
            message: `Action completed, but the current view could not refresh automatically. ${detail}`,
          });
          return;
        }

        setActionState({
          busy: false,
          message: resolvedSuccessMessage,
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "The requested Job Finder action failed.";
        setActionState({ busy: false, message });
      }
    },
    [],
  );

  const runResumeWorkspaceAction = useCallback(
    async <TResult,>(
      action: () => Promise<TResult>,
      onSuccess: (result: TResult) => void | Promise<void>,
      successMessage: string | null,
    ) => {
      try {
        setActionState({ busy: true, message: null });
        const result = await action();

        try {
          await onSuccess(result);
        } catch (error) {
          const detail =
            error instanceof Error
              ? error.message
              : "The resume workspace could not refresh automatically.";
          setActionState({
            busy: false,
            message: `Resume action succeeded, but the workspace could not refresh automatically. ${detail}`,
          });
          return;
        }

        setActionState({ busy: false, message: successMessage });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "The requested resume workspace action failed.";
        setActionState({ busy: false, message });
      }
    },
    [],
  );

  const confirmLeaveDirtyResumeWorkspace = useCallback(() => {
    if (!activeResumeWorkspaceJobId || !resumeWorkspaceDirty) {
      return true;
    }

    return window.confirm(
      "You have unsaved resume edits. Leave this workspace and discard them?",
    );
  }, [activeResumeWorkspaceJobId, resumeWorkspaceDirty]);

  const readyWorkspaceState =
    workspaceState.status === "ready" ? workspaceState : null;
  const actions = readyWorkspaceState?.actions ?? null;
  const platform = readyWorkspaceState?.platform ?? "win32";
  const workspace = readyWorkspaceState?.workspace ?? null;
  const activeResumeWorkspaceJobIdRef = useRef<string | null>(
    activeResumeWorkspaceJobId,
  );
  const resumeAssistantRequestTokenRef = useRef(0);
  activeResumeWorkspaceJobIdRef.current = activeResumeWorkspaceJobId;

  const isCurrentResumeWorkspaceJob = useCallback(
    (jobId: string) => activeResumeWorkspaceJobIdRef.current === jobId,
    [],
  );

  useEffect(() => {
    let cancelled = false;

    if (
      !activeResumeWorkspaceJobId ||
      !readyWorkspaceState ||
      !workspace ||
      !actions
    ) {
      setResumeWorkspace(null);
      setResumeAssistantMessages([]);
      setResumeAssistantPending(false);
      setResumeWorkspaceDirty(false);
      return () => {
        cancelled = true;
      };
    }

    if (
      !workspace.reviewQueue.some(
        (item) => item.jobId === activeResumeWorkspaceJobId,
      )
    ) {
      setActionState({
        busy: false,
        message:
          "The selected resume workspace is no longer available. Review Queue is shown instead.",
      });
      void navigate("/job-finder/review-queue", { replace: true });
      return () => {
        cancelled = true;
      };
    }

    void actions
      .getResumeWorkspace(activeResumeWorkspaceJobId)
      .then((nextWorkspace) => {
        if (
          !cancelled &&
          nextWorkspace.job.id === activeResumeWorkspaceJobIdRef.current
        ) {
          setResumeWorkspace(nextWorkspace);
          setResumeAssistantMessages(nextWorkspace.assistantMessages);
          setResumeAssistantPending(false);
          setSelectedReviewJobId(nextWorkspace.job.id);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setActionState({
            busy: false,
            message:
              error instanceof Error
                ? `Resume workspace could not be loaded. ${error.message}`
                : "Resume workspace could not be loaded. Review Queue is shown instead.",
          });
          void navigate("/job-finder/review-queue", { replace: true });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeResumeWorkspaceJobId,
    actions,
    navigate,
    readyWorkspaceState,
    setSelectedReviewJobId,
    workspace,
  ]);

  const navigateFromShell = useCallback(
    (path: string) => {
      if (!confirmLeaveDirtyResumeWorkspace()) {
        return;
      }

      setResumeWorkspaceDirty(false);
      void navigate(path);
    },
    [confirmLeaveDirtyResumeWorkspace, navigate],
  );

  if (!readyWorkspaceState || !workspace || !actions) {
    return {
      appearanceTheme: null,
      context: null,
      navigateFromShell,
      platform,
      workspace,
      workspaceState,
    };
  }

  const selectedDiscoveryJob = useMemo(
    () =>
      workspace.discoveryJobs.find((job) => job.id === selectedDiscoveryJobId) ??
      workspace.discoveryJobs[0] ??
      null,
    [selectedDiscoveryJobId, workspace.discoveryJobs],
  );

  const selectedReviewItem = useMemo(
    () =>
      workspace.reviewQueue.find((item) => item.jobId === selectedReviewJobId) ??
      workspace.reviewQueue[0] ??
      null,
    [selectedReviewJobId, workspace.reviewQueue],
  );

  const selectedReviewJob = useMemo(
    () =>
      workspace.discoveryJobs.find(
        (job) => job.id === selectedReviewItem?.jobId,
      ) ??
      selectedDiscoveryJob ??
      null,
    [selectedDiscoveryJob, selectedReviewItem?.jobId, workspace.discoveryJobs],
  );

  const selectedTailoredAsset = useMemo(
    () =>
      workspace.tailoredAssets.find(
        (asset) => asset.id === selectedReviewItem?.resumeAssetId,
      ) ?? null,
    [selectedReviewItem?.resumeAssetId, workspace.tailoredAssets],
  );

  const { selectedApplicationAttempt, selectedApplicationRecord } = useMemo(
    () => getLatestApplicationAttempt(workspace, selectedApplicationRecordId),
    [selectedApplicationRecordId, workspace],
  );

  const context: JobFinderPageContext = useMemo(() => ({
    actionState,
    busy: actionState.busy,
    onAnalyzeProfileFromResume: () =>
      void runAction(actions.analyzeProfileFromResume, () => undefined, null),
    onApproveApply: (jobId: string) =>
      void runAction(
        () => actions.approveApply(jobId),
        () => {
          void navigate("/job-finder/applications");
        },
        "Easy Apply marked as submitted and moved into Applications.",
      ),
    onCheckBrowserSession: () =>
      void runAction(
        actions.checkBrowserSession,
        () => undefined,
        "Browser session status refreshed.",
      ),
    onDismissJob: (jobId: string) =>
      void runAction(
        () => actions.dismissDiscoveryJob(jobId),
        () => undefined,
        "Saved job archived from discovery.",
      ),
    onEditResumeWorkspace: (jobId: string) => {
      if (!confirmLeaveDirtyResumeWorkspace()) {
        return;
      }

      if (!jobId) {
        setResumeWorkspace(null);
        setResumeAssistantMessages([]);
        setResumeAssistantPending(false);
        setResumeWorkspaceDirty(false);
        void navigate("/job-finder/review-queue");
        return;
      }

      setSelectedReviewJobId(jobId);
      void navigate(`/job-finder/review-queue/${jobId}/resume`);
    },
    onGenerateResume: (jobId: string) =>
      void runAction(
        () => actions.generateResume(jobId),
        () => setSelectedReviewJobId(jobId),
        "A tailored resume was generated for the selected job.",
      ),
    onApproveResume: (jobId: string, exportId: string) =>
      void runResumeWorkspaceAction(
        () => actions.approveResume(jobId, exportId),
        async () => {
          const nextWorkspace = await actions.getResumeWorkspace(jobId);
          if (!isCurrentResumeWorkspaceJob(nextWorkspace.job.id)) {
            return;
          }
          setResumeWorkspace(nextWorkspace);
        },
        "Resume approved for this job.",
      ),
    onImportResume: () =>
      void runAction(
        actions.importResume,
        () => undefined,
        "Base resume replaced from a local document.",
      ),
    onOpenBrowserSession: () =>
      void runAction(
        actions.openBrowserSession,
        () => undefined,
        workspace.browserSession.status === "ready"
          ? "Chrome session refreshed."
          : "Chrome profile opened and session status refreshed.",
      ),
    onQueueJob: (jobId: string) =>
      void runAction(
        () => actions.queueJobForReview(jobId),
        () => {
          setSelectedReviewJobId(jobId);
          void navigate("/job-finder/review-queue");
        },
        "Job moved into the review queue.",
      ),
    onRefreshResumeWorkspace: (jobId: string) =>
      void runResumeWorkspaceAction(
        () => actions.getResumeWorkspace(jobId),
        (nextWorkspace) => {
          if (!isCurrentResumeWorkspaceJob(nextWorkspace.job.id)) {
            return;
          }
          setResumeWorkspace(nextWorkspace);
          setResumeAssistantMessages(nextWorkspace.assistantMessages);
          setResumeAssistantPending(false);
        },
        "Resume workspace refreshed.",
      ),
    onRegenerateResumeDraft: (jobId: string) =>
      void runResumeWorkspaceAction(
        () => actions.regenerateResumeDraft(jobId),
        async () => {
          const nextWorkspace = await actions.getResumeWorkspace(jobId);
          if (!isCurrentResumeWorkspaceJob(nextWorkspace.job.id)) {
            return;
          }
          setResumeWorkspace(nextWorkspace);
        },
        "Resume draft regenerated.",
      ),
    onRegenerateResumeSection: (jobId: string, sectionId: string) =>
      void runResumeWorkspaceAction(
        () => actions.regenerateResumeSection(jobId, sectionId),
        async () => {
          const nextWorkspace = await actions.getResumeWorkspace(jobId);
          if (!isCurrentResumeWorkspaceJob(nextWorkspace.job.id)) {
            return;
          }
          setResumeWorkspace(nextWorkspace);
        },
        "Resume section regenerated.",
      ),
    onRunAgentDiscovery: () => {
      setLiveDiscoveryEvents([]);
      void runAction(
        () =>
          actions.runAgentDiscovery((event) => {
            setLiveDiscoveryEvents((current) => [...current, event]);
          }),
        () => {
          setLiveDiscoveryEvents([]);
        },
        "AI Agent discovery run completed and saved locally.",
      );
    },
    onRunSourceDebug: (targetId: string) => {
      void runAction(
        () => actions.runSourceDebug(targetId),
        () => undefined,
        (nextWorkspace) =>
          buildSourceDebugOutcomeMessage(nextWorkspace, targetId),
      );
    },
    onGetSourceDebugRunDetails: actions.getSourceDebugRunDetails,
    onSaveSourceInstructionArtifact: (targetId, artifact) =>
      void runAction(
        () => actions.saveSourceInstructionArtifact(targetId, artifact),
        () => undefined,
        "Source instructions updated.",
      ),
    onVerifySourceInstructions: (targetId: string, instructionId: string) =>
      void runAction(
        () => actions.verifySourceInstructions(targetId, instructionId),
        () => undefined,
        "Source instructions re-verified.",
      ),
    onResetWorkspace: () =>
      void runAction(
        actions.resetWorkspace,
        () => {
          void navigate("/job-finder/profile");
        },
        "Workspace reset to a fresh profile, cleared resume state, and empty job history.",
      ),
    onSaveAll: (
      profile: CandidateProfile,
      searchPreferences: JobSearchPreferences,
    ) =>
      void runAction(
        () => actions.saveWorkspaceInputs(profile, searchPreferences),
        () => undefined,
        null,
      ),
    onSaveResumeDraft: (draft: ResumeDraft) =>
      void runResumeWorkspaceAction(
        () => actions.saveResumeDraft(draft),
        async () => {
          const nextWorkspace = await actions.getResumeWorkspace(draft.jobId);
          if (!isCurrentResumeWorkspaceJob(nextWorkspace.job.id)) {
            return;
          }
          setResumeWorkspace(nextWorkspace);
        },
        "Resume draft saved.",
      ),
    onSaveResumeDraftAndThen: (
      draft: ResumeDraft,
      next: () => void,
      successMessage?: string | null,
    ) =>
      void runResumeWorkspaceAction(
        () => actions.saveResumeDraft(draft),
        async () => {
          const nextWorkspace = await actions.getResumeWorkspace(draft.jobId);
          if (!isCurrentResumeWorkspaceJob(nextWorkspace.job.id)) {
            return;
          }
          setResumeWorkspace(nextWorkspace);
          next();
        },
        successMessage ?? "Resume draft saved.",
      ),
    onApplyResumePatch: (
      patch: ResumeDraftPatch,
      revisionReason?: string | null,
    ) =>
      void runResumeWorkspaceAction(
        () => actions.applyResumePatch(patch, revisionReason),
        async () => {
          if (!resumeWorkspace) {
            return;
          }
          const nextWorkspace = await actions.getResumeWorkspace(
            resumeWorkspace.job.id,
          );
          if (!isCurrentResumeWorkspaceJob(nextWorkspace.job.id)) {
            return;
          }
          setResumeWorkspace(nextWorkspace);
          setResumeAssistantMessages(nextWorkspace.assistantMessages);
          setResumeAssistantPending(false);
        },
        "Resume change applied.",
      ),
    onSaveProfile: (profile: CandidateProfile) =>
      void runAction(() => actions.saveProfile(profile), () => undefined, null),
    onExportResumePdf: (jobId: string) =>
      void runResumeWorkspaceAction(
        () => actions.exportResumePdf(jobId),
        async () => {
          const nextWorkspace = await actions.getResumeWorkspace(jobId);
          if (!isCurrentResumeWorkspaceJob(nextWorkspace.job.id)) {
            return;
          }
          setResumeWorkspace(nextWorkspace);
        },
        "Resume PDF exported.",
      ),
    onSaveSearchPreferences: (searchPreferences: JobSearchPreferences) =>
      void runAction(
        () => actions.saveSearchPreferences(searchPreferences),
        () => undefined,
        null,
      ),
    onClearResumeApproval: (jobId: string) =>
      void runResumeWorkspaceAction(
        () => actions.clearResumeApproval(jobId),
        async () => {
          const nextWorkspace = await actions.getResumeWorkspace(jobId);
          if (!isCurrentResumeWorkspaceJob(nextWorkspace.job.id)) {
            return;
          }
          setResumeWorkspace(nextWorkspace);
        },
        "Resume approval cleared.",
      ),
    onSaveSettings: (settings: JobFinderSettings) =>
      void runAction(() => actions.saveSettings(settings), () => undefined, null),
    onSendResumeAssistantMessage: (jobId: string, content: string) =>
      void (async () => {
        const requestJobId = jobId;
        const requestToken = ++resumeAssistantRequestTokenRef.current;
        const createdAt = new Date().toISOString();
        const optimisticUserMessage: ResumeAssistantMessage = {
          id: `resume_message_user_optimistic_${jobId}_${Date.now()}`,
          jobId,
          role: "user",
          content,
          patches: [],
          createdAt,
        };
        const optimisticAssistantMessage: ResumeAssistantMessage = {
          id: `resume_message_assistant_pending_${jobId}_${Date.now()}`,
          jobId,
          role: "assistant",
          content: "Working on it...",
          patches: [],
          createdAt,
        };

        setResumeAssistantPending(true);
        setResumeAssistantMessages((current) => [
          ...current,
          optimisticUserMessage,
          optimisticAssistantMessage,
        ]);
        setActionState({
          busy: true,
          message: "Assistant is working on your resume request...",
        });

        try {
          const messages = await actions.sendResumeAssistantMessage(jobId, content);
          const assistantReply = [...messages]
            .reverse()
            .find((message) => message.role === "assistant");
          const appliedCount = assistantReply?.patches.length ?? 0;

          if (
            !isCurrentResumeWorkspaceJob(requestJobId) ||
            requestToken !== resumeAssistantRequestTokenRef.current
          ) {
            return;
          }

          setResumeAssistantMessages(messages);
          setResumeAssistantPending(false);

          let refreshMessage: string | null = null;

          try {
            const nextWorkspace = await actions.getResumeWorkspace(jobId);
            if (isCurrentResumeWorkspaceJob(nextWorkspace.job.id)) {
              setResumeWorkspace(nextWorkspace);
            }
          } catch (error) {
            refreshMessage =
              error instanceof Error
                ? error.message
                : "The workspace could not refresh automatically.";
          }

          setActionState({
            busy: false,
            message:
              refreshMessage !== null
                ? `Assistant finished${appliedCount > 0 ? ` and applied ${appliedCount} change${appliedCount === 1 ? "" : "s"}` : ""}, but the workspace could not refresh automatically. ${refreshMessage}`
                : appliedCount > 0
                  ? `Assistant finished and applied ${appliedCount} change${appliedCount === 1 ? "" : "s"}.`
                  : "Assistant finished and shared a reply with no direct resume changes.",
          });
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "The requested resume workspace action failed.";
          setResumeAssistantPending(false);
          setResumeAssistantMessages((current) =>
            current.filter(
              (entry) =>
                entry.id !== optimisticUserMessage.id &&
                entry.id !== optimisticAssistantMessage.id,
            ),
          );
          setActionState({ busy: false, message });
        } finally {
          setActionState((current) =>
            current.busy ? { ...current, busy: false } : current,
          );
        }
      })(),
    onResumeWorkspaceDirtyChange: (dirty: boolean) => {
      setResumeWorkspaceDirty(dirty);
    },
    onSelectApplicationRecord: setSelectedApplicationRecordId,
    onSelectDiscoveryJob: setSelectedDiscoveryJobId,
    onSelectReviewItem: setSelectedReviewJobId,
    selectedApplicationAttempt,
    selectedApplicationRecord,
    selectedDiscoveryJob,
    liveDiscoveryEvents,
    selectedReviewItem,
    selectedReviewJob,
    selectedTailoredAsset,
    resumeAssistantMessages,
    resumeAssistantPending,
    resumeWorkspace,
    workspace,
  }), [
    actionState,
    actions,
    confirmLeaveDirtyResumeWorkspace,
    isCurrentResumeWorkspaceJob,
    liveDiscoveryEvents,
    navigate,
    navigateFromShell,
    platform,
    resumeAssistantMessages,
    resumeAssistantPending,
    resumeWorkspace,
    selectedApplicationAttempt,
    selectedApplicationRecord,
    selectedDiscoveryJob,
    selectedReviewItem,
    selectedReviewJob,
    selectedTailoredAsset,
    setSelectedApplicationRecordId,
    setSelectedDiscoveryJobId,
    setSelectedReviewJobId,
    workspace,
  ]);

  return {
    appearanceTheme: workspace.settings.appearanceTheme,
    context,
    navigateFromShell,
    platform,
    workspace,
    workspaceState,
  };
}
