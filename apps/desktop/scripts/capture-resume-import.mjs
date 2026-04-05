import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const desktopDir = path.resolve(currentDir, '..')

function readCliOption(flag) {
  const index = process.argv.indexOf(flag)

  if (index === -1) {
    return null
  }

  return process.argv[index + 1] ?? null
}

const defaultResumePath = path.resolve(desktopDir, '..', '..', 'Resume.pdf')
const resumePath = readCliOption('--resume') ?? process.env.UI_TEST_RESUME_PATH ?? defaultResumePath
const expectedName = readCliOption('--expected-name') ?? process.env.UI_TEST_EXPECTED_NAME ?? null
const expectedHeadline = readCliOption('--expected-headline') ?? process.env.UI_TEST_EXPECTED_HEADLINE ?? null
const expectedLocation = readCliOption('--expected-location') ?? process.env.UI_TEST_EXPECTED_LOCATION ?? null
const expectedSummaryContains =
  readCliOption('--expected-summary-contains') ?? process.env.UI_TEST_EXPECTED_SUMMARY_CONTAINS ?? null
const runLabel = readCliOption('--label') ?? process.env.UI_CAPTURE_LABEL ?? 'resume-import'
const outputDir = path.join(desktopDir, 'test-artifacts', 'ui', runLabel)

function failIfExpectationMisses(snapshot) {
  if (expectedName && snapshot.profile.fullName !== expectedName) {
    throw new Error(`Expected profile fullName to be "${expectedName}" but received "${snapshot.profile.fullName}".`)
  }

  if (expectedHeadline && snapshot.profile.headline !== expectedHeadline) {
    throw new Error(`Expected profile headline to be "${expectedHeadline}" but received "${snapshot.profile.headline}".`)
  }

  if (expectedLocation && snapshot.profile.currentLocation !== expectedLocation) {
    throw new Error(
      `Expected profile currentLocation to be "${expectedLocation}" but received "${snapshot.profile.currentLocation}".`
    )
  }

  if (expectedSummaryContains && !snapshot.profile.summary.includes(expectedSummaryContains)) {
    throw new Error(
      `Expected profile summary to include "${expectedSummaryContains}" but received "${snapshot.profile.summary}".`
    )
  }
}

async function writeJson(fileName, value) {
  await writeFile(path.join(outputDir, fileName), `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function captureResumeImport() {
  await mkdir(outputDir, { recursive: true })
  const userDataDirectory = await mkdtemp(path.join(os.tmpdir(), 'unemployed-resume-import-'))

  const app = await electron.launch({
    args: ['.'],
    cwd: desktopDir,
    env: {
      ...process.env,
      UNEMPLOYED_ENABLE_TEST_API: '1',
      UNEMPLOYED_USER_DATA_DIR: userDataDirectory
    }
  })

  try {
    const window = await app.firstWindow()

    await window.waitForLoadState('domcontentloaded')
    await window.getByRole('heading', { name: 'Your profile' }).waitFor({ timeout: 15000 })
    await window.setViewportSize({ width: 1440, height: 920 })

    const beforeImport = await window.evaluate(() => window.unemployed.jobFinder.getWorkspace())
    await writeJson('workspace-before-import.json', beforeImport)

    await window.screenshot({
      animations: 'disabled',
      path: path.join(outputDir, 'profile-before-import.png')
    })

    const importedSnapshot = await window.evaluate(
      async (sourcePath) => {
        if (!window.unemployed.jobFinder.test) {
          throw new Error('Desktop test API is not available in the renderer context.')
        }

        return window.unemployed.jobFinder.test.importResumeFromPath(sourcePath)
      },
      resumePath
    )

    failIfExpectationMisses(importedSnapshot)
    await writeJson('workspace-after-import.json', importedSnapshot)

    await window.reload()
    await window.waitForLoadState('domcontentloaded')
    await window.getByRole('heading', { name: 'Your profile' }).waitFor({ timeout: 15000 })

    const reloadedSnapshot = await window.evaluate(() => window.unemployed.jobFinder.getWorkspace())
    failIfExpectationMisses(reloadedSnapshot)
    await writeJson('workspace-after-reload.json', reloadedSnapshot)

    await window.screenshot({
      animations: 'disabled',
      path: path.join(outputDir, 'profile-after-import.png')
    })

    await writeJson('resume-import-report.json', {
      resumePath,
      expectedName,
      expectedHeadline,
      expectedLocation,
      expectedSummaryContains,
      beforeImport: {
        fullName: beforeImport.profile.fullName,
        headline: beforeImport.profile.headline,
        resumeFileName: beforeImport.profile.baseResume.fileName
      },
      afterImport: {
        fullName: reloadedSnapshot.profile.fullName,
        firstName: reloadedSnapshot.profile.firstName,
        middleName: reloadedSnapshot.profile.middleName,
        lastName: reloadedSnapshot.profile.lastName,
        headline: reloadedSnapshot.profile.headline,
        summary: reloadedSnapshot.profile.summary,
        resumeFileName: reloadedSnapshot.profile.baseResume.fileName,
        extractionStatus: reloadedSnapshot.profile.baseResume.extractionStatus,
        analysisWarnings: reloadedSnapshot.profile.baseResume.analysisWarnings
      }
    })

    process.stdout.write(`Saved resume import artifacts to ${outputDir}\n`)
    process.stdout.write(`Detected name: ${reloadedSnapshot.profile.fullName}\n`)
    process.stdout.write(`Detected headline: ${reloadedSnapshot.profile.headline}\n`)
  } finally {
    await app.close()
    await rm(userDataDirectory, { recursive: true, force: true })
  }
}

void captureResumeImport()
