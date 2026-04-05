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
