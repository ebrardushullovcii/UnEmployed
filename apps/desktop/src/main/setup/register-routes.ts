import type { IpcMain } from 'electron'
import { registerApplicationDocumentRouteHandlers } from '../routes/application-documents'
import { registerCandidateAssetRouteHandlers } from '../routes/candidate-assets'
import { registerInterviewHelperRouteHandlers } from '../routes/interview-helper'
import { registerJobFinderRouteHandlers } from '../routes/job-finder'
import { registerSystemRouteHandlers } from '../routes/system'
import { registerWindowRouteHandlers } from '../routes/window'

export function registerDesktopRoutes(ipcMain: IpcMain) {
  registerSystemRouteHandlers(ipcMain)
  registerWindowRouteHandlers(ipcMain)
  registerCandidateAssetRouteHandlers(ipcMain)
  registerApplicationDocumentRouteHandlers(ipcMain)
  registerJobFinderRouteHandlers(ipcMain)
  registerInterviewHelperRouteHandlers(ipcMain)
}
