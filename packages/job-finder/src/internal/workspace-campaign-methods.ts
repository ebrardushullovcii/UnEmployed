import { randomUUID } from "node:crypto";

import {
  CampaignRuleFunnelProjectionSchema,
  CampaignRuleSchema,
  DeleteCampaignRuleInputSchema,
  JobSearchCampaignCollectionSchema,
  JobSearchCampaignSchema,
  MarkAllCampaignNotificationsReadInputSchema,
  MarkCampaignNotificationReadInputSchema,
  ProjectCampaignRuleFunnelInputSchema,
  RunCampaignNowInputSchema,
  SaveCampaignRuleRouteInputSchema,
  SaveJobSearchCampaignInputSchema,
  ToggleCampaignRuleInputSchema,
  type CampaignRule,
  type CampaignRuleEffect,
  type CampaignRuleFunnelProjection,
  type DeleteCampaignRuleInput,
  type DiscoveryRunRecord,
  type JobFinderWorkspaceSnapshot,
  type JobSearchCampaign,
  type JobSearchCampaignCollection,
  type MarkAllCampaignNotificationsReadInput,
  type MarkCampaignNotificationReadInput,
  type ProjectCampaignRuleFunnelInput,
  type RunCampaignNowInput,
  type SaveCampaignRuleRouteInput,
  type SaveJobSearchCampaignInput,
  type ToggleCampaignRuleInput,
} from "@unemployed/contracts";

import { createCampaign, ensureCampaignState } from "./campaign-dashboard";
import {
  estimateCampaignFunnel,
  evaluateCampaignRules,
} from "./campaign-rule-evaluator";
import {
  classifyCampaignRunOutcome,
  computeNextScheduledRunAt,
  isCampaignPauseWindowActive,
  updateCampaignRunFacts,
} from "./campaign-schedule";
import {
  buildCampaignDigest,
  deriveCampaignNotifications,
  markAllCampaignNotificationsRead,
  markCampaignNotificationRead,
  mergeCampaignNotifications,
} from "./campaign-digest-notifications";
import type { WorkspaceServiceContext } from "./workspace-service-context";
import type { CampaignRunContext } from "./workspace-service-contracts";

const ACTIVITY_PAUSED_MESSAGE =
  "Browser and application activity is paused. Resume it from the Job Finder command center before starting new work.";

function describeCampaignRunSummary(run: DiscoveryRunRecord): string {
  return `Discovery ${run.state}: ${run.summary.validJobsFound} jobs found.`;
}

/**
 * True when a rule effect carries no measured history at all. Mutations that
 * round-trip a rule without its effect must not wipe previously measured
 * remove/downgrade counts.
 */
function isDefaultCampaignRuleEffect(effect: CampaignRuleEffect): boolean {
  return (
    effect.sampleSize === 0 &&
    effect.removedCount === 0 &&
    effect.downgradedCount === 0 &&
    effect.unknownCount === 0 &&
    effect.measuredAt === null
  );
}

/**
 * Persists one atomic campaign-state change for a rule mutation, appending a
 * typed history entry and bumping `updatedAt`. Runs inside the campaign
 * transition so it never interleaves with a scheduled-run commit.
 */
async function persistCampaignRuleChange(input: {
  ctx: WorkspaceServiceContext;
  state: JobSearchCampaignCollection;
  campaign: JobSearchCampaign;
  rules: readonly CampaignRule[];
  now: string;
  summary: string;
}): Promise<void> {
  const nextCampaign = JobSearchCampaignSchema.parse({
    ...input.campaign,
    rules: input.rules,
    updatedAt: input.now,
    history: [
      {
        id: `campaign_history_${randomUUID()}`,
        campaignId: input.campaign.id,
        kind: "updated",
        occurredAt: input.now,
        summary: input.summary,
        discoveryRunId: null,
      },
      ...input.campaign.history,
    ].slice(0, 100),
  });
  await input.ctx.repository.saveCampaignState(
    JobSearchCampaignCollectionSchema.parse({
      ...input.state,
      campaigns: input.state.campaigns.map((candidate) =>
        candidate.id === input.campaign.id ? nextCampaign : candidate,
      ),
    }),
  );
}

/**
 * Atomically commits the terminal discovery run for a campaign: campaign
 * history, progress, rules, and retained job ids plus the schedule run facts,
 * the latest digest, and merged strong-match/blocked notifications. All writes
 * happen in one serialized campaign-state save so concurrent scheduled runs
 * never interleave mid-commit.
 */
export async function commitCampaignRunTerminal(input: {
  ctx: WorkspaceServiceContext;
  campaignId: string;
  beforeJobProvenanceFingerprints: ReadonlyMap<string, string>;
  now: string;
}): Promise<void> {
  await input.ctx.withCampaignTransition(async () => {
    const [state, savedJobs, discovery] = await Promise.all([
      input.ctx.repository.getCampaignState(),
      input.ctx.repository.listSavedJobs(),
      input.ctx.repository.getDiscoveryState(),
    ]);
    if (!state) return;
    const latestRun =
      discovery.recentRuns.find((run) => run.campaignId === input.campaignId) ??
      (discovery.activeRun?.campaignId === input.campaignId
        ? discovery.activeRun
        : null);
    if (!latestRun) return;
    const campaign = state.campaigns.find(
      (candidate) => candidate.id === input.campaignId,
    );
    if (!campaign) return;

    const outcome = classifyCampaignRunOutcome({
      state: latestRun.state,
      targetExecutions: latestRun.targetExecutions,
    });
    // Never commit a run that is not terminal yet.
    if (outcome === null) return;

    const candidateJobIds = new Set([
      ...campaign.jobIds,
      ...savedJobs
        .filter(
          (job) =>
            input.beforeJobProvenanceFingerprints.get(job.id) !==
            JSON.stringify(job.provenance),
        )
        .map((job) => job.id),
    ]);
    const candidateJobs = savedJobs.filter((job) =>
      candidateJobIds.has(job.id),
    );
    const measuredAt = latestRun.completedAt ?? latestRun.startedAt;
    const evaluatedRules = evaluateCampaignRules({
      rules: campaign.rules,
      jobs: candidateJobs,
      measuredAt,
    });
    const funnel = estimateCampaignFunnel({
      rules: campaign.rules,
      jobs: candidateJobs,
      measuredAt,
    });
    const allowedByRules = new Set(funnel.rankedJobIds);
    const retainedJobIds = candidateJobs
      .filter(
        (job) =>
          allowedByRules.has(job.id) &&
          (campaign.minimumFitScore === null ||
            job.matchAssessment.score >= campaign.minimumFitScore),
      )
      .sort((left, right) =>
        right.matchAssessment.score === left.matchAssessment.score
          ? left.id.localeCompare(right.id)
          : right.matchAssessment.score - left.matchAssessment.score,
      )
      .slice(0, campaign.limits.retainedJobTarget)
      .map((job) => job.id);

    const runSummary = describeCampaignRunSummary(latestRun);
    const runFacts = updateCampaignRunFacts({
      schedule: campaign.schedule,
      outcome,
      completedAt: measuredAt,
      summary: runSummary,
    });

    const digest = buildCampaignDigest({
      campaignId: campaign.id,
      run: latestRun,
      generatedAt: measuredAt,
      jobIds: retainedJobIds,
    });

    const strongMatches = savedJobs
      .filter(
        (job) =>
          retainedJobIds.includes(job.id) &&
          !input.beforeJobProvenanceFingerprints.has(job.id),
      )
      .map((job) => ({
        jobId: job.id,
        title: job.title,
        company: job.company,
        fitScore: job.matchAssessment.score,
      }));
    const derivedNotifications = deriveCampaignNotifications({
      campaignId: campaign.id,
      now: measuredAt,
      strongMatches,
      minimumFitScore: campaign.minimumFitScore,
      blockedWork: [],
      failedWork: [],
      runFacts,
    });
    const notifications = mergeCampaignNotifications({
      existing: state.notifications,
      incoming: derivedNotifications,
    });

    const alreadyRecorded = campaign.history.some(
      (entry) => entry.discoveryRunId === latestRun.id,
    );
    const nextCampaign = JobSearchCampaignSchema.parse({
      ...campaign,
      jobIds: retainedJobIds,
      rules: campaign.rules.map((rule) => {
        const evaluated = evaluatedRules.find(
          (candidate) => candidate.rule.id === rule.id,
        );
        return evaluated ? { ...rule, effect: evaluated.effect } : rule;
      }),
      history: alreadyRecorded
        ? campaign.history
        : [
            {
              id: `campaign_history_discovery_${latestRun.id}`,
              campaignId: campaign.id,
              kind: "discovery_run" as const,
              occurredAt: measuredAt,
              summary: runSummary,
              discoveryRunId: latestRun.id,
            },
            ...campaign.history,
          ].slice(0, 100),
      schedule: { ...campaign.schedule, runFacts },
      latestDigest: digest ?? campaign.latestDigest,
      progress: {
        ...campaign.progress,
        lastRunAt: measuredAt,
        lastUpdatedAt: input.now,
      },
      updatedAt: input.now,
    });
    await input.ctx.repository.saveCampaignState(
      JobSearchCampaignCollectionSchema.parse({
        notifications,
        activeCampaignId: state.activeCampaignId,
        campaigns: state.campaigns.map((candidate) =>
          candidate.id === campaign.id ? nextCampaign : candidate,
        ),
      }),
    );
  });
}

/**
 * Legacy entry point used by the active-campaign manual discovery path. It now
 * shares the full atomic terminal commit (history/progress/rules/jobIds plus
 * run facts, digest, and notifications) so every finished discovery run keeps
 * the campaign ledger truthful.
 */
export async function recordCampaignDiscoveryResult(input: {
  ctx: WorkspaceServiceContext;
  campaignId: string;
  beforeJobProvenanceFingerprints: ReadonlyMap<string, string>;
}): Promise<void> {
  await commitCampaignRunTerminal({
    ctx: input.ctx,
    campaignId: input.campaignId,
    beforeJobProvenanceFingerprints: input.beforeJobProvenanceFingerprints,
    now: new Date().toISOString(),
  });
}

/**
 * Initializes a missing `runFacts.nextRunAt` truthfully (strictly after `now`)
 * without scheduling any immediate work. Returns `null` when the schedule
 * cannot produce a due time or already has one.
 */
function initializeNextRunAt(input: {
  campaign: JobSearchCampaign;
  now: string;
}): JobSearchCampaign | null {
  const schedule = input.campaign.schedule;
  if (!schedule.enabled || schedule.mode === "manual") return null;
  if (schedule.runFacts.nextRunAt !== null) return null;
  const nextRunAt = computeNextScheduledRunAt({
    schedule,
    now: input.now,
  });
  if (nextRunAt === null) return null;
  return JobSearchCampaignSchema.parse({
    ...input.campaign,
    schedule: {
      ...schedule,
      runFacts: { ...schedule.runFacts, nextRunAt },
    },
  });
}

async function persistInitializedNextRun(input: {
  ctx: WorkspaceServiceContext;
  campaignId: string;
  initialized: JobSearchCampaign;
}): Promise<void> {
  await input.ctx.withCampaignTransition(async () => {
    const state = await input.ctx.repository.getCampaignState();
    if (!state) return;
    const current = state.campaigns.find(
      (candidate) => candidate.id === input.campaignId,
    );
    if (!current) return;
    // Another tick may have initialized the schedule already.
    if (current.schedule.runFacts.nextRunAt !== null) return;
    await input.ctx.repository.saveCampaignState(
      JobSearchCampaignCollectionSchema.parse({
        ...state,
        campaigns: state.campaigns.map((candidate) =>
          candidate.id === input.campaignId ? input.initialized : candidate,
        ),
      }),
    );
  });
}

function isDiscoveryInProgressError(error: unknown): boolean {
  return (
    error instanceof Error && error.message.includes("already in progress")
  );
}

/**
 * Executes one discovery cycle for a campaign and then atomically commits the
 * terminal run into the campaign. A discovery failure still commits the failed
 * terminal state so the schedule advances instead of hot-looping; a concurrent
 * discovery (already-in-progress) is surfaced to the caller without committing.
 */
async function executeCampaignRun(input: {
  ctx: WorkspaceServiceContext;
  campaign: JobSearchCampaign;
  runCampaignDiscovery: (
    campaign: CampaignRunContext,
  ) => Promise<JobFinderWorkspaceSnapshot>;
  now: string;
}): Promise<void> {
  const beforeSavedJobs = await input.ctx.repository.listSavedJobs();
  const beforeJobProvenanceFingerprints = new Map(
    beforeSavedJobs.map((job) => [job.id, JSON.stringify(job.provenance)]),
  );
  try {
    await input.runCampaignDiscovery({
      campaignId: input.campaign.id,
      searchPreferences: input.campaign.searchPreferences,
    });
  } catch (error) {
    if (!isDiscoveryInProgressError(error)) {
      await commitCampaignRunTerminal({
        ctx: input.ctx,
        campaignId: input.campaign.id,
        beforeJobProvenanceFingerprints,
        now: input.now,
      });
    }
    throw error;
  }
  await commitCampaignRunTerminal({
    ctx: input.ctx,
    campaignId: input.campaign.id,
    beforeJobProvenanceFingerprints,
    now: input.now,
  });
}

async function resolveCampaignForRun(input: {
  ctx: WorkspaceServiceContext;
  campaignId: string | null;
}): Promise<JobSearchCampaign> {
  let state = await input.ctx.repository.getCampaignState();
  if (!state) {
    state = await ensureCampaignState({
      repository: input.ctx.repository,
      searchPreferences: await input.ctx.repository.getSearchPreferences(),
    });
  }
  const campaign = state.campaigns.find(
    (candidate) =>
      candidate.id === (input.campaignId ?? state.activeCampaignId),
  );
  if (!campaign) {
    throw new Error("The requested job search campaign is unavailable.");
  }
  if (campaign.status !== "active") {
    throw new Error(
      `The campaign is ${campaign.status}. Set it to active before running it.`,
    );
  }
  return campaign;
}

export function createWorkspaceCampaignMethods(input: {
  ctx: WorkspaceServiceContext;
  getWorkspaceSnapshot: () => Promise<JobFinderWorkspaceSnapshot>;
  runCampaignDiscovery: (
    campaign: CampaignRunContext,
  ) => Promise<JobFinderWorkspaceSnapshot>;
  afterCampaignRun: (campaignId: string) => Promise<JobFinderWorkspaceSnapshot>;
}) {
  async function getState() {
    return ensureCampaignState({
      repository: input.ctx.repository,
      searchPreferences: await input.ctx.repository.getSearchPreferences(),
    });
  }

  return {
    async saveCampaign(
      rawCampaign: SaveJobSearchCampaignInput,
    ): Promise<JobFinderWorkspaceSnapshot> {
      const campaignInput = SaveJobSearchCampaignInputSchema.parse(rawCampaign);
      const state = await getState();
      const now = new Date().toISOString();
      const existing = campaignInput.id
        ? state.campaigns.find((campaign) => campaign.id === campaignInput.id)
        : null;
      const normalizedSourceTargetIds =
        campaignInput.searchPreferences.discovery.targets
          .filter((target) => target.enabled)
          .map((target) => target.id);
      if (campaignInput.id && !existing) {
        throw new Error("The requested job search campaign no longer exists.");
      }
      if (!existing && !["active", "paused"].includes(campaignInput.status)) {
        throw new Error("New campaigns must start active or paused.");
      }
      if (
        existing?.id === state.activeCampaignId &&
        campaignInput.status === "archived"
      ) {
        throw new Error(
          "Select another campaign before archiving the active campaign.",
        );
      }

      const newCampaignId = `campaign_${randomUUID()}`;
      const campaign = existing
        ? {
            ...existing,
            ...campaignInput,
            sourceTargetIds: normalizedSourceTargetIds,
            id: existing.id,
            createdAt: existing.createdAt,
            updatedAt: now,
            progress: existing.progress,
            history: [
              {
                id: `campaign_history_${randomUUID()}`,
                campaignId: existing.id,
                kind:
                  existing.status !== campaignInput.status
                    ? campaignInput.status === "paused"
                      ? ("paused" as const)
                      : campaignInput.status === "completed"
                        ? ("completed" as const)
                        : campaignInput.status === "active"
                          ? ("resumed" as const)
                          : ("updated" as const)
                    : ("updated" as const),
                occurredAt: now,
                summary: `${campaignInput.name} updated.`,
                discoveryRunId: null,
              },
              ...existing.history,
            ].slice(0, 100),
          }
        : {
            ...createCampaign({
              id: newCampaignId,
              name: campaignInput.name,
              description: campaignInput.description,
              mode: campaignInput.mode,
              searchPreferences: campaignInput.searchPreferences,
              now,
            }),
            ...campaignInput,
            sourceTargetIds: normalizedSourceTargetIds,
            id: newCampaignId,
            createdAt: now,
            updatedAt: now,
            jobIds: [],
            progress: { lastUpdatedAt: now },
          };
      const nextState = JobSearchCampaignCollectionSchema.parse({
        notifications: state.notifications,
        activeCampaignId: existing ? state.activeCampaignId : campaign.id,
        campaigns: existing
          ? state.campaigns.map((candidate) =>
              candidate.id === campaign.id ? campaign : candidate,
            )
          : [...state.campaigns, campaign],
      });
      await input.ctx.repository.saveCampaignState(nextState);
      if (nextState.activeCampaignId === campaign.id) {
        await input.ctx.repository.saveSearchPreferences(
          campaign.searchPreferences,
        );
      }
      return input.getWorkspaceSnapshot();
    },

    async selectCampaign(
      campaignId: string,
    ): Promise<JobFinderWorkspaceSnapshot> {
      const state = await getState();
      const selected = state.campaigns.find(
        (campaign) => campaign.id === campaignId,
      );
      if (!selected || selected.status === "archived") {
        throw new Error("The selected campaign is unavailable.");
      }
      const now = new Date().toISOString();
      const nextState = JobSearchCampaignCollectionSchema.parse({
        notifications: state.notifications,
        activeCampaignId: selected.id,
        campaigns: state.campaigns.map((campaign) =>
          campaign.id === selected.id
            ? {
                ...campaign,
                updatedAt: now,
                history: [
                  {
                    id: `campaign_history_${randomUUID()}`,
                    campaignId: campaign.id,
                    kind: "activated",
                    occurredAt: now,
                    summary: `${campaign.name} selected as the active campaign.`,
                    discoveryRunId: null,
                  },
                  ...campaign.history,
                ].slice(0, 100),
              }
            : campaign,
        ),
      });
      await input.ctx.repository.saveCampaignState(nextState);
      await input.ctx.repository.saveSearchPreferences(
        selected.searchPreferences,
      );
      return input.getWorkspaceSnapshot();
    },

    /**
     * Manual campaign run. Works regardless of the schedule's `enabled` flag
     * or pause windows, but still obeys the global activity pause and the
     * campaign's own status.
     */
    async runCampaignNow(
      rawInput?: RunCampaignNowInput,
    ): Promise<JobFinderWorkspaceSnapshot> {
      const request = RunCampaignNowInputSchema.parse(rawInput ?? {});
      if ((await input.ctx.repository.getActivityControl()).paused) {
        throw new Error(ACTIVITY_PAUSED_MESSAGE);
      }
      const campaign = await resolveCampaignForRun({
        ctx: input.ctx,
        campaignId: request.campaignId ?? null,
      });
      await executeCampaignRun({
        ctx: input.ctx,
        campaign,
        runCampaignDiscovery: input.runCampaignDiscovery,
        now: new Date().toISOString(),
      });
      return input.afterCampaignRun(campaign.id);
    },

    /**
     * Scheduled campaign ticker. For every active campaign with an enabled,
     * non-manual schedule it runs once when the persisted `nextRunAt` is due
     * (`<= now`, including overdue catch-up). A missing `nextRunAt` is
     * initialized truthfully without immediate work. Pause windows and the
     * global activity pause suppress runs; a concurrent discovery run is
     * skipped and retried on the next tick.
     */
    async runDueScheduledCampaigns(
      rawNow?: string,
    ): Promise<JobFinderWorkspaceSnapshot> {
      const candidateNow = rawNow ?? new Date().toISOString();
      const now = Number.isFinite(Date.parse(candidateNow))
        ? candidateNow
        : new Date().toISOString();
      if ((await input.ctx.repository.getActivityControl()).paused) {
        return input.getWorkspaceSnapshot();
      }

      const state = await input.ctx.repository.getCampaignState();
      if (!state) return input.getWorkspaceSnapshot();

      for (const campaign of state.campaigns) {
        if (campaign.status !== "active") continue;
        const schedule = campaign.schedule;
        if (!schedule.enabled || schedule.mode === "manual") continue;

        if (schedule.runFacts.nextRunAt === null) {
          const initialized = initializeNextRunAt({ campaign, now });
          if (initialized) {
            await persistInitializedNextRun({
              ctx: input.ctx,
              campaignId: campaign.id,
              initialized,
            });
          }
          continue;
        }

        const nextRunAtMs = Date.parse(schedule.runFacts.nextRunAt);
        if (!Number.isFinite(nextRunAtMs) || nextRunAtMs > Date.parse(now)) {
          continue;
        }
        if (
          isCampaignPauseWindowActive({
            windows: schedule.pauseWindows,
            at: now,
          })
        ) {
          // Leave the run due so it executes once when the window ends.
          continue;
        }

        await executeCampaignRun({
          ctx: input.ctx,
          campaign,
          runCampaignDiscovery: input.runCampaignDiscovery,
          now,
        }).catch((error: unknown) => {
          if (isDiscoveryInProgressError(error)) {
            // A manual or scheduled discovery owns the pipeline; retry next tick.
            return;
          }
          // The failed terminal state was already committed by
          // executeCampaignRun, so the schedule advances; swallow so one
          // campaign never blocks the rest of the ticker.
        });
      }

      return input.getWorkspaceSnapshot();
    },

    /**
     * Marks a single in-app campaign notification read. Unknown ids and
     * invalid read timestamps are a no-op; the flip is serialized through the
     * campaign transition so it never interleaves with a scheduled-run commit.
     */
    async markCampaignNotificationRead(
      rawInput: MarkCampaignNotificationReadInput,
    ): Promise<JobFinderWorkspaceSnapshot> {
      const request = MarkCampaignNotificationReadInputSchema.parse(rawInput);
      await input.ctx.withCampaignTransition(async () => {
        const state = await input.ctx.repository.getCampaignState();
        if (!state) return;
        const notifications = markCampaignNotificationRead({
          notifications: state.notifications,
          notificationId: request.notificationId,
          readAt: request.readAt,
        });
        await input.ctx.repository.saveCampaignState(
          JobSearchCampaignCollectionSchema.parse({
            ...state,
            notifications,
          }),
        );
      });
      return input.getWorkspaceSnapshot();
    },

    /**
     * Marks every unread in-app campaign notification read. Already-read
     * notifications keep their original read timestamps; the flip is
     * serialized through the campaign transition so it never interleaves with
     * a scheduled-run commit. An invalid read timestamp is a no-op.
     */
    async markAllCampaignNotificationsRead(
      rawInput: MarkAllCampaignNotificationsReadInput,
    ): Promise<JobFinderWorkspaceSnapshot> {
      const request =
        MarkAllCampaignNotificationsReadInputSchema.parse(rawInput);
      await input.ctx.withCampaignTransition(async () => {
        const state = await input.ctx.repository.getCampaignState();
        if (!state) return;
        const notifications = markAllCampaignNotificationsRead({
          notifications: state.notifications,
          readAt: request.readAt,
        });
        await input.ctx.repository.saveCampaignState(
          JobSearchCampaignCollectionSchema.parse({
            ...state,
            notifications,
          }),
        );
      });
      return input.getWorkspaceSnapshot();
    },

    /**
     * Creates or updates one campaign rule. A new rule starts with an
     * unmeasured (zeroed) effect; an update preserves previously measured
     * remove/downgrade counts unless the caller explicitly replaces them.
     */
    async saveCampaignRule(
      rawInput: SaveCampaignRuleRouteInput,
    ): Promise<JobFinderWorkspaceSnapshot> {
      const request = SaveCampaignRuleRouteInputSchema.parse(rawInput);
      const now = new Date().toISOString();
      await input.ctx.withCampaignTransition(async () => {
        const state = await input.ctx.repository.getCampaignState();
        if (!state) {
          throw new Error("The job search campaign workspace is unavailable.");
        }
        const campaign = state.campaigns.find(
          (candidate) => candidate.id === request.campaignId,
        );
        if (!campaign) {
          throw new Error(
            "The requested job search campaign no longer exists.",
          );
        }
        const existing = request.rule.id
          ? campaign.rules.find((rule) => rule.id === request.rule.id)
          : null;
        if (request.rule.id && !existing) {
          throw new Error("The campaign rule no longer exists.");
        }
        const rules = existing
          ? campaign.rules.map((rule) =>
              rule.id === existing.id
                ? CampaignRuleSchema.parse({
                    ...rule,
                    ...request.rule,
                    id: existing.id,
                    effect: isDefaultCampaignRuleEffect(request.rule.effect)
                      ? rule.effect
                      : request.rule.effect,
                  })
                : rule,
            )
          : [
              ...campaign.rules,
              CampaignRuleSchema.parse({
                ...request.rule,
                id: `campaign_rule_${randomUUID()}`,
                effect: {},
              }),
            ];
        if (rules.length > 200) {
          throw new Error("A campaign can hold at most 200 rules.");
        }
        await persistCampaignRuleChange({
          ctx: input.ctx,
          state,
          campaign,
          rules,
          now,
          summary: existing ? "Campaign rule updated." : "Campaign rule added.",
        });
      });
      return input.getWorkspaceSnapshot();
    },

    /**
     * Removes one campaign rule by id. Unknown rules and campaigns are
     * surfaced as errors instead of silently mutating state.
     */
    async deleteCampaignRule(
      rawInput: DeleteCampaignRuleInput,
    ): Promise<JobFinderWorkspaceSnapshot> {
      const request = DeleteCampaignRuleInputSchema.parse(rawInput);
      const now = new Date().toISOString();
      await input.ctx.withCampaignTransition(async () => {
        const state = await input.ctx.repository.getCampaignState();
        if (!state) {
          throw new Error("The job search campaign workspace is unavailable.");
        }
        const campaign = state.campaigns.find(
          (candidate) => candidate.id === request.campaignId,
        );
        if (!campaign) {
          throw new Error(
            "The requested job search campaign no longer exists.",
          );
        }
        if (!campaign.rules.some((rule) => rule.id === request.ruleId)) {
          throw new Error("The campaign rule no longer exists.");
        }
        await persistCampaignRuleChange({
          ctx: input.ctx,
          state,
          campaign,
          rules: campaign.rules.filter((rule) => rule.id !== request.ruleId),
          now,
          summary: "Campaign rule removed.",
        });
      });
      return input.getWorkspaceSnapshot();
    },

    /**
     * Toggles one campaign rule's enabled/disabled state. Disabled rules are
     * preserved with their history but are never evaluated by discovery or by
     * the funnel projection.
     */
    async toggleCampaignRule(
      rawInput: ToggleCampaignRuleInput,
    ): Promise<JobFinderWorkspaceSnapshot> {
      const request = ToggleCampaignRuleInputSchema.parse(rawInput);
      const now = new Date().toISOString();
      await input.ctx.withCampaignTransition(async () => {
        const state = await input.ctx.repository.getCampaignState();
        if (!state) {
          throw new Error("The job search campaign workspace is unavailable.");
        }
        const campaign = state.campaigns.find(
          (candidate) => candidate.id === request.campaignId,
        );
        if (!campaign) {
          throw new Error(
            "The requested job search campaign no longer exists.",
          );
        }
        if (!campaign.rules.some((rule) => rule.id === request.ruleId)) {
          throw new Error("The campaign rule no longer exists.");
        }
        await persistCampaignRuleChange({
          ctx: input.ctx,
          state,
          campaign,
          rules: campaign.rules.map((rule) =>
            rule.id === request.ruleId
              ? CampaignRuleSchema.parse({ ...rule, enabled: request.enabled })
              : rule,
          ),
          now,
          summary: request.enabled
            ? "Campaign rule enabled."
            : "Campaign rule disabled.",
        });
      });
      return input.getWorkspaceSnapshot();
    },

    /**
     * Read-only projection of how the campaign's rules treat its currently
     * retained jobs. Uses `evaluateCampaignRules`/`estimateCampaignFunnel`
     * ONLY against real persisted jobs referenced by the campaign; when the
     * campaign retains no jobs the funnel is zeroed instead of fabricated.
     */
    async projectCampaignRuleFunnel(
      rawInput: ProjectCampaignRuleFunnelInput,
    ): Promise<CampaignRuleFunnelProjection> {
      const request = ProjectCampaignRuleFunnelInputSchema.parse(rawInput);
      const [state, savedJobs] = await Promise.all([
        input.ctx.repository.getCampaignState(),
        input.ctx.repository.listSavedJobs(),
      ]);
      const campaign = state?.campaigns.find(
        (candidate) => candidate.id === request.campaignId,
      );
      if (!campaign) {
        throw new Error("The requested job search campaign no longer exists.");
      }
      const campaignJobIds = new Set(campaign.jobIds);
      const sample = savedJobs.filter((job) => campaignJobIds.has(job.id));
      const measuredAt = new Date().toISOString();
      const evaluatedRules = evaluateCampaignRules({
        rules: campaign.rules,
        jobs: sample,
        measuredAt,
      });
      const funnel = estimateCampaignFunnel({
        rules: campaign.rules,
        jobs: sample,
        measuredAt,
      });
      return CampaignRuleFunnelProjectionSchema.parse({
        campaignId: campaign.id,
        generatedAt: measuredAt,
        rules: evaluatedRules.map((entry) => ({
          ...entry.rule,
          effect: entry.effect,
        })),
        disabledRuleIds: campaign.rules
          .filter((rule) => !rule.enabled)
          .map((rule) => rule.id),
        funnel,
      });
    },
  };
}
