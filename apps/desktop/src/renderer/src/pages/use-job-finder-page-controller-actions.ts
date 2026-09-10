import {
  formatPrepareApplicationDescription,
  formatPrepareApplicationSubject,
  JOB_FINDER_BROWSER_NAME,
  JOB_FINDER_BROWSER_NAME_SENTENCE_START,
} from "@renderer/features/job-finder/lib/job-finder-browser-handoff-copy";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { JobFinderActionFailureReporting } from "./job-finder-page-context";
import {
  appendDiscoveryLiveActivityEvent,
  evaluateProfileSetupReadiness,
  isRunnableJobDiscoveryTarget,
} from "@unemployed/contracts";
import type {
  AppearanceTheme,
  ApplicationCrmSettings,
  CandidateProfile,
  DiscoveryActivityEvent,
  DiscoveryFeedbackReason,
  JobFinderAgentDiscoveryResult,
  JobFinderApplyConsentActionInput,
  JobFinderApplyRunActionInput,
  JobFinderResumeWorkspace,
  JobFinderApplicationStartTarget,
  ReviewQueueItem,
  JobFinderOpenBrowserSessionInput,
  JobFinderWorkspaceSnapshot,
  ProfileCopilotMessage,
  JobSearchPreferences,
  ProfileCopilotContext,
  ProfileSetupReviewActionOptions,
  ProfileSetupState,
  ProfileSetupStep,
  RecommendResumeStrategyInput,
  RemoveEmployerExclusionInput,
  ResumeAssistantMessage,
  ResumeApplicationMode,
  ResumeDraft,
  ResumeDraftPatch,
  ResumeStrategyRecommendation,
  SaveResumeStrategyInput,
  SelectResumeStrategyInput,
  SetCampaignResumeStrategyDefaultInput,
  UpdateApplicationDefaultsInput,
  UpdateWorkspaceBehaviorInput,
} from "@unemployed/contracts";
import {
  countTailoredDraftPreparationEligible,
  getTailoredDraftPreparationCandidates,
  getTailoredDraftPreparationResultMessage,
  prepareTailoredDraftsSequentially,
  type TailoredDraftPreparationViewState,
} from "@renderer/features/job-finder/screens/review-queue/review-queue-status";
import {
  formatDailyPreparationCapacityReachedText,
  isDailyPreparationCapacityExhausted,
} from "@renderer/features/job-finder/lib/job-finder-daily-capacity";
import { isFinishBlockingReviewItem } from "@renderer/features/job-finder/components/profile/setup/profile-setup-screen-helpers";
import type {
  ActionState,
  JobFinderAutoApplyQueueStartOutcome,
  JobFinderQueuedJobOutcome,
  JobFinderShellActions,
} from "@renderer/features/job-finder/lib/job-finder-types";
import {
  createDiscoveryRunCancelledFeedback,
  createDiscoveryRunFailedFeedback,
  createDiscoveryRunInterruptedFeedback,
  createDiscoveryRunRefreshIncompleteFeedback,
  createDiscoveryRunRepeatedFeedback,
  createDiscoveryRunStartedFeedback,
  createDiscoveryRunSucceededFeedback,
  getDiscoveryCancelledSavedJobCount,
  shouldPresentRepeatedDiscoveryFeedback,
  type DiscoveryRunFeedback,
} from "@renderer/features/job-finder/screens/discovery/discovery-run-feedback";
import {
  buildWorkHistoryReviewAcknowledgmentCommandInput,
  type ResumeWorkHistoryDecisionRequest,
} from "@renderer/features/job-finder/screens/review-queue/resume-workspace-work-history-decisions";
import {
  clearPendingActionScopes,
  getPendingActionGeneration,
  invalidatePendingActionScope,
  type PendingActionScope,
  type PendingActionState,
  jobFinderPendingActions,
} from "./job-finder-pending-actions";
import { getProfileCopilotContextKey } from "@renderer/features/job-finder/lib/profile-copilot-context";
import {
  getJobFinderErrorDetail,
  getJobFinderErrorMessage,
} from "@renderer/features/job-finder/lib/job-finder-error-message";
import { buildResumeWorkspaceRoute } from "@renderer/features/job-finder/lib/resume-workspace-route";
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
  confirmLeaveDirtyResumeWorkspace: (pendingAction: string) => Promise<boolean>;
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
    subject: string | null;
    description: string;
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
  setTailoredDraftPreparation: Dispatch<
    SetStateAction<TailoredDraftPreparationViewState>
  >;
  tailoredDraftPreparationRunRef: MutableRefObject<boolean>;
  tailoredDraftPreparationStopRequestedRef: MutableRefObject<boolean>;
  tailoredDraftPreparationDisposedRef: MutableRefObject<boolean>;
  setDiscoveryRunFeedback: Dispatch<
    SetStateAction<DiscoveryRunFeedback | null>
  >;
  sourceDebugRunIdRef: MutableRefObject<number>;
  latestWorkspaceRef: MutableRefObject<JobFinderWorkspaceSnapshot | null>;
  workspace: JobFinderWorkspaceSnapshot;
  saveCoordinator: JobFinderSaveCoordinator;
};

const handledRefreshErrorTag = Symbol("handledRefreshError");

export const DISCOVERY_PROGRESS_REFRESH_INTERVAL_MS = 250;

/**
 * Single-flight guard for discovery runs. This lives at module scope on
 * purpose: `createPrimaryPageActions` re-runs on every
 * `buildJobFinderPageContext` rebuild (live events, workspace, action state),
 * so a closure-local flag would reset and let a second rapid call launch a
 * duplicate run. The synchronous check-and-set below is atomic because the
 * renderer is single-threaded, and the flag survives every rebuild.
 */
let isDiscoveryRunActive = false;

/**
 * Single-flight guard for the tailored-draft batch. Module scope for the same
 * reason as `isDiscoveryRunActive`: replacing an unmounted controller creates
 * fresh refs that cannot see a run parked by the previous controller. The
 * synchronous check-and-set is atomic because the renderer is single-threaded.
 * A disposed controller asks its parked run to stop at the next item
 * boundary; until that run releases the guard in `finally`, this flag blocks
 * duplicate starts from a replacement controller. It covers in-session
 * lifetimes only; it never survives a full reload.
 */
let isTailoredDraftPreparationRunActive = false;

/**
 * Route ownership for the single page-level action status (`ActionState`).
 * The page controller publishes the currently rendered route here on every
 * render and records each in-app navigation target; every status write
 * resolves its owning route from `resolveStatusOwner`. The controller then
 * derives the visible message so a status produced by one route's operation
 * can never display on an unrelated sibling route, while an action that
 * navigates as part of its own completion keeps its message on the
 * destination. Module scope is required for the same reason as the
 * single-flight guards above: `createActionRunners` and
 * `createPrimaryPageActions` re-run on every context rebuild.
 */
let jobFinderStatusRoute: string | null = null;
let jobFinderNavigationHint: string | null = null;

export function setJobFinderStatusRoute(pathname: string | null): void {
  jobFinderStatusRoute = pathname;
}

/**
 * Records a navigation the controller is about to perform. The hint is
 * resolved by the next status write so an action that navigates during its
 * own completion carries its status to the destination route. The controller
 * clears the hint once the navigation commits or is blocked, so a stale hint
 * can never outlive its own route change.
 */
export function noteJobFinderNavigation(pathname: string): void {
  jobFinderNavigationHint = pathname;
}

/**
 * Set while a just-finished guided setup is handing the user off to Find
 * jobs. The setup route consults it so its completed-state redirect targets
 * Find jobs instead of Profile for that one transition.
 */
let profileSetupJustFinished = false;

export function markProfileSetupJustFinished(): void {
  profileSetupJustFinished = true;
}

export function clearProfileSetupJustFinished(): void {
  profileSetupJustFinished = false;
}

export function isProfileSetupJustFinished(): boolean {
  return profileSetupJustFinished;
}

export function clearJobFinderNavigationHint(): void {
  jobFinderNavigationHint = null;
}

/**
 * A status write that carries its owning route. The controller's scoped
 * setter strips this property before storing the visible `ActionState`, so
 * screens never observe it.
 */
export type ActionStateStatusWrite = ActionState & { ownerPath?: string };

/**
 * The route that owns a status written right now: an explicit destination
 * wins, then a navigation performed in this same action turn, then the route
 * where the action started (captured by the caller). The start route keeps
 * late completions from landing on an unrelated route the user navigated to
 * while the action was still running.
 */
function resolveStatusOwner(
  explicitOwnerPath: string | null,
  startRoute: string | null,
): string | null {
  return explicitOwnerPath ?? jobFinderNavigationHint ?? startRoute;
}

function writeActionStateWithOwner(
  setActionState: Dispatch<SetStateAction<ActionState>>,
  next: ActionState,
  ownerPath: string | null,
): void {
  if (ownerPath !== null && next.message !== null) {
    const carried: ActionStateStatusWrite = {
      message: next.message,
      ownerPath,
    };
    setActionState(carried);
    return;
  }
  setActionState(next);
}

export type DiscoveryWorkspaceRefreshCoordinator = {
  notifySourceCompleted: () => void;
  notifyJobsPersisted: () => void;
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
    notifyJobsPersisted: () => {
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

function getActiveCampaignReviewQueue(
  snapshot: JobFinderWorkspaceSnapshot | null,
): ReviewQueueItem[] {
  if (!snapshot) {
    return [];
  }

  const activeCampaign = snapshot.campaigns?.find(
    (campaign) => campaign.id === snapshot.activeCampaignId,
  );
  const campaignJobIds = new Set(activeCampaign?.jobIds ?? []);
  return (snapshot.reviewQueue ?? []).filter((item) =>
    campaignJobIds.has(item.jobId),
  );
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
    const pendingGeneration = getPendingActionGeneration(scope);

    try {
      return await action();
    } finally {
      // A route/reload may retire a native-dialog operation before its IPC
      // promise settles. Do not let that stale finally decrement a newer
      // operation that reused this scope.
      if (getPendingActionGeneration(scope) === pendingGeneration) {
        setPendingActionState((current) =>
          decrementPendingScope(current, scope),
        );
      }
    }
  };

  const runAction = async <TResult>(
    action: () => Promise<TResult>,
    onSuccess: (result: TResult) => void | Promise<void>,
    successMessage: string | null | ((result: TResult) => string | null),
    options?: ActionOptions,
  ): Promise<boolean> => {
    const pendingScope = resolvePendingScope(options);
    const ownerStartRoute = jobFinderStatusRoute;
    const applyStatusMessage = (next: ActionState) =>
      writeActionStateWithOwner(
        setActionState,
        next,
        resolveStatusOwner(null, ownerStartRoute),
      );

    try {
      if (options?.clearMessageOnStart !== false) {
        applyStatusMessage({ message: options?.startMessage ?? null });
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
          applyStatusMessage({
            message: `Action completed, but the current view could not refresh automatically. ${detail}`,
          });
          return;
        }

        applyStatusMessage({
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
      applyStatusMessage({ message });
      if (options?.rethrowError) {
        throw error instanceof Error ? error : new Error(message);
      }
      return false;
    }
  };

  const runResumeWorkspaceAction = async <TResult>(
    action: () => Promise<TResult>,
    onSuccess: (result: TResult) => void | Promise<void>,
    successMessage: string | null | ((result: TResult) => string | null),
    options?: ActionOptions,
  ) => {
    const ownerStartRoute = jobFinderStatusRoute;
    const applyStatusMessage = (next: ActionState) =>
      writeActionStateWithOwner(
        setActionState,
        next,
        resolveStatusOwner(null, ownerStartRoute),
      );

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
          applyStatusMessage({
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
    /**
     * When true, a successful save reports only through the shared save
     * toast: the route-level action message is cleared instead of receiving
     * a second, never-dismissing copy of the same confirmation. Failures
     * still land in the route message.
     */
    routeSuccessMessage?: "toast_only";
  }) => {
    const suppressRouteSuccess = input.routeSuccessMessage === "toast_only";
    const ownerStartRoute = jobFinderStatusRoute;
    // Saves resolve their owner per write: a save that navigates as part of
    // its own completion (setup finish, profile handoff) carries its status to
    // the destination instead of pinning it to the route where it started.
    const applyStatusMessage = (next: ActionState) =>
      writeActionStateWithOwner(
        setActionState,
        next,
        resolveStatusOwner(null, ownerStartRoute),
      );

    if (!saveCoordinator) {
      // Without a coordinator there is no deduped save state, but the caller
      // still needs the real outcome so a resolved false stays a failure and
      // a committed save is not reported as failed.
      return runAction(input.action, input.onSuccess, input.savedMessage, {
        scope: input.scope,
        startMessage: `Saving ${input.label.toLowerCase()}…`,
      });
    }

    applyStatusMessage({ message: `Saving ${input.label.toLowerCase()}…` });
    const result = await saveCoordinator.run({
      dedupeKey: input.dedupeKey,
      execute: (fence) =>
        withPendingScope(input.scope, async () => {
          applyStatusMessage({
            message: `Saving ${input.label.toLowerCase()}…`,
          });
          const value = await input.action();
          await input.onSuccess(value);
          // Route success text is fenced by the save operation token: an
          // older save settling late must never overwrite the status a
          // newer operation already owns.
          if (!fence || fence.isCurrent()) {
            applyStatusMessage({
              message: suppressRouteSuccess ? null : input.savedMessage,
            });
          }
          return value;
        }),
      failedMessage: (error) => {
        const message = getJobFinderErrorMessage(error, input.failedFallback);
        applyStatusMessage({ message });
        return message;
      },
      label: input.label,
      savedMessage: input.savedMessage,
      surface: input.surface,
    });

    // The coordinator marks a settled operation `superseded` when a newer
    // save operation started before it finished. Such a completion — success
    // or failure — must stay silent here so it cannot clobber the newer
    // operation's route status.
    if (!result.superseded) {
      applyStatusMessage({
        message:
          result.status === "saved"
            ? suppressRouteSuccess
              ? null
              : input.savedMessage
            : getJobFinderErrorMessage(result.error, input.failedFallback),
      });
    }
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
      successMessage: string | null | ((result: TResult) => string | null),
      options?: ActionOptions,
    ) => Promise<void>;
    runSaveAction: <TResult>(input: {
      action: () => Promise<TResult>;
      dedupeKey: string;
      failedFallback: string;
      label: string;
      onSuccess: (result: TResult) => void | Promise<void>;
      routeSuccessMessage?: "toast_only";
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
    setTailoredDraftPreparation,
    tailoredDraftPreparationRunRef,
    tailoredDraftPreparationStopRequestedRef,
    tailoredDraftPreparationDisposedRef,
    setDiscoveryRunFeedback,
    sourceDebugRunIdRef,
    latestWorkspaceRef,
    workspace,
  } = args;

  function getConfiguredSourceTarget(targetId: string) {
    return (
      workspace.searchPreferences.discovery.targets.find(
        (target) => target.id === targetId,
      ) ?? null
    );
  }

  // Route-scopes every status write that is not already owned by an action
  // runner: the write belongs to the route where its handler started, so a
  // completion that lands after an unrelated sibling-route change stays hidden
  // on its owning route instead of leaking onto the new one.
  const applyRouteScopedMessage = (
    next: ActionState,
    ownerStartRoute: string | null = jobFinderStatusRoute,
  ) =>
    writeActionStateWithOwner(
      setActionState,
      next,
      resolveStatusOwner(null, ownerStartRoute),
    );

  // Pre-action backstop for the fixed local-day preparation safeguard. The
  // start surfaces disable their own controls when nothing remains, but any
  // caller that still reaches a start handler must see the refusal as a
  // visible actionable status instead of a dialog flowing into a no-op.
  const getDailyCapacityRefusalMessage = (): string | null => {
    const capacity =
      workspace?.dashboard?.globalDailyApplicationPreparationCapacity ?? null;
    if (!capacity || !isDailyPreparationCapacityExhausted(capacity)) {
      return null;
    }
    return formatDailyPreparationCapacityReachedText(capacity);
  };

  const runDiscoveryAction = (targetId?: string) => {
    if (isDiscoveryRunActive) {
      return;
    }

    const target = targetId ? getConfiguredSourceTarget(targetId) : null;
    const targetLabel = target?.label ?? null;
    const hasRunnableSource = targetId
      ? target !== null && isRunnableJobDiscoveryTarget(target)
      : workspace.searchPreferences.discovery.targets.some(
          isRunnableJobDiscoveryTarget,
        );

    if (!hasRunnableSource) {
      const feedback = createDiscoveryRunFailedFeedback({
        detail: targetId
          ? "This job source is missing, disabled, or does not have a valid public URL."
          : "Add or enable at least one valid public job-source URL before searching.",
        targetLabel,
      });
      setDiscoveryRunFeedback(feedback);
      return;
    }

    isDiscoveryRunActive = true;
    setLiveDiscoveryEvents([]);
    setDiscoveryRunFeedback(createDiscoveryRunStartedFeedback(targetLabel));

    let sawDiscoveryProgress = false;
    // Typed terminal outcome from the discovery IPC return. Main classifies
    // it authoritatively (service terminal state or an escaped AbortError),
    // so a user-cancelled run can never fall through to success feedback.
    let agentDiscoveryResult: JobFinderAgentDiscoveryResult | null = null;
    // `runAction` only returns a boolean success flag, so keep the final
    // refreshed workspace here for truthful zero-new / duplicate feedback.
    let refreshedDiscoverySnapshot: JobFinderWorkspaceSnapshot | null = null;

    void runAction(
      async () => {
        const refreshCoordinator = createDiscoveryWorkspaceRefreshCoordinator(
          actions.refreshWorkspace,
        );

        try {
          agentDiscoveryResult = await actions.runAgentDiscovery((event) => {
            sawDiscoveryProgress = true;
            setLiveDiscoveryEvents((current) =>
              appendDiscoveryLiveActivityEvent(current, event),
            );

            if (event.terminalState === "completed" && event.targetId) {
              refreshCoordinator.notifySourceCompleted();
            } else if (
              !event.terminalState &&
              event.stage === "persistence" &&
              (event.jobsPersisted ?? 0) + (event.jobsStaged ?? 0) > 0
            ) {
              // Mid-run checkpoint persistence committed usable jobs; refresh
              // so Results can show them while the source keeps searching.
              refreshCoordinator.notifyJobsPersisted();
            }
          }, targetId);

          // Finish with one authoritative workspace read after any bounded
          // progressive refresh has settled. A slower snapshot requested for
          // an earlier source cannot win a race against the completed run.
          const finalSnapshot = await refreshCoordinator.flushFinal();
          refreshedDiscoverySnapshot =
            finalSnapshot &&
            typeof finalSnapshot === "object" &&
            finalSnapshot !== null &&
            "recentDiscoveryRuns" in finalSnapshot
              ? (finalSnapshot as JobFinderWorkspaceSnapshot)
              : null;
          return refreshedDiscoverySnapshot;
        } finally {
          refreshCoordinator.dispose();
          setLiveDiscoveryEvents([]);
        }
      },
      () => undefined,
      // Discovery terminal copy lives in discoveryRunFeedback only; never
      // mirror it on the shared route action surface.
      () => null,
      {
        rethrowError: true,
        scope: targetId
          ? jobFinderPendingActions.discoveryTarget(targetId)
          : jobFinderPendingActions.discoveryAll(),
      },
    )
      .then((completed) => {
        if (agentDiscoveryResult?.outcome === "cancelled") {
          // The run was stopped deliberately; incrementally committed jobs
          // stay visible through the final refresh above, and the feedback
          // must say stopped — never success, never failure.
          const feedback = createDiscoveryRunCancelledFeedback({
            savedJobCount: getDiscoveryCancelledSavedJobCount(
              agentDiscoveryResult.snapshot.recentDiscoveryRuns,
            ),
            targetLabel,
          });
          setDiscoveryRunFeedback(feedback);
          return;
        }

        if (!completed) {
          // Terminal path for a handled refresh error after the search
          // itself finished: never leave the started feedback in place.
          const feedback =
            createDiscoveryRunRefreshIncompleteFeedback(targetLabel);
          setDiscoveryRunFeedback(feedback);
          return;
        }

        const discoveryRuns =
          refreshedDiscoverySnapshot?.recentDiscoveryRuns ??
          agentDiscoveryResult?.snapshot.recentDiscoveryRuns ??
          [];
        const newestRun = [...discoveryRuns].sort(
          (left, right) =>
            Date.parse(right.startedAt) - Date.parse(left.startedAt),
        )[0];
        const validJobsFound = newestRun?.summary.validJobsFound ?? 0;
        const duplicatesMerged = newestRun?.summary.duplicatesMerged ?? 0;
        setDiscoveryRunFeedback(
          shouldPresentRepeatedDiscoveryFeedback({
            duplicatesMerged,
            validJobsFound,
          })
            ? createDiscoveryRunRepeatedFeedback({
                duplicatesMerged,
                reviewedListingCount:
                  newestRun?.summary.changeDigest?.known ?? null,
                targetLabel,
              })
            : createDiscoveryRunSucceededFeedback(targetLabel),
        );
      })
      .catch((error: unknown) => {
        // The detail channel, not user copy: `createDiscoveryRun*Feedback`
        // runs its own classifier over this string to choose the specific
        // recovery action. Passing it the copy classifier's output would
        // replace a browser/source/connection cause with a generic sentence,
        // and the callout would silently fall back to "try again".
        const detail =
          getJobFinderErrorDetail(error) ?? "The search failed on this device.";
        // Progress events prove the run started; only a rejection with no
        // observed progress may claim the search could not start.
        const feedback = sawDiscoveryProgress
          ? createDiscoveryRunInterruptedFeedback({ detail, targetLabel })
          : createDiscoveryRunFailedFeedback({ detail, targetLabel });
        setDiscoveryRunFeedback(feedback);
      })
      .finally(() => {
        isDiscoveryRunActive = false;
      });
  };

  const startAutoFlow = (
    runner: () => Promise<unknown>,
    successMessage: string,
    scope: PendingActionScope,
  ) => {
    // Stay resolves false: take no action and keep every draft. Leave
    // resolves true after the controller discarded only the named draft
    // state, so the flow starts exactly once.
    void confirmLeaveDirtyResumeWorkspace("start this application flow").then(
      (mayLeave) => {
        if (!mayLeave) {
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
      },
    );
  };

  const getCampaignReviewQueue = () => {
    const activeCampaign = workspace.campaigns?.find(
      (campaign) => campaign.id === workspace.activeCampaignId,
    );
    const campaignJobIds = new Set(activeCampaign?.jobIds ?? []);
    return (workspace.reviewQueue ?? []).filter((item) =>
      campaignJobIds.has(item.jobId),
    );
  };

  // The sequential tailored-draft batch is owned here instead of the
  // Review Queue screen so that sibling route changes neither lose the run
  // nor let a rebuilt context start a duplicate. The refs live in the page
  // controller, which stays mounted across every Job Finder route change;
  // true controller teardown flips the disposed ref so the parked loop stops
  // after its current item and writes nothing further. The module-scope
  // guard blocks duplicates during the gap before a replacement controller
  // can see a fresh release.
  const prepareTailoredDrafts = () => {
    if (
      isTailoredDraftPreparationRunActive ||
      tailoredDraftPreparationRunRef.current
    ) {
      return;
    }

    const ownerStartRoute = jobFinderStatusRoute;
    const queue = getCampaignReviewQueue();
    const candidates = getTailoredDraftPreparationCandidates(queue);
    if (candidates.length === 0) {
      return;
    }

    const eligibleTotal = countTailoredDraftPreparationEligible(queue);
    const completedJobIds = new Set<string>();
    isTailoredDraftPreparationRunActive = true;
    tailoredDraftPreparationRunRef.current = true;
    tailoredDraftPreparationStopRequestedRef.current = false;

    try {
      setTailoredDraftPreparation({
        attemptedCount: 0,
        completedCount: 0,
        currentIndex: null,
        eligibleRemainingCount: Math.max(0, eligibleTotal - candidates.length),
        failedCount: 0,
        status: "running",
        totalCount: candidates.length,
      });

      void prepareTailoredDraftsSequentially(
        candidates,
        async (jobId) => {
          try {
            await withPendingScope(
              jobFinderPendingActions.resumeJob(jobId),
              () => actions.generateResume(jobId),
            );
            completedJobIds.add(jobId);
            return true;
          } catch {
            return false;
          }
        },
        {
          onProgress: ({ completedCount, currentIndex, totalCount }) => {
            if (tailoredDraftPreparationDisposedRef.current) {
              return;
            }

            setTailoredDraftPreparation((current) => ({
              ...current,
              attemptedCount: currentIndex,
              completedCount,
              currentIndex,
              totalCount,
              status: "running",
            }));
          },
          shouldStop: () =>
            tailoredDraftPreparationStopRequestedRef.current ||
            tailoredDraftPreparationDisposedRef.current,
        },
      )
        .then((result) => {
          // A disposed controller no longer owns visible state; skip the
          // final aggregate write instead of updating a dead tree.
          if (tailoredDraftPreparationDisposedRef.current) {
            return;
          }

          // The final remainder reads the newest workspace render so jobs
          // added, removed, or changed while the run was parked are counted.
          // Items this batch completed are excluded even when a not-yet-
          // refreshed snapshot still lists them as eligible; failures stay
          // counted because they remain eligible for a rerun.
          const currentQueue = getActiveCampaignReviewQueue(
            latestWorkspaceRef.current ?? workspace,
          ).filter((item) => !completedJobIds.has(item.jobId));
          const finalState: TailoredDraftPreparationViewState = {
            attemptedCount: result.attemptedCount,
            completedCount: result.completedCount,
            currentIndex: null,
            eligibleRemainingCount: Math.max(
              0,
              countTailoredDraftPreparationEligible(currentQueue),
            ),
            failedCount: result.failedCount,
            status:
              result.failedCount > 0
                ? "failed"
                : result.stopped
                  ? "stopped"
                  : "completed",
            totalCount: result.totalCount,
          };
          setTailoredDraftPreparation(finalState);
          applyRouteScopedMessage(
            {
              message: getTailoredDraftPreparationResultMessage(finalState),
            },
            ownerStartRoute,
          );
        })
        .finally(() => {
          isTailoredDraftPreparationRunActive = false;
          tailoredDraftPreparationRunRef.current = false;
        });
    } catch (error) {
      isTailoredDraftPreparationRunActive = false;
      tailoredDraftPreparationRunRef.current = false;
      throw error;
    }
  };

  return {
    onAnalyzeProfileFromResume: () => {
      if (!canImportResume) {
        applyRouteScopedMessage({ message: importResumeGuardMessage });
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
    onApproveApplyRun: (input: JobFinderApplyRunActionInput) =>
      void runAction(
        () => actions.approveApplyRun(input),
        () => undefined,
        "Safe preparation approved. Final submission and account creation remain disabled.",
        { scope: jobFinderPendingActions.applyRun(input.runId) },
      ),
    onCancelApplyRun: (input: JobFinderApplyRunActionInput) =>
      runAction(
        () => actions.cancelApplyRun(input),
        () => undefined,
        "Application preparation run cancelled.",
        { scope: jobFinderPendingActions.applyRun(input.runId) },
      ),
    onApproveApply: (jobId: string) => {
      void confirmLeaveDirtyResumeWorkspace("approve this application").then(
        (mayLeave) => {
          if (!mayLeave) {
            return;
          }

          void runAction(
            () =>
              actions.startApplyCopilotRun({
                jobId,
                visualCheckpointsEnabled: false,
              }),
            () => {
              setResumeWorkspaceDirty(false);
              navigate("/job-finder/applications");
            },
            "Applications updated. Check the latest attempt and next step there.",
            {
              scope: jobFinderPendingActions.apply(),
              startMessage: `Preparing the application in ${JOB_FINDER_BROWSER_NAME}. Job Finder has no final-submit action and never clicks Submit; verify the outcome on the site.`,
            },
          );
        },
      );
    },
    onRevokeApplyRunApproval: (input: JobFinderApplyRunActionInput) =>
      void runAction(
        () => actions.revokeApplyRunApproval(input),
        () => undefined,
        "Preparation approval revoked. Final submission remains disabled.",
        { scope: jobFinderPendingActions.applyRun(input.runId) },
      ),
    onResolveApplyConsentRequest: (input: JobFinderApplyConsentActionInput) =>
      void runAction(
        () => actions.resolveApplyConsentRequest(input),
        () => undefined,
        input.action === "approve"
          ? "Consent approved. The run resumes preparation only; Job Finder has no final-submit action and never clicks Submit. Verify the outcome on the site."
          : "Consent declined. The run skips that job; Job Finder has no final-submit action and never clicks Submit.",
        { scope: jobFinderPendingActions.applyRequest(input.requestId) },
      ),
    onStartAutoApplyQueue: async (
      jobIds: string[],
    ): Promise<JobFinderAutoApplyQueueStartOutcome> => {
      const capacityRefusal = getDailyCapacityRefusalMessage();
      if (capacityRefusal) {
        applyRouteScopedMessage({ message: capacityRefusal });
        return {
          status: "refused",
          reason: "daily_capacity_exhausted",
          message: capacityRefusal,
        };
      }

      if (jobIds.length === 0) {
        const message = "No jobs selected for auto-apply queue.";
        applyRouteScopedMessage({ message });
        return { status: "refused", reason: "empty_selection", message };
      }

      // Stay resolves false: take no action and keep every draft. Leave
      // resolves true after the controller discarded only the named draft
      // state, so the flow starts exactly once.
      const mayLeave = await confirmLeaveDirtyResumeWorkspace(
        "start this application flow",
      );
      if (!mayLeave) {
        return {
          status: "refused",
          reason: "cancelled_stayed_in_workspace",
          message: null,
        };
      }

      // Tag backend rejections separately from every other non-confirmed
      // ending: a rejected runner means no run was created (handled failure
      // with visible feedback), while any other false from runAction is an
      // ambiguous outcome where a run may exist, so staged curation stays.
      let backendRejected = false;
      const confirmed = await runAction(
        () =>
          actions.startAutoApplyQueueRun(jobIds).catch((error: unknown) => {
            backendRejected = true;
            throw error;
          }),
        () => {
          setResumeWorkspaceDirty(false);
          navigate("/job-finder/applications");
        },
        "Automatic apply queue staged. Review and approve it in Applications before any later execution step.",
        { scope: jobFinderPendingActions.apply() },
      );

      if (confirmed) {
        return { status: "confirmed" };
      }
      return backendRejected
        ? { status: "failed", message: null }
        : { status: "unknown" };
    },
    onStartAutoApply: (input: JobFinderApplicationStartTarget) => {
      const capacityRefusal = getDailyCapacityRefusalMessage();
      if (capacityRefusal) {
        applyRouteScopedMessage({ message: capacityRefusal });
        return;
      }

      startAutoFlow(
        () => actions.startAutoApplyRun(input),
        "Safe application preparation staged. Review and approve the fill-only run in Applications. Final submission and account creation remain disabled.",
        jobFinderPendingActions.apply(),
      );
    },
    onStartApplyCopilot: (input: JobFinderApplicationStartTarget) => {
      const capacityRefusal = getDailyCapacityRefusalMessage();
      if (capacityRefusal) {
        applyRouteScopedMessage({ message: capacityRefusal });
        return;
      }

      // Name the job and the employer in the consent dialog. Agreeing to
      // "Prepare application" with nothing on screen identifying the
      // application is not informed consent.
      const preparedJob = (
        latestWorkspaceRef?.current ?? workspace
      )?.discoveryJobs.find((job) => job.id === input.jobId);
      const prepareSubject = formatPrepareApplicationSubject({
        jobTitle: preparedJob?.title ?? null,
        employerName: preparedJob?.company ?? null,
      });

      requestApplyCopilotVisualCheckpoints({
        jobId: input.jobId,
        subject: prepareSubject,
        description: formatPrepareApplicationDescription(prepareSubject),
        onResolve: (visualCheckpointsEnabled) => {
          startAutoFlow(
            () =>
              actions.startApplyCopilotRun({
                ...input,
                visualCheckpointsEnabled,
              }),
            visualCheckpointsEnabled
              ? "Preparation finished with visual checkpoints. Job Finder never clicks Submit — check the result below."
              : "Preparation finished. Job Finder never clicks Submit — check the result below.",
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
    onDismissJob: async (
      jobId: string,
      reasons: readonly DiscoveryFeedbackReason[],
      action: "hide_job" | "hide_and_exclude_employer" = "hide_job",
      expectedNormalizedCompanyName: string | null = null,
    ) => {
      await runAction(
        () =>
          actions.dismissDiscoveryJob(
            jobId,
            reasons,
            action,
            expectedNormalizedCompanyName,
          ),
        () => undefined,
        action === "hide_and_exclude_employer"
          ? "Job hidden and the exact employer name excluded from future searches. Fit scoring is unchanged."
          : "Job hidden. Your reasons stay local and do not change fit scoring.",
        {
          rethrowError: true,
          scope: jobFinderPendingActions.discoveryJob(jobId),
        },
      );
    },
    onPreviewEmployerExclusion: (jobId: string) =>
      actions.previewEmployerExclusion(jobId),
    onRemoveEmployerExclusion: (input: RemoveEmployerExclusionInput) =>
      void runAction(
        () => actions.removeEmployerExclusion(input),
        () => undefined,
        "Employer allowed in future searches. The hidden job was not restored.",
        { scope: jobFinderPendingActions.discoveryJob(input.jobId) },
      ),
    onRestoreDismissedJob: (jobId: string) =>
      void runAction(
        () => actions.restoreDismissedDiscoveryJob(jobId),
        () => undefined,
        "Job restored and feedback reset.",
        { scope: jobFinderPendingActions.discoveryJob(jobId) },
      ),
    onEditResumeWorkspace: (jobId: string) => {
      void confirmLeaveDirtyResumeWorkspace("open that resume instead").then(
        (mayLeave) => {
          if (!mayLeave) {
            return;
          }

          if (!jobId) {
            navigate("/job-finder/review-queue");
            return;
          }

          setSelectedReviewJobId(jobId);
          navigate(buildResumeWorkspaceRoute(jobId));
        },
      );
    },
    onGenerateResume: async (
      jobId: string,
      options?: { selectAfter?: boolean },
    ): Promise<boolean> =>
      runAction(
        () => actions.generateResume(jobId),
        () => {
          if (options?.selectAfter === false) {
            return;
          }

          setSelectedReviewJobId(jobId);
        },
        "Resume created for this job.",
        { scope: jobFinderPendingActions.resumeJob(jobId) },
      ),
    onRemoveReviewJob: (jobId: string) => {
      void confirmLeaveDirtyResumeWorkspace(
        "move this job back to Find jobs",
      ).then((mayLeave) => {
        if (!mayLeave) {
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
      });
    },
    onApproveCurrentResume: (jobId: string) =>
      void runResumeWorkspaceAction(
        async () => {
          await actions.exportResumePdf(jobId, "approval");
          const workspace = await actions.getResumeWorkspace(jobId);
          const exportToApprove = workspace.exports
            .filter(
              (artifact) =>
                artifact.jobId === jobId &&
                artifact.draftId === workspace.draft.id,
            )
            .sort(
              (left, right) =>
                new Date(right.exportedAt).getTime() -
                new Date(left.exportedAt).getTime(),
            )[0];

          if (!exportToApprove) {
            throw new Error(
              "Job Finder could not create the application PDF for this resume.",
            );
          }

          return actions.approveResume(jobId, exportToApprove.id);
        },
        async () => {
          await refreshResumeWorkspace(jobId);
        },
        "Resume approved and ready for application preparation.",
        { scope: jobFinderPendingActions.resumeExport(jobId) },
      ),
    onApproveResume: (jobId: string, exportId: string) =>
      void runResumeWorkspaceAction(
        () => actions.approveResume(jobId, exportId),
        async () => {
          await refreshResumeWorkspace(jobId);
        },
        "Resume approved for this job.",
        { scope: jobFinderPendingActions.resumeJob(jobId) },
      ),
    onSetWorkHistoryReviewAcknowledgment: (
      jobId: string,
      decision: ResumeWorkHistoryDecisionRequest,
    ) =>
      void runResumeWorkspaceAction(
        async () => {
          const workspace = await actions.getResumeWorkspace(jobId);
          const commandInput = buildWorkHistoryReviewAcknowledgmentCommandInput(
            {
              decision,
              draft: workspace.draft,
              jobId,
              suggestions: workspace.workHistoryReviewSuggestions,
            },
          );

          if (!commandInput) {
            throw new Error(
              "This work-history decision no longer matches the saved draft. Reload the workspace and try again.",
            );
          }

          return actions.setWorkHistoryReviewAcknowledgment(commandInput);
        },
        async () => {
          await refreshResumeWorkspace(jobId);
        },
        decision.intent === "acknowledge"
          ? "Saved. This role stays out of the resume by your explicit decision."
          : "Removed the kept-omitted decision for this role.",
        { scope: jobFinderPendingActions.resumeJob(jobId) },
      ),
    onImportResume: () => {
      if (!canImportResume) {
        applyRouteScopedMessage({ message: importResumeGuardMessage });
        return;
      }

      void runAction(
        actions.importResume,
        () => undefined,
        // Main persists a non-ready import as a normal resolution (the file
        // is saved even when text extraction or analysis did not finish), so
        // the newest resume's typed extraction status decides the copy and
        // only `ready` may claim extracted details.
        (result) => {
          if (
            result.profile.baseResume.id === workspace.profile.baseResume.id
          ) {
            return "No resume selected. Your profile was not changed.";
          }

          const fileName = result.profile.baseResume.fileName;
          switch (result.profile.baseResume.extractionStatus) {
            case "ready":
              return `${fileName} was imported. Review the extracted details before approving them.`;
            case "needs_text":
              return `${fileName} was saved, but no text could be read from it, so no details were extracted. Try another file, or add your details manually in Profile.`;
            case "failed":
              return `${fileName} was saved, but extracting its details failed. Try importing it again, or add your details manually in Profile.`;
            case "not_started":
              return `${fileName} was saved, but its details have not been extracted yet. Open Profile and refresh from the saved resume.`;
          }
        },
        {
          scope: jobFinderPendingActions.profileImport(),
        },
      );
    },
    // Returns the run's settled outcome for the same reason as
    // `onPerformUserAction`: a caller that reports the hand-off result in place
    // needs the real answer, not a promise that was thrown away.
    onOpenBrowserSession: (
      input?: JobFinderOpenBrowserSessionInput,
      options?: JobFinderActionFailureReporting,
    ) =>
      runAction(
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
              ? `Opened ${JOB_FINDER_BROWSER_NAME} for ${target.label}. Sign in there, then return to continue.`
              : `${JOB_FINDER_BROWSER_NAME_SENTENCE_START} is open.`;
          }

          // The Search setup chip already reports Ready/Not open; the toast
          // only confirms the action instead of restating the status.
          return workspace.browserSession.status === "ready"
            ? `${JOB_FINDER_BROWSER_NAME_SENTENCE_START} was refreshed.`
            : `${JOB_FINDER_BROWSER_NAME_SENTENCE_START} is open.`;
        },
        {
          scope: input?.targetId
            ? jobFinderPendingActions.browserSessionTarget(input.targetId)
            : jobFinderPendingActions.browserSession(),
          // Only a caller that asked for it; see
          // `JobFinderActionFailureReporting`.
          ...(options?.rethrowError ? { rethrowError: true } : {}),
        },
      ),
    onOpenProfile: () => {
      void confirmLeaveDirtyResumeWorkspace("open your profile").then(
        (mayLeave) => {
          if (!mayLeave) {
            return;
          }

          navigate("/job-finder/profile", {
            state: { forceFullProfile: true },
          });
        },
      );
    },
    onQueueJob: async (jobId: string): Promise<JobFinderQueuedJobOutcome> => {
      // Request-local shortlist outcome: the awaited result belongs to this
      // exact click, so overlapping shortlists resolving out of order can
      // never label another row and shared route messages cannot steal
      // attribution. The route-scoped write is preserved for other surfaces.
      const ownerStartRoute = jobFinderStatusRoute;
      const successMessage = "Job added to Shortlisted.";
      try {
        applyRouteScopedMessage({ message: null }, ownerStartRoute);
        await withPendingScope(
          jobFinderPendingActions.discoveryJob(jobId),
          () => actions.queueJobForReview(jobId),
        );
        // The workspace mutation may reorder or replace the discovery and
        // review collections. Retain the exact clicked id so the refreshed
        // Shortlisted surface cannot silently fall back to another row.
        setSelectedReviewJobId(jobId);
        applyRouteScopedMessage({ message: successMessage }, ownerStartRoute);
        return { status: "success", message: successMessage };
      } catch (error) {
        if (isHandledRefreshError(error)) {
          // Same silent contract as runAction for handled refresh prompts:
          // their own UI reports them, so only the local outcome resolves.
          return {
            status: "failure",
            message: "The requested Job Finder action failed.",
          };
        }
        const failureMessage = getJobFinderErrorMessage(
          error,
          "The requested Job Finder action failed.",
        );
        applyRouteScopedMessage({ message: failureMessage }, ownerStartRoute);
        return { status: "failure", message: failureMessage };
      }
    },
    onPrepareTailoredDrafts: prepareTailoredDrafts,
    onStopTailoredDraftPreparation: () => {
      if (!tailoredDraftPreparationRunRef.current) {
        return;
      }

      tailoredDraftPreparationStopRequestedRef.current = true;
    },
    onSetJobResumeApplicationMode: (
      jobId: string,
      resumeApplicationMode: ResumeApplicationMode,
    ) =>
      void runAction(
        () => actions.setJobResumeApplicationMode(jobId, resumeApplicationMode),
        () => setSelectedReviewJobId(jobId),
        resumeApplicationMode === "original_resume"
          ? "This job will use your original resume unchanged."
          : "This job will use a tailored resume.",
        { scope: jobFinderPendingActions.resumeJob(jobId) },
      ),
    onRejectProfileCopilotPatchGroup: (patchGroupId: string) =>
      void runAction(
        () => actions.rejectProfileCopilotPatchGroup(patchGroupId),
        () => undefined,
        "Profile change proposal dismissed.",
        { scope: jobFinderPendingActions.profileMutation() },
      ),
    onRefreshResumeWorkspace: (jobId: string) => {
      const scope = jobFinderPendingActions.resumeJob(jobId);

      // Reload is the safe renderer recovery for a long-running assistant
      // request. Retire the old visual request and pending scope first;
      // the underlying IPC promise may still finish and persist its real
      // result, but its late callbacks are fenced below.
      resumeAssistantRequestTokenRef.current += 1;
      invalidatePendingActionScope(scope);
      setPendingActionState((current) =>
        clearPendingActionScopes(current, [scope]),
      );
      setResumeAssistantPending(false);

      void runResumeWorkspaceAction(
        () =>
          refreshResumeWorkspace(jobId, {
            updateAssistantMessages: true,
          }),
        () => undefined,
        "Workspace reloaded.",
        {
          scope,
          startMessage: "Reloading the saved workspace…",
        },
      );
    },
    onRegenerateResumeDraft: (jobId: string) =>
      void runResumeWorkspaceAction(
        () => actions.regenerateResumeDraft(jobId),
        async () => {
          await refreshResumeWorkspace(jobId);
        },
        "Draft refreshed.",
        { scope: jobFinderPendingActions.resumeJob(jobId) },
      ),
    onRegenerateResumeSection: (jobId: string, sectionId: string) => {
      // Proposal-only service: regeneration stores its outcome as the newest
      // assistant message and never mutates the draft. The success copy is
      // derived from that message instead of claiming "Section refreshed.";
      // a failed message read stays silent rather than guessing either way.
      // Action rejections keep the existing runResumeWorkspaceAction error
      // handling untouched.
      let sectionOutcomeMessage: string | null = null;
      void runResumeWorkspaceAction(
        async () => {
          const snapshot = await actions.regenerateResumeSection(
            jobId,
            sectionId,
          );
          const latestAssistantMessage =
            (await actions.getResumeAssistantMessages(jobId)).at(-1) ?? null;
          sectionOutcomeMessage =
            latestAssistantMessage !== null &&
            latestAssistantMessage.proposalStatus === "pending"
              ? "Rewrite proposed for review. Nothing changed yet."
              : "No changes were proposed for this section.";
          return snapshot;
        },
        async () => {
          await refreshResumeWorkspace(jobId);
        },
        () => sectionOutcomeMessage,
        { scope: jobFinderPendingActions.resumeJob(jobId) },
      );
    },
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
      const ownerStartRoute = jobFinderStatusRoute;
      sourceDebugRunIdRef.current += 1;
      const runId = sourceDebugRunIdRef.current;
      const scope = jobFinderPendingActions.sourceDebug(targetId);
      void withPendingScope(scope, async () => {
        applyRouteScopedMessage(
          {
            message:
              "Starting source debug and attaching the browser profile...",
          },
          ownerStartRoute,
        );

        try {
          const nextWorkspace = await actions.runSourceDebug(
            targetId,
            (progressEvent) => {
              if (sourceDebugRunIdRef.current !== runId) {
                return;
              }

              applyRouteScopedMessage(
                { message: progressEvent.message },
                ownerStartRoute,
              );
            },
          );

          if (sourceDebugRunIdRef.current !== runId) {
            return;
          }

          applyRouteScopedMessage(
            {
              message: buildSourceDebugOutcomeMessage(nextWorkspace, targetId),
            },
            ownerStartRoute,
          );
        } catch (error) {
          if (sourceDebugRunIdRef.current !== runId) {
            return;
          }

          const message =
            error instanceof Error
              ? error.message
              : "The requested Job Finder action failed.";
          applyRouteScopedMessage({ message }, ownerStartRoute);
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
          // The workspace update changes the mounted setup step. Navigating
          // to the same URL can remount the editor and discard fields that the
          // shared forms intentionally retain between steps.
          if (locationPathname !== "/job-finder/profile/setup") {
            navigate("/job-finder/profile/setup");
          }
        },
        null,
        { scope: jobFinderPendingActions.profileSetup() },
      ),
    onSaveSetupStep: (
      profile: CandidateProfile,
      searchPreferences: JobSearchPreferences,
      nextStep: ProfileSetupStep,
      options?: {
        finishSetup?: boolean;
        message?: string;
        openProfile?: boolean;
        /**
         * Pending review items the saved draft already edited or confirmed
         * (derived by the setup screen's draft-aware queue). They are
         * persisted as resolved together with the step so an edited field
         * never keeps its own suggestion pending.
         */
        resolvedReviewItems?: readonly {
          id: string;
          status: "confirmed" | "edited";
        }[];
        resumeApplicationMode?: ResumeApplicationMode;
        stayOnCurrentStep?: boolean;
      },
    ) => {
      // A "Next: <step>" confirmation is stale the moment the next step
      // renders — the toast then described where the user already was. The
      // save says what it did and nothing more.
      const savedMessage =
        options?.message ??
        (options?.finishSetup
          ? "Setup finished. Next: find jobs."
          : options?.openProfile
            ? "Saved. Opening the full Profile editor."
            : "Saved.");
      let handOffToFindJobs = false;

      return void runSaveAction({
        action: async () => {
          const snapshot = await actions.saveWorkspaceInputs(
            profile,
            searchPreferences,
          );

          // Guided setup owns the user's default resume choice as well as
          // profile/search fields. Persist the exact existing application-mode
          // value so "Use original resume unchanged" never degrades to the
          // least-invasive tailoring strength or grants any submit authority.
          return options?.resumeApplicationMode
            ? actions.updateApplicationDefaults({
                resumeApplicationMode: options.resumeApplicationMode,
              })
            : snapshot;
        },
        dedupeKey: createSaveDedupeKey(
          nextStep === "extras" ? "answers" : "profile",
          {
            profile,
            searchPreferences,
            nextStep,
            options,
          },
        ),
        failedFallback:
          "This setup step was not saved. Retry before leaving setup.",
        label: nextStep === "extras" ? "Saved answers" : "Profile setup",
        onSuccess: (snapshot) => {
          const readiness = evaluateProfileSetupReadiness(
            snapshot.profile,
            snapshot.searchPreferences,
          );
          const resolvedAt = new Date().toISOString();
          const resolvedById = new Map(
            (options?.resolvedReviewItems ?? []).map((entry) => [
              entry.id,
              entry.status,
            ]),
          );
          const reviewItems = snapshot.profileSetupState.reviewItems.map(
            (item) => {
              const resolvedStatus = resolvedById.get(item.id);
              return item.status === "pending" && resolvedStatus
                ? { ...item, status: resolvedStatus, resolvedAt }
                : item;
            },
          );
          // Only required setup items and critical items gate completion;
          // recommended imported suggestions stay optional to review.
          const nextStatus =
            options?.finishSetup === true &&
            readiness.materiallyComplete &&
            !reviewItems.some(isFinishBlockingReviewItem)
              ? "completed"
              : "in_progress";

          // The route blocker parks (and later drops) any navigation issued
          // while this save is still in flight, so the hand-off to Find jobs
          // happens once the whole save action has settled (below).
          handOffToFindJobs = nextStatus === "completed";
          if (handOffToFindJobs) {
            markProfileSetupJustFinished();
          }

          return actions
            .saveProfileSetupState({
              ...snapshot.profileSetupState,
              reviewItems,
              status: nextStatus,
              currentStep:
                nextStatus === "completed"
                  ? "targeting"
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
              if (updatedSnapshot.profileSetupState.status === "completed") {
                // Handed off to Find jobs once the save settles (see below).
                return;
              }

              if (options?.openProfile && options.finishSetup !== true) {
                navigate("/job-finder/profile");
                return;
              }

              if (locationPathname !== "/job-finder/profile/setup") {
                navigate("/job-finder/profile/setup");
              }
            });
        },
        routeSuccessMessage: "toast_only",
        savedMessage,
        scope: jobFinderPendingActions.profileSetup(),
        surface: nextStep === "extras" ? "answers" : "profile",
      }).then((saved) => {
        // The setup route replaces itself with Profile the moment it renders
        // a completed state. Navigating after the save has fully settled
        // (nothing in flight for the route blocker to park) lets Find jobs
        // win over that redirect.
        if (saved && handOffToFindJobs) {
          navigate("/job-finder/discovery", { replace: true });
        }
        if (handOffToFindJobs) {
          // The completed render has already chosen its redirect target.
          setTimeout(clearProfileSetupJustFinished, 0);
        }
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
        const ownerStartRoute = jobFinderStatusRoute;
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
            applyRouteScopedMessage(
              {
                message:
                  error instanceof Error
                    ? `Changes were saved, but the follow-up action failed. ${error.message}`
                    : "Changes were saved, but the follow-up action failed.",
              },
              ownerStartRoute,
            );
          }
        }
      })(),
    onApplyResumePatch: (
      patch: ResumeDraftPatch,
      revisionReason?: string | null,
    ) => {
      if (!activeRouteResumeWorkspace) {
        applyRouteScopedMessage({
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
        { scope: jobFinderPendingActions.resumeExport(jobId) },
      ),
    onSaveSearchPreferences: (searchPreferences: JobSearchPreferences) => {
      // Search settings belong to the current plan, and a saved change is
      // only felt on the next search, so the confirmation says both.
      const activePlanName =
        workspace.campaigns?.find(
          (campaign) => campaign.id === workspace.activeCampaignId,
        )?.name ?? null;
      void runSaveAction({
        action: () => actions.saveSearchPreferences(searchPreferences),
        dedupeKey: createSaveDedupeKey("profile", searchPreferences),
        failedFallback:
          "Job-search preferences were not saved. Retry before leaving this page.",
        label: "Job-search preferences",
        onSuccess: () => undefined,
        savedMessage: activePlanName
          ? `Search settings saved to "${activePlanName}". Your next search uses them.`
          : "Search settings saved. Your next search uses them.",
        scope: jobFinderPendingActions.profileMutation(),
        surface: "profile",
      });
    },
    onClearResumeApproval: (jobId: string) =>
      void runResumeWorkspaceAction(
        () => actions.clearResumeApproval(jobId),
        async () => {
          await refreshResumeWorkspace(jobId);
        },
        "Approved PDF removed.",
        { scope: jobFinderPendingActions.resumeJob(jobId) },
      ),
    onUpdateApplicationDefaults: (input: UpdateApplicationDefaultsInput) =>
      runSaveAction({
        action: () => actions.updateApplicationDefaults(input),
        dedupeKey: createSaveDedupeKey("settings", input),
        failedFallback:
          "Resume defaults were not saved. Retry before leaving this page.",
        label: "Resume defaults",
        onSuccess: () => undefined,
        savedMessage:
          input.resumeApplicationMode === "original_resume"
            ? "Settings saved. Newly shortlisted jobs will start with your original resume unchanged."
            : "Settings saved. Newly shortlisted jobs will start with a tailored resume.",
        scope: jobFinderPendingActions.settingsSave(),
        surface: "settings",
      }),
    onUpdateWorkspaceBehavior: (input: UpdateWorkspaceBehaviorInput) =>
      runSaveAction({
        action: () => actions.updateWorkspaceBehavior(input),
        dedupeKey: createSaveDedupeKey("settings", input),
        failedFallback:
          "Workspace behavior was not saved. Retry before leaving this page.",
        label: "Workspace behavior",
        onSuccess: () => undefined,
        savedMessage: "Workspace behavior saved.",
        scope: jobFinderPendingActions.settingsSave(),
        surface: "settings",
      }),
    onUpdateAppearanceTheme: (appearanceTheme: AppearanceTheme) =>
      runSaveAction({
        action: () => actions.updateAppearanceTheme(appearanceTheme),
        dedupeKey: createSaveDedupeKey("settings", appearanceTheme),
        failedFallback:
          "Appearance was not saved. Retry before leaving this page.",
        label: "Appearance",
        onSuccess: () => undefined,
        savedMessage: "Appearance saved.",
        scope: jobFinderPendingActions.settingsSave(),
        surface: "settings",
      }),
    onUpdateTrackerCrm: (applicationCrm: ApplicationCrmSettings) =>
      runSaveAction({
        action: () => actions.updateTrackerCrm(applicationCrm),
        dedupeKey: createSaveDedupeKey("settings", applicationCrm),
        failedFallback: "The application tracker settings could not be saved.",
        label: "Tracker settings",
        onSuccess: () => undefined,
        savedMessage: "Tracker settings saved.",
        scope: jobFinderPendingActions.settingsSave(),
        surface: "settings",
      }),
    onSendProfileCopilotMessage: (
      content: string,
      context?: ProfileCopilotContext,
    ) =>
      (async () => {
        const ownerStartRoute = jobFinderStatusRoute;
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
            return false;
          }

          setOptimisticProfileCopilotMessages([]);
          setProfileCopilotBusy(false);
          setProfileCopilotPendingContextKey(null);
          applyRouteScopedMessage(
            { message: "Profile Copilot replied." },
            ownerStartRoute,
          );
          return true;
        } catch (error) {
          if (requestToken !== profileCopilotRequestTokenRef.current) {
            return false;
          }

          const message =
            error instanceof Error
              ? error.message
              : "The requested Job Finder action failed.";
          setOptimisticProfileCopilotMessages([]);
          setProfileCopilotBusy(false);
          setProfileCopilotPendingContextKey(null);
          applyRouteScopedMessage({ message }, ownerStartRoute);
          return false;
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
          ? "Resume approach updated. It shapes the next tailored draft; drafts that already exist stay as they are until you re-tailor them. Reusing it never approves a resume."
          : "Resume approach created. It shapes future tailored drafts and never approves a resume.",
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
      const ownerStartRoute = jobFinderStatusRoute;
      const scope = jobFinderPendingActions.resumeStrategyRecommend(
        input.jobId,
      );

      try {
        return await withPendingScope(scope, () =>
          actions.recommendResumeStrategy(input),
        );
      } catch (error) {
        applyRouteScopedMessage(
          {
            message: getJobFinderErrorMessage(
              error,
              "The strategy recommendation could not be loaded.",
            ),
          },
          ownerStartRoute,
        );
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
        const ownerStartRoute = jobFinderStatusRoute;
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
        const pendingGeneration = getPendingActionGeneration(scope);
        setResumeAssistantPending(true);
        setResumeAssistantMessages((current) => [
          ...current,
          optimisticUserMessage,
          optimisticAssistantMessage,
        ]);
        applyRouteScopedMessage(
          { message: "Assistant is updating your draft..." },
          ownerStartRoute,
        );

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
            applyRouteScopedMessage(
              {
                message:
                  refreshMessage !== null
                    ? `Assistant finished${proposedCount > 0 ? ` and proposed ${proposedCount} change${proposedCount === 1 ? "" : "s"}` : ""}, but the editor could not refresh automatically. ${refreshMessage}`
                    : proposedCount > 0
                      ? `Assistant proposed ${proposedCount} change${proposedCount === 1 ? "" : "s"}. Review and accept the changes you want.`
                      : "Assistant finished and shared a reply with no direct resume changes.",
              },
              ownerStartRoute,
            );
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
            applyRouteScopedMessage({ message }, ownerStartRoute);
          }
        } finally {
          // Reload/navigation may retire this request before its IPC promise
          // settles. Its late cleanup must not decrement a newer operation
          // that reused the same job scope.
          if (getPendingActionGeneration(scope) === pendingGeneration) {
            setPendingActionState((current) =>
              decrementPendingScope(current, scope),
            );
          }
        }
      })(),
    onResolveResumeAssistantProposal: (
      jobId: string,
      proposalId: string,
      action: "accept" | "reject",
      patchIds: readonly string[],
    ) =>
      void (async () => {
        const ownerStartRoute = jobFinderStatusRoute;
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
          applyRouteScopedMessage(
            {
              message:
                action === "accept"
                  ? `Applied ${patchIds.length} approved guided edit${patchIds.length === 1 ? "" : "s"}. Undo is available in version history.`
                  : "Guided edits proposal rejected. The resume was not changed.",
            },
            ownerStartRoute,
          );
        } catch (error) {
          try {
            setResumeAssistantMessages(
              await actions.getResumeAssistantMessages(jobId),
            );
          } catch {
            // The primary failure remains visible in the page action state.
          }
          applyRouteScopedMessage(
            {
              message:
                error instanceof Error
                  ? error.message
                  : "The guided edits proposal could not be resolved.",
            },
            ownerStartRoute,
          );
        } finally {
          setPendingActionState((current) =>
            decrementPendingScope(current, scope),
          );
        }
      })(),
  };
}
