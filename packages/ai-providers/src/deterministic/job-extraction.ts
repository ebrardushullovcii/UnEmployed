import { titleCaseWords } from "./utils";

const COMPOSITE_POSTED_SUFFIX_PATTERN =
  /(?:posted\s+)?(?:\d+\s*(?:day|days|week|weeks|month|months|hour|hours|hr|hrs|dit[eë]?|jav[eë]?|jave|muaj(?:sh)?|ore?)(?:\s+ago)?|today|yesterday|just posted|sot|dje)$/iu;
const ROLE_TOKEN_PATTERN =
  /^(?:engineer|engineering|developer|architect|manager|designer|writer|scientist|researcher|analyst|specialist|representative|accountant|technician|nurse|lawyer|operator|agent|recruiter|planner|strategist|controller|auditor|officer|assistant|supervisor|president|partner|support|sales|marketing|data|software|product|qa|frontend|backend|react|category|customer|experience|work|senior|junior|lead|principal|staff|intern|associate|director|head|chief|coordinator|consultant|administrator|executive|trainee|apprentice|sr|jr|ii|iii)$/i;
const LOCATION_HINT_PATTERN =
  /\b(remote|hybrid|on[- ]site|onsite|work from home|home office|worldwide|global|anywhere)\b/i;
const GENERIC_JOB_PATH_SEGMENTS = new Set([
  "en",
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
  "team",
  "teams",
  "department",
  "departments",
  "listing",
  "listings",
  "posting",
  "postings",
  "browse",
  "browses",
  "detail",
  "details",
  "offer",
  "offers",
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
const LANGUAGE_OR_REGION_PATH_PATTERN = /^[a-z]{2}(?:-[a-z]{2})?$/i;

function trimStringToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isLocationLike(value: string): boolean {
  const normalized = trimStringToNull(value);
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
    return tokens.every((token) => /^[\p{Lu}][\p{L}\p{N}.'’-]*$/u.test(token));
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
    const candidateTokens = tokens.slice(-width);
    const normalizedCandidate = candidate.replace(/[^\p{L}\p{N}]+/gu, "");
    if (
      width > 1 &&
      candidateTokens.some((token) =>
        ROLE_TOKEN_PATTERN.test(token.replace(/[^\p{L}\p{N}]+/gu, "")),
      )
    ) {
      continue;
    }

    if (
      width === 1 &&
      !LOCATION_HINT_PATTERN.test(candidate) &&
      (tokens.length < 3 || ROLE_TOKEN_PATTERN.test(normalizedCandidate))
    ) {
      continue;
    }

    if (isLocationLike(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function normalizeCompositeTitle(value: string): {
  title: string;
  location: string | null;
  postedAtText: string | null;
} {
  const normalized = trimStringToNull(value) ?? "";
  const { content, postedAtText } = stripTrailingPostedAtText(normalized);
  const location = inferTrailingCompositeLocation(content);
  let title = content;
  if (location) {
    const locationPattern = new RegExp(
      `\\s+${location
        .split(/\s+/)
        .map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("\\s+")}\\s*$`,
      "i",
    );
    const match = content.match(locationPattern);
    if (match && typeof match.index === "number") {
      title = content
        .slice(0, match.index)
        .replace(/[\s–—-]+$/, "")
        .trim();
    } else if (
      location.length > 0 &&
      content.toLowerCase().endsWith(location.toLowerCase())
    ) {
      title = content
        .slice(0, Math.max(0, content.length - location.length))
        .replace(/[\s–—-]+$/, "")
        .trim();
    }
  }

  return {
    title: title || content,
    location,
    postedAtText,
  };
}

export function inferCompanyFromCanonicalUrl(url: string): string | null {
  const canonicalUrl = trimStringToNull(url);
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

    for (let index = 0; index < pathSegments.length - 1; index += 1) {
      const companySegment = pathSegments[index]?.toLowerCase() ?? "";
      const jobSegment = pathSegments[index + 1] ?? "";
      if (
        !companySegment ||
        GENERIC_JOB_PATH_SEGMENTS.has(companySegment) ||
        LANGUAGE_OR_REGION_PATH_PATTERN.test(companySegment)
      ) {
        continue;
      }

      if (
        companySegment.length <= 2 ||
        (!jobSegment.includes("-") && jobSegment.length <= 3) ||
        !/[a-z\p{L}]/iu.test(companySegment)
      ) {
        continue;
      }

      return titleCaseWords(companySegment.replace(/[-_]+/g, " "));
    }

    return null;
  } catch {
    return null;
  }
}
