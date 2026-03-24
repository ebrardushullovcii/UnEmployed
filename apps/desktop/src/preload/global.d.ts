import type {
  CandidateProfile,
  DesktopPlatformPing,
  DesktopWindowControlsState,
  JobFinderSettings,
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
