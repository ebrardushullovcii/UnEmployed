import { z } from "zod";

import {
  AiProviderKindSchema,
  IsoDateTimeSchema,
  NonEmptyStringSchema,
} from "./base";

export const resumeDocumentFileKindValues = [
  "plain_text",
  "markdown",
  "docx",
  "pdf",
  "unknown",
] as const;
export const ResumeDocumentFileKindSchema = z.enum(resumeDocumentFileKindValues);
export type ResumeDocumentFileKind = z.infer<
  typeof ResumeDocumentFileKindSchema
>;

export const resumeDocumentParserKindValues = [
  "plain_text",
  "textutil_docx",
  "mammoth",
  "pdfjs_text",
  "macos_pdfkit_text",
  "macos_vision_ocr",
] as const;
export const ResumeDocumentParserKindSchema = z.enum(
  resumeDocumentParserKindValues,
);
export type ResumeDocumentParserKind = z.infer<
  typeof ResumeDocumentParserKindSchema
>;

export const resumeDocumentBlockKindValues = [
  "heading",
  "paragraph",
  "list_item",
  "contact",
  "unknown",
] as const;
export const ResumeDocumentBlockKindSchema = z.enum(
  resumeDocumentBlockKindValues,
);
export type ResumeDocumentBlockKind = z.infer<
  typeof ResumeDocumentBlockKindSchema
>;

export const resumeDocumentSectionHintValues = [
  "identity",
  "summary",
  "experience",
  "education",
  "certifications",
  "skills",
  "projects",
  "languages",
  "contact",
  "other",
] as const;
export const ResumeDocumentSectionHintSchema = z.enum(
  resumeDocumentSectionHintValues,
);
export type ResumeDocumentSectionHint = z.infer<
  typeof ResumeDocumentSectionHintSchema
>;

export const ResumeDocumentBlockBboxSchema = z.object({
  left: z.number(),
  top: z.number(),
  width: z.number(),
  height: z.number(),
});
export type ResumeDocumentBlockBbox = z.infer<
  typeof ResumeDocumentBlockBboxSchema
>;

export const ResumeDocumentPageSchema = z.object({
  pageNumber: z.number().int().min(1),
  text: NonEmptyStringSchema.nullable().default(null),
  charCount: z.number().int().min(0).default(0),
  parserKinds: z.array(ResumeDocumentParserKindSchema).default([]),
  usedOcr: z.boolean().default(false),
});
export type ResumeDocumentPage = z.infer<typeof ResumeDocumentPageSchema>;

export const ResumeDocumentBlockSchema = z.object({
  id: NonEmptyStringSchema,
  pageNumber: z.number().int().min(1),
  readingOrder: z.number().int().min(0),
  text: NonEmptyStringSchema,
  kind: ResumeDocumentBlockKindSchema.default("unknown"),
  sectionHint: ResumeDocumentSectionHintSchema.default("other"),
  bbox: ResumeDocumentBlockBboxSchema.nullable().default(null),
  sourceParserKinds: z.array(ResumeDocumentParserKindSchema).default([]),
  sourceConfidence: z.number().min(0).max(1).nullable().default(null),
});
export type ResumeDocumentBlock = z.infer<typeof ResumeDocumentBlockSchema>;

export const ResumeDocumentBundleSchema = z.object({
  id: NonEmptyStringSchema,
  runId: NonEmptyStringSchema,
  sourceResumeId: NonEmptyStringSchema,
  sourceFileKind: ResumeDocumentFileKindSchema,
  primaryParserKind: ResumeDocumentParserKindSchema,
  parserKinds: z.array(ResumeDocumentParserKindSchema).default([]),
  createdAt: IsoDateTimeSchema,
  languageHints: z.array(NonEmptyStringSchema).default([]),
  warnings: z.array(NonEmptyStringSchema).default([]),
  pages: z.array(ResumeDocumentPageSchema).default([]),
  blocks: z.array(ResumeDocumentBlockSchema).default([]),
  fullText: NonEmptyStringSchema.nullable().default(null),
});
export type ResumeDocumentBundle = z.infer<typeof ResumeDocumentBundleSchema>;

export const resumeImportRunStatusValues = [
  "queued",
  "parsing",
  "extracting",
  "reconciling",
  "review_ready",
  "applied",
  "failed",
] as const;
export const ResumeImportRunStatusSchema = z.enum(resumeImportRunStatusValues);
export type ResumeImportRunStatus = z.infer<typeof ResumeImportRunStatusSchema>;

export const resumeImportTriggerValues = ["import", "refresh"] as const;
export const ResumeImportTriggerSchema = z.enum(resumeImportTriggerValues);
export type ResumeImportTrigger = z.infer<typeof ResumeImportTriggerSchema>;

export const resumeImportTargetSectionValues = [
  "identity",
  "contact",
  "location",
  "search_preferences",
  "experience",
  "education",
  "certification",
  "link",
  "project",
  "language",
  "skill",
  "narrative",
  "proof_point",
  "answer_bank",
  "application_identity",
] as const;
export const ResumeImportTargetSectionSchema = z.enum(
  resumeImportTargetSectionValues,
);
export type ResumeImportTargetSection = z.infer<
  typeof ResumeImportTargetSectionSchema
>;

export const ResumeImportTargetSchema = z.object({
  section: ResumeImportTargetSectionSchema,
  key: NonEmptyStringSchema,
  recordId: NonEmptyStringSchema.nullable().default(null),
});
export type ResumeImportTarget = z.infer<typeof ResumeImportTargetSchema>;

export const ResumeImportJsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(ResumeImportJsonValueSchema),
    z.record(ResumeImportJsonValueSchema),
  ]),
);

export const resumeImportCandidateSourceValues = [
  "parser_literal",
  "model_identity_summary",
  "model_experience",
  "model_background",
  "model_shared_memory",
  "reconciler",
] as const;
export const ResumeImportCandidateSourceSchema = z.enum(
  resumeImportCandidateSourceValues,
);
export type ResumeImportCandidateSource = z.infer<
  typeof ResumeImportCandidateSourceSchema
>;

export const resumeImportCandidateResolutionValues = [
  "auto_applied",
  "needs_review",
  "rejected",
] as const;
export const ResumeImportCandidateResolutionSchema = z.enum(
  resumeImportCandidateResolutionValues,
);
export type ResumeImportCandidateResolution = z.infer<
  typeof ResumeImportCandidateResolutionSchema
>;

export const ResumeImportFieldCandidateSchema = z.object({
  id: NonEmptyStringSchema,
  runId: NonEmptyStringSchema,
  target: ResumeImportTargetSchema,
  label: NonEmptyStringSchema,
  sourceKind: ResumeImportCandidateSourceSchema,
  value: ResumeImportJsonValueSchema,
  normalizedValue: ResumeImportJsonValueSchema.nullable().default(null),
  valuePreview: NonEmptyStringSchema.nullable().default(null),
  evidenceText: NonEmptyStringSchema.nullable().default(null),
  sourceBlockIds: z.array(NonEmptyStringSchema).default([]),
  confidence: z.number().min(0).max(1),
  notes: z.array(NonEmptyStringSchema).default([]),
  alternatives: z.array(ResumeImportJsonValueSchema).default([]),
  resolution: ResumeImportCandidateResolutionSchema.default("needs_review"),
  createdAt: IsoDateTimeSchema,
  resolvedAt: IsoDateTimeSchema.nullable().default(null),
});
export type ResumeImportFieldCandidate = z.infer<
  typeof ResumeImportFieldCandidateSchema
>;

export const ResumeImportFieldCandidateDraftSchema =
  ResumeImportFieldCandidateSchema.omit({
    id: true,
    runId: true,
    sourceKind: true,
    resolution: true,
    createdAt: true,
    resolvedAt: true,
  });
export type ResumeImportFieldCandidateDraft = z.infer<
  typeof ResumeImportFieldCandidateDraftSchema
>;

export const ResumeImportFieldCandidateSummarySchema = z.object({
  id: NonEmptyStringSchema,
  target: ResumeImportTargetSchema,
  label: NonEmptyStringSchema,
  valuePreview: NonEmptyStringSchema.nullable().default(null),
  evidenceText: NonEmptyStringSchema.nullable().default(null),
  confidence: z.number().min(0).max(1),
  resolution: ResumeImportCandidateResolutionSchema,
  notes: z.array(NonEmptyStringSchema).default([]),
});
export type ResumeImportFieldCandidateSummary = z.infer<
  typeof ResumeImportFieldCandidateSummarySchema
>;

export const ResumeImportRunCandidateCountsSchema = z.object({
  total: z.number().int().min(0).default(0),
  autoApplied: z.number().int().min(0).default(0),
  needsReview: z.number().int().min(0).default(0),
  rejected: z.number().int().min(0).default(0),
});
export type ResumeImportRunCandidateCounts = z.infer<
  typeof ResumeImportRunCandidateCountsSchema
>;

export const ResumeImportRunSchema = z.object({
  id: NonEmptyStringSchema,
  sourceResumeId: NonEmptyStringSchema,
  sourceResumeFileName: NonEmptyStringSchema,
  trigger: ResumeImportTriggerSchema.default("import"),
  status: ResumeImportRunStatusSchema,
  startedAt: IsoDateTimeSchema,
  completedAt: IsoDateTimeSchema.nullable().default(null),
  primaryParserKind: ResumeDocumentParserKindSchema.nullable().default(null),
  parserKinds: z.array(ResumeDocumentParserKindSchema).default([]),
  analysisProviderKind: AiProviderKindSchema.nullable().default(null),
  analysisProviderLabel: NonEmptyStringSchema.nullable().default(null),
  warnings: z.array(NonEmptyStringSchema).default([]),
  errorMessage: NonEmptyStringSchema.nullable().default(null),
  candidateCounts: ResumeImportRunCandidateCountsSchema.default({}),
});
export type ResumeImportRun = z.infer<typeof ResumeImportRunSchema>;
