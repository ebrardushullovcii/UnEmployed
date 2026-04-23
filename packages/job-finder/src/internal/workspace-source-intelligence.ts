import {
  JobPostingSchema,
  SourceIntelligenceArtifactSchema,
  type CandidateProfile,
  type SourceIntelligenceArtifact,
  type JobDiscoveryCollectionMethod,
  type JobDiscoveryMethod,
  type JobDiscoveryTarget,
  type JobPosting,
  type JobSearchPreferences,
  type JobSource,
  type SourceDebugWorkerAttempt,
  type SourceInstructionArtifact,
} from "@unemployed/contracts";
import {
  matchesAnyPhrase,
  matchesLocationPreference,
  matchesTitlePreference,
} from "./matching";
import { isExplicitSearchProbeDisproof } from "./source-instruction-evidence";
import { normalizeText, uniqueStrings } from "./shared";

const technicalRoleSignalPatterns = [
  /\bsoftware\b/,
  /\bdeveloper\b/,
  /\bengineer\b/,
  /\bfrontend\b/,
  /\bbackend\b/,
  /\bfull stack\b/,
  /\bfullstack\b/,
  /\bweb\b/,
  /\bmobile\b/,
  /\bdevops\b/,
  /\bsdet\b/,
  /\bqa automation\b/,
  /\bplatform\b/,
  /\bprogrammer\b/,
  /\btypescript\b/,
  /\bjavascript\b/,
  /\breact\b/,
  /\bnode\b/,
  /\bdotnet\b/,
  /\b(?:asp\s+)?net(?:\s+core|\s+framework)?\b/,
  /\bcsharp\b/,
  /\bpython\b/,
  /\bjava\b/,
] as const;

const adjacentTechnicalRoleSignalPatterns = [
  /\bsoftware\b/,
  /\bdeveloper\b/,
  /\bengineer\b/,
  /\bfrontend\b/,
  /\bbackend\b/,
  /\bfull stack\b/,
  /\bfullstack\b/,
  /\bweb\b/,
  /\bmobile\b/,
  /\bplatform\b/,
  /\bapplication\b/,
  /\bqa\b/,
  /\bsdet\b/,
  /\bdevops\b/,
  /\bsre\b/,
  /\bsite reliability\b/,
  /\bcloud\b/,
  /\bdata\b/,
  /\bmachine learning\b/,
  /\bai\b/,
  /\binfrastructure\b/,
  /\bwordpress\b/,
  /\bapi\b/,
  /\bintegration\b/,
  /\bintegrations\b/,
  /\b(?:asp\s+)?net(?:\s+core|\s+framework)?\b/,
] as const;

const technicalRoleFamilyPatterns = [
  ["software_engineering", [/\bsoftware\b/, /\bengineer\b/, /\bdeveloper\b/, /\bprogrammer\b/]],
  ["frontend", [/\bfrontend\b/, /\breact\b/, /\bweb\b/, /\bui\b/]],
  ["backend", [/\bbackend\b/, /\bapi\b/, /\bserver\b/, /\bservices\b/]],
  ["fullstack", [/\bfull stack\b/, /\bfullstack\b/]],
  ["platform", [/\bplatform\b/, /\bdevops\b/, /\bsre\b/, /\binfrastructure\b/, /\bcloud\b/]],
  ["mobile", [/\bmobile\b/, /\breact native\b/, /\bios\b/, /\bandroid\b/]],
  ["data_ai", [/\bdata\b/, /\bmachine learning\b/, /\bai\b/]],
  ["qa", [/\bqa\b/, /\bsdet\b/, /\bautomation\b/]],
] as const;

type PublicApiFieldPath = readonly string[];
type PublicApiFieldSelector = readonly PublicApiFieldPath[];
type PublicApiResponseAdapter = {
  itemsPath: PublicApiFieldPath | null;
  invalidPayloadMessage: string;
  fields: {
    sourceJobId: PublicApiFieldSelector;
    title: PublicApiFieldSelector;
    canonicalUrl: PublicApiFieldSelector;
    applicationUrl?: PublicApiFieldSelector;
    location?: PublicApiFieldSelector;
    description?: PublicApiFieldSelector;
    postedAt?: PublicApiFieldSelector;
    employmentType?: PublicApiFieldSelector;
    department?: PublicApiFieldSelector;
    team?: PublicApiFieldSelector;
  };
};

type NormalizedPublicApiJobRecord = {
  sourceJobId: string | null;
  title: string | null;
  canonicalUrl: string | null;
  applicationUrl: string | null;
  location: string | null;
  description: string | null;
  postedAtValue: string | number | null;
  employmentType: string | null;
  department: string | null;
  team: string | null;
};

type ResolvedSourceCapability = {
  key: "greenhouse" | "lever" | "linkedin" | "ashby" | "workday" | "icims";
  label: string;
  confidence: number;
  apiAvailability: "available" | "not_supported" | "unconfirmed";
  publicApiUrlTemplate: string | null;
  boardToken: string | null;
  boardSlug: string | null;
  providerIdentifier: string;
};

type SourceCapabilityRule = {
  key: ResolvedSourceCapability["key"];
  label: ResolvedSourceCapability["label"];
  confidence: ResolvedSourceCapability["confidence"];
  apiAvailability: ResolvedSourceCapability["apiAvailability"];
  resolve: (url: URL) => Omit<ResolvedSourceCapability, "key" | "label" | "confidence" | "apiAvailability"> | null;
};

const PUBLIC_API_RESPONSE_ADAPTERS = {
  greenhouse: {
    itemsPath: ["jobs"],
    invalidPayloadMessage: "Public provider API returned an invalid payload.",
    fields: {
      sourceJobId: [["id"]],
      title: [["title"]],
      canonicalUrl: [["absolute_url"]],
      applicationUrl: [["absolute_url"]],
      location: [["location", "name"]],
      description: [["content"]],
      postedAt: [["updated_at"]],
    },
  },
  lever: {
    itemsPath: null,
    invalidPayloadMessage: "Public provider API returned an invalid payload.",
    fields: {
      sourceJobId: [["id"]],
      title: [["text"]],
      canonicalUrl: [["hostedUrl"]],
      applicationUrl: [["applyUrl"], ["hostedUrl"]],
      location: [["categories", "location"]],
      description: [["descriptionPlain"], ["description"]],
      postedAt: [["createdAt"]],
      employmentType: [["categories", "commitment"]],
      department: [["categories", "department"]],
      team: [["categories", "team"]],
    },
  },
} satisfies Record<string, PublicApiResponseAdapter>;

const SOURCE_CAPABILITY_RULES = [
  {
    key: "greenhouse",
    label: "Greenhouse",
    confidence: 0.95,
    apiAvailability: "available",
    resolve(url: URL) {
      const hostname = url.hostname.toLowerCase();
      if (!["boards.greenhouse.io", "job-boards.greenhouse.io"].includes(hostname)) {
        return null;
      }

      const boardKey = url.pathname.split("/").filter(Boolean)[0] ?? null;
      if (!boardKey) {
        return null;
      }

      return {
        publicApiUrlTemplate: `https://boards-api.greenhouse.io/v1/boards/${boardKey}/jobs?content=true`,
        boardToken: boardKey,
        boardSlug: null,
        providerIdentifier: boardKey,
      };
    },
  },
  {
    key: "lever",
    label: "Lever",
    confidence: 0.95,
    apiAvailability: "available",
    resolve(url: URL) {
      const hostname = url.hostname.toLowerCase();
      if (!hostname.includes("lever.co")) {
        return null;
      }

      const boardKey = url.pathname.split("/").filter(Boolean)[0] ?? null;
      if (!boardKey) {
        return null;
      }

      return {
        publicApiUrlTemplate: `https://api.lever.co/v0/postings/${boardKey}?mode=json`,
        boardToken: null,
        boardSlug: boardKey,
        providerIdentifier: boardKey,
      };
    },
  },
  {
    key: "linkedin",
    label: "LinkedIn Jobs",
    confidence: 0.98,
    apiAvailability: "not_supported",
    resolve(url: URL) {
      const hostname = url.hostname.toLowerCase();
      if (!hostname.includes("linkedin.com")) {
        return null;
      }

      return {
        publicApiUrlTemplate: null,
        boardToken: null,
        boardSlug: null,
        providerIdentifier: "linkedin_jobs",
      };
    },
  },
  {
    key: "ashby",
    label: "Ashby",
    confidence: 0.85,
    apiAvailability: "unconfirmed",
    resolve(url: URL) {
      const hostname = url.hostname.toLowerCase();
      if (!hostname.includes("ashby")) {
        return null;
      }

      return {
        publicApiUrlTemplate: null,
        boardToken: null,
        boardSlug: null,
        providerIdentifier: hostname,
      };
    },
  },
  {
    key: "workday",
    label: "Workday",
    confidence: 0.84,
    apiAvailability: "not_supported",
    resolve(url: URL) {
      const hostname = url.hostname.toLowerCase();
      if (!hostname.includes("myworkdayjobs.com") && !hostname.includes("workday")) {
        return null;
      }

      return {
        publicApiUrlTemplate: null,
        boardToken: null,
        boardSlug: null,
        providerIdentifier: hostname,
      };
    },
  },
  {
    key: "icims",
    label: "iCIMS",
    confidence: 0.82,
    apiAvailability: "not_supported",
    resolve(url: URL) {
      const hostname = url.hostname.toLowerCase();
      if (!hostname.includes("icims")) {
        return null;
      }

      return {
        publicApiUrlTemplate: null,
        boardToken: null,
        boardSlug: null,
        providerIdentifier: hostname,
      };
    },
  },
] satisfies readonly SourceCapabilityRule[];

export type ReusableRouteKind =
  SourceIntelligenceArtifact["collection"]["startingRoutes"][number]["kind"];

const LISTING_ROUTE_KEYWORDS = [
  "job",
  "jobs",
  "career",
  "careers",
  "opening",
  "openings",
  "position",
  "positions",
  "vacancy",
  "vacancies",
  "konkurs",
  "pune",
  "pozit",
  "karriere",
  "apliko",
];

const GENERIC_KEYWORD_QUERY_PARAM_NAMES = ["keywords", "keyword", "q", "query", "search"] as const;
const GENERIC_LOCATION_QUERY_PARAM_NAMES = ["location", "loc", "city", "region"] as const;

function parseOptionalString(value: unknown): { value: string } | null {
  return typeof value === "string" ? { value } : null;
}

function parseNullableString(value: unknown): { value: string | null } | null {
  if (value == null) {
    return { value: null };
  }

  return typeof value === "string" ? { value } : null;
}

function parseNullableStringOrNumber(
  value: unknown,
): { value: string | number | null } | null {
  if (value == null) {
    return { value: null };
  }

  if (typeof value === "string") {
    return { value };
  }

  return typeof value === "number" && Number.isFinite(value) ? { value } : null;
}

function getValueAtPath(value: unknown, path: readonly string[] | null): unknown {
  if (path == null) {
    return value;
  }

  let current: unknown = value;
  for (const segment of path) {
    if (!current || typeof current !== "object") {
      return undefined;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

function getFirstValueAtPaths(
  record: Record<string, unknown>,
  selectors: PublicApiFieldSelector | undefined,
): unknown {
  if (!selectors) {
    return undefined;
  }

  for (const path of selectors) {
    const value = getValueAtPath(record, path);
    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

function parsePublicApiRecordArray(
  value: unknown,
  adapter: PublicApiResponseAdapter,
): Record<string, unknown>[] {
  const itemsValue = getValueAtPath(value, adapter.itemsPath);
  if (itemsValue == null) {
    return [];
  }

  if (!Array.isArray(itemsValue)) {
    throw new Error(adapter.invalidPayloadMessage);
  }

  return itemsValue.map((item) => {
    if (!item || typeof item !== "object") {
      throw new Error(adapter.invalidPayloadMessage);
    }

    return item as Record<string, unknown>;
  });
}

function parsePublicApiJobRecords(
  value: unknown,
  adapter: PublicApiResponseAdapter,
): NormalizedPublicApiJobRecord[] {
  return parsePublicApiRecordArray(value, adapter).map((record) => {
    const sourceJobIdValue = getFirstValueAtPaths(record, adapter.fields.sourceJobId);
    const sourceJobId =
      typeof sourceJobIdValue === "string" || typeof sourceJobIdValue === "number"
        ? String(sourceJobIdValue)
        : null;

    return {
      sourceJobId,
      title: parseOptionalString(getFirstValueAtPaths(record, adapter.fields.title))?.value ?? null,
      canonicalUrl:
        parseOptionalString(getFirstValueAtPaths(record, adapter.fields.canonicalUrl))?.value ?? null,
      applicationUrl:
        parseNullableString(getFirstValueAtPaths(record, adapter.fields.applicationUrl))?.value ?? null,
      location:
        parseNullableString(getFirstValueAtPaths(record, adapter.fields.location))?.value ?? null,
      description:
        parseNullableString(getFirstValueAtPaths(record, adapter.fields.description))?.value ?? null,
      postedAtValue:
        parseNullableStringOrNumber(getFirstValueAtPaths(record, adapter.fields.postedAt))?.value ?? null,
      employmentType:
        parseNullableString(getFirstValueAtPaths(record, adapter.fields.employmentType))?.value ?? null,
      department:
        parseNullableString(getFirstValueAtPaths(record, adapter.fields.department))?.value ?? null,
      team: parseNullableString(getFirstValueAtPaths(record, adapter.fields.team))?.value ?? null,
    };
  });
}

function tryParseUrl(value: string | null | undefined): URL | null {
  if (!value) {
    return null;
  }

  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function extractUrlsFromText(text: string): string[] {
  return (text.match(/https?:\/\/[^\s)\]>",]+/gi) ?? []).map((match) =>
    match.replace(/[.,;:!?)\]>"]+$/g, ""),
  );
}

function extractSameHostUrls(target: JobDiscoveryTarget, lines: readonly string[]) {
  const anchorUrl = tryParseUrl(target.startingUrl);
  if (!anchorUrl) {
    return [] as string[];
  }

  const values = lines.flatMap((line) =>
    extractUrlsFromText(line).flatMap((candidate) => {
      const parsed = tryParseUrl(candidate);
      if (!parsed || parsed.hostname !== anchorUrl.hostname) {
        return [];
      }

      parsed.hash = "";
      return [parsed.toString()];
    }),
  );

  return uniqueStrings(values);
}

function detectProvider(target: JobDiscoveryTarget, urls: readonly string[]) {
  const parsedUrls = [target.startingUrl, ...urls].flatMap((value) => {
    const parsed = tryParseUrl(value);
    return parsed ? [parsed] : [];
  });

  for (const parsedUrl of parsedUrls) {
    for (const rule of SOURCE_CAPABILITY_RULES) {
      const resolved = rule.resolve(parsedUrl);
      if (!resolved) {
        continue;
      }

      return {
        key: rule.key,
        label: rule.label,
        confidence: rule.confidence,
        apiAvailability: rule.apiAvailability,
        ...resolved,
      };
    }
  }

  return null;
}

function decodeRoutePathname(pathname: string): string {
  try {
    return decodeURIComponent(pathname).toLowerCase();
  } catch {
    return pathname.toLowerCase();
  }
}

function isBrokenOrTemplatedRoutePath(pathname: string, search: string): boolean {
  const routeText = `${pathname}${search}`;
  return (
    /(^|\/)404($|\/)/.test(pathname) ||
    routeText.includes("not-found") ||
    /(^|\/)\{[^/]+\}($|\/)/.test(pathname) ||
    /(^|\/):[a-z0-9_-]+($|\/)/i.test(pathname)
  );
}

function inferRouteKind(url: string): ReusableRouteKind {
  const parsed = tryParseUrl(url);
  const pathname = decodeRoutePathname(parsed?.pathname ?? "");
  const search = (parsed?.search ?? "").toLowerCase();
  const normalized = normalizeText(`${pathname} ${search}`);
  const pathSegments = pathname.split("/").filter(Boolean);
  const leafSegment = pathSegments[pathSegments.length - 1] ?? "";
  const parentSegment = pathSegments[pathSegments.length - 2] ?? "";

  if (isBrokenOrTemplatedRoutePath(pathname, search)) {
    return "detail";
  }

  if (pathname.includes("search") || pathname.includes("filter") || search.includes("search")) {
    return "search";
  }

  if (
    pathname.includes("collection") ||
    pathname.includes("recommended") ||
    pathname.includes("recommendation")
  ) {
    return "collection";
  }

  if (pathname.includes("apply")) {
    return "apply";
  }

  if (
    pathname.includes("/view/") ||
    (["job", "jobs", "opening", "openings", "position", "positions", "role", "roles"].includes(
      parentSegment,
    ) &&
      ![
        "search",
        "filter",
        "filters",
        "results",
        "recommended",
        "recommendations",
        "collection",
        "collections",
        "curated",
        "all",
        "list",
        "listing",
        "listings",
        "careers",
        "jobs",
        "openings",
        "positions",
        "roles",
      ].includes(leafSegment))
  ) {
    return "detail";
  }

  if (LISTING_ROUTE_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return "listing";
  }

  return "anchor";
}

export function resolveRouteKindForReuse(
  url: string,
  preferredKind: ReusableRouteKind | null = null,
): ReusableRouteKind {
  const inferredKind = inferRouteKind(url);

  if (preferredKind === "detail" || inferredKind === "detail") {
    return "detail";
  }

  if (preferredKind === "apply" || inferredKind === "apply") {
    return "apply";
  }

  if (preferredKind === "search" || inferredKind === "search") {
    return "search";
  }

  if (preferredKind === "collection" || inferredKind === "collection") {
    return "collection";
  }

  if (inferredKind === "listing") {
    return "listing";
  }

  return "anchor";
}

export function canonicalizeRouteForReuse(
  value: string,
  anchorUrl: URL | null,
): string | null {
  const parsed = tryParseUrl(value);
  if (!parsed) {
    return null;
  }

  if (anchorUrl && parsed.hostname !== anchorUrl.hostname) {
    return null;
  }

  for (const key of [
    "currentJobId",
    "selectedJobId",
    "jobId",
    "trk",
    "trackingId",
  ]) {
    parsed.searchParams.delete(key);
  }

  parsed.hash = "";

  const pathname = decodeRoutePathname(parsed.pathname);
  const search = parsed.search.toLowerCase();
  if (isBrokenOrTemplatedRoutePath(pathname, search)) {
    return null;
  }

  return parsed.toString();
}

export function shouldKeepRouteForReuse(input: {
  url: string;
  kind: ReturnType<typeof inferRouteKind>;
  targetStartingUrl: string;
}): boolean {
  if (input.url === input.targetStartingUrl) {
    return true;
  }

  return input.kind === "search" || input.kind === "collection" || input.kind === "listing";
}

function uniqueRoutes(
  routes: Array<{
    url: string;
    label: string;
    kind: "anchor" | "listing" | "search" | "detail" | "apply" | "collection";
    confidence: number;
  }>,
) {
  const seen = new Set<string>();

  return routes.flatMap((route) => {
    if (seen.has(route.url)) {
      return [];
    }

    seen.add(route.url);
    return [route];
  });
}

function inferPreferredCollectionMethod(
  provider: SourceIntelligenceArtifact["provider"],
  routes: readonly { kind: string }[],
  existing: SourceInstructionArtifact | null,
): JobDiscoveryCollectionMethod {
  const forced = existing?.intelligence.overrides.forceMethod ?? null;
  if (forced) {
    return forced;
  }

  if (provider?.apiAvailability === "available") {
    return "api";
  }

  if (routes.some((route) => route.kind === "search")) {
    return "listing_route";
  }

  if (routes.some((route) => route.kind === "listing" || route.kind === "collection")) {
    return "careers_page";
  }

  return "fallback_search";
}

function inferApplyPath(
  attempts: readonly SourceDebugWorkerAttempt[],
  existing: SourceInstructionArtifact | null,
) {
  const combinedText = normalizeText(
    [
      ...(existing?.applyGuidance ?? []),
      ...attempts.flatMap((attempt) => attempt.confirmedFacts),
    ].join(" "),
  );

  if (combinedText.includes("easy apply") || combinedText.includes("inline apply")) {
    return "easy_apply" as const;
  }

  if (combinedText.includes("redirect") || combinedText.includes("company site")) {
    return "external_redirect" as const;
  }

  return "unknown" as const;
}

export function buildSourceIntelligenceArtifact(input: {
  target: JobDiscoveryTarget;
  attempts: readonly SourceDebugWorkerAttempt[];
  currentArtifact: SourceInstructionArtifact | null;
}) {
  const routeLines = input.attempts.flatMap((attempt) => [
    ...attempt.confirmedFacts,
    ...(attempt.phaseEvidence?.routeSignals ?? []),
  ]);
  const discoveredUrls = extractSameHostUrls(input.target, routeLines);
  const anchorUrl = tryParseUrl(input.target.startingUrl);
  const provider =
    input.currentArtifact?.intelligence.provider ??
    detectProvider(input.target, discoveredUrls);
  const startingRoutes = uniqueRoutes([
    {
      url: input.target.startingUrl,
      label: "Starting URL",
      kind: inferRouteKind(input.target.startingUrl),
      confidence: 0.6,
    },
    ...((input.currentArtifact?.intelligence.collection.startingRoutes ?? []).flatMap((route) => {
      const normalizedUrl = canonicalizeRouteForReuse(route.url, anchorUrl);
      if (!normalizedUrl) {
        return [];
      }

      const normalizedKind = resolveRouteKindForReuse(normalizedUrl, route.kind);
      return shouldKeepRouteForReuse({
        url: normalizedUrl,
        kind: normalizedKind,
        targetStartingUrl: input.target.startingUrl,
      })
        ? [{ ...route, url: normalizedUrl, kind: normalizedKind }]
        : [];
    })),
    ...discoveredUrls.flatMap((url) => {
      const normalizedUrl = canonicalizeRouteForReuse(url, anchorUrl);
      if (!normalizedUrl) {
        return [];
      }

      const kind = inferRouteKind(normalizedUrl);
      return shouldKeepRouteForReuse({
        url: normalizedUrl,
        kind,
        targetStartingUrl: input.target.startingUrl,
      })
        ? [{
            url: normalizedUrl,
            label: "Observed route",
            kind,
            confidence: 0.84,
          }]
        : [];
    }),
  ]);
  const searchRouteTemplates = uniqueRoutes(
    startingRoutes.filter((route) => route.kind === "search"),
  );
  const preferredMethod = inferPreferredCollectionMethod(
    provider,
    startingRoutes,
    input.currentArtifact,
  );
  const stableControlNames = uniqueStrings(
    input.attempts.flatMap((attempt) => attempt.phaseEvidence?.visibleControls ?? []),
  );
  const warnings = uniqueStrings(
    input.attempts.flatMap((attempt) => [
      ...(attempt.phaseEvidence?.warnings ?? []),
      ...(attempt.blockerSummary ? [attempt.blockerSummary] : []),
    ]),
  );

  return SourceIntelligenceArtifactSchema.parse({
    provider,
    collection: {
      preferredMethod,
      rankedMethods: uniqueStrings([
        input.currentArtifact?.intelligence.overrides.forceMethod ?? null,
        preferredMethod,
        provider?.apiAvailability === "available" ? "api" : null,
        searchRouteTemplates.length > 0 ? "listing_route" : null,
        startingRoutes.some(
          (route) => route.kind === "listing" || route.kind === "collection",
        )
          ? "careers_page"
          : null,
        "fallback_search",
      ].filter((value): value is JobDiscoveryCollectionMethod => value !== null)),
      startingRoutes,
      searchRouteTemplates,
      detailRoutePatterns:
        input.currentArtifact?.intelligence.collection.detailRoutePatterns ?? [],
      listingMarkers: uniqueStrings([
        ...stableControlNames.filter((value) => /job|listing|result|card/i.test(value)),
        ...(input.currentArtifact?.intelligence.collection.listingMarkers ?? []),
      ]),
    },
    apply: {
      applyPath: inferApplyPath(input.attempts, input.currentArtifact),
      authMarkers: uniqueStrings(
        input.attempts.flatMap((attempt) =>
          attempt.outcome === "blocked_auth" ? [attempt.resultSummary] : [],
        ),
      ),
      consentMarkers: uniqueStrings(
        warnings.filter((warning) => /consent/i.test(warning)),
      ),
      questionSurfaceHints: uniqueStrings(
        input.attempts.flatMap((attempt) =>
          attempt.confirmedFacts.filter((fact) => /question|screening/i.test(fact)),
        ),
      ),
      resumeUploadHints: uniqueStrings(
        input.attempts.flatMap((attempt) =>
          attempt.confirmedFacts.filter((fact) => /resume upload/i.test(fact)),
        ),
      ),
    },
    reliability: {
      selectorFingerprints: stableControlNames,
      stableControlNames,
      failureFingerprints: warnings,
      verifiedAt: input.currentArtifact?.verification?.verifiedAt ?? null,
      freshnessNotes: uniqueStrings([
        ...(input.currentArtifact?.verification?.outcome === "passed"
          ? ["Replay verification succeeded."]
          : []),
        ...(input.currentArtifact?.intelligence.reliability.freshnessNotes ?? []),
      ]),
    },
    overrides: input.currentArtifact?.intelligence.overrides ?? {
      forceMethod: null,
      deniedRoutePatterns: [],
      extraStartingRoutes: [],
    },
  });
}

export function inferSourceIntelligenceFromTarget(input: {
  target: JobDiscoveryTarget;
  currentArtifact: SourceInstructionArtifact | null;
}): SourceIntelligenceArtifact {
  if (input.currentArtifact?.intelligence) {
    return SourceIntelligenceArtifactSchema.parse(input.currentArtifact.intelligence);
  }

  const provider = detectProvider(input.target, []);
  const startingRoute = {
    url: input.target.startingUrl,
    label: "Starting URL",
    kind: inferRouteKind(input.target.startingUrl),
    confidence: 0.72,
  };

  return SourceIntelligenceArtifactSchema.parse({
    provider,
    collection: {
      preferredMethod: inferPreferredCollectionMethod(
        provider,
        [startingRoute],
        input.currentArtifact,
      ),
      rankedMethods: uniqueStrings([
        provider?.apiAvailability === "available" ? "api" : null,
        startingRoute.kind === "search"
          ? "listing_route"
          : null,
        startingRoute.kind === "listing" || startingRoute.kind === "collection"
          ? "careers_page"
          : null,
        "careers_page",
        "fallback_search",
      ].filter((value): value is JobDiscoveryCollectionMethod => value !== null)),
      startingRoutes: [startingRoute],
      searchRouteTemplates: startingRoute.kind === "search" ? [startingRoute] : [],
      detailRoutePatterns: [],
      listingMarkers: [],
    },
    apply: {
      applyPath: "unknown",
      authMarkers: [],
      consentMarkers: [],
      questionSurfaceHints: [],
      resumeUploadHints: [],
    },
    reliability: {
      selectorFingerprints: [],
      stableControlNames: [],
      failureFingerprints: [],
      verifiedAt: null,
      freshnessNotes: ["Derived from the current target URL before source-debug validation."],
    },
    overrides: {
      forceMethod: null,
      deniedRoutePatterns: [],
      extraStartingRoutes: [],
    },
  });
}

export function buildDiscoveryStartingUrls(
  target: JobDiscoveryTarget,
  artifact: SourceInstructionArtifact | null,
  searchPreferences?: JobSearchPreferences | null,
): string[] {
  if (!artifact) {
    return [target.startingUrl];
  }

  const anchorUrl = tryParseUrl(target.startingUrl);
  const normalizeRoute = (url: string) => canonicalizeRouteForReuse(url, anchorUrl);
  const deniedRoutes = resolveDeniedDiscoveryRoutes(artifact, anchorUrl);
  const isDeniedRoute = (url: string | null) =>
    url != null && deniedRoutes.some((deniedRoute) => deniedRoute === url);
  const synthesizedSearchRoute = buildEvidenceDrivenDiscoverySearchUrl(
    target,
    artifact,
    searchPreferences,
  );
  const overrideRoutes = (artifact.intelligence.overrides.extraStartingRoutes ?? []).flatMap(
    (route) => {
      const normalized = normalizeRoute(route);
      const kind = normalized ? inferRouteKind(normalized) : null;
      return normalized && kind && shouldKeepRouteForReuse({
        url: normalized,
        kind,
        targetStartingUrl: target.startingUrl,
      }) && !isDeniedRoute(normalized)
        ? [normalized]
        : [];
    },
  );
  const searchRoutes = artifact.intelligence.collection.searchRouteTemplates.flatMap((route) => {
    const normalized = normalizeRoute(route.url);
    const kind = normalized ? resolveRouteKindForReuse(normalized, route.kind) : null;
    return normalized && kind && shouldKeepRouteForReuse({
      url: normalized,
      kind,
      targetStartingUrl: target.startingUrl,
    }) && !isDeniedRoute(normalized)
      ? [normalized]
      : [];
  });
  const learnedStartingRoutes = artifact.intelligence.collection.startingRoutes.flatMap((route) => {
    const normalized = normalizeRoute(route.url);
    const kind = normalized ? resolveRouteKindForReuse(normalized, route.kind) : null;
    return normalized && kind && shouldKeepRouteForReuse({
      url: normalized,
      kind,
      targetStartingUrl: target.startingUrl,
    }) && !isDeniedRoute(normalized) && normalized !== target.startingUrl
      ? [normalized]
      : [];
  });
  const preferredMethod =
    artifact.intelligence.overrides.forceMethod ??
    artifact.intelligence.collection.preferredMethod;

  const routes = uniqueStrings(
    (
      synthesizedSearchRoute && !isDeniedRoute(synthesizedSearchRoute)
        ? [
            synthesizedSearchRoute,
            ...overrideRoutes,
            ...searchRoutes,
            ...learnedStartingRoutes,
            target.startingUrl,
          ]
        : preferredMethod === "careers_page"
          ? [
            ...overrideRoutes,
            ...learnedStartingRoutes,
            ...searchRoutes,
            target.startingUrl,
          ]
          : [
              ...overrideRoutes,
              ...searchRoutes,
              ...learnedStartingRoutes,
              target.startingUrl,
            ]
    ).filter(Boolean),
  );

  return routes.length > 0 ? routes : [target.startingUrl];
}

function resolveDeniedDiscoveryRoutes(
  artifact: SourceInstructionArtifact,
  anchorUrl: URL | null,
): string[] {
  const normalizeDeniedRoute = (value: string): string | null => {
    const normalizedValue = value.trim();
    if (!normalizedValue) {
      return null;
    }

    if (normalizedValue.startsWith("/") && anchorUrl) {
      return canonicalizeRouteForReuse(new URL(normalizedValue, anchorUrl).toString(), anchorUrl);
    }

    return canonicalizeRouteForReuse(normalizedValue, anchorUrl);
  };
  const deniedRouteOverrides = (artifact.intelligence.overrides.deniedRoutePatterns ?? []).flatMap(
    (pattern) => {
      const normalized = normalizeDeniedRoute(pattern);
      return normalized ? [normalized] : [];
    },
  );
  const deniedRouteHints = [
    ...artifact.searchGuidance,
    ...artifact.navigationGuidance,
    ...artifact.warnings,
  ].flatMap((line) => {
    const normalizedLine = normalizeText(line);
    const lineDisprovesRoute =
      isExplicitSearchProbeDisproof(line) ||
      normalizedLine.includes("returns 404") ||
      normalizedLine.includes("not a working search endpoint") ||
      normalizedLine.includes("broken route");

    if (!lineDisprovesRoute) {
      return [] as string[];
    }

    const implicitDeniedRoutes = [
      normalizedLine.includes("search route") || normalizedLine.includes("search endpoint")
        ? normalizeDeniedRoute("/search")
        : null,
    ].filter((value): value is string => value !== null);

    const absoluteUrlMatches = line.match(/https?:\/\/[^\s)\]>",]+/gi) ?? [];
    const relativePathMatches =
      line.match(/(?:^|[\s(])((?:\/[A-Za-z0-9._~!$&'()*+,;=:@%-]+)+(?:\/)?(?:\?[^\s)\]>",]+)?)/g) ?? [];

    return uniqueStrings([
      ...implicitDeniedRoutes,
      ...absoluteUrlMatches,
      ...relativePathMatches.map((match) => {
        const trimmedMatch = match.trim();
        return trimmedMatch.startsWith("/")
          ? trimmedMatch
          : trimmedMatch.slice(trimmedMatch.indexOf("/"));
      }),
    ])
      .map((value) => value.replace(/[.,;:!?]+$/g, ""))
      .flatMap((value) => {
        const normalized = normalizeDeniedRoute(value);
        return normalized ? [normalized] : [];
      });
  });

  return uniqueStrings([...deniedRouteOverrides, ...deniedRouteHints]);
}

export function buildEvidenceDrivenDiscoverySearchUrl(
  target: JobDiscoveryTarget,
  artifact: SourceInstructionArtifact | null,
  searchPreferences?: JobSearchPreferences | null,
): string | null {
  const anchorUrl = tryParseUrl(target.startingUrl);
  if (!anchorUrl) {
    return null;
  }

  return buildGuidedDiscoverySearchUrl(anchorUrl, artifact, searchPreferences);
}

function deriveGenericSearchKeyword(
  searchPreferences?: JobSearchPreferences | null,
): string | null {
  if (!searchPreferences) {
    return null;
  }

  const technicalSearchIntent =
    searchPreferences.targetRoles.some(matchesTechnicalRoleSignal) ||
    searchPreferences.jobFamilies.some(matchesTechnicalRoleSignal);
  if (technicalSearchIntent) {
    return "software";
  }

  const explicitKeyword =
    searchPreferences.targetRoles.find((value) => value.trim().length > 0) ??
    searchPreferences.jobFamilies.find((value) => value.trim().length > 0) ??
    null;
  if (!explicitKeyword) {
    return null;
  }

  const keywordTokens = normalizeText(explicitKeyword)
    .split(/\s+/)
    .filter((token) =>
      token.length >= 4 &&
      ![
        "senior",
        "junior",
        "lead",
        "staff",
        "principal",
        "remote",
        "hybrid",
      ].includes(token),
    );

  return keywordTokens[0] ?? null;
}

function buildGuidedDiscoverySearchUrl(
  anchorUrl: URL,
  artifact: SourceInstructionArtifact | null,
  searchPreferences?: JobSearchPreferences | null,
): string | null {
  if (!artifact || !searchPreferences) {
    return null;
  }

  const supportedQueryParams = collectGuidedSearchQueryParamNames(artifact);
  const keywordParam = findGuidedSearchQueryParamName(
    supportedQueryParams,
    GENERIC_KEYWORD_QUERY_PARAM_NAMES,
  );
  const locationParam = findGuidedSearchQueryParamName(
    supportedQueryParams,
    GENERIC_LOCATION_QUERY_PARAM_NAMES,
  );
  const keyword = keywordParam ? deriveGenericSearchKeyword(searchPreferences) : null;
  const location =
    locationParam &&
    (searchPreferences.locations.find((value) => value.trim().length > 0) ?? null);

  if (!keywordParam && !locationParam) {
    return null;
  }

  if (!keyword && !location) {
    return null;
  }

  const searchUrl = selectGuidedSearchBaseUrl(anchorUrl, artifact);
  if (keywordParam && keyword) {
    searchUrl.searchParams.set(keywordParam, keyword);
  }
  if (locationParam && location) {
    searchUrl.searchParams.set(locationParam, location);
  }

  return canonicalizeRouteForReuse(searchUrl.toString(), anchorUrl);
}

function collectGuidedSearchQueryParamNames(
  artifact: SourceInstructionArtifact,
): string[] {
  const paramNames = new Set<string>();
  const collectFromText = (value: string | null | undefined) => {
    if (!value) {
      return;
    }

    for (const match of value.matchAll(/[?&]([a-zA-Z][a-zA-Z0-9_-]*)=/g)) {
      const paramName = match[1]?.trim().toLowerCase();
      if (paramName) {
        paramNames.add(paramName);
      }
    }
  };
  const collectFromUrl = (value: string) => {
    const parsed = tryParseUrl(value);
    if (!parsed) {
      return;
    }

    for (const key of parsed.searchParams.keys()) {
      const paramName = key.trim().toLowerCase();
      if (paramName) {
        paramNames.add(paramName);
      }
    }
  };

  collectFromText(artifact.notes);
  for (const line of [
    ...artifact.navigationGuidance,
    ...artifact.searchGuidance,
    ...artifact.warnings,
  ]) {
    collectFromText(line);
  }

  for (const route of artifact.intelligence.collection.searchRouteTemplates) {
    collectFromUrl(route.url);
  }

  for (const route of artifact.intelligence.collection.startingRoutes) {
    collectFromUrl(route.url);
  }

  return [...paramNames];
}

function findGuidedSearchQueryParamName(
  supportedQueryParams: readonly string[],
  preferredNames: readonly string[],
): string | null {
  return (
    preferredNames.find((paramName) => supportedQueryParams.includes(paramName)) ?? null
  );
}

function selectGuidedSearchBaseUrl(
  anchorUrl: URL,
  artifact: SourceInstructionArtifact,
): URL {
  for (const route of artifact.intelligence.collection.searchRouteTemplates) {
    const normalizedRoute = canonicalizeRouteForReuse(route.url, anchorUrl);
    if (!normalizedRoute) {
      continue;
    }

    const parsed = tryParseUrl(normalizedRoute);
    if (parsed) {
      return new URL(parsed.toString());
    }
  }

  return new URL(anchorUrl.toString());
}

export function selectDiscoveryCollectionMethod(
  target: JobDiscoveryTarget,
  artifact: SourceInstructionArtifact | null,
): JobDiscoveryCollectionMethod {
  const inferredIntelligence = inferSourceIntelligenceFromTarget({
    target,
    currentArtifact: artifact,
  });

  return (
    artifact?.intelligence.overrides.forceMethod ??
    artifact?.intelligence.collection.preferredMethod ??
    inferredIntelligence.collection.preferredMethod ??
    (tryParseUrl(target.startingUrl)?.pathname.match(/jobs|careers|openings/i)
      ? "careers_page"
      : "fallback_search")
  );
}

export function selectDiscoveryMethod(
  collectionMethod: JobDiscoveryCollectionMethod,
): JobDiscoveryMethod {
  return collectionMethod === "api" ? "public_api" : "browser_agent";
}

function htmlToText(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeProviderDateTime(
  value: string | number | null | undefined,
): string | null {
  if (!value) {
    return null;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return null;
    }

    const numericDate = new Date(value);
    return Number.isNaN(numericDate.getTime()) ? null : numericDate.toISOString();
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (/^-?\d+$/.test(trimmed)) {
    const numericValue = Number(trimmed);
    if (!Number.isFinite(numericValue)) {
      return null;
    }

    const numericDate = new Date(numericValue);
    return Number.isNaN(numericDate.getTime()) ? null : numericDate.toISOString();
  }

  const parsedAt = Date.parse(trimmed);
  if (Number.isNaN(parsedAt)) {
    return null;
  }

  const parsedDate = new Date(parsedAt);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate.toISOString();
}

function inferWorkModes(location: string | null | undefined): JobPosting["workMode"] {
  const normalized = normalizeText(location ?? "");
  if (!normalized) {
    return [];
  }
  if (normalized.includes("remote")) {
    return ["remote"];
  }
  if (normalized.includes("hybrid")) {
    return ["hybrid"];
  }
  return [];
}

const PROVIDER_API_TIMEOUT_MS = 10_000;
const SUMMARY_MAX_LENGTH = 280;

function createProviderApiTimeoutSignal() {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return { signal: AbortSignal.timeout(PROVIDER_API_TIMEOUT_MS) };
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), PROVIDER_API_TIMEOUT_MS);
  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timeoutHandle),
  };
}

function composeAbortSignals(
  timeoutSignal: AbortSignal,
  signal?: AbortSignal,
): { signal: AbortSignal; cleanup: () => void } {
  if (!signal) {
    return {
      signal: timeoutSignal,
      cleanup: () => undefined,
    };
  }

  if (signal.aborted || timeoutSignal.aborted) {
    const controller = new AbortController();
    controller.abort();
    return {
      signal: controller.signal,
      cleanup: () => undefined,
    };
  }

  const controller = new AbortController();
  const cleanup = () => {
    signal.removeEventListener("abort", abort);
    timeoutSignal.removeEventListener("abort", abort);
  };
  const abort = () => {
    cleanup();
    controller.abort();
  };
  signal.addEventListener("abort", abort, { once: true });
  timeoutSignal.addEventListener("abort", abort, { once: true });
  return {
    signal: controller.signal,
    cleanup,
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

export async function collectPublicProviderJobs(input: {
  target: JobDiscoveryTarget;
  artifact: Pick<SourceInstructionArtifact, "intelligence">;
  source: JobSource;
  signal?: AbortSignal;
}): Promise<{ jobs: JobPosting[]; warning: string | null }> {
  const provider = input.artifact.intelligence.provider;
  if (!provider || provider.apiAvailability !== "available") {
    return {
      jobs: [],
      warning: "No public provider API is configured for this source.",
    };
  }

  try {
    const responseAdapter = PUBLIC_API_RESPONSE_ADAPTERS[provider.key as keyof typeof PUBLIC_API_RESPONSE_ADAPTERS];
    if (responseAdapter && provider.publicApiUrlTemplate) {
      const timeout = createProviderApiTimeoutSignal();
      const composedSignal = composeAbortSignals(timeout.signal, input.signal);

      try {
        const response = await fetch(provider.publicApiUrlTemplate, {
          signal: composedSignal.signal,
        });
        if (!response.ok) {
          throw new Error(`Public provider API returned ${response.status}.`);
        }

        const jobs = parsePublicApiJobRecords(await response.json(), responseAdapter);

        return {
          jobs: jobs.flatMap((job) => {
            if (!job.sourceJobId || !job.title || !job.canonicalUrl) {
              return [];
            }

            const description = htmlToText(job.description);
            const applicationUrl = job.applicationUrl ?? job.canonicalUrl;
            const location = job.location?.trim() || "Unknown";
            return [
              JobPostingSchema.parse({
                source: input.source,
                sourceJobId: job.sourceJobId,
                discoveryMethod: "public_api",
                collectionMethod: "api",
                canonicalUrl: job.canonicalUrl,
                applicationUrl,
                title: job.title,
                company: input.target.label,
                location,
                workMode: inferWorkModes(location),
                applyPath: "external_redirect",
                easyApplyEligible: false,
                postedAt: normalizeProviderDateTime(job.postedAtValue),
                postedAtText: null,
                discoveredAt: new Date().toISOString(),
                salaryText: null,
                summary: description.slice(0, SUMMARY_MAX_LENGTH) || null,
                description: description || job.title,
                keySkills: [],
                responsibilities: [],
                minimumQualifications: [],
                preferredQualifications: [],
                seniority: null,
                employmentType: job.employmentType,
                department: job.department,
                team: job.team,
                employerWebsiteUrl: null,
                employerDomain: tryParseUrl(job.canonicalUrl)?.hostname ?? null,
                atsProvider: provider.label,
                providerKey: provider.key,
                providerBoardToken: provider.boardToken,
                providerIdentifier: provider.providerIdentifier,
                titleTriageOutcome: "pass",
                sourceIntelligence: input.artifact.intelligence,
                screeningHints: {},
                keywordSignals: [],
                benefits: [],
              }),
            ];
          }),
          warning: null,
        };
      } finally {
        composedSignal.cleanup();
        timeout.cleanup?.();
      }
    }

    return {
      jobs: [],
      warning: `${provider.label} API collection is not implemented yet for this provider.`,
    };
  } catch (error) {
    if (input.signal?.aborted) {
      throw error;
    }

    return {
      jobs: [],
      warning:
        isAbortError(error)
          ? `Public provider API collection failed: ${provider.label} API request timed out.`
          :
        error instanceof Error
          ? `Public provider API collection failed: ${error.message}`
          : "Public provider API collection failed.",
    };
  }
}

export function applyDiscoveryTitleTriage(input: {
  posting: JobPosting;
  searchPreferences: JobSearchPreferences;
  profile: CandidateProfile | null | undefined;
}) {
  const { posting, profile, searchPreferences } = input;
  const normalizedCompany = normalizeText(posting.company);
  const postingEvidenceText = buildPostingEvidenceText(posting);

  if (
    searchPreferences.companyBlacklist.some(
      (company) => normalizeText(company) === normalizedCompany,
    )
  ) {
    return {
      outcome: "skip_company" as const,
      reason: "Company is on the blacklist.",
    };
  }

  if (
    searchPreferences.targetRoles.length > 0 &&
    !matchesTitlePreference(posting.title, searchPreferences.targetRoles) &&
    !matchesTitlePreference(postingEvidenceText, searchPreferences.targetRoles) &&
    !matchesTechnicalRoleFallback({
      posting,
      postingEvidenceText,
      profile,
      searchPreferences,
    })
  ) {
    return {
      outcome: "skip_title" as const,
      reason: "Title is outside the current target roles.",
    };
  }

  if (
    searchPreferences.locations.length > 0 &&
    !matchesLocationPreference(posting.location, searchPreferences.locations) &&
    !matchesRemoteFriendlyTechnicalLocationFallback({
      posting,
      postingEvidenceText,
      profile,
      searchPreferences,
    })
  ) {
    return {
      outcome: "skip_location" as const,
      reason: "Location is outside the preferred search areas.",
    };
  }

  if (
    searchPreferences.workModes.length > 0 &&
    !searchPreferences.workModes.includes("flexible") &&
    posting.workMode.length > 0 &&
    !posting.workMode.some((mode) => searchPreferences.workModes.includes(mode))
  ) {
    return {
      outcome: "skip_work_mode" as const,
      reason: "Work mode is outside the preferred operating model.",
    };
  }

  return {
    outcome: "pass" as const,
    reason: null,
  };
}

function buildPostingEvidenceText(posting: JobPosting): string {
  return uniqueStrings([
    posting.title,
    posting.company,
    ...posting.keySkills,
    ...(posting.summary ? [posting.summary] : []),
    posting.description,
    ...posting.responsibilities,
    ...posting.minimumQualifications,
    ...posting.preferredQualifications,
  ]).join(" ");
}

function matchesTechnicalRoleSignal(value: string): boolean {
  const normalized = normalizeText(value);
  return technicalRoleSignalPatterns.some((pattern) => pattern.test(normalized));
}

function matchesAdjacentTechnicalRoleSignal(value: string): boolean {
  const normalized = normalizeText(value);
  return adjacentTechnicalRoleSignalPatterns.some((pattern) => pattern.test(normalized));
}

function hasTechnicalTargetRolePreference(searchPreferences: JobSearchPreferences): boolean {
  return searchPreferences.targetRoles.some(matchesTechnicalRoleSignal);
}

function collectTechnicalRoleFamilies(value: string): string[] {
  const normalized = normalizeText(value);
  return technicalRoleFamilyPatterns.flatMap(([family, patterns]) =>
    patterns.some((pattern) => pattern.test(normalized)) ? [family] : [],
  );
}

function countTechnicalRoleSignals(value: string): number {
  const normalized = normalizeText(value);
  return adjacentTechnicalRoleSignalPatterns.reduce(
    (count, pattern) => (pattern.test(normalized) ? count + 1 : count),
    0,
  );
}

function hasTechnicalRoleFamilyOverlap(input: {
  postingEvidenceText: string;
  searchPreferences: JobSearchPreferences;
}): boolean {
  const postingFamilies = new Set(collectTechnicalRoleFamilies(input.postingEvidenceText));
  if (postingFamilies.size === 0) {
    return false;
  }

  return input.searchPreferences.targetRoles.some((targetRole) =>
    collectTechnicalRoleFamilies(targetRole).some((family) => postingFamilies.has(family)),
  );
}

function collectProfileSkillSignals(profile: CandidateProfile): string[] {
  return uniqueStrings([
    ...profile.skills,
    ...profile.skillGroups.coreSkills,
    ...profile.skillGroups.tools,
    ...profile.skillGroups.languagesAndFrameworks,
    ...profile.skillGroups.highlightedSkills,
    ...profile.experiences.flatMap((experience) => experience.skills),
    ...profile.projects.flatMap((project) => project.skills),
  ]);
}

function matchesTechnicalRoleFallback(input: {
  posting: JobPosting;
  postingEvidenceText?: string;
  searchPreferences: JobSearchPreferences;
  profile: CandidateProfile | null | undefined;
}): boolean {
  const { posting, profile, searchPreferences } = input;
  if (!hasTechnicalTargetRolePreference(searchPreferences)) {
    return false;
  }

  const postingEvidenceText = input.postingEvidenceText ?? buildPostingEvidenceText(posting);

  if (!matchesAdjacentTechnicalRoleSignal(postingEvidenceText)) {
    return false;
  }

  if (matchesAdjacentTechnicalRoleSignal(posting.title)) {
    return true;
  }

  if (matchesTitlePreference(postingEvidenceText, searchPreferences.targetRoles)) {
    return true;
  }

  if (hasTechnicalRoleFamilyOverlap({ postingEvidenceText, searchPreferences })) {
    return true;
  }

  if (countTechnicalRoleSignals(postingEvidenceText) >= 2) {
    return true;
  }

  if (!profile) {
    return false;
  }

  const profileSkillSignals = collectProfileSkillSignals(profile);
  if (profileSkillSignals.length === 0) {
    return true;
  }

  return matchesAnyPhrase(postingEvidenceText, profileSkillSignals);
}

function matchesRemoteFriendlyTechnicalLocationFallback(input: {
  posting: JobPosting;
  postingEvidenceText?: string;
  profile?: CandidateProfile | null | undefined;
  searchPreferences: JobSearchPreferences;
}): boolean {
  const { posting, searchPreferences } = input;
  if (!hasTechnicalTargetRolePreference(searchPreferences)) {
    return false;
  }

  const postingEvidenceText = input.postingEvidenceText ?? buildPostingEvidenceText(posting);
  if (
    !matchesTechnicalRoleFallback({
      posting,
      postingEvidenceText,
      profile: input.profile,
      searchPreferences,
    })
  ) {
    return false;
  }

  if (
    searchPreferences.workModes.length > 0 &&
    !searchPreferences.workModes.includes("flexible") &&
    !searchPreferences.workModes.includes("remote") &&
    !searchPreferences.workModes.includes("hybrid")
  ) {
    return false;
  }

  const normalizedLocation = normalizeText(posting.location);
  const locationLooksRemote =
    posting.workMode.includes("remote") ||
    posting.workMode.includes("hybrid") ||
    /\bremote\b|\bhybrid\b|\bworldwide\b|\banywhere\b|\bemea\b|\beurope\b/.test(
      normalizedLocation,
    );

  if (locationLooksRemote) {
    return true;
  }

  if (!normalizedLocation) {
    return true;
  }

  if (posting.workMode.length === 0) {
    return true;
  }

  return !posting.workMode.every((mode) => mode === "onsite");
}

export function selectLowYieldTechnicalFallbackPostings(input: {
  skippedPostings: readonly JobPosting[];
  searchPreferences: JobSearchPreferences;
  profile: CandidateProfile | null | undefined;
  limit?: number;
}): JobPosting[] {
  const { skippedPostings, searchPreferences, profile } = input;
  if (skippedPostings.length === 0) {
    return [];
  }

  if (!searchPreferences.targetRoles.some(matchesTechnicalRoleSignal)) {
    return [];
  }

  const profileSkillSignals = profile ? collectProfileSkillSignals(profile) : [];
  const rescueLimit = Math.max(1, input.limit ?? 6);

  return skippedPostings
    .flatMap((posting, index) => {
      if (
        posting.titleTriageOutcome !== "skip_title" &&
        posting.titleTriageOutcome !== "skip_location"
      ) {
        return [];
      }

      const postingEvidenceText = buildPostingEvidenceText(posting);
      const titleHasTechnicalSignal = matchesAdjacentTechnicalRoleSignal(posting.title);
      const evidenceHasTechnicalSignal = matchesAdjacentTechnicalRoleSignal(postingEvidenceText);
      const profileAlignedTechnicalRole = matchesTechnicalRoleFallback({
        posting,
        profile,
        searchPreferences,
      });

      if (!titleHasTechnicalSignal && !evidenceHasTechnicalSignal && !profileAlignedTechnicalRole) {
        return [];
      }

      const locationMatched = matchesLocationPreference(
        posting.location,
        searchPreferences.locations,
      );
      const remoteFriendlyLocation = matchesRemoteFriendlyTechnicalLocationFallback({
        posting,
        searchPreferences,
      });
      const titleMatched = matchesTitlePreference(
        posting.title,
        searchPreferences.targetRoles,
      );
      const profileSkillOverlap =
        profileSkillSignals.length > 0 &&
        matchesAnyPhrase(postingEvidenceText, profileSkillSignals);
      let priority = 0;

      if (posting.titleTriageOutcome === "skip_location") {
        priority += 6;
      }
      if (remoteFriendlyLocation) {
        priority += 5;
      }
      if (titleMatched) {
        priority += 4;
      }
      if (profileAlignedTechnicalRole) {
        priority += 4;
      }
      if (titleHasTechnicalSignal) {
        priority += 3;
      }
      if (evidenceHasTechnicalSignal) {
        priority += 2;
      }
      if (locationMatched) {
        priority += 2;
      }
      if (profileSkillOverlap) {
        priority += 1;
      }
      if (posting.easyApplyEligible) {
        priority += 1;
      }

      return [
        {
          index,
          priority,
          posting: JobPostingSchema.parse({
            ...posting,
            titleTriageOutcome: "pass",
          }),
        },
      ];
    })
    .sort((left, right) => right.priority - left.priority || left.index - right.index)
    .slice(0, rescueLimit)
    .map((entry) => entry.posting);
}
