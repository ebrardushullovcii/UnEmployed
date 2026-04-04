import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { createFileJobFinderRepository } from "./index";
import { createSeed } from "./test-fixtures";

type FileRepository = Awaited<ReturnType<typeof createFileJobFinderRepository>>;

describe("createFileJobFinderRepository", () => {
  test("deletes only source instruction artifacts for the requested target in file storage", async () => {
    const tempDirectory = await mkdtemp(
      path.join(os.tmpdir(), "unemployed-db-artifacts-"),
    );
    const filePath = path.join(tempDirectory, "job-finder-state.sqlite");
    let repository: FileRepository | null = null;

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

  test("persists repository state to a local sqlite file", async () => {
    const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "unemployed-db-"));
    const filePath = path.join(tempDirectory, "job-finder-state.sqlite");
    let firstRepository: FileRepository | null = null;
    let secondRepository: FileRepository | null = null;

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

      await firstRepository.close();
      firstRepository = null;

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
    let firstRepository: FileRepository | null = null;
    let secondRepository: FileRepository | null = null;

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

      await firstRepository.close();
      firstRepository = null;

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

  test("atomically persists saved-job updates with resume approval invalidation", async () => {
    const tempDirectory = await mkdtemp(
      path.join(os.tmpdir(), "unemployed-db-resume-stale-"),
    );
    const filePath = path.join(tempDirectory, "job-finder-state.sqlite");
    let repository: FileRepository | null = null;
    const seed = createSeed();
    seed.savedJobs = [
      {
        id: "job_ready",
        source: "target_site",
        sourceJobId: "target_job_ready",
        discoveryMethod: "catalog_seed",
        canonicalUrl: "https://jobs.example.com/roles/target_job_ready",
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
    ];

    try {
      repository = await createFileJobFinderRepository({
        filePath,
        seed,
      });

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

      expect(refreshedJobs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "job_ready",
            description: expect.stringMatching(/Updated\./),
          }),
        ]),
      );
      expect(refreshedDraft?.status).toBe("stale");
      expect(refreshedDraft?.approvedExportId).toBeNull();
      expect(exports.find((entry) => entry.id === "resume_export_old")?.isApproved).toBe(
        false,
      );
      expect(assets.find((asset) => asset.jobId === "job_ready")?.storagePath).toBeNull();
    } finally {
      if (repository) {
        await repository.close();
      }
      await rm(tempDirectory, { recursive: true, force: true });
    }
  });
});
