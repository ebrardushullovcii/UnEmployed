import {
  type ApplicationCrmSettings,
  type JobDiscoveryTarget,
  ApplicationCrmSettingsSchema,
  CandidateProfileSchema,
  JobFinderDiscoveryStateSchema,
  JobFinderWorkspaceSnapshotSchema,
  JobSearchPreferencesSchema,
  ProfileSetupStateSchema,
  ResumeDocumentBundleSchema,
  ResumeSourceDocumentSchema,
  SourceDebugRunRecordSchema,
  type CandidateProfile,
  type JobFinderSettings,
  type JobFinderWorkspaceSnapshot,
  type JobSearchPreferences,
  type ProfileSetupState,
  type ResumeTimelineRepairAction,
} from "@unemployed/contracts";
import type { JobFinderRepositorySeed } from "@unemployed/db";

import { runApplicationNoResponseAutomation } from "./application-crm";
import {
  buildApplicationRecords,
  buildDiscoveryJobs,
  buildReviewQueue,
  compareDiscoveryJobs,
} from "./matching";
import { deriveAndPersistProfileSetupState } from "./profile-workspace-state";
import { resolvePendingReviewItemsAfterExplicitSave } from "./profile-setup-review-items";
import { normalizeProfileBeforeSave } from "./profile-merge";
import { runResumeImportWorkflow } from "./resume-import-workflow";
import { persistResumeTimelineRepairAction } from "./resume-timeline-repair";
import {
  hasResumeAffectingProfileChange,
  hasResumeAffectingSettingsChange,
} from "./resume-workspace-staleness";
import { selectLatestApplyRunId } from "./workspace-apply-run-support";
import { recoverInterruptedApplyRun } from "./workspace-apply-run-recovery";
import { persistAutomaticApplicationSafeguards } from "./automatic-safeguards";
import { recoverInterruptedDiscoveryRun } from "./workspace-discovery-run-helpers";
import {
  deriveSourceAccessPrompts,
  resolveSourceBrowserEntryUrl,
} from "./workspace-source-access-prompts";
import { createBrowserSessionSnapshot } from "./workspace-service-helpers";
import type { WorkspaceServiceContext } from "./workspace-service-context";
import {
  resolveAdapterKind,
  getPreferredSessionAdapter,
  invalidateChangedSourceGuidance,
  normalizeJobFinderSettings,
  normalizeResumeDraftTemplate,
  normalizeSearchPreferences,
} from "./workspace-helpers";
import { SOURCE_DEBUG_RECENT_HISTORY_LIMIT } from "./workspace-defaults";
import { createWorkspaceProfileCopilotMethods } from "./workspace-profile-copilot-methods";
import { createWorkspaceProfileSetupContextHelpers } from "./workspace-profile-setup-context";
import { createWorkspaceProfileSetupReviewMethods } from "./workspace-profile-setup-review-methods";
import type { JobFinderWorkspaceService } from "./workspace-service-contracts";
import {
  deriveCampaignProgress,
  deriveDashboardSummary,
  createCampaign,
  ensureCampaignState,
} from "./campaign-dashboard";

const BOOTSTRAP_DEFERRED_COLLECTIONS = [
  "discovery_jobs",
  "review_queue",
  "applications",
  "source_history",
  "documents",
  "intelligence",
] as const;

const NO_RESPONSE_AUTOMATION_MIN_INTERVAL_MS = 5 * 60 * 1000;

export function createWorkspaceSnapshotProfileMethods(
  ctx: WorkspaceServiceContext,
): Pick<
  JobFinderWorkspaceService,
  | "getWorkspaceSnapshot"
  | "getWorkspaceBootstrap"
  | "getResumeImportState"
  | "resetWorkspace"
  | "openBrowserSession"
  | "checkBrowserSession"
  | "saveProfile"
  | "saveProfileAndSearchPreferences"
  | "runResumeImport"
  | "analyzeProfileFromResume"
  | "saveSearchPreferences"
  | "saveProfileSetupState"
  | "applyProfileSetupReviewAction"
  | "applyResumeTimelineRepairAction"
  | "sendProfileCopilotMessage"
  | "proposeProfileCopilotChange"
  | "applyProfileCopilotPatchGroup"
  | "rejectProfileCopilotPatchGroup"
  | "undoProfileRevision"
  | "saveSettings"
> {
  const { buildBundleFromStoredResume, getCurrentSetupStateContext } =
    createWorkspaceProfileSetupContextHelpers(ctx);

  let interruptedDiscoveryRecoveryPromise: Promise<void> | null = null;
  let interruptedApplyRecoveryPromise: Promise<void> | null = null;
  let lastNoResponseAutomationRunAt: number | null = null;

  async function runNoResponseAutomationIfDue(options?: {
    settings?: ApplicationCrmSettings;
    force?: boolean;
  }): Promise<void> {
    const now = Date.now();
    if (
      !options?.force &&
      lastNoResponseAutomationRunAt !== null &&
      now - lastNoResponseAutomationRunAt <
        NO_RESPONSE_AUTOMATION_MIN_INTERVAL_MS
    ) {
      return;
    }

    const settings =
      options?.settings ??
      normalizeJobFinderSettings(
        await ctx.repository.getSettings(),
        ctx.documentManager.listResumeTemplates(),
      ).applicationCrm ??
      ApplicationCrmSettingsSchema.parse({});
    try {
      await ctx.withApplicationCrmTransition(() =>
        runApplicationNoResponseAutomation({
          repository: ctx.repository,
          settings,
        }),
      );
    } catch (error) {
      console.warn(
        "[JobFinderWorkspace] No-response automation skipped.",
        error,
      );
    }
    lastNoResponseAutomationRunAt = now;
  }

  async function syncActiveCampaignPreferences(
    searchPreferences: JobSearchPreferences,
  ): Promise<void> {
    const campaignState = await ensureCampaignState({
      repository: ctx.repository,
      searchPreferences,
    });
    const now = new Date().toISOString();
    await ctx.repository.saveCampaignState({
      ...campaignState,
      campaigns: campaignState.campaigns.map((campaign) =>
        campaign.id === campaignState.activeCampaignId
          ? {
              ...campaign,
              searchPreferences,
              sourceTargetIds: searchPreferences.discovery.targets
                .filter((target) => target.enabled)
                .map((target) => target.id),
              updatedAt: now,
            }
          : campaign,
      ),
    });
  }

  async function recoverInterruptedApplyRunsOnLoad(): Promise<void> {
    if (
      ctx.activeApplyRunAbortControllers.size > 0 ||
      ctx.activeApplyRunPromises.size > 0
    ) {
      return;
    }

    if (interruptedApplyRecoveryPromise) {
      await interruptedApplyRecoveryPromise;
      return;
    }

    const recoveryPromise = (async () => {
      const runs = await ctx.repository.listApplyRuns();

      if (
        ctx.activeApplyRunAbortControllers.size > 0 ||
        ctx.activeApplyRunPromises.size > 0
      ) {
        return;
      }

      const interruptedRuns = runs.filter((run) => run.state === "running");
      if (interruptedRuns.length === 0) {
        return;
      }

      const completedAt = new Date().toISOString();
      await Promise.all(
        interruptedRuns.map(async (run) => {
          const recoveredRun = recoverInterruptedApplyRun(run, completedAt);
          await ctx.repository.upsertApplyRun(recoveredRun);
          await persistAutomaticApplicationSafeguards({
            ctx,
            run: recoveredRun,
            now: completedAt,
          }).catch((safeguardError: unknown) => {
            console.error(
              "Failed to persist automatic application safeguards.",
              safeguardError,
            );
          });
        }),
      );
    })();

    interruptedApplyRecoveryPromise = recoveryPromise;
    try {
      await recoveryPromise;
    } finally {
      if (interruptedApplyRecoveryPromise === recoveryPromise) {
        interruptedApplyRecoveryPromise = null;
      }
    }
  }

  async function recoverInterruptedDiscoveryStateOnLoad(): Promise<void> {
    if (
      ctx.activeDiscoveryAbortControllerRef.current ||
      ctx.activeDiscoveryPromiseRef.current
    ) {
      return;
    }

    if (interruptedDiscoveryRecoveryPromise) {
      await interruptedDiscoveryRecoveryPromise;
      return;
    }

    const recoveryPromise = (async () => {
      const [discoveryState, searchPreferences, campaignState] =
        await Promise.all([
          ctx.repository.getDiscoveryState(),
          ctx.repository.getSearchPreferences(),
          ctx.repository.getCampaignState(),
        ]);

      if (
        ctx.activeDiscoveryAbortControllerRef.current ||
        ctx.activeDiscoveryPromiseRef.current
      ) {
        return;
      }

      const activeRun = discoveryState.activeRun;
      if (discoveryState.runState !== "running" && !activeRun) {
        return;
      }

      const completedAt = new Date().toISOString();
      const recoveredRunBase =
        activeRun?.state === "running"
          ? recoverInterruptedDiscoveryRun(activeRun, completedAt)
          : activeRun;
      const recoveredRun = recoveredRunBase
        ? {
            ...recoveredRunBase,
            campaignId:
              recoveredRunBase.campaignId ??
              campaignState?.activeCampaignId ??
              null,
          }
        : null;
      const historyLimit =
        normalizeSearchPreferences(searchPreferences).discovery.historyLimit;

      await ctx.repository.saveDiscoveryState(
        JobFinderDiscoveryStateSchema.parse({
          ...discoveryState,
          runState: recoveredRun?.state ?? "failed",
          activeRun: null,
          recentRuns: recoveredRun
            ? [
                recoveredRun,
                ...discoveryState.recentRuns.filter(
                  (run) => run.id !== recoveredRun.id,
                ),
              ].slice(0, historyLimit)
            : discoveryState.recentRuns,
        }),
      );
    })();

    interruptedDiscoveryRecoveryPromise = recoveryPromise;
    try {
      await recoveryPromise;
    } finally {
      if (interruptedDiscoveryRecoveryPromise === recoveryPromise) {
        interruptedDiscoveryRecoveryPromise = null;
      }
    }
  }

  function resolveBrowserSessionTarget(input: {
    targets: readonly JobDiscoveryTarget[];
    targetId: string | null | undefined;
  }): JobDiscoveryTarget | null {
    if (!input.targetId) {
      return null;
    }

    const target =
      input.targets.find((candidate) => candidate.id === input.targetId) ??
      null;

    if (!target) {
      throw new Error("The requested job source is no longer available.");
    }

    return target;
  }

  async function getWorkspaceSnapshot(): Promise<JobFinderWorkspaceSnapshot> {
    await runNoResponseAutomationIfDue();

    await Promise.all([
      recoverInterruptedDiscoveryStateOnLoad(),
      recoverInterruptedApplyRunsOnLoad(),
    ]);

    if (!ctx.activeSourceDebugExecutionIdRef.current) {
      const discoveryState = await ctx.repository.getDiscoveryState();
      const activeSourceDebugRun = discoveryState.activeSourceDebugRun;

      if (activeSourceDebugRun?.state === "running") {
        const interruptedRun = SourceDebugRunRecordSchema.parse({
          ...activeSourceDebugRun,
          state: "interrupted",
          updatedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          activePhase: null,
          finalSummary:
            activeSourceDebugRun.finalSummary ??
            "Source debug run was interrupted before completion.",
        });

        await ctx.repository.upsertSourceDebugRun(interruptedRun);
        await ctx.repository.saveDiscoveryState(
          JobFinderDiscoveryStateSchema.parse({
            ...discoveryState,
            activeSourceDebugRun: null,
            recentSourceDebugRuns: [
              interruptedRun,
              ...discoveryState.recentSourceDebugRuns.filter(
                (run) => run.id !== interruptedRun.id,
              ),
            ].slice(0, SOURCE_DEBUG_RECENT_HISTORY_LIMIT),
          }),
        );
      }
    }

    const [
      setupContext,
      savedJobs,
      tailoredAssets,
      resumeDrafts,
      resumeExportArtifacts,
      resumeResearchArtifacts,
      applyRuns,
      applyJobResults,
      applicationRecords,
      applicationAttempts,
      sourceInstructionArtifacts,
      sourceDebugAttempts,
      profileCopilotMessages,
      profileRevisions,
      rawSettings,
      discovery,
      userActionRequests,
      userActionEvents,
      activityControl,
      intelligence,
    ] = await Promise.all([
      getCurrentSetupStateContext(),
      ctx.repository.listSavedJobs(),
      ctx.repository.listTailoredAssets(),
      ctx.repository.listResumeDrafts(),
      ctx.repository.listResumeExportArtifacts(),
      ctx.repository.listResumeResearchArtifacts(),
      ctx.repository.listApplyRuns(),
      ctx.repository.listApplyJobResults(),
      ctx.repository.listApplicationRecords(),
      ctx.repository.listApplicationAttempts(),
      ctx.repository.listSourceInstructionArtifacts(),
      ctx.repository.listSourceDebugAttempts(),
      ctx.repository.listProfileCopilotMessages(),
      ctx.repository.listProfileRevisions(),
      ctx.repository.getSettings(),
      ctx.repository.getDiscoveryState(),
      ctx.repository.listUserActionRequests(),
      ctx.repository.listUserActionEvents(),
      ctx.repository.getActivityControl(),
      ctx.repository.getIntelligenceState(),
    ]);

    const availableResumeTemplates = ctx.documentManager.listResumeTemplates();
    const normalizedSettings = normalizeJobFinderSettings(
      rawSettings,
      availableResumeTemplates,
    );
    const settings: JobFinderSettings = normalizedSettings.applicationCrm
      ? normalizedSettings
      : {
          ...normalizedSettings,
          applicationCrm: ApplicationCrmSettingsSchema.parse({}),
        };
    const normalizedResumeDrafts = resumeDrafts.map((draft) =>
      normalizeResumeDraftTemplate(draft, availableResumeTemplates),
    );

    const discoverySessions = await ctx.refreshDiscoverySessions(
      setupContext.searchPreferences,
    );
    const browserSession = createBrowserSessionSnapshot(
      discoverySessions,
      getPreferredSessionAdapter(setupContext.searchPreferences),
    );
    const generatedAt = new Date().toISOString();
    const sourceAccessPrompts = deriveSourceAccessPrompts({
      targets: setupContext.searchPreferences.discovery.targets,
      recentSourceDebugRuns: discovery.recentSourceDebugRuns,
      activeSourceDebugRun: discovery.activeSourceDebugRun,
      sourceDebugAttempts,
      sourceInstructionArtifacts,
      searchPreferences: setupContext.searchPreferences,
      generatedAt,
    });

    const persistedDiscoveryJobs = buildDiscoveryJobs(savedJobs);
    const dismissedDiscoveryJobs = savedJobs
      .filter(
        (job) => job.status === "archived" && job.discoveryFeedback !== null,
      )
      .sort(compareDiscoveryJobs);
    const savedJobIds = new Set(savedJobs.map((job) => job.id));
    const mergedPendingJobs = discovery.pendingDiscoveryJobs.filter(
      (job) => !savedJobIds.has(job.id),
    );
    const discoveryJobs = [
      ...persistedDiscoveryJobs,
      ...mergedPendingJobs,
    ].sort(compareDiscoveryJobs);
    const reviewQueue = buildReviewQueue(
      savedJobs,
      tailoredAssets,
      normalizedResumeDrafts,
      resumeExportArtifacts,
      setupContext.profile,
      settings,
    );
    const orderedApplicationRecords =
      buildApplicationRecords(applicationRecords);
    let campaignState = await ensureCampaignState({
      repository: ctx.repository,
      searchPreferences: setupContext.searchPreferences,
      now: generatedAt,
    });
    const activeCampaign = campaignState.campaigns.find(
      (campaign) => campaign.id === campaignState.activeCampaignId,
    );
    if (!activeCampaign) {
      throw new Error("The active job search campaign is unavailable.");
    }
    const activeCampaignJobIds = new Set(activeCampaign.jobIds);
    const activeCampaignTargetIds = new Set(activeCampaign.sourceTargetIds);
    const campaignSavedJobs = savedJobs.filter((job) =>
      activeCampaignJobIds.has(job.id),
    );
    const campaignReviewQueue = reviewQueue.filter((item) =>
      activeCampaignJobIds.has(item.jobId),
    );
    const campaignApplicationRecords = orderedApplicationRecords.filter(
      (record) => activeCampaignJobIds.has(record.jobId),
    );
    const campaignApplyRuns = applyRuns.filter((run) =>
      run.jobIds.some((jobId) => activeCampaignJobIds.has(jobId)),
    );
    const campaignUserActionRequests = userActionRequests.filter((request) =>
      request.scope.type === "application"
        ? activeCampaignJobIds.has(request.scope.jobId)
        : activeCampaignTargetIds.has(request.scope.targetId),
    );
    const campaignUnresolvedActionCount = campaignUserActionRequests.filter(
      (request) =>
        !["resolved", "skipped", "cancelled", "expired", "superseded"].includes(
          request.state,
        ),
    ).length;
    const activeCampaignRunIds = new Set(
      activeCampaign.history.flatMap((entry) =>
        entry.discoveryRunId ? [entry.discoveryRunId] : [],
      ),
    );
    const activeCampaignRecentRuns = discovery.recentRuns.filter(
      (run) =>
        run.campaignId === activeCampaign.id ||
        activeCampaignRunIds.has(run.id),
    );
    const activeCampaignActiveRun =
      discovery.activeRun?.campaignId === activeCampaign.id
        ? discovery.activeRun
        : null;
    const nextProgress = deriveCampaignProgress({
      campaign: activeCampaign,
      savedJobs: campaignSavedJobs,
      reviewQueue: campaignReviewQueue,
      applicationRecords: campaignApplicationRecords,
      applyRuns: campaignApplyRuns,
      unresolvedActions: campaignUnresolvedActionCount,
      lastRunAt:
        activeCampaignActiveRun?.startedAt ??
        activeCampaignRecentRuns[0]?.startedAt ??
        null,
      now: generatedAt,
    });
    const comparableProgress = (progress: typeof nextProgress) => ({
      ...progress,
      lastUpdatedAt: "",
    });
    const campaignProgressChanged =
      JSON.stringify(comparableProgress(activeCampaign.progress)) !==
      JSON.stringify(comparableProgress(nextProgress));
    if (campaignProgressChanged) {
      campaignState = {
        ...campaignState,
        campaigns: campaignState.campaigns.map((campaign) =>
          campaign.id === activeCampaign.id
            ? { ...campaign, progress: nextProgress, updatedAt: generatedAt }
            : campaign,
        ),
      };
    }
    if (campaignProgressChanged) {
      await ctx.repository.saveCampaignState(campaignState);
    }
    const dashboard = deriveDashboardSummary({
      generatedAt,
      campaigns: campaignState,
      savedJobs: campaignSavedJobs,
      reviewQueue: campaignReviewQueue,
      applicationRecords: campaignApplicationRecords,
      applyRuns: campaignApplyRuns,
      userActionRequests: campaignUserActionRequests,
      discovery,
      searchPreferences: activeCampaign.searchPreferences,
    });

    return JobFinderWorkspaceSnapshotSchema.parse({
      module: "job-finder",
      generatedAt,
      hydration: {
        phase: "complete",
        deferredCollections: [],
      },
      agentProvider: ctx.aiClient.getStatus(),
      visionProvider: ctx.visionProvider?.getStatus() ?? null,
      availableResumeTemplates,
      profile: setupContext.profile,
      searchPreferences: setupContext.searchPreferences,
      profileSetupState: setupContext.profileSetupState,
      browserSession,
      sourceAccessPrompts,
      discoverySessions,
      discoveryRunState: discovery.runState,
      activeDiscoveryRun: discovery.activeRun,
      recentDiscoveryRuns: activeCampaignRecentRuns,
      activeSourceDebugRun: discovery.activeSourceDebugRun,
      recentSourceDebugRuns: discovery.recentSourceDebugRuns,
      discoveryJobs,
      dismissedDiscoveryJobs,
      selectedDiscoveryJobId: discoveryJobs[0]?.id ?? null,
      reviewQueue,
      selectedReviewJobId: reviewQueue[0]?.jobId ?? null,
      tailoredAssets,
      resumeDrafts: normalizedResumeDrafts,
      resumeExportArtifacts,
      resumeResearchArtifacts,
      applyRuns,
      applyJobResults,
      applicationRecords: orderedApplicationRecords,
      applicationAttempts,
      sourceInstructionArtifacts,
      latestResumeImportRun: setupContext.latestResumeImportRun,
      latestResumeImportReviewCandidates:
        setupContext.latestResumeImportReviewCandidateSummaries,
      profileCopilotMessages,
      profileRevisions,
      selectedApplyRunId: selectLatestApplyRunId(applyRuns),
      selectedApplicationRecordId: orderedApplicationRecords[0]?.id ?? null,
      settings,
      userActionRequests,
      userActionEvents,
      campaigns: campaignState.campaigns,
      activeCampaignId: campaignState.activeCampaignId,
      campaignNotifications: campaignState.notifications,
      dashboard,
      activityControl,
      intelligence,
    });
  }

  async function getWorkspaceBootstrap(): Promise<JobFinderWorkspaceSnapshot> {
    // The first paint must not wait for every job, source history, application,
    // document, and intelligence row. Keep this response deliberately small:
    // it contains only the profile and controls needed to render the shell.
    // The explicit hydration marker prevents empty deferred collections from
    // being mistaken for a completed search.
    const [
      setupContext,
      rawSettings,
      discovery,
      existingCampaignState,
      userActionRequests,
      activityControl,
    ] = await Promise.all([
      getCurrentSetupStateContext(),
      ctx.repository.getSettings(),
      ctx.repository.getDiscoveryState(),
      ctx.repository.getCampaignState(),
      ctx.repository.listUserActionRequests(),
      ctx.repository.getActivityControl(),
    ]);
    const availableResumeTemplates = ctx.documentManager.listResumeTemplates();
    const settings = normalizeJobFinderSettings(
      rawSettings,
      availableResumeTemplates,
    );
    const generatedAt = new Date().toISOString();
    // Keep source targets in the bootstrap. They are small setup data, and
    // clearing them here would let an early settings save erase the sources
    // before the large collections finish hydrating.
    const bootstrapSearchPreferences = JobSearchPreferencesSchema.parse(
      setupContext.searchPreferences,
    );
    const campaignState = existingCampaignState ?? {
      activeCampaignId: "campaign_default",
      campaigns: [
        createCampaign({
          id: "campaign_default",
          name: "My job search",
          description: "Your existing Job Finder workspace.",
          mode: "precision",
          searchPreferences: setupContext.searchPreferences,
          now: generatedAt,
        }),
      ],
      notifications: [],
    };
    const bootstrapCampaignState = campaignState;
    const dashboard = deriveDashboardSummary({
      generatedAt,
      campaigns: bootstrapCampaignState,
      savedJobs: [],
      reviewQueue: [],
      applicationRecords: [],
      applyRuns: [],
      userActionRequests,
      discovery: {
        ...discovery,
        activeRun: discovery.activeRun,
        recentRuns: [],
        activeSourceDebugRun: discovery.activeSourceDebugRun,
        recentSourceDebugRuns: [],
        sessions: discovery.sessions,
      },
      searchPreferences: bootstrapSearchPreferences,
    });

    return JobFinderWorkspaceSnapshotSchema.parse({
      module: "job-finder",
      generatedAt,
      hydration: {
        phase: "bootstrap",
        deferredCollections: [...BOOTSTRAP_DEFERRED_COLLECTIONS],
      },
      agentProvider: ctx.aiClient.getStatus(),
      visionProvider: ctx.visionProvider?.getStatus() ?? null,
      availableResumeTemplates,
      profile: setupContext.profile,
      searchPreferences: bootstrapSearchPreferences,
      profileSetupState: setupContext.profileSetupState,
      browserSession: createBrowserSessionSnapshot(
        discovery.sessions,
        getPreferredSessionAdapter(setupContext.searchPreferences),
      ),
      sourceAccessPrompts: [],
      discoverySessions: discovery.sessions,
      discoveryRunState: discovery.runState,
      activeDiscoveryRun: discovery.activeRun,
      recentDiscoveryRuns: [],
      activeSourceDebugRun: discovery.activeSourceDebugRun,
      recentSourceDebugRuns: [],
      discoveryJobs: [],
      dismissedDiscoveryJobs: [],
      selectedDiscoveryJobId: null,
      reviewQueue: [],
      selectedReviewJobId: null,
      tailoredAssets: [],
      resumeDrafts: [],
      resumeExportArtifacts: [],
      resumeResearchArtifacts: [],
      applyRuns: [],
      applyJobResults: [],
      applicationRecords: [],
      applicationAttempts: [],
      sourceInstructionArtifacts: [],
      latestResumeImportRun: setupContext.latestResumeImportRun,
      latestResumeImportReviewCandidates:
        setupContext.latestResumeImportReviewCandidateSummaries,
      profileCopilotMessages: [],
      profileRevisions: [],
      selectedApplyRunId: null,
      selectedApplicationRecordId: null,
      settings,
      campaigns: bootstrapCampaignState.campaigns,
      activeCampaignId: bootstrapCampaignState.activeCampaignId,
      campaignNotifications: bootstrapCampaignState.notifications,
      dashboard,
      activityControl,
      intelligence: {},
      userActionRequests,
      userActionEvents: [],
    });
  }

  const profileSetupReviewMethods = createWorkspaceProfileSetupReviewMethods({
    ctx,
    getCurrentSetupStateContext,
    getWorkspaceSnapshot,
  });

  const profileCopilotMethods = createWorkspaceProfileCopilotMethods({
    ctx,
    getCurrentSetupStateContext,
    getWorkspaceSnapshot,
  });

  return {
    getWorkspaceSnapshot,
    getWorkspaceBootstrap,
    async getResumeImportState() {
      const [
        resumeImportRuns,
        resumeImportDocumentBundles,
        resumeImportFieldCandidates,
      ] = await Promise.all([
        ctx.repository.listResumeImportRuns(),
        ctx.repository.listResumeImportDocumentBundles(),
        ctx.repository.listResumeImportFieldCandidates(),
      ]);

      return {
        resumeImportRuns,
        resumeImportDocumentBundles,
        resumeImportFieldCandidates,
      };
    },
    async resetWorkspace(seed: JobFinderRepositorySeed) {
      await ctx.repository.reset(seed);
      return getWorkspaceSnapshot();
    },
    async openBrowserSession(input) {
      const searchPreferences = normalizeSearchPreferences(
        await ctx.repository.getSearchPreferences(),
      );
      const sourceInstructionArtifacts =
        await ctx.repository.listSourceInstructionArtifacts();
      const configuredTargets = searchPreferences.discovery.targets;
      const target = resolveBrowserSessionTarget({
        targets: configuredTargets,
        targetId: input?.targetId,
      });
      const sessionSource = target
        ? resolveAdapterKind(target)
        : getPreferredSessionAdapter(searchPreferences);
      try {
        const session = await ctx.browserRuntime.openSession(
          sessionSource,
          target
            ? {
                targetUrl: resolveSourceBrowserEntryUrl({
                  target,
                  searchPreferences,
                  sourceInstructionArtifacts,
                }),
              }
            : undefined,
        );
        await ctx.persistBrowserSessionState(session);
        return getWorkspaceSnapshot();
      } catch (error) {
        if (target) {
          const session = await ctx.browserRuntime
            .getSessionState(sessionSource)
            .catch(() => null);

          if (session) {
            await ctx.persistBrowserSessionState(session);
          }
        }

        throw error;
      }
    },
    async checkBrowserSession() {
      const searchPreferences = normalizeSearchPreferences(
        await ctx.repository.getSearchPreferences(),
      );
      const session = await ctx.browserRuntime.getSessionState(
        getPreferredSessionAdapter(searchPreferences),
      );
      await ctx.persistBrowserSessionState(session);
      return getWorkspaceSnapshot();
    },
    async saveProfile(profile: CandidateProfile) {
      const currentProfile = await ctx.repository.getProfile();
      const currentSearchPreferences = normalizeSearchPreferences(
        await ctx.repository.getSearchPreferences(),
      );
      const currentProfileSetupState =
        await ctx.repository.getProfileSetupState();
      const nextProfile = normalizeProfileBeforeSave(
        currentProfile,
        CandidateProfileSchema.parse(profile),
      );
      const nextProfileSetupState = resolvePendingReviewItemsAfterExplicitSave({
        currentProfile,
        currentSearchPreferences,
        nextProfile,
        nextSearchPreferences: currentSearchPreferences,
        profileSetupState: currentProfileSetupState,
        now: new Date().toISOString(),
      });

      if (hasResumeAffectingProfileChange(currentProfile, nextProfile)) {
        await ctx.staleApprovedResumeDrafts(
          "Profile details changed after approval and the resume needs a fresh review.",
        );
      }

      await ctx.repository.saveProfile(nextProfile);
      await deriveAndPersistProfileSetupState(ctx, {
        persistedState: nextProfileSetupState,
        profile: nextProfile,
        searchPreferences: currentSearchPreferences,
        latestResumeImportRunId:
          (await ctx.repository.getLatestResumeImportRun())?.id ?? null,
      });
      return getWorkspaceSnapshot();
    },
    async saveProfileAndSearchPreferences(
      profile: CandidateProfile,
      searchPreferences: JobSearchPreferences,
    ) {
      const currentProfile = await ctx.repository.getProfile();
      const currentProfileSetupState =
        await ctx.repository.getProfileSetupState();
      const nextProfile = normalizeProfileBeforeSave(
        currentProfile,
        CandidateProfileSchema.parse(profile),
      );
      const currentSearchPreferences = normalizeSearchPreferences(
        await ctx.repository.getSearchPreferences(),
      );
      const nextSearchPreferences = invalidateChangedSourceGuidance(
        currentSearchPreferences,
        normalizeSearchPreferences(
          JobSearchPreferencesSchema.parse(searchPreferences),
        ),
      );
      const nextProfileSetupState = resolvePendingReviewItemsAfterExplicitSave({
        currentProfile,
        currentSearchPreferences,
        nextProfile,
        nextSearchPreferences,
        profileSetupState: currentProfileSetupState,
        now: new Date().toISOString(),
      });

      if (hasResumeAffectingProfileChange(currentProfile, nextProfile)) {
        await ctx.staleApprovedResumeDrafts(
          "Profile details changed after approval and the resume needs a fresh review.",
        );
      }

      await ctx.repository.saveProfileAndSearchPreferences(
        nextProfile,
        nextSearchPreferences,
      );
      await syncActiveCampaignPreferences(nextSearchPreferences);
      await deriveAndPersistProfileSetupState(ctx, {
        persistedState: nextProfileSetupState,
        profile: nextProfile,
        searchPreferences: nextSearchPreferences,
        latestResumeImportRunId:
          (await ctx.repository.getLatestResumeImportRun())?.id ?? null,
      });

      return getWorkspaceSnapshot();
    },
    async runResumeImport(input) {
      const baseResume = ResumeSourceDocumentSchema.parse(input.baseResume);
      const documentBundle = ResumeDocumentBundleSchema.parse(
        input.documentBundle,
      );
      const searchPreferences = await ctx.repository.getSearchPreferences();
      const currentProfile = await ctx.repository.getProfile();
      const nextProfile = normalizeProfileBeforeSave(currentProfile, {
        ...currentProfile,
        baseResume,
      });
      const workflowResult = await runResumeImportWorkflow(ctx, {
        profile: nextProfile,
        searchPreferences,
        documentBundle,
        trigger: "import",
        ...(input.importWarnings
          ? { importWarnings: input.importWarnings }
          : {}),
        ...(input.visionArtifact
          ? { visionArtifact: input.visionArtifact }
          : {}),
      });

      if (
        hasResumeAffectingProfileChange(currentProfile, workflowResult.profile)
      ) {
        await ctx.staleApprovedResumeDrafts(
          "Profile details changed after approval and the resume needs a fresh review.",
        );
      }

      return getWorkspaceSnapshot();
    },
    async analyzeProfileFromResume() {
      const [profile, searchPreferences] = await Promise.all([
        ctx.repository.getProfile(),
        ctx.repository.getSearchPreferences(),
      ]);

      if (!profile.baseResume.textContent) {
        await ctx.repository.saveProfile(
          CandidateProfileSchema.parse({
            ...profile,
            baseResume: {
              ...profile.baseResume,
              extractionStatus: "needs_text",
              lastAnalyzedAt: null,
              analysisWarnings: [
                "Paste plain-text resume content to let the agent extract candidate details.",
              ],
            },
          }),
        );

        throw new Error(
          "Resume text is required before the profile agent can extract candidate details.",
        );
      }

      const latestBundle =
        (
          await ctx.repository.listResumeImportDocumentBundles({
            sourceResumeId: profile.baseResume.id,
          })
        )[0] ?? buildBundleFromStoredResume(profile);
      await runResumeImportWorkflow(ctx, {
        profile,
        searchPreferences,
        documentBundle: latestBundle,
        trigger: "refresh",
      });

      return getWorkspaceSnapshot();
    },
    async saveSearchPreferences(searchPreferences: JobSearchPreferences) {
      const currentProfile = await ctx.repository.getProfile();
      const currentProfileSetupState =
        await ctx.repository.getProfileSetupState();
      const currentSearchPreferences = normalizeSearchPreferences(
        await ctx.repository.getSearchPreferences(),
      );
      const nextSearchPreferences = invalidateChangedSourceGuidance(
        currentSearchPreferences,
        normalizeSearchPreferences(
          JobSearchPreferencesSchema.parse(searchPreferences),
        ),
      );
      await ctx.repository.saveSearchPreferences(nextSearchPreferences);
      await syncActiveCampaignPreferences(nextSearchPreferences);
      await deriveAndPersistProfileSetupState(ctx, {
        persistedState: currentProfileSetupState,
        profile: currentProfile,
        searchPreferences: nextSearchPreferences,
        latestResumeImportRunId:
          (await ctx.repository.getLatestResumeImportRun())?.id ?? null,
      });
      return getWorkspaceSnapshot();
    },
    async saveProfileSetupState(profileSetupState: ProfileSetupState) {
      const [profile, searchPreferences] = await Promise.all([
        ctx.repository.getProfile(),
        ctx.repository.getSearchPreferences(),
      ]);
      const normalizedSearchPreferences =
        normalizeSearchPreferences(searchPreferences);
      await deriveAndPersistProfileSetupState(ctx, {
        persistedState: ProfileSetupStateSchema.parse(profileSetupState),
        profile,
        searchPreferences: normalizedSearchPreferences,
        latestResumeImportRunId:
          (await ctx.repository.getLatestResumeImportRun())?.id ?? null,
      });
      return getWorkspaceSnapshot();
    },
    applyProfileSetupReviewAction:
      profileSetupReviewMethods.applyProfileSetupReviewAction,
    async applyResumeTimelineRepairAction(
      runId: string,
      proposalId: string,
      action: ResumeTimelineRepairAction,
    ) {
      const previousProfile = await ctx.repository.getProfile();
      const result = await persistResumeTimelineRepairAction({
        repository: ctx.repository,
        runId,
        proposalId,
        action,
        occurredAt: new Date().toISOString(),
      });
      if (hasResumeAffectingProfileChange(previousProfile, result.profile)) {
        await ctx.staleApprovedResumeDrafts(
          action === "accept"
            ? "Resume timeline repair accepted"
            : action === "undo"
              ? "Resume timeline repair undone"
              : "Resume timeline repair reviewed",
        );
      }
      return getWorkspaceSnapshot();
    },
    sendProfileCopilotMessage: profileCopilotMethods.sendProfileCopilotMessage,
    proposeProfileCopilotChange:
      profileCopilotMethods.proposeProfileCopilotChange,
    applyProfileCopilotPatchGroup:
      profileCopilotMethods.applyProfileCopilotPatchGroup,
    rejectProfileCopilotPatchGroup:
      profileCopilotMethods.rejectProfileCopilotPatchGroup,
    undoProfileRevision: profileCopilotMethods.undoProfileRevision,
    async saveSettings(settings: JobFinderSettings) {
      const currentSettings = await ctx.repository.getSettings();
      const nextSettings = normalizeJobFinderSettings(
        settings,
        ctx.documentManager.listResumeTemplates(),
      );

      if (hasResumeAffectingSettingsChange(currentSettings, nextSettings)) {
        await ctx.staleApprovedResumeDrafts(
          "Resume settings changed after approval and the resume needs a fresh review.",
        );
      }

      const currentResumeApplicationMode =
        currentSettings.resumeApplicationMode ?? "tailored_per_job";
      const nextResumeApplicationMode =
        nextSettings.resumeApplicationMode ?? "tailored_per_job";
      const activeReviewStatuses = new Set([
        "drafting",
        "ready_for_review",
        "approved",
      ]);
      await Promise.all([
        ctx.repository.saveSettings(nextSettings),
        currentResumeApplicationMode === nextResumeApplicationMode
          ? Promise.resolve()
          : ctx.repository.commitSavedJobDelta({
              update: (job) =>
                job.resumeApplicationMode === null &&
                activeReviewStatuses.has(job.status)
                  ? {
                      ...job,
                      resumeApplicationMode: currentResumeApplicationMode,
                    }
                  : job,
            }),
      ]);
      await runNoResponseAutomationIfDue({
        settings:
          nextSettings.applicationCrm ?? ApplicationCrmSettingsSchema.parse({}),
        force: true,
      });
      return getWorkspaceSnapshot();
    },
  };
}
