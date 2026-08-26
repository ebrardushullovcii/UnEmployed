import type {
  DiscoveryActivityEvent,
  DiscoveryRunRecord,
} from "@unemployed/contracts";

export interface DiscoveryRunCountEvidence {
  /**
   * Distinct jobs this run added to the workspace, already deduplicated:
   * duplicates never inflate this count, so it displays as-is.
   */
  distinctJobsRetained: number;
  /**
   * Valid listings that merged into already-known jobs instead of being
   * added.
   */
  duplicatesMerged: number;
}

function readCount(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeCount(value: number): number {
  return Math.max(0, Math.trunc(value) || 0);
}

/**
 * Compact, truthful count phrasing for one discovery run's result volume.
 *
 * `distinctJobsRetained` is authoritative and shown directly; it must already
 * exclude duplicates, so this formatter never subtracts one count from
 * another. Duplicate context comes only from the run's own duplicate counter,
 * and the label never claims a raw "found" volume, because reviewed-listing
 * totals share no base with what the run kept.
 */
export function formatDiscoveryRunCountLabel(
  evidence: DiscoveryRunCountEvidence,
): string {
  const retained = normalizeCount(evidence.distinctJobsRetained);
  const duplicatesMerged = normalizeCount(evidence.duplicatesMerged);
  const retainedLabel = `${retained} new ${
    retained === 1 ? "job" : "jobs"
  } kept`;

  if (duplicatesMerged > 0) {
    const duplicateLabel =
      duplicatesMerged === 1
        ? "1 duplicate merged"
        : `${duplicatesMerged} duplicates merged`;
    return `${retainedLabel} · ${duplicateLabel}`;
  }

  return retainedLabel;
}

/**
 * Only live events whose listings have already been through the merge may
 * contribute counts: the per-target persistence event and terminal target/run
 * events. Earlier progress stages publish candidate totals (collected,
 * budgeted, or scored listings) whose review volume shares no base with the
 * run's duplicate counter yet, so deriving retained counts from them would
 * misstate what the run has kept.
 */
function carriesMergedResultCounts(event: DiscoveryActivityEvent): boolean {
  // Plain objects may omit the field entirely instead of carrying the schema
  // default, so both undefined and null mean "not terminal".
  return (
    event.stage === "persistence" || (event.terminalState ?? null) !== null
  );
}

/**
 * Resolves the strongest available count evidence for a run.
 *
 * The persisted summary is authoritative: its `validJobsFound` already counts
 * only distinct retained additions, so it is displayed directly and Task
 * Center and Search history agree on the settled result. While a run is still
 * streaming and its summary has not caught up yet, the newest merged-result
 * live event stands in (see {@link carriesMergedResultCounts}): that event's
 * `jobsFound` carries review volume (valid cards merged, duplicates included),
 * so its own `duplicatesMerged` is subtracted to yield the distinct additions
 * that event settled. The two bases are never mixed — no subtraction runs
 * against summary numbers and no maximum is taken across bases.
 */
export function getDiscoveryRunCountEvidence(
  run: DiscoveryRunRecord | null,
  liveEvent: DiscoveryActivityEvent | null,
): DiscoveryRunCountEvidence {
  const summaryRetained = readCount(run?.summary.validJobsFound);
  const summaryDuplicates = readCount(run?.summary.duplicatesMerged);

  if (summaryRetained > 0 || summaryDuplicates > 0) {
    return {
      distinctJobsRetained: summaryRetained,
      duplicatesMerged: summaryDuplicates,
    };
  }

  if (liveEvent && carriesMergedResultCounts(liveEvent)) {
    const reviewedListings = readCount(liveEvent.jobsFound);
    const duplicatesMerged = readCount(liveEvent.duplicatesMerged);
    return {
      distinctJobsRetained: Math.max(0, reviewedListings - duplicatesMerged),
      duplicatesMerged,
    };
  }

  return { distinctJobsRetained: 0, duplicatesMerged: 0 };
}
