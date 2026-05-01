import type {
  ApplicationRecord,
  ApplyRunDetails,
  ApplySubmitApproval,
  JobFinderWorkspaceSnapshot,
} from "@unemployed/contracts";

export type QueueEntry = {
  jobId: string;
  label: string;
  runResult: JobFinderWorkspaceSnapshot["applyJobResults"][number] | null;
  includeInRecovery: boolean;
};

export function buildQueueEntries(input: {
  applicationRecords: readonly ApplicationRecord[];
  applyJobResults: JobFinderWorkspaceSnapshot["applyJobResults"];
  discoveryJobs: JobFinderWorkspaceSnapshot["discoveryJobs"];
  selectedRun: JobFinderWorkspaceSnapshot["applyRuns"][number] | null;
}): QueueEntry[] {
  const { applicationRecords, applyJobResults, discoveryJobs, selectedRun } = input;

  if (!selectedRun) {
    return [];
  }

  const applyResultsByJobId = new Map(
    applyJobResults
      .filter((result) => result.runId === selectedRun.id)
      .map((result) => [result.jobId, result] as const),
  );
  const applicationRecordsByJobId = new Map(
    applicationRecords.map((record) => [record.jobId, record] as const),
  );
  const discoveryJobsById = new Map(
    discoveryJobs.map((job) => [job.id, job] as const),
  );

  return selectedRun.jobIds.map((jobId) => {
    const runResult = applyResultsByJobId.get(jobId) ?? null;
    const relatedRecord = applicationRecordsByJobId.get(jobId) ?? null;
    const relatedSavedJob = discoveryJobsById.get(jobId) ?? null;
    const includeInRecovery =
      !runResult ||
      runResult.state === "planned" ||
      runResult.state === "blocked" ||
      runResult.state === "failed" ||
      runResult.state === "skipped";

    return {
      jobId,
      label: relatedRecord
        ? `${relatedRecord.title} at ${relatedRecord.company}`
        : relatedSavedJob
          ? `${relatedSavedJob.title} at ${relatedSavedJob.company}`
          : jobId,
      runResult,
      includeInRecovery,
    };
  });
}

export function getApplyDetailsStatusBadge(
  status: "idle" | "loading" | "ready" | "error",
) {
  switch (status) {
    case "loading":
      return { tone: "active" as const, label: "Loading details" };
    case "error":
      return { tone: "critical" as const, label: "Details unavailable" };
    case "ready":
      return { tone: "positive" as const, label: "Details ready" };
    default:
      return { tone: "muted" as const, label: "Details idle" };
  }
}

export function getQueueRecoveryTone(
  state: JobFinderWorkspaceSnapshot["applyJobResults"][number]["state"] | null,
) {
  if (state === "awaiting_review" || state === "submitted") {
    return "positive" as const;
  }

  if (state === "blocked" || state === "failed" || state === "skipped") {
    return "critical" as const;
  }

  if (state === "planned") {
    return "muted" as const;
  }

  return "active" as const;
}

export function getQueueStateExplanation(
  input: {
    runState: JobFinderWorkspaceSnapshot["applyRuns"][number]["state"];
    selectedJobCount: number;
    blockedJobCount: number;
    skippedJobCount: number;
    failedJobCount: number;
    completedJobCount: number;
  } | null,
) {
  if (!input) {
    return null;
  }

  if (input.runState === "paused_for_consent") {
    return "This queue is paused on a live consent decision. Resolve the consent request to continue, or restage only the blocked jobs into a fresh safe queue.";
  }

  if (input.runState === "awaiting_submit_approval") {
    return "This queue is staged but has not started yet. Record submit approval to let the safe fill-only queue begin, or restage a narrower queue if the job list changed.";
  }

  if (input.runState === "cancelled") {
    return "This historical queue was cancelled before it finished. Remaining planned, blocked, failed, or skipped jobs can be restaged into a fresh safe queue.";
  }

  if (input.failedJobCount > 0) {
    return "Some jobs in this queue failed before the flow could reach a stable review-safe state. Review the per-job outcomes below before restaging only the unfinished jobs.";
  }

  if (input.blockedJobCount > 0 || input.skippedJobCount > 0) {
    return "This historical queue hit blocked or skipped jobs. Applications keeps those outcomes and can restage only the unfinished jobs without re-adding completed work.";
  }

  if (input.completedJobCount === input.selectedJobCount) {
    return "Every job in this historical queue already reached a review-ready or terminal outcome. Recovery is available only if you want to start a completely fresh run another way.";
  }

  return "This queue still has unfinished jobs. Review the per-job outcomes below before deciding whether to restage the remaining work.";
}

export function formatVisibleRunId(runId: string): string {
  return runId.length <= 8 ? runId : runId.slice(-8);
}

export function getAnswerTone(
  status: ApplyRunDetails["answerRecords"][number]["status"],
) {
  switch (status) {
    case "filled":
    case "submitted":
      return "positive" as const;
    case "rejected":
    case "skipped":
      return "critical" as const;
    default:
      return "active" as const;
  }
}

export function getConsentTone(
  status: ApplyRunDetails["consentRequests"][number]["status"],
) {
  switch (status) {
    case "approved":
      return "positive" as const;
    case "declined":
    case "expired":
      return "critical" as const;
    default:
      return "active" as const;
  }
}

export function getApprovalTone(status: ApplySubmitApproval["status"]) {
  switch (status) {
    case "approved":
      return "positive" as const;
    case "declined":
    case "revoked":
    case "expired":
      return "critical" as const;
    default:
      return "active" as const;
  }
}
