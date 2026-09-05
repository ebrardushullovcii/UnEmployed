import { describe, expect, test } from "vitest";
import {
  CandidateProfileSchema,
  ResumeImportRunSchema,
  type ResumeImportRun,
} from "@unemployed/contracts";
import {
  clearSettledVisionDeferredWarnings,
  interruptedVisionMessage,
  recoverInterruptedDeferredVisionRun,
} from "./resume-import-recovery";

function makeRun(visionStatus: "running" | "completed"): ResumeImportRun {
  return ResumeImportRunSchema.parse({
    id: "resume_import_restart_test",
    sourceResumeId: "resume_restart_test",
    sourceResumeFileName: "candidate.pdf",
    trigger: "import",
    status: "review_ready",
    startedAt: "2026-07-31T10:00:00.000Z",
    completedAt: "2026-07-31T10:00:05.000Z",
    warnings:
      visionStatus === "running"
        ? [
            "Visual scan is still running. Your text import is ready, and visual reconciliation will continue in the background for up to 10 minutes.",
          ]
        : [],
    modelRoles: {
      vision: {
        status: visionStatus,
        startedAt: "2026-07-31T10:00:01.000Z",
        completedAt:
          visionStatus === "completed" ? "2026-07-31T10:00:04.000Z" : null,
      },
    },
  });
}

describe("recoverInterruptedDeferredVisionRun", () => {
  test("replaces an orphaned running branch with truthful restart guidance", () => {
    const recovered = recoverInterruptedDeferredVisionRun({
      run: makeRun("running"),
      isActiveInCurrentProcess: false,
      now: "2026-07-31T10:10:00.000Z",
    });

    expect(recovered.status).toBe("review_ready");
    expect(recovered.modelRoles?.vision).toMatchObject({
      status: "failed",
      completedAt: "2026-07-31T10:10:00.000Z",
      warning: interruptedVisionMessage,
      errorMessage: interruptedVisionMessage,
    });
    expect(recovered.warnings).toEqual([interruptedVisionMessage]);
  });

  test("does not interrupt a branch owned by the current process", () => {
    const run = makeRun("running");
    expect(
      recoverInterruptedDeferredVisionRun({
        run,
        isActiveInCurrentProcess: true,
      }),
    ).toEqual(run);
  });

  test("leaves a completed branch unchanged", () => {
    const run = makeRun("completed");
    expect(
      recoverInterruptedDeferredVisionRun({
        run,
        isActiveInCurrentProcess: false,
      }),
    ).toEqual(run);
  });

  test("removes a stale deferred note from the profile after vision settles", () => {
    const profile = CandidateProfileSchema.parse({
      id: "candidate_restart_test",
      firstName: "Casey",
      lastName: "Rowan",
      fullName: "Casey Rowan",
      headline: "Frontend engineer",
      summary: "Frontend engineer.",
      currentLocation: "Portland, Oregon",
      yearsExperience: 8,
      baseResume: {
        id: "resume_restart_test",
        fileName: "candidate.pdf",
        uploadedAt: "2026-07-31T10:00:00.000Z",
        storagePath: "C:/safe/candidate.pdf",
        sha256:
          "68b74daf9967149a7e36a972c676c085d3d31c4f0b06307a5a4cf90c9f6b94d2",
        extractionStatus: "ready",
        analysisWarnings: [
          "Visual scan is still running after text import completed; text import is ready and visual reconciliation will continue in the background until the 600000ms vision provider deadline.",
          "Preferred locations",
        ],
      },
    });

    expect(
      clearSettledVisionDeferredWarnings({
        profile,
        run: makeRun("completed"),
      }).baseResume.analysisWarnings,
    ).toEqual(["Preferred locations"]);
  });
});
