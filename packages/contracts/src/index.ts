import { z } from 'zod'

const IsoDateTimeSchema = z.string().datetime()
const NonEmptyStringSchema = z.string().trim().min(1)

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

export const browserDriverValues = ['catalog_seed', 'chrome_profile_agent'] as const

export const BrowserDriverSchema = z.enum(browserDriverValues)
export type BrowserDriver = z.infer<typeof BrowserDriverSchema>

export const resumeExtractionStatusValues = ['not_started', 'needs_text', 'ready', 'failed'] as const

export const ResumeExtractionStatusSchema = z.enum(resumeExtractionStatusValues)
export type ResumeExtractionStatus = z.infer<typeof ResumeExtractionStatusSchema>

export const jobDiscoveryMethodValues = ['catalog_seed', 'browser_agent'] as const

export const JobDiscoveryMethodSchema = z.enum(jobDiscoveryMethodValues)
export type JobDiscoveryMethod = z.infer<typeof JobDiscoveryMethodSchema>

export const assetGenerationMethodValues = ['deterministic', 'ai_assisted'] as const

export const AssetGenerationMethodSchema = z.enum(assetGenerationMethodValues)
export type AssetGenerationMethod = z.infer<typeof AssetGenerationMethodSchema>

export const aiProviderKindValues = ['deterministic', 'openai_compatible'] as const

export const AiProviderKindSchema = z.enum(aiProviderKindValues)
export type AiProviderKind = z.infer<typeof AiProviderKindSchema>

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

export const documentFormatValues = ['html', 'pdf', 'docx'] as const

export const DocumentFormatSchema = z.enum(documentFormatValues)
export type DocumentFormat = z.infer<typeof DocumentFormatSchema>

export const resumeTemplateIdValues = ['classic_ats', 'modern_split', 'compact_exec'] as const

export const ResumeTemplateIdSchema = z.enum(resumeTemplateIdValues)
export type ResumeTemplateId = z.infer<typeof ResumeTemplateIdSchema>

export const documentFontPresetValues = ['inter_requisite', 'space_grotesk_display'] as const

export const DocumentFontPresetSchema = z.enum(documentFontPresetValues)
export type DocumentFontPreset = z.infer<typeof DocumentFontPresetSchema>

export const applicationEventEmphasisValues = ['neutral', 'positive', 'warning', 'critical'] as const

export const ApplicationEventEmphasisSchema = z.enum(applicationEventEmphasisValues)
export type ApplicationEventEmphasis = z.infer<typeof ApplicationEventEmphasisSchema>

export const ResumeSourceDocumentSchema = z.object({
  id: NonEmptyStringSchema,
  fileName: NonEmptyStringSchema,
  uploadedAt: IsoDateTimeSchema,
  storagePath: NonEmptyStringSchema.nullable().default(null),
  textContent: NonEmptyStringSchema.nullable().default(null),
  textUpdatedAt: IsoDateTimeSchema.nullable().default(null),
  extractionStatus: ResumeExtractionStatusSchema.default('not_started'),
  lastAnalyzedAt: IsoDateTimeSchema.nullable().default(null),
  analysisProviderKind: AiProviderKindSchema.nullable().default(null),
  analysisProviderLabel: NonEmptyStringSchema.nullable().default(null),
  analysisWarnings: z.array(NonEmptyStringSchema).default([])
})
export type ResumeSourceDocument = z.infer<typeof ResumeSourceDocumentSchema>

export const CandidateProfileSchema = z.object({
  id: NonEmptyStringSchema,
  firstName: NonEmptyStringSchema,
  lastName: NonEmptyStringSchema,
  middleName: NonEmptyStringSchema.nullable().default(null),
  fullName: NonEmptyStringSchema,
  headline: NonEmptyStringSchema,
  summary: NonEmptyStringSchema,
  currentLocation: NonEmptyStringSchema,
  yearsExperience: z.number().int().min(0),
  email: NonEmptyStringSchema.nullable().default(null),
  phone: NonEmptyStringSchema.nullable().default(null),
  portfolioUrl: NonEmptyStringSchema.nullable().default(null),
  linkedinUrl: NonEmptyStringSchema.nullable().default(null),
  baseResume: ResumeSourceDocumentSchema,
  targetRoles: z.array(NonEmptyStringSchema).default([]),
  locations: z.array(NonEmptyStringSchema).default([]),
  skills: z.array(NonEmptyStringSchema).default([])
})
export type CandidateProfile = z.infer<typeof CandidateProfileSchema>

export const JobSearchPreferencesSchema = z.object({
  targetRoles: z.array(NonEmptyStringSchema).default([]),
  locations: z.array(NonEmptyStringSchema).default([]),
  workModes: z.array(WorkModeSchema).default([]),
  seniorityLevels: z.array(NonEmptyStringSchema).default([]),
  minimumSalaryUsd: z.number().int().min(0).nullable(),
  approvalMode: ApprovalModeSchema,
  tailoringMode: TailoringModeSchema,
  companyBlacklist: z.array(NonEmptyStringSchema).default([]),
  companyWhitelist: z.array(NonEmptyStringSchema).default([])
})
export type JobSearchPreferences = z.infer<typeof JobSearchPreferencesSchema>

export const MatchAssessmentSchema = z.object({
  score: z.number().int().min(0).max(100),
  reasons: z.array(NonEmptyStringSchema).default([]),
  gaps: z.array(NonEmptyStringSchema).default([])
})
export type MatchAssessment = z.infer<typeof MatchAssessmentSchema>

export const JobPostingSchema = z.object({
  source: JobSourceSchema,
  sourceJobId: NonEmptyStringSchema,
  discoveryMethod: JobDiscoveryMethodSchema.default('catalog_seed'),
  canonicalUrl: NonEmptyStringSchema,
  title: NonEmptyStringSchema,
  company: NonEmptyStringSchema,
  location: NonEmptyStringSchema,
  workMode: WorkModeSchema,
  applyPath: JobApplyPathSchema,
  easyApplyEligible: z.boolean(),
  postedAt: IsoDateTimeSchema,
  discoveredAt: IsoDateTimeSchema,
  salaryText: NonEmptyStringSchema.nullable(),
  summary: NonEmptyStringSchema,
  description: NonEmptyStringSchema,
  keySkills: z.array(NonEmptyStringSchema).default([])
})
export type JobPosting = z.infer<typeof JobPostingSchema>

export const SavedJobSchema = JobPostingSchema.extend({
  id: NonEmptyStringSchema,
  status: ApplicationStatusSchema,
  matchAssessment: MatchAssessmentSchema
})
export type SavedJob = z.infer<typeof SavedJobSchema>

export const TailoredAssetPreviewSectionSchema = z.object({
  heading: NonEmptyStringSchema,
  lines: z.array(NonEmptyStringSchema).default([])
})
export type TailoredAssetPreviewSection = z.infer<typeof TailoredAssetPreviewSectionSchema>

export const TailoredAssetSchema = z.object({
  id: NonEmptyStringSchema,
  jobId: NonEmptyStringSchema,
  kind: z.literal('resume'),
  status: AssetStatusSchema,
  label: NonEmptyStringSchema,
  version: NonEmptyStringSchema,
  templateName: NonEmptyStringSchema,
  compatibilityScore: z.number().int().min(0).max(100).nullable(),
  progressPercent: z.number().int().min(0).max(100).nullable(),
  updatedAt: IsoDateTimeSchema,
  storagePath: NonEmptyStringSchema.nullable().default(null),
  contentText: NonEmptyStringSchema.nullable().default(null),
  previewSections: z.array(TailoredAssetPreviewSectionSchema).default([]),
  generationMethod: AssetGenerationMethodSchema.default('deterministic'),
  notes: z.array(NonEmptyStringSchema).default([])
})
export type TailoredAsset = z.infer<typeof TailoredAssetSchema>

export const ReviewQueueItemSchema = z.object({
  jobId: NonEmptyStringSchema,
  title: NonEmptyStringSchema,
  company: NonEmptyStringSchema,
  location: NonEmptyStringSchema,
  matchScore: z.number().int().min(0).max(100),
  applicationStatus: ApplicationStatusSchema,
  assetStatus: AssetStatusSchema,
  progressPercent: z.number().int().min(0).max(100).nullable(),
  resumeAssetId: NonEmptyStringSchema.nullable(),
  updatedAt: IsoDateTimeSchema
})
export type ReviewQueueItem = z.infer<typeof ReviewQueueItemSchema>

export const ApplicationEventSchema = z.object({
  id: NonEmptyStringSchema,
  at: IsoDateTimeSchema,
  title: NonEmptyStringSchema,
  detail: NonEmptyStringSchema,
  emphasis: ApplicationEventEmphasisSchema
})
export type ApplicationEvent = z.infer<typeof ApplicationEventSchema>

export const ApplicationAttemptCheckpointSchema = z.object({
  id: NonEmptyStringSchema,
  at: IsoDateTimeSchema,
  label: NonEmptyStringSchema,
  detail: NonEmptyStringSchema,
  state: ApplicationAttemptStateSchema
})
export type ApplicationAttemptCheckpoint = z.infer<typeof ApplicationAttemptCheckpointSchema>

export const ApplicationAttemptSchema = z.object({
  id: NonEmptyStringSchema,
  jobId: NonEmptyStringSchema,
  state: ApplicationAttemptStateSchema,
  summary: NonEmptyStringSchema,
  detail: NonEmptyStringSchema,
  startedAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  completedAt: IsoDateTimeSchema.nullable(),
  outcome: ApplicationStatusSchema.nullable(),
  checkpoints: z.array(ApplicationAttemptCheckpointSchema).default([]),
  nextActionLabel: NonEmptyStringSchema.nullable()
})
export type ApplicationAttempt = z.infer<typeof ApplicationAttemptSchema>

export const ApplyExecutionResultSchema = z.object({
  state: ApplicationAttemptStateSchema,
  summary: NonEmptyStringSchema,
  detail: NonEmptyStringSchema,
  submittedAt: IsoDateTimeSchema.nullable(),
  outcome: ApplicationStatusSchema.nullable(),
  checkpoints: z.array(ApplicationAttemptCheckpointSchema).default([]),
  nextActionLabel: NonEmptyStringSchema.nullable()
})
export type ApplyExecutionResult = z.infer<typeof ApplyExecutionResultSchema>

export const DiscoveryRunResultSchema = z.object({
  source: JobSourceSchema,
  startedAt: IsoDateTimeSchema,
  completedAt: IsoDateTimeSchema,
  querySummary: NonEmptyStringSchema,
  warning: NonEmptyStringSchema.nullable(),
  jobs: z.array(JobPostingSchema).default([])
})
export type DiscoveryRunResult = z.infer<typeof DiscoveryRunResultSchema>

export const ApplicationRecordSchema = z.object({
  id: NonEmptyStringSchema,
  jobId: NonEmptyStringSchema,
  title: NonEmptyStringSchema,
  company: NonEmptyStringSchema,
  status: ApplicationStatusSchema,
  lastActionLabel: NonEmptyStringSchema,
  nextActionLabel: NonEmptyStringSchema.nullable(),
  lastUpdatedAt: IsoDateTimeSchema,
  lastAttemptState: ApplicationAttemptStateSchema.nullable().default(null),
  events: z.array(ApplicationEventSchema).default([])
})
export type ApplicationRecord = z.infer<typeof ApplicationRecordSchema>

export const JobFinderJobActionInputSchema = z.object({
  jobId: NonEmptyStringSchema
})
export type JobFinderJobActionInput = z.infer<typeof JobFinderJobActionInputSchema>

export const BrowserSessionStateSchema = z.object({
  source: JobSourceSchema,
  status: BrowserSessionStatusSchema,
  driver: BrowserDriverSchema.default('catalog_seed'),
  label: NonEmptyStringSchema,
  detail: NonEmptyStringSchema.nullable(),
  lastCheckedAt: IsoDateTimeSchema
})
export type BrowserSessionState = z.infer<typeof BrowserSessionStateSchema>

export const AgentProviderStatusSchema = z.object({
  kind: AiProviderKindSchema,
  ready: z.boolean(),
  label: NonEmptyStringSchema,
  model: NonEmptyStringSchema.nullable().default(null),
  baseUrl: NonEmptyStringSchema.nullable().default(null),
  detail: NonEmptyStringSchema.nullable().default(null)
})
export type AgentProviderStatus = z.infer<typeof AgentProviderStatusSchema>

export const ResumeTemplateDefinitionSchema = z.object({
  id: ResumeTemplateIdSchema,
  label: NonEmptyStringSchema,
  description: NonEmptyStringSchema
})
export type ResumeTemplateDefinition = z.infer<typeof ResumeTemplateDefinitionSchema>

export const JobFinderSettingsSchema = z.object({
  resumeFormat: DocumentFormatSchema,
  resumeTemplateId: ResumeTemplateIdSchema,
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
  applicationAttempts: z.array(ApplicationAttemptSchema).default([]),
  settings: JobFinderSettingsSchema
})
export type JobFinderRepositoryState = z.infer<typeof JobFinderRepositoryStateSchema>

export const JobFinderWorkspaceSnapshotSchema = z.object({
  module: z.literal('job-finder'),
  generatedAt: IsoDateTimeSchema,
  agentProvider: AgentProviderStatusSchema,
  availableResumeTemplates: z.array(ResumeTemplateDefinitionSchema).default([]),
  profile: CandidateProfileSchema,
  searchPreferences: JobSearchPreferencesSchema,
  browserSession: BrowserSessionStateSchema,
  discoveryJobs: z.array(SavedJobSchema).default([]),
  selectedDiscoveryJobId: NonEmptyStringSchema.nullable(),
  reviewQueue: z.array(ReviewQueueItemSchema).default([]),
  selectedReviewJobId: NonEmptyStringSchema.nullable(),
  tailoredAssets: z.array(TailoredAssetSchema).default([]),
  applicationRecords: z.array(ApplicationRecordSchema).default([]),
  applicationAttempts: z.array(ApplicationAttemptSchema).default([]),
  selectedApplicationRecordId: NonEmptyStringSchema.nullable(),
  settings: JobFinderSettingsSchema
})
export type JobFinderWorkspaceSnapshot = z.infer<typeof JobFinderWorkspaceSnapshotSchema>

export const SaveCandidateProfileInputSchema = CandidateProfileSchema
export type SaveCandidateProfileInput = z.infer<typeof SaveCandidateProfileInputSchema>

export const SaveJobSearchPreferencesInputSchema = JobSearchPreferencesSchema
export type SaveJobSearchPreferencesInput = z.infer<typeof SaveJobSearchPreferencesInputSchema>

export const SaveJobFinderSettingsInputSchema = JobFinderSettingsSchema
export type SaveJobFinderSettingsInput = z.infer<typeof SaveJobFinderSettingsInputSchema>

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
