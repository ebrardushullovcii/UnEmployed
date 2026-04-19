import {
  JobPostingSchema,
  SourceIntelligenceArtifactSchema,
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
import { matchesAnyPhrase } from "./matching";
import { normalizeText, uniqueStrings } from "./shared";

type GreenhouseJobPayload = {
  id: number | string;
  title?: string;
  absolute_url?: string;
  location?: { name?: string | null } | null;
  updated_at?: string | null;
  content?: string | null;
};

type LeverJobPayload = {
  id: string;
  text?: string;
  createdAt?: string | number | null;
  hostedUrl?: string;
  applyUrl?: string | null;
  descriptionPlain?: string | null;
  description?: string | null;
  categories?: {
    location?: string | null;
    team?: string | null;
    department?: string | null;
    commitment?: string | null;
  } | null;
};

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

function parseGreenhouseJobsResponse(value: unknown): { jobs: GreenhouseJobPayload[] } {
  if (!value || typeof value !== "object") {
    throw new Error("Greenhouse API returned an invalid payload.");
  }

  const jobsValue = (value as { jobs?: unknown }).jobs;
  if (jobsValue == null) {
    return { jobs: [] };
  }
  if (!Array.isArray(jobsValue)) {
    throw new Error("Greenhouse API returned an invalid payload.");
  }

  const jobs = jobsValue.map((job) => {
    if (!job || typeof job !== "object") {
      throw new Error("Greenhouse API returned an invalid payload.");
    }

    const record = job as Record<string, unknown>;
    const locationValue = record.location;
    const parsedLocationName =
      typeof locationValue === "object" && locationValue !== null
        ? parseNullableString((locationValue as Record<string, unknown>).name)
        : null;
    const payload: GreenhouseJobPayload = {
      id: typeof record.id === "number" || typeof record.id === "string" ? record.id : "",
    };
    const parsedTitle = parseOptionalString(record.title);
    const parsedAbsoluteUrl = parseOptionalString(record.absolute_url);
    const parsedUpdatedAt = parseNullableString(record.updated_at);
    const parsedContent = parseNullableString(record.content);

    if (parsedTitle) {
      payload.title = parsedTitle.value;
    }
    if (parsedAbsoluteUrl) {
      payload.absolute_url = parsedAbsoluteUrl.value;
    }
    if (locationValue == null) {
      payload.location = null;
    } else if (typeof locationValue === "object") {
      payload.location = parsedLocationName ? { name: parsedLocationName.value } : {};
    }
    if (parsedUpdatedAt) {
      payload.updated_at = parsedUpdatedAt.value;
    }
    if (parsedContent) {
      payload.content = parsedContent.value;
    }

    return payload;
  });

  return { jobs };
}

function parseLeverJobsResponse(value: unknown): { jobs: LeverJobPayload[] } {
  if (!Array.isArray(value)) {
    throw new Error("Lever API returned an invalid payload.");
  }

  const jobs = value.map((job) => {
    if (!job || typeof job !== "object") {
      throw new Error("Lever API returned an invalid payload.");
    }

    const record = job as Record<string, unknown>;
    const categoriesValue = record.categories;
    const payload: LeverJobPayload = {
      id: typeof record.id === "string" ? record.id : "",
    };
    const parsedText = parseOptionalString(record.text);
    const parsedCreatedAt = parseNullableStringOrNumber(record.createdAt);
    const parsedHostedUrl = parseOptionalString(record.hostedUrl);
    const parsedApplyUrl = parseNullableString(record.applyUrl);
    const parsedDescriptionPlain = parseNullableString(record.descriptionPlain);
    const parsedDescription = parseNullableString(record.description);

    if (parsedText) {
      payload.text = parsedText.value;
    }
    if (parsedCreatedAt) {
      payload.createdAt = parsedCreatedAt.value;
    }
    if (parsedHostedUrl) {
      payload.hostedUrl = parsedHostedUrl.value;
    }
    if (parsedApplyUrl) {
      payload.applyUrl = parsedApplyUrl.value;
    }
    if (parsedDescriptionPlain) {
      payload.descriptionPlain = parsedDescriptionPlain.value;
    }
    if (parsedDescription) {
      payload.description = parsedDescription.value;
    }
    if (categoriesValue == null) {
      payload.categories = null;
    } else if (typeof categoriesValue === "object") {
      const categoryRecord = categoriesValue as Record<string, unknown>;
      const parsedLocation = parseNullableString(categoryRecord.location);
      const parsedTeam = parseNullableString(categoryRecord.team);
      const parsedDepartment = parseNullableString(categoryRecord.department);
      const parsedCommitment = parseNullableString(categoryRecord.commitment);

      payload.categories = {
        ...(parsedLocation ? { location: parsedLocation.value } : {}),
        ...(parsedTeam ? { team: parsedTeam.value } : {}),
        ...(parsedDepartment ? { department: parsedDepartment.value } : {}),
        ...(parsedCommitment ? { commitment: parsedCommitment.value } : {}),
      };
    }

    return payload;
  });

  return { jobs };
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

function parseGreenhouseToken(url: URL): string | null {
  if (!url.hostname.includes("greenhouse")) {
    return null;
  }

  const parts = url.pathname.split("/").filter(Boolean);
  if (url.hostname.startsWith("boards.greenhouse.io")) {
    return parts[0] ?? null;
  }
  if (url.hostname.startsWith("job-boards.greenhouse.io")) {
    return parts[0] ?? null;
  }
  return null;
}

function parseLeverSite(url: URL): string | null {
  if (!url.hostname.includes("lever.co")) {
    return null;
  }

  return url.pathname.split("/").filter(Boolean)[0] ?? null;
}

function detectProvider(target: JobDiscoveryTarget, urls: readonly string[]) {
  const parsedUrls = [target.startingUrl, ...urls].flatMap((value) => {
    const parsed = tryParseUrl(value);
    return parsed ? [parsed] : [];
  });

  for (const parsedUrl of parsedUrls) {
    const greenhouseToken = parseGreenhouseToken(parsedUrl);
    if (greenhouseToken) {
      return {
        key: "greenhouse" as const,
        label: "Greenhouse",
        confidence: 0.95,
        apiAvailability: "available" as const,
        publicApiUrlTemplate: `https://boards-api.greenhouse.io/v1/boards/${greenhouseToken}/jobs?content=true`,
        boardToken: greenhouseToken,
        boardSlug: null,
        providerIdentifier: greenhouseToken,
      };
    }

    const leverSite = parseLeverSite(parsedUrl);
    if (leverSite) {
      return {
        key: "lever" as const,
        label: "Lever",
        confidence: 0.95,
        apiAvailability: "available" as const,
        publicApiUrlTemplate: `https://api.lever.co/v0/postings/${leverSite}?mode=json`,
        boardToken: null,
        boardSlug: leverSite,
        providerIdentifier: leverSite,
      };
    }

    const hostname = parsedUrl.hostname.toLowerCase();
    if (hostname.includes("linkedin.com")) {
      return {
        key: "linkedin" as const,
        label: "LinkedIn Jobs",
        confidence: 0.98,
        apiAvailability: "not_supported" as const,
        publicApiUrlTemplate: null,
        boardToken: null,
        boardSlug: null,
        providerIdentifier: "linkedin_jobs",
      };
    }
    if (hostname.includes("ashby")) {
      return {
        key: "ashby" as const,
        label: "Ashby",
        confidence: 0.85,
        apiAvailability: "unconfirmed" as const,
        publicApiUrlTemplate: null,
        boardToken: null,
        boardSlug: null,
        providerIdentifier: hostname,
      };
    }
    if (hostname.includes("myworkdayjobs.com") || hostname.includes("workday")) {
      return {
        key: "workday" as const,
        label: "Workday",
        confidence: 0.84,
        apiAvailability: "not_supported" as const,
        publicApiUrlTemplate: null,
        boardToken: null,
        boardSlug: null,
        providerIdentifier: hostname,
      };
    }
    if (hostname.includes("icims")) {
      return {
        key: "icims" as const,
        label: "iCIMS",
        confidence: 0.82,
        apiAvailability: "not_supported" as const,
        publicApiUrlTemplate: null,
        boardToken: null,
        boardSlug: null,
        providerIdentifier: hostname,
      };
    }
  }

  return null;
}

function inferRouteKind(url: string) {
  const normalized = normalizeText(url);
  if (normalized.includes("search") || normalized.includes("filter")) {
    return "search" as const;
  }
  if (normalized.includes("collection") || normalized.includes("recommended")) {
    return "collection" as const;
  }
  if (normalized.includes("apply")) {
    return "apply" as const;
  }
  if (normalized.includes("job") || normalized.includes("career")) {
    return "listing" as const;
  }
  return "anchor" as const;
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
    ...(input.currentArtifact?.intelligence.collection.startingRoutes ?? []),
    ...discoveredUrls.map((url) => ({
      url,
      label: "Observed route",
      kind: inferRouteKind(url),
      confidence: 0.84,
    })),
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
): string[] {
  if (!artifact) {
    return [target.startingUrl];
  }

  const routes = uniqueStrings([
    target.startingUrl,
    ...(artifact.intelligence.overrides.extraStartingRoutes ?? []),
    ...artifact.intelligence.collection.startingRoutes.map((route) => route.url),
    ...artifact.intelligence.collection.searchRouteTemplates.map((route) => route.url),
  ]);

  return routes.length > 0 ? routes : [target.startingUrl];
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
    if (
      provider.key === "greenhouse" &&
      provider.boardToken &&
      provider.publicApiUrlTemplate
    ) {
      const timeout = createProviderApiTimeoutSignal();
      const composedSignal = composeAbortSignals(timeout.signal, input.signal);

      try {
        const response = await fetch(provider.publicApiUrlTemplate, {
          signal: composedSignal.signal,
        });
        if (!response.ok) {
          throw new Error(`Greenhouse API returned ${response.status}.`);
        }

        const payload = parseGreenhouseJobsResponse(await response.json());

        return {
          jobs: (payload.jobs ?? []).flatMap((job) => {
            if (!job.id || !job.title || !job.absolute_url) {
              return [];
            }

            const description = htmlToText(job.content);
            return [
              JobPostingSchema.parse({
                source: input.source,
                sourceJobId: String(job.id),
                discoveryMethod: "public_api",
                collectionMethod: "api",
                canonicalUrl: job.absolute_url,
                applicationUrl: job.absolute_url,
                title: job.title,
                company: input.target.label,
                location: job.location?.name?.trim() || "Unknown",
                workMode: inferWorkModes(job.location?.name),
                applyPath: "external_redirect",
                easyApplyEligible: false,
                postedAt: normalizeProviderDateTime(job.updated_at),
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
                employmentType: null,
                department: null,
                team: null,
                employerWebsiteUrl: null,
                employerDomain: tryParseUrl(job.absolute_url)?.hostname ?? null,
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

    if (
      provider.key === "lever" &&
      provider.providerIdentifier &&
      provider.publicApiUrlTemplate
    ) {
      const timeout = createProviderApiTimeoutSignal();
      const composedSignal = composeAbortSignals(timeout.signal, input.signal);

      try {
        const response = await fetch(provider.publicApiUrlTemplate, {
          signal: composedSignal.signal,
        });
        if (!response.ok) {
          throw new Error(`Lever API returned ${response.status}.`);
        }

        const payload = parseLeverJobsResponse(await response.json());

        return {
          jobs: payload.jobs.flatMap((job) => {
            if (!job.id || !job.text || !job.hostedUrl) {
              return [];
            }

            const description = htmlToText(job.descriptionPlain ?? job.description);
            return [
              JobPostingSchema.parse({
                source: input.source,
                sourceJobId: job.id,
                discoveryMethod: "public_api",
                collectionMethod: "api",
                canonicalUrl: job.hostedUrl,
                applicationUrl: job.applyUrl ?? job.hostedUrl,
                title: job.text,
                company: input.target.label,
                location: job.categories?.location?.trim() || "Unknown",
                workMode: inferWorkModes(job.categories?.location),
                applyPath: "external_redirect",
                easyApplyEligible: false,
                postedAt: normalizeProviderDateTime(job.createdAt),
                postedAtText: null,
                discoveredAt: new Date().toISOString(),
                salaryText: null,
                summary: description.slice(0, SUMMARY_MAX_LENGTH) || null,
                description: description || job.text,
                keySkills: [],
                responsibilities: [],
                minimumQualifications: [],
                preferredQualifications: [],
                seniority: null,
                employmentType: job.categories?.commitment ?? null,
                department: job.categories?.department ?? null,
                team: job.categories?.team ?? null,
                employerWebsiteUrl: null,
                employerDomain: tryParseUrl(job.hostedUrl)?.hostname ?? null,
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
}) {
  const { posting, searchPreferences } = input;
  const normalizedCompany = normalizeText(posting.company);

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
    !matchesAnyPhrase(posting.title, searchPreferences.targetRoles)
  ) {
    return {
      outcome: "skip_title" as const,
      reason: "Title is outside the current target roles.",
    };
  }

  if (
    searchPreferences.locations.length > 0 &&
    !matchesAnyPhrase(posting.location, searchPreferences.locations)
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
