import {
  BrowserWindow,
  desktopCapturer,
  nativeImage,
  screen,
  type Rectangle,
} from 'electron'
import path from 'node:path'
import type {
  InterviewOverlayPreference,
  InterviewOverlaySnapshot,
  InterviewProtectedSurface,
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

function toWindowKind(kind: InterviewOverlayKind) {
  return kind === 'answer' ? 'interview-answer-overlay' : 'interview-transcript-overlay'
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

function getPixel(bitmap: Buffer, width: number, x: number, y: number) {
  const index = (y * width + x) * 4
  return [
    bitmap[index] ?? 0,
    bitmap[index + 1] ?? 0,
    bitmap[index + 2] ?? 0,
    bitmap[index + 3] ?? 255,
  ] as const
}

function brightness(pixel: readonly number[]) {
  return (pixel[0]! + pixel[1]! + pixel[2]!) / 3
}

export async function verifyInterviewOverlayCaptureProtection(): Promise<
  InterviewProtectedSurface[]
> {
  const entries = overlayEntries.filter((entry) => !entry.window.isDestroyed())
  if (entries.length === 0) {
    throw new Error('Interview overlay windows are not active.')
  }

  const display = screen.getPrimaryDisplay()
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: display.size,
  })
  const source = sources[0]
  if (!source) {
    throw new Error('No screen sources were returned by desktopCapturer.')
  }

  const capturedAt = new Date().toISOString()
  const screenImage = source.thumbnail
  const screenBitmap = screenImage.getBitmap()
  const screenSize = screenImage.getSize()
  const scaleX = screenSize.width / display.bounds.width
  const scaleY = screenSize.height / display.bounds.height

  const surfaces: InterviewProtectedSurface[] = []
  for (const entry of entries) {
    const bounds = entry.window.getBounds()
    const overlayImage = await entry.window.webContents.capturePage()
    const resizedOverlay = nativeImage
      .createFromBuffer(overlayImage.toPNG())
      .resize({
        width: Math.round(bounds.width * scaleX),
        height: Math.round(bounds.height * scaleY),
      })
    const overlayBitmap = resizedOverlay.getBitmap()
    const overlaySize = resizedOverlay.getSize()
    const cropOriginX = Math.max(0, Math.round(bounds.x * scaleX))
    const cropOriginY = Math.max(0, Math.round(bounds.y * scaleY))
    let comparedPixels = 0
    let similarPixels = 0
    let overlaySignalPixels = 0
    let screenSignalPixels = 0
    const step = 2

    for (let y = 0; y < overlaySize.height; y += step) {
      const screenY = cropOriginY + y
      if (screenY < 0 || screenY >= screenSize.height) continue
      for (let x = 0; x < overlaySize.width; x += step) {
        const screenX = cropOriginX + x
        if (screenX < 0 || screenX >= screenSize.width) continue
        const overlayPixel = getPixel(overlayBitmap, overlaySize.width, x, y)
        const screenPixel = getPixel(screenBitmap, screenSize.width, screenX, screenY)
        const overlayIsSignal = brightness(overlayPixel) > 52
        if (!overlayIsSignal) continue

        overlaySignalPixels += 1
        if (brightness(screenPixel) > 52) {
          screenSignalPixels += 1
        }
        comparedPixels += 1

        const delta =
          Math.abs(overlayPixel[0] - screenPixel[0]) +
          Math.abs(overlayPixel[1] - screenPixel[1]) +
          Math.abs(overlayPixel[2] - screenPixel[2])

        if (delta <= 72) {
          similarPixels += 1
        }
      }
    }

    const similarRatio = comparedPixels > 0 ? similarPixels / comparedPixels : 1
    const signalRatio = overlaySignalPixels > 0 ? screenSignalPixels / overlaySignalPixels : 1
    const overlayVisibleInScreenCapture = similarRatio >= 0.08 && signalRatio >= 0.12
    const surfaceKind = toSurfaceKind(entry.kind)
    surfaces.push({
      id: `${surfaceKind}_${toWindowKind(entry.kind)}`,
      kind: surfaceKind,
      requestedPolicy: 'screen_share_private',
      protectionState: overlayVisibleInScreenCapture ? 'failed' : 'verified_protected',
      verificationMethod: 'electron-desktopCapturer-screen-thumbnail-vs-overlay-window-pixels',
      displayLabel: source.name || `Display ${display.id}`,
      detail: overlayVisibleInScreenCapture
        ? `Overlay pixels were detected in ordinary Electron screen capture (${similarRatio.toFixed(3)} similar, ${signalRatio.toFixed(3)} signal). Meeting-app-specific exclusion is not verified.`
        : `Overlay pixels were not detected in ordinary Electron screen capture (${similarRatio.toFixed(3)} similar, ${signalRatio.toFixed(3)} signal). Meeting-app-specific exclusion is not verified.`,
      lastVerifiedAt: capturedAt,
    })
  }

  return surfaces
}
