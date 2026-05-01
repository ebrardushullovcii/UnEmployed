import { app, type BrowserWindow, screen, type Display, type Rectangle } from 'electron'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export type MainWindowDisplayMode = 'normal' | 'maximized' | 'fullscreen'

export type MainWindowState = Rectangle & {
  displayMode: MainWindowDisplayMode
}

export type RestoredMainWindowBounds = Pick<Rectangle, 'width' | 'height'> &
  Partial<Pick<Rectangle, 'x' | 'y'>>

const mainWindowStateFileName = 'main-window-state.json'

function getDesktopUserDataDirectory() {
  const overriddenUserDataDirectory = process.env.UNEMPLOYED_USER_DATA_DIR?.trim()

  return overriddenUserDataDirectory || app.getPath('userData')
}

export function getMainWindowStateFilePath() {
  return path.join(getDesktopUserDataDirectory(), mainWindowStateFileName)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isMainWindowDisplayMode(value: unknown): value is MainWindowDisplayMode {
  return value === 'normal' || value === 'maximized' || value === 'fullscreen'
}

function isMissingFileError(error: unknown) {
  return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT'
}

function doRectanglesIntersect(first: Rectangle, second: Rectangle) {
  return (
    first.x < second.x + second.width &&
    first.x + first.width > second.x &&
    first.y < second.y + second.height &&
    first.y + first.height > second.y
  )
}

export function parseMainWindowState(value: unknown): MainWindowState | null {
  if (!isRecord(value)) {
    return null
  }

  const { x, y, width, height, displayMode } = value

  if (
    !isFiniteNumber(x) ||
    !isFiniteNumber(y) ||
    !isFiniteNumber(width) ||
    width <= 0 ||
    !isFiniteNumber(height) ||
    height <= 0 ||
    !isMainWindowDisplayMode(displayMode)
  ) {
    return null
  }

  return {
    x,
    y,
    width,
    height,
    displayMode,
  }
}

export function loadMainWindowState() {
  try {
    const rawState = JSON.parse(readFileSync(getMainWindowStateFilePath(), 'utf8')) as unknown

    return parseMainWindowState(rawState)
  } catch (error) {
    if (isMissingFileError(error)) {
      return null
    }

    console.warn('[Desktop] Failed to read main window state.', error)
    return null
  }
}

export function saveMainWindowState(state: MainWindowState) {
  try {
    const filePath = getMainWindowStateFilePath()

    mkdirSync(path.dirname(filePath), { recursive: true })
    writeFileSync(filePath, JSON.stringify(state), 'utf8')
  } catch (error) {
    console.warn('[Desktop] Failed to persist main window state.', error)
  }
}

export function getMainWindowDisplayMode(
  window: Pick<BrowserWindow, 'isFullScreen' | 'isMaximized'>,
): MainWindowDisplayMode {
  if (window.isFullScreen()) {
    return 'fullscreen'
  }

  if (window.isMaximized()) {
    return 'maximized'
  }

  return 'normal'
}

export function resolveMainWindowBounds(
  savedState: MainWindowState | null,
  defaultBounds: Pick<Rectangle, 'width' | 'height'>,
  displays: Array<Pick<Display, 'bounds'>>,
): RestoredMainWindowBounds {
  if (!savedState) {
    return defaultBounds
  }

  const savedBounds = {
    x: savedState.x,
    y: savedState.y,
    width: savedState.width,
    height: savedState.height,
  }

  if (displays.some((display) => doRectanglesIntersect(savedBounds, display.bounds))) {
    return savedBounds
  }

  return {
    width: savedState.width,
    height: savedState.height,
  }
}

export function restoreMainWindowBounds(
  defaultBounds: Pick<Rectangle, 'width' | 'height'>,
  savedState = loadMainWindowState(),
) {
  return resolveMainWindowBounds(savedState, defaultBounds, screen.getAllDisplays())
}

export function bindMainWindowStatePersistence(window: BrowserWindow) {
  let normalBounds = window.getBounds()

  const updateNormalBounds = () => {
    if (!window.isMaximized() && !window.isFullScreen()) {
      normalBounds = window.getBounds()
    }
  }

  const persistWindowState = () => {
    updateNormalBounds()
    saveMainWindowState({
      ...normalBounds,
      displayMode: getMainWindowDisplayMode(window),
    })
  }

  window.on('move', updateNormalBounds)
  window.on('resize', updateNormalBounds)
  window.on('close', persistWindowState)
}
