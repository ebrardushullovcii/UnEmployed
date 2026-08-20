import type {
  JobFinderIntelligenceSafeguards,
  JobFinderWorkspaceSnapshot,
  ListingSignalRecord,
  SafeguardDismissal,
  SafeguardEntryKind,
  SafeguardMutationInput,
} from "@unemployed/contracts";
import type { BadgeTone } from "../../lib/job-finder-types";

/**
 * Stable per-mutation key used for pending-action scopes so the Safeguards
 * screen and the page controller agree on which control is in flight.
 */
export function safeguardMutationKey(input: SafeguardMutationInput): string {
  let reference = "global";
  switch (input.type) {
    case "apply_company_application_evidence":
      reference = input.config.companyId;
      break;
    case "record_simultaneous_application_conflict":
    case "resolve_simultaneous_application_conflict":
      reference = input.conflictId;
      break;
    case "record_listing_signal":
      reference = input.signalId;
      break;
    case "record_abnormal_failure_evidence":
      reference = input.pauseId;
      break;
    case "prepare_batch_sample_review":
    case "update_batch_sample_review":
      reference = input.reviewId;
      break;
    case "record_contradictory_answer_detection":
    case "resolve_contradictory_answer_detection":
    case "dismiss_contradictory_answer_detection":
      reference = input.detectionId;
      break;
    case "dismiss_safeguard_entry":
      reference = `${input.kind}:${input.referenceId}`;
      break;
    case "restore_safeguard_entry":
      reference = input.dismissalId;
      break;
    default: {
      const unreachable: never = input;
      reference = String(unreachable);
    }
  }
  return `${input.type}:${reference}`;
}

export type SafeguardTabId =
  | "all"
  | "caps"
  | "conflicts"
  | "signals"
  | "pauses"
  | "reviews"
  | "contradictions"
  | "dismissals";

export type SafeguardControlKind =
  | "resolve"
  | "dismiss"
  | "restore"
  | "review_increment";

export interface SafeguardControl {
  id: string;
  label: string;
  kind: SafeguardControlKind;
  mutation: SafeguardMutationInput;
}

export interface SafeguardRow {
  key: string;
  kind: Exclude<SafeguardTabId, "all">;
  title: string;
  subtitle: string;
  explanation: string;
  recoveryGuidance: string;
  statusLabel: string;
  statusTone: BadgeTone;
  active: boolean;
  blocked: boolean;
  dismissed: boolean;
  lineage: {
    jobs: readonly string[];
    companies: readonly string[];
    campaigns: readonly string[];
  };
  tags: readonly string[];
  controls: readonly SafeguardControl[];
  searchText: string;
}

export interface SafeguardsPresentationModel {
  rows: readonly SafeguardRow[];
  counts: {
    caps: number;
    conflicts: number;
    signals: number;
    pauses: number;
    reviews: number;
    contradictions: number;
    dismissals: number;
    blockers: number;
  };
}

export interface BuildSafeguardsPresentationModelInput {
  safeguards: JobFinderIntelligenceSafeguards;
  workspace: JobFinderWorkspaceSnapshot;
}

function jobLabel(
  workspace: JobFinderWorkspaceSnapshot,
  jobId: string,
): string {
  const job = workspace.discoveryJobs.find((entry) => entry.id === jobId);
  if (job) return `${job.title} · ${job.company ?? "Unknown company"}`;
  const record = workspace.applicationRecords.find(
    (entry) => entry.jobId === jobId,
  );
  if (record) return `${record.title} · ${record.company}`;
  return jobId;
}

function companyLabel(
  workspace: JobFinderWorkspaceSnapshot,
  companyId: string,
): string {
  const company = workspace.intelligence.companies.find(
    (entry) => entry.id === companyId,
  );
  return company?.canonicalName ?? companyId;
}

function applicationRecordLabel(
  workspace: JobFinderWorkspaceSnapshot,
  applicationRecordId: string,
): string {
  const record = workspace.applicationRecords.find(
    (entry) => entry.id === applicationRecordId,
  );
  return record ? `${record.title} · ${record.company}` : applicationRecordId;
}

function dismissalReferenceLabel(
  workspace: JobFinderWorkspaceSnapshot,
  safeguards: JobFinderIntelligenceSafeguards,
  dismissal: SafeguardDismissal,
): string {
  switch (dismissal.kind) {
    case "company_cap_limit": {
      const cap = safeguards.companyApplicationCaps.find(
        (entry) => entry.id === dismissal.referenceId,
      );
      return cap
        ? `Application limit · ${companyLabel(workspace, cap.companyId)}`
        : dismissal.referenceId;
    }
    case "simultaneous_application_conflict": {
      const conflict = safeguards.simultaneousApplicationConflicts.find(
        (entry) => entry.id === dismissal.referenceId,
      );
      return conflict
        ? `Conflict: ${applicationRecordLabel(workspace, conflict.applicationRecordId)} ↔ ${applicationRecordLabel(workspace, conflict.conflictingApplicationRecordId)}`
        : dismissal.referenceId;
    }
    case "listing_signal": {
      const signal = safeguards.listingSignals.find(
        (entry) => entry.id === dismissal.referenceId,
      );
      return signal
        ? `Listing ${signal.signal} · ${jobLabel(workspace, signal.jobId)}`
        : dismissal.referenceId;
    }
    case "abnormal_failure_pause":
      return safeguards.abnormalFailurePauses.some(
        (entry) => entry.id === dismissal.referenceId,
      )
        ? "Abnormal failure pause"
        : dismissal.referenceId;
    case "batch_sample_review_pending":
      return safeguards.preparedBatchSampleReviews.some(
        (entry) => entry.id === dismissal.referenceId,
      )
        ? "Quality sample review"
        : dismissal.referenceId;
    case "contradictory_answer":
      return safeguards.contradictoryAnswerDetections.some(
        (entry) => entry.id === dismissal.referenceId,
      )
        ? "Contradictory reused answers"
        : dismissal.referenceId;
  }
}

function campaignLabelsForJobs(
  workspace: JobFinderWorkspaceSnapshot,
  jobIds: readonly string[],
): readonly string[] {
  const labels: string[] = [];
  for (const campaign of workspace.campaigns) {
    if (campaign.jobIds.some((jobId) => jobIds.includes(jobId))) {
      labels.push(campaign.name);
    }
  }
  return labels;
}

function dismissalPairKey(kind: string, referenceId: string): string {
  return `${kind}\u0000${referenceId}`;
}

function findDismissal(
  safeguards: JobFinderIntelligenceSafeguards,
  kind: SafeguardEntryKind,
  referenceId: string,
): SafeguardDismissal | null {
  const pair = dismissalPairKey(kind, referenceId);
  return (
    safeguards.safeguardDismissals.find(
      (dismissal) =>
        dismissalPairKey(dismissal.kind, dismissal.referenceId) === pair,
    ) ?? null
  );
}

function latestSignalIdsByJob(
  safeguards: JobFinderIntelligenceSafeguards,
): ReadonlyMap<string, string> {
  const latest = new Map<string, ListingSignalRecord>();
  for (const signal of safeguards.listingSignals) {
    const current = latest.get(signal.jobId);
    if (
      !current ||
      signal.detectedAt > current.detectedAt ||
      (signal.detectedAt === current.detectedAt && signal.id > current.id)
    ) {
      latest.set(signal.jobId, signal);
    }
  }
  return new Map(
    [...latest.entries()].map(([jobId, signal]) => [jobId, signal.id]),
  );
}

export function buildSafeguardsPresentationModel(
  input: BuildSafeguardsPresentationModelInput,
): SafeguardsPresentationModel {
  const { safeguards, workspace } = input;
  const latestByJob = latestSignalIdsByJob(safeguards);
  const rows: SafeguardRow[] = [];

  const pushRow = (row: SafeguardRow) => {
    rows.push(row);
  };

  const baseLineage = (
    jobIds: readonly string[],
    companyIds: readonly string[],
  ) => ({
    jobs: [...new Set(jobIds)].map((jobId) => jobLabel(workspace, jobId)),
    companies: [...new Set(companyIds)].map((companyId) =>
      companyLabel(workspace, companyId),
    ),
    campaigns: campaignLabelsForJobs(workspace, jobIds),
  });

  for (const cap of safeguards.companyApplicationCaps) {
    const dismissal = findDismissal(safeguards, "company_cap_limit", cap.id);
    const active = cap.limitReached;
    const companyJobs =
      workspace.intelligence.companies.find(
        (company) => company.id === cap.companyId,
      )?.jobIds ?? [];
    const lineage = baseLineage(companyJobs, [cap.companyId]);
    const controls: SafeguardControl[] = [];
    if (active && !dismissal) {
      controls.push({
        id: `cap-dismiss-${cap.id}`,
        label: "Dismiss cap",
        kind: "dismiss",
        mutation: {
          type: "dismiss_safeguard_entry",
          kind: "company_cap_limit",
          referenceId: cap.id,
          reason: "user_resolved",
          note: "User acknowledged the cap.",
        },
      });
    }
    if (dismissal) {
      controls.push({
        id: `cap-restore-${cap.id}`,
        label: "Restore cap (retry)",
        kind: "restore",
        mutation: {
          type: "restore_safeguard_entry",
          dismissalId: dismissal.id,
        },
      });
    }
    pushRow({
      key: `cap-${cap.id}`,
      kind: "caps",
      title: `${cap.currentWindowCount}/${cap.maxApplicationsPerWindow} applications`,
      subtitle: `Company cap · ${cap.windowDays}-day window since ${cap.windowStartedAt}`,
      explanation: cap.explanation,
      recoveryGuidance: cap.recoveryGuidance,
      statusLabel: active ? "Limit reached" : "Within limit",
      statusTone: active ? (dismissal ? "muted" : "critical") : "positive",
      active,
      blocked: active && !dismissal,
      dismissed: Boolean(dismissal),
      lineage,
      tags: [`company:${companyLabel(workspace, cap.companyId)}`],
      controls,
      searchText: [
        cap.explanation,
        cap.recoveryGuidance,
        companyLabel(workspace, cap.companyId),
        ...lineage.jobs,
        ...lineage.companies,
        ...lineage.campaigns,
      ]
        .join(" ")
        .toLowerCase(),
    });
  }

  for (const conflict of safeguards.simultaneousApplicationConflicts) {
    const dismissal = findDismissal(
      safeguards,
      "simultaneous_application_conflict",
      conflict.id,
    );
    const active = conflict.status === "detected";
    const jobIds = [
      conflict.applicationRecordId,
      conflict.conflictingApplicationRecordId,
    ].map((recordId) => {
      const record = workspace.applicationRecords.find(
        (entry) => entry.id === recordId,
      );
      return record?.jobId ?? recordId;
    });
    const controls: SafeguardControl[] = [];
    if (active && !dismissal) {
      controls.push({
        id: `conflict-resolve-${conflict.id}`,
        label: "Resolve conflict",
        kind: "resolve",
        mutation: {
          type: "resolve_simultaneous_application_conflict",
          conflictId: conflict.id,
        },
      });
      controls.push({
        id: `conflict-dismiss-${conflict.id}`,
        label: "Dismiss",
        kind: "dismiss",
        mutation: {
          type: "dismiss_safeguard_entry",
          kind: "simultaneous_application_conflict",
          referenceId: conflict.id,
          reason: "not_applicable",
          note: "User acknowledged the conflict.",
        },
      });
    }
    if (dismissal) {
      controls.push({
        id: `conflict-restore-${conflict.id}`,
        label: "Restore (retry)",
        kind: "restore",
        mutation: {
          type: "restore_safeguard_entry",
          dismissalId: dismissal.id,
        },
      });
    }
    pushRow({
      key: `conflict-${conflict.id}`,
      kind: "conflicts",
      title: `Conflict: ${applicationRecordLabel(workspace, conflict.applicationRecordId)} ↔ ${applicationRecordLabel(workspace, conflict.conflictingApplicationRecordId)}`,
      subtitle:
        conflict.status === "detected"
          ? "Two applications overlapped in time"
          : "Conflict resolved",
      explanation: conflict.explanation,
      recoveryGuidance: conflict.recoveryGuidance,
      statusLabel: active ? "Detected" : "Resolved",
      statusTone: active ? (dismissal ? "muted" : "critical") : "positive",
      active,
      blocked: active && !dismissal,
      dismissed: Boolean(dismissal),
      lineage: baseLineage(jobIds, []),
      tags: jobIds.map((jobId) => `job:${jobId}`),
      controls,
      searchText: [
        conflict.explanation,
        conflict.recoveryGuidance,
        ...jobIds,
        ...baseLineage(jobIds, []).jobs,
      ]
        .join(" ")
        .toLowerCase(),
    });
  }

  for (const signal of safeguards.listingSignals) {
    const dismissal = findDismissal(safeguards, "listing_signal", signal.id);
    const isLatestForJob = latestByJob.get(signal.jobId) === signal.id;
    const active = isLatestForJob;
    const jobIds = [signal.jobId];
    const controls: SafeguardControl[] = [];
    if (active && !dismissal) {
      controls.push({
        id: `signal-dismiss-${signal.id}`,
        label: "Dismiss signal",
        kind: "dismiss",
        mutation: {
          type: "dismiss_safeguard_entry",
          kind: "listing_signal",
          referenceId: signal.id,
          reason: "rechecked",
          note: "Re-verified the listing.",
        },
      });
    }
    if (dismissal) {
      controls.push({
        id: `signal-restore-${signal.id}`,
        label: "Restore (retry)",
        kind: "restore",
        mutation: {
          type: "restore_safeguard_entry",
          dismissalId: dismissal.id,
        },
      });
    }
    pushRow({
      key: `signal-${signal.id}`,
      kind: "signals",
      title: `Listing ${signal.signal}`,
      subtitle: `${signal.provenance} · confidence ${Math.round(signal.confidence * 100)}%`,
      explanation: signal.explanation,
      recoveryGuidance: signal.recoveryGuidance,
      statusLabel: active
        ? dismissal
          ? "Dismissed"
          : "Blocking"
        : "Superseded",
      statusTone: active ? (dismissal ? "muted" : "critical") : "neutral",
      active,
      blocked: active && !dismissal,
      dismissed: Boolean(dismissal),
      lineage: baseLineage(jobIds, []),
      tags: [`signal:${signal.signal}`],
      controls,
      searchText: [
        signal.signal,
        signal.explanation,
        signal.recoveryGuidance,
        signal.detail ?? "",
        ...baseLineage(jobIds, []).jobs,
      ]
        .join(" ")
        .toLowerCase(),
    });
  }

  for (const pause of safeguards.abnormalFailurePauses) {
    const dismissal = findDismissal(
      safeguards,
      "abnormal_failure_pause",
      pause.id,
    );
    const active = pause.paused;
    const controls: SafeguardControl[] = [];
    if (active && !dismissal) {
      controls.push({
        id: `pause-dismiss-${pause.id}`,
        label: "Dismiss pause",
        kind: "dismiss",
        mutation: {
          type: "dismiss_safeguard_entry",
          kind: "abnormal_failure_pause",
          referenceId: pause.id,
          reason: "user_resolved",
          note: "User inspected the failure evidence.",
        },
      });
    }
    if (dismissal) {
      controls.push({
        id: `pause-restore-${pause.id}`,
        label: "Restore pause (retry)",
        kind: "restore",
        mutation: {
          type: "restore_safeguard_entry",
          dismissalId: dismissal.id,
        },
      });
    }
    pushRow({
      key: `pause-${pause.id}`,
      kind: "pauses",
      title: `Abnormal failure pause (${pause.failureRatePercent.toFixed(1)}%)`,
      subtitle: `${pause.failuresInWindow}/${pause.sampleSize} failures in window since ${pause.windowStartedAt}`,
      explanation: pause.explanation,
      recoveryGuidance: pause.recoveryGuidance,
      statusLabel: active
        ? dismissal
          ? "Dismissed"
          : "Paused"
        : "Below threshold",
      statusTone: active ? (dismissal ? "muted" : "critical") : "positive",
      active,
      blocked: active && !dismissal,
      dismissed: Boolean(dismissal),
      lineage: baseLineage([], []),
      tags: [
        `threshold:${pause.failureRateThresholdPercent}%`,
        `sample:${pause.minimumSample}`,
      ],
      controls,
      searchText: [
        pause.explanation,
        pause.recoveryGuidance,
        `${pause.failureRatePercent}`,
      ]
        .join(" ")
        .toLowerCase(),
    });
  }

  for (const review of safeguards.preparedBatchSampleReviews) {
    const dismissal = findDismissal(
      safeguards,
      "batch_sample_review_pending",
      review.id,
    );
    const active = !review.reviewCompleted;
    const controls: SafeguardControl[] = [];
    if (active && !dismissal) {
      const nextCount = Math.min(review.reviewedCount + 1, review.sampleCount);
      controls.push({
        id: `review-increment-${review.id}`,
        label:
          review.reviewedCount >= review.sampleCount
            ? "Review complete"
            : `Mark reviewed (${review.reviewedCount}/${review.sampleCount})`,
        kind: "review_increment",
        mutation: {
          type: "update_batch_sample_review",
          reviewId: review.id,
          reviewedCount: nextCount,
          reviewCompleted: nextCount === review.sampleCount,
        },
      });
      controls.push({
        id: `review-dismiss-${review.id}`,
        label: "Dismiss review",
        kind: "dismiss",
        mutation: {
          type: "dismiss_safeguard_entry",
          kind: "batch_sample_review_pending",
          referenceId: review.id,
          reason: "not_applicable",
          note: "User acknowledged the review.",
        },
      });
    }
    if (dismissal) {
      controls.push({
        id: `review-restore-${review.id}`,
        label: "Restore (retry)",
        kind: "restore",
        mutation: {
          type: "restore_safeguard_entry",
          dismissalId: dismissal.id,
        },
      });
    }
    pushRow({
      key: `review-${review.id}`,
      kind: "reviews",
      title: "Quality sample review",
      subtitle: `${review.reviewedCount}/${review.sampleCount} reviewed of ${review.preparedCount} prepared`,
      explanation: review.explanation,
      recoveryGuidance: review.recoveryGuidance,
      statusLabel: active ? (dismissal ? "Dismissed" : "Pending") : "Completed",
      statusTone: active ? (dismissal ? "muted" : "critical") : "positive",
      active,
      blocked: active && !dismissal,
      dismissed: Boolean(dismissal),
      lineage: baseLineage([], []),
      tags: [`batch:${review.batchId}`],
      controls,
      searchText: [
        review.batchId,
        review.explanation,
        review.recoveryGuidance,
        `${review.preparedCount}`,
      ]
        .join(" ")
        .toLowerCase(),
    });
  }

  for (const detection of safeguards.contradictoryAnswerDetections) {
    const dismissal = findDismissal(
      safeguards,
      "contradictory_answer",
      detection.id,
    );
    const active = detection.status === "detected";
    const controls: SafeguardControl[] = [];
    if (active && !dismissal) {
      controls.push({
        id: `contradiction-resolve-${detection.id}`,
        label: "Resolve",
        kind: "resolve",
        mutation: {
          type: "resolve_contradictory_answer_detection",
          detectionId: detection.id,
        },
      });
      controls.push({
        id: `contradiction-dismiss-${detection.id}`,
        label: "Dismiss",
        kind: "dismiss",
        mutation: {
          type: "dismiss_contradictory_answer_detection",
          detectionId: detection.id,
        },
      });
    }
    if (dismissal) {
      controls.push({
        id: `contradiction-restore-${detection.id}`,
        label: "Restore (retry)",
        kind: "restore",
        mutation: {
          type: "restore_safeguard_entry",
          dismissalId: dismissal.id,
        },
      });
    }
    pushRow({
      key: `contradiction-${detection.id}`,
      kind: "contradictions",
      title: "Contradictory reused answers",
      subtitle: `“${detection.answerA}” vs “${detection.answerB}” · score ${detection.contradictionScore.toFixed(2)}`,
      explanation: detection.explanation,
      recoveryGuidance: detection.recoveryGuidance,
      statusLabel: active
        ? dismissal
          ? "Dismissed"
          : "Advisory"
        : detection.status,
      statusTone: active ? (dismissal ? "muted" : "neutral") : "positive",
      active,
      blocked: false,
      dismissed: Boolean(dismissal),
      lineage: baseLineage([], []),
      tags: [detection.questionA, detection.questionB],
      controls,
      searchText: [
        detection.questionA,
        detection.questionB,
        detection.answerA,
        detection.answerB,
        detection.explanation,
        detection.recoveryGuidance,
      ]
        .join(" ")
        .toLowerCase(),
    });
  }

  for (const dismissal of safeguards.safeguardDismissals) {
    pushRow({
      key: `dismissal-${dismissal.id}`,
      kind: "dismissals",
      title: `Dismissed ${dismissal.kind.replaceAll("_", " ")}`,
      subtitle: `${dismissalReferenceLabel(workspace, safeguards, dismissal)} · ${dismissal.reason}`,
      explanation: dismissal.note ?? "Dismissed by the user.",
      recoveryGuidance: "Restore to re-arm the safeguard before continuing.",
      statusLabel: "Dismissed",
      statusTone: "muted",
      active: false,
      blocked: false,
      dismissed: true,
      lineage: baseLineage([], []),
      tags: [`dismissal:${dismissal.reason}`],
      controls: [
        {
          id: `dismissal-restore-${dismissal.id}`,
          label: "Restore",
          kind: "restore",
          mutation: {
            type: "restore_safeguard_entry",
            dismissalId: dismissal.id,
          },
        },
      ],
      searchText: [
        dismissal.kind,
        dismissal.referenceId,
        dismissal.reason,
        dismissal.note ?? "",
      ]
        .join(" ")
        .toLowerCase(),
    });
  }

  const dismissalCount = safeguards.safeguardDismissals.length;
  return {
    rows,
    counts: {
      caps: safeguards.companyApplicationCaps.length,
      conflicts: safeguards.simultaneousApplicationConflicts.length,
      signals: safeguards.listingSignals.length,
      pauses: safeguards.abnormalFailurePauses.length,
      reviews: safeguards.preparedBatchSampleReviews.length,
      contradictions: safeguards.contradictoryAnswerDetections.length,
      dismissals: dismissalCount,
      blockers: rows.filter((row) => row.blocked).length,
    },
  };
}

export function filterSafeguardRows(
  rows: readonly SafeguardRow[],
  tab: SafeguardTabId,
  query: string,
): readonly SafeguardRow[] {
  const normalized = query.trim().toLowerCase();
  return rows.filter((row) => {
    if (tab !== "all" && row.kind !== tab) return false;
    if (normalized.length === 0) return true;
    return row.searchText.includes(normalized);
  });
}
