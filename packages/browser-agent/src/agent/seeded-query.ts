import { SEARCH_SURFACE_ROUTE_RULES } from './search-surface-routes'

export const SEEDED_QUERY_PATH_HINTS = ['search', 'results', 'find', 'query'] as const
export const SEEDED_QUERY_PLACEHOLDER_VALUES = new Set([
  'JOB_TITLE',
  'LOCATION',
  'GEO_ID',
  'KEYWORDS',
  'QUERY',
])

export const SEEDED_QUERY_BASE_IGNORED_PARAMS = new Set(['page'])
export const SEEDED_QUERY_BASE_LOCATION_PARAMS = new Set(['location', 'loc', 'city', 'region'])

export function isSeededQueryPlaceholderValue(value: string): boolean {
  return SEEDED_QUERY_PLACEHOLDER_VALUES.has(value.trim().toUpperCase())
}

export function looksLikeSeededSearchSurfacePath(pathname: string): boolean {
  const normalizedPathname = pathname.toLowerCase()
  const pathSegments = normalizedPathname.split('/').flatMap((segment) => segment.split(/[^\p{L}\p{N}]+/u)).filter(Boolean)
  return normalizedPathname === '/' || pathSegments.some((segment) =>
    SEEDED_QUERY_PATH_HINTS.some((hint) => segment === hint),
  )
}

export function getSeededQueryRuleParams(hostname: string): {
  ignoredParams: Set<string>
  locationParams: Set<string>
} {
  const normalizedHostname = hostname.toLowerCase()
  const ignoredParams = new Set(SEEDED_QUERY_BASE_IGNORED_PARAMS)
  const locationParams = new Set(SEEDED_QUERY_BASE_LOCATION_PARAMS)

  const rule = SEARCH_SURFACE_ROUTE_RULES.find((candidateRule) =>
    candidateRule.hostSuffixes.some((hostSuffix) =>
      normalizedHostname === hostSuffix || normalizedHostname.endsWith(`.${hostSuffix}`),
    ),
  )

  if (rule) {
    for (const paramName of rule.embeddedJobIdParams) {
      ignoredParams.add(paramName)
    }
    for (const paramName of rule.trackingParams ?? []) {
      ignoredParams.add(paramName)
    }
    if (rule.locationParam) {
      locationParams.add(rule.locationParam)
    }
  }

  return { ignoredParams, locationParams }
}
