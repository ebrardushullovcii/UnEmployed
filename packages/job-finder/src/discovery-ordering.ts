import type { SavedJob } from "@unemployed/contracts";

/**
 * Normalizes a listing timestamp to a sortable epoch value. Absent or
 * unparseable dates collapse to negative infinity so an undated row never
 * masquerades as older than every dated one.
 */
export function toSortableListingTime(
  value: string | null | undefined,
): number {
  if (!value) {
    return Number.NEGATIVE_INFINITY;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

/**
 * Recency basis that supplied a listing's sortable time. `postedAtText` is a
 * free-form provider label, so it only participates when it names an absolute
 * instant; relative labels never become timestamps.
 */
export type DiscoveryRecencyBasis =
  | "postedAt"
  | "postedAtText"
  | "providerUpdatedAt";

export interface DiscoveryListingRecencyKey {
  /** Stored field that supplied the sortable time; null when unknown. */
  basis: DiscoveryRecencyBasis | null;
  /** Epoch milliseconds when `basis` is set, otherwise negative infinity. */
  timestamp: number;
}

// A visible posted label participates in recency only when it carries an
// explicit four-digit year and parses as a real date. Relative labels
// ("2 days ago", "today") and year-less fragments ("Aug 20", which would have
// to borrow the current year) are rejected so sorting never fabricates dates.
const ABSOLUTE_POSTED_TEXT_YEAR_RE = /\b(?:19|20)\d{2}\b/;

function toAbsolutePostedTextTime(text: string): number {
  if (!ABSOLUTE_POSTED_TEXT_YEAR_RE.test(text)) {
    return Number.NEGATIVE_INFINITY;
  }
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

/**
 * Resolves the truthful recency key for a stored listing without ever letting
 * the visible posting label contradict the newest-sort key:
 *
 * 1. a parsed `postedAt` wins outright — it is the structured posting date;
 * 2. otherwise an absolute `postedAtText` is used (it is exactly what the
 *    "Posted" badge shows);
 * 3. otherwise, when a `postedAtText` exists but is relative, year-less, or
 *    unparseable, recency stays UNKNOWN (`basis: null`) — the label names no
 *    instant, so sorting must not silently borrow the hidden provider-update
 *    time the badge never displays;
 * 4. `providerUpdatedAt` is used only when no posting-date label exists at all,
 *    matching the badge's "Updated" fallback.
 */
export function getDiscoveryListingRecencyKey(input: {
  postedAt: string | null;
  postedAtText: string | null;
  providerUpdatedAt: string | null;
}): DiscoveryListingRecencyKey {
  const fromPostedAt = toSortableListingTime(input.postedAt);
  if (fromPostedAt !== Number.NEGATIVE_INFINITY) {
    return { basis: "postedAt", timestamp: fromPostedAt };
  }

  const postedText = input.postedAtText?.trim();
  if (postedText) {
    const fromText = toAbsolutePostedTextTime(postedText);
    if (fromText !== Number.NEGATIVE_INFINITY) {
      return { basis: "postedAtText", timestamp: fromText };
    }
    return { basis: null, timestamp: Number.NEGATIVE_INFINITY };
  }

  const fromProvider = toSortableListingTime(input.providerUpdatedAt);
  if (fromProvider !== Number.NEGATIVE_INFINITY) {
    return { basis: "providerUpdatedAt", timestamp: fromProvider };
  }

  return { basis: null, timestamp: Number.NEGATIVE_INFINITY };
}

/**
 * Clear mismatches (`recommendation: "skip"`) sink below reviewable jobs
 * under every discovery ordering so the mismatch-reveal flow never mixes
 * conflicts into the triage order.
 */
export function getClearMismatchPenalty(job: SavedJob): number {
  return job.matchAssessment.recommendation === "skip" ? 1 : 0;
}

/**
 * A fit score is authoritative only when it is bound to both the candidate
 * context and the posting it describes. Catalog-seeded rows are always
 * provisional: they are offline fixtures/catalog output and must not be
 * promoted as current source-backed matches, even when an older fixture has
 * fingerprints attached.
 *
 * The runtime guard for `discoveryMethod` keeps older renderer fixtures that
 * were cast to `SavedJob` without the field from changing their historical
 * ordering while real schema-validated rows remain covered.
 */
export function isProvisionalMatchAssessment(
  job: Pick<SavedJob, "discoveryMethod" | "matchAssessment">,
): boolean {
  if (job.discoveryMethod === "catalog_seed") {
    return true;
  }

  if (typeof job.discoveryMethod !== "string") {
    return false;
  }

  const contextFingerprint = job.matchAssessment.contextFingerprint;
  const postingFingerprint = job.matchAssessment.postingFingerprint;
  return !(
    typeof contextFingerprint === "string" &&
    contextFingerprint.trim().length > 0 &&
    typeof postingFingerprint === "string" &&
    postingFingerprint.trim().length > 0
  );
}

/**
 * The scorer's own sentences about the listing title versus the saved target
 * roles. They are the reasons and gaps the renderer reads back, so they live
 * here as constants rather than as strings the two sides could drift apart on.
 */
export const TITLE_MATCHES_TARGET_ROLES_REASON =
  "Role title aligns closely with the current target roles.";
export const TITLE_MISSES_TARGET_ROLES_GAPS: readonly string[] = [
  "Role family is outside the current target roles, so this is unlikely to be a useful match.",
  "The title does not show a clear connection to the current target role families.",
  "Role title is adjacent to the target list but not an exact fit.",
];

/**
 * Whether the assessment positively recorded that the listing title did not
 * match a saved target role. Absence of any title verdict (older rows, seeds,
 * fixtures) reports false: only an explicit miss counts.
 */
export function assessmentTitleMissesTargetRoles(
  assessment: Partial<Pick<SavedJob["matchAssessment"], "gaps">>,
): boolean {
  return (assessment.gaps ?? []).some((gap) =>
    TITLE_MISSES_TARGET_ROLES_GAPS.includes(gap),
  );
}

/**
 * Tie-breaks applied after the clear-mismatch penalty, assessment confidence,
 * and (for authoritative assessments) fit score:
 * detail-enriched listings first, then newest listing timestamp (postedAt,
 * then firstSeenAt, then discoveredAt; undated last), then title, company,
 * and id as the stable terminal key.
 */
export function compareDiscoveryFitTieBreaks(
  left: SavedJob,
  right: SavedJob,
): number {
  const detailDelta =
    Number(right.detailQuality === "detail_enriched") -
    Number(left.detailQuality === "detail_enriched");
  if (detailDelta !== 0) {
    return detailDelta;
  }

  const leftRecency = toSortableListingTime(
    left.postedAt ?? left.firstSeenAt ?? left.discoveredAt,
  );
  const rightRecency = toSortableListingTime(
    right.postedAt ?? right.firstSeenAt ?? right.discoveredAt,
  );
  if (leftRecency !== rightRecency) {
    return rightRecency - leftRecency;
  }

  return (
    left.title.localeCompare(right.title) ||
    left.company.localeCompare(right.company) ||
    left.id.localeCompare(right.id)
  );
}

/**
 * Canonical default "Best match" ordering for discovery results, shared by
 * the rediscovery rank audit and the Find jobs screen. The chain is total and
 * ends in the job id, so the sequence is a pure function of the candidate set:
 *
 * 1. clear mismatches (`recommendation: "skip"`) sink below reviewable jobs;
 * 2. authoritative assessments outrank provisional/unbound assessments;
 * 3. higher authoritative fit score wins — provisional scores never promote a
 *    row as the Best match;
 * 4. detail-enriched listings outrank card-only listings;
 * 5. newer listings (postedAt, then firstSeenAt, then discoveredAt; undated
 *    last) outrank older ones;
 * 6. title, then company, then id keep ties stable.
 */
export function compareDiscoveryJobs(left: SavedJob, right: SavedJob): number {
  const mismatchDelta =
    getClearMismatchPenalty(left) - getClearMismatchPenalty(right);
  if (mismatchDelta !== 0) {
    return mismatchDelta;
  }

  const leftProvisional = isProvisionalMatchAssessment(left);
  const rightProvisional = isProvisionalMatchAssessment(right);
  const confidenceDelta = Number(leftProvisional) - Number(rightProvisional);
  if (confidenceDelta !== 0) {
    return confidenceDelta;
  }

  if (!leftProvisional) {
    const scoreDelta = right.matchAssessment.score - left.matchAssessment.score;
    if (scoreDelta !== 0) {
      return scoreDelta;
    }
  }

  return compareDiscoveryFitTieBreaks(left, right);
}
