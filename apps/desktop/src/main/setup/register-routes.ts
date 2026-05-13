import type { IpcMain } from 'electron'
import { registerInterviewHelperRouteHandlers } from '../routes/interview-helper'
import { registerJobFinderRouteHandlers } from '../routes/job-finder'
import { registerSystemRouteHandlers } from '../routes/system'
import { registerWindowRouteHandlers } from '../routes/window'

export function registerDesktopRoutes(ipcMain: IpcMain) {
  registerSystemRouteHandlers(ipcMain)
  registerWindowRouteHandlers(ipcMain)
  registerJobFinderRouteHandlers(ipcMain)
  registerInterviewHelperRouteHandlers(ipcMain)
}
