import { contextBridge, ipcRenderer } from 'electron'
import type {
  DesktopPlatformPing,
  DesktopWindowControlsState,
  JobFinderWorkspaceSnapshot
} from '@unemployed/contracts'

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
  }
}

contextBridge.exposeInMainWorld('unemployed', desktopApi)

