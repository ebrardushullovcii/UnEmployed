import type {
  ApplicationCrmExportInput,
  ApplicationCrmFileExportResult,
  ApplicationCrmMutationInput,
  ApplicationCrmSettings,
  ApplicationDocumentExportResult,
  ApplicationDocumentListResult,
  ApplicationDocumentRevision,
  ApproveApplicationDocumentInput,
  ApplyGroupedManualAnswerInput,
  ApplyRunDetails,
  CandidateAssetDeleteInput,
  CandidateAssetDeleteResult,
  CandidateAssetImportInput,
  CandidateAssetImportResult,
  CandidateAssetListInput,
  CandidateAssetListResult,
  CandidateAssetRestoreInput,
  CandidateAssetRestoreResult,
  CampaignRuleFunnelProjection,
  JobFinderApplicationPacketExportResult,
  JobFinderDiagnosticExportResult,
  JobFinderApplyConsentActionInput,
  JobFinderApplyCopilotActionInput,
  JobFinderApplyQueueActionInput,
  CandidateProfile,
  ClearApplicationAnswerCommandInput,
  EditApplicationDocumentInput,
  ExportApplicationDocumentInput,
  DesktopPlatformPing,
  EditableSourceInstructionArtifact,
  DesktopWindowControlsState,
  DiscoveryActivityEvent,
  DiscoveryFeedbackReason,
  InterviewExportFormat,
  InterviewExportResult,
  JobFinderInterviewFollowUpInput,
  ListApplicationDocumentsInput,
  InterviewHotkeyAction,
  InterviewOverlayMoveInput,
  InterviewAudioTranscriptionInput,
  InterviewCaptionFileReadInput,
  InterviewCaptionFileTextResult,
  InterviewChatTurn,
  InterviewClipboardTextResult,
  InterviewClipboardWriteInput,
  InterviewPrepArtifactFromCueInput,
  InterviewTranscriptAnnotationInput,
  InterviewTranscriptSegmentInput,
  InterviewWorkspaceSnapshot,
  SaveInterviewSetupInput,
  SendInterviewChatMessageInput,
  UpdateInterviewOverlayPreferenceInput,
  JobFinderOpenBrowserSessionInput,
  ProfileCopilotContext,
  ProfileSetupReviewActionOptions,
  ProposeApplicationDocumentInput,
  ResumeQualityBenchmarkReport,
  ResumeQualityBenchmarkRequest,
  SaveApplicationAnswerCommandInput,
  SaveCampaignRuleInput,
  ResumeImportBenchmarkReport,
  ResumeImportBenchmarkCase,
  ResumeImportBenchmarkRequest,
  ResumeImportFieldCandidate,
  ResumeImportProgressEvent,
  ResumeImportRun,
  ResumeApplicationMode,
  ResumeTimelineRepairAction,
  ResumeDocumentBundle,
  JobFinderPerformanceSnapshot,
  JobFinderResumePreview,
  JobFinderResumeWorkspace,
  JobFinderRepositoryState,
  JobFinderSettings,
  ProfileSetupState,
  ProjectGroupedManualAnswerCommand,
  ResumeAssistantMessage,
  ResumeDraft,
  ResumeDraftPatch,
  SourceDebugProgressEvent,
  SourceDebugRunRecord,
  SourceDebugRunDetails,
  SaveJobFinderWorkspaceInput,
  JobFinderWorkspaceSnapshot,
  JobFinderWorkspaceEntityMutationInput,
  JobFinderWorkspaceSyncResult,
  JobSearchPreferences,
  SaveJobSearchCampaignInput,
  RapidReviewMutationInput,
  RecommendResumeStrategyInput,
  RecordOutcomeInput,
  CompanyIntelligenceMutationInput,
  ResumeStrategyRecommendation,
  ReviewCompanyMergeInput,
  RunCampaignNowInput,
  SaveResumeStrategyInput,
  SafeguardMutationInput,
  SelectResumeStrategyInput,
  SetCampaignResumeStrategyDefaultInput,
  SetCompanyPreferenceInput,
  SetOutcomeSuggestionEnabledInput,
  SetJobFinderActivityControlInput,
  SnoozeGroupedDecisionInput,
  WorkspaceRevision,
  UserActionCommandInput,
} from "@unemployed/contracts";

declare global {
  interface Window {
    unemployed: {
      ping: () => Promise<DesktopPlatformPing>;
      window: {
        close: () => Promise<{ ok: true }>;
        getControlsState: () => Promise<DesktopWindowControlsState>;
        onControlsStateChange: (
          listener: (state: DesktopWindowControlsState) => void,
        ) => () => void;
        minimize: () => Promise<DesktopWindowControlsState>;
        toggleMaximize: () => Promise<DesktopWindowControlsState>;
      };
      interviewHelper: {
        getWorkspace: () => Promise<InterviewWorkspaceSnapshot>;
        onWorkspaceChange: (
          listener: (workspace: InterviewWorkspaceSnapshot) => void,
        ) => () => void;
        saveSetup: (
          input: SaveInterviewSetupInput,
        ) => Promise<InterviewWorkspaceSnapshot>;
        runRehearsal: () => Promise<InterviewWorkspaceSnapshot>;
        startSession: () => Promise<InterviewWorkspaceSnapshot>;
        beginReconfiguration: () => Promise<InterviewWorkspaceSnapshot>;
        finishReconfiguration: () => Promise<InterviewWorkspaceSnapshot>;
        performAction: (
          action: InterviewHotkeyAction,
        ) => Promise<InterviewWorkspaceSnapshot>;
        moveOverlayWindow: (
          input: InterviewOverlayMoveInput,
        ) => Promise<{ moved: boolean }>;
        updateOverlayPreference: (
          input: UpdateInterviewOverlayPreferenceInput,
        ) => Promise<InterviewWorkspaceSnapshot>;
        deleteSession: (
          sessionId: string,
        ) => Promise<InterviewWorkspaceSnapshot>;
        saveCueAsPrepArtifact: (
          input: InterviewPrepArtifactFromCueInput,
        ) => Promise<InterviewWorkspaceSnapshot>;
        addTranscriptAnnotation: (
          input: InterviewTranscriptAnnotationInput,
        ) => Promise<InterviewWorkspaceSnapshot>;
        addTranscriptSegment: (
          input: InterviewTranscriptSegmentInput,
        ) => Promise<InterviewWorkspaceSnapshot>;
        sendChatMessage: (
          input: SendInterviewChatMessageInput,
        ) => Promise<InterviewChatTurn>;
        transcribeAudioChunk: (
          input: InterviewAudioTranscriptionInput,
        ) => Promise<InterviewWorkspaceSnapshot>;
        verifyOverlayProtection: () => Promise<InterviewWorkspaceSnapshot>;
        resetOverlayPreferences: () => Promise<InterviewWorkspaceSnapshot>;
        readClipboardText: () => Promise<InterviewClipboardTextResult>;
        writeClipboardText: (
          input: InterviewClipboardWriteInput,
        ) => Promise<{ written: true }>;
        selectCaptionFile: () => Promise<InterviewCaptionFileTextResult>;
        readCaptionFile: (
          input: InterviewCaptionFileReadInput,
        ) => Promise<InterviewCaptionFileTextResult>;
        exportSession: (
          sessionId: string,
          format?: InterviewExportFormat,
        ) => Promise<InterviewExportResult>;
        recordJobFinderFollowUp: (
          input: JobFinderInterviewFollowUpInput,
        ) => Promise<JobFinderWorkspaceSnapshot>;
      };
      jobFinder: {
        listApplicationDocuments: (
          input: ListApplicationDocumentsInput,
        ) => Promise<ApplicationDocumentListResult>;
        proposeApplicationDocument: (
          input: ProposeApplicationDocumentInput,
        ) => Promise<ApplicationDocumentRevision>;
        approveApplicationDocument: (
          input: ApproveApplicationDocumentInput,
        ) => Promise<ApplicationDocumentRevision>;
        editApplicationDocument: (
          input: EditApplicationDocumentInput,
        ) => Promise<ApplicationDocumentRevision>;
        exportApplicationDocument: (
          input: ExportApplicationDocumentInput,
        ) => Promise<ApplicationDocumentExportResult>;
        listCandidateAssets: (
          input?: CandidateAssetListInput,
        ) => Promise<CandidateAssetListResult>;
        importCandidateAsset: (
          input: CandidateAssetImportInput,
        ) => Promise<CandidateAssetImportResult>;
        deleteCandidateAsset: (
          input: CandidateAssetDeleteInput,
        ) => Promise<CandidateAssetDeleteResult>;
        restoreCandidateAsset: (
          input: CandidateAssetRestoreInput,
        ) => Promise<CandidateAssetRestoreResult>;
        getWorkspace: () => Promise<JobFinderWorkspaceSnapshot>;
        syncWorkspace: (
          baseRevision: WorkspaceRevision | null,
        ) => Promise<JobFinderWorkspaceSyncResult>;
        mutateWorkspaceEntities: (
          input: JobFinderWorkspaceEntityMutationInput,
        ) => Promise<JobFinderWorkspaceSyncResult>;
        openBrowserSession: (
          input?: JobFinderOpenBrowserSessionInput,
        ) => Promise<JobFinderWorkspaceSnapshot>;
        checkBrowserSession: () => Promise<JobFinderWorkspaceSnapshot>;
        performUserAction: (
          command: UserActionCommandInput,
        ) => Promise<JobFinderWorkspaceSnapshot>;
        saveProfile: (
          profile: CandidateProfile,
        ) => Promise<JobFinderWorkspaceSnapshot>;
        saveWorkspaceInputs: {
          (
            profile: CandidateProfile,
            searchPreferences: JobSearchPreferences,
          ): Promise<JobFinderWorkspaceSnapshot>;
          (
            input: SaveJobFinderWorkspaceInput,
          ): Promise<JobFinderWorkspaceSnapshot>;
        };
        analyzeProfileFromResume: () => Promise<JobFinderWorkspaceSnapshot>;
        saveSearchPreferences: (
          searchPreferences: JobSearchPreferences,
        ) => Promise<JobFinderWorkspaceSnapshot>;
        saveCampaign: (
          campaign: SaveJobSearchCampaignInput,
        ) => Promise<JobFinderWorkspaceSnapshot>;
        selectCampaign: (
          campaignId: string,
        ) => Promise<JobFinderWorkspaceSnapshot>;
        runCampaignNow: (
          input?: RunCampaignNowInput,
        ) => Promise<JobFinderWorkspaceSnapshot>;
        markCampaignNotificationRead: (
          notificationId: string,
        ) => Promise<JobFinderWorkspaceSnapshot>;
        markAllCampaignNotificationsRead: () => Promise<JobFinderWorkspaceSnapshot>;
        saveCampaignRule: (
          campaignId: string,
          rule: SaveCampaignRuleInput,
        ) => Promise<JobFinderWorkspaceSnapshot>;
        deleteCampaignRule: (
          campaignId: string,
          ruleId: string,
        ) => Promise<JobFinderWorkspaceSnapshot>;
        toggleCampaignRule: (
          campaignId: string,
          ruleId: string,
          enabled: boolean,
        ) => Promise<JobFinderWorkspaceSnapshot>;
        projectCampaignRuleFunnel: (
          campaignId: string,
        ) => Promise<CampaignRuleFunnelProjection>;
        setActivityControl: (
          input: SetJobFinderActivityControlInput,
        ) => Promise<JobFinderWorkspaceSnapshot>;
        mutateRapidReview: (
          input: RapidReviewMutationInput,
        ) => Promise<JobFinderWorkspaceSnapshot>;
        recordOutcome: (
          input: RecordOutcomeInput,
        ) => Promise<JobFinderWorkspaceSnapshot>;
        saveResumeStrategy: (
          input: SaveResumeStrategyInput,
        ) => Promise<JobFinderWorkspaceSnapshot>;
        disableResumeStrategy: (
          strategyId: string,
        ) => Promise<JobFinderWorkspaceSnapshot>;
        selectResumeStrategy: (
          input: SelectResumeStrategyInput,
        ) => Promise<JobFinderWorkspaceSnapshot>;
        recommendResumeStrategy: (
          input: RecommendResumeStrategyInput,
        ) => Promise<ResumeStrategyRecommendation>;
        setCampaignResumeStrategyDefault: (
          input: SetCampaignResumeStrategyDefaultInput,
        ) => Promise<JobFinderWorkspaceSnapshot>;
        refreshCompanyIntelligence: () => Promise<JobFinderWorkspaceSnapshot>;
        setCompanyPreference: (
          input: SetCompanyPreferenceInput,
        ) => Promise<JobFinderWorkspaceSnapshot>;
        reviewCompanyMerge: (
          input: ReviewCompanyMergeInput,
        ) => Promise<JobFinderWorkspaceSnapshot>;
        mutateCompanyIntelligence: (
          input: CompanyIntelligenceMutationInput,
        ) => Promise<JobFinderWorkspaceSnapshot>;
        setOutcomeSuggestionEnabled: (
          input: SetOutcomeSuggestionEnabledInput,
        ) => Promise<JobFinderWorkspaceSnapshot>;
        mutateSafeguards: (
          input: SafeguardMutationInput,
        ) => Promise<JobFinderWorkspaceSnapshot>;
        saveSettings: (
          settings: JobFinderSettings,
        ) => Promise<JobFinderWorkspaceSnapshot>;
        saveProfileSetupState: (
          profileSetupState: ProfileSetupState,
        ) => Promise<JobFinderWorkspaceSnapshot>;
        applyProfileSetupReviewAction: (
          reviewItemId: string,
          action: "confirm" | "dismiss" | "clear_value",
          options?: ProfileSetupReviewActionOptions,
        ) => Promise<JobFinderWorkspaceSnapshot>;
        applyResumeTimelineRepairAction: (
          runId: string,
          proposalId: string,
          action: ResumeTimelineRepairAction,
        ) => Promise<JobFinderWorkspaceSnapshot>;
        sendProfileCopilotMessage: (
          content: string,
          context?: ProfileCopilotContext,
        ) => Promise<JobFinderWorkspaceSnapshot>;
        applyProfileCopilotPatchGroup: (
          patchGroupId: string,
        ) => Promise<JobFinderWorkspaceSnapshot>;
        rejectProfileCopilotPatchGroup: (
          patchGroupId: string,
        ) => Promise<JobFinderWorkspaceSnapshot>;
        undoProfileRevision: (
          revisionId: string,
        ) => Promise<JobFinderWorkspaceSnapshot>;
        importResume: (
          onProgress?: (event: ResumeImportProgressEvent) => void,
        ) => Promise<JobFinderWorkspaceSnapshot>;
        runDiscovery: () => Promise<JobFinderWorkspaceSnapshot>;
        runAgentDiscovery: (
          onActivity?: (event: DiscoveryActivityEvent) => void,
          targetId?: string,
        ) => Promise<JobFinderWorkspaceSnapshot>;
        runSourceDebug: (
          targetId: string,
          onProgress?: (event: SourceDebugProgressEvent) => void,
        ) => Promise<JobFinderWorkspaceSnapshot>;
        cancelSourceDebug: (
          runId: string,
        ) => Promise<JobFinderWorkspaceSnapshot>;
        getSourceDebugRun: (runId: string) => Promise<SourceDebugRunRecord>;
        getSourceDebugRunDetails: (
          runId: string,
        ) => Promise<SourceDebugRunDetails>;
        getApplyRunDetails: (
          runId: string,
          jobId: string,
        ) => Promise<ApplyRunDetails>;
        saveApplicationAnswer: (
          command: SaveApplicationAnswerCommandInput,
        ) => Promise<ApplyRunDetails>;
        clearApplicationAnswer: (
          command: ClearApplicationAnswerCommandInput,
        ) => Promise<ApplyRunDetails>;
        projectGroupedManualAnswer: (
          command: ProjectGroupedManualAnswerCommand,
        ) => Promise<JobFinderWorkspaceSnapshot>;
        applyGroupedManualAnswer: (
          input: ApplyGroupedManualAnswerInput,
        ) => Promise<JobFinderWorkspaceSnapshot>;
        snoozeGroupedDecision: (
          input: SnoozeGroupedDecisionInput,
        ) => Promise<JobFinderWorkspaceSnapshot>;
        exportDiagnostics: () => Promise<JobFinderDiagnosticExportResult>;
        getPerformanceSnapshot: () => Promise<JobFinderPerformanceSnapshot>;
        exportApplicationPacket: (
          runId: string,
          jobId: string,
        ) => Promise<JobFinderApplicationPacketExportResult>;
        saveSourceInstructionArtifact: (
          targetId: string,
          artifact: EditableSourceInstructionArtifact,
        ) => Promise<JobFinderWorkspaceSnapshot>;
        listSourceDebugRuns: (
          targetId: string,
        ) => Promise<readonly SourceDebugRunRecord[]>;
        acceptSourceInstructionDraft: (
          targetId: string,
          instructionId: string,
        ) => Promise<JobFinderWorkspaceSnapshot>;
        verifySourceInstructions: (
          targetId: string,
          instructionId: string,
        ) => Promise<JobFinderWorkspaceSnapshot>;
        cancelAgentDiscovery: () => void;
        resetWorkspace: () => Promise<JobFinderWorkspaceSnapshot>;
        queueJobForReview: (
          jobId: string,
        ) => Promise<JobFinderWorkspaceSnapshot>;
        setJobResumeApplicationMode: (
          jobId: string,
          resumeApplicationMode: ResumeApplicationMode,
        ) => Promise<JobFinderWorkspaceSnapshot>;
        removeJobFromReview: (
          jobId: string,
        ) => Promise<JobFinderWorkspaceSnapshot>;
        dismissDiscoveryJob: (
          jobId: string,
          reasons: readonly DiscoveryFeedbackReason[],
        ) => Promise<JobFinderWorkspaceSnapshot>;
        restoreDismissedDiscoveryJob: (
          jobId: string,
        ) => Promise<JobFinderWorkspaceSnapshot>;
        getResumeWorkspace: (
          jobId: string,
        ) => Promise<JobFinderResumeWorkspace>;
        previewResumeDraft: (
          draft: ResumeDraft,
        ) => Promise<JobFinderResumePreview>;
        saveResumeDraft: (
          draft: ResumeDraft,
        ) => Promise<JobFinderWorkspaceSnapshot>;
        restoreResumeDraftRevision: (
          jobId: string,
          revisionId: string,
        ) => Promise<JobFinderWorkspaceSnapshot>;
        regenerateResumeDraft: (
          jobId: string,
        ) => Promise<JobFinderWorkspaceSnapshot>;
        regenerateResumeSection: (
          jobId: string,
          sectionId: string,
        ) => Promise<JobFinderWorkspaceSnapshot>;
        exportResumePdf: (jobId: string) => Promise<JobFinderWorkspaceSnapshot>;
        approveResume: (
          jobId: string,
          exportId: string,
        ) => Promise<JobFinderWorkspaceSnapshot>;
        clearResumeApproval: (
          jobId: string,
        ) => Promise<JobFinderWorkspaceSnapshot>;
        applyResumePatch: (
          patch: ResumeDraftPatch,
          revisionReason?: string | null,
        ) => Promise<JobFinderWorkspaceSnapshot>;
        getResumeAssistantMessages: (
          jobId: string,
        ) => Promise<readonly ResumeAssistantMessage[]>;
        sendResumeAssistantMessage: (
          jobId: string,
          content: string,
        ) => Promise<readonly ResumeAssistantMessage[]>;
        resolveResumeAssistantProposal: (
          jobId: string,
          proposalId: string,
          action: "accept" | "reject",
          patchIds: readonly string[],
        ) => Promise<readonly ResumeAssistantMessage[]>;
        generateResume: (jobId: string) => Promise<JobFinderWorkspaceSnapshot>;
        startApplyCopilotRun: (
          jobId: string,
          options?: Pick<
            JobFinderApplyCopilotActionInput,
            "visualCheckpointsEnabled"
          >,
        ) => Promise<JobFinderWorkspaceSnapshot>;
        startAutoApplyRun: (
          jobId: string,
        ) => Promise<JobFinderWorkspaceSnapshot>;
        startAutoApplyQueueRun: (
          jobIds: JobFinderApplyQueueActionInput["jobIds"],
        ) => Promise<JobFinderWorkspaceSnapshot>;
        approveApplyRun: (runId: string) => Promise<JobFinderWorkspaceSnapshot>;
        cancelApplyRun: (runId: string) => Promise<JobFinderWorkspaceSnapshot>;
        resolveApplyConsentRequest: (
          requestId: string,
          action: JobFinderApplyConsentActionInput["action"],
        ) => Promise<JobFinderWorkspaceSnapshot>;
        revokeApplyRunApproval: (
          runId: string,
        ) => Promise<JobFinderWorkspaceSnapshot>;
        approveApply: (jobId: string) => Promise<JobFinderWorkspaceSnapshot>;
        mutateApplicationCrm: (
          input: ApplicationCrmMutationInput,
        ) => Promise<JobFinderWorkspaceSnapshot>;
        runApplicationNoResponseAutomation: (
          settings?: ApplicationCrmSettings,
        ) => Promise<JobFinderWorkspaceSnapshot>;
        exportApplicationCrm: (
          input: ApplicationCrmExportInput,
        ) => Promise<ApplicationCrmFileExportResult>;
        test?: {
          getSystemThemeOverride: () => "dark" | "light" | null;
          setSystemThemeOverride: (
            theme: "dark" | "light" | null,
          ) => Promise<{ ok: true }>;
          setResumePreviewMode: (
            mode: "ok" | "fail_once",
          ) => Promise<{ ok: true }>;
          loadResumeWorkspaceDemo: () => Promise<JobFinderWorkspaceSnapshot>;
          loadApplyQueueDemo: () => Promise<JobFinderWorkspaceSnapshot>;
          resetWorkspaceState: (
            state: JobFinderRepositoryState,
          ) => Promise<JobFinderWorkspaceSnapshot>;
          getPerformanceSnapshot: () => Promise<JobFinderPerformanceSnapshot>;
          runResumeImportBenchmark: (
            input?: Partial<ResumeImportBenchmarkRequest>,
          ) => Promise<ResumeImportBenchmarkReport>;
          getResumeImportBenchmarkCases: () => Promise<
            readonly ResumeImportBenchmarkCase[]
          >;
          getResumeImportState: () => Promise<{
            resumeImportRuns: readonly ResumeImportRun[];
            resumeImportDocumentBundles: readonly ResumeDocumentBundle[];
            resumeImportFieldCandidates: readonly ResumeImportFieldCandidate[];
          }>;
          runResumeQualityBenchmark: (
            input?: Partial<ResumeQualityBenchmarkRequest>,
          ) => Promise<ResumeQualityBenchmarkReport>;
          importResumeFromPath: (
            sourcePath: string | { sourcePath: string; useVision?: boolean },
          ) => Promise<JobFinderWorkspaceSnapshot>;
        };
      };
    };
  }
}

export {};
