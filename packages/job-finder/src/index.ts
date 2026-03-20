import type { BrowserSessionRuntime } from '@unemployed/browser-runtime'
import {
  ApplicationRecordSchema,
  JobFinderWorkspaceSnapshotSchema,
  type ApplicationRecord,
  type ApplicationStatus,
  type AssetStatus,
  type CandidateProfile,
  type JobFinderWorkspaceSnapshot,
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

export interface JobFinderWorkspaceService {
  getWorkspaceSnapshot(): Promise<JobFinderWorkspaceSnapshot>
  resetWorkspace(seed: JobFinderRepositorySeed): Promise<JobFinderWorkspaceSnapshot>
  queueJobForReview(jobId: string): Promise<JobFinderWorkspaceSnapshot>
  dismissDiscoveryJob(jobId: string): Promise<JobFinderWorkspaceSnapshot>
  generateResume(jobId: string): Promise<JobFinderWorkspaceSnapshot>
  approveApply(jobId: string): Promise<JobFinderWorkspaceSnapshot>
}

export interface CreateJobFinderWorkspaceServiceOptions {
  repository: JobFinderRepository
  browserRuntime: BrowserSessionRuntime
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
        updatedAt: asset?.updatedAt ?? job.postedAt
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

function createPreviewSections(profile: CandidateProfile, job: SavedJob) {
  return [
    {
      heading: 'Summary',
      lines: [
        `${profile.headline} shaped toward ${job.title} at ${job.company} with emphasis on ${job.keySkills.slice(0, 2).join(' and ')}.`
      ]
    },
    {
      heading: 'Experience Highlights',
      lines: [
        `Aligns ${profile.yearsExperience}+ years of experience with ${job.company}'s workflow-heavy product needs.`,
        `Reframes existing strengths around ${job.matchAssessment.reasons[0] ?? 'role-specific alignment'}.`
      ]
    },
    {
      heading: 'Core Skills',
      lines: [...profile.skills.slice(0, 5)]
    }
  ]
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
      settings,
      browserSession
    ] = await Promise.all([
      repository.getProfile(),
      repository.getSearchPreferences(),
      repository.listSavedJobs(),
      repository.listTailoredAssets(),
      repository.listApplicationRecords(),
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
      selectedApplicationRecordId: orderedApplicationRecords[0]?.id ?? null,
      settings
    })
  }

  async function updateJob(jobId: string, updater: (job: SavedJob) => SavedJob): Promise<void> {
    const savedJobs = await repository.listSavedJobs()
    const nextJobs = savedJobs.map((job) => (job.id === jobId ? updater(job) : job))

    await repository.replaceSavedJobs(nextJobs)
  }

  return {
    getWorkspaceSnapshot,
    async resetWorkspace(seed) {
      await repository.reset(seed)
      return getWorkspaceSnapshot()
    },
    async queueJobForReview(jobId) {
      await updateJob(jobId, (job) => ({
        ...job,
        status: 'ready_for_review'
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
      const [profile, savedJobs, tailoredAssets] = await Promise.all([
        repository.getProfile(),
        repository.listSavedJobs(),
        repository.listTailoredAssets()
      ])
      const job = savedJobs.find((entry) => entry.id === jobId)

      if (!job) {
        throw new Error(`Unable to generate a resume for unknown job '${jobId}'.`)
      }

      const existingAsset = tailoredAssets.find((asset) => asset.jobId === jobId)
      const nextAsset: TailoredAsset = {
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
        previewSections: createPreviewSections(profile, job)
      }

      await repository.upsertTailoredAsset(nextAsset)
      await updateJob(jobId, (currentJob) => ({
        ...currentJob,
        status: 'ready_for_review'
      }))

      return getWorkspaceSnapshot()
    },
    async approveApply(jobId) {
      const [savedJobs, tailoredAssets, applicationRecords] = await Promise.all([
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

      const now = new Date().toISOString()
      const existingRecord = applicationRecords.find((record) => record.jobId === jobId)
      const nextRecord = ApplicationRecordSchema.parse({
        id: existingRecord?.id ?? `application_${jobId}`,
        jobId,
        title: job.title,
        company: job.company,
        status: 'submitted',
        lastActionLabel: 'Submitted via Easy Apply',
        nextActionLabel: 'Monitor inbox',
        lastUpdatedAt: now,
        events: [
          {
            id: `event_${jobId}_${Date.now()}`,
            at: now,
            title: 'Easy Apply submitted',
            detail: `Submitted ${job.title} at ${job.company} with ${asset.label.toLowerCase()} ${asset.version}.`,
            emphasis: 'positive'
          },
          ...(existingRecord?.events ?? [])
        ]
      })

      await repository.upsertApplicationRecord(nextRecord)
      await updateJob(jobId, (currentJob) => ({
        ...currentJob,
        status: 'submitted'
      }))

      return getWorkspaceSnapshot()
    }
  }
}
