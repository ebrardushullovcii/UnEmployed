import type { IpcMain } from 'electron'
import {
  InterviewExportSessionInputSchema,
  InterviewPrepArtifactFromCueInputSchema,
  InterviewSessionActionInputSchema,
  InterviewSessionIdInputSchema,
  SaveInterviewSetupInputSchema,
} from '@unemployed/contracts'
import { getInterviewHelperService } from '../services/interview-helper'
import { syncInterviewOverlayWindows } from '../setup/interview-overlay-windows'

async function withSyncedOverlays<T extends Awaited<ReturnType<Awaited<ReturnType<typeof getInterviewHelperService>>['getWorkspace']>>>(
  operation: () => Promise<T>,
) {
  const workspace = await operation()
  syncInterviewOverlayWindows(workspace)
  return workspace
}

export function registerInterviewHelperRouteHandlers(ipcMain: IpcMain) {
  ipcMain.handle('interview-helper:get-workspace', async () => {
    const service = await getInterviewHelperService()
    return service.getWorkspace()
  })

  ipcMain.handle('interview-helper:save-setup', async (_event, payload: unknown) => {
    const input = SaveInterviewSetupInputSchema.parse(payload)
    const service = await getInterviewHelperService()
    return withSyncedOverlays(() => service.saveSetup(input))
  })

  ipcMain.handle('interview-helper:run-rehearsal', async () => {
    const service = await getInterviewHelperService()
    return withSyncedOverlays(() => service.runRehearsal())
  })

  ipcMain.handle('interview-helper:start-session', async () => {
    const service = await getInterviewHelperService()
    return withSyncedOverlays(() => service.startSession())
  })

  ipcMain.handle('interview-helper:perform-action', async (_event, payload: unknown) => {
    const input = InterviewSessionActionInputSchema.parse(payload)
    const service = await getInterviewHelperService()
    return withSyncedOverlays(() => service.performAction(input))
  })

  ipcMain.handle('interview-helper:delete-session', async (_event, payload: unknown) => {
    const input = InterviewSessionIdInputSchema.parse(payload)
    const service = await getInterviewHelperService()
    return withSyncedOverlays(() => service.deleteSession(input.sessionId))
  })

  ipcMain.handle('interview-helper:save-cue-as-prep-artifact', async (_event, payload: unknown) => {
    const input = InterviewPrepArtifactFromCueInputSchema.parse(payload)
    const service = await getInterviewHelperService()
    return withSyncedOverlays(() => service.saveCueAsPrepArtifact(input))
  })

  ipcMain.handle('interview-helper:export-session', async (_event, payload: unknown) => {
    const input = InterviewExportSessionInputSchema.parse(payload)
    const service = await getInterviewHelperService()
    return service.exportSession(input)
  })
}
