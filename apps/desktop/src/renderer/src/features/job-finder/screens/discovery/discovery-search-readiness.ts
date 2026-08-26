import {
  isRunnableJobDiscoveryTarget,
  type JobSearchPreferences,
} from "@unemployed/contracts";

export interface DiscoverySearchReadiness {
  enabledSourceCount: number;
  hasSearchRoles: boolean;
  ready: boolean;
  reason: string | null;
}

/**
 * Visible reason used by every Find-jobs search control while campaign
 * activity is paused. Non-color, one sentence, and distinct from the source
 * readiness reason so the two states are never confused.
 */
export const DISCOVERY_PAUSED_SEARCH_REASON =
  "Search is paused, so new searches stay unavailable.";

export function getDiscoverySearchReadiness(
  searchPreferences: JobSearchPreferences,
): DiscoverySearchReadiness {
  const hasSearchRoles =
    searchPreferences.targetRoles.length > 0 ||
    searchPreferences.jobFamilies.length > 0;
  const enabledSourceCount = searchPreferences.discovery.targets.filter(
    isRunnableJobDiscoveryTarget,
  ).length;

  return {
    enabledSourceCount,
    hasSearchRoles,
    ready: enabledSourceCount > 0,
    reason:
      enabledSourceCount === 0
        ? "Add or enable at least one valid public job-source URL before searching."
        : null,
  };
}
