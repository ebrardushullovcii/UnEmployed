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
const jobFinderShutdownTimeoutMs = 15_000

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
  let shutdownTimeoutId: ReturnType<typeof setTimeout> | null = null
  const shutdownTimeout = new Promise<void>((resolve) => {
    shutdownTimeoutId = setTimeout(() => {
      console.warn(
        `[Desktop] Job Finder workspace service shutdown exceeded ${jobFinderShutdownTimeoutMs}ms; continuing quit.`,
      )
      resolve()
    }, jobFinderShutdownTimeoutMs)
  })
  void Promise.race([shutdownJobFinderWorkspaceService(), shutdownTimeout])
    .catch((error) => {
      console.warn('[Desktop] Failed to shut down Job Finder workspace service before quit.', error)
    })
    .finally(() => {
      if (shutdownTimeoutId) {
        clearTimeout(shutdownTimeoutId)
      }
      app.quit()
    })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
