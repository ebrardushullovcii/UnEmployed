import { APPLICATION_PREPARATION_BATCH_LIMIT } from "./review-queue-status";

const storageKeyPrefix =
  "unemployed.job-finder.review-queue.batch-selection.v1";

function getStorageKey(campaignId: string): string {
  return `${storageKeyPrefix}.${encodeURIComponent(campaignId)}`;
}

/**
 * Durable renderer curation for the shortlist "select for batch" checkboxes,
 * keyed per active campaign so selections never cross campaign boundaries.
 * Only the curated id list is stored here; running preparation work stays
 * owned by the page controller and is never persisted or resumed by the UI.
 */
export function readReviewQueueBatchSelection(
  campaignId: string,
): readonly string[] {
  try {
    const raw = window.localStorage.getItem(getStorageKey(campaignId));
    if (!raw) {
      return [];
    }

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    const seenJobIds = new Set<string>();
    const jobIds: string[] = [];
    for (const value of parsed) {
      if (
        typeof value !== "string" ||
        value.length === 0 ||
        seenJobIds.has(value)
      ) {
        continue;
      }

      seenJobIds.add(value);
      jobIds.push(value);
      if (jobIds.length >= APPLICATION_PREPARATION_BATCH_LIMIT) {
        break;
      }
    }

    return jobIds;
  } catch {
    // A broken or unavailable store falls back to an empty curation.
    return [];
  }
}

export function writeReviewQueueBatchSelection(
  campaignId: string,
  jobIds: readonly string[],
): void {
  try {
    window.localStorage.setItem(
      getStorageKey(campaignId),
      JSON.stringify(jobIds.slice(0, APPLICATION_PREPARATION_BATCH_LIMIT)),
    );
  } catch {
    // The queue still works when durable renderer preferences are unavailable.
  }
}
