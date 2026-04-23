import type { AgentConfig } from '../types'

export const DEFAULT_SEARCH_RESULTS_EXTRACTION_REVIEW_BUDGET = 4
const SEEDED_QUERY_SEARCH_RESULTS_EXTRACTION_REVIEW_BUDGET = 16
const WEAK_SAME_HOST_SEARCH_RESULTS_EXTRACTION_REVIEW_BUDGET = 16
const SEARCH_SURFACE_PATH_HINTS = ['search', 'results', 'find', 'query']
const SEEDED_QUERY_IGNORED_PARAMS = new Set(['page', 'currentJobId', 'selectedJobId', 'trk', 'trackingId'])

function getNormalizedStartingHosts(values: readonly string[]): string[] {
  const hosts = new Set<string>()

  for (const value of values) {
    try {
      hosts.add(new URL(value).hostname.toLowerCase())
    } catch {
      continue
    }
  }

  return [...hosts]
}

function isSeededQuerySearchUrl(value: string): boolean {
  try {
    const url = new URL(value)
    const pathname = url.pathname.toLowerCase()

    const looksLikeSearchSurface =
      pathname === '/' ||
      SEARCH_SURFACE_PATH_HINTS.some((hint) => pathname.includes(hint))

    if (!looksLikeSearchSurface) {
      return false
    }

    return [...url.searchParams.entries()].some(([key, value]) => {
      if (SEEDED_QUERY_IGNORED_PARAMS.has(key)) {
        return false
      }

      const normalizedValue = value.trim()
      if (!normalizedValue) {
        return false
      }

      const upperValue = normalizedValue.toUpperCase()
      return upperValue !== 'JOB_TITLE' &&
        upperValue !== 'LOCATION' &&
        upperValue !== 'GEO_ID' &&
        upperValue !== 'KEYWORDS' &&
        upperValue !== 'QUERY'
    })
  } catch {
    return false
  }
}

export function getSearchResultsExtractionReviewBudget(
  config: Pick<AgentConfig, 'startingUrls' | 'promptContext' | 'targetJobCount'>,
): number | null {
  if (config.promptContext.taskPacket || config.targetJobCount < DEFAULT_SEARCH_RESULTS_EXTRACTION_REVIEW_BUDGET) {
    return null
  }

  if (config.startingUrls.some((value) => isSeededQuerySearchUrl(value))) {
    return Math.max(
      SEEDED_QUERY_SEARCH_RESULTS_EXTRACTION_REVIEW_BUDGET,
      Math.min(config.targetJobCount, 12),
    )
  }

  const startingHosts = getNormalizedStartingHosts(config.startingUrls)
  const isWeakSameHostBoard =
    config.targetJobCount >= DEFAULT_SEARCH_RESULTS_EXTRACTION_REVIEW_BUDGET &&
    startingHosts.length === 1

  return isWeakSameHostBoard
    ? Math.max(
        WEAK_SAME_HOST_SEARCH_RESULTS_EXTRACTION_REVIEW_BUDGET,
        Math.min(config.targetJobCount, 14),
      )
    : null
}
