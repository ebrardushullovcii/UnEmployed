import {
  isRunnableJobDiscoveryTarget,
  type JobSearchPreferences,
} from '@unemployed/contracts'

export interface DiscoverySearchReadiness {
  enabledSourceCount: number
  hasSearchRoles: boolean
  ready: boolean
  reason: string | null
}

export function getDiscoverySearchReadiness(
  searchPreferences: JobSearchPreferences,
): DiscoverySearchReadiness {
  const hasSearchRoles =
    searchPreferences.targetRoles.length > 0 ||
    searchPreferences.jobFamilies.length > 0
  const enabledSourceCount = searchPreferences.discovery.targets.filter(
    isRunnableJobDiscoveryTarget,
  ).length

  return {
    enabledSourceCount,
    hasSearchRoles,
    ready: hasSearchRoles && enabledSourceCount > 0,
    reason: !hasSearchRoles
      ? 'Add at least one target role before searching.'
      : enabledSourceCount === 0
        ? 'Add or enable at least one valid public job-source URL before searching.'
        : null,
  }
}
