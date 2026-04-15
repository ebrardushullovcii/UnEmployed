import { z } from "zod";

import {
  ApplicationAttemptStateSchema,
  ApplicationEventEmphasisSchema,
  ApplicationStatusSchema,
  ApprovalModeSchema,
  AssetGenerationMethodSchema,
  AssetStatusSchema,
  BrowserRunWaitReasonSchema,
  BrowserDriverSchema,
  BrowserSessionStatusSchema,
  DiscoveryActivityKindSchema,
  DiscoveryActivityStageSchema,
  DiscoveryActivityTerminalStateSchema,
  DiscoveryRunStateSchema,
  DiscoveryTargetExecutionStateSchema,
  IsoDateTimeSchema,
  JobApplyPathSchema,
  JobDiscoveryMethodSchema,
  JobSourceAdapterKindSchema,
  JobSourceSchema,
  NonEmptyStringSchema,
  SourceDebugPhaseCompletionModeSchema,
  SourceInstructionStatusSchema,
  TailoringModeSchema,
  UrlStringSchema,
  WorkModeListSchema,
} from "./base";
import {
  SourceDebugCompactionStateSchema,
  SourceDebugEvidenceRefSchema,
  SourceDebugPhaseEvidenceSchema,
  SourceDebugRunRecordSchema,
  SourceDebugWorkerAttemptSchema,
  SourceInstructionArtifactSchema,
} from "./source-debug";
import {
  ResumeExportFormatSchema,
} from "./resume";

export const JobDiscoveryTargetSchema = z.object({
  id: NonEmptyStringSchema,
  label: NonEmptyStringSchema,
  startingUrl: UrlStringSchema,
  enabled: z.boolean().default(true),
  adapterKind: JobSourceAdapterKindSchema.default("auto"),
  customInstructions: NonEmptyStringSchema.nullable().default(null),
  instructionStatus: SourceInstructionStatusSchema.default("missing"),
  validatedInstructionId: NonEmptyStringSchema.nullable().default(null),
  draftInstructionId: NonEmptyStringSchema.nullable().default(null),
  lastDebugRunId: NonEmptyStringSchema.nullable().default(null),
  lastVerifiedAt: IsoDateTimeSchema.nullable().default(null),
  staleReason: NonEmptyStringSchema.nullable().default(null),
});
export type JobDiscoveryTarget = z.infer<typeof JobDiscoveryTargetSchema>;

export const JobDiscoveryPreferencesSchema = z.object({
  targets: z.array(JobDiscoveryTargetSchema).default([]),
  historyLimit: z.number().int().min(1).max(10).default(5),
});
export type JobDiscoveryPreferences = z.infer<
  typeof JobDiscoveryPreferencesSchema
>;

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
  salaryCurrency: NonEmptyStringSchema.nullable().default("USD"),
  approvalMode: ApprovalModeSchema,
  tailoringMode: TailoringModeSchema,
  companyBlacklist: z.array(NonEmptyStringSchema).default([]),
  companyWhitelist: z.array(NonEmptyStringSchema).default([]),
  discovery: JobDiscoveryPreferencesSchema.default({}),
});
export type JobSearchPreferences = z.infer<typeof JobSearchPreferencesSchema>;

export const MatchAssessmentSchema = z.object({
  score: z.number().int().min(0).max(100),
  reasons: z.array(NonEmptyStringSchema).default([]),
  gaps: z.array(NonEmptyStringSchema).default([]),
});
export type MatchAssessment = z.infer<typeof MatchAssessmentSchema>;

export const normalizedCompensationIntervalValues = [
  "hour",
  "day",
  "week",
  "month",
  "year",
] as const;
export const NormalizedCompensationIntervalSchema = z.enum(
  normalizedCompensationIntervalValues,
);
export type NormalizedCompensationInterval = z.infer<
  typeof NormalizedCompensationIntervalSchema
>;

export const NormalizedCompensationSchema = z.object({
  currency: NonEmptyStringSchema.nullable().default(null),
  interval: NormalizedCompensationIntervalSchema.nullable().default(null),
  minAmount: z.number().nonnegative().nullable().default(null),
  maxAmount: z.number().nonnegative().nullable().default(null),
  minAnnualUsd: z.number().int().nonnegative().nullable().default(null),
  maxAnnualUsd: z.number().int().nonnegative().nullable().default(null),
});
export type NormalizedCompensation = z.infer<
  typeof NormalizedCompensationSchema
>;

export const jobKeywordSignalKindValues = [
  "skill",
  "responsibility",
  "qualification",
  "benefit",
  "domain",
  "tool",
  "industry",
] as const;
export const JobKeywordSignalKindSchema = z.enum(jobKeywordSignalKindValues);
export type JobKeywordSignalKind = z.infer<typeof JobKeywordSignalKindSchema>;

export const JobKeywordSignalSchema = z.object({
  id: NonEmptyStringSchema,
  label: NonEmptyStringSchema,
  kind: JobKeywordSignalKindSchema.default("skill"),
  weight: z.number().int().min(1).max(5).default(3),
});
export type JobKeywordSignal = z.infer<typeof JobKeywordSignalSchema>;

export const JobScreeningHintsSchema = z.object({
  sponsorshipText: NonEmptyStringSchema.nullable().default(null),
  requiresSecurityClearance: z.boolean().nullable().default(null),
  relocationText: NonEmptyStringSchema.nullable().default(null),
  travelText: NonEmptyStringSchema.nullable().default(null),
  remoteGeographies: z.array(NonEmptyStringSchema).default([]),
});
export type JobScreeningHints = z.infer<typeof JobScreeningHintsSchema>;

export const JobPostingSchema = z.object({
  source: JobSourceSchema,
  sourceJobId: NonEmptyStringSchema,
  discoveryMethod: JobDiscoveryMethodSchema.default("catalog_seed"),
  canonicalUrl: NonEmptyStringSchema,
  applicationUrl: UrlStringSchema.nullable().default(null),
  title: NonEmptyStringSchema,
  company: NonEmptyStringSchema,
  location: NonEmptyStringSchema,
  workMode: WorkModeListSchema,
  applyPath: JobApplyPathSchema,
  easyApplyEligible: z.boolean(),
  postedAt: IsoDateTimeSchema.nullable().default(null),
  postedAtText: NonEmptyStringSchema.nullable().default(null),
  discoveredAt: IsoDateTimeSchema,
  firstSeenAt: IsoDateTimeSchema.nullable().default(null),
  lastSeenAt: IsoDateTimeSchema.nullable().default(null),
  lastVerifiedActiveAt: IsoDateTimeSchema.nullable().default(null),
  salaryText: NonEmptyStringSchema.nullable(),
  normalizedCompensation: NormalizedCompensationSchema.default({}),
  summary: NonEmptyStringSchema.nullable().default(null),
  description: NonEmptyStringSchema,
  keySkills: z.array(NonEmptyStringSchema).default([]),
  responsibilities: z.array(NonEmptyStringSchema).default([]),
  minimumQualifications: z.array(NonEmptyStringSchema).default([]),
  preferredQualifications: z.array(NonEmptyStringSchema).default([]),
  seniority: NonEmptyStringSchema.nullable().default(null),
  employmentType: NonEmptyStringSchema.nullable().default(null),
  department: NonEmptyStringSchema.nullable().default(null),
  team: NonEmptyStringSchema.nullable().default(null),
  employerWebsiteUrl: UrlStringSchema.nullable().default(null),
  employerDomain: NonEmptyStringSchema.nullable().default(null),
  atsProvider: NonEmptyStringSchema.nullable().default(null),
  screeningHints: JobScreeningHintsSchema.default({}),
  keywordSignals: z.array(JobKeywordSignalSchema).default([]),
  benefits: z.array(NonEmptyStringSchema).default([]),
});
export type JobPosting = z.infer<typeof JobPostingSchema>;

export const SavedJobDiscoveryProvenanceSchema = z.object({
  targetId: NonEmptyStringSchema,
  adapterKind: JobSourceAdapterKindSchema,
  resolvedAdapterKind: JobSourceSchema.nullable().default(null),
  startingUrl: UrlStringSchema,
  discoveredAt: IsoDateTimeSchema,
});
export type SavedJobDiscoveryProvenance = z.infer<
  typeof SavedJobDiscoveryProvenanceSchema
>;

export const SavedJobSchema = JobPostingSchema.extend({
  id: NonEmptyStringSchema,
  status: ApplicationStatusSchema,
  matchAssessment: MatchAssessmentSchema,
  provenance: z.array(SavedJobDiscoveryProvenanceSchema).default([]),
});
export type SavedJob = z.infer<typeof SavedJobSchema>;

export const TailoredAssetPreviewSectionSchema = z.object({
  heading: NonEmptyStringSchema,
  lines: z.array(NonEmptyStringSchema).default([]),
});
export type TailoredAssetPreviewSection = z.infer<
  typeof TailoredAssetPreviewSectionSchema
>;

export const TailoredAssetSchema = z.object({
  id: NonEmptyStringSchema,
  jobId: NonEmptyStringSchema,
  kind: z.literal("resume"),
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
  generationMethod: AssetGenerationMethodSchema.default("deterministic"),
  notes: z.array(NonEmptyStringSchema).default([]),
});
export type TailoredAsset = z.infer<typeof TailoredAssetSchema>;

export const ReviewQueueResumeReviewStateSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("not_started"),
  }),
  z.object({
    status: z.literal("draft"),
  }),
  z.object({
    status: z.literal("needs_review"),
  }),
  z.object({
    status: z.literal("stale"),
    staleReason: NonEmptyStringSchema.nullable().default(null),
  }),
  z.object({
    status: z.literal("approved"),
    approvedAt: IsoDateTimeSchema,
    approvedExportId: NonEmptyStringSchema,
    approvedFormat: ResumeExportFormatSchema,
    approvedFilePath: NonEmptyStringSchema,
  }),
]);
export type ReviewQueueResumeReviewState = z.infer<
  typeof ReviewQueueResumeReviewStateSchema
>;

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
  resumeReview: ReviewQueueResumeReviewStateSchema.default({
    status: "not_started",
  }),
  updatedAt: IsoDateTimeSchema,
});
export type ReviewQueueItem = z.infer<typeof ReviewQueueItemSchema>;

export const ApplicationEventSchema = z.object({
  id: NonEmptyStringSchema,
  at: IsoDateTimeSchema,
  title: NonEmptyStringSchema,
  detail: NonEmptyStringSchema,
  emphasis: ApplicationEventEmphasisSchema,
});
export type ApplicationEvent = z.infer<typeof ApplicationEventSchema>;

export const applicationQuestionKindValues = [
  "work_authorization",
  "visa_sponsorship",
  "salary_expectation",
  "availability",
  "notice_period",
  "portfolio",
  "cover_letter",
  "experience",
  "clearance",
  "relocation",
  "travel",
  "location",
  "personal_info",
  "resume",
  "other",
] as const;
export const ApplicationQuestionKindSchema = z.enum(
  applicationQuestionKindValues,
);
export type ApplicationQuestionKind = z.infer<
  typeof ApplicationQuestionKindSchema
>;

export const applicationAnswerSourceKindValues = [
  "profile",
  "proof_bank",
  "resume",
  "job",
  "prior_answer",
  "source_debug",
  "user",
] as const;
export const ApplicationAnswerSourceKindSchema = z.enum(
  applicationAnswerSourceKindValues,
);
export type ApplicationAnswerSourceKind = z.infer<
  typeof ApplicationAnswerSourceKindSchema
>;

export const applicationQuestionStatusValues = [
  "detected",
  "answered",
  "submitted",
  "skipped",
] as const;
export const ApplicationQuestionStatusSchema = z.enum(
  applicationQuestionStatusValues,
);
export type ApplicationQuestionStatus = z.infer<
  typeof ApplicationQuestionStatusSchema
>;

export const applicationBlockerCodeValues = [
  "missing_candidate_answer",
  "requires_manual_review",
  "unsupported_apply_path",
  "missing_resume",
  "missing_consent",
  "external_redirect",
  "site_login_required",
  "unknown",
] as const;
export const ApplicationBlockerCodeSchema = z.enum(
  applicationBlockerCodeValues,
);
export type ApplicationBlockerCode = z.infer<
  typeof ApplicationBlockerCodeSchema
>;

export const applicationConsentKindValues = [
  "resume_use",
  "autofill_profile",
  "external_redirect",
  "manual_follow_up",
] as const;
export const ApplicationConsentKindSchema = z.enum(
  applicationConsentKindValues,
);
export type ApplicationConsentKind = z.infer<
  typeof ApplicationConsentKindSchema
>;

export const applicationConsentStatusValues = [
  "requested",
  "approved",
  "declined",
  "not_needed",
] as const;
export const ApplicationConsentStatusSchema = z.enum(
  applicationConsentStatusValues,
);
export type ApplicationConsentStatus = z.infer<
  typeof ApplicationConsentStatusSchema
>;

export const applicationConsentSummaryStatusValues = [
  "none",
  "requested",
  "approved",
  "declined",
] as const;
export const ApplicationConsentSummaryStatusSchema = z.enum(
  applicationConsentSummaryStatusValues,
);
export type ApplicationConsentSummaryStatus = z.infer<
  typeof ApplicationConsentSummaryStatusSchema
>;

export const ApplicationAnswerProvenanceSchema = z.object({
  id: NonEmptyStringSchema,
  sourceKind: ApplicationAnswerSourceKindSchema.default("profile"),
  sourceId: NonEmptyStringSchema.nullable().default(null),
  label: NonEmptyStringSchema,
  snippet: NonEmptyStringSchema.nullable().default(null),
});
export type ApplicationAnswerProvenance = z.infer<
  typeof ApplicationAnswerProvenanceSchema
>;

export const ApplicationAttemptSuggestedAnswerSchema = z.object({
  id: NonEmptyStringSchema,
  text: NonEmptyStringSchema,
  sourceKind: ApplicationAnswerSourceKindSchema.default("profile"),
  sourceId: NonEmptyStringSchema.nullable().default(null),
  confidenceLabel: NonEmptyStringSchema.nullable().default(null),
  provenance: z.array(ApplicationAnswerProvenanceSchema).default([]),
});
export type ApplicationAttemptSuggestedAnswer = z.infer<
  typeof ApplicationAttemptSuggestedAnswerSchema
>;

export const ApplicationAttemptQuestionSchema = z.object({
  id: NonEmptyStringSchema,
  prompt: NonEmptyStringSchema,
  kind: ApplicationQuestionKindSchema.default("other"),
  isRequired: z.boolean().default(true),
  detectedAt: IsoDateTimeSchema,
  answerOptions: z.array(NonEmptyStringSchema).default([]),
  suggestedAnswers: z.array(ApplicationAttemptSuggestedAnswerSchema).default([]),
  submittedAnswer: NonEmptyStringSchema.nullable().default(null),
  status: ApplicationQuestionStatusSchema.default("detected"),
});
export type ApplicationAttemptQuestion = z.infer<
  typeof ApplicationAttemptQuestionSchema
>;

export const ApplicationAttemptBlockerSchema = z.object({
  code: ApplicationBlockerCodeSchema.default("unknown"),
  summary: NonEmptyStringSchema,
  detail: NonEmptyStringSchema.nullable().default(null),
  questionIds: z.array(NonEmptyStringSchema).default([]),
  sourceDebugEvidenceRefIds: z.array(NonEmptyStringSchema).default([]),
  url: UrlStringSchema.nullable().default(null),
});
export type ApplicationAttemptBlocker = z.infer<
  typeof ApplicationAttemptBlockerSchema
>;

export const ApplicationAttemptConsentDecisionSchema = z.object({
  id: NonEmptyStringSchema,
  kind: ApplicationConsentKindSchema.default("resume_use"),
  label: NonEmptyStringSchema,
  status: ApplicationConsentStatusSchema.default("requested"),
  decidedAt: IsoDateTimeSchema.nullable().default(null),
  detail: NonEmptyStringSchema.nullable().default(null),
});
export type ApplicationAttemptConsentDecision = z.infer<
  typeof ApplicationAttemptConsentDecisionSchema
>;

export const ApplicationAttemptReplaySchema = z.object({
  sourceInstructionArtifactId: NonEmptyStringSchema.nullable().default(null),
  sourceDebugEvidenceRefIds: z.array(NonEmptyStringSchema).default([]),
  lastUrl: UrlStringSchema.nullable().default(null),
  checkpointUrls: z.array(UrlStringSchema).default([]),
});
export type ApplicationAttemptReplay = z.infer<
  typeof ApplicationAttemptReplaySchema
>;

export const ApplicationAttemptQuestionSummarySchema = z.object({
  total: z.number().int().nonnegative().default(0),
  required: z.number().int().nonnegative().default(0),
  answered: z.number().int().nonnegative().default(0),
  unansweredRequired: z.number().int().nonnegative().default(0),
});
export type ApplicationAttemptQuestionSummary = z.infer<
  typeof ApplicationAttemptQuestionSummarySchema
>;

export const ApplicationAttemptBlockerSummarySchema = z.object({
  code: ApplicationBlockerCodeSchema.default("unknown"),
  summary: NonEmptyStringSchema,
});
export type ApplicationAttemptBlockerSummary = z.infer<
  typeof ApplicationAttemptBlockerSummarySchema
>;

export const ApplicationAttemptConsentSummarySchema = z.object({
  status: ApplicationConsentSummaryStatusSchema.default("none"),
  pendingCount: z.number().int().nonnegative().default(0),
});
export type ApplicationAttemptConsentSummary = z.infer<
  typeof ApplicationAttemptConsentSummarySchema
>;

export const ApplicationAttemptReplaySummarySchema = z.object({
  lastUrl: UrlStringSchema.nullable().default(null),
  checkpointCount: z.number().int().nonnegative().default(0),
  evidenceCount: z.number().int().nonnegative().default(0),
  sourceInstructionArtifactId: NonEmptyStringSchema.nullable().default(null),
});
export type ApplicationAttemptReplaySummary = z.infer<
  typeof ApplicationAttemptReplaySummarySchema
>;

export const ApplicationAttemptCheckpointSchema = z.object({
  id: NonEmptyStringSchema,
  at: IsoDateTimeSchema,
  label: NonEmptyStringSchema,
  detail: NonEmptyStringSchema,
  state: ApplicationAttemptStateSchema,
});
export type ApplicationAttemptCheckpoint = z.infer<
  typeof ApplicationAttemptCheckpointSchema
>;

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
  questions: z.array(ApplicationAttemptQuestionSchema).default([]),
  blocker: ApplicationAttemptBlockerSchema.nullable().default(null),
  consentDecisions: z.array(ApplicationAttemptConsentDecisionSchema).default([]),
  replay: ApplicationAttemptReplaySchema.default({}),
  nextActionLabel: NonEmptyStringSchema.nullable(),
});
export type ApplicationAttempt = z.infer<typeof ApplicationAttemptSchema>;

export const ApplyExecutionResultSchema = z.object({
  state: ApplicationAttemptStateSchema,
  summary: NonEmptyStringSchema,
  detail: NonEmptyStringSchema,
  submittedAt: IsoDateTimeSchema.nullable(),
  outcome: ApplicationStatusSchema.nullable(),
  checkpoints: z.array(ApplicationAttemptCheckpointSchema).default([]),
  questions: z.array(ApplicationAttemptQuestionSchema).default([]),
  blocker: ApplicationAttemptBlockerSchema.nullable().default(null),
  consentDecisions: z.array(ApplicationAttemptConsentDecisionSchema).default([]),
  replay: ApplicationAttemptReplaySchema.default({}),
  nextActionLabel: NonEmptyStringSchema.nullable(),
});
export type ApplyExecutionResult = z.infer<typeof ApplyExecutionResultSchema>;

export const AgentDebugFindingsSchema = z.object({
  summary: NonEmptyStringSchema.nullable().default(null),
  reliableControls: z.array(NonEmptyStringSchema).default([]),
  trickyFilters: z.array(NonEmptyStringSchema).default([]),
  navigationTips: z.array(NonEmptyStringSchema).default([]),
  applyTips: z.array(NonEmptyStringSchema).default([]),
  warnings: z.array(NonEmptyStringSchema).default([]),
});
export type AgentDebugFindings = z.infer<typeof AgentDebugFindingsSchema>;

export const DiscoveryAgentMetadataSchema = z.object({
  steps: z.number().int().nonnegative().default(0),
  incomplete: z.boolean().default(false),
  transcriptMessageCount: z.number().int().nonnegative().default(0),
  reviewTranscript: z.array(NonEmptyStringSchema).default([]),
  compactionState: SourceDebugCompactionStateSchema.nullable().default(null),
  phaseCompletionMode:
    SourceDebugPhaseCompletionModeSchema.nullable().default(null),
  phaseCompletionReason: NonEmptyStringSchema.nullable().default(null),
  phaseEvidence: SourceDebugPhaseEvidenceSchema.nullable().default(null),
  debugFindings: AgentDebugFindingsSchema.nullable().default(null),
});
export type DiscoveryAgentMetadata = z.infer<
  typeof DiscoveryAgentMetadataSchema
>;

export const DiscoveryRunResultSchema = z.object({
  source: JobSourceSchema,
  startedAt: IsoDateTimeSchema,
  completedAt: IsoDateTimeSchema,
  querySummary: NonEmptyStringSchema,
  warning: NonEmptyStringSchema.nullable(),
  jobs: z.array(JobPostingSchema).default([]),
  agentMetadata: DiscoveryAgentMetadataSchema.nullable().default(null),
});
export type DiscoveryRunResult = z.infer<typeof DiscoveryRunResultSchema>;

export const DiscoveryAdapterSessionStateSchema = z.object({
  adapterKind: JobSourceSchema,
  status: BrowserSessionStatusSchema,
  driver: BrowserDriverSchema.default("catalog_seed"),
  label: NonEmptyStringSchema,
  detail: NonEmptyStringSchema.nullable().default(null),
  lastCheckedAt: IsoDateTimeSchema,
});
export type DiscoveryAdapterSessionState = z.infer<
  typeof DiscoveryAdapterSessionStateSchema
>;

export const DiscoveryStageDurationSchema = z.object({
  stage: DiscoveryActivityStageSchema,
  durationMs: z.number().int().nonnegative().default(0),
});
export type DiscoveryStageDuration = z.infer<typeof DiscoveryStageDurationSchema>;

export const DiscoveryWaitReasonDurationSchema = z.object({
  waitReason: BrowserRunWaitReasonSchema,
  durationMs: z.number().int().nonnegative().default(0),
});
export type DiscoveryWaitReasonDuration = z.infer<
  typeof DiscoveryWaitReasonDurationSchema
>;

export const DiscoveryTimingSummarySchema = z.object({
  totalDurationMs: z.number().int().nonnegative().default(0),
  firstActivityMs: z.number().int().nonnegative().nullable().default(null),
  longestGapMs: z.number().int().nonnegative().default(0),
  eventCount: z.number().int().nonnegative().default(0),
  stageDurations: z.array(DiscoveryStageDurationSchema).default([]),
  waitReasonDurations: z.array(DiscoveryWaitReasonDurationSchema).default([]),
});
export type DiscoveryTimingSummary = z.infer<typeof DiscoveryTimingSummarySchema>;

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
  warning: NonEmptyStringSchema.nullable().default(null),
  timing: DiscoveryTimingSummarySchema.nullable().default(null),
});
export type DiscoveryTargetExecution = z.infer<
  typeof DiscoveryTargetExecutionSchema
>;

export const DiscoveryActivityEventSchema = z.object({
  id: NonEmptyStringSchema,
  runId: NonEmptyStringSchema,
  timestamp: IsoDateTimeSchema,
  kind: DiscoveryActivityKindSchema,
  stage: DiscoveryActivityStageSchema,
  waitReason: BrowserRunWaitReasonSchema.nullable().default(null),
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
  invalidSkipped: z.number().int().nonnegative().nullable().default(null),
});
export type DiscoveryActivityEvent = z.infer<
  typeof DiscoveryActivityEventSchema
>;

export const DiscoveryRunSummarySchema = z.object({
  targetsPlanned: z.number().int().nonnegative().default(0),
  targetsCompleted: z.number().int().nonnegative().default(0),
  validJobsFound: z.number().int().nonnegative().default(0),
  jobsPersisted: z.number().int().nonnegative().default(0),
  jobsStaged: z.number().int().nonnegative().default(0),
  duplicatesMerged: z.number().int().nonnegative().default(0),
  invalidSkipped: z.number().int().nonnegative().default(0),
  durationMs: z.number().int().nonnegative().default(0),
  outcome: DiscoveryRunStateSchema.default("idle"),
  timing: DiscoveryTimingSummarySchema.nullable().default(null),
});
export type DiscoveryRunSummary = z.infer<typeof DiscoveryRunSummarySchema>;

export const DiscoveryRunRecordSchema = z.object({
  id: NonEmptyStringSchema,
  state: DiscoveryRunStateSchema,
  startedAt: IsoDateTimeSchema,
  completedAt: IsoDateTimeSchema.nullable().default(null),
  targetIds: z.array(NonEmptyStringSchema).default([]),
  targetExecutions: z.array(DiscoveryTargetExecutionSchema).default([]),
  activity: z.array(DiscoveryActivityEventSchema).default([]),
  summary: DiscoveryRunSummarySchema.default({}),
});
export type DiscoveryRunRecord = z.infer<typeof DiscoveryRunRecordSchema>;

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
  questionSummary: ApplicationAttemptQuestionSummarySchema.default({}),
  latestBlocker: ApplicationAttemptBlockerSummarySchema.nullable().default(null),
  consentSummary: ApplicationAttemptConsentSummarySchema.default({}),
  replaySummary: ApplicationAttemptReplaySummarySchema.default({}),
  events: z.array(ApplicationEventSchema).default([]),
});
export type ApplicationRecord = z.infer<typeof ApplicationRecordSchema>;

export const SourceDebugPersistenceSchemas = {
  SourceDebugEvidenceRefSchema,
  SourceDebugRunRecordSchema,
  SourceDebugWorkerAttemptSchema,
  SourceInstructionArtifactSchema,
} as const;
