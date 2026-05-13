import { BrowserWindow } from 'electron'
import path from 'node:path'
import type { InterviewOverlaySnapshot, InterviewWorkspaceSnapshot } from '@unemployed/contracts'

type InterviewOverlayKind = 'answer' | 'transcript'

interface InterviewOverlayWindowEntry {
  readonly kind: InterviewOverlayKind
  readonly route: string
  readonly window: BrowserWindow
}

let currentDirForOverlays: string | null = null
let lastSnapshot: InterviewWorkspaceSnapshot | null = null
let overlayEntries: InterviewOverlayWindowEntry[] = []

function createOverlayWindow(kind: InterviewOverlayKind, route: string): InterviewOverlayWindowEntry {
  if (!currentDirForOverlays) {
    throw new Error('Interview overlay windows were not initialized.')
  }

  const isAnswer = kind === 'answer'
  const window = new BrowserWindow({
    width: isAnswer ? 440 : 560,
    height: isAnswer ? 260 : 380,
    minWidth: isAnswer ? 320 : 420,
    minHeight: isAnswer ? 180 : 260,
    show: false,
    frame: false,
    transparent: true,
    resizable: true,
    movable: true,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(currentDirForOverlays, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  window.setContentProtection(true)
  window.setIgnoreMouseEvents(true, { forward: true })
  window.setAlwaysOnTop(true, 'screen-saver')
  window.removeMenu()

  const rendererUrl = process.env.ELECTRON_RENDERER_URL
  if (rendererUrl) {
    void window.loadURL(`${rendererUrl}#${route}`)
  } else {
    void window.loadFile(path.join(currentDirForOverlays, '../renderer/index.html'), {
      hash: route,
    })
  }

  return { kind, route, window }
}

function ensureOverlayEntries() {
  const liveEntries = overlayEntries.filter((entry) => !entry.window.isDestroyed())
  overlayEntries = liveEntries

  if (overlayEntries.length === 2) {
    return overlayEntries
  }

  closeInterviewOverlayWindows()
  overlayEntries = [
    createOverlayWindow('answer', '/interview-helper/overlay/answer'),
    createOverlayWindow('transcript', '/interview-helper/overlay/transcript'),
  ]
  return overlayEntries
}

function applyOverlaySnapshot(
  entry: InterviewOverlayWindowEntry,
  overlay: InterviewOverlaySnapshot,
  shouldShow: boolean,
) {
  const window = entry.window
  if (window.isDestroyed()) {
    return
  }

  window.setOpacity(overlay.opacity)
  window.setFocusable(overlay.interactionMode)
  window.setIgnoreMouseEvents(!overlay.interactionMode, { forward: true })

  if (shouldShow) {
    if (window.webContents.isLoading()) {
      window.once('ready-to-show', () => {
        if (!window.isDestroyed()) {
          window.showInactive()
        }
      })
    } else {
      window.showInactive()
      window.webContents.reloadIgnoringCache()
    }
  } else {
    window.hide()
  }
}

export function initializeInterviewOverlayWindows(currentDir: string) {
  currentDirForOverlays = currentDir
}

export function syncInterviewOverlayWindows(snapshot: InterviewWorkspaceSnapshot) {
  lastSnapshot = snapshot
  const activeSession = snapshot.activeSession

  if (!activeSession || activeSession.status === 'ended' || activeSession.status === 'interrupted') {
    closeInterviewOverlayWindows()
    return
  }

  const entries = ensureOverlayEntries()
  for (const entry of entries) {
    const overlay = entry.kind === 'answer' ? snapshot.answerOverlay : snapshot.transcriptOverlay
    applyOverlaySnapshot(entry, overlay, overlay.visible)
  }
}

export function closeInterviewOverlayWindows() {
  for (const entry of overlayEntries) {
    if (!entry.window.isDestroyed()) {
      entry.window.close()
    }
  }
  overlayEntries = []
}

export function resyncInterviewOverlayWindows() {
  if (lastSnapshot) {
    syncInterviewOverlayWindows(lastSnapshot)
  }
}
