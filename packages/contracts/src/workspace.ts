import { z } from "zod";

import {
  AiProviderKindSchema,
  AppearanceThemeSchema,
  BrowserRunWaitReasonSchema,
  BrowserDriverSchema,
  BrowserSessionStatusSchema,
  DocumentFontPresetSchema,
  DocumentFormatSchema,
  DiscoveryRunStateSchema,
  IsoDateTimeSchema,
  JobSourceSchema,
  NonEmptyStringSchema,
  ResumeTemplateIdSchema,
  SourceAccessPromptStateSchema,
  SourceDebugPhaseSchema,
} from "./base";
import {
  ApplyJobResultSchema,
  ApplyJobResultSummarySchema,
  ApplyRunSchema,
  ApplyRunSummarySchema,
  ApplySubmitApprovalSchema,
  ApplicationAnswerRecordSchema,
  ApplicationArtifactRefSchema,
  ApplicationConsentRequestSchema,
  ApplicationQuestionRecordSchema,
  ApplicationReplayCheckpointSchema,
} from "./apply";
import {
  ApplicationAttemptSchema,
  ApplicationRecordSchema,
  DiscoveryLedgerEntrySchema,
  DiscoveryAdapterSessionStateSchema,
  DiscoveryRunRecordSchema,
  JobSearchPreferencesSchema,
  ReviewQueueItemSchema,
  SavedJobSchema,
  TailoredAssetSchema,
} from "./discovery";
import { CandidateProfileSchema } from "./profile";
import { ProfileSetupStateSchema } from "./profile-setup";
import {
  ProfileCopilotContextSchema,
  ProfileCopilotMessageSchema,
  ProfileRevisionSchema,
  ProfileRevisionSummarySchema,
} from "./profile-copilot";
import {
  ResumeAssistantMessageSchema,
  ResumeDraftPatchSchema,
  ResumeDraftRevisionSchema,
  ResumeDraftSchema,
  ResumePreviewSchema,
  ResumeDraftSummarySchema,
  ResumeExportArtifactSchema,
  ResumeExportArtifactSummarySchema,
  ResumeResearchArtifactSchema,
  ResumeResearchArtifactSummarySchema,
  ResumeValidationResultSchema,
} from "./resume";
import {
  EditableSourceInstructionArtifactSchema,
  SourceDebugEvidenceRefSchema,
  SourceDebugRunDetailsSchema,
  SourceDebugRunRecordSchema,
  SourceDebugWorkerAttemptSchema,
  SourceInstructionArtifactSchema,
} from "./source-debug";
import {
  ResumeDocumentBundleSchema,
  ResumeImportFieldCandidateSchema,
  ResumeImportFieldCandidateSummarySchema,
  ResumeImportRunSchema,
} from "./resume-import";

export const JobFinderJobActionInputSchema = z.object({
  jobId: NonEmptyStringSchema,
});
export type JobFinderJobActionInput = z.infer<
  typeof JobFinderJobActionInputSchema
>;

export const JobFinderApplyQueueActionInputSchema = z.object({
  jobIds: z.array(NonEmptyStringSchema).min(1),
});
export type JobFinderApplyQueueActionInput = z.infer<
  typeof JobFinderApplyQueueActionInputSchema
>;

export const JobFinderResumeWorkspaceQuerySchema = z.object({
  jobId: NonEmptyStringSchema,
});
export type JobFinderResumeWorkspaceQuery = z.infer<
  typeof JobFinderResumeWorkspaceQuerySchema
>;

export const JobFinderSaveResumeDraftInputSchema = z.object({
  draft: ResumeDraftSchema,
});
export type JobFinderSaveResumeDraftInput = z.infer<
  typeof JobFinderSaveResumeDraftInputSchema
>;

export const JobFinderPreviewResumeDraftInputSchema = z.object({
  draft: ResumeDraftSchema,
});
export type JobFinderPreviewResumeDraftInput = z.infer<
  typeof JobFinderPreviewResumeDraftInputSchema
>;

export const JobFinderResumePreviewModeSchema = z.enum(["ok", "fail_once"]);
export type JobFinderResumePreviewMode = z.infer<
  typeof JobFinderResumePreviewModeSchema
>;

export const JobFinderResumeSectionActionInputSchema = z.object({
  jobId: NonEmptyStringSchema,
  sectionId: NonEmptyStringSchema,
});
export type JobFinderResumeSectionActionInput = z.infer<
  typeof JobFinderResumeSectionActionInputSchema
>;

export const JobFinderApproveResumeInputSchema = z.object({
  jobId: NonEmptyStringSchema,
  exportId: NonEmptyStringSchema,
});
export type JobFinderApproveResumeInput = z.infer<
  typeof JobFinderApproveResumeInputSchema
>;

export const JobFinderApplyResumePatchInputSchema = z.object({
  patch: ResumeDraftPatchSchema,
  revisionReason: NonEmptyStringSchema.nullable().default(null),
});
export type JobFinderApplyResumePatchInput = z.infer<
  typeof JobFinderApplyResumePatchInputSchema
>;

export const JobFinderResumeAssistantMessageInputSchema = z.object({
  jobId: NonEmptyStringSchema,
  content: NonEmptyStringSchema,
});
export type JobFinderResumeAssistantMessageInput = z.infer<
  typeof JobFinderResumeAssistantMessageInputSchema
>;

export const JobFinderProfileSetupReviewActionInputSchema = z.object({
  reviewItemId: NonEmptyStringSchema,
  action: z.enum(["confirm", "dismiss", "clear_value"]),
});
export type JobFinderProfileSetupReviewActionInput = z.infer<
  typeof JobFinderProfileSetupReviewActionInputSchema
>;

export const JobFinderProfileCopilotMessageInputSchema = z.object({
  content: NonEmptyStringSchema,
  context: ProfileCopilotContextSchema.default({ surface: "general" }),
});
export type JobFinderProfileCopilotMessageInput = z.infer<
  typeof JobFinderProfileCopilotMessageInputSchema
>;

export const JobFinderProfileCopilotPatchGroupActionInputSchema = z.object({
  patchGroupId: NonEmptyStringSchema,
});
export type JobFinderProfileCopilotPatchGroupActionInput = z.infer<
  typeof JobFinderProfileCopilotPatchGroupActionInputSchema
>;

export const JobFinderUndoProfileRevisionInputSchema = z.object({
  revisionId: NonEmptyStringSchema,
});
export type JobFinderUndoProfileRevisionInput = z.infer<
  typeof JobFinderUndoProfileRevisionInputSchema
>;

export const JobFinderSourceDebugActionInputSchema = z.object({
  targetId: NonEmptyStringSchema,
});
export type JobFinderSourceDebugActionInput = z.infer<
  typeof JobFinderSourceDebugActionInputSchema
>;

export const JobFinderOpenBrowserSessionInputSchema = z.object({
  targetId: NonEmptyStringSchema.nullable().default(null),
});
export type JobFinderOpenBrowserSessionInput = z.infer<
  typeof JobFinderOpenBrowserSessionInputSchema
>;

export const JobFinderDiscoveryTargetActionInputSchema = z.object({
  targetId: NonEmptyStringSchema,
});
export type JobFinderDiscoveryTargetActionInput = z.infer<
  typeof JobFinderDiscoveryTargetActionInputSchema
>;

export const JobFinderAgentDiscoveryActionInputSchema = z.object({
  requestId: NonEmptyStringSchema,
  targetId: NonEmptyStringSchema.nullable().default(null),
});
export type JobFinderAgentDiscoveryActionInput = z.infer<
  typeof JobFinderAgentDiscoveryActionInputSchema
>;

export const JobFinderSourceDebugRunQuerySchema = z.object({
  runId: NonEmptyStringSchema,
});
export type JobFinderSourceDebugRunQuery = z.infer<
  typeof JobFinderSourceDebugRunQuerySchema
>;

export const JobFinderApplyRunDetailsQuerySchema = z.object({
  runId: NonEmptyStringSchema,
  jobId: NonEmptyStringSchema,
});
export type JobFinderApplyRunDetailsQuery = z.infer<
  typeof JobFinderApplyRunDetailsQuerySchema
>;

export const JobFinderApplyRunActionInputSchema = z.object({
  runId: NonEmptyStringSchema,
});
export type JobFinderApplyRunActionInput = z.infer<
  typeof JobFinderApplyRunActionInputSchema
>;

export const JobFinderApplyConsentActionInputSchema = z.object({
  requestId: NonEmptyStringSchema,
  action: z.enum(["approve", "decline"]),
});
export type JobFinderApplyConsentActionInput = z.infer<
  typeof JobFinderApplyConsentActionInputSchema
>;

export const JobFinderSourceInstructionActionInputSchema = z.object({
  targetId: NonEmptyStringSchema,
  instructionId: NonEmptyStringSchema,
});
export type JobFinderSourceInstructionActionInput = z.infer<
  typeof JobFinderSourceInstructionActionInputSchema
>;

export const JobFinderSaveSourceInstructionInputSchema = z.object({
  targetId: NonEmptyStringSchema,
  artifact: EditableSourceInstructionArtifactSchema,
});
export type JobFinderSaveSourceInstructionInput = z.infer<
  typeof JobFinderSaveSourceInstructionInputSchema
>;

export const BrowserSessionStateSchema = z.object({
  source: JobSourceSchema,
  status: BrowserSessionStatusSchema,
  driver: BrowserDriverSchema.default("catalog_seed"),
  label: NonEmptyStringSchema,
  detail: NonEmptyStringSchema.nullable(),
  lastCheckedAt: IsoDateTimeSchema,
});
export type BrowserSessionState = z.infer<typeof BrowserSessionStateSchema>;

export const SourceAccessPromptSchema = z.object({
  targetId: NonEmptyStringSchema,
  targetLabel: NonEmptyStringSchema,
  targetUrl: NonEmptyStringSchema,
  state: SourceAccessPromptStateSchema,
  summary: NonEmptyStringSchema,
  detail: NonEmptyStringSchema.nullable().default(null),
  actionLabel: NonEmptyStringSchema,
  rerunLabel: NonEmptyStringSchema.nullable().default(null),
  updatedAt: IsoDateTimeSchema,
});
export type SourceAccessPrompt = z.infer<typeof SourceAccessPromptSchema>;

export const AgentProviderStatusSchema = z.object({
  kind: AiProviderKindSchema,
  ready: z.boolean(),
  label: NonEmptyStringSchema,
  model: NonEmptyStringSchema.nullable().default(null),
  baseUrl: NonEmptyStringSchema.nullable().default(null),
  modelContextWindowTokens: z.number().int().positive().nullable().default(null),
  detail: NonEmptyStringSchema.nullable().default(null),
});
export type AgentProviderStatus = z.infer<typeof AgentProviderStatusSchema>;

export const ResumeTemplateDeliveryLaneSchema = z.enum([
  "apply_safe",
  "share_ready",
]);
export type ResumeTemplateDeliveryLane = z.infer<
  typeof ResumeTemplateDeliveryLaneSchema
>;

export const ResumeTemplateAtsConfidenceSchema = z.enum([
  "high",
  "medium",
  "low",
]);
export type ResumeTemplateAtsConfidence = z.infer<
  typeof ResumeTemplateAtsConfidenceSchema
>;

export const ResumeTemplateDefinitionSchema = z.object({
  id: ResumeTemplateIdSchema,
  label: NonEmptyStringSchema,
  description: NonEmptyStringSchema,
  familyId: NonEmptyStringSchema.optional(),
  familyLabel: NonEmptyStringSchema.optional(),
  familyDescription: NonEmptyStringSchema.optional(),
  variantLabel: NonEmptyStringSchema.optional(),
  deliveryLane: ResumeTemplateDeliveryLaneSchema.optional(),
  atsConfidence: ResumeTemplateAtsConfidenceSchema.optional(),
  fitSummary: NonEmptyStringSchema.nullable().optional(),
  avoidSummary: NonEmptyStringSchema.nullable().optional(),
  bestFor: z.array(NonEmptyStringSchema).default([]),
  visualTags: z.array(NonEmptyStringSchema).optional(),
  density: z.enum(["comfortable", "balanced", "compact"]),
  applyEligible: z.boolean().optional(),
  approvalEligible: z.boolean().optional(),
  benchmarkEligible: z.boolean().optional(),
  sortOrder: z.number().int().nonnegative().optional(),
});
export type ResumeTemplateDefinition = z.infer<
  typeof ResumeTemplateDefinitionSchema
>;

export function getResumeTemplateFamilyId(
  template: Pick<ResumeTemplateDefinition, "familyId" | "id">,
): string {
  return template.familyId ?? template.id;
}

export function getResumeTemplateFamilyLabel(
  template: Pick<ResumeTemplateDefinition, "familyLabel" | "label">,
): string {
  return template.familyLabel ?? template.label;
}

export function getResumeTemplateVariantLabel(
  template: Pick<ResumeTemplateDefinition, "variantLabel" | "label">,
): string {
  return template.variantLabel ?? template.label;
}

export function getResumeTemplateVisualTags(
  template: Pick<ResumeTemplateDefinition, "visualTags" | "bestFor">,
): readonly string[] {
  return template.visualTags ?? template.bestFor;
}

export function getResumeTemplateDeliveryLane(
  template: Pick<ResumeTemplateDefinition, "deliveryLane">,
): ResumeTemplateDeliveryLane {
  return template.deliveryLane ?? "apply_safe";
}

export function getResumeTemplateAtsConfidence(
  template: Pick<ResumeTemplateDefinition, "atsConfidence">,
): ResumeTemplateAtsConfidence {
  return template.atsConfidence ?? "high";
}

export function isResumeTemplateApprovalEligible(
  template: Pick<ResumeTemplateDefinition, "approvalEligible" | "deliveryLane">,
): boolean {
  if (template.approvalEligible !== undefined) {
    return template.approvalEligible;
  }

  return getResumeTemplateDeliveryLane(template) === "apply_safe";
}

export function isResumeTemplateApplyEligible(
  template: Pick<
    ResumeTemplateDefinition,
    "applyEligible" | "approvalEligible" | "deliveryLane"
  >,
): boolean {
  if (template.applyEligible !== undefined) {
    return template.applyEligible;
  }

  return isResumeTemplateApprovalEligible(template);
}

export function isResumeTemplateBenchmarkEligible(
  template: Pick<
    ResumeTemplateDefinition,
    "benchmarkEligible" | "applyEligible" | "approvalEligible" | "deliveryLane"
  >,
): boolean {
  if (template.benchmarkEligible !== undefined) {
    return template.benchmarkEligible;
  }

  return isResumeTemplateApplyEligible(template);
}

export const JobFinderSettingsSchema = z.object({
  resumeFormat: DocumentFormatSchema,
  resumeTemplateId: ResumeTemplateIdSchema,
  fontPreset: DocumentFontPresetSchema,
  appearanceTheme: AppearanceThemeSchema.default("system"),
  humanReviewRequired: z.boolean(),
  allowAutoSubmitOverride: z.boolean(),
  keepSessionAlive: z.boolean(),
  discoveryOnly: z.boolean().default(false),
});
export type JobFinderSettings = z.infer<typeof JobFinderSettingsSchema>;

export const JobFinderDiscoveryStateSchema = z.object({
  sessions: z.array(DiscoveryAdapterSessionStateSchema).default([]),
  runState: DiscoveryRunStateSchema.default("idle"),
  activeRun: DiscoveryRunRecordSchema.nullable().default(null),
  recentRuns: z.array(DiscoveryRunRecordSchema).default([]),
  activeSourceDebugRun: SourceDebugRunRecordSchema.nullable().default(null),
  recentSourceDebugRuns: z.array(SourceDebugRunRecordSchema).default([]),
  discoveryLedger: z.array(DiscoveryLedgerEntrySchema).default([]),
  pendingDiscoveryJobs: z.array(SavedJobSchema).default([]),
});
export type JobFinderDiscoveryState = z.infer<
  typeof JobFinderDiscoveryStateSchema
>;

export const JobFinderRepositoryStateSchema = z.object({
  profile: CandidateProfileSchema,
  searchPreferences: JobSearchPreferencesSchema,
  profileSetupState: ProfileSetupStateSchema.default({}),
  savedJobs: z.array(SavedJobSchema).default([]),
  tailoredAssets: z.array(TailoredAssetSchema).default([]),
  resumeDrafts: z.array(ResumeDraftSchema).default([]),
  resumeDraftRevisions: z.array(ResumeDraftRevisionSchema).default([]),
  resumeExportArtifacts: z.array(ResumeExportArtifactSchema).default([]),
  resumeResearchArtifacts: z.array(ResumeResearchArtifactSchema).default([]),
  resumeValidationResults: z.array(ResumeValidationResultSchema).default([]),
  resumeAssistantMessages: z.array(ResumeAssistantMessageSchema).default([]),
  profileCopilotMessages: z.array(ProfileCopilotMessageSchema).default([]),
  profileRevisions: z.array(ProfileRevisionSchema).default([]),
  applyRuns: z.array(ApplyRunSchema).default([]),
  applyJobResults: z.array(ApplyJobResultSchema).default([]),
  applySubmitApprovals: z.array(ApplySubmitApprovalSchema).default([]),
  applicationQuestionRecords: z.array(ApplicationQuestionRecordSchema).default([]),
  applicationAnswerRecords: z.array(ApplicationAnswerRecordSchema).default([]),
  applicationArtifactRefs: z.array(ApplicationArtifactRefSchema).default([]),
  applicationReplayCheckpoints: z
    .array(ApplicationReplayCheckpointSchema)
    .default([]),
  applicationConsentRequests: z.array(ApplicationConsentRequestSchema).default([]),
  applicationRecords: z.array(ApplicationRecordSchema).default([]),
  applicationAttempts: z.array(ApplicationAttemptSchema).default([]),
  sourceDebugRuns: z.array(SourceDebugRunRecordSchema).default([]),
  sourceDebugAttempts: z.array(SourceDebugWorkerAttemptSchema).default([]),
  sourceInstructionArtifacts: z
    .array(SourceInstructionArtifactSchema)
    .default([]),
  sourceDebugEvidenceRefs: z.array(SourceDebugEvidenceRefSchema).default([]),
  resumeImportRuns: z.array(ResumeImportRunSchema).default([]),
  resumeImportDocumentBundles: z.array(ResumeDocumentBundleSchema).default([]),
  resumeImportFieldCandidates: z
    .array(ResumeImportFieldCandidateSchema)
    .default([]),
  settings: JobFinderSettingsSchema,
  discovery: JobFinderDiscoveryStateSchema.default({}),
});
export type JobFinderRepositoryState = z.infer<
  typeof JobFinderRepositoryStateSchema
>;
export type JobFinderRepositoryStateInput = z.input<
  typeof JobFinderRepositoryStateSchema
>;

export const JobFinderResumeWorkspaceSharedProfileProofSchema = z.object({
  id: NonEmptyStringSchema,
  title: NonEmptyStringSchema,
  claim: NonEmptyStringSchema,
  heroMetric: NonEmptyStringSchema.nullable().default(null),
  roleFamilies: z.array(NonEmptyStringSchema).default([]),
  supportingLinks: z.array(NonEmptyStringSchema).default([]),
});
export type JobFinderResumeWorkspaceSharedProfileProof = z.infer<
  typeof JobFinderResumeWorkspaceSharedProfileProofSchema
>;

export const JobFinderResumeWorkspaceSharedProfileSchema = z.object({
  narrativeSummary: NonEmptyStringSchema.nullable().default(null),
  nextChapterSummary: NonEmptyStringSchema.nullable().default(null),
  selfIntroduction: NonEmptyStringSchema.nullable().default(null),
  highlightedProofs: z
    .array(JobFinderResumeWorkspaceSharedProfileProofSchema)
    .default([]),
});
export type JobFinderResumeWorkspaceSharedProfile = z.infer<
  typeof JobFinderResumeWorkspaceSharedProfileSchema
>;

export const JobFinderResumeWorkspaceSchema = z.object({
  job: SavedJobSchema,
  draft: ResumeDraftSchema,
  validation: ResumeValidationResultSchema.nullable().default(null),
  exports: z.array(ResumeExportArtifactSchema).default([]),
  research: z.array(ResumeResearchArtifactSchema).default([]),
  assistantMessages: z.array(ResumeAssistantMessageSchema).default([]),
  tailoredAsset: TailoredAssetSchema.nullable().default(null),
  sharedProfile: JobFinderResumeWorkspaceSharedProfileSchema.default({}),
});
export type JobFinderResumeWorkspace = z.infer<
  typeof JobFinderResumeWorkspaceSchema
>;

export const JobFinderResumePreviewSchema = ResumePreviewSchema;
export type JobFinderResumePreview = z.infer<
  typeof JobFinderResumePreviewSchema
>;

export const JobFinderWorkspaceSnapshotSchema = z.object({
  module: z.literal("job-finder"),
  generatedAt: IsoDateTimeSchema,
  agentProvider: AgentProviderStatusSchema,
  availableResumeTemplates: z.array(ResumeTemplateDefinitionSchema).default([]),
  profile: CandidateProfileSchema,
  searchPreferences: JobSearchPreferencesSchema,
  profileSetupState: ProfileSetupStateSchema,
  browserSession: BrowserSessionStateSchema,
  sourceAccessPrompts: z.array(SourceAccessPromptSchema).default([]),
  discoverySessions: z.array(DiscoveryAdapterSessionStateSchema).default([]),
  discoveryRunState: DiscoveryRunStateSchema.default("idle"),
  activeDiscoveryRun: DiscoveryRunRecordSchema.nullable().default(null),
  recentDiscoveryRuns: z.array(DiscoveryRunRecordSchema).default([]),
  activeSourceDebugRun: SourceDebugRunRecordSchema.nullable().default(null),
  recentSourceDebugRuns: z.array(SourceDebugRunRecordSchema).default([]),
  discoveryJobs: z.array(SavedJobSchema).default([]),
  selectedDiscoveryJobId: NonEmptyStringSchema.nullable(),
  reviewQueue: z.array(ReviewQueueItemSchema).default([]),
  selectedReviewJobId: NonEmptyStringSchema.nullable(),
  tailoredAssets: z.array(TailoredAssetSchema).default([]),
  resumeDrafts: z.array(ResumeDraftSummarySchema).default([]),
  resumeExportArtifacts: z.array(ResumeExportArtifactSummarySchema).default([]),
  resumeResearchArtifacts: z
    .array(ResumeResearchArtifactSummarySchema)
    .default([]),
  applyRuns: z.array(ApplyRunSummarySchema).default([]),
  applyJobResults: z.array(ApplyJobResultSummarySchema).default([]),
  applicationRecords: z.array(ApplicationRecordSchema).default([]),
  applicationAttempts: z.array(ApplicationAttemptSchema).default([]),
  sourceInstructionArtifacts: z
    .array(SourceInstructionArtifactSchema)
    .default([]),
  latestResumeImportRun: ResumeImportRunSchema.nullable().default(null),
  latestResumeImportReviewCandidates: z
    .array(ResumeImportFieldCandidateSummarySchema)
    .default([]),
  profileCopilotMessages: z.array(ProfileCopilotMessageSchema).default([]),
  profileRevisions: z.array(ProfileRevisionSummarySchema).default([]),
  selectedApplyRunId: NonEmptyStringSchema.nullable().default(null),
  selectedApplicationRecordId: NonEmptyStringSchema.nullable(),
  settings: JobFinderSettingsSchema,
});
export type JobFinderWorkspaceSnapshot = z.infer<
  typeof JobFinderWorkspaceSnapshotSchema
>;

export const JobFinderPerformanceSnapshotSchema = z.object({
  generatedAt: IsoDateTimeSchema,
  latestDiscoveryRun: DiscoveryRunRecordSchema.nullable().default(null),
  latestSourceDebugRun: SourceDebugRunDetailsSchema.nullable().default(null),
});
export type JobFinderPerformanceSnapshot = z.infer<
  typeof JobFinderPerformanceSnapshotSchema
>;

export const SaveCandidateProfileInputSchema = CandidateProfileSchema;
export type SaveCandidateProfileInput = z.infer<
  typeof SaveCandidateProfileInputSchema
>;

export const SaveJobSearchPreferencesInputSchema = JobSearchPreferencesSchema;
export type SaveJobSearchPreferencesInput = z.infer<
  typeof SaveJobSearchPreferencesInputSchema
>;

export const SaveJobFinderWorkspaceInputSchema = z.object({
  profile: CandidateProfileSchema,
  searchPreferences: JobSearchPreferencesSchema,
  settings: JobFinderSettingsSchema.optional(),
});
export type SaveJobFinderWorkspaceInput = z.infer<
  typeof SaveJobFinderWorkspaceInputSchema
>;

export const SaveJobFinderSettingsInputSchema = JobFinderSettingsSchema;
export type SaveJobFinderSettingsInput = z.infer<
  typeof SaveJobFinderSettingsInputSchema
>;

export const DesktopPlatformPingSchema = z.object({
  ok: z.literal(true),
  platform: z.enum(["darwin", "win32", "linux"]),
});
export type DesktopPlatformPing = z.infer<typeof DesktopPlatformPingSchema>;

export const DesktopTestOkResponseSchema = z.object({
  ok: z.literal(true),
});
export type DesktopTestOkResponse = z.infer<
  typeof DesktopTestOkResponseSchema
>;

export const DesktopWindowControlsStateSchema = z.object({
  isMaximized: z.boolean(),
  isMinimizable: z.boolean(),
  isClosable: z.boolean(),
});
export type DesktopWindowControlsState = z.infer<
  typeof DesktopWindowControlsStateSchema
>;

export const AgentDiscoveryProgressSchema = z.object({
  currentUrl: z.string().min(1),
  jobsFound: z.number().int().nonnegative(),
  stepCount: z.number().int().nonnegative(),
  currentAction: z.string().optional(),
  message: NonEmptyStringSchema.nullable().optional(),
  waitReason: BrowserRunWaitReasonSchema.nullable().optional(),
  phase: SourceDebugPhaseSchema.nullable().optional(),
  elapsedMs: z.number().nonnegative().optional(),
  lastActivityAt: IsoDateTimeSchema.nullable().optional(),
  targetId: NonEmptyStringSchema.nullable().default(null),
  adapterKind: JobSourceSchema.nullable().default(null),
});
export type AgentDiscoveryProgress = z.infer<
  typeof AgentDiscoveryProgressSchema
>;

export interface Tool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}
