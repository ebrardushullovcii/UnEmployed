/* eslint-env node, browser */
/* global document */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const desktopDir = path.resolve(currentDir, '..')
const width = Number.parseInt(process.env.UI_CAPTURE_WIDTH ?? '1440', 10)
const height = Number.parseInt(process.env.UI_CAPTURE_HEIGHT ?? '920', 10)
const runLabel = process.env.UI_CAPTURE_LABEL ?? 'interview-helper'
const outputDir = path.join(desktopDir, 'test-artifacts', 'ui', runLabel)

async function writeJson(fileName, value) {
  await writeFile(
    path.join(outputDir, fileName),
    `${JSON.stringify(value, null, 2)}\n`,
    'utf8',
  )
}

async function waitForInterviewWorkspace(window) {
  await window.waitForFunction(
    () => document.querySelector('h1')?.textContent?.includes('Live interview workspace'),
    undefined,
    { timeout: 15000 },
  )
}

async function getWorkspace(window) {
  return window.evaluate(() => window.unemployed.interviewHelper.getWorkspace())
}

async function performInterviewAction(window, action) {
  return window.evaluate(
    (action) => window.unemployed.interviewHelper.performAction(action),
    action,
  )
}

async function waitForWorkspace(window, predicate, description) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < 10000) {
    const workspace = await getWorkspace(window)
    if (predicate(workspace)) {
      return workspace
    }
    await new Promise((resolve) => setTimeout(resolve, 150))
  }

  throw new Error(`Timed out waiting for ${description}.`)
}

async function capture(window, fileName) {
  await window.screenshot({
    animations: 'disabled',
    path: path.join(outputDir, fileName),
  })
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

async function runCapture() {
  await mkdir(outputDir, { recursive: true })
  const userDataDirectory = await mkdtemp(path.join(os.tmpdir(), 'unemployed-interview-helper-'))

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
    await window.setViewportSize({ width, height })

    await capture(window, '01-setup.png')

    await window.getByRole('button', { name: /Accept setup/i }).click()
    await waitForWorkspace(
      window,
      (workspace) => Boolean(workspace.setup.consent.acceptedAt),
      'accepted Interview Helper setup disclosures',
    )

    await window.getByRole('button', { name: /Run rehearsal/i }).click()
    const rehearsedWorkspace = await waitForWorkspace(
      window,
      (workspace) =>
        workspace.setup.rehearsal?.status === 'passed' ||
        workspace.setup.rehearsal?.status === 'degraded',
      'Interview Helper rehearsal results',
    )
    await capture(window, '02-rehearsed.png')

    await window.getByRole('button', { name: /Start session/i }).click()
    await window.getByText('Listening', { exact: true }).first().waitFor({ timeout: 10000 })
    const activeWorkspace = await getWorkspace(window)
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
    for (const overlayWindow of overlayWindows) {
      await overlayWindow.waitForLoadState('domcontentloaded')
      await overlayWindow.setViewportSize({ width: 560, height: 380 })
    }
    await capture(window, '03-active-session.png')
    const answerOverlayWindow = overlayWindows.find((appWindow) =>
      appWindow.url().includes('/interview-helper/overlay/answer'),
    )
    const transcriptOverlayWindow = overlayWindows.find((appWindow) =>
      appWindow.url().includes('/interview-helper/overlay/transcript'),
    )
    if (!answerOverlayWindow || !transcriptOverlayWindow) {
      throw new Error('Expected answer and transcript overlay windows.')
    }
    await capture(answerOverlayWindow, '03-answer-overlay-window.png')
    await capture(transcriptOverlayWindow, '03-transcript-overlay-window.png')

    const visualWorkspace = await performInterviewAction(window, 'capture_screenshot_and_force_cue')
    await window.reload()
    await window.waitForLoadState('domcontentloaded')
    await waitForInterviewWorkspace(window)
    await window.setViewportSize({ width, height })
    await capture(window, '04-visual-cue.png')

    const panicWorkspace = await performInterviewAction(window, 'panic_hide')
    await window.reload()
    await window.waitForLoadState('domcontentloaded')
    await waitForInterviewWorkspace(window)
    await window.setViewportSize({ width, height })
    await capture(window, '05-panic-hidden.png')

    const endedWorkspace = await performInterviewAction(window, 'end_session')
    await window.reload()
    await window.waitForLoadState('domcontentloaded')
    await waitForInterviewWorkspace(window)
    await window.setViewportSize({ width, height })
    await capture(window, '06-post-session-review.png')

    const endedSession = endedWorkspace.recentSessions[0]
    if (!endedSession) {
      throw new Error('Expected an ended Interview Helper session in recentSessions.')
    }

    const exportResult = await window.evaluate(
      ({ sessionId, format }) => window.unemployed.interviewHelper.exportSession(sessionId, format),
      { sessionId: endedSession.id, format: 'markdown' },
    )
    const artifactWorkspace = await window.evaluate(
      ({ sessionId, cueCardId }) =>
        window.unemployed.interviewHelper.saveCueAsPrepArtifact({ sessionId, cueCardId }),
      {
        sessionId: endedSession.id,
        cueCardId: endedSession.cueCards.at(-1)?.id,
      },
    )
    await window.evaluate(
      (sessionId) => window.unemployed.interviewHelper.deleteSession(sessionId),
      endedSession.id,
    )
    const deletedWorkspace = await getWorkspace(window)

    const report = {
      generatedAt: new Date().toISOString(),
      viewport: { width, height },
      screenshots: [
        '01-setup.png',
        '02-rehearsed.png',
        '03-active-session.png',
        '03-answer-overlay-window.png',
        '03-transcript-overlay-window.png',
        '04-visual-cue.png',
        '05-panic-hidden.png',
        '06-post-session-review.png',
      ],
      rehearsalStatus: rehearsedWorkspace.setup.rehearsal?.status,
      setupConsentAccepted: Boolean(rehearsedWorkspace.setup.consent.acceptedAt),
      rehearsalCheckCount: rehearsedWorkspace.setup.rehearsal?.checks.length ?? 0,
      protectedSurfaceCount: rehearsedWorkspace.setup.rehearsal?.protectedSurfaces.length ?? 0,
      protectedSurfaceStates: rehearsedWorkspace.setup.rehearsal?.protectedSurfaces.map(
        (surface) => ({
          kind: surface.kind,
          protectionState: surface.protectionState,
          verificationMethod: surface.verificationMethod,
        }),
      ) ?? [],
      activeSessionStarted: activeWorkspace.activeSession?.status === 'active',
      mainWindowMirrorsLiveCue,
      mainWindowMirrorsLiveTranscript,
      overlayWindowCountAfterStart: overlayWindows.length,
      overlayWindowRoutesAfterStart: overlayWindows.map((appWindow) => appWindow.url()),
      transcriptSegmentCount: activeWorkspace.activeSession?.transcriptSegments.length ?? 0,
      initialCueCardCount: activeWorkspace.activeSession?.cueCards.length ?? 0,
      visualCueCardCount: visualWorkspace.activeSession?.cueCards.length ?? 0,
      visualBatchCount: visualWorkspace.activeSession?.visualBatches.length ?? 0,
      overlayContaminationDisclosed:
        visualWorkspace.activeSession?.cueCards.at(-1)?.disclosure.overlayContaminated ?? false,
      panicHideStatus: panicWorkspace.activeSession?.status,
      panicHideHidAnswerOverlay: panicWorkspace.answerOverlay.visible === false,
      panicHideHidTranscriptOverlay: panicWorkspace.transcriptOverlay.visible === false,
      endedSessionStatus: endedSession.status,
      endedSessionRetained: endedWorkspace.recentSessions.some((session) => session.id === endedSession.id),
      exportFileName: exportResult.fileName,
      exportContainsTranscript: exportResult.content.includes('## Transcript'),
      exportContainsCueCards: exportResult.content.includes('## Cue Cards'),
      prepArtifactCreated: artifactWorkspace.setup.prepArtifacts.some(
        (artifact) => artifact.sourceSessionId === endedSession.id,
      ),
      deletedSessionRemoved:
        !deletedWorkspace.activeSession &&
        !deletedWorkspace.recentSessions.some((session) => session.id === endedSession.id),
    }

    await writeJson('interview-helper-report.json', report)
  } finally {
    await app.close()
    await rm(userDataDirectory, { recursive: true, force: true })
  }

  process.stdout.write(`Saved Interview Helper UI captures to ${outputDir}\n`)
}

void runCapture()
