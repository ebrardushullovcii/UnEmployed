import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type {
  DiscoveryActivityEvent,
  JobFinderResumeWorkspace,
  JobFinderWorkspaceSnapshot,
  ProfileCopilotMessage,
  ProfileSetupState,
  ResumeImportProgressEvent,
  ResumeAssistantMessage,
} from "@unemployed/contracts";
import type {
  ActionState,
  JobFinderShellActions,
} from "@renderer/features/job-finder/lib/job-finder-types";
import type {
  PendingActionScope,
  PendingActionState,
} from "./job-finder-pending-actions";
import { jobFinderPendingActions } from "./job-finder-pending-actions";
import {
  createActionRunners,
  createPrimaryPageActions,
} from "./use-job-finder-page-controller-actions";
import type { JobFinderPageContext } from "./job-finder-page-context";
import type {
  JobFinderSaveCoordinator,
  JobFinderSaveState,
} from "./job-finder-save-state";

type BuildJobFinderPageContextArgs = {
  actionState: ActionState;
  actions: JobFinderShellActions;
  activeRouteResumeAssistantMessages: readonly ResumeAssistantMessage[];
  activeRouteResumeAssistantPending: boolean;
  activeRouteResumeWorkspace: JobFinderResumeWorkspace | null;
  canImportResume: boolean;
  confirmLeaveDirtyResumeWorkspace: () => boolean;
  importResumeGuardMessage: string | null;
  isAnyPendingAction: (scopes: readonly PendingActionScope[]) => boolean;
  isPendingAction: (scope: PendingActionScope) => boolean;
  isCurrentResumeAssistantRequest: (
    jobId: string,
    requestToken: number,
  ) => boolean;
  isCurrentResumeWorkspaceJob: (jobId: string) => boolean;
  liveDiscoveryEvents: readonly DiscoveryActivityEvent[];
  locationPathname: string;
  navigate: (
    path: string,
    options?: { replace?: boolean; state?: unknown },
  ) => void;
  navigateSafely: (path: string) => void;
  profileCopilotBusy: boolean;
  resumeImportProgress: ResumeImportProgressEvent | null;
  profileCopilotPendingContextKey: string | null;
  profileCopilotRequestTokenRef: MutableRefObject<number>;
  requestApplyCopilotVisualCheckpoints: (request: {
    jobId: string;
    onResolve: (visualCheckpointsEnabled: boolean) => void;
  }) => void;
  profileSetupState: ProfileSetupState | null;
  saveCoordinator: JobFinderSaveCoordinator;
  saveState: JobFinderSaveState;
  refreshResumeWorkspace: (
    jobId: string,
    options?: {
      updateAssistantMessages?: boolean;
    },
  ) => Promise<boolean>;
  resumeAssistantRequestTokenRef: MutableRefObject<number>;
  selectedApplicationAttempt: JobFinderPageContext["selectedApplicationAttempt"];
  selectedApplicationRecord: JobFinderPageContext["selectedApplicationRecord"];
  selectedDiscoveryJob: JobFinderPageContext["selectedDiscoveryJob"];
  selectedReviewItem: JobFinderPageContext["selectedReviewItem"];
  selectedReviewJob: JobFinderPageContext["selectedReviewJob"];
  selectedTailoredAsset: JobFinderPageContext["selectedTailoredAsset"];
  setPendingActionState: Dispatch<SetStateAction<PendingActionState>>;
  setActionState: Dispatch<SetStateAction<ActionState>>;
  setLiveDiscoveryEvents: Dispatch<SetStateAction<DiscoveryActivityEvent[]>>;
  setOptimisticProfileCopilotMessages: Dispatch<
    SetStateAction<readonly ProfileCopilotMessage[]>
  >;
  setProfileCopilotBusy: Dispatch<SetStateAction<boolean>>;
  setProfileCopilotPendingContextKey: Dispatch<SetStateAction<string | null>>;
  setProfileSurfaceDirty: Dispatch<SetStateAction<boolean>>;
  setResumeAssistantMessages: Dispatch<
    SetStateAction<readonly ResumeAssistantMessage[]>
  >;
  setResumeAssistantPending: Dispatch<SetStateAction<boolean>>;
  setResumeWorkspace: Dispatch<SetStateAction<JobFinderResumeWorkspace | null>>;
  clearResumeWorkspaceState: () => void;
  setResumeWorkspaceDirty: Dispatch<SetStateAction<boolean>>;
  setSelectedApplicationRecordId: (recordId: string) => void;
  setSelectedDiscoveryJobId: (jobId: string) => void;
  setSelectedReviewJobId: (jobId: string) => void;
  sourceDebugRunIdRef: MutableRefObject<number>;
  workspace: JobFinderWorkspaceSnapshot;
};

export function buildJobFinderPageContext(
  args: BuildJobFinderPageContextArgs,
): JobFinderPageContext {
  const {
    actionState,
    actions,
    activeRouteResumeAssistantMessages,
    activeRouteResumeAssistantPending,
    activeRouteResumeWorkspace,
    canImportResume,
    confirmLeaveDirtyResumeWorkspace,
    importResumeGuardMessage,
    isAnyPendingAction,
    isPendingAction,
    isCurrentResumeAssistantRequest,
    isCurrentResumeWorkspaceJob,
    liveDiscoveryEvents,
    locationPathname,
    navigate,
    navigateSafely,
    profileCopilotBusy,
    resumeImportProgress,
    profileCopilotPendingContextKey,
    profileCopilotRequestTokenRef,
    requestApplyCopilotVisualCheckpoints,
    profileSetupState,
    saveCoordinator,
    saveState,
    refreshResumeWorkspace,
    resumeAssistantRequestTokenRef,
    selectedApplicationAttempt,
    selectedApplicationRecord,
    selectedDiscoveryJob,
    selectedReviewItem,
    selectedReviewJob,
    selectedTailoredAsset,
    setPendingActionState,
    setActionState,
    setLiveDiscoveryEvents,
    setOptimisticProfileCopilotMessages,
    setProfileCopilotBusy,
    setProfileCopilotPendingContextKey,
    setProfileSurfaceDirty,
    setResumeAssistantMessages,
    setResumeAssistantPending,
    setResumeWorkspace,
    clearResumeWorkspaceState,
    setResumeWorkspaceDirty,
    setSelectedApplicationRecordId,
    setSelectedDiscoveryJobId,
    setSelectedReviewJobId,
    sourceDebugRunIdRef,
    workspace,
  } = args;

  const {
    runAction,
    runResumeWorkspaceAction,
    runSaveAction,
    withPendingScope,
  } = createActionRunners({
    saveCoordinator,
    setActionState,
    setPendingActionState,
  });

  const primaryActions = createPrimaryPageActions({
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
    saveCoordinator,
    withPendingScope,
    setPendingActionState,
    setActionState,
    setLiveDiscoveryEvents,
    setOptimisticProfileCopilotMessages,
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
  });

  return {
    actionState,
    canImportResume,
    importResumeGuardMessage,
    isAnyPending: isAnyPendingAction,
    isPending: isPendingAction,
    profileCopilotBusy,
    resumeImportProgress,
    saveState,
    ...primaryActions,
    onProfileSurfaceDirtyChange: setProfileSurfaceDirty,
    onNavigateSafely: navigateSafely,
    profileCopilotPendingContextKey,
    onApplyResumeTimelineRepairAction: async (runId, proposalId, action) => {
      await actions.applyResumeTimelineRepairAction(runId, proposalId, action);
    },
    onGetApplyRunDetails: actions.getApplyRunDetails,
    onSaveApplicationAnswer: actions.saveApplicationAnswer,
    onClearApplicationAnswer: actions.clearApplicationAnswer,
    onExportApplicationPacket: async (runId, jobId) => {
      await runAction(
        () => actions.exportApplicationPacket(runId, jobId),
        () => undefined,
        (result) =>
          result.status === "saved"
            ? "Application packet saved."
            : "Application packet export cancelled.",
      );
    },
    onGetSourceDebugRunDetails: actions.getSourceDebugRunDetails,
    onPerformUserAction: (command) =>
      void runAction(
        () => actions.performUserAction(command),
        () => undefined,
        command.action === "confirm_done"
          ? "Verification started. Job Finder will only continue after the browser state is checked."
          : "Action inbox updated.",
        { scope: jobFinderPendingActions.userAction(command.requestId) },
      ),
    onPreviewResumeDraft: actions.previewResumeDraft,
    onSaveSourceInstructionArtifact: (targetId, artifact) =>
      void runAction(
        () => actions.saveSourceInstructionArtifact(targetId, artifact),
        () => undefined,
        "Saved guidance updated.",
        { scope: jobFinderPendingActions.sourceInstruction(targetId) },
      ),
    onVerifySourceInstructions: (targetId: string, instructionId: string) =>
      void runAction(
        () => actions.verifySourceInstructions(targetId, instructionId),
        () => undefined,
        "Saved guidance checked.",
        {
          scope: jobFinderPendingActions.sourceInstructionVerify(instructionId),
        },
      ),
    onResetWorkspace: () => {
      if (!confirmLeaveDirtyResumeWorkspace()) {
        return;
      }

      void runAction(
        actions.resetWorkspace,
        (snapshot) => {
          saveCoordinator.clearReceipt();
          navigate(
            snapshot.profileSetupState.status === "not_started"
              ? "/job-finder/profile/setup"
              : "/job-finder/profile",
          );
        },
        "Workspace reset. Your profile, resume, jobs, and browser session were cleared on this device.",
        { scope: jobFinderPendingActions.workspaceReset() },
      );
    },
    onResumeWorkspaceDirtyChange: setResumeWorkspaceDirty,
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
    resumeAssistantMessages: activeRouteResumeAssistantMessages,
    resumeAssistantPending: activeRouteResumeAssistantPending,
    resumeWorkspace: activeRouteResumeWorkspace,
    workspace,
  };
}
