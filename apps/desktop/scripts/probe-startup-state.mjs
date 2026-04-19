import os from 'node:os'
import path from 'node:path'
import { mkdtemp, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const desktopDir = path.resolve(currentDir, '..')

const userDataDirectory = await mkdtemp(path.join(os.tmpdir(), 'unemployed-startup-probe-'))

let app
try {
  app = await electron.launch({
    args: ['.'],
    cwd: desktopDir,
    env: {
      ...process.env,
      UNEMPLOYED_ENABLE_TEST_API: '1',
      UNEMPLOYED_TEST_SYSTEM_THEME: process.env.UNEMPLOYED_TEST_SYSTEM_THEME ?? 'dark',
      UNEMPLOYED_USER_DATA_DIR: userDataDirectory,
    },
  })

  const window = await app.firstWindow()
  await window.waitForLoadState('domcontentloaded')
  await window.waitForTimeout(3000)

  const snapshot = await window.evaluate(() => ({
    href: window.location.href,
    title: document.title,
    h1: document.querySelector('h1')?.textContent ?? null,
    bodyText: document.body?.innerText?.slice(0, 1000) ?? null,
  }))

  console.log(JSON.stringify(snapshot, null, 2))
} finally {
  if (app) {
    await app.close().catch(() => {})
  }
  await rm(userDataDirectory, { recursive: true, force: true })
}
