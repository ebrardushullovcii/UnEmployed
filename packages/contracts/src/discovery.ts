import { z } from "zod";

import {
  ApplicationAttemptStateSchema,
  ApplicationEventEmphasisSchema,
  ApplicationStatusSchema,
  ApprovalModeSchema,
  AssetGenerationMethodSchema,
  AssetStatusSchema,
  BrowserRunCloseoutSchema,
  BrowserRunWaitReasonSchema,
  BrowserDriverSchema,
  BrowserSessionStatusSchema,
  DiscoveryActivityKindSchema,
  DiscoveryRunScopeSchema,
  DiscoveryActivityStageSchema,
  DiscoveryActivityTerminalStateSchema,
  DiscoveryRunStateSchema,
  DiscoveryTitleTriageOutcomeSchema,
  DiscoveryTargetExecutionStateSchema,
  IsoDateTimeSchema,
  JobApplyPathSchema,
  JobDiscoveryCollectionMethodSchema,
  JobDiscoveryMethodSchema,
  JobSourceAdapterKindSchema,
  JobSourceSchema,
  NonEmptyStringSchema,
  ResumeApplicationModeSchema,
  SourceIntelligenceProviderKeySchema,
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
  SourceIntelligenceArtifactSchema,
  SourceInstructionArtifactSchema,
} from "./source-debug";
import { SharedAgentCompactionSnapshotSchema } from "./agent-compaction";
import { UserActionRequestKindSchema } from "./user-action";
import { ResumeExportFormatSchema } from "./resume";
import {
  BrowserVisualEvidenceSummarySchema,
  BrowserVisualObservationSetSchema,
  ApplyVisualCheckpointSchema,
} from "./visual";

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

/** Returns true only when a saved source can actually be used for discovery. */
export function isRunnableJobDiscoveryTarget(
  target: Pick<JobDiscoveryTarget, "enabled" | "startingUrl">,
): boolean {
  if (!target.enabled) {
    return false;
  }

  try {
    const url = new URL(target.startingUrl.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export const JobDiscoveryPreferencesSchema = z.object({
  targets: z.array(JobDiscoveryTargetSchema).default([]),
  historyLimit: z.number().int().min(1).max(10).default(5),
  collectOnlyHardCriteriaMatches: z.boolean().optional(),
});
export type JobDiscoveryPreferences = z.infer<
  typeof JobDiscoveryPreferencesSchema
>;

export const compensationIntervalValues = [
  "hour",
  "day",
  "week",
  "month",
  "year",
] as const;
export const CompensationIntervalSchema = z.enum(compensationIntervalValues);
export type CompensationInterval = z.infer<typeof CompensationIntervalSchema>;

export const compensationCurrencyStatusValues = [
  "explicit",
  "inherited",
  "needs_clarification",
] as const;
export const CompensationCurrencyStatusSchema = z.enum(
  compensationCurrencyStatusValues,
);
export type CompensationCurrencyStatus = z.infer<
  typeof CompensationCurrencyStatusSchema
>;

const CompensationAmountSchema = z.number().int().nonnegative().nullable();
export const CompensationPreferenceObjectSchema = z.object({
  minimum: CompensationAmountSchema.default(null),
  maximum: CompensationAmountSchema.default(null),
  interval: CompensationIntervalSchema.default("year"),
  currency: z
    .string()
    .trim()
    .regex(
      /^[A-Z]{3}$/,
      "Compensation currency must be a three-letter ISO code.",
    )
    .nullable()
    .default(null),
  currencyStatus: CompensationCurrencyStatusSchema.default(
    "needs_clarification",
  ),
});
export const CompensationPreferenceSchema =
  CompensationPreferenceObjectSchema.superRefine((value, context) => {
    if (
      value.minimum !== null &&
      value.maximum !== null &&
      value.maximum < value.minimum
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Maximum compensation must be greater than or equal to minimum compensation.",
        path: ["maximum"],
      });
    }
    if (value.currencyStatus === "explicit" && value.currency === null) {
      context.addIssue({
        code: "custom",
        message: "An explicit compensation currency requires a currency code.",
        path: ["currency"],
      });
    }
    if (
      value.currencyStatus === "needs_clarification" &&
      value.currency !== null
    ) {
      context.addIssue({
        code: "custom",
        message:
          "A compensation currency awaiting clarification must remain unset.",
        path: ["currency"],
      });
    }
  });
export type CompensationPreference = z.infer<
  typeof CompensationPreferenceSchema
>;

export const JobSearchPreferencesObjectSchema = z.object({
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
  compensation: CompensationPreferenceSchema.default({}),
  approvalMode: ApprovalModeSchema,
  tailoringMode: TailoringModeSchema,
  companyBlacklist: z.array(NonEmptyStringSchema).default([]),
  companyWhitelist: z.array(NonEmptyStringSchema).default([]),
  discovery: JobDiscoveryPreferencesSchema.default({}),
});

const annualMultiplierByInterval: Record<CompensationInterval, number> = {
  hour: 2_080,
  day: 260,
  week: 52,
  month: 12,
  year: 1,
};

function normalizeCompensationCompatibility(
  value: z.infer<typeof JobSearchPreferencesObjectSchema>,
): z.infer<typeof JobSearchPreferencesObjectSchema> {
  const compensationWasProvided =
    value.compensation.minimum !== null ||
    value.compensation.maximum !== null ||
    value.compensation.currency !== null;
  const compensation = compensationWasProvided
    ? value.compensation
    : value.minimumSalaryUsd !== null || value.targetSalaryUsd !== null
      ? {
          minimum: value.minimumSalaryUsd,
          maximum: value.targetSalaryUsd,
          interval: "year" as const,
          currency: value.salaryCurrency,
          currencyStatus: "inherited" as const,
        }
      : value.compensation;
  const comparableAsUsd =
    compensation.currency === "USD" &&
    compensation.currencyStatus !== "needs_clarification";
  const multiplier = annualMultiplierByInterval[compensation.interval];

  return {
    ...value,
    minimumSalaryUsd:
      comparableAsUsd && compensation.minimum !== null
        ? Math.round(compensation.minimum * multiplier)
        : compensationWasProvided
          ? null
          : value.minimumSalaryUsd,
    targetSalaryUsd:
      comparableAsUsd && compensation.maximum !== null
        ? Math.round(compensation.maximum * multiplier)
        : compensationWasProvided
          ? null
          : value.targetSalaryUsd,
    salaryCurrency: compensationWasProvided
      ? compensation.currency
      : (compensation.currency ?? value.salaryCurrency),
    compensation,
  };
}

export const JobSearchPreferencesSchema =
  JobSearchPreferencesObjectSchema.transform(
    normalizeCompensationCompatibility,
  );
export type JobSearchPreferences = z.infer<typeof JobSearchPreferencesSchema>;

export const jobRequirementCategoryValues = [
  "skill",
  "experience",
  "seniority",
  "location",
  "work_mode",
  "work_authorization",
  "domain",
] as const;
export const JobRequirementCategorySchema = z.enum(
  jobRequirementCategoryValues,
);
export type JobRequirementCategory = z.infer<
  typeof JobRequirementCategorySchema
>;

export const jobRequirementImportanceValues = [
  "required",
  "preferred",
  "inferred",
] as const;
export const JobRequirementImportanceSchema = z.enum(
  jobRequirementImportanceValues,
);
export type JobRequirementImportance = z.infer<
  typeof JobRequirementImportanceSchema
>;

export const jobRequirementEvidenceStatusValues = [
  "supported",
  "partial",
  "missing",
  "unknown",
  "conflict",
] as const;
export const JobRequirementEvidenceStatusSchema = z.enum(
  jobRequirementEvidenceStatusValues,
);
export type JobRequirementEvidenceStatus = z.infer<
  typeof JobRequirementEvidenceStatusSchema
>;

export const resumeEvidenceSourceKindValues = [
  "profile_skill",
  "experience",
  "project",
  "profile",
] as const;
export const ResumeEvidenceSourceKindSchema = z.enum(
  resumeEvidenceSourceKindValues,
);
export type ResumeEvidenceSourceKind = z.infer<
  typeof ResumeEvidenceSourceKindSchema
>;

export const ResumeRequirementEvidenceSchema = z.object({
  sourceKind: ResumeEvidenceSourceKindSchema,
  sourceId: NonEmptyStringSchema.nullable().default(null),
  label: NonEmptyStringSchema,
  detail: NonEmptyStringSchema,
});
export type ResumeRequirementEvidence = z.infer<
  typeof ResumeRequirementEvidenceSchema
>;

export const JobRequirementAssessmentSchema = z.object({
  id: NonEmptyStringSchema,
  category: JobRequirementCategorySchema,
  label: NonEmptyStringSchema,
  importance: JobRequirementImportanceSchema,
  status: JobRequirementEvidenceStatusSchema,
  jobEvidence: NonEmptyStringSchema,
  resumeEvidence: z.array(ResumeRequirementEvidenceSchema).default([]),
  explanation: NonEmptyStringSchema,
});
export type JobRequirementAssessment = z.infer<
  typeof JobRequirementAssessmentSchema
>;

export const fitRecommendationValues = [
  "strong_fit",
  "apply_with_original",
  "review_before_applying",
  "skip",
] as const;
export const FitRecommendationSchema = z.enum(fitRecommendationValues);
export type FitRecommendation = z.infer<typeof FitRecommendationSchema>;

export const compensationFitStateValues = [
  "not_requested",
  "unknown",
  "meets_minimum",
  "below_minimum",
  "currency_incomparable",
] as const;
export const CompensationFitStateSchema = z.enum(compensationFitStateValues);
export type CompensationFitState = z.infer<typeof CompensationFitStateSchema>;

export const compensationEvidenceConfidenceValues = [
  "unavailable",
  "low",
  "high",
] as const;
export const CompensationEvidenceConfidenceSchema = z.enum(
  compensationEvidenceConfidenceValues,
);
export type CompensationEvidenceConfidence = z.infer<
  typeof CompensationEvidenceConfidenceSchema
>;

export const CompensationFitAssessmentSchema = z.object({
  state: CompensationFitStateSchema.default("unknown"),
  confidence: CompensationEvidenceConfidenceSchema.default("unavailable"),
  minimumSalaryUsd: z.number().int().nonnegative().nullable().default(null),
  listingMinimumAnnualUsd: z
    .number()
    .int()
    .nonnegative()
    .nullable()
    .default(null),
  listingCurrency: NonEmptyStringSchema.nullable().default(null),
  explanation: NonEmptyStringSchema.default(
    "The listing does not provide comparable compensation evidence.",
  ),
});
export type CompensationFitAssessment = z.infer<
  typeof CompensationFitAssessmentSchema
>;

export const matchDimensionEvidenceSourceValues = [
  "listing",
  "profile",
  "preference",
  "derived",
] as const;
export const MatchDimensionEvidenceSourceSchema = z.enum(
  matchDimensionEvidenceSourceValues,
);
export type MatchDimensionEvidenceSource = z.infer<
  typeof MatchDimensionEvidenceSourceSchema
>;

export const MatchDimensionEvidenceSchema = z.object({
  source: MatchDimensionEvidenceSourceSchema,
  label: NonEmptyStringSchema.max(120),
  detail: NonEmptyStringSchema.max(240),
});
export type MatchDimensionEvidence = z.infer<
  typeof MatchDimensionEvidenceSchema
>;

const BoundedMatchDimensionEvidenceSchema = z
  .array(MatchDimensionEvidenceSchema)
  .max(4)
  .default([]);

export const roleSuitabilityStateValues = [
  "unknown",
  "exact",
  "adjacent",
  "conflict",
] as const;
export const RoleSuitabilityStateSchema = z.enum(roleSuitabilityStateValues);
export type RoleSuitabilityState = z.infer<typeof RoleSuitabilityStateSchema>;

export const RoleSuitabilityAssessmentSchema = z.object({
  state: RoleSuitabilityStateSchema.default("unknown"),
  explanation: NonEmptyStringSchema.max(320).default(
    "Role suitability has not been assessed from saved target roles.",
  ),
  evidence: BoundedMatchDimensionEvidenceSchema,
});
export type RoleSuitabilityAssessment = z.infer<
  typeof RoleSuitabilityAssessmentSchema
>;

export const preferenceAlignmentStateValues = [
  "unknown",
  "not_configured",
  "aligned",
  "mixed",
  "conflict",
] as const;
export const PreferenceAlignmentStateSchema = z.enum(
  preferenceAlignmentStateValues,
);
export type PreferenceAlignmentState = z.infer<
  typeof PreferenceAlignmentStateSchema
>;

export const PreferenceAlignmentAssessmentSchema = z.object({
  state: PreferenceAlignmentStateSchema.default("unknown"),
  explanation: NonEmptyStringSchema.max(320).default(
    "Preference alignment has not been assessed from saved search preferences.",
  ),
  evidence: BoundedMatchDimensionEvidenceSchema,
});
export type PreferenceAlignmentAssessment = z.infer<
  typeof PreferenceAlignmentAssessmentSchema
>;

export const applicationEffortLevelValues = [
  "unknown",
  "low",
  "moderate",
  "high",
] as const;
export const ApplicationEffortLevelSchema = z.enum(
  applicationEffortLevelValues,
);
export type ApplicationEffortLevel = z.infer<
  typeof ApplicationEffortLevelSchema
>;

export const ApplicationEffortAssessmentSchema = z.object({
  level: ApplicationEffortLevelSchema.default("unknown"),
  explanation: NonEmptyStringSchema.max(320).default(
    "The listing does not provide enough application-path evidence to estimate effort.",
  ),
  evidence: BoundedMatchDimensionEvidenceSchema,
});
export type ApplicationEffortAssessment = z.infer<
  typeof ApplicationEffortAssessmentSchema
>;

export const evidenceConfidenceLevelValues = [
  "unavailable",
  "low",
  "moderate",
  "high",
] as const;
export const EvidenceConfidenceLevelSchema = z.enum(
  evidenceConfidenceLevelValues,
);
export type EvidenceConfidenceLevel = z.infer<
  typeof EvidenceConfidenceLevelSchema
>;

export const EvidenceConfidenceAssessmentSchema = z.object({
  level: EvidenceConfidenceLevelSchema.default("unavailable"),
  explanation: NonEmptyStringSchema.max(320).default(
    "No supportability assessment is available for the extracted evidence.",
  ),
  evidence: BoundedMatchDimensionEvidenceSchema,
  supportedCount: z.number().int().nonnegative().default(0),
  partialCount: z.number().int().nonnegative().default(0),
  missingCount: z.number().int().nonnegative().default(0),
  unknownCount: z.number().int().nonnegative().default(0),
  conflictCount: z.number().int().nonnegative().default(0),
});
export type EvidenceConfidenceAssessment = z.infer<
  typeof EvidenceConfidenceAssessmentSchema
>;

export const MatchDimensionsAssessmentSchema = z.object({
  roleSuitability: RoleSuitabilityAssessmentSchema.default({}),
  preferenceAlignment: PreferenceAlignmentAssessmentSchema.default({}),
  applicationEffort: ApplicationEffortAssessmentSchema.default({}),
  evidenceConfidence: EvidenceConfidenceAssessmentSchema.default({}),
});
export type MatchDimensionsAssessment = z.infer<
  typeof MatchDimensionsAssessmentSchema
>;

export const MatchAssessmentSchema = z.object({
  scorerVersion: z.number().int().positive().default(1),
  contextFingerprint: NonEmptyStringSchema.nullable().default(null),
  postingFingerprint: NonEmptyStringSchema.nullable().default(null),
  score: z.number().int().min(0).max(100),
  compensationFit: CompensationFitAssessmentSchema.default({}),
  dimensions: MatchDimensionsAssessmentSchema.default({}),
  reasons: z.array(NonEmptyStringSchema).default([]),
  gaps: z.array(NonEmptyStringSchema).default([]),
  recommendation: FitRecommendationSchema.default("review_before_applying"),
  recommendationRationale: NonEmptyStringSchema.default(
    "Review the listing and resume evidence before applying.",
  ),
  requirements: z.array(JobRequirementAssessmentSchema).default([]),
});
export type MatchAssessment = z.infer<typeof MatchAssessmentSchema>;

export const matchAssessmentInputChangeCodeValues = [
  "scorer_version_changed",
  "candidate_context_changed",
  "listing_evidence_changed",
  "candidate_context_metadata_unknown",
  "listing_evidence_metadata_unknown",
] as const;
export const MatchAssessmentInputChangeCodeSchema = z.enum(
  matchAssessmentInputChangeCodeValues,
);
export type MatchAssessmentInputChangeCode = z.infer<
  typeof MatchAssessmentInputChangeCodeSchema
>;

export const matchAssessmentOutputChangeCodeValues = [
  "score_changed",
  "recommendation_changed",
  "compensation_fit_changed",
  "rank_position_changed",
  "role_suitability_changed",
  "preference_alignment_changed",
  "application_effort_changed",
  "evidence_confidence_changed",
  "requirement_added",
  "requirement_removed",
  "requirement_importance_changed",
  "requirement_status_changed",
  "requirement_evidence_changed",
  "assessment_explanation_changed",
] as const;
export const MatchAssessmentOutputChangeCodeSchema = z.enum(
  matchAssessmentOutputChangeCodeValues,
);
export type MatchAssessmentOutputChangeCode = z.infer<
  typeof MatchAssessmentOutputChangeCodeSchema
>;

export const MatchAssessmentInputChangeSchema = z.object({
  code: MatchAssessmentInputChangeCodeSchema,
  scope: z.enum(["scorer", "candidate_context", "listing_evidence"]),
  certainty: z.enum(["known", "unknown"]),
  title: NonEmptyStringSchema,
  detail: NonEmptyStringSchema,
  previousValue: z.union([z.string(), z.number()]).nullable(),
  currentValue: z.union([z.string(), z.number()]).nullable(),
});
export type MatchAssessmentInputChange = z.infer<
  typeof MatchAssessmentInputChangeSchema
>;

export const MatchAssessmentOutputChangeSchema = z.object({
  code: MatchAssessmentOutputChangeCodeSchema,
  subject: NonEmptyStringSchema,
  title: NonEmptyStringSchema,
  detail: NonEmptyStringSchema,
  previousValue: z.string().nullable(),
  currentValue: z.string().nullable(),
});
export type MatchAssessmentOutputChange = z.infer<
  typeof MatchAssessmentOutputChangeSchema
>;

export const matchAssessmentChangeAuditStatusValues = [
  "unchanged",
  "metadata_incomplete",
  "inputs_changed_assessment_stable",
  "assessment_changed",
  "assessment_changed_with_unknown_cause",
] as const;
export const MatchAssessmentChangeAuditStatusSchema = z.enum(
  matchAssessmentChangeAuditStatusValues,
);
export type MatchAssessmentChangeAuditStatus = z.infer<
  typeof MatchAssessmentChangeAuditStatusSchema
>;

export const matchAssessmentChangeCauseConfidenceValues = [
  "known",
  "partial",
  "unknown",
  "not_applicable",
] as const;
export const MatchAssessmentChangeCauseConfidenceSchema = z.enum(
  matchAssessmentChangeCauseConfidenceValues,
);
export type MatchAssessmentChangeCauseConfidence = z.infer<
  typeof MatchAssessmentChangeCauseConfidenceSchema
>;

export const MatchAssessmentAuditMetadataSchema = MatchAssessmentSchema.pick({
  scorerVersion: true,
  contextFingerprint: true,
  postingFingerprint: true,
});
export type MatchAssessmentAuditMetadata = z.infer<
  typeof MatchAssessmentAuditMetadataSchema
>;

export const MatchAssessmentChangeAuditSchema = z.object({
  version: z.literal(1).default(1),
  recordedAt: IsoDateTimeSchema.nullable().default(null),
  status: MatchAssessmentChangeAuditStatusSchema,
  causeConfidence: MatchAssessmentChangeCauseConfidenceSchema,
  rankingSignalChanged: z.boolean(),
  summary: NonEmptyStringSchema,
  reasons: z.array(NonEmptyStringSchema).default([]),
  previousMetadata: MatchAssessmentAuditMetadataSchema,
  currentMetadata: MatchAssessmentAuditMetadataSchema,
  inputChanges: z.array(MatchAssessmentInputChangeSchema).default([]),
  previousRank: z.number().int().positive().nullable().default(null),
  currentRank: z.number().int().positive().nullable().default(null),
  outputChanges: z.array(MatchAssessmentOutputChangeSchema).default([]),
});
export type MatchAssessmentChangeAudit = z.infer<
  typeof MatchAssessmentChangeAuditSchema
>;

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

export const consentInterruptKindValues = [
  "signup",
  "existing_account_decision",
  "manual_verification",
] as const;
export const ConsentInterruptKindSchema = z.enum(consentInterruptKindValues);
export type ConsentInterruptKind = z.infer<typeof ConsentInterruptKindSchema>;

export const JobScreeningHintsSchema = z
  .object({
    sponsorshipText: NonEmptyStringSchema.nullable().default(null),
    requiresSecurityClearance: z.boolean().nullable().default(null),
    relocationText: NonEmptyStringSchema.nullable().default(null),
    travelText: NonEmptyStringSchema.nullable().default(null),
    remoteGeographies: z.array(NonEmptyStringSchema).default([]),
    requiresConsentInterrupt: z.boolean().nullable().default(null),
    requiresConsentInterruptKind:
      ConsentInterruptKindSchema.nullable().default(null),
  })
  .superRefine((value, ctx) => {
    if (
      value.requiresConsentInterrupt === true &&
      value.requiresConsentInterruptKind == null
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "requiresConsentInterruptKind is required when requiresConsentInterrupt is true.",
        path: ["requiresConsentInterruptKind"],
      });
    }

    if (
      value.requiresConsentInterrupt === false &&
      value.requiresConsentInterruptKind != null
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "requiresConsentInterruptKind must be null when requiresConsentInterrupt is false.",
        path: ["requiresConsentInterruptKind"],
      });
    }

    if (
      value.requiresConsentInterrupt == null &&
      value.requiresConsentInterruptKind != null
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "requiresConsentInterruptKind must be null when requiresConsentInterrupt is null.",
        path: ["requiresConsentInterruptKind"],
      });
    }
  });
export type JobScreeningHints = z.infer<typeof JobScreeningHintsSchema>;

export const jobPostingDetailQualityValues = [
  "card_only",
  "partial_detail",
  "detail_enriched",
] as const;
export const JobPostingDetailQualitySchema = z.enum(
  jobPostingDetailQualityValues,
);
export type JobPostingDetailQuality = z.infer<
  typeof JobPostingDetailQualitySchema
>;

export const JobPostingSchema = z.object({
  source: JobSourceSchema,
  sourceJobId: NonEmptyStringSchema,
  discoveryMethod: JobDiscoveryMethodSchema.default("catalog_seed"),
  collectionMethod:
    JobDiscoveryCollectionMethodSchema.default("fallback_search"),
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
  providerUpdatedAt: IsoDateTimeSchema.nullable().default(null),
  discoveredAt: IsoDateTimeSchema,
  firstSeenAt: IsoDateTimeSchema.nullable().default(null),
  lastSeenAt: IsoDateTimeSchema.nullable().default(null),
  lastVerifiedActiveAt: IsoDateTimeSchema.nullable().default(null),
  salaryText: NonEmptyStringSchema.nullable(),
  normalizedCompensation: NormalizedCompensationSchema.default({}),
  detailQuality: JobPostingDetailQualitySchema.default("card_only"),
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
  providerKey: SourceIntelligenceProviderKeySchema.nullable().default(null),
  providerBoardToken: NonEmptyStringSchema.nullable().default(null),
  providerIdentifier: NonEmptyStringSchema.nullable().default(null),
  titleTriageOutcome: DiscoveryTitleTriageOutcomeSchema.default("pass"),
  sourceIntelligence: SourceIntelligenceArtifactSchema.nullable().default(null),
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
  collectionMethod:
    JobDiscoveryCollectionMethodSchema.default("fallback_search"),
  providerKey: SourceIntelligenceProviderKeySchema.nullable().default(null),
  providerBoardToken: NonEmptyStringSchema.nullable().default(null),
  titleTriageOutcome: DiscoveryTitleTriageOutcomeSchema.default("pass"),
});
export type SavedJobDiscoveryProvenance = z.infer<
  typeof SavedJobDiscoveryProvenanceSchema
>;

export const discoveryFeedbackReasonValues = [
  "role",
  "seniority",
  "location",
  "work_mode",
  "compensation",
  "company",
  "missing_requirement",
  "duplicate",
  "other",
] as const;
export const DiscoveryFeedbackReasonSchema = z.enum(
  discoveryFeedbackReasonValues,
);
export type DiscoveryFeedbackReason = z.infer<
  typeof DiscoveryFeedbackReasonSchema
>;

export const DiscoveryFeedbackSchema = z.object({
  version: z.literal(1),
  revision: z.number().int().positive(),
  reasons: z.array(DiscoveryFeedbackReasonSchema).min(1).max(9),
  recordedAt: IsoDateTimeSchema,
});
export type DiscoveryFeedback = z.infer<typeof DiscoveryFeedbackSchema>;

export const discoveryLedgerEntryStatusValues = [
  "seen",
  "skipped",
  "applied",
  "enriched",
  "inactive",
] as const;
export const DiscoveryLedgerEntryStatusSchema = z.enum(
  discoveryLedgerEntryStatusValues,
);
export type DiscoveryLedgerEntryStatus = z.infer<
  typeof DiscoveryLedgerEntryStatusSchema
>;

export const DiscoveryListingFingerprintsSchema = z.object({
  version: z.literal(1),
  card: NonEmptyStringSchema,
  detail: NonEmptyStringSchema.nullable().default(null),
  material: NonEmptyStringSchema,
});
export type DiscoveryListingFingerprints = z.infer<
  typeof DiscoveryListingFingerprintsSchema
>;

export const DiscoveryLedgerEntrySchema = z.object({
  id: NonEmptyStringSchema,
  canonicalUrl: UrlStringSchema,
  applicationUrl: UrlStringSchema.nullable().default(null),
  source: JobSourceSchema,
  sourceJobId: NonEmptyStringSchema.nullable().default(null),
  providerKey: SourceIntelligenceProviderKeySchema.nullable().default(null),
  providerBoardToken: NonEmptyStringSchema.nullable().default(null),
  providerIdentifier: NonEmptyStringSchema.nullable().default(null),
  providerUpdatedAt: IsoDateTimeSchema.nullable().default(null),
  title: NonEmptyStringSchema,
  company: NonEmptyStringSchema.nullable().default(null),
  location: NonEmptyStringSchema.nullable().default(null),
  postedAt: IsoDateTimeSchema.nullable().default(null),
  postedAtText: NonEmptyStringSchema.nullable().default(null),
  targetId: NonEmptyStringSchema,
  collectionMethod:
    JobDiscoveryCollectionMethodSchema.default("fallback_search"),
  detailQuality: JobPostingDetailQualitySchema.default("card_only"),
  fingerprints: DiscoveryListingFingerprintsSchema.nullable().default(null),
  firstSeenAt: IsoDateTimeSchema,
  lastSeenAt: IsoDateTimeSchema,
  lastAppliedAt: IsoDateTimeSchema.nullable().default(null),
  lastEnrichedAt: IsoDateTimeSchema.nullable().default(null),
  inactiveAt: IsoDateTimeSchema.nullable().default(null),
  latestStatus: DiscoveryLedgerEntryStatusSchema.default("seen"),
  titleTriageOutcome: DiscoveryTitleTriageOutcomeSchema.default("pass"),
  skipReason: NonEmptyStringSchema.nullable().default(null),
});
export type DiscoveryLedgerEntry = z.infer<typeof DiscoveryLedgerEntrySchema>;

export type SavedJob = JobPosting & {
  id: string;
  status: z.infer<typeof ApplicationStatusSchema>;
  matchAssessment: MatchAssessment;
  provenance: SavedJobDiscoveryProvenance[];
  discoveryFeedback: DiscoveryFeedback | null;
  resumeApplicationMode: z.infer<typeof ResumeApplicationModeSchema> | null;
  latestMatchAssessmentAudit: MatchAssessmentChangeAudit | null;
};
type SavedJobInput = z.input<typeof JobPostingSchema> & {
  id: string;
  status: z.input<typeof ApplicationStatusSchema>;
  matchAssessment: z.input<typeof MatchAssessmentSchema>;
  provenance?: z.input<typeof SavedJobDiscoveryProvenanceSchema>[] | undefined;
  discoveryFeedback?:
    | z.input<typeof DiscoveryFeedbackSchema>
    | null
    | undefined;
  resumeApplicationMode?:
    | z.input<typeof ResumeApplicationModeSchema>
    | null
    | undefined;
  latestMatchAssessmentAudit?:
    | z.input<typeof MatchAssessmentChangeAuditSchema>
    | null
    | undefined;
};

export const SavedJobSchema: z.ZodType<SavedJob, z.ZodTypeDef, SavedJobInput> =
  JobPostingSchema.extend({
    id: NonEmptyStringSchema,
    status: ApplicationStatusSchema,
    matchAssessment: MatchAssessmentSchema,
    provenance: z.array(SavedJobDiscoveryProvenanceSchema).default([]),
    discoveryFeedback: DiscoveryFeedbackSchema.nullable().default(null),
    resumeApplicationMode: ResumeApplicationModeSchema.nullable().default(null),
    latestMatchAssessmentAudit:
      MatchAssessmentChangeAuditSchema.nullable().default(null),
  });

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

export const ReviewQueueResumeReviewStateSchema = z.discriminatedUnion(
  "status",
  [
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
    z.object({
      status: z.literal("original_resume"),
      sourceDocumentId: NonEmptyStringSchema,
      fileName: NonEmptyStringSchema,
      filePath: NonEmptyStringSchema,
    }),
  ],
);
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
  resumeApplicationMode:
    ResumeApplicationModeSchema.default("tailored_per_job"),
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

export const applicationQuestionControlTypeValues = [
  "text",
  "single_choice",
  "multi_choice",
  "boolean",
  "date",
  "file",
] as const;
export const ApplicationQuestionControlTypeSchema = z.enum(
  applicationQuestionControlTypeValues,
);
export type ApplicationQuestionControlType = z.infer<
  typeof ApplicationQuestionControlTypeSchema
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
  answerControlType: ApplicationQuestionControlTypeSchema.optional(),
  isRequired: z.boolean().default(true),
  detectedAt: IsoDateTimeSchema,
  answerOptions: z.array(NonEmptyStringSchema).default([]),
  suggestedAnswers: z
    .array(ApplicationAttemptSuggestedAnswerSchema)
    .default([]),
  submittedAnswer: NonEmptyStringSchema.nullable().default(null),
  status: ApplicationQuestionStatusSchema.default("detected"),
});
export type ApplicationAttemptQuestion = z.infer<
  typeof ApplicationAttemptQuestionSchema
>;

export const applicationAttemptExternalWriteCategoryValues = [
  "resume_attachment",
  "profile_field",
  "application_answer",
  "consent_control",
  "other",
] as const;
export const ApplicationAttemptExternalWriteCategorySchema = z.enum(
  applicationAttemptExternalWriteCategoryValues,
);
export type ApplicationAttemptExternalWriteCategory = z.infer<
  typeof ApplicationAttemptExternalWriteCategorySchema
>;

export const ApplicationAttemptExternalWriteEvidenceSchema = z.object({
  category: ApplicationAttemptExternalWriteCategorySchema,
  fieldLabel: NonEmptyStringSchema,
  occurredAt: IsoDateTimeSchema,
  verified: z.boolean().default(false),
});
export type ApplicationAttemptExternalWriteEvidence = z.infer<
  typeof ApplicationAttemptExternalWriteEvidenceSchema
>;
export const ApplicationAttemptBlockerSchema = z.object({
  code: ApplicationBlockerCodeSchema.default("unknown"),
  userActionKind: UserActionRequestKindSchema.nullable().optional(),
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
  visualEvidence: z.array(BrowserVisualEvidenceSummarySchema).default([]),
});
export type ApplicationAttemptCheckpoint = z.infer<
  typeof ApplicationAttemptCheckpointSchema
>;

export const applyExecutionStageValues = [
  "browser_preparation",
  "form_preparation",
  "visual_diagnostics",
  "total",
] as const;
export const ApplyExecutionStageSchema = z.enum(applyExecutionStageValues);
export type ApplyExecutionStage = z.infer<typeof ApplyExecutionStageSchema>;

export const ApplyExecutionTimingSchema = z.object({
  stage: ApplyExecutionStageSchema,
  startedAt: IsoDateTimeSchema,
  completedAt: IsoDateTimeSchema,
  durationMs: z.number().nonnegative(),
});
export type ApplyExecutionTiming = z.infer<typeof ApplyExecutionTimingSchema>;

export const ApplicationUserActionResumptionSchema = z
  .object({
    requestId: NonEmptyStringSchema,
    requestRevision: z.number().int().positive(),
    verificationEventId: NonEmptyStringSchema,
    runId: NonEmptyStringSchema,
    jobId: NonEmptyStringSchema,
    resultId: NonEmptyStringSchema,
    replayCheckpointId: NonEmptyStringSchema,
  })
  .strict();
export type ApplicationUserActionResumption = z.infer<
  typeof ApplicationUserActionResumptionSchema
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
  consentDecisions: z
    .array(ApplicationAttemptConsentDecisionSchema)
    .default([]),
  replay: ApplicationAttemptReplaySchema.default({}),
  visualEvidence: z.array(BrowserVisualEvidenceSummarySchema).default([]),
  visualObservationSets: z.array(BrowserVisualObservationSetSchema).default([]),
  visualCheckpoints: z.array(ApplyVisualCheckpointSchema).default([]),
  nextActionLabel: NonEmptyStringSchema.nullable(),
  executionTimings: z.array(ApplyExecutionTimingSchema).default([]),
  userActionResumption: ApplicationUserActionResumptionSchema.optional(),
});
export type ApplicationAttempt = z.infer<typeof ApplicationAttemptSchema>;
export type ApplicationAttemptInput = z.input<typeof ApplicationAttemptSchema>;

export const ApplyExecutionResultSchema = z.object({
  state: ApplicationAttemptStateSchema,
  summary: NonEmptyStringSchema,
  detail: NonEmptyStringSchema,
  submittedAt: IsoDateTimeSchema.nullable(),
  outcome: ApplicationStatusSchema.nullable(),
  checkpoints: z.array(ApplicationAttemptCheckpointSchema).default([]),
  questions: z.array(ApplicationAttemptQuestionSchema).default([]),
  blocker: ApplicationAttemptBlockerSchema.nullable().default(null),
  consentDecisions: z
    .array(ApplicationAttemptConsentDecisionSchema)
    .default([]),
  replay: ApplicationAttemptReplaySchema.default({}),
  visualEvidence: z.array(BrowserVisualEvidenceSummarySchema).default([]),
  visualObservationSets: z.array(BrowserVisualObservationSetSchema).default([]),
  visualCheckpoints: z.array(ApplyVisualCheckpointSchema).default([]),
  nextActionLabel: NonEmptyStringSchema.nullable(),
  executionTimings: z.array(ApplyExecutionTimingSchema).default([]),
  externalWrites: z
    .array(ApplicationAttemptExternalWriteEvidenceSchema)
    .optional(),
});
export type ApplyExecutionResult = z.infer<typeof ApplyExecutionResultSchema>;

export const AgentDebugFindingsSchema = z.object({
  summary: NonEmptyStringSchema.nullable().default(null),
  reliableControls: z.array(NonEmptyStringSchema).default([]),
  trickyFilters: z.array(NonEmptyStringSchema).default([]),
  navigationTips: z.array(NonEmptyStringSchema).default([]),
  applyTips: z.array(NonEmptyStringSchema).default([]),
  warnings: z.array(NonEmptyStringSchema).default([]),
  visualFindings: z.array(BrowserVisualEvidenceSummarySchema).default([]),
  visualObservationSets: z.array(BrowserVisualObservationSetSchema).default([]),
});
export type AgentDebugFindings = z.infer<typeof AgentDebugFindingsSchema>;

export const DiscoveryAgentMetadataSchema = z.object({
  steps: z.number().int().nonnegative().default(0),
  incomplete: z.boolean().default(false),
  transcriptMessageCount: z.number().int().nonnegative().default(0),
  reviewTranscript: z.array(NonEmptyStringSchema).default([]),
  compactionState: SourceDebugCompactionStateSchema.nullable().default(null),
  compactionUsedFallbackTrigger: z.boolean().default(false),
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
export type DiscoveryRunResultInput = z.input<typeof DiscoveryRunResultSchema>;

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
export type DiscoveryStageDuration = z.infer<
  typeof DiscoveryStageDurationSchema
>;

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
  firstCandidateMs: z.number().int().nonnegative().nullable().default(null),
  firstDistinctUsefulJobMs: z
    .number()
    .int()
    .nonnegative()
    .nullable()
    .default(null),
  longestGapMs: z.number().int().nonnegative().default(0),
  eventCount: z.number().int().nonnegative().default(0),
  stageDurations: z.array(DiscoveryStageDurationSchema).default([]),
  waitReasonDurations: z.array(DiscoveryWaitReasonDurationSchema).default([]),
});
export type DiscoveryTimingSummary = z.infer<
  typeof DiscoveryTimingSummarySchema
>;

export const DiscoveryChangeDigestSchema = z.object({
  new: z.number().int().nonnegative().default(0),
  unchanged: z.number().int().nonnegative().default(0),
  changed: z.number().int().nonnegative().default(0),
  reactivated: z.number().int().nonnegative().default(0),
  inactive: z.number().int().nonnegative().default(0),
  known: z.number().int().nonnegative().default(0),
  skipped: z.number().int().nonnegative().default(0),
});
export type DiscoveryChangeDigest = z.infer<typeof DiscoveryChangeDigestSchema>;

export const DiscoverySourceHealthStateSchema = z.enum([
  "healthy",
  "warning",
  "failed",
  "cancelled",
  "skipped",
  "pending",
]);
export type DiscoverySourceHealthState = z.infer<
  typeof DiscoverySourceHealthStateSchema
>;

export const DiscoverySourceHealthSummarySchema = z.object({
  targetId: NonEmptyStringSchema,
  health: DiscoverySourceHealthStateSchema,
  durationMs: z.number().int().nonnegative().default(0),
  warnings: z.array(NonEmptyStringSchema).default([]),
});
export type DiscoverySourceHealthSummary = z.infer<
  typeof DiscoverySourceHealthSummarySchema
>;

export const DiscoveryTargetExecutionSchema = z.object({
  targetId: NonEmptyStringSchema,
  adapterKind: JobSourceAdapterKindSchema,
  resolvedAdapterKind: JobSourceSchema.nullable().default(null),
  collectionMethod: JobDiscoveryCollectionMethodSchema.nullable().default(null),
  sourceIntelligenceProvider:
    SourceIntelligenceProviderKeySchema.nullable().default(null),
  state: DiscoveryTargetExecutionStateSchema,
  startedAt: IsoDateTimeSchema.nullable().default(null),
  completedAt: IsoDateTimeSchema.nullable().default(null),
  requestedJobBudget: z.number().int().positive().nullable().default(null),
  jobsReviewed: z.number().int().nonnegative().default(0),
  jobsFound: z.number().int().nonnegative().default(0),
  jobsPersisted: z.number().int().nonnegative().default(0),
  jobsStaged: z.number().int().nonnegative().default(0),
  jobsSkippedByLedger: z.number().int().nonnegative().default(0),
  jobsSkippedByTitleTriage: z.number().int().nonnegative().default(0),
  duplicatesMerged: z.number().int().nonnegative().default(0),
  invalidSkipped: z.number().int().nonnegative().default(0),
  changeDigest: DiscoveryChangeDigestSchema.default({}),
  warning: NonEmptyStringSchema.nullable().default(null),
  compactionState: SharedAgentCompactionSnapshotSchema.nullable().default(null),
  compactionUsedFallbackTrigger: z.boolean().default(false),
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
  collectionMethod: JobDiscoveryCollectionMethodSchema.nullable().default(null),
  sourceIntelligenceProvider:
    SourceIntelligenceProviderKeySchema.nullable().default(null),
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
  jobsSkippedByLedger: z.number().int().nonnegative().default(0),
  jobsSkippedByTitleTriage: z.number().int().nonnegative().default(0),
  duplicatesMerged: z.number().int().nonnegative().default(0),
  invalidSkipped: z.number().int().nonnegative().default(0),
  changeDigest: DiscoveryChangeDigestSchema.default({}),
  sourceHealth: z.array(DiscoverySourceHealthSummarySchema).default([]),
  warnings: z.array(NonEmptyStringSchema).default([]),
  durationMs: z.number().int().nonnegative().default(0),
  outcome: DiscoveryRunStateSchema.default("idle"),
  browserCloseout: BrowserRunCloseoutSchema.nullable().default(null),
  timing: DiscoveryTimingSummarySchema.nullable().default(null),
});
export type DiscoveryRunSummary = z.infer<typeof DiscoveryRunSummarySchema>;

export const DiscoveryRunRecordSchema = z.object({
  id: NonEmptyStringSchema,
  state: DiscoveryRunStateSchema,
  scope: DiscoveryRunScopeSchema.default("run_all"),
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
  latestBlocker:
    ApplicationAttemptBlockerSummarySchema.nullable().default(null),
  consentSummary: ApplicationAttemptConsentSummarySchema.default({}),
  replaySummary: ApplicationAttemptReplaySummarySchema.default({}),
  events: z.array(ApplicationEventSchema).default([]),
});
export type ApplicationRecord = z.infer<typeof ApplicationRecordSchema>;

export const JobFinderInterviewFollowUpInputSchema = z.object({
  applicationRecordId: NonEmptyStringSchema,
  sessionId: NonEmptyStringSchema,
  action: z.enum(["mark_interviewed", "add_follow_up_note"]),
  note: NonEmptyStringSchema.optional(),
});
export type JobFinderInterviewFollowUpInput = z.infer<
  typeof JobFinderInterviewFollowUpInputSchema
>;

export const SourceDebugPersistenceSchemas = {
  SourceDebugEvidenceRefSchema,
  SourceDebugRunRecordSchema,
  SourceDebugWorkerAttemptSchema,
  SourceInstructionArtifactSchema,
} as const;
