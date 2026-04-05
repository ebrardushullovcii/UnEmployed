import { z } from "zod";

import {
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  ResumeTemplateIdSchema,
} from "./base";

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

export const resumeDraftSourceKindValues = [
  "resume",
  "profile",
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

export const ResumeDraftSectionSchema = z.object({
  id: NonEmptyStringSchema,
  kind: ResumeDraftSectionKindSchema,
  label: NonEmptyStringSchema,
  text: NonEmptyStringSchema.nullable().default(null),
  bullets: z.array(ResumeDraftBulletSchema).default([]),
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
