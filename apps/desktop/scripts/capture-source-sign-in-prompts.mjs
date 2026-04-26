/* eslint-env node, browser */
/* global document */

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

async function waitForHeading(window, headings, options) {
  const allowedHeadings = Array.isArray(headings) ? headings : [headings]

  await window.waitForFunction((nextAllowedHeadings) => {
    const heading = document.querySelector('h1')
    const text = heading?.textContent ?? ''
    return nextAllowedHeadings.some((allowedHeading) => text.includes(allowedHeading))
  }, allowedHeadings, { timeout: 10000, ...options })
}

async function waitForProfileOrSetupHeading(window) {
  await waitForHeading(window, ['Your profile', 'Guided setup'], { timeout: 15000 })
}

async function clickNavigationControl(window, name) {
  const control = window.locator('button, [role="tab"]').filter({ hasText: name }).first()

  if (await control.count()) {
    await control.click()
    return
  }

  await window.getByRole('button', { name }).click()
}

async function clickProfilePreferencesTab(window) {
  const tabPatterns = [/^Preferences$/, /Preferences/i]

  for (const pattern of tabPatterns) {
    const tab = window.getByRole('tab', { name: pattern }).first()

    if (await tab.isVisible().catch(() => false)) {
      await tab.click()
      return
    }
  }

  await window.locator('[role="tab"]').filter({ hasText: 'Preferences' }).first().click()
}

async function clickProfileNavigation(window) {
  const navPatterns = [/^Profile$/, /Your profile/i]

  for (const pattern of navPatterns) {
    const button = window.getByRole('button', { name: pattern }).first()

    if (await button.isVisible().catch(() => false)) {
      await button.click()
      return true
    }
  }

  const fallbackButton = window.locator('button').filter({ hasText: 'Profile' }).first()

  if (await fallbackButton.isVisible().catch(() => false)) {
    await fallbackButton.click()
    return true
  }

  return false
}

async function setViewport(window, viewport) {
  await window.setViewportSize({ width: viewport.width, height: viewport.height })
  await window.waitForTimeout(180)
}

async function setScrollAreaOffset(window, offset) {
  await window.evaluate(
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

async function scrollAreaToTop(window) {
  await setScrollAreaOffset(window, 0)
  await window.waitForTimeout(160)
}

async function scrollIntoView(locator) {
  await locator.waitFor({ state: 'visible', timeout: 10000 })
  await locator.scrollIntoViewIfNeeded()
  await locator.waitFor({ state: 'visible', timeout: 10000 })
  await locator.page().waitForTimeout(180)
}

async function captureProfilePreferences(window, viewport, report) {
  await setViewport(window, viewport)
  await clickNavigationControl(window, /^Profile$/)
  await window.getByRole('heading', { level: 1, name: 'Your profile' }).waitFor({ timeout: 10000 })
  await clickProfilePreferencesTab(window)
  await scrollAreaToTop(window)

  const jobSourcesHeading = window.getByText('Job sources', { exact: true }).first()
  await scrollIntoView(jobSourcesHeading)
  await window.getByText('Sign-in required', { exact: true }).first().waitFor({ timeout: 10000 })
  await window.getByText('Sign-in recommended', { exact: true }).first().waitFor({ timeout: 10000 })

  const fileName = `profile-preferences-${viewport.slug}.png`
  await window.screenshot({ animations: 'disabled', path: path.join(outputDir, fileName) })
  report.profilePreferences[viewport.slug] = fileName
}

async function captureFindJobsTop(window, viewport, report) {
  await setViewport(window, viewport)
  await clickNavigationControl(window, /^Find jobs\s+\d+$/)
  await window.getByRole('heading', { level: 1, name: 'Find jobs' }).waitFor({ timeout: 10000 })
  await scrollAreaToTop(window)
  await window.getByText('Then search again after sign-in.', { exact: true }).waitFor({ timeout: 10000 })

  const fileName = `find-jobs-${viewport.slug}.png`
  await window.screenshot({ animations: 'disabled', path: path.join(outputDir, fileName) })
  report.findJobs[viewport.slug] = fileName
}

async function captureFindJobsRunOneSource(window, viewport, report) {
  await setViewport(window, viewport)
  await clickNavigationControl(window, /^Find jobs\s+\d+$/)
  await window.getByRole('heading', { level: 1, name: 'Find jobs' }).waitFor({ timeout: 10000 })
  await scrollAreaToTop(window)

  const runOneSourceHeading = window.getByRole('heading', { name: 'Run one source' }).first()
  await scrollIntoView(runOneSourceHeading)
  await window.getByText('Sign in to Wellfound for better search coverage on the next run.', { exact: true }).waitFor({ timeout: 10000 })

  const fileName = `find-jobs-run-one-source-${viewport.slug}.png`
  await window.screenshot({ animations: 'disabled', path: path.join(outputDir, fileName) })
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

    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    await window.evaluate(async (theme) => {
      await window.unemployed.jobFinder.test?.setSystemThemeOverride(theme)
    }, process.env.UNEMPLOYED_TEST_SYSTEM_THEME ?? 'dark')

    const state = JSON.parse(await readFile(snapshotPath, 'utf8'))
    await window.evaluate(async (workspaceState) => {
      if (!window.unemployed.jobFinder.test) {
        throw new Error('Desktop test API is not available in the renderer context.')
      }

      return window.unemployed.jobFinder.test.resetWorkspaceState(workspaceState)
    }, state)

    await window.reload()
    await window.waitForLoadState('domcontentloaded')
    await waitForProfileOrSetupHeading(window)

    const initialHeading = (await window.locator('h1').first().textContent())?.trim() ?? ''
    if (initialHeading !== 'Your profile') {
      const navigatedToProfile = await clickProfileNavigation(window)

      if (!navigatedToProfile) {
        throw new Error('Could not find a visible Profile navigation control after loading the seeded workspace.')
      }

      await window.getByRole('heading', { level: 1, name: 'Your profile' }).waitFor({ timeout: 10000 })
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
      await captureProfilePreferences(window, viewport, report)
      await captureFindJobsTop(window, viewport, report)
      await captureFindJobsRunOneSource(window, viewport, report)
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

void captureSourceSignInPrompts()
