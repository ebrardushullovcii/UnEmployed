import {
  JobPostingSchema,
  SavedJobSchema,
  assessJobPostingDetailQuality,
  type JobPosting,
  type ListingDetailFetch,
  type ListingDetailFetchOutcome,
  type MatchAssessment,
  type SavedJob,
} from "@unemployed/contracts";
import {
  extractListingDetailFromHtml,
  type ExtractedListingDetail,
} from "./listing-detail-extraction";
import { enrichDiscoveredPosting } from "./matching";

/**
 * Reads listing bodies for jobs a compact scan captured as cards only.
 *
 * A card carries a title, an employer and a link. Everything the product is
 * for — the fit score, the requirements it checks, the text a tailored resume
 * is written toward — needs the body. This stage fetches each retained job's
 * own page over plain HTTP (no browser, no session, no cookies), reads the
 * schema.org JobPosting record most job pages publish, and re-scores the job
 * with the same scorer the search used. It is source-generic (ADR 0007): it
 * knows HTML, not boards.
 *
 * Bounded on every axis: per-request timeout, run-wide time budget, capped
 * concurrency, capped count, one attempt per job per day. A failed read is
 * recorded on the job so the product can say "tried, no text" instead of
 * pretending the listing was never opened.
 */

export interface ListingHtmlFetchResult {
  status: number;
  html: string;
  finalUrl: string;
}

export type ListingHtmlFetcher = (
  url: string,
  options: { signal: AbortSignal },
) => Promise<ListingHtmlFetchResult>;

export interface ListingDetailEnrichmentSummary {
  attempted: number;
  enriched: number;
  partial: number;
  noDetail: number;
  failed: number;
  blocked: number;
  skipped: number;
  elapsedMs: number;
}

export interface EnrichSavedJobListingDetailsInput {
  jobs: readonly SavedJob[];
  fetchHtml: ListingHtmlFetcher;
  /** Re-scores a posting; the discovery pipeline's assessment session. */
  assess: (posting: JobPosting) => MatchAssessment;
  now?: () => string;
  signal?: AbortSignal;
  concurrency?: number;
  /** Stop starting new reads once this much wall-clock time has passed. */
  timeBudgetMs?: number;
  perRequestTimeoutMs?: number;
  /** Never read more than this many pages in one call. */
  maxJobs?: number;
}

export interface EnrichSavedJobListingDetailsResult {
  /** Every input job, updated where a read changed it, in input order. */
  jobs: SavedJob[];
  changedJobIds: string[];
  summary: ListingDetailEnrichmentSummary;
}

const DEFAULT_CONCURRENCY = 4;
const DEFAULT_TIME_BUDGET_MS = 25_000;
const DEFAULT_PER_REQUEST_TIMEOUT_MS = 8_000;
/** Exported so the run log can say how many of the candidates this pass reads. */
export const LISTING_DETAIL_READS_PER_RUN = 60;
const DEFAULT_MAX_JOBS = LISTING_DETAIL_READS_PER_RUN;
const RETRY_AFTER_SUCCESSFUL_ATTEMPT_MS = 24 * 60 * 60 * 1000;
const RETRY_AFTER_FAILED_ATTEMPT_MS = 60 * 60 * 1000;
const MAX_RESPONSE_CHARACTERS = 1_500_000;
const SUMMARY_MAX_LENGTH = 420;

const BROWSER_LIKE_HEADERS = {
  accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
};

/** Plain-HTTP page reader used outside tests. */
export function createDefaultListingHtmlFetcher(): ListingHtmlFetcher {
  return async (url, options) => {
    const response = await fetch(url, {
      headers: BROWSER_LIKE_HEADERS,
      redirect: "follow",
      signal: options.signal,
    });
    const text = await response.text();
    return {
      status: response.status,
      html:
        text.length > MAX_RESPONSE_CHARACTERS
          ? text.slice(0, MAX_RESPONSE_CHARACTERS)
          : text,
      finalUrl: response.url || url,
    };
  };
}

function isHttpUrl(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * Whether a job is worth a read right now: it has a fetchable page, its body
 * is not already known, and it has not been tried too recently.
 */
export function jobNeedsListingDetail(
  job: Pick<SavedJob, "detailQuality" | "canonicalUrl" | "listingDetailFetch">,
  nowIso: string = new Date().toISOString(),
): boolean {
  if (job.detailQuality === "detail_enriched") {
    return false;
  }
  if (!isHttpUrl(job.canonicalUrl)) {
    return false;
  }
  const attempt = job.listingDetailFetch;
  if (!attempt) {
    return true;
  }
  if (attempt.outcome === "unsupported_url") {
    return false;
  }
  const since = Date.parse(nowIso) - Date.parse(attempt.attemptedAt);
  if (!Number.isFinite(since)) {
    return true;
  }
  const retryAfter =
    attempt.outcome === "fetch_failed" || attempt.outcome === "blocked"
      ? RETRY_AFTER_FAILED_ATTEMPT_MS
      : RETRY_AFTER_SUCCESSFUL_ATTEMPT_MS;
  return since >= retryAfter;
}

const PLACEHOLDER_LOCATION =
  /^(?:location not stated|not stated|unknown|unspecified|n\/a|-|—)$/iu;

function looksLikeDomainOrPlaceholderCompany(company: string): boolean {
  const trimmed = company.trim();
  return (
    trimmed.length === 0 ||
    /[./]/u.test(trimmed) ||
    /^(?:unknown|employer not listed|not stated)$/iu.test(trimmed)
  );
}

function buildSummary(description: string): string | null {
  const paragraphs = description
    .split(/\n{2,}/u)
    .map((paragraph) => paragraph.replace(/\s+/gu, " ").trim())
    .filter((paragraph) => paragraph.length > 0 && !paragraph.startsWith("•"));
  let summary = "";
  for (const paragraph of paragraphs) {
    const next = summary ? `${summary} ${paragraph}` : paragraph;
    if (next.length > SUMMARY_MAX_LENGTH) {
      if (!summary) {
        const cut = paragraph.slice(0, SUMMARY_MAX_LENGTH);
        const lastSentence = cut.lastIndexOf(". ");
        summary =
          lastSentence > SUMMARY_MAX_LENGTH * 0.5
            ? cut.slice(0, lastSentence + 1)
            : `${cut.trimEnd()}…`;
      }
      break;
    }
    summary = next;
    if (summary.length >= SUMMARY_MAX_LENGTH * 0.6) {
      break;
    }
  }
  return summary || null;
}

/**
 * Merges what the page said into the saved job. Card fields the page confirms
 * or improves are replaced; fields the card already carried keep their value
 * unless they were placeholders. The description is the point of the read and
 * always wins over a card-only stand-in.
 */
export function applyListingDetailToJob(input: {
  job: SavedJob;
  detail: ExtractedListingDetail;
  attemptedAt: string;
  assess: (posting: JobPosting) => MatchAssessment;
}): {
  job: SavedJob;
  outcome: Extract<
    ListingDetailFetchOutcome,
    "enriched" | "partial" | "no_detail"
  >;
} {
  const { job, detail } = input;
  const description =
    detail.description.length > job.description.length
      ? detail.description
      : job.description;
  const company =
    detail.company && looksLikeDomainOrPlaceholderCompany(job.company)
      ? detail.company
      : job.company;
  const location =
    detail.location &&
    (PLACEHOLDER_LOCATION.test(job.location) ||
      job.location.trim().length === 0)
      ? detail.location
      : job.location;

  const candidate: JobPosting = JobPostingSchema.parse({
    ...job,
    company,
    location,
    description,
    summary: job.summary ?? buildSummary(description),
    salaryText: job.salaryText ?? detail.salaryText,
    postedAt: job.postedAt ?? detail.postedAt,
    employmentType: job.employmentType ?? detail.employmentType,
    workMode: [...job.workMode, ...detail.workModeHints],
    applicationUrl: job.applicationUrl ?? detail.directApplyUrl,
  });
  const quality = assessJobPostingDetailQuality(candidate);
  // A page can publish a record whose body is a sentence; that is not a
  // listing to score against, and the job says so instead of claiming detail.
  const outcome =
    quality === "detail_enriched"
      ? "enriched"
      : quality === "partial_detail"
        ? "partial"
        : "no_detail";
  const fetchRecord: ListingDetailFetch = {
    attemptedAt: input.attemptedAt,
    outcome,
    method: detail.method,
    detail:
      outcome === "no_detail"
        ? "The page's record carried only a sentence or two, not a listing body."
        : detail.method === "json_ld"
          ? "Read the listing's structured JobPosting record from its page."
          : "Read the visible text of the listing page; no structured record was published.",
  };
  const enrichedPosting = enrichDiscoveredPosting(
    { ...candidate, detailQuality: quality, listingDetailFetch: fetchRecord },
    job,
  );
  const nextJob = SavedJobSchema.parse({
    ...job,
    ...enrichedPosting,
    detailQuality: quality,
    listingDetailFetch: fetchRecord,
  });
  return {
    job: SavedJobSchema.parse({
      ...nextJob,
      matchAssessment: input.assess(nextJob),
    }),
    outcome,
  };
}

function recordFailedAttempt(
  job: SavedJob,
  attemptedAt: string,
  outcome: Exclude<ListingDetailFetchOutcome, "enriched" | "partial">,
  detail: string,
): SavedJob {
  return SavedJobSchema.parse({
    ...job,
    listingDetailFetch: {
      attemptedAt,
      outcome,
      method: null,
      detail,
    },
  });
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.name === "AbortError" || error.name === "TimeoutError"
      ? "The page did not respond in time."
      : error.message.slice(0, 200);
  }
  return String(error).slice(0, 200);
}

function combineSignals(
  parent: AbortSignal | undefined,
  timeoutMs: number,
): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  if (!parent) {
    return timeout;
  }
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([parent, timeout]);
  }
  const controller = new AbortController();
  const abort = () => controller.abort();
  parent.addEventListener("abort", abort, { once: true });
  timeout.addEventListener("abort", abort, { once: true });
  return controller.signal;
}

/**
 * Reads listing bodies for every job that needs one, within the bounds above,
 * and returns the jobs with bodies, quality, provenance and scores updated.
 */
export async function enrichSavedJobListingDetails(
  input: EnrichSavedJobListingDetailsInput,
): Promise<EnrichSavedJobListingDetailsResult> {
  const now = input.now ?? (() => new Date().toISOString());
  const startedAtMs = Date.now();
  const concurrency = Math.max(1, input.concurrency ?? DEFAULT_CONCURRENCY);
  const timeBudgetMs = input.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS;
  const perRequestTimeoutMs =
    input.perRequestTimeoutMs ?? DEFAULT_PER_REQUEST_TIMEOUT_MS;
  const maxJobs = input.maxJobs ?? DEFAULT_MAX_JOBS;

  const summary: ListingDetailEnrichmentSummary = {
    attempted: 0,
    enriched: 0,
    partial: 0,
    noDetail: 0,
    failed: 0,
    blocked: 0,
    skipped: 0,
    elapsedMs: 0,
  };
  const updated = new Map<string, SavedJob>();
  const queue = input.jobs.filter((job) => {
    const needs = jobNeedsListingDetail(job, now());
    if (!needs) {
      summary.skipped += 1;
    }
    return needs;
  });
  const capped = queue.slice(0, maxJobs);
  summary.skipped += queue.length - capped.length;

  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < capped.length) {
      if (input.signal?.aborted) {
        return;
      }
      if (Date.now() - startedAtMs >= timeBudgetMs) {
        summary.skipped += capped.length - cursor;
        cursor = capped.length;
        return;
      }
      const job = capped[cursor];
      cursor += 1;
      if (!job) {
        return;
      }
      summary.attempted += 1;
      const attemptedAt = now();
      try {
        const response = await input.fetchHtml(job.canonicalUrl, {
          signal: combineSignals(input.signal, perRequestTimeoutMs),
        });
        if (
          response.status === 401 ||
          response.status === 403 ||
          response.status === 429
        ) {
          summary.blocked += 1;
          updated.set(
            job.id,
            recordFailedAttempt(
              job,
              attemptedAt,
              "blocked",
              `The page answered ${response.status}; it wants a signed-in visitor or is rate-limited.`,
            ),
          );
          continue;
        }
        if (response.status >= 400) {
          summary.failed += 1;
          updated.set(
            job.id,
            recordFailedAttempt(
              job,
              attemptedAt,
              "fetch_failed",
              `The page answered ${response.status}.`,
            ),
          );
          continue;
        }
        const detail = extractListingDetailFromHtml({
          html: response.html,
          url: response.finalUrl,
          expectedTitle: job.title,
        });
        if (!detail) {
          summary.noDetail += 1;
          updated.set(
            job.id,
            recordFailedAttempt(
              job,
              attemptedAt,
              "no_detail",
              "The page published no JobPosting record and too little readable text to stand in for one.",
            ),
          );
          continue;
        }
        const applied = applyListingDetailToJob({
          job,
          detail,
          attemptedAt,
          assess: input.assess,
        });
        if (applied.outcome === "enriched") {
          summary.enriched += 1;
        } else if (applied.outcome === "partial") {
          summary.partial += 1;
        } else {
          summary.noDetail += 1;
        }
        updated.set(job.id, applied.job);
      } catch (error) {
        if (input.signal?.aborted) {
          return;
        }
        summary.failed += 1;
        updated.set(
          job.id,
          recordFailedAttempt(
            job,
            attemptedAt,
            "fetch_failed",
            describeError(error),
          ),
        );
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, capped.length) }, () =>
      worker(),
    ),
  );

  summary.elapsedMs = Date.now() - startedAtMs;
  return {
    jobs: input.jobs.map((job) => updated.get(job.id) ?? job),
    changedJobIds: [...updated.keys()],
    summary,
  };
}

/** One sentence for the run log and the Home status line. */
export function describeListingDetailEnrichment(
  summary: ListingDetailEnrichmentSummary,
): string {
  if (summary.attempted === 0) {
    return "No listing pages needed reading.";
  }
  const parts: string[] = [];
  const read = summary.enriched + summary.partial;
  parts.push(
    `Read ${read} of ${summary.attempted} listing ${summary.attempted === 1 ? "page" : "pages"}`,
  );
  if (summary.noDetail > 0) {
    parts.push(`${summary.noDetail} had no listing text`);
  }
  if (summary.blocked > 0) {
    parts.push(`${summary.blocked} wanted a sign-in`);
  }
  if (summary.failed > 0) {
    parts.push(`${summary.failed} could not be reached`);
  }
  return `${parts.join(" · ")}.`;
}
