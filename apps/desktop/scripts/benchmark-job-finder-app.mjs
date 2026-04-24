import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const desktopDir = path.resolve(currentDir, '..')
const repoRoot = path.resolve(desktopDir, '..', '..')
const fixturePath = path.join(
  desktopDir,
  'test-fixtures',
  'job-finder',
  'profile-baseline-workspace.json',
)
const outputLabel = process.env.UI_CAPTURE_LABEL ?? 'job-finder-app-benchmark'
const outputDir = path.join(desktopDir, 'test-artifacts', 'ui', outputLabel)
const perScenarioTimeoutMs = Number.parseInt(
  process.env.JOB_FINDER_APP_BENCHMARK_TIMEOUT_MS ?? '900000',
  10,
)
const useCurrentWorkspace =
  process.argv.includes('--use-current-workspace') ||
  process.env.JOB_FINDER_APP_BENCHMARK_USE_CURRENT_WORKSPACE === '1'

const defaultBenchmarkTargetRoles = [
  'Engineer',
  'Developer',
  'Designer',
  'Product',
  'Manager',
  'Marketing',
  'Sales',
  'Data',
  'Analyst',
]

const benchmarkTargets = [
  {
    id: 'target_linkedin_default',
    label: 'LinkedIn',
    startingUrl: 'https://www.linkedin.com/jobs/search/',
    benchmarkTargetRoles: [...defaultBenchmarkTargetRoles],
  },
  {
    id: 'target_greenhouse_remote',
    label: 'Remote Greenhouse',
    startingUrl: 'https://job-boards.greenhouse.io/remote',
    benchmarkTargetRoles: [...defaultBenchmarkTargetRoles],
  },
  {
    id: 'target_lever_aircall',
    label: 'Aircall Lever',
    startingUrl: 'https://jobs.lever.co/aircall',
    benchmarkTargetRoles: [...defaultBenchmarkTargetRoles],
  },
  {
    id: 'target_kosovajob_home',
    label: 'Kosovajob',
    startingUrl: 'https://kosovajob.com/',
    benchmarkTargetRoles: [
      ...defaultBenchmarkTargetRoles,
      'Software',
      'Backend',
      'Frontend',
      'React',
      'QA',
      'Inxhinier',
      'Zhvillues',
      'Programer',
    ],
  },
]

function readCliOption(flag) {
  const index = process.argv.indexOf(flag)

  if (index === -1) {
    return null
  }

  return process.argv[index + 1] ?? null
}

function parseCsv(value) {
  return String(value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function pickTargets(ids, fallbackIds) {
  const effectiveIds = ids.length > 0 ? ids : fallbackIds
  return effectiveIds
    .map((id) => benchmarkTargets.find((target) => target.id === id) ?? null)
    .filter(Boolean)
}

function toCurrentWorkspaceTarget(target) {
  return {
    id: target.id,
    label: target.label,
    startingUrl: target.startingUrl,
    benchmarkTargetRoles: [...defaultBenchmarkTargetRoles],
  }
}

function getPreferredCurrentTargets(enabledTargets) {
  const byUrlSubstring = (substring) =>
    enabledTargets.find((target) =>
      String(target.startingUrl ?? '').toLowerCase().includes(substring),
    ) ?? null

  const preferred = [
    byUrlSubstring('linkedin.com'),
    byUrlSubstring('kosovajob.com'),
  ].filter(Boolean)
  const preferredIds = new Set(preferred.map((target) => target.id))
  const remaining = enabledTargets.filter((target) => !preferredIds.has(target.id))
  return [...preferred, ...remaining]
}

async function loadFixture() {
  return JSON.parse(await readFile(fixturePath, 'utf8'))
}

function buildSearchPreferences(baseSearchPreferences, targets, targetRoles) {
  return {
    ...baseSearchPreferences,
    targetRoles,
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
      targets: targets.map((target) => ({
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
      })),
    },
  }
}

function buildSettings(baseSettings) {
  return {
    ...baseSettings,
    keepSessionAlive: true,
    discoveryOnly: false,
  }
}

async function waitForProfileOrSetupHeading(window, timeout = 15000) {
  await Promise.any([
    window.getByRole('heading', { level: 1, name: 'Your profile' }).waitFor({ timeout }),
    window.getByRole('heading', { level: 1, name: 'Guided setup' }).waitFor({ timeout }),
  ])
}

async function seedWorkspace(window, input) {
  await window.evaluate(async ({ profile, searchPreferences, settings }) => {
    await window.unemployed.jobFinder.saveWorkspaceInputs({ profile, searchPreferences })
    await window.unemployed.jobFinder.saveSettings(settings)
    return window.unemployed.jobFinder.getWorkspace()
  }, input)
}

async function getWorkspace(window) {
  return window.evaluate(async () => window.unemployed.jobFinder.getWorkspace())
}

async function resetDiscoveryState(window) {
  const workspace = await getWorkspace(window)
  const resetState = {
    profile: workspace.profile,
    searchPreferences: workspace.searchPreferences,
    profileSetupState: workspace.profileSetupState,
    savedJobs: [],
    tailoredAssets: [],
    resumeDrafts: [],
    resumeDraftRevisions: [],
    resumeExportArtifacts: [],
    resumeResearchArtifacts: [],
    resumeValidationResults: [],
    resumeAssistantMessages: [],
    profileCopilotMessages: workspace.profileCopilotMessages ?? [],
    profileRevisions: workspace.profileRevisions ?? [],
    applyRuns: [],
    applyJobResults: [],
    applySubmitApprovals: [],
    applicationQuestionRecords: [],
    applicationAnswerRecords: [],
    applicationArtifactRefs: [],
    applicationReplayCheckpoints: [],
    applicationConsentRequests: [],
    applicationRecords: [],
    applicationAttempts: [],
    sourceDebugRuns: workspace.recentSourceDebugRuns ?? [],
    sourceDebugAttempts: [],
    sourceInstructionArtifacts: workspace.sourceInstructionArtifacts ?? [],
    sourceDebugEvidenceRefs: [],
    resumeImportRuns: workspace.resumeImportRuns ?? [],
    resumeImportDocumentBundles: workspace.resumeImportDocumentBundles ?? [],
    resumeImportFieldCandidates: workspace.resumeImportFieldCandidates ?? [],
    settings: workspace.settings,
    discovery: {
      sessions: workspace.discoverySessions ?? [],
      runState: 'idle',
      activeRun: null,
      recentRuns: [],
      activeSourceDebugRun: null,
      recentSourceDebugRuns: workspace.recentSourceDebugRuns ?? [],
      discoveryLedger: [],
      pendingDiscoveryJobs: [],
    },
  }

  await window.evaluate(async (state) => {
    if (!window.unemployed.jobFinder.test?.resetWorkspaceState) {
      throw new Error(
        'Current-workspace benchmark reset requires desktop test API support.',
      )
    }

    return window.unemployed.jobFinder.test.resetWorkspaceState(state)
  }, resetState)
}

async function withScopedCurrentWorkspaceTargets(window, targetIds, runner) {
  const scopedTargetIds = [...new Set(targetIds.filter(Boolean))]
  if (!useCurrentWorkspace || scopedTargetIds.length === 0) {
    return runner()
  }

  const originalWorkspace = await getWorkspace(window)
  const originalSearchPreferences = originalWorkspace?.searchPreferences
  const originalTargets = Array.isArray(originalSearchPreferences?.discovery?.targets)
    ? originalSearchPreferences.discovery.targets
    : []

  if (originalTargets.length === 0) {
    return runner()
  }

  const scopedTargets = originalTargets.map((target) => ({
    ...target,
    enabled: scopedTargetIds.includes(target.id),
  }))
  const needsScopeChange = scopedTargets.some(
    (target, index) => Boolean(target.enabled) !== Boolean(originalTargets[index]?.enabled),
  )

  if (!needsScopeChange) {
    return runner()
  }

  await window.evaluate(
    async ({ profile, searchPreferences }) =>
      window.unemployed.jobFinder.saveWorkspaceInputs({ profile, searchPreferences }),
    {
      profile: originalWorkspace.profile,
      searchPreferences: {
        ...originalSearchPreferences,
        discovery: {
          ...originalSearchPreferences.discovery,
          targets: scopedTargets,
        },
      },
    },
  )

  try {
    return await runner()
  } finally {
    await window
      .evaluate(
        async ({ profile, searchPreferences }) =>
          window.unemployed.jobFinder.saveWorkspaceInputs({ profile, searchPreferences }),
        {
          profile: originalWorkspace.profile,
          searchPreferences: originalSearchPreferences,
        },
      )
      .catch(() => undefined)
  }
}

async function resolveCurrentWorkspaceTargets(window, requestedSingleTargetIds, requestedRunAllTargetIds) {
  const workspace = await getWorkspace(window)
  const enabledTargets = Array.isArray(workspace?.searchPreferences?.discovery?.targets)
    ? workspace.searchPreferences.discovery.targets.filter((target) => target?.enabled)
    : []

  if (enabledTargets.length === 0) {
    throw new Error('The current workspace has no enabled discovery targets.')
  }

  const availableTargets = enabledTargets.map(toCurrentWorkspaceTarget)
  const preferredTargets = getPreferredCurrentTargets(availableTargets)
  const singleTargets =
    requestedSingleTargetIds.length > 0
      ? requestedSingleTargetIds.map((id) => {
          const match = availableTargets.find((target) => target.id === id)
          if (!match) {
            throw new Error(
              `Requested target '${id}' was not found in the current workspace. Available targets: ${availableTargets.map((target) => target.id).join(', ')}`,
            )
          }
          return match
        })
      : preferredTargets.slice(0, Math.min(2, preferredTargets.length))
  const runAllTargets =
    requestedRunAllTargetIds.length > 0
      ? requestedRunAllTargetIds.map((id) => {
          const match = availableTargets.find((target) => target.id === id)
          if (!match) {
            throw new Error(
              `Requested run-all target '${id}' was not found in the current workspace. Available targets: ${availableTargets.map((target) => target.id).join(', ')}`,
            )
          }
          return match
        })
      : availableTargets

  return {
    availableTargets,
    singleTargets,
    runAllTargets,
    workspace,
  }
}

async function withTimedScenario(label, runner) {
  const startedAt = Date.now()
  let timeoutHandle = null

  try {
    const value = await Promise.race([
      runner(),
      new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`${label} timed out after ${perScenarioTimeoutMs}ms`))
        }, perScenarioTimeoutMs)
      }),
    ])

    return {
      ok: true,
      wallClockMs: Date.now() - startedAt,
      error: null,
      value,
    }
  } catch (error) {
    return {
      ok: false,
      wallClockMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
      value: null,
    }
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle)
    }
  }
}

function buildSourceDebugSummary(result) {
  if (!result?.snapshot) {
    return null
  }

  const target = Array.isArray(result.snapshot?.searchPreferences?.discovery?.targets)
    ? result.snapshot.searchPreferences.discovery.targets[0] ?? null
    : null
  const latestRun = Array.isArray(result.snapshot?.recentSourceDebugRuns)
    ? result.snapshot.recentSourceDebugRuns[0] ?? null
    : null
  const details = result.details ?? null

  return {
    targetInstructionStatus: target?.instructionStatus ?? null,
    targetValidatedInstructionId: target?.validatedInstructionId ?? null,
    targetDraftInstructionId: target?.draftInstructionId ?? null,
    runState: latestRun?.state ?? null,
    finalSummary: latestRun?.finalSummary ?? null,
    manualPrerequisiteSummary: latestRun?.manualPrerequisiteSummary ?? null,
    runTiming: latestRun?.timing ?? null,
    attemptCount: Array.isArray(details?.attempts) ? details.attempts.length : null,
    phases: Array.isArray(details?.run?.phases) ? details.run.phases : latestRun?.phases ?? [],
    phaseSummaries: Array.isArray(details?.run?.phaseSummaries)
      ? details.run.phaseSummaries.map((summary) => ({
          phase: summary.phase,
          summary: summary.summary,
          completionMode: summary.completionMode,
          completionReason: summary.completionReason,
          timing: summary.timing ?? null,
        }))
      : [],
  }
}

function buildDiscoverySummary(snapshot) {
  if (!snapshot) {
    return null
  }

  const latestRun = Array.isArray(snapshot?.recentDiscoveryRuns)
    ? snapshot.recentDiscoveryRuns[0] ?? null
    : null

  return {
    runState: latestRun?.state ?? null,
    summary: latestRun?.summary ?? null,
    targetExecutions: Array.isArray(latestRun?.targetExecutions)
      ? latestRun.targetExecutions.map((execution) => ({
          targetId: execution.targetId,
          resolvedAdapterKind: execution.resolvedAdapterKind,
          collectionMethod: execution.collectionMethod,
          state: execution.state,
          jobsFound: execution.jobsFound,
          jobsPersisted: execution.jobsPersisted,
          jobsStaged: execution.jobsStaged,
          warning: execution.warning,
          timing: execution.timing ?? null,
        }))
      : [],
    keptJobs: Array.isArray(snapshot?.discoveryJobs)
      ? snapshot.discoveryJobs.map((job) => ({
          id: job.id,
          title: job.title,
          company: job.company,
          canonicalUrl: job.canonicalUrl,
          source: job.source,
          discoveryMethod: job.discoveryMethod,
        }))
      : [],
  }
}

async function runSingleScenario({
  scenario,
  targets,
  targetRoles,
  runner,
  seededInput,
  scopeCurrentWorkspaceTargets = false,
}) {
  const userDataDirectory = useCurrentWorkspace
    ? null
    : await mkdtemp(path.join(os.tmpdir(), 'unemployed-app-benchmark-'))
  const app = await electron.launch({
    args: ['.'],
    cwd: desktopDir,
    env: {
      ...process.env,
      ...(useCurrentWorkspace
        ? {
            UNEMPLOYED_ENABLE_TEST_API: '1',
            UNEMPLOYED_TEST_API_USE_LIVE_AI: '1',
          }
        : {}),
      ...(userDataDirectory ? { UNEMPLOYED_USER_DATA_DIR: userDataDirectory } : {}),
    },
  })

  try {
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    await waitForProfileOrSetupHeading(window)
    if (seededInput) {
      await seedWorkspace(window, {
        profile: seededInput.profile,
        searchPreferences: seededInput.searchPreferences,
        settings: seededInput.settings,
      })
    } else {
      await resetDiscoveryState(window)
    }

    const timed = await withTimedScenario(scenario, () =>
      scopeCurrentWorkspaceTargets
        ? withScopedCurrentWorkspaceTargets(
            window,
            targets.map((target) => target.id),
            () => runner(window),
          )
        : runner(window),
    )
    const snapshot = timed.value?.snapshot ?? timed.value ?? null
    const effectiveTargetRoles = Array.isArray(snapshot?.searchPreferences?.targetRoles)
      ? snapshot.searchPreferences.targetRoles
      : targetRoles
    return {
      scenario,
      targets: targets.map((target) => ({
        id: target.id,
        label: target.label,
        startingUrl: target.startingUrl,
      })),
      targetRoles: effectiveTargetRoles,
      wallClockMs: timed.wallClockMs,
      ok: timed.ok,
      error: timed.error,
      result: timed.value,
    }
  } finally {
    await app.close().catch(() => undefined)
    if (userDataDirectory) {
      await rm(userDataDirectory, { recursive: true, force: true }).catch(() => undefined)
    }
  }
}

async function runSourceDebugScenario(target) {
  const fixture = await loadFixture()
  return runSingleScenario({
    scenario: `check_source:${target.id}`,
    targets: [target],
    targetRoles: [...target.benchmarkTargetRoles],
    seededInput: useCurrentWorkspace
      ? null
      : {
          profile: fixture.profile,
          searchPreferences: buildSearchPreferences(
            fixture.searchPreferences,
            [target],
            [...target.benchmarkTargetRoles],
          ),
          settings: buildSettings(fixture.settings),
        },
    runner: async (window) => {
      const snapshot = await window.evaluate(
        async (targetId) => window.unemployed.jobFinder.runSourceDebug(targetId),
        target.id,
      )
      const latestRunId = snapshot?.recentSourceDebugRuns?.[0]?.id ?? null
      const details = latestRunId
        ? await window.evaluate(
            async (runId) => window.unemployed.jobFinder.getSourceDebugRunDetails(runId),
            latestRunId,
          )
        : null

      return {
        snapshot,
        details,
      }
    },
  })
}

async function runSingleTargetDiscoveryScenario(target) {
  const fixture = await loadFixture()
  return runSingleScenario({
    scenario: `search_now:${target.id}`,
    targets: [target],
    targetRoles: [...target.benchmarkTargetRoles],
    seededInput: useCurrentWorkspace
      ? null
      : {
          profile: fixture.profile,
          searchPreferences: buildSearchPreferences(
            fixture.searchPreferences,
            [target],
            [...target.benchmarkTargetRoles],
          ),
          settings: buildSettings(fixture.settings),
        },
    runner: async (window) =>
      window.evaluate(
        async (targetId) => window.unemployed.jobFinder.runAgentDiscovery(undefined, targetId),
        target.id,
      ),
  })
}

async function runRunAllScenario(targets) {
  const targetRoles = [...new Set(targets.flatMap((target) => target.benchmarkTargetRoles))]
  const fixture = await loadFixture()
  return runSingleScenario({
    scenario: 'search_jobs:run_all',
    targets,
    targetRoles,
    seededInput: useCurrentWorkspace
      ? null
      : {
          profile: fixture.profile,
          searchPreferences: buildSearchPreferences(
            fixture.searchPreferences,
            targets,
            targetRoles,
          ),
          settings: buildSettings(fixture.settings),
        },
    runner: async (window) => window.evaluate(async () => window.unemployed.jobFinder.runAgentDiscovery()),
    scopeCurrentWorkspaceTargets: true,
  })
}

function printScenarioSummary(entry) {
  const durationSeconds = (entry.wallClockMs / 1000).toFixed(1)
  process.stdout.write(`\n[${entry.scenario}] ${entry.ok ? 'ok' : 'failed'} in ${durationSeconds}s\n`)
  if (entry.error) {
    process.stdout.write(`error: ${entry.error}\n`)
    return
  }

  if (entry.scenario.startsWith('check_source:')) {
    const summary = buildSourceDebugSummary(entry.result)
    process.stdout.write(
      `runState: ${summary?.runState ?? 'unknown'} | instructionStatus: ${summary?.targetInstructionStatus ?? 'unknown'} | attempts: ${summary?.attemptCount ?? 'n/a'}\n`,
    )
    process.stdout.write(`finalSummary: ${summary?.finalSummary ?? 'none'}\n`)
    return
  }

  const summary = buildDiscoverySummary(entry.result)
  process.stdout.write(
    `runState: ${summary?.runState ?? 'unknown'} | validJobsFound: ${summary?.summary?.validJobsFound ?? 'n/a'} | jobsPersisted: ${summary?.summary?.jobsPersisted ?? 'n/a'} | jobsStaged: ${summary?.summary?.jobsStaged ?? 'n/a'}\n`,
  )
}

async function main() {
  const requestedSingleTargetIds = parseCsv(
    readCliOption('--targets') ?? process.env.BENCHMARK_TARGET_IDS,
  )
  const requestedRunAllTargetIds = parseCsv(
    readCliOption('--run-all-targets') ?? process.env.BENCHMARK_RUN_ALL_TARGET_IDS,
  )
  let singleTargets = pickTargets(requestedSingleTargetIds, [
    'target_linkedin_default',
    'target_kosovajob_home',
  ])
  let runAllTargets = pickTargets(requestedRunAllTargetIds, [
    'target_linkedin_default',
    'target_greenhouse_remote',
    'target_lever_aircall',
    'target_kosovajob_home',
  ])

  if (!useCurrentWorkspace && singleTargets.length === 0) {
    throw new Error('No benchmark targets were selected.')
  }

  await mkdir(outputDir, { recursive: true })
  const results = []

  if (useCurrentWorkspace) {
    const bootstrapApp = await electron.launch({
      args: ['.'],
      cwd: desktopDir,
      env: {
        ...process.env,
        UNEMPLOYED_ENABLE_TEST_API: '1',
        UNEMPLOYED_TEST_API_USE_LIVE_AI: '1',
      },
    })

    try {
      const window = await bootstrapApp.firstWindow()
      await window.waitForLoadState('domcontentloaded')
      await waitForProfileOrSetupHeading(window)
      const resolved = await resolveCurrentWorkspaceTargets(
        window,
        requestedSingleTargetIds,
        requestedRunAllTargetIds,
      )
      singleTargets = resolved.singleTargets
      runAllTargets = resolved.runAllTargets
      process.stdout.write(
        `Using current workspace targets: ${resolved.availableTargets.map((target) => `${target.id} (${target.label})`).join(', ')}\n`,
      )
      process.stdout.write(
        `Single-target scenarios: ${singleTargets.map((target) => target.id).join(', ')}\n`,
      )
      process.stdout.write(
        `Run-all scenarios will use enabled targets: ${runAllTargets.map((target) => target.id).join(', ')}\n`,
      )
    } finally {
      await bootstrapApp.close().catch(() => undefined)
    }
  }

  for (const target of singleTargets) {
    const sourceDebugResult = await runSourceDebugScenario(target)
    printScenarioSummary(sourceDebugResult)
    results.push({
      ...sourceDebugResult,
      sourceDebug: buildSourceDebugSummary(sourceDebugResult.result),
    })

    const discoveryResult = await runSingleTargetDiscoveryScenario(target)
    printScenarioSummary(discoveryResult)
    results.push({
      ...discoveryResult,
      discovery: buildDiscoverySummary(discoveryResult.result),
    })
  }

  if (runAllTargets.length > 0) {
    const runAllResult = await runRunAllScenario(runAllTargets)
    printScenarioSummary(runAllResult)
    results.push({
      ...runAllResult,
      discovery: buildDiscoverySummary(runAllResult.result),
    })
  }

  const report = {
    generatedAt: new Date().toISOString(),
    invocation: 'electron_preload_bridge',
    notes: [
      'These benchmarks run through the desktop Electron app and preload bridge, not the older service-only 013 harness.',
      'Desktop test API is intentionally not enabled here so the configured live AI/runtime path remains active.',
      ...(useCurrentWorkspace
        ? ['This run reused the current persisted workspace and browser profile instead of a seeded temporary workspace.']
        : ['This run used a seeded temporary workspace for isolation.']),
    ],
    useCurrentWorkspace,
    browserAgentEnabled: process.env.UNEMPLOYED_BROWSER_AGENT ?? '(default=true)',
    browserHeadless: process.env.UNEMPLOYED_BROWSER_HEADLESS ?? '(default=false)',
    outputLabel,
    results,
  }
  const reportPath = path.join(outputDir, 'job-finder-app-benchmark-report.json')
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  process.stdout.write(`\nSaved app benchmark report to ${reportPath}\n`)
}

void main()
