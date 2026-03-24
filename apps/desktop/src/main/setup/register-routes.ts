import type { IpcMain } from 'electron'
import { registerJobFinderRouteHandlers } from '../routes/job-finder'
import { registerSystemRouteHandlers } from '../routes/system'
import { registerWindowRouteHandlers } from '../routes/window'

export function registerDesktopRoutes(ipcMain: IpcMain) {
  registerSystemRouteHandlers(ipcMain)
  registerWindowRouteHandlers(ipcMain)
  registerJobFinderRouteHandlers(ipcMain)
}
