import { z } from 'zod'

const IsoDateTimeSchema = z.string().datetime()

export const suiteModules = ['job-finder', 'interview-helper'] as const
export type SuiteModule = (typeof suiteModules)[number]

export const applicationStatusValues = [
  'discovered',
  'shortlisted',
  'drafting',
  'ready_for_review',
  'approved',
  'submitted',
  'assessment',
  'interview',
  'rejected',
  'offer',
  'withdrawn',
  'archived'
] as const

export const ApplicationStatusSchema = z.enum(applicationStatusValues)
export type ApplicationStatus = z.infer<typeof ApplicationStatusSchema>

export const approvalModeValues = [
  'draft_only',
  'review_before_submit',
  'one_click_approve',
  'full_auto'
] as const

export const ApprovalModeSchema = z.enum(approvalModeValues)
export type ApprovalMode = z.infer<typeof ApprovalModeSchema>

export const tailoringModeValues = ['conservative', 'balanced', 'aggressive'] as const

export const TailoringModeSchema = z.enum(tailoringModeValues)
export type TailoringMode = z.infer<typeof TailoringModeSchema>

export const jobSourceValues = ['linkedin'] as const

export const JobSourceSchema = z.enum(jobSourceValues)
export type JobSource = z.infer<typeof JobSourceSchema>

export const workModeValues = ['remote', 'hybrid', 'onsite', 'flexible'] as const

export const WorkModeSchema = z.enum(workModeValues)
export type WorkMode = z.infer<typeof WorkModeSchema>

export const jobApplyPathValues = ['easy_apply', 'external_redirect', 'unknown'] as const

export const JobApplyPathSchema = z.enum(jobApplyPathValues)
export type JobApplyPath = z.infer<typeof JobApplyPathSchema>

export const assetStatusValues = ['not_started', 'queued', 'generating', 'ready', 'failed'] as const

export const AssetStatusSchema = z.enum(assetStatusValues)
export type AssetStatus = z.infer<typeof AssetStatusSchema>

export const browserSessionStatusValues = ['unknown', 'ready', 'login_required', 'blocked'] as const

export const BrowserSessionStatusSchema = z.enum(browserSessionStatusValues)
export type BrowserSessionStatus = z.infer<typeof BrowserSessionStatusSchema>

export const applicationAttemptStateValues = [
  'not_started',
  'ready',
  'in_progress',
  'paused',
  'submitted',
  'failed',
  'unsupported'
] as const

export const ApplicationAttemptStateSchema = z.enum(applicationAttemptStateValues)
export type ApplicationAttemptState = z.infer<typeof ApplicationAttemptStateSchema>

export const documentFormatValues = ['pdf', 'docx'] as const

export const DocumentFormatSchema = z.enum(documentFormatValues)
export type DocumentFormat = z.infer<typeof DocumentFormatSchema>

export const documentFontPresetValues = ['inter_requisite', 'space_grotesk_display'] as const

export const DocumentFontPresetSchema = z.enum(documentFontPresetValues)
export type DocumentFontPreset = z.infer<typeof DocumentFontPresetSchema>

export const applicationEventEmphasisValues = ['neutral', 'positive', 'warning', 'critical'] as const

export const ApplicationEventEmphasisSchema = z.enum(applicationEventEmphasisValues)
export type ApplicationEventEmphasis = z.infer<typeof ApplicationEventEmphasisSchema>

export const ResumeSourceDocumentSchema = z.object({
  id: z.string().min(1),
  fileName: z.string().min(1),
  uploadedAt: IsoDateTimeSchema
})
export type ResumeSourceDocument = z.infer<typeof ResumeSourceDocumentSchema>

export const CandidateProfileSchema = z.object({
  id: z.string().min(1),
  fullName: z.string().min(1),
  headline: z.string().min(1),
  summary: z.string().min(1),
  currentLocation: z.string().min(1),
  yearsExperience: z.number().int().min(0),
  baseResume: ResumeSourceDocumentSchema,
  targetRoles: z.array(z.string().min(1)).default([]),
  locations: z.array(z.string().min(1)).default([]),
  skills: z.array(z.string().min(1)).default([])
})
export type CandidateProfile = z.infer<typeof CandidateProfileSchema>

export const JobSearchPreferencesSchema = z.object({
  targetRoles: z.array(z.string().min(1)).default([]),
  locations: z.array(z.string().min(1)).default([]),
  workModes: z.array(WorkModeSchema).default([]),
  seniorityLevels: z.array(z.string().min(1)).default([]),
  minimumSalaryUsd: z.number().int().min(0).nullable(),
  approvalMode: ApprovalModeSchema,
  tailoringMode: TailoringModeSchema,
  companyBlacklist: z.array(z.string().min(1)).default([]),
  companyWhitelist: z.array(z.string().min(1)).default([])
})
export type JobSearchPreferences = z.infer<typeof JobSearchPreferencesSchema>

export const MatchAssessmentSchema = z.object({
  score: z.number().int().min(0).max(100),
  reasons: z.array(z.string().min(1)).default([]),
  gaps: z.array(z.string().min(1)).default([])
})
export type MatchAssessment = z.infer<typeof MatchAssessmentSchema>

export const SavedJobSchema = z.object({
  id: z.string().min(1),
  source: JobSourceSchema,
  title: z.string().min(1),
  company: z.string().min(1),
  location: z.string().min(1),
  workMode: WorkModeSchema,
  applyPath: JobApplyPathSchema,
  postedAt: IsoDateTimeSchema,
  salaryText: z.string().min(1).nullable(),
  summary: z.string().min(1),
  keySkills: z.array(z.string().min(1)).default([]),
  status: ApplicationStatusSchema,
  matchAssessment: MatchAssessmentSchema
})
export type SavedJob = z.infer<typeof SavedJobSchema>

export const TailoredAssetPreviewSectionSchema = z.object({
  heading: z.string().min(1),
  lines: z.array(z.string().min(1)).default([])
})
export type TailoredAssetPreviewSection = z.infer<typeof TailoredAssetPreviewSectionSchema>

export const TailoredAssetSchema = z.object({
  id: z.string().min(1),
  jobId: z.string().min(1),
  kind: z.literal('resume'),
  status: AssetStatusSchema,
  label: z.string().min(1),
  version: z.string().min(1),
  templateName: z.string().min(1),
  compatibilityScore: z.number().int().min(0).max(100).nullable(),
  progressPercent: z.number().int().min(0).max(100).nullable(),
  updatedAt: IsoDateTimeSchema,
  previewSections: z.array(TailoredAssetPreviewSectionSchema).default([])
})
export type TailoredAsset = z.infer<typeof TailoredAssetSchema>

export const ReviewQueueItemSchema = z.object({
  jobId: z.string().min(1),
  title: z.string().min(1),
  company: z.string().min(1),
  location: z.string().min(1),
  matchScore: z.number().int().min(0).max(100),
  applicationStatus: ApplicationStatusSchema,
  assetStatus: AssetStatusSchema,
  progressPercent: z.number().int().min(0).max(100).nullable(),
  resumeAssetId: z.string().min(1).nullable(),
  updatedAt: IsoDateTimeSchema
})
export type ReviewQueueItem = z.infer<typeof ReviewQueueItemSchema>

export const ApplicationEventSchema = z.object({
  id: z.string().min(1),
  at: IsoDateTimeSchema,
  title: z.string().min(1),
  detail: z.string().min(1),
  emphasis: ApplicationEventEmphasisSchema
})
export type ApplicationEvent = z.infer<typeof ApplicationEventSchema>

export const ApplicationRecordSchema = z.object({
  id: z.string().min(1),
  jobId: z.string().min(1),
  title: z.string().min(1),
  company: z.string().min(1),
  status: ApplicationStatusSchema,
  lastActionLabel: z.string().min(1),
  nextActionLabel: z.string().min(1).nullable(),
  lastUpdatedAt: IsoDateTimeSchema,
  events: z.array(ApplicationEventSchema).default([])
})
export type ApplicationRecord = z.infer<typeof ApplicationRecordSchema>

export const ApplicationAttemptSchema = z.object({
  id: z.string().min(1),
  jobId: z.string().min(1),
  state: ApplicationAttemptStateSchema,
  updatedAt: IsoDateTimeSchema,
  outcome: ApplicationStatusSchema.nullable()
})
export type ApplicationAttempt = z.infer<typeof ApplicationAttemptSchema>

export const JobFinderJobActionInputSchema = z.object({
  jobId: z.string().min(1)
})
export type JobFinderJobActionInput = z.infer<typeof JobFinderJobActionInputSchema>

export const BrowserSessionStateSchema = z.object({
  source: JobSourceSchema,
  status: BrowserSessionStatusSchema,
  label: z.string().min(1),
  detail: z.string().min(1).nullable(),
  lastCheckedAt: IsoDateTimeSchema
})
export type BrowserSessionState = z.infer<typeof BrowserSessionStateSchema>

export const JobFinderSettingsSchema = z.object({
  resumeFormat: DocumentFormatSchema,
  fontPreset: DocumentFontPresetSchema,
  humanReviewRequired: z.boolean(),
  allowAutoSubmitOverride: z.boolean(),
  keepSessionAlive: z.boolean()
})
export type JobFinderSettings = z.infer<typeof JobFinderSettingsSchema>

export const JobFinderRepositoryStateSchema = z.object({
  profile: CandidateProfileSchema,
  searchPreferences: JobSearchPreferencesSchema,
  savedJobs: z.array(SavedJobSchema).default([]),
  tailoredAssets: z.array(TailoredAssetSchema).default([]),
  applicationRecords: z.array(ApplicationRecordSchema).default([]),
  settings: JobFinderSettingsSchema
})
export type JobFinderRepositoryState = z.infer<typeof JobFinderRepositoryStateSchema>

export const JobFinderWorkspaceSnapshotSchema = z.object({
  module: z.literal('job-finder'),
  generatedAt: IsoDateTimeSchema,
  profile: CandidateProfileSchema,
  searchPreferences: JobSearchPreferencesSchema,
  browserSession: BrowserSessionStateSchema,
  discoveryJobs: z.array(SavedJobSchema).default([]),
  selectedDiscoveryJobId: z.string().min(1).nullable(),
  reviewQueue: z.array(ReviewQueueItemSchema).default([]),
  selectedReviewJobId: z.string().min(1).nullable(),
  tailoredAssets: z.array(TailoredAssetSchema).default([]),
  applicationRecords: z.array(ApplicationRecordSchema).default([]),
  selectedApplicationRecordId: z.string().min(1).nullable(),
  settings: JobFinderSettingsSchema
})
export type JobFinderWorkspaceSnapshot = z.infer<typeof JobFinderWorkspaceSnapshotSchema>

export const DesktopPlatformPingSchema = z.object({
  ok: z.literal(true),
  platform: z.enum(['darwin', 'win32', 'linux'])
})
export type DesktopPlatformPing = z.infer<typeof DesktopPlatformPingSchema>

export const DesktopWindowControlsStateSchema = z.object({
  isMaximized: z.boolean(),
  isMinimizable: z.boolean(),
  isClosable: z.boolean()
})
export type DesktopWindowControlsState = z.infer<typeof DesktopWindowControlsStateSchema>
