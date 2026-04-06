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
  SourceDebugPhaseSchema,
} from "./base";
import {
  ApplicationAttemptSchema,
  ApplicationRecordSchema,
  DiscoveryAdapterSessionStateSchema,
  DiscoveryRunRecordSchema,
  JobSearchPreferencesSchema,
  ReviewQueueItemSchema,
  SavedJobSchema,
  TailoredAssetSchema,
} from "./discovery";
import { CandidateProfileSchema } from "./profile";
import {
  ResumeAssistantMessageSchema,
  ResumeDraftPatchSchema,
  ResumeDraftRevisionSchema,
  ResumeDraftSchema,
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

export const JobFinderJobActionInputSchema = z.object({
  jobId: NonEmptyStringSchema,
});
export type JobFinderJobActionInput = z.infer<
  typeof JobFinderJobActionInputSchema
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

export const JobFinderSourceDebugActionInputSchema = z.object({
  targetId: NonEmptyStringSchema,
});
export type JobFinderSourceDebugActionInput = z.infer<
  typeof JobFinderSourceDebugActionInputSchema
>;

export const JobFinderSourceDebugRunQuerySchema = z.object({
  runId: NonEmptyStringSchema,
});
export type JobFinderSourceDebugRunQuery = z.infer<
  typeof JobFinderSourceDebugRunQuerySchema
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

export const AgentProviderStatusSchema = z.object({
  kind: AiProviderKindSchema,
  ready: z.boolean(),
  label: NonEmptyStringSchema,
  model: NonEmptyStringSchema.nullable().default(null),
  baseUrl: NonEmptyStringSchema.nullable().default(null),
  detail: NonEmptyStringSchema.nullable().default(null),
});
export type AgentProviderStatus = z.infer<typeof AgentProviderStatusSchema>;

export const ResumeTemplateDefinitionSchema = z.object({
  id: ResumeTemplateIdSchema,
  label: NonEmptyStringSchema,
  description: NonEmptyStringSchema,
});
export type ResumeTemplateDefinition = z.infer<
  typeof ResumeTemplateDefinitionSchema
>;

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
  pendingDiscoveryJobs: z.array(SavedJobSchema).default([]),
});
export type JobFinderDiscoveryState = z.infer<
  typeof JobFinderDiscoveryStateSchema
>;

export const JobFinderRepositoryStateSchema = z.object({
  profile: CandidateProfileSchema,
  searchPreferences: JobSearchPreferencesSchema,
  savedJobs: z.array(SavedJobSchema).default([]),
  tailoredAssets: z.array(TailoredAssetSchema).default([]),
  resumeDrafts: z.array(ResumeDraftSchema).default([]),
  resumeDraftRevisions: z.array(ResumeDraftRevisionSchema).default([]),
  resumeExportArtifacts: z.array(ResumeExportArtifactSchema).default([]),
  resumeResearchArtifacts: z.array(ResumeResearchArtifactSchema).default([]),
  resumeValidationResults: z.array(ResumeValidationResultSchema).default([]),
  resumeAssistantMessages: z.array(ResumeAssistantMessageSchema).default([]),
  applicationRecords: z.array(ApplicationRecordSchema).default([]),
  applicationAttempts: z.array(ApplicationAttemptSchema).default([]),
  sourceDebugRuns: z.array(SourceDebugRunRecordSchema).default([]),
  sourceDebugAttempts: z.array(SourceDebugWorkerAttemptSchema).default([]),
  sourceInstructionArtifacts: z
    .array(SourceInstructionArtifactSchema)
    .default([]),
  sourceDebugEvidenceRefs: z.array(SourceDebugEvidenceRefSchema).default([]),
  settings: JobFinderSettingsSchema,
  discovery: JobFinderDiscoveryStateSchema.default({}),
});
export type JobFinderRepositoryState = z.infer<
  typeof JobFinderRepositoryStateSchema
>;

export const JobFinderResumeWorkspaceSchema = z.object({
  job: SavedJobSchema,
  draft: ResumeDraftSchema,
  validation: ResumeValidationResultSchema.nullable().default(null),
  exports: z.array(ResumeExportArtifactSchema).default([]),
  research: z.array(ResumeResearchArtifactSchema).default([]),
  assistantMessages: z.array(ResumeAssistantMessageSchema).default([]),
  tailoredAsset: TailoredAssetSchema.nullable().default(null),
});
export type JobFinderResumeWorkspace = z.infer<
  typeof JobFinderResumeWorkspaceSchema
>;

export const JobFinderWorkspaceSnapshotSchema = z.object({
  module: z.literal("job-finder"),
  generatedAt: IsoDateTimeSchema,
  agentProvider: AgentProviderStatusSchema,
  availableResumeTemplates: z.array(ResumeTemplateDefinitionSchema).default([]),
  profile: CandidateProfileSchema,
  searchPreferences: JobSearchPreferencesSchema,
  browserSession: BrowserSessionStateSchema,
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
  applicationRecords: z.array(ApplicationRecordSchema).default([]),
  applicationAttempts: z.array(ApplicationAttemptSchema).default([]),
  sourceInstructionArtifacts: z
    .array(SourceInstructionArtifactSchema)
    .default([]),
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
