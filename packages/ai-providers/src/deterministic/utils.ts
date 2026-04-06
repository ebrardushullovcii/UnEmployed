import { knownPersonalWebsitePlatformDomains, likelyPersonalWebsitePaths, resumeSectionHeadings } from "./constants";

export function uniqueStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();

  return values.flatMap((value) => {
    const normalized = value.trim();

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

export function cleanLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function splitLines(value: string): string[] {
  return value.split(/\r?\n/).map(cleanLine).filter(Boolean);
}

export function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function extractRegexMatch(value: string, expression: RegExp): string | null {
  const match = value.match(expression);
  return cleanLine(match?.[0] ?? "") || null;
}

export function extractFirstUrl(value: string, expression: RegExp): string | null {
  const match = value.match(expression);
  return match?.[0] ?? null;
}

export function isResumeSectionHeading(line: string): boolean {
  return resumeSectionHeadings.has(line.toUpperCase());
}

export function findSectionBodyLines(lines: readonly string[], heading: string): string[] {
  const startIndex = lines.findIndex(
    (line) => line.toUpperCase() === heading.toUpperCase(),
  );

  if (startIndex === -1) {
    return [];
  }

  const body: string[] = [];

  for (const line of lines.slice(startIndex + 1)) {
    if (isResumeSectionHeading(line)) {
      break;
    }

    body.push(line);
  }

  return body;
}

export function findSectionBodyLinesByAliases(
  lines: readonly string[],
  aliases: readonly string[],
): string[] {
  for (const alias of aliases) {
    const body = findSectionBodyLines(lines, alias);

    if (body.length > 0) {
      return body;
    }
  }

  return [];
}

export function titleCaseWords(value: string): string {
  return cleanLine(
    value
      .toLowerCase()
      .replace(/\b[a-z]/g, (character) => character.toUpperCase()),
  );
}

export function normalizeLocationLabel(value: string | null): string | null {
  if (!value) {
    return null;
  }

  return /[A-Z]{2,}/.test(value) ? titleCaseWords(value) : cleanLine(value);
}

export function extractAllUrls(resumeText: string): string[] {
  return uniqueStrings(
    (resumeText.match(/https?:\/\/[^\s]+/gi) ?? []).map((url) =>
      url.replace(/[),.;]+$/, ""),
    ),
  );
}

export function isKnownPlatformDomain(hostname: string): boolean {
  return knownPersonalWebsitePlatformDomains.some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
  );
}

export function hasLikelyPersonalWebsitePath(url: URL): boolean {
  if (url.search || url.hash) {
    return false;
  }

  const normalizedPath = url.pathname.replace(/\/+$/, "") || "/";
  return likelyPersonalWebsitePaths.has(normalizedPath.toLowerCase());
}

export function isLikelyPersonalWebsiteUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();

    if (isKnownPlatformDomain(hostname)) {
      return false;
    }

    return hasLikelyPersonalWebsitePath(parsedUrl);
  } catch {
    return false;
  }
}

export function buildGenericCanonicalUrl(url: string, baseUrl?: string): string {
  const trimmedUrl = url.trim();

  if (!trimmedUrl) {
    return "";
  }

  try {
    const parsedUrl = new URL(trimmedUrl, baseUrl);

    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return "";
    }

    for (const key of [...parsedUrl.searchParams.keys()]) {
      if (key.toLowerCase().startsWith("utm_")) {
        parsedUrl.searchParams.delete(key);
      }
    }

    parsedUrl.hash = "";
    return parsedUrl.toString();
  } catch {
    return "";
  }
}

export function buildGenericJobId(url: string): string {
  const canonicalUrl = buildGenericCanonicalUrl(url);

  try {
    const parsedUrl = new URL(canonicalUrl);
    const interestingParamKeys = [
      "id",
      "job",
      "jobid",
      "job_id",
      "gh_jid",
      "req",
      "reqid",
      "opening",
    ];
    const interestingParams = interestingParamKeys
      .map((key) => parsedUrl.searchParams.get(key))
      .filter((value): value is string => Boolean(value?.trim()))
      .join("_");
    const rawValue = [parsedUrl.hostname, parsedUrl.pathname, interestingParams]
      .filter(Boolean)
      .join("_");

    return rawValue
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 160);
  } catch {
    return canonicalUrl
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 160);
  }
}

export function describeInvalidFieldCounts(fieldCounts: Map<string, number>): string {
  const rankedFields = [...fieldCounts.entries()]
    .sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
    )
    .slice(0, 5);

  return rankedFields.length > 0
    ? rankedFields.map(([field, count]) => `${field}(${count})`).join(", ")
    : "unknown_validation_failure";
}

export function buildInvalidJobSample(candidate: {
  canonicalUrl: string;
  title: string;
  company: string;
  location: string;
  summary: string | null;
  description: string;
}): string {
  return JSON.stringify({
    url: candidate.canonicalUrl,
    title: candidate.title,
    company: candidate.company,
    location: candidate.location,
    summaryLength: candidate.summary?.length ?? 0,
    descriptionLength: candidate.description.length,
  });
}
