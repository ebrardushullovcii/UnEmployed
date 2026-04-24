import { JobPostingSchema, WorkModeListSchema, type JobPosting } from "@unemployed/contracts";
import {
  buildGenericCanonicalUrl,
  buildGenericJobId,
  buildInvalidJobSample,
  describeInvalidFieldCounts,
  titleCaseWords,
} from "./deterministic";

const jobBoardHostFragments = [
  "linkedin.com",
  "indeed.com",
  "greenhouse.io",
  "lever.co",
  "workday.com",
  "ashbyhq.com",
  "smartrecruiters.com",
];
const COMPOSITE_POSTED_SUFFIX_PATTERN =
  /(?:posted\s+)?(?:\d+\s*(?:day|days|week|weeks|month|months|hour|hours|hr|hrs|dit[eë]?|jav[eë]?|jave|muaj(?:sh)?|ore?)(?:\s+ago)?|today|yesterday|just posted|sot|dje)$/iu;
const ROLE_TOKEN_PATTERN =
  /^(?:engineer|developer|manager|designer|analyst|specialist|support|sales|marketing|data|software|product|qa|frontend|backend|react|category|customer|experience|work|senior|junior|lead|principal|staff|intern|associate|director|head|chief|coordinator|consultant|administrator|executive|trainee|apprentice|sr|jr|ii|iii)$/i;
const LOCATION_HINT_PATTERN =
  /\b(remote|hybrid|on[- ]site|onsite|work from home|home office|worldwide|global|anywhere)\b/i;
const GENERIC_JOB_PATH_SEGMENTS = new Set([
  "job",
  "jobs",
  "jobs-view",
  "view",
  "career",
  "careers",
  "position",
  "positions",
  "opening",
  "openings",
  "search",
  "apply",
  "company",
  "companies",
  "category",
  "categories",
  "vacancy",
  "vacancies",
  "role",
  "roles",
  "pune",
  "punes",
  "punesim",
  "pozita",
  "pozite",
  "konkurs",
  "karriere",
  "karrier",
]);

function trimToNull(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number") {
    return String(value);
  }

  return null;
}

function toUrlOrNull(value: unknown): string | null {
  const trimmed = trimToNull(value);
  if (!trimmed) {
    return null;
  }

  try {
    return new URL(trimmed).toString();
  } catch {
    try {
      return new URL(`https://${trimmed}`).toString();
    } catch {
      return null;
    }
  }
}

function toIsoDateTimeOrNull(value: unknown): string | null {
  const trimmed = trimToNull(value);
  if (!trimmed) {
    return null;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function summarizeJobPosting(input: {
  title: string;
  company: string;
  description: string;
  responsibilities: readonly string[];
  minimumQualifications: readonly string[];
  preferredQualifications: readonly string[];
}): string {
  const firstStructuredLine = [
    ...input.responsibilities,
    ...input.minimumQualifications,
    ...input.preferredQualifications,
  ][0] ?? null;

  if (firstStructuredLine) {
    return firstStructuredLine;
  }

  const normalizedDescription = input.description.trim();
  if (!normalizedDescription) {
    return `${input.title} opportunity at ${input.company}`;
  }

  const firstSentence = normalizedDescription
    .split(/(?<=[.!?])\s+/)
    .map((entry) => entry.trim())
    .find(Boolean);

  return firstSentence ? firstSentence.slice(0, 280) : normalizedDescription.slice(0, 280);
}

function toHostnameOrNull(value: string | null): string | null {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isLikelyJobBoardHost(hostname: string | null): boolean {
  if (!hostname) {
    return false;
  }

  return jobBoardHostFragments.some(
    (fragment) => hostname === fragment || hostname.endsWith(`.${fragment}`),
  );
}

function isLocationLike(value: string): boolean {
  const normalized = trimToNull(value);
  if (!normalized || normalized.length > 80) {
    return false;
  }

  if (LOCATION_HINT_PATTERN.test(normalized)) {
    return true;
  }

  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (normalized.includes(",") && tokens.length <= 8) {
    return true;
  }

  if (tokens.length <= 3) {
    return tokens.every((token) => /^[A-Z][\p{L}\p{N}.'’-]*$/u.test(token));
  }

  return false;
}

function stripTrailingPostedAtText(value: string): {
  content: string;
  postedAtText: string | null;
} {
  const normalized = value.trim();
  const match = normalized.match(COMPOSITE_POSTED_SUFFIX_PATTERN);

  if (!match || typeof match.index !== "number") {
    return { content: normalized, postedAtText: null };
  }

  return {
    content: normalized.slice(0, match.index).trim(),
    postedAtText: match[0].trim(),
  };
}

function inferTrailingCompositeLocation(value: string): string | null {
  const tokens = value.trim().split(/\s+/).filter(Boolean);

  for (let width = 1; width <= Math.min(3, tokens.length - 1); width += 1) {
    const candidate = tokens.slice(-width).join(" ");
    if (
      width === 1 &&
      !LOCATION_HINT_PATTERN.test(candidate) &&
      (tokens.length < 3 || ROLE_TOKEN_PATTERN.test(candidate))
    ) {
      continue;
    }

    if (isLocationLike(candidate)) {
      return candidate;
    }
  }

  return null;
}

function normalizeCompositeTitle(value: string): {
  title: string;
  location: string | null;
  postedAtText: string | null;
} {
  const normalized = trimToNull(value) ?? "";
  const { content, postedAtText } = stripTrailingPostedAtText(normalized);
  const location = inferTrailingCompositeLocation(content);
  const title = location
    ? content
        .slice(0, Math.max(0, content.length - location.length))
        .replace(/[\s–—-]+$/, "")
        .trim()
    : content;

  return {
    title: title || content,
    location,
    postedAtText,
  };
}

function inferCompanyFromCanonicalUrl(url: string): string | null {
  const canonicalUrl = trimToNull(url);
  if (!canonicalUrl) {
    return null;
  }

  try {
    const parsed = new URL(canonicalUrl);
    const pathSegments = parsed.pathname
      .split("/")
      .map((segment) => segment.trim())
      .filter(Boolean);

    if (pathSegments.length < 2) {
      return null;
    }

    const companySegment = pathSegments[0]?.toLowerCase() ?? "";
    if (
      !companySegment ||
      GENERIC_JOB_PATH_SEGMENTS.has(companySegment) ||
      !/[a-z\p{L}]/iu.test(companySegment)
    ) {
      return null;
    }

    return titleCaseWords(companySegment.replace(/[-_]+/g, " "));
  } catch {
    return null;
  }
}

export function buildJobsExtractionPrompt(input: {
  pageHostLabel: string;
  pageType: "search_results" | "job_detail";
  effectiveMaxJobs: number;
}): string {
  return input.pageType === "search_results"
    ? [
        `You extract job listings from a careers or job-search page on ${input.pageHostLabel}.`,
        'Return JSON with a "jobs" array.',
        "Jobs may appear in any language. Preserve the original language of titles, companies, locations, and descriptions.",
        "Each job should include: sourceJobId when explicit, canonicalUrl when stable, title, company, location, salaryText (or null), description, summary when confidently available, workMode, keySkills when visible, postedAt or postedAtText when visible, employerWebsiteUrl when proven, applyPath, and easyApplyEligible.",
        'Use only these applyPath values: "easy_apply", "external_redirect", or "unknown". Use "unknown" when the page does not prove the path.',
        'Set easyApplyEligible to true only when the page clearly shows an inline easy-apply path; otherwise return false.',
        'Use any "Relevant in-scope URLs found on page" entries to recover stable canonical job URLs whenever possible.',
        "If only a short search-results snippet is visible, reuse that grounded snippet for description instead of leaving description empty.",
        "Do not spend effort inventing detail-page-only fields that are not visible on the search page.",
        "If you cannot determine a stable canonicalUrl or a reliable job title for a listing, omit that listing from the output.",
        "Do not fabricate posted dates. Use null when exact posting time is unknown and preserve any visible relative string in postedAtText.",
        "Do not invent companies, locations, or URLs.",
        `Return at most ${input.effectiveMaxJobs} jobs.`,
      ].join(" ")
    : [
        `You extract one structured job posting from a job-detail page on ${input.pageHostLabel}.`,
        'Return JSON with a "jobs" array containing one job object.',
        "Jobs may appear in any language. Preserve the original language of titles, companies, locations, and descriptions.",
        "Each job should include canonicalUrl, title, company, location, salaryText (or null), description, summary when confidently available, workMode, keySkills, responsibilities, minimumQualifications, preferredQualifications, seniority, employmentType, department, team, postedAt or postedAtText when visible, employerWebsiteUrl when proven, applyPath, and easyApplyEligible.",
        'Use only these applyPath values: "easy_apply", "external_redirect", or "unknown". Use "unknown" when the page does not prove the path.',
        'Set easyApplyEligible to true only when the page clearly shows an inline easy-apply path; otherwise return false.',
        "Use the page URL as the source of truth for canonicalUrl whenever available.",
        "Do not fabricate posted dates. Use null when exact posting time is unknown and preserve any visible relative string in postedAtText.",
        'If the page is not clearly a job detail page, return { "jobs": [] }.',
      ].join(" ");
}

export function normalizeExtractedJobs(input: {
  payload: unknown;
  pageHostLabel: string;
  pageUrl: string;
  pageType: "search_results" | "job_detail";
  effectiveMaxJobs: number;
}): JobPosting[] {
  const toStr = (value: unknown): string => {
    if (typeof value === "string") return value;
    if (typeof value === "number") return String(value);
    return "";
  };

  const toStringArray = (value: unknown): string[] => {
    if (Array.isArray(value)) {
      return value.flatMap((entry) => {
        const normalized = toStr(entry).trim();
        return normalized ? [normalized] : [];
      });
    }

    const normalized = toStr(value).trim();
    return normalized ? [normalized] : [];
  };

const toWorkModeArray = (value: unknown): string[] => {
    const parsed = WorkModeListSchema.safeParse(value);
    if (!parsed.success) {
      return [];
    }
    return parsed.data;
  };

  if (
    !input.payload ||
    typeof input.payload !== "object" ||
    !Array.isArray((input.payload as { jobs?: unknown }).jobs)
  ) {
    throw new Error(
      `[AI Provider] Expected a top-level jobs array when extracting jobs from ${input.pageHostLabel}, received: ${JSON.stringify(input.payload)}`,
    );
  }

  const rawJobCandidates = (input.payload as { jobs: unknown[] }).jobs;
  const rawJobs: Array<Record<string, unknown>> = [];

  const parsedJobs: JobPosting[] = [];
  let skippedJobs = 0;
  const invalidFieldCounts = new Map<string, number>();
  const invalidSamples: string[] = [];

  for (const candidate of rawJobCandidates) {
    if (
      candidate &&
      typeof candidate === "object" &&
      !Array.isArray(candidate)
    ) {
      rawJobs.push(candidate as Record<string, unknown>);
      continue;
    }

    skippedJobs += 1;
    invalidFieldCounts.set(
      "payload_shape",
      (invalidFieldCounts.get("payload_shape") ?? 0) + 1,
    );
    if (invalidSamples.length < 3) {
      invalidSamples.push(JSON.stringify({ invalidItem: candidate }));
    }
  }

  for (const raw of rawJobs) {
    if (parsedJobs.length >= input.effectiveMaxJobs) {
      break;
    }

    const rawSourceJobId = toStr(raw.sourceJobId);
    const rawCanonicalUrl =
      toStr(raw.canonicalUrl) || toStr(raw.url) || toStr(raw.link);
    const normalizedCompositeTitle = normalizeCompositeTitle(toStr(raw.title));

    const fallbackUrl =
      input.pageType === "job_detail" ? input.pageUrl : "";
    const derivedCanonicalUrl = buildGenericCanonicalUrl(
      rawCanonicalUrl || fallbackUrl,
      input.pageUrl,
    );
    const derivedSourceJobId =
      rawSourceJobId || buildGenericJobId(derivedCanonicalUrl);

    if (!derivedCanonicalUrl || !derivedSourceJobId) {
      skippedJobs += 1;
      invalidFieldCounts.set(
        "stable_identity",
        (invalidFieldCounts.get("stable_identity") ?? 0) + 1,
      );
      continue;
    }

    const responsibilities = toStringArray(raw.responsibilities);
    const minimumQualifications = toStringArray(
      raw.minimumQualifications ?? raw.requirements ?? raw.qualifications,
    );
    const preferredQualifications = toStringArray(
      raw.preferredQualifications ?? raw.preferredRequirements,
    );
const rawDescription = trimToNull(toStr(raw.description));
    const employerWebsiteUrl = toUrlOrNull(raw.employerWebsiteUrl);
    const summary =
      input.pageType === "search_results"
        ? trimToNull(raw.summary)
        : (trimToNull(raw.summary) ??
          summarizeJobPosting({
            title: toStr(raw.title),
            company: toStr(raw.company),
            description: rawDescription ?? "",
            responsibilities,
            minimumQualifications,
            preferredQualifications,
          }));
    const description =
      rawDescription ??
      (input.pageType === "search_results"
        ? (summary ?? `${toStr(raw.title)} opportunity at ${toStr(raw.company)}`)
        : summary ?? "");
    const normalizedCompany =
      trimToNull(raw.company) ?? inferCompanyFromCanonicalUrl(derivedCanonicalUrl);
    const normalizedLocation =
      trimToNull(raw.location) ?? normalizedCompositeTitle.location;
    const normalizedPostedAtText =
      trimToNull(raw.postedAtText ?? raw.postedLabel ?? raw.postedRelative) ??
      normalizedCompositeTitle.postedAtText;
    const candidate = {
      source: "target_site" as const,
      sourceJobId: derivedSourceJobId,
      discoveryMethod: "browser_agent" as const,
      canonicalUrl: derivedCanonicalUrl,
      title: normalizedCompositeTitle.title || toStr(raw.title),
      company: normalizedCompany ?? "",
      location: normalizedLocation ?? "",
      workMode: toWorkModeArray(raw.workMode),
      applyPath:
        raw.applyPath === "easy_apply" ||
        raw.applyPath === "external_redirect" ||
        raw.applyPath === "unknown"
          ? raw.applyPath
          : "unknown",
      easyApplyEligible: raw.easyApplyEligible === true,
      postedAt: toIsoDateTimeOrNull(raw.postedAt),
      postedAtText: normalizedPostedAtText,
      discoveredAt: new Date().toISOString(),
      salaryText: raw.salaryText ? toStr(raw.salaryText) : null,
      summary,
      description,
      keySkills: toStringArray(raw.keySkills),
      responsibilities,
      minimumQualifications,
      preferredQualifications,
      seniority: trimToNull(raw.seniority ?? raw.level),
      employmentType: trimToNull(raw.employmentType),
      department: trimToNull(raw.department),
      team: trimToNull(raw.team),
      employerWebsiteUrl,
      employerDomain: (() => {
        const explicitHost = toHostnameOrNull(employerWebsiteUrl);
        if (explicitHost) {
          return explicitHost;
        }

        const canonicalHost = toHostnameOrNull(derivedCanonicalUrl);
        return canonicalHost && !isLikelyJobBoardHost(canonicalHost)
          ? canonicalHost
          : null;
      })(),
      benefits: toStringArray(raw.benefits),
    };

    const parsed = JobPostingSchema.safeParse(candidate);
    if (parsed.success) {
      parsedJobs.push(parsed.data);
      continue;
    }

    skippedJobs += 1;
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      const normalizedField =
        typeof field === "string" && field.length > 0 ? field : "unknown";
      invalidFieldCounts.set(
        normalizedField,
        (invalidFieldCounts.get(normalizedField) ?? 0) + 1,
      );
    }

    if (invalidSamples.length < 3) {
      invalidSamples.push(buildInvalidJobSample(candidate));
    }
  }

  if (skippedJobs > 0) {
    console.warn(
      `[AI Provider] Model returned ${rawJobCandidates.length} job candidates on ${input.pageHostLabel}; extracted ${parsedJobs.length} valid jobs and skipped ${skippedJobs} invalid jobs. Top invalid fields: ${describeInvalidFieldCounts(invalidFieldCounts)}`,
    );

    if (invalidSamples.length > 0) {
      console.warn(
        `[AI Provider] Invalid job samples: ${invalidSamples.join(" | ")}`,
      );
    }
  }

  return parsedJobs;
}
