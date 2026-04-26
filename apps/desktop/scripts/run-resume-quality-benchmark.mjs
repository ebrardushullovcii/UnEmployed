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

  const value = process.argv[index + 1]

  if (!value || value.startsWith('--')) {
    return null
  }

  return value
}

const canaryOnly = process.argv.includes('--canary-only')
const benchmarkVersion =
  readCliOption('--benchmark-version') ?? process.env.UI_RESUME_QUALITY_BENCHMARK_VERSION ?? '023-local-benchmark-v1'
const runLabel = readCliOption('--label') ?? process.env.UI_CAPTURE_LABEL ?? 'resume-quality-benchmark'
const outputDir = path.join(desktopDir, 'test-artifacts', 'ui', runLabel, benchmarkVersion)

async function main() {
  await rm(outputDir, { recursive: true, force: true })
  await mkdir(outputDir, { recursive: true })
  const userDataDirectory = await mkdtemp(path.join(os.tmpdir(), 'unemployed-resume-quality-'))

  const app = await electron.launch({
    args: ['.'],
    cwd: desktopDir,
    env: {
      ...process.env,
      UNEMPLOYED_ENABLE_TEST_API: '1',
      UNEMPLOYED_USER_DATA_DIR: userDataDirectory,
      UNEMPLOYED_AI_API_KEY: '',
    },
  })

  try {
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    await Promise.any([
      window.getByRole('heading', { level: 1, name: 'Your profile' }).waitFor({ timeout: 15000 }),
      window.getByRole('heading', { level: 1, name: 'Guided setup' }).waitFor({ timeout: 15000 }),
    ])

    const report = await window.evaluate(
      async ({ benchmarkVersion, canaryOnly, outputDir }) => {
        if (!window.unemployed.jobFinder.test) {
          throw new Error('Desktop test API is not available in the renderer context.')
        }

        return window.unemployed.jobFinder.test.runResumeQualityBenchmark({
          benchmarkVersion,
          canaryOnly,
          persistArtifactsDirectory: outputDir,
        })
      },
      { benchmarkVersion, canaryOnly, outputDir },
    )

    const reportPath = path.join(outputDir, 'resume-quality-benchmark-report.json')
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

    process.stdout.write(`Saved resume quality benchmark report to ${reportPath}\n`)
    process.stdout.write(
      `Aggregate grounded visible skill rate: ${report.aggregate.groundedVisibleSkillRate.toFixed(3)} | ATS render pass rate: ${report.aggregate.atsRenderPassRate.toFixed(3)}\n`,
    )
    process.stdout.write(
      `Aggregate keyword coverage: ${report.aggregate.keywordCoverageRate.toFixed(3)} | issue-free case rate: ${report.aggregate.issueFreeCaseRate.toFixed(3)}\n`,
    )
  } finally {
    await app.close()
    await rm(userDataDirectory, { recursive: true, force: true })
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error)
  process.stderr.write(`${message}\n`)
  process.exit(1)
})
