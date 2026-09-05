import type { SavedJob } from "@unemployed/contracts";
import { getMatchAssessmentPresentation } from "@renderer/features/job-finder/lib/match-assessment-presentation";
import { assessmentTitleMissesTargetRoles } from "@unemployed/job-finder/discovery-ordering";

/**
 * Renderer-level floor for the default Results view. A job whose current
 * assessment scores below this is a clear mismatch for the saved targets
 * even when the scorer stopped short of a hard `skip`; it stays reachable
 * through "Show mismatches" and is never removed from the workspace.
 * Withheld scores are not judged by this floor: an offline catalog row, an
 * unbound score, and a title-only listing all fail to earn a percentage, and
 * hiding a row for a number the app has just refused to print would hide it
 * for a reason the app says it cannot assess.
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

export type DiscoveryResultGroupId =
  | "matches"
  | "unchecked"
  | "weaker"
  | "mismatches";

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
    !getMatchAssessmentPresentation(job).isScoreWithheld &&
    job.matchAssessment.score < DISCOVERY_CLEAR_MISMATCH_SCORE_FLOOR
  );
}

/**
 * Bands a single row into one of three honest populations.
 *
 * A row whose score is withheld is neither recommended nor demoted by that
 * score. Promoting it to the leading band claims the app checked something it
 * never opened; demoting it to "also found" hides it for a number the app has
 * just refused to print. It therefore gets its own band, which says exactly
 * what is true: the title matched and nothing else was checked yet.
 *
 * A hard `skip` still bands as a mismatch even with a withheld score, because
 * that verdict rests on an observed conflict rather than on the number.
 */
export function getDiscoveryResultGroup(job: SavedJob): DiscoveryResultGroupId {
  if (isDiscoveryClearMismatch(job)) {
    return "mismatches";
  }

  if (!job.matchAssessment) {
    return "unchecked";
  }

  if (getMatchAssessmentPresentation(job).isScoreWithheld) {
    // "Title matches · not yet checked" has to mean the title matched. A
    // card-only listing whose title never matched a target role ("Full-Stack
    // Designer" for a software-engineer search) has been checked as far as it
    // can be, and what was checked did not fit: it belongs with the weaker
    // matches, still one click away, not in the leading unchecked band.
    return assessmentTitleMissesTargetRoles(job.matchAssessment)
      ? "weaker"
      : "unchecked";
  }

  return job.matchAssessment.score < DISCOVERY_WEAKER_MATCH_SCORE_FLOOR
    ? "weaker"
    : "matches";
}

/**
 * The rows the app is willing to recommend opening: checked evidence *and* a
 * score it is prepared to print. Nothing else earns this band.
 */
export function isDiscoveryWorthOpeningResult(job: SavedJob): boolean {
  return getDiscoveryResultGroup(job) === "matches";
}

/**
 * Listings whose only checkable evidence was the title, plus rows carrying no
 * current assessment at all. They are kept visible — they were never judged
 * against — but they are never counted as recommended results.
 */
export function isDiscoveryUncheckedResult(job: SavedJob): boolean {
  return getDiscoveryResultGroup(job) === "unchecked";
}

/**
 * Everything the app actively scored below the saved targets. Weaker rows and
 * clear mismatches are one pool for counting and for the single reveal
 * control; the unchecked band is deliberately not in it, because hiding a row
 * behind "also found" is a judgement and no judgement was made.
 */
export function isDiscoveryAlsoFoundResult(job: SavedJob): boolean {
  const group = getDiscoveryResultGroup(job);
  return group === "weaker" || group === "mismatches";
}

/** How many results are in the leading band — the honest headline number. */
export function countDiscoveryStrongMatches(jobs: readonly SavedJob[]): number {
  let count = 0;
  for (const job of jobs) {
    if (isDiscoveryWorthOpeningResult(job)) {
      count += 1;
    }
  }
  return count;
}

/**
 * How many results the Results view lists by default — the recommended band
 * plus the unchecked band. Only the also-found pool sits behind the reveal,
 * so this is exactly the row count a user sees on Find jobs, which is what
 * the sidebar badge must agree with. It is deliberately not the recommended
 * count: a search that checked nothing past the titles still found jobs, and
 * a badge reading nothing beside a list of 13 rows is its own untruth.
 */
export function countDiscoveryDefaultVisibleResults(
  jobs: readonly SavedJob[],
): number {
  let count = 0;
  for (const job of jobs) {
    if (!isDiscoveryAlsoFoundResult(job)) {
      count += 1;
    }
  }
  return count;
}

/** How many results were found by title alone and never checked further. */
export function countDiscoveryUncheckedResults(
  jobs: readonly SavedJob[],
): number {
  let count = 0;
  for (const job of jobs) {
    if (isDiscoveryUncheckedResult(job)) {
      count += 1;
    }
  }
  return count;
}

const groupCopy: Record<
  DiscoveryResultGroupId,
  { description: string; label: string }
> = {
  matches: {
    description:
      "Back in the main results: these were checked against your saved targets and scored above them.",
    label: "Matches",
  },
  unchecked: {
    // Deliberately not "open one to check its details": when a run reads only
    // the listing cards, the inspector holds nothing the row does not already
    // show, so that would send the user somewhere that cannot answer them.
    // Kept to a short caption so it labels the band instead of restating the
    // run-level warning that names the source on the same screen.
    description:
      "Matched on the title alone; the full requirements have not been assessed.",
    label: "Title matches · not yet checked",
  },
  // Both of the bands below are the two halves of the one pool the summary
  // line and the reveal control call "also found". They stay separate bands —
  // "scored below your targets" and "conflicts with your requirements" are
  // different verdicts and earn different explainers — but a divider reading
  // only "Clear mismatches" left the user with no way to connect what they
  // revealed with "Show also found (2)" to what the list then labelled. The
  // pool is named first, the part second, so one vocabulary runs from the
  // count through the control to the divider.
  weaker: {
    description:
      "These scored well below your saved targets. Open one before trusting its score.",
    label: "Also found · Weaker matches",
  },
  mismatches: {
    description:
      "Hidden by default because they conflict with your saved roles, locations, or other requirements. Nothing was deleted.",
    label: "Also found · Clear mismatches",
  },
};

export interface DiscoveryResultGroupHeadingOptions {
  /**
   * These rows continue a longer list that started on an earlier page, so the
   * band they open is a continuation rather than the natural start of the
   * results. Its heading must still be drawn: without it, a page that opens
   * mid-band is indistinguishable from a page of leading matches.
   */
  continuesEarlierPage?: boolean;
  /**
   * The half-open slice of `jobs` that is actually rendered. Pass the whole
   * ranked list with this window rather than the page slice alone: a divider
   * has to count the whole run it names, because the reveal control beside it
   * counts the whole pool. A 60-row band paginated 40/20 printed "(40)" then
   * "(20)" under a button reading "Hide also found (60)", with nothing on
   * screen to reconcile them. Defaults to the whole list.
   */
  window?: { end: number; start: number };
}

/**
 * Maps the job id that opens each band to the heading that must be rendered
 * above it. Headings are only meaningful while the list is in its canonical
 * best-match order, so an explicit `ranked` flag turns them off for every
 * other sort.
 *
 * Headings describe *runs*, not bands. The canonical order sorts every bound
 * row by score, while a row whose score is withheld keeps the main band at
 * whatever score position it lands on, so a band can be interrupted and then
 * resume. Heading one run each — and counting that run — keeps every divider
 * true to the rows directly beneath it; a first-occurrence heading would
 * instead claim rows that sit under a later divider, or leave a resumed run
 * filed under the previous band's label.
 *
 * Counts are run-scoped, never page-scoped: the divider states how many rows
 * the run holds, which is the number the also-found reveal control counts too.
 * Pass the whole ranked list plus a `window` when the list is paginated.
 */
export function buildDiscoveryResultGroupHeadings(
  jobs: readonly SavedJob[],
  ranked: boolean,
  options: DiscoveryResultGroupHeadingOptions = {},
): ReadonlyMap<string, DiscoveryResultGroupHeading> {
  const headings = new Map<string, DiscoveryResultGroupHeading>();
  forEachHeadedDiscoveryResultRun(jobs, ranked, options, (run) => {
    headings.set(jobs[run.headingIndex]!.id, {
      count: run.end - run.start,
      description: groupCopy[run.group].description,
      id: run.group,
      label: groupCopy[run.group].label,
    });
  });
  return headings;
}

/**
 * Which band heading is actually rendered *above* each row.
 *
 * This is not the same question as {@link getDiscoveryResultGroup}: a row can
 * belong to a band whose divider was never drawn (any sort other than the
 * canonical one, or the leading run of plain matches on page one). A row may
 * only stay quiet about something a divider states, so the panel has to ask
 * about the rendered divider rather than the row's own band. Rows in an
 * unheaded run are absent from the map.
 */
export function buildDiscoveryHeadedGroupByJobId(
  jobs: readonly SavedJob[],
  ranked: boolean,
  options: DiscoveryResultGroupHeadingOptions = {},
): ReadonlyMap<string, DiscoveryResultGroupId> {
  const headed = new Map<string, DiscoveryResultGroupId>();
  forEachHeadedDiscoveryResultRun(jobs, ranked, options, (run) => {
    for (let index = run.headingIndex; index < run.visibleEnd; index += 1) {
      headed.set(jobs[index]!.id, run.group);
    }
  });
  return headed;
}

interface DiscoveryResultRun {
  /** Exclusive end of the whole run, which is what the divider counts. */
  end: number;
  group: DiscoveryResultGroupId;
  /** The row the divider is drawn above: the run's first *visible* row. */
  headingIndex: number;
  /** Inclusive start of the whole run, including rows on an earlier page. */
  start: number;
  /** Exclusive end of the visible part of the run. */
  visibleEnd: number;
}

/**
 * Walks the ranked rows once and yields every run that earns a divider.
 *
 * Headings describe *runs*, not bands. The canonical order sorts every bound
 * row by score, while a row whose score is withheld keeps the main band at
 * whatever score position it lands on, so a band can be interrupted and then
 * resume. Heading one run each — and counting that run — keeps every divider
 * true to the rows directly beneath it; a first-occurrence heading would
 * instead claim rows that sit under a later divider, or leave a resumed run
 * filed under the previous band's label.
 */
function forEachHeadedDiscoveryResultRun(
  jobs: readonly SavedJob[],
  ranked: boolean,
  options: DiscoveryResultGroupHeadingOptions,
  visit: (run: DiscoveryResultRun) => void,
): void {
  if (!ranked) {
    return;
  }

  const windowStart = Math.max(0, options.window?.start ?? 0);
  const windowEnd = Math.min(jobs.length, options.window?.end ?? jobs.length);
  const groups = jobs.map((job) => getDiscoveryResultGroup(job));
  let start = 0;
  while (start < jobs.length) {
    const group = groups[start]!;
    let end = start + 1;
    while (end < jobs.length && groups[end] === group) {
      end += 1;
    }

    // Only ONE run goes unlabelled: a leading run of plain matches on the
    // first page. That band is the list's baseline — "these were checked and
    // they scored well" is what an unlabelled result list already means — and
    // it has nothing above it to be divided from.
    //
    // Every other opening run is headed. A list that opens with the unchecked
    // band is the case this matters most for: with the heading suppressed,
    // a search that read nothing past the titles rendered as a bare list of
    // 14 rows with no statement anywhere that they were never read, which is
    // precisely the claim the band exists to make. The same holds for a list
    // that opens with weaker or mismatched rows, and for any run that opens a
    // continuation page, where what the band is divided from is off-screen.
    const visibleStart = Math.max(start, windowStart);
    const visibleEnd = Math.min(end, windowEnd);
    // A run entirely on another page draws nothing here.
    if (visibleStart < visibleEnd) {
      // A run that began before this page IS a continuation, so it is headed
      // even when it is the main band.
      const continuesEarlierPage =
        start < windowStart || Boolean(options.continuesEarlierPage);
      const skip = start === 0 && group === "matches" && !continuesEarlierPage;
      if (!skip) {
        visit({
          end,
          group,
          headingIndex: visibleStart,
          start,
          visibleEnd,
        });
      }
    }

    start = end;
  }
}
