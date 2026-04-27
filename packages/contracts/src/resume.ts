import { z } from "zod";

import {
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  ResumeTemplateIdSchema,
} from "./base";

const ProbabilitySchema = z.number().min(0).max(1);

export const resumeExportFormatValues = ["html", "pdf"] as const;

export const ResumeExportFormatSchema = z.enum(resumeExportFormatValues);
export type ResumeExportFormat = z.infer<typeof ResumeExportFormatSchema>;

export const resumeDraftStatusValues = [
  "draft",
  "needs_review",
  "approved",
  "stale",
] as const;

export const ResumeDraftStatusSchema = z.enum(resumeDraftStatusValues);
export type ResumeDraftStatus = z.infer<typeof ResumeDraftStatusSchema>;

export const resumeDraftSectionKindValues = [
  "header",
  "summary",
  "skills",
  "experience",
  "projects",
  "education",
  "certifications",
  "keywords",
] as const;

export const ResumeDraftSectionKindSchema = z.enum(
  resumeDraftSectionKindValues,
);
export type ResumeDraftSectionKind = z.infer<
  typeof ResumeDraftSectionKindSchema
>;

export const resumeDraftEntryTypeValues = [
  "experience",
  "project",
  "education",
  "certification",
  "skill_group",
  "language",
] as const;

export const ResumeDraftEntryTypeSchema = z.enum(resumeDraftEntryTypeValues);
export type ResumeDraftEntryType = z.infer<typeof ResumeDraftEntryTypeSchema>;

export const resumeDraftSourceKindValues = [
  "resume",
  "profile",
  "proof",
  "job",
  "research",
  "user",
] as const;

export const ResumeDraftSourceKindSchema = z.enum(resumeDraftSourceKindValues);
export type ResumeDraftSourceKind = z.infer<typeof ResumeDraftSourceKindSchema>;

export const resumeDraftOriginValues = [
  "imported",
  "ai_generated",
  "user_edited",
  "assistant_edited",
  "deterministic_fallback",
] as const;

export const ResumeDraftOriginSchema = z.enum(resumeDraftOriginValues);
export type ResumeDraftOrigin = z.infer<typeof ResumeDraftOriginSchema>;

export const resumeDraftGenerationMethodValues = [
  "ai",
  "deterministic",
  "manual",
] as const;

export const ResumeDraftGenerationMethodSchema = z.enum(
  resumeDraftGenerationMethodValues,
);
export type ResumeDraftGenerationMethod = z.infer<
  typeof ResumeDraftGenerationMethodSchema
>;

export const resumePatchOperationValues = [
  "replace_section_text",
  "insert_bullet",
  "update_bullet",
  "remove_bullet",
  "move_bullet",
  "toggle_include",
  "set_lock",
  "replace_section_bullets",
] as const;

export const ResumeDraftPatchOperationSchema = z.enum(
  resumePatchOperationValues,
);
export type ResumeDraftPatchOperation = z.infer<
  typeof ResumeDraftPatchOperationSchema
>;

export const resumePatchOriginValues = ["user", "assistant"] as const;

export const ResumeDraftPatchOriginSchema = z.enum(resumePatchOriginValues);
export type ResumeDraftPatchOrigin = z.infer<
  typeof ResumeDraftPatchOriginSchema
>;

export const resumeValidationSeverityValues = [
  "error",
  "warning",
  "info",
] as const;

export const ResumeValidationSeveritySchema = z.enum(
  resumeValidationSeverityValues,
);
export type ResumeValidationSeverity = z.infer<
  typeof ResumeValidationSeveritySchema
>;

export const resumeValidationCategoryValues = [
  "unsupported_claim",
  "invented_metric",
  "duplicate_bullet",
  "duplicate_section_content",
  "job_description_bleed",
  "thin_output",
  "keyword_stuffing",
  "vague_filler",
  "poor_keyword_coverage",
  "empty_section",
  "page_overflow",
  "low_confidence_fact",
  "stale_approval",
] as const;

export const ResumeValidationCategorySchema = z.enum(
  resumeValidationCategoryValues,
);
export type ResumeValidationCategory = z.infer<
  typeof ResumeValidationCategorySchema
>;

export const resumeResearchFetchStatusValues = [
  "success",
  "failed",
  "skipped",
] as const;

export const ResumeResearchFetchStatusSchema = z.enum(
  resumeResearchFetchStatusValues,
);
export type ResumeResearchFetchStatus = z.infer<
  typeof ResumeResearchFetchStatusSchema
>;

export const resumeAssistantRoleValues = ["user", "assistant"] as const;

export const ResumeAssistantRoleSchema = z.enum(resumeAssistantRoleValues);
export type ResumeAssistantRole = z.infer<typeof ResumeAssistantRoleSchema>;

export const ResumeDraftSourceRefSchema = z.object({
  id: NonEmptyStringSchema,
  sourceKind: ResumeDraftSourceKindSchema,
  sourceId: NonEmptyStringSchema.nullable().default(null),
  snippet: NonEmptyStringSchema.nullable().default(null),
});
export type ResumeDraftSourceRef = z.infer<typeof ResumeDraftSourceRefSchema>;

export const ResumeDraftIdentitySchema = z.object({
  fullName: NonEmptyStringSchema.nullable().default(null),
  headline: NonEmptyStringSchema.nullable().default(null),
  location: NonEmptyStringSchema.nullable().default(null),
  email: NonEmptyStringSchema.nullable().default(null),
  phone: NonEmptyStringSchema.nullable().default(null),
  portfolioUrl: NonEmptyStringSchema.nullable().default(null),
  linkedinUrl: NonEmptyStringSchema.nullable().default(null),
  githubUrl: NonEmptyStringSchema.nullable().default(null),
  personalWebsiteUrl: NonEmptyStringSchema.nullable().default(null),
  additionalLinks: z.array(NonEmptyStringSchema).default([]),
});
export type ResumeDraftIdentity = z.infer<typeof ResumeDraftIdentitySchema>;

export const ResumeDraftBulletSchema = z.object({
  id: NonEmptyStringSchema,
  text: NonEmptyStringSchema,
  origin: ResumeDraftOriginSchema,
  locked: z.boolean().default(false),
  included: z.boolean().default(true),
  sourceRefs: z.array(ResumeDraftSourceRefSchema).default([]),
  updatedAt: IsoDateTimeSchema,
});
export type ResumeDraftBullet = z.infer<typeof ResumeDraftBulletSchema>;

export const ResumeDraftEntrySchema = z.object({
  id: NonEmptyStringSchema,
  entryType: ResumeDraftEntryTypeSchema,
  title: NonEmptyStringSchema.nullable().default(null),
  subtitle: NonEmptyStringSchema.nullable().default(null),
  location: NonEmptyStringSchema.nullable().default(null),
  dateRange: NonEmptyStringSchema.nullable().default(null),
  summary: NonEmptyStringSchema.nullable().default(null),
  bullets: z.array(ResumeDraftBulletSchema).default([]),
  origin: ResumeDraftOriginSchema,
  locked: z.boolean().default(false),
  included: z.boolean().default(true),
  sortOrder: z.number().int().min(0),
  profileRecordId: NonEmptyStringSchema.nullable().default(null),
  sourceRefs: z.array(ResumeDraftSourceRefSchema).default([]),
  updatedAt: IsoDateTimeSchema,
});
export type ResumeDraftEntry = z.infer<typeof ResumeDraftEntrySchema>;

export const ResumeDraftSectionSchema = z.object({
  id: NonEmptyStringSchema,
  kind: ResumeDraftSectionKindSchema,
  label: NonEmptyStringSchema,
  text: NonEmptyStringSchema.nullable().default(null),
  bullets: z.array(ResumeDraftBulletSchema).default([]),
  entries: z.array(ResumeDraftEntrySchema).default([]),
  origin: ResumeDraftOriginSchema,
  locked: z.boolean().default(false),
  included: z.boolean().default(true),
  sortOrder: z.number().int().min(0),
  profileRecordId: NonEmptyStringSchema.nullable().default(null),
  sourceRefs: z.array(ResumeDraftSourceRefSchema).default([]),
  updatedAt: IsoDateTimeSchema,
});
export type ResumeDraftSection = z.infer<typeof ResumeDraftSectionSchema>;

export const ResumeDraftSchema = z.object({
  id: NonEmptyStringSchema,
  jobId: NonEmptyStringSchema,
  status: ResumeDraftStatusSchema,
  templateId: ResumeTemplateIdSchema,
  identity: ResumeDraftIdentitySchema.nullable().default(null),
  sections: z.array(ResumeDraftSectionSchema).default([]),
  targetPageCount: z.number().int().min(1).max(3).default(2),
  generationMethod: ResumeDraftGenerationMethodSchema.nullable().default(null),
  approvedAt: IsoDateTimeSchema.nullable().default(null),
  approvedExportId: NonEmptyStringSchema.nullable().default(null),
  staleReason: NonEmptyStringSchema.nullable().default(null),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type ResumeDraft = z.infer<typeof ResumeDraftSchema>;

export const ResumeDraftPatchSchema = z.object({
  id: NonEmptyStringSchema,
  draftId: NonEmptyStringSchema,
  operation: ResumeDraftPatchOperationSchema,
  targetSectionId: NonEmptyStringSchema,
  targetEntryId: NonEmptyStringSchema.nullable().default(null),
  targetBulletId: NonEmptyStringSchema.nullable().default(null),
  anchorBulletId: NonEmptyStringSchema.nullable().default(null),
  position: z.enum(["before", "after"]).nullable().default(null),
  newText: NonEmptyStringSchema.nullable().default(null),
  newIncluded: z.boolean().nullable().default(null),
  newLocked: z.boolean().nullable().default(null),
  newBullets: z.array(ResumeDraftBulletSchema).nullable().default(null),
  appliedAt: IsoDateTimeSchema,
  origin: ResumeDraftPatchOriginSchema,
  conflictReason: NonEmptyStringSchema.nullable().default(null),
});
export type ResumeDraftPatch = z.infer<typeof ResumeDraftPatchSchema>;

export const ResumeDraftRevisionSchema = z.object({
  id: NonEmptyStringSchema,
  draftId: NonEmptyStringSchema,
  snapshotIdentity: ResumeDraftIdentitySchema.nullable().default(null),
  snapshotSections: z.array(ResumeDraftSectionSchema),
  createdAt: IsoDateTimeSchema,
  reason: NonEmptyStringSchema.nullable().default(null),
});
export type ResumeDraftRevision = z.infer<typeof ResumeDraftRevisionSchema>;

export const ResumeValidationIssueSchema = z.object({
  id: NonEmptyStringSchema,
  severity: ResumeValidationSeveritySchema,
  category: ResumeValidationCategorySchema,
  sectionId: NonEmptyStringSchema.nullable().default(null),
  entryId: NonEmptyStringSchema.nullable().default(null),
  bulletId: NonEmptyStringSchema.nullable().default(null),
  message: NonEmptyStringSchema,
});
export type ResumeValidationIssue = z.infer<typeof ResumeValidationIssueSchema>;

export const ResumeValidationResultSchema = z.object({
  id: NonEmptyStringSchema,
  draftId: NonEmptyStringSchema,
  issues: z.array(ResumeValidationIssueSchema).default([]),
  pageCount: z.number().int().min(0).nullable().default(null),
  validatedAt: IsoDateTimeSchema,
});
export type ResumeValidationResult = z.infer<typeof ResumeValidationResultSchema>;

export const resumePreviewWarningSourceValues = [
  "validation",
  "render",
] as const;

export const ResumePreviewWarningSourceSchema = z.enum(
  resumePreviewWarningSourceValues,
);
export type ResumePreviewWarningSource = z.infer<
  typeof ResumePreviewWarningSourceSchema
>;

export const ResumePreviewWarningSchema = z.object({
  id: NonEmptyStringSchema,
  source: ResumePreviewWarningSourceSchema,
  severity: ResumeValidationSeveritySchema,
  category: ResumeValidationCategorySchema.nullable().default(null),
  sectionId: NonEmptyStringSchema.nullable().default(null),
  entryId: NonEmptyStringSchema.nullable().default(null),
  bulletId: NonEmptyStringSchema.nullable().default(null),
  message: NonEmptyStringSchema,
});
export type ResumePreviewWarning = z.infer<typeof ResumePreviewWarningSchema>;

export const ResumePreviewMetadataSchema = z.object({
  templateId: ResumeTemplateIdSchema,
  renderedAt: IsoDateTimeSchema,
  pageCount: z.number().int().min(1).nullable().default(null),
  sectionCount: z.number().int().nonnegative().default(0),
  entryCount: z.number().int().nonnegative().default(0),
});
export type ResumePreviewMetadata = z.infer<typeof ResumePreviewMetadataSchema>;

export const ResumePreviewSchema = z.object({
  draftId: NonEmptyStringSchema,
  revisionKey: NonEmptyStringSchema,
  html: NonEmptyStringSchema,
  warnings: z.array(ResumePreviewWarningSchema).default([]),
  metadata: ResumePreviewMetadataSchema,
});
export type ResumePreview = z.infer<typeof ResumePreviewSchema>;

export const ResumeResearchArtifactSchema = z.object({
  id: NonEmptyStringSchema,
  jobId: NonEmptyStringSchema,
  sourceUrl: NonEmptyStringSchema,
  pageTitle: NonEmptyStringSchema.nullable().default(null),
  fetchedAt: IsoDateTimeSchema,
  extractedText: NonEmptyStringSchema.nullable().default(null),
  companyNotes: NonEmptyStringSchema.nullable().default(null),
  domainVocabulary: z.array(NonEmptyStringSchema).default([]),
  priorityThemes: z.array(NonEmptyStringSchema).default([]),
  fetchStatus: ResumeResearchFetchStatusSchema,
});
export type ResumeResearchArtifact = z.infer<typeof ResumeResearchArtifactSchema>;

export const ResumeExportArtifactSchema = z.object({
  id: NonEmptyStringSchema,
  draftId: NonEmptyStringSchema,
  jobId: NonEmptyStringSchema,
  format: ResumeExportFormatSchema,
  filePath: NonEmptyStringSchema,
  pageCount: z.number().int().min(1).nullable().default(null),
  templateId: ResumeTemplateIdSchema,
  exportedAt: IsoDateTimeSchema,
  isApproved: z.boolean().default(false),
});
export type ResumeExportArtifact = z.infer<typeof ResumeExportArtifactSchema>;

export const ResumeAssistantMessageSchema = z.object({
  id: NonEmptyStringSchema,
  jobId: NonEmptyStringSchema,
  role: ResumeAssistantRoleSchema,
  content: NonEmptyStringSchema,
  patches: z.array(ResumeDraftPatchSchema).default([]),
  createdAt: IsoDateTimeSchema,
});
export type ResumeAssistantMessage = z.infer<typeof ResumeAssistantMessageSchema>;

export const ResumeDraftSummarySchema = ResumeDraftSchema.pick({
  id: true,
  jobId: true,
  status: true,
  templateId: true,
  targetPageCount: true,
  generationMethod: true,
  approvedAt: true,
  approvedExportId: true,
  staleReason: true,
  createdAt: true,
  updatedAt: true,
});
export type ResumeDraftSummary = z.infer<typeof ResumeDraftSummarySchema>;

export const ResumeQualityBenchmarkCaseSchema = z.object({
  id: NonEmptyStringSchema,
  label: NonEmptyStringSchema,
  canary: z.boolean().default(false),
  tags: z.array(NonEmptyStringSchema).default([]),
});
export type ResumeQualityBenchmarkCase = z.infer<
  typeof ResumeQualityBenchmarkCaseSchema
>;

export const ResumeQualityBenchmarkRequestSchema = z.object({
  benchmarkVersion: NonEmptyStringSchema.default("023-local-benchmark-v1"),
  caseIds: z.array(NonEmptyStringSchema).default([]),
  canaryOnly: z.boolean().default(false),
  persistArtifactsDirectory: NonEmptyStringSchema.nullable().default(null),
});
export type ResumeQualityBenchmarkRequest = z.infer<
  typeof ResumeQualityBenchmarkRequestSchema
>;

export const ResumeQualityBenchmarkMetricsSchema = z.object({
  groundedVisibleSkillRate: ProbabilitySchema.default(0),
  bleedFreeCaseRate: ProbabilitySchema.default(0),
  keywordCoverageRate: ProbabilitySchema.default(0),
  duplicateIssueFreeRate: ProbabilitySchema.default(0),
  thinOutputFreeRate: ProbabilitySchema.default(0),
  pageTargetPassRate: ProbabilitySchema.default(0),
  atsRenderPassRate: ProbabilitySchema.default(0),
  issueFreeCaseRate: ProbabilitySchema.default(0),
});
export type ResumeQualityBenchmarkMetrics = z.infer<
  typeof ResumeQualityBenchmarkMetricsSchema
>;

export const ResumeQualityBenchmarkCaseResultSchema = z.object({
  caseId: NonEmptyStringSchema,
  label: NonEmptyStringSchema,
  templateId: ResumeTemplateIdSchema,
  passed: z.boolean(),
  visibleSkills: z.array(NonEmptyStringSchema).default([]),
  issueCategories: z.array(ResumeValidationCategorySchema).default([]),
  issueCount: z.number().int().min(0).default(0),
  metrics: ResumeQualityBenchmarkMetricsSchema,
  htmlArtifactRelativePath: NonEmptyStringSchema.nullable().default(null),
  notes: z.array(NonEmptyStringSchema).default([]),
});
export type ResumeQualityBenchmarkCaseResult = z.infer<
  typeof ResumeQualityBenchmarkCaseResultSchema
>;

export const ResumeQualityBenchmarkReportSchema = z.object({
  benchmarkVersion: NonEmptyStringSchema,
  generatedAt: IsoDateTimeSchema,
  templates: z.array(ResumeTemplateIdSchema).default([]),
  persistedArtifactsDirectory: NonEmptyStringSchema.nullable().default(null),
  cases: z.array(ResumeQualityBenchmarkCaseResultSchema).default([]),
  aggregate: ResumeQualityBenchmarkMetricsSchema,
  notes: z.array(NonEmptyStringSchema).default([]),
});
export type ResumeQualityBenchmarkReport = z.infer<
  typeof ResumeQualityBenchmarkReportSchema
>;

export const ResumeExportArtifactSummarySchema = ResumeExportArtifactSchema.pick({
  id: true,
  draftId: true,
  jobId: true,
  format: true,
  filePath: true,
  pageCount: true,
  templateId: true,
  exportedAt: true,
  isApproved: true,
});
export type ResumeExportArtifactSummary = z.infer<
  typeof ResumeExportArtifactSummarySchema
>;

export const ResumeResearchArtifactSummarySchema = ResumeResearchArtifactSchema.pick({
  id: true,
  jobId: true,
  sourceUrl: true,
  pageTitle: true,
  fetchedAt: true,
  fetchStatus: true,
  domainVocabulary: true,
  priorityThemes: true,
});
export type ResumeResearchArtifactSummary = z.infer<
  typeof ResumeResearchArtifactSummarySchema
>;
