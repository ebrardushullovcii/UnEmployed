import type {
  CandidateProfile,
  DesktopPlatformPing,
  DesktopWindowControlsState,
  DiscoveryActivityEvent,
  JobFinderSettings,
  SourceDebugRunRecord,
  SourceDebugRunDetails,
  SourceInstructionArtifact,
  SaveJobFinderWorkspaceInput,
  JobFinderWorkspaceSnapshot,
  JobSearchPreferences
} from '@unemployed/contracts'

declare global {
  interface Window {
    unemployed: {
      ping: () => Promise<DesktopPlatformPing>
      window: {
        close: () => Promise<{ ok: true }>
        getControlsState: () => Promise<DesktopWindowControlsState>
        onControlsStateChange: (listener: (state: DesktopWindowControlsState) => void) => () => void
        minimize: () => Promise<DesktopWindowControlsState>
        toggleMaximize: () => Promise<DesktopWindowControlsState>
      }
      jobFinder: {
        getWorkspace: () => Promise<JobFinderWorkspaceSnapshot>
        openBrowserSession: () => Promise<JobFinderWorkspaceSnapshot>
        checkBrowserSession: () => Promise<JobFinderWorkspaceSnapshot>
        saveProfile: (profile: CandidateProfile) => Promise<JobFinderWorkspaceSnapshot>
        saveWorkspaceInputs: {
          (profile: CandidateProfile, searchPreferences: JobSearchPreferences): Promise<JobFinderWorkspaceSnapshot>
          (input: SaveJobFinderWorkspaceInput): Promise<JobFinderWorkspaceSnapshot>
        }
        analyzeProfileFromResume: () => Promise<JobFinderWorkspaceSnapshot>
        saveSearchPreferences: (searchPreferences: JobSearchPreferences) => Promise<JobFinderWorkspaceSnapshot>
        saveSettings: (settings: JobFinderSettings) => Promise<JobFinderWorkspaceSnapshot>
        importResume: () => Promise<JobFinderWorkspaceSnapshot>
        runDiscovery: () => Promise<JobFinderWorkspaceSnapshot>
        runAgentDiscovery: (onActivity?: (event: DiscoveryActivityEvent) => void) => Promise<JobFinderWorkspaceSnapshot>
        runSourceDebug: (targetId: string) => Promise<JobFinderWorkspaceSnapshot>
        cancelSourceDebug: (runId: string) => Promise<JobFinderWorkspaceSnapshot>
        getSourceDebugRun: (runId: string) => Promise<SourceDebugRunRecord>
        getSourceDebugRunDetails: (runId: string) => Promise<SourceDebugRunDetails>
        saveSourceInstructionArtifact: (targetId: string, artifact: SourceInstructionArtifact) => Promise<JobFinderWorkspaceSnapshot>
        listSourceDebugRuns: (targetId: string) => Promise<readonly SourceDebugRunRecord[]>
        acceptSourceInstructionDraft: (targetId: string, instructionId: string) => Promise<JobFinderWorkspaceSnapshot>
        verifySourceInstructions: (targetId: string, instructionId: string) => Promise<JobFinderWorkspaceSnapshot>
        cancelAgentDiscovery: () => void
        resetWorkspace: () => Promise<JobFinderWorkspaceSnapshot>
        queueJobForReview: (jobId: string) => Promise<JobFinderWorkspaceSnapshot>
        dismissDiscoveryJob: (jobId: string) => Promise<JobFinderWorkspaceSnapshot>
        generateResume: (jobId: string) => Promise<JobFinderWorkspaceSnapshot>
        approveApply: (jobId: string) => Promise<JobFinderWorkspaceSnapshot>
        test?: {
          importResumeFromPath: (sourcePath: string) => Promise<JobFinderWorkspaceSnapshot>
        }
      }
    }
  }
}

export {}
