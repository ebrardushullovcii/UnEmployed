/* eslint-env node, browser */
/* global document, HTMLElement, window */

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const desktopDir = path.resolve(currentDir, '..')
const snapshotPath = process.env.UI_SOURCE_SIGN_IN_PROMPTS_SNAPSHOT ?? path.resolve(
  desktopDir,
  'test-fixtures',
  'job-finder',
  'source-sign-in-prompts-workspace.json'
)
const runLabel = process.env.UI_CAPTURE_LABEL ?? 'source-sign-in-prompts'
const outputDir = path.join(desktopDir, 'test-artifacts', 'ui', runLabel)
const viewports = [
  {
    slug: 'desktop',
    width: Number.parseInt(process.env.UI_CAPTURE_WIDTH ?? '1440', 10),
    height: Number.parseInt(process.env.UI_CAPTURE_HEIGHT ?? '920', 10)
  },
  {
    slug: 'narrow',
    width: Number.parseInt(process.env.UI_CAPTURE_NARROW_WIDTH ?? '1080', 10),
    height: Number.parseInt(process.env.UI_CAPTURE_NARROW_HEIGHT ?? '920', 10)
  }
]
const scrollAreaSelector = '.screen-scroll-area'

async function writeJson(fileName, value) {
  await writeFile(path.join(outputDir, fileName), `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function waitForHeading(page, headings, options) {
  const allowedHeadings = Array.isArray(headings) ? headings : [headings]

  await page.waitForFunction((nextAllowedHeadings) => {
    const heading = document.querySelector('h1')
    const text = heading?.textContent ?? ''
    return nextAllowedHeadings.some((allowedHeading) => text.includes(allowedHeading))
  }, allowedHeadings, { timeout: 10000, ...options })
}

async function waitForProfileOrSetupHeading(page) {
  await waitForHeading(page, ['Your profile', 'Guided setup'], { timeout: 15000 })
}

async function clickNavigationControl(page, name) {
  const control = page.locator('button, [role="tab"]').filter({ hasText: name }).first()

  if (await control.count()) {
    await control.click()
    return
  }

  await page.getByRole('button', { name }).click()
}

async function clickProfilePreferencesTab(page) {
  const tabPatterns = [/^Preferences$/, /Preferences/i]

  for (const pattern of tabPatterns) {
    const tab = page.getByRole('tab', { name: pattern }).first()

    if (await tab.isVisible().catch(() => false)) {
      await tab.click()
      return
    }
  }

  await page.locator('[role="tab"]').filter({ hasText: 'Preferences' }).first().click()
}

async function clickProfileNavigation(page) {
  const navPatterns = [/^Profile$/, /Your profile/i]

  for (const pattern of navPatterns) {
    const button = page.getByRole('button', { name: pattern }).first()

    if (await button.isVisible().catch(() => false)) {
      await button.click()
      return true
    }
  }

  const fallbackButton = page.locator('button').filter({ hasText: 'Profile' }).first()

  if (await fallbackButton.isVisible().catch(() => false)) {
    await fallbackButton.click()
    return true
  }

  return false
}

async function setViewport(page, viewport) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height })
  await page.waitForTimeout(180)
}

async function setScrollAreaOffset(page, offset) {
  await page.evaluate(
    ({ selector, nextOffset }) => {
      const element = document.querySelector(selector)

      if (!(element instanceof HTMLElement)) {
        throw new Error(`Unable to find scroll container for selector: ${selector}`)
      }

      element.scrollTop = nextOffset
    },
    { selector: scrollAreaSelector, nextOffset: offset }
  )
}

async function scrollAreaToTop(page) {
  await setScrollAreaOffset(page, 0)
  await page.waitForTimeout(160)
}

async function scrollIntoView(locator) {
  await locator.waitFor({ state: 'visible', timeout: 10000 })
  await locator.scrollIntoViewIfNeeded()
  await locator.waitFor({ state: 'visible', timeout: 10000 })
  await locator.page().waitForTimeout(180)
}

async function captureProfilePreferences(page, viewport, report) {
  await setViewport(page, viewport)
  await clickNavigationControl(page, /^Profile$/)
  await page.getByRole('heading', { level: 1, name: 'Your profile' }).waitFor({ timeout: 10000 })
  await clickProfilePreferencesTab(page)
  await scrollAreaToTop(page)

  const jobSourcesHeading = page.getByText('Job sources', { exact: true }).first()
  await scrollIntoView(jobSourcesHeading)
  await page.getByText('Sign-in required', { exact: true }).first().waitFor({ timeout: 10000 })
  await page.getByText('Sign-in recommended', { exact: true }).first().waitFor({ timeout: 10000 })

  const fileName = `profile-preferences-${viewport.slug}.png`
  await page.screenshot({ animations: 'disabled', path: path.join(outputDir, fileName) })
  report.profilePreferences[viewport.slug] = fileName
}

async function captureFindJobsTop(page, viewport, report) {
  await setViewport(page, viewport)
  await clickNavigationControl(page, /^Find jobs\s+\d+$/)
  await page.getByRole('heading', { level: 1, name: 'Find jobs' }).waitFor({ timeout: 10000 })
  await scrollAreaToTop(page)
  await page.getByText('Then search again after sign-in.', { exact: true }).waitFor({ timeout: 10000 })

  const fileName = `find-jobs-${viewport.slug}.png`
  await page.screenshot({ animations: 'disabled', path: path.join(outputDir, fileName) })
  report.findJobs[viewport.slug] = fileName
}

async function captureFindJobsRunOneSource(page, viewport, report) {
  await setViewport(page, viewport)
  await clickNavigationControl(page, /^Find jobs\s+\d+$/)
  await page.getByRole('heading', { level: 1, name: 'Find jobs' }).waitFor({ timeout: 10000 })
  await scrollAreaToTop(page)

  const runOneSourceHeading = page.getByRole('heading', { name: 'Run one source' }).first()
  await scrollIntoView(runOneSourceHeading)
  await page.getByText(/sign in to wellfound.*better search coverage.*next run/i).waitFor({ timeout: 10000 })

  const fileName = `find-jobs-run-one-source-${viewport.slug}.png`
  await page.screenshot({ animations: 'disabled', path: path.join(outputDir, fileName) })
  report.findJobsRunOneSource[viewport.slug] = fileName
}

async function captureSourceSignInPrompts() {
  await mkdir(outputDir, { recursive: true })
  const userDataDirectory = await mkdtemp(path.join(os.tmpdir(), 'unemployed-source-sign-in-prompts-'))

  let app = null

  try {
    app = await electron.launch({
      args: ['.'],
      cwd: desktopDir,
      env: {
        ...process.env,
        UNEMPLOYED_ENABLE_TEST_API: '1',
        UNEMPLOYED_BROWSER_AGENT: '0',
        UNEMPLOYED_TEST_BROWSER_SESSION_STATUS: 'login_required',
        UNEMPLOYED_TEST_BROWSER_SESSION_LABEL: 'Browser session needs sign-in',
        UNEMPLOYED_TEST_BROWSER_SESSION_DETAIL: 'A saved source needs sign-in before the next search can continue.',
        UNEMPLOYED_TEST_SYSTEM_THEME: process.env.UNEMPLOYED_TEST_SYSTEM_THEME ?? 'dark',
        UNEMPLOYED_USER_DATA_DIR: userDataDirectory
      }
    })

    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await page.evaluate(async (theme) => {
      await window.unemployed.jobFinder.test?.setSystemThemeOverride(theme)
    }, process.env.UNEMPLOYED_TEST_SYSTEM_THEME ?? 'dark')

    const state = JSON.parse(await readFile(snapshotPath, 'utf8'))
    await page.evaluate(async (workspaceState) => {
      if (!window.unemployed.jobFinder.test) {
        throw new Error('Desktop test API is not available in the renderer context.')
      }

      return window.unemployed.jobFinder.test.resetWorkspaceState(workspaceState)
    }, state)

    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await waitForProfileOrSetupHeading(page)

    const initialHeading = (await page.locator('h1').first().textContent())?.trim() ?? ''
    if (initialHeading !== 'Your profile') {
      const navigatedToProfile = await clickProfileNavigation(page)

      if (!navigatedToProfile) {
        throw new Error('Could not find a visible Profile navigation control after loading the seeded workspace.')
      }

      await page.getByRole('heading', { level: 1, name: 'Your profile' }).waitFor({ timeout: 10000 })
    }

    const report = {
      capturedAt: new Date().toISOString(),
      outputDir,
      snapshotPath,
      viewports,
      profilePreferences: {},
      findJobs: {},
      findJobsRunOneSource: {}
    }

    for (const viewport of viewports) {
      await captureProfilePreferences(page, viewport, report)
      await captureFindJobsTop(page, viewport, report)
      await captureFindJobsRunOneSource(page, viewport, report)
    }

    await writeJson('capture-report.json', report)
    process.stdout.write(`Saved source sign-in prompt captures to ${outputDir}\n`)
  } finally {
    if (app) {
      try {
        await app.close()
      } catch {
        // Preserve original failure.
      }
    }

    await rm(userDataDirectory, { recursive: true, force: true })
  }
}

captureSourceSignInPrompts().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error)
  process.stderr.write(`${message}\n`)
  process.exit(1)
})
