import type { ListingDetailFetch } from "@unemployed/contracts";

/**
 * One sentence for a job whose listing body is still missing, saying what Job
 * Finder actually did about it. The card-only default said only that the text
 * "was not captured", which read as "nobody looked"; after a read attempt the
 * honest line is what the page answered.
 */
export function describeMissingListingText(
  attempt: ListingDetailFetch | null | undefined,
): string {
  const readIt =
    "Copy the original listing link below and open it in your browser to read it.";
  switch (attempt?.outcome) {
    case "blocked":
      return `Job Finder tried to read the listing page, but it wants a signed-in visitor, so this job is matched on its title only. ${readIt}`;
    case "no_detail":
      return `Job Finder read the listing page, but it published no job description, so this job is matched on its title only. ${readIt}`;
    case "fetch_failed":
      return `Job Finder tried to read the listing page and could not reach it, so this job is matched on its title only. It will try again on the next search. ${readIt}`;
    case "unsupported_url":
      return `This listing has no web page Job Finder can read, so it is matched on its title only. ${readIt}`;
    case "enriched":
    case "partial":
    case undefined:
    case null:
    default:
      return `The listing text was not captured, so this job was only matched on its title. ${readIt}`;
  }
}
