import {
  deriveListingDetailCapture,
  type ListingDetailCapture,
  type ListingDetailFetch,
} from "@unemployed/contracts";

const READ_IT =
  "Copy the original listing link below and open it in your browser to read it.";

/**
 * One sentence for a job whose listing body is still missing, saying what Job
 * Finder actually did about it.
 *
 * Both this sentence and the scoring panel's evidence row are read off ONE
 * capture state. Before that, the panel derived "the listing text was not
 * captured" from the absence of an excerpt while the row below it derived
 * "The full listing detail was available." from a stored depth label, and a
 * person reading the same screen was told both at once.
 *
 * Pass the job's `listingDetailCapture` whenever it is available; it is the
 * field of record. Without it the state is re-derived from the read attempt,
 * so rows stored before the field existed still read truthfully.
 */
export function describeMissingListingText(
  attempt: ListingDetailFetch | null | undefined,
  capture?: ListingDetailCapture | null,
): string {
  const state =
    capture?.state ??
    deriveListingDetailCapture({
      description: "",
      detailQuality: "card_only",
      listingDetailFetch: attempt ?? null,
    }).state;

  if (state === "captured") {
    // The body was read; what is missing here is a showable excerpt, not the
    // listing. Saying "not captured" over a job the app scored on its own
    // text is the contradiction this branch exists to prevent.
    return `Job Finder read this listing, but it has no description text to show here. ${READ_IT}`;
  }

  if (state === "not_attempted") {
    return `Job Finder has not read this listing page yet, so this job is matched on its title only. It will be read on the next search. ${READ_IT}`;
  }

  switch (attempt?.outcome) {
    case "blocked":
      return `Job Finder tried to read the listing page, but it wants a signed-in visitor, so this job is matched on its title only. ${READ_IT}`;
    case "no_detail":
      return `Job Finder read the listing page, but it published no job description, so this job is matched on its title only. ${READ_IT}`;
    case "fetch_failed":
      return `Job Finder tried to read the listing page and could not reach it, so this job is matched on its title only. It will try again on the next search. ${READ_IT}`;
    case "unsupported_url":
      return `This listing has no web page Job Finder can read, so it is matched on its title only. ${READ_IT}`;
    default:
      return `Job Finder tried to read the listing page and it gave nothing to read, so this job is matched on its title only. ${READ_IT}`;
  }
}
