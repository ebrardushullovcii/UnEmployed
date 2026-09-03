import type { SavedJob } from "@unemployed/contracts";
import { getMatchAssessmentPresentation } from "@renderer/features/job-finder/lib/match-assessment-presentation";

/**
 * Renderer-level floor for the default Results view. A job whose current
 * assessment scores below this is a clear mismatch for the saved targets
 * even when the scorer stopped short of a hard `skip`; it stays reachable
 * through "Show mismatches" and is never removed from the workspace.
 * Provisional assessments (offline catalog rows, unbound scores) are not
 * judged by this floor because their score is not a current authority.
 */
export const DISCOVERY_CLEAR_MISMATCH_SCORE_FLOOR = 35;

/**
 * Above the mismatch floor but still clearly behind the leading results.
 * Rows in this band are honest results, not filler to hide, but presenting
 * them in one flat list next to a 64% engineering match reads as though the
 * app considers a 36% role from another profession comparable. They keep
 * their place in the ranked list under an explicit divider instead.
 */
export const DISCOVERY_WEAKER_MATCH_SCORE_FLOOR = 50;

export type DiscoveryResultGroupId = "matches" | "weaker" | "mismatches";

export interface DiscoveryResultGroupHeading {
  count: number;
  description: string;
  id: DiscoveryResultGroupId;
  label: string;
}

export function isDiscoveryClearMismatch(job: SavedJob): boolean {
  // A row with no assessment at all is not a judgement against it.
  if (!job.matchAssessment) {
    return false;
  }
  if (job.matchAssessment.recommendation === "skip") {
    return true;
  }

  return (
    !getMatchAssessmentPresentation(job).isProvisional &&
    job.matchAssessment.score < DISCOVERY_CLEAR_MISMATCH_SCORE_FLOOR
  );
}

/**
 * Bands a single row. A provisional assessment is never demoted: its score
 * is not a current authority, so it keeps the main group and carries its own
 * "Provisional assessment" badge.
 */
export function getDiscoveryResultGroup(job: SavedJob): DiscoveryResultGroupId {
  if (isDiscoveryClearMismatch(job)) {
    return "mismatches";
  }

  if (!job.matchAssessment) {
    return "matches";
  }

  if (getMatchAssessmentPresentation(job).isProvisional) {
    return "matches";
  }

  return job.matchAssessment.score < DISCOVERY_WEAKER_MATCH_SCORE_FLOOR
    ? "weaker"
    : "matches";
}

/**
 * Everything outside the leading band. Weaker rows and clear mismatches are
 * one pool for counting and for the single reveal control: the headline
 * numbers must describe the jobs actually worth opening, and everything else
 * is honestly labelled "also found" instead of padding the total.
 */
export function isDiscoveryAlsoFoundResult(job: SavedJob): boolean {
  return getDiscoveryResultGroup(job) !== "matches";
}

/** How many results are in the leading band — the honest headline number. */
export function countDiscoveryStrongMatches(jobs: readonly SavedJob[]): number {
  let count = 0;
  for (const job of jobs) {
    if (!isDiscoveryAlsoFoundResult(job)) {
      count += 1;
    }
  }
  return count;
}

const groupCopy: Record<
  Exclude<DiscoveryResultGroupId, "matches">,
  { description: string; label: string }
> = {
  weaker: {
    description:
      "These scored well below your saved targets. Open one before trusting its score.",
    label: "Weaker matches",
  },
  mismatches: {
    description:
      "Hidden by default because they conflict with your saved roles, locations, or other requirements. Nothing was deleted.",
    label: "Clear mismatches",
  },
};

/**
 * Maps the job id that opens each non-leading band to the heading that must
 * be rendered above it. Headings are only meaningful while the list is in
 * its canonical best-match order, so an explicit `ranked` flag turns them
 * off for every other sort.
 */
export function buildDiscoveryResultGroupHeadings(
  jobs: readonly SavedJob[],
  ranked: boolean,
): ReadonlyMap<string, DiscoveryResultGroupHeading> {
  const headings = new Map<string, DiscoveryResultGroupHeading>();
  if (!ranked) {
    return headings;
  }

  const counts = new Map<DiscoveryResultGroupId, number>();
  for (const job of jobs) {
    const group = getDiscoveryResultGroup(job);
    counts.set(group, (counts.get(group) ?? 0) + 1);
  }

  const seen = new Set<DiscoveryResultGroupId>();
  for (const job of jobs) {
    const group = getDiscoveryResultGroup(job);
    if (seen.has(group)) {
      continue;
    }
    seen.add(group);
    if (group === "matches") {
      continue;
    }
    // A band that opens the list has nothing above it to be divided from,
    // so a heading there would only add noise.
    if (jobs[0] && getDiscoveryResultGroup(jobs[0]) === group) {
      continue;
    }
    headings.set(job.id, {
      count: counts.get(group) ?? 0,
      description: groupCopy[group].description,
      id: group,
      label: groupCopy[group].label,
    });
  }

  return headings;
}
