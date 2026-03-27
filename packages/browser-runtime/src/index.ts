import {
  ApplyExecutionResultSchema,
  BrowserSessionStateSchema,
  DiscoveryRunResultSchema,
  JobPostingSchema,
  type AgentDiscoveryProgress,
  type ApplyExecutionResult,
  type BrowserSessionState,
  type CandidateProfile,
  type DiscoveryRunResult,
  type JobFinderSettings,
  type JobPosting,
  type JobSearchPreferences,
  type JobSource,
  type SavedJob,
  type TailoredAsset
} from '@unemployed/contracts'
import type { JobFinderAiClient } from '@unemployed/ai-providers'

function cloneValue<TValue>(value: TValue): TValue {
  return structuredClone(value)
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(/\s+/)
    .filter(Boolean)
}

function matchesAnyPhrase(candidate: string, desiredValues: readonly string[]): boolean {
  if (desiredValues.length === 0) {
    return true
  }

  const normalizedCandidate = normalizeText(candidate)
  const candidateTokens = new Set(tokenize(candidate))

  return desiredValues.some((desiredValue) => {
    const normalizedDesired = normalizeText(desiredValue)

    if (normalizedCandidate.includes(normalizedDesired)) {
      return true
    }

    return tokenize(desiredValue).every((token) => candidateTokens.has(token))
  })
}

function parseSalaryFloor(salaryText: string | null): number | null {
  if (!salaryText) {
    return null
  }

  const matches = [...salaryText.matchAll(/(\d[\d,]*)(?:\s*)(k|m)?/gi)]

  if (matches.length === 0) {
    return null
  }

  const parsedNumbers = matches
    .map((match) => {
      const baseValue = Number((match[1] ?? '').replaceAll(',', ''))
      const suffix = (match[2] ?? '').toLowerCase()

      if (!Number.isFinite(baseValue) || baseValue <= 0) {
        return null
      }

      if (suffix === 'k') {
        return baseValue * 1000
      }

      if (suffix === 'm') {
        return baseValue * 1_000_000
      }

      return baseValue
    })
    .filter((value): value is number => value !== null)

  if (parsedNumbers.length === 0) {
    return null
  }

  return Math.min(...parsedNumbers)
}

function buildSessionBlockedResult(session: BrowserSessionState): Error {
  const detail = session.detail ? ` ${session.detail}` : ''
  const sourceLabel = session.source === 'linkedin' ? 'LinkedIn session' : 'Browser session'
  return new Error(`${sourceLabel} is not ready for automation.${detail}`.trim())
}

function buildDiscoveryQuerySummary(searchPreferences: JobSearchPreferences): string {
  const roles = searchPreferences.targetRoles.join(', ') || 'all roles'
  const locations = searchPreferences.locations.join(', ') || 'all locations'
  const workModes = searchPreferences.workModes.join(', ') || 'all work modes'

  return `${roles} | ${locations} | ${workModes}`
}

export interface ExecuteEasyApplyInput {
  job: SavedJob
  asset: TailoredAsset
  profile: CandidateProfile
  settings: JobFinderSettings
}

export interface BrowserSessionRuntime {
  getSessionState(source: JobSource): Promise<BrowserSessionState>
  openSession(source: JobSource): Promise<BrowserSessionState>
  runDiscovery(source: JobSource, searchPreferences: JobSearchPreferences): Promise<DiscoveryRunResult>
  executeEasyApply(source: JobSource, input: ExecuteEasyApplyInput): Promise<ApplyExecutionResult>
  runAgentDiscovery?(source: JobSource, options: AgentDiscoveryOptions): Promise<DiscoveryRunResult>
}

export interface AgentDiscoveryOptions {
  userProfile: CandidateProfile
  searchPreferences: {
    targetRoles: string[]
    locations: string[]
  }
  targetJobCount: number
  maxSteps: number
  startingUrls: string[]
  siteLabel: string
  navigationHostnames: string[]
  siteInstructions?: string[]
  toolUsageNotes?: string[]
  relevantUrlSubstrings?: string[]
  experimental?: boolean
  aiClient?: JobFinderAiClient
  onProgress?: (progress: AgentDiscoveryProgress) => void
  signal?: AbortSignal
}

export interface CatalogBrowserSessionRuntimeSeed {
  sessions: BrowserSessionState[]
  catalog: JobPosting[]
}

export type StubBrowserSessionRuntimeSeed = CatalogBrowserSessionRuntimeSeed

export function createCatalogBrowserSessionRuntime(
  seed: CatalogBrowserSessionRuntimeSeed
): BrowserSessionRuntime {
  const sessions = new Map(
    seed.sessions.map((session) => [session.source, BrowserSessionStateSchema.parse(cloneValue(session))])
  )
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
      detail: 'No browser runtime session has been configured for this source yet.',
      lastCheckedAt: new Date(0).toISOString()
    })
  }

  return {
    getSessionState(source) {
      return Promise.resolve(getSession(source))
    },
    openSession(source) {
      return Promise.resolve(getSession(source))
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
            (company) => normalizeText(company) === normalizeText(job.company)
          )
        ) {
          return false
        }

        const matchesRole = matchesAnyPhrase(job.title, searchPreferences.targetRoles)
        const matchesLocation = matchesAnyPhrase(job.location, searchPreferences.locations)
        const matchesWorkMode =
          searchPreferences.workModes.length === 0 ||
          searchPreferences.workModes.includes('flexible') ||
          job.workMode.some((mode) => searchPreferences.workModes.includes(mode))
        const salaryFloor = parseSalaryFloor(job.salaryText)
        const meetsSalaryExpectation =
          searchPreferences.minimumSalaryUsd === null ||
          salaryFloor === null ||
          salaryFloor >= searchPreferences.minimumSalaryUsd

        return matchesRole && matchesLocation && matchesWorkMode && meetsSalaryExpectation
      })

      const completedAt = new Date().toISOString()

      return Promise.resolve(DiscoveryRunResultSchema.parse({
        source,
        startedAt,
        completedAt,
        querySummary: buildDiscoveryQuerySummary(searchPreferences),
        warning:
          filteredJobs.length === 0
            ? 'No Easy Apply listings matched the current preferences in the configured LinkedIn source adapter.'
            : null,
        jobs: filteredJobs
      }))
    },
    executeEasyApply(source, input) {
      const session = getSession(source)

      if (session.status !== 'ready') {
        throw buildSessionBlockedResult(session)
      }

      const now = new Date().toISOString()
      const { asset, job } = input

      if (job.applyPath !== 'easy_apply' || !job.easyApplyEligible) {
        return Promise.resolve(ApplyExecutionResultSchema.parse({
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
              detail: 'The adapter stopped before entering an unsupported or external branch.',
              state: 'unsupported'
            }
          ]
        }))
      }

      if (asset.status !== 'ready') {
        return Promise.resolve(ApplyExecutionResultSchema.parse({
          state: 'failed',
          summary: 'Tailored resume is not ready',
          detail: 'The apply flow cannot continue until a ready tailored resume is available.',
          submittedAt: null,
          outcome: null,
          nextActionLabel: 'Generate a tailored resume',
          checkpoints: [
            {
              id: `checkpoint_${job.id}_asset_missing`,
              at: now,
              label: 'Resume readiness failed',
              detail: 'The adapter refused to submit without a ready tailored asset.',
              state: 'failed'
            }
          ]
        }))
      }

      const normalizedDescription = normalizeText(job.description)
      const requiresHumanPause =
        normalizedDescription.includes('portfolio') ||
        normalizedDescription.includes('work authorization') ||
        normalizedDescription.includes('visa sponsorship') ||
        normalizedDescription.includes('salary expectation')

      if (requiresHumanPause) {
        return Promise.resolve(ApplyExecutionResultSchema.parse({
          state: 'paused',
          summary: 'Easy Apply needs manual review',
          detail: `${job.company} asks for additional information that the safe automation path will not guess.`,
          submittedAt: null,
          outcome: null,
          nextActionLabel: 'Open the application and finish the unsupported fields manually',
          checkpoints: [
            {
              id: `checkpoint_${job.id}_open_listing`,
              at: now,
              label: 'Opened Easy Apply',
              detail: 'The adapter validated the listing and started the Easy Apply flow.',
              state: 'in_progress'
            },
            {
              id: `checkpoint_${job.id}_manual_review`,
              at: now,
              label: 'Paused for manual review',
              detail: 'Unsupported questions were detected before submission.',
              state: 'paused'
            }
          ]
        }))
      }

      return Promise.resolve(ApplyExecutionResultSchema.parse({
        state: 'submitted',
        summary: 'Easy Apply submitted',
        detail: `Submitted ${job.title} at ${job.company} with ${asset.label.toLowerCase()} ${asset.version}.`,
        submittedAt: now,
        outcome: 'submitted',
        nextActionLabel: 'Monitor your inbox for recruiter follow-up',
        checkpoints: [
          {
            id: `checkpoint_${job.id}_open_listing`,
            at: now,
            label: 'Opened Easy Apply',
            detail: 'The adapter opened the Easy Apply workflow from the selected listing.',
            state: 'in_progress'
          },
          {
            id: `checkpoint_${job.id}_resume_attached`,
            at: now,
            label: 'Attached tailored resume',
            detail: `Attached ${asset.label.toLowerCase()} ${asset.version}.`,
            state: 'in_progress'
          },
          {
            id: `checkpoint_${job.id}_submitted`,
            at: now,
            label: 'Submission confirmed',
            detail: 'The supported Easy Apply path completed successfully.',
            state: 'submitted'
          }
        ]
      }))
    },
    async runAgentDiscovery(source, options) {
      const session = getSession(source)

      if (session.status !== 'ready') {
        throw buildSessionBlockedResult(session)
      }

      options.onProgress?.({
        currentUrl: options.startingUrls[0] ?? 'about:blank',
        jobsFound: 0,
        stepCount: 1,
        currentAction: 'navigate',
        targetId: null,
        adapterKind: source
      })

      const startedAt = new Date().toISOString()
      const filteredJobs = catalog.filter((job) => {
        if (job.source !== source) {
          return false
        }

        const matchesRole = matchesAnyPhrase(job.title, options.searchPreferences.targetRoles)
        const matchesLocation = matchesAnyPhrase(job.location, options.searchPreferences.locations)
        return matchesRole && matchesLocation
      }).slice(0, options.targetJobCount)

      options.onProgress?.({
        currentUrl: options.startingUrls[0] ?? 'about:blank',
        jobsFound: filteredJobs.length,
        stepCount: 2,
        currentAction: 'extract_jobs',
        targetId: null,
        adapterKind: source
      })

      return DiscoveryRunResultSchema.parse({
        source,
        startedAt,
        completedAt: new Date().toISOString(),
        querySummary: `${options.searchPreferences.targetRoles.join(', ') || 'all roles'} | ${options.searchPreferences.locations.join(', ') || 'all locations'} | ${options.siteLabel}`,
        warning: filteredJobs.length === 0 ? `No catalog jobs matched the current ${options.siteLabel} target.` : null,
        jobs: filteredJobs
      })
    }
  }
}

export function createStubBrowserSessionRuntime(
  seed: StubBrowserSessionRuntimeSeed
): BrowserSessionRuntime {
  return createCatalogBrowserSessionRuntime(seed)
}

export { createLinkedInBrowserAgentRuntime, type JobPageExtractor, type JobPageExtractionInput } from './playwright-linkedin-runtime'
