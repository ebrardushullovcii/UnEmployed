import type { BrowserSessionRuntime } from '@unemployed/browser-runtime'
import {
  ApplicationAttemptSchema,
  ApplicationRecordSchema,
  CandidateProfileSchema,
  JobFinderSettingsSchema,
  JobFinderWorkspaceSnapshotSchema,
  JobSearchPreferencesSchema,
  SavedJobSchema,
  TailoredAssetSchema,
  type ApplicationAttempt,
  type ApplicationEvent,
  type ApplicationRecord,
  type ApplicationStatus,
  type AssetStatus,
  type CandidateProfile,
  type JobFinderSettings,
  type JobFinderWorkspaceSnapshot,
  type JobPosting,
  type JobSearchPreferences,
  type MatchAssessment,
  type ReviewQueueItem,
  type SavedJob,
  type TailoredAsset
} from '@unemployed/contracts'
import type { JobFinderRepository, JobFinderRepositorySeed } from '@unemployed/db'

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

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(/\s+/)
    .filter(Boolean)
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
    searchPreferences.workModes.includes(posting.workMode) ||
    searchPreferences.workModes.includes('flexible')
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
  profile: CandidateProfile,
  searchPreferences: JobSearchPreferences,
  posting: JobPosting,
  existingJob: SavedJob | undefined
): SavedJob {
  return SavedJobSchema.parse({
    ...posting,
    id: existingJob?.id ?? toSavedJobId(posting),
    status: preserveJobStatus(existingJob),
    matchAssessment: createMatchAssessment(profile, searchPreferences, posting)
  })
}

function createPreviewSections(
  profile: CandidateProfile,
  searchPreferences: JobSearchPreferences,
  job: SavedJob,
  settings: JobFinderSettings
) {
  const summaryLine =
    `${profile.headline} shaped for ${job.title} at ${job.company}, emphasizing ` +
    `${job.keySkills.slice(0, 3).join(', ')} and ${formatWorkMode(job.workMode)} collaboration.`

  const experienceLines = [
    `${profile.yearsExperience}+ years of experience aligned to ${job.company}'s ${job.summary.toLowerCase()}`,
    `Targeting ${searchPreferences.targetRoles.slice(0, 2).join(' and ')} roles with a ${searchPreferences.tailoringMode} tailoring mode and ${settings.fontPreset.replaceAll('_', ' ')} formatting preset.`
  ]

  return [
    {
      heading: 'Summary',
      lines: [summaryLine]
    },
    {
      heading: 'Experience Highlights',
      lines: experienceLines
    },
    {
      heading: 'Core Skills',
      lines: [...profile.skills.slice(0, 6)]
    },
    {
      heading: 'Targeted Keywords',
      lines: [...job.keySkills.slice(0, 6)]
    }
  ]
}

function formatWorkMode(value: string): string {
  return value.replaceAll('_', ' ')
}

function buildTailoredResumeText(
  profile: CandidateProfile,
  job: SavedJob,
  previewSections: ReturnType<typeof createPreviewSections>
): string {
  const sections = previewSections
    .map((section) => `${section.heading}
${section.lines.join('\n')}`)
    .join('\n\n')

  return `${profile.fullName}\n${profile.headline}\n${profile.currentLocation}\n\nTarget Role: ${job.title} at ${job.company}\n\n${sections}\n`
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
  resetWorkspace(seed: JobFinderRepositorySeed): Promise<JobFinderWorkspaceSnapshot>
  saveProfile(profile: CandidateProfile): Promise<JobFinderWorkspaceSnapshot>
  saveSearchPreferences(searchPreferences: JobSearchPreferences): Promise<JobFinderWorkspaceSnapshot>
  saveSettings(settings: JobFinderSettings): Promise<JobFinderWorkspaceSnapshot>
  runDiscovery(): Promise<JobFinderWorkspaceSnapshot>
  queueJobForReview(jobId: string): Promise<JobFinderWorkspaceSnapshot>
  dismissDiscoveryJob(jobId: string): Promise<JobFinderWorkspaceSnapshot>
  generateResume(jobId: string): Promise<JobFinderWorkspaceSnapshot>
  approveApply(jobId: string): Promise<JobFinderWorkspaceSnapshot>
}

export interface CreateJobFinderWorkspaceServiceOptions {
  repository: JobFinderRepository
  browserRuntime: BrowserSessionRuntime
}

export function createJobFinderWorkspaceService(
  options: CreateJobFinderWorkspaceServiceOptions
): JobFinderWorkspaceService {
  const { browserRuntime, repository } = options

  async function getWorkspaceSnapshot(): Promise<JobFinderWorkspaceSnapshot> {
    const [
      profile,
      searchPreferences,
      savedJobs,
      tailoredAssets,
      applicationRecords,
      applicationAttempts,
      settings,
      browserSession
    ] = await Promise.all([
      repository.getProfile(),
      repository.getSearchPreferences(),
      repository.listSavedJobs(),
      repository.listTailoredAssets(),
      repository.listApplicationRecords(),
      repository.listApplicationAttempts(),
      repository.getSettings(),
      browserRuntime.getSessionState('linkedin')
    ])

    const discoveryJobs = buildDiscoveryJobs(savedJobs)
    const reviewQueue = buildReviewQueue(savedJobs, tailoredAssets)
    const orderedApplicationRecords = buildApplicationRecords(applicationRecords)

    return JobFinderWorkspaceSnapshotSchema.parse({
      module: 'job-finder',
      generatedAt: new Date().toISOString(),
      profile,
      searchPreferences,
      browserSession,
      discoveryJobs,
      selectedDiscoveryJobId: discoveryJobs[0]?.id ?? null,
      reviewQueue,
      selectedReviewJobId: reviewQueue[0]?.jobId ?? null,
      tailoredAssets,
      applicationRecords: orderedApplicationRecords,
      applicationAttempts,
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

  return {
    getWorkspaceSnapshot,
    async resetWorkspace(seed) {
      await repository.reset(seed)
      return getWorkspaceSnapshot()
    },
    async saveProfile(profile) {
      await repository.saveProfile(CandidateProfileSchema.parse(profile))
      return getWorkspaceSnapshot()
    },
    async saveSearchPreferences(searchPreferences) {
      await repository.saveSearchPreferences(JobSearchPreferencesSchema.parse(searchPreferences))
      return getWorkspaceSnapshot()
    },
    async saveSettings(settings) {
      await repository.saveSettings(JobFinderSettingsSchema.parse(settings))
      return getWorkspaceSnapshot()
    },
    async runDiscovery() {
      const [profile, searchPreferences, savedJobs] = await Promise.all([
        repository.getProfile(),
        repository.getSearchPreferences(),
        repository.listSavedJobs()
      ])
      const discoveryResult = await browserRuntime.runDiscovery('linkedin', searchPreferences)
      const savedJobsByPostingKey = new Map<string, SavedJob>()

      for (const job of savedJobs) {
        const key = `${job.source}:${job.sourceJobId}:${job.canonicalUrl}`
        savedJobsByPostingKey.set(key, job)
      }

      const nextJobsById = new Map(savedJobs.map((job) => [job.id, job]))

      for (const posting of discoveryResult.jobs) {
        const postingKey = `${posting.source}:${posting.sourceJobId}:${posting.canonicalUrl}`
        const existingJob = savedJobsByPostingKey.get(postingKey)
        const mergedJob = mergeDiscoveredJob(profile, searchPreferences, posting, existingJob)
        nextJobsById.set(mergedJob.id, mergedJob)
      }

      await repository.replaceSavedJobs([...nextJobsById.values()])
      return getWorkspaceSnapshot()
    },
    async queueJobForReview(jobId) {
      const tailoredAssets = await repository.listTailoredAssets()
      const asset = tailoredAssets.find((entry) => entry.jobId === jobId)

      await updateJob(jobId, (job) => ({
        ...job,
        status: asset?.status === 'ready' ? 'ready_for_review' : 'drafting'
      }))

      return getWorkspaceSnapshot()
    },
    async dismissDiscoveryJob(jobId) {
      await updateJob(jobId, (job) => ({
        ...job,
        status: 'archived'
      }))

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
      const previewSections = createPreviewSections(profile, searchPreferences, job, settings)
      const contentText = buildTailoredResumeText(profile, job, previewSections)
      const nextAsset = TailoredAssetSchema.parse({
        id: existingAsset?.id ?? `resume_${jobId}`,
        jobId,
        kind: 'resume',
        status: 'ready',
        label: 'Tailored Resume',
        version: nextAssetVersion(existingAsset),
        templateName: existingAsset?.templateName ?? 'Classic ATS',
        compatibilityScore: Math.min(100, job.matchAssessment.score + 3),
        progressPercent: 100,
        updatedAt: new Date().toISOString(),
        storagePath: existingAsset?.storagePath ?? null,
        contentText,
        previewSections
      })

      await repository.upsertTailoredAsset(nextAsset)
      await updateJob(jobId, (currentJob) => ({
        ...currentJob,
        status: 'ready_for_review'
      }))

      return getWorkspaceSnapshot()
    },
    async approveApply(jobId) {
      const [profile, settings, savedJobs, tailoredAssets, applicationRecords] = await Promise.all([
        repository.getProfile(),
        repository.getSettings(),
        repository.listSavedJobs(),
        repository.listTailoredAssets(),
        repository.listApplicationRecords()
      ])
      const job = savedJobs.find((entry) => entry.id === jobId)
      const asset = tailoredAssets.find((entry) => entry.jobId === jobId)

      if (!job) {
        throw new Error(`Unable to approve apply flow for unknown job '${jobId}'.`)
      }

      if (!asset || asset.status !== 'ready') {
        throw new Error(`A ready tailored resume is required before applying to '${job.title}'.`)
      }

      const executionResult = await browserRuntime.executeEasyApply('linkedin', {
        job,
        asset,
        profile,
        settings
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
