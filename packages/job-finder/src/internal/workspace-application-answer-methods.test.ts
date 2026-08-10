import {
  ApplicationQuestionRecordSchema,
  ApplyJobResultSchema,
  ApplyRunSchema,
  CandidateAssetSchema,
  type ApplicationQuestionKind,
} from "@unemployed/contracts";
import { createInMemoryJobFinderRepository } from "@unemployed/db";
import { describe, expect, it, vi } from "vitest";
import { createSeed } from "../workspace-service.test-fixtures";
import { createWorkspaceApplicationAnswerMethods } from "./workspace-application-answer-methods";
import { createWorkspaceApplyRunStoreMethods } from "./workspace-apply-run-store-methods";
import type { WorkspaceServiceContext } from "./workspace-service-context";

function createHarness(
  options: {
    answerControlType?: "single_choice" | "file";
    answerOptions?: string[];
    candidateAssetResolver?: WorkspaceServiceContext["candidateAssetResolver"];
    questionKind?: ApplicationQuestionKind;
  } = {},
) {
  const now = "2026-08-10T10:00:00.000Z";
  const seed = createSeed();
  const job = seed.savedJobs[0]!;
  seed.applyRuns = [
    ApplyRunSchema.parse({
      id: "run-answers",
      mode: "copilot",
      state: "paused_for_user_review",
      jobIds: [job.id],
      currentJobId: job.id,
      summary: "Prepared safely",
      detail: "Final submission remains disabled.",
      createdAt: now,
      updatedAt: now,
    }),
  ];
  seed.applyJobResults = [
    ApplyJobResultSchema.parse({
      id: "result-answers",
      runId: "run-answers",
      jobId: job.id,
      state: "awaiting_review",
      summary: "Questions need review",
      detail: "No submission occurred.",
      startedAt: now,
      updatedAt: now,
    }),
  ];
  seed.applicationQuestionRecords = [
    ApplicationQuestionRecordSchema.parse({
      id: "question-sponsorship",
      runId: "run-answers",
      jobId: job.id,
      resultId: "result-answers",
      prompt: "Will you now or later require visa sponsorship?",
      kind: options.questionKind ?? "visa_sponsorship",
      answerControlType: options.answerControlType ?? "single_choice",
      isRequired: true,
      detectedAt: now,
      answerOptions: options.answerOptions ?? ["Yes", "No"],
      status: "detected",
    }),
  ];

  const repository = createInMemoryJobFinderRepository(seed);
  const ctx = {
    repository,
    ...(options.candidateAssetResolver
      ? { candidateAssetResolver: options.candidateAssetResolver }
      : {}),
  } as WorkspaceServiceContext;
  const runStore = createWorkspaceApplyRunStoreMethods(ctx);
  const methods = createWorkspaceApplicationAnswerMethods(
    ctx,
    runStore.getApplyRunDetails,
  );
  return { job, methods, repository, runStore };
}

function saveCommand(commandId: string, expectedAnswerRevision: number) {
  return {
    commandId,
    runId: "run-answers",
    jobId: "job-1",
    resultId: "result-answers",
    questionId: "question-sponsorship",
    expectedAnswerRevision,
    value: { type: "single_choice" as const, value: "no" },
    saveScope: "application_once" as const,
    submitAuthorized: false as const,
    accountCreationAuthorized: false as const,
  };
}

describe("workspace application answer methods", () => {
  it("saves, replaces, and clears an exact application answer by revision", async () => {
    const { job, methods } = createHarness();
    const command = { ...saveCommand("save-1", 0), jobId: job.id };

    const saved = await methods.saveApplicationAnswer(command);
    expect(saved.questionRecords[0]).toEqual(
      expect.objectContaining({
        selectedAnswerId: "application_answer_save-1",
        submittedAnswer: "No",
        status: "answered",
      }),
    );
    expect(saved.answerRecords).toEqual([
      expect.objectContaining({
        id: "application_answer_save-1",
        text: "No",
        value: { type: "single_choice", value: "No" },
        revision: 1,
        supersedesAnswerId: null,
      }),
    ]);

    const replaced = await methods.saveApplicationAnswer({
      ...command,
      commandId: "save-2",
      expectedAnswerRevision: 1,
      value: { type: "single_choice", value: "Yes" },
    });
    expect(replaced.answerRecords.at(-1)).toEqual(
      expect.objectContaining({
        id: "application_answer_save-2",
        text: "Yes",
        revision: 2,
        supersedesAnswerId: "application_answer_save-1",
      }),
    );

    const cleared = await methods.clearApplicationAnswer({
      commandId: "clear-3",
      runId: command.runId,
      jobId: job.id,
      resultId: command.resultId,
      questionId: command.questionId,
      expectedAnswerRevision: 2,
      submitAuthorized: false,
      accountCreationAuthorized: false,
    });
    expect(cleared.questionRecords[0]).toEqual(
      expect.objectContaining({
        selectedAnswerId: null,
        submittedAnswer: null,
        status: "detected",
      }),
    );
    expect(cleared.answerRecords.at(-1)).toEqual(
      expect.objectContaining({
        id: "application_answer_clear-3",
        status: "rejected",
        value: null,
        revision: 3,
        supersedesAnswerId: "application_answer_save-2",
      }),
    );
  });

  it("rejects stale editors and choices the employer did not offer", async () => {
    const { job, methods } = createHarness();
    await methods.saveApplicationAnswer({
      ...saveCommand("save-current", 0),
      jobId: job.id,
    });

    await expect(
      methods.saveApplicationAnswer({
        ...saveCommand("save-stale", 0),
        jobId: job.id,
      }),
    ).rejects.toThrow(/changed in another view/i);
    await expect(
      methods.saveApplicationAnswer({
        ...saveCommand("save-invalid", 1),
        jobId: job.id,
        value: { type: "single_choice", value: "Maybe" },
      }),
    ).rejects.toThrow(/not one of the choices/i);
  });

  it("can save a reviewed text answer to Profile without overwriting a conflict", async () => {
    const { job, methods, repository } = createHarness();
    await methods.saveApplicationAnswer({
      ...saveCommand("save-reusable", 0),
      jobId: job.id,
      saveScope: "reusable_profile",
    });

    const profile = await repository.getProfile();
    expect(profile.answerBank.customAnswers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          question: "Will you now or later require visa sponsorship?",
          answer: "No",
        }),
      ]),
    );
  });

  it("keeps command retries idempotent", async () => {
    const { job, methods } = createHarness();
    const command = { ...saveCommand("same-command", 0), jobId: job.id };

    const first = await methods.saveApplicationAnswer(command);
    const retry = await methods.saveApplicationAnswer(command);

    expect(first.answerRecords).toHaveLength(1);
    expect(retry.answerRecords).toHaveLength(1);
    expect(retry.answerRecords[0]?.revision).toBe(1);
  });

  it("stores only metadata for an exact consented file answer", async () => {
    const asset = CandidateAssetSchema.parse({
      id: "asset-portfolio",
      kind: "portfolio",
      originalName: "portfolio.pdf",
      mime: "application/pdf",
      byteSize: 100,
      sha256: "a".repeat(64),
      createdAt: "2026-08-10T10:00:00.000Z",
      sensitivity: "sensitive",
      consentScope: "job_application_attachment",
      retention: "until_deleted",
    });
    const loadVerifiedBytes = vi.fn(() =>
      Promise.resolve(new Uint8Array([1, 2, 3])),
    );
    const resolveForApplication = vi.fn(() =>
      Promise.resolve({ asset, loadVerifiedBytes }),
    );
    const { job, methods } = createHarness({
      answerControlType: "file",
      answerOptions: [],
      candidateAssetResolver: { resolveForApplication },
      questionKind: "portfolio",
    });

    const details = await methods.saveApplicationAnswer({
      ...saveCommand("save-asset", 0),
      jobId: job.id,
      value: { type: "asset_ref", assetId: asset.id },
    });

    expect(resolveForApplication).toHaveBeenCalledWith(asset.id);
    expect(details.answerRecords[0]).toEqual(
      expect.objectContaining({
        text: "portfolio.pdf",
        value: { type: "asset_ref", assetId: asset.id },
      }),
    );
    expect(JSON.stringify(details)).not.toContain("C:/private");
  });
});
