import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { createJobFinderAiClientFromEnvironment } from '@unemployed/ai-providers'
import { createBrowserAgentRuntime } from '@unemployed/browser-runtime'
import {
  CandidateProfileSchema,
  JobFinderSettingsSchema,
  JobSearchPreferencesSchema,
} from '@unemployed/contracts'
import { createInMemoryJobFinderRepository } from '@unemployed/db'
import {
  buildBenchmarkRepositoryState,
  createJobFinderWorkspaceService,
  type JobFinderDocumentManager,
} from '@unemployed/job-finder'

const currentFile = fileURLToPath(import.meta.url)
const repoRoot = path.resolve(path.dirname(currentFile), '..')
const defaultOutputDir = path.join(repoRoot, 'apps', 'desktop', 'test-artifacts', 'ui', '013-benchmark-service')
const outputDir = process.env.BENCHMARK_OUTPUT_DIR
  ? path.resolve(process.env.BENCHMARK_OUTPUT_DIR)
  : defaultOutputDir
const outputVariant = process.env.BENCHMARK_VARIANT ?? 'after'
const headless = (process.env.UNEMPLOYED_BROWSER_HEADLESS ?? '1') === '1'
const runLiveBenchmark = process.env.UNEMPLOYED_RUN_013_LIVE_BENCHMARK === '1'

function getDefaultChromeExecutablePath(): string {
  if (process.platform === 'win32') {
    const programFiles = process.env.PROGRAMFILES ?? 'C:\\Program Files'
    return path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe')
  }

  if (process.platform === 'darwin') {
    return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  }

  return '/usr/bin/google-chrome'
}

const chromeExecutablePath =
  process.env.UNEMPLOYED_CHROME_PATH ?? getDefaultChromeExecutablePath()

const benchmarkTargets = [
  {
    id: 'target_greenhouse_remote',
    label: 'Remote Greenhouse',
    startingUrl: 'https://job-boards.greenhouse.io/remote',
    expectedProvider: 'greenhouse',
    expectedApiCapable: true,
  },
  {
    id: 'target_lever_aircall',
    label: 'Aircall Lever',
    startingUrl: 'https://jobs.lever.co/aircall',
    expectedProvider: 'lever',
    expectedApiCapable: true,
  },
  {
    id: 'target_kosovajob_home',
    label: 'Kosovajob',
    startingUrl: 'https://kosovajob.com/',
    expectedProvider: null,
    expectedApiCapable: false,
  },
] as const

function parseEnvFile(content: string): Record<string, string> {
  const parsed: Record<string, string> = {}

  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) {
      continue
    }

    const separatorIndex = line.indexOf('=')
    if (separatorIndex <= 0) {
      continue
    }

    const key = line.slice(0, separatorIndex).trim()
    const rawValue = line.slice(separatorIndex + 1).trim()
    const unquotedValue =
      (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
      (rawValue.startsWith("'") && rawValue.endsWith("'"))
        ? rawValue.slice(1, -1)
        : rawValue

    parsed[key] = unquotedValue.replace(/\\n/g, '\n')
  }

  return parsed
}

function loadEnvOverrides(root: string): Record<string, string> {
  const candidates = [
    path.join(root, '.env'),
    path.join(root, '.env.local'),
    path.join(root, 'apps', 'desktop', '.env'),
    path.join(root, 'apps', 'desktop', '.env.local'),
  ]

  const merged: Record<string, string> = {}
  for (const candidate of candidates) {
    if (!existsSync(candidate)) {
      continue
    }

    const parsed = parseEnvFile(readFileSync(candidate, 'utf8'))
    Object.assign(
      merged,
      parsed,
    )
  }

  return merged
}

async function loadFixture() {
  const fixturePath = path.join(
    repoRoot,
    'apps',
    'desktop',
    'test-fixtures',
    'job-finder',
    'profile-baseline-workspace.json',
  )
  return JSON.parse(await readFile(fixturePath, 'utf8')) as {
    profile: Record<string, unknown>
    searchPreferences: Record<string, unknown>
    settings: Record<string, unknown>
  }
}

function buildSeed(fixture: Awaited<ReturnType<typeof loadFixture>>, target: (typeof benchmarkTargets)[number]) {
  const parsedProfile = CandidateProfileSchema.parse(fixture.profile)
  const parsedSearchPreferences = JobSearchPreferencesSchema.parse(fixture.searchPreferences)
  const parsedSettings = JobFinderSettingsSchema.parse(fixture.settings)
  const emptyState = buildBenchmarkRepositoryState({
    profile: parsedProfile,
    searchPreferences: parsedSearchPreferences,
  })

  return {
    ...emptyState,
    profile: parsedProfile,
    searchPreferences: {
      ...emptyState.searchPreferences,
      ...parsedSearchPreferences,
      targetRoles: [
        'Engineer',
        'Developer',
        'Designer',
        'Product',
        'Manager',
        'Marketing',
        'Sales',
        'Data',
        'Analyst',
      ],
      locations: [],
      excludedLocations: [],
      workModes: [],
      seniorityLevels: [],
      minimumSalaryUsd: null,
      targetSalaryUsd: null,
      companyBlacklist: [],
      companyWhitelist: [],
      discovery: {
        historyLimit: 5,
        targets: [
          {
            id: target.id,
            label: target.label,
            startingUrl: target.startingUrl,
            enabled: true,
            adapterKind: 'auto',
            customInstructions: null,
            instructionStatus: 'missing',
            validatedInstructionId: null,
            draftInstructionId: null,
            lastDebugRunId: null,
            lastVerifiedAt: null,
            staleReason: null,
          },
        ],
      },
    },
    settings: {
      ...emptyState.settings,
      ...parsedSettings,
      keepSessionAlive: true,
      discoveryOnly: false,
    },
  }
}

const noopDocumentManager: JobFinderDocumentManager = {
  listResumeTemplates() {
    return []
  },
  async renderResumeArtifact() {
    throw new Error('Resume rendering is not needed for the 013 benchmark harness.')
  },
}

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
}

function titleMatchRate(jobs: Array<Record<string, unknown>>, targetRoles: string[]): number | null {
  if (jobs.length === 0 || targetRoles.length === 0) {
    return null
  }

  const normalizedRoles = targetRoles.map((role) => normalizeText(role)).filter(Boolean)
  if (normalizedRoles.length === 0) {
    return null
  }

  const matched = jobs.filter((job) => {
    const title = normalizeText(job.title)
    return normalizedRoles.some((role) => title.includes(role))
  }).length

  return Number((matched / jobs.length).toFixed(3))
}

type RunWithTimeoutResult<TValue> =
  | {
      value: TValue
      wallClockMs: number
      timedOut: false
    }
  | {
      error: string
      wallClockMs: number
      timedOut: boolean
    }

type SourceDebugBenchmarkRunResult = {
  snapshot: Record<string, unknown>
  details: Record<string, unknown> | null
}

async function runWithTimeout<TValue>(
  label: string,
  timeoutMs: number,
  run: (signal: AbortSignal) => Promise<TValue>,
): Promise<RunWithTimeoutResult<TValue>> {
  const controller = new AbortController()
  const timeoutHandle = setTimeout(() => controller.abort(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)
  const startedAt = Date.now()

  try {
    const value = await run(controller.signal)
    return {
      value,
      wallClockMs: Date.now() - startedAt,
      timedOut: false,
    } satisfies RunWithTimeoutResult<TValue>
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      wallClockMs: Date.now() - startedAt,
      timedOut: controller.signal.aborted,
    } satisfies RunWithTimeoutResult<TValue>
  } finally {
    clearTimeout(timeoutHandle)
  }
}

function summarizeSourceDebug(
  target: (typeof benchmarkTargets)[number],
  searchPreferences: { targetRoles: string[] },
  result:
    | {
        snapshot: Record<string, unknown>
        details: Record<string, unknown> | null
      }
    | null,
  wallClockMs: number,
) {
  const details = result?.details ?? null
  const run = (details?.run as Record<string, unknown> | undefined) ?? null
  const artifact = (details?.instructionArtifact as Record<string, unknown> | undefined) ?? null

  return {
    targetId: target.id,
    targetLabel: target.label,
    targetUrl: target.startingUrl,
    expectedProvider: target.expectedProvider,
    wallClockMs,
    state: run?.state ?? null,
    finalSummary: run?.finalSummary ?? null,
    manualPrerequisiteSummary: run?.manualPrerequisiteSummary ?? null,
    timing: run?.timing ?? null,
    artifact: artifact
      ? {
          id: artifact.id ?? null,
          status: artifact.status ?? null,
          guidanceCounts: {
            navigation: Array.isArray(artifact.navigationGuidance) ? artifact.navigationGuidance.length : 0,
            search: Array.isArray(artifact.searchGuidance) ? artifact.searchGuidance.length : 0,
            detail: Array.isArray(artifact.detailGuidance) ? artifact.detailGuidance.length : 0,
            apply: Array.isArray(artifact.applyGuidance) ? artifact.applyGuidance.length : 0,
            warnings: Array.isArray(artifact.warnings) ? artifact.warnings.length : 0,
          },
          verificationOutcome:
            typeof artifact.verification === 'object' && artifact.verification
              ? (artifact.verification as Record<string, unknown>).outcome ?? null
              : null,
          intelligence:
            typeof artifact.intelligence === 'object' && artifact.intelligence
              ? {
                  providerKey:
                    typeof (artifact.intelligence as Record<string, unknown>).provider === 'object' &&
                    (artifact.intelligence as Record<string, unknown>).provider
                      ? ((artifact.intelligence as Record<string, unknown>).provider as Record<string, unknown>).key ?? null
                      : null,
                  preferredMethod:
                    typeof (artifact.intelligence as Record<string, unknown>).collection === 'object' &&
                    (artifact.intelligence as Record<string, unknown>).collection
                      ? ((artifact.intelligence as Record<string, unknown>).collection as Record<string, unknown>).preferredMethod ?? null
                      : null,
                }
              : null,
        }
      : null,
    qualitySignals: {
      hasArtifact: Boolean(artifact),
      hasTypedIntelligence: Boolean(artifact && 'intelligence' in artifact),
      preferredMethod:
        artifact &&
        typeof artifact.intelligence === 'object' &&
        artifact.intelligence &&
        typeof (artifact.intelligence as Record<string, unknown>).collection === 'object' &&
        (artifact.intelligence as Record<string, unknown>).collection
          ? ((artifact.intelligence as Record<string, unknown>).collection as Record<string, unknown>).preferredMethod ?? null
          : null,
      providerMatchedExpectation:
        artifact &&
        typeof artifact.intelligence === 'object' &&
        artifact.intelligence &&
        typeof (artifact.intelligence as Record<string, unknown>).provider === 'object' &&
        (artifact.intelligence as Record<string, unknown>).provider
          ? (((artifact.intelligence as Record<string, unknown>).provider as Record<string, unknown>).key ?? null) ===
            target.expectedProvider
          : null,
      targetRoles: searchPreferences.targetRoles,
    },
  }
}

function summarizeDiscovery(
  target: (typeof benchmarkTargets)[number],
  searchPreferences: { targetRoles: string[] },
  snapshot: Record<string, unknown> | null,
  wallClockMs: number,
) {
  const recentRuns = Array.isArray(snapshot?.recentDiscoveryRuns) ? (snapshot.recentDiscoveryRuns as Array<Record<string, unknown>>) : []
  const run = recentRuns[0] ?? null
  const jobs = Array.isArray(snapshot?.discoveryJobs) ? (snapshot.discoveryJobs as Array<Record<string, unknown>>) : []

  return {
    targetId: target.id,
    targetLabel: target.label,
    targetUrl: target.startingUrl,
    expectedProvider: target.expectedProvider,
    wallClockMs,
    state: run?.state ?? null,
    scope: run?.scope ?? null,
    summary: run?.summary ?? null,
    targetExecutions: Array.isArray(run?.targetExecutions) ? run?.targetExecutions : [],
    jobs: {
      count: jobs.length,
      withSummary: jobs.filter((job) => Boolean(job.summary)).length,
      withApplicationUrl: jobs.filter((job) => Boolean(job.applicationUrl)).length,
      withEmployerDomain: jobs.filter((job) => Boolean(job.employerDomain)).length,
      withAtsProvider: jobs.filter((job) => Boolean(job.atsProvider)).length,
      withProviderKey: jobs.filter((job) => Boolean(job.providerKey)).length,
      withCollectionMethodApi: jobs.filter((job) => job.collectionMethod === 'api').length,
      withSourceIntelligence: jobs.filter((job) => Boolean(job.sourceIntelligence)).length,
      titleMatchRate: titleMatchRate(jobs, searchPreferences.targetRoles),
      sample: jobs.slice(0, 5).map((job) => ({
        title: job.title ?? null,
        company: job.company ?? null,
        location: job.location ?? null,
        canonicalUrl: job.canonicalUrl ?? null,
        discoveryMethod: job.discoveryMethod ?? null,
        collectionMethod: job.collectionMethod ?? null,
        providerKey: job.providerKey ?? null,
        atsProvider: job.atsProvider ?? null,
      })),
    },
    qualitySignals: {
      usedExpectedApiFastPath:
        target.expectedApiCapable === true ? jobs.some((job) => job.collectionMethod === 'api') : false,
      providerTaggedJobs:
        target.expectedProvider === null
          ? jobs.filter((job) => Boolean(job.providerKey)).length
          : jobs.filter((job) => job.providerKey === target.expectedProvider).length,
      typedSourceIntelligenceJobs: jobs.filter((job) => Boolean(job.sourceIntelligence)).length,
      jobsSkippedByLedger:
        run && typeof run.summary === 'object' && run.summary
          ? (run.summary as Record<string, unknown>).jobsSkippedByLedger ?? null
          : null,
      jobsSkippedByTitleTriage:
        run && typeof run.summary === 'object' && run.summary
          ? (run.summary as Record<string, unknown>).jobsSkippedByTitleTriage ?? null
          : null,
    },
  }
}

describe.sequential('013 live before/after benchmark harness', () => {
  const benchmarkTest = runLiveBenchmark ? test : test.skip

  benchmarkTest(
    `writes ${outputVariant} benchmark results`,
    { timeout: 0 },
    async () => {
      const envOverrides = loadEnvOverrides(repoRoot)
      const aiEnv = {
        ...envOverrides,
        ...process.env,
      }
      const aiClient = createJobFinderAiClientFromEnvironment(aiEnv)
      const fixture = await loadFixture()
      const results: Array<Record<string, unknown>> = []

      for (const target of benchmarkTargets) {
        const seed = buildSeed(fixture, target)
        const repository = createInMemoryJobFinderRepository(seed)
        const userDataDir = await mkdtemp(
          path.join(os.tmpdir(), `unemployed-013-benchmark-${outputVariant}-${target.id}-`),
        )
        const browserRuntime = createBrowserAgentRuntime({
          userDataDir,
          headless,
          chromeExecutablePath,
          jobExtractor: (input) => aiClient.extractJobsFromPage(input),
          aiClient,
        })
        const workspaceService = createJobFinderWorkspaceService({
          aiClient,
          browserRuntime,
          documentManager: noopDocumentManager,
          repository,
        })

        try {
          const sourceDebugRun = await runWithTimeout<SourceDebugBenchmarkRunResult>(
            `source debug ${target.id}`,
            240_000,
            (signal) =>
              workspaceService
                .runSourceDebug(target.id, signal)
                .then(async (snapshot) => {
                  const latestRun = snapshot.recentSourceDebugRuns[0] ?? null
                  const details = latestRun
                    ? await workspaceService.getSourceDebugRunDetails(latestRun.id)
                    : null
                  return {
                    snapshot: snapshot as unknown as Record<string, unknown>,
                    details: details as unknown as Record<string, unknown> | null,
                  }
                }),
          )

          const discoveryRun = await runWithTimeout(
            `discovery ${target.id}`,
            180_000,
            (signal) => workspaceService.runAgentDiscovery(undefined, signal, target.id),
          )

          results.push({
            variant: outputVariant,
            target,
            sourceDebug:
              'value' in sourceDebugRun
                ? summarizeSourceDebug(
                    target,
                    seed.searchPreferences as { targetRoles: string[] },
                    sourceDebugRun.value,
                    sourceDebugRun.wallClockMs,
                  )
                : {
                    targetId: target.id,
                    targetLabel: target.label,
                    wallClockMs: sourceDebugRun.wallClockMs,
                    error: sourceDebugRun.error,
                    timedOut: sourceDebugRun.timedOut,
                  },
            discovery:
              'value' in discoveryRun
                ? summarizeDiscovery(
                    target,
                    seed.searchPreferences as { targetRoles: string[] },
                    discoveryRun.value as unknown as Record<string, unknown>,
                    discoveryRun.wallClockMs,
                  )
                : {
                    targetId: target.id,
                    targetLabel: target.label,
                    wallClockMs: discoveryRun.wallClockMs,
                    error: discoveryRun.error,
                    timedOut: discoveryRun.timedOut,
                  },
          })
        } finally {
          await browserRuntime.closeSession('target_site').catch(() => undefined)
          await repository.close().catch(() => undefined)
          await rm(userDataDir, { recursive: true, force: true }).catch(() => undefined)
        }
      }

      const payload = {
        generatedAt: new Date().toISOString(),
        variant: outputVariant,
        headless,
        chromeExecutablePath,
        targets: benchmarkTargets,
        results,
      }

      await mkdir(outputDir, { recursive: true })
      await writeFile(
        path.join(outputDir, `${outputVariant}.json`),
        JSON.stringify(payload, null, 2),
        'utf8',
      )

      expect(results.length).toBe(benchmarkTargets.length)
      expect(results.some((entry) => {
        const sourceDebug = entry.sourceDebug as Record<string, unknown>
        const discovery = entry.discovery as Record<string, unknown>
        return !sourceDebug.error && !discovery.error
      })).toBe(true)
    },
  )
})
