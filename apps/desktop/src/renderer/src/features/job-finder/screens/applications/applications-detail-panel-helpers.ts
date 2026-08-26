import type {
  ApplicationRecord,
  ApplicationPrivacyReceipt,
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

const APPLY_TRANSPORT_LANGUAGE =
  /\b(?:post|xhr|xmlhttprequest|fetch|network request|mutating page action|prepare-only (?:safety )?guard)\b/i;

const EXTERNAL_WRITE_CATEGORY_LABELS: Record<
  ApplicationPrivacyReceipt["externalWrites"][number]["category"],
  string
> = {
  resume_attachment: "a resume attachment",
  profile_field: "profile fields",
  application_answer: "application answers",
  consent_control: "consent choices",
  other: "other prepared fields",
};

export function getVerifiedExternalWriteRecoveryText(
  receipt: ApplicationPrivacyReceipt | null | undefined,
): string {
  const verifiedCategories = [
    ...new Set(
      (receipt?.externalWrites ?? [])
        .filter((write) => write.verified)
        .map((write) => EXTERNAL_WRITE_CATEGORY_LABELS[write.category]),
    ),
  ];

  if (verifiedCategories.length === 0) {
    return "No verified site writes are recorded for this run. Review what remains on the employer page before retrying.";
  }

  return `The receipt verifies writes to the employer page for ${verifiedCategories.join(", ")}. It does not confirm how the site stored them or what remains; review the employer page before retrying.`;
}

export function getCustomerFacingApplyText(
  value: string | null | undefined,
  receipt?: ApplicationPrivacyReceipt | null,
): string | null {
  const text = value?.trim() ?? "";
  if (!text) {
    return null;
  }
  if (!APPLY_TRANSPORT_LANGUAGE.test(text)) {
    return text;
  }

  const externalWriteText = getVerifiedExternalWriteRecoveryText(receipt);
  if (/\b(?:resume|cv|attachment|upload)\b/i.test(text)) {
    return `The selected resume could not be attached. ${externalWriteText} Approve and retry the attachment. Job Finder stopped without a submit click. Verify the outcome on the site, and treat an unexpected completed state as site behavior to report.`;
  }

  return `The application page could not safely save this prepared step. ${externalWriteText} Job Finder stopped without a submit click. Verify the outcome on the site, and treat an unexpected completed state as site behavior to report.`;
}

export function applyResultNeedsResumeAttachment(
  result: JobFinderWorkspaceSnapshot["applyJobResults"][number] | null,
): boolean {
  if (!result) {
    return false;
  }

  if (
    result.state === "blocked" ||
    result.state === "failed" ||
    // The real-CV guard can stop at review with a required human decision;
    // those results must still offer the CV-specific approve/retry CTA.
    (result.state === "awaiting_review" &&
      result.blockerReason === "required_human_input")
  ) {
    const text = [result.summary, result.detail, result.blockerSummary]
      .filter(Boolean)
      .join(" ");
    return (
      /\b(?:resume|cv)\b/i.test(text) &&
      /\b(?:not attached|attach(?:ment)? needs|could not be attached|retry.*attach|upload.*failed)\b/i.test(
        text,
      )
    );
  }

  return false;
}

export function buildQueueEntries(input: {
  applicationRecords: readonly ApplicationRecord[];
  applyJobResults: JobFinderWorkspaceSnapshot["applyJobResults"];
  discoveryJobs: JobFinderWorkspaceSnapshot["discoveryJobs"];
  selectedRun: JobFinderWorkspaceSnapshot["applyRuns"][number] | null;
}): QueueEntry[] {
  const { applicationRecords, applyJobResults, discoveryJobs, selectedRun } =
    input;

  if (!selectedRun) {
    return [];
  }

  const selectedRunResults = applyJobResults.filter(
    (result) => result.runId === selectedRun.id,
  );
  const discoveryJobsById = new Map(
    discoveryJobs.map((job) => [job.id, job] as const),
  );

  return selectedRun.jobIds.map((jobId) => {
    const matchingResults = selectedRunResults.filter(
      (result) => result.jobId === jobId,
    );
    const runResult = matchingResults.length === 1 ? matchingResults[0]! : null;
    const relatedRecord = runResult?.applicationRecordId
      ? (applicationRecords.find(
          (record) => record.id === runResult.applicationRecordId,
        ) ?? null)
      : null;
    const relatedSavedJob = discoveryJobsById.get(jobId) ?? null;
    const includeInRecovery =
      !runResult ||
      runResult.applicationRecordId === null ||
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
    return "This run is paused on a live consent decision. Resolve the consent request to continue, or start a fresh safe run with only the blocked jobs.";
  }

  // A stop-rule pause holds no pending decision to resolve, so the run can
  // never resume; finishing the remaining jobs requires a fresh recovery run.
  if (input.runState === "paused_for_user_review") {
    return "Job Finder paused this run on one of its stop rules. It will not continue on its own and no consent decision is holding it here. Use Queue remaining jobs to finish the unfinished jobs in a fresh safe recovery run.";
  }

  if (input.runState === "awaiting_submit_approval") {
    return "This run is waiting for Preparation approval and has not started yet. Approve safe preparation to let the fill-only pass begin, or stage a narrower selection if the job list changed. Final submission remains disabled.";
  }

  if (input.runState === "cancelled") {
    return "This historical run was cancelled before it finished. Remaining planned, blocked, failed, or skipped jobs can be prepared again in a fresh safe run.";
  }

  if (input.failedJobCount > 0) {
    return "Some jobs in this run failed before the flow could reach a stable review-safe state. Review the per-job outcomes below before preparing only the unfinished jobs.";
  }

  if (input.blockedJobCount > 0 || input.skippedJobCount > 0) {
    return "This historical run hit blocked or skipped jobs. Applications keeps those outcomes and can prepare only the unfinished jobs without repeating completed work.";
  }

  if (input.completedJobCount === input.selectedJobCount) {
    return "Every job in this historical run already reached a review-ready or terminal outcome. Recovery is available only if you want to start a completely fresh run another way.";
  }

  return "This run still has unfinished jobs. Review the per-job outcomes below before deciding whether to prepare the remaining work.";
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
