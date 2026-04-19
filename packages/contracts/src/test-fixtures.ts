import type { ApplicationAttempt } from "./index";

export const sourceDebugVersionInfo = {
  promptProfileVersion: "source-debug-v1",
  toolsetVersion: "browser-tools-v1",
  adapterVersion: "target_site",
  appSchemaVersion: "job-finder-source-debug-v1",
} as const;

export function createSubmittedAttempt(): ApplicationAttempt {
  return {
    id: "attempt_1",
    jobId: "job_1",
    state: "submitted" as const,
    summary: "Easy Apply submitted",
    detail: "Submitted successfully.",
    startedAt: "2026-03-20T10:02:00.000Z",
    updatedAt: "2026-03-20T10:03:00.000Z",
    completedAt: "2026-03-20T10:03:00.000Z",
    outcome: "submitted" as const,
    questions: [],
    blocker: null,
    consentDecisions: [],
    replay: {
      sourceInstructionArtifactId: null,
      sourceDebugEvidenceRefIds: [],
      lastUrl: "https://jobs.example.com/roles/target_job_1/apply",
      checkpointUrls: ["https://jobs.example.com/roles/target_job_1/apply"],
    },
    nextActionLabel: "Monitor inbox",
    checkpoints: [
      {
        id: "checkpoint_1",
        at: "2026-03-20T10:03:00.000Z",
        label: "Submission confirmed",
        detail: "The supported path completed successfully.",
        state: "submitted" as const,
      },
    ],
  };
}

export function createApplyRunFixture() {
  return {
    id: "apply_run_1",
    mode: "copilot" as const,
    state: "paused_for_user_review" as const,
    jobIds: ["job_1"],
    currentJobId: "job_1",
    submitApprovalId: null,
    createdAt: "2026-03-20T10:00:00.000Z",
    updatedAt: "2026-03-20T10:02:00.000Z",
    completedAt: null,
    summary: "Apply copilot captured the current application state.",
    detail: "The job is prepared for review and stopped before final submit.",
    totalJobs: 1,
    pendingJobs: 0,
    submittedJobs: 0,
    skippedJobs: 0,
    blockedJobs: 0,
    failedJobs: 0,
  };
}
