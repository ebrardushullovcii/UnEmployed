import type { ListingActivity } from "@unemployed/contracts";
import { formatOptionalDateOnly } from "./job-finder-utils";

export const listingActivityStatuses = [
  "active",
  "inactive",
  "stale",
  "closed",
  "unknown",
] as const satisfies readonly ListingActivity["status"][];

export type ListingActivityPresentation = {
  description: string;
  label: string;
  observedDate: string | null;
  tone: "positive" | "critical" | "neutral" | "muted";
};

function formatProvenance(value: string): string {
  return value === "discovery_ledger"
    ? "the discovery ledger"
    : `${value} evidence`;
}

export function presentListingActivity(
  activity: ListingActivity,
): ListingActivityPresentation {
  if (activity.status === "unknown") {
    return {
      description: "Listing availability is unknown.",
      label: "Unknown",
      observedDate: null,
      tone: "neutral",
    };
  }

  const observedDate = formatOptionalDateOnly(activity.observedAt);
  if (activity.status === "active") {
    return {
      description: `Last seen on source ${observedDate}.`,
      label: "Active",
      observedDate,
      tone: "positive",
    };
  }
  if (activity.status === "inactive") {
    return {
      description: `Not found in latest full source refresh on ${observedDate}. This does not prove the listing is closed. ${activity.explanation}`,
      label: "Inactive",
      observedDate,
      tone: "critical",
    };
  }
  if (activity.status === "stale") {
    const detail = activity.detail ? ` ${activity.detail}` : "";
    return {
      description: `This listing may be stale based on ${formatProvenance(activity.provenance)} observed on ${observedDate}. ${activity.explanation}${detail}`,
      label: "Stale",
      observedDate,
      tone: "neutral",
    };
  }

  const detail = activity.detail ? ` ${activity.detail}` : "";
  return {
    description: `Reported closed from ${formatProvenance(activity.provenance)} observed on ${observedDate}. ${activity.explanation}${detail}`,
    label: "Closed",
    observedDate,
    tone: "muted",
  };
}
