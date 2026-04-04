import {
  ApplyExecutionResultSchema,
  BrowserSessionStateSchema,
  DiscoveryRunResultSchema,
  JobPostingSchema,
  type BrowserSessionState,
  type JobSource,
} from '@unemployed/contracts'
import type {
  BrowserSessionRuntime,
  CatalogBrowserSessionRuntimeSeed,
  StubBrowserSessionRuntimeSeed,
} from './runtime-types'
import {
  buildDiscoveryQuerySummary,
  buildSessionBlockedResult,
  cloneValue,
  matchesAnyPhrase,
  normalizeText,
  parseSalaryFloor,
} from './catalog-runtime-utils'

export function createCatalogBrowserSessionRuntime(
  seed: CatalogBrowserSessionRuntimeSeed,
): BrowserSessionRuntime {
  const initialSessions = new Map(
    seed.sessions.map((session) => [
      session.source,
      BrowserSessionStateSchema.parse(cloneValue(session)),
    ]),
  )
  const sessions = new Map(initialSessions)
  const catalog = JobPostingSchema.array().parse(cloneValue(seed.catalog))

  function getSession(source: JobSource): BrowserSessionState {
    const session = sessions.get(source)

    if (session) {
      return cloneValue(session)
    }

    return BrowserSessionStateSchema.parse({
      source,
      status: 'unknown',
      label: 'Session status unavailable',
      detail:
        'No browser runtime session has been configured for this source yet.',
      lastCheckedAt: new Date(0).toISOString(),
    })
  }

  return {
    getSessionState(source) {
      return Promise.resolve(getSession(source))
    },
    openSession(source) {
      const reopenedSession = cloneValue(
        initialSessions.get(source) ??
          BrowserSessionStateSchema.parse({
            source,
            status: 'unknown',
            driver: 'catalog_seed',
            label: 'Browser session unavailable',
            detail:
              'No browser runtime session has been configured for this source yet.',
            lastCheckedAt: new Date().toISOString(),
          }),
      )
      sessions.set(source, reopenedSession)
      return Promise.resolve(reopenedSession)
    },
    closeSession(source) {
      const closedState = BrowserSessionStateSchema.parse({
        source,
        status: 'unknown',
        driver: 'catalog_seed',
        label: 'Browser session closed',
        detail:
          'The browser session is closed. It will reopen when the next run starts.',
        lastCheckedAt: new Date().toISOString(),
      })
      sessions.set(source, closedState)
      return Promise.resolve(closedState)
    },
    runDiscovery(source, searchPreferences) {
      const session = getSession(source)

      if (session.status !== 'ready') {
        throw buildSessionBlockedResult(session)
      }

      const startedAt = new Date().toISOString()
      const filteredJobs = catalog.filter((job) => {
        if (job.source !== source) {
          return false
        }

        if (!job.easyApplyEligible || job.applyPath !== 'easy_apply') {
          return false
        }

        if (
          searchPreferences.companyBlacklist.some(
            (company) => normalizeText(company) === normalizeText(job.company),
          )
        ) {
          return false
        }

        const matchesRole = matchesAnyPhrase(
          job.title,
          searchPreferences.targetRoles,
        )
        const matchesLocation = matchesAnyPhrase(
          job.location,
          searchPreferences.locations,
        )
        const matchesWorkMode =
          searchPreferences.workModes.length === 0 ||
          searchPreferences.workModes.includes('flexible') ||
          job.workMode.some((mode) =>
            searchPreferences.workModes.includes(mode),
          )
        const salaryFloor = parseSalaryFloor(job.salaryText)
        const meetsSalaryExpectation =
          searchPreferences.minimumSalaryUsd === null ||
          salaryFloor === null ||
          salaryFloor >= searchPreferences.minimumSalaryUsd

        return (
          matchesRole &&
          matchesLocation &&
          matchesWorkMode &&
          meetsSalaryExpectation
        )
      })

      const completedAt = new Date().toISOString()

      return Promise.resolve(
        DiscoveryRunResultSchema.parse({
          source,
          startedAt,
          completedAt,
          querySummary: buildDiscoveryQuerySummary(searchPreferences),
          warning:
            filteredJobs.length === 0
              ? 'No supported listings matched the current preferences in the configured discovery target.'
              : null,
          jobs: filteredJobs,
        }),
      )
    },
    executeEasyApply(source, input) {
      const session = getSession(source)

      if (session.status !== 'ready') {
        throw buildSessionBlockedResult(session)
      }

      const now = new Date().toISOString()
      const { job, resumeExport, resumeFilePath } = input

      if (job.applyPath !== 'easy_apply' || !job.easyApplyEligible) {
        return Promise.resolve(
          ApplyExecutionResultSchema.parse({
            state: 'unsupported',
            summary: 'Easy Apply path is unsupported',
            detail: `${job.title} at ${job.company} no longer exposes a supported Easy Apply path for this slice.`,
            submittedAt: null,
            outcome: null,
            nextActionLabel: 'Inspect the listing manually',
            checkpoints: [
              {
                id: `checkpoint_${job.id}_unsupported`,
                at: now,
                label: 'Unsupported apply path',
                detail:
                  'The adapter stopped before entering an unsupported or external branch.',
                state: 'unsupported',
              },
            ],
          }),
        )
      }

      if (!resumeFilePath.trim()) {
        return Promise.resolve(
          ApplyExecutionResultSchema.parse({
            state: 'failed',
            summary: 'Approved resume export is missing',
            detail:
              'The apply flow cannot continue until an approved tailored resume export path is available.',
            submittedAt: null,
            outcome: null,
            nextActionLabel: 'Re-export and approve the tailored resume',
            checkpoints: [
              {
                id: `checkpoint_${job.id}_asset_missing`,
                at: now,
                label: 'Resume export missing',
                detail:
                  'The adapter refused to submit without an approved resume export file path.',
                state: 'failed',
              },
            ],
          }),
        )
      }

      const normalizedDescription = normalizeText(job.description)
      const requiresHumanPause =
        normalizedDescription.includes('portfolio') ||
        normalizedDescription.includes('work authorization') ||
        normalizedDescription.includes('visa sponsorship') ||
        normalizedDescription.includes('salary expectation')

      if (requiresHumanPause) {
        return Promise.resolve(
          ApplyExecutionResultSchema.parse({
            state: 'paused',
            summary: 'Easy Apply needs manual review',
            detail: `${job.company} asks for additional information that the safe automation path will not guess.`,
            submittedAt: null,
            outcome: null,
            nextActionLabel:
              'Open the application and finish the unsupported fields manually',
            checkpoints: [
              {
                id: `checkpoint_${job.id}_open_listing`,
                at: now,
                label: 'Opened Easy Apply',
                detail:
                  'The adapter validated the listing and started the Easy Apply flow.',
                state: 'in_progress',
              },
              {
                id: `checkpoint_${job.id}_manual_review`,
                at: now,
                label: 'Paused for manual review',
                detail:
                  'Unsupported questions were detected before submission.',
                state: 'paused',
              },
            ],
          }),
        )
      }

        return Promise.resolve(
          ApplyExecutionResultSchema.parse({
            state: 'submitted',
            summary: 'Easy Apply submitted',
            detail: `Submitted ${job.title} at ${job.company} with approved ${resumeExport.format.toUpperCase()} export ${resumeExport.id}.`,
            submittedAt: now,
            outcome: 'submitted',
            nextActionLabel: 'Monitor your inbox for recruiter follow-up',
          checkpoints: [
            {
              id: `checkpoint_${job.id}_open_listing`,
              at: now,
              label: 'Opened Easy Apply',
              detail:
                'The adapter opened the Easy Apply workflow from the selected listing.',
              state: 'in_progress',
            },
              {
                id: `checkpoint_${job.id}_resume_attached`,
                at: now,
                label: 'Attached tailored resume',
                detail: `Attached approved resume export from ${resumeFilePath}.`,
                state: 'in_progress',
              },
            {
              id: `checkpoint_${job.id}_submitted`,
              at: now,
              label: 'Submission confirmed',
              detail: 'The supported Easy Apply path completed successfully.',
              state: 'submitted',
            },
          ],
        }),
      )
    },
    runAgentDiscovery(source, options) {
      const session = getSession(source)

      if (!options.skipSessionValidation && session.status !== 'ready') {
        throw buildSessionBlockedResult(session)
      }

      options.onProgress?.({
        currentUrl: options.startingUrls[0] ?? 'about:blank',
        jobsFound: 0,
        stepCount: 1,
        currentAction: 'navigate',
        targetId: null,
        adapterKind: source,
      })

      const startedAt = new Date().toISOString()
      const filteredJobs = catalog
        .filter((job) => {
          if (job.source !== source) {
            return false
          }

          const matchesRole = matchesAnyPhrase(
            job.title,
            options.searchPreferences.targetRoles,
          )
          const matchesLocation = matchesAnyPhrase(
            job.location,
            options.searchPreferences.locations,
          )
          return matchesRole && matchesLocation
        })
        .slice(0, options.targetJobCount)

      options.onProgress?.({
        currentUrl: options.startingUrls[0] ?? 'about:blank',
        jobsFound: filteredJobs.length,
        stepCount: 2,
        currentAction: 'extract_jobs',
        targetId: null,
        adapterKind: source,
      })

      return Promise.resolve(
        DiscoveryRunResultSchema.parse({
          source,
          startedAt,
          completedAt: new Date().toISOString(),
          querySummary: `${options.searchPreferences.targetRoles.join(', ') || 'all roles'} | ${options.searchPreferences.locations.join(', ') || 'all locations'} | ${options.siteLabel}`,
          warning:
            filteredJobs.length === 0
              ? `No catalog jobs matched the current ${options.siteLabel} target.`
              : null,
          jobs: filteredJobs,
          agentMetadata: {
            steps: 2,
            incomplete: false,
            transcriptMessageCount: 0,
            reviewTranscript: [],
            compactionState: null,
            phaseCompletionMode: null,
            phaseCompletionReason: null,
            phaseEvidence: null,
            debugFindings: null,
          },
        }),
      )
    },
  }
}

export function createStubBrowserSessionRuntime(
  seed: StubBrowserSessionRuntimeSeed,
): BrowserSessionRuntime {
  return createCatalogBrowserSessionRuntime(seed)
}
