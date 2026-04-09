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

function buildProfileAnswerProvenance(input: {
  sourceKind:
    | 'profile'
    | 'proof_bank'
    | 'resume'
    | 'job'
    | 'prior_answer'
    | 'source_debug'
    | 'user'
  sourceId: string | null
  label: string
  snippet: string | null
}) {
  return {
    id: `answer_provenance_${input.sourceKind}_${input.sourceId ?? input.label}`,
    sourceKind: input.sourceKind,
    sourceId: input.sourceId,
    label: input.label,
    snippet: input.snippet,
  }
}

function matchesCustomAnswerPrompt(input: {
  prompt: string
  question: string
  label: string
}) {
  const promptTokens = new Set(tokenize(input.prompt))
  const candidateTokens = new Set(
    [...tokenize(input.question), ...tokenize(input.label)].filter(Boolean),
  )
  let sharedTokenCount = 0

  for (const token of candidateTokens) {
    if (promptTokens.has(token)) {
      sharedTokenCount += 1
    }
  }

  return sharedTokenCount >= 2
}

function buildCustomAnswerSuggestions(input: {
  profile: CandidateProfile
  prompt: string
  preferredKinds?: readonly string[]
  questionId: string
}) {
  const preferredKinds = new Set(input.preferredKinds ?? [])

  return input.profile.answerBank.customAnswers
    .filter((entry) =>
      preferredKinds.has(entry.kind) ||
      matchesCustomAnswerPrompt({
        prompt: input.prompt,
        question: entry.question,
        label: entry.label,
      }),
    )
    .map((entry, index) => ({
      id: `suggested_answer_${input.questionId}_custom_${index + 1}`,
      text: entry.answer,
      sourceKind: 'profile' as const,
      sourceId: entry.id,
      confidenceLabel: 'saved custom answer',
      provenance: [
        buildProfileAnswerProvenance({
          sourceKind: 'profile',
          sourceId: entry.id,
          label: entry.label,
          snippet: entry.answer,
        }),
      ],
    }))
}

function mergeSuggestedAnswers(
  values: ReadonlyArray<ApplyExecutionResult['questions'][number]['suggestedAnswers'][number]>,
) {
  const seen = new Set<string>()

  return values.flatMap((value) => {
    const key = normalizeText(value.text)

    if (!key || seen.has(key)) {
      return []
    }

    seen.add(key)
    return [value]
  })
}

function buildScreeningQuestions(input: {
  job: SavedJob
  profile: CandidateProfile
  now: string
}) {
  const normalizedDescription = normalizeText(input.job.description)
  const questions: ApplyExecutionResult['questions'] = []

  const pushQuestion = (question: ApplyExecutionResult['questions'][number]) => {
    questions.push(question)
  }

  if (
    normalizedDescription.includes('work authorization') ||
    normalizedDescription.includes('visa sponsorship')
  ) {
    const questionId = `question_${input.job.id}_work_auth`
    const prompt = 'Can you confirm your work authorization or visa sponsorship status?'
    const answerText =
      input.profile.answerBank.workAuthorization ??
      (input.profile.workEligibility.authorizedWorkCountries.length > 0
        ? `Authorized to work in ${input.profile.workEligibility.authorizedWorkCountries.join(', ')}.`
        : null)
    const sponsorshipText =
      input.profile.answerBank.visaSponsorship ??
      (input.profile.workEligibility.requiresVisaSponsorship === true
        ? 'Requires visa sponsorship.'
        : input.profile.workEligibility.requiresVisaSponsorship === false
          ? 'Does not require visa sponsorship.'
          : null)

    pushQuestion({
      id: questionId,
      prompt,
      kind: 'work_authorization',
      isRequired: true,
      detectedAt: input.now,
      answerOptions: [],
      suggestedAnswers: mergeSuggestedAnswers([
        ...[answerText, sponsorshipText]
          .filter((value): value is string => Boolean(value))
          .map((value, index) => ({
          id: `suggested_answer_${input.job.id}_work_auth_${index + 1}`,
          text: value,
          sourceKind: 'profile' as const,
          sourceId: input.profile.id,
          confidenceLabel: 'profile default',
          provenance: [
            buildProfileAnswerProvenance({
              sourceKind: 'profile',
              sourceId: input.profile.id,
              label: 'Profile work eligibility',
              snippet: value,
            }),
          ],
          })),
        ...buildCustomAnswerSuggestions({
          profile: input.profile,
          prompt,
          preferredKinds: ['work_authorization', 'visa_sponsorship'],
          questionId,
        }),
      ]),
      submittedAnswer: null,
      status: 'detected',
    })
  }

  if (normalizedDescription.includes('salary expectation')) {
    const questionId = `question_${input.job.id}_salary`
    const prompt = 'What are your salary expectations for this role?'
    const answerText = input.profile.answerBank.salaryExpectations

    pushQuestion({
      id: questionId,
      prompt,
      kind: 'salary_expectation',
      isRequired: true,
      detectedAt: input.now,
      answerOptions: [],
      suggestedAnswers: mergeSuggestedAnswers([
        ...(answerText
        ? [
            {
              id: `suggested_answer_${input.job.id}_salary`,
              text: answerText,
              sourceKind: 'profile' as const,
              sourceId: input.profile.id,
              confidenceLabel: 'profile default',
              provenance: [
                buildProfileAnswerProvenance({
                  sourceKind: 'profile',
                  sourceId: input.profile.id,
                  label: 'Profile salary expectations',
                  snippet: answerText,
                }),
              ],
            },
          ]
        : []),
        ...buildCustomAnswerSuggestions({
          profile: input.profile,
          prompt,
          preferredKinds: ['salary_expectation'],
          questionId,
        }),
      ]),
      submittedAnswer: null,
      status: 'detected',
    })
  }

  if (normalizedDescription.includes('portfolio')) {
    const questionId = `question_${input.job.id}_portfolio`
    const prompt = 'Please share a portfolio, case study, or public work sample.'
    const preferredLinkId = input.profile.applicationIdentity.preferredLinkIds[0] ?? null
    const preferredLink = preferredLinkId
      ? input.profile.links.find((link) => link.id === preferredLinkId) ?? null
      : input.profile.links.find((link) => link.kind === 'portfolio' || link.kind === 'case_study') ?? null
    const answerText = preferredLink?.url ?? input.profile.portfolioUrl ?? null

    pushQuestion({
      id: questionId,
      prompt,
      kind: 'portfolio',
      isRequired: true,
      detectedAt: input.now,
      answerOptions: [],
      suggestedAnswers: mergeSuggestedAnswers([
        ...(answerText
        ? [
            {
              id: `suggested_answer_${input.job.id}_portfolio`,
              text: answerText,
              sourceKind: 'profile' as const,
              sourceId: preferredLink?.id ?? input.profile.id,
              confidenceLabel: preferredLink ? 'preferred public link' : 'profile portfolio',
              provenance: [
                buildProfileAnswerProvenance({
                  sourceKind: 'profile',
                  sourceId: preferredLink?.id ?? input.profile.id,
                  label: preferredLink?.label ?? 'Portfolio link',
                  snippet: answerText,
                }),
              ],
            },
          ]
        : []),
        ...buildCustomAnswerSuggestions({
          profile: input.profile,
          prompt,
          preferredKinds: ['other'],
          questionId,
        }),
      ]),
      submittedAnswer: null,
      status: 'detected',
    })
  }

  if (normalizedDescription.includes('relocation')) {
    const questionId = `question_${input.job.id}_relocation`
    const prompt = 'Are you open to relocation for this role?'
    const answerText = input.profile.answerBank.relocation

    pushQuestion({
      id: questionId,
      prompt,
      kind: 'relocation',
      isRequired: true,
      detectedAt: input.now,
      answerOptions: [],
      suggestedAnswers: mergeSuggestedAnswers([
        ...(answerText
          ? [{
              id: `suggested_answer_${questionId}`,
              text: answerText,
              sourceKind: 'profile' as const,
              sourceId: input.profile.id,
              confidenceLabel: 'profile default',
              provenance: [buildProfileAnswerProvenance({ sourceKind: 'profile', sourceId: input.profile.id, label: 'Profile relocation answer', snippet: answerText })],
            }]
          : []),
        ...buildCustomAnswerSuggestions({ profile: input.profile, prompt, preferredKinds: ['relocation'], questionId }),
      ]),
      submittedAnswer: null,
      status: 'detected',
    })
  }

  if (normalizedDescription.includes('travel')) {
    const questionId = `question_${input.job.id}_travel`
    const prompt = 'Can you support the travel expectations for this role?'
    const answerText = input.profile.answerBank.travel

    pushQuestion({
      id: questionId,
      prompt,
      kind: 'travel',
      isRequired: true,
      detectedAt: input.now,
      answerOptions: [],
      suggestedAnswers: mergeSuggestedAnswers([
        ...(answerText
          ? [{
              id: `suggested_answer_${questionId}`,
              text: answerText,
              sourceKind: 'profile' as const,
              sourceId: input.profile.id,
              confidenceLabel: 'profile default',
              provenance: [buildProfileAnswerProvenance({ sourceKind: 'profile', sourceId: input.profile.id, label: 'Profile travel answer', snippet: answerText })],
            }]
          : []),
        ...buildCustomAnswerSuggestions({ profile: input.profile, prompt, preferredKinds: ['travel'], questionId }),
      ]),
      submittedAnswer: null,
      status: 'detected',
    })
  }

  if (
    normalizedDescription.includes('notice period') ||
    normalizedDescription.includes('start date') ||
    normalizedDescription.includes('availability')
  ) {
    const questionId = `question_${input.job.id}_availability`
    const prompt = 'What is your notice period and earliest available start date?'
    const answerText =
      input.profile.answerBank.noticePeriod ?? input.profile.answerBank.availability

    pushQuestion({
      id: questionId,
      prompt,
      kind: normalizedDescription.includes('notice period') ? 'notice_period' : 'availability',
      isRequired: true,
      detectedAt: input.now,
      answerOptions: [],
      suggestedAnswers: mergeSuggestedAnswers([
        ...(answerText
          ? [{
              id: `suggested_answer_${questionId}`,
              text: answerText,
              sourceKind: 'profile' as const,
              sourceId: input.profile.id,
              confidenceLabel: 'profile default',
              provenance: [buildProfileAnswerProvenance({ sourceKind: 'profile', sourceId: input.profile.id, label: 'Profile availability answer', snippet: answerText })],
            }]
          : []),
        ...buildCustomAnswerSuggestions({ profile: input.profile, prompt, preferredKinds: ['notice_period', 'availability'], questionId }),
      ]),
      submittedAnswer: null,
      status: 'detected',
    })
  }

  if (
    normalizedDescription.includes('introduce yourself') ||
    normalizedDescription.includes('about yourself')
  ) {
    const questionId = `question_${input.job.id}_intro`
    const prompt = 'Please introduce yourself briefly for this role.'
    const answerText = input.profile.answerBank.selfIntroduction

    pushQuestion({
      id: questionId,
      prompt,
      kind: 'other',
      isRequired: true,
      detectedAt: input.now,
      answerOptions: [],
      suggestedAnswers: mergeSuggestedAnswers([
        ...(answerText
          ? [{
              id: `suggested_answer_${questionId}`,
              text: answerText,
              sourceKind: 'profile' as const,
              sourceId: input.profile.id,
              confidenceLabel: 'profile default',
              provenance: [buildProfileAnswerProvenance({ sourceKind: 'profile', sourceId: input.profile.id, label: 'Profile self introduction', snippet: answerText })],
            }]
          : []),
        ...buildCustomAnswerSuggestions({ profile: input.profile, prompt, preferredKinds: ['self_intro'], questionId }),
      ]),
      submittedAnswer: null,
      status: 'detected',
    })
  }

  if (
    normalizedDescription.includes('why are you leaving') ||
    normalizedDescription.includes('career transition')
  ) {
    const questionId = `question_${input.job.id}_career_transition`
    const prompt = 'How would you explain your current transition or why you are exploring a new role?'
    const answerText = input.profile.answerBank.careerTransition

    pushQuestion({
      id: questionId,
      prompt,
      kind: 'other',
      isRequired: true,
      detectedAt: input.now,
      answerOptions: [],
      suggestedAnswers: mergeSuggestedAnswers([
        ...(answerText
          ? [{
              id: `suggested_answer_${questionId}`,
              text: answerText,
              sourceKind: 'profile' as const,
              sourceId: input.profile.id,
              confidenceLabel: 'profile default',
              provenance: [buildProfileAnswerProvenance({ sourceKind: 'profile', sourceId: input.profile.id, label: 'Profile career-transition answer', snippet: answerText })],
            }]
          : []),
        ...buildCustomAnswerSuggestions({ profile: input.profile, prompt, preferredKinds: ['career_transition'], questionId }),
      ]),
      submittedAnswer: null,
      status: 'detected',
    })
  }

  if (normalizedDescription.includes('email') || normalizedDescription.includes('phone')) {
    const questionId = `question_${input.job.id}_contact`
    const prompt = 'Which contact details should we use for this application?'
    const contactText = [
      input.profile.applicationIdentity.preferredEmail ?? input.profile.email,
      input.profile.applicationIdentity.preferredPhone ?? input.profile.phone,
    ]
      .filter((value): value is string => Boolean(value))
      .join(' | ')

    pushQuestion({
      id: questionId,
      prompt,
      kind: 'personal_info',
      isRequired: true,
      detectedAt: input.now,
      answerOptions: [],
      suggestedAnswers: mergeSuggestedAnswers([
        ...(contactText
          ? [{
              id: `suggested_answer_${questionId}`,
              text: contactText,
              sourceKind: 'profile' as const,
              sourceId: input.profile.id,
              confidenceLabel: 'application identity defaults',
              provenance: [buildProfileAnswerProvenance({ sourceKind: 'profile', sourceId: input.profile.id, label: 'Application contact defaults', snippet: contactText })],
            }]
          : []),
        ...buildCustomAnswerSuggestions({ profile: input.profile, prompt, questionId }),
      ]),
      submittedAnswer: null,
      status: 'detected',
    })
  }

  return questions
}

function buildApplyReplay(job: SavedJob) {
  const lastUrl = job.applicationUrl ?? job.canonicalUrl

  return {
    sourceInstructionArtifactId: null,
    sourceDebugEvidenceRefIds: [],
    lastUrl,
    checkpointUrls: lastUrl ? [lastUrl] : [],
  }
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
      const questions = buildScreeningQuestions({
        job,
        profile: input.profile,
        now,
      })
      const replay = buildApplyReplay(job)

      if (job.applyPath !== 'easy_apply' || !job.easyApplyEligible) {
        return Promise.resolve(
          ApplyExecutionResultSchema.parse({
            state: 'unsupported',
            summary: 'Easy Apply path is unsupported',
            detail: `${job.title} at ${job.company} no longer exposes a supported Easy Apply path for this slice.`,
            submittedAt: null,
            outcome: null,
            questions: [],
            blocker: {
              code: 'unsupported_apply_path',
              summary: 'The saved job no longer exposes a supported Easy Apply path.',
              detail:
                'The deterministic adapter stopped before entering an unsupported or external branch.',
              questionIds: [],
              sourceDebugEvidenceRefIds: [],
              url: job.applicationUrl ?? job.canonicalUrl,
            },
            consentDecisions: [],
            replay,
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
            questions: [],
            blocker: {
              code: 'missing_resume',
              summary: 'The approved tailored resume export is missing.',
              detail:
                'The adapter refused to submit without an approved resume export file path.',
              questionIds: [],
              sourceDebugEvidenceRefIds: [],
              url: job.applicationUrl ?? job.canonicalUrl,
            },
            consentDecisions: [],
            replay,
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
            questions,
            blocker: {
              code: 'requires_manual_review',
              summary: 'Extra application questions need manual review.',
              detail:
                'The deterministic adapter detected unsupported questions before submission.',
              questionIds: questions.map((question) => question.id),
              sourceDebugEvidenceRefIds: [],
              url: job.applicationUrl ?? job.canonicalUrl,
            },
            consentDecisions: [
              {
                id: `consent_${job.id}_resume_use`,
                kind: 'resume_use',
                label: 'Use the approved tailored resume for this apply flow',
                status: 'approved',
                decidedAt: now,
                detail: `Approved export ${resumeExport.id} stayed selected for this attempt.`,
              },
              {
                id: `consent_${job.id}_manual_follow_up`,
                kind: 'manual_follow_up',
                label: 'Finish unsupported answers manually',
                status: 'requested',
                decidedAt: null,
                detail: 'The remaining questions need a human answer before submission.',
              },
            ],
            replay,
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
            questions: [
              {
                id: `question_${job.id}_resume_upload`,
                prompt: 'Upload the approved tailored resume.',
                kind: 'resume',
                isRequired: true,
                detectedAt: now,
                answerOptions: [],
                suggestedAnswers: [
                  {
                    id: `suggested_answer_${job.id}_resume_upload`,
                    text: resumeFilePath,
                    sourceKind: 'resume' as const,
                    sourceId: resumeExport.id,
                    confidenceLabel: 'approved export',
                    provenance: [
                      buildProfileAnswerProvenance({
                        sourceKind: 'resume',
                        sourceId: resumeExport.id,
                        label: 'Approved tailored resume export',
                        snippet: resumeFilePath,
                      }),
                    ],
                  },
                ],
                submittedAnswer: resumeFilePath,
                status: 'submitted',
              },
            ],
            blocker: null,
            consentDecisions: [
              {
                id: `consent_${job.id}_resume_use`,
                kind: 'resume_use',
                label: 'Use the approved tailored resume for this apply flow',
                status: 'approved',
                decidedAt: now,
                detail: `Applied with approved export ${resumeExport.id}.`,
              },
              {
                id: `consent_${job.id}_autofill_profile`,
                kind: 'autofill_profile',
                label: 'Use saved profile details where the supported flow requests them',
                status: 'approved',
                decidedAt: now,
                detail: 'The supported path completed without extra manual questions.',
              },
            ],
            replay,
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
