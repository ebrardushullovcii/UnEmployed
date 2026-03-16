import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopPlatformPing } from '@unemployed/contracts'

const desktopApi = {
  ping: () => ipcRenderer.invoke('system:ping') as Promise<DesktopPlatformPing>
}

contextBridge.exposeInMainWorld('unemployed', desktopApi)

