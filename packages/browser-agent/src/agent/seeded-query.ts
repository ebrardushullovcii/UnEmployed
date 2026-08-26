export const SEEDED_QUERY_PATH_HINTS = [
  "search",
  "results",
  "find",
  "query",
] as const;
export const SEEDED_QUERY_PLACEHOLDER_VALUES = new Set([
  "JOB_TITLE",
  "LOCATION",
  "GEO_ID",
  "KEYWORDS",
  "QUERY",
]);

export const SEEDED_QUERY_BASE_IGNORED_PARAMS = new Set(["page"]);
export const SEEDED_QUERY_BASE_LOCATION_PARAMS = new Set([
  "location",
  "loc",
  "city",
  "region",
]);

function normalizeParamKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isJobIdShapedParamKey(key: string): boolean {
  const normalized = normalizeParamKey(key);
  return normalized.includes("jobid") || normalized.endsWith("jid");
}

function isGeoShapedParamKey(key: string): boolean {
  return normalizeParamKey(key).includes("geo");
}

class ShapeMatchedParamNameSet extends Set<string> {
  private readonly matchesShape: (key: string) => boolean;

  constructor(
    values: readonly string[],
    matchesShape: (key: string) => boolean,
  ) {
    super(values);
    this.matchesShape = matchesShape;
  }

  override has(key: string): boolean {
    return super.has(key) || this.matchesShape(key);
  }
}

export function isSeededQueryPlaceholderValue(value: string): boolean {
  return SEEDED_QUERY_PLACEHOLDER_VALUES.has(value.trim().toUpperCase());
}

export function looksLikeSeededSearchSurfacePath(pathname: string): boolean {
  const normalizedPathname = pathname.toLowerCase();
  const pathSegments = normalizedPathname
    .split("/")
    .flatMap((segment) => segment.split(/[^\p{L}\p{N}]+/u))
    .filter(Boolean);
  return (
    normalizedPathname === "/" ||
    pathSegments.some((segment) =>
      SEEDED_QUERY_PATH_HINTS.some((hint) => segment === hint),
    )
  );
}

export function getSeededQueryRuleParams(_hostname: string): {
  ignoredParams: Set<string>;
  locationParams: Set<string>;
} {
  return {
    ignoredParams: new ShapeMatchedParamNameSet(
      [...SEEDED_QUERY_BASE_IGNORED_PARAMS],
      isJobIdShapedParamKey,
    ),
    locationParams: new ShapeMatchedParamNameSet(
      [...SEEDED_QUERY_BASE_LOCATION_PARAMS],
      isGeoShapedParamKey,
    ),
  };
}
