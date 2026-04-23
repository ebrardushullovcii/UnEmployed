export type SearchSurfaceRouteRule = {
  hostSuffixes: readonly string[];
  fallbackBaseUrl: string;
  resultExactPaths: readonly string[];
  resultPathPrefixes: readonly string[];
  detailPathPrefix: string;
  detailPathTemplate: string;
  embeddedJobIdParams: readonly string[];
};

export const SEARCH_SURFACE_ROUTE_RULES = [
  {
    hostSuffixes: ['linkedin.com'],
    fallbackBaseUrl: 'https://www.linkedin.com',
    resultExactPaths: ['/jobs', '/jobs/'],
    resultPathPrefixes: ['/jobs/search', '/jobs/search-results', '/jobs/collections'],
    detailPathPrefix: '/jobs/view/',
    detailPathTemplate: '/jobs/view/{sourceJobId}/',
    embeddedJobIdParams: ['currentJobId', 'selectedJobId', 'jobId'],
  },
] satisfies readonly SearchSurfaceRouteRule[];

export function getSearchSurfaceRouteRuleForHostname(
  hostname: string,
): SearchSurfaceRouteRule | null {
  const normalizedHostname = hostname.toLowerCase();
  return (
    SEARCH_SURFACE_ROUTE_RULES.find((rule) =>
      rule.hostSuffixes.some(
        (hostSuffix) =>
          normalizedHostname === hostSuffix ||
          normalizedHostname.endsWith(`.${hostSuffix}`),
      ),
    ) ?? null
  );
}

export function getSearchSurfaceRouteRuleForUrl(
  url: URL,
): SearchSurfaceRouteRule | null {
  return getSearchSurfaceRouteRuleForHostname(url.hostname);
}

export function isSearchSurfaceResultPath(
  rule: SearchSurfaceRouteRule,
  pathname: string,
): boolean {
  const normalizedPathname = pathname.toLowerCase();
  return (
    rule.resultExactPaths.includes(normalizedPathname) ||
    rule.resultPathPrefixes.some(
      (prefix) =>
        normalizedPathname === prefix ||
        normalizedPathname.startsWith(`${prefix}/`),
    )
  );
}

export function isSearchSurfaceDetailPath(
  rule: SearchSurfaceRouteRule,
  pathname: string,
): boolean {
  return pathname.toLowerCase().startsWith(rule.detailPathPrefix);
}

export function readEmbeddedSearchSurfaceJobId(
  url: URL,
  rule: SearchSurfaceRouteRule,
): string {
  return (
    rule.embeddedJobIdParams
      .map((paramName) => url.searchParams.get(paramName)?.trim() ?? '')
      .find((value) => value.length > 0) ?? ''
  );
}

export function buildSearchSurfaceDetailUrl(url: URL, sourceJobId: string): string {
  const rule = getSearchSurfaceRouteRuleForUrl(url);
  return rule
    ? `${url.origin}${rule.detailPathTemplate.replace('{sourceJobId}', sourceJobId)}`
    : '';
}
