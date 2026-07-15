/* eslint-env node, browser */
/* global process, document */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const desktopDir = path.resolve(currentDir, '..')
const outputDir = path.join(desktopDir, 'test-artifacts', 'ui', 'original-cv-flow')

async function captureOriginalCvFlow() {
  await mkdir(outputDir, { recursive: true })
  const userDataDirectory = await mkdtemp(path.join(os.tmpdir(), 'unemployed-original-cv-flow-'))
  let app

  try {
    app = await electron.launch({
      args: ['.'],
      cwd: desktopDir,
      env: {
        ...process.env,
        UNEMPLOYED_BROWSER_AGENT: '0',
        UNEMPLOYED_ENABLE_TEST_API: '1',
        UNEMPLOYED_TEST_SYSTEM_THEME: 'dark',
        UNEMPLOYED_USER_DATA_DIR: userDataDirectory,
      },
    })
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    await window.setViewportSize({ width: 1440, height: 920 })

    await window.evaluate(async () => {
      if (!window.unemployed.jobFinder.test) {
        throw new Error('Desktop test API is unavailable in the renderer.')
      }
      await window.unemployed.jobFinder.test.setSystemThemeOverride('dark')
      await window.unemployed.jobFinder.test.loadApplyQueueDemo()
    })
    await window.reload()
    await window.waitForLoadState('domcontentloaded')

    await window.evaluate(() => { window.location.hash = '#/job-finder/settings' })
    await window.getByRole('heading', { level: 1, name: 'Settings' }).waitFor({ timeout: 10000 })
    await window.getByRole('radio', { name: /Use my original CV unchanged/i }).click()
    await window.screenshot({ animations: 'disabled', path: path.join(outputDir, '01-original-cv-setting.png') })
    await window.getByRole('button', { name: 'Save settings' }).click()
    await window.waitForFunction(async () => {
      const workspace = await window.unemployed.jobFinder.getWorkspace()
      return workspace.settings.resumeApplicationMode === 'original_resume'
    }, undefined, { timeout: 10000 })

    const savedWorkspace = await window.evaluate(() => window.unemployed.jobFinder.getWorkspace())
    if (savedWorkspace.settings.resumeApplicationMode !== 'original_resume') {
      throw new Error('Original-CV mode did not persist.')
    }

    await window.evaluate(() => { window.location.hash = '#/job-finder/review-queue' })
    await window.getByRole('heading', { level: 1, name: 'Shortlisted jobs' }).waitFor({ timeout: 10000 })
    await window.getByText('Original CV · unchanged').waitFor({ timeout: 10000 })
    await window.getByText('alex-vanguard.pdf').waitFor({ timeout: 10000 })
    if (await window.getByRole('button', { name: /Create tailored resume/i }).count()) {
      throw new Error('Tailored-resume generation remained available in original-CV mode.')
    }
    await window.getByRole('button', { name: /Start apply copilot/i }).waitFor({
      state: 'visible',
      timeout: 10000,
    })
    await window.screenshot({ animations: 'disabled', path: path.join(outputDir, '02-original-cv-review-queue.png') })

    await writeFile(
      path.join(outputDir, 'summary.json'),
      `${JSON.stringify({
        mode: savedWorkspace.settings.resumeApplicationMode,
        queue: savedWorkspace.reviewQueue.map((item) => ({
          jobId: item.jobId,
          resumeApplicationMode: item.resumeApplicationMode,
          resumeReviewStatus: item.resumeReview.status,
          resumeAssetId: item.resumeAssetId,
        })),
      }, null, 2)}\n`,
      'utf8',
    )
  } finally {
    await app?.close().catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true })
  }
}

await captureOriginalCvFlow()
