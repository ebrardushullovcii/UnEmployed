import { z } from 'zod'

const IsoDateTimeSchema = z.string().datetime()
const NonEmptyStringSchema = z.string().trim().min(1)
const UrlStringSchema = z.string().trim().url()

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

export const jobSourceValues = ['target_site'] as const

export const JobSourceSchema = z.enum(jobSourceValues)
export type JobSource = z.infer<typeof JobSourceSchema>

export const jobSourceAdapterKindValues = ['auto'] as const

export const JobSourceAdapterKindSchema = z.enum(jobSourceAdapterKindValues)
export type JobSourceAdapterKind = z.infer<typeof JobSourceAdapterKindSchema>

export const workModeValues = ['remote', 'hybrid', 'onsite', 'flexible'] as const

export const WorkModeSchema = z.enum(workModeValues)
export type WorkMode = z.infer<typeof WorkModeSchema>

export function normalizeWorkModeList(value: unknown): unknown {
  if (value == null) {
    return []
  }

  if (Array.isArray(value)) {
    return value
  }

  if (typeof value === 'string') {
    return value.trim() ? [value] : []
  }

  return value
}

export const WorkModeListSchema = z.preprocess(normalizeWorkModeList, z.array(WorkModeSchema).default([]))

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

export const discoveryRunStateValues = ['idle', 'running', 'completed', 'cancelled', 'failed'] as const

export const DiscoveryRunStateSchema = z.enum(discoveryRunStateValues)
export type DiscoveryRunState = z.infer<typeof DiscoveryRunStateSchema>

export const sourceDebugRunStateValues = [
  'idle',
  'running',
  'paused_manual',
  'completed',
  'cancelled',
  'failed',
  'interrupted'
] as const

export const SourceDebugRunStateSchema = z.enum(sourceDebugRunStateValues)
export type SourceDebugRunState = z.infer<typeof SourceDebugRunStateSchema>

export const sourceDebugPhaseValues = [
  'access_auth_probe',
  'site_structure_mapping',
  'search_filter_probe',
  'job_detail_validation',
  'apply_path_validation',
  'replay_verification'
] as const

export const SourceDebugPhaseSchema = z.enum(sourceDebugPhaseValues)
export type SourceDebugPhase = z.infer<typeof SourceDebugPhaseSchema>

export const sourceDebugAttemptOutcomeValues = [
  'succeeded',
  'partial',
  'blocked_auth',
  'blocked_manual_step',
  'blocked_site_protection',
  'unsupported_layout',
  'exhausted_duplicate_paths',
  'exhausted_no_progress',
  'failed_runtime',
  'interrupted'
] as const

export const SourceDebugAttemptOutcomeSchema = z.enum(sourceDebugAttemptOutcomeValues)
export type SourceDebugAttemptOutcome = z.infer<typeof SourceDebugAttemptOutcomeSchema>

export const sourceDebugPhaseCompletionModeValues = [
  'structured_finish',
  'forced_finish',
  'timed_out_with_partial_evidence',
  'timed_out_without_evidence',
  'blocked_auth',
  'blocked_manual_step',
  'blocked_site_protection',
  'runtime_failed',
  'interrupted'
] as const

export const SourceDebugPhaseCompletionModeSchema = z.enum(sourceDebugPhaseCompletionModeValues)
export type SourceDebugPhaseCompletionMode = z.infer<typeof SourceDebugPhaseCompletionModeSchema>

export const sourceInstructionStatusValues = ['missing', 'draft', 'validated', 'stale', 'unsupported'] as const

export const SourceInstructionStatusSchema = z.enum(sourceInstructionStatusValues)
export type SourceInstructionStatus = z.infer<typeof SourceInstructionStatusSchema>

export const sourceInstructionVerificationOutcomeValues = ['unverified', 'passed', 'failed', 'stale'] as const

export const SourceInstructionVerificationOutcomeSchema = z.enum(sourceInstructionVerificationOutcomeValues)
export type SourceInstructionVerificationOutcome = z.infer<typeof SourceInstructionVerificationOutcomeSchema>

export const sourceDebugEvidenceKindValues = ['url', 'screenshot', 'note'] as const

export const SourceDebugEvidenceKindSchema = z.enum(sourceDebugEvidenceKindValues)
export type SourceDebugEvidenceKind = z.infer<typeof SourceDebugEvidenceKindSchema>

export const discoveryTargetExecutionStateValues = [
  'planned',
  'running',
  'completed',
  'cancelled',
  'failed',
  'skipped'
] as const

export const DiscoveryTargetExecutionStateSchema = z.enum(discoveryTargetExecutionStateValues)
export type DiscoveryTargetExecutionState = z.infer<typeof DiscoveryTargetExecutionStateSchema>

export const discoveryActivityKindValues = ['info', 'progress', 'warning', 'success', 'error'] as const

export const DiscoveryActivityKindSchema = z.enum(discoveryActivityKindValues)
export type DiscoveryActivityKind = z.infer<typeof DiscoveryActivityKindSchema>

export const discoveryActivityTerminalStateValues = ['completed', 'failed', 'cancelled', 'skipped'] as const

export const DiscoveryActivityTerminalStateSchema = z.enum(discoveryActivityTerminalStateValues)
export type DiscoveryActivityTerminalState = z.infer<typeof DiscoveryActivityTerminalStateSchema>

export const discoveryActivityStageValues = [
  'planning',
  'target',
  'navigation',
  'extraction',
  'scoring',
  'persistence',
  'run'
] as const

export const DiscoveryActivityStageSchema = z.enum(discoveryActivityStageValues)
export type DiscoveryActivityStage = z.infer<typeof DiscoveryActivityStageSchema>

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

export const CandidateExperienceSchema = z.object({
  id: NonEmptyStringSchema,
  companyName: NonEmptyStringSchema.nullable().default(null),
  companyUrl: NonEmptyStringSchema.nullable().default(null),
  title: NonEmptyStringSchema.nullable().default(null),
  employmentType: NonEmptyStringSchema.nullable().default(null),
  location: NonEmptyStringSchema.nullable().default(null),
  workMode: WorkModeListSchema,
  startDate: NonEmptyStringSchema.nullable().default(null),
  endDate: NonEmptyStringSchema.nullable().default(null),
  isCurrent: z.boolean().default(false),
  isDraft: z.boolean().default(false),
  summary: NonEmptyStringSchema.nullable().default(null),
  achievements: z.array(NonEmptyStringSchema).default([]),
  skills: z.array(NonEmptyStringSchema).default([]),
  domainTags: z.array(NonEmptyStringSchema).default([]),
  peopleManagementScope: NonEmptyStringSchema.nullable().default(null),
  ownershipScope: NonEmptyStringSchema.nullable().default(null)
})
export type CandidateExperience = z.infer<typeof CandidateExperienceSchema>

export const CandidateEducationSchema = z.object({
  id: NonEmptyStringSchema,
  schoolName: NonEmptyStringSchema.nullable().default(null),
  degree: NonEmptyStringSchema.nullable().default(null),
  fieldOfStudy: NonEmptyStringSchema.nullable().default(null),
  location: NonEmptyStringSchema.nullable().default(null),
  startDate: NonEmptyStringSchema.nullable().default(null),
  endDate: NonEmptyStringSchema.nullable().default(null),
  isDraft: z.boolean().default(false),
  summary: NonEmptyStringSchema.nullable().default(null)
})
export type CandidateEducation = z.infer<typeof CandidateEducationSchema>

export const CandidateCertificationSchema = z.object({
  id: NonEmptyStringSchema,
  name: NonEmptyStringSchema.nullable().default(null),
  issuer: NonEmptyStringSchema.nullable().default(null),
  issueDate: NonEmptyStringSchema.nullable().default(null),
  expiryDate: NonEmptyStringSchema.nullable().default(null),
  credentialUrl: UrlStringSchema.nullable().default(null),
  isDraft: z.boolean().default(false)
})
export type CandidateCertification = z.infer<typeof CandidateCertificationSchema>

export const candidateLinkKindValues = [
  'portfolio',
  'linkedin',
  'github',
  'website',
  'repository',
  'case_study',
  'other'
] as const
export const CandidateLinkKindSchema = z.enum(candidateLinkKindValues)
export type CandidateLinkKind = z.infer<typeof CandidateLinkKindSchema>

export const CandidateLinkSchema = z.object({
  id: NonEmptyStringSchema,
  label: NonEmptyStringSchema.nullable().default(null),
  url: UrlStringSchema.nullable().default(null),
  kind: CandidateLinkKindSchema.nullable().default(null),
  isDraft: z.boolean().default(false)
})
export type CandidateLink = z.infer<typeof CandidateLinkSchema>

export const CandidateProjectSchema = z.object({
  id: NonEmptyStringSchema,
  name: NonEmptyStringSchema,
  projectType: NonEmptyStringSchema.nullable().default(null),
  summary: NonEmptyStringSchema.nullable().default(null),
  role: NonEmptyStringSchema.nullable().default(null),
  skills: z.array(NonEmptyStringSchema).default([]),
  outcome: NonEmptyStringSchema.nullable().default(null),
  projectUrl: NonEmptyStringSchema.nullable().default(null),
  repositoryUrl: NonEmptyStringSchema.nullable().default(null),
  caseStudyUrl: NonEmptyStringSchema.nullable().default(null)
})
export type CandidateProject = z.infer<typeof CandidateProjectSchema>

export const CandidateLanguageSchema = z.object({
  id: NonEmptyStringSchema,
  language: NonEmptyStringSchema,
  proficiency: NonEmptyStringSchema.nullable().default(null),
  interviewPreference: z.boolean().default(false),
  notes: NonEmptyStringSchema.nullable().default(null)
})
export type CandidateLanguage = z.infer<typeof CandidateLanguageSchema>

export const CandidateWorkEligibilitySchema = z.object({
  authorizedWorkCountries: z.array(NonEmptyStringSchema).default([]),
  requiresVisaSponsorship: z.boolean().nullable().default(null),
  willingToRelocate: z.boolean().nullable().default(null),
  preferredRelocationRegions: z.array(NonEmptyStringSchema).default([]),
  willingToTravel: z.boolean().nullable().default(null),
  remoteEligible: z.boolean().nullable().default(null),
  noticePeriodDays: z.number().int().min(0).nullable().default(null),
  availableStartDate: NonEmptyStringSchema.nullable().default(null),
  securityClearance: NonEmptyStringSchema.nullable().default(null)
})
export type CandidateWorkEligibility = z.infer<typeof CandidateWorkEligibilitySchema>

export const CandidateProfessionalSummarySchema = z.object({
  shortValueProposition: NonEmptyStringSchema.nullable().default(null),
  fullSummary: NonEmptyStringSchema.nullable().default(null),
  careerThemes: z.array(NonEmptyStringSchema).default([]),
  leadershipSummary: NonEmptyStringSchema.nullable().default(null),
  domainFocusSummary: NonEmptyStringSchema.nullable().default(null),
  strengths: z.array(NonEmptyStringSchema).default([])
})
export type CandidateProfessionalSummary = z.infer<typeof CandidateProfessionalSummarySchema>

export const CandidateSkillGroupSchema = z.object({
  coreSkills: z.array(NonEmptyStringSchema).default([]),
  tools: z.array(NonEmptyStringSchema).default([]),
  languagesAndFrameworks: z.array(NonEmptyStringSchema).default([]),
  softSkills: z.array(NonEmptyStringSchema).default([]),
  highlightedSkills: z.array(NonEmptyStringSchema).default([])
})
export type CandidateSkillGroup = z.infer<typeof CandidateSkillGroupSchema>

export const CandidateProfileSchema = z.object({
  id: NonEmptyStringSchema,
  firstName: NonEmptyStringSchema,
  lastName: NonEmptyStringSchema,
  middleName: NonEmptyStringSchema.nullable().default(null),
  fullName: NonEmptyStringSchema,
  preferredDisplayName: NonEmptyStringSchema.nullable().default(null),
  headline: NonEmptyStringSchema,
  summary: NonEmptyStringSchema,
  currentLocation: NonEmptyStringSchema,
  currentCity: NonEmptyStringSchema.nullable().default(null),
  currentRegion: NonEmptyStringSchema.nullable().default(null),
  currentCountry: NonEmptyStringSchema.nullable().default(null),
  timeZone: NonEmptyStringSchema.nullable().default(null),
  yearsExperience: z.number().int().min(0),
  email: NonEmptyStringSchema.nullable().default(null),
  secondaryEmail: NonEmptyStringSchema.nullable().default(null),
  phone: NonEmptyStringSchema.nullable().default(null),
  portfolioUrl: NonEmptyStringSchema.nullable().default(null),
  linkedinUrl: NonEmptyStringSchema.nullable().default(null),
  githubUrl: NonEmptyStringSchema.nullable().default(null),
  personalWebsiteUrl: NonEmptyStringSchema.nullable().default(null),
  baseResume: ResumeSourceDocumentSchema,
  workEligibility: CandidateWorkEligibilitySchema.default({}),
  professionalSummary: CandidateProfessionalSummarySchema.default({}),
  skillGroups: CandidateSkillGroupSchema.default({}),
  targetRoles: z.array(NonEmptyStringSchema).default([]),
  locations: z.array(NonEmptyStringSchema).default([]),
  skills: z.array(NonEmptyStringSchema).default([]),
  experiences: z.array(CandidateExperienceSchema).default([]),
  education: z.array(CandidateEducationSchema).default([]),
  certifications: z.array(CandidateCertificationSchema).default([]),
  links: z.array(CandidateLinkSchema).default([]),
  projects: z.array(CandidateProjectSchema).default([]),
  spokenLanguages: z.array(CandidateLanguageSchema).default([])
})
export type CandidateProfile = z.infer<typeof CandidateProfileSchema>

export const SourceInstructionVersionInfoSchema = z.object({
  promptProfileVersion: NonEmptyStringSchema,
  toolsetVersion: NonEmptyStringSchema,
  adapterVersion: NonEmptyStringSchema,
  appSchemaVersion: NonEmptyStringSchema.nullable().default(null)
})
export type SourceInstructionVersionInfo = z.infer<typeof SourceInstructionVersionInfoSchema>

export const SourceDebugCompactionStateSchema = z.object({
  compactedAt: IsoDateTimeSchema,
  compactionCount: z.number().int().nonnegative().default(0),
  summary: NonEmptyStringSchema,
  confirmedFacts: z.array(NonEmptyStringSchema).default([]),
  blockerNotes: z.array(NonEmptyStringSchema).default([]),
  avoidStrategyFingerprints: z.array(NonEmptyStringSchema).default([]),
  preservedContext: z.array(NonEmptyStringSchema).default([])
})
export type SourceDebugCompactionState = z.infer<typeof SourceDebugCompactionStateSchema>

export const SourceDebugPhaseEvidenceSchema = z.object({
  visibleControls: z.array(NonEmptyStringSchema).default([]),
  successfulInteractions: z.array(NonEmptyStringSchema).default([]),
  routeSignals: z.array(NonEmptyStringSchema).default([]),
  attemptedControls: z.array(NonEmptyStringSchema).default([]),
  warnings: z.array(NonEmptyStringSchema).default([])
})
export type SourceDebugPhaseEvidence = z.infer<typeof SourceDebugPhaseEvidenceSchema>

export const SourceDebugEvidenceRefSchema = z.object({
  id: NonEmptyStringSchema,
  runId: NonEmptyStringSchema,
  attemptId: NonEmptyStringSchema,
  targetId: NonEmptyStringSchema,
  phase: SourceDebugPhaseSchema,
  kind: SourceDebugEvidenceKindSchema,
  label: NonEmptyStringSchema,
  capturedAt: IsoDateTimeSchema,
  url: UrlStringSchema.nullable().default(null),
  storagePath: NonEmptyStringSchema.nullable().default(null),
  excerpt: NonEmptyStringSchema.nullable().default(null)
})
export type SourceDebugEvidenceRef = z.infer<typeof SourceDebugEvidenceRefSchema>

export const SourceDebugWorkerAttemptSchema = z.object({
  id: NonEmptyStringSchema,
  runId: NonEmptyStringSchema,
  targetId: NonEmptyStringSchema,
  phase: SourceDebugPhaseSchema,
  startedAt: IsoDateTimeSchema,
  completedAt: IsoDateTimeSchema.nullable().default(null),
  outcome: SourceDebugAttemptOutcomeSchema,
  completionMode: SourceDebugPhaseCompletionModeSchema.default('structured_finish'),
  completionReason: NonEmptyStringSchema.nullable().default(null),
  strategyLabel: NonEmptyStringSchema,
  strategyFingerprint: NonEmptyStringSchema,
  confirmedFacts: z.array(NonEmptyStringSchema).default([]),
  attemptedActions: z.array(NonEmptyStringSchema).default([]),
  blockerSummary: NonEmptyStringSchema.nullable().default(null),
  resultSummary: NonEmptyStringSchema,
  confidenceScore: z.number().int().min(0).max(100).default(0),
  nextRecommendedStrategies: z.array(NonEmptyStringSchema).default([]),
  avoidStrategyFingerprints: z.array(NonEmptyStringSchema).default([]),
  evidenceRefIds: z.array(NonEmptyStringSchema).default([]),
  phaseEvidence: SourceDebugPhaseEvidenceSchema.nullable().default(null),
  compactionState: SourceDebugCompactionStateSchema.nullable().default(null)
})
export type SourceDebugWorkerAttempt = z.infer<typeof SourceDebugWorkerAttemptSchema>

export const SourceDebugPhaseSummarySchema = z.object({
  phase: SourceDebugPhaseSchema,
  summary: NonEmptyStringSchema,
  completionMode: SourceDebugPhaseCompletionModeSchema.default('structured_finish'),
  completionReason: NonEmptyStringSchema.nullable().default(null),
  confirmedFacts: z.array(NonEmptyStringSchema).default([]),
  blockerNotes: z.array(NonEmptyStringSchema).default([]),
  nextRecommendedStrategies: z.array(NonEmptyStringSchema).default([]),
  avoidStrategyFingerprints: z.array(NonEmptyStringSchema).default([]),
  producedAttemptIds: z.array(NonEmptyStringSchema).default([])
})
export type SourceDebugPhaseSummary = z.infer<typeof SourceDebugPhaseSummarySchema>

export const SourceInstructionVerificationSchema = z.object({
  id: NonEmptyStringSchema,
  replayRunId: NonEmptyStringSchema.nullable().default(null),
  verifiedAt: IsoDateTimeSchema.nullable().default(null),
  outcome: SourceInstructionVerificationOutcomeSchema.default('unverified'),
  proofSummary: NonEmptyStringSchema.nullable().default(null),
  reason: NonEmptyStringSchema.nullable().default(null),
  versionInfo: SourceInstructionVersionInfoSchema
})
export type SourceInstructionVerification = z.infer<typeof SourceInstructionVerificationSchema>

export const SourceInstructionArtifactSchema = z.object({
  id: NonEmptyStringSchema,
  targetId: NonEmptyStringSchema,
  status: SourceInstructionStatusSchema.default('draft'),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  acceptedAt: IsoDateTimeSchema.nullable().default(null),
  basedOnRunId: NonEmptyStringSchema,
  basedOnAttemptIds: z.array(NonEmptyStringSchema).default([]),
  notes: NonEmptyStringSchema.nullable().default(null),
  navigationGuidance: z.array(NonEmptyStringSchema).default([]),
  searchGuidance: z.array(NonEmptyStringSchema).default([]),
  detailGuidance: z.array(NonEmptyStringSchema).default([]),
  applyGuidance: z.array(NonEmptyStringSchema).default([]),
  warnings: z.array(NonEmptyStringSchema).default([]),
  versionInfo: SourceInstructionVersionInfoSchema,
  verification: SourceInstructionVerificationSchema.nullable().default(null)
})
export type SourceInstructionArtifact = z.infer<typeof SourceInstructionArtifactSchema>

export const SourceDebugRunRecordSchema = z.object({
  id: NonEmptyStringSchema,
  targetId: NonEmptyStringSchema,
  state: SourceDebugRunStateSchema.default('idle'),
  startedAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  completedAt: IsoDateTimeSchema.nullable().default(null),
  activePhase: SourceDebugPhaseSchema.nullable().default(null),
  phases: z.array(SourceDebugPhaseSchema).default([]),
  targetLabel: NonEmptyStringSchema,
  targetUrl: UrlStringSchema,
  targetHostname: NonEmptyStringSchema,
  manualPrerequisiteSummary: NonEmptyStringSchema.nullable().default(null),
  finalSummary: NonEmptyStringSchema.nullable().default(null),
  attemptIds: z.array(NonEmptyStringSchema).default([]),
  phaseSummaries: z.array(SourceDebugPhaseSummarySchema).default([]),
  instructionArtifactId: NonEmptyStringSchema.nullable().default(null)
})
export type SourceDebugRunRecord = z.infer<typeof SourceDebugRunRecordSchema>

export const SourceDebugRunDetailsSchema = z.object({
  run: SourceDebugRunRecordSchema,
  attempts: z.array(SourceDebugWorkerAttemptSchema).default([]),
  evidenceRefs: z.array(SourceDebugEvidenceRefSchema).default([]),
  instructionArtifact: SourceInstructionArtifactSchema.nullable().default(null)
})
export type SourceDebugRunDetails = z.infer<typeof SourceDebugRunDetailsSchema>

export const JobDiscoveryTargetSchema = z.object({
  id: NonEmptyStringSchema,
  label: NonEmptyStringSchema,
  startingUrl: UrlStringSchema,
  enabled: z.boolean().default(true),
  adapterKind: JobSourceAdapterKindSchema.default('auto'),
  customInstructions: NonEmptyStringSchema.nullable().default(null),
  instructionStatus: SourceInstructionStatusSchema.default('missing'),
  validatedInstructionId: NonEmptyStringSchema.nullable().default(null),
  draftInstructionId: NonEmptyStringSchema.nullable().default(null),
  lastDebugRunId: NonEmptyStringSchema.nullable().default(null),
  lastVerifiedAt: IsoDateTimeSchema.nullable().default(null),
  staleReason: NonEmptyStringSchema.nullable().default(null)
})
export type JobDiscoveryTarget = z.infer<typeof JobDiscoveryTargetSchema>

export const JobDiscoveryPreferencesSchema = z.object({
  targets: z.array(JobDiscoveryTargetSchema).default([]),
  historyLimit: z.number().int().min(1).max(10).default(5)
})
export type JobDiscoveryPreferences = z.infer<typeof JobDiscoveryPreferencesSchema>

export const JobSearchPreferencesSchema = z.object({
  targetRoles: z.array(NonEmptyStringSchema).default([]),
  jobFamilies: z.array(NonEmptyStringSchema).default([]),
  locations: z.array(NonEmptyStringSchema).default([]),
  excludedLocations: z.array(NonEmptyStringSchema).default([]),
  workModes: WorkModeListSchema,
  seniorityLevels: z.array(NonEmptyStringSchema).default([]),
  targetIndustries: z.array(NonEmptyStringSchema).default([]),
  targetCompanyStages: z.array(NonEmptyStringSchema).default([]),
  employmentTypes: z.array(NonEmptyStringSchema).default([]),
  minimumSalaryUsd: z.number().int().min(0).nullable(),
  targetSalaryUsd: z.number().int().min(0).nullable().default(null),
  salaryCurrency: NonEmptyStringSchema.nullable().default('USD'),
  approvalMode: ApprovalModeSchema,
  tailoringMode: TailoringModeSchema,
  companyBlacklist: z.array(NonEmptyStringSchema).default([]),
  companyWhitelist: z.array(NonEmptyStringSchema).default([]),
  discovery: JobDiscoveryPreferencesSchema.default({})
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
  workMode: WorkModeListSchema,
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

export const SavedJobDiscoveryProvenanceSchema = z.object({
  targetId: NonEmptyStringSchema,
  adapterKind: JobSourceAdapterKindSchema,
  resolvedAdapterKind: JobSourceSchema.nullable().default(null),
  startingUrl: UrlStringSchema,
  discoveredAt: IsoDateTimeSchema
})
export type SavedJobDiscoveryProvenance = z.infer<typeof SavedJobDiscoveryProvenanceSchema>

export const SavedJobSchema = JobPostingSchema.extend({
  id: NonEmptyStringSchema,
  status: ApplicationStatusSchema,
  matchAssessment: MatchAssessmentSchema,
  provenance: z.array(SavedJobDiscoveryProvenanceSchema).default([])
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

export const AgentDebugFindingsSchema = z.object({
  summary: NonEmptyStringSchema.nullable().default(null),
  reliableControls: z.array(NonEmptyStringSchema).default([]),
  trickyFilters: z.array(NonEmptyStringSchema).default([]),
  navigationTips: z.array(NonEmptyStringSchema).default([]),
  applyTips: z.array(NonEmptyStringSchema).default([]),
  warnings: z.array(NonEmptyStringSchema).default([])
})
export type AgentDebugFindings = z.infer<typeof AgentDebugFindingsSchema>

export const DiscoveryAgentMetadataSchema = z.object({
  steps: z.number().int().nonnegative().default(0),
  incomplete: z.boolean().default(false),
  transcriptMessageCount: z.number().int().nonnegative().default(0),
  reviewTranscript: z.array(NonEmptyStringSchema).default([]),
  compactionState: SourceDebugCompactionStateSchema.nullable().default(null),
  phaseCompletionMode: SourceDebugPhaseCompletionModeSchema.nullable().default(null),
  phaseCompletionReason: NonEmptyStringSchema.nullable().default(null),
  phaseEvidence: SourceDebugPhaseEvidenceSchema.nullable().default(null),
  debugFindings: AgentDebugFindingsSchema.nullable().default(null)
})
export type DiscoveryAgentMetadata = z.infer<typeof DiscoveryAgentMetadataSchema>

export const DiscoveryRunResultSchema = z.object({
  source: JobSourceSchema,
  startedAt: IsoDateTimeSchema,
  completedAt: IsoDateTimeSchema,
  querySummary: NonEmptyStringSchema,
  warning: NonEmptyStringSchema.nullable(),
  jobs: z.array(JobPostingSchema).default([]),
  agentMetadata: DiscoveryAgentMetadataSchema.nullable().default(null)
})
export type DiscoveryRunResult = z.infer<typeof DiscoveryRunResultSchema>

export const DiscoveryAdapterSessionStateSchema = z.object({
  adapterKind: JobSourceSchema,
  status: BrowserSessionStatusSchema,
  driver: BrowserDriverSchema.default('catalog_seed'),
  label: NonEmptyStringSchema,
  detail: NonEmptyStringSchema.nullable().default(null),
  lastCheckedAt: IsoDateTimeSchema
})
export type DiscoveryAdapterSessionState = z.infer<typeof DiscoveryAdapterSessionStateSchema>

export const DiscoveryTargetExecutionSchema = z.object({
  targetId: NonEmptyStringSchema,
  adapterKind: JobSourceAdapterKindSchema,
  resolvedAdapterKind: JobSourceSchema.nullable().default(null),
  state: DiscoveryTargetExecutionStateSchema,
  startedAt: IsoDateTimeSchema.nullable().default(null),
  completedAt: IsoDateTimeSchema.nullable().default(null),
  jobsFound: z.number().int().nonnegative().default(0),
  jobsPersisted: z.number().int().nonnegative().default(0),
  jobsStaged: z.number().int().nonnegative().default(0),
  warning: NonEmptyStringSchema.nullable().default(null)
})
export type DiscoveryTargetExecution = z.infer<typeof DiscoveryTargetExecutionSchema>

export const DiscoveryActivityEventSchema = z.object({
  id: NonEmptyStringSchema,
  runId: NonEmptyStringSchema,
  timestamp: IsoDateTimeSchema,
  kind: DiscoveryActivityKindSchema,
  stage: DiscoveryActivityStageSchema,
  targetId: NonEmptyStringSchema.nullable().default(null),
  adapterKind: JobSourceAdapterKindSchema.nullable().default(null),
  resolvedAdapterKind: JobSourceSchema.nullable().default(null),
  message: NonEmptyStringSchema,
  terminalState: DiscoveryActivityTerminalStateSchema.nullable().default(null),
  url: UrlStringSchema.nullable().default(null),
  jobsFound: z.number().int().nonnegative().nullable().default(null),
  jobsPersisted: z.number().int().nonnegative().nullable().default(null),
  jobsStaged: z.number().int().nonnegative().nullable().default(null),
  duplicatesMerged: z.number().int().nonnegative().nullable().default(null),
  invalidSkipped: z.number().int().nonnegative().nullable().default(null)
})
export type DiscoveryActivityEvent = z.infer<typeof DiscoveryActivityEventSchema>

export const DiscoveryRunSummarySchema = z.object({
  targetsPlanned: z.number().int().nonnegative().default(0),
  targetsCompleted: z.number().int().nonnegative().default(0),
  validJobsFound: z.number().int().nonnegative().default(0),
  jobsPersisted: z.number().int().nonnegative().default(0),
  jobsStaged: z.number().int().nonnegative().default(0),
  duplicatesMerged: z.number().int().nonnegative().default(0),
  invalidSkipped: z.number().int().nonnegative().default(0),
  durationMs: z.number().int().nonnegative().default(0),
  outcome: DiscoveryRunStateSchema.default('idle')
})
export type DiscoveryRunSummary = z.infer<typeof DiscoveryRunSummarySchema>

export const DiscoveryRunRecordSchema = z.object({
  id: NonEmptyStringSchema,
  state: DiscoveryRunStateSchema,
  startedAt: IsoDateTimeSchema,
  completedAt: IsoDateTimeSchema.nullable().default(null),
  targetIds: z.array(NonEmptyStringSchema).default([]),
  targetExecutions: z.array(DiscoveryTargetExecutionSchema).default([]),
  activity: z.array(DiscoveryActivityEventSchema).default([]),
  summary: DiscoveryRunSummarySchema.default({})
})
export type DiscoveryRunRecord = z.infer<typeof DiscoveryRunRecordSchema>

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

export const JobFinderSourceDebugActionInputSchema = z.object({
  targetId: NonEmptyStringSchema
})
export type JobFinderSourceDebugActionInput = z.infer<typeof JobFinderSourceDebugActionInputSchema>

export const JobFinderSourceDebugRunQuerySchema = z.object({
  runId: NonEmptyStringSchema
})
export type JobFinderSourceDebugRunQuery = z.infer<typeof JobFinderSourceDebugRunQuerySchema>

export const JobFinderSourceInstructionActionInputSchema = z.object({
  targetId: NonEmptyStringSchema,
  instructionId: NonEmptyStringSchema
})
export type JobFinderSourceInstructionActionInput = z.infer<typeof JobFinderSourceInstructionActionInputSchema>

export const JobFinderSaveSourceInstructionInputSchema = z.object({
  targetId: NonEmptyStringSchema,
  artifact: SourceInstructionArtifactSchema
})
export type JobFinderSaveSourceInstructionInput = z.infer<typeof JobFinderSaveSourceInstructionInputSchema>

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
  keepSessionAlive: z.boolean(),
  discoveryOnly: z.boolean().default(false)
})
export type JobFinderSettings = z.infer<typeof JobFinderSettingsSchema>

export const JobFinderDiscoveryStateSchema = z.object({
  sessions: z.array(DiscoveryAdapterSessionStateSchema).default([]),
  runState: DiscoveryRunStateSchema.default('idle'),
  activeRun: DiscoveryRunRecordSchema.nullable().default(null),
  recentRuns: z.array(DiscoveryRunRecordSchema).default([]),
  activeSourceDebugRun: SourceDebugRunRecordSchema.nullable().default(null),
  recentSourceDebugRuns: z.array(SourceDebugRunRecordSchema).default([]),
  pendingDiscoveryJobs: z.array(SavedJobSchema).default([])
})
export type JobFinderDiscoveryState = z.infer<typeof JobFinderDiscoveryStateSchema>

export const JobFinderRepositoryStateSchema = z.object({
  profile: CandidateProfileSchema,
  searchPreferences: JobSearchPreferencesSchema,
  savedJobs: z.array(SavedJobSchema).default([]),
  tailoredAssets: z.array(TailoredAssetSchema).default([]),
  applicationRecords: z.array(ApplicationRecordSchema).default([]),
  applicationAttempts: z.array(ApplicationAttemptSchema).default([]),
  sourceDebugRuns: z.array(SourceDebugRunRecordSchema).default([]),
  sourceDebugAttempts: z.array(SourceDebugWorkerAttemptSchema).default([]),
  sourceInstructionArtifacts: z.array(SourceInstructionArtifactSchema).default([]),
  sourceDebugEvidenceRefs: z.array(SourceDebugEvidenceRefSchema).default([]),
  settings: JobFinderSettingsSchema,
  discovery: JobFinderDiscoveryStateSchema.default({})
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
  discoverySessions: z.array(DiscoveryAdapterSessionStateSchema).default([]),
  discoveryRunState: DiscoveryRunStateSchema.default('idle'),
  activeDiscoveryRun: DiscoveryRunRecordSchema.nullable().default(null),
  recentDiscoveryRuns: z.array(DiscoveryRunRecordSchema).default([]),
  activeSourceDebugRun: SourceDebugRunRecordSchema.nullable().default(null),
  recentSourceDebugRuns: z.array(SourceDebugRunRecordSchema).default([]),
  discoveryJobs: z.array(SavedJobSchema).default([]),
  selectedDiscoveryJobId: NonEmptyStringSchema.nullable(),
  reviewQueue: z.array(ReviewQueueItemSchema).default([]),
  selectedReviewJobId: NonEmptyStringSchema.nullable(),
  tailoredAssets: z.array(TailoredAssetSchema).default([]),
  applicationRecords: z.array(ApplicationRecordSchema).default([]),
  applicationAttempts: z.array(ApplicationAttemptSchema).default([]),
  sourceInstructionArtifacts: z.array(SourceInstructionArtifactSchema).default([]),
  selectedApplicationRecordId: NonEmptyStringSchema.nullable(),
  settings: JobFinderSettingsSchema
})
export type JobFinderWorkspaceSnapshot = z.infer<typeof JobFinderWorkspaceSnapshotSchema>

export const SaveCandidateProfileInputSchema = CandidateProfileSchema
export type SaveCandidateProfileInput = z.infer<typeof SaveCandidateProfileInputSchema>

export const SaveJobSearchPreferencesInputSchema = JobSearchPreferencesSchema
export type SaveJobSearchPreferencesInput = z.infer<typeof SaveJobSearchPreferencesInputSchema>

export const SaveJobFinderWorkspaceInputSchema = z.object({
  profile: CandidateProfileSchema,
  searchPreferences: JobSearchPreferencesSchema,
  settings: JobFinderSettingsSchema.optional()
})
export type SaveJobFinderWorkspaceInput = z.infer<typeof SaveJobFinderWorkspaceInputSchema>

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

export const AgentDiscoveryProgressSchema = z.object({
  currentUrl: z.string().min(1),
  jobsFound: z.number().int().nonnegative(),
  stepCount: z.number().int().nonnegative(),
  currentAction: z.string().optional(),
  targetId: NonEmptyStringSchema.nullable().default(null),
  adapterKind: JobSourceSchema.nullable().default(null)
})
export type AgentDiscoveryProgress = z.infer<typeof AgentDiscoveryProgressSchema>

// Shared Tool and ToolCall types for AI agent tool calling
export interface Tool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}
