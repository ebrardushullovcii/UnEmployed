import { describe, expect, test } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { JobFinderRepositorySeed } from "./index";
import {
  createFileJobFinderRepository,
  createInMemoryJobFinderRepository,
} from "./index";

function createSeed(): JobFinderRepositorySeed {
  return {
    profile: {
      id: "candidate_1",
      firstName: "Alex",
      lastName: "Vanguard",
      middleName: null,
      fullName: "Alex Vanguard",
      preferredDisplayName: null,
      headline: "Senior systems designer",
      summary: "Builds resilient workflows.",
      currentLocation: "London, UK",
      currentCity: null,
      currentRegion: null,
      currentCountry: null,
      timeZone: null,
      yearsExperience: 10,
      email: "alex@example.com",
      secondaryEmail: null,
      phone: null,
      portfolioUrl: null,
      linkedinUrl: null,
      githubUrl: null,
      personalWebsiteUrl: null,
      baseResume: {
        id: "resume_1",
        fileName: "alex-vanguard.pdf",
        uploadedAt: "2026-03-20T10:00:00.000Z",
        storagePath: "/tmp/alex-vanguard.pdf",
        textContent: "Alex Vanguard\nSenior systems designer\nReact\nFigma",
        textUpdatedAt: "2026-03-20T10:00:00.000Z",
        extractionStatus: "ready",
        lastAnalyzedAt: "2026-03-20T10:01:00.000Z",
        analysisProviderKind: null,
        analysisProviderLabel: null,
        analysisWarnings: [],
      },
      workEligibility: {
        authorizedWorkCountries: [],
        requiresVisaSponsorship: null,
        willingToRelocate: null,
        preferredRelocationRegions: [],
        willingToTravel: null,
        remoteEligible: null,
        noticePeriodDays: null,
        availableStartDate: null,
        securityClearance: null,
      },
      professionalSummary: {
        shortValueProposition: null,
        fullSummary: null,
        careerThemes: [],
        leadershipSummary: null,
        domainFocusSummary: null,
        strengths: [],
      },
      skillGroups: {
        coreSkills: [],
        tools: [],
        languagesAndFrameworks: [],
        softSkills: [],
        highlightedSkills: [],
      },
      targetRoles: ["Principal Designer"],
      locations: ["Remote"],
      skills: ["Figma", "React"],
      experiences: [],
      education: [],
      certifications: [],
      links: [],
      projects: [],
      spokenLanguages: [],
    },
    searchPreferences: {
      targetRoles: ["Principal Designer"],
      jobFamilies: [],
      locations: ["Remote"],
      excludedLocations: [],
      workModes: ["remote"],
      seniorityLevels: ["senior"],
      targetIndustries: [],
      targetCompanyStages: [],
      employmentTypes: [],
      minimumSalaryUsd: 170000,
      targetSalaryUsd: null,
      salaryCurrency: "USD",
      approvalMode: "review_before_submit" as const,
      tailoringMode: "balanced" as const,
      companyBlacklist: [],
      companyWhitelist: [],
      discovery: {
        historyLimit: 5,
        targets: [
          {
            id: "target_primary",
            label: "Primary target",
            startingUrl: "https://jobs.example.com/search",
            enabled: true,
            adapterKind: "auto" as const,
            customInstructions: null,
            instructionStatus: "missing" as const,
            validatedInstructionId: null,
            draftInstructionId: null,
            lastDebugRunId: null,
            lastVerifiedAt: null,
            staleReason: null,
          },
        ],
      },
    },
    savedJobs: [],
    tailoredAssets: [],
    resumeDrafts: [],
    resumeDraftRevisions: [],
    resumeExportArtifacts: [],
    resumeResearchArtifacts: [],
    resumeValidationResults: [],
    resumeAssistantMessages: [],
    applicationRecords: [],
    applicationAttempts: [],
    sourceDebugRuns: [],
    sourceDebugAttempts: [],
    sourceInstructionArtifacts: [],
    sourceDebugEvidenceRefs: [],
    settings: {
      resumeFormat: "html" as const,
      resumeTemplateId: "classic_ats" as const,
      fontPreset: "inter_requisite" as const,
      humanReviewRequired: true,
      allowAutoSubmitOverride: false,
      keepSessionAlive: true,
      discoveryOnly: false,
    },
    discovery: {
      sessions: [],
      runState: "idle" as const,
      activeRun: null,
      recentRuns: [],
      activeSourceDebugRun: null,
      recentSourceDebugRuns: [],
      pendingDiscoveryJobs: [],
    },
  };
}

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
    ).resolves.toEqual([
      expect.objectContaining({ id: "resume_validation_1" }),
    ]);
    await expect(repository.listResumeAssistantMessages("job_1")).resolves.toEqual([
      expect.objectContaining({ id: "assistant_message_1" }),
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

  test("falls back safely when legacy JSON contains stale saved job records", async () => {
    const tempDirectory = await mkdtemp(
      path.join(os.tmpdir(), "unemployed-db-legacy-"),
    );
    const filePath = path.join(tempDirectory, "job-finder-state.sqlite");
    const legacyPath = path.join(tempDirectory, "job-finder-state.json");
    let repository: Awaited<
      ReturnType<typeof createFileJobFinderRepository>
    > | null = null;

    try {
      await writeFile(
        legacyPath,
        JSON.stringify({
          ...createSeed(),
          savedJobs: [
            {
              id: "legacy_job_1",
              source: "target_site",
              title: "Legacy Role",
              company: "Old Co",
              location: "Remote",
              workMode: ["remote"],
              applyPath: "easy_apply",
              postedAt: "2026-03-20T10:00:00.000Z",
              salaryText: "$180k",
              summary: "Legacy data without new fields.",
              keySkills: [],
            },
          ],
        }),
      );

      repository = await createFileJobFinderRepository({
        filePath,
        seed: createSeed(),
      });
      const savedJobs = await repository.listSavedJobs();

      expect(savedJobs).toEqual([]);
    } finally {
      if (repository) {
        await repository.close();
      }
      await rm(tempDirectory, { recursive: true, force: true });
    }
  });

  test("deletes only source instruction artifacts for the requested target in file storage", async () => {
    const tempDirectory = await mkdtemp(
      path.join(os.tmpdir(), "unemployed-db-artifacts-"),
    );
    const filePath = path.join(tempDirectory, "job-finder-state.sqlite");
    let repository: Awaited<
      ReturnType<typeof createFileJobFinderRepository>
    > | null = null;

    try {
      repository = await createFileJobFinderRepository({
        filePath,
        seed: createSeed(),
      });

      const baseArtifact = {
        status: "draft" as const,
        createdAt: "2026-03-20T10:01:00.000Z",
        updatedAt: "2026-03-20T10:02:00.000Z",
        acceptedAt: null,
        basedOnRunId: "source_debug_run_1",
        basedOnAttemptIds: ["source_debug_attempt_1"],
        notes: null,
        navigationGuidance: ["Start from the jobs route."],
        searchGuidance: ["Use the visible search box."],
        detailGuidance: [],
        applyGuidance: [],
        warnings: [],
        versionInfo: {
          promptProfileVersion: "source-debug-v1",
          toolsetVersion: "browser-tools-v1",
          adapterVersion: "target_site",
          appSchemaVersion: "job-finder-source-debug-v1",
        },
        verification: null,
      };

      await repository.upsertSourceInstructionArtifact({
        ...baseArtifact,
        id: "source_instruction_primary",
        targetId: "target_primary",
      });
      await repository.upsertSourceInstructionArtifact({
        ...baseArtifact,
        id: "source_instruction_secondary",
        targetId: "target_secondary",
      });

      await repository.deleteSourceInstructionArtifactsForTarget(
        "target_primary",
      );

      await expect(repository.listSourceInstructionArtifacts()).resolves.toEqual([
        expect.objectContaining({
          id: "source_instruction_secondary",
          targetId: "target_secondary",
        }),
      ]);
    } finally {
      if (repository) {
        await repository.close();
      }
      await rm(tempDirectory, { recursive: true, force: true });
    }
  });

  test("migrates legacy string workMode values in saved jobs and experiences", async () => {
    const tempDirectory = await mkdtemp(
      path.join(os.tmpdir(), "unemployed-db-work-mode-"),
    );
    const filePath = path.join(tempDirectory, "job-finder-state.sqlite");
    const legacyPath = path.join(tempDirectory, "job-finder-state.json");
    let repository: Awaited<
      ReturnType<typeof createFileJobFinderRepository>
    > | null = null;

    try {
      await writeFile(
        legacyPath,
        JSON.stringify({
          ...createSeed(),
          profile: {
            ...createSeed().profile,
            experiences: [
              {
                id: "experience_1",
                companyName: "Signal Systems",
                companyUrl: null,
                title: "Senior systems designer",
                employmentType: "Full-time",
                location: "London, UK",
                workMode: "hybrid",
                startDate: "2020-01",
                endDate: null,
                isCurrent: true,
                isDraft: false,
                summary: "Builds resilient workflows.",
                achievements: [],
                skills: [],
                domainTags: [],
                peopleManagementScope: null,
                ownershipScope: null,
              },
            ],
          },
          savedJobs: [
            {
              id: "job_legacy",
              source: "target_site",
              sourceJobId: "target_job_legacy",
              discoveryMethod: "catalog_seed",
              canonicalUrl: "https://jobs.example.com/roles/target_job_legacy",
              title: "Lead Designer",
              company: "Signal Systems",
              location: "Remote",
              workMode: "remote",
              applyPath: "easy_apply",
              easyApplyEligible: true,
              postedAt: "2026-03-20T10:00:00.000Z",
              postedAtText: null,
              discoveredAt: "2026-03-20T10:01:00.000Z",
              salaryText: "$180k",
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
              benefits: [],
              status: "ready_for_review",
              matchAssessment: {
                score: 94,
                reasons: ["Strong overlap"],
                gaps: [],
              },
              provenance: [],
            },
          ],
        }),
      );

      repository = await createFileJobFinderRepository({
        filePath,
        seed: createSeed(),
      });
      const [profile, savedJobs] = await Promise.all([
        repository.getProfile(),
        repository.listSavedJobs(),
      ]);

      expect(profile.experiences[0]?.workMode).toEqual(["hybrid"]);
      expect(savedJobs[0]?.workMode).toEqual(["remote"]);
    } finally {
      if (repository) {
        await repository.close();
      }
      await rm(tempDirectory, { recursive: true, force: true });
    }
  });

  test("migrates legacy source and adapter identifiers in restored JSON state", async () => {
    const tempDirectory = await mkdtemp(
      path.join(os.tmpdir(), "unemployed-db-source-kinds-"),
    );
    const filePath = path.join(tempDirectory, "job-finder-state.sqlite");
    const legacyPath = path.join(tempDirectory, "job-finder-state.json");
    let repository: Awaited<
      ReturnType<typeof createFileJobFinderRepository>
    > | null = null;

    try {
      await writeFile(
        legacyPath,
        JSON.stringify({
          ...createSeed(),
          searchPreferences: {
            ...createSeed().searchPreferences,
            discovery: {
              ...createSeed().searchPreferences.discovery,
              targets: [
                {
                  ...createSeed().searchPreferences.discovery.targets[0],
                  adapterKind: "linkedin",
                },
              ],
            },
          },
          savedJobs: [
            {
              id: "job_legacy_source",
              source: "generic_site",
              sourceJobId: "legacy_source_job",
              discoveryMethod: "catalog_seed",
              canonicalUrl: "https://jobs.example.com/roles/legacy_source_job",
              title: "Legacy Source Role",
              company: "Signal Systems",
              location: "Remote",
              workMode: ["remote"],
              applyPath: "easy_apply",
              easyApplyEligible: true,
              postedAt: "2026-03-20T10:00:00.000Z",
              postedAtText: null,
              discoveredAt: "2026-03-20T10:01:00.000Z",
              salaryText: "$180k",
              summary: "Legacy source mapping.",
              description: "Legacy source mapping.",
              keySkills: ["React"],
              responsibilities: [],
              minimumQualifications: [],
              preferredQualifications: [],
              seniority: null,
              employmentType: null,
              department: null,
              team: null,
              employerWebsiteUrl: null,
              employerDomain: null,
              benefits: [],
              status: "ready_for_review",
              matchAssessment: {
                score: 94,
                reasons: ["Strong overlap"],
                gaps: [],
              },
              provenance: [],
            },
          ],
          discovery: {
            ...createSeed().discovery,
            sessions: [
              {
                adapterKind: "linkedin",
                status: "ready",
                driver: "catalog_seed",
                label: "Legacy LinkedIn session",
                detail: "Restored from legacy state.",
                lastCheckedAt: "2026-03-20T10:02:00.000Z",
              },
            ],
          },
        }),
      );

      repository = await createFileJobFinderRepository({
        filePath,
        seed: createSeed(),
      });
      const [searchPreferences, savedJobs, discoveryState] = await Promise.all([
        repository.getSearchPreferences(),
        repository.listSavedJobs(),
        repository.getDiscoveryState(),
      ]);

      expect(searchPreferences.discovery.targets[0]?.adapterKind).toBe("auto");
      expect(savedJobs[0]?.source).toBe("target_site");
      expect(discoveryState.sessions[0]?.adapterKind).toBe("target_site");
    } finally {
      if (repository) {
        await repository.close();
      }
      await rm(tempDirectory, { recursive: true, force: true });
    }
  });

  test("normalizes persisted terminal source-debug runs that still carry an active phase", async () => {
    const tempDirectory = await mkdtemp(
      path.join(os.tmpdir(), "unemployed-db-persisted-source-debug-run-"),
    );
    const filePath = path.join(tempDirectory, "job-finder-state.sqlite");
    let firstRepository: Awaited<
      ReturnType<typeof createFileJobFinderRepository>
    > | null = null;
    let secondRepository: Awaited<
      ReturnType<typeof createFileJobFinderRepository>
    > | null = null;

    try {
      firstRepository = await createFileJobFinderRepository({
        filePath,
        seed: createSeed(),
      });
      await firstRepository.close();
      firstRepository = null;

      const legacyRun = {
        id: "legacy_source_debug_run",
        targetId: "target_primary",
        state: "completed",
        startedAt: "2026-03-20T10:00:00.000Z",
        updatedAt: "2026-03-20T10:10:00.000Z",
        completedAt: "2026-03-20T10:10:00.000Z",
        activePhase: "replay_verification",
        phases: [
          "access_auth_probe",
          "site_structure_mapping",
          "search_filter_probe",
          "job_detail_validation",
          "apply_path_validation",
          "replay_verification",
        ],
        targetLabel: "Primary target",
        targetUrl: "https://jobs.example.com/search",
        targetHostname: "jobs.example.com",
        manualPrerequisiteSummary: null,
        finalSummary: "Legacy finished run.",
        attemptIds: [],
        phaseSummaries: [],
        instructionArtifactId: null,
      };
      const database = new DatabaseSync(filePath);
      database
        .prepare(
          "INSERT OR REPLACE INTO singleton_state (key, value) VALUES (?, ?)",
        )
        .run(
          "discovery_state",
          JSON.stringify({
            ...createSeed().discovery,
            activeSourceDebugRun: legacyRun,
            recentSourceDebugRuns: [legacyRun],
          }),
        );
      database.close();

      secondRepository = await createFileJobFinderRepository({
        filePath,
        seed: createSeed(),
      });

      const discoveryState = await secondRepository.getDiscoveryState();

      expect(discoveryState.activeSourceDebugRun?.state).toBe("completed");
      expect(discoveryState.activeSourceDebugRun?.activePhase).toBeNull();
      expect(discoveryState.recentSourceDebugRuns[0]?.activePhase).toBeNull();
    } finally {
      if (secondRepository) {
        await secondRepository.close();
      }
      if (firstRepository) {
        await firstRepository.close();
      }
      await rm(tempDirectory, { recursive: true, force: true });
    }
  });

  test("persists repository state to a local sqlite file", async () => {
    const tempDirectory = await mkdtemp(
      path.join(os.tmpdir(), "unemployed-db-"),
    );
    const filePath = path.join(tempDirectory, "job-finder-state.sqlite");
    let firstRepository: Awaited<
      ReturnType<typeof createFileJobFinderRepository>
    > | null = null;
    let secondRepository: Awaited<
      ReturnType<typeof createFileJobFinderRepository>
    > | null = null;

    try {
      firstRepository = await createFileJobFinderRepository({
        filePath,
        seed: createSeed(),
      });

      await firstRepository.replaceSavedJobs([
        {
          id: "job_1",
          source: "target_site",
          sourceJobId: "target_job_1",
          discoveryMethod: "catalog_seed",
          canonicalUrl: "https://jobs.example.com/roles/target_job_1",
          title: "Lead Designer",
          company: "Signal Systems",
          location: "Remote",
          workMode: ["remote"],
          applyPath: "easy_apply",
          easyApplyEligible: true,
          postedAt: "2026-03-20T10:00:00.000Z",
          postedAtText: null,
          discoveredAt: "2026-03-20T10:01:00.000Z",
          salaryText: "$180k",
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
          benefits: [],
          status: "ready_for_review",
          matchAssessment: {
            score: 94,
            reasons: ["Strong overlap"],
            gaps: [],
          },
          provenance: [],
        },
      ]);

      await firstRepository.upsertApplicationAttempt({
        id: "attempt_1",
        jobId: "job_1",
        state: "submitted",
        summary: "Easy Apply submitted",
        detail: "Submitted successfully.",
        startedAt: "2026-03-20T10:04:00.000Z",
        updatedAt: "2026-03-20T10:05:00.000Z",
        completedAt: "2026-03-20T10:05:00.000Z",
        outcome: "submitted",
        nextActionLabel: "Monitor inbox",
        checkpoints: [],
      });

      secondRepository = await createFileJobFinderRepository({
        filePath,
        seed: createSeed(),
      });
      const savedJobs = await secondRepository.listSavedJobs();
      const attempts = await secondRepository.listApplicationAttempts();

      expect(savedJobs).toHaveLength(1);
      expect(savedJobs[0]?.canonicalUrl).toContain("target_job_1");
      expect(attempts).toHaveLength(1);
      expect(attempts[0]?.summary).toBe("Easy Apply submitted");
    } finally {
      if (secondRepository) {
        await secondRepository.close();
      }
      if (firstRepository) {
        await firstRepository.close();
      }
      await rm(tempDirectory, { recursive: true, force: true });
    }
  });

  test("persists source-debug artifacts outside the singleton discovery state blob", async () => {
    const tempDirectory = await mkdtemp(
      path.join(os.tmpdir(), "unemployed-db-source-debug-"),
    );
    const filePath = path.join(tempDirectory, "job-finder-state.sqlite");
    let firstRepository: Awaited<
      ReturnType<typeof createFileJobFinderRepository>
    > | null = null;
    let secondRepository: Awaited<
      ReturnType<typeof createFileJobFinderRepository>
    > | null = null;

    try {
      firstRepository = await createFileJobFinderRepository({
        filePath,
        seed: createSeed(),
      });

      await firstRepository.upsertSourceDebugRun({
        id: "source_debug_run_1",
        targetId: "target_primary",
        state: "completed",
        startedAt: "2026-03-20T10:00:00.000Z",
        updatedAt: "2026-03-20T10:02:00.000Z",
        completedAt: "2026-03-20T10:02:00.000Z",
        activePhase: null,
        phases: [
          "access_auth_probe",
          "site_structure_mapping",
          "search_filter_probe",
          "job_detail_validation",
          "apply_path_validation",
          "replay_verification",
        ],
        targetLabel: "Primary target",
        targetUrl: "https://jobs.example.com/search",
        targetHostname: "jobs.example.com",
        manualPrerequisiteSummary: null,
        finalSummary: "Replay verification reached jobs again.",
        attemptIds: ["source_debug_attempt_1"],
        phaseSummaries: [],
        instructionArtifactId: "source_instruction_1",
      });
      await firstRepository.upsertSourceDebugAttempt({
        id: "source_debug_attempt_1",
        runId: "source_debug_run_1",
        targetId: "target_primary",
        phase: "job_detail_validation",
        startedAt: "2026-03-20T10:01:00.000Z",
        completedAt: "2026-03-20T10:01:30.000Z",
        outcome: "succeeded",
        completionMode: "structured_finish",
        completionReason: null,
        strategyLabel: "Job Detail Validation",
        strategyFingerprint:
          "job_detail_validation:target_site:job detail validation",
        confirmedFacts: [
          "Observed canonical job detail URL https://jobs.example.com/roles/1.",
        ],
        attemptedActions: ["Opened the first job detail page."],
        blockerSummary: null,
        resultSummary: "Validated job detail routes.",
        confidenceScore: 88,
        nextRecommendedStrategies: ["Replay Verification"],
        avoidStrategyFingerprints: [
          "job_detail_validation:target_site:job detail validation",
        ],
        evidenceRefIds: ["source_debug_evidence_1"],
        phaseEvidence: null,
        compactionState: null,
      });
      await firstRepository.upsertSourceInstructionArtifact({
        id: "source_instruction_1",
        targetId: "target_primary",
        status: "validated",
        createdAt: "2026-03-20T10:01:00.000Z",
        updatedAt: "2026-03-20T10:02:00.000Z",
        acceptedAt: "2026-03-20T10:02:00.000Z",
        basedOnRunId: "source_debug_run_1",
        basedOnAttemptIds: ["source_debug_attempt_1"],
        notes: "Validated target-site source guidance.",
        navigationGuidance: ["Start from https://jobs.example.com/search."],
        searchGuidance: ["Use the jobs search route."],
        detailGuidance: ["Prefer stable detail URLs."],
        applyGuidance: [
          "Prefer the inline apply entry when it appears on the detail page.",
        ],
        warnings: [],
        versionInfo: {
          promptProfileVersion: "source-debug-v1",
          toolsetVersion: "browser-tools-v1",
          adapterVersion: "target_site",
          appSchemaVersion: "job-finder-source-debug-v1",
        },
        verification: {
          id: "source_instruction_verification_1",
          replayRunId: "source_debug_run_1",
          verifiedAt: "2026-03-20T10:02:00.000Z",
          outcome: "passed",
          proofSummary: "Replay verification reached jobs again.",
          reason: null,
          versionInfo: {
            promptProfileVersion: "source-debug-v1",
            toolsetVersion: "browser-tools-v1",
            adapterVersion: "target_site",
            appSchemaVersion: "job-finder-source-debug-v1",
          },
        },
      });
      await firstRepository.upsertSourceDebugEvidenceRef({
        id: "source_debug_evidence_1",
        runId: "source_debug_run_1",
        attemptId: "source_debug_attempt_1",
        targetId: "target_primary",
        phase: "job_detail_validation",
        kind: "url",
        label: "Validated job detail",
        capturedAt: "2026-03-20T10:01:15.000Z",
        url: "https://jobs.example.com/roles/1",
        storagePath: null,
        excerpt: "Stable target-site job detail URL.",
      });

      secondRepository = await createFileJobFinderRepository({
        filePath,
        seed: createSeed(),
      });
      const [runs, attempts, artifacts, evidenceRefs, discoveryState] =
        await Promise.all([
          secondRepository.listSourceDebugRuns(),
          secondRepository.listSourceDebugAttempts(),
          secondRepository.listSourceInstructionArtifacts(),
          secondRepository.listSourceDebugEvidenceRefs(),
          secondRepository.getDiscoveryState(),
        ]);

      expect(runs).toHaveLength(1);
      expect(attempts).toHaveLength(1);
      expect(artifacts).toHaveLength(1);
      expect(evidenceRefs).toHaveLength(1);
      expect(discoveryState.activeSourceDebugRun).toBeNull();
      expect(discoveryState.recentSourceDebugRuns).toEqual([]);
    } finally {
      if (secondRepository) {
        await secondRepository.close();
      }
      if (firstRepository) {
        await firstRepository.close();
      }
      await rm(tempDirectory, { recursive: true, force: true });
    }
  });
});
