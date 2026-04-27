import { DatabaseSync } from "node:sqlite";
import { describe, expect, test } from "vitest";
import {
  ApplicationAnswerRecordSchema,
  ApplicationArtifactRefSchema,
  ApplicationConsentRequestSchema,
  ApplicationQuestionRecordSchema,
  ApplicationReplayCheckpointSchema,
  ApplyJobResultSchema,
  SourceDebugEvidenceRefSchema,
  ApplyRunSchema,
  SourceInstructionArtifactSchema,
} from "@unemployed/contracts";

import { createFileJobFinderRepository } from "./index";
import { createSeed } from "./test-fixtures";
import {
  cleanupTempDirectoryWithRetry,
  createResumeImportArtifactsFixture,
  createSavedJob,
  createTempRepository,
  type FileRepository,
} from "./file-repository.test-support";

describe("createFileJobFinderRepository", () => {
  test("deletes only source instruction artifacts for the requested target in file storage", async () => {
    const temp = await createTempRepository("unemployed-db-artifacts-");
    let repository: FileRepository | null = null;

    try {
      repository = await temp.createRepository();

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

      await repository.upsertSourceInstructionArtifact(
        SourceInstructionArtifactSchema.parse({
          ...baseArtifact,
          id: "source_instruction_primary",
          targetId: "target_primary",
        }),
      );
      await repository.upsertSourceInstructionArtifact(
        SourceInstructionArtifactSchema.parse({
          ...baseArtifact,
          id: "source_instruction_secondary",
          targetId: "target_secondary",
        }),
      );

      await repository.deleteSourceInstructionArtifactsForTarget(
        "target_primary",
      );

      await expect(
        repository.listSourceInstructionArtifacts(),
      ).resolves.toEqual([
        expect.objectContaining({
          id: "source_instruction_secondary",
          targetId: "target_secondary",
        }),
      ]);
    } finally {
      if (repository) {
        await repository.close();
      }
      await temp.cleanup();
    }
  });

  test("persists repository state to a local sqlite file", async () => {
    const temp = await createTempRepository("unemployed-db-");
    let firstRepository: FileRepository | null = null;
    let secondRepository: FileRepository | null = null;

    try {
      firstRepository = await temp.createRepository();

      await firstRepository.replaceSavedJobs([createSavedJob()]);

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

      await firstRepository.close();
      firstRepository = null;

      secondRepository = await temp.createRepository();
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
      await temp.cleanup();
    }
  });

  test("persists apply foundation records across sqlite reloads", async () => {
    const temp = await createTempRepository("unemployed-db-apply-foundation-");
    let firstRepository: FileRepository | null = null;
    let secondRepository: FileRepository | null = null;

    try {
      firstRepository = await temp.createRepository();

      await firstRepository.upsertApplyRun(
        ApplyRunSchema.parse({
          id: "apply_run_1",
          mode: "copilot",
          state: "paused_for_user_review",
          jobIds: ["job_1"],
          currentJobId: "job_1",
          submitApprovalId: null,
          createdAt: "2026-04-18T10:00:00.000Z",
          updatedAt: "2026-04-18T10:03:00.000Z",
          completedAt: null,
          summary: "Apply copilot captured the current application state.",
          detail: "Stopped before final submit.",
          totalJobs: 1,
          pendingJobs: 0,
          submittedJobs: 0,
          skippedJobs: 0,
          blockedJobs: 0,
          failedJobs: 0,
        }),
      );
      await firstRepository.upsertApplyJobResult(
        ApplyJobResultSchema.parse({
          id: "apply_result_1",
          runId: "apply_run_1",
          jobId: "job_1",
          queuePosition: 0,
          state: "awaiting_review",
          summary: "Application prepared for review.",
          detail: "Captured the staged application state without submitting.",
          startedAt: "2026-04-18T10:00:10.000Z",
          updatedAt: "2026-04-18T10:00:40.000Z",
          completedAt: null,
          blockerReason: null,
          blockerSummary: null,
          latestQuestionCount: 1,
          latestAnswerCount: 1,
          pendingConsentRequestCount: 1,
          artifactCount: 1,
          latestCheckpointId: "checkpoint_1",
        }),
      );
      await firstRepository.upsertApplicationQuestionRecord(
        ApplicationQuestionRecordSchema.parse({
          id: "question_1",
          runId: "apply_run_1",
          jobId: "job_1",
          resultId: "apply_result_1",
          prompt: "Upload your resume",
          kind: "resume",
          isRequired: true,
          detectedAt: "2026-04-18T10:00:30.000Z",
          answerOptions: [],
          suggestedAnswers: [],
          selectedAnswerId: null,
          submittedAnswer: null,
          status: "detected",
          pageUrl: "https://jobs.example.com/apply",
        }),
      );
      await firstRepository.upsertApplicationAnswerRecord(
        ApplicationAnswerRecordSchema.parse({
          id: "answer_1",
          runId: "apply_run_1",
          jobId: "job_1",
          resultId: "apply_result_1",
          questionId: "question_1",
          status: "suggested",
          text: "/tmp/tailored-resume.pdf",
          sourceKind: "resume",
          sourceId: "resume_export_1",
          confidenceLabel: "grounded",
          provenance: [
            {
              id: "answer_provenance_1",
              sourceKind: "resume",
              sourceId: "resume_export_1",
              label: "Approved tailored resume export",
              snippet: "/tmp/tailored-resume.pdf",
            },
          ],
          createdAt: "2026-04-18T10:00:31.000Z",
          submittedAt: null,
        }),
      );
      await firstRepository.upsertApplicationArtifactRef(
        ApplicationArtifactRefSchema.parse({
          id: "artifact_1",
          runId: "apply_run_1",
          jobId: "job_1",
          resultId: "apply_result_1",
          questionId: "question_1",
          kind: "field_snapshot",
          label: "Resume upload prompt",
          createdAt: "2026-04-18T10:00:32.000Z",
          storagePath: null,
          url: "https://jobs.example.com/apply",
          textSnippet: "Upload your resume",
        }),
      );
      await firstRepository.upsertApplicationReplayCheckpoint(
        ApplicationReplayCheckpointSchema.parse({
          id: "checkpoint_1",
          runId: "apply_run_1",
          jobId: "job_1",
          resultId: "apply_result_1",
          createdAt: "2026-04-18T10:00:33.000Z",
          label: "Prepared application for review",
          detail: "The flow paused before final submit.",
          url: "https://jobs.example.com/apply",
          jobState: "awaiting_review",
          artifactRefIds: ["artifact_1"],
        }),
      );
      await firstRepository.upsertApplicationConsentRequest(
        ApplicationConsentRequestSchema.parse({
          id: "consent_1",
          runId: "apply_run_1",
          jobId: "job_1",
          resultId: "apply_result_1",
          kind: "resume_use",
          linkedConsentKind: "resume_use",
          label: "Use the approved tailored resume for this apply run",
          detail: null,
          status: "approved",
          requestedAt: "2026-04-18T10:00:20.000Z",
          decidedAt: "2026-04-18T10:00:25.000Z",
          expiresAt: null,
        }),
      );

      await firstRepository.close();
      firstRepository = null;

      secondRepository = await temp.createRepository();

      await expect(secondRepository.listApplyRuns()).resolves.toEqual([
        expect.objectContaining({
          id: "apply_run_1",
          state: "paused_for_user_review",
        }),
      ]);
      await expect(secondRepository.listApplyJobResults()).resolves.toEqual([
        expect.objectContaining({
          id: "apply_result_1",
          runId: "apply_run_1",
          jobId: "job_1",
        }),
      ]);
      await expect(
        secondRepository.listApplicationQuestionRecords({
          runId: "apply_run_1",
        }),
      ).resolves.toEqual([
        expect.objectContaining({
          id: "question_1",
          prompt: "Upload your resume",
        }),
      ]);
      await expect(
        secondRepository.listApplicationAnswerRecords({
          resultId: "apply_result_1",
        }),
      ).resolves.toEqual([
        expect.objectContaining({
          id: "answer_1",
          runId: "apply_run_1",
          resultId: "apply_result_1",
          questionId: "question_1",
        }),
      ]);
      await expect(
        secondRepository.listApplicationArtifactRefs({
          resultId: "apply_result_1",
        }),
      ).resolves.toEqual([
        expect.objectContaining({
          id: "artifact_1",
          runId: "apply_run_1",
          resultId: "apply_result_1",
          questionId: "question_1",
        }),
      ]);
      await expect(
        secondRepository.listApplicationReplayCheckpoints({
          resultId: "apply_result_1",
        }),
      ).resolves.toEqual([
        expect.objectContaining({
          id: "checkpoint_1",
          runId: "apply_run_1",
          resultId: "apply_result_1",
          artifactRefIds: ["artifact_1"],
        }),
      ]);
      await expect(
        secondRepository.listApplicationConsentRequests({
          runId: "apply_run_1",
        }),
      ).resolves.toEqual([
        expect.objectContaining({
          id: "consent_1",
          runId: "apply_run_1",
          resultId: "apply_result_1",
          status: "approved",
        }),
      ]);
    } finally {
      if (secondRepository) {
        await secondRepository.close();
      }
      if (firstRepository) {
        await firstRepository.close();
      }
      await temp.cleanup();
    }
  });

  test("persists profile setup state across sqlite reloads", async () => {
    const temp = await createTempRepository("unemployed-db-setup-");
    let firstRepository: FileRepository | null = null;
    let secondRepository: FileRepository | null = null;

    try {
      firstRepository = await temp.createRepository();

      await firstRepository.saveProfileSetupState({
        status: "in_progress",
        currentStep: "background",
        completedAt: null,
        reviewItems: [],
        lastResumedAt: "2026-04-11T10:10:00.000Z",
      });

      await firstRepository.close();
      firstRepository = null;

      secondRepository = await temp.createRepository();

      await expect(secondRepository.getProfileSetupState()).resolves.toEqual(
        expect.objectContaining({
          status: "in_progress",
          currentStep: "background",
          lastResumedAt: "2026-04-11T10:10:00.000Z",
        }),
      );
    } finally {
      if (secondRepository) {
        await secondRepository.close();
      }
      if (firstRepository) {
        await firstRepository.close();
      }
      await temp.cleanup();
    }
  });

  test("persists profile copilot messages and revisions across sqlite reloads", async () => {
    const temp = await createTempRepository("unemployed-db-profile-copilot-");
    let firstRepository: FileRepository | null = null;
    let secondRepository: FileRepository | null = null;
    const seed = createSeed();

    try {
      firstRepository = await createFileJobFinderRepository({
        filePath: temp.filePath,
        seed,
      });

      await firstRepository.upsertProfileCopilotMessage({
        id: "profile_message_1",
        role: "assistant",
        content: "I can improve your profile headline.",
        context: { surface: "setup", step: "essentials" },
        patchGroups: [
          {
            id: "profile_patch_group_1",
            summary: "Refine the profile headline",
            applyMode: "needs_review",
            operations: [
              {
                operation: "replace_identity_fields",
                value: {
                  headline: "Principal Product Designer",
                },
              },
            ],
            createdAt: "2026-04-11T10:00:30.000Z",
          },
        ],
        createdAt: "2026-04-11T10:00:00.000Z",
      });
      await firstRepository.upsertProfileRevision({
        id: "profile_revision_1",
        createdAt: "2026-04-11T10:01:00.000Z",
        reason: "Applied assistant profile refinement.",
        trigger: "assistant_patch",
        messageId: "profile_message_1",
        patchGroupId: "profile_patch_group_1",
        restoredFromRevisionId: null,
        snapshotProfile: seed.profile,
        snapshotSearchPreferences: seed.searchPreferences,
        snapshotProfileSetupState: seed.profileSetupState,
      });

      await firstRepository.close();
      firstRepository = null;

      secondRepository = await temp.createRepository();

      await expect(
        secondRepository.listProfileCopilotMessages(),
      ).resolves.toEqual([
        expect.objectContaining({
          id: "profile_message_1",
          patchGroups: [
            expect.objectContaining({ id: "profile_patch_group_1" }),
          ],
        }),
      ]);
      await expect(secondRepository.listProfileRevisions()).resolves.toEqual([
        expect.objectContaining({
          id: "profile_revision_1",
          patchGroupId: "profile_patch_group_1",
          messageId: "profile_message_1",
        }),
      ]);
    } finally {
      if (secondRepository) {
        await secondRepository.close();
      }
      if (firstRepository) {
        await firstRepository.close();
      }
      await temp.cleanup();
    }
  });

  test("atomically commits profile copilot state across sqlite reloads", async () => {
    const temp = await createTempRepository(
      "unemployed-db-profile-copilot-atomic-",
    );
    let firstRepository: FileRepository | null = null;
    let secondRepository: FileRepository | null = null;
    const seed = createSeed();

    try {
      firstRepository = await createFileJobFinderRepository({
        filePath: temp.filePath,
        seed,
      });

      await firstRepository.commitProfileCopilotState({
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

      await firstRepository.close();
      firstRepository = null;

      secondRepository = await temp.createRepository();

      await expect(secondRepository.getProfile()).resolves.toEqual(
        expect.objectContaining({ headline: "Principal Product Designer" }),
      );
      await expect(secondRepository.getSearchPreferences()).resolves.toEqual(
        expect.objectContaining({ targetSalaryUsd: 220000 }),
      );
      await expect(secondRepository.getProfileSetupState()).resolves.toEqual(
        expect.objectContaining({
          status: "in_progress",
          currentStep: "essentials",
        }),
      );
      await expect(
        secondRepository.listProfileCopilotMessages(),
      ).resolves.toEqual([
        expect.objectContaining({ id: "profile_message_atomic" }),
      ]);
      await expect(secondRepository.listProfileRevisions()).resolves.toEqual([
        expect.objectContaining({ id: "profile_revision_atomic" }),
      ]);
    } finally {
      if (secondRepository) {
        await secondRepository.close();
      }
      if (firstRepository) {
        await firstRepository.close();
      }
      await temp.cleanup();
    }
  });

  test("persists source-debug artifacts outside the singleton discovery state blob", async () => {
    const temp = await createTempRepository("unemployed-db-source-debug-");
    let firstRepository: FileRepository | null = null;
    let secondRepository: FileRepository | null = null;

    try {
      firstRepository = await temp.createRepository();

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
        timing: null,
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
        timing: null,
      });
      await firstRepository.upsertSourceInstructionArtifact(
        SourceInstructionArtifactSchema.parse({
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
        }),
      );
      await firstRepository.upsertSourceDebugEvidenceRefs([
        SourceDebugEvidenceRefSchema.parse({
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
        }),
        SourceDebugEvidenceRefSchema.parse({
          id: "source_debug_evidence_2",
          runId: "source_debug_run_1",
          attemptId: "source_debug_attempt_1",
          targetId: "target_primary",
          phase: "apply_path_validation",
          kind: "url",
          label: "Apply entry point",
          capturedAt: "2026-03-20T10:01:30.000Z",
          url: "https://jobs.example.com/roles/1/apply",
          storagePath: null,
          excerpt: "Inline apply button is visible on the detail page.",
        }),
      ]);

      await firstRepository.close();
      firstRepository = null;

      secondRepository = await temp.createRepository();
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
      expect(evidenceRefs).toHaveLength(2);
      expect(discoveryState.activeSourceDebugRun).toBeNull();
      expect(discoveryState.recentSourceDebugRuns).toEqual([]);
    } finally {
      if (secondRepository) {
        await secondRepository.close();
      }
      if (firstRepository) {
        await firstRepository.close();
      }
      await temp.cleanup();
    }
  });

  test("atomically persists saved-job updates with resume approval invalidation", async () => {
    const temp = await createTempRepository("unemployed-db-resume-stale-");
    let repository: FileRepository | null = null;
    const seed = createSeed();
    seed.savedJobs = [
      createSavedJob({
        id: "job_ready",
        sourceJobId: "target_job_ready",
        canonicalUrl: "https://jobs.example.com/roles/target_job_ready",
        applicationUrl: "https://jobs.example.com/roles/target_job_ready/apply",
      }),
    ];

    try {
      repository = await createFileJobFinderRepository({
        filePath: temp.filePath,
        seed,
      });

      await repository.upsertResumeDraft({
        id: "resume_draft_1",
        jobId: "job_ready",
        status: "approved",
        templateId: "classic_ats",
        identity: null,
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
        isApproved: false,
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
          identity: null,
          sections: [],
          targetPageCount: 2,
          generationMethod: "ai",
          approvedAt: null,
          approvedExportId: null,
          staleReason:
            "Saved job details changed after approval and the resume needs a fresh review.",
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
      const refreshedDraft =
        await repository.getResumeDraftByJobId("job_ready");
      const exports = await repository.listResumeExportArtifacts({
        jobId: "job_ready",
      });
      const assets = await repository.listTailoredAssets();

      expect(
        refreshedJobs.find((job) => job.id === "job_ready")?.description,
      ).toMatch(/Updated\./);
      expect(refreshedDraft?.status).toBe("stale");
      expect(refreshedDraft?.approvedExportId).toBeNull();
      expect(
        exports.find((entry) => entry.id === "resume_export_old")?.isApproved,
      ).toBe(false);
      expect(
        assets.find((asset) => asset.jobId === "job_ready")?.storagePath,
      ).toBeNull();
    } finally {
      if (repository) {
        await repository.close();
      }
      await temp.cleanup();
    }
  });

  test("persists resume import runs, bundles, and candidates together", async () => {
    const temp = await createTempRepository("unemployed-db-import-runs-");
    let repository: FileRepository | null = null;

    try {
      repository = await temp.createRepository();

      await repository.replaceResumeImportRunArtifacts(
        createResumeImportArtifactsFixture(),
      );

      await expect(
        repository.getLatestResumeImportRun("resume_1"),
      ).resolves.toEqual(
        expect.objectContaining({ id: "resume_import_run_1" }),
      );
      await expect(
        repository.listResumeImportDocumentBundles({
          runId: "resume_import_run_1",
        }),
      ).resolves.toEqual([expect.objectContaining({ id: "resume_bundle_1" })]);
      await expect(
        repository.listResumeImportFieldCandidates({
          runId: "resume_import_run_1",
          resolution: "needs_review",
        }),
      ).resolves.toEqual([expect.objectContaining({ id: "candidate_2" })]);
    } finally {
      if (repository) {
        await repository.close();
      }
      await temp.cleanup();
    }
  });

  test("atomically finalizes resume import state across sqlite reloads", async () => {
    const temp = await createTempRepository("unemployed-db-import-finalize-");
    let firstRepository: FileRepository | null = null;
    let secondRepository: FileRepository | null = null;
    const seed = createSeed();

    try {
      firstRepository = await createFileJobFinderRepository({
        filePath: temp.filePath,
        seed,
      });

      await firstRepository.finalizeResumeImportRun({
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

      await firstRepository.close();
      firstRepository = null;

      secondRepository = await temp.createRepository();

      await expect(secondRepository.getProfile()).resolves.toEqual(
        expect.objectContaining({ fullName: "Taylor Rivera" }),
      );
      await expect(secondRepository.getSearchPreferences()).resolves.toEqual(
        expect.objectContaining({ targetRoles: ["Staff Product Designer"] }),
      );
      await expect(
        secondRepository.getLatestResumeImportRun(seed.profile.baseResume.id),
      ).resolves.toEqual(
        expect.objectContaining({
          id: "resume_import_run_atomic",
          status: "applied",
        }),
      );
      await expect(
        secondRepository.listResumeImportDocumentBundles({
          runId: "resume_import_run_atomic",
        }),
      ).resolves.toEqual([
        expect.objectContaining({ id: "resume_bundle_atomic" }),
      ]);
      await expect(
        secondRepository.listResumeImportFieldCandidates({
          runId: "resume_import_run_atomic",
        }),
      ).resolves.toEqual([
        expect.objectContaining({ id: "resume_candidate_atomic" }),
      ]);
    } finally {
      if (secondRepository) {
        await secondRepository.close();
      }
      if (firstRepository) {
        await firstRepository.close();
      }
      await temp.cleanup();
    }
  });

  test("repairs profile copilot tables for existing version-4 sqlite files", async () => {
    const temp = await createTempRepository(
      "unemployed-db-profile-copilot-migration-",
    );
    let repository: FileRepository | null = null;
    let initialRepository: FileRepository | null = null;

    try {
      initialRepository = await temp.createRepository();
      await initialRepository.close();
      initialRepository = null;

      const database = new DatabaseSync(temp.filePath);
      try {
        database.exec(`
          DROP TABLE IF EXISTS profile_copilot_messages;
          DROP TABLE IF EXISTS profile_revisions;
        `);
        database
          .prepare("DELETE FROM schema_migrations WHERE version = ?")
          .run(5);
      } finally {
        database.close();
      }

      repository = await temp.createRepository();

      await repository.upsertProfileCopilotMessage({
        id: "profile_message_migrated",
        role: "assistant",
        content: "Migration added copilot support.",
        context: { surface: "general" },
        patchGroups: [],
        createdAt: "2026-04-11T11:00:00.000Z",
      });

      await expect(repository.listProfileCopilotMessages()).resolves.toEqual([
        expect.objectContaining({ id: "profile_message_migrated" }),
      ]);
    } finally {
      if (repository) {
        await repository.close();
      }
      if (initialRepository) {
        await initialRepository.close();
      }
      await cleanupTempDirectoryWithRetry(temp.tempDirectory);
    }
  }, 15000);

  test("dedupe migration rewrites result references without replacing unrelated JSON strings", async () => {
    const temp = await createTempRepository(
      "unemployed-db-apply-dedupe-migration-",
    );
    let repository: FileRepository | null = null;
    let initialRepository: FileRepository | null = null;
    const duplicateResultId = "apply_result_duplicate";
    const survivorResult = ApplyJobResultSchema.parse({
      id: "apply_result_survivor",
      runId: "apply_run_dedupe",
      jobId: "job_dedupe",
      queuePosition: 0,
      state: "awaiting_review",
      summary: "Migration kept the newest job result.",
      detail:
        "A later replay checkpoint superseded the older duplicate result.",
      startedAt: "2026-04-18T10:01:00.000Z",
      updatedAt: "2026-04-18T10:01:30.000Z",
      completedAt: null,
      blockerReason: null,
      blockerSummary: null,
      latestQuestionCount: 0,
      latestAnswerCount: 0,
      pendingConsentRequestCount: 0,
      artifactCount: 1,
      latestCheckpointId: null,
    });

    try {
      initialRepository = await temp.createRepository();

      await initialRepository.upsertApplyRun(
        ApplyRunSchema.parse({
          id: "apply_run_dedupe",
          mode: "copilot",
          state: "paused_for_user_review",
          jobIds: ["job_dedupe"],
          currentJobId: "job_dedupe",
          submitApprovalId: null,
          createdAt: "2026-04-18T10:00:00.000Z",
          updatedAt: "2026-04-18T10:01:30.000Z",
          completedAt: null,
          summary: "Apply dedupe migration fixture.",
          detail: "Creates duplicate results to exercise the migration path.",
          totalJobs: 1,
          pendingJobs: 0,
          submittedJobs: 0,
          skippedJobs: 0,
          blockedJobs: 0,
          failedJobs: 0,
        }),
      );
      await initialRepository.upsertApplyJobResult(
        ApplyJobResultSchema.parse({
          id: duplicateResultId,
          runId: "apply_run_dedupe",
          jobId: "job_dedupe",
          queuePosition: 0,
          state: "awaiting_review",
          summary: "Older duplicate apply result.",
          detail: "This row should be deduped in favor of the newer one.",
          startedAt: "2026-04-18T10:00:10.000Z",
          updatedAt: "2026-04-18T10:00:40.000Z",
          completedAt: null,
          blockerReason: null,
          blockerSummary: null,
          latestQuestionCount: 0,
          latestAnswerCount: 0,
          pendingConsentRequestCount: 0,
          artifactCount: 1,
          latestCheckpointId: null,
        }),
      );
      await initialRepository.upsertApplicationArtifactRef(
        ApplicationArtifactRefSchema.parse({
          id: "artifact_dedupe_migration",
          runId: "apply_run_dedupe",
          jobId: "job_dedupe",
          resultId: duplicateResultId,
          questionId: null,
          kind: "field_snapshot",
          label: duplicateResultId,
          createdAt: "2026-04-18T10:00:20.000Z",
          storagePath: null,
          url: "https://jobs.example.com/apply",
          textSnippet: duplicateResultId,
        }),
      );

      await initialRepository.close();
      initialRepository = null;

      const database = new DatabaseSync(temp.filePath);
      try {
        database.exec(
          "DROP INDEX IF EXISTS apply_job_results_run_job_unique_idx",
        );
        database
          .prepare(
            `INSERT INTO apply_job_results (
              id,
              run_id,
              job_id,
              queue_position,
              updated_at,
              state,
              value
            ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            survivorResult.id,
            survivorResult.runId,
            survivorResult.jobId,
            survivorResult.queuePosition,
            survivorResult.updatedAt,
            survivorResult.state,
            JSON.stringify(survivorResult),
          );
        database
          .prepare("DELETE FROM schema_migrations WHERE version = ?")
          .run(7);
      } finally {
        database.close();
      }

      repository = await temp.createRepository();

      await expect(repository.listApplyJobResults()).resolves.toEqual([
        expect.objectContaining({
          id: survivorResult.id,
          runId: survivorResult.runId,
          jobId: survivorResult.jobId,
        }),
      ]);
      await expect(
        repository.listApplicationArtifactRefs({ resultId: survivorResult.id }),
      ).resolves.toEqual([
        expect.objectContaining({
          id: "artifact_dedupe_migration",
          resultId: survivorResult.id,
          label: duplicateResultId,
          textSnippet: duplicateResultId,
        }),
      ]);
      await expect(
        repository.listApplicationArtifactRefs({ resultId: duplicateResultId }),
      ).resolves.toEqual([]);
    } finally {
      if (repository) {
        await repository.close();
      }
      if (initialRepository) {
        await initialRepository.close();
      }
      await cleanupTempDirectoryWithRetry(temp.tempDirectory);
    }
  }, 15000);

  test("dedupe migration runs before rebuilding apply indexes for legacy sqlite files", async () => {
    const temp = await createTempRepository(
      "unemployed-db-apply-dedupe-legacy-migration-",
    );
    let repository: FileRepository | null = null;
    let initialRepository: FileRepository | null = null;
    const duplicateResultId = "apply_result_legacy_duplicate";
    const survivorResult = ApplyJobResultSchema.parse({
      id: "apply_result_legacy_survivor",
      runId: "apply_run_legacy_dedupe",
      jobId: "job_legacy_dedupe",
      queuePosition: 0,
      state: "awaiting_review",
      summary: "Migration kept the newest legacy job result.",
      detail: "A newer result superseded the older duplicate.",
      startedAt: "2026-04-18T10:01:00.000Z",
      updatedAt: "2026-04-18T10:01:30.000Z",
      completedAt: null,
      blockerReason: null,
      blockerSummary: null,
      latestQuestionCount: 0,
      latestAnswerCount: 0,
      pendingConsentRequestCount: 0,
      artifactCount: 0,
      latestCheckpointId: null,
    });

    try {
      initialRepository = await temp.createRepository();

      await initialRepository.upsertApplyRun(
        ApplyRunSchema.parse({
          id: "apply_run_legacy_dedupe",
          mode: "copilot",
          state: "paused_for_user_review",
          jobIds: ["job_legacy_dedupe"],
          currentJobId: "job_legacy_dedupe",
          submitApprovalId: null,
          createdAt: "2026-04-18T10:00:00.000Z",
          updatedAt: "2026-04-18T10:01:30.000Z",
          completedAt: null,
          summary: "Legacy apply dedupe migration fixture.",
          detail: "Creates duplicate results before replaying old migrations.",
          totalJobs: 1,
          pendingJobs: 0,
          submittedJobs: 0,
          skippedJobs: 0,
          blockedJobs: 0,
          failedJobs: 0,
        }),
      );
      await initialRepository.upsertApplyJobResult(
        ApplyJobResultSchema.parse({
          id: duplicateResultId,
          runId: "apply_run_legacy_dedupe",
          jobId: "job_legacy_dedupe",
          queuePosition: 0,
          state: "awaiting_review",
          summary: "Older duplicate apply result.",
          detail: "This row should be deduped in favor of the newer one.",
          startedAt: "2026-04-18T10:00:10.000Z",
          updatedAt: "2026-04-18T10:00:40.000Z",
          completedAt: null,
          blockerReason: null,
          blockerSummary: null,
          latestQuestionCount: 0,
          latestAnswerCount: 0,
          pendingConsentRequestCount: 0,
          artifactCount: 0,
          latestCheckpointId: null,
        }),
      );

      await initialRepository.close();
      initialRepository = null;

      const database = new DatabaseSync(temp.filePath);
      try {
        database.exec("DROP INDEX IF EXISTS apply_job_results_run_job_unique_idx");
        database
          .prepare(
            `INSERT INTO apply_job_results (
              id,
              run_id,
              job_id,
              queue_position,
              updated_at,
              state,
              value
            ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            survivorResult.id,
            survivorResult.runId,
            survivorResult.jobId,
            survivorResult.queuePosition,
            survivorResult.updatedAt,
            survivorResult.state,
            JSON.stringify(survivorResult),
          );
        database.prepare("DELETE FROM schema_migrations WHERE version >= ?").run(4);
      } finally {
        database.close();
      }

      repository = await temp.createRepository();

      await expect(repository.listApplyJobResults()).resolves.toEqual([
        expect.objectContaining({
          id: survivorResult.id,
          runId: survivorResult.runId,
          jobId: survivorResult.jobId,
        }),
      ]);
    } finally {
      if (repository) {
        await repository.close();
      }
      if (initialRepository) {
        await initialRepository.close();
      }
      await cleanupTempDirectoryWithRetry(temp.tempDirectory);
    }
  }, 15000);
});
