import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const desktopDir = path.resolve(currentDir, '..')
const width = Number.parseInt(process.env.UI_CAPTURE_WIDTH ?? '1440', 10)
const height = Number.parseInt(process.env.UI_CAPTURE_HEIGHT ?? '920', 10)
const runLabel = process.env.UI_CAPTURE_LABEL ?? `${width}x${height}`
const outputDir = path.join(desktopDir, 'test-artifacts', 'ui', runLabel)

const screens = [
  {
    buttonName: /^Profile$/,
    fileName: 'profile.png',
    heading: 'Candidate setup'
  },
  {
    buttonName: /^Discovery\s+\d+$/,
    fileName: 'discovery.png',
    heading: 'Adapter-driven discovery'
  },
  {
    buttonName: /^Review Queue\s+\d+$/,
    fileName: 'review-queue.png',
    heading: 'Tailored asset review'
  },
  {
    buttonName: /^Applications\s+\d+$/,
    fileName: 'applications.png',
    heading: 'Application history'
  },
  {
    buttonName: /^Settings$/,
    fileName: 'settings.png',
    heading: 'MVP defaults'
  }
]

async function clickNavigationControl(window, name) {
  const control = window.locator('button, [role="tab"]').filter({ hasText: name }).first()

  if (await control.count()) {
    await control.click()
    return
  }

  await window.getByRole('button', { name }).click()
}

async function captureScreens() {
  await mkdir(outputDir, { recursive: true })
  const userDataDirectory = await mkdtemp(path.join(os.tmpdir(), 'unemployed-ui-capture-'))

  const app = await electron.launch({
    args: ['.'],
    cwd: desktopDir,
    env: {
      ...process.env,
      UNEMPLOYED_USER_DATA_DIR: userDataDirectory
    }
  })

  try {
    const window = await app.firstWindow()

    await window.waitForLoadState('domcontentloaded')
    await window.getByRole('heading', { name: 'Candidate setup' }).waitFor({ timeout: 15000 })
    await window.setViewportSize({ width, height })

    for (const screen of screens) {
      await clickNavigationControl(window, screen.buttonName)
      await window.getByRole('heading', { level: 1, name: screen.heading }).waitFor({ timeout: 10000 })
      await window.screenshot({
        animations: 'disabled',
        path: path.join(outputDir, screen.fileName)
      })
    }
  } finally {
    await app.close()
    await rm(userDataDirectory, { recursive: true, force: true })
  }

  process.stdout.write(`Saved UI captures to ${outputDir}\n`)
}

void captureScreens()
