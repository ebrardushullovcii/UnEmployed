/* eslint-env node, browser */
/* global document */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const desktopDir = path.resolve(currentDir, '..')
const runLabel = process.env.UI_CAPTURE_LABEL ?? 'interview-helper-protection'
const outputDir = path.join(desktopDir, 'test-artifacts', 'ui', runLabel)

const overlayBounds = {
  answer: { x: 72, y: 96, width: 440, height: 260 },
  transcript: { x: 72, y: 392, width: 560, height: 380 },
}

async function writeJson(fileName, value) {
  await writeFile(
    path.join(outputDir, fileName),
    `${JSON.stringify(value, null, 2)}\n`,
    'utf8',
  )
}

async function writeBase64Png(fileName, base64) {
  await writeFile(path.join(outputDir, fileName), Buffer.from(base64, 'base64'))
}

async function waitForInterviewWorkspace(window) {
  await window.waitForFunction(
    () => document.querySelector('h1')?.textContent?.includes('Live interview workspace'),
    undefined,
    { timeout: 15000 },
  )
}

async function waitForOverlayWindows(app) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < 10000) {
    const overlayWindows = app.windows().filter((appWindow) =>
      appWindow.url().includes('/interview-helper/overlay/'),
    )
    if (overlayWindows.length === 2) {
      return overlayWindows
    }
    await new Promise((resolve) => setTimeout(resolve, 150))
  }

  throw new Error('Timed out waiting for two Interview Helper overlay windows.')
}

async function acceptAndStartSession(window) {
  await window.getByRole('button', { name: /Accept setup/i }).click()
  await window.getByRole('button', { name: /Run rehearsal/i }).click()
  await window.getByRole('button', { name: /Start session/i }).click()
  await window.getByText('Listening', { exact: true }).first().waitFor({ timeout: 10000 })
}

async function setOverlayWindowBounds(app) {
  return app.evaluate(
    ({ BrowserWindow }, bounds) => {
      const results = []
      for (const window of BrowserWindow.getAllWindows()) {
        const url = window.webContents.getURL()
        if (url.includes('/interview-helper/overlay/answer')) {
          window.setBounds(bounds.answer)
          window.showInactive()
          results.push({ kind: 'answer', bounds: window.getBounds(), url })
        }
        if (url.includes('/interview-helper/overlay/transcript')) {
          window.setBounds(bounds.transcript)
          window.showInactive()
          results.push({ kind: 'transcript', bounds: window.getBounds(), url })
        }
      }
      return results
    },
    overlayBounds,
  )
}

function getOverlayWindow(overlayWindows, kind) {
  const window = overlayWindows.find((appWindow) =>
    appWindow.url().includes(`/interview-helper/overlay/${kind}`),
  )
  if (!window) {
    throw new Error(`Expected ${kind} overlay window.`)
  }
  return window
}

async function captureScreenAndAnalyze(app, overlays) {
  return app.evaluate(
    async ({ desktopCapturer, nativeImage, screen }, input) => {
      const display = screen.getPrimaryDisplay()
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: display.size,
      })
      const source = sources[0]
      if (!source) {
        throw new Error('No screen sources were returned by desktopCapturer.')
      }

      const screenImage = source.thumbnail
      const screenBitmap = screenImage.getBitmap()
      const screenSize = screenImage.getSize()
      const scaleX = screenSize.width / display.bounds.width
      const scaleY = screenSize.height / display.bounds.height

      function getPixel(bitmap, width, x, y) {
        const index = (y * width + x) * 4
        return [
          bitmap[index] ?? 0,
          bitmap[index + 1] ?? 0,
          bitmap[index + 2] ?? 0,
          bitmap[index + 3] ?? 255,
        ]
      }

      function brightness(pixel) {
        return (pixel[0] + pixel[1] + pixel[2]) / 3
      }

      function compareOverlay(inputOverlay) {
        const overlayImage = nativeImage.createFromBuffer(
          Buffer.from(inputOverlay.pngBase64, 'base64'),
        )
        const overlaySize = overlayImage.getSize()
        const resizedOverlay = overlayImage.resize({
          width: Math.round(inputOverlay.bounds.width * scaleX),
          height: Math.round(inputOverlay.bounds.height * scaleY),
        })
        const overlayBitmap = resizedOverlay.getBitmap()
        const resizedSize = resizedOverlay.getSize()
        const cropOriginX = Math.max(0, Math.round(inputOverlay.bounds.x * scaleX))
        const cropOriginY = Math.max(0, Math.round(inputOverlay.bounds.y * scaleY))
        let comparedPixels = 0
        let similarPixels = 0
        let overlaySignalPixels = 0
        let screenSignalPixels = 0
        const step = 2

        for (let y = 0; y < resizedSize.height; y += step) {
          const screenY = cropOriginY + y
          if (screenY < 0 || screenY >= screenSize.height) continue
          for (let x = 0; x < resizedSize.width; x += step) {
            const screenX = cropOriginX + x
            if (screenX < 0 || screenX >= screenSize.width) continue
            const overlayPixel = getPixel(overlayBitmap, resizedSize.width, x, y)
            const screenPixel = getPixel(screenBitmap, screenSize.width, screenX, screenY)
            const overlayIsSignal = brightness(overlayPixel) > 52
            if (!overlayIsSignal) continue

            overlaySignalPixels += 1
            const screenIsSignal = brightness(screenPixel) > 52
            if (screenIsSignal) screenSignalPixels += 1
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

        const similarRatio = comparedPixels > 0 ? similarPixels / comparedPixels : 0
        const signalRatio = overlaySignalPixels > 0 ? screenSignalPixels / overlaySignalPixels : 0

        return {
          kind: inputOverlay.kind,
          bounds: inputOverlay.bounds,
          overlaySize,
          resizedSize,
          comparedPixels,
          similarPixels,
          similarRatio,
          screenSignalPixels,
          overlaySignalPixels,
          signalRatio,
          overlayVisibleInScreenCapture: similarRatio >= 0.08 && signalRatio >= 0.12,
        }
      }

      return {
        platform: process.platform,
        display: {
          bounds: display.bounds,
          size: display.size,
          scaleFactor: display.scaleFactor,
        },
        source: {
          id: source.id,
          name: source.name,
          thumbnailSize: screenSize,
          pngBase64: screenImage.toPNG().toString('base64'),
        },
        overlays: input.overlays.map(compareOverlay),
      }
    },
    { overlays },
  )
}

async function runCaptureProtection() {
  await mkdir(outputDir, { recursive: true })
  const userDataDirectory = await mkdtemp(path.join(os.tmpdir(), 'unemployed-interview-protection-'))
  const app = await electron.launch({
    args: ['.'],
    cwd: desktopDir,
    env: {
      ...process.env,
      UNEMPLOYED_ENABLE_TEST_API: '1',
      UNEMPLOYED_TEST_SYSTEM_THEME: process.env.UNEMPLOYED_TEST_SYSTEM_THEME ?? 'dark',
      UNEMPLOYED_USER_DATA_DIR: userDataDirectory,
    },
  })

  try {
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    await waitForInterviewWorkspace(window)
    await window.setViewportSize({ width: 1440, height: 920 })
    await acceptAndStartSession(window)
    const activeWorkspace = await window.evaluate(() => window.unemployed.interviewHelper.getWorkspace())
    const mainWindowTextDuringLive = await window.evaluate(() => document.body.innerText)
    const liveCueQuestion = activeWorkspace.activeSession?.cueCards.at(-1)?.question ?? ''
    const liveTranscriptTexts =
      activeWorkspace.activeSession?.transcriptSegments.map((segment) => segment.text) ?? []
    const mainWindowMirrorsLiveCue =
      liveCueQuestion.length > 0 && mainWindowTextDuringLive.includes(liveCueQuestion)
    const mainWindowMirrorsLiveTranscript = liveTranscriptTexts.some(
      (segmentText) => segmentText.length > 0 && mainWindowTextDuringLive.includes(segmentText),
    )

    const overlayWindows = await waitForOverlayWindows(app)
    const placedOverlays = await setOverlayWindowBounds(app)
    await new Promise((resolve) => setTimeout(resolve, 750))

    const answerOverlayWindow = getOverlayWindow(overlayWindows, 'answer')
    const transcriptOverlayWindow = getOverlayWindow(overlayWindows, 'transcript')
    const answerPng = await answerOverlayWindow.screenshot({ animations: 'disabled' })
    const transcriptPng = await transcriptOverlayWindow.screenshot({ animations: 'disabled' })
    await writeFile(path.join(outputDir, 'answer-overlay-reference.png'), answerPng)
    await writeFile(path.join(outputDir, 'transcript-overlay-reference.png'), transcriptPng)

    const analysis = await captureScreenAndAnalyze(app, [
      {
        kind: 'answer',
        bounds: overlayBounds.answer,
        pngBase64: answerPng.toString('base64'),
      },
      {
        kind: 'transcript',
        bounds: overlayBounds.transcript,
        pngBase64: transcriptPng.toString('base64'),
      },
    ])

    await writeBase64Png('desktop-capture.png', analysis.source.pngBase64)
    const report = {
      generatedAt: new Date().toISOString(),
      method: 'electron-desktopCapturer-screen-thumbnail-vs-overlay-window-pixels',
      verdict: analysis.overlays.some((overlay) => overlay.overlayVisibleInScreenCapture)
        ? 'overlay_pixels_visible'
        : 'overlay_pixels_not_detected',
      mainWindowMirrorsLiveCue,
      mainWindowMirrorsLiveTranscript,
      placedOverlays,
      ...analysis,
      source: {
        id: analysis.source.id,
        name: analysis.source.name,
        thumbnailSize: analysis.source.thumbnailSize,
        artifact: 'desktop-capture.png',
      },
      artifacts: [
        'desktop-capture.png',
        'answer-overlay-reference.png',
        'transcript-overlay-reference.png',
        'interview-helper-protection-report.json',
      ],
    }
    await writeJson('interview-helper-protection-report.json', report)
  } finally {
    await app.close()
    await rm(userDataDirectory, { recursive: true, force: true })
  }

  process.stdout.write(`Saved Interview Helper protection captures to ${outputDir}\n`)
}

void runCaptureProtection()
