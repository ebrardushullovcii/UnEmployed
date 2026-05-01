import { BrowserWindow } from 'electron'
import path from 'node:path'
import { DesktopWindowControlsStateSchema } from '@unemployed/contracts'
import {
  bindMainWindowStatePersistence,
  loadMainWindowState,
  restoreMainWindowBounds,
} from './window-state'

const defaultMainWindowBounds = {
  width: 1440,
  height: 920,
} as const

export function getWindowControlsState(window: BrowserWindow) {
  return DesktopWindowControlsStateSchema.parse({
    isMaximized: window.isMaximized() || window.isFullScreen(),
    isMinimizable: window.isMinimizable(),
    isClosable: window.isClosable()
  })
}

export function sendWindowControlsState(window: BrowserWindow) {
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

export function createMainWindow(currentDir: string) {
  const rendererUrl = process.env.ELECTRON_RENDERER_URL
  const isMac = process.platform === 'darwin'
  const isWindows = process.platform === 'win32'
  const savedState = loadMainWindowState()
  const mainWindow = new BrowserWindow({
    ...restoreMainWindowBounds(defaultMainWindowBounds, savedState),
    minWidth: 1024,
    minHeight: 720,
    show: false,
    title: 'UnEmployed',
    backgroundColor: '#0e1726',
    autoHideMenuBar: true,
    frame: !(isMac || isWindows),
    ...(isMac ? { titleBarStyle: 'hiddenInset' as const } : {}),
    webPreferences: {
      preload: path.join(currentDir, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  bindWindowControlsState(mainWindow)
  bindMainWindowStatePersistence(mainWindow)

  mainWindow.on('ready-to-show', () => {
    if (savedState?.displayMode === 'fullscreen') {
      mainWindow.setFullScreen(true)
    } else if (savedState?.displayMode === 'maximized') {
      mainWindow.maximize()
    }

    mainWindow.show()
    sendWindowControlsState(mainWindow)
  })

  mainWindow.removeMenu()

  if (rendererUrl) {
    void mainWindow.loadURL(rendererUrl)
  } else {
    void mainWindow.loadFile(path.join(currentDir, '../renderer/index.html'))
  }

  return mainWindow
}
