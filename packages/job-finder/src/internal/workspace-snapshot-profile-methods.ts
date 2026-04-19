import {
  CandidateProfileSchema,
  JobFinderDiscoveryStateSchema,
  JobFinderSettingsSchema,
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
} from "@unemployed/contracts";
import type { JobFinderRepositorySeed } from "@unemployed/db";

import { buildApplicationRecords, buildDiscoveryJobs, buildReviewQueue } from "./matching";
import { deriveAndPersistProfileSetupState } from "./profile-workspace-state";
import { resolvePendingReviewItemsAfterExplicitSave } from "./profile-setup-review-items";
import { normalizeProfileBeforeSave } from "./profile-merge";
import { runResumeImportWorkflow } from "./resume-import-workflow";
import { hasResumeAffectingProfileChange, hasResumeAffectingSettingsChange } from "./resume-workspace-staleness";
import { selectLatestApplyRunId } from "./workspace-apply-run-support";
import { createBrowserSessionSnapshot } from "./workspace-service-helpers";
import type { WorkspaceServiceContext } from "./workspace-service-context";
import {
  getPreferredSessionAdapter,
  normalizeJobFinderSettings,
  normalizeResumeDraftTemplate,
  normalizeSearchPreferences,
} from "./workspace-helpers";
import { SOURCE_DEBUG_RECENT_HISTORY_LIMIT } from "./workspace-defaults";
import { createWorkspaceProfileCopilotMethods } from "./workspace-profile-copilot-methods";
import { createWorkspaceProfileSetupContextHelpers } from "./workspace-profile-setup-context";
import { createWorkspaceProfileSetupReviewMethods } from "./workspace-profile-setup-review-methods";
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
  | "runResumeImport"
  | "analyzeProfileFromResume"
  | "saveSearchPreferences"
  | "saveProfileSetupState"
  | "applyProfileSetupReviewAction"
  | "sendProfileCopilotMessage"
  | "applyProfileCopilotPatchGroup"
  | "rejectProfileCopilotPatchGroup"
  | "undoProfileRevision"
  | "saveSettings"
> {
  const { buildBundleFromStoredResume, getCurrentSetupStateContext } =
    createWorkspaceProfileSetupContextHelpers(ctx);

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
      profileCopilotMessages,
      profileRevisions,
        rawSettings,
        discovery,
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
      ctx.repository.listProfileCopilotMessages(),
      ctx.repository.listProfileRevisions(),
      ctx.repository.getSettings(),
      ctx.repository.getDiscoveryState(),
    ]);

      const availableResumeTemplates = ctx.documentManager.listResumeTemplates();
      const settings = normalizeJobFinderSettings(
        rawSettings,
        availableResumeTemplates,
      );
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

    const persistedDiscoveryJobs = buildDiscoveryJobs(savedJobs);
    const savedJobIds = new Set(savedJobs.map((job) => job.id));
    const mergedPendingJobs = discovery.pendingDiscoveryJobs.filter(
      (job) => !savedJobIds.has(job.id),
    );
    const discoveryJobs = [...persistedDiscoveryJobs, ...mergedPendingJobs].sort(
      (left, right) => right.matchAssessment.score - left.matchAssessment.score,
    );
      const reviewQueue = buildReviewQueue(
        savedJobs,
        tailoredAssets,
        normalizedResumeDrafts,
        resumeExportArtifacts,
      );
    const orderedApplicationRecords = buildApplicationRecords(applicationRecords);

    return JobFinderWorkspaceSnapshotSchema.parse({
      module: "job-finder",
      generatedAt: new Date().toISOString(),
      agentProvider: ctx.aiClient.getStatus(),
        availableResumeTemplates,
      profile: setupContext.profile,
      searchPreferences: setupContext.searchPreferences,
      profileSetupState: setupContext.profileSetupState,
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
      const currentSearchPreferences = normalizeSearchPreferences(
        await ctx.repository.getSearchPreferences(),
      );
      const currentProfileSetupState = await ctx.repository.getProfileSetupState();
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
        latestResumeImportRunId: (await ctx.repository.getLatestResumeImportRun())?.id ?? null,
      });
      return getWorkspaceSnapshot();
    },
    async saveProfileAndSearchPreferences(
      profile: CandidateProfile,
      searchPreferences: JobSearchPreferences,
    ) {
      const currentProfile = await ctx.repository.getProfile();
      const currentProfileSetupState = await ctx.repository.getProfileSetupState();
      const nextProfile = normalizeProfileBeforeSave(
        currentProfile,
        CandidateProfileSchema.parse(profile),
      );
      const nextSearchPreferences = normalizeSearchPreferences(
        JobSearchPreferencesSchema.parse(searchPreferences),
      );
      const nextProfileSetupState = resolvePendingReviewItemsAfterExplicitSave({
        currentProfile,
        currentSearchPreferences: normalizeSearchPreferences(
          await ctx.repository.getSearchPreferences(),
        ),
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

      await ctx.repository.saveProfileAndSearchPreferences(nextProfile, nextSearchPreferences);
      await deriveAndPersistProfileSetupState(ctx, {
        persistedState: nextProfileSetupState,
        profile: nextProfile,
        searchPreferences: nextSearchPreferences,
        latestResumeImportRunId: (await ctx.repository.getLatestResumeImportRun())?.id ?? null,
      });

      return getWorkspaceSnapshot();
    },
    async runResumeImport(input) {
      const baseResume = ResumeSourceDocumentSchema.parse(input.baseResume);
      const documentBundle = ResumeDocumentBundleSchema.parse(input.documentBundle);
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
        ...(input.importWarnings ? { importWarnings: input.importWarnings } : {}),
      });

      if (hasResumeAffectingProfileChange(currentProfile, workflowResult.profile)) {
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
        (await ctx.repository.listResumeImportDocumentBundles({
          sourceResumeId: profile.baseResume.id,
        }))[0] ?? buildBundleFromStoredResume(profile);
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
      const currentProfileSetupState = await ctx.repository.getProfileSetupState();
      const nextSearchPreferences = normalizeSearchPreferences(
        JobSearchPreferencesSchema.parse(searchPreferences),
      );
      await ctx.repository.saveSearchPreferences(nextSearchPreferences);
      await deriveAndPersistProfileSetupState(ctx, {
        persistedState: currentProfileSetupState,
        profile: currentProfile,
        searchPreferences: nextSearchPreferences,
        latestResumeImportRunId: (await ctx.repository.getLatestResumeImportRun())?.id ?? null,
      });
      return getWorkspaceSnapshot();
    },
    async saveProfileSetupState(profileSetupState: ProfileSetupState) {
      const [profile, searchPreferences] = await Promise.all([
        ctx.repository.getProfile(),
        ctx.repository.getSearchPreferences(),
      ]);
      const normalizedSearchPreferences = normalizeSearchPreferences(searchPreferences);
      await deriveAndPersistProfileSetupState(ctx, {
        persistedState: ProfileSetupStateSchema.parse(profileSetupState),
        profile,
        searchPreferences: normalizedSearchPreferences,
        latestResumeImportRunId: (await ctx.repository.getLatestResumeImportRun())?.id ?? null,
      });
      return getWorkspaceSnapshot();
    },
    applyProfileSetupReviewAction:
      profileSetupReviewMethods.applyProfileSetupReviewAction,
    sendProfileCopilotMessage: profileCopilotMethods.sendProfileCopilotMessage,
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

      await ctx.repository.saveSettings(nextSettings);
      return getWorkspaceSnapshot();
    },
  };
}
