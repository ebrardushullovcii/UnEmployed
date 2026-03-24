import { BrowserWindow, type IpcMain } from 'electron'
import { getWindowControlsState } from '../setup/window-shell'

export function registerWindowRouteHandlers(ipcMain: IpcMain) {
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
    } else if (targetWindow.isMaximized()) {
      targetWindow.unmaximize()
    } else {
      targetWindow.maximize()
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
}
