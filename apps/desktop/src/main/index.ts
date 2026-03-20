import { app, BrowserWindow, ipcMain, Menu } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createStubBrowserSessionRuntime } from '@unemployed/browser-runtime'
import {
  DesktopPlatformPingSchema,
  DesktopWindowControlsStateSchema,
  JobFinderJobActionInputSchema,
  JobFinderWorkspaceSnapshotSchema
} from '@unemployed/contracts'
import { createFileJobFinderRepository } from '@unemployed/db'
import { createJobFinderWorkspaceService } from '@unemployed/job-finder'
import {
  createJobFinderBrowserSessionSeed,
  createJobFinderRepositorySeed
} from './job-finder-seed'

const currentDir = path.dirname(fileURLToPath(import.meta.url))

let jobFinderWorkspaceServicePromise:
  | ReturnType<typeof createJobFinderWorkspaceServiceAsync>
  | undefined

function getJobFinderWorkspaceFilePath() {
  const userDataDirectory = process.env.UNEMPLOYED_USER_DATA_DIR ?? app.getPath('userData')

  return path.join(userDataDirectory, 'job-finder-workspace.json')
}

async function createJobFinderWorkspaceServiceAsync() {
  const jobFinderRepository = await createFileJobFinderRepository({
    filePath: getJobFinderWorkspaceFilePath(),
    seed: createJobFinderRepositorySeed()
  })
  const browserRuntime = createStubBrowserSessionRuntime({
    sessions: createJobFinderBrowserSessionSeed()
  })

  return createJobFinderWorkspaceService({
    repository: jobFinderRepository,
    browserRuntime
  })
}

function getJobFinderWorkspaceService() {
  jobFinderWorkspaceServicePromise ??= createJobFinderWorkspaceServiceAsync()
  return jobFinderWorkspaceServicePromise
}

function getWindowControlsState(window: BrowserWindow) {
  return DesktopWindowControlsStateSchema.parse({
    isMaximized: window.isMaximized() || window.isFullScreen(),
    isMinimizable: window.isMinimizable(),
    isClosable: window.isClosable()
  })
}

function sendWindowControlsState(window: BrowserWindow) {
  if (window.isDestroyed()) {
    return
  }

  window.webContents.send('window:controls-state-changed', getWindowControlsState(window))
}

function bindWindowControlsState(window: BrowserWindow) {
  const emitControlsState = () => sendWindowControlsState(window)

  window.on('maximize', emitControlsState)
  window.on('unmaximize', emitControlsState)
  window.on('enter-full-screen', emitControlsState)
  window.on('leave-full-screen', emitControlsState)
}

function createMainWindow() {
  const rendererUrl = process.env.ELECTRON_RENDERER_URL
  const isMac = process.platform === 'darwin'
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 720,
    show: false,
    title: 'UnEmployed',
    backgroundColor: '#0e1726',
    autoHideMenuBar: true,
    frame: !isMac,
    ...(isMac ? { titleBarStyle: 'hiddenInset' as const } : {}),
    webPreferences: {
      preload: path.join(currentDir, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  bindWindowControlsState(mainWindow)

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
    sendWindowControlsState(mainWindow)
  })

  mainWindow.removeMenu()

  if (rendererUrl) {
    void mainWindow.loadURL(rendererUrl)
  } else {
    void mainWindow.loadFile(path.join(currentDir, '../renderer/index.html'))
  }
}

ipcMain.handle('system:ping', () => {
  return DesktopPlatformPingSchema.parse({
    ok: true as const,
    platform: process.platform
  })
})

ipcMain.handle('window:get-controls-state', (event) => {
  const targetWindow = BrowserWindow.fromWebContents(event.sender)

  if (!targetWindow) {
    throw new Error('Unable to resolve the desktop window for controls state.')
  }

  return getWindowControlsState(targetWindow)
})

ipcMain.handle('window:minimize', (event) => {
  const targetWindow = BrowserWindow.fromWebContents(event.sender)

  if (!targetWindow) {
    throw new Error('Unable to resolve the desktop window for minimize action.')
  }

  targetWindow.minimize()

  return getWindowControlsState(targetWindow)
})

ipcMain.handle('window:toggle-maximize', (event) => {
  const targetWindow = BrowserWindow.fromWebContents(event.sender)

  if (!targetWindow) {
    throw new Error('Unable to resolve the desktop window for maximize action.')
  }

  if (process.platform === 'darwin') {
    targetWindow.setFullScreen(!targetWindow.isFullScreen())
  } else {
    if (targetWindow.isMaximized()) {
      targetWindow.unmaximize()
    } else {
      targetWindow.maximize()
    }
  }

  return getWindowControlsState(targetWindow)
})

ipcMain.handle('window:close', (event) => {
  const targetWindow = BrowserWindow.fromWebContents(event.sender)

  if (!targetWindow) {
    throw new Error('Unable to resolve the desktop window for close action.')
  }

  targetWindow.close()

  return { ok: true as const }
})

ipcMain.handle('job-finder:get-workspace', async () => {
  const jobFinderWorkspaceService = await getJobFinderWorkspaceService()
  const snapshot = await jobFinderWorkspaceService.getWorkspaceSnapshot()

  return JobFinderWorkspaceSnapshotSchema.parse(snapshot)
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
  const jobFinderWorkspaceService = await getJobFinderWorkspaceService()
  const snapshot = await jobFinderWorkspaceService.resetWorkspace(createJobFinderRepositorySeed())

  return JobFinderWorkspaceSnapshotSchema.parse(snapshot)
})

void app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  void getJobFinderWorkspaceService()
  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
