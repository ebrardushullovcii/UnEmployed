import { app, BrowserWindow, Menu, ipcMain } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadDesktopEnvironment } from './setup/env'
import { registerDesktopRoutes } from './setup/register-routes'
import { createMainWindow } from './setup/window-shell'
import {
  getJobFinderWorkspaceService,
  shutdownJobFinderWorkspaceService,
} from './services/job-finder'

const currentDir = path.dirname(fileURLToPath(import.meta.url))

loadDesktopEnvironment()
registerDesktopRoutes(ipcMain)

void app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  void getJobFinderWorkspaceService()
  createMainWindow(currentDir)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow(currentDir)
    }
  })
})

let jobFinderShutdownInFlight = false

app.on('before-quit', (event) => {
  if (jobFinderShutdownInFlight) {
    return
  }

  jobFinderShutdownInFlight = true
  event.preventDefault()
  void shutdownJobFinderWorkspaceService()
    .catch(() => undefined)
    .finally(() => {
      app.quit()
    })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
