import { contextBridge, ipcRenderer } from 'electron'
import type {
  CandidateProfile,
  DesktopPlatformPing,
  DesktopWindowControlsState,
  JobFinderSettings,
  JobFinderWorkspaceSnapshot,
  JobSearchPreferences
} from '@unemployed/contracts'

const testApiEnabled = process.env.UNEMPLOYED_ENABLE_TEST_API === '1' || process.env.UNEMPLOYED_ENABLE_TEST_API === 'true'

const desktopApi = {
  ping: () => ipcRenderer.invoke('system:ping') as Promise<DesktopPlatformPing>,
  window: {
    close: () => ipcRenderer.invoke('window:close') as Promise<{ ok: true }>,
    getControlsState: () =>
      ipcRenderer.invoke('window:get-controls-state') as Promise<DesktopWindowControlsState>,
    onControlsStateChange: (listener: (state: DesktopWindowControlsState) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, state: DesktopWindowControlsState) => {
        listener(state)
      }

      ipcRenderer.on('window:controls-state-changed', handler)

      return () => {
        ipcRenderer.off('window:controls-state-changed', handler)
      }
    },
    minimize: () =>
      ipcRenderer.invoke('window:minimize') as Promise<DesktopWindowControlsState>,
    toggleMaximize: () =>
      ipcRenderer.invoke('window:toggle-maximize') as Promise<DesktopWindowControlsState>
  },
  jobFinder: {
    getWorkspace: () =>
      ipcRenderer.invoke('job-finder:get-workspace') as Promise<JobFinderWorkspaceSnapshot>,
    openBrowserSession: () =>
      ipcRenderer.invoke('job-finder:open-browser-session') as Promise<JobFinderWorkspaceSnapshot>,
    saveProfile: (profile: CandidateProfile) =>
      ipcRenderer.invoke('job-finder:save-profile', profile) as Promise<JobFinderWorkspaceSnapshot>,
    saveWorkspaceInputs: (profile: CandidateProfile, searchPreferences: JobSearchPreferences) =>
      ipcRenderer.invoke('job-finder:save-workspace-inputs', {
        profile,
        searchPreferences
      }) as Promise<JobFinderWorkspaceSnapshot>,
    analyzeProfileFromResume: () =>
      ipcRenderer.invoke('job-finder:analyze-profile-from-resume') as Promise<JobFinderWorkspaceSnapshot>,
    saveSearchPreferences: (searchPreferences: JobSearchPreferences) =>
      ipcRenderer.invoke('job-finder:save-search-preferences', searchPreferences) as Promise<JobFinderWorkspaceSnapshot>,
    saveSettings: (settings: JobFinderSettings) =>
      ipcRenderer.invoke('job-finder:save-settings', settings) as Promise<JobFinderWorkspaceSnapshot>,
    importResume: () =>
      ipcRenderer.invoke('job-finder:import-resume') as Promise<JobFinderWorkspaceSnapshot>,
    runDiscovery: () =>
      ipcRenderer.invoke('job-finder:run-discovery') as Promise<JobFinderWorkspaceSnapshot>,
    resetWorkspace: () =>
      ipcRenderer.invoke('job-finder:reset-workspace') as Promise<JobFinderWorkspaceSnapshot>,
    queueJobForReview: (jobId: string) =>
      ipcRenderer.invoke('job-finder:queue-job-for-review', { jobId }) as Promise<JobFinderWorkspaceSnapshot>,
    dismissDiscoveryJob: (jobId: string) =>
      ipcRenderer.invoke('job-finder:dismiss-discovery-job', { jobId }) as Promise<JobFinderWorkspaceSnapshot>,
    generateResume: (jobId: string) =>
      ipcRenderer.invoke('job-finder:generate-resume', { jobId }) as Promise<JobFinderWorkspaceSnapshot>,
    approveApply: (jobId: string) =>
      ipcRenderer.invoke('job-finder:approve-apply', { jobId }) as Promise<JobFinderWorkspaceSnapshot>
    ,
    ...(testApiEnabled
      ? {
          test: {
            importResumeFromPath: (sourcePath: string) =>
              ipcRenderer.invoke('job-finder:test-import-resume-from-path', {
                sourcePath
              }) as Promise<JobFinderWorkspaceSnapshot>
          }
        }
      : {})
  }
}

contextBridge.exposeInMainWorld('unemployed', desktopApi)
