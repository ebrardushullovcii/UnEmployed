import type {
  DiscoveryJobView,
  DiscoveryLedgerEntry,
  ListingActivity,
  ListingSignalRecord,
  SavedJob,
} from "@unemployed/contracts";

import { createJobIdentityIndex } from "./job-identity";

type ActivityCandidate = Exclude<ListingActivity, { status: "unknown" }>;

const activityTiePriority: Record<ActivityCandidate["status"], number> = {
  active: 0,
  inactive: 1,
  stale: 2,
  closed: 3,
};

function newerActivity(
  current: ActivityCandidate | undefined,
  candidate: ActivityCandidate,
): ActivityCandidate {
  if (!current) return candidate;

  const timestampOrder =
    Date.parse(candidate.observedAt) - Date.parse(current.observedAt);
  if (timestampOrder !== 0) {
    return timestampOrder > 0 ? candidate : current;
  }

  return activityTiePriority[candidate.status] >
    activityTiePriority[current.status]
    ? candidate
    : current;
}

function activeCandidate(job: SavedJob): ActivityCandidate | undefined {
  if (
    job.lastVerifiedActiveAt &&
    (!job.lastSeenAt ||
      Date.parse(job.lastVerifiedActiveAt) >= Date.parse(job.lastSeenAt))
  ) {
    return {
      status: "active",
      observedAt: job.lastVerifiedActiveAt,
      evidence: "last_verified_active_at",
    };
  }
  return job.lastSeenAt
    ? {
        status: "active",
        observedAt: job.lastSeenAt,
        evidence: "last_seen_at",
      }
    : undefined;
}

/**
 * Projects non-persisted listing activity in linear indexed passes. Ledger
 * aliases must resolve to exactly one job; possible, ambiguous, and conflicting
 * identities cannot change another listing's activity.
 */
export function projectDiscoveryJobViews(input: {
  jobs: readonly SavedJob[];
  discoveryLedger: readonly DiscoveryLedgerEntry[];
  listingSignals: readonly ListingSignalRecord[];
}): DiscoveryJobView[] {
  const jobIdentityIndex = createJobIdentityIndex(input.jobs, (job) => job);
  const candidateByJob = new Map<SavedJob, ActivityCandidate>();
  const uniqueJobById = new Map<string, SavedJob | null>();

  for (const job of input.jobs) {
    const active = activeCandidate(job);
    if (active) candidateByJob.set(job, active);
    uniqueJobById.set(job.id, uniqueJobById.has(job.id) ? null : job);
  }

  for (const entry of input.discoveryLedger) {
    if (entry.latestStatus !== "inactive" || entry.inactiveAt === null)
      continue;
    const resolution = jobIdentityIndex.resolve(entry);
    if (resolution.status !== "matched") continue;

    candidateByJob.set(
      resolution.value,
      newerActivity(candidateByJob.get(resolution.value), {
        status: "inactive",
        observedAt: entry.inactiveAt,
        ledgerEntryId: entry.id,
        provenance: "discovery_ledger",
        explanation:
          "A source inventory observation marked this exact listing inactive.",
      }),
    );
  }

  for (const signal of input.listingSignals) {
    if (signal.signal === "suspicious") continue;
    const job = uniqueJobById.get(signal.jobId);
    if (!job) continue;

    candidateByJob.set(
      job,
      newerActivity(candidateByJob.get(job), {
        status: signal.signal,
        observedAt: signal.detectedAt,
        signalId: signal.id,
        provenance: signal.provenance,
        explanation: signal.explanation,
        detail: signal.detail,
        confidence: signal.confidence,
      }),
    );
  }

  return input.jobs.map((job) => ({
    ...job,
    listingActivity: candidateByJob.get(job) ?? { status: "unknown" },
  }));
}
