import {
  ApplicationRecordSchema,
  ApplyJobResultSchema,
  ApplyRunSchema,
  DiscoveryRunRecordSchema,
  SourceDebugRunRecordSchema,
  SourceDebugWorkerAttemptSchema,
} from "@unemployed/contracts";
import { describe, expect, test } from "vitest";

import {
  deriveDiscoveryFailureEvidence,
  deriveSimultaneousApplicationConflicts,
  deriveSourceDebugCampaignWork,
  deriveSourceDebugFailureEvidence,
  isUserOwnedBlockerEvidence,
  shouldPersistApplicationFailureNotification,
} from "./automatic-safeguards";

const startedAt = "2026-08-15T10:00:00.000Z";
const completedAt = "2026-08-15T10:01:00.000Z";

function discoveryRun(input: {
  id: string;
  state: "completed" | "failed";
  targetExecutions?: readonly {
    targetId: string;
    state: "completed" | "failed";
    warning?: string | null;
  }[];
}) {
  return DiscoveryRunRecordSchema.parse({
    id: input.id,
    campaignId: "campaign-1",
    state: input.state,
    startedAt,
    completedAt,
    targetIds: (input.targetExecutions ?? []).map((entry) => entry.targetId),
    targetExecutions: (input.targetExecutions ?? []).map((entry) => ({
      targetId: entry.targetId,
      adapterKind: "auto",
      state: entry.state,
      startedAt,
      completedAt,
      warning: entry.warning ?? null,
    })),
  });
}

function sourceRun(input: {
  id: string;
  targetId?: string;
  state: "completed" | "failed" | "paused_manual";
  finalSummary?: string | null;
  attemptIds?: readonly string[];
}) {
  const state = input.state;
  return SourceDebugRunRecordSchema.parse({
    id: input.id,
    targetId: input.targetId ?? "source-1",
    state,
    startedAt,
    updatedAt: completedAt,
    completedAt: state === "paused_manual" ? completedAt : completedAt,
    activePhase: state === "paused_manual" ? "access_auth_probe" : null,
    targetLabel: "Source one",
    targetUrl: "https://example.com",
    targetHostname: "example.com",
    finalSummary: input.finalSummary ?? null,
    attemptIds: input.attemptIds ?? [],
  });
}

function attempt(input: {
  id: string;
  runId: string;
  outcome:
    | "succeeded"
    | "failed_runtime"
    | "blocked_auth"
    | "unsupported_layout";
  resultSummary?: string;
}) {
  return SourceDebugWorkerAttemptSchema.parse({
    id: input.id,
    runId: input.runId,
    targetId: "source-1",
    phase: "site_structure_mapping",
    startedAt,
    completedAt,
    outcome: input.outcome,
    strategyLabel: "test strategy",
    strategyFingerprint: `fingerprint-${input.id}`,
    resultSummary: input.resultSummary ?? "Attempt finished.",
  });
}

describe("automatic source/discovery safeguards", () => {
  test("derives technical discovery failures but excludes manual blockers", () => {
    const evidence = deriveDiscoveryFailureEvidence([
      discoveryRun({
        id: "run-1",
        state: "completed",
        targetExecutions: [
          { targetId: "source-ok", state: "completed" },
          {
            targetId: "source-failed",
            state: "failed",
            warning: "Runtime transport failed.",
          },
          {
            targetId: "source-login",
            state: "failed",
            warning: "Login required before discovery.",
          },
        ],
      }),
    ]);

    expect(evidence).toEqual([
      {
        attemptId: "discovery:run-1:source-ok",
        failed: false,
        occurredAt: completedAt,
      },
      {
        attemptId: "discovery:run-1:source-failed",
        failed: true,
        occurredAt: completedAt,
      },
    ]);
  });

  test("derives source-debug failure samples without counting auth blockers", () => {
    const run = sourceRun({
      id: "debug-1",
      state: "failed",
      attemptIds: ["attempt-ok", "attempt-runtime", "attempt-auth"],
      finalSummary: "Source debug failed after bounded attempts.",
    });
    const attempts = [
      attempt({ id: "attempt-ok", runId: run.id, outcome: "succeeded" }),
      attempt({
        id: "attempt-runtime",
        runId: run.id,
        outcome: "failed_runtime",
      }),
      attempt({
        id: "attempt-auth",
        runId: run.id,
        outcome: "blocked_auth",
        resultSummary: "Login required.",
      }),
    ];

    expect(deriveSourceDebugFailureEvidence({ runs: [run], attempts })).toEqual(
      [
        {
          attemptId: "source-debug:attempt-ok",
          failed: false,
          occurredAt: completedAt,
        },
        {
          attemptId: "source-debug:attempt-runtime",
          failed: true,
          occurredAt: completedAt,
        },
      ],
    );
  });

  test("derives a stable blocked source notification with source identity", () => {
    const run = sourceRun({
      id: "debug-manual",
      state: "paused_manual",
      finalSummary: "Login required before the source can be checked.",
    });
    const work = deriveSourceDebugCampaignWork(run);
    expect(work.failedWork).toEqual([]);
    expect(work.blockedWork[0]).toEqual(
      expect.objectContaining({
        workId: "source_debug_debug-manual",
        sourceTargetId: "source-1",
      }),
    );
  });

  test("recognizes only explicit user-owned blocker language", () => {
    expect(isUserOwnedBlockerEvidence("Consent is required.")).toBe(true);
    expect(isUserOwnedBlockerEvidence("Runtime transport failed.")).toBe(false);
  });
});

describe("automatic application safeguard identity", () => {
  test("suppresses failure notifications after the persisted run is cancelled", () => {
    const result = ApplyJobResultSchema.parse({
      id: "result-cancel-race",
      runId: "run-cancel-race",
      jobId: "job-cancel-race",
      state: "failed",
      summary: "Application preparation failed.",
      detail: "The provider returned a runtime error.",
      startedAt,
      updatedAt: completedAt,
      completedAt,
    });
    const cancelledRun = ApplyRunSchema.parse({
      id: "run-cancel-race",
      campaignId: "campaign-1",
      mode: "queue_auto",
      state: "cancelled",
      jobIds: [result.jobId],
      createdAt: startedAt,
      updatedAt: completedAt,
      completedAt,
      summary: "Automatic apply run cancelled.",
      detail: "The queued run was cancelled before final submit.",
    });
    const activeRun = ApplyRunSchema.parse({
      ...cancelledRun,
      state: "running",
      completedAt: null,
      summary: "Automatic apply queue is running.",
    });

    expect(
      shouldPersistApplicationFailureNotification({
        result,
        run: cancelledRun,
      }),
    ).toBe(false);
    expect(
      shouldPersistApplicationFailureNotification({ result, run: activeRun }),
    ).toBe(true);
  });

  function verifiedSubmission(appliedAt: string) {
    const run = ApplyRunSchema.parse({
      id: "run-1",
      campaignId: null,
      mode: "queue_auto",
      state: "completed",
      jobIds: ["job-a", "job-b"],
      createdAt: startedAt,
      updatedAt: appliedAt,
      completedAt: appliedAt,
      summary: "Completed",
      detail: "Completed safely.",
    });
    const result = (jobId: string) =>
      ApplyJobResultSchema.parse({
        id: `result-${jobId}`,
        runId: run.id,
        jobId,
        state: "submitted",
        summary: "Submitted",
        detail: "Submitted with final receipt.",
        startedAt,
        updatedAt: appliedAt,
        completedAt: appliedAt,
        privacyReceipt: {
          generatedAt: appliedAt,
          lineage: { runId: run.id, jobId, resultId: `result-${jobId}` },
          destination: { origin: "https://example.com", safePath: "/apply" },
          resume: { source: "original_upload", fileName: "resume.pdf" },
          finalSubmitAuthorized: true,
          finalSubmitOccurred: true,
        },
      });
    return {
      run,
      results: [result("job-a"), result("job-b")],
      records: [
        ApplicationRecordSchema.parse({
          id: "application-a",
          jobId: "job-a",
          title: "Engineer A",
          company: "Acme",
          status: "submitted",
          lastActionLabel: "Submitted",
          nextActionLabel: null,
          lastUpdatedAt: appliedAt,
        }),
        ApplicationRecordSchema.parse({
          id: "application-b",
          jobId: "job-b",
          title: "Engineer B",
          company: "Acme",
          status: "submitted",
          lastActionLabel: "Submitted",
          nextActionLabel: null,
          lastUpdatedAt: appliedAt,
        }),
      ],
    };
  }

  test("uses the verified submission occurrence in conflict identity", () => {
    const first = verifiedSubmission("2026-08-15T10:01:00.000Z");
    const second = verifiedSubmission("2026-08-16T10:01:00.000Z");
    const input = (submission: ReturnType<typeof verifiedSubmission>) =>
      deriveSimultaneousApplicationConflicts({
        ...submission,
        runs: [submission.run],
        companies: [],
        now: "2026-08-17T10:00:00.000Z",
        windowDays: 7,
      });

    const firstConflict = input(first)[0];
    const secondConflict = input(second)[0];
    expect(firstConflict?.conflictId).toBeTruthy();
    expect(secondConflict?.conflictId).toBeTruthy();
    expect(firstConflict?.conflictId).not.toBe(secondConflict?.conflictId);
    expect(input(first)[0]?.conflictId).toBe(firstConflict?.conflictId);
  });
});
