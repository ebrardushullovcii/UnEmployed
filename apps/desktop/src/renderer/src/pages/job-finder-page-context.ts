import type {
  ApplicationCrmBulkStageMutationInput,
  ApplicationCrmExportFormat,
  ApplicationCrmMutationInput,
  ApplicationCrmSettings,
  ApplyGroupedManualAnswerInput,
  ApplyRunDetails,
  CampaignRuleFunnelProjection,
  ClearApplicationAnswerCommandInput,
  CandidateProfile,
  CompanyIntelligenceMutationInput,
  DiscoveryActivityEvent,
  DiscoveryFeedbackReason,
  EditableSourceInstructionArtifact,
  JobFinderApplyConsentActionInput,
  JobFinderApplyQueueActionInput,
  JobFinderOpenBrowserSessionInput,
  JobFinderResumePreview,
  JobFinderResumeWorkspace,
  JobFinderSettings,
  JobFinderWorkspaceSnapshot,
  JobSearchPreferences,
  ProfileCopilotContext,
  ProfileSetupReviewActionOptions,
  ProfileSetupStep,
  ProjectGroupedManualAnswerCommand,
  RapidReviewMutationInput,
  RecommendResumeStrategyInput,
  RecordOutcomeInput,
  ResumeStrategyRecommendation,
  ResumeImportProgressEvent,
  ResumeApplicationMode,
  ResumeTimelineRepairAction,
  SaveApplicationAnswerCommandInput,
  SaveCampaignRuleInput,
  SaveJobSearchCampaignInput,
  SaveResumeStrategyInput,
  SafeguardMutationInput,
  SelectResumeStrategyInput,
  SetCampaignResumeStrategyDefaultInput,
  SetJobFinderActivityControlInput,
  SetOutcomeSuggestionEnabledInput,
  SnoozeGroupedDecisionInput,
  ResumeAssistantMessage,
  ResumeDraft,
  ResumeDraftPatch,
  SourceDebugRunDetails,
  UserActionCommandInput,
} from "@unemployed/contracts";
import type { PendingActionScope } from "./job-finder-pending-actions";
import type { ActionState } from "@renderer/features/job-finder/lib/job-finder-types";
import type { JobFinderSaveState } from "./job-finder-save-state";

export interface JobFinderPageContext {
  actionState: ActionState;
  canImportResume: boolean;
  importResumeGuardMessage: string | null;
  isPending: (scope: PendingActionScope) => boolean;
  isAnyPending: (scopes: readonly PendingActionScope[]) => boolean;
  profileCopilotBusy: boolean;
  resumeImportProgress: ResumeImportProgressEvent | null;
  saveState: JobFinderSaveState;
  liveDiscoveryEvents: readonly DiscoveryActivityEvent[];
  onAnalyzeProfileFromResume: () => void;
  onApplyGroupedManualAnswer: (input: ApplyGroupedManualAnswerInput) => void;
  onApproveApplyRun: (runId: string) => void;
  onApproveApply: (jobId: string) => void;
  onCancelApplyRun: (runId: string) => Promise<boolean>;
  onRevokeApplyRunApproval: (runId: string) => void;
  onResolveApplyConsentRequest: (
    requestId: string,
    action: JobFinderApplyConsentActionInput["action"],
  ) => void;
  onStartAutoApply: (jobId: string) => void;
  onStartAutoApplyQueue: (
    jobIds: JobFinderApplyQueueActionInput["jobIds"],
  ) => void;
  onStartApplyCopilot: (jobId: string) => void;
  onApplyProfileCopilotPatchGroup: (patchGroupId: string) => void;
  onApplyProfileSetupReviewAction: (
    reviewItemId: string,
    action: "confirm" | "dismiss" | "clear_value",
    options?: ProfileSetupReviewActionOptions,
  ) => void;
  onApplyResumeTimelineRepairAction: (
    runId: string,
    proposalId: string,
    action: ResumeTimelineRepairAction,
  ) => Promise<void>;
  onCheckBrowserSession: () => void;
  onDismissJob: (
    jobId: string,
    reasons: readonly DiscoveryFeedbackReason[],
  ) => void;
  onRestoreDismissedJob: (jobId: string) => void;
  onEditResumeWorkspace: (jobId: string) => void;
  onGenerateResume: (jobId: string) => void;
  onRemoveReviewJob: (jobId: string) => void;
  onMutateRapidReview: (input: RapidReviewMutationInput) => Promise<void>;
  onMutateSafeguards: (input: SafeguardMutationInput) => Promise<boolean>;
  onApproveResume: (jobId: string, exportId: string) => void;
  onClearResumeApproval: (jobId: string) => void;
  onExportResumePdf: (jobId: string) => void;
  onPreviewResumeDraft: (
    draft: ResumeDraft,
    requestId?: string,
  ) => Promise<JobFinderResumePreview>;
  onGetApplyRunDetails: (
    runId: string,
    jobId: string,
  ) => Promise<ApplyRunDetails>;
  onSaveApplicationAnswer: (
    command: SaveApplicationAnswerCommandInput,
  ) => Promise<ApplyRunDetails>;
  onClearApplicationAnswer: (
    command: ClearApplicationAnswerCommandInput,
  ) => Promise<ApplyRunDetails>;
  onExportApplicationPacket: (runId: string, jobId: string) => Promise<void>;
  onExportApplicationCrm: (
    format: ApplicationCrmExportFormat,
    recordId: string,
  ) => Promise<void>;
  onMutateApplicationCrm: (
    command: ApplicationCrmMutationInput,
  ) => Promise<void>;
  onMutateApplicationCrmBulkStage: (
    command: ApplicationCrmBulkStageMutationInput,
  ) => Promise<void>;
  onRefreshCompanyIntelligence: () => Promise<void>;
  onMutateCompanyIntelligence: (
    command: CompanyIntelligenceMutationInput,
  ) => Promise<void>;
  onSetCompanyPreference: (input: {
    companyId: string;
    preference: "neutral" | "follow" | "prefer" | "review" | "exclude";
  }) => Promise<void>;
  onReviewCompanyMerge: (input: {
    companyId: string;
    candidateId: string;
    decision: "accepted" | "rejected";
  }) => Promise<void>;
  onGetSourceDebugRunDetails: (runId: string) => Promise<SourceDebugRunDetails>;
  onImportResume: () => void;
  onOpenBrowserSession: (input?: JobFinderOpenBrowserSessionInput) => void;
  onOpenProfile: () => void;
  onNavigateSafely: (path: string) => void;
  onPerformUserAction: (command: UserActionCommandInput) => void;
  onProjectGroupedManualAnswer: (
    command: ProjectGroupedManualAnswerCommand,
  ) => void;
  onProfileSurfaceDirtyChange: (dirty: boolean) => void;
  profileCopilotPendingContextKey: string | null;
  onQueueJob: (jobId: string) => void;
  onSetJobResumeApplicationMode: (
    jobId: string,
    resumeApplicationMode: ResumeApplicationMode,
  ) => void;
  onRejectProfileCopilotPatchGroup: (patchGroupId: string) => void;
  onResetWorkspace: () => void;
  onResumeProfileSetup: (step?: ProfileSetupStep) => void;
  onRunAgentDiscovery?: () => void;
  onRunDiscoveryForTarget?: (targetId: string) => void;
  onRefreshResumeWorkspace: (jobId: string) => void;
  onResumeWorkspaceDirtyChange: (dirty: boolean) => void;
  onRegenerateResumeDraft: (jobId: string) => void;
  onRegenerateResumeSection: (jobId: string, sectionId: string) => void;
  onRestoreResumeDraftRevision: (jobId: string, revisionId: string) => void;
  onSaveResumeDraft: (draft: ResumeDraft) => void;
  onSaveResumeDraftAndThen: (
    draft: ResumeDraft,
    next: () => void | Promise<void>,
    successMessage?: string | null,
  ) => void;
  onSaveSetupStep: (
    profile: CandidateProfile,
    searchPreferences: JobSearchPreferences,
    nextStep: ProfileSetupStep,
    options?: {
      message?: string;
      openProfile?: boolean;
      stayOnCurrentStep?: boolean;
    },
  ) => void;
  onApplyResumePatch: (
    patch: ResumeDraftPatch,
    revisionReason?: string | null,
  ) => void;
  onSendProfileCopilotMessage: (
    content: string,
    context?: ProfileCopilotContext,
  ) => void;
  onSendResumeAssistantMessage: (jobId: string, content: string) => void;
  onResolveResumeAssistantProposal: (
    jobId: string,
    proposalId: string,
    action: "accept" | "reject",
    patchIds: readonly string[],
  ) => void;
  onUndoProfileRevision: (revisionId: string) => void;
  onRunSourceDebug: (targetId: string) => void;
  onRecordOutcome: (input: RecordOutcomeInput) => Promise<boolean>;
  onSetOutcomeSuggestionEnabled: (
    input: SetOutcomeSuggestionEnabledInput,
  ) => Promise<boolean>;
  onSaveResumeStrategy: (input: SaveResumeStrategyInput) => Promise<boolean>;
  onDisableResumeStrategy: (strategyId: string) => void;
  onSelectResumeStrategy: (input: SelectResumeStrategyInput) => void;
  onRecommendResumeStrategy: (
    input: RecommendResumeStrategyInput,
  ) => Promise<ResumeStrategyRecommendation | null>;
  onSetCampaignResumeStrategyDefault: (
    input: SetCampaignResumeStrategyDefaultInput,
  ) => void;
  onSaveAll: (
    profile: CandidateProfile,
    searchPreferences: JobSearchPreferences,
  ) => void;
  onSaveCampaign: (campaign: SaveJobSearchCampaignInput) => Promise<boolean>;
  onRunCampaignNow: (campaignId?: string | null) => Promise<boolean>;
  onMarkCampaignNotificationRead: (notificationId: string) => void;
  onMarkAllCampaignNotificationsRead: () => void;
  onSaveCampaignRule: (
    campaignId: string,
    rule: SaveCampaignRuleInput,
  ) => Promise<boolean>;
  onDeleteCampaignRule: (
    campaignId: string,
    ruleId: string,
  ) => Promise<boolean>;
  onToggleCampaignRule: (
    campaignId: string,
    ruleId: string,
    enabled: boolean,
  ) => Promise<boolean>;
  onProjectCampaignRuleFunnel: (
    campaignId: string,
  ) => Promise<CampaignRuleFunnelProjection>;
  onSaveProfile: (profile: CandidateProfile) => void;
  onSaveSearchPreferences: (searchPreferences: JobSearchPreferences) => void;
  onSaveApplicationCrmSettings: (
    settings: ApplicationCrmSettings,
  ) => Promise<void>;
  onSaveSettings: (settings: JobFinderSettings) => Promise<boolean>;
  onSaveSourceInstructionArtifact: (
    targetId: string,
    artifact: EditableSourceInstructionArtifact,
  ) => void;
  onSelectApplicationRecord: (recordId: string) => void;
  onSelectCampaign: (campaignId: string) => Promise<boolean>;
  onSelectDiscoveryJob: (jobId: string) => void;
  onSelectReviewItem: (jobId: string) => void;
  onSetActivityControl: (
    input: SetJobFinderActivityControlInput,
  ) => Promise<boolean>;
  onSnoozeGroupedDecision: (input: SnoozeGroupedDecisionInput) => void;
  onVerifySourceInstructions: (targetId: string, instructionId: string) => void;
  selectedApplicationAttempt:
    | JobFinderWorkspaceSnapshot["applicationAttempts"][number]
    | null;
  selectedApplicationRecord:
    | JobFinderWorkspaceSnapshot["applicationRecords"][number]
    | null;
  selectedDiscoveryJob:
    | JobFinderWorkspaceSnapshot["discoveryJobs"][number]
    | null;
  selectedReviewItem: JobFinderWorkspaceSnapshot["reviewQueue"][number] | null;
  selectedReviewJob: JobFinderWorkspaceSnapshot["discoveryJobs"][number] | null;
  selectedTailoredAsset:
    | JobFinderWorkspaceSnapshot["tailoredAssets"][number]
    | null;
  resumeAssistantMessages: readonly ResumeAssistantMessage[];
  resumeAssistantPending: boolean;
  resumeWorkspace: JobFinderResumeWorkspace | null;
  workspace: JobFinderWorkspaceSnapshot;
}
