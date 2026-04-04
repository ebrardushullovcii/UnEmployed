import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const desktopDir = path.resolve(currentDir, '..')
const width = Number.parseInt(process.env.UI_CAPTURE_WIDTH ?? '1440', 10)
const height = Number.parseInt(process.env.UI_CAPTURE_HEIGHT ?? '920', 10)
const runLabel = process.env.UI_CAPTURE_LABEL ?? 'resume-workspace'
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

async function getResumeWorkspace(window, jobId) {
  return window.evaluate(
    async (currentJobId) => window.unemployed.jobFinder.getResumeWorkspace(currentJobId),
    jobId,
  )
}

async function getResumeAssistantMessages(window, jobId) {
  return window.evaluate(
    async (currentJobId) => window.unemployed.jobFinder.getResumeAssistantMessages(currentJobId),
    jobId,
  )
}

async function captureResumeWorkspace() {
  await mkdir(outputDir, { recursive: true })
  const userDataDirectory = await mkdtemp(path.join(os.tmpdir(), 'unemployed-resume-workspace-'))

  const app = await electron.launch({
    args: ['.'],
    cwd: desktopDir,
    env: {
      ...process.env,
      UNEMPLOYED_BROWSER_AGENT: '0',
      UNEMPLOYED_ENABLE_TEST_API: '1',
      UNEMPLOYED_USER_DATA_DIR: userDataDirectory,
    },
  })

  try {
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    await window.getByRole('heading', { name: 'Candidate setup' }).waitFor({ timeout: 15000 })
    await window.setViewportSize({ width, height })

    await window.evaluate(async () => {
      if (!window.unemployed.jobFinder.test) {
        throw new Error('Desktop test API is unavailable in the renderer.')
      }

      return window.unemployed.jobFinder.test.loadResumeWorkspaceDemo()
    })
    await window.reload()
    await window.waitForLoadState('domcontentloaded')

    await window.getByRole('button', { name: /^Review Queue/ }).click()
    await window.getByRole('heading', { level: 1, name: 'Tailored asset review' }).waitFor({ timeout: 10000 })
    await window.screenshot({ animations: 'disabled', path: path.join(outputDir, '01-review-queue.png') })

    await window.getByText(/Employer site:/).waitFor({ timeout: 10000 })

    await window.getByRole('button', { name: /Edit asset/i }).first().click()
    await window.getByRole('heading', { level: 1, name: /Senior Product Designer/i }).waitFor({ timeout: 10000 })
    await window.screenshot({ animations: 'disabled', path: path.join(outputDir, '02-resume-workspace-open.png') })

    await window.getByText('Job Context').waitFor({ timeout: 10000 })
    await window.getByText('Why this bullet exists').first().click()
    await window.screenshot({ animations: 'disabled', path: path.join(outputDir, '02b-resume-workspace-sources.png') })

    const summaryField = window.locator('textarea').first()
    await summaryField.fill('Senior systems designer with strong workflow automation, design-system, and operations-platform experience.')
    await window.getByRole('button', { name: 'Save Draft' }).click()
    await window.screenshot({ animations: 'disabled', path: path.join(outputDir, '03-after-manual-edit.png') })

    const assistantField = window.getByLabel('Message')
    await assistantField.fill('Shorten the summary and tighten one experience bullet for ATS readability.')
    await window.getByRole('button', { name: 'Send' }).click()
    await waitForCondition(
      async () => {
        const messages = await getResumeAssistantMessages(window, 'job_ready')
        return messages.length >= 2 && messages[messages.length - 1]?.role === 'assistant'
      },
      'assistant reply in resume workspace demo',
    )
    await window.screenshot({ animations: 'disabled', path: path.join(outputDir, '04-after-assistant.png') })

    await window.getByRole('button', { name: 'Export PDF' }).click()
    await waitForCondition(
      async () => (await getResumeWorkspace(window, 'job_ready')).exports.length > 0,
      'resume export in demo flow',
    )
    await window.screenshot({ animations: 'disabled', path: path.join(outputDir, '05-after-export.png') })

    await window.getByRole('button', { name: /Back to Review Queue/i }).click()
    await window.getByRole('heading', { level: 1, name: 'Tailored asset review' }).waitFor({ timeout: 10000 })
    const gatedApproveButton = window.getByRole('button', { name: 'Approve Easy Apply' })
    if (!(await gatedApproveButton.isDisabled())) {
      throw new Error('Approve Easy Apply should stay disabled before resume approval.')
    }
    await window.screenshot({ animations: 'disabled', path: path.join(outputDir, '06-review-queue-gated.png') })

    await window.getByRole('button', { name: /Edit asset/i }).first().click()
    await window.getByRole('heading', { level: 1, name: /Senior Product Designer/i }).waitFor({ timeout: 10000 })

    const approveButton = window.getByRole('button', { name: 'Approve Resume' })
    await approveButton.waitFor({ timeout: 10000 })
    await approveButton.click()
    await waitForCondition(
      async () => {
        const workspace = await getResumeWorkspace(window, 'job_ready')
        return workspace.exports.some((entry) => entry.isApproved) && workspace.draft.status === 'approved'
      },
      'approved resume export in demo flow',
    )
    await window.screenshot({ animations: 'disabled', path: path.join(outputDir, '07-after-approval.png') })

    await window.getByRole('button', { name: /Back to Review Queue/i }).click()
    await window.getByRole('heading', { level: 1, name: 'Tailored asset review' }).waitFor({ timeout: 10000 })
    const readyApproveButton = window.getByRole('button', { name: 'Approve Easy Apply' })
    if (await readyApproveButton.isDisabled()) {
      throw new Error('Approve Easy Apply should be enabled after resume approval.')
    }
    await window.screenshot({ animations: 'disabled', path: path.join(outputDir, '08-review-queue-approved.png') })

    await readyApproveButton.click()
    await window.getByRole('button', { name: /^Applications/ }).click()
    await window.getByRole('heading', { level: 1, name: 'Application history' }).waitFor({ timeout: 10000 })
    await window.screenshot({ animations: 'disabled', path: path.join(outputDir, '09-applications-after-apply.png') })

    const workspace = await window.evaluate(() => window.unemployed.jobFinder.getWorkspace())
    await writeJson('workspace-after-demo.json', workspace)
  } finally {
    await app.close()
    await rm(userDataDirectory, { recursive: true, force: true })
  }

  process.stdout.write(`Saved resume workspace demo artifacts to ${outputDir}\n`)
}

void captureResumeWorkspace()
