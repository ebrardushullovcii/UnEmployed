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

const canaryOnly = process.argv.includes('--canary-only')
const useConfiguredAi = process.argv.includes('--use-configured-ai')
const useVision = process.argv.includes('--use-vision')
const caseIds = process.argv
  .flatMap((entry, index, argv) => {
    if (entry === '--case-id' || entry === '--case') {
      return argv[index + 1] ? [argv[index + 1]] : []
    }

    if (entry.startsWith('--case-id=')) {
      return [entry.slice('--case-id='.length)]
    }

    if (entry.startsWith('--case=')) {
      return [entry.slice('--case='.length)]
    }

    return []
  })
  .flatMap((entry) => entry.split(','))
  .map((entry) => entry.trim())
  .filter(Boolean)
const benchmarkVersion =
  readCliOption('--benchmark-version') ?? process.env.UI_RESUME_IMPORT_BENCHMARK_VERSION ?? '019-local-benchmark-v1'
const runLabel = readCliOption('--label') ?? process.env.UI_CAPTURE_LABEL ?? 'resume-import-benchmark'
const outputDir = path.join(desktopDir, 'test-artifacts', 'ui', runLabel)

async function main() {
  await mkdir(outputDir, { recursive: true })
  const userDataDirectory = await mkdtemp(path.join(os.tmpdir(), 'unemployed-resume-benchmark-'))

  const app = await electron.launch({
    args: ['.'],
    cwd: desktopDir,
    env: {
      ...process.env,
      UNEMPLOYED_ENABLE_TEST_API: '1',
      UNEMPLOYED_USER_DATA_DIR: userDataDirectory,
      ...(useConfiguredAi ? {} : { UNEMPLOYED_AI_API_KEY: '' }),
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
      async ({ benchmarkVersion, canaryOnly, useConfiguredAi, useVision, caseIds }) => {
        if (!window.unemployed.jobFinder.test) {
          throw new Error('Desktop test API is not available in the renderer context.')
        }

        const defaultCases = [
          {
            id: 'resume_import_sample_txt',
            label: 'Deterministic text canary',
            resumePath: 'apps/desktop/test-fixtures/job-finder/resume-import-sample.txt',
            canary: true,
            tags: ['txt', 'canary'],
            expected: {
              literalFields: {
                fullName: 'Jamie Rivers',
                currentLocation: 'Berlin, Germany',
                email: 'jamie@example.com',
                phone: '+49 555 0000000',
              },
              summaryContains: ['12 years of experience'],
              experienceRecords: [
                {
                  title: 'Staff Frontend Engineer',
                  companyName: 'Signal Systems',
                },
              ],
              educationRecords: [
                { schoolName: 'The University of Texas at Austin', degree: 'Bachelor of Science' },
              ],
            },
          },
          {
            id: 'ebrar_pdf',
            label: 'Ebrar PDF',
            resumePath: 'docs/resume-tests/Ebrar.pdf',
            canary: true,
            tags: ['pdf', 'canary', 'baseline'],
            expected: {
              literalFields: {
                fullName: 'Ebrar Dushullovci',
                currentLocation: 'Prishtina, Kosovo',
                email: 'ebrar.dushullovci@gmail.com',
                phone: '(+383) 44283970',
              },
              summaryContains: ['6+ years of full-stack experience'],
              experienceRecords: [
                { title: 'Senior Full-Stack Software Engineer', companyName: 'AUTOMATEDPROS' },
                { title: 'Chief Experience Officer', companyName: 'AUTOMATEDPROS' },
                { title: '.NET Consultant', companyName: 'INFOTECH L.L.C' },
                { title: '.NET Developer', companyName: 'INFOTECH L.L.C' },
                { title: '.NET Developer', companyName: 'CREA-KO' },
                { title: 'Project Manager', companyName: 'BEAUTYQUE' },
                { title: 'Digital Marketing Manager', companyName: 'BEAUTYQUE' },
                { title: 'Technical Support Agent', companyName: 'BIT BY BIT' },
                { title: 'Call Center Agent', companyName: 'TREGI KOSOVO' },
              ],
              educationRecords: [
                { schoolName: 'Kolegji Riinvest (Riinvest College)', degree: "BACHELOR'S DEGREE" },
              ],
            },
          },
          {
            id: 'ebrar_new_pdf',
            label: 'Ebrar New PDF',
            resumePath: 'docs/resume-tests/Ebrar new.pdf',
            canary: false,
            tags: ['pdf', 'alternate-format', 'baseline'],
            expected: {
              literalFields: {
                fullName: 'Ebrar Dushullovci',
                currentLocation: 'Prishtina, Kosovo',
                email: 'ebrar.dushullovci@gmail.com',
                phone: '(+383) 44283970',
              },
              summaryContains: ['full-stack developer'],
              experienceRecords: [
                { title: 'Senior Full-Stack Software Engineer', companyName: 'AUTOMATEDPROS' },
                { title: 'Chief Experience Officer', companyName: 'AUTOMATEDPROS' },
                { title: 'Senior Full-Stack Software Engineer (Part-Time Consultant)', companyName: 'INFOTECH L.L.C' },
                { title: 'Full-Stack Software Engineer', companyName: 'INFOTECH L.L.C' },
                { title: 'Full-Stack Software Engineer', companyName: 'CREA-KO' },
                { title: 'Project Manager', companyName: 'BEAUTYQUE' },
                { title: 'Digital Marketing Manager', companyName: 'BEAUTYQUE' },
                { title: 'Technical Support Agent', companyName: 'BIT BY BIT' },
                { title: 'Call Center Agent', companyName: 'TREGI KOSOVO' },
              ],
              educationRecords: [
                { schoolName: 'Kolegji Riinvest (Riinvest College)', degree: "BACHELOR'S DEGREE" },
              ],
            },
          },
          {
            id: 'aaron_murphy_pdf',
            label: 'Aaron Murphy PDF',
            resumePath: 'docs/resume-tests/Aaron Murphy Resume.pdf',
            canary: true,
            tags: ['pdf', 'multi-column', 'name-failure'],
            expected: {
              literalFields: {
                fullName: 'Aaron Murphy',
                currentLocation: 'Tampa, FL',
                email: 'murphyaron12@gmail.com',
                phone: '+1 615-378-5538',
              },
              summaryContains: ['Experienced Staff Engineer'],
              experienceRecords: [
                { title: 'Staff/Senior Software Engineer', companyName: 'EdSights' },
                { title: 'Senior Software Developer', companyName: 'Agile Thought' },
                { title: 'Software Developer', companyName: 'Agile Thought' },
                { title: 'Software Developer', companyName: 'Three Five Two' },
              ],
              educationRecords: [
                { schoolName: 'Florida State University', degree: 'Bachelor’s Degree' },
              ],
            },
          },
          {
            id: 'paul_asselin_pdf',
            label: 'Paul Asselin PDF',
            resumePath: 'docs/resume-tests/Paul Asselin CV.pdf',
            canary: false,
            tags: ['pdf', 'location-failure'],
            expected: {
              literalFields: {
                fullName: 'Paul Asselin',
                currentLocation: 'Philadelphia, PA',
                email: 'paul.asselin454@outlook.com',
                phone: '(530) 213-3550',
              },
              summaryContains: ['Senior Software Engineer with 7+ years'],
              experienceRecords: [
                { title: 'Senior Software Engineer', companyName: 'Mercury' },
                { title: 'Senior Software Engineer', companyName: 'Leif' },
                { title: 'Software Engineer', companyName: 'Leif' },
                { title: 'Summer Analyst', companyName: 'IK Investment Partners' },
              ],
              educationRecords: [
                { schoolName: 'University of Pennsylvania', degree: 'Bachelor of Computer Science, 2014' },
              ],
            },
          },
          {
            id: 'ryan_holstien_pdf',
            label: 'Ryan Holstien PDF',
            resumePath: 'docs/resume-tests/Ryan Holstien Resume.pdf',
            canary: false,
            tags: ['pdf', 'name-failure', 'location-failure'],
            expected: {
              literalFields: {
                fullName: 'Ryan Holstien',
                currentLocation: 'Cedar Park, TX 78613',
                email: 'ryanholstien993@outlook.com',
                phone: '+1 650-353-7911',
              },
              summaryContains: ['10+ years of experience'],
              experienceRecords: [
                { title: 'Senior Software Engineer', companyName: 'DataHub' },
                { title: 'Senior Software Engineer', companyName: 'Vrbo' },
                { title: 'Software Engineer', companyName: 'Infor' },
              ],
              educationRecords: [],
            },
          },
        ]
        const selectedCases = caseIds.length > 0
          ? defaultCases.filter((entry) => caseIds.includes(entry.id))
          : []

        if (caseIds.length > 0 && selectedCases.length !== caseIds.length) {
          throw new Error(`Unknown resume import benchmark case id(s): ${caseIds.filter((id) => !selectedCases.some((entry) => entry.id === id)).join(', ')}`)
        }

        return window.unemployed.jobFinder.test.runResumeImportBenchmark({
          benchmarkVersion,
          canaryOnly,
          useConfiguredAi,
          useVision,
          ...(selectedCases.length > 0 ? { cases: selectedCases } : {}),
        })
      },
      { benchmarkVersion, canaryOnly, useConfiguredAi, useVision, caseIds },
    )

    const reportPath = path.join(outputDir, 'resume-import-benchmark-report.json')
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    const parserManifestVersions = Array.isArray(report.parserManifestVersions)
      ? report.parserManifestVersions
      : []

    process.stdout.write(`Saved resume import benchmark report to ${reportPath}\n`)
    process.stdout.write(
      `Aggregate literal recall: ${report.aggregate.literalFieldRecall.toFixed(3)} | auto-apply precision: ${report.aggregate.autoApplyPrecision.toFixed(3)}\n`,
    )
    process.stdout.write(
      `Parser manifest summary: ${report.parserManifestVersion ?? 'none'}${parserManifestVersions.length > 0 ? ` | manifests: ${parserManifestVersions.join(', ')}` : ''}\n`,
    )
  } finally {
    await app.close()
    await rm(userDataDirectory, { recursive: true, force: true })
  }
}

void main()
