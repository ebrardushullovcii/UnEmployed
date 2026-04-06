import type { JobPosting } from "@unemployed/contracts";

export type ExtractedJobInput = Pick<
  JobPosting,
  | "sourceJobId"
  | "canonicalUrl"
  | "title"
  | "company"
  | "location"
  | "description"
  | "salaryText"
  | "summary"
  | "postedAt"
  | "workMode"
  | "applyPath"
  | "easyApplyEligible"
  | "keySkills"
> &
  Partial<
    Pick<
      JobPosting,
      | "postedAtText"
      | "responsibilities"
      | "minimumQualifications"
      | "preferredQualifications"
      | "seniority"
      | "employmentType"
      | "department"
      | "team"
      | "employerWebsiteUrl"
      | "employerDomain"
      | "benefits"
    >
  >;

export interface StructuredDataJobCandidate {
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
  workMode?: readonly string[] | null;
  applyPath?: JobPosting["applyPath"] | null;
  easyApplyEligible?: boolean | null;
  keySkills?: readonly string[] | null;
  responsibilities?: readonly string[] | null;
  minimumQualifications?: readonly string[] | null;
  preferredQualifications?: readonly string[] | null;
  seniority?: string | null;
  employmentType?: string | null;
  department?: string | null;
  team?: string | null;
  employerWebsiteUrl?: string | null;
  employerDomain?: string | null;
  benefits?: readonly string[] | null;
}

export interface SearchResultCardCandidate {
  canonicalUrl: string;
  anchorText: string;
  headingText: string | null;
  lines: string[];
}

const WORK_MODE_VALUES = ["remote", "hybrid", "onsite", "flexible"] as const;
const EASY_APPLY_PATTERN =
  /\b(easy apply|quick apply|one[- ]click apply|apply instantly|instant apply)\b/i;
const APPLY_PATTERN = /\bapply\b/i;
const POSTED_PATTERN =
  /\b(posted|ago|today|yesterday|just posted)\b/i;
const SALARY_PATTERN =
  /(\$|€|£)\s?\d[\d,.]*(?:\s?[kKmM])?(?:\s?(?:-|–|to)\s?(?:\$|€|£)?\s?\d[\d,.]*(?:\s?[kKmM])?)?(?:\s?\/?\s?(?:yr|year|month|mo|week|wk|day|hour|hr))?/;
const COMPANY_NOISE_PATTERN =
  /\b(save|saved|share|apply|easy apply|quick apply|view|see more|show more|details|posted|ago|today|yesterday|salary|compensation|remote|hybrid|on[- ]site|onsite|full[- ]time|part[- ]time|contract|intern(ship)?|temporary|promoted|featured)\b/i;
const LOCATION_HINT_PATTERN =
  /\b(remote|hybrid|on[- ]site|onsite|work from home|home office|worldwide|global|anywhere)\b/i;
const EMPLOYMENT_TYPE_PATTERN =
  /\b(full[- ]time|part[- ]time|contract|temporary|intern(ship)?|freelance)\b/i;

function cleanLine(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function uniqueStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();

  return values.flatMap((value) => {
    const normalized = cleanLine(value);

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

function canonicalizeUrl(url: string | null | undefined, baseUrl: string): string {
  const normalizedUrl = cleanLine(url);

  if (!normalizedUrl) {
    return "";
  }

  try {
    const parsed = new URL(normalizedUrl, baseUrl);

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }

    for (const key of [...parsed.searchParams.keys()]) {
      const lowered = key.toLowerCase();
      if (
        lowered.startsWith("utm_") ||
        lowered === "trk" ||
        lowered === "trackingid" ||
        lowered === "currentjobid" ||
        lowered === "selectedjobid"
      ) {
        parsed.searchParams.delete(key);
      }
    }

    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function buildGenericJobId(url: string): string {
  try {
    const parsed = new URL(url);
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
      .map((key) => parsed.searchParams.get(key))
      .filter((value): value is string => Boolean(cleanLine(value)))
      .join("_");
    const rawValue = [parsed.hostname, parsed.pathname, interestingParams]
      .filter(Boolean)
      .join("_");

    return rawValue
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 160);
  } catch {
    return url
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 160);
  }
}

function normalizeStringArray(
  values: readonly string[] | null | undefined,
): string[] {
  return uniqueStrings((values ?? []).map((value) => cleanLine(value)));
}

function normalizeWorkModes(
  values: readonly string[] | null | undefined,
  text?: string,
): JobPosting["workMode"] {
  const detected = new Set<JobPosting["workMode"][number]>();

  for (const value of values ?? []) {
    const normalized = cleanLine(value).toLowerCase();
    if (normalized.includes("remote")) detected.add("remote");
    if (normalized.includes("hybrid")) detected.add("hybrid");
    if (normalized.includes("on-site") || normalized.includes("onsite")) {
      detected.add("onsite");
    }
    if (normalized.includes("flexible")) detected.add("flexible");
  }

  const haystack = cleanLine(text).toLowerCase();
  if (haystack) {
    if (haystack.includes("remote")) detected.add("remote");
    if (haystack.includes("hybrid")) detected.add("hybrid");
    if (haystack.includes("on-site") || haystack.includes("onsite")) {
      detected.add("onsite");
    }
    if (haystack.includes("flexible")) detected.add("flexible");
  }

  return WORK_MODE_VALUES.filter((value) => detected.has(value));
}

function toIsoDateTimeOrNull(value: string | null | undefined): string | null {
  const normalized = cleanLine(value);
  if (!normalized) {
    return null;
  }

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function trimToNull(value: string | null | undefined): string | null {
  const normalized = cleanLine(value);
  return normalized || null;
}

function stripCompanySuffix(value: string): string {
  return value.replace(/\s+[•·\-–—]\s+.*$/, "").trim();
}

function isLocationLike(value: string): boolean {
  const normalized = cleanLine(value);
  if (!normalized || normalized.length > 80) {
    return false;
  }

  if (LOCATION_HINT_PATTERN.test(normalized)) {
    return true;
  }

  if (SALARY_PATTERN.test(normalized) || POSTED_PATTERN.test(normalized)) {
    return false;
  }

  const tokens = normalized.split(/\s+/).filter(Boolean);
  const wordCount = tokens.length;
  if (normalized.includes(",") && wordCount <= 8) {
    return true;
  }

  if (wordCount <= 3) {
    return tokens.every((token) => /^[A-Z][\p{L}\p{N}.'’-]*$/u.test(token)) &&
      !COMPANY_NOISE_PATTERN.test(normalized);
  }

  return /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}\b/.test(normalized) &&
    wordCount <= 6 &&
    !COMPANY_NOISE_PATTERN.test(normalized);
}

function findSalaryText(lines: readonly string[]): string | null {
  for (const line of lines) {
    const match = cleanLine(line).match(SALARY_PATTERN);
    if (match?.[0]) {
      return cleanLine(match[0]);
    }
  }

  return null;
}

function findPostedAtText(lines: readonly string[]): string | null {
  return (
    lines.find((line) => POSTED_PATTERN.test(line) && cleanLine(line).length <= 80) ??
    null
  );
}

function findEmploymentType(lines: readonly string[]): string | null {
  const match = lines.find((line) => EMPLOYMENT_TYPE_PATTERN.test(line));
  return trimToNull(match);
}

function inferCompany(
  lines: readonly string[],
  title: string,
  location: string | null,
): string | null {
  const normalizedTitle = title.toLowerCase();
  const normalizedLocation = location?.toLowerCase() ?? null;

  for (const line of lines) {
    const normalized = cleanLine(line);
    const lowered = normalized.toLowerCase();

    if (
      !normalized ||
      lowered === normalizedTitle ||
      lowered === normalizedLocation ||
      normalized.length > 80 ||
      normalized.split(/\s+/).length > 8 ||
      COMPANY_NOISE_PATTERN.test(normalized) ||
      SALARY_PATTERN.test(normalized) ||
      POSTED_PATTERN.test(normalized) ||
      (normalizedLocation === null && isLocationLike(normalized))
    ) {
      continue;
    }

    return stripCompanySuffix(normalized);
  }

  return null;
}

function inferLocation(
  lines: readonly string[],
  workMode: JobPosting["workMode"],
): string | null {
  for (const line of lines) {
    if (LOCATION_HINT_PATTERN.test(cleanLine(line))) {
      return cleanLine(line);
    }
  }

  for (const line of lines) {
    if (isLocationLike(line)) {
      return cleanLine(line);
    }
  }

  if (workMode.includes("remote")) {
    return "Remote";
  }

  if (workMode.includes("hybrid")) {
    return "Hybrid";
  }

  return null;
}

function buildSummaryAndDescription(input: {
  lines: readonly string[];
  title: string;
  company: string;
  location: string;
}): { summary: string; description: string } {
  const excluded = new Set(
    [input.title, input.company, input.location].map((value) =>
      value.toLowerCase(),
    ),
  );
  const contentLines = input.lines.filter((line) => {
    const normalized = cleanLine(line);
    if (!normalized) {
      return false;
    }

    const lowered = normalized.toLowerCase();
    return (
      !excluded.has(lowered) &&
      !POSTED_PATTERN.test(normalized) &&
      !SALARY_PATTERN.test(normalized) &&
      !APPLY_PATTERN.test(normalized)
    );
  });

  const summary =
    contentLines.find((line) => cleanLine(line).length >= 24) ??
    contentLines[0] ??
    `${input.title} role at ${input.company}`;
  const description = uniqueStrings(contentLines).join(" ") || summary;

  return {
    summary: cleanLine(summary).slice(0, 280),
    description: cleanLine(description),
  };
}

function mergeJob(
  current: ExtractedJobInput | undefined,
  candidate: ExtractedJobInput,
): ExtractedJobInput {
  if (!current) {
    return candidate;
  }

  return {
    ...current,
    ...candidate,
    sourceJobId: current.sourceJobId || candidate.sourceJobId,
    title:
      current.title.length >= candidate.title.length
        ? current.title
        : candidate.title,
    company:
      current.company.length >= candidate.company.length
        ? current.company
        : candidate.company,
    location:
      current.location.length >= candidate.location.length
        ? current.location
        : candidate.location,
    summary:
      (candidate.summary && candidate.summary.length > (current.summary?.length ?? 0)
        ? candidate.summary
        : current.summary) ?? null,
    description:
      candidate.description.length > current.description.length
        ? candidate.description
        : current.description,
    salaryText: candidate.salaryText ?? current.salaryText ?? null,
    postedAt: candidate.postedAt ?? current.postedAt ?? null,
    postedAtText: candidate.postedAtText ?? current.postedAtText ?? null,
    workMode: uniqueStrings([...(current.workMode ?? []), ...(candidate.workMode ?? [])])
      .filter((value): value is JobPosting["workMode"][number] =>
        WORK_MODE_VALUES.includes(value as JobPosting["workMode"][number]),
      ),
    easyApplyEligible: current.easyApplyEligible || candidate.easyApplyEligible,
    applyPath:
      current.applyPath === "easy_apply" || candidate.applyPath === "easy_apply"
        ? "easy_apply"
        : current.applyPath,
    keySkills: uniqueStrings([...(current.keySkills ?? []), ...(candidate.keySkills ?? [])]),
    responsibilities: uniqueStrings([
      ...(current.responsibilities ?? []),
      ...(candidate.responsibilities ?? []),
    ]),
    minimumQualifications: uniqueStrings([
      ...(current.minimumQualifications ?? []),
      ...(candidate.minimumQualifications ?? []),
    ]),
    preferredQualifications: uniqueStrings([
      ...(current.preferredQualifications ?? []),
      ...(candidate.preferredQualifications ?? []),
    ]),
    seniority: current.seniority ?? candidate.seniority ?? null,
    employmentType: current.employmentType ?? candidate.employmentType ?? null,
    department: current.department ?? candidate.department ?? null,
    team: current.team ?? candidate.team ?? null,
    employerWebsiteUrl: current.employerWebsiteUrl ?? candidate.employerWebsiteUrl ?? null,
    employerDomain: current.employerDomain ?? candidate.employerDomain ?? null,
    benefits: uniqueStrings([...(current.benefits ?? []), ...(candidate.benefits ?? [])]),
  };
}

function buildJobFromStructuredData(
  candidate: StructuredDataJobCandidate,
  pageUrl: string,
): ExtractedJobInput | null {
  const canonicalUrl = canonicalizeUrl(candidate.canonicalUrl, pageUrl);
  const title = cleanLine(candidate.title);
  const company = cleanLine(candidate.company);
  const workMode = normalizeWorkModes(candidate.workMode, candidate.location ?? undefined);
  const location = cleanLine(candidate.location) || inferLocation([], workMode);
  const description = cleanLine(candidate.description) || cleanLine(candidate.summary);

  if (!canonicalUrl || !title || !company || !location || !description) {
    return null;
  }

  return {
    sourceJobId: cleanLine(candidate.sourceJobId) || buildGenericJobId(canonicalUrl),
    canonicalUrl,
    title,
    company,
    location,
    description,
    salaryText: trimToNull(candidate.salaryText),
    summary: trimToNull(candidate.summary) ?? description.slice(0, 280),
    postedAt: toIsoDateTimeOrNull(candidate.postedAt),
    postedAtText: trimToNull(candidate.postedAtText),
    workMode,
    applyPath: candidate.applyPath === "easy_apply" ? "easy_apply" : "unknown",
    easyApplyEligible: candidate.easyApplyEligible === true,
    keySkills: normalizeStringArray(candidate.keySkills),
    responsibilities: normalizeStringArray(candidate.responsibilities),
    minimumQualifications: normalizeStringArray(candidate.minimumQualifications),
    preferredQualifications: normalizeStringArray(candidate.preferredQualifications),
    seniority: trimToNull(candidate.seniority),
    employmentType: trimToNull(candidate.employmentType),
    department: trimToNull(candidate.department),
    team: trimToNull(candidate.team),
    employerWebsiteUrl: trimToNull(candidate.employerWebsiteUrl),
    employerDomain: trimToNull(candidate.employerDomain),
    benefits: normalizeStringArray(candidate.benefits),
  };
}

function buildJobFromCardCandidate(
  candidate: SearchResultCardCandidate,
  pageUrl: string,
): ExtractedJobInput | null {
  const canonicalUrl = canonicalizeUrl(candidate.canonicalUrl, pageUrl);
  const title = cleanLine(candidate.headingText) || cleanLine(candidate.anchorText);
  const lines = uniqueStrings(candidate.lines);
  const metadataLines = lines.filter(
    (line) => cleanLine(line).toLowerCase() !== title.toLowerCase(),
  );
  const workMode = normalizeWorkModes(metadataLines, metadataLines.join(" "));
  const initialLocation = inferLocation(metadataLines, workMode);
  const initialCompany = inferCompany(metadataLines, title, initialLocation);
  const location = initialLocation ?? inferLocation(
    metadataLines.filter((line) => cleanLine(line).toLowerCase() !== (initialCompany?.toLowerCase() ?? "")),
    workMode,
  );
  const company = initialCompany ?? inferCompany(
    metadataLines.filter((line) => cleanLine(line).toLowerCase() !== (location?.toLowerCase() ?? "")),
    title,
    location,
  );

  if (!canonicalUrl || !title || !company || !location) {
    return null;
  }

  const { summary, description } = buildSummaryAndDescription({
    lines,
    title,
    company,
    location,
  });

  return {
    sourceJobId: buildGenericJobId(canonicalUrl),
    canonicalUrl,
    title,
    company,
    location,
    description,
    salaryText: findSalaryText(lines),
    summary,
    postedAt: null,
    postedAtText: findPostedAtText(lines),
    workMode,
    applyPath: EASY_APPLY_PATTERN.test(lines.join(" ")) ? "easy_apply" : "unknown",
    easyApplyEligible: EASY_APPLY_PATTERN.test(lines.join(" ")),
    keySkills: [],
    responsibilities: [],
    minimumQualifications: [],
    preferredQualifications: [],
    seniority: null,
    employmentType: findEmploymentType(lines),
    department: null,
    team: null,
    employerWebsiteUrl: null,
    employerDomain: null,
    benefits: [],
  };
}

export function buildStructuredCandidateJobs(input: {
  pageUrl: string;
  maxJobs: number;
  structuredDataCandidates?: readonly StructuredDataJobCandidate[];
  cardCandidates?: readonly SearchResultCardCandidate[];
}): ExtractedJobInput[] {
  const jobsByCanonicalUrl = new Map<string, ExtractedJobInput>();

  for (const candidate of input.structuredDataCandidates ?? []) {
    const job = buildJobFromStructuredData(candidate, input.pageUrl);
    if (!job) {
      continue;
    }

    jobsByCanonicalUrl.set(
      job.canonicalUrl,
      mergeJob(jobsByCanonicalUrl.get(job.canonicalUrl), job),
    );
  }

  for (const candidate of input.cardCandidates ?? []) {
    const job = buildJobFromCardCandidate(candidate, input.pageUrl);
    if (!job) {
      continue;
    }

    jobsByCanonicalUrl.set(
      job.canonicalUrl,
      mergeJob(jobsByCanonicalUrl.get(job.canonicalUrl), job),
    );
  }

  return [...jobsByCanonicalUrl.values()].slice(0, Math.max(0, input.maxJobs));
}
