import {
  ApplyExecutionResultSchema,
  DiscoveryRunResultSchema,
  type AgentDiscoveryProgress,
  type ApplyExecutionResult,
  type BrowserSessionState,
  type CandidateProfile,
  type DiscoveryRunResult,
  type JobFinderSettings,
  type JobPosting,
  type JobSearchPreferences,
  type JobSource,
  type ResumeExportArtifact,
  type SavedJob,
} from '@unemployed/contracts'

export interface CatalogSessionRuntimePrimitives {
  getSessionState(source: JobSource): BrowserSessionState
  listCatalogJobs(source: JobSource): readonly JobPosting[]
}

export interface CatalogSessionAgentDiscoveryOptions {
  searchPreferences: {
    targetRoles: string[]
    locations: string[]
  }
  targetJobCount: number
  startingUrls: string[]
  siteLabel: string
  skipSessionValidation?: boolean
  onProgress?: (progress: AgentDiscoveryProgress) => void
}

export interface CatalogSessionEasyApplyInput {
  job: SavedJob
  resumeExport: ResumeExportArtifact
  resumeFilePath: string
  profile: CandidateProfile
  settings: JobFinderSettings
  instructions?: readonly string[]
}

function normalizeText(value: string): string {
  return value
    .replace(/(^|[^\p{L}\p{N}])c\s*\+\s*\+(?=$|[^\p{L}\p{N}])/giu, '$1cplusplus')
    .replace(/(^|[^\p{L}\p{N}])c\s*#(?=$|[^\p{L}\p{N}])/giu, '$1csharp')
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function tokenize(value: string): string[] {
  return normalizeText(value).split(/\s+/).filter(Boolean)
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const knownCompensationPeriods = new Set([
  'yr',
  'year',
  'years',
  'annual',
  'annum',
  'mo',
  'month',
  'months',
  'wk',
  'week',
  'weeks',
  'day',
  'days',
  'hr',
  'hrs',
  'hour',
  'hours',
])

const annualCompensationMultipliers: Record<string, number> = {
  yr: 1,
  year: 1,
  years: 1,
  annual: 1,
  annum: 1,
  mo: 12,
  month: 12,
  months: 12,
  wk: 52,
  week: 52,
  weeks: 52,
  day: 260,
  days: 260,
  hr: 2080,
  hrs: 2080,
  hour: 2080,
  hours: 2080,
}

const salaryNumberPattern = /(\d[\d,]*(?:\.\d+)?)(?:\s*)([km])?/gi
const secondaryCompensationBeforePattern = /\b(bonus|commission|sign[- ]?on|equity|ote)\b/i
const secondaryCompensationAfterPattern = /^(?:[:-]\s*)?(bonus|commission|sign[- ]?on|equity|ote)\b/i

interface ParsedSalaryNumber {
  absoluteValue: number
  index: number
  length: number
}

function readPeriodUnit(salaryText: string, startIndex: number): string | null {
  const followingText = salaryText.slice(startIndex).trimStart().toLowerCase()

  if (!followingText.startsWith('/')) {
    return null
  }

  const periodUnit = followingText.match(/^\/\s*([a-z]+)/)?.[1] ?? ''
  return knownCompensationPeriods.has(periodUnit) ? periodUnit : null
}

function isCompactRangeSeparator(text: string): boolean {
  return /^\s*[-–—/]\s*$/.test(text)
}

function parseSalaryNumbers(salaryText: string): ParsedSalaryNumber[] {
  const matches = [...salaryText.matchAll(salaryNumberPattern)]

  if (matches.length === 0) {
    return []
  }

  return matches
    .map((match, index) => {
      const baseValue = parseFloat((match[1] ?? '').replaceAll(',', ''))
      const rawSuffix = (match[2] ?? '').toLowerCase()
      const currentIndex = match.index ?? 0
      const nextMatch = matches[index + 1]
      const nextIndex = nextMatch?.index ?? -1
      const betweenText = nextMatch
        ? salaryText.slice(currentIndex + match[0].length, nextIndex)
        : ''
      const inheritedSuffix =
        !rawSuffix && nextMatch?.[2] && isCompactRangeSeparator(betweenText)
          ? nextMatch[2].toLowerCase()
          : rawSuffix
      const periodUnit =
        readPeriodUnit(salaryText, currentIndex + match[0].length) ??
        (nextMatch && isCompactRangeSeparator(betweenText)
          ? readPeriodUnit(salaryText, (nextMatch.index ?? 0) + nextMatch[0].length)
          : null)
      const precedingText = salaryText
        .slice(Math.max(0, currentIndex - 24), currentIndex)
        .toLowerCase()
      const followingText = salaryText
        .slice(currentIndex + match[0].length)
        .trimStart()
        .toLowerCase()

      if (!Number.isFinite(baseValue) || baseValue <= 0) {
        return null
      }

      if (followingText.startsWith('%')) {
        return null
      }

      const trailingContext = followingText.slice(0, 24)
      const leadingContext = precedingText.trim().split(/\s+/).at(-1) ?? ''

      if (
        secondaryCompensationBeforePattern.test(leadingContext) ||
        secondaryCompensationAfterPattern.test(trailingContext)
      ) {
        return null
      }

      if (!inheritedSuffix && !periodUnit && baseValue < 1000) {
        return null
      }

      const scaledValue =
        inheritedSuffix === 'k'
          ? baseValue * 1000
          : inheritedSuffix === 'm'
            ? baseValue * 1_000_000
            : baseValue
      const annualizedValue = periodUnit
        ? scaledValue * (annualCompensationMultipliers[periodUnit] ?? 1)
        : scaledValue

      return {
        absoluteValue: annualizedValue,
        index: currentIndex,
        length: match[0].length,
      }
    })
    .filter((value): value is ParsedSalaryNumber => value !== null)
}

function matchesAnyPhrase(candidate: string, desiredValues: readonly string[]): boolean {
  if (desiredValues.length === 0) {
    return true
  }

  const normalizedCandidate = normalizeText(candidate)
  const candidateTokens = new Set(tokenize(candidate))

  return desiredValues.some((desiredValue) => {
    const normalizedDesired = normalizeText(desiredValue)
    if (!normalizedDesired) {
      return false
    }

    const desiredTokens = tokenize(desiredValue)
    if (desiredTokens.length === 0) {
      return false
    }

    if (desiredTokens.length === 1 && candidateTokens.has(normalizedDesired)) {
      return true
    }

    if (
      new RegExp(`(^|\\s)${escapeRegex(normalizedDesired)}($|\\s)`).test(
        normalizedCandidate,
      )
    ) {
      return true
    }

    return desiredTokens.every((token) => candidateTokens.has(token))
  })
}

function parseSalaryFloor(salaryText: string | null): number | null {
  if (!salaryText) {
    return null
  }

  const parsedNumbers = parseSalaryNumbers(salaryText).map(
    (entry) => entry.absoluteValue,
  )

  if (parsedNumbers.length === 0) {
    return null
  }

  return Math.min(...parsedNumbers)
}

function buildDiscoveryQuerySummary(searchPreferences: JobSearchPreferences): string {
  const roles = searchPreferences.targetRoles.join(', ') || 'all roles'
  const locations = searchPreferences.locations.join(', ') || 'all locations'
  const workModes = searchPreferences.workModes.join(', ') || 'all work modes'

  return `${roles} | ${locations} | ${workModes}`
}

function buildSessionBlockedResult(session: BrowserSessionState): Error {
  const detail = session.detail ? ` ${session.detail}` : ''
  return new Error(`Browser session is not ready for automation.${detail}`)
}

function filterCatalogDiscoveryJobs(
  jobs: readonly JobPosting[],
  searchPreferences: JobSearchPreferences,
): JobPosting[] {
  return jobs.filter((job) => {
    if (job.applyPath !== 'easy_apply' || !job.easyApplyEligible) {
      return false
    }

    if (
      searchPreferences.companyBlacklist.some(
        (company) => normalizeText(company) === normalizeText(job.company),
      )
    ) {
      return false
    }

    const matchesRole = matchesAnyPhrase(job.title, searchPreferences.targetRoles)
    const matchesLocation = matchesAnyPhrase(
      job.location,
      searchPreferences.locations,
    )
    const matchesWorkMode =
      searchPreferences.workModes.length === 0 ||
      searchPreferences.workModes.includes('flexible') ||
      job.workMode.some((mode) => searchPreferences.workModes.includes(mode))
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
}

function filterCatalogAgentDiscoveryJobs(
  jobs: readonly JobPosting[],
  options: CatalogSessionAgentDiscoveryOptions,
): JobPosting[] {
  return jobs
    .filter((job) => {
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
}

export function createCatalogSessionAgent(
  primitives: CatalogSessionRuntimePrimitives,
) {
  return {
    runDiscovery(
      source: JobSource,
      searchPreferences: JobSearchPreferences,
    ): Promise<DiscoveryRunResult> {
      const session = primitives.getSessionState(source)

      if (session.status !== 'ready') {
        throw buildSessionBlockedResult(session)
      }

      const startedAt = new Date().toISOString()
      const filteredJobs = filterCatalogDiscoveryJobs(
        primitives.listCatalogJobs(source),
        searchPreferences,
      )
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
    executeEasyApply(
      source: JobSource,
      input: CatalogSessionEasyApplyInput,
    ): Promise<ApplyExecutionResult> {
      const session = primitives.getSessionState(source)

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
    runAgentDiscovery(
      source: JobSource,
      options: CatalogSessionAgentDiscoveryOptions,
    ): Promise<DiscoveryRunResult> {
      const session = primitives.getSessionState(source)

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
      const filteredJobs = filterCatalogAgentDiscoveryJobs(
        primitives.listCatalogJobs(source),
        options,
      )

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
