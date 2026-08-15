import {
  JobFinderDashboardSummarySchema,
  JobSearchCampaignCollectionSchema,
  JobSearchCampaignSchema,
  getDefaultCampaignConfiguration,
  type ApplyRun,
  type ApplicationRecord,
  type JobFinderDashboardSummary,
  type JobFinderDiscoveryState,
  type JobSearchCampaign,
  type JobSearchCampaignCollection,
  type JobSearchCampaignMode,
  type JobSearchPreferences,
  type ReviewQueueItem,
  type SavedJob,
  type UserActionRequest,
} from "@unemployed/contracts";
import type { JobFinderRepository } from "@unemployed/db";
import {
  getApplicationCrmData,
  projectApplicationCrmDashboard,
} from "./application-crm";

const FINAL_ACTION_STATES = new Set([
  "resolved",
  "skipped",
  "cancelled",
  "expired",
  "superseded",
]);
function startOfLocalDay(value: Date): number {
  return new Date(
    value.getFullYear(),
    value.getMonth(),
    value.getDate(),
  ).getTime();
}

function isAtOrAfter(value: string, threshold: number): boolean {
  return Date.parse(value) >= threshold;
}

function createDefaultCampaign(
  searchPreferences: JobSearchPreferences,
  now: string,
  jobIds: readonly string[],
  legacyRuns: JobFinderDiscoveryState["recentRuns"],
): JobSearchCampaign {
  const id = "campaign_default";
  return JobSearchCampaignSchema.parse({
    id,
    name: "My job search",
    description: "Your existing Job Finder workspace.",
    mode: "precision",
    status: "active",
    createdAt: now,
    updatedAt: now,
    searchPreferences,
    sourceTargetIds: searchPreferences.discovery.targets
      .filter((target) => target.enabled)
      .map((target) => target.id),
    jobIds,
    minimumFitScore: null,
    ...getDefaultCampaignConfiguration("precision"),
    schedule: {},
    progress: { lastUpdatedAt: now },
    history: [
      ...legacyRuns.map((run) => ({
        id: `campaign_history_discovery_${run.id}`,
        campaignId: id,
        kind: "discovery_run" as const,
        occurredAt: run.completedAt ?? run.startedAt,
        summary: `Imported discovery run ${run.id}.`,
        discoveryRunId: run.id,
      })),
      {
        id: "campaign_history_default_created",
        campaignId: id,
        kind: "created",
        occurredAt: now,
        summary: "Existing workspace moved into the default campaign.",
        discoveryRunId: null,
      },
    ],
  });
}

export async function ensureCampaignState(input: {
  repository: JobFinderRepository;
  searchPreferences: JobSearchPreferences;
  now?: string;
}): Promise<JobSearchCampaignCollection> {
  const existing = await input.repository.getCampaignState();
  if (existing) return existing;

  const campaign = createDefaultCampaign(
    input.searchPreferences,
    input.now ?? new Date().toISOString(),
    (await input.repository.listSavedJobs()).map((job) => job.id),
    (await input.repository.getDiscoveryState()).recentRuns,
  );
  const created = JobSearchCampaignCollectionSchema.parse({
    activeCampaignId: campaign.id,
    campaigns: [campaign],
  });
  await input.repository.saveCampaignState(created);
  return created;
}

export function createCampaign(input: {
  id: string;
  name: string;
  description?: string;
  mode: JobSearchCampaignMode;
  searchPreferences: JobSearchPreferences;
  now: string;
}): JobSearchCampaign {
  return JobSearchCampaignSchema.parse({
    id: input.id,
    name: input.name,
    description: input.description ?? "",
    mode: input.mode,
    status: "active",
    createdAt: input.now,
    updatedAt: input.now,
    searchPreferences: input.searchPreferences,
    sourceTargetIds: input.searchPreferences.discovery.targets
      .filter((target) => target.enabled)
      .map((target) => target.id),
    jobIds: [],
    minimumFitScore: null,
    ...getDefaultCampaignConfiguration(input.mode),
    schedule: {},
    progress: { lastUpdatedAt: input.now },
    history: [
      {
        id: `${input.id}_created`,
        campaignId: input.id,
        kind: "created",
        occurredAt: input.now,
        summary: `${input.name} created in ${input.mode} mode.`,
        discoveryRunId: null,
      },
    ],
  });
}

export function assertCampaignCanRun(campaign: JobSearchCampaign): void {
  if (campaign.status !== "active") {
    throw new Error(
      `The active campaign is ${campaign.status}. Set it to active before starting discovery.`,
    );
  }
}

export function deriveCampaignProgress(input: {
  campaign: JobSearchCampaign;
  savedJobs: readonly SavedJob[];
  reviewQueue: readonly ReviewQueueItem[];
  applicationRecords: readonly ApplicationRecord[];
  applyRuns: readonly ApplyRun[];
  unresolvedActions: number;
  lastRunAt: string | null;
  now: string;
}): JobSearchCampaign["progress"] {
  const activeApplyRun = input.applyRuns.find((run) => run.state === "running");
  return {
    jobsFound: input.savedJobs.length,
    jobsRetained: input.reviewQueue.length,
    applicationsPrepared: input.applicationRecords.filter((record) =>
      [
        "preparing",
        "ready_for_approval",
        "applied",
        "employer_viewed",
        "recruiter_contact",
        "assessment",
        "interview",
        "offer",
        "rejected",
        "withdrawn",
        "no_response",
      ].includes(getApplicationCrmData(record).stage),
    ).length,
    applicationsApplied: input.applicationRecords.filter(
      (record) => getApplicationCrmData(record).appliedAt !== null,
    ).length,
    currentBatchCompleted: activeApplyRun
      ? Math.max(0, activeApplyRun.totalJobs - activeApplyRun.pendingJobs)
      : 0,
    currentBatchTotal: activeApplyRun?.totalJobs ?? 0,
    blockedCount: input.unresolvedActions,
    remainingQueueSize: input.applyRuns.reduce(
      (total, run) => total + run.pendingJobs,
      0,
    ),
    lastRunAt: input.lastRunAt,
    lastUpdatedAt: input.now,
  };
}

export function deriveDashboardSummary(input: {
  generatedAt: string;
  campaigns: JobSearchCampaignCollection;
  savedJobs: readonly SavedJob[];
  reviewQueue: readonly ReviewQueueItem[];
  applicationRecords: readonly ApplicationRecord[];
  applyRuns: readonly ApplyRun[];
  userActionRequests: readonly UserActionRequest[];
  discovery: JobFinderDiscoveryState;
  searchPreferences: JobSearchPreferences;
}): JobFinderDashboardSummary {
  const now = new Date(input.generatedAt);
  const today = startOfLocalDay(now);
  const unresolvedActions = input.userActionRequests.filter(
    (request) => !FINAL_ACTION_STATES.has(request.state),
  ).length;
  const crm = projectApplicationCrmDashboard({
    records: input.applicationRecords,
    now: input.generatedAt,
  });
  const enabledTargets = input.searchPreferences.discovery.targets.filter(
    (target) => target.enabled,
  );
  const runningTargetIds = new Set(
    input.discovery.activeRun?.targetExecutions
      .filter((execution) => execution.state === "running")
      .map((execution) => execution.targetId) ?? [],
  );
  const sourceHealth = enabledTargets.reduce(
    (summary, target) => {
      if (runningTargetIds.has(target.id)) summary.running += 1;
      else if (target.staleReason || !target.lastVerifiedAt)
        summary.needsAttention += 1;
      else summary.healthy += 1;
      summary.total += 1;
      return summary;
    },
    { healthy: 0, needsAttention: 0, running: 0, total: 0 },
  );
  const jobsFoundToday = input.savedJobs.filter((job) =>
    job.provenance.some((entry) => isAtOrAfter(entry.discoveredAt, today)),
  ).length;
  const readyForApproval = input.applicationRecords.filter(
    (record) => getApplicationCrmData(record).stage === "ready_for_approval",
  ).length;
  const backgroundOperationCount =
    (input.discovery.runState === "running" ? 1 : 0) +
    input.applyRuns.filter((run) => run.state === "running").length +
    (input.discovery.activeSourceDebugRun?.state === "running" ? 1 : 0);

  const recommendedNextAction =
    unresolvedActions > 0
      ? {
          label: "Resolve what needs you",
          detail: `${unresolvedActions} item${unresolvedActions === 1 ? "" : "s"} cannot continue without you.`,
          route: "/job-finder/actions",
        }
      : readyForApproval > 0
        ? {
            label: "Review prepared applications",
            detail: `${readyForApproval} application${readyForApproval === 1 ? " is" : "s are"} ready for approval.`,
            route: "/job-finder/applications",
          }
        : input.reviewQueue.length > 0
          ? {
              label: "Review shortlisted jobs",
              detail: `${input.reviewQueue.length} shortlisted job${input.reviewQueue.length === 1 ? " is" : "s are"} waiting for your decision.`,
              route: "/job-finder/review-queue",
            }
          : {
              label: "Find jobs",
              detail: "Run the active campaign to collect relevant openings.",
              route: "/job-finder/discovery",
            };

  return JobFinderDashboardSummarySchema.parse({
    generatedAt: input.generatedAt,
    activeCampaignId: input.campaigns.activeCampaignId,
    activeCampaignCount: input.campaigns.campaigns.filter(
      (campaign) => campaign.status === "active",
    ).length,
    jobsFoundToday,
    jobsAwaitingReview: input.reviewQueue.length,
    applicationsReadyForApproval: readyForApproval,
    applicationsAppliedToday: crm.appliedToday,
    applicationsAppliedThisWeek: crm.appliedThisWeek,
    needsYouCount: unresolvedActions,
    upcomingInterviews: crm.upcomingInterviews.length,
    upcomingFollowUps: crm.pendingFollowUps.length,
    responseRate:
      crm.responseRate !== null
        ? {
            numerator: Math.round(
              (crm.responseRate / 100) * crm.rateDenominator,
            ),
            denominator: crm.rateDenominator,
            percent: crm.responseRate,
          }
        : null,
    interviewRate:
      crm.interviewRate !== null
        ? {
            numerator: Math.round(
              (crm.interviewRate / 100) * crm.rateDenominator,
            ),
            denominator: crm.rateDenominator,
            percent: crm.interviewRate,
          }
        : null,
    sourceHealth,
    backgroundOperationCount,
    recommendedNextAction,
  });
}
