import { z } from "zod";

import { IsoDateTimeSchema, NonEmptyStringSchema } from "./base";
import {
  CampaignDigestSchema,
  CampaignNotificationSchema,
  CampaignPauseWindowSchema,
  CampaignRuleSchema,
  CampaignRunFactsSchema,
} from "./campaign-operations";
import { JobSearchPreferencesSchema } from "./discovery";

export const JobSearchCampaignModeSchema = z.enum(["precision", "scale"]);
export type JobSearchCampaignMode = z.infer<typeof JobSearchCampaignModeSchema>;

export const JobSearchCampaignStatusSchema = z.enum([
  "active",
  "paused",
  "completed",
  "archived",
]);
export type JobSearchCampaignStatus = z.infer<
  typeof JobSearchCampaignStatusSchema
>;

export const JobSearchCampaignLimitsSchema = z.object({
  retainedJobTarget: z.number().int().min(1).max(10_000),
  analysisConcurrency: z.number().int().min(1).max(20),
  preparationBatchSize: z.number().int().min(1).max(500),
  dailyPreparationLimit: z.number().int().min(1).max(5_000).nullable(),
});
export type JobSearchCampaignLimits = z.infer<
  typeof JobSearchCampaignLimitsSchema
>;

export const JobSearchCampaignStopRulesSchema = z.object({
  pauseOnLoginRequired: z.boolean(),
  pauseOnChangedForm: z.boolean(),
  pauseOnUncertainEligibility: z.boolean(),
  pauseOnFailureRatePercent: z.number().int().min(1).max(100),
  failureRateMinimumSample: z.number().int().min(1).max(1_000),
});
export type JobSearchCampaignStopRules = z.infer<
  typeof JobSearchCampaignStopRulesSchema
>;

export const JobSearchCampaignApplicationPolicySchema = z.object({
  resumeStrategy: z.enum(["job_specific", "job_family_variants"]),
  defaultResumeStrategyId: NonEmptyStringSchema.nullable().optional(),
  requireReviewBeforePreparation: z.boolean(),
  requireReviewBeforeExternalWrite: z.literal(true).default(true),
  finalSubmitAuthorized: z.literal(false).default(false),
  /**
   * Fraction of a prepared automatic queue that must be reviewed before the
   * queue can be treated as quality-checked. The default keeps persisted
   * campaigns from gaining a new required field during migration.
   */
  qualityReviewSampleRatio: z.number().min(0).max(1).default(0.2),
  /** The active window used when comparing verified submissions for conflicts. */
  simultaneousApplicationWindowDays: z
    .number()
    .int()
    .min(1)
    .max(365)
    .default(1),
});
export type JobSearchCampaignApplicationPolicy = z.infer<
  typeof JobSearchCampaignApplicationPolicySchema
>;

export const JobSearchCampaignScheduleSchema = z.object({
  mode: z.enum(["manual", "daily", "selected_days"]).default("manual"),
  enabled: z.boolean().default(false),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).default([]),
  localStartTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable()
    .default(null),
  timeZone: NonEmptyStringSchema.nullable().default(null),
  pauseWindows: z.array(CampaignPauseWindowSchema).max(100).default([]),
  runFacts: CampaignRunFactsSchema.default({}),
});
export type JobSearchCampaignSchedule = z.infer<
  typeof JobSearchCampaignScheduleSchema
>;

export const JobSearchCampaignProgressSchema = z.object({
  jobsFound: z.number().int().nonnegative().default(0),
  jobsRetained: z.number().int().nonnegative().default(0),
  applicationsPrepared: z.number().int().nonnegative().default(0),
  applicationsApplied: z.number().int().nonnegative().default(0),
  currentBatchCompleted: z.number().int().nonnegative().default(0),
  currentBatchTotal: z.number().int().nonnegative().default(0),
  blockedCount: z.number().int().nonnegative().default(0),
  remainingQueueSize: z.number().int().nonnegative().default(0),
  lastRunAt: IsoDateTimeSchema.nullable().default(null),
  lastUpdatedAt: IsoDateTimeSchema,
});
export type JobSearchCampaignProgress = z.infer<
  typeof JobSearchCampaignProgressSchema
>;

export const JobSearchCampaignHistoryEntrySchema = z.object({
  id: NonEmptyStringSchema,
  campaignId: NonEmptyStringSchema,
  kind: z.enum([
    "created",
    "updated",
    "activated",
    "paused",
    "resumed",
    "completed",
    "discovery_run",
  ]),
  occurredAt: IsoDateTimeSchema,
  summary: NonEmptyStringSchema,
  discoveryRunId: NonEmptyStringSchema.nullable().default(null),
});
export type JobSearchCampaignHistoryEntry = z.infer<
  typeof JobSearchCampaignHistoryEntrySchema
>;

export const JobSearchCampaignSchema = z.object({
  id: NonEmptyStringSchema,
  name: NonEmptyStringSchema,
  description: z.string().trim().max(2_000).default(""),
  mode: JobSearchCampaignModeSchema,
  status: JobSearchCampaignStatusSchema,
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  searchPreferences: JobSearchPreferencesSchema,
  sourceTargetIds: z.array(NonEmptyStringSchema).default([]),
  jobIds: z.array(NonEmptyStringSchema).default([]),
  minimumFitScore: z.number().int().min(0).max(100).nullable().default(null),
  limits: JobSearchCampaignLimitsSchema,
  stopRules: JobSearchCampaignStopRulesSchema,
  applicationPolicy: JobSearchCampaignApplicationPolicySchema,
  rules: z.array(CampaignRuleSchema).max(200).default([]),
  schedule: JobSearchCampaignScheduleSchema.default({}),
  latestDigest: CampaignDigestSchema.nullable().default(null),
  progress: JobSearchCampaignProgressSchema,
  history: z.array(JobSearchCampaignHistoryEntrySchema).default([]),
});
export type JobSearchCampaign = z.infer<typeof JobSearchCampaignSchema>;

export const JobSearchCampaignCollectionSchema = z
  .object({
    activeCampaignId: NonEmptyStringSchema,
    campaigns: z.array(JobSearchCampaignSchema).min(1),
    notifications: z.array(CampaignNotificationSchema).max(5_000).default([]),
  })
  .superRefine((collection, context) => {
    if (
      !collection.campaigns.some(
        (campaign) => campaign.id === collection.activeCampaignId,
      )
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["activeCampaignId"],
        message: "The active campaign must exist in the campaign collection.",
      });
    }
  });
export type JobSearchCampaignCollection = z.infer<
  typeof JobSearchCampaignCollectionSchema
>;

export const SaveJobSearchCampaignInputSchema = JobSearchCampaignSchema.omit({
  createdAt: true,
  updatedAt: true,
  progress: true,
  history: true,
  jobIds: true,
}).extend({
  id: NonEmptyStringSchema.nullable().default(null),
});
export type SaveJobSearchCampaignInput = z.infer<
  typeof SaveJobSearchCampaignInputSchema
>;

export const SelectJobSearchCampaignInputSchema = z.object({
  campaignId: NonEmptyStringSchema,
});
export type SelectJobSearchCampaignInput = z.infer<
  typeof SelectJobSearchCampaignInputSchema
>;

export const JobFinderActivityControlSchema = z.object({
  paused: z.boolean().default(false),
  pausedAt: IsoDateTimeSchema.nullable().default(null),
  reason: z.string().trim().max(500).nullable().default(null),
});
export type JobFinderActivityControl = z.infer<
  typeof JobFinderActivityControlSchema
>;

export const SetJobFinderActivityControlInputSchema = z.object({
  paused: z.boolean(),
  reason: z.string().trim().max(500).nullable().optional(),
});
export type SetJobFinderActivityControlInput = z.infer<
  typeof SetJobFinderActivityControlInputSchema
>;

export const JobFinderDashboardRateSchema = z.object({
  numerator: z.number().int().nonnegative(),
  denominator: z.number().int().positive(),
  percent: z.number().min(0).max(100),
});

export const JobFinderDashboardSourceHealthSchema = z.object({
  healthy: z.number().int().nonnegative(),
  needsAttention: z.number().int().nonnegative(),
  running: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});

export const JobFinderDashboardSummarySchema = z.object({
  generatedAt: IsoDateTimeSchema,
  activeCampaignId: NonEmptyStringSchema,
  activeCampaignCount: z.number().int().nonnegative(),
  jobsFoundToday: z.number().int().nonnegative(),
  jobsAwaitingReview: z.number().int().nonnegative(),
  applicationsReadyForApproval: z.number().int().nonnegative(),
  applicationsAppliedToday: z.number().int().nonnegative(),
  applicationsAppliedThisWeek: z.number().int().nonnegative(),
  needsYouCount: z.number().int().nonnegative(),
  upcomingInterviews: z.number().int().nonnegative(),
  upcomingFollowUps: z.number().int().nonnegative(),
  responseRate: JobFinderDashboardRateSchema.nullable(),
  interviewRate: JobFinderDashboardRateSchema.nullable(),
  sourceHealth: JobFinderDashboardSourceHealthSchema,
  backgroundOperationCount: z.number().int().nonnegative(),
  recommendedNextAction: z.object({
    label: NonEmptyStringSchema,
    detail: NonEmptyStringSchema,
    route: NonEmptyStringSchema,
  }),
});
export type JobFinderDashboardSummary = z.infer<
  typeof JobFinderDashboardSummarySchema
>;

export function getDefaultCampaignConfiguration(mode: JobSearchCampaignMode) {
  return mode === "precision"
    ? {
        limits: {
          retainedJobTarget: 15,
          analysisConcurrency: 2,
          preparationBatchSize: 5,
          dailyPreparationLimit: 20,
        },
        stopRules: {
          pauseOnLoginRequired: false,
          pauseOnChangedForm: true,
          pauseOnUncertainEligibility: true,
          pauseOnFailureRatePercent: 30,
          failureRateMinimumSample: 5,
        },
        applicationPolicy: {
          resumeStrategy: "job_specific" as const,
          requireReviewBeforePreparation: true,
          requireReviewBeforeExternalWrite: true as const,
          finalSubmitAuthorized: false as const,
          qualityReviewSampleRatio: 0.2,
          simultaneousApplicationWindowDays: 1,
        },
      }
    : {
        limits: {
          retainedJobTarget: 1_000,
          analysisConcurrency: 6,
          preparationBatchSize: 25,
          dailyPreparationLimit: 100,
        },
        stopRules: {
          pauseOnLoginRequired: false,
          pauseOnChangedForm: true,
          pauseOnUncertainEligibility: true,
          pauseOnFailureRatePercent: 20,
          failureRateMinimumSample: 10,
        },
        applicationPolicy: {
          resumeStrategy: "job_family_variants" as const,
          requireReviewBeforePreparation: false,
          requireReviewBeforeExternalWrite: true as const,
          finalSubmitAuthorized: false as const,
          qualityReviewSampleRatio: 0.2,
          simultaneousApplicationWindowDays: 1,
        },
      };
}
