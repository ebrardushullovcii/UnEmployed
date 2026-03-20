import { app, BrowserWindow, dialog, ipcMain, Menu } from 'electron'
import { copyFile, mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJobFinderAiClientFromEnvironment } from '@unemployed/ai-providers'
import { createCatalogBrowserSessionRuntime, createLinkedInBrowserAgentRuntime } from '@unemployed/browser-runtime'
import {
  CandidateProfileSchema,
  DesktopPlatformPingSchema,
  DesktopWindowControlsStateSchema,
  JobFinderJobActionInputSchema,
  JobFinderSettingsSchema,
  JobFinderWorkspaceSnapshotSchema,
  JobSearchPreferencesSchema
} from '@unemployed/contracts'
import { createFileJobFinderRepository } from '@unemployed/db'
import { createJobFinderWorkspaceService } from '@unemployed/job-finder'
import {
  createFreshJobFinderRepositorySeed,
  createJobFinderBrowserSessionSeed,
  createJobFinderRepositorySeed,
  createLinkedInDiscoveryCatalogSeed
} from './job-finder-seed'
import { createLocalJobFinderDocumentManager } from './job-finder-document-manager'
import { loadDesktopEnvironment } from './env'
import { extractResumeText } from './resume-document'

const currentDir = path.dirname(fileURLToPath(import.meta.url))

loadDesktopEnvironment()

let jobFinderWorkspaceServicePromise:
  | ReturnType<typeof createJobFinderWorkspaceServiceAsync>
  | undefined

interface ResumeImportPathPayload {
  sourcePath: string
}

function isEnabled(value: string | undefined): boolean {
  return value === '1' || value === 'true'
}

function isDesktopTestApiEnabled(): boolean {
  return isEnabled(process.env.UNEMPLOYED_ENABLE_TEST_API)
}

function parseResumeImportPathPayload(payload: unknown): ResumeImportPathPayload {
  if (
    !payload ||
    typeof payload !== 'object' ||
    !('sourcePath' in payload) ||
    typeof payload.sourcePath !== 'string' ||
    payload.sourcePath.trim().length === 0
  ) {
    throw new Error('A non-empty sourcePath string is required for scripted resume import.')
  }

  return {
    sourcePath: payload.sourcePath
  }
}

function getJobFinderWorkspaceFilePath() {
  const userDataDirectory = process.env.UNEMPLOYED_USER_DATA_DIR ?? app.getPath('userData')

  return path.join(userDataDirectory, 'job-finder-workspace.sqlite')
}

function getJobFinderDocumentsDirectory() {
  const userDataDirectory = process.env.UNEMPLOYED_USER_DATA_DIR ?? app.getPath('userData')

  return path.join(userDataDirectory, 'documents', 'resumes')
}

function getGeneratedResumeDocumentsDirectory() {
  return path.join(getJobFinderDocumentsDirectory(), 'generated')
}

function getLinkedInBrowserProfileDirectory() {
  const userDataDirectory = process.env.UNEMPLOYED_USER_DATA_DIR ?? app.getPath('userData')

  return path.join(userDataDirectory, 'browser-agent', 'linkedin')
}

async function createJobFinderWorkspaceServiceAsync() {
  const jobFinderRepository = await createFileJobFinderRepository({
    filePath: getJobFinderWorkspaceFilePath(),
    seed: createJobFinderRepositorySeed()
  })
  const chromeDebugPort = process.env.UNEMPLOYED_CHROME_DEBUG_PORT
    ? Number.parseInt(process.env.UNEMPLOYED_CHROME_DEBUG_PORT, 10)
    : null
  const browserRuntime = isEnabled(process.env.UNEMPLOYED_LINKEDIN_BROWSER_AGENT)
    ? createLinkedInBrowserAgentRuntime({
        userDataDir: getLinkedInBrowserProfileDirectory(),
        headless: isEnabled(process.env.UNEMPLOYED_BROWSER_HEADLESS),
        ...(process.env.UNEMPLOYED_CHROME_PATH
          ? { chromeExecutablePath: process.env.UNEMPLOYED_CHROME_PATH }
          : {}),
        ...(chromeDebugPort !== null ? { debugPort: chromeDebugPort } : {})
      })
    : createCatalogBrowserSessionRuntime({
        sessions: createJobFinderBrowserSessionSeed(),
        catalog: createLinkedInDiscoveryCatalogSeed()
      })
  const aiClient = createJobFinderAiClientFromEnvironment(process.env)
  const documentManager = createLocalJobFinderDocumentManager({
    outputDirectory: getGeneratedResumeDocumentsDirectory()
  })

  return createJobFinderWorkspaceService({
    aiClient,
    documentManager,
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
  const isWindows = process.platform === 'win32'
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 720,
    show: false,
    title: 'UnEmployed',
    backgroundColor: '#0e1726',
    autoHideMenuBar: true,
    frame: !(isMac || isWindows),
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

async function importResumeFromSourcePath(sourcePath: string) {
  const targetDirectory = getJobFinderDocumentsDirectory()
  const jobFinderWorkspaceService = await getJobFinderWorkspaceService()

  await mkdir(targetDirectory, { recursive: true })

  const extractedResume = await extractResumeText(sourcePath)
  const timestamp = Date.now()
  const fileName = path.basename(sourcePath)
  const targetPath = path.join(targetDirectory, `${timestamp}_${fileName}`)

  await copyFile(sourcePath, targetPath)

  const currentSnapshot = await jobFinderWorkspaceService.getWorkspaceSnapshot()
  const savedSnapshot = await jobFinderWorkspaceService.saveProfile({
    ...currentSnapshot.profile,
    baseResume: {
      id: `resume_${timestamp}`,
      fileName,
      uploadedAt: new Date(timestamp).toISOString(),
      storagePath: targetPath,
      textContent: extractedResume.textContent,
      textUpdatedAt: extractedResume.textContent ? new Date(timestamp).toISOString() : null,
      extractionStatus: extractedResume.textContent ? 'not_started' : 'needs_text',
      lastAnalyzedAt: null,
      analysisProviderKind: null,
      analysisProviderLabel: null,
      analysisWarnings:
        extractedResume.warnings.length > 0
          ? extractedResume.warnings
          : extractedResume.textContent
            ? []
            : ['Paste plain-text resume content below if you want the agent to extract profile details from this file.']
    }
  })

  if (!extractedResume.textContent) {
    return JobFinderWorkspaceSnapshotSchema.parse(savedSnapshot)
  }

  const analyzedSnapshot = await jobFinderWorkspaceService.analyzeProfileFromResume()
  return JobFinderWorkspaceSnapshotSchema.parse(analyzedSnapshot)
}

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

ipcMain.handle('job-finder:open-browser-session', async () => {
  const jobFinderWorkspaceService = await getJobFinderWorkspaceService()
  const snapshot = await jobFinderWorkspaceService.openBrowserSession()

  return JobFinderWorkspaceSnapshotSchema.parse(snapshot)
})

ipcMain.handle('job-finder:save-profile', async (_event, payload: unknown) => {
  const profile = CandidateProfileSchema.parse(payload)
  const jobFinderWorkspaceService = await getJobFinderWorkspaceService()
  const snapshot = await jobFinderWorkspaceService.saveProfile(profile)

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

  await Promise.all([
    rm(getJobFinderDocumentsDirectory(), { recursive: true, force: true }),
    rm(getLinkedInBrowserProfileDirectory(), { recursive: true, force: true })
  ])

  const snapshot = await jobFinderWorkspaceService.resetWorkspace(createFreshJobFinderRepositorySeed())

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
