import { dialog, type IpcMain } from 'electron'
import {
  CandidateProfileSchema,
  DiscoveryActivityEventSchema,
  JobFinderJobActionInputSchema,
  JobFinderSettingsSchema,
  SaveJobFinderWorkspaceInputSchema,
  JobFinderWorkspaceSnapshotSchema,
  JobSearchPreferencesSchema
} from '@unemployed/contracts'
import {
  getJobFinderWorkspaceService,
  importResumeFromSourcePath,
  isDesktopTestApiEnabled,
  parseResumeImportPathPayload,
  resetJobFinderWorkspace
} from '../services/job-finder'

function parseAgentDiscoveryRequestId(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Missing agent discovery request id payload')
  }

  const requestId = (payload as { requestId?: unknown }).requestId
  if (typeof requestId !== 'string' || requestId.trim().length === 0) {
    throw new Error('Invalid agent discovery request id payload')
  }

  return requestId
}

export function registerJobFinderRouteHandlers(ipcMain: IpcMain) {
  ipcMain.handle('job-finder:get-workspace', async () => {
    const jobFinderWorkspaceService = await getJobFinderWorkspaceService()
    const snapshot = await jobFinderWorkspaceService.getWorkspaceSnapshot()

    return JobFinderWorkspaceSnapshotSchema.parse(snapshot)
  })

  ipcMain.handle('job-finder:open-browser-session', async () => {
    const jobFinderWorkspaceService = await getJobFinderWorkspaceService()
    const snapshot = await jobFinderWorkspaceService.openBrowserSession()

    return JobFinderWorkspaceSnapshotSchema.parse(snapshot)
  })

  ipcMain.handle('job-finder:check-browser-session', async () => {
    const jobFinderWorkspaceService = await getJobFinderWorkspaceService()
    const snapshot = await jobFinderWorkspaceService.checkBrowserSession()

    return JobFinderWorkspaceSnapshotSchema.parse(snapshot)
  })

  ipcMain.handle('job-finder:save-profile', async (_event, payload: unknown) => {
    const profile = CandidateProfileSchema.parse(payload)
    const jobFinderWorkspaceService = await getJobFinderWorkspaceService()
    const snapshot = await jobFinderWorkspaceService.saveProfile(profile)

    return JobFinderWorkspaceSnapshotSchema.parse(snapshot)
  })

  ipcMain.handle('job-finder:save-workspace-inputs', async (_event, payload: unknown) => {
    const { profile, searchPreferences, settings } = SaveJobFinderWorkspaceInputSchema.parse(payload)
    const jobFinderWorkspaceService = await getJobFinderWorkspaceService()
    await jobFinderWorkspaceService.saveProfileAndSearchPreferences(profile, searchPreferences)

    if (settings) {
      await jobFinderWorkspaceService.saveSettings(settings)
    }

    const snapshot = await jobFinderWorkspaceService.getWorkspaceSnapshot()

    return JobFinderWorkspaceSnapshotSchema.parse(snapshot)
  })

  ipcMain.handle('job-finder:analyze-profile-from-resume', async () => {
    const jobFinderWorkspaceService = await getJobFinderWorkspaceService()
    const snapshot = await jobFinderWorkspaceService.analyzeProfileFromResume()

    return JobFinderWorkspaceSnapshotSchema.parse(snapshot)
  })

  ipcMain.handle('job-finder:save-search-preferences', async (_event, payload: unknown) => {
    const searchPreferences = JobSearchPreferencesSchema.parse(payload)
    const jobFinderWorkspaceService = await getJobFinderWorkspaceService()
    const snapshot = await jobFinderWorkspaceService.saveSearchPreferences(searchPreferences)

    return JobFinderWorkspaceSnapshotSchema.parse(snapshot)
  })

  ipcMain.handle('job-finder:save-settings', async (_event, payload: unknown) => {
    const settings = JobFinderSettingsSchema.parse(payload)
    const jobFinderWorkspaceService = await getJobFinderWorkspaceService()
    const snapshot = await jobFinderWorkspaceService.saveSettings(settings)

    return JobFinderWorkspaceSnapshotSchema.parse(snapshot)
  })

  ipcMain.handle('job-finder:import-resume', async () => {
    const selection = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'Resume documents', extensions: ['pdf', 'docx', 'txt', 'md'] },
        { name: 'All files', extensions: ['*'] }
      ]
    })

    const jobFinderWorkspaceService = await getJobFinderWorkspaceService()

    if (selection.canceled || selection.filePaths.length === 0) {
      return JobFinderWorkspaceSnapshotSchema.parse(await jobFinderWorkspaceService.getWorkspaceSnapshot())
    }

    const sourcePath = selection.filePaths[0]

    if (!sourcePath) {
      return JobFinderWorkspaceSnapshotSchema.parse(await jobFinderWorkspaceService.getWorkspaceSnapshot())
    }

    return importResumeFromSourcePath(sourcePath)
  })

  ipcMain.handle('job-finder:test-import-resume-from-path', async (_event, payload: unknown) => {
    if (!isDesktopTestApiEnabled()) {
      throw new Error('Desktop test API is disabled. Set UNEMPLOYED_ENABLE_TEST_API=1 to enable scripted UI flows.')
    }

    const { sourcePath } = parseResumeImportPathPayload(payload)
    return importResumeFromSourcePath(sourcePath)
  })

  ipcMain.handle('job-finder:run-discovery', async () => {
    const jobFinderWorkspaceService = await getJobFinderWorkspaceService()
    const snapshot = await jobFinderWorkspaceService.runDiscovery()

    return JobFinderWorkspaceSnapshotSchema.parse(snapshot)
  })

  ipcMain.handle('job-finder:run-agent-discovery', async (event, payload: unknown) => {
    const jobFinderWorkspaceService = await getJobFinderWorkspaceService()
    const window = event.sender
    const senderId = event.sender.id
    const requestId = parseAgentDiscoveryRequestId(payload)
    const controller = new AbortController()

    const cancelHandler = (cancelEvent: Electron.IpcMainEvent, cancelPayload: unknown) => {
      const cancelRequestId = (() => {
        try {
          return parseAgentDiscoveryRequestId(cancelPayload)
        } catch {
          return null
        }
      })()

      if (cancelEvent.sender.id !== senderId || cancelRequestId !== requestId) {
        return
      }

      controller.abort()
    }
    ipcMain.on('job-finder:cancel-agent-discovery', cancelHandler)

    try {
      const snapshot = await jobFinderWorkspaceService.runAgentDiscovery(
        (eventPayload) => {
          window.send(`job-finder:discovery-activity:${requestId}`, DiscoveryActivityEventSchema.parse(eventPayload))
        },
        controller.signal
      )

      return JobFinderWorkspaceSnapshotSchema.parse(snapshot)
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('[JobFinder] Agent discovery cancelled')
        // Return current workspace snapshot even on abort
        const currentSnapshot = await jobFinderWorkspaceService.getWorkspaceSnapshot()
        return JobFinderWorkspaceSnapshotSchema.parse(currentSnapshot)
      }
      throw error
    } finally {
      ipcMain.removeListener('job-finder:cancel-agent-discovery', cancelHandler)
    }
  })

  ipcMain.handle('job-finder:queue-job-for-review', async (_event, payload: unknown) => {
    const { jobId } = JobFinderJobActionInputSchema.parse(payload)
    const jobFinderWorkspaceService = await getJobFinderWorkspaceService()
    const snapshot = await jobFinderWorkspaceService.queueJobForReview(jobId)

    return JobFinderWorkspaceSnapshotSchema.parse(snapshot)
  })

  ipcMain.handle('job-finder:dismiss-discovery-job', async (_event, payload: unknown) => {
    const { jobId } = JobFinderJobActionInputSchema.parse(payload)
    const jobFinderWorkspaceService = await getJobFinderWorkspaceService()
    const snapshot = await jobFinderWorkspaceService.dismissDiscoveryJob(jobId)

    return JobFinderWorkspaceSnapshotSchema.parse(snapshot)
  })

  ipcMain.handle('job-finder:generate-resume', async (_event, payload: unknown) => {
    const { jobId } = JobFinderJobActionInputSchema.parse(payload)
    const jobFinderWorkspaceService = await getJobFinderWorkspaceService()
    const snapshot = await jobFinderWorkspaceService.generateResume(jobId)

    return JobFinderWorkspaceSnapshotSchema.parse(snapshot)
  })

  ipcMain.handle('job-finder:approve-apply', async (_event, payload: unknown) => {
    const { jobId } = JobFinderJobActionInputSchema.parse(payload)
    const jobFinderWorkspaceService = await getJobFinderWorkspaceService()
    const snapshot = await jobFinderWorkspaceService.approveApply(jobId)

    return JobFinderWorkspaceSnapshotSchema.parse(snapshot)
  })

  ipcMain.handle('job-finder:reset-workspace', async () => {
    return resetJobFinderWorkspace()
  })
}
