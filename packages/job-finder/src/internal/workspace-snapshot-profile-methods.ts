import { CandidateProfileSchema, JobFinderDiscoveryStateSchema, JobFinderSettingsSchema, JobFinderWorkspaceSnapshotSchema, JobSearchPreferencesSchema, SourceDebugRunRecordSchema, type CandidateProfile, type JobFinderSettings, type JobFinderWorkspaceSnapshot, type JobSearchPreferences } from "@unemployed/contracts";
import type { JobFinderRepositorySeed } from "@unemployed/db";
import { buildApplicationRecords, buildDiscoveryJobs, buildReviewQueue } from "./matching";
import { mergeResumeExtractionIntoWorkspace, normalizeProfileBeforeSave } from "./profile-merge";
import { createBrowserSessionSnapshot } from "./workspace-service-helpers";
import { getPreferredSessionAdapter, normalizeSearchPreferences } from "./workspace-helpers";
import { SOURCE_DEBUG_RECENT_HISTORY_LIMIT } from "./workspace-defaults";
import type { WorkspaceServiceContext } from "./workspace-service-context";
import type { JobFinderWorkspaceService } from "./workspace-service-contracts";

export function createWorkspaceSnapshotProfileMethods(
  ctx: WorkspaceServiceContext,
): Pick<
  JobFinderWorkspaceService,
  | "getWorkspaceSnapshot"
  | "resetWorkspace"
  | "openBrowserSession"
  | "checkBrowserSession"
  | "saveProfile"
  | "saveProfileAndSearchPreferences"
  | "analyzeProfileFromResume"
  | "saveSearchPreferences"
  | "saveSettings"
> {
  async function getWorkspaceSnapshot(): Promise<JobFinderWorkspaceSnapshot> {
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
      profile,
      searchPreferences,
      savedJobs,
      tailoredAssets,
      applicationRecords,
      applicationAttempts,
      sourceInstructionArtifacts,
      settings,
      discovery,
    ] = await Promise.all([
      ctx.repository.getProfile(),
      ctx.repository.getSearchPreferences(),
      ctx.repository.listSavedJobs(),
      ctx.repository.listTailoredAssets(),
      ctx.repository.listApplicationRecords(),
      ctx.repository.listApplicationAttempts(),
      ctx.repository.listSourceInstructionArtifacts(),
      ctx.repository.getSettings(),
      ctx.repository.getDiscoveryState(),
    ]);

    const normalizedSearchPreferences =
      normalizeSearchPreferences(searchPreferences);
    const discoverySessions = await ctx.refreshDiscoverySessions(
      normalizedSearchPreferences,
    );
    const browserSession = createBrowserSessionSnapshot(
      discoverySessions,
      getPreferredSessionAdapter(normalizedSearchPreferences),
    );

    const persistedDiscoveryJobs = buildDiscoveryJobs(savedJobs);
    const savedJobIds = new Set(savedJobs.map((job) => job.id));
    const mergedPendingJobs = discovery.pendingDiscoveryJobs.filter(
      (job) => !savedJobIds.has(job.id),
    );
    const discoveryJobs = [...persistedDiscoveryJobs, ...mergedPendingJobs].sort(
      (left, right) => right.matchAssessment.score - left.matchAssessment.score,
    );
    const reviewQueue = buildReviewQueue(savedJobs, tailoredAssets);
    const orderedApplicationRecords = buildApplicationRecords(applicationRecords);

    return JobFinderWorkspaceSnapshotSchema.parse({
      module: "job-finder",
      generatedAt: new Date().toISOString(),
      agentProvider: ctx.aiClient.getStatus(),
      availableResumeTemplates: ctx.documentManager.listResumeTemplates(),
      profile,
      searchPreferences: normalizedSearchPreferences,
      browserSession,
      discoverySessions,
      discoveryRunState: discovery.runState,
      activeDiscoveryRun: discovery.activeRun,
      recentDiscoveryRuns: discovery.recentRuns,
      activeSourceDebugRun: discovery.activeSourceDebugRun,
      recentSourceDebugRuns: discovery.recentSourceDebugRuns,
      discoveryJobs,
      selectedDiscoveryJobId: discoveryJobs[0]?.id ?? null,
      reviewQueue,
      selectedReviewJobId: reviewQueue[0]?.jobId ?? null,
      tailoredAssets,
      applicationRecords: orderedApplicationRecords,
      applicationAttempts,
      sourceInstructionArtifacts,
      selectedApplicationRecordId: orderedApplicationRecords[0]?.id ?? null,
      settings,
    });
  }

  return {
    getWorkspaceSnapshot,
    async resetWorkspace(seed: JobFinderRepositorySeed) {
      await ctx.repository.reset(seed);
      return getWorkspaceSnapshot();
    },
    async openBrowserSession() {
      const searchPreferences = normalizeSearchPreferences(
        await ctx.repository.getSearchPreferences(),
      );
      const session = await ctx.browserRuntime.openSession(
        getPreferredSessionAdapter(searchPreferences),
      );
      await ctx.persistBrowserSessionState(session);
      return getWorkspaceSnapshot();
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
      await ctx.repository.saveProfile(
        normalizeProfileBeforeSave(
          currentProfile,
          CandidateProfileSchema.parse(profile),
        ),
      );
      return getWorkspaceSnapshot();
    },
    async saveProfileAndSearchPreferences(
      profile: CandidateProfile,
      searchPreferences: JobSearchPreferences,
    ) {
      const currentProfile = await ctx.repository.getProfile();

      await ctx.repository.saveProfileAndSearchPreferences(
        normalizeProfileBeforeSave(
          currentProfile,
          CandidateProfileSchema.parse(profile),
        ),
        normalizeSearchPreferences(JobSearchPreferencesSchema.parse(searchPreferences)),
      );

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

      const extraction = await ctx.aiClient.extractProfileFromResume({
        existingProfile: profile,
        existingSearchPreferences: searchPreferences,
        resumeText: profile.baseResume.textContent,
      });
      const merged = mergeResumeExtractionIntoWorkspace(
        profile,
        searchPreferences,
        extraction,
      );

      await ctx.repository.saveProfileAndSearchPreferences(
        merged.profile,
        merged.searchPreferences,
      );

      return getWorkspaceSnapshot();
    },
    async saveSearchPreferences(searchPreferences: JobSearchPreferences) {
      await ctx.repository.saveSearchPreferences(
        normalizeSearchPreferences(JobSearchPreferencesSchema.parse(searchPreferences)),
      );
      return getWorkspaceSnapshot();
    },
    async saveSettings(settings: JobFinderSettings) {
      await ctx.repository.saveSettings(JobFinderSettingsSchema.parse(settings));
      return getWorkspaceSnapshot();
    },
  };
}
