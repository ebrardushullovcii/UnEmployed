/* eslint-env node, browser */
/* global process, setTimeout, document */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const desktopDir = path.resolve(currentDir, '..')
const width = Number.parseInt(process.env.UI_CAPTURE_WIDTH ?? '1440', 10)
const height = Number.parseInt(process.env.UI_CAPTURE_HEIGHT ?? '920', 10)
const runLabel = process.env.UI_CAPTURE_LABEL ?? 'applications-copilot-review'
const outputDir = path.join(desktopDir, 'test-artifacts', 'ui', runLabel)

async function writeJson(fileName, value) {
  await writeFile(path.join(outputDir, fileName), `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function waitForCondition(check, description, timeoutMs = 15000, intervalMs = 150) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    if (await check()) {
      return
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }

  throw new Error(`Timed out waiting for ${description}.`)
}

async function waitForProfileOrSetupHeading(window) {
  await window.waitForFunction(() => {
    const heading = document.querySelector('h1')
    return heading?.textContent?.includes('Your profile') || heading?.textContent?.includes('Guided setup')
  }, undefined, { timeout: 15000 })
}

async function getResumeWorkspace(window, jobId) {
  return window.evaluate(
    async (currentJobId) => window.unemployed.jobFinder.getResumeWorkspace(currentJobId),
    jobId,
  )
}

async function getWorkspace(window) {
  return window.evaluate(() => window.unemployed.jobFinder.getWorkspace())
}

async function getSelectedApplyReviewData(window) {
  return window.evaluate(async () => {
    const snapshot = await window.unemployed.jobFinder.getWorkspace()
    const selectedRecord =
      snapshot.applicationRecords.find((record) => record.id === snapshot.selectedApplicationRecordId) ??
      snapshot.applicationRecords[0] ??
      null

    if (!selectedRecord) {
      return null
    }

    const matchingResults = snapshot.applyJobResults
      .filter((result) => result.jobId === selectedRecord.jobId)
      .sort(
        (left, right) =>
          new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
      )
    const selectedApplyResult =
      matchingResults.find((result) => result.runId === snapshot.selectedApplyRunId) ??
      matchingResults[0] ??
      null

    if (!selectedApplyResult) {
      return null
    }

    const details = await window.unemployed.jobFinder.getApplyRunDetails(
      selectedApplyResult.runId,
      selectedRecord.jobId,
    )

    const latestAttempt = snapshot.applicationAttempts.find(
      (attempt) => attempt.jobId === selectedRecord.jobId,
    ) ?? null

    return {
      details,
      selectedApplyResult,
      selectedRecord,
      latestAttempt,
      selectedApplyRunId: snapshot.selectedApplyRunId,
    }
  })
}

async function captureApplicationsCopilotReview() {
  await mkdir(outputDir, { recursive: true })
  const userDataDirectory = await mkdtemp(path.join(os.tmpdir(), 'unemployed-applications-copilot-review-'))

  let app

  try {
    app = await electron.launch({
      args: ['.'],
      cwd: desktopDir,
      env: {
        ...process.env,
        UNEMPLOYED_BROWSER_AGENT: '0',
        UNEMPLOYED_ENABLE_TEST_API: '1',
        UNEMPLOYED_TEST_SYSTEM_THEME: process.env.UNEMPLOYED_TEST_SYSTEM_THEME ?? 'dark',
        UNEMPLOYED_USER_DATA_DIR: userDataDirectory,
      },
    })

    const window = await app.firstWindow()
    await window.evaluate(async (theme) => {
      await window.unemployed.jobFinder.test?.setSystemThemeOverride(theme)
    }, process.env.UNEMPLOYED_TEST_SYSTEM_THEME ?? 'dark')
    await window.waitForLoadState('domcontentloaded')
    await waitForProfileOrSetupHeading(window)
    await window.setViewportSize({ width, height })

    await window.evaluate(async () => {
      if (!window.unemployed.jobFinder.test) {
        throw new Error('Desktop test API is unavailable in the renderer.')
      }

      return window.unemployed.jobFinder.test.loadResumeWorkspaceDemo()
    })
    await window.reload()
    await window.waitForLoadState('domcontentloaded')

    await window.getByRole('button', { name: /^Shortlisted/ }).click()
    await window.getByRole('heading', { level: 1, name: 'Shortlisted jobs' }).waitFor({ timeout: 10000 })

    await window.getByRole('button', { name: /Open resume workspace/i }).first().click()
    await window.getByRole('heading', { level: 1, name: /Senior Product Designer/i }).waitFor({ timeout: 10000 })

    await window.getByRole('button', { name: 'Export PDF' }).click()
    await waitForCondition(
      async () => (await getResumeWorkspace(window, 'job_ready')).exports.length > 0,
      'resume export before applications copilot review capture',
    )

    const approveButton = window.getByRole('button', { name: 'Approve current PDF' })
    await approveButton.waitFor({ timeout: 10000 })
    await approveButton.click()
    await waitForCondition(
      async () => {
        const workspace = await getResumeWorkspace(window, 'job_ready')
        return workspace.exports.some((entry) => entry.isApproved) && workspace.draft.status === 'approved'
      },
      'approved resume export before applications copilot review capture',
    )
    await window.screenshot({ animations: 'disabled', path: path.join(outputDir, '01-resume-approved.png') })

    await window.getByRole('button', { name: /Back to Shortlisted/i }).click()
    await window.getByRole('heading', { level: 1, name: 'Shortlisted jobs' }).waitFor({ timeout: 10000 })
    const startApplyCopilotButton = window.getByRole('button', { name: 'Start apply copilot' })
    if (await startApplyCopilotButton.isDisabled()) {
      throw new Error('Start apply copilot should be enabled after resume approval.')
    }
    await window.screenshot({ animations: 'disabled', path: path.join(outputDir, '02-review-queue-approved.png') })

    await startApplyCopilotButton.click()
    await window.getByRole('heading', { level: 1, name: 'Applications' }).waitFor({ timeout: 10000 })
    await window.screenshot({ animations: 'disabled', path: path.join(outputDir, '03-applications-open.png') })

    const reviewDataHeading = window.getByText('Apply run review data', { exact: true })
    const reviewDataSection = reviewDataHeading.locator('xpath=ancestor::section[1]')
    await reviewDataSection.waitFor({ timeout: 10000 })
    await reviewDataSection.getByText('Replay checkpoints', { exact: true }).waitFor({ timeout: 10000 })
    await reviewDataSection.getByText('Retained artifacts', { exact: true }).waitFor({ timeout: 10000 })
    await reviewDataSection.getByText('Attached tailored resume', { exact: true }).first().waitFor({ timeout: 10000 })
    await window.screenshot({ animations: 'disabled', path: path.join(outputDir, '04-applications-copilot-review-data.png') })

    const reviewData = await getSelectedApplyReviewData(window)
    if (!reviewData) {
      throw new Error('Applications copilot review data should be available for the selected record.')
    }

    if (reviewData.latestAttempt?.state !== 'paused') {
      throw new Error(`Apply copilot should pause before submit, got '${reviewData.latestAttempt?.state ?? 'null'}'.`)
    }

    if (reviewData.latestAttempt?.outcome !== null) {
      throw new Error('Apply copilot should not record a submitted outcome.')
    }

    if (reviewData.details.run.state !== 'paused_for_user_review') {
      throw new Error(`Expected apply run to remain paused_for_user_review, got '${reviewData.details.run.state}'.`)
    }

    if (reviewData.details.result?.state !== 'awaiting_review') {
      throw new Error(`Expected apply result to remain awaiting_review, got '${reviewData.details.result?.state ?? 'null'}'.`)
    }

    if (reviewData.details.questionRecords.length === 0) {
      throw new Error('Expected persisted apply review data to include detected questions.')
    }

    if (reviewData.details.answerRecords.length === 0) {
      throw new Error('Expected persisted apply review data to include grounded answers.')
    }

    if (reviewData.details.artifactRefs.length === 0) {
      throw new Error('Expected persisted apply review data to include retained artifacts.')
    }

    if (reviewData.details.checkpoints.length === 0) {
      throw new Error('Expected persisted apply review data to include replay checkpoints.')
    }

    const workspace = await getWorkspace(window)
    await writeJson('apply-run-details.json', reviewData)
    await writeJson('workspace-after-review.json', workspace)
  } finally {
    if (app) {
      try {
        await app.close()
      } catch {
        // Preserve the original failure while still cleaning up the temp profile.
      }
    }
    await rm(userDataDirectory, { recursive: true, force: true })
  }

  process.stdout.write(`Saved applications copilot review artifacts to ${outputDir}\n`)
}

void captureApplicationsCopilotReview()
