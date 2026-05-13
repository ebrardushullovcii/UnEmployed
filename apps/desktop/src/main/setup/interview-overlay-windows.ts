import { BrowserWindow, screen, type Rectangle } from 'electron'
import path from 'node:path'
import type {
  InterviewOverlayPreference,
  InterviewOverlaySnapshot,
  InterviewProtectedSurfaceKind,
  InterviewWorkspaceSnapshot,
} from '@unemployed/contracts'
import { getInterviewHelperService } from '../services/interview-helper'

type InterviewOverlayKind = 'answer' | 'transcript'

interface InterviewOverlayWindowEntry {
  readonly kind: InterviewOverlayKind
  readonly route: string
  readonly window: BrowserWindow
}

let currentDirForOverlays: string | null = null
let lastSnapshot: InterviewWorkspaceSnapshot | null = null
let overlayEntries: InterviewOverlayWindowEntry[] = []
let applyingSnapshot = false
let overlayLayoutPersistenceChain = Promise.resolve<InterviewWorkspaceSnapshot | null>(null)
const overlayLayoutTimers = new WeakMap<BrowserWindow, NodeJS.Timeout>()

function toSurfaceKind(kind: InterviewOverlayKind): InterviewProtectedSurfaceKind {
  return kind === 'answer' ? 'live_answer_overlay' : 'live_transcript_overlay'
}

function sameBounds(
  first: Rectangle,
  second: NonNullable<InterviewOverlayPreference['bounds']>,
) {
  return (
    first.x === second.x &&
    first.y === second.y &&
    first.width === second.width &&
    first.height === second.height
  )
}

function persistOverlayLayout(entry: InterviewOverlayWindowEntry) {
  if (applyingSnapshot || entry.window.isDestroyed()) {
    return
  }

  const existingTimer = overlayLayoutTimers.get(entry.window)
  if (existingTimer) {
    clearTimeout(existingTimer)
  }

  const timer = setTimeout(() => {
    void (async () => {
      if (entry.window.isDestroyed()) {
        return
      }

      const bounds = entry.window.getBounds()
      const display = screen.getDisplayMatching(bounds)
      overlayLayoutPersistenceChain = overlayLayoutPersistenceChain
        .then(async () => {
          const service = await getInterviewHelperService()
          return service.updateOverlayPreference({
            surfaceKind: toSurfaceKind(entry.kind),
            bounds,
            displayId: String(display.id),
          })
        })
        .catch((error: unknown) => {
          console.warn('[InterviewHelper] Failed to persist overlay layout.', error)
          return lastSnapshot
        })
      lastSnapshot = await overlayLayoutPersistenceChain
    })()
  }, 250)

  overlayLayoutTimers.set(entry.window, timer)
}

function bindOverlayLayoutPersistence(entry: InterviewOverlayWindowEntry) {
  entry.window.on('move', () => {
    persistOverlayLayout(entry)
  })
  entry.window.on('resize', () => {
    persistOverlayLayout(entry)
  })
}

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

  const entry = { kind, route, window }
  bindOverlayLayoutPersistence(entry)
  return entry
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
  preference: InterviewOverlayPreference | undefined,
  shouldShow: boolean,
) {
  const window = entry.window
  if (window.isDestroyed()) {
    return
  }

  if (preference?.bounds && !sameBounds(window.getBounds(), preference.bounds)) {
    applyingSnapshot = true
    try {
      window.setBounds(preference.bounds)
    } finally {
      applyingSnapshot = false
    }
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
    const preference = snapshot.overlayPreferences.find(
      (item) => item.surfaceKind === toSurfaceKind(entry.kind),
    )
    applyOverlaySnapshot(entry, overlay, preference, overlay.visible)
  }
}

export function closeInterviewOverlayWindows() {
  for (const entry of overlayEntries) {
    if (!entry.window.isDestroyed()) {
      const timer = overlayLayoutTimers.get(entry.window)
      if (timer) {
        clearTimeout(timer)
      }
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
