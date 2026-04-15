import type {
  CandidateProfile,
  DesktopPlatformPing,
  EditableSourceInstructionArtifact,
  DesktopWindowControlsState,
  DiscoveryActivityEvent,
  ProfileCopilotContext,
  ResumeImportBenchmarkReport,
  ResumeImportBenchmarkRequest,
  JobFinderPerformanceSnapshot,
  JobFinderResumeWorkspace,
  JobFinderRepositoryState,
  JobFinderSettings,
  ProfileSetupState,
  ResumeAssistantMessage,
  ResumeDraft,
  ResumeDraftPatch,
  SourceDebugProgressEvent,
  SourceDebugRunRecord,
  SourceDebugRunDetails,
  SaveJobFinderWorkspaceInput,
  JobFinderWorkspaceSnapshot,
  JobSearchPreferences,
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
      jobFinder: {
        getWorkspace: () => Promise<JobFinderWorkspaceSnapshot>;
        openBrowserSession: () => Promise<JobFinderWorkspaceSnapshot>;
        checkBrowserSession: () => Promise<JobFinderWorkspaceSnapshot>;
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
        saveSettings: (
          settings: JobFinderSettings,
        ) => Promise<JobFinderWorkspaceSnapshot>;
        saveProfileSetupState: (
          profileSetupState: ProfileSetupState,
        ) => Promise<JobFinderWorkspaceSnapshot>;
        applyProfileSetupReviewAction: (
          reviewItemId: string,
          action: "confirm" | "dismiss" | "clear_value",
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
        importResume: () => Promise<JobFinderWorkspaceSnapshot>;
        runDiscovery: () => Promise<JobFinderWorkspaceSnapshot>;
        runAgentDiscovery: (
          onActivity?: (event: DiscoveryActivityEvent) => void,
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
        dismissDiscoveryJob: (
          jobId: string,
        ) => Promise<JobFinderWorkspaceSnapshot>;
        getResumeWorkspace: (jobId: string) => Promise<JobFinderResumeWorkspace>;
        saveResumeDraft: (draft: ResumeDraft) => Promise<JobFinderWorkspaceSnapshot>;
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
        generateResume: (jobId: string) => Promise<JobFinderWorkspaceSnapshot>;
        approveApply: (jobId: string) => Promise<JobFinderWorkspaceSnapshot>;
        test?: {
          getSystemThemeOverride: () => 'dark' | 'light' | null;
          setSystemThemeOverride: (theme: 'dark' | 'light' | null) => Promise<{ ok: true }>;
          loadResumeWorkspaceDemo: () => Promise<JobFinderWorkspaceSnapshot>;
          resetWorkspaceState: (
            state: JobFinderRepositoryState,
          ) => Promise<JobFinderWorkspaceSnapshot>;
          getPerformanceSnapshot: () => Promise<JobFinderPerformanceSnapshot>;
          runResumeImportBenchmark: (
            input?: Partial<ResumeImportBenchmarkRequest>,
          ) => Promise<ResumeImportBenchmarkReport>;
          importResumeFromPath: (
            sourcePath: string,
          ) => Promise<JobFinderWorkspaceSnapshot>;
        };
      };
    };
  }
}

export {};
