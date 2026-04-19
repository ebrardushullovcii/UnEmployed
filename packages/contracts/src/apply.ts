import { z } from "zod";

import {
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  UrlStringSchema,
} from "./base";
import {
  ApplicationAnswerProvenanceSchema,
  ApplicationAnswerSourceKindSchema,
  ApplicationAttemptSuggestedAnswerSchema,
  ApplicationConsentKindSchema,
  ApplicationQuestionKindSchema,
  ApplicationQuestionStatusSchema,
} from "./discovery";

export const applyRunModeValues = [
  "copilot",
  "single_job_auto",
  "queue_auto",
] as const;
export const ApplyRunModeSchema = z.enum(applyRunModeValues);
export type ApplyRunMode = z.infer<typeof ApplyRunModeSchema>;

export const applyRunStateValues = [
  "draft",
  "awaiting_submit_approval",
  "running",
  "paused_for_user_review",
  "paused_for_consent",
  "completed",
  "cancelled",
  "failed",
] as const;
export const ApplyRunStateSchema = z.enum(applyRunStateValues);
export type ApplyRunState = z.infer<typeof ApplyRunStateSchema>;

export const applyJobStateValues = [
  "planned",
  "question_capture",
  "filling",
  "awaiting_review",
  "submitting",
  "submitted",
  "skipped",
  "blocked",
  "failed",
] as const;
export const ApplyJobStateSchema = z.enum(applyJobStateValues);
export type ApplyJobState = z.infer<typeof ApplyJobStateSchema>;

export const applyBlockerReasonValues = [
  "resume_missing",
  "resume_stale",
  "auth_required",
  "signup_consent_required",
  "site_protection",
  "field_interpretation_failed",
  "question_grounding_failed",
  "required_human_input",
  "asset_unavailable",
  "provider_submit_auth_unavailable",
  "submit_confirmation_missing",
  "unexpected_navigation",
] as const;
export const ApplyBlockerReasonSchema = z.enum(applyBlockerReasonValues);
export type ApplyBlockerReason = z.infer<typeof ApplyBlockerReasonSchema>;

export const applySubmitApprovalStatusValues = [
  "pending",
  "approved",
  "declined",
  "revoked",
  "expired",
] as const;
export const ApplySubmitApprovalStatusSchema = z.enum(
  applySubmitApprovalStatusValues,
);
export type ApplySubmitApprovalStatus = z.infer<
  typeof ApplySubmitApprovalStatusSchema
>;

export const applyConsentRequestKindValues = [
  "existing_account_decision",
  "login",
  "signup",
  "manual_verification",
  "external_redirect",
  "resume_use",
  "profile_autofill",
] as const;
export const ApplyConsentRequestKindSchema = z.enum(
  applyConsentRequestKindValues,
);
export type ApplyConsentRequestKind = z.infer<
  typeof ApplyConsentRequestKindSchema
>;

export const applyConsentRequestStatusValues = [
  "pending",
  "approved",
  "declined",
  "expired",
] as const;
export const ApplyConsentRequestStatusSchema = z.enum(
  applyConsentRequestStatusValues,
);
export type ApplyConsentRequestStatus = z.infer<
  typeof ApplyConsentRequestStatusSchema
>;

export const applicationAnswerRecordStatusValues = [
  "suggested",
  "filled",
  "submitted",
  "rejected",
  "skipped",
] as const;
export const ApplicationAnswerRecordStatusSchema = z.enum(
  applicationAnswerRecordStatusValues,
);
export type ApplicationAnswerRecordStatus = z.infer<
  typeof ApplicationAnswerRecordStatusSchema
>;

export const applicationArtifactKindValues = [
  "screenshot",
  "field_snapshot",
  "uploaded_asset",
  "page_html",
  "checkpoint",
  "other",
] as const;
export const ApplicationArtifactKindSchema = z.enum(
  applicationArtifactKindValues,
);
export type ApplicationArtifactKind = z.infer<
  typeof ApplicationArtifactKindSchema
>;

export const ApplyRecoveryContextSchema = z.object({
  previousRunId: NonEmptyStringSchema,
  previousResultId: NonEmptyStringSchema.nullable().default(null),
  previousRunMode: ApplyRunModeSchema,
  previousRunState: ApplyRunStateSchema,
  latestCheckpoint: z.object({
    label: NonEmptyStringSchema,
    detail: NonEmptyStringSchema.nullable().default(null),
    url: UrlStringSchema.nullable().default(null),
    jobState: ApplyJobStateSchema,
    createdAt: IsoDateTimeSchema,
  }).nullable().default(null),
  checkpointUrls: z.array(UrlStringSchema).default([]),
  blockerSummary: NonEmptyStringSchema.nullable().default(null),
});
export type ApplyRecoveryContext = z.infer<typeof ApplyRecoveryContextSchema>;

export const ApplySubmitApprovalSchema = z.object({
  id: NonEmptyStringSchema,
  runId: NonEmptyStringSchema,
  mode: ApplyRunModeSchema.default("copilot"),
  jobIds: z.array(NonEmptyStringSchema).default([]),
  status: ApplySubmitApprovalStatusSchema.default("pending"),
  createdAt: IsoDateTimeSchema,
  approvedAt: IsoDateTimeSchema.nullable().default(null),
  revokedAt: IsoDateTimeSchema.nullable().default(null),
  expiresAt: IsoDateTimeSchema.nullable().default(null),
  detail: NonEmptyStringSchema.nullable().default(null),
});
export type ApplySubmitApproval = z.infer<typeof ApplySubmitApprovalSchema>;

export const ApplicationQuestionRecordSchema = z.object({
  id: NonEmptyStringSchema,
  runId: NonEmptyStringSchema,
  jobId: NonEmptyStringSchema,
  resultId: NonEmptyStringSchema.nullable().default(null),
  prompt: NonEmptyStringSchema,
  kind: ApplicationQuestionKindSchema.default("other"),
  isRequired: z.boolean().default(true),
  detectedAt: IsoDateTimeSchema,
  answerOptions: z.array(NonEmptyStringSchema).default([]),
  suggestedAnswers: z.array(ApplicationAttemptSuggestedAnswerSchema).default([]),
  selectedAnswerId: NonEmptyStringSchema.nullable().default(null),
  submittedAnswer: NonEmptyStringSchema.nullable().default(null),
  status: ApplicationQuestionStatusSchema.default("detected"),
  pageUrl: UrlStringSchema.nullable().default(null),
});
export type ApplicationQuestionRecord = z.infer<
  typeof ApplicationQuestionRecordSchema
>;

export const ApplicationAnswerRecordSchema = z.object({
  id: NonEmptyStringSchema,
  runId: NonEmptyStringSchema,
  jobId: NonEmptyStringSchema,
  resultId: NonEmptyStringSchema.nullable().default(null),
  questionId: NonEmptyStringSchema,
  status: ApplicationAnswerRecordStatusSchema.default("suggested"),
  text: NonEmptyStringSchema,
  sourceKind: ApplicationAnswerSourceKindSchema.default("profile"),
  sourceId: NonEmptyStringSchema.nullable().default(null),
  confidenceLabel: NonEmptyStringSchema.nullable().default(null),
  provenance: z.array(ApplicationAnswerProvenanceSchema).default([]),
  createdAt: IsoDateTimeSchema,
  submittedAt: IsoDateTimeSchema.nullable().default(null),
});
export type ApplicationAnswerRecord = z.infer<
  typeof ApplicationAnswerRecordSchema
>;

export const ApplicationArtifactRefSchema = z.object({
  id: NonEmptyStringSchema,
  runId: NonEmptyStringSchema,
  jobId: NonEmptyStringSchema,
  resultId: NonEmptyStringSchema.nullable().default(null),
  questionId: NonEmptyStringSchema.nullable().default(null),
  kind: ApplicationArtifactKindSchema.default("other"),
  label: NonEmptyStringSchema,
  createdAt: IsoDateTimeSchema,
  storagePath: NonEmptyStringSchema.nullable().default(null),
  url: UrlStringSchema.nullable().default(null),
  textSnippet: NonEmptyStringSchema.nullable().default(null),
});
export type ApplicationArtifactRef = z.infer<
  typeof ApplicationArtifactRefSchema
>;

export const ApplicationReplayCheckpointSchema = z.object({
  id: NonEmptyStringSchema,
  runId: NonEmptyStringSchema,
  jobId: NonEmptyStringSchema,
  resultId: NonEmptyStringSchema.nullable().default(null),
  createdAt: IsoDateTimeSchema,
  label: NonEmptyStringSchema,
  detail: NonEmptyStringSchema.nullable().default(null),
  url: UrlStringSchema.nullable().default(null),
  jobState: ApplyJobStateSchema.default("planned"),
  artifactRefIds: z.array(NonEmptyStringSchema).default([]),
});
export type ApplicationReplayCheckpoint = z.infer<
  typeof ApplicationReplayCheckpointSchema
>;

export const ApplicationConsentRequestSchema = z.object({
  id: NonEmptyStringSchema,
  runId: NonEmptyStringSchema,
  jobId: NonEmptyStringSchema,
  resultId: NonEmptyStringSchema.nullable().default(null),
  kind: ApplyConsentRequestKindSchema.default("manual_verification"),
  linkedConsentKind: ApplicationConsentKindSchema.nullable().default(null),
  label: NonEmptyStringSchema,
  detail: NonEmptyStringSchema.nullable().default(null),
  status: ApplyConsentRequestStatusSchema.default("pending"),
  requestedAt: IsoDateTimeSchema,
  decidedAt: IsoDateTimeSchema.nullable().default(null),
  expiresAt: IsoDateTimeSchema.nullable().default(null),
});
export type ApplicationConsentRequest = z.infer<
  typeof ApplicationConsentRequestSchema
>;

export const ApplyJobResultSchema = z.object({
  id: NonEmptyStringSchema,
  runId: NonEmptyStringSchema,
  jobId: NonEmptyStringSchema,
  queuePosition: z.number().int().nonnegative().default(0),
  state: ApplyJobStateSchema.default("planned"),
  summary: NonEmptyStringSchema,
  detail: NonEmptyStringSchema,
  startedAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  completedAt: IsoDateTimeSchema.nullable().default(null),
  blockerReason: ApplyBlockerReasonSchema.nullable().default(null),
  blockerSummary: NonEmptyStringSchema.nullable().default(null),
  latestQuestionCount: z.number().int().nonnegative().default(0),
  latestAnswerCount: z.number().int().nonnegative().default(0),
  pendingConsentRequestCount: z.number().int().nonnegative().default(0),
  artifactCount: z.number().int().nonnegative().default(0),
  latestCheckpointId: NonEmptyStringSchema.nullable().default(null),
});
export type ApplyJobResult = z.infer<typeof ApplyJobResultSchema>;

export const ApplyRunSchema = z.object({
  id: NonEmptyStringSchema,
  mode: ApplyRunModeSchema.default("copilot"),
  state: ApplyRunStateSchema.default("draft"),
  jobIds: z.array(NonEmptyStringSchema).default([]),
  currentJobId: NonEmptyStringSchema.nullable().default(null),
  submitApprovalId: NonEmptyStringSchema.nullable().default(null),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  completedAt: IsoDateTimeSchema.nullable().default(null),
  summary: NonEmptyStringSchema,
  detail: NonEmptyStringSchema,
  totalJobs: z.number().int().nonnegative().default(0),
  pendingJobs: z.number().int().nonnegative().default(0),
  submittedJobs: z.number().int().nonnegative().default(0),
  skippedJobs: z.number().int().nonnegative().default(0),
  blockedJobs: z.number().int().nonnegative().default(0),
  failedJobs: z.number().int().nonnegative().default(0),
});
export type ApplyRun = z.infer<typeof ApplyRunSchema>;

export const ApplyRunSummarySchema = ApplyRunSchema;
export type ApplyRunSummary = z.infer<typeof ApplyRunSummarySchema>;

export const ApplyJobResultSummarySchema = ApplyJobResultSchema;
export type ApplyJobResultSummary = z.infer<typeof ApplyJobResultSummarySchema>;

export const ApplyRunDetailsSchema = z.object({
  run: ApplyRunSchema,
  result: ApplyJobResultSchema.nullable().default(null),
  results: z.array(ApplyJobResultSchema).default([]),
  submitApproval: ApplySubmitApprovalSchema.nullable().default(null),
  questionRecords: z.array(ApplicationQuestionRecordSchema).default([]),
  answerRecords: z.array(ApplicationAnswerRecordSchema).default([]),
  artifactRefs: z.array(ApplicationArtifactRefSchema).default([]),
  checkpoints: z.array(ApplicationReplayCheckpointSchema).default([]),
  consentRequests: z.array(ApplicationConsentRequestSchema).default([]),
});
export type ApplyRunDetails = z.infer<typeof ApplyRunDetailsSchema>;
