import { describe, expect, test } from "vitest";
import {
  createSeed,
  createWorkspaceServiceHarness,
} from "./workspace-service.test-support";

describe("createJobFinderWorkspaceService", () => {
  test("synchronizes resolved setup review items back into latest import candidates", async () => {
    const seed = createSeed();
    const latestRunId = "resume_import_run_sync_review_state";
    const reviewCandidateId = "candidate_headline_sync";
    const { repository, workspaceService } = createWorkspaceServiceHarness({
      seed: {
        ...seed,
        profile: {
          ...seed.profile,
          headline: "Senior systems designer",
        },
        profileSetupState: {
          status: "in_progress",
          currentStep: "essentials",
          completedAt: null,
          reviewItems: [
            {
              id: "review_headline_sync",
              step: "essentials",
              target: {
                domain: "identity",
                key: "headline",
                recordId: null,
              },
              label: "Headline",
              reason: "Confirm the imported headline before setup is complete.",
              severity: "recommended",
              status: "edited",
              proposedValue: "Principal Product Designer",
              sourceSnippet: "Principal Product Designer",
              sourceCandidateId: reviewCandidateId,
              sourceRunId: latestRunId,
              createdAt: "2026-04-12T09:00:00.000Z",
              resolvedAt: "2026-04-12T09:05:00.000Z",
            },
          ],
          lastResumedAt: null,
        },
        resumeImportRuns: [
          {
            id: latestRunId,
            sourceResumeId: seed.profile.baseResume.id,
            sourceResumeFileName: seed.profile.baseResume.fileName,
            trigger: "refresh",
            status: "review_ready",
            startedAt: "2026-04-12T08:50:00.000Z",
            completedAt: "2026-04-12T08:55:00.000Z",
            primaryParserKind: "plain_text",
            parserKinds: ["plain_text"],
            analysisProviderKind: "deterministic",
            analysisProviderLabel: "Test AI",
            warnings: [],
            errorMessage: null,
            candidateCounts: {
              total: 1,
              autoApplied: 0,
              needsReview: 1,
              rejected: 0,
              abstained: 0,
            },
          },
        ],
        resumeImportFieldCandidates: [
          {
            id: reviewCandidateId,
            runId: latestRunId,
            target: {
              section: "identity",
              key: "headline",
              recordId: null,
            },
            label: "Headline",
            sourceKind: "model_identity_summary",
            value: "Principal Product Designer",
            normalizedValue: null,
            valuePreview: "Principal Product Designer",
            evidenceText: "Principal Product Designer",
            sourceBlockIds: [],
            confidence: 0.82,
            confidenceBreakdown: {
              overall: 0.82,
              parserQuality: 0.9,
              evidenceQuality: 0.84,
              agreementScore: 0.8,
              normalizationRisk: 0.06,
              conflictRisk: 0.16,
              fieldSensitivity: "medium",
              recommendation: "needs_review",
            },
            notes: [],
            alternatives: [],
            resolution: "needs_review",
            resolutionReason: null,
            createdAt: "2026-04-12T08:52:00.000Z",
            resolvedAt: null,
          },
        ],
      },
    });

    const snapshot = await workspaceService.getWorkspaceSnapshot();
    const latestRun = await repository.getLatestResumeImportRun();
    const latestCandidates = await repository.listResumeImportFieldCandidates({
      runId: latestRun?.id ?? "",
    });

    expect(snapshot.profileSetupState.reviewItems[0]?.status).toBe("edited");
    expect(latestRun?.status).toBe("applied");
    expect(latestRun?.candidateCounts.needsReview).toBe(0);
    expect(latestCandidates[0]).toEqual(
      expect.objectContaining({
        resolution: "rejected",
        resolutionReason: "review_edited",
      }),
    );
  });

  test("does not reopen resolved review items when saveProfileSetupState receives a stale payload", async () => {
    const seed = createSeed();
    const latestRunId = "resume_import_run_stale_setup_state";
    const reviewCandidateId = "candidate_headline_stale_setup_state";
    const { workspaceService } = createWorkspaceServiceHarness({
      seed: {
        ...seed,
        profile: {
          ...seed.profile,
          headline: "Senior systems designer",
        },
        profileSetupState: {
          status: "in_progress",
          currentStep: "essentials",
          completedAt: null,
          reviewItems: [
            {
              id: "review_headline_stale_setup_state",
              step: "essentials",
              target: {
                domain: "identity",
                key: "headline",
                recordId: null,
              },
              label: "Headline",
              reason: "Confirm the imported headline before setup is complete.",
              severity: "recommended",
              status: "pending",
              proposedValue: "Principal Product Designer",
              sourceSnippet: "Principal Product Designer",
              sourceCandidateId: reviewCandidateId,
              sourceRunId: latestRunId,
              createdAt: "2026-04-12T09:00:00.000Z",
              resolvedAt: null,
            },
          ],
          lastResumedAt: null,
        },
        resumeImportRuns: [
          {
            id: latestRunId,
            sourceResumeId: seed.profile.baseResume.id,
            sourceResumeFileName: seed.profile.baseResume.fileName,
            trigger: "refresh",
            status: "review_ready",
            startedAt: "2026-04-12T08:50:00.000Z",
            completedAt: "2026-04-12T08:55:00.000Z",
            primaryParserKind: "plain_text",
            parserKinds: ["plain_text"],
            analysisProviderKind: "deterministic",
            analysisProviderLabel: "Test AI",
            warnings: [],
            errorMessage: null,
            candidateCounts: {
              total: 1,
              autoApplied: 0,
              needsReview: 1,
              rejected: 0,
              abstained: 0,
            },
          },
        ],
        resumeImportFieldCandidates: [
          {
            id: reviewCandidateId,
            runId: latestRunId,
            target: {
              section: "identity",
              key: "headline",
              recordId: null,
            },
            label: "Headline",
            sourceKind: "model_identity_summary",
            value: "Principal Product Designer",
            normalizedValue: null,
            valuePreview: "Principal Product Designer",
            evidenceText: "Principal Product Designer",
            sourceBlockIds: [],
            confidence: 0.82,
            confidenceBreakdown: {
              overall: 0.82,
              parserQuality: 0.9,
              evidenceQuality: 0.84,
              agreementScore: 0.8,
              normalizationRisk: 0.06,
              conflictRisk: 0.16,
              fieldSensitivity: "medium",
              recommendation: "needs_review",
            },
            notes: [],
            alternatives: [],
            resolution: "needs_review",
            resolutionReason: null,
            createdAt: "2026-04-12T08:52:00.000Z",
            resolvedAt: null,
          },
        ],
      },
    });

    const staleSnapshot = await workspaceService.getWorkspaceSnapshot();

    await workspaceService.applyProfileSetupReviewAction(
      "review_headline_stale_setup_state",
      "dismiss",
    );

    const updatedSnapshot = await workspaceService.saveProfileSetupState({
      ...staleSnapshot.profileSetupState,
      currentStep: "background",
      lastResumedAt: "2026-04-12T09:10:00.000Z",
    });

    const resolvedItem = updatedSnapshot.profileSetupState.reviewItems.find(
      (item) => item.id === "review_headline_stale_setup_state",
    );

    expect(updatedSnapshot.profileSetupState.currentStep).toBe("background");
    expect(resolvedItem?.status).toBe("dismissed");
  });

  test("keeps import-backed setup review items pending across step switches until the user resolves them", async () => {
    const seed = createSeed();
    const latestRunId = "resume_import_run_keep_pending";
    const reviewCandidateId = "candidate_headline_keep_pending";
    const { workspaceService } = createWorkspaceServiceHarness({
      seed: {
        ...seed,
        profile: {
          ...seed.profile,
          headline: "Senior systems designer",
        },
        profileSetupState: {
          status: "in_progress",
          currentStep: "essentials",
          completedAt: null,
          reviewItems: [
            {
              id: "review_headline_keep_pending",
              step: "essentials",
              target: {
                domain: "identity",
                key: "headline",
                recordId: null,
              },
              label: "Headline",
              reason: "Confirm the imported headline before setup is complete.",
              severity: "recommended",
              status: "pending",
              proposedValue: "Principal Product Designer",
              sourceSnippet: "Principal Product Designer",
              sourceCandidateId: reviewCandidateId,
              sourceRunId: latestRunId,
              createdAt: "2026-04-12T09:00:00.000Z",
              resolvedAt: null,
            },
          ],
          lastResumedAt: null,
        },
        resumeImportRuns: [
          {
            id: latestRunId,
            sourceResumeId: seed.profile.baseResume.id,
            sourceResumeFileName: seed.profile.baseResume.fileName,
            trigger: "refresh",
            status: "review_ready",
            startedAt: "2026-04-12T08:50:00.000Z",
            completedAt: "2026-04-12T08:55:00.000Z",
            primaryParserKind: "plain_text",
            parserKinds: ["plain_text"],
            analysisProviderKind: "deterministic",
            analysisProviderLabel: "Test AI",
            warnings: [],
            errorMessage: null,
            candidateCounts: {
              total: 1,
              autoApplied: 0,
              needsReview: 1,
              rejected: 0,
              abstained: 0,
            },
          },
        ],
        resumeImportFieldCandidates: [
          {
            id: reviewCandidateId,
            runId: latestRunId,
            target: {
              section: "identity",
              key: "headline",
              recordId: null,
            },
            label: "Headline",
            sourceKind: "model_identity_summary",
            value: "Principal Product Designer",
            normalizedValue: null,
            valuePreview: "Principal Product Designer",
            evidenceText: "Principal Product Designer",
            sourceBlockIds: [],
            confidence: 0.82,
            confidenceBreakdown: {
              overall: 0.82,
              parserQuality: 0.9,
              evidenceQuality: 0.84,
              agreementScore: 0.8,
              normalizationRisk: 0.06,
              conflictRisk: 0.16,
              fieldSensitivity: "medium",
              recommendation: "needs_review",
            },
            notes: [],
            alternatives: [],
            resolution: "needs_review",
            resolutionReason: null,
            createdAt: "2026-04-12T08:52:00.000Z",
            resolvedAt: null,
          },
        ],
      },
    });

    await workspaceService.saveProfileSetupState({
      status: "in_progress",
      currentStep: "background",
      completedAt: null,
      reviewItems: [],
      lastResumedAt: "2026-04-12T09:10:00.000Z",
    });

    const updatedSnapshot = await workspaceService.saveProfileSetupState({
      status: "in_progress",
      currentStep: "essentials",
      completedAt: null,
      reviewItems: [],
      lastResumedAt: "2026-04-12T09:12:00.000Z",
    });

    const reviewItem = updatedSnapshot.profileSetupState.reviewItems.find(
      (item) => item.id === "review_headline_keep_pending",
    );

    expect(reviewItem?.status).toBe("pending");
    expect(reviewItem?.sourceCandidateId).toBe(reviewCandidateId);
    expect(updatedSnapshot.profileSetupState.currentStep).toBe("essentials");
  });

  test("marks pending setup review items as edited after an explicit save changes the target value", async () => {
    const seed = createSeed();
    const { workspaceService } = createWorkspaceServiceHarness({
      seed: {
        ...seed,
        profile: {
          ...seed.profile,
          yearsExperience: 6,
        },
        profileSetupState: {
          status: "in_progress",
          currentStep: "essentials",
          completedAt: null,
          reviewItems: [
            {
              id: "review_years_experience_save",
              step: "essentials",
              target: {
                domain: "identity",
                key: "yearsExperience",
                recordId: null,
              },
              label: "Years of experience",
              reason: "Confirm the imported experience total before setup is complete.",
              severity: "recommended",
              status: "pending",
              proposedValue: "6",
              sourceSnippet: "6+ years of experience",
              sourceCandidateId: null,
              sourceRunId: null,
              createdAt: "2026-04-14T09:00:00.000Z",
              resolvedAt: null,
            },
          ],
          lastResumedAt: null,
        },
      },
    });

    const snapshot = await workspaceService.saveProfileAndSearchPreferences(
      {
        ...seed.profile,
        yearsExperience: 7,
      },
      seed.searchPreferences,
    );

    const reviewItem = snapshot.profileSetupState.reviewItems.find(
      (item) => item.id === "review_years_experience_save",
    );

    expect(snapshot.profile.yearsExperience).toBe(7);
    expect(reviewItem?.status).toBe("edited");
    expect(reviewItem?.resolvedAt).toBeTruthy();
  });

  test("does not allow clearing a years-of-experience review item to an invalid null value", async () => {
    const seed = createSeed();
    const { workspaceService } = createWorkspaceServiceHarness({
      seed: {
        ...seed,
        profile: {
          ...seed.profile,
          yearsExperience: 6,
        },
        profileSetupState: {
          status: "in_progress",
          currentStep: "essentials",
          completedAt: null,
          reviewItems: [
            {
              id: "review_years_experience_clear",
              step: "essentials",
              target: {
                domain: "identity",
                key: "yearsExperience",
                recordId: null,
              },
              label: "Years of experience",
              reason: "Confirm the imported experience total before setup is complete.",
              severity: "recommended",
              status: "pending",
              proposedValue: "12",
              sourceSnippet: "12 years of experience",
              sourceCandidateId: null,
              sourceRunId: null,
              createdAt: "2026-04-14T09:00:00.000Z",
              resolvedAt: null,
            },
          ],
          lastResumedAt: null,
        },
      },
    });

    await expect(
      workspaceService.applyProfileSetupReviewAction(
        "review_years_experience_clear",
        "clear_value",
      ),
    ).rejects.toThrow("Years of experience cannot be cleared");
  });

  test("marks pending portfolio review items as confirmed after an explicit save matches the proposed value", async () => {
    const seed = createSeed();
    const latestRunId = "resume_import_run_portfolio_resolution";
    const reviewCandidateId = "candidate_portfolio_resolution";
    const currentProfile = {
      ...seed.profile,
      portfolioUrl: null,
      links: [],
      applicationIdentity: {
        ...seed.profile.applicationIdentity,
        preferredLinkIds: [],
      },
    };
    const { repository, workspaceService } = createWorkspaceServiceHarness({
      seed: {
        ...seed,
        profile: currentProfile,
        profileSetupState: {
          status: "in_progress",
          currentStep: "essentials",
          completedAt: null,
          reviewItems: [
            {
              id: "review_portfolio_resolution",
              step: "essentials",
              target: {
                domain: "identity",
                key: "portfolioUrl",
                recordId: null,
              },
              label: "Portfolio URL",
              reason: "Confirm the imported portfolio URL before setup is complete.",
              severity: "recommended",
              status: "pending",
              proposedValue: "https://jamie.dev",
              sourceSnippet: "https://jamie.dev",
              sourceCandidateId: reviewCandidateId,
              sourceRunId: latestRunId,
              createdAt: "2026-04-14T09:00:00.000Z",
              resolvedAt: null,
            },
          ],
          lastResumedAt: null,
        },
        resumeImportRuns: [
          {
            id: latestRunId,
            sourceResumeId: currentProfile.baseResume.id,
            sourceResumeFileName: currentProfile.baseResume.fileName,
            trigger: "refresh",
            status: "review_ready",
            startedAt: "2026-04-14T08:50:00.000Z",
            completedAt: "2026-04-14T08:55:00.000Z",
            primaryParserKind: "plain_text",
            parserKinds: ["plain_text"],
            analysisProviderKind: "deterministic",
            analysisProviderLabel: "Test AI",
            warnings: [],
            errorMessage: null,
            candidateCounts: {
              total: 1,
              autoApplied: 0,
              needsReview: 1,
              rejected: 0,
              abstained: 0,
            },
          },
        ],
        resumeImportFieldCandidates: [
          {
            id: reviewCandidateId,
            runId: latestRunId,
            target: {
              section: "contact",
              key: "portfolioUrl",
              recordId: null,
            },
            label: "Portfolio URL",
            sourceKind: "parser_literal",
            value: "https://jamie.dev",
            normalizedValue: null,
            valuePreview: "https://jamie.dev",
            evidenceText: "https://jamie.dev",
            sourceBlockIds: [],
            confidence: 0.92,
            confidenceBreakdown: {
              overall: 0.92,
              parserQuality: 0.96,
              evidenceQuality: 0.94,
              agreementScore: 0.9,
              normalizationRisk: 0.04,
              conflictRisk: 0.08,
              fieldSensitivity: "medium",
              recommendation: "needs_review",
            },
            notes: [],
            alternatives: [],
            resolution: "needs_review",
            resolutionReason: null,
            createdAt: "2026-04-14T08:52:00.000Z",
            resolvedAt: null,
          },
        ],
      },
    });

    const snapshot = await workspaceService.saveProfileAndSearchPreferences(
      {
        ...currentProfile,
        portfolioUrl: "https://jamie.dev",
      },
      seed.searchPreferences,
    );
    const run = await repository.getLatestResumeImportRun();
    const candidates = await repository.listResumeImportFieldCandidates({
      runId: latestRunId,
    });
    const reviewItem = snapshot.profileSetupState.reviewItems.find(
      (item) => item.id === "review_portfolio_resolution",
    );

    expect(snapshot.profile.portfolioUrl).toBe("https://jamie.dev");
    expect(reviewItem?.status).toBe("confirmed");
    expect(reviewItem?.resolvedAt).toBeTruthy();
    expect(run?.status).toBe("applied");
    expect(candidates[0]).toEqual(
      expect.objectContaining({
        resolution: "auto_applied",
        resolutionReason: "review_confirmed",
      }),
    );
  });

  test("assistant-applied profile edits persist setup review resolution semantics on the saved snapshot", async () => {
    const seed = createSeed();
    const latestRunId = "resume_import_run_assistant_resolution";
    const reviewCandidateId = "candidate_headline_assistant_resolution";
    const { workspaceService } = createWorkspaceServiceHarness({
      seed: {
        ...seed,
        profile: {
          ...seed.profile,
          headline: "Senior systems designer",
        },
        profileSetupState: {
          status: "in_progress",
          currentStep: "essentials",
          completedAt: null,
          reviewItems: [
            {
              id: "review_headline_assistant_resolution",
              step: "essentials",
              target: {
                domain: "identity",
                key: "headline",
                recordId: null,
              },
              label: "Headline",
              reason: "Confirm the imported headline before setup is complete.",
              severity: "recommended",
              status: "pending",
              proposedValue: "Principal Product Designer",
              sourceSnippet: "Principal Product Designer",
              sourceCandidateId: reviewCandidateId,
              sourceRunId: latestRunId,
              createdAt: "2026-04-12T09:00:00.000Z",
              resolvedAt: null,
            },
          ],
          lastResumedAt: null,
        },
        resumeImportRuns: [
          {
            id: latestRunId,
            sourceResumeId: seed.profile.baseResume.id,
            sourceResumeFileName: seed.profile.baseResume.fileName,
            trigger: "refresh",
            status: "review_ready",
            startedAt: "2026-04-12T08:50:00.000Z",
            completedAt: "2026-04-12T08:55:00.000Z",
            primaryParserKind: "plain_text",
            parserKinds: ["plain_text"],
            analysisProviderKind: "deterministic",
            analysisProviderLabel: "Test AI",
            warnings: [],
            errorMessage: null,
            candidateCounts: {
              total: 1,
              autoApplied: 0,
              needsReview: 1,
              rejected: 0,
              abstained: 0,
            },
          },
        ],
        resumeImportFieldCandidates: [
          {
            id: reviewCandidateId,
            runId: latestRunId,
            target: {
              section: "identity",
              key: "headline",
              recordId: null,
            },
            label: "Headline",
            sourceKind: "model_identity_summary",
            value: "Principal Product Designer",
            normalizedValue: null,
            valuePreview: "Principal Product Designer",
            evidenceText: "Principal Product Designer",
            sourceBlockIds: [],
            confidence: 0.82,
            confidenceBreakdown: {
              overall: 0.82,
              parserQuality: 0.9,
              evidenceQuality: 0.84,
              agreementScore: 0.8,
              normalizationRisk: 0.06,
              conflictRisk: 0.16,
              fieldSensitivity: "medium",
              recommendation: "needs_review",
            },
            notes: [],
            alternatives: [],
            resolution: "needs_review",
            resolutionReason: null,
            createdAt: "2026-04-12T08:52:00.000Z",
            resolvedAt: null,
          },
        ],
      },
    });

    const snapshot = await workspaceService.sendProfileCopilotMessage(
      'Update my headline to "Principal Product Designer"',
      {
        surface: "setup",
        step: "essentials",
      },
    );

    const resolvedItem = snapshot.profileSetupState.reviewItems.find(
      (item) => item.id === "review_headline_assistant_resolution",
    );

    expect(snapshot.profile.headline).toBe("Principal Product Designer");
    expect(resolvedItem?.status).toBe("confirmed");
    expect(resolvedItem?.resolvedAt).toBeTruthy();
  });
});
