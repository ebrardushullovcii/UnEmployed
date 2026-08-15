import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type {
  ApplyGroupedManualAnswerInput,
  CampaignRuleFunnelProjection,
  DiscoveryActivityEvent,
  JobFinderResumeWorkspace,
  JobFinderWorkspaceSnapshot,
  ProfileCopilotMessage,
  ProfileSetupState,
  ProjectGroupedManualAnswerCommand,
  RapidReviewMutationInput,
  RecordOutcomeInput,
  ResumeImportProgressEvent,
  ResumeAssistantMessage,
  SafeguardMutationInput,
  SaveCampaignRuleInput,
  SaveJobSearchCampaignInput,
  SetJobFinderActivityControlInput,
  SetOutcomeSuggestionEnabledInput,
  SnoozeGroupedDecisionInput,
} from "@unemployed/contracts";
import type {
  ActionState,
  JobFinderShellActions,
} from "@renderer/features/job-finder/lib/job-finder-types";
import { safeguardMutationKey } from "@renderer/features/job-finder/screens/safeguards/safeguards-presentation";
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
    onApplyGroupedManualAnswer: (input: ApplyGroupedManualAnswerInput) =>
      void runAction(
        () => actions.applyGroupedManualAnswer(input),
        () => undefined,
        "Grouped answer applied to the shortlisted applications. Final submission and account creation remain disabled.",
        {
          scope: jobFinderPendingActions.groupedManualAnswerApply(
            input.decisionId,
          ),
        },
      ),
    onProjectGroupedManualAnswer: (
      command: ProjectGroupedManualAnswerCommand,
    ) =>
      void runAction(
        () => actions.projectGroupedManualAnswer(command),
        () => undefined,
        "Grouped answer created for review. Approve it to fill every shortlisted application with the same safe answer.",
        {
          scope: jobFinderPendingActions.groupedManualAnswerProject(
            command.groupKey,
          ),
        },
      ),
    onSnoozeGroupedDecision: (input: SnoozeGroupedDecisionInput) =>
      void runAction(
        () => actions.snoozeGroupedDecision(input),
        () => undefined,
        input.reason
          ? "Grouped decision snoozed with your note."
          : "Grouped decision snoozed until the selected time.",
        {
          scope: jobFinderPendingActions.groupedDecisionSnooze(
            input.decisionId,
          ),
        },
      ),
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
    onExportApplicationCrm: async (format, recordId) => {
      await runAction(
        () =>
          actions.exportApplicationCrm({
            format,
            applicationRecordIds: [recordId],
          }),
        () => undefined,
        (result) =>
          result.status === "saved"
            ? `Application tracker exported (${result.exportedCount}).`
            : "Application tracker export cancelled.",
      );
    },
    onMutateApplicationCrm: async (command) => {
      const completed = await runAction(
        () => actions.mutateApplicationCrm(command),
        () => undefined,
        "Application tracker updated.",
      );
      if (!completed) {
        throw new Error("The application tracker update could not be saved.");
      }
    },
    onRefreshCompanyIntelligence: async () => {
      await runAction(
        () => actions.refreshCompanyIntelligence(),
        () => undefined,
        "Company intelligence refreshed from your saved jobs and applications.",
        { scope: jobFinderPendingActions.companyIntelligenceRefresh() },
      );
    },
    onMutateCompanyIntelligence: async (command) => {
      const completed = await runAction(
        () => actions.mutateCompanyIntelligence(command),
        () => undefined,
        command.mutation.type.includes("contact")
          ? "Company contact updated."
          : command.mutation.type.includes("note")
            ? "Company note updated."
            : "Salary/offer evidence updated.",
        {
          scope: jobFinderPendingActions.companyIntelligenceMutation(
            command.companyId,
          ),
        },
      );
      if (!completed) {
        throw new Error("The company change could not be saved.");
      }
    },
    onSetCompanyPreference: async (input) => {
      const completed = await runAction(
        () =>
          actions.setCompanyPreference({
            companyId: input.companyId,
            preference: input.preference,
          }),
        () => undefined,
        "Company preference saved. It only changes local tracking and never affects final-submit authority.",
        { scope: jobFinderPendingActions.companyPreference(input.companyId) },
      );
      if (!completed) {
        throw new Error("The company preference could not be saved.");
      }
    },
    onReviewCompanyMerge: async (input) => {
      const completed = await runAction(
        () =>
          actions.reviewCompanyMerge({
            companyId: input.companyId,
            candidateId: input.candidateId,
            decision: input.decision,
          }),
        () => undefined,
        input.decision === "accepted"
          ? "Companies merged. Their aliases, jobs, applications, contacts, notes, and evidence were preserved."
          : "Duplicate suggestion rejected. The two companies stay separate.",
        { scope: jobFinderPendingActions.companyMergeReview(input.companyId) },
      );
      if (!completed) {
        throw new Error("The merge decision could not be saved.");
      }
    },
    onMutateRapidReview: async (input: RapidReviewMutationInput) => {
      const completed = await runAction(
        () => actions.mutateRapidReview(input),
        () => undefined,
        input.type === "decide"
          ? "Rapid review decision saved."
          : "Rapid review decision undone.",
        { scope: jobFinderPendingActions.rapidReview() },
      );
      if (!completed) {
        throw new Error("The rapid review change could not be saved.");
      }
    },
    onMutateSafeguards: (input: SafeguardMutationInput) => {
      return runAction(
        () => actions.mutateSafeguards(input),
        () => undefined,
        "Safeguard updated. It only pauses or unblocks local work and never grants submission authority.",
        {
          scope: jobFinderPendingActions.safeguardsMutation(
            safeguardMutationKey(input),
          ),
        },
      );
    },
    onRecordOutcome: async (input: RecordOutcomeInput) => {
      const completed = await runAction(
        () => actions.recordOutcome(input),
        () => undefined,
        "Outcome recorded. Analytics update only from outcomes you record here — nothing was submitted.",
        { scope: jobFinderPendingActions.recordOutcome(input.jobId) },
      );
      if (!completed) {
        throw new Error("The outcome could not be recorded.");
      }
      return completed;
    },
    onSetOutcomeSuggestionEnabled: (
      input: SetOutcomeSuggestionEnabledInput,
    ) =>
      runAction(
        () => actions.setOutcomeSuggestionEnabled(input),
        () => undefined,
        input.enabled || input.reset
          ? "Suggestion reset. Analytics will re-evaluate it from outcomes you recorded."
          : "Suggestion disabled. It will stay off until you reset it.",
        {
          scope: jobFinderPendingActions.outcomeSuggestion(
            input.dimension,
            input.key,
          ),
        },
      ),
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
    onSaveCampaign: (campaign: SaveJobSearchCampaignInput) =>
      runAction(
        () => actions.saveCampaign(campaign),
        () => undefined,
        campaign.id === null ? "Campaign created." : "Campaign updated.",
      ),
    onRunCampaignNow: (campaignId?: string | null) => {
      const resolvedCampaignId = campaignId ?? workspace.activeCampaignId;
      return runAction(
        () => actions.runCampaignNow(campaignId),
        () => undefined,
        "Campaign run started. Discovery runs safely and never submits an application.",
        {
          scope: jobFinderPendingActions.campaignRun(resolvedCampaignId),
          startMessage:
            "Running this campaign now. Discovery will stop before any final submit control.",
        },
      );
    },
    onMarkCampaignNotificationRead: (notificationId: string) =>
      void runAction(
        () => actions.markCampaignNotificationRead(notificationId),
        () => undefined,
        "Notification marked as read.",
        {
          scope: jobFinderPendingActions.campaignNotification(notificationId),
        },
      ),
    onMarkAllCampaignNotificationsRead: () =>
      void runAction(
        () => actions.markAllCampaignNotificationsRead(),
        () => undefined,
        "All campaign notifications marked as read.",
        {
          scope: jobFinderPendingActions.campaignNotificationAll(),
        },
      ),
    onSaveCampaignRule: (
      campaignId: string,
      rule: SaveCampaignRuleInput,
    ) =>
      runAction(
        () => actions.saveCampaignRule(campaignId, rule),
        () => undefined,
        rule.id === null ? "Campaign rule added." : "Campaign rule updated.",
        { scope: jobFinderPendingActions.campaignRule(campaignId, rule.id) },
      ),
    onDeleteCampaignRule: (campaignId: string, ruleId: string) =>
      runAction(
        () => actions.deleteCampaignRule(campaignId, ruleId),
        () => undefined,
        "Campaign rule removed.",
        { scope: jobFinderPendingActions.campaignRule(campaignId, ruleId) },
      ),
    onToggleCampaignRule: (
      campaignId: string,
      ruleId: string,
      enabled: boolean,
    ) =>
      runAction(
        () => actions.toggleCampaignRule(campaignId, ruleId, enabled),
        () => undefined,
        enabled ? "Campaign rule enabled." : "Campaign rule disabled.",
        { scope: jobFinderPendingActions.campaignRule(campaignId, ruleId) },
      ),
    onProjectCampaignRuleFunnel: (
      campaignId: string,
    ): Promise<CampaignRuleFunnelProjection> =>
      actions.projectCampaignRuleFunnel(campaignId),
    onSaveApplicationCrmSettings: async (settings) => {
      const completed = await primaryActions.onSaveSettings({
        ...workspace.settings,
        applicationCrm: settings,
      });
      if (!completed) {
        throw new Error("The application tracker settings could not be saved.");
      }
    },
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
    onSelectCampaign: (campaignId: string) => {
      if (!confirmLeaveDirtyResumeWorkspace()) {
        return Promise.resolve(false);
      }

      return runAction(
        () => actions.selectCampaign(campaignId),
        () => undefined,
        "Active campaign updated.",
      );
    },
    onSelectDiscoveryJob: setSelectedDiscoveryJobId,
    onSelectReviewItem: setSelectedReviewJobId,
    onSetActivityControl: (input: SetJobFinderActivityControlInput) =>
      runAction(
        () => actions.setActivityControl(input),
        () => undefined,
        input.paused ? "Activity paused." : "Activity resumed.",
      ),
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
