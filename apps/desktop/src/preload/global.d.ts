import type {
  DesktopPlatformPing,
  DesktopWindowControlsState,
  JobFinderWorkspaceSnapshot
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
        resetWorkspace: () => Promise<JobFinderWorkspaceSnapshot>
        queueJobForReview: (jobId: string) => Promise<JobFinderWorkspaceSnapshot>
        dismissDiscoveryJob: (jobId: string) => Promise<JobFinderWorkspaceSnapshot>
        generateResume: (jobId: string) => Promise<JobFinderWorkspaceSnapshot>
        approveApply: (jobId: string) => Promise<JobFinderWorkspaceSnapshot>
      }
    }
  }
}

export {}

