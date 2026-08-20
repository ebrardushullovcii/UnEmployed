import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { appendDiscoveryLiveActivityEvent } from "@unemployed/contracts";
import type {
  CandidateProfile,
  DiscoveryActivityEvent,
  DiscoveryFeedbackReason,
  JobFinderResumeWorkspace,
  JobFinderOpenBrowserSessionInput,
  JobFinderSettings,
  JobFinderWorkspaceSnapshot,
  ProfileCopilotMessage,
  JobSearchPreferences,
  ProfileCopilotContext,
  ProfileSetupReviewActionOptions,
  ProfileSetupState,
  ProfileSetupStep,
  RecommendResumeStrategyInput,
  ResumeAssistantMessage,
  ResumeApplicationMode,
  ResumeDraft,
  ResumeDraftPatch,
  ResumeStrategyRecommendation,
  SaveResumeStrategyInput,
  SelectResumeStrategyInput,
  SetCampaignResumeStrategyDefaultInput,
} from "@unemployed/contracts";
import type {
  ActionState,
  JobFinderShellActions,
} from "@renderer/features/job-finder/lib/job-finder-types";
import {
  type PendingActionScope,
  type PendingActionState,
  jobFinderPendingActions,
} from "./job-finder-pending-actions";
import { getProfileCopilotContextKey } from "@renderer/features/job-finder/lib/profile-copilot-context";
import { getJobFinderErrorMessage } from "@renderer/features/job-finder/lib/job-finder-error-message";
import { buildSourceDebugOutcomeMessage } from "./job-finder-page-route-utils";
import {
  createSaveDedupeKey,
  type JobFinderSaveCoordinator,
  type JobFinderSaveSurface,
} from "./job-finder-save-state";

type ActionOptions = {
  clearMessageOnStart?: boolean;
  rethrowError?: boolean;
  scope?: PendingActionScope;
  startMessage?: string;
};

type BaseActionArgs = {
  actions: JobFinderShellActions;
  activeRouteResumeWorkspace: JobFinderResumeWorkspace | null;
  canImportResume: boolean;
  confirmLeaveDirtyResumeWorkspace: () => boolean;
  importResumeGuardMessage: string | null;
  isCurrentResumeAssistantRequest: (
    jobId: string,
    requestToken: number,
  ) => boolean;
  isCurrentResumeWorkspaceJob: (jobId: string) => boolean;
  locationPathname: string;
  navigate: (
    path: string,
    options?: { replace?: boolean; state?: unknown },
  ) => void;
  profileSetupState: ProfileSetupState | null;
  profileCopilotRequestTokenRef: MutableRefObject<number>;
  requestApplyCopilotVisualCheckpoints: (request: {
    jobId: string;
    onResolve: (visualCheckpointsEnabled: boolean) => void;
    onCancel?: () => void;
  }) => void;
  refreshResumeWorkspace: (
    jobId: string,
    options?: {
      updateAssistantMessages?: boolean;
    },
  ) => Promise<boolean>;
  resumeAssistantRequestTokenRef: MutableRefObject<number>;
  setActionState: Dispatch<SetStateAction<ActionState>>;
  setLiveDiscoveryEvents: Dispatch<SetStateAction<DiscoveryActivityEvent[]>>;
  setOptimisticProfileCopilotMessages: Dispatch<
    SetStateAction<readonly ProfileCopilotMessage[]>
  >;
  setPendingActionState: Dispatch<SetStateAction<PendingActionState>>;
  setProfileCopilotBusy: Dispatch<SetStateAction<boolean>>;
  setProfileCopilotPendingContextKey: Dispatch<SetStateAction<string | null>>;
  setResumeAssistantMessages: Dispatch<
    SetStateAction<readonly ResumeAssistantMessage[]>
  >;
  setResumeAssistantPending: Dispatch<SetStateAction<boolean>>;
  setResumeWorkspace: Dispatch<SetStateAction<JobFinderResumeWorkspace | null>>;
  clearResumeWorkspaceState: () => void;
  setResumeWorkspaceDirty: Dispatch<SetStateAction<boolean>>;
  setSelectedReviewJobId: (jobId: string) => void;
  sourceDebugRunIdRef: MutableRefObject<number>;
  workspace: JobFinderWorkspaceSnapshot;
  saveCoordinator: JobFinderSaveCoordinator;
};

const handledRefreshErrorTag = Symbol("handledRefreshError");

export const DISCOVERY_PROGRESS_REFRESH_INTERVAL_MS = 250;

export type DiscoveryWorkspaceRefreshCoordinator = {
  notifySourceCompleted: () => void;
  flushFinal: () => Promise<unknown>;
  dispose: () => void;
};

/**
 * Coalesces source-completion refreshes while keeping at most one snapshot
 * request in flight. The final flush always performs a fresh authoritative
 * read after any progressive request settles, so a slow earlier snapshot
 * cannot overwrite the completed run.
 */
export function createDiscoveryWorkspaceRefreshCoordinator(
  refreshWorkspace: () => Promise<unknown>,
  options: { intervalMs?: number } = {},
): DiscoveryWorkspaceRefreshCoordinator {
  const intervalMs =
    options.intervalMs ?? DISCOVERY_PROGRESS_REFRESH_INTERVAL_MS;
  let disposed = false;
  let pending = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<void> | null = null;

  const schedule = () => {
    if (disposed || !pending || timer !== null || inFlight !== null) {
      return;
    }

    timer = setTimeout(() => {
      timer = null;
      if (disposed || !pending) {
        return;
      }

      pending = false;
      inFlight = Promise.resolve()
        .then(() => refreshWorkspace())
        .then(() => undefined)
        .catch(() => undefined)
        .finally(() => {
          inFlight = null;
          schedule();
        });
    }, intervalMs);
  };

  return {
    notifySourceCompleted: () => {
      pending = true;
      schedule();
    },
    flushFinal: async () => {
      pending = false;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }

      if (inFlight !== null) {
        await inFlight;
      }

      if (!disposed) {
        return refreshWorkspace();
      }

      return undefined;
    },
    dispose: () => {
      disposed = true;
      pending = false;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}

type HandledRefreshError = Error & {
  [handledRefreshErrorTag]: true;
};

function resolvePendingScope(
  options: ActionOptions | undefined,
): PendingActionScope | null {
  return options?.scope ?? null;
}

function markHandledRefreshError(error: unknown): HandledRefreshError {
  const handledError =
    error instanceof Error
      ? error
      : new Error("The resume editor could not refresh automatically.");

  (handledError as HandledRefreshError)[handledRefreshErrorTag] = true;
  return handledError as HandledRefreshError;
}

function isHandledRefreshError(error: unknown): error is HandledRefreshError {
  return Boolean(
    error &&
    typeof error === "object" &&
    handledRefreshErrorTag in (error as Record<PropertyKey, unknown>),
  );
}

function incrementPendingScope(
  current: PendingActionState,
  scope: PendingActionScope,
): PendingActionState {
  return {
    ...current,
    [scope]: (current[scope] ?? 0) + 1,
  };
}

function decrementPendingScope(
  current: PendingActionState,
  scope: PendingActionScope,
): PendingActionState {
  const nextCount = (current[scope] ?? 0) - 1;

  if (nextCount > 0) {
    return {
      ...current,
      [scope]: nextCount,
    };
  }

  if (!(scope in current)) {
    return current;
  }

  const nextState = { ...current };
  delete nextState[scope];
  return nextState;
}

export function createActionRunners(args: {
  saveCoordinator?: JobFinderSaveCoordinator;
  setActionState: Dispatch<SetStateAction<ActionState>>;
  setPendingActionState: Dispatch<SetStateAction<PendingActionState>>;
}) {
  const { saveCoordinator, setActionState, setPendingActionState } = args;

  const withPendingScope = async <TResult>(
    scope: PendingActionScope | null,
    action: () => Promise<TResult>,
  ) => {
    if (!scope) {
      return action();
    }

    setPendingActionState((current) => incrementPendingScope(current, scope));

    try {
      return await action();
    } finally {
      setPendingActionState((current) => decrementPendingScope(current, scope));
    }
  };

  const runAction = async <TResult>(
    action: () => Promise<TResult>,
    onSuccess: (result: TResult) => void | Promise<void>,
    successMessage: string | null | ((result: TResult) => string | null),
    options?: ActionOptions,
  ): Promise<boolean> => {
    const pendingScope = resolvePendingScope(options);

    try {
      if (options?.clearMessageOnStart !== false) {
        setActionState({ message: options?.startMessage ?? null });
      }

      await withPendingScope(pendingScope, async () => {
        const result = await action();
        const resolvedSuccessMessage =
          typeof successMessage === "function"
            ? successMessage(result)
            : successMessage;

        try {
          await onSuccess(result);
        } catch (error) {
          if (isHandledRefreshError(error)) {
            throw error;
          }

          const detail =
            error instanceof Error
              ? error.message
              : "The workspace view could not refresh automatically.";
          setActionState({
            message: `Action completed, but the current view could not refresh automatically. ${detail}`,
          });
          return;
        }

        setActionState({
          message: resolvedSuccessMessage,
        });
      });
      return true;
    } catch (error) {
      if (isHandledRefreshError(error)) {
        return false;
      }

      const message = getJobFinderErrorMessage(
        error,
        "The requested Job Finder action failed.",
      );
      setActionState({ message });
      if (options?.rethrowError) {
        throw error instanceof Error ? error : new Error(message);
      }
      return false;
    }
  };

  const runResumeWorkspaceAction = async <TResult>(
    action: () => Promise<TResult>,
    onSuccess: (result: TResult) => void | Promise<void>,
    successMessage: string | null,
    options?: ActionOptions,
  ) => {
    await runAction(
      action,
      async (result) => {
        try {
          await onSuccess(result);
        } catch (error) {
          if (isHandledRefreshError(error)) {
            throw error;
          }

          const detail =
            error instanceof Error
              ? error.message
              : "The resume editor could not refresh automatically.";
          setActionState({
            message: `Resume action succeeded, but the editor could not refresh automatically. ${detail}`,
          });
          throw markHandledRefreshError(error);
        }
      },
      successMessage,
      options,
    );
  };

  const runSaveAction = async <TResult>(input: {
    action: () => Promise<TResult>;
    dedupeKey: string;
    failedFallback: string;
    label: string;
    onSuccess: (result: TResult) => void | Promise<void>;
    savedMessage: string;
    scope: PendingActionScope;
    surface: JobFinderSaveSurface;
  }) => {
    if (!saveCoordinator) {
      await runAction(input.action, input.onSuccess, input.savedMessage, {
        scope: input.scope,
        startMessage: `Saving ${input.label.toLowerCase()}…`,
      });
      return false;
    }

    setActionState({ message: `Saving ${input.label.toLowerCase()}…` });
    const result = await saveCoordinator.run({
      dedupeKey: input.dedupeKey,
      execute: () =>
        withPendingScope(input.scope, async () => {
          setActionState({ message: `Saving ${input.label.toLowerCase()}…` });
          const value = await input.action();
          await input.onSuccess(value);
          setActionState({ message: input.savedMessage });
          return value;
        }),
      failedMessage: (error) => {
        const message = getJobFinderErrorMessage(error, input.failedFallback);
        setActionState({ message });
        return message;
      },
      label: input.label,
      savedMessage: input.savedMessage,
      surface: input.surface,
    });

    setActionState({
      message:
        result.status === "saved"
          ? input.savedMessage
          : getJobFinderErrorMessage(result.error, input.failedFallback),
    });
    return result.status === "saved";
  };

  return {
    runAction,
    runResumeWorkspaceAction,
    runSaveAction,
    withPendingScope,
  };
}

export function createPrimaryPageActions(
  args: BaseActionArgs & {
    runAction: <TResult>(
      action: () => Promise<TResult>,
      onSuccess: (result: TResult) => void | Promise<void>,
      successMessage: string | null | ((result: TResult) => string | null),
      options?: ActionOptions,
    ) => Promise<boolean>;
    runResumeWorkspaceAction: <TResult>(
      action: () => Promise<TResult>,
      onSuccess: (result: TResult) => void | Promise<void>,
      successMessage: string | null,
      options?: ActionOptions,
    ) => Promise<void>;
    runSaveAction: <TResult>(input: {
      action: () => Promise<TResult>;
      dedupeKey: string;
      failedFallback: string;
      label: string;
      onSuccess: (result: TResult) => void | Promise<void>;
      savedMessage: string;
      scope: PendingActionScope;
      surface: JobFinderSaveSurface;
    }) => Promise<boolean>;
    withPendingScope: <TResult>(
      scope: PendingActionScope | null,
      action: () => Promise<TResult>,
    ) => Promise<TResult>;
  },
) {
  const {
    actions,
    activeRouteResumeWorkspace,
    canImportResume,
    confirmLeaveDirtyResumeWorkspace,
    importResumeGuardMessage,
    isCurrentResumeAssistantRequest,
    isCurrentResumeWorkspaceJob,
    locationPathname,
    navigate,
    profileSetupState,
    profileCopilotRequestTokenRef,
    requestApplyCopilotVisualCheckpoints,
    refreshResumeWorkspace,
    resumeAssistantRequestTokenRef,
    runAction,
    runResumeWorkspaceAction,
    runSaveAction,
    withPendingScope,
    setActionState,
    setLiveDiscoveryEvents,
    setOptimisticProfileCopilotMessages,
    setPendingActionState,
    setProfileCopilotBusy,
    setProfileCopilotPendingContextKey,
    setResumeAssistantMessages,
    setResumeAssistantPending,
    setResumeWorkspace,
    clearResumeWorkspaceState,
    setResumeWorkspaceDirty,
    setSelectedReviewJobId,
    sourceDebugRunIdRef,
    workspace,
  } = args;

  function getConfiguredSourceTarget(targetId: string) {
    return (
      workspace.searchPreferences.discovery.targets.find(
        (target) => target.id === targetId,
      ) ?? null
    );
  }

  const runDiscoveryAction = (targetId?: string) => {
    setLiveDiscoveryEvents([]);
    void runAction(
      async () => {
        const refreshCoordinator = createDiscoveryWorkspaceRefreshCoordinator(
          actions.refreshWorkspace,
        );

        try {
          await actions.runAgentDiscovery((event) => {
            setLiveDiscoveryEvents((current) =>
              appendDiscoveryLiveActivityEvent(current, event),
            );

            if (event.terminalState === "completed" && event.targetId) {
              refreshCoordinator.notifySourceCompleted();
            }
          }, targetId);

          // Finish with one authoritative workspace read after any bounded
          // progressive refresh has settled. A slower snapshot requested for
          // an earlier source cannot win a race against the completed run.
          return await refreshCoordinator.flushFinal();
        } finally {
          refreshCoordinator.dispose();
          setLiveDiscoveryEvents([]);
        }
      },
      () => undefined,
      targetId
        ? "Search finished for this source and results were saved on this device."
        : "Search finished and results were saved on this device.",
      {
        scope: targetId
          ? jobFinderPendingActions.discoveryTarget(targetId)
          : jobFinderPendingActions.discoveryAll(),
      },
    );
  };

  const startAutoFlow = (
    runner: () => Promise<unknown>,
    successMessage: string,
    scope: PendingActionScope,
  ) => {
    if (!confirmLeaveDirtyResumeWorkspace()) {
      return;
    }

    void runAction(
      runner,
      () => {
        setResumeWorkspaceDirty(false);
        navigate("/job-finder/applications");
      },
      successMessage,
      { scope },
    );
  };

  return {
    onAnalyzeProfileFromResume: () => {
      if (!canImportResume) {
        setActionState({ message: importResumeGuardMessage });
        return;
      }

      void runAction(actions.analyzeProfileFromResume, () => undefined, null, {
        scope: jobFinderPendingActions.profileAnalyze(),
      });
    },
    onApplyProfileCopilotPatchGroup: (patchGroupId: string) =>
      void runSaveAction({
        action: () => actions.applyProfileCopilotPatchGroup(patchGroupId),
        dedupeKey: createSaveDedupeKey("profile", { patchGroupId }),
        failedFallback:
          "The assistant profile change was not saved. Retry before leaving this page.",
        label: "Profile assistant change",
        onSuccess: () => undefined,
        savedMessage: "Profile change applied.",
        scope: jobFinderPendingActions.profileMutation(),
        surface: "profile",
      }),
    onApplyProfileSetupReviewAction: (
      reviewItemId: string,
      action: "confirm" | "dismiss" | "clear_value",
      options?: ProfileSetupReviewActionOptions,
    ) =>
      void runAction(
        () =>
          actions.applyProfileSetupReviewAction(reviewItemId, action, options),
        () => undefined,
        action === "confirm"
          ? options?.selectedConflictChoiceId
            ? "Imported comparison choice confirmed."
            : "Imported suggestion confirmed."
          : action === "dismiss"
            ? "Review item dismissed for now."
            : "Current value cleared and the review item was resolved.",
        { scope: jobFinderPendingActions.profileReviewItem(reviewItemId) },
      ),
    onApproveApplyRun: (runId: string) =>
      void runAction(
        () => actions.approveApplyRun(runId),
        () => undefined,
        "Safe preparation approved. Final submission and account creation remain disabled.",
        { scope: jobFinderPendingActions.applyRun(runId) },
      ),
    onCancelApplyRun: (runId: string) =>
      runAction(
        () => actions.cancelApplyRun(runId),
        () => undefined,
        "Application preparation run cancelled.",
        { scope: jobFinderPendingActions.applyRun(runId) },
      ),
    onApproveApply: (jobId: string) => {
      if (!confirmLeaveDirtyResumeWorkspace()) {
        return;
      }

      void runAction(
        () =>
          actions.startApplyCopilotRun(jobId, {
            visualCheckpointsEnabled: false,
          }),
        () => {
          setResumeWorkspaceDirty(false);
          navigate("/job-finder/applications");
        },
        "Applications updated. Check the latest attempt and next step there.",
        {
          scope: jobFinderPendingActions.apply(),
          startMessage:
            "Preparing the application in the dedicated browser. Job Finder will stop before the final submit control.",
        },
      );
    },
    onRevokeApplyRunApproval: (runId: string) =>
      void runAction(
        () => actions.revokeApplyRunApproval(runId),
        () => undefined,
        "Preparation approval revoked. Final submission remains disabled.",
        { scope: jobFinderPendingActions.applyRun(runId) },
      ),
    onResolveApplyConsentRequest: (
      requestId: string,
      action: "approve" | "decline",
    ) =>
      void runAction(
        () => actions.resolveApplyConsentRequest(requestId, action),
        () => undefined,
        action === "approve"
          ? "Consent approved. The safe run resumed without final submit."
          : "Consent declined. The run skipped that job and stayed non-submitting.",
        { scope: jobFinderPendingActions.applyRequest(requestId) },
      ),
    onStartAutoApplyQueue: (jobIds: string[]) => {
      if (jobIds.length === 0) {
        setActionState({ message: "No jobs selected for auto-apply queue." });
        return;
      }

      startAutoFlow(
        () => actions.startAutoApplyQueueRun(jobIds),
        "Automatic apply queue staged. Review and approve it in Applications before any later execution step.",
        jobFinderPendingActions.apply(),
      );
    },
    onStartAutoApply: (jobId: string) => {
      startAutoFlow(
        () => actions.startAutoApplyRun(jobId),
        "Safe application preparation staged. Review and approve the fill-only run in Applications. Final submission and account creation remain disabled.",
        jobFinderPendingActions.apply(),
      );
    },
    onStartApplyCopilot: (jobId: string) => {
      requestApplyCopilotVisualCheckpoints({
        jobId,
        onResolve: (visualCheckpointsEnabled) => {
          startAutoFlow(
            () =>
              actions.startApplyCopilotRun(jobId, { visualCheckpointsEnabled }),
            visualCheckpointsEnabled
              ? "Apply Copilot prepared the application with visual checkpoints and paused before final submit. Review it in Applications."
              : "Apply Copilot prepared the application and paused before final submit. Review it in Applications.",
            jobFinderPendingActions.apply(),
          );
        },
      });
    },
    onCheckBrowserSession: () =>
      void runAction(
        actions.checkBrowserSession,
        () => undefined,
        "Browser status refreshed.",
        { scope: jobFinderPendingActions.browserSession() },
      ),
    onDismissJob: (
      jobId: string,
      reasons: readonly DiscoveryFeedbackReason[],
    ) =>
      void runAction(
        () => actions.dismissDiscoveryJob(jobId, reasons),
        () => undefined,
        "Job hidden. Your reasons stay local and do not change fit scoring.",
        { scope: jobFinderPendingActions.discoveryJob(jobId) },
      ),
    onRestoreDismissedJob: (jobId: string) =>
      void runAction(
        () => actions.restoreDismissedDiscoveryJob(jobId),
        () => undefined,
        "Job restored and feedback reset.",
        { scope: jobFinderPendingActions.discoveryJob(jobId) },
      ),
    onEditResumeWorkspace: (jobId: string) => {
      if (!confirmLeaveDirtyResumeWorkspace()) {
        return;
      }

      if (!jobId) {
        navigate("/job-finder/review-queue");
        return;
      }

      setSelectedReviewJobId(jobId);
      navigate(`/job-finder/review-queue/${jobId}/resume`);
    },
    onGenerateResume: (jobId: string) =>
      void runAction(
        () => actions.generateResume(jobId),
        () => setSelectedReviewJobId(jobId),
        "Resume created for this job.",
        { scope: jobFinderPendingActions.resumeJob(jobId) },
      ),
    onRemoveReviewJob: (jobId: string) => {
      if (!confirmLeaveDirtyResumeWorkspace()) {
        return;
      }

      void runAction(
        () => actions.removeJobFromReview(jobId),
        () => {
          clearResumeWorkspaceState();
          setSelectedReviewJobId("");
          navigate("/job-finder/discovery");
        },
        "Job moved back to Find jobs.",
        { scope: jobFinderPendingActions.resumeJob(jobId) },
      );
    },
    onApproveResume: (jobId: string, exportId: string) =>
      void runResumeWorkspaceAction(
        () => actions.approveResume(jobId, exportId),
        async () => {
          await refreshResumeWorkspace(jobId);
        },
        "Resume approved for this job.",
        { scope: jobFinderPendingActions.resumeJob(jobId) },
      ),
    onImportResume: () => {
      if (!canImportResume) {
        setActionState({ message: importResumeGuardMessage });
        return;
      }

      void runAction(
        actions.importResume,
        () => undefined,
        (result) =>
          result.profile.baseResume.id === workspace.profile.baseResume.id
            ? "No resume selected. Your profile was not changed."
            : `${result.profile.baseResume.fileName} was imported. Review the extracted details before approving them.`,
        {
          scope: jobFinderPendingActions.profileImport(),
        },
      );
    },
    onOpenBrowserSession: (input?: JobFinderOpenBrowserSessionInput) =>
      void runAction(
        () => actions.openBrowserSession(input),
        () => undefined,
        (result) => {
          if (input?.targetId) {
            const target = getConfiguredSourceTarget(input.targetId);
            if (result.browserSession.driver === "catalog_seed") {
              return target
                ? `Targeted sign-in for ${target.label} is unavailable because the browser agent runtime is disabled.`
                : "Targeted sign-in is unavailable because the browser agent runtime is disabled.";
            }

            return target
              ? `Opened the browser for ${target.label}. Sign in there, then return to continue.`
              : "Browser opened and status refreshed.";
          }

          return workspace.browserSession.status === "ready"
            ? "Browser refreshed."
            : "Browser opened and status refreshed.";
        },
        {
          scope: input?.targetId
            ? jobFinderPendingActions.browserSessionTarget(input.targetId)
            : jobFinderPendingActions.browserSession(),
        },
      ),
    onOpenProfile: () => {
      if (!confirmLeaveDirtyResumeWorkspace()) {
        return;
      }

      navigate("/job-finder/profile", { state: { forceFullProfile: true } });
    },
    onQueueJob: (jobId: string) => {
      if (!confirmLeaveDirtyResumeWorkspace()) {
        return;
      }

      void runAction(
        () => actions.queueJobForReview(jobId),
        () => {
          setResumeWorkspaceDirty(false);
          setSelectedReviewJobId(jobId);
          navigate("/job-finder/review-queue");
        },
        "Job added to Shortlisted.",
        { scope: jobFinderPendingActions.discoveryJob(jobId) },
      );
    },
    onSetJobResumeApplicationMode: (
      jobId: string,
      resumeApplicationMode: ResumeApplicationMode,
    ) =>
      void runAction(
        () => actions.setJobResumeApplicationMode(jobId, resumeApplicationMode),
        () => setSelectedReviewJobId(jobId),
        resumeApplicationMode === "original_resume"
          ? "This job will use your original CV unchanged."
          : "This job will use a tailored CV.",
        { scope: jobFinderPendingActions.resumeJob(jobId) },
      ),
    onRejectProfileCopilotPatchGroup: (patchGroupId: string) =>
      void runAction(
        () => actions.rejectProfileCopilotPatchGroup(patchGroupId),
        () => undefined,
        "Profile change proposal dismissed.",
        { scope: jobFinderPendingActions.profileMutation() },
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
        "Workspace reloaded.",
        { scope: jobFinderPendingActions.resumeJob(jobId) },
      ),
    onRegenerateResumeDraft: (jobId: string) =>
      void runResumeWorkspaceAction(
        () => actions.regenerateResumeDraft(jobId),
        async () => {
          await refreshResumeWorkspace(jobId);
        },
        "Draft refreshed.",
        { scope: jobFinderPendingActions.resumeJob(jobId) },
      ),
    onRegenerateResumeSection: (jobId: string, sectionId: string) =>
      void runResumeWorkspaceAction(
        () => actions.regenerateResumeSection(jobId, sectionId),
        async () => {
          await refreshResumeWorkspace(jobId);
        },
        "Section refreshed.",
        { scope: jobFinderPendingActions.resumeJob(jobId) },
      ),
    onRestoreResumeDraftRevision: (jobId: string, revisionId: string) =>
      void runResumeWorkspaceAction(
        () => actions.restoreResumeDraftRevision(jobId, revisionId),
        async () => {
          await refreshResumeWorkspace(jobId);
        },
        "Earlier draft restored. Review it before exporting or approving again.",
        { scope: jobFinderPendingActions.resumeJob(jobId) },
      ),
    onRunAgentDiscovery: () => runDiscoveryAction(),
    onRunDiscoveryForTarget: (targetId: string) => runDiscoveryAction(targetId),
    onRunSourceDebug: (targetId: string) => {
      sourceDebugRunIdRef.current += 1;
      const runId = sourceDebugRunIdRef.current;
      const scope = jobFinderPendingActions.sourceDebug(targetId);
      void withPendingScope(scope, async () => {
        setActionState({
          message: "Starting source debug and attaching the browser profile...",
        });

        try {
          const nextWorkspace = await actions.runSourceDebug(
            targetId,
            (progressEvent) => {
              if (sourceDebugRunIdRef.current !== runId) {
                return;
              }

              setActionState({
                message: progressEvent.message,
              });
            },
          );

          if (sourceDebugRunIdRef.current !== runId) {
            return;
          }

          setActionState({
            message: buildSourceDebugOutcomeMessage(nextWorkspace, targetId),
          });
        } catch (error) {
          if (sourceDebugRunIdRef.current !== runId) {
            return;
          }

          const message =
            error instanceof Error
              ? error.message
              : "The requested Job Finder action failed.";
          setActionState({ message });
        }
      });
    },
    onResumeProfileSetup: (step?: ProfileSetupStep) =>
      void runAction(
        () =>
          actions.saveProfileSetupState({
            ...(profileSetupState ?? {
              status: "not_started",
              currentStep: "import",
              completedAt: null,
              reviewItems: [],
              lastResumedAt: null,
            }),
            status:
              profileSetupState?.status === "completed"
                ? "completed"
                : "in_progress",
            currentStep: step ?? profileSetupState?.currentStep ?? "import",
            lastResumedAt: new Date().toISOString(),
          }),
        () => {
          navigate("/job-finder/profile/setup");
        },
        null,
        { scope: jobFinderPendingActions.profileSetup() },
      ),
    onSaveSetupStep: (
      profile: CandidateProfile,
      searchPreferences: JobSearchPreferences,
      nextStep: ProfileSetupStep,
      options?: {
        message?: string;
        openProfile?: boolean;
        stayOnCurrentStep?: boolean;
      },
    ) => {
      const savedMessage =
        options?.message ??
        (options?.openProfile
          ? "Saved and opened the full Profile editor."
          : nextStep === "ready_check"
            ? "Saved and refreshed your readiness check."
            : options?.stayOnCurrentStep
              ? "Saved this step."
              : `Saved and moved to ${nextStep.replaceAll("_", " ")}.`);

      return void runSaveAction({
        action: () => actions.saveWorkspaceInputs(profile, searchPreferences),
        dedupeKey: createSaveDedupeKey(
          nextStep === "answers" ? "answers" : "profile",
          {
            profile,
            searchPreferences,
            nextStep,
            options,
          },
        ),
        failedFallback:
          "This setup step was not saved. Retry before leaving setup.",
        label: nextStep === "answers" ? "Saved answers" : "Profile setup",
        onSuccess: (snapshot) => {
          const nextStatus =
            nextStep === "ready_check" &&
            snapshot.profileSetupState.reviewItems.every(
              (item) =>
                item.status !== "pending" || item.severity === "optional",
            )
              ? "completed"
              : "in_progress";

          return actions
            .saveProfileSetupState({
              ...snapshot.profileSetupState,
              status: nextStatus,
              currentStep:
                nextStatus === "completed"
                  ? "ready_check"
                  : options?.stayOnCurrentStep
                    ? snapshot.profileSetupState.currentStep
                    : nextStep,
              completedAt:
                nextStatus === "completed"
                  ? (snapshot.profileSetupState.completedAt ??
                    new Date().toISOString())
                  : null,
              lastResumedAt: new Date().toISOString(),
            })
            .then((updatedSnapshot) => {
              if (
                options?.openProfile ||
                updatedSnapshot.profileSetupState.status === "completed"
              ) {
                navigate("/job-finder/profile");
                return;
              }

              if (locationPathname !== "/job-finder/profile/setup") {
                navigate("/job-finder/profile/setup");
              }
            });
        },
        savedMessage,
        scope: jobFinderPendingActions.profileSetup(),
        surface: nextStep === "answers" ? "answers" : "profile",
      });
    },
    onSaveAll: (
      profile: CandidateProfile,
      searchPreferences: JobSearchPreferences,
    ) =>
      void runSaveAction({
        action: () => actions.saveWorkspaceInputs(profile, searchPreferences),
        dedupeKey: createSaveDedupeKey("answers", {
          profile,
          searchPreferences,
        }),
        failedFallback:
          "Profile and saved answers were not saved. Retry before leaving this page.",
        label: "Profile and saved answers",
        onSuccess: () => undefined,
        savedMessage: "Profile and saved answers saved.",
        scope: jobFinderPendingActions.profileMutation(),
        surface: "answers",
      }),
    onSaveResumeDraft: (draft: ResumeDraft) =>
      void runSaveAction({
        action: () => actions.saveResumeDraft(draft),
        dedupeKey: createSaveDedupeKey("resume", draft),
        failedFallback:
          "Resume draft was not saved. Retry before leaving Resume Studio.",
        label: "Resume draft",
        onSuccess: async () => {
          await refreshResumeWorkspace(draft.jobId);
        },
        savedMessage: "Draft saved.",
        scope: jobFinderPendingActions.resumeJob(draft.jobId),
        surface: "resume",
      }),
    onSaveResumeDraftAndThen: (
      draft: ResumeDraft,
      next: () => void | Promise<void>,
      successMessage?: string | null,
    ) =>
      void (async () => {
        const jobId = draft.jobId;
        let saveSucceeded = false;

        await runSaveAction({
          action: () => actions.saveResumeDraft(draft),
          dedupeKey: createSaveDedupeKey("resume", draft),
          failedFallback:
            "Resume draft was not saved. Retry before continuing.",
          label: "Resume draft",
          onSuccess: async () => {
            saveSucceeded = await refreshResumeWorkspace(jobId);
          },
          savedMessage: successMessage ?? "Changes saved.",
          scope: jobFinderPendingActions.resumeJob(jobId),
          surface: "resume",
        });

        if (saveSucceeded && isCurrentResumeWorkspaceJob(jobId)) {
          try {
            await next();
          } catch (error) {
            console.error("Resume workspace follow-up action failed.", error);
            setActionState({
              message:
                error instanceof Error
                  ? `Changes were saved, but the follow-up action failed. ${error.message}`
                  : "Changes were saved, but the follow-up action failed.",
            });
          }
        }
      })(),
    onApplyResumePatch: (
      patch: ResumeDraftPatch,
      revisionReason?: string | null,
    ) => {
      if (!activeRouteResumeWorkspace) {
        setActionState({
          message:
            "Open a resume workspace before applying an assistant change.",
        });
        return;
      }

      const jobId = activeRouteResumeWorkspace.job.id;
      return void runSaveAction({
        action: () => actions.applyResumePatch(patch, revisionReason),
        dedupeKey: createSaveDedupeKey("resume", {
          jobId,
          patch,
          revisionReason,
        }),
        failedFallback:
          "The assistant resume change was not saved. Retry before leaving this page.",
        label: "Resume assistant change",
        onSuccess: async () => {
          await refreshResumeWorkspace(jobId, {
            updateAssistantMessages: true,
          });
        },
        savedMessage: "Resume updated.",
        scope: jobFinderPendingActions.resumeJob(jobId),
        surface: "resume",
      });
    },
    onSaveProfile: (profile: CandidateProfile) =>
      void runSaveAction({
        action: () => actions.saveProfile(profile),
        dedupeKey: createSaveDedupeKey("profile", profile),
        failedFallback:
          "Profile was not saved. Retry before leaving this page.",
        label: "Profile",
        onSuccess: () => undefined,
        savedMessage: "Profile saved.",
        scope: jobFinderPendingActions.profileMutation(),
        surface: "profile",
      }),
    onExportResumePdf: (jobId: string) =>
      void runResumeWorkspaceAction(
        () => actions.exportResumePdf(jobId),
        async () => {
          await refreshResumeWorkspace(jobId);
        },
        "PDF exported for review.",
        { scope: jobFinderPendingActions.resumeJob(jobId) },
      ),
    onSaveSearchPreferences: (searchPreferences: JobSearchPreferences) =>
      void runSaveAction({
        action: () => actions.saveSearchPreferences(searchPreferences),
        dedupeKey: createSaveDedupeKey("profile", searchPreferences),
        failedFallback:
          "Job-search preferences were not saved. Retry before leaving this page.",
        label: "Job-search preferences",
        onSuccess: () => undefined,
        savedMessage: "Job-search preferences saved.",
        scope: jobFinderPendingActions.profileMutation(),
        surface: "profile",
      }),
    onClearResumeApproval: (jobId: string) =>
      void runResumeWorkspaceAction(
        () => actions.clearResumeApproval(jobId),
        async () => {
          await refreshResumeWorkspace(jobId);
        },
        "Approved PDF removed.",
        { scope: jobFinderPendingActions.resumeJob(jobId) },
      ),
    onSaveSettings: (settings: JobFinderSettings) =>
      runSaveAction({
        action: () => {
          const applicationCrm =
            settings.applicationCrm ?? workspace.settings.applicationCrm;
          return actions.saveSettings({
            ...workspace.settings,
            ...settings,
            ...(applicationCrm ? { applicationCrm } : {}),
          });
        },
        dedupeKey: createSaveDedupeKey("settings", settings),
        failedFallback:
          "Settings were not saved. Retry before leaving this page.",
        label: "Settings",
        onSuccess: () => undefined,
        savedMessage:
          settings.resumeApplicationMode === "original_resume"
            ? "Settings saved. Newly shortlisted jobs will start with your original CV unchanged."
            : "Settings saved. Newly shortlisted jobs will start with a tailored CV.",
        scope: jobFinderPendingActions.settingsSave(),
        surface: "settings",
      }),
    onSendProfileCopilotMessage: (
      content: string,
      context?: ProfileCopilotContext,
    ) =>
      void (async () => {
        const requestToken = ++profileCopilotRequestTokenRef.current;
        const effectiveContext = context ?? { surface: "general" as const };
        const contextKey = getProfileCopilotContextKey(effectiveContext);
        const createdAt = new Date().toISOString();
        const optimisticUserMessage: ProfileCopilotMessage = {
          id: `profile_copilot_user_optimistic_${contextKey}_${Date.now()}`,
          role: "user",
          content,
          context: effectiveContext,
          patchGroups: [],
          createdAt,
        };

        setOptimisticProfileCopilotMessages((current) => [
          ...current,
          optimisticUserMessage,
        ]);
        setProfileCopilotBusy(true);
        setProfileCopilotPendingContextKey(contextKey);
        setActionState((current) =>
          current.message === null ? current : { ...current, message: null },
        );

        try {
          await actions.sendProfileCopilotMessage(content, effectiveContext);

          if (requestToken !== profileCopilotRequestTokenRef.current) {
            return;
          }

          setOptimisticProfileCopilotMessages([]);
          setProfileCopilotBusy(false);
          setProfileCopilotPendingContextKey(null);
          setActionState({
            message: "Profile Copilot replied.",
          });
        } catch (error) {
          if (requestToken !== profileCopilotRequestTokenRef.current) {
            return;
          }

          const message =
            error instanceof Error
              ? error.message
              : "The requested Job Finder action failed.";
          setOptimisticProfileCopilotMessages([]);
          setProfileCopilotBusy(false);
          setProfileCopilotPendingContextKey(null);
          setActionState({ message });
        }
      })(),
    onUndoProfileRevision: (revisionId: string) =>
      void runAction(
        () => actions.undoProfileRevision(revisionId),
        () => undefined,
        "Last assistant change was undone.",
        { scope: jobFinderPendingActions.profileMutation() },
      ),
    onSaveResumeStrategy: (input: SaveResumeStrategyInput) =>
      runAction(
        () => actions.saveResumeStrategy(input),
        () => undefined,
        input.id
          ? "Resume strategy updated. Reusing it never approves or readies any resume artifact."
          : "Resume strategy created. Reusing it never approves or readies any resume artifact.",
        { scope: jobFinderPendingActions.resumeStrategySave() },
      ),
    onDisableResumeStrategy: (strategyId: string) =>
      void runAction(
        () => actions.disableResumeStrategy(strategyId),
        () => undefined,
        "Resume strategy disabled. It will no longer be recommended or selectable.",
        { scope: jobFinderPendingActions.resumeStrategyDisable(strategyId) },
      ),
    onSelectResumeStrategy: (input: SelectResumeStrategyInput) =>
      void runAction(
        () => actions.selectResumeStrategy(input),
        () => undefined,
        "Strategy chosen for this job. The job's resume still needs its own review and approval before it can be used.",
        { scope: jobFinderPendingActions.resumeStrategySelect(input.jobId) },
      ),
    onRecommendResumeStrategy: async (
      input: RecommendResumeStrategyInput,
    ): Promise<ResumeStrategyRecommendation | null> => {
      const scope = jobFinderPendingActions.resumeStrategyRecommend(
        input.jobId,
      );

      try {
        return await withPendingScope(scope, () =>
          actions.recommendResumeStrategy(input),
        );
      } catch (error) {
        setActionState({
          message: getJobFinderErrorMessage(
            error,
            "The strategy recommendation could not be loaded.",
          ),
        });
        return null;
      }
    },
    onSetCampaignResumeStrategyDefault: (
      input: SetCampaignResumeStrategyDefaultInput,
    ) =>
      void runAction(
        () => actions.setCampaignResumeStrategyDefault(input),
        () => undefined,
        input.strategyId === null
          ? "Campaign default resume strategy cleared."
          : "Campaign default resume strategy assigned. It only affects future recommendations.",
        {
          scope: jobFinderPendingActions.resumeStrategyCampaignDefault(
            input.campaignId,
          ),
        },
      ),
    onSendResumeAssistantMessage: (jobId: string, content: string) =>
      void (async () => {
        const requestJobId = jobId;
        const requestToken = ++resumeAssistantRequestTokenRef.current;
        const createdAt = new Date().toISOString();
        const optimisticUserMessage: ResumeAssistantMessage = {
          id: `resume_message_user_optimistic_${jobId}_${requestToken}`,
          jobId,
          role: "user",
          content,
          patches: [],
          proposalStatus: "none",
          baseDraftUpdatedAt: null,
          resolvedPatchIds: [],
          resolvedAt: null,
          proposalError: null,
          createdAt,
        };
        const optimisticAssistantMessage: ResumeAssistantMessage = {
          id: `resume_message_assistant_pending_${jobId}_${requestToken}`,
          jobId,
          role: "assistant",
          content: "Updating your draft...",
          patches: [],
          proposalStatus: "none",
          baseDraftUpdatedAt: null,
          resolvedPatchIds: [],
          resolvedAt: null,
          proposalError: null,
          createdAt,
        };
        const scope = jobFinderPendingActions.resumeJob(jobId);

        setPendingActionState((current) =>
          incrementPendingScope(current, scope),
        );
        setResumeAssistantPending(true);
        setResumeAssistantMessages((current) => [
          ...current,
          optimisticUserMessage,
          optimisticAssistantMessage,
        ]);
        setActionState({
          message: "Assistant is updating your draft...",
        });

        try {
          const messages = await actions.sendResumeAssistantMessage(
            jobId,
            content,
          );
          const assistantReply = [...messages]
            .reverse()
            .find((message) => message.role === "assistant");
          const proposedCount = assistantReply?.patches.length ?? 0;

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
                : "The editor could not refresh automatically.";
          }

          if (isCurrentResumeAssistantRequest(requestJobId, requestToken)) {
            setActionState({
              message:
                refreshMessage !== null
                  ? `Assistant finished${proposedCount > 0 ? ` and proposed ${proposedCount} change${proposedCount === 1 ? "" : "s"}` : ""}, but the editor could not refresh automatically. ${refreshMessage}`
                  : proposedCount > 0
                    ? `Assistant proposed ${proposedCount} change${proposedCount === 1 ? "" : "s"}. Review and accept the changes you want.`
                    : "Assistant finished and shared a reply with no direct resume changes.",
            });
          }
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "The requested resume action failed.";
          if (isCurrentResumeAssistantRequest(requestJobId, requestToken)) {
            setResumeAssistantPending(false);
            setResumeAssistantMessages((current) =>
              current.filter(
                (entry) =>
                  entry.id !== optimisticUserMessage.id &&
                  entry.id !== optimisticAssistantMessage.id,
              ),
            );
            setActionState({ message });
          }
        } finally {
          setPendingActionState((current) =>
            decrementPendingScope(current, scope),
          );
        }
      })(),
    onResolveResumeAssistantProposal: (
      jobId: string,
      proposalId: string,
      action: "accept" | "reject",
      patchIds: readonly string[],
    ) =>
      void (async () => {
        const scope = jobFinderPendingActions.resumeJob(jobId);
        setPendingActionState((current) =>
          incrementPendingScope(current, scope),
        );
        try {
          const messages = await actions.resolveResumeAssistantProposal(
            jobId,
            proposalId,
            action,
            patchIds,
          );
          setResumeAssistantMessages(messages);
          const nextWorkspace = await actions.getResumeWorkspace(jobId);
          if (isCurrentResumeWorkspaceJob(nextWorkspace.job.id)) {
            setResumeWorkspace(nextWorkspace);
          }
          setActionState({
            message:
              action === "accept"
                ? `Applied ${patchIds.length} approved guided edit${patchIds.length === 1 ? "" : "s"}. Undo is available in version history.`
                : "Guided edits proposal rejected. The resume was not changed.",
          });
        } catch (error) {
          try {
            setResumeAssistantMessages(
              await actions.getResumeAssistantMessages(jobId),
            );
          } catch {
            // The primary failure remains visible in the page action state.
          }
          setActionState({
            message:
              error instanceof Error
                ? error.message
                : "The guided edits proposal could not be resolved.",
          });
        } finally {
          setPendingActionState((current) =>
            decrementPendingScope(current, scope),
          );
        }
      })(),
  };
}
