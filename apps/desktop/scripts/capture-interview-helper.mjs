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

function latestDiagnosticDetail(workspace, kind) {
  return (
    workspace.activeSession?.diagnostics
      .filter((diagnostic) => diagnostic.kind === kind)
      .at(-1)?.detail ?? ''
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

    const linkedJobContext = {
      id: 'job_harness_frontend_engineer',
      label: 'Frontend Engineer at Example Corp',
      role: 'Frontend Engineer',
      company: 'Example Corp',
      sourceUrl: 'https://example.com/jobs/frontend-engineer',
      notes: 'React, Electron, and desktop accessibility interview context.',
    }
    const applicationContext = {
      id: 'application_harness_frontend_engineer',
      label: 'Frontend Engineer at Example Corp',
      role: 'Frontend Engineer',
      company: 'Example Corp',
      sourceUrl: 'https://example.com/applications/frontend-engineer',
      notes: 'Application interview scheduled. Prepare React, Electron, and accessibility examples.',
    }
    const applicationParams = new URLSearchParams({
      source: 'job_application',
      id: applicationContext.id,
      label: applicationContext.label,
      role: applicationContext.role,
      company: applicationContext.company,
      sourceUrl: applicationContext.sourceUrl,
      notes: applicationContext.notes,
    })
    await window.evaluate((query) => {
      window.location.hash = `/interview-helper?${query}`
    }, applicationParams.toString())
    const applicationWorkspace = await waitForWorkspace(
      window,
      (workspace) =>
        workspace.setup.targetContext?.kind === 'job_application' &&
        workspace.setup.targetContext.id === 'application_harness_frontend_engineer',
      'application record context handoff into Interview Helper setup',
    )
    const linkedJobParams = new URLSearchParams({
      source: 'saved_job',
      id: linkedJobContext.id,
      label: linkedJobContext.label,
      role: linkedJobContext.role,
      company: linkedJobContext.company,
      sourceUrl: linkedJobContext.sourceUrl,
      notes: linkedJobContext.notes,
    })
    await window.evaluate((query) => {
      window.location.hash = `/interview-helper?${query}`
    }, linkedJobParams.toString())
    const linkedJobWorkspace = await waitForWorkspace(
      window,
      (workspace) =>
        workspace.setup.targetContext?.kind === 'saved_job' &&
        workspace.setup.targetContext.id === 'job_harness_frontend_engineer',
      'saved job context handoff into Interview Helper setup',
    )

    await capture(window, '01-setup.png')

    await window.getByLabel(/Transcript language/i).selectOption('en-GB')
    await waitForWorkspace(
      window,
      (workspace) => workspace.setup.transcriptionLanguage === 'en-GB',
      'saved Interview Helper transcription language',
    )
    await window.getByLabel(/Cue sensitivity/i).selectOption('balanced')
    await waitForWorkspace(
      window,
      (workspace) => workspace.setup.cueSensitivity === 'balanced',
      'saved Interview Helper cue sensitivity',
    )
    await window.getByLabel(/Auto screenshot on cue/i).check()
    await waitForWorkspace(
      window,
      (workspace) => workspace.setup.autoCaptureOnCue === true,
      'saved Interview Helper automatic screenshot preference',
    )

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
    await window.getByText('Browser speech', { exact: true }).waitFor({ timeout: 10000 })
    await window.getByText('Native captions', { exact: true }).first().waitFor({ timeout: 10000 })
    await window.getByRole('button', { name: /Watch captions/i }).waitFor({ timeout: 10000 })
    await window.getByText('Caption file', { exact: true }).waitFor({ timeout: 10000 })
    await window.getByRole('button', { name: /Watch file/i }).waitFor({ timeout: 10000 })
    await window.getByText('Media stream probes', { exact: true }).waitFor({ timeout: 10000 })
    await window.getByRole('button', { name: /Mic STT/i }).waitFor({ timeout: 10000 })
    await window.getByRole('button', { name: /System STT/i }).waitFor({ timeout: 10000 })
    const activeWorkspace = await getWorkspace(window)
    const mainWindowTextDuringLive = await window.evaluate(() => document.body.innerText)
    const browserSpeechBridgeVisible = mainWindowTextDuringLive.includes('Browser speech')
    const nativeCaptionWatcherVisible = mainWindowTextDuringLive.includes('Native captions')
    const captionFileWatcherVisible = mainWindowTextDuringLive.includes('Caption file')
    const mediaStreamProbesVisible = mainWindowTextDuringLive.includes('Media stream probes')
    const transientAudioSttControlsVisible =
      (await window.getByRole('button', { name: /Mic STT/i }).count()) > 0 &&
      (await window.getByRole('button', { name: /System STT/i }).count()) > 0
    const resetOverlayLayoutVisible =
      (await window.getByRole('button', { name: /Reset overlay layout/i }).count()) > 0
    await window.getByRole('button', { name: /Reconfigure/i }).click()
    const reconfiguringWorkspace = await waitForWorkspace(
      window,
      (workspace) =>
        workspace.activeSession?.status === 'reconfiguring' &&
        workspace.activeSession.listening === false,
      'Interview Helper paused reconfiguration flow',
    )
    await window.getByRole('button', { name: /Close config/i }).click()
    const reconfigurationClosedWorkspace = await waitForWorkspace(
      window,
      (workspace) =>
        workspace.activeSession?.status === 'paused' &&
        workspace.activeSession.listening === false,
      'Interview Helper closed reconfiguration flow',
    )
    await window.getByRole('button', { name: /Resume/i }).click()
    await waitForWorkspace(
      window,
      (workspace) =>
        workspace.activeSession?.status === 'active' &&
        workspace.activeSession.listening === true,
      'Interview Helper resumed after reconfiguration',
    )
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

    await window.getByRole('button', { name: /Verify protection/i }).click()
    const runtimeProtectionWorkspace = await waitForWorkspace(
      window,
      (workspace) =>
        Boolean(
          workspace.activeSession?.protectedSurfaces.some(
            (surface) => surface.protectionState !== 'requested_unverified',
          ),
        ),
      'runtime overlay protection verification',
    )

    const nativeTranscriptText =
      'How would you keep Electron overlay IPC isolated from the main app?'
    const nativeTranscriptWorkspace = await window.evaluate(
      ({ sessionId, text }) =>
        window.unemployed.interviewHelper.addTranscriptSegment({
          sessionId,
          source: 'meeting_native_transcript',
          text,
          engineKind: 'platform_local',
        }),
      {
        sessionId: activeWorkspace.activeSession?.id,
        text: nativeTranscriptText,
      },
    )
    const mainWindowTextAfterNativeTranscript = await window.evaluate(() => document.body.innerText)

    const visualWorkspace = await performInterviewAction(window, 'capture_screenshot_and_force_cue')
    const screenshotDiagnosticDetail = latestDiagnosticDetail(visualWorkspace, 'screenshot')
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

    await window.getByPlaceholder(/Add a correction or review note/i).fill(
      'Correction: the interviewer asked about Electron IPC isolation.',
    )
    await window.getByRole('button', { name: /Save annotation/i }).click()
    const annotatedWorkspace = await waitForWorkspace(
      window,
      (workspace) =>
        (workspace.recentSessions[0]?.transcriptAnnotations.length ?? 0) > 0,
      'saved transcript annotation',
    )
    const annotatedSession = annotatedWorkspace.recentSessions[0]
    if (!annotatedSession) {
      throw new Error('Expected an annotated Interview Helper session in recentSessions.')
    }

    const exportResult = await window.evaluate(
      ({ sessionId, format }) => window.unemployed.interviewHelper.exportSession(sessionId, format),
      { sessionId: annotatedSession.id, format: 'markdown' },
    )
    const artifactWorkspace = await window.evaluate(
      ({ sessionId, cueCardId }) =>
        window.unemployed.interviewHelper.saveCueAsPrepArtifact({ sessionId, cueCardId }),
      {
        sessionId: annotatedSession.id,
        cueCardId: annotatedSession.cueCards.at(-1)?.id,
      },
    )
    await window.evaluate(
      (sessionId) => window.unemployed.interviewHelper.deleteSession(sessionId),
      annotatedSession.id,
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
      jobFinderApplicationContextApplied:
        applicationWorkspace.setup.targetContext?.label === applicationContext.label &&
        applicationWorkspace.setup.targetContext?.role === applicationContext.role &&
        applicationWorkspace.setup.targetContext?.company === applicationContext.company,
      jobFinderSavedJobContextApplied:
        linkedJobWorkspace.setup.targetContext?.label === linkedJobContext.label &&
        linkedJobWorkspace.setup.targetContext?.role === linkedJobContext.role &&
        linkedJobWorkspace.setup.targetContext?.company === linkedJobContext.company,
      setupConsentAccepted: Boolean(rehearsedWorkspace.setup.consent.acceptedAt),
      setupTranscriptionLanguage: rehearsedWorkspace.setup.transcriptionLanguage,
      rehearsalTranscriptionLanguage: rehearsedWorkspace.setup.rehearsal?.language,
      setupCueSensitivity: rehearsedWorkspace.setup.cueSensitivity,
      setupAutoCaptureOnCue: rehearsedWorkspace.setup.autoCaptureOnCue,
      rehearsalCheckCount: rehearsedWorkspace.setup.rehearsal?.checks.length ?? 0,
      audioCapabilityChecks: rehearsedWorkspace.setup.rehearsal?.checks
        .filter((check) => check.id === 'microphone_audio' || check.id === 'meeting_audio')
        .map((check) => ({
          id: check.id,
          status: check.status,
          detail: check.detail,
        })) ?? [],
      microphonePermissionUsesElectron:
        rehearsedWorkspace.setup.rehearsal?.checks
          .find((check) => check.id === 'microphone_audio')
          ?.detail?.includes('Electron systemPreferences') ?? false,
      meetingAudioUsesElectronSourceEnumeration:
        rehearsedWorkspace.setup.rehearsal?.checks
          .find((check) => check.id === 'meeting_audio')
          ?.detail?.includes('Electron desktopCapturer') ?? false,
      protectedSurfaceCount: rehearsedWorkspace.setup.rehearsal?.protectedSurfaces.length ?? 0,
      protectedSurfaceStates: rehearsedWorkspace.setup.rehearsal?.protectedSurfaces.map(
        (surface) => ({
          kind: surface.kind,
          protectionState: surface.protectionState,
          verificationMethod: surface.verificationMethod,
        }),
      ) ?? [],
      runtimeOverlayProtectionStates:
        runtimeProtectionWorkspace.activeSession?.protectedSurfaces.map((surface) => ({
          kind: surface.kind,
          protectionState: surface.protectionState,
          verificationMethod: surface.verificationMethod,
          detail: surface.detail,
        })) ?? [],
      runtimeOverlayProtectionVerified:
        runtimeProtectionWorkspace.activeSession?.protectedSurfaces.some(
          (surface) => surface.protectionState === 'verified_protected',
        ) ?? false,
      activeSessionStarted: activeWorkspace.activeSession?.status === 'active',
      mainWindowMirrorsLiveCue,
      mainWindowMirrorsLiveTranscript,
      overlayWindowCountAfterStart: overlayWindows.length,
      overlayWindowRoutesAfterStart: overlayWindows.map((appWindow) => appWindow.url()),
      transcriptSegmentCount: activeWorkspace.activeSession?.transcriptSegments.length ?? 0,
      initialCueCardCount: activeWorkspace.activeSession?.cueCards.length ?? 0,
      browserSpeechBridgeVisible,
      nativeCaptionWatcherVisible,
      captionFileWatcherVisible,
      mediaStreamProbesVisible,
      transientAudioSttControlsVisible,
      resetOverlayLayoutVisible,
      reconfigurationPausedListening:
        reconfiguringWorkspace.activeSession?.status === 'reconfiguring' &&
        reconfiguringWorkspace.activeSession.listening === false,
      reconfigurationClosedPaused:
        reconfigurationClosedWorkspace.activeSession?.status === 'paused' &&
        reconfigurationClosedWorkspace.activeSession.listening === false,
      nativeTranscriptIngestionAddedSegment:
        nativeTranscriptWorkspace.activeSession?.transcriptSegments.some(
          (segment) =>
            segment.source === 'meeting_native_transcript' &&
            segment.text === nativeTranscriptText &&
            segment.engineKind === 'platform_local',
        ) ?? false,
      nativeTranscriptIngestionGeneratedCue:
        nativeTranscriptWorkspace.activeSession?.cueCards.at(-1)?.question === nativeTranscriptText,
      automaticCueCapturedVisualBatch:
        (nativeTranscriptWorkspace.activeSession?.visualBatches.length ?? 0) > 0,
      automaticCueDisclosedScreenshot:
        nativeTranscriptWorkspace.activeSession?.cueCards.at(-1)?.disclosure.screenshotCount === 1,
      nativeTranscriptHiddenFromMainWindow:
        !mainWindowTextAfterNativeTranscript.includes(nativeTranscriptText),
      visualCueCardCount: visualWorkspace.activeSession?.cueCards.length ?? 0,
      visualBatchCount: visualWorkspace.activeSession?.visualBatches.length ?? 0,
      screenshotDiagnosticDetail,
      screenshotDiagnosticUsesElectronCapture:
        screenshotDiagnosticDetail.includes('Electron desktopCapturer') &&
        screenshotDiagnosticDetail.includes('discarded'),
      overlayContaminationDisclosed:
        visualWorkspace.activeSession?.cueCards.at(-1)?.disclosure.overlayContaminated ?? false,
      panicHideStatus: panicWorkspace.activeSession?.status,
      panicHideHidAnswerOverlay: panicWorkspace.answerOverlay.visible === false,
      panicHideHidTranscriptOverlay: panicWorkspace.transcriptOverlay.visible === false,
      endedSessionStatus: endedSession.status,
      endedSessionRetained: endedWorkspace.recentSessions.some((session) => session.id === endedSession.id),
      transcriptAnnotationCount: annotatedSession.transcriptAnnotations.length,
      transcriptAnnotationPreservesOriginal:
        annotatedSession.transcriptAnnotations[0]?.originalText ===
        annotatedSession.transcriptSegments[0]?.text,
      exportFileName: exportResult.fileName,
      exportContainsTranscript: exportResult.content.includes('## Transcript'),
      exportContainsTranscriptAnnotations:
        exportResult.content.includes('## Transcript Annotations'),
      exportContainsCueCards: exportResult.content.includes('## Cue Cards'),
      prepArtifactCreated: artifactWorkspace.setup.prepArtifacts.some(
        (artifact) => artifact.sourceSessionId === annotatedSession.id,
      ),
      deletedSessionRemoved:
        !deletedWorkspace.activeSession &&
        !deletedWorkspace.recentSessions.some((session) => session.id === annotatedSession.id),
    }

    await writeJson('interview-helper-report.json', report)
  } finally {
    await app.close()
    await rm(userDataDirectory, { recursive: true, force: true })
  }

  process.stdout.write(`Saved Interview Helper UI captures to ${outputDir}\n`)
}

void runCapture()
