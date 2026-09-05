import { describe, expect, it } from "vitest";

import { createFrozenEvalCases } from "./case-registry";
import { EvalAttemptSchema } from "./contracts";
import { gradeEvalAttempt } from "./grader";

function findCase(id: string) {
  const evalCase = createFrozenEvalCases().find(
    (candidate) => candidate.id === id,
  );
  if (!evalCase) throw new Error(`Missing test case ${id}`);
  return evalCase;
}

describe("gradeEvalAttempt", () => {
  it("requires exact job fields and URLs rather than accepting only a count", () => {
    const evalCase = findCase("job_page_extraction_sparse_cards");
    const attempt = EvalAttemptSchema.parse({
      runId: "run_1",
      caseId: evalCase.id,
      laneId: "sol_low",
      startedAt: "2026-08-12T00:00:00.000Z",
      durationMs: 100,
      status: "succeeded",
      providerCallCount: 1,
      fallbackDetected: false,
      guardedRejectionDetected: false,
      rawHttp: [],
      modelOutput: {
        jobs: [
          {
            title: "QA Engineer",
            company: "Bright Co",
            location: "Remote",
            canonicalUrl: "https://jobs.example.com/jobs/qa-1",
          },
          {
            title: "Data Engineer",
            company: "Lake Co",
            location: "Berlin",
            canonicalUrl: "https://jobs.example.com/jobs/data-2",
          },
        ],
      },
      productOutput: [
        {
          title: "QA Engineer",
          company: "Wrong Company",
          location: "Remote",
          canonicalUrl: "https://jobs.example.com/jobs/qa-1",
        },
        {
          title: "Data Engineer",
          company: "Wrong Company",
          location: "Berlin",
          canonicalUrl: "https://jobs.example.com/jobs/data-2",
        },
      ],
      error: null,
    });

    const grade = gradeEvalAttempt(evalCase, attempt);
    expect(grade.modelContribution.expectedEvidenceScore).toBe(100);
    expect(grade.guardedProduct.expectedEvidenceScore).toBeLessThan(100);
  });

  it("penalizes fallbacks and guarded rejection independently of final output", () => {
    const evalCase = findCase("profile_copilot_headline");
    const attempt = EvalAttemptSchema.parse({
      runId: "run_2",
      caseId: evalCase.id,
      laneId: "luna_high",
      startedAt: "2026-08-12T00:00:00.000Z",
      durationMs: 100,
      status: "fallback_succeeded",
      providerCallCount: 1,
      fallbackDetected: true,
      guardedRejectionDetected: true,
      rawHttp: [],
      modelOutput: { value: "Product-minded Frontend Engineer" },
      productOutput: { value: "Product-minded Frontend Engineer" },
      error: "schema rejected",
    });

    const grade = gradeEvalAttempt(evalCase, attempt);
    expect(grade.fallbackPenalty).toBe(35);
    expect(grade.guardedRejectionPenalty).toBe(15);
    expect(grade.objectiveModelScore).toBeLessThan(grade.objectiveProductScore);
    expect(grade.notes).toContain("Product fallback was used.");
  });

  it("rejects Profile Copilot prose that lacks the typed operation", () => {
    const evalCase = findCase("profile_copilot_headline");
    const baseAttempt = {
      runId: "run_3",
      caseId: evalCase.id,
      laneId: "sol_low" as const,
      startedAt: "2026-08-12T00:00:00.000Z",
      durationMs: 100,
      status: "succeeded" as const,
      providerCallCount: 1,
      fallbackDetected: false,
      guardedRejectionDetected: false,
      rawHttp: [],
      error: null,
    };
    const attempt = EvalAttemptSchema.parse({
      ...baseAttempt,
      modelOutput: { content: "Product-minded Frontend Engineer" },
      productOutput: {
        content: "Ready",
        patchGroups: [
          {
            id: "group_1",
            summary: "Update headline",
            applyMode: "needs_review",
            createdAt: "2026-08-12T00:00:00.000Z",
            operations: [
              {
                operation: "replace_identity_fields",
                value: { headline: "Product-minded Frontend Engineer" },
              },
            ],
          },
        ],
      },
    });

    const grade = gradeEvalAttempt(evalCase, attempt);
    expect(grade.modelContribution.expectedEvidenceScore).toBe(50);
    expect(grade.guardedProduct.expectedEvidenceScore).toBe(100);
  });
});
