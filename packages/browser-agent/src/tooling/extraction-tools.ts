import type { ToolDefinition } from "../types";
import { z } from "zod";
import { ExtractJobsSchema } from "./shared";
import {
  isSearchResultsSurfaceRoute,
  scoreSearchResultCardForPreferences,
  scoreSearchResultCardTitleForPreferences,
  shouldCanonicalizeSearchSurfaceDetailRoute,
  type ExtractionSearchPreferences,
} from "../agent/job-extraction";
import { SEARCH_SURFACE_ROUTE_RULES } from "../agent/search-surface-routes";

interface StructuredDataJobCandidate {
  canonicalUrl?: string | null;
  sourceJobId?: string | null;
  title?: string | null;
  company?: string | null;
  location?: string | null;
  description?: string | null;
  summary?: string | null;
  postedAt?: string | null;
  postedAtText?: string | null;
  salaryText?: string | null;
  workMode?: string[] | null;
  applyPath?: "easy_apply" | "external_redirect" | "unknown" | null;
  easyApplyEligible?: boolean | null;
  keySkills?: string[] | null;
  responsibilities?: string[] | null;
  minimumQualifications?: string[] | null;
  preferredQualifications?: string[] | null;
  seniority?: string | null;
  employmentType?: string | null;
  department?: string | null;
  team?: string | null;
  employerWebsiteUrl?: string | null;
  employerDomain?: string | null;
  benefits?: string[] | null;
}

interface SearchResultCardCandidate {
  canonicalUrl: string;
  anchorText: string;
  headingText: string | null;
  lines: string[];
  sourceJobIdHint?: string | null;
  captureMeta?: SearchResultCardCaptureMeta | null;
}

interface SearchResultCardCaptureMeta {
  domOrder: number;
  rootTagName: string | null;
  rootRole: string | null;
  rootClassName: string | null;
  hasJobDataset: boolean;
  sameRootJobAnchorCount: number;
  inLikelyResultsList: boolean;
  inAside: boolean;
  inHeader: boolean;
  inNavigation: boolean;
  inDetailPane: boolean;
  hasDismissLabel: boolean;
  isVisible?: boolean;
  intersectsViewport?: boolean;
  viewportTop?: number | null;
  viewportDistance?: number | null;
}

const MAX_IN_PAGE_CARD_CANDIDATES = 160;
type RawSearchResultCardCandidate = SearchResultCardCandidate;

const StructuredDataCandidateSchema = z.object({
  canonicalUrl: z.string().optional().nullable(),
  sourceJobId: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
  company: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  summary: z.string().optional().nullable(),
  postedAt: z.string().optional().nullable(),
  postedAtText: z.string().optional().nullable(),
  salaryText: z.string().optional().nullable(),
  workMode: z.array(z.string()).optional().nullable(),
  applyPath: z.enum(["easy_apply", "external_redirect", "unknown"]).optional().nullable(),
  easyApplyEligible: z.boolean().optional().nullable(),
  keySkills: z.array(z.string()).optional().nullable(),
  responsibilities: z.array(z.string()).optional().nullable(),
  minimumQualifications: z.array(z.string()).optional().nullable(),
  preferredQualifications: z.array(z.string()).optional().nullable(),
  seniority: z.string().optional().nullable(),
  employmentType: z.string().optional().nullable(),
  department: z.string().optional().nullable(),
  team: z.string().optional().nullable(),
  employerWebsiteUrl: z.string().optional().nullable(),
  employerDomain: z.string().optional().nullable(),
  benefits: z.array(z.string()).optional().nullable(),
});

const CardCaptureMetaSchema = z.object({
  domOrder: z.number(),
  rootTagName: z.string().nullable(),
  rootRole: z.string().nullable(),
  rootClassName: z.string().nullable(),
  hasJobDataset: z.boolean(),
  sameRootJobAnchorCount: z.number(),
  inLikelyResultsList: z.boolean(),
  inAside: z.boolean(),
  inHeader: z.boolean(),
  inNavigation: z.boolean(),
  inDetailPane: z.boolean(),
  hasDismissLabel: z.boolean(),
  isVisible: z.boolean().optional(),
  intersectsViewport: z.boolean().optional(),
  viewportTop: z.number().nullable().optional(),
  viewportDistance: z.number().nullable().optional(),
});

const RawSearchResultCardCandidateSchema = z.object({
  canonicalUrl: z.string(),
  anchorText: z.string(),
  headingText: z.string().nullable(),
  lines: z.array(z.string()),
  sourceJobIdHint: z.string().optional().nullable(),
  captureMeta: CardCaptureMetaSchema.optional().nullable(),
});

function normalizeStructuredExtractionPayload(value: unknown): {
  structuredDataCandidates: StructuredDataJobCandidate[];
  cardCandidates: RawSearchResultCardCandidate[];
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      structuredDataCandidates: [],
      cardCandidates: [],
    };
  }

  const candidate = value as {
    structuredDataCandidates?: unknown;
    cardCandidates?: unknown;
  };

  const structuredDataCandidates = Array.isArray(candidate.structuredDataCandidates)
    ? candidate.structuredDataCandidates.flatMap((entry) => {
        const result = StructuredDataCandidateSchema.safeParse(entry);
        return result.success ? [result.data as StructuredDataJobCandidate] : [];
      })
    : [];
  const cardCandidates = Array.isArray(candidate.cardCandidates)
    ? candidate.cardCandidates.flatMap((entry) => {
        const result = RawSearchResultCardCandidateSchema.safeParse(entry);
        return result.success ? [result.data as RawSearchResultCardCandidate] : [];
      })
    : [];

  return {
    structuredDataCandidates,
    cardCandidates,
  };
}

const RESULTS_LIST_CLASS_HINTS = [
  "jobs-search-results",
  "jobs-search-results-list",
  "jobs-search-two-pane",
  "scaffold-layout__list",
  "scaffold-layout__content",
  "job-card-container",
  "job-card-list",
] as const;

const DETAIL_PANE_CLASS_HINTS = [
  "jobs-search__job-details",
  "jobs-search-two-pane__details",
  "job-details",
  "jobs-details",
  "job-view-layout",
] as const;
const SEARCH_SURFACE_CAPTURE_SCORE_WEIGHT = 25;
const SEARCH_SURFACE_TITLE_DOMINANCE_THRESHOLD = 20;
const MAX_SEARCH_SURFACE_PRIORITIZED_CARD_CANDIDATES = 96;
const MAX_GENERIC_PRIORITIZED_CARD_CANDIDATES = 24;
const TECHNICAL_CARD_SIGNAL_PATTERN =
  /\b(full[-\s]?stack|software|engineer|developer|frontend|front[-\s]?end|backend|back[-\s]?end|react|node|typescript|javascript|\.net|dotnet|c#|csharp|python|java|devops|platform|sre|qa automation|mobile|android|ios)\b/i;

function scoreGenericCardCandidate(candidate: RawSearchResultCardCandidate): number {
  const headingLength = cleanCardText(candidate.headingText).length;
  const anchorLength = cleanCardText(candidate.anchorText).length;
  const lineLength = candidate.lines.join(' ').length;
  const likelyJobSignal = /\b(engineer|developer|designer|analyst|manager|specialist|qa|devops|platform|software|fullstack|full stack|react|node|typescript|dotnet|python|java|data)\b/i.test(
    [candidate.anchorText, candidate.headingText, ...candidate.lines].join(' '),
  )
    ? 180
    : 0;

  return scoreRawCardCandidateQuality(candidate) + headingLength * 3 + anchorLength * 2 + lineLength / 2 + likelyJobSignal;
}

function cleanCardText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function uniqueCardStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();

  return values.flatMap((value) => {
    const normalized = cleanCardText(value);
    if (!normalized) {
      return [];
    }

    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      return [];
    }

    seen.add(key);
    return [normalized];
  });
}

function buildExtractedCardFingerprint(candidate: SearchResultCardCandidate): string {
  const fingerprint = uniqueCardStrings(
    [candidate.anchorText, candidate.headingText, ...candidate.lines]
      .filter((value): value is string => Boolean(value))
      .map((value) => cleanCardText(value).toLowerCase()),
  )
    .join(' ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120);

  return fingerprint || 'candidate';
}

export function buildExtractedCardCandidateMergeKey(
  pageUrl: string,
  candidate: SearchResultCardCandidate,
): string {
  const canonicalUrl = cleanCardText(candidate.canonicalUrl);
  if (!canonicalUrl) {
    return buildExtractedCardFingerprint(candidate);
  }

  if (
    isSearchResultsSurfaceRoute(canonicalUrl, pageUrl) &&
    !shouldCanonicalizeSearchSurfaceDetailRoute({ pageUrl, candidate })
  ) {
    return `${canonicalUrl}::card:${buildExtractedCardFingerprint(candidate)}`;
  }

  return canonicalUrl;
}

function scoreRawCardCandidateQuality(candidate: RawSearchResultCardCandidate): number {
  const linesScore = candidate.lines.join(' ').length;
  const anchorScore = candidate.anchorText.length * 4;
  const headingScore = cleanCardText(candidate.headingText).length * 3;
  const dismissScore = candidate.lines.some((line) => /\bdismiss\b.*\bjob\b/i.test(line))
    ? 60
    : 0;

  return linesScore + anchorScore + headingScore + dismissScore;
}

function scoreSearchSurfaceCardCaptureMeta(meta: SearchResultCardCaptureMeta | null | undefined): number {
  if (!meta) {
    return 0;
  }

  let score = 0;

  if (meta.hasJobDataset) {
    score += 180;
  }

  if (meta.inLikelyResultsList) {
    score += 120;
  }

  if (includesClassHint(meta.rootClassName, RESULTS_LIST_CLASS_HINTS)) {
    score += 90;
  }

  if (meta.hasDismissLabel) {
    score += 70;
  }

  if (meta.intersectsViewport) {
    score += 420;
  } else if (meta.isVisible) {
    score += 80;
  }

  if (meta.sameRootJobAnchorCount <= 1) {
    score += 20;
  } else if (meta.sameRootJobAnchorCount >= 4) {
    score -= 80;
  }

  const viewportTop =
    typeof meta.viewportTop === 'number' && Number.isFinite(meta.viewportTop)
      ? meta.viewportTop
      : null;
  if (viewportTop !== null) {
    if (viewportTop >= -48 && viewportTop <= 560) {
      score += 120;
    } else if (viewportTop > 560) {
      score -= Math.min(viewportTop - 560, 1600) / 8;
    } else if (viewportTop < -120) {
      score -= Math.min(Math.abs(viewportTop) - 120, 800) / 10;
    }
  }

  const viewportDistance =
    typeof meta.viewportDistance === 'number' && Number.isFinite(meta.viewportDistance)
      ? Math.max(0, meta.viewportDistance)
      : null;
  if (viewportDistance !== null) {
    score -= Math.min(viewportDistance, 1600) / 4;
  }

  if (meta.inDetailPane) {
    score -= 140;
  }

  if (includesClassHint(meta.rootClassName, DETAIL_PANE_CLASS_HINTS)) {
    score -= 120;
  }

  if (meta.inAside) {
    score -= 180;
  }

  if (meta.inHeader) {
    score -= 140;
  }

  if (meta.inNavigation) {
    score -= 180;
  }

  return Math.round(score);
}

function selectPreferredCaptureMeta(
  current: SearchResultCardCaptureMeta | null | undefined,
  next: SearchResultCardCaptureMeta | null | undefined,
): SearchResultCardCaptureMeta | null | undefined {
  if (!current) {
    return next;
  }

  if (!next) {
    return current;
  }

  const scoreDelta = scoreSearchSurfaceCardCaptureMeta(next) - scoreSearchSurfaceCardCaptureMeta(current);
  if (scoreDelta !== 0) {
    return scoreDelta > 0 ? next : current;
  }

  return (next.domOrder ?? Number.MAX_SAFE_INTEGER) <
    (current.domOrder ?? Number.MAX_SAFE_INTEGER)
    ? next
    : current;
}

function mergeRawCardCandidate(
  current: RawSearchResultCardCandidate | undefined,
  next: RawSearchResultCardCandidate,
): RawSearchResultCardCandidate {
  if (!current) {
    return next;
  }

  const preferredCaptureMeta = selectPreferredCaptureMeta(
    current.captureMeta,
    next.captureMeta,
  );
  const merged: RawSearchResultCardCandidate = {
    canonicalUrl: current.canonicalUrl,
    anchorText:
      cleanCardText(next.anchorText).length > cleanCardText(current.anchorText).length
        ? next.anchorText
        : current.anchorText,
    headingText:
      cleanCardText(next.headingText).length > cleanCardText(current.headingText).length
        ? next.headingText
        : current.headingText,
    lines: uniqueCardStrings([...current.lines, ...next.lines]).slice(0, 12),
    ...((cleanCardText(next.sourceJobIdHint).length > cleanCardText(current.sourceJobIdHint).length
      ? next.sourceJobIdHint !== undefined
        ? { sourceJobIdHint: next.sourceJobIdHint }
        : {}
      : current.sourceJobIdHint !== undefined
        ? { sourceJobIdHint: current.sourceJobIdHint }
        : {})),
    ...((preferredCaptureMeta !== undefined
      ? { captureMeta: preferredCaptureMeta }
      : {})),
  };

  return scoreRawCardCandidateQuality(merged) >= scoreRawCardCandidateQuality(current)
    ? merged
    : current;
}

export function dedupeExtractedCardCandidates(
  pageUrl: string,
  candidates: readonly RawSearchResultCardCandidate[],
): RawSearchResultCardCandidate[] {
  const candidatesByKey = new Map<string, RawSearchResultCardCandidate>();

  for (const candidate of candidates) {
    const mergeKey = buildExtractedCardCandidateMergeKey(pageUrl, candidate);
    candidatesByKey.set(
      mergeKey,
      mergeRawCardCandidate(candidatesByKey.get(mergeKey), candidate),
    );
  }

  return [...candidatesByKey.values()];
}

export function shouldUseSearchSurfaceJobViewCardCapture(pageUrl: string): boolean {
  return isSearchResultsSurfaceRoute(pageUrl, pageUrl);
}

function includesClassHint(value: string | null | undefined, hints: readonly string[]): boolean {
  const normalized = (value ?? "").toLowerCase();
  return hints.some((hint) => normalized.includes(hint));
}

function scoreSearchSurfaceCardCaptureCandidate(candidate: RawSearchResultCardCandidate): number {
  let score = scoreSearchSurfaceCardCaptureMeta(candidate.captureMeta);
  const text = [candidate.anchorText, candidate.headingText, ...candidate.lines]
    .filter((value): value is string => typeof value === 'string')
    .join(' ');

  score += Math.min(candidate.lines.length, 8) * 6;
  score += Math.min(candidate.anchorText.length, 120);
  score += Math.min((candidate.headingText ?? "").length, 80);
  if (TECHNICAL_CARD_SIGNAL_PATTERN.test(text)) {
    score += 220;
  }

  return score;
}

export function prioritizeExtractedCardCandidates(
  pageUrl: string,
  candidates: readonly SearchResultCardCandidate[],
  searchPreferences?: ExtractionSearchPreferences,
): SearchResultCardCandidate[] {
  const dedupedCandidates = dedupeExtractedCardCandidates(pageUrl, candidates);
  const preferenceScoreCache = new Map<string, number>();
  const titleScoreCache = new Map<string, number>();
  const getCandidateKey = (candidate: SearchResultCardCandidate): string =>
    buildExtractedCardCandidateMergeKey(pageUrl, candidate);
  const getPreferenceScore = (candidate: SearchResultCardCandidate): number => {
    const cacheKey = getCandidateKey(candidate);
    const cached = preferenceScoreCache.get(cacheKey);
    if (cached != null) {
      return cached;
    }

    const nextScore = scoreSearchResultCardForPreferences({
      pageUrl,
      candidate,
      ...(searchPreferences ? { searchPreferences } : {}),
    });
    preferenceScoreCache.set(cacheKey, nextScore);
    return nextScore;
  };
  const getTitleScore = (candidate: SearchResultCardCandidate): number => {
    const cacheKey = getCandidateKey(candidate);
    const cached = titleScoreCache.get(cacheKey);
    if (cached != null) {
      return cached;
    }

    const nextScore = scoreSearchResultCardTitleForPreferences({
      pageUrl,
      candidate,
      ...(searchPreferences ? { searchPreferences } : {}),
    });
    titleScoreCache.set(cacheKey, nextScore);
    return nextScore;
  };

  if (!shouldUseSearchSurfaceJobViewCardCapture(pageUrl)) {
    return [...dedupedCandidates]
      .sort((left, right) => scoreGenericCardCandidate(right) - scoreGenericCardCandidate(left))
      .slice(0, MAX_GENERIC_PRIORITIZED_CARD_CANDIDATES);
  }

  return [...dedupedCandidates]
    .sort((left, right) => {
      const rightPreferenceScore = getPreferenceScore(right);
      const leftPreferenceScore = getPreferenceScore(left);
      if (searchPreferences) {
        const rightTitleScore = getTitleScore(right);
        const leftTitleScore = getTitleScore(left);
        const titleScoreDelta = rightTitleScore - leftTitleScore;
        if (Math.abs(titleScoreDelta) >= SEARCH_SURFACE_TITLE_DOMINANCE_THRESHOLD) {
          return titleScoreDelta;
        }
      }

      const rightCaptureScore = scoreSearchSurfaceCardCaptureCandidate(right);
      const leftCaptureScore = scoreSearchSurfaceCardCaptureCandidate(left);
      const combinedScoreDelta =
        rightPreferenceScore + rightCaptureScore * SEARCH_SURFACE_CAPTURE_SCORE_WEIGHT -
        (leftPreferenceScore + leftCaptureScore * SEARCH_SURFACE_CAPTURE_SCORE_WEIGHT);
      if (combinedScoreDelta !== 0) {
        return combinedScoreDelta;
      }

      const preferenceScoreDelta = rightPreferenceScore - leftPreferenceScore;
      if (preferenceScoreDelta !== 0) {
        return preferenceScoreDelta;
      }

      const scoreDelta = rightCaptureScore - leftCaptureScore;
      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      const leftDomOrder = left.captureMeta?.domOrder ?? Number.MAX_SAFE_INTEGER;
      const rightDomOrder = right.captureMeta?.domOrder ?? Number.MAX_SAFE_INTEGER;
      if (leftDomOrder !== rightDomOrder) {
        return leftDomOrder - rightDomOrder;
      }

      return right.lines.join(" ").length - left.lines.join(" ").length;
    })
    .slice(0, MAX_SEARCH_SURFACE_PRIORITIZED_CARD_CANDIDATES);
}

export const extractionTools: ToolDefinition[] = [
  {
    name: "extract_jobs",
    retryable: true,
    description: `Extract job postings from the current page.
    
This analyzes the page content and extracts structured job data including titles, companies, locations, and descriptions.

Use this when you're on:
- Job search results pages
- Company job listing pages
- Individual job detail pages

Returns the extracted jobs and advises whether you should scroll for more or navigate to see details.`,
    parameters: {
      type: "object",
      properties: {
        pageType: { type: "string", enum: ["search_results", "job_detail", "company_page", "unknown"], description: "What type of page you think this is" },
        maxJobs: { type: "number", description: "Maximum jobs to extract from this page (default: 5)", default: 5 },
      },
      required: ["pageType"],
    },
    execute: async (args, context) => {
      const parseResult = ExtractJobsSchema.safeParse(args);
      if (!parseResult.success) return { success: false, error: `Invalid extract_jobs arguments: ${parseResult.error.issues.map((i) => i.message).join(", ")}` };
      const { pageType, maxJobs } = parseResult.data;
      const { page } = context;

      try {
        const pageText = await page.locator("body").innerText();
        const pageUrl = page.url();
        const pageTextLength = pageText.length;
        const relevantUrlSubstrings = context.config.extractionContext?.relevantUrlSubstrings ?? [];
        const discoveredUrls = await page.evaluate(
          (input: { allowedHostnames: string[]; relevantUrlSubstrings: string[]; allowSubdomains: boolean }) => {
            const urls = new Set<string>();
            for (const anchor of Array.from(document.querySelectorAll("a[href]"))) {
              const href = anchor.getAttribute("href");
              if (!href) continue;
              try {
                const absoluteUrl = new URL(href, window.location.href).toString();
                const parsedUrl = new URL(absoluteUrl);
                const canonicalUrl = `${parsedUrl.origin}${parsedUrl.pathname}`;
                const hostname = parsedUrl.hostname.toLowerCase();
                const hostAllowed = input.allowedHostnames.some((allowedHostname) => hostname === allowedHostname || (input.allowSubdomains && hostname.endsWith(`.${allowedHostname}`)));
                if (!hostAllowed) continue;
                const haystack = `${parsedUrl.pathname}${parsedUrl.search}`.toLowerCase();
                const matchesRelevantUrl = input.relevantUrlSubstrings.length === 0 || input.relevantUrlSubstrings.some((substring) => haystack.includes(substring.toLowerCase()));
                if (matchesRelevantUrl) urls.add(canonicalUrl);
              } catch {
                // Ignore invalid href values.
              }
            }
            return Array.from(urls).slice(0, 30);
          },
          {
            allowedHostnames: context.config.navigationPolicy.allowedHostnames.map((hostname) => hostname.toLowerCase()),
            relevantUrlSubstrings,
            allowSubdomains: context.config.navigationPolicy.allowSubdomains === true,
          },
        );

        const MAX_PAGE_TEXT_CHARS = 8000;
        const urlAppendix = discoveredUrls.length > 0 ? `\n\nRelevant in-scope URLs found on page:\n${discoveredUrls.map((url) => `- ${url}`).join("\n")}` : "";
        const truncationNotice = "\n... [content truncated]";
        const pageTextBudget = Math.max(0, MAX_PAGE_TEXT_CHARS - urlAppendix.length);
        const pageTextTruncated = pageText.length + urlAppendix.length > MAX_PAGE_TEXT_CHARS;
        const truncatedPageText = pageTextTruncated ? `${pageText.slice(0, Math.max(0, pageTextBudget - truncationNotice.length))}${truncationNotice}${urlAppendix}` : `${pageText}${urlAppendix}`;
        const extractionTextLength = pageText.length + urlAppendix.length;

        const hasMinimumContent = pageTextLength > 500;
        const loadingPatterns = [/loading\.\.\./i, /loading\s*$/im, /^loading$/im, /please wait/i, /please wait\.\.\./i, /spinner/i, /fetching/i, /retrieving/i];
        const hasNoLoadingIndicators = !loadingPatterns.some((pattern) => pattern.test(pageText));
        const lowerText = pageText.toLowerCase();
        let hasJobContent = false;

        if (pageType === "search_results") {
          hasJobContent = ["job", "jobs", "position", "positions", "apply", "career", "careers", "opening", "openings", "vacancy", "vacancies", "role", "roles", "konkurs", "pune", "punes", "punesim", "punetor", "pozit", "pozita", "pozite", "karriere", "karrier", "apliko", "aplikim", "vende te lira", "vende pune"].some((keyword) => lowerText.includes(keyword));
        } else if (pageType === "job_detail" || pageType === "company_page") {
          hasJobContent = ["description", "requirements", "qualifications", "responsibilities", "career", "careers", "openings", "hiring", "job", "position", "apply", "pershkrim", "detyr", "kualifik", "kerkes", "kerkesa", "pergjegjes", "pergjegjesi", "apliko", "konkurs", "pune", "pozit", "karriere", "orari"].some((keyword) => lowerText.includes(keyword));
        } else {
          hasJobContent = pageTextLength > 1000;
        }

        const readyForExtraction = hasMinimumContent && hasNoLoadingIndicators && hasJobContent;

        const structuredCandidates = normalizeStructuredExtractionPayload(await page.evaluate(
          (input: {
            allowedHostnames: string[];
            relevantUrlSubstrings: string[];
            allowSubdomains: boolean;
            preferSearchSurfaceJobViewCardCapture: boolean;
            maxInPageCardCandidates: number;
            searchSurfaceRouteRules: Array<{
              hostSuffixes: string[];
              resultExactPaths: string[];
              resultPathPrefixes: string[];
              detailPathPrefix: string;
              detailPathTemplate: string;
              embeddedJobIdParams: string[];
            }>;
          }) => {
            const toText = (value: unknown): string =>
              typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
            const uniqueStrings = (values: readonly string[]): string[] => {
              const seen = new Set<string>();
              return values.flatMap((value) => {
                const normalized = toText(value);
                if (!normalized) {
                  return [];
                }
                const key = normalized.toLowerCase();
                if (seen.has(key)) {
                  return [];
                }
                seen.add(key);
                return [normalized];
              });
            };
            const findSearchSurfaceRouteRuleForHostname = (hostname: string) =>
              input.searchSurfaceRouteRules.find((rule) => {
                const normalizedHostname = hostname.toLowerCase();
                return rule.hostSuffixes.some(
                  (hostSuffix) =>
                    normalizedHostname === hostSuffix ||
                    normalizedHostname.endsWith(`.${hostSuffix}`),
                );
              }) ?? null;
            const findSearchSurfaceRouteRuleForUrl = (value: string) => {
              try {
                const parsed = new URL(value, window.location.href);
                return findSearchSurfaceRouteRuleForHostname(parsed.hostname);
              } catch {
                return null;
              }
            };
            const isSearchSurfaceResultPath = (
              rule: NonNullable<ReturnType<typeof findSearchSurfaceRouteRuleForHostname>>,
              pathname: string,
            ): boolean =>
              rule.resultExactPaths.includes(pathname) ||
              rule.resultPathPrefixes.some((prefix) => pathname.startsWith(prefix));
            const readEmbeddedSearchSurfaceJobId = (
              url: URL,
              rule: NonNullable<ReturnType<typeof findSearchSurfaceRouteRuleForHostname>>,
            ): string =>
              toText(
                rule.embeddedJobIdParams
                  .map((paramName) => url.searchParams.get(paramName))
                  .find((value) => toText(value)) ?? null,
              );
            const buildSearchSurfaceDetailUrl = (
              rule: NonNullable<ReturnType<typeof findSearchSurfaceRouteRuleForHostname>>,
              sourceJobId: string,
            ): string =>
              `${window.location.origin}${rule.detailPathTemplate.replace('{sourceJobId}', sourceJobId)}`;
            const buildSearchSurfaceAnchorSelector = (): string =>
              uniqueStrings(
                input.searchSurfaceRouteRules.flatMap((rule) => [
                  `a[href*="${rule.detailPathPrefix}"]`,
                  ...rule.embeddedJobIdParams.map((paramName) => `a[href*="${paramName}="]`),
                ]),
              ).join(', ');
            const collectAccessibleCardLabels = (element: HTMLElement): string[] => {
              if (!findSearchSurfaceRouteRuleForHostname(window.location.hostname)) {
                return [];
              }

              const candidates = [
                element,
                ...Array.from(element.querySelectorAll<HTMLElement>('[aria-label], [title]')),
              ];

              return uniqueStrings(
                candidates.map((candidate) =>
                  toText(candidate.getAttribute('aria-label') ?? candidate.getAttribute('title')),
                ),
              ).filter((value) => /\bdismiss\b.*\bjob\b/i.test(value));
            };
            const getSearchSurfaceAnchorLabel = (anchor: HTMLAnchorElement | null): string =>
              uniqueStrings([
                toText(anchor?.textContent ?? null),
                toText(anchor?.getAttribute('aria-label') ?? anchor?.getAttribute('title')),
              ]).sort((left, right) => right.length - left.length)[0] ?? '';
            const isAllowedInScopeUrl = (value: string | null | undefined): string | null => {
              if (!value) {
                return null;
              }

              try {
                const absolute = new URL(value, window.location.href);
                const hostname = absolute.hostname.toLowerCase();
                const hostAllowed = input.allowedHostnames.some(
                  (allowedHostname) =>
                    hostname === allowedHostname ||
                    (input.allowSubdomains && hostname.endsWith(`.${allowedHostname}`)),
                );
                if (!hostAllowed) {
                  return null;
                }

                const haystack = `${absolute.pathname}${absolute.search}`.toLowerCase();
                const matchesRelevantUrl =
                  input.relevantUrlSubstrings.length === 0 ||
                  input.relevantUrlSubstrings.some((substring) =>
                    haystack.includes(substring.toLowerCase()),
                  );
                if (!matchesRelevantUrl) {
                  return null;
                }

                for (const key of [...absolute.searchParams.keys()]) {
                  const lowered = key.toLowerCase();
                  if (
                    lowered.startsWith("utm_") ||
                    lowered === "trk" ||
                    lowered === "trackingid"
                  ) {
                    absolute.searchParams.delete(key);
                  }
                }

                absolute.hash = "";
                return absolute.toString();
              } catch {
                return null;
              }
            };
            const textArray = (value: unknown): string[] =>
              uniqueStrings(
                Array.isArray(value)
                  ? value.map((entry) => toText(entry))
                  : typeof value === "string"
                    ? value.split(/\n+/g).map((entry) => toText(entry))
                    : [],
              );
            const locationValue = (value: unknown): string | null => {
              if (!value || typeof value !== "object") {
                return null;
              }

              const candidate = value as Record<string, unknown>;
              return (
                toText(candidate.addressLocality) ||
                toText(candidate.addressRegion) ||
                toText(candidate.addressCountry) ||
                toText(candidate.name) ||
                null
              );
            };
            const normalizeEmploymentType = (value: unknown): string | null => {
              if (Array.isArray(value)) {
                return toText(value[0]);
              }
              return toText(value) || null;
            };
            const normalizeStructuredJob = (
              candidate: Record<string, unknown>,
            ): StructuredDataJobCandidate | null => {
              const candidateType = toText(candidate["@type"] || candidate.type).toLowerCase();
              if (candidateType && candidateType !== "jobposting") {
                return null;
              }

              const identifier = candidate.identifier;
              const identifierValue =
                typeof identifier === "object" && identifier && !Array.isArray(identifier)
                  ? toText((identifier as Record<string, unknown>).value)
                  : toText(identifier);
              const companyCandidate =
                typeof candidate.hiringOrganization === "object" &&
                candidate.hiringOrganization &&
                !Array.isArray(candidate.hiringOrganization)
                  ? (candidate.hiringOrganization as Record<string, unknown>)
                  : null;
              const directApply =
                Boolean(candidate.directApply === true) ||
                toText(candidate.applicantLocationRequirements).toLowerCase().includes("easy apply");
              const canonicalUrl = isAllowedInScopeUrl(
                toText(candidate.url) || toText(candidate.sameAs) || toText(candidate.mainEntityOfPage),
              );
              const location =
                locationValue(candidate.jobLocation) ||
                locationValue(candidate.applicantLocationRequirements) ||
                null;

              if (!canonicalUrl) {
                return null;
              }

              return {
                canonicalUrl,
                sourceJobId: identifierValue || null,
                title: toText(candidate.title),
                company:
                  toText(companyCandidate?.name) || toText(candidate.hiringOrganizationName) || null,
                location,
                description:
                  toText(candidate.description) ||
                  toText(candidate.responsibilities) ||
                  null,
                summary: toText(candidate.responsibilities) || null,
                postedAt: toText(candidate.datePosted) || null,
                postedAtText: toText(candidate.datePosted) || null,
                salaryText:
                  toText(candidate.baseSalary) ||
                  toText(candidate.salaryCurrency) ||
                  null,
                workMode: textArray(candidate.jobLocationType),
                applyPath: directApply ? "easy_apply" : "unknown",
                easyApplyEligible: directApply,
                keySkills: textArray(candidate.skills),
                responsibilities: textArray(candidate.responsibilities),
                minimumQualifications: textArray(candidate.qualifications),
                preferredQualifications: textArray(candidate.educationRequirements),
                seniority: toText(candidate.experienceRequirements) || null,
                employmentType: normalizeEmploymentType(candidate.employmentType),
                department: toText(candidate.industry) || null,
                team: null,
                employerWebsiteUrl: isAllowedInScopeUrl(toText(companyCandidate?.sameAs)),
                employerDomain: null,
                benefits: textArray(candidate.jobBenefits),
              };
            };

            const cardCandidates: RawSearchResultCardCandidate[] = [];
            const isSearchSurfaceRoute = (value: string): boolean => {
              try {
                const parsed = new URL(value, window.location.href);
                const routeRule = findSearchSurfaceRouteRuleForHostname(parsed.hostname);
                if (!routeRule) {
                  return false;
                }

                const pathname = parsed.pathname.toLowerCase();
                return isSearchSurfaceResultPath(routeRule, pathname);
              } catch {
                return false;
              }
            };
            const looksLikeSearchSurfaceResultCard = (element: HTMLElement): boolean => {
              const hasJobDataset =
                element.hasAttribute('data-job-id') ||
                element.hasAttribute('data-jobid') ||
                element.hasAttribute('data-occludable-job-id');
              if (hasJobDataset) {
                return true;
              }

              if (
                element.closest(
                  '[role="list"], ul, ol, [class*="jobs-search-results"], [class*="scaffold-layout__list"], [class*="job-card"]',
                )
              ) {
                return true;
              }

              return collectAccessibleCardLabels(element).length > 0;
            };
            const addCardCandidate = (element: HTMLElement, anchor: HTMLAnchorElement | null) => {
              const searchSurfaceRouteRule = findSearchSurfaceRouteRuleForHostname(window.location.hostname);
              const readJobIdHint = (candidate: HTMLElement | null): string =>
                toText(
                  candidate?.getAttribute('data-job-id') ??
                    candidate?.getAttribute('data-jobid') ??
                    candidate?.getAttribute('data-occludable-job-id') ??
                    null,
                );
              const findScopedJobIdHint = (): string | null => {
                const directHint = readJobIdHint(element) || readJobIdHint(anchor);
                if (directHint) {
                  return directHint;
                }

                let current = anchor?.parentElement ?? null;
                while (current && current !== element) {
                  const scopedHint = readJobIdHint(current);
                  if (scopedHint) {
                    return scopedHint;
                  }
                  current = current.parentElement;
                }

                return null;
              };

              const sourceJobIdHint = findScopedJobIdHint();
              const scopedSearchSurfaceJobViewUrl =
                /^(?:\d+)$/.test(sourceJobIdHint ?? '') && searchSurfaceRouteRule
                  ? buildSearchSurfaceDetailUrl(searchSurfaceRouteRule, sourceJobIdHint ?? '')
                  : null;
              const anchorCanonicalUrl = isAllowedInScopeUrl(anchor?.getAttribute("href") ?? null);
              const anchorLabel = getSearchSurfaceAnchorLabel(anchor);
              const shouldPreferScopedSearchSurfaceJobViewUrl = (() => {
                if (!scopedSearchSurfaceJobViewUrl || !anchorCanonicalUrl) {
                  return Boolean(scopedSearchSurfaceJobViewUrl) && !anchorCanonicalUrl;
                }

                try {
                  const parsedAnchorUrl = new URL(anchorCanonicalUrl, window.location.href);
                  const anchorRouteRule = findSearchSurfaceRouteRuleForHostname(parsedAnchorUrl.hostname);
                  if (!anchorRouteRule) {
                    return false;
                  }

                  const pathname = parsedAnchorUrl.pathname.toLowerCase();
                  const detailPathPattern = new RegExp(
                    `^${anchorRouteRule.detailPathPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)(?:[/?#]|$)`,
                  );
                  const anchorJobViewId = pathname.match(detailPathPattern)?.[1] ?? null;
                  const anchorCurrentJobId = readEmbeddedSearchSurfaceJobId(
                    parsedAnchorUrl,
                    anchorRouteRule,
                  );

                  if (anchorJobViewId && anchorJobViewId === sourceJobIdHint) {
                    return false;
                  }

                  if (isSearchSurfaceResultPath(anchorRouteRule, pathname)) {
                    return true;
                  }

                  if (anchorJobViewId && anchorJobViewId !== sourceJobIdHint) {
                    return true;
                  }

                  if (anchorCurrentJobId && anchorCurrentJobId !== sourceJobIdHint) {
                    return true;
                  }

                  return false;
                } catch {
                  return false;
                }
              })();
              const accessibleLabels = collectAccessibleCardLabels(element);
              const lines = uniqueStrings([
                anchorLabel,
                ...accessibleLabels,
                ...toText(element.innerText)
                  .split(/\n+/g)
                  .map((line) => toText(line)),
              ]).slice(0, 12);
              const headingText =
                toText(
                  element.querySelector("h1, h2, h3, h4, [role='heading']")?.textContent ?? null,
                ) || null;
              const anchorText = anchorLabel || headingText || lines[0] || '';
              const hasDismissLabel = lines.some((line) => /\bdismiss\b.*\bjob\b/i.test(line));
              const rect = element.getBoundingClientRect();
              const computedStyle = window.getComputedStyle(element);
              const viewportHeight =
                window.innerHeight || document.documentElement?.clientHeight || 0;
              const viewportWidth =
                window.innerWidth || document.documentElement?.clientWidth || 0;
              const isVisible =
                rect.width >= 1 &&
                rect.height >= 1 &&
                computedStyle.display !== 'none' &&
                computedStyle.visibility !== 'hidden' &&
                computedStyle.visibility !== 'collapse' &&
                Number.parseFloat(computedStyle.opacity || '1') > 0.01;
              const intersectsViewport =
                isVisible &&
                rect.bottom > 0 &&
                rect.right > 0 &&
                rect.top < viewportHeight &&
                rect.left < viewportWidth;
              const viewportTop = Number.isFinite(rect.top) ? Math.round(rect.top) : null;
              const viewportDistance = !isVisible
                ? null
                : rect.bottom < 0
                  ? Math.round(Math.abs(rect.bottom))
                  : rect.top > viewportHeight
                    ? Math.round(rect.top - viewportHeight)
                    : 0;
              const canonicalUrl =
                (shouldPreferScopedSearchSurfaceJobViewUrl ? scopedSearchSurfaceJobViewUrl : null) ??
                anchorCanonicalUrl ??
                scopedSearchSurfaceJobViewUrl ??
                (searchSurfaceRouteRule &&
                looksLikeSearchSurfaceResultCard(element) &&
                (hasDismissLabel || lines.length >= 3)
                  ? isAllowedInScopeUrl(window.location.href)
                  : null);
              if (!canonicalUrl) {
                return;
              }
              if (!anchorText && !headingText) {
                return;
              }

              const rootClassName = toText(element.getAttribute("class"));
              const searchSurfaceAnchorSelector = buildSearchSurfaceAnchorSelector();
              const jobLinkCount = searchSurfaceAnchorSelector
                ? element.querySelectorAll(searchSurfaceAnchorSelector).length
                : 0;
              const anchorElement = anchor;

              const nextCandidate = {
                canonicalUrl,
                anchorText,
                headingText,
                lines,
                sourceJobIdHint,
                captureMeta: {
                  domOrder: cardCandidates.length,
                  rootTagName: element.tagName?.toLowerCase() ?? null,
                  rootRole: toText(element.getAttribute("role")) || null,
                  rootClassName: rootClassName || null,
                  hasJobDataset:
                    element.hasAttribute("data-job-id") ||
                    element.hasAttribute("data-jobid") ||
                    element.hasAttribute("data-occludable-job-id"),
                  sameRootJobAnchorCount: jobLinkCount,
                  inLikelyResultsList: Boolean(
                    anchorElement?.closest(
                      '[role="list"], ul, ol, [class*="jobs-search-results"], [class*="scaffold-layout__list"], [class*="job-card"]',
                    ) ??
                    element.closest(
                      '[role="list"], ul, ol, [class*="jobs-search-results"], [class*="scaffold-layout__list"], [class*="job-card"]',
                    ),
                  ),
                  inAside: Boolean(anchorElement?.closest("aside") ?? element.closest("aside")),
                  inHeader: Boolean(anchorElement?.closest("header") ?? element.closest("header")),
                  inNavigation: Boolean(anchorElement?.closest("nav, [role='navigation']") ?? element.closest("nav, [role='navigation']")),
                  inDetailPane: Boolean(
                    anchorElement?.closest(
                      '[class*="jobs-search__job-details"], [class*="jobs-search-two-pane__details"], [class*="job-details"], [class*="jobs-details"], [class*="job-view-layout"]',
                    ) ??
                    element.closest(
                      '[class*="jobs-search__job-details"], [class*="jobs-search-two-pane__details"], [class*="job-details"], [class*="jobs-details"], [class*="job-view-layout"]',
                    ),
                  ),
                  hasDismissLabel,
                  isVisible,
                  intersectsViewport,
                  viewportTop,
                  viewportDistance,
                },
              };
              cardCandidates.push(nextCandidate);
            };

            if (input.preferSearchSurfaceJobViewCardCapture) {
              const scannedRoots = new WeakSet<HTMLElement>();
              const selectPreferredSearchSurfaceCardRoot = (anchor: HTMLAnchorElement): HTMLElement =>
                anchor.closest<HTMLElement>(
                  '.jobs-search-results__list-item, .job-card-container, [role="listitem"], li, article, [role="article"]',
                ) ??
                anchor.closest<HTMLElement>('[data-job-id], [data-jobid], [data-occludable-job-id]') ??
                anchor;
              const scoreSearchSurfaceAnchorForRoot = (
                element: HTMLElement,
                anchor: HTMLAnchorElement,
              ): number => {
                const href = toText(anchor.getAttribute('href'));
                const label = getSearchSurfaceAnchorLabel(anchor);
                const heading = toText(
                  element.querySelector('h1, h2, h3, h4, [role="heading"]')?.textContent ?? null,
                );
                const firstLine = toText(element.innerText).split(/\n+/g).map((line) => toText(line))[0] ?? '';
                const accessibleLabels = collectAccessibleCardLabels(element);
                let score = 0;

                try {
                  const parsedHref = new URL(href, window.location.href);
                  const routeRule = findSearchSurfaceRouteRuleForHostname(parsedHref.hostname);
                  if (routeRule && parsedHref.pathname.toLowerCase().startsWith(routeRule.detailPathPrefix)) {
                    score += 40;
                  }

                  if (
                    routeRule &&
                    routeRule.embeddedJobIdParams.some((paramName) => parsedHref.searchParams.has(paramName))
                  ) {
                    score += 20;
                  }
                } catch {
                  // Ignore invalid anchor hrefs while scoring candidates.
                }

                if (/\bdismiss\b.*\bjob\b/i.test(label)) {
                  score += 180;
                }

                if (anchor.closest('h1, h2, h3, h4, [role="heading"]')) {
                  score += 120;
                }

                if (label) {
                  score += Math.min(label.length, 80);
                } else {
                  score -= 120;
                }

                if (heading && label && (heading.includes(label) || label.includes(heading))) {
                  score += 160;
                }

                if (firstLine && label && (firstLine.includes(label) || label.includes(firstLine))) {
                  score += 100;
                }

                if (
                  label &&
                  accessibleLabels.some(
                    (candidate) => candidate.includes(label) || label.includes(candidate),
                  )
                ) {
                  score += 120;
                }

                if (anchor.getAttribute('aria-hidden') === 'true' || anchor.closest('[aria-hidden="true"], [hidden]')) {
                  score -= 200;
                }

                return score;
              };
              const selectSupplementalSearchSurfaceAnchor = (
                element: HTMLElement,
              ): HTMLAnchorElement | null => {
                const anchors = Array.from(element.querySelectorAll<HTMLAnchorElement>('a')).filter(
                  (anchor) => Boolean(anchor.getAttribute('href')),
                );
                let bestAnchor: HTMLAnchorElement | null = null;
                let bestScore = Number.NEGATIVE_INFINITY;

                for (const anchor of anchors) {
                  const score = scoreSearchSurfaceAnchorForRoot(element, anchor);
                  if (score > bestScore) {
                    bestAnchor = anchor;
                    bestScore = score;
                  }
                }

                return bestScore > 0 ? bestAnchor : null;
              };
              const searchSurfaceAnchorSelector = buildSearchSurfaceAnchorSelector();
              const jobAnchors = searchSurfaceAnchorSelector
                ? Array.from(
                    document.querySelectorAll<HTMLAnchorElement>(searchSurfaceAnchorSelector),
                  )
                : [];
              const preferredAnchorByRoot = new Map<HTMLElement, { anchor: HTMLAnchorElement; score: number }>();

              for (const anchor of jobAnchors) {
                const root = selectPreferredSearchSurfaceCardRoot(anchor);
                const score = scoreSearchSurfaceAnchorForRoot(root, anchor);
                const current = preferredAnchorByRoot.get(root);

                if (!current || score > current.score) {
                  preferredAnchorByRoot.set(root, { anchor, score });
                }
              }

              for (const [root, candidate] of preferredAnchorByRoot.entries()) {
                scannedRoots.add(root);
                addCardCandidate(root, candidate.anchor);
              }

              const supplementalRoots = Array.from(
                document.querySelectorAll<HTMLElement>(
                  '.jobs-search-results__list-item, .job-card-container, [role="listitem"], li, article, [data-job-id], [data-jobid], [data-occludable-job-id]',
                ),
              );

              for (const root of supplementalRoots) {
                if (cardCandidates.length >= input.maxInPageCardCandidates || scannedRoots.has(root) || !looksLikeSearchSurfaceResultCard(root)) {
                  continue;
                }

                const anchor = selectSupplementalSearchSurfaceAnchor(root);
                if (!anchor && !root.querySelector('h1, h2, h3, h4, [role="heading"]')) {
                  continue;
                }

                scannedRoots.add(root);
                addCardCandidate(root, anchor);
              }
            }

            if (cardCandidates.length === 0) {
              const cardSelectors = [
                "article",
                "li",
                "[role='article']",
                "[data-job-id]",
                "[data-jobid]",
                "[data-job-id] *",
              ];
              for (const selector of cardSelectors) {
                for (const element of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
                  if (cardCandidates.length >= input.maxInPageCardCandidates) {
                    break;
                  }
                  const anchor =
                    element.matches("a[href]")
                      ? (element as HTMLAnchorElement)
                      : element.querySelector<HTMLAnchorElement>("a[href]");
                  addCardCandidate(element, anchor);
                }
              }
            }
            const limitedCardCandidates = cardCandidates.slice(0, input.maxInPageCardCandidates);

            const structuredJobs = uniqueStrings(
              Array.from(
                document.querySelectorAll<HTMLScriptElement>(
                  'script[type="application/ld+json"]',
                ),
                (script) => script.textContent ?? "",
              ),
            ).flatMap((scriptText) => {
              try {
                const payload = JSON.parse(scriptText) as unknown;
                const queue = Array.isArray(payload) ? [...payload] : [payload];
                const jobs: StructuredDataJobCandidate[] = [];
                while (queue.length > 0 && jobs.length < 20) {
                  const current = queue.shift();
                  if (!current || typeof current !== "object") {
                    continue;
                  }

                  if (Array.isArray(current)) {
                    queue.push(...current);
                    continue;
                  }

                  const record = current as Record<string, unknown>;
                  const normalized = normalizeStructuredJob(record);
                  if (normalized) {
                    jobs.push(normalized);
                  }

                  const graphValues = record["@graph"];
                  if (Array.isArray(graphValues)) {
                    queue.push(...graphValues);
                  }
                }
                return jobs;
              } catch {
                return [];
              }
            });

            return {
              structuredDataCandidates: structuredJobs.slice(0, 20),
              cardCandidates: limitedCardCandidates,
            };
          },
          {
            allowedHostnames: context.config.navigationPolicy.allowedHostnames.map((hostname) => hostname.toLowerCase()),
            relevantUrlSubstrings,
            allowSubdomains: context.config.navigationPolicy.allowSubdomains === true,
            preferSearchSurfaceJobViewCardCapture: shouldUseSearchSurfaceJobViewCardCapture(pageUrl),
            maxInPageCardCandidates: MAX_IN_PAGE_CARD_CANDIDATES,
            searchSurfaceRouteRules: SEARCH_SURFACE_ROUTE_RULES.map((rule) => ({
              hostSuffixes: [...rule.hostSuffixes],
              resultExactPaths: [...rule.resultExactPaths],
              resultPathPrefixes: [...rule.resultPathPrefixes],
              detailPathPrefix: rule.detailPathPrefix,
              detailPathTemplate: rule.detailPathTemplate,
              embeddedJobIdParams: [...rule.embeddedJobIdParams],
            })),
          },
        ));

        const prioritizedCardCandidates = prioritizeExtractedCardCandidates(
          pageUrl,
          structuredCandidates.cardCandidates,
          context.config.searchPreferences,
        );

        return {
          success: true,
          data: {
            pageType,
            pageUrl,
            pageText: truncatedPageText,
            pageTextLength: extractionTextLength,
            pageTextTruncated,
            readyForExtraction,
            maxJobs,
            discoveredJobUrlsFound: discoveredUrls.length,
            structuredDataCandidates: structuredCandidates.structuredDataCandidates,
            cardCandidates: prioritizedCardCandidates,
            checks: { hasMinimumContent, hasNoLoadingIndicators, hasJobContent },
          },
        };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Failed to extract jobs" };
      }
    },
  },
];
