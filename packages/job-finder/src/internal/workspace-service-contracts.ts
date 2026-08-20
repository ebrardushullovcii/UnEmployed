import type {
  JobFinderAiClient,
  ResumeVisionProvider,
} from "@unemployed/ai-providers";
import type { BrowserSessionRuntime } from "@unemployed/browser-runtime";
import type {
  ApplicationCrmBulkStageMutationInput,
  ApplicationCrmExportInput,
  ApplicationCrmExportResult,
  ApplicationCrmMutationInput,
  ApplicationCrmSettings,
  ApplicationPacket,
  CampaignRuleFunnelProjection,
  CandidateAsset,
  ClearApplicationAnswerCommandInput,
  CompanyIntelligenceMutationInput,
  ApplyRunDetails,
  ApplyGroupedManualAnswerInput,
  DeleteCampaignRuleInput,
  DiscoveryRunScope,
  CandidateProfile,
  DiscoveryActivityEvent,
  EditableSourceInstructionArtifact,
  JobFinderApplyCopilotActionInput,
  JobFinderDismissDiscoveryJobInput,
  JobFinderOpenBrowserSessionInput,
  JobFinderResumePreview,
  ResumeDocumentBundle,
  JobFinderInterviewFollowUpInput,
  ResumeImportFieldCandidate,
  ResumeImportRun,
  ResumeTimelineRepairAction,
  ResumeImportVisionArtifact,
  ResumeApplicationMode,
  ResumeSourceDocument,
  JobFinderResumeWorkspace,
  JobFinderSettings,
  JobFinderWorkspaceSnapshot,
  JobSearchPreferences,
  MarkAllCampaignNotificationsReadInput,
  MarkCampaignNotificationReadInput,
  ProfileCopilotContext,
  ProfileSetupState,
  ProfileSetupReviewAction,
  ProfileSetupReviewActionOptions,
  ProjectCampaignRuleFunnelInput,
  ProjectGroupedManualAnswerCommand,
  RapidReviewMutationInput,
  RecommendResumeStrategyInput,
  RecordOutcomeInput,
  ResumeStrategyRecommendation,
  ReviewCompanyMergeInput,
  RunCampaignNowInput,
  SaveResumeStrategyInput,
  SafeguardBlockerView,
  SafeguardMutationInput,
  SafeguardsOverview,
  SelectResumeStrategyInput,
  SetCampaignResumeStrategyDefaultInput,
  SetCompanyPreferenceInput,
  SetOutcomeSuggestionEnabledInput,
  SnoozeGroupedDecisionInput,
  ResumeAssistantMessage,
  ResumeDraft,
  ResumeDraftPatch,
  ResumeResearchArtifact,
  ResumeTemplateId,
  ResumeTemplateDefinition,
  SavedJob,
  SaveCampaignRuleRouteInput,
  SaveJobSearchCampaignInput,
  SetJobFinderActivityControlInput,
  SaveApplicationAnswerCommandInput,
  SourceDebugProgressEvent,
  SourceDebugRunDetails,
  SourceDebugRunRecord,
  ToggleCampaignRuleInput,
  UserActionCommandInput,
} from "@unemployed/contracts";
import type {
  JobFinderRepository,
  JobFinderRepositorySeed,
} from "@unemployed/db";
import type { ResumeExportFileVerifier } from "./workspace-service-context";
import type { ResumeRenderDocument } from "./resume-workspace-structure";

export interface JobFinderWorkspaceResetOptions {
  /**
   * Runs while the service reset gate is held, immediately before replacing
   * the repository state. Desktop callers use this to remove app-owned files
   * without allowing a new operation to start between the file and database
   * reset.
   */
  beforeStateReset?: () => Promise<void>;
}

export interface JobFinderWorkspaceService {
  shutdown(): Promise<void>;
  getWorkspaceSnapshot(): Promise<JobFinderWorkspaceSnapshot>;
  /**
   * Returns the small, shell-safe first paint. Deferred collections are empty
   * by design and are marked in the snapshot hydration metadata.
   */
  getWorkspaceBootstrap(): Promise<JobFinderWorkspaceSnapshot>;
  getResumeImportState(): Promise<{
    resumeImportRuns: readonly ResumeImportRun[];
    resumeImportDocumentBundles: readonly ResumeDocumentBundle[];
    resumeImportFieldCandidates: readonly ResumeImportFieldCandidate[];
  }>;
  openBrowserSession(
    input?: JobFinderOpenBrowserSessionInput,
  ): Promise<JobFinderWorkspaceSnapshot>;
  checkBrowserSession(): Promise<JobFinderWorkspaceSnapshot>;
  performUserAction(
    command: UserActionCommandInput,
  ): Promise<JobFinderWorkspaceSnapshot>;
  projectGroupedManualAnswer(
    command: ProjectGroupedManualAnswerCommand,
  ): Promise<JobFinderWorkspaceSnapshot>;
  applyGroupedManualAnswer(
    command: ApplyGroupedManualAnswerInput,
  ): Promise<JobFinderWorkspaceSnapshot>;
  snoozeGroupedDecision(
    command: SnoozeGroupedDecisionInput,
  ): Promise<JobFinderWorkspaceSnapshot>;
  saveApplicationAnswer(
    command: SaveApplicationAnswerCommandInput,
  ): Promise<ApplyRunDetails>;
  clearApplicationAnswer(
    command: ClearApplicationAnswerCommandInput,
  ): Promise<ApplyRunDetails>;
  resetWorkspace(
    seed: JobFinderRepositorySeed,
    options?: JobFinderWorkspaceResetOptions,
  ): Promise<JobFinderWorkspaceSnapshot>;
  saveProfile(profile: CandidateProfile): Promise<JobFinderWorkspaceSnapshot>;
  saveProfileAndSearchPreferences(
    profile: CandidateProfile,
    searchPreferences: JobSearchPreferences,
  ): Promise<JobFinderWorkspaceSnapshot>;
  runResumeImport(input: {
    baseResume: ResumeSourceDocument;
    documentBundle: ResumeDocumentBundle;
    importWarnings?: readonly string[];
    visionArtifact?: ResumeImportVisionArtifact | null;
  }): Promise<JobFinderWorkspaceSnapshot>;
  analyzeProfileFromResume(): Promise<JobFinderWorkspaceSnapshot>;
  saveSearchPreferences(
    searchPreferences: JobSearchPreferences,
  ): Promise<JobFinderWorkspaceSnapshot>;
  saveProfileSetupState(
    profileSetupState: ProfileSetupState,
  ): Promise<JobFinderWorkspaceSnapshot>;
  applyProfileSetupReviewAction(
    reviewItemId: string,
    action: ProfileSetupReviewAction,
    options?: ProfileSetupReviewActionOptions,
  ): Promise<JobFinderWorkspaceSnapshot>;
  applyResumeTimelineRepairAction(
    runId: string,
    proposalId: string,
    action: ResumeTimelineRepairAction,
  ): Promise<JobFinderWorkspaceSnapshot>;
  sendProfileCopilotMessage(
    content: string,
    context?: ProfileCopilotContext,
  ): Promise<JobFinderWorkspaceSnapshot>;
  proposeProfileCopilotChange(
    content: string,
    context?: ProfileCopilotContext,
  ): Promise<JobFinderWorkspaceSnapshot>;
  applyProfileCopilotPatchGroup(
    patchGroupId: string,
  ): Promise<JobFinderWorkspaceSnapshot>;
  rejectProfileCopilotPatchGroup(
    patchGroupId: string,
  ): Promise<JobFinderWorkspaceSnapshot>;
  undoProfileRevision(revisionId: string): Promise<JobFinderWorkspaceSnapshot>;
  saveSettings(
    settings: JobFinderSettings,
  ): Promise<JobFinderWorkspaceSnapshot>;
  saveCampaign(
    campaign: SaveJobSearchCampaignInput,
  ): Promise<JobFinderWorkspaceSnapshot>;
  selectCampaign(campaignId: string): Promise<JobFinderWorkspaceSnapshot>;
  setActivityControl(
    input: SetJobFinderActivityControlInput,
  ): Promise<JobFinderWorkspaceSnapshot>;
  runDiscovery(targetId?: string): Promise<JobFinderWorkspaceSnapshot>;
  runAgentDiscovery(
    onActivity?: (event: DiscoveryActivityEvent) => void,
    signal?: AbortSignal,
    targetId?: string,
  ): Promise<JobFinderWorkspaceSnapshot>;
  runDiscoveryForTarget(
    targetId: string,
    onActivity?: (event: DiscoveryActivityEvent) => void,
    signal?: AbortSignal,
  ): Promise<JobFinderWorkspaceSnapshot>;
  /**
   * Runs one discovery cycle for a campaign now (manual trigger). Works
   * regardless of the campaign schedule's `enabled` flag, but still obeys the
   * global activity pause and the campaign's own status.
   */
  runCampaignNow(
    input?: RunCampaignNowInput,
  ): Promise<JobFinderWorkspaceSnapshot>;
  /**
   * Runs every campaign whose persisted schedule is due at `now` (catch-up
   * included). Missing `nextRunAt` values are initialized truthfully without
   * triggering immediate work.
   */
  runDueScheduledCampaigns(now?: string): Promise<JobFinderWorkspaceSnapshot>;
  /**
   * Marks a single in-app campaign notification read. Unknown ids are a
   * no-op; the timestamp comes from the caller (main supplies the ISO readAt).
   */
  markCampaignNotificationRead(
    input: MarkCampaignNotificationReadInput,
  ): Promise<JobFinderWorkspaceSnapshot>;
  /**
   * Marks every unread in-app campaign notification read. Already-read
   * notifications keep their original read timestamps; an invalid read
   * timestamp is a no-op.
   */
  markAllCampaignNotificationsRead(
    input: MarkAllCampaignNotificationsReadInput,
  ): Promise<JobFinderWorkspaceSnapshot>;
  /**
   * Creates or updates one campaign rule. New rules start unmeasured;
   * updates preserve previously measured remove/downgrade counts unless the
   * caller explicitly replaces them.
   */
  saveCampaignRule(
    input: SaveCampaignRuleRouteInput,
  ): Promise<JobFinderWorkspaceSnapshot>;
  /** Removes one campaign rule by id. */
  deleteCampaignRule(
    input: DeleteCampaignRuleInput,
  ): Promise<JobFinderWorkspaceSnapshot>;
  /** Toggles one campaign rule's enabled/disabled state. */
  toggleCampaignRule(
    input: ToggleCampaignRuleInput,
  ): Promise<JobFinderWorkspaceSnapshot>;
  /**
   * Read-only projection of rule effects and the funnel, computed only
   * against the real persisted jobs retained by the campaign.
   */
  projectCampaignRuleFunnel(
    input: ProjectCampaignRuleFunnelInput,
  ): Promise<CampaignRuleFunnelProjection>;
  runSourceDebug(
    targetId: string,
    signal?: AbortSignal,
    onProgress?: (event: SourceDebugProgressEvent) => void,
  ): Promise<JobFinderWorkspaceSnapshot>;
  cancelSourceDebug(runId: string): Promise<JobFinderWorkspaceSnapshot>;
  getSourceDebugRun(runId: string): Promise<SourceDebugRunRecord>;
  getSourceDebugRunDetails(runId: string): Promise<SourceDebugRunDetails>;
  listSourceDebugRuns(
    targetId: string,
  ): Promise<readonly SourceDebugRunRecord[]>;
  saveSourceInstructionArtifact(
    targetId: string,
    artifact: EditableSourceInstructionArtifact,
  ): Promise<JobFinderWorkspaceSnapshot>;
  acceptSourceInstructionDraft(
    targetId: string,
    instructionId: string,
  ): Promise<JobFinderWorkspaceSnapshot>;
  verifySourceInstructions(
    targetId: string,
    instructionId: string,
    signal?: AbortSignal,
    onProgress?: (event: SourceDebugProgressEvent) => void,
  ): Promise<JobFinderWorkspaceSnapshot>;
  queueJobForReview(jobId: string): Promise<JobFinderWorkspaceSnapshot>;
  setJobResumeApplicationMode(
    jobId: string,
    resumeApplicationMode: ResumeApplicationMode,
  ): Promise<JobFinderWorkspaceSnapshot>;
  removeJobFromReview(jobId: string): Promise<JobFinderWorkspaceSnapshot>;
  dismissDiscoveryJob(
    input: JobFinderDismissDiscoveryJobInput,
  ): Promise<JobFinderWorkspaceSnapshot>;
  restoreDismissedDiscoveryJob(
    jobId: string,
  ): Promise<JobFinderWorkspaceSnapshot>;
  mutateRapidReview(
    input: RapidReviewMutationInput,
  ): Promise<JobFinderWorkspaceSnapshot>;
  recordOutcome(input: RecordOutcomeInput): Promise<JobFinderWorkspaceSnapshot>;
  refreshCompanyIntelligence(): Promise<JobFinderWorkspaceSnapshot>;
  setCompanyPreference(
    input: SetCompanyPreferenceInput,
  ): Promise<JobFinderWorkspaceSnapshot>;
  reviewCompanyMerge(
    input: ReviewCompanyMergeInput,
  ): Promise<JobFinderWorkspaceSnapshot>;
  mutateCompanyIntelligence(
    input: CompanyIntelligenceMutationInput,
  ): Promise<JobFinderWorkspaceSnapshot>;
  setOutcomeSuggestionEnabled(
    input: SetOutcomeSuggestionEnabledInput,
  ): Promise<JobFinderWorkspaceSnapshot>;
  /**
   * Applies one typed local safeguard mutation (caps, conflicts, listing
   * signals, failure pauses, sample reviews, contradictions, or dismissals).
   * Mutations never grant credentials, login, CAPTCHA, MFA, legal consent,
   * account creation, upload, redirect, or final-submit authority.
   */
  mutateSafeguards(
    input: SafeguardMutationInput,
  ): Promise<JobFinderWorkspaceSnapshot>;
  /** Read-only gate overview used by the Safeguards screen and tests. */
  getSafeguardsOverview(): Promise<SafeguardsOverview>;
  /**
   * Read-only gate projection for application preparation of the given jobs
   * (caps, conflicts, signals, global pauses/reviews, advisory contradictions).
   */
  evaluateApplicationSafeguardBlockers(
    jobIds: readonly string[],
  ): Promise<readonly SafeguardBlockerView[]>;
  /**
   * Read-only gate projection for a discovery run (global pauses and pending
   * sample reviews only; job-scoped gates are enforced at preparation time).
   */
  evaluateDiscoverySafeguardBlockers(): Promise<
    readonly SafeguardBlockerView[]
  >;
  saveResumeStrategy(
    input: SaveResumeStrategyInput,
  ): Promise<JobFinderWorkspaceSnapshot>;
  disableResumeStrategy(
    strategyId: string,
  ): Promise<JobFinderWorkspaceSnapshot>;
  selectResumeStrategy(
    input: SelectResumeStrategyInput,
  ): Promise<JobFinderWorkspaceSnapshot>;
  recommendResumeStrategy(
    input: RecommendResumeStrategyInput,
  ): Promise<ResumeStrategyRecommendation>;
  setCampaignResumeStrategyDefault(
    input: SetCampaignResumeStrategyDefaultInput,
  ): Promise<JobFinderWorkspaceSnapshot>;
  generateResume(jobId: string): Promise<JobFinderWorkspaceSnapshot>;
  getResumeWorkspace(jobId: string): Promise<JobFinderResumeWorkspace>;
  previewResumeDraft(
    draft: ResumeDraft,
    signal?: AbortSignal,
  ): Promise<JobFinderResumePreview>;
  saveResumeDraft(draft: ResumeDraft): Promise<JobFinderWorkspaceSnapshot>;
  restoreResumeDraftRevision(
    jobId: string,
    revisionId: string,
  ): Promise<JobFinderWorkspaceSnapshot>;
  regenerateResumeDraft(jobId: string): Promise<JobFinderWorkspaceSnapshot>;
  regenerateResumeSection(
    jobId: string,
    sectionId: string,
  ): Promise<JobFinderWorkspaceSnapshot>;
  exportResumePdf(
    jobId: string,
    outputPath?: string | null,
  ): Promise<JobFinderWorkspaceSnapshot>;
  approveResume(
    jobId: string,
    exportId: string,
  ): Promise<JobFinderWorkspaceSnapshot>;
  clearResumeApproval(jobId: string): Promise<JobFinderWorkspaceSnapshot>;
  applyResumePatch(
    patch: ResumeDraftPatch,
    revisionReason?: string | null,
  ): Promise<JobFinderWorkspaceSnapshot>;
  getResumeAssistantMessages(
    jobId: string,
  ): Promise<readonly ResumeAssistantMessage[]>;
  sendResumeAssistantMessage(
    jobId: string,
    content: string,
  ): Promise<readonly ResumeAssistantMessage[]>;
  resolveResumeAssistantProposal(
    jobId: string,
    proposalId: string,
    action: "accept" | "reject",
    patchIds: readonly string[],
  ): Promise<readonly ResumeAssistantMessage[]>;
  getApplyRunDetails(runId: string, jobId: string): Promise<ApplyRunDetails>;
  buildApplicationPacket(
    runId: string,
    jobId: string,
  ): Promise<ApplicationPacket>;
  startApplyCopilotRun(
    jobId: string,
    options?: Pick<
      JobFinderApplyCopilotActionInput,
      "visualCheckpointsEnabled"
    >,
  ): Promise<JobFinderWorkspaceSnapshot>;
  startAutoApplyRun(jobId: string): Promise<JobFinderWorkspaceSnapshot>;
  startAutoApplyQueueRun(
    jobIds: readonly string[],
  ): Promise<JobFinderWorkspaceSnapshot>;
  approveApplyRun(runId: string): Promise<JobFinderWorkspaceSnapshot>;
  cancelApplyRun(runId: string): Promise<JobFinderWorkspaceSnapshot>;
  resolveApplyConsentRequest(
    requestId: string,
    action: "approve" | "decline",
  ): Promise<JobFinderWorkspaceSnapshot>;
  revokeApplyRunApproval(runId: string): Promise<JobFinderWorkspaceSnapshot>;
  approveApply(jobId: string): Promise<JobFinderWorkspaceSnapshot>;
  recordInterviewHelperApplicationAction(
    input: JobFinderInterviewFollowUpInput,
  ): Promise<JobFinderWorkspaceSnapshot>;
  mutateApplicationCrm(
    command: ApplicationCrmMutationInput,
  ): Promise<JobFinderWorkspaceSnapshot>;
  mutateApplicationCrmBulkStage(
    command: ApplicationCrmBulkStageMutationInput,
  ): Promise<JobFinderWorkspaceSnapshot>;
  runApplicationNoResponseAutomation(
    settings?: ApplicationCrmSettings,
  ): Promise<JobFinderWorkspaceSnapshot>;
  exportApplicationCrm(
    command: ApplicationCrmExportInput,
  ): Promise<ApplicationCrmExportResult>;
}

type DiscoveryTargetPipelineSharedOptions = {
  onActivity?: (event: DiscoveryActivityEvent) => void;
  signal?: AbortSignal;
  allowInactiveMarking?: boolean;
  useAgentRuntime?: boolean;
  /** Explicit campaign context; discovery then uses the campaign's preferences. */
  campaign?: CampaignRunContext;
};

export type DiscoveryTargetPipelineOptions =
  | (DiscoveryTargetPipelineSharedOptions & {
      scope: "single_target";
      targetId: string;
    })
  | (DiscoveryTargetPipelineSharedOptions & {
      scope: Exclude<DiscoveryRunScope, "single_target">;
      targetId?: never;
    });

export interface RenderedResumeArtifact {
  fileName: string | null;
  storagePath: string | null;
  sha256?: string | null;
  format: "html" | "pdf";
  intermediateFileName?: string | null;
  intermediateStoragePath?: string | null;
  pageCount?: number | null;
  warnings?: readonly string[];
}

/**
 * Explicit campaign discovery context: run the pipeline against a specific
 * campaign's preferences and tag the run record with that campaign id without
 * changing the active campaign or the global search preferences.
 */
export interface CampaignRunContext {
  campaignId: string;
  searchPreferences: JobSearchPreferences;
}

export interface JobFinderDocumentManager {
  listResumeTemplates(): readonly ResumeTemplateDefinition[];
  renderResumePreview(
    input: {
      job: SavedJob;
      profile: CandidateProfile;
      renderDocument: ResumeRenderDocument;
      templateId: ResumeTemplateId;
      settings: JobFinderSettings;
    },
    signal?: AbortSignal,
  ): Promise<{
    html: string;
    warnings?: readonly string[];
  }>;
  renderResumeArtifact(input: {
    job: SavedJob;
    profile: CandidateProfile;
    renderDocument: ResumeRenderDocument;
    templateId: ResumeTemplateId;
    settings: JobFinderSettings;
    targetPath?: string | null;
  }): Promise<RenderedResumeArtifact>;
}

export interface ResumeResearchAdapterInput {
  job: SavedJob;
  profile: CandidateProfile;
}

export interface ResumeResearchAdapter {
  fetchResearchPages(
    input: ResumeResearchAdapterInput,
  ): Promise<readonly ResumeResearchArtifact[]>;
}

export interface ResolvedApplicationCandidateAsset {
  asset: CandidateAsset;
  loadVerifiedBytes: () => Promise<Uint8Array>;
}

export interface CandidateAssetResolver {
  resolveForApplication(
    assetId: string,
  ): Promise<ResolvedApplicationCandidateAsset>;
}

export interface CreateJobFinderWorkspaceServiceOptions {
  aiClient: JobFinderAiClient;
  visionProvider?: ResumeVisionProvider;
  documentManager: JobFinderDocumentManager;
  exportFileVerifier?: ResumeExportFileVerifier;
  repository: JobFinderRepository;
  browserRuntime: BrowserSessionRuntime;
  candidateAssetResolver?: CandidateAssetResolver;
  researchAdapter?: ResumeResearchAdapter;
}
