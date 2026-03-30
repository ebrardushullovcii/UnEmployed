import type {
  JobFinderAiClient,
  ResumeProfileExtraction,
  TailoredResumeDraft
} from '@unemployed/ai-providers'
import type { BrowserSessionRuntime } from '@unemployed/browser-runtime'
import {
  ApplicationAttemptSchema,
  ApplicationRecordSchema,
  CandidateProfileSchema,
  DiscoveryActivityEventSchema,
  DiscoveryRunRecordSchema,
  JobDiscoveryTargetSchema,
  DiscoveryTargetExecutionSchema,
  JobFinderDiscoveryStateSchema,
  JobFinderSettingsSchema,
  JobFinderWorkspaceSnapshotSchema,
  JobSourceAdapterKindSchema,
  SavedJobDiscoveryProvenanceSchema,
  JobSearchPreferencesSchema,
  SavedJobSchema,
  SourceDebugCompactionStateSchema,
  SourceDebugPhaseSummarySchema,
  SourceDebugRunDetailsSchema,
  SourceDebugRunRecordSchema,
  SourceDebugWorkerAttemptSchema,
  SourceDebugEvidenceRefSchema,
  SourceInstructionArtifactSchema,
  SourceInstructionVerificationSchema,
  TailoredAssetSchema,
  type ApplicationAttempt,
  type ApplicationEvent,
  type ApplicationRecord,
  type ApplicationStatus,
  type AssetStatus,
  type CandidateProfile,
  type DiscoveryActivityEvent,
  type DiscoveryRunRecord,
  type DiscoveryRunState,
  type DiscoveryTargetExecution,
  type JobFinderSettings,
  type JobFinderDiscoveryState,
  type JobFinderWorkspaceSnapshot,
  type JobSource,
  type JobSearchPreferences,
  type JobPosting,
  type JobDiscoveryTarget,
  type SourceDebugPhase,
  type SourceDebugCompactionState,
  type SourceDebugPhaseCompletionMode,
  type SourceDebugPhaseEvidence,
  type SourceDebugPhaseSummary,
  type SourceDebugRunRecord,
  type SourceDebugRunDetails,
  type SourceDebugWorkerAttempt,
  type SourceInstructionArtifact,
  type MatchAssessment,
  type ResumeTemplateDefinition,
  type ReviewQueueItem,
  type SavedJobDiscoveryProvenance,
  type SavedJob,
  type TailoredAsset
} from '@unemployed/contracts'
import type { JobFinderRepository, JobFinderRepositorySeed } from '@unemployed/db'
import { runSequentialArtifactOrchestrator } from './orchestrator'

const reviewableStatuses = new Set<ApplicationStatus>(['drafting', 'ready_for_review', 'approved'])

const discoveryVisibleStatuses = new Set<ApplicationStatus>([
  'discovered',
  'shortlisted',
  'drafting',
  'ready_for_review',
  'approved'
])

const assetStatusPriority: Record<AssetStatus, number> = {
  ready: 0,
  generating: 1,
  queued: 2,
  failed: 3,
  not_started: 4
}

// Profile placeholder strings - must stay in sync with UI defaults
// These are set when no resume has been imported yet
export const PROFILE_PLACEHOLDER_HEADLINE = 'Import your resume to begin'
export const PROFILE_PLACEHOLDER_LOCATION = 'Set your preferred location'

// Agent discovery defaults
export const DEFAULT_ROLE = 'software engineer'
export const DEFAULT_TARGET_JOB_COUNT = 20
export const DEFAULT_MAX_STEPS = 50
export const DEFAULT_MAX_TARGET_ROLES = 4
export const DEFAULT_DISCOVERY_HISTORY_LIMIT = 5
const LEGACY_DEFAULT_TARGET_STARTING_URL = 'https://www.linkedin.com/jobs/search/'
export const SOURCE_DEBUG_PROMPT_PROFILE_VERSION = 'source-debug-v1'
export const SOURCE_DEBUG_TOOLSET_VERSION = 'browser-tools-v1'
export const SOURCE_DEBUG_APP_SCHEMA_VERSION = 'job-finder-source-debug-v1'
export const SOURCE_DEBUG_RECENT_HISTORY_LIMIT = 5
const LEGACY_DEFAULT_TARGET_ID = 'target_linkedin_default'
const LEGACY_DEFAULT_TARGET_LABEL = 'LinkedIn Jobs'
const GENERIC_DEFAULT_TARGET_LABEL = 'Primary target'
export const SOURCE_DEBUG_PHASES: SourceDebugPhase[] = [
  'access_auth_probe',
  'site_structure_mapping',
  'search_filter_probe',
  'job_detail_validation',
  'apply_path_validation',
  'replay_verification'
]

interface ResolvedDiscoveryAdapter {
  kind: JobSource
  label: string
  experimental: boolean
  siteInstructions: string[]
  toolUsageNotes: string[]
  relevantUrlSubstrings: string[]
}

interface MergeDiscoveryResult {
  mergedJobs: SavedJob[]
  newJobs: SavedJob[]
  validatedCount: number
  duplicatesMerged: number
  invalidSkipped: number
}

interface SourceInstructionQualityAssessment {
  highSignalNavigationOrSearch: string[]
  highSignalDetailOrApply: string[]
  qualifiesForValidation: boolean
  qualityWarnings: string[]
}

interface SourceInstructionReviewOverride {
  navigationGuidance: string[]
  searchGuidance: string[]
  detailGuidance: string[]
  applyGuidance: string[]
  warnings: string[]
}

interface SourceInstructionFinalReviewPhaseContext {
  phase: SourceDebugPhase
  startedAt: string
  completedAt: string | null
  outcome: SourceDebugWorkerAttempt['outcome']
  completionMode: SourceDebugPhaseCompletionMode
  completionReason: string | null
  resultSummary: string
  blockerSummary: string | null
  confirmedFacts: string[]
  attemptedActions: string[]
  phaseEvidence: SourceDebugPhaseEvidence | null
  compactionState: SourceDebugCompactionState | null
  reviewTranscript: string[]
}

const discoveryAdapters: Record<JobSource, ResolvedDiscoveryAdapter> = {
  target_site: {
    kind: 'target_site',
    label: 'Target site',
    experimental: false,
    siteInstructions: [
      'Stay within the configured hostname and do not roam to third-party domains unless the target explicitly hands off to a first-party jobs surface.',
      'Prefer repeatable job-list routes, canonical detail pages, and visible search or filter controls over one-off landing-page promos.',
      'Use visible controls before handcrafted URL parameters when the interface already exposes a reusable search path.',
      'Keep the result set small and high confidence when the page structure is unstable or identity signals are weak.'
    ],
    toolUsageNotes: [
      'Use navigation sparingly and stay bounded to the configured hostname.',
      'Favor explicit careers, jobs, openings, positions, or hiring routes when they exist.',
      'Test obvious visible search boxes, chips, dropdowns, and top-level filters before concluding the site has no reusable controls.',
      'Skip saving low-confidence results that do not expose a stable job identity.'
    ],
    relevantUrlSubstrings: [
      '/job',
      '/jobs',
      '/career',
      '/careers',
      '/opening',
      '/openings',
      '/position',
      '/positions',
      '/vacancy',
      '/vacancies',
      '/konkurs',
      '/pune',
      '/pozit',
      '/karriere',
      '/apliko'
    ]
  }
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(/\s+/)
    .filter(Boolean)
}

function uniqueStrings(values: readonly string[]): string[] {
  const seen = new Set<string>()

  return values.flatMap((value) => {
    const trimmedValue = value.trim()

    if (!trimmedValue) {
      return []
    }

    const key = trimmedValue.toLowerCase()

    if (seen.has(key)) {
      return []
    }

    seen.add(key)
    return [trimmedValue]
  })
}

function enrichSearchPreferencesFromProfile(
  searchPreferences: JobSearchPreferences,
  profile: CandidateProfile
): JobSearchPreferences {
  const targetRoles = [...searchPreferences.targetRoles]

  if (targetRoles.length === 0) {
    if (profile.headline && profile.headline !== PROFILE_PLACEHOLDER_HEADLINE) {
      targetRoles.push(profile.headline)
    }

    for (const role of profile.targetRoles) {
      if (targetRoles.length < DEFAULT_MAX_TARGET_ROLES) {
        targetRoles.push(role)
      }
    }
  }

  const locations = [...searchPreferences.locations]

  if (locations.length === 0 && profile.currentLocation && profile.currentLocation !== PROFILE_PLACEHOLDER_LOCATION) {
    locations.push(profile.currentLocation)
  }

  if (targetRoles.length === 0 && locations.length === 0) {
    return searchPreferences
  }

  return {
    ...searchPreferences,
    targetRoles: uniqueStrings(targetRoles),
    locations: uniqueStrings(locations)
  }
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function parseSalaryFloor(salaryText: string | null): number | null {
  if (!salaryText) {
    return null
  }

  const matches = [...salaryText.matchAll(/(\d[\d,]*)(?:\s*)(k|m)?/gi)]

  if (matches.length === 0) {
    return null
  }

  const parsed = matches
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

  if (parsed.length === 0) {
    return null
  }

  return Math.min(...parsed)
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

function toSavedJobId(posting: JobPosting): string {
  return `job_${posting.source}_${posting.sourceJobId}`
}

function buildReviewQueue(
  savedJobs: readonly SavedJob[],
  tailoredAssets: readonly TailoredAsset[]
): ReviewQueueItem[] {
  const assetsByJobId = new Map(tailoredAssets.map((asset) => [asset.jobId, asset]))

  return savedJobs
    .filter((job) => reviewableStatuses.has(job.status))
    .map<ReviewQueueItem>((job) => {
      const asset = assetsByJobId.get(job.id) ?? null

      return {
        jobId: job.id,
        title: job.title,
        company: job.company,
        location: job.location,
        matchScore: job.matchAssessment.score,
        applicationStatus: job.status,
        assetStatus: asset?.status ?? 'not_started',
        progressPercent: asset?.progressPercent ?? null,
        resumeAssetId: asset?.id ?? null,
        updatedAt: asset?.updatedAt ?? job.discoveredAt
      }
    })
    .sort((left, right) => {
      const assetDelta = assetStatusPriority[left.assetStatus] - assetStatusPriority[right.assetStatus]

      if (assetDelta !== 0) {
        return assetDelta
      }

      return right.matchScore - left.matchScore
    })
}

function buildDiscoveryJobs(savedJobs: readonly SavedJob[]): SavedJob[] {
  return [...savedJobs]
    .filter((job) => discoveryVisibleStatuses.has(job.status))
    .sort((left, right) => right.matchAssessment.score - left.matchAssessment.score)
}

function buildApplicationRecords(
  savedApplicationRecords: readonly ApplicationRecord[]
): ApplicationRecord[] {
  return [...savedApplicationRecords].sort(
    (left, right) => new Date(right.lastUpdatedAt).getTime() - new Date(left.lastUpdatedAt).getTime()
  )
}

function createMatchAssessment(
  profile: CandidateProfile,
  searchPreferences: JobSearchPreferences,
  posting: JobPosting
): MatchAssessment {
  let score = 48
  const reasons: string[] = []
  const gaps: string[] = []

  const matchesRole = matchesAnyPhrase(posting.title, searchPreferences.targetRoles)
  const matchesLocation = matchesAnyPhrase(posting.location, searchPreferences.locations)
  const matchesWorkMode =
    searchPreferences.workModes.length === 0 ||
    searchPreferences.workModes.includes('flexible') ||
    posting.workMode.some((mode) => searchPreferences.workModes.includes(mode))
  const salaryFloor = parseSalaryFloor(posting.salaryText)
  const meetsSalaryExpectation =
    searchPreferences.minimumSalaryUsd === null ||
    salaryFloor === null ||
    salaryFloor >= searchPreferences.minimumSalaryUsd
  const isPreferredCompany = searchPreferences.companyWhitelist.some(
    (company) => normalizeText(company) === normalizeText(posting.company)
  )
  const profileSkills = new Set(profile.skills.map((skill) => normalizeText(skill)))
  const overlappingSkills = posting.keySkills.filter((skill) => profileSkills.has(normalizeText(skill)))

  if (matchesRole) {
    score += 16
    reasons.push('Role title aligns closely with the current target roles.')
  } else {
    gaps.push('Role title is adjacent to the target list but not an exact fit.')
  }

  if (matchesLocation) {
    score += 10
    reasons.push('Location fits the saved search preferences.')
  } else {
    gaps.push('Location falls outside the preferred search areas.')
  }

  if (matchesWorkMode) {
    score += 8
    reasons.push('Work mode matches the preferred operating model.')
  } else {
    gaps.push('Work mode does not match the saved remote or hybrid preferences.')
  }

  if (meetsSalaryExpectation) {
    score += 6
  } else {
    gaps.push('Compensation looks below the saved salary target.')
  }

  if (isPreferredCompany) {
    score += 8
    reasons.push('Company appears in the current preferred-company list.')
  }

  if (overlappingSkills.length > 0) {
    score += Math.min(12, overlappingSkills.length * 4)
    reasons.push(`Skill overlap includes ${overlappingSkills.slice(0, 2).join(' and ')}.`)
  } else {
    gaps.push('The listing emphasizes skills that are not yet prominent in the current profile.')
  }

  if (posting.easyApplyEligible) {
    score += 6
    reasons.push('Easy Apply is available for the listing, keeping the flow in scope.')
  }

  return {
    score: clampScore(score),
    reasons: reasons.slice(0, 3),
    gaps: gaps.slice(0, 3)
  }
}

async function createMatchAssessmentAsync(
  aiClient: JobFinderAiClient,
  profile: CandidateProfile,
  searchPreferences: JobSearchPreferences,
  posting: JobPosting
): Promise<MatchAssessment> {
  const fallbackAssessment = createMatchAssessment(profile, searchPreferences, posting)
  const assistedAssessment = await aiClient.assessJobFit({
    profile,
    searchPreferences,
    job: posting
  })

  if (!assistedAssessment) {
    return fallbackAssessment
  }

  return {
    score: clampScore(assistedAssessment.score),
    reasons: assistedAssessment.reasons.slice(0, 3),
    gaps: assistedAssessment.gaps.slice(0, 3)
  }
}

function preserveJobStatus(existingJob: SavedJob | undefined): ApplicationStatus {
  if (!existingJob) {
    return 'discovered'
  }

  if (existingJob.status === 'archived' || existingJob.status === 'submitted' || existingJob.status === 'rejected') {
    return existingJob.status
  }

  return existingJob.status
}

function mergeDiscoveredJob(
  matchAssessment: MatchAssessment,
  posting: JobPosting,
  existingJob: SavedJob | undefined
): SavedJob {
  return SavedJobSchema.parse({
    ...posting,
    id: existingJob?.id ?? toSavedJobId(posting),
    status: preserveJobStatus(existingJob),
    matchAssessment
  })
}

// Helper to merge discovered postings with existing jobs
async function mergeDiscoveredPostings(
  aiClient: JobFinderAiClient,
  profile: CandidateProfile,
  searchPreferences: JobSearchPreferences,
  savedJobs: readonly SavedJob[],
  discoveredPostings: readonly JobPosting[],
  provenanceBuilder: (posting: JobPosting) => SavedJobDiscoveryProvenance,
  signal?: AbortSignal
): Promise<MergeDiscoveryResult> {
  // Check if already aborted
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError')
  }
  
  const savedJobsByPostingKey = new Map<string, SavedJob>()
  const savedJobsBySourceId = new Map<string, SavedJob>()
  const newJobs: SavedJob[] = []
  let validatedCount = 0
  let duplicatesMerged = 0
  let invalidSkipped = 0

  for (const job of savedJobs) {
    // Full key with canonical URL
    const key = `${job.source}:${job.sourceJobId}:${job.canonicalUrl}`
    savedJobsByPostingKey.set(key, job)
    // Fallback key without URL (for when canonical URL changes)
    const sourceIdKey = `${job.source}:${job.sourceJobId}`
    savedJobsBySourceId.set(sourceIdKey, job)
  }

  const nextJobsById = new Map(savedJobs.map((job) => [job.id, job]))

  for (const posting of discoveredPostings) {
    // Check for cancellation periodically
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }
    
    const postingKey = `${posting.source}:${posting.sourceJobId}:${posting.canonicalUrl}`
    const sourceIdKey = `${posting.source}:${posting.sourceJobId}`
    
    // Try full key first, then fallback to source+sourceId
    const existingJob = savedJobsByPostingKey.get(postingKey) ?? savedJobsBySourceId.get(sourceIdKey)
    const postingUrl = (() => {
      try {
        return new URL(posting.canonicalUrl)
      } catch {
        return null
      }
    })()

    if (!posting.sourceJobId || !postingUrl) {
      invalidSkipped += 1
      continue
    }

    validatedCount += 1
    
    const matchAssessment = await createMatchAssessmentAsync(
      aiClient,
      profile,
      searchPreferences,
      posting
    )
    const provenance = provenanceBuilder(posting)
    const mergedJob = SavedJobSchema.parse({
      ...mergeDiscoveredJob(matchAssessment, posting, existingJob),
      provenance: uniqueProvenance([...(existingJob?.provenance ?? []), provenance])
    })

    if (existingJob) {
      duplicatesMerged += 1
    } else {
      newJobs.push(mergedJob)
    }

    savedJobsByPostingKey.set(postingKey, mergedJob)
    savedJobsBySourceId.set(sourceIdKey, mergedJob)
    nextJobsById.set(mergedJob.id, mergedJob)
  }

  return {
    mergedJobs: [...nextJobsById.values()],
    newJobs,
    validatedCount,
    duplicatesMerged,
    invalidSkipped
  }
}

function uniqueProvenance(values: readonly SavedJobDiscoveryProvenance[]): SavedJobDiscoveryProvenance[] {
  const seen = new Set<string>()

  return values.flatMap((value) => {
    const parsed = SavedJobDiscoveryProvenanceSchema.parse(value)
    const key = `${parsed.targetId}:${parsed.adapterKind}:${parsed.resolvedAdapterKind ?? 'none'}:${parsed.startingUrl}`

    if (seen.has(key)) {
      return []
    }

    seen.add(key)
    return [parsed]
  })
}

function resolveAdapterKind(target: JobDiscoveryTarget): JobSource {
  JobSourceAdapterKindSchema.parse(target.adapterKind)
  return 'target_site'
}

function normalizeDiscoveryTarget(target: JobDiscoveryTarget): JobDiscoveryTarget {
  const isLegacyDefaultTarget =
    target.id === LEGACY_DEFAULT_TARGET_ID &&
    target.label === LEGACY_DEFAULT_TARGET_LABEL &&
    target.startingUrl === LEGACY_DEFAULT_TARGET_STARTING_URL

  return JobDiscoveryTargetSchema.parse({
    ...target,
    adapterKind: 'auto',
    label: isLegacyDefaultTarget ? GENERIC_DEFAULT_TARGET_LABEL : target.label
  })
}

function readReviewOverrideStringArray(
  payload: Record<string, unknown>,
  key: keyof SourceInstructionReviewOverride
): string[] {
  const value = payload[key]

  if (!Array.isArray(value)) {
    return []
  }

  return uniqueStrings(
    value.flatMap((entry) => (typeof entry === 'string' ? [entry.trim()] : []))
  )
}

function parseSourceInstructionReviewOverride(raw: unknown): SourceInstructionReviewOverride | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null
  }

  const payload = raw as Record<string, unknown>

  return {
    navigationGuidance: readReviewOverrideStringArray(payload, 'navigationGuidance'),
    searchGuidance: readReviewOverrideStringArray(payload, 'searchGuidance'),
    detailGuidance: readReviewOverrideStringArray(payload, 'detailGuidance'),
    applyGuidance: readReviewOverrideStringArray(payload, 'applyGuidance'),
    warnings: readReviewOverrideStringArray(payload, 'warnings')
  }
}

function normalizeSearchPreferences(searchPreferences: JobSearchPreferences): JobSearchPreferences {
  return JobSearchPreferencesSchema.parse({
    ...searchPreferences,
    discovery: {
      ...searchPreferences.discovery,
      targets: searchPreferences.discovery.targets.map((target) => normalizeDiscoveryTarget(target))
    }
  })
}

function getActiveDiscoveryTargets(searchPreferences: JobSearchPreferences): JobDiscoveryTarget[] {
  return searchPreferences.discovery.targets
    .map((target) => normalizeDiscoveryTarget(target))
    .filter((target) => target.enabled)
}

function getPreferredSessionAdapter(searchPreferences: JobSearchPreferences): JobSource {
  const targets = getActiveDiscoveryTargets(searchPreferences)
  const preferredTarget = targets[0]

  return preferredTarget ? resolveAdapterKind(preferredTarget) : 'target_site'
}

function formatStatusLabel(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

function splitCustomDiscoveryInstructions(value: string | null): string[] {
  return (value ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function normalizeInstructionLine(value: string): string {
  return value
    .replace(/^(Reliable control|Filter note|Navigation note|Apply note|Validated behavior|Validated navigation|Verification):\s*/i, '')
    .replace(/\s*\(index\s+\d+\)/gi, '')
    .replace(/\s+at index\s+\d+\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function lineMentionsAnyKeyword(value: string, keywords: readonly string[]): boolean {
  const normalized = normalizeText(value)
  return keywords.some((keyword) => normalized.includes(keyword))
}

function isLowSignalSourceInstruction(value: string): boolean {
  const normalized = normalizeText(value)
  const isUrlLiteral = normalized.includes('http://') || normalized.includes('https://')
  const isOnlyStartingUrlRestatement =
    (normalized.startsWith('start from ') || normalized.startsWith('started from ')) &&
    (isUrlLiteral || normalized.includes('the starting url'))

  return (
    /^(clicked|filled|selected|link|button|searchbox|textbox|combobox)\b/.test(normalized) ||
    normalized.startsWith('click failed ') ||
    normalized.includes('locator click') ||
    normalized.includes('call log') ||
    normalized.includes('waiting for getbyrole') ||
    normalized.includes('element is not visible') ||
    normalized.includes('retrying click action') ||
    normalized.includes('waiting for element to be visible enabled and stable') ||
    normalized.includes('dismiss ') ||
    normalized.includes('promoted') ||
    isOnlyStartingUrlRestatement ||
    normalized.startsWith('stay within ') ||
    normalized.startsWith('verify whether the site is reachable') ||
    normalized.startsWith('find search controls or filters') ||
    normalized.startsWith('open multiple job details') ||
    normalized.startsWith('check whether discovered jobs expose') ||
    normalized.startsWith('inspected discovered jobs for apply entry points') ||
    normalized.startsWith('prefer pages that expose stable job titles') ||
    normalized.startsWith('stay within the configured hostname') ||
    normalized.startsWith('replay verification reached ') ||
    normalized.startsWith('determine whether the site can be accessed') ||
    normalized.startsWith('prefer actions that change the result set') ||
    normalized.startsWith('record which search inputs or filters appear reliable') ||
    normalized.startsWith('focus on whether the source exposes an inline apply button') ||
    normalized.startsWith('agent discovery stopped after ') ||
    normalized.startsWith('no login or consent wall detected') ||
    normalized.includes('fully accessible without login or consent walls') ||
    normalized.includes('fully accessible without login or consent barriers') ||
    normalized.includes('no authentication required') ||
    normalized.includes('without auth required') ||
    normalized.includes('loads without auth') ||
    normalized.includes('loads without login') ||
    normalized.includes('without login or consent barriers') ||
    normalized.includes('accessible without login barriers') ||
    normalized.includes('no auth or consent blockers detected') ||
    normalized.includes('no auth consent blockers detected') ||
    normalized.includes('no auth consent popups') ||
    normalized.includes('no login auth or consent blockers detected') ||
    normalized.includes('page is scrollable with substantial content') ||
    normalized.includes('job extraction tool confirmed') ||
    normalized.includes('extract jobs tool') ||
    normalized.includes('extract_jobs tool') ||
    normalized.includes('extract_jobs returned') ||
    normalized.includes('job extraction returned empty') ||
    normalized.includes('get interactive elements') ||
    normalized.includes('get_interactive_elements') ||
    normalized.includes('interactive elements detection was unreliable') ||
    normalized.includes('interactive elements were unreliable') ||
    normalized.includes('interactive elements were not detected in the automation environment') ||
    normalized.includes('interactive elements may be limited for automated navigation') ||
    normalized.includes('some controls may not be fully accessible via automation') ||
    normalized.includes('automation detection limited') ||
    normalized.includes('interactive elements not detected by get interactive elements tool') ||
    normalized.includes('job availability may change frequently') ||
    normalized.includes('rate limiting') ||
    normalized.includes('geographic restrictions') ||
    normalized.includes('previous agent discovery stopped after') ||
    normalized.includes('interaction timed out') ||
    normalized.includes('times out on interaction') ||
    normalized.includes('multiple timeouts observed') ||
    normalized.includes('requires longer timeout') ||
    normalized.includes('may require longer timeout') ||
    normalized.includes('different extraction timing') ||
    normalized.includes('different extraction approach') ||
    normalized.includes('different interaction method') ||
    normalized.includes('manual dom inspection') ||
    normalized.includes('pointer events') ||
    normalized.includes('pointer event interception') ||
    normalized.includes('pointer event intercepting') ||
    normalized.includes('javascript enabled interaction') ||
    normalized.includes('current extraction') ||
    normalized.includes('no jobs matching target roles') ||
    normalized.includes('job extraction consistently returned') ||
    normalized.includes('job extraction returned') ||
    normalized.includes('jobs extracted') ||
    normalized.includes('job extracted') ||
    normalized.includes('despite visible job cards') ||
    normalized.includes('sample size') ||
    normalized.includes('sampled only ') ||
    normalized.includes('only 1 job extracted') ||
    normalized.includes('only 2 jobs found') ||
    normalized.includes('0 or 1 jobs extracted') ||
    /\bonly \d+ jobs? (?:extracted|found|sampled)\b/.test(normalized) ||
    /\b\d+ or \d+ jobs? extracted\b/.test(normalized) ||
    /\b\d+ jobs? (?:extracted|found|sampled)\b/.test(normalized) ||
    normalized.includes('location encoding') ||
    normalized.includes('%2c') ||
    normalized.includes('%20') ||
    normalized.includes('geoid') ||
    normalized.includes('currentjobid') ||
    normalized.includes('domcontentloaded') ||
    normalized.includes('jobs landing url') ||
    normalized.includes('jobs url pattern') ||
    normalized.includes('query parameters') ||
    normalized.includes('bypasses the need to use the search box') ||
    normalized.includes('site is a job board') ||
    normalized.includes('page language is ') ||
    normalized.includes('job listings appear to be in ') ||
    normalized.includes('site title is in albanian') ||
    normalized.includes('means find jobs') ||
    normalized.includes('apply process not yet verified') ||
    normalized.includes('apply mechanism not yet verified') ||
    normalized.includes('job details not extracted') ||
    normalized.includes('job details and apply flow not fully verified') ||
    normalized.includes('agent runtime failed') ||
    normalized.includes('did not complete because the agent runtime failed') ||
    normalized.includes('llm call failed') ||
    normalized.includes('discovery encountered an error') ||
    normalized.includes('unknown error') ||
    normalized.includes('browser runtime does not support agent discovery') ||
    normalized.startsWith('observed canonical job detail url ') ||
    normalized.startsWith('no reliable apply path was confirmed for ') ||
    normalized.includes('credible job result') ||
    normalized.startsWith('apply path validation confirmed reusable apply guidance on ') ||
    normalized.startsWith('apply path validation did not confirm a reusable apply path') ||
    normalized.startsWith('observed ') && normalized.includes(' candidate job result') ||
    isUrlLiteral ||
    normalized.includes('produced no candidate jobs') ||
    /produced \d+ candidate job result/.test(normalized)
  )
}

function isInternalSourceDebugFailure(value: string | null | undefined): boolean {
  const normalized = normalizeText(value ?? '')

  return (
    normalized.includes('agent runtime failed') ||
    normalized.includes('llm call failed') ||
    normalized.includes('discovery encountered an error') ||
    normalized.includes('unknown error') ||
    normalized.includes('browser runtime does not support agent discovery') ||
    normalized.includes('ai client does not support tool calling') ||
    normalized.includes('no job extractor configured')
  )
}

function filterSourceDebugWarnings(values: readonly (string | null | undefined)[]): string[] {
  return uniqueStrings(
    values
      .filter((value): value is string => Boolean(value))
      .map((value) => normalizeInstructionLine(value))
      .filter(Boolean)
      .filter((value) => !isLowSignalSourceInstruction(value))
      .filter((value) => !isInternalSourceDebugFailure(value))
  )
}

function filterSourceInstructionLines(values: readonly string[]): string[] {
  return uniqueStrings(
    values
      .map(normalizeInstructionLine)
      .filter(Boolean)
      .filter((value) => !isLowSignalSourceInstruction(value))
  )
}

function prefixedLines(prefix: string, values: readonly string[]): string[] {
  return values.map((value) => `${prefix}${normalizeInstructionLine(value)}`)
}

function summarizeCanonicalUrlBehavior(jobs: readonly JobPosting[], hostname: string): string[] {
  if (jobs.length === 0) {
    return []
  }

  const urls = jobs
    .map((job) => {
      try {
        return new URL(job.canonicalUrl)
      } catch {
        return null
      }
    })
    .filter((url): url is URL => url !== null)

  if (urls.length === 0) {
    return []
  }

  const sameHostUrls = urls.filter((url) => url.hostname === hostname)
  const uniquePaths = uniqueStrings(sameHostUrls.map((url) => url.pathname).filter(Boolean))
  const slugLikePaths = uniquePaths.filter((path) => path.split('/').filter(Boolean).length >= 2)

  return uniqueStrings([
    sameHostUrls.length > 0 ? 'Use same-host detail pages as the canonical source of job data.' : null,
    uniquePaths.length >= 2 ? 'Expect different listings to resolve to distinct canonical detail URLs.' : null,
    slugLikePaths.length > 0 ? 'Treat stable slug-style paths on the same host as the canonical detail route.' : null
  ].filter((value): value is string => Boolean(value)))
}

function summarizeApplyPathBehavior(jobs: readonly JobPosting[]): string[] {
  if (jobs.length === 0) {
    return []
  }

  const easyApplyCount = jobs.filter((job) => job.applyPath === 'easy_apply' || job.easyApplyEligible).length
  const externalApplyCount = jobs.filter((job) => job.applyPath === 'external_redirect').length
  const unknownApplyCount = jobs.filter((job) => job.applyPath === 'unknown' && !job.easyApplyEligible).length

  return uniqueStrings([
    easyApplyCount > 0 ? 'Use the on-site apply entry when the detail page exposes it.' : null,
    externalApplyCount > 0 ? 'Expect some listings to hand off apply to an external destination.' : null,
    unknownApplyCount === jobs.length ? 'Treat applications as manual for now; sampled job details did not expose a reliable on-site apply entry.' : null
  ].filter((value): value is string => Boolean(value)))
}

function warningSuggestsAuthRestriction(value: string | null | undefined): boolean {
  const normalized = normalizeText(value ?? '')

  return (
    normalized.includes('login required') ||
    normalized.includes('logged in') ||
    normalized.includes('authentication required') ||
    normalized.includes('session is not ready') ||
    normalized.includes('sign in') ||
    normalized.includes('auth restriction') ||
    normalized.includes('not authenticated')
  )
}

function collectAttemptInstructionGuidance(attempt: SourceDebugWorkerAttempt | undefined): string[] {
  const derivedEvidenceGuidance = deriveGuidanceFromPhaseEvidence(attempt)

  return filterSourceInstructionLines([
    attempt?.resultSummary ?? '',
    ...(attempt?.confirmedFacts ?? []),
    ...derivedEvidenceGuidance
  ])
}

function extractControlName(control: string): string | null {
  const match = control.match(/^[a-z]+\s+"([^"]+)"/i)
  return match?.[1]?.trim() ?? null
}

function summarizeNamedVisibleControls(
  controls: readonly string[],
  keywords: readonly string[]
): string[] {
  return uniqueStrings(
    controls
      .map(extractControlName)
      .filter((value): value is string => Boolean(value))
      .filter((value) => value.length <= 32)
      .filter((value) => lineMentionsAnyKeyword(value, keywords))
  )
}

function deriveGuidanceFromPhaseEvidence(attempt: SourceDebugWorkerAttempt | undefined): string[] {
  if (!attempt?.phaseEvidence) {
    return []
  }

  const controls = attempt.phaseEvidence.visibleControls ?? []
  const routeSignals = attempt.phaseEvidence.routeSignals ?? []
  const successfulInteractions = attempt.phaseEvidence.successfulInteractions ?? []
  const attemptedControls = attempt.phaseEvidence.attemptedControls ?? []
  const warnings = attempt.phaseEvidence.warnings ?? []
  const locationControls = summarizeNamedVisibleControls(controls, ['location', 'qyteti', 'prishtin', 'kosov', 'vendit'])
  const industryControls = summarizeNamedVisibleControls(controls, ['industry', 'industria', 'category', 'department'])
  const hasShowAllControl = controls.some((control) => /\bshow all\b/i.test(control))
  const hasSearchBox = controls.some((control) => /\b(searchbox|textbox)\b/i.test(control))
  const hasLocationCombobox = controls.some((control) => /\bcombobox\b/i.test(control) && /\b(location|qyteti)\b/i.test(control))
  const hasIndustryCombobox = controls.some((control) => /\bcombobox\b/i.test(control) && /\b(industry|industria|category|department)\b/i.test(control))
  const routeOpensCollection = routeSignals.some((signal) => /\/collections\//i.test(signal))
  const routeOpensSearch = routeSignals.some((signal) => /\/jobs\/search\//i.test(signal))
  const hit404LikeRoute = warnings.some((warning) => /not-found route|404/i.test(warning))
  const interactedWithShowAll = successfulInteractions.some((value) => /\bshow all\b/i.test(value))
  const attemptedSearchControl = attemptedControls.some((value) => /\b(searchbox|textbox)\b/i.test(value))
  const attemptedLocationControl = attemptedControls.some((value) => /\b(location|qyteti)\b/i.test(value))
  const attemptedIndustryControl = attemptedControls.some((value) => /\b(industry|industria|category|department)\b/i.test(value))
  const hasTimeoutLikeWarning = warnings.some((warning) => /timeout|timed out/i.test(warning))
  const hasVisibilityLikeWarning = warnings.some((warning) => /not visible|scroll/i.test(warning))
  const scrollingHelped = successfulInteractions.some((value) => /\bscrolled down\b/i.test(value))
  const hasVisibleSearchCoverageGap = hasSearchBox && attemptedSearchControl && (hasTimeoutLikeWarning || hasVisibilityLikeWarning)
  const hasVisibleLocationCoverageGap =
    (hasLocationCombobox || locationControls.length > 0) &&
    attemptedLocationControl &&
    (hasTimeoutLikeWarning || hasVisibilityLikeWarning)
  const hasVisibleIndustryCoverageGap =
    (hasIndustryCombobox || industryControls.length > 0) &&
    attemptedIndustryControl &&
    (hasTimeoutLikeWarning || hasVisibilityLikeWarning)

  return uniqueStrings([
    hasShowAllControl ? 'Visible Show all links can open fuller job lists or recommendation collections.' : null,
    interactedWithShowAll ? 'Use reusable Show all or collection links from the landing page before assuming the jobs hub is thin.' : null,
    routeOpensCollection ? 'Recommendation or show-all routes can open reusable collection pages.' : null,
    routeOpensSearch ? 'The fuller results surface lives under the main jobs search route.' : null,
    hasSearchBox ? 'A visible keyword search box is present on the landing or results surface.' : null,
    hasLocationCombobox ? 'A visible location filter is present on the landing or results surface.' : null,
    hasIndustryCombobox ? 'A visible industry or category filter is present on the landing or results surface.' : null,
    locationControls.length > 0 ? `Visible location controls include ${locationControls.join(', ')}.` : null,
    industryControls.length > 0 ? `Visible industry or category controls include ${industryControls.join(', ')}.` : null,
    hasVisibleSearchCoverageGap ? 'A visible keyword search box exists, but this run did not prove it changes the result set reliably.' : null,
    hasVisibleLocationCoverageGap ? 'Visible location filters exist, but this run did not prove they change the result set reliably.' : null,
    hasVisibleIndustryCoverageGap ? 'Visible industry or category filters exist, but this run did not prove they change the result set reliably.' : null,
    scrollingHelped || hasVisibilityLikeWarning ? 'Some job links or filters may need scrolling into view before interaction.' : null,
    scrollingHelped ? 'Scrolling can reveal additional jobs on the current list surface before a separate route is needed.' : null,
    hit404LikeRoute ? 'Direct path guesses can land on a not-found route; return to the last known jobs surface instead of relying on the broken path.' : null
  ].filter((value): value is string => Boolean(value)))
}

function lineContradictsVisiblePhaseEvidence(value: string, attempts: readonly SourceDebugWorkerAttempt[]): boolean {
  const normalized = normalizeText(value)
  const visibleControls = attempts.flatMap((attempt) => attempt.phaseEvidence?.visibleControls ?? [])
  const hasVisibleSearchBox = visibleControls.some((control) => /\b(searchbox|textbox)\b/i.test(control))
  const hasVisibleLocationControl = visibleControls.some((control) => /\b(location|qyteti)\b/i.test(control))
  const hasVisibleIndustryControl = visibleControls.some((control) => /\b(industry|industria|category|department)\b/i.test(control))

  if (
    hasVisibleSearchBox &&
    (
      normalized.includes('search box interaction failed') ||
      normalized.includes('search textbox interaction failed') ||
      normalized.includes('search textbox was not found') ||
      normalized.includes('search textbox not found') ||
      normalized.includes('no search textbox confirmed accessible') ||
      normalized.includes('no search textbox or dropdown filters confirmed') ||
      normalized.includes('search box exists in header but timed out')
    )
  ) {
    return true
  }

  if (
    hasVisibleLocationControl &&
    (
      normalized.includes('no visible dropdown filters for city') ||
      normalized.includes('no visible dropdown filters for location') ||
      normalized.includes('no visible dropdown filters for city industry or category') ||
      normalized.includes('no visible dropdown filters')
    )
  ) {
    return true
  }

  if (
    hasVisibleIndustryControl &&
    (
      normalized.includes('no visible dropdown filters for industry') ||
      normalized.includes('no visible dropdown filters for city industry or category') ||
      normalized.includes('no visible dropdown filters')
    )
  ) {
    return true
  }

  return false
}

function reconcileVisibleControlEvidence(input: {
  attempts: readonly SourceDebugWorkerAttempt[]
  navigationGuidance: readonly string[]
  searchGuidance: readonly string[]
  detailGuidance: readonly string[]
  applyGuidance: readonly string[]
}): {
  navigationGuidance: string[]
  searchGuidance: string[]
  detailGuidance: string[]
  applyGuidance: string[]
} {
  const filterLines = (lines: readonly string[]) =>
    lines.filter((line) => !lineContradictsVisiblePhaseEvidence(line, input.attempts))

  return {
    navigationGuidance: filterLines(input.navigationGuidance),
    searchGuidance: filterLines(input.searchGuidance),
    detailGuidance: filterLines(input.detailGuidance),
    applyGuidance: filterLines(input.applyGuidance)
  }
}

function isAuthBarrierOnlySourceInstruction(value: string): boolean {
  const normalized = normalizeText(value)

  return (
    normalized.includes('login form') ||
    normalized.includes('sign in form') ||
    normalized.includes('sign in dialog') ||
    normalized.includes('sign in wall') ||
    normalized.includes('only visible surface') ||
    normalized.includes('no public access') ||
    normalized.includes('no guest access') ||
    normalized.includes('guest view') ||
    normalized.includes('hidden behind a sign in') ||
    normalized.includes('gated behind authentication') ||
    normalized.includes('requires authentication') ||
    normalized.includes('authentication required') ||
    normalized.includes('without target site account') ||
    normalized.includes('without being logged in')
  )
}

function lineShowsExposedJobsSurface(value: string): boolean {
  const normalized = normalizeText(value)

  return (
    normalized.includes('job listings') ||
    normalized.includes('job cards') ||
    normalized.includes('search box') ||
    normalized.includes('filter') ||
    normalized.includes('recommendation') ||
    normalized.includes('show all') ||
    normalized.includes('collection') ||
    normalized.includes('easy apply') ||
    normalized.includes('homepage') ||
    normalized.includes('same host detail') ||
    normalized.includes('same-host detail') ||
    normalized.includes('canonical detail') ||
    normalized.includes('jobs view') ||
    normalized.includes('jobs search') ||
    normalized.includes('jobs are listed directly') ||
    normalized.includes('jobs appear directly')
  )
}

function reconcileMixedAccessGuidance(input: {
  navigationGuidance: readonly string[]
  searchGuidance: readonly string[]
  detailGuidance: readonly string[]
  applyGuidance: readonly string[]
}): {
  navigationGuidance: string[]
  searchGuidance: string[]
  detailGuidance: string[]
  applyGuidance: string[]
  warnings: string[]
} {
  const allLines = [
    ...input.navigationGuidance,
    ...input.searchGuidance,
    ...input.detailGuidance,
    ...input.applyGuidance
  ]
  const hasExposedJobsSurface = allLines.some(lineShowsExposedJobsSurface)
  const hasAuthBarrierOnlyGuidance = allLines.some(isAuthBarrierOnlySourceInstruction)

  if (!hasExposedJobsSurface || !hasAuthBarrierOnlyGuidance) {
    return {
      navigationGuidance: [...input.navigationGuidance],
      searchGuidance: [...input.searchGuidance],
      detailGuidance: [...input.detailGuidance],
      applyGuidance: [...input.applyGuidance],
      warnings: []
    }
  }

  const filterMixedLines = (lines: readonly string[]) => lines.filter((line) => !isAuthBarrierOnlySourceInstruction(line))

  return {
    navigationGuidance: filterMixedLines(input.navigationGuidance),
    searchGuidance: filterMixedLines(input.searchGuidance),
    detailGuidance: filterMixedLines(input.detailGuidance),
    applyGuidance: filterMixedLines(input.applyGuidance),
    warnings: ['This run crossed both guest/login and job-bearing surfaces; learned guidance was curated toward the surfaces that actually exposed jobs.']
  }
}

const sourceDebugEntryPathKeywords = [
  'homepage',
  'jobs page',
  'jobs route',
  'job route',
  'listing route',
  'listings route',
  'result route',
  'results route',
  'entry path',
  'entrypoint',
  'show all',
  'showall',
  'recommended',
  'recommendation',
  'collection',
  'prefilter',
  'preselected'
] as const

const sourceDebugSearchControlKeywords = [
  'search',
  'filter',
  'keyword',
  'location',
  'industry',
  'department',
  'category',
  'chip',
  'dropdown',
  'input',
  'sort',
  'pagination',
  'all filters',
  'date posted',
  'experience',
  'company',
  'remote',
  'load more',
  'next page',
  'infinite scroll',
  'lazy load',
  'show all',
  'showall',
  'recommended',
  'recommendation',
  'prefilter',
  'preselected'
] as const

function isExplicitSearchProbeDisproof(value: string): boolean {
  const normalized = normalizeText(value)
  const hasNegativeSearchVerdict =
    /(^|\s)no\s+[^.]*\b(proven|confirmed|working|reliable)\b/.test(normalized) ||
    normalized.includes('no search filter control was proven') ||
    normalized.includes('no working search filter controls confirmed') ||
    normalized.includes('no filters confirmed to change result set')

  return (
    (
      hasNegativeSearchVerdict ||
      normalized.includes('no reliable') ||
      normalized.includes('could not confirm') ||
      normalized.includes('could not prove') ||
      normalized.includes('did not confirm') ||
      normalized.includes('did not prove') ||
      normalized.includes('not proven') ||
      normalized.includes('unproven') ||
      normalized.includes('not confirmed') ||
      normalized.includes('not clearly visible') ||
      normalized.includes('not clearly proven') ||
      normalized.includes('not conclusively proven') ||
      normalized.includes('not identified') ||
      normalized.includes('not tested') ||
      normalized.includes('did not reliably change') ||
      normalized.includes('did not change') ||
      normalized.includes('not reliable') ||
      normalized.includes('decorative')
    ) &&
    lineMentionsAnyKeyword(normalized, sourceDebugSearchControlKeywords)
  )
}

function isVisibilityOnlySearchSignal(value: string): boolean {
  const normalized = normalizeText(value)

  return (
    normalized.startsWith('a visible keyword search box is present') ||
    normalized.startsWith('a visible location filter is present') ||
    normalized.startsWith('a visible industry or category filter is present') ||
    normalized.startsWith('visible location controls include') ||
    normalized.startsWith('visible industry or category controls include') ||
    normalized.startsWith('some job links or filters may need scrolling into view') ||
    normalized.startsWith('scrolling can reveal additional jobs on the current list surface')
  )
}

function isPositiveReusableSearchSignal(value: string): boolean {
  const normalized = normalizeText(value)
  const hasPositiveProofPhrase =
    normalized.startsWith('use ') ||
    normalized.startsWith('start at ') ||
    normalized.startsWith('start from ') ||
    normalized.startsWith('click ') ||
    normalized.startsWith('open ') ||
    normalized.includes('proven control') ||
    normalized.includes('changes the result set') ||
    normalized.includes('change the result set') ||
    normalized.includes('opens reusable') ||
    normalized.includes('open reusable') ||
    normalized.includes('opens a reusable') ||
    normalized.includes('can open reusable') ||
    normalized.includes('works with authentication') ||
    normalized.includes('works reliably') ||
    normalized.includes('remained stable') ||
    normalized.includes('refresh the visible job set') ||
    normalized.includes('narrow the listings') ||
    normalized.includes('access the fuller') ||
    normalized.includes('access recommended jobs collection')

  return (
    lineMentionsAnyKeyword(normalized, sourceDebugSearchControlKeywords) &&
    hasPositiveProofPhrase &&
    !isVisibilityOnlySearchSignal(value) &&
    !isExplicitSearchProbeDisproof(value) &&
    !isUrlShortcutSourceInstruction(value)
  )
}

function isUrlShortcutSourceInstruction(value: string): boolean {
  const normalized = normalizeText(value)

  return (
    normalized.includes('geoid') ||
    normalized.includes('currentjobid') ||
    normalized.includes('query parameter') ||
    normalized.includes('query url') ||
    normalized.includes('jobs landing url') ||
    normalized.includes('jobs url pattern') ||
    normalized.includes('direct url') ||
    normalized.includes('/jobs/search')
  )
}

function evaluateSourceInstructionQuality(input: {
  navigationGuidance: readonly string[]
  searchGuidance: readonly string[]
  detailGuidance: readonly string[]
  applyGuidance: readonly string[]
}): SourceInstructionQualityAssessment {
  const accessOnlyKeywords = [
    'without login',
    'without auth',
    'authentication required',
    'consent',
    'networkidle',
    'reachable',
    'accessible'
  ]
  const entryPathSignals = uniqueStrings([
    ...input.navigationGuidance,
    ...input.searchGuidance
  ].filter((line) => {
    const normalized = normalizeText(line)
    const matchesEntryPath = lineMentionsAnyKeyword(normalized, sourceDebugEntryPathKeywords)
    const isAccessOnly = accessOnlyKeywords.some((keyword) => normalized.includes(keyword))
    return matchesEntryPath && !isAccessOnly && !isUrlShortcutSourceInstruction(line)
  }))
  const searchControlSignals = uniqueStrings(input.searchGuidance.filter((line) => {
    return isPositiveReusableSearchSignal(line)
  }))
  const searchProbeDisproofSignals = uniqueStrings(input.searchGuidance.filter(isExplicitSearchProbeDisproof))
  const searchProbeCoverageSignals = uniqueStrings([
    ...searchControlSignals,
    ...searchProbeDisproofSignals
  ])
  const highSignalNavigationOrSearch = uniqueStrings([
    ...entryPathSignals,
    ...searchProbeCoverageSignals
  ])
  const highSignalDetailOrApply = uniqueStrings([
    ...input.detailGuidance,
    ...input.applyGuidance
  ])
  const totalReusableSignals = uniqueStrings([
    ...highSignalNavigationOrSearch,
    ...highSignalDetailOrApply
  ])
  const qualityWarnings: string[] = []

  if (entryPathSignals.length === 0) {
    qualityWarnings.push(
      'The best repeatable entry path is still missing; keep this source in draft until the debug run proves where future agents should start, including any jobs route, homepage path, or reusable recommendation list.'
    )
  }

  if (searchProbeCoverageSignals.length === 0) {
    qualityWarnings.push(
      'Search and filter coverage is still missing; keep this source in draft until the debug run proves a real control, recommendation/show-all route, pagination behavior, or explicitly records that those probes were tried and not reusable.'
    )
  }

  if (searchControlSignals.length === 0 && searchProbeDisproofSignals.length > 0) {
    qualityWarnings.push(
      'Search and filter behavior is still unproven; visible controls were mentioned but not confirmed, so keep this source in draft until the debug run proves at least one reusable control or route.'
    )
  }

  if (highSignalDetailOrApply.length === 0) {
    qualityWarnings.push(
      'Reusable detail or apply guidance is still missing; keep this source in draft until the debug run proves stable detail-page behavior or a safe apply-entry pattern.'
    )
  }

  if (totalReusableSignals.length < 4) {
    qualityWarnings.push(
      'The learned guidance is still too thin to validate; capture at least four distinct reusable findings across entry path, search or filter coverage, detail navigation, and apply behavior.'
    )
  }

  return {
    highSignalNavigationOrSearch,
    highSignalDetailOrApply,
    qualifiesForValidation:
      entryPathSignals.length > 0 &&
      searchControlSignals.length > 0 &&
      highSignalDetailOrApply.length > 0 &&
      totalReusableSignals.length >= 4,
    qualityWarnings
  }
}

function reconcileApplyGuidance(lines: readonly string[]): string[] {
  const normalizedLines = uniqueStrings(lines)
  const hasProvenOnSiteApply = normalizedLines.some((line) => {
    const normalized = normalizeText(line)
    return (
      normalized.includes('easy apply') ||
      normalized.includes('on site apply entry') ||
      normalized.includes('on-site apply entry') ||
      normalized.includes('primary apply entry point') ||
      normalized.includes('use the on site apply entry') ||
      normalized.includes('use the on-site apply entry')
    )
  })

  if (!hasProvenOnSiteApply) {
    return normalizedLines
  }

  return normalizedLines.filter((line) => {
    const normalized = normalizeText(line)
    return !(
      normalized.includes('treat applications as manual') ||
      normalized.includes('manual until a reliable on site apply entry is proven') ||
      normalized.includes('manual until a reliable on-site apply entry is proven') ||
      normalized.includes('did not expose a reliable on site apply entry') ||
      normalized.includes('did not expose a reliable on-site apply entry')
    )
  })
}

type SourceInstructionGuidanceSection = 'navigation' | 'search' | 'detail' | 'apply'

interface SourceInstructionGuidanceLineItem {
  section: SourceInstructionGuidanceSection
  line: string
  sectionOrder: number
  originalIndex: number
}

function lineMentionsKeywordSearch(value: string): boolean {
  return lineMentionsAnyKeyword(value, ['search box', 'search textbox', 'keyword search', 'searchbox', 'textbox'])
}

function lineMentionsLocationFilter(value: string): boolean {
  return lineMentionsAnyKeyword(value, ['location filter', 'update location', 'combobox "location"', 'visible location', 'location controls'])
}

function lineMentionsIndustryFilter(value: string): boolean {
  return lineMentionsAnyKeyword(value, ['industry filter', 'category filter', 'department filter', 'visible industry', 'industry or category'])
}

function classifySourceInstructionGuidanceFamily(
  value: string,
  section: SourceInstructionGuidanceSection
): string | null {
  const normalized = normalizeText(value)

  if ((section === 'navigation' || section === 'search') && lineMentionsKeywordSearch(normalized)) {
    return 'keyword_search'
  }

  if ((section === 'navigation' || section === 'search') && lineMentionsLocationFilter(normalized)) {
    return 'location_filter'
  }

  if ((section === 'navigation' || section === 'search') && lineMentionsIndustryFilter(normalized)) {
    return 'industry_filter'
  }

  if (
    (section === 'navigation' || section === 'search') &&
    lineMentionsAnyKeyword(normalized, ['show all', 'collection', 'recommendation'])
  ) {
    return 'show_all_collection'
  }

  if (
    section === 'detail' &&
    (
      lineMentionsAnyKeyword(normalized, [
        'detail page',
        'canonical detail',
        'same-host detail',
        'detail route',
        'url pattern',
        'job cards',
        'job extraction'
      ]) ||
      normalized.includes('/jobs/view/') ||
      normalized.includes('/fresha/')
    )
  ) {
    return 'detail_route'
  }

  if (
    section === 'apply' &&
    lineMentionsAnyKeyword(normalized, ['easy apply', 'apply entry', 'on-site apply', 'on site apply', 'apply button', 'manual'])
  ) {
    return 'apply_entry'
  }

  return null
}

function isStrongPositiveSourceInstructionGuidance(
  value: string,
  section: SourceInstructionGuidanceSection
): boolean {
  const normalized = normalizeText(value)
  const family = classifySourceInstructionGuidanceFamily(normalized, section)

  if (!family) {
    return false
  }

  if (family === 'keyword_search' || family === 'location_filter' || family === 'industry_filter') {
    return (
      isPositiveReusableSearchSignal(value) ||
      (
        !isExplicitSearchProbeDisproof(value) &&
        (
          normalized.includes('confirmed') ||
          normalized.includes('proven') ||
          normalized.includes('works reliably') ||
          normalized.includes('changes the result set') ||
          normalized.includes('change the result set') ||
          normalized.includes('refresh the visible job set') ||
          normalized.includes('narrow the listings')
        )
      )
    )
  }

  if (family === 'show_all_collection') {
    return (
      !normalized.includes('not proven') &&
      !normalized.includes('not confirmed') &&
      !normalized.includes('unclear') &&
      (
        normalized.includes('opens reusable') ||
        normalized.includes('open reusable') ||
        normalized.includes('best repeatable') ||
        normalized.includes('confirmed') ||
        normalized.includes('use reusable show all') ||
        normalized.includes('can open reusable')
      )
    )
  }

  if (family === 'detail_route') {
    return (
      !normalized.includes('tool limitation') &&
      !normalized.includes('timed out') &&
      !normalized.includes('failed') &&
      (
        normalized.includes('canonical') ||
        normalized.includes('url pattern') ||
        normalized.includes('confirmed stable') ||
        normalized.includes('confirmed') ||
        normalized.includes('same-host detail')
      )
    )
  }

  if (family === 'apply_entry') {
    return (
      !normalized.includes('treat applications as manual') &&
      !normalized.includes('not confirmed') &&
      !normalized.includes('not visible') &&
      !normalized.includes('timeout') &&
      (
        normalized.includes('easy apply') ||
        normalized.includes('on-site apply') ||
        normalized.includes('on site apply') ||
        normalized.includes('primary apply entry')
      )
    )
  }

  return false
}

function isSupersededByStrongerSourceInstructionGuidance(value: string, family: string): boolean {
  const normalized = normalizeText(value)

  switch (family) {
    case 'keyword_search':
      return (
        isVisibilityOnlySearchSignal(value) ||
        isExplicitSearchProbeDisproof(value) ||
        (lineMentionsKeywordSearch(normalized) && (
          normalized.includes('timed out') ||
          normalized.includes('non-functional') ||
          normalized.includes('unreliable') ||
          normalized.includes('requires specific interaction') ||
          normalized.includes('flaky')
        ))
      )
    case 'location_filter':
      return (
        (lineMentionsLocationFilter(normalized) && isExplicitSearchProbeDisproof(value)) ||
        normalized.includes('visible location filters exist, but this run did not prove they change the result set reliably')
      )
    case 'industry_filter':
      return (
        (lineMentionsIndustryFilter(normalized) && isExplicitSearchProbeDisproof(value)) ||
        normalized.includes('visible industry or category filters exist, but this run did not prove they change the result set reliably')
      )
    case 'show_all_collection':
      return (
        normalized.includes('not proven') ||
        normalized.includes('not confirmed') ||
        normalized.includes('unclear') ||
        normalized.includes('thin')
      )
    case 'detail_route':
      return (
        normalized.includes('tool limitation') ||
        normalized.includes('returned 0') ||
        normalized.includes('timed out') ||
        normalized.includes('failed due to visibility') ||
        normalized.includes('not visible off-screen')
      )
    case 'apply_entry':
      return (
        normalized.includes('treat applications as manual') ||
        normalized.includes('not confirmed') ||
        normalized.includes('timeout') ||
        normalized.includes('requires login') ||
        normalized.includes('blocked')
      )
    default:
      return false
  }
}

function getSourceInstructionGuidanceScore(
  value: string,
  section: SourceInstructionGuidanceSection
): number {
  const normalized = normalizeText(value)
  let score = value.length

  if (isStrongPositiveSourceInstructionGuidance(value, section)) {
    score += 40
  }

  if (normalized.includes('best repeatable') || normalized.includes('primary')) {
    score += 8
  }

  if (normalized.includes('confirmed') || normalized.includes('proven')) {
    score += 6
  }

  if (normalized.includes('canonical') || normalized.includes('url pattern')) {
    score += 6
  }

  if (normalized.includes('stable') || normalized.includes('reliable')) {
    score += 4
  }

  if (isVisibilityOnlySearchSignal(value)) {
    score -= 8
  }

  if (isExplicitSearchProbeDisproof(value)) {
    score -= 12
  }

  if (
    normalized.includes('tool limitation') ||
    normalized.includes('timed out') ||
    normalized.includes('manual') ||
    normalized.includes('not confirmed')
  ) {
    score -= 12
  }

  return score
}

function reconcileFinalSourceInstructionGuidance(input: {
  navigationGuidance: readonly string[]
  searchGuidance: readonly string[]
  detailGuidance: readonly string[]
  applyGuidance: readonly string[]
}): {
  navigationGuidance: string[]
  searchGuidance: string[]
  detailGuidance: string[]
  applyGuidance: string[]
} {
  const sectionOrder: Record<SourceInstructionGuidanceSection, number> = {
    navigation: 1,
    search: 2,
    detail: 3,
    apply: 4
  }
  const items: SourceInstructionGuidanceLineItem[] = [
    ...input.navigationGuidance.map((line, index) => ({
      section: 'navigation' as const,
      line,
      sectionOrder: sectionOrder.navigation,
      originalIndex: index
    })),
    ...input.searchGuidance.map((line, index) => ({
      section: 'search' as const,
      line,
      sectionOrder: sectionOrder.search,
      originalIndex: index
    })),
    ...input.detailGuidance.map((line, index) => ({
      section: 'detail' as const,
      line,
      sectionOrder: sectionOrder.detail,
      originalIndex: index
    })),
    ...input.applyGuidance.map((line, index) => ({
      section: 'apply' as const,
      line,
      sectionOrder: sectionOrder.apply,
      originalIndex: index
    }))
  ]
  const strongestPositiveByFamily = new Map<string, SourceInstructionGuidanceLineItem>()

  for (const item of items) {
    const family = classifySourceInstructionGuidanceFamily(item.line, item.section)

    if (!family || !isStrongPositiveSourceInstructionGuidance(item.line, item.section)) {
      continue
    }

    const current = strongestPositiveByFamily.get(family)

    if (!current) {
      strongestPositiveByFamily.set(family, item)
      continue
    }

    const currentScore = getSourceInstructionGuidanceScore(current.line, current.section)
    const nextScore = getSourceInstructionGuidanceScore(item.line, item.section)
    const shouldReplace =
      item.sectionOrder > current.sectionOrder ||
      (item.sectionOrder === current.sectionOrder && nextScore > currentScore) ||
      (item.sectionOrder === current.sectionOrder && nextScore === currentScore && item.line.length > current.line.length)

    if (shouldReplace) {
      strongestPositiveByFamily.set(family, item)
    }
  }

  const keptItems = items.filter((item) => {
    const family = classifySourceInstructionGuidanceFamily(item.line, item.section)

    if (!family) {
      return true
    }

    const strongestPositive = strongestPositiveByFamily.get(family)

    if (!strongestPositive) {
      return true
    }

    if (
      isSupersededByStrongerSourceInstructionGuidance(item.line, family) &&
      strongestPositive.sectionOrder >= item.sectionOrder
    ) {
      return false
    }

    if (isStrongPositiveSourceInstructionGuidance(item.line, item.section)) {
      return strongestPositive === item
    }

    return true
  })

  return {
    navigationGuidance: keptItems.filter((item) => item.section === 'navigation').map((item) => item.line),
    searchGuidance: keptItems.filter((item) => item.section === 'search').map((item) => item.line),
    detailGuidance: keptItems.filter((item) => item.section === 'detail').map((item) => item.line),
    applyGuidance: keptItems.filter((item) => item.section === 'apply').map((item) => item.line)
  }
}

function extractJsonObjectString(rawContent: string): string {
  const trimmed = rawContent.trim()

  if (!trimmed) {
    throw new Error('Model review returned empty content.')
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim()
  }

  const firstBraceIndex = trimmed.indexOf('{')
  const lastBraceIndex = trimmed.lastIndexOf('}')

  if (firstBraceIndex >= 0 && lastBraceIndex > firstBraceIndex) {
    return trimmed.slice(firstBraceIndex, lastBraceIndex + 1)
  }

  return trimmed
}

function buildSourceInstructionFinalReviewPrompt(input: {
  target: JobDiscoveryTarget
  run: SourceDebugRunRecord
  adapterKind: JobSource
  verification: SourceInstructionArtifact['verification']
  heuristicInstruction: SourceInstructionArtifact
  phaseContexts: readonly SourceInstructionFinalReviewPhaseContext[]
}): string {
  const payload = {
    target: {
      id: input.target.id,
      label: input.target.label,
      startingUrl: input.target.startingUrl,
      adapterKind: input.adapterKind
    },
    run: {
      id: input.run.id,
      startedAt: input.run.startedAt,
      completedAt: input.run.completedAt,
      phaseOrder: SOURCE_DEBUG_PHASES
    },
    verification: input.verification,
    heuristicInstruction: {
      navigationGuidance: input.heuristicInstruction.navigationGuidance,
      searchGuidance: input.heuristicInstruction.searchGuidance,
      detailGuidance: input.heuristicInstruction.detailGuidance,
      applyGuidance: input.heuristicInstruction.applyGuidance,
      warnings: input.heuristicInstruction.warnings
    },
    phases: input.phaseContexts
  }

  return [
    'Review the full source-debug evidence and produce the final curated instruction artifact.',
    'Use the richer phase context, timestamps, compaction summaries, attempted actions, evidence, and review transcript to decide what is actually valid.',
    'Prefer later proven evidence over earlier failed or weaker notes when they describe the same control, route, detail pattern, or apply path.',
    'Drop duplicates, raw tool chatter, step-budget chatter, and superseded contradiction lines.',
    'These outputs are reusable instructions for future discovery runs on the same site, not a report about this specific run.',
    'If a line would not change how a future discovery run behaves, drop it.',
    'Keep uncertainty only when it still matters after reconciling the later evidence.',
    'Do not invent routes, controls, or outcomes that are not supported by the evidence.',
    'Keep the output concise and operator-facing.',
    'Return JSON only with this shape:',
    '{"navigationGuidance":[],"searchGuidance":[],"detailGuidance":[],"applyGuidance":[],"warnings":[]}',
    'Guidance rules:',
    '- Prefer stable routes, visible controls, canonical detail behavior, and safe apply-entry rules.',
    '- When a control was first flaky or unproven but later worked, keep the proven instruction and drop the earlier failure note.',
    '- When a later phase disproves an earlier claim, keep the later warning and remove the stale claim.',
    '- Never keep extracted-job counts, sampled-job totals, step counts, tool names, or raw timeout/extraction chatter as final guidance unless they describe a durable site constraint future runs must remember.',
    '- Ask: if a future discovery run followed this line, would it behave better? If not, drop it.',
    '- Keep warnings factual and specific.',
    'Evidence payload:',
    JSON.stringify(payload, null, 2)
  ].join('\n')
}

async function reviewSourceInstructionArtifactWithAi(input: {
  aiClient: JobFinderAiClient
  target: JobDiscoveryTarget
  run: SourceDebugRunRecord
  adapterKind: JobSource
  verification: SourceInstructionArtifact['verification']
  heuristicInstruction: SourceInstructionArtifact
  phaseContexts: readonly SourceInstructionFinalReviewPhaseContext[]
  signal?: AbortSignal
}): Promise<SourceInstructionReviewOverride | null> {
  if (!input.aiClient.chatWithTools || input.phaseContexts.length === 0) {
    return null
  }

  try {
    const response = await input.aiClient.chatWithTools(
      [
        {
          role: 'system',
          content:
            'You are the final reviewer for learned source instructions. Reconcile conflicts, prefer stronger later evidence, and return strict JSON only.'
        },
        {
          role: 'user',
          content: buildSourceInstructionFinalReviewPrompt(input)
        }
      ],
      [],
      input.signal
    )

    if (!response.content) {
      return null
    }

    return parseSourceInstructionReviewOverride(
      JSON.parse(extractJsonObjectString(response.content)) as unknown
    )
  } catch {
    return null
  }
}

function toDiscoverySessionState(session: Awaited<ReturnType<BrowserSessionRuntime['getSessionState']>>) {
  return {
    adapterKind: session.source,
    status: session.status,
    driver: session.driver,
    label: session.label,
    detail: session.detail,
    lastCheckedAt: session.lastCheckedAt
  }
}

function formatFoundSuffix(jobsFound: number): string {
  return jobsFound > 0 ? ` (${jobsFound} found so far)` : ''
}

function summarizeProgressAction(
  action: string | undefined,
  siteLabel: string,
  jobsFound: number,
  stepCount: number
): { message: string; stage: DiscoveryActivityEvent['stage'] } {
  const normalizedAction = (action ?? '').toLowerCase()

  if (!normalizedAction || normalizedAction === 'thinking...') {
    return { message: `Planning step ${stepCount}${formatFoundSuffix(jobsFound)}`, stage: 'planning' }
  }

  if (normalizedAction.startsWith('extract_result:')) {
    const [, addedRaw = '0', totalRaw = String(jobsFound), attemptedRaw = totalRaw] = normalizedAction.split(':')
    const addedCount = Number.parseInt(addedRaw, 10)
    const totalCount = Number.parseInt(totalRaw, 10)
    const attemptedCount = Number.parseInt(attemptedRaw, 10)

    if (Number.isFinite(addedCount) && Number.isFinite(totalCount) && addedCount > 0) {
      return {
        message: `Found ${addedCount} new job${addedCount === 1 ? '' : 's'} on this pass (${totalCount} total so far)`,
        stage: 'extraction'
      }
    }

    if (Number.isFinite(attemptedCount) && Number.isFinite(totalCount)) {
      return {
        message: `No new jobs were kept from this pass (${attemptedCount} reviewed, ${totalCount} total so far)`,
        stage: 'extraction'
      }
    }
  }

  if (normalizedAction.includes('navigate')) {
    return { message: `Opening ${siteLabel}${formatFoundSuffix(jobsFound)}`, stage: 'navigation' }
  }

  if (normalizedAction.includes('extract_jobs')) {
    return { message: `Gathering jobs from the current page${formatFoundSuffix(jobsFound)}`, stage: 'extraction' }
  }

  if (normalizedAction.includes('scroll_down')) {
    return { message: `Loading more results${formatFoundSuffix(jobsFound)}`, stage: 'navigation' }
  }

  if (normalizedAction.includes('go_back')) {
    return { message: `Returning to the previous results page${formatFoundSuffix(jobsFound)}`, stage: 'navigation' }
  }

  if (normalizedAction.includes('fill')) {
    return { message: `Refining the search controls${formatFoundSuffix(jobsFound)}`, stage: 'navigation' }
  }

  if (normalizedAction.includes('click')) {
    return { message: `Opening a job detail or result card${formatFoundSuffix(jobsFound)}`, stage: 'navigation' }
  }

  return { message: `Continuing discovery on the current page${formatFoundSuffix(jobsFound)}`, stage: 'navigation' }
}

function createDiscoveryEvent(
  input: Omit<DiscoveryActivityEvent, 'id' | 'resolvedAdapterKind' | 'terminalState'>
    & Pick<Partial<DiscoveryActivityEvent>, 'resolvedAdapterKind' | 'terminalState'>
): DiscoveryActivityEvent {
  return DiscoveryActivityEventSchema.parse({
    ...input,
    id: `${input.runId}_${input.stage}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  })
}

function appendDiscoveryEvent(run: DiscoveryRunRecord, event: DiscoveryActivityEvent): DiscoveryRunRecord {
  const previousEvent = run.activity[run.activity.length - 1]

  if (
    previousEvent &&
    previousEvent.message === event.message &&
    previousEvent.stage === event.stage &&
    previousEvent.targetId === event.targetId &&
    previousEvent.url === event.url
  ) {
    return run
  }

  return DiscoveryRunRecordSchema.parse({
    ...run,
    activity: [...run.activity, event]
  })
}

function updateTargetExecution(
  run: DiscoveryRunRecord,
  targetId: string,
  updater: (target: DiscoveryTargetExecution) => DiscoveryTargetExecution
): DiscoveryRunRecord {
  return DiscoveryRunRecordSchema.parse({
    ...run,
    targetExecutions: run.targetExecutions.map((target) =>
      target.targetId === targetId ? DiscoveryTargetExecutionSchema.parse(updater(target)) : target
    )
  })
}

function countCompletedTargetExecutions(run: DiscoveryRunRecord): number {
  return run.targetExecutions.filter((execution) => execution.state !== 'planned' && execution.state !== 'running').length
}

function finalizeDiscoveryState(
  current: JobFinderDiscoveryState,
  run: DiscoveryRunRecord,
  searchPreferences: JobSearchPreferences
): JobFinderDiscoveryState {
  const historyLimit = searchPreferences.discovery.historyLimit || DEFAULT_DISCOVERY_HISTORY_LIMIT

  return JobFinderDiscoveryStateSchema.parse({
    ...current,
    runState: run.state,
    activeRun: run,
    recentRuns: [run, ...current.recentRuns.filter((entry) => entry.id !== run.id)].slice(0, historyLimit)
  })
}

function buildTailoredResumeText(
  profile: CandidateProfile,
  job: SavedJob,
  previewSections: Array<{ heading: string; lines: string[] }>
): string {
  const sections = previewSections
    .map((section) => `${section.heading}
${section.lines.join('\n')}`)
    .join('\n\n')

  return `${profile.fullName}\n${profile.headline}\n${profile.currentLocation}\n\nTarget Role: ${job.title} at ${job.company}\n\n${sections}\n`
}

function buildPreviewSectionsFromDraft(draft: TailoredResumeDraft) {
  return [
    {
      heading: 'Summary',
      lines: [draft.summary]
    },
    {
      heading: 'Experience Highlights',
      lines: [...draft.experienceHighlights]
    },
    {
      heading: 'Core Skills',
      lines: [...draft.coreSkills]
    },
    {
      heading: 'Targeted Keywords',
      lines: [...draft.targetedKeywords]
    }
  ].filter((section) => section.lines.length > 0)
}

function normalizeProfileBeforeSave(
  currentProfile: CandidateProfile,
  nextProfile: CandidateProfile
): CandidateProfile {
  const resumeChanged =
    currentProfile.baseResume.id !== nextProfile.baseResume.id ||
    currentProfile.baseResume.storagePath !== nextProfile.baseResume.storagePath ||
    currentProfile.baseResume.textContent !== nextProfile.baseResume.textContent

  if (!resumeChanged) {
    return CandidateProfileSchema.parse(nextProfile)
  }

  const nextResumeText = nextProfile.baseResume.textContent

  return CandidateProfileSchema.parse({
    ...nextProfile,
    baseResume: {
      ...nextProfile.baseResume,
      textUpdatedAt: nextResumeText ? new Date().toISOString() : null,
      extractionStatus: nextResumeText ? 'not_started' : 'needs_text',
      lastAnalyzedAt: null,
      analysisWarnings: []
    }
  })
}

function buildExtractionId(
  prefix: string,
  index: number,
  parts: ReadonlyArray<string | null | undefined>
): string {
  const slug = parts
    .map((part) => normalizeText(part ?? '').replaceAll(' ', '_'))
    .filter(Boolean)
    .join('_')
    .slice(0, 48)

  return `${prefix}_${slug || index + 1}`
}

function normalizeRecordKey(parts: ReadonlyArray<string | null | undefined>): string {
  return parts.map((part) => normalizeText(part ?? '')).filter(Boolean).join('|')
}

function toValidUrlOrNull(value: string | null | undefined): string | null {
  if (!value) {
    return null
  }

  try {
    return new URL(value).toString()
  } catch {
    return null
  }
}

function parseLocationParts(location: string | null | undefined): {
  currentCity: string | null
  currentRegion: string | null
  currentCountry: string | null
} {
  if (!location) {
    return {
      currentCity: null,
      currentRegion: null,
      currentCountry: null
    }
  }

  const parts = location.split(',').map((part) => part.trim()).filter(Boolean)

  if (parts.length === 0) {
    return {
      currentCity: null,
      currentRegion: null,
      currentCountry: null
    }
  }

  if (parts.length === 1) {
    return {
      currentCity: parts[0] ?? null,
      currentRegion: null,
      currentCountry: null
    }
  }

  if (parts.length === 2) {
    return {
      currentCity: parts[0] ?? null,
      currentRegion: parts[1] ?? null,
      currentCountry: null
    }
  }

  return {
    currentCity: parts[0] ?? null,
    currentRegion: parts[1] ?? null,
    currentCountry: parts[parts.length - 1] ?? null
  }
}

function mergeExperienceRecords(
  existing: CandidateProfile['experiences'],
  extracted: ResumeProfileExtraction['experiences']
): CandidateProfile['experiences'] {
  if (extracted.length === 0) {
    return existing
  }

  const existingByKey = new Map(
    existing.map((entry) => [normalizeRecordKey([entry.companyName, entry.title, entry.startDate]), entry])
  )

  return extracted.map((entry, index) => {
    const key = normalizeRecordKey([entry.companyName, entry.title, entry.startDate])
    const match = existingByKey.get(key)

    return {
      id: match?.id ?? buildExtractionId('experience', index, [entry.companyName, entry.title, entry.startDate]),
      companyName: entry.companyName,
      companyUrl: entry.companyUrl,
      title: entry.title,
      employmentType: entry.employmentType,
      location: entry.location,
      workMode: entry.workMode ? [entry.workMode] : [],
      startDate: entry.startDate,
      endDate: entry.endDate,
      isCurrent: entry.isCurrent,
      isDraft: !entry.companyName && !entry.title,
      summary: entry.summary,
      achievements: uniqueStrings(entry.achievements),
      skills: uniqueStrings(entry.skills),
      domainTags: uniqueStrings(entry.domainTags),
      peopleManagementScope: entry.peopleManagementScope,
      ownershipScope: entry.ownershipScope
    }
  })
}

function mergeEducationRecords(
  existing: CandidateProfile['education'],
  extracted: ResumeProfileExtraction['education']
): CandidateProfile['education'] {
  if (extracted.length === 0) {
    return existing
  }

  const existingByKey = new Map(
    existing.map((entry) => [normalizeRecordKey([entry.schoolName, entry.degree, entry.startDate]), entry])
  )

  return extracted.map((entry, index) => {
    const key = normalizeRecordKey([entry.schoolName, entry.degree, entry.startDate])
    const match = existingByKey.get(key)

    return {
      id: match?.id ?? buildExtractionId('education', index, [entry.schoolName, entry.degree, entry.startDate]),
      schoolName: entry.schoolName,
      degree: entry.degree,
      fieldOfStudy: entry.fieldOfStudy,
      location: entry.location,
      startDate: entry.startDate,
      endDate: entry.endDate,
      isDraft: !entry.schoolName,
      summary: entry.summary
    }
  })
}

function mergeCertificationRecords(
  existing: CandidateProfile['certifications'],
  extracted: ResumeProfileExtraction['certifications']
): CandidateProfile['certifications'] {
  if (extracted.length === 0) {
    return existing
  }

  const existingByKey = new Map(
    existing.map((entry) => [normalizeRecordKey([entry.name, entry.issuer, entry.issueDate]), entry])
  )

  return extracted.map((entry, index) => {
    const key = normalizeRecordKey([entry.name, entry.issuer, entry.issueDate])
    const match = existingByKey.get(key)

    return {
      id: match?.id ?? buildExtractionId('certification', index, [entry.name, entry.issuer, entry.issueDate]),
      name: entry.name,
      issuer: entry.issuer,
      issueDate: entry.issueDate,
      expiryDate: entry.expiryDate,
      credentialUrl: toValidUrlOrNull(entry.credentialUrl),
      isDraft: !entry.name
    }
  })
}

function mergeLinkRecords(
  existing: CandidateProfile['links'],
  extracted: ResumeProfileExtraction['links']
): CandidateProfile['links'] {
  if (extracted.length === 0) {
    return existing
  }

  const existingByKey = new Map(existing.map((entry) => [normalizeRecordKey([entry.url]), entry]))
  const nextLinks: CandidateProfile['links'] = []

  extracted.forEach((entry, index) => {
    const url = toValidUrlOrNull(entry.url)

    if (!url) {
      return
    }

    const key = normalizeRecordKey([url])
    const match = existingByKey.get(key)

    nextLinks.push({
      id: match?.id ?? buildExtractionId('link', index, [entry.label, url]),
      label: entry.label,
      url,
      kind: entry.kind,
      isDraft: !entry.label || !url
    })
  })

  return nextLinks.length === 0 ? existing : nextLinks
}

function mergeProjectRecords(
  existing: CandidateProfile['projects'],
  extracted: ResumeProfileExtraction['projects']
): CandidateProfile['projects'] {
  if (extracted.length === 0) {
    return existing
  }

  const existingByKey = new Map(existing.map((entry) => [normalizeRecordKey([entry.name, entry.role]), entry]))

  const nextProjects = extracted
    .map((entry, index) => {
      if (!entry.name) {
        return null
      }

      const key = normalizeRecordKey([entry.name, entry.role])
      const match = existingByKey.get(key)

      return {
        id: match?.id ?? buildExtractionId('project', index, [entry.name, entry.role]),
        name: entry.name,
        projectType: entry.projectType,
        summary: entry.summary,
        role: entry.role,
        skills: uniqueStrings(entry.skills),
        outcome: entry.outcome,
        projectUrl: entry.projectUrl,
        repositoryUrl: entry.repositoryUrl,
        caseStudyUrl: entry.caseStudyUrl
      }
    })
    .filter((entry): entry is CandidateProfile['projects'][number] => entry !== null)

  return nextProjects.length === 0 ? existing : nextProjects
}

function mergeLanguageRecords(
  existing: CandidateProfile['spokenLanguages'],
  extracted: ResumeProfileExtraction['spokenLanguages']
): CandidateProfile['spokenLanguages'] {
  if (extracted.length === 0) {
    return existing
  }

  const existingByKey = new Map(existing.map((entry) => [normalizeRecordKey([entry.language]), entry]))

  const nextLanguages = extracted
    .map((entry, index) => {
      if (!entry.language) {
        return null
      }

      const key = normalizeRecordKey([entry.language])
      const match = existingByKey.get(key)

      return {
        id: match?.id ?? buildExtractionId('language', index, [entry.language]),
        language: entry.language,
        proficiency: entry.proficiency,
        interviewPreference: entry.interviewPreference,
        notes: entry.notes
      }
    })
    .filter((entry): entry is CandidateProfile['spokenLanguages'][number] => entry !== null)

  return nextLanguages.length === 0 ? existing : nextLanguages
}

function mergeResumeExtractionIntoWorkspace(
  profile: CandidateProfile,
  searchPreferences: JobSearchPreferences,
  extraction: ResumeProfileExtraction
): {
  profile: CandidateProfile
  searchPreferences: JobSearchPreferences
} {
  const profileTargetRoles =
    extraction.targetRoles.length > 0 ? uniqueStrings(extraction.targetRoles) : profile.targetRoles
  const locationFallback = extraction.currentLocation ?? profile.currentLocation
  const profileLocations =
    extraction.preferredLocations.length > 0
      ? uniqueStrings(extraction.preferredLocations)
      : profile.locations.length > 0
        ? profile.locations
        : uniqueStrings([locationFallback])
  const preferenceLocations =
    extraction.preferredLocations.length > 0
      ? uniqueStrings(extraction.preferredLocations)
      : searchPreferences.locations.length > 0
        ? searchPreferences.locations
        : profileLocations
  const locationParts = parseLocationParts(extraction.currentLocation ?? profile.currentLocation)
  const mergedSkills = uniqueStrings([
    ...extraction.skills,
    ...extraction.skillGroups.coreSkills,
    ...extraction.skillGroups.tools,
    ...extraction.skillGroups.languagesAndFrameworks,
    ...extraction.skillGroups.highlightedSkills,
    ...extraction.skillGroups.softSkills
  ])

  return {
    profile: CandidateProfileSchema.parse({
      ...profile,
      firstName: extraction.firstName ?? profile.firstName,
      lastName: extraction.lastName ?? profile.lastName,
      middleName: extraction.middleName ?? profile.middleName,
      fullName: extraction.fullName ?? profile.fullName,
      headline: extraction.headline ?? profile.headline,
      summary: extraction.summary ?? profile.summary,
      currentLocation: extraction.currentLocation ?? profile.currentLocation,
      currentCity: locationParts.currentCity ?? profile.currentCity,
      currentRegion: locationParts.currentRegion ?? profile.currentRegion,
      currentCountry: locationParts.currentCountry ?? profile.currentCountry,
      timeZone: extraction.timeZone ?? profile.timeZone,
      yearsExperience: extraction.yearsExperience ?? profile.yearsExperience,
      email: extraction.email,
      phone: extraction.phone,
      portfolioUrl: extraction.portfolioUrl,
      linkedinUrl: extraction.linkedinUrl,
      githubUrl: extraction.githubUrl ?? profile.githubUrl,
      personalWebsiteUrl: extraction.personalWebsiteUrl ?? profile.personalWebsiteUrl,
      professionalSummary: {
        ...profile.professionalSummary,
        shortValueProposition:
          extraction.professionalSummary.shortValueProposition ??
          profile.professionalSummary.shortValueProposition,
        fullSummary:
          extraction.professionalSummary.fullSummary ?? extraction.summary ?? profile.professionalSummary.fullSummary,
        careerThemes:
          extraction.professionalSummary.careerThemes.length > 0
            ? uniqueStrings(extraction.professionalSummary.careerThemes)
            : profile.professionalSummary.careerThemes,
        leadershipSummary:
          extraction.professionalSummary.leadershipSummary ?? profile.professionalSummary.leadershipSummary,
        domainFocusSummary:
          extraction.professionalSummary.domainFocusSummary ?? profile.professionalSummary.domainFocusSummary,
        strengths:
          extraction.professionalSummary.strengths.length > 0
            ? uniqueStrings(extraction.professionalSummary.strengths)
            : profile.professionalSummary.strengths
      },
      skillGroups: {
        coreSkills:
          extraction.skillGroups.coreSkills.length > 0
            ? uniqueStrings(extraction.skillGroups.coreSkills)
            : profile.skillGroups.coreSkills,
        tools:
          extraction.skillGroups.tools.length > 0
            ? uniqueStrings(extraction.skillGroups.tools)
            : profile.skillGroups.tools,
        languagesAndFrameworks:
          extraction.skillGroups.languagesAndFrameworks.length > 0
            ? uniqueStrings(extraction.skillGroups.languagesAndFrameworks)
            : profile.skillGroups.languagesAndFrameworks,
        softSkills:
          extraction.skillGroups.softSkills.length > 0
            ? uniqueStrings(extraction.skillGroups.softSkills)
            : profile.skillGroups.softSkills,
        highlightedSkills:
          extraction.skillGroups.highlightedSkills.length > 0
            ? uniqueStrings(extraction.skillGroups.highlightedSkills)
            : profile.skillGroups.highlightedSkills
      },
      targetRoles: profileTargetRoles,
      locations: profileLocations,
      skills: mergedSkills.length > 0 ? mergedSkills : profile.skills,
      experiences: mergeExperienceRecords(profile.experiences, extraction.experiences),
      education: mergeEducationRecords(profile.education, extraction.education),
      certifications: mergeCertificationRecords(profile.certifications, extraction.certifications),
      links: mergeLinkRecords(profile.links, extraction.links),
      projects: mergeProjectRecords(profile.projects, extraction.projects),
      spokenLanguages: mergeLanguageRecords(profile.spokenLanguages, extraction.spokenLanguages),
      baseResume: {
        ...profile.baseResume,
        extractionStatus: 'ready',
        lastAnalyzedAt: new Date().toISOString(),
        analysisProviderKind: extraction.analysisProviderKind,
        analysisProviderLabel: extraction.analysisProviderLabel,
        analysisWarnings: uniqueStrings(extraction.notes)
      }
    }),
    searchPreferences: JobSearchPreferencesSchema.parse({
      ...searchPreferences,
      targetRoles:
        extraction.targetRoles.length > 0
          ? uniqueStrings(extraction.targetRoles)
          : searchPreferences.targetRoles.length > 0
            ? searchPreferences.targetRoles
            : profileTargetRoles,
      locations: preferenceLocations,
      salaryCurrency: extraction.salaryCurrency ?? searchPreferences.salaryCurrency
    })
  }
}

function nextAssetVersion(existingAsset: TailoredAsset | undefined): string {
  if (!existingAsset) {
    return 'v1'
  }

  const numericPortion = Number(existingAsset.version.replace(/^v/i, ''))

  if (Number.isNaN(numericPortion)) {
    return 'v1'
  }

  return `v${numericPortion + 1}`
}

function mergeEvents(
  existingEvents: readonly ApplicationEvent[],
  additionalEvents: readonly ApplicationEvent[]
): ApplicationEvent[] {
  const merged = new Map(existingEvents.map((event) => [event.id, event]))

  for (const event of additionalEvents) {
    merged.set(event.id, event)
  }

  return [...merged.values()].sort(
    (left, right) => new Date(right.at).getTime() - new Date(left.at).getTime()
  )
}

function toApplicationEvents(
  job: SavedJob,
  checkpoints: ApplicationAttempt['checkpoints']
): ApplicationEvent[] {
  return checkpoints.map((checkpoint) => ({
    id: `event_${checkpoint.id}`,
    at: checkpoint.at,
    title: checkpoint.label,
    detail: `${checkpoint.detail} (${job.company})`,
    emphasis:
      checkpoint.state === 'submitted'
        ? 'positive'
        : checkpoint.state === 'paused' || checkpoint.state === 'unsupported'
          ? 'warning'
          : checkpoint.state === 'failed'
            ? 'critical'
            : 'neutral'
  }))
}

function nextJobStatusFromAttempt(job: SavedJob, attemptState: ApplicationAttempt['state']): ApplicationStatus {
  switch (attemptState) {
    case 'submitted':
      return 'submitted'
    case 'paused':
    case 'unsupported':
    case 'failed':
      return 'approved'
    default:
      return job.status
  }
}

export interface JobFinderWorkspaceService {
  getWorkspaceSnapshot(): Promise<JobFinderWorkspaceSnapshot>
  openBrowserSession(): Promise<JobFinderWorkspaceSnapshot>
  checkBrowserSession(): Promise<JobFinderWorkspaceSnapshot>
  resetWorkspace(seed: JobFinderRepositorySeed): Promise<JobFinderWorkspaceSnapshot>
  saveProfile(profile: CandidateProfile): Promise<JobFinderWorkspaceSnapshot>
  saveProfileAndSearchPreferences(
    profile: CandidateProfile,
    searchPreferences: JobSearchPreferences
  ): Promise<JobFinderWorkspaceSnapshot>
  analyzeProfileFromResume(): Promise<JobFinderWorkspaceSnapshot>
  saveSearchPreferences(searchPreferences: JobSearchPreferences): Promise<JobFinderWorkspaceSnapshot>
  saveSettings(settings: JobFinderSettings): Promise<JobFinderWorkspaceSnapshot>
  runDiscovery(): Promise<JobFinderWorkspaceSnapshot>
  runAgentDiscovery(onActivity?: (event: DiscoveryActivityEvent) => void, signal?: AbortSignal): Promise<JobFinderWorkspaceSnapshot>
  runSourceDebug(targetId: string, signal?: AbortSignal): Promise<JobFinderWorkspaceSnapshot>
  cancelSourceDebug(runId: string): Promise<JobFinderWorkspaceSnapshot>
  getSourceDebugRun(runId: string): Promise<SourceDebugRunRecord>
  getSourceDebugRunDetails(runId: string): Promise<SourceDebugRunDetails>
  listSourceDebugRuns(targetId: string): Promise<readonly SourceDebugRunRecord[]>
  saveSourceInstructionArtifact(targetId: string, artifact: SourceInstructionArtifact): Promise<JobFinderWorkspaceSnapshot>
  acceptSourceInstructionDraft(targetId: string, instructionId: string): Promise<JobFinderWorkspaceSnapshot>
  verifySourceInstructions(targetId: string, instructionId: string, signal?: AbortSignal): Promise<JobFinderWorkspaceSnapshot>
  queueJobForReview(jobId: string): Promise<JobFinderWorkspaceSnapshot>
  dismissDiscoveryJob(jobId: string): Promise<JobFinderWorkspaceSnapshot>
  generateResume(jobId: string): Promise<JobFinderWorkspaceSnapshot>
  approveApply(jobId: string): Promise<JobFinderWorkspaceSnapshot>
}

export interface RenderedResumeArtifact {
  fileName: string | null
  storagePath: string | null
}

export interface JobFinderDocumentManager {
  listResumeTemplates(): readonly ResumeTemplateDefinition[]
  renderResumeArtifact(input: {
    job: SavedJob
    profile: CandidateProfile
    previewSections: Array<{ heading: string; lines: string[] }>
    settings: JobFinderSettings
    textContent: string
  }): Promise<RenderedResumeArtifact>
}

export interface CreateJobFinderWorkspaceServiceOptions {
  aiClient: JobFinderAiClient
  documentManager: JobFinderDocumentManager
  repository: JobFinderRepository
  browserRuntime: BrowserSessionRuntime
}

export function createJobFinderWorkspaceService(
  options: CreateJobFinderWorkspaceServiceOptions
): JobFinderWorkspaceService {
  const { aiClient, browserRuntime, documentManager, repository } = options
  let activeSourceDebugExecutionId: string | null = null
  let activeSourceDebugAbortController: AbortController | null = null

  function mergeSessionStates(
    currentSessions: ReadonlyArray<JobFinderDiscoveryState['sessions'][number]>,
    nextSession: JobFinderDiscoveryState['sessions'][number]
  ): JobFinderDiscoveryState['sessions'] {
    const nextByKind = new Map(currentSessions.map((session) => [session.adapterKind, session]))
    nextByKind.set(nextSession.adapterKind, nextSession)
    return [...nextByKind.values()]
  }

  function mergePendingJobs(currentJobs: readonly SavedJob[], nextJobs: readonly SavedJob[]): SavedJob[] {
    const nextById = new Map(currentJobs.map((job) => [job.id, job]))
    for (const job of nextJobs) {
      nextById.set(job.id, job)
    }
    return [...nextById.values()].sort((left, right) => right.matchAssessment.score - left.matchAssessment.score)
  }

  function mergeSavedJobs(currentJobs: readonly SavedJob[], nextJobs: readonly SavedJob[]): SavedJob[] {
    const nextById = new Map(currentJobs.map((job) => [job.id, job]))
    for (const job of nextJobs) {
      nextById.set(job.id, job)
    }
    return [...nextById.values()]
  }

  function overlayTouchedSavedJobs(
    currentJobs: readonly SavedJob[],
    nextJobs: readonly SavedJob[],
    touchedIds: ReadonlySet<string>
  ): SavedJob[] {
    return mergeSavedJobs(
      currentJobs.filter((job) => !touchedIds.has(job.id)),
      nextJobs.filter((job) => touchedIds.has(job.id))
    )
  }

  function overlayTouchedPendingJobs(
    currentJobs: readonly SavedJob[],
    nextJobs: readonly SavedJob[],
    touchedIds: ReadonlySet<string>
  ): SavedJob[] {
    return mergePendingJobs(
      currentJobs.filter((job) => !touchedIds.has(job.id)),
      nextJobs.filter((job) => touchedIds.has(job.id))
    )
  }

  function createBrowserSessionSnapshot(
    sessions: ReadonlyArray<JobFinderDiscoveryState['sessions'][number]>,
    preferredAdapter: JobSource
  ) {
    const preferredSession = sessions.find((session) => session.adapterKind === preferredAdapter) ?? sessions[0]

    if (preferredSession) {
      return {
        source: preferredSession.adapterKind,
        status: preferredSession.status,
        driver: preferredSession.driver,
        label: preferredSession.label,
        detail: preferredSession.detail,
        lastCheckedAt: preferredSession.lastCheckedAt
      }
    }

    return {
      source: preferredAdapter,
      status: 'unknown' as const,
      driver: 'catalog_seed' as const,
      label: 'Session status unavailable',
      detail: 'No discovery adapter session has been initialized yet.',
      lastCheckedAt: new Date(0).toISOString()
    }
  }

  async function persistDiscoveryState(
    updater: (current: JobFinderDiscoveryState) => JobFinderDiscoveryState
  ): Promise<JobFinderDiscoveryState> {
    const current = await repository.getDiscoveryState()
    const next = JobFinderDiscoveryStateSchema.parse(updater(current))
    await repository.saveDiscoveryState(next)
    return next
  }

  async function refreshDiscoverySessions(searchPreferences: JobSearchPreferences): Promise<JobFinderDiscoveryState['sessions']> {
    const targets = getActiveDiscoveryTargets(searchPreferences)
    const adapterKinds = uniqueStrings(targets.map((target) => resolveAdapterKind(target))) as JobSource[]
    const currentDiscovery = await repository.getDiscoveryState()
    let nextSessions = currentDiscovery.sessions

    if (adapterKinds.length === 0) {
      return []
    }

    const sessionKinds: JobSource[] = adapterKinds

    for (const adapterKind of sessionKinds) {
      try {
        const session = await browserRuntime.getSessionState(adapterKind)
        nextSessions = mergeSessionStates(nextSessions, toDiscoverySessionState(session))
      } catch {
        // Keep the last persisted session state if the runtime cannot refresh it right now.
      }
    }

    if (JSON.stringify(nextSessions) !== JSON.stringify(currentDiscovery.sessions)) {
      const latestDiscovery = await repository.getDiscoveryState()

      if (JSON.stringify(nextSessions) !== JSON.stringify(latestDiscovery.sessions)) {
      await repository.saveDiscoveryState(
        JobFinderDiscoveryStateSchema.parse({
          ...latestDiscovery,
          sessions: nextSessions
        })
      )
      }
    }

    return nextSessions
  }

  function buildSourceInstructionVersionInfo(adapterKind: JobSource) {
    return {
      promptProfileVersion: SOURCE_DEBUG_PROMPT_PROFILE_VERSION,
      toolsetVersion: SOURCE_DEBUG_TOOLSET_VERSION,
      adapterVersion: `${adapterKind}-adapter-v1`,
      appSchemaVersion: SOURCE_DEBUG_APP_SCHEMA_VERSION
    }
  }

  function buildInstructionGuidance(artifact: SourceInstructionArtifact | null): string[] {
    if (!artifact) {
      return []
    }

    return uniqueStrings([
      ...filterSourceInstructionLines(artifact.navigationGuidance),
      ...filterSourceInstructionLines(artifact.searchGuidance),
      ...filterSourceInstructionLines(artifact.detailGuidance),
      ...filterSourceInstructionLines(artifact.applyGuidance),
      ...artifact.warnings.map((warning) => `Warning: ${warning}`)
    ])
  }

  function resolveActiveSourceInstructionArtifact(
    target: JobDiscoveryTarget,
    artifacts: readonly SourceInstructionArtifact[]
  ): SourceInstructionArtifact | null {
    const draftInstruction = target.draftInstructionId
      ? artifacts.find(
          (artifact) =>
            artifact.id === target.draftInstructionId &&
            artifact.targetId === target.id &&
            artifact.status === 'draft'
        ) ?? null
      : null

    if (draftInstruction) {
      return draftInstruction
    }

    return target.validatedInstructionId
      ? artifacts.find(
          (artifact) =>
            artifact.id === target.validatedInstructionId &&
            artifact.targetId === target.id &&
            artifact.status === 'validated'
        ) ?? null
      : null
  }

  function updateDiscoveryTarget(
    searchPreferences: JobSearchPreferences,
    targetId: string,
    updater: (target: JobDiscoveryTarget) => JobDiscoveryTarget
  ): JobSearchPreferences {
    let found = false
    const nextTargets = searchPreferences.discovery.targets.map((target) => {
      if (target.id !== targetId) {
        return target
      }

      found = true
      return updater(target)
    })

    if (!found) {
      throw new Error(`Unknown discovery target '${targetId}'.`)
    }

    return JobSearchPreferencesSchema.parse({
      ...searchPreferences,
      discovery: {
        ...searchPreferences.discovery,
        targets: nextTargets
      }
    })
  }

  async function saveDiscoveryTargetUpdate(
    targetId: string,
    updater: (target: JobDiscoveryTarget) => JobDiscoveryTarget
  ): Promise<JobSearchPreferences> {
    const searchPreferences = await repository.getSearchPreferences()
    const nextSearchPreferences = updateDiscoveryTarget(searchPreferences, targetId, updater)
    await repository.saveSearchPreferences(nextSearchPreferences)
    return nextSearchPreferences
  }

  async function persistSourceDebugRun(run: SourceDebugRunRecord): Promise<void> {
    await repository.upsertSourceDebugRun(run)
    await persistDiscoveryState((current) => ({
      ...current,
      activeSourceDebugRun:
        run.state === 'running' || run.state === 'paused_manual'
          ? run
          : current.activeSourceDebugRun?.id === run.id
            ? null
            : current.activeSourceDebugRun,
      recentSourceDebugRuns: [run, ...current.recentSourceDebugRuns.filter((entry) => entry.id !== run.id)].slice(
        0,
        SOURCE_DEBUG_RECENT_HISTORY_LIMIT
      )
    }))
  }

  async function persistBrowserSessionState(session: Awaited<ReturnType<BrowserSessionRuntime['openSession']>>): Promise<void> {
    await persistDiscoveryState((current) => ({
      ...current,
      sessions: mergeSessionStates(current.sessions, toDiscoverySessionState(session))
    }))
  }

  async function openRunBrowserSession(source: JobSource): Promise<void> {
    const session = await browserRuntime.openSession(source)
    await persistBrowserSessionState(session)
  }

  async function closeRunBrowserSession(source: JobSource): Promise<void> {
    const session = await browserRuntime.closeSession(source)
    await persistBrowserSessionState(session)
  }

  function buildSourceDebugPhasePacket(
    phase: SourceDebugPhase,
    phaseSummaries: readonly SourceDebugPhaseSummary[],
    strategyFingerprintHistory: readonly string[],
    manualPrerequisiteState: string | null
  ) {
    const priorPhaseSummary = phaseSummaries[phaseSummaries.length - 1]?.summary ?? null
    const knownFacts = uniqueStrings(phaseSummaries.flatMap((summary) => summary.confirmedFacts))
    const phaseGoalByPhase: Record<SourceDebugPhase, string> = {
      access_auth_probe: 'Verify whether the site is reachable, bounded to the hostname, and blocked by auth or consent.',
      site_structure_mapping: 'Map the jobs landing path, result list route, and likely job detail path.',
      search_filter_probe: 'Find search controls or filters that change the result set in a reliable way.',
      job_detail_validation: 'Open multiple job details and confirm stable identity and canonical URLs.',
      apply_path_validation: 'Check whether discovered jobs expose a stable apply path and capture safe apply guidance without submitting.',
      replay_verification: 'Replay the learned guidance from scratch and prove it still reaches jobs and details.'
    }
    const successCriteriaByPhase: Record<SourceDebugPhase, string[]> = {
      access_auth_probe: ['Reach the target site safely', 'Detect login or manual blockers honestly'],
      site_structure_mapping: [
        'Find the best repeatable jobs/result path',
        'Identify a plausible detail path',
        'Check whether recommendation rows, curated collections, or show-all links lead to reusable job lists'
      ],
      search_filter_probe: [
        'Probe the obvious visible search box plus the first visible filters on the homepage and jobs/results route when those surfaces exist',
        'Prove at least one search, filter, recommendation route, pagination pattern, or result-expansion control changes the result set, or record that none could be confirmed',
        'Record stable search/filter behavior and any misleading or decorative controls'
      ],
      job_detail_validation: ['Open multiple job details', 'Confirm stable job identity or URL patterns'],
      apply_path_validation: ['Identify the apply path exposed by the source', 'Record safe apply-entry guidance without submitting'],
      replay_verification: ['Reach jobs again from scratch', 'Open details and recover stable identity again']
    }
    const phaseStopConditionsByPhase: Partial<Record<SourceDebugPhase, string[]>> = {
      search_filter_probe: [
        'Do not stop before checking the obvious visible search controls and top-level filters unless auth or site protection blocks progress.',
        'If recommendation chips, curated collections, or show-all links are visible, check whether at least one leads to a reusable preselected list before stopping.'
      ]
    }

    return {
      phaseGoal: phaseGoalByPhase[phase],
      knownFacts,
      priorPhaseSummary,
      avoidStrategyFingerprints: [...strategyFingerprintHistory],
      successCriteria: successCriteriaByPhase[phase],
      stopConditions: [
        'Stop when progress stalls and no new evidence is produced.',
        'Stop immediately if auth or a manual prerequisite blocks safe progress.',
        ...(phaseStopConditionsByPhase[phase] ?? [])
      ],
      manualPrerequisiteState,
      strategyLabel: formatStatusLabel(phase)
    }
  }

  function composeSourceDebugInstructions(
    target: JobDiscoveryTarget,
    adapter: ResolvedDiscoveryAdapter,
    phase: SourceDebugPhase,
    instructionArtifact: SourceInstructionArtifact | null,
    phasePacket: ReturnType<typeof buildSourceDebugPhasePacket>
  ): string[] {
    const phaseInstructionsByPhase: Record<SourceDebugPhase, string[]> = {
      access_auth_probe: [
        'Determine whether the site can be accessed normally or whether login, consent, or a manual prerequisite blocks progress.',
        'Do not guess credentials or attempt to bypass protected flows.'
      ],
      site_structure_mapping: [
        'Favor finding the main jobs landing page, results list, and detail path over collecting a large set of postings.',
        'If the starting page already lists jobs directly, treat that landing page as a valid jobs surface before assuming a separate jobs route is required.',
        'If the starting page is more general than a jobs page, first look for visible jobs, careers, openings, vacancies, or show-all entry paths.',
        'Inspect the first visible landing surface for top-of-page controls before using extracted jobs as proof of the best route.',
        'Record stable route patterns and navigation anchors.',
        'On jobs hubs that open on recommendation modules first, follow a reusable Show all or collection route before deciding the landing page is the best entry path.',
        'If the homepage or jobs route exposes recommendation rows, curated collections, or show-all links, check whether they lead to a reusable list path and record the best one.',
        'Before finishing, capture the best repeatable entry path to the jobs list, especially if it is not the homepage.'
      ],
      search_filter_probe: [
        'Prefer actions that change the result set in observable ways.',
        'Inspect the visible controls on the current landing surface before using extracted jobs as evidence that no search/filter UI exists.',
        'If the visible search or filter controls are likely above the current scroll position, return to the top of the page and probe them before concluding they are missing.',
        'Explicitly test the obvious search box and the first visible location, industry, category, or work-mode filters when they are present.',
        'On jobs landing pages that start with recommendation cards, follow Show all or a reusable collection first if that reveals the fuller search/filter surface.',
        'Prefer visible search boxes, buttons, chips, dropdowns, and filter bars over inventing URL parameter recipes. Only keep a direct URL pattern if the visible UI is blocked or genuinely less reliable.',
        'If the jobs page exposes recommendation chips, curated collections, or show-all links, test whether they open reusable preselected result lists.',
        'Record which search inputs, recommendation routes, filters, pagination controls, or infinite-scroll behaviors appear reliable.',
        'If a filter is hidden, locale-specific, resets unexpectedly, or appears not to affect results, record that as a site-specific gotcha.',
        'If a visible control looks promising but does not change jobs, say that explicitly instead of omitting it.',
        'Before finishing, either prove one reliable search/filter control or state clearly that no reliable control could be confirmed after trying alternatives.'
      ],
      job_detail_validation: [
        'Open multiple job detail pages and confirm stable identity hints before trusting extraction.',
        'Prefer canonical URLs over transient result-card state.',
        'Record whether job cards open inline, in-place, in a new page, or require a second click to reach the canonical detail view.'
      ],
      apply_path_validation: [
        'Focus on whether the source exposes an inline apply button, external apply link, or no usable apply path.',
        'Do not submit an application; only capture safe apply-entry guidance and blockers.',
        'If apply requires a specific button, modal, or redirect pattern, record that exact entry behavior.'
      ],
      replay_verification: [
        'Start fresh from the beginning and follow the learned guidance rather than exploratory behavior.',
        'Only treat the instructions as validated if they work again.'
      ]
    }

    return uniqueStrings([
      ...adapter.siteInstructions,
      ...buildInstructionGuidance(instructionArtifact),
      ...phaseInstructionsByPhase[phase],
      ...splitCustomDiscoveryInstructions(target.customInstructions),
      ...phasePacket.knownFacts.map((fact) => `Known fact: ${fact}`)
    ])
  }

  function classifySourceDebugAttemptOutcome(
    result: Awaited<ReturnType<NonNullable<BrowserSessionRuntime['runAgentDiscovery']>>>,
    phase: SourceDebugPhase
  ): SourceDebugWorkerAttempt['outcome'] {
    const warning = (result.warning ?? '').toLowerCase()

    if (warning.includes('login') || warning.includes('session is not ready')) {
      return 'blocked_auth'
    }

    if (warning.includes('manual') || warning.includes('consent')) {
      return 'blocked_manual_step'
    }

    if (warning.includes('unsupported') || warning.includes('stable identity') || warning.includes('low-confidence')) {
      return 'unsupported_layout'
    }

    if (phase === 'apply_path_validation' && result.jobs.every((job) => job.applyPath === 'unknown')) {
      return warning ? 'partial' : 'exhausted_no_progress'
    }

    if (result.jobs.length === 0) {
      return phase === 'replay_verification' ? 'exhausted_no_progress' : 'partial'
    }

    if (warning) {
      return 'partial'
    }

    return 'succeeded'
  }

  function resolveSourceDebugCompletion(
    result: Awaited<ReturnType<NonNullable<BrowserSessionRuntime['runAgentDiscovery']>>>
  ): {
    completionMode: SourceDebugPhaseCompletionMode
    completionReason: string | null
    phaseEvidence: SourceDebugPhaseEvidence | null
  } {
    const warning = result.warning ?? null
    const metadata = result.agentMetadata

    if (metadata?.phaseCompletionMode) {
      return {
        completionMode: metadata.phaseCompletionMode,
        completionReason: metadata.phaseCompletionReason ?? warning,
        phaseEvidence: metadata.phaseEvidence ?? null
      }
    }

    const normalizedWarning = normalizeText(warning ?? '')

    if (normalizedWarning.includes('login') || normalizedWarning.includes('session is not ready')) {
      return {
        completionMode: 'blocked_auth',
        completionReason: warning,
        phaseEvidence: metadata?.phaseEvidence ?? null
      }
    }

    if (normalizedWarning.includes('manual') || normalizedWarning.includes('consent')) {
      return {
        completionMode: 'blocked_manual_step',
        completionReason: warning,
        phaseEvidence: metadata?.phaseEvidence ?? null
      }
    }

    if (normalizedWarning.includes('interrupted')) {
      return {
        completionMode: 'interrupted',
        completionReason: warning,
        phaseEvidence: metadata?.phaseEvidence ?? null
      }
    }

    if (warning) {
      return {
        completionMode: result.jobs.length > 0 ? 'timed_out_with_partial_evidence' : 'runtime_failed',
        completionReason: warning,
        phaseEvidence: metadata?.phaseEvidence ?? null
      }
    }

    return {
      completionMode: 'structured_finish',
      completionReason: null,
      phaseEvidence: metadata?.phaseEvidence ?? null
    }
  }

  function buildSourceDebugPhaseSummary(attempt: SourceDebugWorkerAttempt): SourceDebugPhaseSummary {
    return SourceDebugPhaseSummarySchema.parse({
      phase: attempt.phase,
      summary: attempt.resultSummary,
      completionMode: attempt.completionMode,
      completionReason: attempt.completionReason,
      confirmedFacts: attempt.confirmedFacts,
      blockerNotes: attempt.blockerSummary ? [attempt.blockerSummary] : [],
      nextRecommendedStrategies: attempt.nextRecommendedStrategies,
      avoidStrategyFingerprints: attempt.avoidStrategyFingerprints,
      producedAttemptIds: [attempt.id]
    })
  }

  function getSourceDebugTargetJobCount(phase: SourceDebugPhase): number {
    switch (phase) {
      case 'access_auth_probe':
        return 1
      case 'site_structure_mapping':
      case 'search_filter_probe':
        return 2
      case 'job_detail_validation':
      case 'apply_path_validation':
      case 'replay_verification':
        return 2
      default:
        return 1
    }
  }

  function getSourceDebugMaxSteps(phase: SourceDebugPhase): number {
    switch (phase) {
      case 'access_auth_probe':
        return 16
      case 'site_structure_mapping':
        return 24
      case 'search_filter_probe':
        return 36
      case 'job_detail_validation':
      case 'apply_path_validation':
      case 'replay_verification':
        return 24
      default:
        return 22
    }
  }

  function synthesizeSourceInstructionArtifact(
    target: JobDiscoveryTarget,
    run: SourceDebugRunRecord,
    attempts: readonly SourceDebugWorkerAttempt[],
    adapterKind: JobSource,
    verification: SourceInstructionArtifact['verification'],
    reviewOverride?: SourceInstructionReviewOverride | null
  ): SourceInstructionArtifact {
    const byPhase = new Map(attempts.map((attempt) => [attempt.phase, attempt]))
    const accessAttempt = byPhase.get('access_auth_probe')
    const structureAttempt = byPhase.get('site_structure_mapping')
    const searchAttempt = byPhase.get('search_filter_probe')
    const detailAttempt = byPhase.get('job_detail_validation')
    const applyAttempt = byPhase.get('apply_path_validation')
    const hasPartialTimeoutEvidence = attempts.some((attempt) => attempt.completionMode === 'timed_out_with_partial_evidence')
    const hasUnstructuredFailure = attempts.some((attempt) =>
      attempt.completionMode === 'timed_out_without_evidence' ||
      attempt.completionMode === 'runtime_failed' ||
      attempt.completionMode === 'interrupted'
    )
    const draftWarnings = filterSourceDebugWarnings(
      attempts.flatMap((attempt) => [attempt.blockerSummary])
    )
    const usedGuidance = new Set<string>()
    const takeUniqueGuidance = (lines: readonly string[]) =>
      lines.filter((line) => {
        const key = normalizeText(line)

        if (usedGuidance.has(key)) {
          return false
        }

        usedGuidance.add(key)
        return true
      })
    const rawNavigationGuidance = takeUniqueGuidance(uniqueStrings([
      ...collectAttemptInstructionGuidance(accessAttempt),
      ...collectAttemptInstructionGuidance(structureAttempt)
    ]))
    const rawSearchGuidance = takeUniqueGuidance(uniqueStrings([
      ...collectAttemptInstructionGuidance(searchAttempt)
    ]))
    const rawDetailGuidance = takeUniqueGuidance(uniqueStrings([
      ...collectAttemptInstructionGuidance(detailAttempt)
    ]))
    const rawApplyGuidance = takeUniqueGuidance(reconcileApplyGuidance(uniqueStrings([
      ...collectAttemptInstructionGuidance(applyAttempt)
    ])))
    const visibleControlReconciledGuidance = reconcileVisibleControlEvidence({
      attempts,
      navigationGuidance: rawNavigationGuidance,
      searchGuidance: rawSearchGuidance,
      detailGuidance: rawDetailGuidance,
      applyGuidance: rawApplyGuidance
    })
    const reconciledGuidance = reconcileMixedAccessGuidance({
      navigationGuidance: visibleControlReconciledGuidance.navigationGuidance,
      searchGuidance: visibleControlReconciledGuidance.searchGuidance,
      detailGuidance: visibleControlReconciledGuidance.detailGuidance,
      applyGuidance: visibleControlReconciledGuidance.applyGuidance
    })
    const finalReconciledGuidance = reconcileFinalSourceInstructionGuidance({
      navigationGuidance: reconciledGuidance.navigationGuidance,
      searchGuidance: reconciledGuidance.searchGuidance,
      detailGuidance: reconciledGuidance.detailGuidance,
      applyGuidance: reconciledGuidance.applyGuidance
    })
    const reviewedGuidance = reconcileFinalSourceInstructionGuidance({
      navigationGuidance:
        reviewOverride && reviewOverride.navigationGuidance.length > 0
          ? filterSourceInstructionLines(reviewOverride.navigationGuidance)
          : finalReconciledGuidance.navigationGuidance,
      searchGuidance:
        reviewOverride && reviewOverride.searchGuidance.length > 0
          ? filterSourceInstructionLines(reviewOverride.searchGuidance)
          : finalReconciledGuidance.searchGuidance,
      detailGuidance:
        reviewOverride && reviewOverride.detailGuidance.length > 0
          ? filterSourceInstructionLines(reviewOverride.detailGuidance)
          : finalReconciledGuidance.detailGuidance,
      applyGuidance:
        reviewOverride && reviewOverride.applyGuidance.length > 0
          ? filterSourceInstructionLines(reviewOverride.applyGuidance)
          : finalReconciledGuidance.applyGuidance
    })
    const navigationGuidance = reviewedGuidance.navigationGuidance
    const searchGuidance = reviewedGuidance.searchGuidance
    const detailGuidance = reviewedGuidance.detailGuidance
    const applyGuidance = reviewedGuidance.applyGuidance
    const hasPositiveReusableSearchGuidance = searchGuidance.some(isPositiveReusableSearchSignal)
    const hasSearchGuidanceWithoutPositiveProof = searchGuidance.length > 0 && !hasPositiveReusableSearchGuidance
    const hasOnlyVisibilityOrDisproofSearchGuidance =
      searchGuidance.length > 0 &&
      !hasPositiveReusableSearchGuidance &&
      searchGuidance.every((line) => isVisibilityOnlySearchSignal(line) || isExplicitSearchProbeDisproof(line))
    const quality = evaluateSourceInstructionQuality({
      navigationGuidance,
      searchGuidance,
      detailGuidance,
      applyGuidance
    })
    const warnings = uniqueStrings([
      ...filterSourceDebugWarnings(reviewOverride?.warnings ?? []),
      ...draftWarnings,
      ...(hasPartialTimeoutEvidence
        ? ['A source-debug phase timed out before structured conclusion; keep this source in draft until a rerun confirms the partial evidence with an explicit finish.']
        : []),
      ...(hasUnstructuredFailure
        ? ['A source-debug phase ended without structured evidence; keep this source in draft until the failing phase is rerun successfully.']
        : []),
      ...(hasSearchGuidanceWithoutPositiveProof
        ? ['Search and filter behavior is still unproven; this run mentioned controls or routes but did not confirm a positive reusable search/filter action.']
        : []),
      ...(hasOnlyVisibilityOrDisproofSearchGuidance
        ? ['Search and filter behavior is still unproven; visible controls were seen but no reusable result-changing control was confirmed in this run.']
        : []),
      ...reconciledGuidance.warnings,
      ...quality.qualityWarnings
    ])
    const hasPromotionBlocker =
      hasPartialTimeoutEvidence ||
      hasUnstructuredFailure ||
      hasSearchGuidanceWithoutPositiveProof ||
      hasOnlyVisibilityOrDisproofSearchGuidance
    const status = verification?.outcome === 'passed' && quality.qualifiesForValidation && !hasPromotionBlocker
      ? 'validated'
      : warnings.some((warning) => warning.toLowerCase().includes('unsupported'))
        ? 'unsupported'
        : 'draft'

    return SourceInstructionArtifactSchema.parse({
      id: run.instructionArtifactId ?? `source_instruction_${target.id}_${Date.now()}`,
      targetId: target.id,
      status,
      createdAt: attempts[0]?.startedAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      acceptedAt: status === 'validated' ? new Date().toISOString() : null,
      basedOnRunId: run.id,
      basedOnAttemptIds: attempts.map((attempt) => attempt.id),
      notes: run.finalSummary ?? null,
      navigationGuidance,
      searchGuidance,
      detailGuidance,
      applyGuidance,
      warnings,
      versionInfo: buildSourceInstructionVersionInfo(adapterKind),
      verification
    })
  }

  async function getWorkspaceSnapshot(): Promise<JobFinderWorkspaceSnapshot> {
    if (!activeSourceDebugExecutionId) {
      const discoveryState = await repository.getDiscoveryState()
      const activeSourceDebugRun = discoveryState.activeSourceDebugRun

      if (activeSourceDebugRun?.state === 'running') {
        const interruptedRun = SourceDebugRunRecordSchema.parse({
          ...activeSourceDebugRun,
          state: 'interrupted',
          updatedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          finalSummary: activeSourceDebugRun.finalSummary ?? 'Source debug run was interrupted before completion.'
        })

        await repository.upsertSourceDebugRun(interruptedRun)
        await repository.saveDiscoveryState(
          JobFinderDiscoveryStateSchema.parse({
            ...discoveryState,
            activeSourceDebugRun: null,
            recentSourceDebugRuns: [
              interruptedRun,
              ...discoveryState.recentSourceDebugRuns.filter((run) => run.id !== interruptedRun.id)
            ].slice(0, SOURCE_DEBUG_RECENT_HISTORY_LIMIT)
          })
        )
      }
    }

    const [
      profile,
      searchPreferences,
      savedJobs,
      tailoredAssets,
      applicationRecords,
      applicationAttempts,
      sourceInstructionArtifacts,
      settings,
      discovery
    ] = await Promise.all([
      repository.getProfile(),
      repository.getSearchPreferences(),
      repository.listSavedJobs(),
      repository.listTailoredAssets(),
      repository.listApplicationRecords(),
      repository.listApplicationAttempts(),
      repository.listSourceInstructionArtifacts(),
      repository.getSettings(),
      repository.getDiscoveryState()
    ])

    const normalizedSearchPreferences = normalizeSearchPreferences(searchPreferences)
    const discoverySessions = await refreshDiscoverySessions(normalizedSearchPreferences)
    const browserSession = createBrowserSessionSnapshot(
      discoverySessions,
      getPreferredSessionAdapter(normalizedSearchPreferences)
    )

    const persistedDiscoveryJobs = buildDiscoveryJobs(savedJobs)
    const savedJobIds = new Set(savedJobs.map((job) => job.id))
    const mergedPendingJobs = discovery.pendingDiscoveryJobs.filter((job) => !savedJobIds.has(job.id))
    const discoveryJobs = [...persistedDiscoveryJobs, ...mergedPendingJobs].sort(
      (left, right) => right.matchAssessment.score - left.matchAssessment.score
    )
    const reviewQueue = buildReviewQueue(savedJobs, tailoredAssets)
    const orderedApplicationRecords = buildApplicationRecords(applicationRecords)

    return JobFinderWorkspaceSnapshotSchema.parse({
      module: 'job-finder',
      generatedAt: new Date().toISOString(),
      agentProvider: aiClient.getStatus(),
      availableResumeTemplates: documentManager.listResumeTemplates(),
      profile,
      searchPreferences: normalizedSearchPreferences,
      browserSession,
      discoverySessions,
      discoveryRunState: discovery.runState,
      activeDiscoveryRun: discovery.activeRun,
      recentDiscoveryRuns: discovery.recentRuns,
      activeSourceDebugRun: discovery.activeSourceDebugRun,
      recentSourceDebugRuns: discovery.recentSourceDebugRuns,
      discoveryJobs,
      selectedDiscoveryJobId: discoveryJobs[0]?.id ?? null,
      reviewQueue,
      selectedReviewJobId: reviewQueue[0]?.jobId ?? null,
      tailoredAssets,
      applicationRecords: orderedApplicationRecords,
      applicationAttempts,
      sourceInstructionArtifacts,
      selectedApplicationRecordId: orderedApplicationRecords[0]?.id ?? null,
      settings
    })
  }

  async function updateJob(jobId: string, updater: (job: SavedJob) => SavedJob): Promise<void> {
    const savedJobs = await repository.listSavedJobs()
    let found = false
    const nextJobs = savedJobs.map((job) => {
      if (job.id !== jobId) {
        return job
      }

      found = true
      return SavedJobSchema.parse(updater(job))
    })

    if (!found) {
      throw new Error(`Unknown Job Finder job '${jobId}'.`)
    }

    await repository.replaceSavedJobs(nextJobs)
  }

  async function runSourceDebugWorkflow(
    targetId: string,
    signal?: AbortSignal,
    options?: {
      clearExistingInstructions?: boolean
    }
  ): Promise<JobFinderWorkspaceSnapshot> {
    const executionController = new AbortController()
    activeSourceDebugAbortController = executionController
    const onExternalAbort = () => executionController.abort()
    signal?.addEventListener('abort', onExternalAbort)
    const executionSignal = executionController.signal
    const [profile, searchPreferences] = await Promise.all([
      repository.getProfile(),
      repository.getSearchPreferences()
    ])
    const target = searchPreferences.discovery.targets.find((entry) => entry.id === targetId)

    if (!target) {
      throw new Error(`Unknown discovery target '${targetId}'.`)
    }

    const targetUrl = (() => {
      try {
        return new URL(target.startingUrl)
      } catch {
        return null
      }
    })()

    if (!targetUrl) {
      throw new Error(`Target '${target.label}' does not have a valid starting URL.`)
    }

    const clearExistingInstructions = options?.clearExistingInstructions !== false

    if (clearExistingInstructions) {
      await repository.deleteSourceInstructionArtifactsForTarget(target.id)
      await saveDiscoveryTargetUpdate(target.id, (currentTarget) => ({
        ...currentTarget,
        instructionStatus: 'missing',
        validatedInstructionId: null,
        draftInstructionId: null,
        lastVerifiedAt: null,
        staleReason: null
      }))
    }

    const normalizedTarget: JobDiscoveryTarget = clearExistingInstructions
      ? {
          ...target,
          instructionStatus: 'missing',
          validatedInstructionId: null,
          draftInstructionId: null,
          lastVerifiedAt: null,
          staleReason: null
        }
      : target
    const instructionArtifacts = await repository.listSourceInstructionArtifacts()

    const adapterKind = resolveAdapterKind(normalizedTarget)
    const adapter = discoveryAdapters[adapterKind]
    const runId = `source_debug_${normalizedTarget.id}_${Date.now()}`
    activeSourceDebugExecutionId = runId

    let run = SourceDebugRunRecordSchema.parse({
      id: runId,
      targetId: normalizedTarget.id,
      state: 'running',
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: null,
      activePhase: SOURCE_DEBUG_PHASES[0],
      phases: SOURCE_DEBUG_PHASES,
      targetLabel: normalizedTarget.label,
      targetUrl: normalizedTarget.startingUrl,
      targetHostname: targetUrl.hostname,
      manualPrerequisiteSummary: null,
      finalSummary: null,
      attemptIds: [],
      phaseSummaries: [],
      instructionArtifactId: normalizedTarget.draftInstructionId ?? normalizedTarget.validatedInstructionId ?? null
    })

    await persistSourceDebugRun(run)
    await saveDiscoveryTargetUpdate(normalizedTarget.id, (currentTarget) => ({
      ...currentTarget,
      lastDebugRunId: run.id
    }))

    const attempts: SourceDebugWorkerAttempt[] = []
    const strategyFingerprints: string[] = []
    const finalReviewContextsByAttemptId = new Map<string, SourceInstructionFinalReviewPhaseContext>()
    let synthesizedInstruction: SourceInstructionArtifact | null =
      instructionArtifacts.find((artifact) => artifact.id === normalizedTarget.validatedInstructionId) ?? null
    let browserSessionOpened = false

    try {
      await openRunBrowserSession(adapterKind)
      browserSessionOpened = true
      await runSequentialArtifactOrchestrator<SourceDebugPhase, SourceDebugWorkerAttempt>({
        phases: SOURCE_DEBUG_PHASES,
        beforePhase: async (phase) => {
          if (executionSignal.aborted) {
            throw new DOMException('Aborted', 'AbortError')
          }

          run = SourceDebugRunRecordSchema.parse({
            ...run,
            activePhase: phase,
            updatedAt: new Date().toISOString()
          })
          await persistSourceDebugRun(run)
        },
        executePhase: async (phase, index) => {
          const now = new Date().toISOString()

          const phasePacket = buildSourceDebugPhasePacket(
            phase,
            run.phaseSummaries,
            strategyFingerprints,
            run.manualPrerequisiteSummary
          )
          const strategyFingerprint = `${phase}:${adapterKind}:${phasePacket.strategyLabel?.toLowerCase() ?? 'default'}`
          strategyFingerprints.push(strategyFingerprint)
          const phaseInstructionArtifact = phase === 'replay_verification' ? synthesizedInstruction : null
          const nextPhase = SOURCE_DEBUG_PHASES[index + 1] ?? null
          const debugResult = await browserRuntime.runAgentDiscovery?.(adapterKind, {
            userProfile: profile,
            searchPreferences: {
              targetRoles: searchPreferences.targetRoles.length > 0 ? searchPreferences.targetRoles : [DEFAULT_ROLE],
              locations: searchPreferences.locations
            },
            targetJobCount: getSourceDebugTargetJobCount(phase),
            maxSteps: getSourceDebugMaxSteps(phase),
            startingUrls: [normalizedTarget.startingUrl],
            siteLabel: `${normalizedTarget.label} ${formatStatusLabel(phase)}`,
            navigationHostnames: [targetUrl.hostname],
            siteInstructions: composeSourceDebugInstructions(normalizedTarget, adapter, phase, phaseInstructionArtifact, phasePacket),
            toolUsageNotes: uniqueStrings([
              ...adapter.toolUsageNotes,
              'Prefer concise, high-confidence evidence over broad exploration.',
              'Stop when the phase goal has been proven or blocked.'
            ]),
            taskPacket: phasePacket,
            compaction: {
              maxTranscriptMessages: 16,
              preserveRecentMessages: 6,
              maxToolPayloadChars: 180
            },
            relevantUrlSubstrings: adapter.relevantUrlSubstrings,
            experimental: adapter.experimental,
            skipSessionValidation: true,
            aiClient,
            signal: executionSignal
          })

          if (!debugResult) {
            throw new Error('Browser runtime does not support agent discovery for source debugging.')
          }

          const outcome = classifySourceDebugAttemptOutcome(debugResult, phase)
          const completion = resolveSourceDebugCompletion(debugResult)
          const attemptId = `source_debug_attempt_${phase}_${Date.now()}`
          const evidenceRefs = [
            SourceDebugEvidenceRefSchema.parse({
              id: `${attemptId}_start`,
              runId: run.id,
              attemptId,
              targetId: normalizedTarget.id,
              phase,
              kind: 'url',
              label: 'Starting URL',
              capturedAt: new Date().toISOString(),
              url: normalizedTarget.startingUrl,
              storagePath: null,
              excerpt: debugResult.warning ?? null
            }),
            ...debugResult.jobs.slice(0, 3).map((job, evidenceIndex) =>
              SourceDebugEvidenceRefSchema.parse({
                id: `${attemptId}_job_${evidenceIndex + 1}`,
                runId: run.id,
                attemptId,
                targetId: normalizedTarget.id,
                phase,
                kind: 'url',
                label: `${job.title} at ${job.company}`,
                capturedAt: new Date().toISOString(),
                url: job.canonicalUrl,
                storagePath: null,
                excerpt: job.summary
              })
            )
          ]

          for (const evidenceRef of evidenceRefs) {
            await repository.upsertSourceDebugEvidenceRef(evidenceRef)
          }

          const applyReadyCount = debugResult.jobs.filter(
            (job) => job.applyPath !== 'unknown' || job.easyApplyEligible
          ).length
          const debugFindings = debugResult.agentMetadata?.debugFindings ?? null
          const hostname = new URL(normalizedTarget.startingUrl).hostname
          const canonicalUrlBehavior =
            phase === 'job_detail_validation' || phase === 'replay_verification'
              ? summarizeCanonicalUrlBehavior(debugResult.jobs, hostname)
              : []
          const applyPathBehavior =
            phase === 'apply_path_validation' && !warningSuggestsAuthRestriction(debugResult.warning)
              ? summarizeApplyPathBehavior(debugResult.jobs)
              : []
          const confirmedFacts = uniqueStrings([
            ...(debugFindings?.summary ? [debugFindings.summary] : []),
            ...prefixedLines('Reliable control: ', debugFindings?.reliableControls ?? []),
            ...prefixedLines('Filter note: ', debugFindings?.trickyFilters ?? []),
            ...prefixedLines('Navigation note: ', debugFindings?.navigationTips ?? []),
            ...prefixedLines('Apply note: ', debugFindings?.applyTips ?? []),
            ...canonicalUrlBehavior,
            ...applyPathBehavior,
            ...filterSourceDebugWarnings(debugFindings?.warnings ?? []),
            ...filterSourceDebugWarnings([debugResult.warning])
          ])

          const artifact = SourceDebugWorkerAttemptSchema.parse({
            id: attemptId,
            runId: run.id,
            targetId: normalizedTarget.id,
            phase,
            startedAt: debugResult.startedAt,
            completedAt: debugResult.completedAt,
            outcome,
            completionMode: completion.completionMode,
            completionReason: completion.completionReason,
            strategyLabel: phasePacket.strategyLabel ?? formatStatusLabel(phase),
            strategyFingerprint,
            confirmedFacts,
            attemptedActions: uniqueStrings([
              `Started from ${normalizedTarget.startingUrl}.`,
              ...(phase === 'apply_path_validation'
                ? ['Inspected discovered jobs for apply entry points without submitting an application.']
                : []),
              ...(completion.phaseEvidence?.attemptedControls ?? []),
              ...prefixedLines('Validated behavior: ', debugFindings?.reliableControls ?? []),
              ...prefixedLines('Validated navigation: ', debugFindings?.navigationTips ?? [])
            ]),
            blockerSummary:
              isInternalSourceDebugFailure(debugResult.warning)
                ? null
                : (debugResult.warning ??
                    (completion.completionMode !== 'structured_finish' && completion.completionMode !== 'forced_finish'
                      ? completion.completionReason
                      : null)),
            resultSummary:
              debugFindings?.summary
                ? debugFindings.summary
                : phase === 'replay_verification'
                ? (debugResult.jobs.length > 0
                    ? `Replay verification reached ${debugResult.jobs.length} job result${debugResult.jobs.length === 1 ? '' : 's'} again.`
                    : (isInternalSourceDebugFailure(debugResult.warning)
                        ? 'Replay verification did not complete because the agent runtime failed.'
                        : debugResult.warning ?? 'Replay verification did not reproduce the expected path.'))
                : phase === 'apply_path_validation'
                  ? applyReadyCount > 0
                    ? `Apply path validation confirmed reusable apply guidance on ${applyReadyCount} job${applyReadyCount === 1 ? '' : 's'} without submitting.`
                    : (isInternalSourceDebugFailure(debugResult.warning)
                        ? 'Apply path validation did not complete because the agent runtime failed.'
                        : debugResult.warning ?? 'Apply path validation did not confirm a reusable apply path.')
                  : debugResult.jobs.length > 0
                    ? `${formatStatusLabel(phase)} found ${debugResult.jobs.length} credible job result${debugResult.jobs.length === 1 ? '' : 's'}.`
                    : (isInternalSourceDebugFailure(debugResult.warning)
                        ? `${formatStatusLabel(phase)} did not complete because the agent runtime failed.`
                        : debugResult.warning ?? `${formatStatusLabel(phase)} produced no reusable evidence.`),
            confidenceScore:
              phase === 'apply_path_validation'
                ? (applyReadyCount > 0 ? 76 : 42)
                : debugResult.jobs.length > 0
                  ? 80
                  : 45,
            nextRecommendedStrategies:
              phase === 'replay_verification'
                ? []
                : nextPhase
                  ? [formatStatusLabel(nextPhase)]
                  : [],
            avoidStrategyFingerprints: [strategyFingerprint],
            evidenceRefIds: evidenceRefs.map((evidenceRef) => evidenceRef.id),
            phaseEvidence: completion.phaseEvidence,
            compactionState: debugResult.agentMetadata?.compactionState
              ? SourceDebugCompactionStateSchema.parse(debugResult.agentMetadata.compactionState)
              : null
          })

          finalReviewContextsByAttemptId.set(artifact.id, {
            phase,
            startedAt: artifact.startedAt,
            completedAt: artifact.completedAt,
            outcome: artifact.outcome,
            completionMode: artifact.completionMode,
            completionReason: artifact.completionReason,
            resultSummary: artifact.resultSummary,
            blockerSummary: artifact.blockerSummary,
            confirmedFacts: [...artifact.confirmedFacts],
            attemptedActions: [...artifact.attemptedActions],
            phaseEvidence: artifact.phaseEvidence,
            compactionState: artifact.compactionState,
            reviewTranscript: [...(debugResult.agentMetadata?.reviewTranscript ?? [])]
          })

          return {
            artifact,
            stop: outcome === 'blocked_auth' || outcome === 'blocked_manual_step'
          }
        },
        afterPhase: async (phase, _index, attempt) => {
          if (!attempt) {
            return
          }

          await repository.upsertSourceDebugAttempt(attempt)
          attempts.push(attempt)
          const phaseSummary = buildSourceDebugPhaseSummary(attempt)

          if (attempt.outcome === 'blocked_auth' || attempt.outcome === 'blocked_manual_step') {
            run = SourceDebugRunRecordSchema.parse({
              ...run,
              state: 'paused_manual',
              updatedAt: new Date().toISOString(),
              completedAt: new Date().toISOString(),
              manualPrerequisiteSummary: attempt.blockerSummary,
              finalSummary: attempt.resultSummary,
              attemptIds: [...run.attemptIds, attempt.id],
              phaseSummaries: [...run.phaseSummaries, phaseSummary]
            })
            await repository.upsertSourceDebugRun(run)
            await persistSourceDebugRun(run)
            await saveDiscoveryTargetUpdate(normalizedTarget.id, (currentTarget) => ({
              ...currentTarget,
              instructionStatus: currentTarget.validatedInstructionId ? currentTarget.instructionStatus : 'missing',
              lastDebugRunId: run.id
            }))
            return
          }

          run = SourceDebugRunRecordSchema.parse({
            ...run,
            updatedAt: new Date().toISOString(),
            attemptIds: [...run.attemptIds, attempt.id],
            phaseSummaries: [...run.phaseSummaries, phaseSummary]
          })

          if (phase !== 'replay_verification') {
            const nextSynthesizedInstruction = synthesizeSourceInstructionArtifact(
              normalizedTarget,
              run,
              attempts,
              adapterKind,
              null
            )
            synthesizedInstruction = nextSynthesizedInstruction
            run = SourceDebugRunRecordSchema.parse({
              ...run,
              instructionArtifactId: nextSynthesizedInstruction.id
            })
            await repository.upsertSourceInstructionArtifact(nextSynthesizedInstruction)
            await saveDiscoveryTargetUpdate(normalizedTarget.id, (currentTarget) => ({
              ...currentTarget,
              draftInstructionId: nextSynthesizedInstruction.id,
              instructionStatus: nextSynthesizedInstruction.status,
              lastDebugRunId: run.id
            }))
          }

          await persistSourceDebugRun(run)
        }
      })

      if (run.state === 'paused_manual') {
        return getWorkspaceSnapshot()
      }

      const verification = SourceInstructionVerificationSchema.parse({
        id: `source_instruction_verification_${run.id}`,
        replayRunId: run.id,
        verifiedAt: new Date().toISOString(),
        outcome: attempts.some((attempt) => attempt.phase === 'replay_verification' && attempt.outcome === 'succeeded')
          ? 'passed'
          : 'failed',
        proofSummary: attempts.find((attempt) => attempt.phase === 'replay_verification')?.resultSummary ?? null,
        reason: attempts.find((attempt) => attempt.phase === 'replay_verification')?.blockerSummary ?? null,
        versionInfo: buildSourceInstructionVersionInfo(adapterKind)
      })

      const heuristicFinalizedInstruction = synthesizeSourceInstructionArtifact(
        normalizedTarget,
        run,
        attempts,
        adapterKind,
        verification
      )
      const reviewOverride = await reviewSourceInstructionArtifactWithAi({
        aiClient,
        target: normalizedTarget,
        run,
        adapterKind,
        verification,
        heuristicInstruction: heuristicFinalizedInstruction,
        phaseContexts: attempts.flatMap((attempt) => {
          const context = finalReviewContextsByAttemptId.get(attempt.id)
          return context ? [context] : []
        }),
        signal: executionSignal
      })
      const finalizedInstruction = reviewOverride
        ? synthesizeSourceInstructionArtifact(
            normalizedTarget,
            run,
            attempts,
            adapterKind,
            verification,
            reviewOverride
          )
        : heuristicFinalizedInstruction
      await repository.upsertSourceInstructionArtifact(finalizedInstruction)
      run = SourceDebugRunRecordSchema.parse({
        ...run,
        state: verification.outcome === 'passed' ? 'completed' : 'failed',
        updatedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        activePhase: null,
        finalSummary: verification.proofSummary ?? 'Source debug workflow completed.',
        instructionArtifactId: finalizedInstruction.id
      })
      await persistSourceDebugRun(run)
      await saveDiscoveryTargetUpdate(normalizedTarget.id, (currentTarget) => ({
        ...currentTarget,
        instructionStatus: finalizedInstruction.status,
        draftInstructionId: finalizedInstruction.status === 'validated' ? null : finalizedInstruction.id,
        validatedInstructionId: finalizedInstruction.status === 'validated' ? finalizedInstruction.id : currentTarget.validatedInstructionId,
        lastDebugRunId: run.id,
        lastVerifiedAt: verification.verifiedAt,
        staleReason: verification.outcome === 'passed' ? null : verification.reason
      }))
    } catch (error) {
      const interrupted = error instanceof DOMException && error.name === 'AbortError'
      run = SourceDebugRunRecordSchema.parse({
        ...run,
        state: interrupted ? 'interrupted' : 'failed',
        updatedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        activePhase: null,
        finalSummary: interrupted
          ? 'Source debug run was interrupted before completion.'
          : `Source debug run failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      })
      await persistSourceDebugRun(run)
      if (!interrupted) {
        throw error
      }
    } finally {
      if (browserSessionOpened) {
        await closeRunBrowserSession(adapterKind).catch(() => {})
      }
      signal?.removeEventListener('abort', onExternalAbort)
      activeSourceDebugExecutionId = null
      activeSourceDebugAbortController = null
    }

    return getWorkspaceSnapshot()
  }

  return {
    getWorkspaceSnapshot,
    async resetWorkspace(seed) {
      await repository.reset(seed)
      return getWorkspaceSnapshot()
    },
    async openBrowserSession() {
      const searchPreferences = normalizeSearchPreferences(await repository.getSearchPreferences())
      const session = await browserRuntime.openSession(getPreferredSessionAdapter(searchPreferences))
      await persistBrowserSessionState(session)
      return getWorkspaceSnapshot()
    },
    async checkBrowserSession() {
      const searchPreferences = normalizeSearchPreferences(await repository.getSearchPreferences())
      const session = await browserRuntime.getSessionState(getPreferredSessionAdapter(searchPreferences))
      await persistBrowserSessionState(session)
      return getWorkspaceSnapshot()
    },
    async saveProfile(profile) {
      const currentProfile = await repository.getProfile()
      await repository.saveProfile(normalizeProfileBeforeSave(currentProfile, CandidateProfileSchema.parse(profile)))
      return getWorkspaceSnapshot()
    },
    async saveProfileAndSearchPreferences(profile, searchPreferences) {
      const currentProfile = await repository.getProfile()

      await repository.saveProfileAndSearchPreferences(
        normalizeProfileBeforeSave(currentProfile, CandidateProfileSchema.parse(profile)),
        normalizeSearchPreferences(JobSearchPreferencesSchema.parse(searchPreferences))
      )

      return getWorkspaceSnapshot()
    },
    async analyzeProfileFromResume() {
      const [profile, searchPreferences] = await Promise.all([
        repository.getProfile(),
        repository.getSearchPreferences()
      ])

      if (!profile.baseResume.textContent) {
        await repository.saveProfile(
          CandidateProfileSchema.parse({
            ...profile,
            baseResume: {
              ...profile.baseResume,
              extractionStatus: 'needs_text',
              lastAnalyzedAt: null,
              analysisWarnings: ['Paste plain-text resume content to let the agent extract candidate details.']
            }
          })
        )

        throw new Error('Resume text is required before the profile agent can extract candidate details.')
      }

      const extraction = await aiClient.extractProfileFromResume({
        existingProfile: profile,
        existingSearchPreferences: searchPreferences,
        resumeText: profile.baseResume.textContent
      })
      const merged = mergeResumeExtractionIntoWorkspace(profile, searchPreferences, extraction)

      await repository.saveProfileAndSearchPreferences(merged.profile, merged.searchPreferences)

      return getWorkspaceSnapshot()
    },
    async saveSearchPreferences(searchPreferences) {
      await repository.saveSearchPreferences(normalizeSearchPreferences(JobSearchPreferencesSchema.parse(searchPreferences)))
      return getWorkspaceSnapshot()
    },
    async saveSettings(settings) {
      await repository.saveSettings(JobFinderSettingsSchema.parse(settings))
      return getWorkspaceSnapshot()
    },
    async runDiscovery() {
      const [profile, searchPreferences, settings, discoveryState] = await Promise.all([
        repository.getProfile(),
        repository.getSearchPreferences(),
        repository.getSettings(),
        repository.getDiscoveryState()
      ])
      const enrichedPreferences = enrichSearchPreferencesFromProfile(searchPreferences, profile)
      const primaryTarget = getActiveDiscoveryTargets(enrichedPreferences)[0]

      if (!primaryTarget) {
        return getWorkspaceSnapshot()
      }

      const adapterKind = resolveAdapterKind(primaryTarget)

      let discoveryResult: Awaited<ReturnType<BrowserSessionRuntime['runDiscovery']>>
      let browserSessionOpened = false
      try {
        await openRunBrowserSession(adapterKind)
        browserSessionOpened = true
        discoveryResult = await browserRuntime.runDiscovery(adapterKind, enrichedPreferences)
      } finally {
        if (browserSessionOpened) {
          await closeRunBrowserSession(adapterKind).catch(() => {})
        }
      }
      const savedJobs = await repository.listSavedJobs()
      const persistedSavedJobIds = new Set(savedJobs.map((job) => job.id))
      const mergeSeedJobs = settings.discoveryOnly
        ? mergeSavedJobs(savedJobs, discoveryState.pendingDiscoveryJobs)
        : savedJobs
      const mergeResult = await mergeDiscoveredPostings(
        aiClient,
        profile,
        enrichedPreferences,
        mergeSeedJobs,
        discoveryResult.jobs,
        () => ({
          targetId: primaryTarget.id,
          adapterKind: primaryTarget.adapterKind,
          resolvedAdapterKind: adapterKind,
          startingUrl: primaryTarget.startingUrl,
          discoveredAt: new Date().toISOString()
        })
      )

      if (settings.discoveryOnly) {
        const nextPendingJobs = mergeResult.mergedJobs.filter((job) => !persistedSavedJobIds.has(job.id))
        await repository.replaceSavedJobs(mergeResult.mergedJobs.filter(
          (job) => persistedSavedJobIds.has(job.id) && !mergeResult.newJobs.some((newJob) => newJob.id === job.id)
        ))
        await persistDiscoveryState((current) => ({
          ...current,
          pendingDiscoveryJobs: mergePendingJobs(current.pendingDiscoveryJobs, nextPendingJobs)
        }))
      } else {
        await repository.replaceSavedJobs(mergeResult.mergedJobs)
        await persistDiscoveryState((current) => ({
          ...current,
          pendingDiscoveryJobs: current.pendingDiscoveryJobs
        }))
      }

      return getWorkspaceSnapshot()
    },
    async runAgentDiscovery(onActivity, signal) {
      const [profile, searchPreferences, settings, startingSavedJobs, startingDiscovery, sourceInstructionArtifacts] = await Promise.all([
        repository.getProfile(),
        repository.getSearchPreferences(),
        repository.getSettings(),
        repository.listSavedJobs(),
        repository.getDiscoveryState(),
        repository.listSourceInstructionArtifacts()
      ])

      if (!browserRuntime.runAgentDiscovery) {
        throw new Error('Browser runtime does not support agent discovery')
      }

      if (!aiClient.chatWithTools) {
        throw new Error('Configured AI client does not support chatWithTools / tool calling')
      }

      const enrichedPreferences = enrichSearchPreferencesFromProfile(searchPreferences, profile)
      const targets = getActiveDiscoveryTargets(enrichedPreferences)

      if (targets.length === 0) {
        return getWorkspaceSnapshot()
      }

      let workingSavedJobs = [...startingSavedJobs]
      let workingPendingJobs = [...startingDiscovery.pendingDiscoveryJobs]
      const touchedSavedJobIds = new Set<string>()
      const touchedPendingJobIds = new Set<string>()

      let activeRun = DiscoveryRunRecordSchema.parse({
        id: `discovery_run_${Date.now()}`,
        state: 'running',
        startedAt: new Date().toISOString(),
        completedAt: null,
        targetIds: targets.map((target) => target.id),
        targetExecutions: targets.map((target) => ({
          targetId: target.id,
          adapterKind: target.adapterKind,
          resolvedAdapterKind: resolveAdapterKind(target),
          state: 'planned',
          startedAt: null,
          completedAt: null,
          jobsFound: 0,
          jobsPersisted: 0,
          jobsStaged: 0,
          warning: null
        })),
        activity: [],
        summary: {
          targetsPlanned: targets.length,
          targetsCompleted: 0,
          validJobsFound: 0,
          jobsPersisted: 0,
          jobsStaged: 0,
          duplicatesMerged: 0,
          invalidSkipped: 0,
          durationMs: 0,
          outcome: 'running'
        }
      })

      const emitActivity = (event: DiscoveryActivityEvent) => {
        activeRun = appendDiscoveryEvent(activeRun, event)
        onActivity?.(event)
      }

      emitActivity(createDiscoveryEvent({
        runId: activeRun.id,
        timestamp: new Date().toISOString(),
        kind: 'info',
        stage: 'planning',
        targetId: null,
        adapterKind: null,
        resolvedAdapterKind: null,
        message: `Planning ${targets.length} discovery target${targets.length === 1 ? '' : 's'}`,
        url: null,
        jobsFound: 0,
        jobsPersisted: 0,
        jobsStaged: 0,
        duplicatesMerged: 0,
        invalidSkipped: 0
      }))

      await persistDiscoveryState((current) => ({
        ...current,
        runState: 'running',
        activeRun,
        recentRuns: current.recentRuns,
        pendingDiscoveryJobs: workingPendingJobs
      }))
      const openedSessionSources = new Set<JobSource>()

      try {
        for (const [index, target] of targets.entries()) {
          if (signal?.aborted) {
            throw new DOMException('Aborted', 'AbortError')
          }

          const targetStartedAt = new Date().toISOString()
          const adapterKind = resolveAdapterKind(target)
          const adapter = discoveryAdapters[adapterKind]
          const targetUrl = (() => {
            try {
              return new URL(target.startingUrl)
            } catch {
              return null
            }
          })()

          activeRun = updateTargetExecution(activeRun, target.id, (execution) => ({
            ...execution,
            state: 'running',
            startedAt: targetStartedAt
          }))

          emitActivity(createDiscoveryEvent({
            runId: activeRun.id,
            timestamp: targetStartedAt,
            kind: 'info',
            stage: 'target',
            targetId: target.id,
            adapterKind: target.adapterKind,
            resolvedAdapterKind: adapterKind,
            message: `Starting target ${index + 1} of ${targets.length}: ${target.label}`,
            url: target.startingUrl,
            jobsFound: null,
            jobsPersisted: null,
            jobsStaged: null,
            duplicatesMerged: null,
            invalidSkipped: null
          }))

          if (!targetUrl) {
            const warning = `Target ${target.label} has an invalid starting URL and was skipped.`
            activeRun = updateTargetExecution(activeRun, target.id, (execution) => ({
              ...execution,
              state: 'skipped',
              completedAt: new Date().toISOString(),
              warning
            }))
            activeRun = DiscoveryRunRecordSchema.parse({
              ...activeRun,
              summary: {
                ...activeRun.summary,
                targetsCompleted: countCompletedTargetExecutions(activeRun)
              }
            })
            emitActivity(createDiscoveryEvent({
              runId: activeRun.id,
              timestamp: new Date().toISOString(),
              kind: 'warning',
              stage: 'target',
              targetId: target.id,
              adapterKind: target.adapterKind,
              resolvedAdapterKind: adapterKind,
              message: warning,
              terminalState: 'skipped',
              url: null,
              jobsFound: 0,
              jobsPersisted: 0,
              jobsStaged: 0,
              duplicatesMerged: 0,
              invalidSkipped: 0
            }))
            continue
          }

          try {
            if (!openedSessionSources.has(adapterKind)) {
              await openRunBrowserSession(adapterKind)
              openedSessionSources.add(adapterKind)
            }

            const customInstructions = splitCustomDiscoveryInstructions(target.customInstructions)
            const activeInstruction = resolveActiveSourceInstructionArtifact(target, sourceInstructionArtifacts)
            const discoveryResult = await browserRuntime.runAgentDiscovery(adapterKind, {
              userProfile: profile,
              searchPreferences: {
                targetRoles: enrichedPreferences.targetRoles.length > 0 ? enrichedPreferences.targetRoles : [DEFAULT_ROLE],
                locations: enrichedPreferences.locations
              },
              targetJobCount: DEFAULT_TARGET_JOB_COUNT,
              maxSteps: DEFAULT_MAX_STEPS,
              startingUrls: [target.startingUrl],
              siteLabel: target.label,
              navigationHostnames: [targetUrl.hostname],
              siteInstructions: uniqueStrings([
                ...adapter.siteInstructions,
                ...buildInstructionGuidance(activeInstruction),
                ...customInstructions
              ]),
              toolUsageNotes: adapter.toolUsageNotes,
              relevantUrlSubstrings: adapter.relevantUrlSubstrings,
              experimental: adapter.experimental,
              aiClient,
              onProgress: (progress) => {
                const summary = summarizeProgressAction(
                  progress.currentAction,
                  target.label,
                  progress.jobsFound,
                  progress.stepCount
                )
                emitActivity(createDiscoveryEvent({
                  runId: activeRun.id,
                  timestamp: new Date().toISOString(),
                  kind: 'progress',
                  stage: summary.stage,
                  targetId: target.id,
                  adapterKind: target.adapterKind,
                  resolvedAdapterKind: adapterKind,
                  message: summary.message,
                  url: progress.currentUrl,
                  jobsFound: progress.jobsFound,
                  jobsPersisted: null,
                  jobsStaged: null,
                  duplicatesMerged: null,
                  invalidSkipped: null
                }))
              },
              ...(signal ? { signal } : {})
            })

            const persistedWorkingJobIds = new Set(workingSavedJobs.map((job) => job.id))
            const mergeSeedJobs = settings.discoveryOnly
              ? mergeSavedJobs(workingSavedJobs, workingPendingJobs)
              : workingSavedJobs
            const mergeResult = await mergeDiscoveredPostings(
              aiClient,
              profile,
              enrichedPreferences,
              mergeSeedJobs,
              discoveryResult.jobs,
              () => ({
                targetId: target.id,
                adapterKind: target.adapterKind,
                resolvedAdapterKind: adapterKind,
                startingUrl: target.startingUrl,
                discoveredAt: new Date().toISOString()
              }),
              signal
            )

          const newJobIds = new Set(mergeResult.newJobs.map((job) => job.id))
          if (settings.discoveryOnly) {
            const nextPendingJobs = mergeResult.mergedJobs.filter((job) => !persistedWorkingJobIds.has(job.id))
            for (const job of mergeResult.mergedJobs.filter((job) => persistedWorkingJobIds.has(job.id))) {
              touchedSavedJobIds.add(job.id)
            }
            for (const job of nextPendingJobs) {
              touchedPendingJobIds.add(job.id)
            }
            workingSavedJobs = mergeResult.mergedJobs.filter((job) => persistedWorkingJobIds.has(job.id) && !newJobIds.has(job.id))
            workingPendingJobs = mergePendingJobs(workingPendingJobs, nextPendingJobs)
          } else {
            for (const job of mergeResult.mergedJobs) {
              touchedSavedJobIds.add(job.id)
            }
            workingSavedJobs = mergeResult.mergedJobs
            workingPendingJobs = []
          }

            activeRun = updateTargetExecution(activeRun, target.id, (execution) => ({
              ...execution,
              state: 'completed',
              completedAt: new Date().toISOString(),
              jobsFound: discoveryResult.jobs.length,
              jobsPersisted: settings.discoveryOnly ? 0 : mergeResult.newJobs.length,
              jobsStaged: settings.discoveryOnly ? mergeResult.newJobs.length : 0,
              warning: discoveryResult.warning
            }))
            activeRun = DiscoveryRunRecordSchema.parse({
              ...activeRun,
              summary: {
                ...activeRun.summary,
                targetsCompleted: countCompletedTargetExecutions(activeRun),
                validJobsFound: activeRun.summary.validJobsFound + mergeResult.validatedCount,
                jobsPersisted: activeRun.summary.jobsPersisted + (settings.discoveryOnly ? 0 : mergeResult.newJobs.length),
                jobsStaged: activeRun.summary.jobsStaged + (settings.discoveryOnly ? mergeResult.newJobs.length : 0),
                duplicatesMerged: activeRun.summary.duplicatesMerged + mergeResult.duplicatesMerged,
                invalidSkipped: activeRun.summary.invalidSkipped + mergeResult.invalidSkipped,
                outcome: 'running'
              }
            })

            emitActivity(createDiscoveryEvent({
              runId: activeRun.id,
              timestamp: new Date().toISOString(),
              kind: 'info',
              stage: 'scoring',
              targetId: target.id,
              adapterKind: target.adapterKind,
              resolvedAdapterKind: adapterKind,
              message: `Scored ${discoveryResult.jobs.length} discovered job${discoveryResult.jobs.length === 1 ? '' : 's'}`,
              url: target.startingUrl,
              jobsFound: discoveryResult.jobs.length,
              jobsPersisted: null,
              jobsStaged: null,
              duplicatesMerged: mergeResult.duplicatesMerged,
              invalidSkipped: mergeResult.invalidSkipped
            }))

            emitActivity(createDiscoveryEvent({
              runId: activeRun.id,
              timestamp: new Date().toISOString(),
              kind: discoveryResult.warning ? 'warning' : 'success',
              stage: 'persistence',
              targetId: target.id,
              adapterKind: target.adapterKind,
              resolvedAdapterKind: adapterKind,
              message: settings.discoveryOnly
                ? `Saved ${0} jobs and staged ${mergeResult.newJobs.length} for review-only mode`
                : `Saved ${mergeResult.newJobs.length} new job${mergeResult.newJobs.length === 1 ? '' : 's'} for this target`,
              terminalState: 'completed',
              url: target.startingUrl,
              jobsFound: discoveryResult.jobs.length,
              jobsPersisted: settings.discoveryOnly ? 0 : mergeResult.newJobs.length,
              jobsStaged: settings.discoveryOnly ? mergeResult.newJobs.length : 0,
              duplicatesMerged: mergeResult.duplicatesMerged,
              invalidSkipped: mergeResult.invalidSkipped
            }))
          } catch (error) {
            const aborted = error instanceof DOMException && error.name === 'AbortError'
            const message = aborted
              ? `Target ${target.label} was cancelled before completion`
              : `Target ${target.label} failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            activeRun = updateTargetExecution(activeRun, target.id, (execution) => ({
              ...execution,
              state: aborted ? 'cancelled' : 'failed',
              completedAt: new Date().toISOString(),
              warning: message
            }))
            activeRun = DiscoveryRunRecordSchema.parse({
              ...activeRun,
              summary: {
                ...activeRun.summary,
                targetsCompleted: countCompletedTargetExecutions(activeRun)
              }
            })
            emitActivity(createDiscoveryEvent({
              runId: activeRun.id,
              timestamp: new Date().toISOString(),
              kind: aborted ? 'warning' : 'error',
              stage: 'target',
              targetId: target.id,
              adapterKind: target.adapterKind,
              resolvedAdapterKind: adapterKind,
              message,
              terminalState: aborted ? 'cancelled' : 'failed',
              url: target.startingUrl,
              jobsFound: null,
              jobsPersisted: null,
              jobsStaged: null,
              duplicatesMerged: null,
              invalidSkipped: null
            }))
            throw error
          }
        }

        const failedTargets = activeRun.targetExecutions.filter((execution) => execution.state === 'failed').length
        const runOutcome: DiscoveryRunState = failedTargets > 0 ? 'failed' : 'completed'
        activeRun = DiscoveryRunRecordSchema.parse({
          ...activeRun,
          state: runOutcome,
          completedAt: new Date().toISOString(),
          summary: {
            ...activeRun.summary,
            durationMs: new Date().getTime() - new Date(activeRun.startedAt).getTime(),
            outcome: runOutcome
          }
        })
      } catch (error) {
        const aborted = error instanceof DOMException && error.name === 'AbortError'
        activeRun = DiscoveryRunRecordSchema.parse({
          ...activeRun,
          state: aborted ? 'cancelled' : 'failed',
          completedAt: new Date().toISOString(),
          summary: {
            ...activeRun.summary,
            durationMs: new Date().getTime() - new Date(activeRun.startedAt).getTime(),
            outcome: aborted ? 'cancelled' : 'failed'
          }
        })
        emitActivity(createDiscoveryEvent({
          runId: activeRun.id,
          timestamp: new Date().toISOString(),
          kind: aborted ? 'warning' : 'error',
          stage: 'run',
          targetId: null,
          adapterKind: null,
          resolvedAdapterKind: null,
          message: aborted ? 'Discovery run cancelled before completion' : `Discovery run failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          url: null,
          jobsFound: null,
          jobsPersisted: null,
          jobsStaged: null,
          duplicatesMerged: null,
          invalidSkipped: null
        }))

        const [latestSavedJobs, latestDiscoveryState] = await Promise.all([
          repository.listSavedJobs(),
          repository.getDiscoveryState()
        ])
        await repository.replaceSavedJobs(overlayTouchedSavedJobs(latestSavedJobs, workingSavedJobs, touchedSavedJobIds))
        await repository.saveDiscoveryState(finalizeDiscoveryState({
          ...latestDiscoveryState,
          pendingDiscoveryJobs: overlayTouchedPendingJobs(latestDiscoveryState.pendingDiscoveryJobs, workingPendingJobs, touchedPendingJobIds)
        }, activeRun, enrichedPreferences))

        if (aborted) {
          return getWorkspaceSnapshot()
        }

        throw error
      } finally {
        await Promise.all(
          [...openedSessionSources].map(async (source) => {
            await closeRunBrowserSession(source).catch(() => {})
          })
        )
      }

      const [latestSavedJobs, latestDiscoveryState] = await Promise.all([
        repository.listSavedJobs(),
        repository.getDiscoveryState()
      ])
      await repository.replaceSavedJobs(overlayTouchedSavedJobs(latestSavedJobs, workingSavedJobs, touchedSavedJobIds))
      await repository.saveDiscoveryState(finalizeDiscoveryState({
        ...latestDiscoveryState,
        pendingDiscoveryJobs: overlayTouchedPendingJobs(latestDiscoveryState.pendingDiscoveryJobs, workingPendingJobs, touchedPendingJobIds)
      }, activeRun, enrichedPreferences))

      return getWorkspaceSnapshot()
    },
    async runSourceDebug(targetId, signal) {
      return runSourceDebugWorkflow(targetId, signal, { clearExistingInstructions: true })
    },
    async cancelSourceDebug(runId) {
      if (activeSourceDebugExecutionId !== runId || !activeSourceDebugAbortController) {
        return getWorkspaceSnapshot()
      }

      activeSourceDebugAbortController.abort()

      for (let attempt = 0; attempt < 40; attempt += 1) {
        if (activeSourceDebugExecutionId === null) {
          break
        }

        await new Promise<void>((resolve) => {
          setTimeout(resolve, 50)
        })
      }

      return getWorkspaceSnapshot()
    },
    async getSourceDebugRun(runId) {
      const run = (await repository.listSourceDebugRuns()).find((entry) => entry.id === runId)

      if (!run) {
        throw new Error(`Unknown source debug run '${runId}'.`)
      }

      return run
    },
    async getSourceDebugRunDetails(runId) {
      const [runs, attempts, evidenceRefs, instructionArtifacts] = await Promise.all([
        repository.listSourceDebugRuns(),
        repository.listSourceDebugAttempts(),
        repository.listSourceDebugEvidenceRefs(),
        repository.listSourceInstructionArtifacts()
      ])
      const run = runs.find((entry) => entry.id === runId)

      if (!run) {
        throw new Error(`Unknown source debug run '${runId}'.`)
      }

      return SourceDebugRunDetailsSchema.parse({
        run,
        attempts: attempts
          .filter((entry) => entry.runId === runId)
          .sort((left, right) => new Date(left.startedAt).getTime() - new Date(right.startedAt).getTime()),
        evidenceRefs: evidenceRefs
          .filter((entry) => entry.runId === runId)
          .sort((left, right) => new Date(left.capturedAt).getTime() - new Date(right.capturedAt).getTime()),
        instructionArtifact: instructionArtifacts.find((artifact) => artifact.id === run.instructionArtifactId) ?? null
      })
    },
    async listSourceDebugRuns(targetId) {
      return (await repository.listSourceDebugRuns())
        .filter((run) => run.targetId === targetId)
        .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
    },
    async saveSourceInstructionArtifact(targetId, artifact) {
      const normalizedArtifact = SourceInstructionArtifactSchema.parse({
        ...artifact,
        updatedAt: new Date().toISOString()
      })

      if (normalizedArtifact.targetId !== targetId) {
        throw new Error(`Source instruction '${normalizedArtifact.id}' does not belong to target '${targetId}'.`)
      }

      const searchPreferences = await repository.getSearchPreferences()
      const target = searchPreferences.discovery.targets.find((entry) => entry.id === targetId)

      if (!target) {
        throw new Error(`Unknown discovery target '${targetId}'.`)
      }

      const isBoundInstruction =
        normalizedArtifact.id === target.draftInstructionId ||
        normalizedArtifact.id === target.validatedInstructionId

      if (!isBoundInstruction) {
        throw new Error(`Source instruction '${normalizedArtifact.id}' is not bound to target '${targetId}'.`)
      }

      await repository.upsertSourceInstructionArtifact(normalizedArtifact)
      return getWorkspaceSnapshot()
    },
    async acceptSourceInstructionDraft(targetId, instructionId) {
      const artifact = (await repository.listSourceInstructionArtifacts()).find((entry) => entry.id === instructionId && entry.targetId === targetId)

      if (!artifact) {
        throw new Error(`Unknown source instruction '${instructionId}'.`)
      }

      const acceptedArtifact = SourceInstructionArtifactSchema.parse({
        ...artifact,
        updatedAt: new Date().toISOString(),
        acceptedAt: new Date().toISOString()
      })
      await repository.upsertSourceInstructionArtifact(acceptedArtifact)
      await saveDiscoveryTargetUpdate(targetId, (target) => ({
        ...target,
        draftInstructionId: acceptedArtifact.id,
        instructionStatus: acceptedArtifact.status
      }))
      return getWorkspaceSnapshot()
    },
    async verifySourceInstructions(targetId, instructionId, signal) {
      const artifacts = await repository.listSourceInstructionArtifacts()
      const artifact = artifacts.find((entry) => entry.id === instructionId && entry.targetId === targetId)

      if (!artifact) {
        throw new Error(`Unknown source instruction '${instructionId}'.`)
      }

      await saveDiscoveryTargetUpdate(targetId, (target) => ({
        ...target,
        draftInstructionId: artifact.id
      }))

      return runSourceDebugWorkflow(targetId, signal, { clearExistingInstructions: false })
    },
    async queueJobForReview(jobId) {
      const discoveryState = await repository.getDiscoveryState()
      const pendingIndex = discoveryState.pendingDiscoveryJobs.findIndex((job) => job.id === jobId)

      if (pendingIndex >= 0) {
        const pendingJob = discoveryState.pendingDiscoveryJobs[pendingIndex]
        const savedJobs = await repository.listSavedJobs()
        const nextJob = SavedJobSchema.parse({
          ...pendingJob,
          status: 'shortlisted'
        })
        await repository.replaceSavedJobs(mergeSavedJobs(savedJobs, [nextJob]))
        await persistDiscoveryState((current) => ({
          ...current,
          pendingDiscoveryJobs: current.pendingDiscoveryJobs.filter((job) => job.id !== jobId)
        }))
      } else {
        const tailoredAssets = await repository.listTailoredAssets()
        const asset = tailoredAssets.find((entry) => entry.jobId === jobId)

        await updateJob(jobId, (job) => ({
          ...job,
          status: asset?.status === 'ready' ? 'ready_for_review' : 'drafting'
        }))
      }

      return getWorkspaceSnapshot()
    },
    async dismissDiscoveryJob(jobId) {
      const discoveryState = await repository.getDiscoveryState()
      const pendingIndex = discoveryState.pendingDiscoveryJobs.findIndex((job) => job.id === jobId)

      if (pendingIndex >= 0) {
        await persistDiscoveryState((current) => ({
          ...current,
          pendingDiscoveryJobs: current.pendingDiscoveryJobs.filter((job) => job.id !== jobId)
        }))
      } else {
        await updateJob(jobId, (job) => ({
          ...job,
          status: 'archived'
        }))
      }

      return getWorkspaceSnapshot()
    },
    async generateResume(jobId) {
      const [profile, searchPreferences, settings, savedJobs, tailoredAssets] = await Promise.all([
        repository.getProfile(),
        repository.getSearchPreferences(),
        repository.getSettings(),
        repository.listSavedJobs(),
        repository.listTailoredAssets()
      ])
      const job = savedJobs.find((entry) => entry.id === jobId)

      if (!job) {
        throw new Error(`Unable to generate a resume for unknown job '${jobId}'.`)
      }

      const existingAsset = tailoredAssets.find((asset) => asset.jobId === jobId)
      const draft = await aiClient.tailorResume({
        profile,
        searchPreferences,
        settings,
        job,
        resumeText: profile.baseResume.textContent
      })
      const generationMethod = draft.notes.some((note: string) => normalizeText(note).includes('deterministic'))
        ? 'deterministic'
        : aiClient.getStatus().kind === 'openai_compatible'
          ? 'ai_assisted'
          : 'deterministic'
      const previewSections = buildPreviewSectionsFromDraft(draft)
      const contentText = draft.fullText || buildTailoredResumeText(profile, job, previewSections)
      const renderedArtifact = await documentManager.renderResumeArtifact({
        job,
        profile,
        previewSections,
        settings,
        textContent: contentText
      })
      const selectedTemplate = documentManager
        .listResumeTemplates()
        .find((template) => template.id === settings.resumeTemplateId)
      const nextAsset = TailoredAssetSchema.parse({
        id: existingAsset?.id ?? `resume_${jobId}`,
        jobId,
        kind: 'resume',
        status: 'ready',
        label: draft.label ?? 'Tailored Resume',
        version: nextAssetVersion(existingAsset),
        templateName: selectedTemplate?.label ?? existingAsset?.templateName ?? 'Classic ATS',
        compatibilityScore: draft.compatibilityScore ?? Math.min(100, job.matchAssessment.score + 3),
        progressPercent: 100,
        updatedAt: new Date().toISOString(),
        storagePath: renderedArtifact.storagePath,
        contentText,
        previewSections,
        generationMethod,
        notes: uniqueStrings([
          ...draft.notes,
          ...(renderedArtifact.fileName ? [`Rendered into template file ${renderedArtifact.fileName}.`] : [])
        ])
      })

      await repository.upsertTailoredAsset(nextAsset)
      await updateJob(jobId, (currentJob) => ({
        ...currentJob,
        status: 'ready_for_review'
      }))

      return getWorkspaceSnapshot()
    },
    async approveApply(jobId) {
      const [profile, searchPreferences, settings, savedJobs, tailoredAssets, applicationRecords, sourceInstructionArtifacts] = await Promise.all([
        repository.getProfile(),
        repository.getSearchPreferences(),
        repository.getSettings(),
        repository.listSavedJobs(),
        repository.listTailoredAssets(),
        repository.listApplicationRecords(),
        repository.listSourceInstructionArtifacts()
      ])
      const job = savedJobs.find((entry) => entry.id === jobId)
      const asset = tailoredAssets.find((entry) => entry.jobId === jobId)

      if (!job) {
        throw new Error(`Unable to approve apply flow for unknown job '${jobId}'.`)
      }

      if (!asset || asset.status !== 'ready') {
        throw new Error(`A ready tailored resume is required before applying to '${job.title}'.`)
      }

      const provenanceTargetId = job.provenance[job.provenance.length - 1]?.targetId ?? job.provenance[0]?.targetId ?? null
      const provenanceTarget = provenanceTargetId
        ? searchPreferences.discovery.targets.find((target) => target.id === provenanceTargetId) ?? null
        : null
      const activeInstruction = provenanceTarget
        ? resolveActiveSourceInstructionArtifact(provenanceTarget, sourceInstructionArtifacts)
        : null
      const applyInstructions = uniqueStrings([
        ...buildInstructionGuidance(activeInstruction),
        ...(activeInstruction?.applyGuidance ?? [])
      ])

      const executionResult = await browserRuntime.executeEasyApply(job.source, {
        job,
        asset,
        profile,
        settings,
        ...(applyInstructions.length > 0 ? { instructions: applyInstructions } : {})
      })
      const now = new Date().toISOString()
      const attempt = ApplicationAttemptSchema.parse({
        id: `attempt_${jobId}_${Date.now()}`,
        jobId,
        state: executionResult.state,
        summary: executionResult.summary,
        detail: executionResult.detail,
        startedAt: executionResult.checkpoints[0]?.at ?? now,
        updatedAt: executionResult.submittedAt ?? now,
        completedAt:
          executionResult.state === 'in_progress' ? null : executionResult.submittedAt ?? now,
        outcome: executionResult.outcome,
        checkpoints: executionResult.checkpoints,
        nextActionLabel: executionResult.nextActionLabel
      })

      await repository.upsertApplicationAttempt(attempt)

      const existingRecord = applicationRecords.find((record) => record.jobId === jobId)
      const nextRecord = ApplicationRecordSchema.parse({
        id: existingRecord?.id ?? `application_${jobId}`,
        jobId,
        title: job.title,
        company: job.company,
        status: nextJobStatusFromAttempt(job, executionResult.state),
        lastActionLabel: executionResult.summary,
        nextActionLabel: executionResult.nextActionLabel,
        lastUpdatedAt: executionResult.submittedAt ?? now,
        lastAttemptState: executionResult.state,
        events: mergeEvents(existingRecord?.events ?? [], toApplicationEvents(job, executionResult.checkpoints))
      })

      await repository.upsertApplicationRecord(nextRecord)
      await updateJob(jobId, (currentJob) => ({
        ...currentJob,
        status: nextJobStatusFromAttempt(currentJob, executionResult.state)
      }))

      return getWorkspaceSnapshot()
    }
  }
}
