import { z } from "zod";

import {
  AiProviderKindSchema,
  IsoDateTimeSchema,
  NonEmptyStringSchema,
} from "./base";

const ProbabilitySchema = z.number().min(0).max(1);

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
  "local_pdf_text_probe",
  "local_pdf_layout",
  "local_docx",
  "local_python_sidecar",
  "local_sidecar_fallback",
] as const;
export const ResumeDocumentParserKindSchema = z.enum(
  resumeDocumentParserKindValues,
);
export type ResumeDocumentParserKind = z.infer<
  typeof ResumeDocumentParserKindSchema
>;

export const resumeDocumentRouteKindValues = [
  "plain_text_native",
  "docx_native",
  "native_first",
  "ocr_first",
  "hybrid_compare",
  "unsupported_fallback",
] as const;
export const ResumeDocumentRouteKindSchema = z.enum(
  resumeDocumentRouteKindValues,
);
export type ResumeDocumentRouteKind = z.infer<
  typeof ResumeDocumentRouteKindSchema
>;

export const resumeDocumentBlockKindValues = [
  "heading",
  "paragraph",
  "list_item",
  "contact",
  "experience_header",
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

export const ResumeDocumentTextSpanSchema = z.object({
  start: z.number().int().min(0),
  end: z.number().int().min(0),
});
export type ResumeDocumentTextSpan = z.infer<typeof ResumeDocumentTextSpanSchema>;

export const ResumeDocumentQualitySignalSchema = z.object({
  score: ProbabilitySchema.default(0),
  textDensity: z.number().min(0).nullable().default(null),
  tokenCount: z.number().int().min(0).default(0),
  lineCount: z.number().int().min(0).default(0),
  blockCount: z.number().int().min(0).default(0),
  columnLikelihood: ProbabilitySchema.nullable().default(null),
  readingOrderConfidence: ProbabilitySchema.nullable().default(null),
  nativeTextCoverage: ProbabilitySchema.nullable().default(null),
  ocrConfidence: ProbabilitySchema.nullable().default(null),
  imageCoverageRatio: ProbabilitySchema.nullable().default(null),
  invalidUnicodeRatio: ProbabilitySchema.nullable().default(null),
});
export type ResumeDocumentQualitySignal = z.infer<
  typeof ResumeDocumentQualitySignalSchema
>;

export const ResumeDocumentParserManifestSchema = z.object({
  workerKind: z.enum(["embedded_node", "python_sidecar"]).default("embedded_node"),
  workerVersion: NonEmptyStringSchema.nullable().default(null),
  manifestVersion: NonEmptyStringSchema.nullable().default(null),
  runtimeLabel: NonEmptyStringSchema.nullable().default(null),
  availableCapabilities: z.array(NonEmptyStringSchema).default([]),
  executorVersions: z.record(NonEmptyStringSchema).default({}),
});
export type ResumeDocumentParserManifest = z.infer<
  typeof ResumeDocumentParserManifestSchema
>;

export const ResumeDocumentRouteDecisionSchema = z.object({
  routeKind: ResumeDocumentRouteKindSchema,
  triageReasons: z.array(NonEmptyStringSchema).default([]),
  preferredExecutors: z.array(ResumeDocumentParserKindSchema).default([]),
  usedExecutors: z.array(ResumeDocumentParserKindSchema).default([]),
});
export type ResumeDocumentRouteDecision = z.infer<
  typeof ResumeDocumentRouteDecisionSchema
>;

export const ResumeDocumentPageSchema = z.object({
  pageNumber: z.number().int().min(1),
  text: NonEmptyStringSchema.nullable().default(null),
  charCount: z.number().int().min(0).default(0),
  parserKinds: z.array(ResumeDocumentParserKindSchema).default([]),
  usedOcr: z.boolean().default(false),
  width: z.number().positive().nullable().optional(),
  height: z.number().positive().nullable().optional(),
  rotationDegrees: z.number().optional(),
  routeKind: ResumeDocumentRouteKindSchema.nullable().optional(),
  quality: ResumeDocumentQualitySignalSchema.optional(),
  qualityWarnings: z.array(NonEmptyStringSchema).optional(),
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
  sourceConfidence: ProbabilitySchema.nullable().default(null),
  lineIds: z.array(NonEmptyStringSchema).optional(),
  parserLineage: z.array(ResumeDocumentParserKindSchema).optional(),
  readingOrderConfidence: ProbabilitySchema.nullable().optional(),
  textSpan: ResumeDocumentTextSpanSchema.nullable().optional(),
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
  parserManifest: ResumeDocumentParserManifestSchema.optional(),
  route: ResumeDocumentRouteDecisionSchema.nullable().optional(),
  quality: ResumeDocumentQualitySignalSchema.optional(),
  qualityWarnings: z.array(NonEmptyStringSchema).optional(),
});
export type ResumeDocumentBundle = z.infer<typeof ResumeDocumentBundleSchema>;

export const ResumeParserWorkerPageSchema = z.object({
  pageNumber: z.number().int().min(1),
  text: z.string().default(""),
  charCount: z.number().int().min(0).default(0),
  tokenCount: z.number().int().min(0).default(0),
  quality: ResumeDocumentQualitySignalSchema.default({}),
  qualityWarnings: z.array(NonEmptyStringSchema).default([]),
  usedOcr: z.boolean().default(false),
  width: z.number().positive().nullable().default(null),
  height: z.number().positive().nullable().default(null),
});
export type ResumeParserWorkerPage = z.infer<typeof ResumeParserWorkerPageSchema>;

export const ResumeParserWorkerBlockSchema = z.object({
  id: NonEmptyStringSchema,
  pageNumber: z.number().int().min(1),
  readingOrder: z.number().int().min(0),
  text: NonEmptyStringSchema,
  kind: ResumeDocumentBlockKindSchema.default("unknown"),
  sectionHint: ResumeDocumentSectionHintSchema.default("other"),
  bbox: ResumeDocumentBlockBboxSchema.nullable().default(null),
  sourceParserKinds: z.array(ResumeDocumentParserKindSchema).default([]),
  sourceConfidence: ProbabilitySchema.nullable().default(null),
  lineIds: z.array(NonEmptyStringSchema).default([]),
  parserLineage: z.array(ResumeDocumentParserKindSchema).default([]),
  readingOrderConfidence: ProbabilitySchema.nullable().default(null),
  textSpan: ResumeDocumentTextSpanSchema.nullable().default(null),
});
export type ResumeParserWorkerBlock = z.infer<typeof ResumeParserWorkerBlockSchema>;

export const ResumeParserWorkerRequestSchema = z.object({
  requestId: NonEmptyStringSchema,
  filePath: NonEmptyStringSchema,
  fileKind: ResumeDocumentFileKindSchema,
  preferredRoute: ResumeDocumentRouteKindSchema.nullable().default(null),
  preferredExecutors: z.array(ResumeDocumentParserKindSchema).default([]),
});
export type ResumeParserWorkerRequest = z.infer<
  typeof ResumeParserWorkerRequestSchema
>;

export const ResumeParserWorkerResponseSchema = z.object({
  requestId: NonEmptyStringSchema,
  ok: z.boolean(),
  primaryParserKind: ResumeDocumentParserKindSchema.nullable().default(null),
  parserKinds: z.array(ResumeDocumentParserKindSchema).default([]),
  route: ResumeDocumentRouteDecisionSchema.nullable().default(null),
  parserManifest: ResumeDocumentParserManifestSchema.default({}),
  quality: ResumeDocumentQualitySignalSchema.default({}),
  qualityWarnings: z.array(NonEmptyStringSchema).default([]),
  warnings: z.array(NonEmptyStringSchema).default([]),
  pages: z.array(ResumeParserWorkerPageSchema).default([]),
  blocks: z.array(ResumeParserWorkerBlockSchema).default([]),
  fullText: z.string().nullable().default(null),
  errorMessage: NonEmptyStringSchema.nullable().default(null),
});
export type ResumeParserWorkerResponse = z.infer<
  typeof ResumeParserWorkerResponseSchema
>;

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

export type ResumeImportJsonValue =
  | string
  | number
  | boolean
  | null
  | ResumeImportJsonValue[]
  | { [key: string]: ResumeImportJsonValue };

export const ResumeImportJsonValueSchema: z.ZodType<ResumeImportJsonValue> = z.lazy(() =>
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

export const resumeImportFieldSensitivityValues = [
  "low",
  "medium",
  "high",
  "critical",
] as const;
export const ResumeImportFieldSensitivitySchema = z.enum(
  resumeImportFieldSensitivityValues,
);
export type ResumeImportFieldSensitivity = z.infer<
  typeof ResumeImportFieldSensitivitySchema
>;

export const resumeImportResolutionRecommendationValues = [
  "auto_apply",
  "needs_review",
  "abstain",
] as const;
export const ResumeImportResolutionRecommendationSchema = z.enum(
  resumeImportResolutionRecommendationValues,
);
export type ResumeImportResolutionRecommendation = z.infer<
  typeof ResumeImportResolutionRecommendationSchema
>;

export const ResumeImportConfidenceBreakdownSchema = z.object({
  overall: ProbabilitySchema,
  parserQuality: ProbabilitySchema,
  evidenceQuality: ProbabilitySchema,
  agreementScore: ProbabilitySchema,
  normalizationRisk: ProbabilitySchema,
  conflictRisk: ProbabilitySchema,
  fieldSensitivity: ResumeImportFieldSensitivitySchema,
  recommendation: ResumeImportResolutionRecommendationSchema,
});
export type ResumeImportConfidenceBreakdown = z.infer<
  typeof ResumeImportConfidenceBreakdownSchema
>;

export const resumeImportCandidateResolutionValues = [
  "auto_applied",
  "needs_review",
  "rejected",
  "abstained",
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
  confidence: ProbabilitySchema,
  confidenceBreakdown: ResumeImportConfidenceBreakdownSchema.nullable().optional(),
  notes: z.array(NonEmptyStringSchema).default([]),
  alternatives: z.array(ResumeImportJsonValueSchema).default([]),
  resolution: ResumeImportCandidateResolutionSchema.default("needs_review"),
  resolutionReason: NonEmptyStringSchema.nullable().optional(),
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
    resolutionReason: true,
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
  value: ResumeImportJsonValueSchema.nullable().default(null),
  valuePreview: NonEmptyStringSchema.nullable().default(null),
  evidenceText: NonEmptyStringSchema.nullable().default(null),
  confidence: ProbabilitySchema,
  resolution: ResumeImportCandidateResolutionSchema,
  resolutionReason: NonEmptyStringSchema.nullable().default(null),
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
  abstained: z.number().int().min(0).optional(),
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
  routeKind: ResumeDocumentRouteKindSchema.nullable().optional(),
  parserManifestVersion: NonEmptyStringSchema.nullable().optional(),
  qualityScore: ProbabilitySchema.nullable().optional(),
  analysisProviderKind: AiProviderKindSchema.nullable().default(null),
  analysisProviderLabel: NonEmptyStringSchema.nullable().default(null),
  warnings: z.array(NonEmptyStringSchema).default([]),
  errorMessage: NonEmptyStringSchema.nullable().default(null),
  candidateCounts: ResumeImportRunCandidateCountsSchema.default({}),
});
export type ResumeImportRun = z.infer<typeof ResumeImportRunSchema>;

export const resumeImportErrorTaxonomyValues = [
  "READING_ORDER",
  "SECTION_BOUNDARY",
  "FIELD_MISATTRIBUTION",
  "DATE_RANGE",
  "ORG_TITLE_SWAP",
  "OCR_NOISE",
  "MISSING_EVIDENCE",
  "OVERCONFIDENT_AUTO_APPLY",
  "UNRESOLVED_SHOULD_HAVE_RESOLVED",
] as const;
export const ResumeImportErrorTaxonomySchema = z.enum(
  resumeImportErrorTaxonomyValues,
);
export type ResumeImportErrorTaxonomy = z.infer<
  typeof ResumeImportErrorTaxonomySchema
>;

export const ResumeImportBenchmarkGoldSchema = z.object({
  literalFields: z.record(ResumeImportJsonValueSchema).default({}),
  summaryContains: z.array(NonEmptyStringSchema).default([]),
  experienceRecords: z.array(z.record(ResumeImportJsonValueSchema)).default([]),
  educationRecords: z.array(z.record(ResumeImportJsonValueSchema)).default([]),
});
export type ResumeImportBenchmarkGold = z.infer<
  typeof ResumeImportBenchmarkGoldSchema
>;

export const ResumeImportBenchmarkCaseSchema = z.object({
  id: NonEmptyStringSchema,
  label: NonEmptyStringSchema,
  resumePath: NonEmptyStringSchema,
  canary: z.boolean().default(false),
  tags: z.array(NonEmptyStringSchema).default([]),
  expected: ResumeImportBenchmarkGoldSchema,
});
export type ResumeImportBenchmarkCase = z.infer<
  typeof ResumeImportBenchmarkCaseSchema
>;

export const ResumeImportBenchmarkRequestSchema = z.object({
  benchmarkVersion: NonEmptyStringSchema.default("019-local-benchmark-v1"),
  cases: z.array(ResumeImportBenchmarkCaseSchema).default([]),
  canaryOnly: z.boolean().default(false),
  useConfiguredAi: z.boolean().default(false),
});
export type ResumeImportBenchmarkRequest = z.infer<
  typeof ResumeImportBenchmarkRequestSchema
>;

export const ResumeImportBenchmarkMetricsSchema = z.object({
  literalFieldPrecision: ProbabilitySchema.default(0),
  literalFieldRecall: ProbabilitySchema.default(0),
  experienceRecordF1: ProbabilitySchema.default(0),
  educationRecordF1: ProbabilitySchema.default(0),
  evidenceCoverage: ProbabilitySchema.default(0),
  autoApplyPrecision: ProbabilitySchema.default(0),
  unresolvedRate: ProbabilitySchema.default(0),
});
export type ResumeImportBenchmarkMetrics = z.infer<
  typeof ResumeImportBenchmarkMetricsSchema
>;

export const ResumeImportBenchmarkCaseResultSchema = z.object({
  caseId: NonEmptyStringSchema,
  label: NonEmptyStringSchema,
  parserStrategy: NonEmptyStringSchema,
  passed: z.boolean(),
  metrics: ResumeImportBenchmarkMetricsSchema,
  taxonomy: z.array(ResumeImportErrorTaxonomySchema).default([]),
  notes: z.array(NonEmptyStringSchema).default([]),
});
export type ResumeImportBenchmarkCaseResult = z.infer<
  typeof ResumeImportBenchmarkCaseResultSchema
>;

export const ResumeImportBenchmarkReportSchema = z.object({
  benchmarkVersion: NonEmptyStringSchema,
  generatedAt: IsoDateTimeSchema,
  parserManifestVersion: NonEmptyStringSchema.nullable().default(null),
  parserManifestVersions: z.array(NonEmptyStringSchema).default([]),
  analysisProviderKind: AiProviderKindSchema.nullable().default(null),
  analysisProviderLabel: NonEmptyStringSchema.nullable().default(null),
  cases: z.array(ResumeImportBenchmarkCaseResultSchema).default([]),
  aggregate: ResumeImportBenchmarkMetricsSchema,
  notes: z.array(NonEmptyStringSchema).default([]),
});
export type ResumeImportBenchmarkReport = z.infer<
  typeof ResumeImportBenchmarkReportSchema
>;
