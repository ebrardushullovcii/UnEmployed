import { describe, expect, test } from "vitest";
import {
  createInMemoryJobFinderRepository,
} from "./index";
import { createSeed } from "./test-fixtures";

describe("createInMemoryJobFinderRepository", () => {
  test("returns cloned values and supports asset and attempt upserts", async () => {
    const repository = createInMemoryJobFinderRepository(createSeed());
    const profile = await repository.getProfile();

    profile.fullName = "Changed locally";

    const freshProfile = await repository.getProfile();

    expect(freshProfile.fullName).toBe("Alex Vanguard");

    await repository.upsertTailoredAsset({
      id: "asset_1",
      jobId: "job_1",
      kind: "resume",
      status: "ready",
      label: "Tailored Resume",
      version: "v1",
      templateName: "Classic ATS",
      compatibilityScore: 98,
      progressPercent: 100,
      updatedAt: "2026-03-20T10:05:00.000Z",
      storagePath: null,
      contentText: "Resume text",
      previewSections: [],
      generationMethod: "deterministic",
      notes: [],
    });

    await repository.upsertApplicationAttempt({
      id: "attempt_1",
      jobId: "job_1",
      state: "submitted",
      summary: "Easy Apply submitted",
      detail: "Submitted successfully.",
      startedAt: "2026-03-20T10:04:00.000Z",
      updatedAt: "2026-03-20T10:05:00.000Z",
      completedAt: "2026-03-20T10:05:00.000Z",
      outcome: "submitted",
      questions: [],
      blocker: null,
      consentDecisions: [],
      replay: {
        sourceInstructionArtifactId: null,
        sourceDebugEvidenceRefIds: [],
        lastUrl: "https://jobs.example.com/roles/job_1/apply",
        checkpointUrls: ["https://jobs.example.com/roles/job_1/apply"],
      },
      nextActionLabel: "Monitor inbox",
      checkpoints: [],
    });

    const assets = await repository.listTailoredAssets();
    const attempts = await repository.listApplicationAttempts();

    expect(assets).toHaveLength(1);
    expect(assets[0]?.contentText).toBe("Resume text");
    expect(attempts[0]?.state).toBe("submitted");

    await repository.reset(createSeed());

    const resetAssets = await repository.listTailoredAssets();
    const resetAttempts = await repository.listApplicationAttempts();

    expect(resetAssets).toHaveLength(0);
    expect(resetAttempts).toHaveLength(0);
  });

  test("stores and resets profile setup state", async () => {
    const repository = createInMemoryJobFinderRepository(createSeed());

    await repository.saveProfileSetupState({
      status: "in_progress",
      currentStep: "targeting",
      completedAt: null,
      reviewItems: [
        {
          id: "review_1",
          step: "essentials",
          target: { domain: "identity", key: "headline", recordId: null },
          label: "Headline",
          reason: "Headline still needs a quick confirmation.",
          severity: "recommended",
          status: "pending",
          proposedValue: "Senior Product Designer",
          sourceSnippet: "Senior Product Designer",
          sourceCandidateId: null,
          sourceRunId: null,
          createdAt: "2026-04-11T10:00:00.000Z",
          resolvedAt: null,
        },
      ],
      lastResumedAt: "2026-04-11T10:05:00.000Z",
    });

    await expect(repository.getProfileSetupState()).resolves.toEqual(
      expect.objectContaining({
        status: "in_progress",
        currentStep: "targeting",
      }),
    );

    await repository.reset(createSeed());

    await expect(repository.getProfileSetupState()).resolves.toEqual(
      expect.objectContaining({
        status: "completed",
        currentStep: "ready_check",
      }),
    );
  });

  test("stores resume workspace collections with the expected ordering", async () => {
    const repository = createInMemoryJobFinderRepository(createSeed());

    await repository.upsertResumeDraft({
      id: "resume_draft_old",
      jobId: "job_1",
      status: "draft",
      templateId: "classic_ats",
      sections: [],
      targetPageCount: 2,
      generationMethod: "manual",
      approvedAt: null,
      approvedExportId: null,
      staleReason: null,
      createdAt: "2026-03-20T10:00:00.000Z",
      updatedAt: "2026-03-20T10:00:00.000Z",
    });
    await repository.upsertResumeDraft({
      id: "resume_draft_new",
      jobId: "job_1",
      status: "needs_review",
      templateId: "classic_ats",
      sections: [],
      targetPageCount: 2,
      generationMethod: "ai",
      approvedAt: null,
      approvedExportId: null,
      staleReason: null,
      createdAt: "2026-03-20T10:05:00.000Z",
      updatedAt: "2026-03-20T10:06:00.000Z",
    });
    await repository.upsertResumeDraftRevision({
      id: "revision_1",
      draftId: "resume_draft_new",
      snapshotSections: [],
      createdAt: "2026-03-20T10:06:30.000Z",
      reason: "Initial save",
    });
    await repository.upsertResumeExportArtifact({
      id: "resume_export_1",
      draftId: "resume_draft_new",
      jobId: "job_1",
      format: "pdf",
      filePath: "/tmp/resume-1.pdf",
      pageCount: 2,
      templateId: "classic_ats",
      exportedAt: "2026-03-20T10:07:00.000Z",
      isApproved: false,
    });
    await repository.upsertResumeResearchArtifact({
      id: "resume_research_1",
      jobId: "job_1",
      sourceUrl: "https://example.com/about",
      pageTitle: "About",
      fetchedAt: "2026-03-20T10:04:00.000Z",
      extractedText: "Example about page.",
      companyNotes: null,
      domainVocabulary: ["workflow"],
      priorityThemes: ["systems"],
      fetchStatus: "success",
    });
    await repository.upsertResumeValidationResult({
      id: "resume_validation_1",
      draftId: "resume_draft_new",
      issues: [],
      pageCount: 2,
      validatedAt: "2026-03-20T10:06:45.000Z",
    });
    await repository.upsertResumeAssistantMessage({
      id: "assistant_message_1",
      jobId: "job_1",
      role: "assistant",
      content: "Tightened the summary.",
      patches: [],
      createdAt: "2026-03-20T10:06:40.000Z",
    });

    await expect(repository.getResumeDraftByJobId("job_1")).resolves.toEqual(
      expect.objectContaining({ id: "resume_draft_new" }),
    );
    await expect(repository.listResumeDrafts()).resolves.toEqual([
      expect.objectContaining({ id: "resume_draft_new" }),
      expect.objectContaining({ id: "resume_draft_old" }),
    ]);
    await expect(
      repository.listResumeDraftRevisions("resume_draft_new"),
    ).resolves.toEqual([expect.objectContaining({ id: "revision_1" })]);
    await expect(
      repository.listResumeExportArtifacts({ jobId: "job_1" }),
    ).resolves.toEqual([expect.objectContaining({ id: "resume_export_1" })]);
    await expect(repository.listResumeResearchArtifacts("job_1")).resolves.toEqual([
      expect.objectContaining({ id: "resume_research_1" }),
    ]);
    await expect(
      repository.listResumeValidationResults("resume_draft_new"),
    ).resolves.toEqual([expect.objectContaining({ id: "resume_validation_1" })]);
    await expect(repository.listResumeAssistantMessages("job_1")).resolves.toEqual([
      expect.objectContaining({ id: "assistant_message_1" }),
    ]);
  });

  test("stores profile copilot messages and revisions with the expected ordering", async () => {
    const repository = createInMemoryJobFinderRepository(createSeed());
    const seed = createSeed();

    await repository.upsertProfileCopilotMessage({
      id: "profile_message_older",
      role: "assistant",
      content: "I found a few profile improvements.",
      context: { surface: "general" },
      patchGroups: [],
      createdAt: "2026-04-11T10:05:00.000Z",
    });
    await repository.upsertProfileCopilotMessage({
      id: "profile_message_newer",
      role: "assistant",
      content: "I can tighten your headline for product roles.",
      context: { surface: "setup", step: "essentials" },
      patchGroups: [
        {
          id: "profile_patch_group_1",
          summary: "Refine your headline",
          applyMode: "needs_review",
          operations: [
            {
              operation: "replace_identity_fields",
              value: {
                headline: "Principal Product Designer",
              },
            },
          ],
          createdAt: "2026-04-11T10:06:00.000Z",
        },
      ],
      createdAt: "2026-04-11T10:06:00.000Z",
    });

    await repository.upsertProfileRevision({
      id: "profile_revision_older",
      createdAt: "2026-04-11T10:06:30.000Z",
      reason: "Applied a safe headline refinement.",
      trigger: "assistant_patch",
      messageId: "profile_message_newer",
      patchGroupId: "profile_patch_group_1",
      restoredFromRevisionId: null,
      snapshotProfile: seed.profile,
      snapshotSearchPreferences: seed.searchPreferences,
      snapshotProfileSetupState: seed.profileSetupState,
    });
    await repository.upsertProfileRevision({
      id: "profile_revision_newer",
      createdAt: "2026-04-11T10:07:00.000Z",
      reason: "Undid the last assistant suggestion.",
      trigger: "undo",
      messageId: null,
      patchGroupId: "profile_patch_group_1",
      restoredFromRevisionId: "profile_revision_older",
      snapshotProfile: {
        ...seed.profile,
        headline: "Principal Product Designer",
      },
      snapshotSearchPreferences: seed.searchPreferences,
      snapshotProfileSetupState: {
        ...seed.profileSetupState,
        status: "in_progress",
        currentStep: "essentials",
        completedAt: null,
      },
    });

    await expect(repository.listProfileCopilotMessages()).resolves.toEqual([
      expect.objectContaining({ id: "profile_message_older" }),
      expect.objectContaining({
        id: "profile_message_newer",
        patchGroups: [expect.objectContaining({ id: "profile_patch_group_1" })],
      }),
    ]);
    await expect(repository.listProfileRevisions()).resolves.toEqual([
      expect.objectContaining({ id: "profile_revision_newer" }),
      expect.objectContaining({ id: "profile_revision_older" }),
    ]);

    await repository.reset(createSeed());

    await expect(repository.listProfileCopilotMessages()).resolves.toEqual([]);
    await expect(repository.listProfileRevisions()).resolves.toEqual([]);
  });

  test("commits profile copilot state atomically", async () => {
    const seed = createSeed();
    const repository = createInMemoryJobFinderRepository(seed);

    await repository.commitProfileCopilotState({
      profile: {
        ...seed.profile,
        headline: "Principal Product Designer",
      },
      searchPreferences: {
        ...seed.searchPreferences,
        targetSalaryUsd: 220000,
      },
      profileSetupState: {
        ...seed.profileSetupState,
        status: "in_progress",
        currentStep: "essentials",
        completedAt: null,
      },
      messages: [
        {
          id: "profile_message_atomic",
          role: "assistant",
          content: "Applied a safe profile update.",
          context: { surface: "setup", step: "essentials" },
          patchGroups: [],
          createdAt: "2026-04-15T10:00:00.000Z",
        },
      ],
      revisions: [
        {
          id: "profile_revision_atomic",
          createdAt: "2026-04-15T10:00:01.000Z",
          reason: "Atomic assistant patch.",
          trigger: "assistant_patch",
          messageId: "profile_message_atomic",
          patchGroupId: null,
          restoredFromRevisionId: null,
          snapshotProfile: seed.profile,
          snapshotSearchPreferences: seed.searchPreferences,
          snapshotProfileSetupState: seed.profileSetupState,
        },
      ],
    });

    await expect(repository.getProfile()).resolves.toEqual(
      expect.objectContaining({ headline: "Principal Product Designer" }),
    );
    await expect(repository.getSearchPreferences()).resolves.toEqual(
      expect.objectContaining({ targetSalaryUsd: 220000 }),
    );
    await expect(repository.getProfileSetupState()).resolves.toEqual(
      expect.objectContaining({ status: "in_progress", currentStep: "essentials" }),
    );
    await expect(repository.listProfileCopilotMessages()).resolves.toEqual([
      expect.objectContaining({ id: "profile_message_atomic" }),
    ]);
    await expect(repository.listProfileRevisions()).resolves.toEqual([
      expect.objectContaining({ id: "profile_revision_atomic" }),
    ]);
  });

  test("applies aggregate resume approval updates atomically", async () => {
    const repository = createInMemoryJobFinderRepository(createSeed());

    await repository.upsertResumeExportArtifact({
      id: "resume_export_old",
      draftId: "resume_draft_1",
      jobId: "job_1",
      format: "pdf",
      filePath: "/tmp/old.pdf",
      pageCount: 2,
      templateId: "classic_ats",
      exportedAt: "2026-03-20T10:00:00.000Z",
      isApproved: true,
    });

    await repository.approveResumeExport({
      draft: {
        id: "resume_draft_1",
        jobId: "job_1",
        status: "approved",
        templateId: "classic_ats",
        sections: [],
        targetPageCount: 2,
        generationMethod: "ai",
        approvedAt: "2026-03-20T10:07:00.000Z",
        approvedExportId: "resume_export_new",
        staleReason: null,
        createdAt: "2026-03-20T10:00:00.000Z",
        updatedAt: "2026-03-20T10:07:00.000Z",
      },
      exportArtifact: {
        id: "resume_export_new",
        draftId: "resume_draft_1",
        jobId: "job_1",
        format: "pdf",
        filePath: "/tmp/new.pdf",
        pageCount: 2,
        templateId: "classic_ats",
        exportedAt: "2026-03-20T10:07:00.000Z",
        isApproved: true,
      },
      validation: {
        id: "resume_validation_1",
        draftId: "resume_draft_1",
        issues: [],
        pageCount: 2,
        validatedAt: "2026-03-20T10:06:50.000Z",
      },
      tailoredAsset: {
        id: "asset_1",
        jobId: "job_1",
        kind: "resume",
        status: "ready",
        label: "Tailored Resume",
        version: "v2",
        templateName: "Classic ATS",
        compatibilityScore: 97,
        progressPercent: 100,
        updatedAt: "2026-03-20T10:07:00.000Z",
        storagePath: "/tmp/new.pdf",
        contentText: "Resume text",
        previewSections: [],
        generationMethod: "ai_assisted",
        notes: [],
      },
    });

    const exports = await repository.listResumeExportArtifacts({ jobId: "job_1" });
    const draft = await repository.getResumeDraftByJobId("job_1");
    const tailoredAssets = await repository.listTailoredAssets();

    expect(exports.find((entry) => entry.id === "resume_export_new")?.isApproved).toBe(
      true,
    );
    expect(exports.find((entry) => entry.id === "resume_export_old")?.isApproved).toBe(
      false,
    );
    expect(draft?.approvedExportId).toBe("resume_export_new");
    expect(tailoredAssets[0]?.storagePath).toBe("/tmp/new.pdf");
  });

  test("clears approved export flags when a draft becomes stale", async () => {
    const repository = createInMemoryJobFinderRepository(createSeed());

    await repository.upsertResumeExportArtifact({
      id: "resume_export_old",
      draftId: "resume_draft_1",
      jobId: "job_1",
      format: "pdf",
      filePath: "/tmp/old.pdf",
      pageCount: 2,
      templateId: "classic_ats",
      exportedAt: "2026-03-20T10:00:00.000Z",
      isApproved: true,
    });

    await repository.saveResumeDraftWithValidation({
      draft: {
        id: "resume_draft_1",
        jobId: "job_1",
        status: "stale",
        templateId: "classic_ats",
        sections: [],
        targetPageCount: 2,
        generationMethod: "ai",
        approvedAt: null,
        approvedExportId: null,
        staleReason: "Draft changed after approval and needs a fresh review.",
        createdAt: "2026-03-20T10:00:00.000Z",
        updatedAt: "2026-03-20T10:08:00.000Z",
      },
      validation: {
        id: "resume_validation_1",
        draftId: "resume_draft_1",
        issues: [],
        pageCount: 2,
        validatedAt: "2026-03-20T10:08:00.000Z",
      },
      tailoredAsset: {
        id: "asset_1",
        jobId: "job_1",
        kind: "resume",
        status: "ready",
        label: "Tailored Resume",
        version: "v2",
        templateName: "Classic ATS",
        compatibilityScore: 97,
        progressPercent: 100,
        updatedAt: "2026-03-20T10:08:00.000Z",
        storagePath: null,
        contentText: "Resume text",
        previewSections: [],
        generationMethod: "ai_assisted",
        notes: [],
      },
    });

    const exports = await repository.listResumeExportArtifacts({ jobId: "job_1" });

    expect(exports.find((entry) => entry.id === "resume_export_old")?.isApproved).toBe(
      false,
    );
  });

  test("finalizes resume import state atomically", async () => {
    const seed = createSeed();
    const repository = createInMemoryJobFinderRepository(seed);

    await repository.finalizeResumeImportRun({
      profile: {
        ...seed.profile,
        fullName: "Taylor Rivera",
      },
      searchPreferences: {
        ...seed.searchPreferences,
        targetRoles: ["Staff Product Designer"],
      },
      run: {
        id: "resume_import_run_atomic",
        sourceResumeId: seed.profile.baseResume.id,
        sourceResumeFileName: seed.profile.baseResume.fileName,
        trigger: "import",
        status: "applied",
        startedAt: "2026-04-15T10:10:00.000Z",
        completedAt: "2026-04-15T10:10:10.000Z",
        primaryParserKind: "plain_text",
        parserKinds: ["plain_text"],
        analysisProviderKind: null,
        analysisProviderLabel: null,
        warnings: [],
        errorMessage: null,
        candidateCounts: {
          total: 1,
          autoApplied: 1,
          needsReview: 0,
          rejected: 0,
          abstained: 0,
        },
      },
      documentBundles: [
        {
          id: "resume_bundle_atomic",
          runId: "resume_import_run_atomic",
          sourceResumeId: seed.profile.baseResume.id,
          sourceFileKind: "plain_text",
          primaryParserKind: "plain_text",
          parserKinds: ["plain_text"],
          createdAt: "2026-04-15T10:10:00.000Z",
          languageHints: [],
          warnings: [],
          pages: [],
          blocks: [],
          fullText: "Taylor Rivera",
        },
      ],
      fieldCandidates: [
        {
          id: "resume_candidate_atomic",
          runId: "resume_import_run_atomic",
          target: { section: "identity", key: "fullName", recordId: null },
          sourceKind: "parser_literal",
          resolution: "auto_applied",
          label: "Full name",
          value: "Taylor Rivera",
          normalizedValue: "Taylor Rivera",
          valuePreview: "Taylor Rivera",
          sourceBlockIds: [],
          evidenceText: "Taylor Rivera",
          confidence: 0.99,
          confidenceBreakdown: null,
          notes: [],
          alternatives: [],
          createdAt: "2026-04-15T10:10:05.000Z",
          resolvedAt: "2026-04-15T10:10:10.000Z",
          resolutionReason: "grounded_literal_match",
        },
      ],
    });

    await expect(repository.getProfile()).resolves.toEqual(
      expect.objectContaining({ fullName: "Taylor Rivera" }),
    );
    await expect(repository.getSearchPreferences()).resolves.toEqual(
      expect.objectContaining({ targetRoles: ["Staff Product Designer"] }),
    );
    await expect(repository.getLatestResumeImportRun(seed.profile.baseResume.id)).resolves.toEqual(
      expect.objectContaining({ id: "resume_import_run_atomic", status: "applied" }),
    );
    await expect(
      repository.listResumeImportDocumentBundles({ runId: "resume_import_run_atomic" }),
    ).resolves.toEqual([expect.objectContaining({ id: "resume_bundle_atomic" })]);
    await expect(
      repository.listResumeImportFieldCandidates({ runId: "resume_import_run_atomic" }),
    ).resolves.toEqual([expect.objectContaining({ id: "resume_candidate_atomic" })]);
  });

  test("atomically replaces saved jobs while clearing resume approval", async () => {
    const seed = createSeed();
    seed.savedJobs = [
      {
        id: "job_ready",
        source: "target_site",
        sourceJobId: "target_job_ready",
        discoveryMethod: "catalog_seed",
        canonicalUrl: "https://jobs.example.com/roles/target_job_ready",
        applicationUrl: "https://jobs.example.com/roles/target_job_ready/apply",
        title: "Lead Designer",
        company: "Signal Systems",
        location: "Remote",
        workMode: ["remote"],
        applyPath: "easy_apply",
        easyApplyEligible: true,
        postedAt: "2026-03-20T10:00:00.000Z",
        postedAtText: null,
        discoveredAt: "2026-03-20T10:01:00.000Z",
        firstSeenAt: "2026-03-20T10:01:00.000Z",
        lastSeenAt: "2026-03-20T10:01:00.000Z",
        lastVerifiedActiveAt: "2026-03-20T10:01:00.000Z",
        salaryText: "$180k",
        normalizedCompensation: {
          currency: "USD",
          interval: "year",
          minAmount: 180000,
          maxAmount: 180000,
          minAnnualUsd: 180000,
          maxAnnualUsd: 180000,
        },
        summary: "Lead product design.",
        description: "Lead product design for operational software.",
        keySkills: ["Figma"],
        responsibilities: [],
        minimumQualifications: [],
        preferredQualifications: [],
        seniority: null,
        employmentType: null,
        department: null,
        team: null,
        employerWebsiteUrl: null,
        employerDomain: null,
        atsProvider: null,
        screeningHints: {
          sponsorshipText: null,
          requiresSecurityClearance: null,
          relocationText: null,
          travelText: null,
          remoteGeographies: [],
        },
        keywordSignals: [],
        benefits: [],
        status: "ready_for_review",
        matchAssessment: {
          score: 94,
          reasons: ["Strong overlap"],
          gaps: [],
        },
        provenance: [],
      },
    ];
    const repository = createInMemoryJobFinderRepository(seed);

    await repository.upsertResumeDraft({
      id: "resume_draft_1",
      jobId: "job_ready",
      status: "approved",
      templateId: "classic_ats",
      sections: [],
      targetPageCount: 2,
      generationMethod: "ai",
      approvedAt: "2026-03-20T10:07:00.000Z",
      approvedExportId: "resume_export_old",
      staleReason: null,
      createdAt: "2026-03-20T10:00:00.000Z",
      updatedAt: "2026-03-20T10:07:00.000Z",
    });
    await repository.upsertResumeExportArtifact({
      id: "resume_export_old",
      draftId: "resume_draft_1",
      jobId: "job_ready",
      format: "pdf",
      filePath: "/tmp/old.pdf",
      pageCount: 2,
      templateId: "classic_ats",
      exportedAt: "2026-03-20T10:06:00.000Z",
      isApproved: true,
    });

    const savedJobs = await repository.listSavedJobs();
    const nextJobs = savedJobs.map((job) =>
      job.id === "job_ready"
        ? { ...job, description: `${job.description} Updated.` }
        : job,
    );

    await repository.replaceSavedJobsAndClearResumeApproval({
      savedJobs: nextJobs,
      draft: {
        id: "resume_draft_1",
        jobId: "job_ready",
        status: "stale",
        templateId: "classic_ats",
        sections: [],
        targetPageCount: 2,
        generationMethod: "ai",
        approvedAt: null,
        approvedExportId: null,
        staleReason: "Saved job details changed after approval and the resume needs a fresh review.",
        createdAt: "2026-03-20T10:00:00.000Z",
        updatedAt: "2026-03-20T10:08:00.000Z",
      },
      staleReason:
        "Saved job details changed after approval and the resume needs a fresh review.",
      tailoredAsset: {
        id: "asset_ready",
        jobId: "job_ready",
        kind: "resume",
        status: "ready",
        label: "Tailored Resume",
        version: "v2",
        templateName: "Classic ATS",
        compatibilityScore: 97,
        progressPercent: 100,
        updatedAt: "2026-03-20T10:08:00.000Z",
        storagePath: null,
        contentText: "Resume text",
        previewSections: [],
        generationMethod: "deterministic",
        notes: [],
      },
    });

    const refreshedJobs = await repository.listSavedJobs();
    const refreshedDraft = await repository.getResumeDraftByJobId("job_ready");
    const exports = await repository.listResumeExportArtifacts({ jobId: "job_ready" });
    const assets = await repository.listTailoredAssets();

    expect(refreshedJobs.find((job) => job.id === "job_ready")?.description).toMatch(
      /Updated\./,
    );
    expect(refreshedDraft?.status).toBe("stale");
    expect(refreshedDraft?.approvedExportId).toBeNull();
    expect(exports.find((entry) => entry.id === "resume_export_old")?.isApproved).toBe(
      false,
    );
    expect(assets.find((asset) => asset.jobId === "job_ready")?.storagePath).toBeNull();
  });
});
