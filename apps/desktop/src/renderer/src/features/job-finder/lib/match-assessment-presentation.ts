import type { FitRecommendation } from "@unemployed/contracts";
import type { BadgeTone } from "./job-finder-types";

export const fitRecommendationCopy: Record<
  FitRecommendation,
  { label: string; tone: BadgeTone }
> = {
  strong_fit: { label: "Strong fit", tone: "positive" },
  apply_with_original: { label: "Original CV is credible", tone: "active" },
  review_before_applying: {
    label: "Review before applying",
    tone: "neutral",
  },
  skip: { label: "Skip — hard conflict", tone: "critical" },
};
