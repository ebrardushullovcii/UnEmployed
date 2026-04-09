import { CandidateProfileSchema, JobFinderDiscoveryStateSchema, JobFinderSettingsSchema, JobFinderWorkspaceSnapshotSchema, JobSearchPreferencesSchema, ResumeDocumentBundleSchema, ResumeSourceDocumentSchema, SourceDebugRunRecordSchema, type CandidateProfile, type JobFinderSettings, type JobFinderWorkspaceSnapshot, type JobSearchPreferences, type ResumeDocumentBundle, type ResumeImportFieldCandidate } from "@unemployed/contracts";
import type { JobFinderRepositorySeed } from "@unemployed/db";
import { buildApplicationRecords, buildDiscoveryJobs, buildReviewQueue } from "./matching";
import { normalizeProfileBeforeSave } from "./profile-merge";
import { runResumeImportWorkflow } from "./resume-import-workflow";
import { hasResumeAffectingProfileChange, hasResumeAffectingSettingsChange } from "./resume-workspace-staleness";
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
  | "runResumeImport"
  | "analyzeProfileFromResume"
  | "saveSearchPreferences"
  | "saveSettings"
> {
  function summarizeReviewCandidates(
    candidates: readonly ResumeImportFieldCandidate[],
  ) {
    return candidates.slice(0, 8).map((candidate) => ({
      id: candidate.id,
      target: candidate.target,
      label: candidate.label,
      valuePreview: candidate.valuePreview,
      evidenceText: candidate.evidenceText,
      confidence: candidate.confidence,
      resolution: candidate.resolution,
      notes: candidate.notes,
    }));
  }

  function buildBundleFromStoredResume(profile: CandidateProfile): ResumeDocumentBundle {
    const createdAt = profile.baseResume.textUpdatedAt ?? new Date().toISOString();
    const text = profile.baseResume.textContent?.trim() ?? null;
    const blocks = text
      ? text
          .split(/\r?\n/)
          .map((entry) => entry.trim())
          .filter(Boolean)
          .map((entry, index) => ({
            id: `resume_block_${index + 1}`,
            pageNumber: 1,
            readingOrder: index,
            text: entry,
            kind: index === 0 ? "heading" : "paragraph",
            sectionHint: index === 0 ? "identity" : "other",
            bbox: null,
            sourceParserKinds: ["plain_text"],
            sourceConfidence: 1,
          }))
      : [];

    return ResumeDocumentBundleSchema.parse({
      id: `resume_bundle_${profile.baseResume.id}`,
      runId: `resume_import_refresh_${Date.now()}`,
      sourceResumeId: profile.baseResume.id,
      sourceFileKind: "plain_text",
      primaryParserKind: "plain_text",
      parserKinds: ["plain_text"],
      createdAt,
      warnings: [],
      pages: [
        {
          pageNumber: 1,
          text,
          charCount: text?.length ?? 0,
          parserKinds: ["plain_text"],
          usedOcr: false,
        },
      ],
      blocks,
      fullText: text,
    });
  }

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
      resumeDrafts,
      resumeExportArtifacts,
      resumeResearchArtifacts,
      applicationRecords,
      applicationAttempts,
      sourceInstructionArtifacts,
      latestResumeImportRun,
      settings,
      discovery,
    ] = await Promise.all([
      ctx.repository.getProfile(),
      ctx.repository.getSearchPreferences(),
      ctx.repository.listSavedJobs(),
      ctx.repository.listTailoredAssets(),
      ctx.repository.listResumeDrafts(),
      ctx.repository.listResumeExportArtifacts(),
      ctx.repository.listResumeResearchArtifacts(),
      ctx.repository.listApplicationRecords(),
      ctx.repository.listApplicationAttempts(),
      ctx.repository.listSourceInstructionArtifacts(),
      ctx.repository.getLatestResumeImportRun(),
      ctx.repository.getSettings(),
      ctx.repository.getDiscoveryState(),
    ]);
    const latestResumeImportReviewCandidates = latestResumeImportRun
      ? summarizeReviewCandidates(
          await ctx.repository.listResumeImportFieldCandidates({
            runId: latestResumeImportRun.id,
            resolution: "needs_review",
          }),
        )
      : [];

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
    const reviewQueue = buildReviewQueue(
      savedJobs,
      tailoredAssets,
      resumeDrafts,
      resumeExportArtifacts,
    );
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
      resumeDrafts,
      resumeExportArtifacts,
      resumeResearchArtifacts,
      applicationRecords: orderedApplicationRecords,
      applicationAttempts,
      sourceInstructionArtifacts,
      latestResumeImportRun,
      latestResumeImportReviewCandidates,
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
      const nextProfile = normalizeProfileBeforeSave(
        currentProfile,
        CandidateProfileSchema.parse(profile),
      );

      if (hasResumeAffectingProfileChange(currentProfile, nextProfile)) {
        await ctx.staleApprovedResumeDrafts(
          "Profile details changed after approval and the resume needs a fresh review.",
        );
      }

      await ctx.repository.saveProfile(
        nextProfile,
      );
      return getWorkspaceSnapshot();
    },
    async saveProfileAndSearchPreferences(
      profile: CandidateProfile,
      searchPreferences: JobSearchPreferences,
    ) {
      const currentProfile = await ctx.repository.getProfile();
      const nextProfile = normalizeProfileBeforeSave(
        currentProfile,
        CandidateProfileSchema.parse(profile),
      );
      const nextSearchPreferences = normalizeSearchPreferences(
        JobSearchPreferencesSchema.parse(searchPreferences),
      );

      if (hasResumeAffectingProfileChange(currentProfile, nextProfile)) {
        await ctx.staleApprovedResumeDrafts(
          "Profile details changed after approval and the resume needs a fresh review.",
        );
      }

      await ctx.repository.saveProfileAndSearchPreferences(nextProfile, nextSearchPreferences);

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
      await ctx.repository.saveSearchPreferences(
        normalizeSearchPreferences(JobSearchPreferencesSchema.parse(searchPreferences)),
      );
      return getWorkspaceSnapshot();
    },
    async saveSettings(settings: JobFinderSettings) {
      const currentSettings = await ctx.repository.getSettings();
      const nextSettings = JobFinderSettingsSchema.parse({
        ...settings,
        resumeFormat: "pdf",
      });

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
