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
 * Compact, truthful count phrasing for one discovery run's result volume,
 * meaning everything the run saved to this device.
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
  // "Saved", never "kept". This is the device-level population — everything
  // the run added to the workspace — while "kept" belongs to the smaller
  // population the active search plan holds. Home printed both numbers with
  // the same verb, so "50 new jobs kept" and "the 15 kept in your current
  // search plan" read as a contradiction rather than two different facts.
  const retainedLabel = `${retained} new ${
    retained === 1 ? "job" : "jobs"
  } saved`;

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
  // Partial fixtures and legacy rows can reach here without a summary.
  const summaryRetained = readCount(run?.summary?.validJobsFound);
  const summaryDuplicates = readCount(run?.summary?.duplicatesMerged);

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

export interface DiscoveryResultBandCounts {
  /** Results the app is willing to recommend opening. */
  worthOpening: number;
  /**
   * Listings matched by title alone and never checked further. They are
   * neither recommended nor demoted, so they are counted separately instead
   * of being folded into either of the other two numbers.
   */
  titleMatches?: number;
  /** Weaker matches plus clear mismatches, kept but not recommended. */
  alsoFound: number;
}

/**
 * The banded phrasing for one search's kept results.
 *
 * This is the SAME population the run-count sentence describes, split by how
 * strongly the app recommends each row:
 *
 *     kept === worthOpening + titleMatches + alsoFound
 *
 * Every surface that talks about a finished search uses one of these two
 * formatters, so "15 jobs kept in this search plan" and "0 worth opening · 13
 * title matches · 2 also found" can never disagree about the total. Nothing
 * anywhere may report a raw reviewed volume (the 50 listings a run looked at)
 * as if it were a result count.
 *
 * The middle number is printed whenever it is non-zero, and once it is
 * printed the other two are printed beside it even at zero: "0 worth opening"
 * is the honest headline for a search that checked nothing past the titles,
 * and dropping it would leave the middle number reading as a recommendation.
 */
export function formatDiscoveryResultBandLabel(
  counts: DiscoveryResultBandCounts,
): string {
  const worthOpening = normalizeCount(counts.worthOpening);
  const titleMatches = normalizeCount(counts.titleMatches ?? 0);
  const alsoFound = normalizeCount(counts.alsoFound);

  if (titleMatches > 0) {
    return `${worthOpening} worth opening · ${titleMatches} title ${
      titleMatches === 1 ? "match" : "matches"
    } · ${alsoFound} also found`;
  }

  if (alsoFound > 0) {
    return `${worthOpening} worth opening · ${alsoFound} also found`;
  }

  return `${worthOpening} ${worthOpening === 1 ? "job" : "jobs"}`;
}

/**
 * The reconciling sentence that lets a user connect the banded headline with
 * the "kept" count Home prints.
 *
 * "Kept" means one thing everywhere: the rows this list shows — the current
 * plan's job ids intersected with the workspace's live discovery jobs, so a
 * dismissed, applied, or otherwise retired row leaves the count. Every caller
 * that prints this word must derive it from that same intersection and not
 * from the plan's own `jobIds` ledger, which is never pruned. A search can
 * save more listings to the device than the active plan's rules retain, so
 * this sentence deliberately does not attribute the total to the last run.
 */
export function formatDiscoveryResultBandTotal(
  counts: DiscoveryResultBandCounts,
): string {
  const kept =
    normalizeCount(counts.worthOpening) +
    normalizeCount(counts.titleMatches ?? 0) +
    normalizeCount(counts.alsoFound);
  return `${kept} ${kept === 1 ? "job" : "jobs"} kept in this search plan.`;
}

/**
 * Home's one sentence about the last finished search.
 *
 * Two real numbers exist and they are not the same population: a run can save
 * 50 listings to the device while the active plan's rules keep 15, which is
 * what Find jobs lists. Printing only the larger number made Home over-claim
 * and visibly disagree with Find jobs; printing only the smaller one would
 * lose the run's own accounting. When they differ, both are stated with the
 * meaning that separates them, so the two screens can be reconciled instead
 * of read as a contradiction.
 */
export function formatLastSearchSummarySentence(input: {
  runCountLabel: string;
  savedByRun: number;
  keptInPlan: number;
}): string {
  const savedByRun = normalizeCount(input.savedByRun);
  const keptInPlan = normalizeCount(input.keptInPlan);

  if (savedByRun === 0 || keptInPlan === savedByRun) {
    // `runCountLabel` already reads "N new jobs saved · M duplicates merged",
    // so the sentence must not repeat the verb around it.
    return `Your last search: ${input.runCountLabel}.`;
  }

  return `Your last search: ${formatSavedAndKeptCounts(savedByRun, keptInPlan)}.`;
}

/**
 * Home's status line for a search that has just finished.
 *
 * It describes the same two populations as {@link
 * formatLastSearchSummarySentence} and can appear in the same card, so it uses
 * the same clause rather than a second phrasing of the same facts. Printing
 * only the run's own total here ("Search finished · 50 new jobs saved") beside
 * Find jobs' "15 jobs kept in this search plan" read as two screens
 * contradicting each other about one search.
 *
 * When both numbers are the same population there is nothing to reconcile, so
 * the run's own label — which may also carry its duplicate count — stands.
 */
export function formatSearchFinishedStatusLine(input: {
  runCountLabel: string;
  savedByRun: number;
  keptInPlan: number;
}): string {
  const savedByRun = normalizeCount(input.savedByRun);
  const keptInPlan = normalizeCount(input.keptInPlan);

  if (savedByRun === 0 || keptInPlan === savedByRun) {
    return `Search finished · ${input.runCountLabel}, all on this device.`;
  }

  return `Search finished · ${formatSavedAndKeptCounts(savedByRun, keptInPlan)}.`;
}

/**
 * The one clause that states both populations with the noun that separates
 * them: "saved" is the device, "kept" is the active search plan. Both numbers
 * were once introduced as "kept", which read as one number contradicting
 * itself; later the second lost its verb entirely, which left "· 15 in your
 * current search plan" beside Find jobs' "15 jobs kept in this search plan"
 * as two different vocabularies for one fact.
 */
function formatSavedAndKeptCounts(
  savedByRun: number,
  keptInPlan: number,
): string {
  return `${savedByRun} new ${
    savedByRun === 1 ? "job" : "jobs"
  } saved on this device · ${keptInPlan} kept in your current search plan`;
}
