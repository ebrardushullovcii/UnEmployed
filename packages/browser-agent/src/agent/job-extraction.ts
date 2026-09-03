import {
  formatEmployerLabelFromSlug,
  sanitizeObservedEmployerLabel,
  type JobPosting,
} from "@unemployed/contracts";

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
      | "providerUpdatedAt"
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
  providerUpdatedAt?: string | null;
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
  companyText?: string | null;
  /** Absolute `/company/{slug}` (or company job) href observed on the card. */
  companyHref?: string | null;
  locationText?: string | null;
  sourceJobIdHint?: string | null;
  captureMeta?: SearchResultCardCaptureMeta | null;
}

export interface SearchResultCardCaptureMeta {
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

export interface ExtractionSearchPreferences {
  targetRoles?: readonly string[];
  locations?: readonly string[];
}

const WORK_MODE_VALUES = ["remote", "hybrid", "onsite"] as const;
const EASY_APPLY_PATTERN =
  /\b(easy apply|quick apply|one[- ]click apply|apply instantly|instant apply)\b/i;
const APPLY_PATTERN = /\bapply\b/i;
const POSTED_PATTERN =
  /\b(posted|ago|today|yesterday|just posted|sot|dje|\d+\s*(?:day|days|week|weeks|month|months|hour|hours|hr|hrs|dit[eë]?|jav[eë]?|jave|muaj(?:sh)?|ore?))\b/iu;
const SALARY_PATTERN =
  /(\$|€|£)\s?\d[\d,.]*(?:\s?[kKmM])?(?:\s?(?:-|–|to)\s?(?:\$|€|£)?\s?\d[\d,.]*(?:\s?[kKmM])?)?(?:\s?\/?\s?(?:yr|year|month|mo|week|wk|day|hour|hr))?/;
const COMPANY_NOISE_PATTERN =
  /\b(save|saved|share|apply|easy apply|quick apply|view|see more|show more|details|posted|ago|today|yesterday|salary|compensation|remote|hybrid|on[- ]site|onsite|full[- ]time|part[- ]time|contract|intern(ship)?|temporary|promoted|featured)\b/i;
const LOCATION_HINT_PATTERN =
  /\b(remote|hybrid|on[- ]site|onsite|work from home|home office|worldwide|global|anywhere)\b/i;
const EMPLOYMENT_TYPE_PATTERN =
  /\b(full[- ]time|part[- ]time|contract|temporary|intern(ship)?|freelance)\b/i;
const COMPOSITE_POSTED_SUFFIX_PATTERN =
  /(?:posted\s+)?(?:\d+\s*(?:day|days|week|weeks|month|months|hour|hours|hr|hrs|dit[eë]?|jav[eë]?|jave|muaj(?:sh)?|ore?)(?:\s+ago)?|today|yesterday|just posted|sot|dje)$/iu;
const EXTRACTION_UI_NOISE_PATTERN =
  /\b(dismiss|viewed|promoted|follow|works here|school alumni|connection(?:s)?|verified job)\b/i;
const EXTRACTION_UI_SUFFIX_PATTERN =
  /\b(?:dismiss|viewed|promoted|follow|works here|school alumni|connection(?:s)?|posted on)\b.*$/i;
const EXTRACTION_UI_INLINE_NOISE_PATTERN =
  /\b(?:with verification|verified job|recommended|promoted|viewed|works here|school alumni|connection(?:s)?|actively reviewing applicants|be an early applicant)\b/gi;
const ROLE_TOKEN_PATTERN =
  /^(?:engineer|developer|manager|designer|analyst|specialist|support|sales|marketing|data|software|product|qa|frontend|backend|react|category|customer|experience|work)$/i;
const ROLE_SUFFIX_TOKENS = new Set([
  "senior",
  "staff",
  "lead",
  "principal",
  "junior",
  "mid",
  "level",
  "full",
  "stack",
  "go",
  "software",
  "frontend",
  "backend",
  "engineer",
  "developer",
  "architect",
  "qa",
  "react",
  "native",
  "application",
  "dotnet",
  ".net",
  "typescript",
  "javascript",
  "node",
  "nodejs",
  "python",
  "java",
  "golang",
  "ios",
  "android",
  "mobile",
  "cloud",
  "platform",
  "devops",
  "sre",
  "ai",
]);
const COMPANY_LEGAL_SUFFIX_PATTERN =
  /\b(?:gmbh|llc|l\.l\.c\.|inc|corp|co\.?|ltd|limited|plc|ag|sa|sarl|groupe|group|sh\.p\.k\.|shpk)\b/i;
const COMPANY_STYLE_SUFFIX_TOKENS = new Set([
  "agency",
  "careers",
  "consulting",
  "digital",
  "group",
  "labs",
  "media",
  "partners",
  "solutions",
  "studio",
  "studios",
  "systems",
  "technologies",
  "technology",
]);
const TECHNICAL_ROLE_SIGNAL_PATTERNS = [
  /\bsoftware\b/i,
  /\bdeveloper\b/i,
  /\bengineer\b/i,
  /\bfrontend\b/i,
  /\bbackend\b/i,
  /\bfull stack\b/i,
  /\bfullstack\b/i,
  /\bweb\b/i,
  /\bmobile\b/i,
  /\bdevops\b/i,
  /\bsdet\b/i,
  /\bqa automation\b/i,
  /\bplatform\b/i,
  /\bprogrammer\b/i,
  /\btypescript\b/i,
  /\bjavascript\b/i,
  /\breact\b/i,
  /\bnode\b/i,
  /\bdotnet\b/i,
  /\bcsharp\b/i,
  /\bpython\b/i,
  /\bjava\b/i,
] as const;
const TITLE_TOKEN_ALIASES = new Map<string, string>([
  ["developer", "engineer"],
  ["developers", "engineer"],
  ["dev", "engineer"],
]);
const LOCATION_NOISE_TOKENS = new Set([
  "remote",
  "hybrid",
  "onsite",
  "on",
  "site",
  "office",
  "home",
  "anywhere",
  "worldwide",
  "global",
]);
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
const SITE_UTILITY_PATH_SEGMENTS = new Set([
  "about",
  "about-us",
  "blog",
  "blogs",
  "browse",
  "candidates",
  "contact",
  "contact-us",
  "faq",
  "help",
  "hire",
  "hiring-data",
  "support",
  "privacy",
  "privacy-policy",
  "cookie-policy",
  "politika-e-privatesise",
  "politike-e-privatesise",
  "politike-privatesise",
  "politika-privatesise",
  "mbrojtja-e-te-dhenave",
  "mbrojtja-e-te-dhenave-personale",
  "terms",
  "terms-of-service",
  "legal",
  "login",
  "log-in",
  "signin",
  "sign-in",
  "signup",
  "sign-up",
  "register",
  "account",
  "kontakt",
  "krijo-cv",
  "create-cv",
  "create-resume",
  "llogaritja-e-pages",
  "location",
  "news",
  "press",
  "publiko",
  "role",
  "careers-home",
]);
const SITE_UTILITY_TITLE_PATTERN =
  /^(blog|blogs|news|about|about us|contact|contact us|kontakt|faq|help|support|privacy|privacy policy|cookie policy|politik[eë]\s+e\s+privat[eë]sis[eë]|politika\s+e\s+privat[eë]sis[eë]|terms|sign in|log in|login|register|sign up|create cv|krijo cv|create resume|home|homepage|view all jobs|view all .+ jobs|overview|locations|pricing|jobs|remote jobs|remote|trust|curated|wellfound|wellfound:ai|why wellfound|previous|next|platform status|privacy & cookies|terms & risks|salaries|for companies|get discovered|hire developers|create profile|recruit pro|try errgo|web3 jobs|tech startups|sign up with google|produktet|publiko konkurs|llogarite pag[eë]n|llogaritja e pages|www\.fb\.com\/kosovajob|fb\.com\/kosovajob)$/i;
// Albanian privacy titles often continue after "Privatësisë". Avoid `\b` after
// diacritics — JS word boundaries treat `ë` as non-word, so `\b` fails before space.
const SITE_UTILITY_ALBANIAN_PRIVACY_TITLE_PATTERN =
  /^politik[aeë]\s+e\s+privat[eë]sis[eë]/i;
const SITE_UTILITY_TITLE_PREFIX_PATTERN =
  /^(sign up with|view all|create profile|get discovered|for companies|hire developers|platform status|privacy|privacy policy|cookie policy|terms|remote jobs|web3 jobs|tech startups|recruit pro|try errgo|why wellfound|publiko|llogarite|llogaritja|www\.fb\.com\/|fb\.com\/)\b/i;
const SITE_UTILITY_OPEN_POSITIONS_TITLE_PATTERN = /^\d+\s+open positions$/i;
const TWO_PANE_RESULTS_LIST_CLASS_HINTS = [
  "jobs-search-results",
  "jobs-search-results-list",
  "jobs-search-two-pane",
  "scaffold-layout__list",
  "scaffold-layout__content",
  "job-card-container",
  "job-card-list",
] as const;
const TWO_PANE_DETAIL_PANE_CLASS_HINTS = [
  "jobs-search__job-details",
  "jobs-search-two-pane__details",
  "job-details",
  "jobs-details",
  "job-view-layout",
] as const;
const SPECIALIZED_TITLE_TOKEN_PHRASES = [
  ["full", "stack"],
  ["frontend"],
  ["backend"],
  ["react", "native"],
  ["qa", "automation"],
  ["site", "reliability"],
  ["machine", "learning"],
  ["devops"],
] as const;
const SEARCH_SURFACE_SCORE_WEIGHT = 25;
const SEARCH_TITLE_DOMINANCE_THRESHOLD = 20;
const TECHNICAL_ROLE_FALLBACK_BONUS = 900;
const TECHNICAL_ROLE_MISS_PENALTY = 650;

function cleanLine(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function normalizePreferenceText(
  value: string,
  mode: "title" | "location",
): string {
  const normalized = cleanLine(value)
    .replace(/\bfullstack\b/gi, "full stack")
    .replace(/\bfront\s*end\b/gi, "frontend")
    .replace(/\bback\s*end\b/gi, "backend")
    .replace(/(^|[^a-z0-9])c\s*\+\s*\+(?=$|[^a-z0-9])/gi, "$1cplusplus")
    .replace(/(^|[^a-z0-9])c\s*#(?=$|[^a-z0-9])/gi, "$1csharp")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  if (mode !== "location") {
    return normalized;
  }

  return normalized
    .replace(/\bon\s*site\b/gi, "onsite")
    .replace(/\bwork\s+from\s+home\b/gi, "remote");
}

function tokenizePreferenceValue(
  value: string,
  mode: "title" | "location",
): string[] {
  const tokens = normalizePreferenceText(value, mode)
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((token) => {
      if (mode === "location" && LOCATION_NOISE_TOKENS.has(token)) {
        return [];
      }

      if (mode === "title") {
        return [TITLE_TOKEN_ALIASES.get(token) ?? token];
      }

      return [token];
    });

  return [...new Set(tokens)];
}

function isEditDistanceAtMostOne(left: string, right: string): boolean {
  if (left === right) {
    return true;
  }

  const leftLength = left.length;
  const rightLength = right.length;
  if (Math.abs(leftLength - rightLength) > 1) {
    return false;
  }

  let leftIndex = 0;
  let rightIndex = 0;
  let mismatchCount = 0;

  while (leftIndex < leftLength && rightIndex < rightLength) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex += 1;
      rightIndex += 1;
      continue;
    }

    mismatchCount += 1;
    if (mismatchCount > 1) {
      return false;
    }

    if (leftLength > rightLength) {
      leftIndex += 1;
      continue;
    }

    if (rightLength > leftLength) {
      rightIndex += 1;
      continue;
    }

    leftIndex += 1;
    rightIndex += 1;
  }

  if (leftIndex < leftLength || rightIndex < rightLength) {
    mismatchCount += 1;
  }

  return mismatchCount <= 1;
}

function preferenceTokensEqual(left: string, right: string): boolean {
  if (left === right) {
    return true;
  }

  if (left.length < 6 || right.length < 6) {
    return false;
  }

  return isEditDistanceAtMostOne(left, right);
}

function countMatchedPreferenceTokens(
  desiredTokens: readonly string[],
  candidateTokens: readonly string[],
): number {
  const remainingCandidateTokens = [...candidateTokens];
  let matchedCount = 0;

  for (const desiredToken of desiredTokens) {
    const matchedIndex = remainingCandidateTokens.findIndex((candidateToken) =>
      preferenceTokensEqual(desiredToken, candidateToken),
    );

    if (matchedIndex === -1) {
      continue;
    }

    matchedCount += 1;
    remainingCandidateTokens.splice(matchedIndex, 1);
  }

  return matchedCount;
}

function matchesTechnicalRoleSignal(value: string | null | undefined): boolean {
  const normalized = cleanLine(value).toLowerCase();
  if (!normalized) {
    return false;
  }

  return TECHNICAL_ROLE_SIGNAL_PATTERNS.some((pattern) =>
    pattern.test(normalized),
  );
}

function hasTechnicalSearchIntent(
  searchPreferences?: ExtractionSearchPreferences,
): boolean {
  return (searchPreferences?.targetRoles ?? []).some((role) =>
    matchesTechnicalRoleSignal(role),
  );
}

function jobLooksTechnicallyRelevant(job: ExtractedJobInput): boolean {
  if (matchesTechnicalRoleSignal(job.title)) {
    return true;
  }

  if (job.keySkills.some((skill) => matchesTechnicalRoleSignal(skill))) {
    return true;
  }

  const evidenceText = [
    job.summary,
    job.description,
    ...(job.responsibilities ?? []),
    ...(job.minimumQualifications ?? []),
    ...(job.preferredQualifications ?? []),
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ");

  return matchesTechnicalRoleSignal(evidenceText);
}

function everyPreferenceTokenMatches(
  desiredTokens: readonly string[],
  candidateTokens: readonly string[],
): boolean {
  return desiredTokens.every((desiredToken) =>
    candidateTokens.some((candidateToken) =>
      preferenceTokensEqual(desiredToken, candidateToken),
    ),
  );
}

function titlePreferenceMatchPassesThreshold(
  desiredTokens: readonly string[],
  candidateTokens: readonly string[],
): boolean {
  if (desiredTokens.length === 0 || candidateTokens.length === 0) {
    return false;
  }

  const leadingDesiredToken = desiredTokens[0];
  if (leadingDesiredToken === undefined) {
    return false;
  }

  if (desiredTokens.length === 1) {
    return candidateTokens.some((candidateToken) =>
      preferenceTokensEqual(candidateToken, leadingDesiredToken),
    );
  }

  const normalizedCandidate = candidateTokens.join(" ");
  const normalizedDesired = desiredTokens.join(" ");
  if (
    normalizedDesired &&
    new RegExp(
      `(^|\\s)${normalizedDesired.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|\\s)`,
    ).test(normalizedCandidate)
  ) {
    return true;
  }

  if (everyPreferenceTokenMatches(desiredTokens, candidateTokens)) {
    return true;
  }

  const matchedCount = countMatchedPreferenceTokens(
    desiredTokens,
    candidateTokens,
  );
  const matchRatio = matchedCount / desiredTokens.length;

  if (desiredTokens.length === 2) {
    return matchedCount === 2;
  }

  if (desiredTokens.length === 3) {
    return matchedCount >= 2 && matchRatio >= 2 / 3;
  }

  return matchedCount >= 3 && matchRatio >= 0.6;
}

function containsTokenPhrase(
  haystack: readonly string[],
  phrase: readonly string[],
): boolean {
  if (phrase.length === 0 || haystack.length < phrase.length) {
    return false;
  }

  for (let index = 0; index <= haystack.length - phrase.length; index += 1) {
    const matchesPhrase = phrase.every((token, phraseIndex) =>
      preferenceTokensEqual(haystack[index + phraseIndex] ?? "", token),
    );
    if (matchesPhrase) {
      return true;
    }
  }

  return false;
}

function scoreSpecializedTitlePhraseMatch(
  desiredTokens: readonly string[],
  candidateTokens: readonly string[],
): number {
  return SPECIALIZED_TITLE_TOKEN_PHRASES.reduce((bestScore, phrase) => {
    if (
      !containsTokenPhrase(desiredTokens, phrase) ||
      !containsTokenPhrase(candidateTokens, phrase)
    ) {
      return bestScore;
    }

    return Math.max(bestScore, phrase.length * 2);
  }, 0);
}

function scorePreferenceMatch(
  candidate: string,
  desiredValues: readonly string[] | undefined,
  mode: "title" | "location",
): number {
  if (!desiredValues || desiredValues.length === 0) {
    return 0;
  }

  const candidateTokens = tokenizePreferenceValue(candidate, mode);
  if (candidateTokens.length === 0) {
    return 0;
  }

  let bestScore = 0;

  for (const desiredValue of desiredValues) {
    const desiredTokens = tokenizePreferenceValue(desiredValue, mode);
    if (desiredTokens.length === 0) {
      continue;
    }

    const matchedCount = countMatchedPreferenceTokens(
      desiredTokens,
      candidateTokens,
    );
    if (matchedCount === 0) {
      continue;
    }

    if (
      mode === "title" &&
      !titlePreferenceMatchPassesThreshold(desiredTokens, candidateTokens)
    ) {
      continue;
    }

    const matchRatio = matchedCount / desiredTokens.length;
    let score = matchedCount * 10 + Math.round(matchRatio * 10);

    if (matchedCount === desiredTokens.length) {
      score += 15;
    } else if (matchedCount >= 3 || matchRatio >= 0.6) {
      score += 8;
    }

    if (mode === "title") {
      score += scoreSpecializedTitlePhraseMatch(desiredTokens, candidateTokens);
    }

    bestScore = Math.max(bestScore, score);
  }

  return bestScore;
}

function scoreJobForPreferences(
  job: ExtractedJobInput,
  searchPreferences?: ExtractionSearchPreferences,
): number {
  const titleScore = scoreJobTitleForPreferences(job, searchPreferences);
  const locationScore = searchPreferences
    ? scorePreferenceMatch(
        job.location,
        searchPreferences.locations,
        "location",
      )
    : 0;
  const leadingSpecificLocationBonus = searchPreferences?.locations?.length
    ? Math.max(
        0,
        ...searchPreferences.locations.map((desiredLocation) => {
          const desiredTokens = tokenizePreferenceValue(
            desiredLocation,
            "location",
          );
          const candidateTokens = tokenizePreferenceValue(
            job.location,
            "location",
          );
          if (desiredTokens.length < 2 || candidateTokens.length === 0) {
            return 0;
          }

          const leadingDesiredToken = desiredTokens[0];
          if (leadingDesiredToken === undefined) {
            return 0;
          }

          return candidateTokens.some((candidateToken) =>
            preferenceTokensEqual(candidateToken, leadingDesiredToken),
          )
            ? 700
            : 0;
        }),
      )
    : 0;
  const locationSpecificityBonus = searchPreferences?.locations?.length
    ? Math.max(
        0,
        ...searchPreferences.locations.map((desiredLocation) => {
          const desiredTokens = tokenizePreferenceValue(
            desiredLocation,
            "location",
          );
          const candidateTokens = tokenizePreferenceValue(
            job.location,
            "location",
          );
          return desiredTokens
            .filter((desiredToken) =>
              candidateTokens.some((candidateToken) =>
                preferenceTokensEqual(desiredToken, candidateToken),
              ),
            )
            .reduce((sum, token) => sum + Math.min(token.length, 12), 0);
        }),
      )
    : 0;
  const broadTrailingLocationOnlyPenalty = searchPreferences?.locations?.length
    ? Math.max(
        0,
        ...searchPreferences.locations.map((desiredLocation) => {
          const desiredTokens = tokenizePreferenceValue(
            desiredLocation,
            "location",
          );
          const candidateTokens = tokenizePreferenceValue(
            job.location,
            "location",
          );
          if (desiredTokens.length < 2) {
            return 0;
          }

          const leadingDesiredToken = desiredTokens[0];
          if (leadingDesiredToken === undefined) {
            return 0;
          }

          const matchesLeadingSpecificToken = candidateTokens.some(
            (candidateToken) =>
              preferenceTokensEqual(candidateToken, leadingDesiredToken),
          );
          const matchesTrailingBroaderToken = desiredTokens
            .slice(1)
            .some((desiredToken) =>
              candidateTokens.some((candidateToken) =>
                preferenceTokensEqual(candidateToken, desiredToken),
              ),
            );

          return !matchesLeadingSpecificToken && matchesTrailingBroaderToken
            ? 600
            : 0;
        }),
      )
    : 0;

  const normalizedTitle = normalizePreferenceText(job.title, "title");
  const normalizedCompany = normalizePreferenceText(job.company, "title");
  const technicalSearchIntent = hasTechnicalSearchIntent(searchPreferences);
  const technicalRoleFallbackBonus =
    technicalSearchIntent &&
    titleScore === 0 &&
    jobLooksTechnicallyRelevant(job)
      ? TECHNICAL_ROLE_FALLBACK_BONUS
      : 0;
  let qualityPenalty = broadTrailingLocationOnlyPenalty;

  if ((cleanLine(job.title).match(/\S+/g) ?? []).length <= 1) {
    qualityPenalty += 400;
  }

  if (/\|\s*$/.test(cleanLine(job.title))) {
    qualityPenalty += 250;
  }

  if (/\bwith verification\b/i.test(job.company)) {
    qualityPenalty += 300;
  }

  if (
    normalizedTitle &&
    normalizedTitle.length >= 6 &&
    normalizedCompany &&
    normalizedCompany !== normalizedTitle &&
    normalizedCompany.includes(normalizedTitle)
  ) {
    qualityPenalty += 250;
  }

  if (
    technicalSearchIntent &&
    titleScore === 0 &&
    technicalRoleFallbackBonus === 0
  ) {
    qualityPenalty += TECHNICAL_ROLE_MISS_PENALTY;
  }

  return (
    titleScore * 100 +
    technicalRoleFallbackBonus +
    locationScore * 10 +
    leadingSpecificLocationBonus +
    locationSpecificityBonus * 10 +
    (job.easyApplyEligible ? 1 : 0) -
    qualityPenalty
  );
}

function scoreJobTitleForPreferences(
  job: ExtractedJobInput,
  searchPreferences?: ExtractionSearchPreferences,
): number {
  return searchPreferences
    ? scorePreferenceMatch(job.title, searchPreferences.targetRoles, "title")
    : 0;
}

export function isJobPreferenceAligned(input: {
  job: ExtractedJobInput;
  searchPreferences?: ExtractionSearchPreferences;
}): boolean {
  if (!input.searchPreferences) {
    return true;
  }

  const { searchPreferences, job } = input;

  if ((searchPreferences.targetRoles ?? []).length === 0) {
    return scoreJobForPreferences(job, searchPreferences) > 0;
  }

  const titleScore = scorePreferenceMatch(
    job.title,
    searchPreferences.targetRoles,
    "title",
  );
  if (titleScore > 0) {
    return true;
  }

  return (
    hasTechnicalSearchIntent(searchPreferences) &&
    jobLooksTechnicallyRelevant(job)
  );
}

function includesClassHint(
  value: string | null | undefined,
  hints: readonly string[],
): boolean {
  const normalized = cleanLine(value).toLowerCase();
  return hints.some((hint) => normalized.includes(hint));
}

function scoreSearchResultCardSurfaceQuality(
  candidate: SearchResultCardCandidate,
): number {
  const meta = candidate.captureMeta;
  if (!meta) {
    return 0;
  }

  let score = 0;

  if (meta.hasJobDataset) {
    score += 70;
  }

  if (meta.inLikelyResultsList) {
    score += 55;
  }

  if (
    includesClassHint(meta.rootClassName, TWO_PANE_RESULTS_LIST_CLASS_HINTS)
  ) {
    score += 40;
  }

  if (
    meta.hasDismissLabel ||
    candidate.lines.some((line) => /\bdismiss\b.*\bjob\b/i.test(line))
  ) {
    score += 25;
  }

  if (meta.intersectsViewport) {
    score += 150;
  } else if (meta.isVisible) {
    score += 50;
  }

  if (meta.sameRootJobAnchorCount <= 1) {
    score += 10;
  } else if (meta.sameRootJobAnchorCount >= 4) {
    score -= 25;
  }

  const viewportTop =
    typeof meta.viewportTop === "number" && Number.isFinite(meta.viewportTop)
      ? meta.viewportTop
      : null;
  if (viewportTop !== null) {
    if (viewportTop >= -48 && viewportTop <= 560) {
      score += 45;
    } else if (viewportTop > 560) {
      score -= Math.min(viewportTop - 560, 1600) / 18;
    } else if (viewportTop < -120) {
      score -= Math.min(Math.abs(viewportTop) - 120, 800) / 18;
    }
  }

  const viewportDistance =
    typeof meta.viewportDistance === "number" &&
    Number.isFinite(meta.viewportDistance)
      ? Math.max(0, meta.viewportDistance)
      : null;
  if (viewportDistance !== null) {
    score -= Math.min(viewportDistance, 1600) / 12;
  }

  if (meta.inDetailPane) {
    score -= 70;
  }

  if (includesClassHint(meta.rootClassName, TWO_PANE_DETAIL_PANE_CLASS_HINTS)) {
    score -= 55;
  }

  if (meta.inAside) {
    score -= 80;
  }

  if (meta.inHeader) {
    score -= 60;
  }

  if (meta.inNavigation) {
    score -= 80;
  }

  score += Math.min(candidate.lines.length, 8) * 3;
  score += Math.min(cleanLine(candidate.headingText).length, 40) / 4;
  score += Math.min(cleanLine(candidate.anchorText).length, 80) / 8;

  return Math.round(score);
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

function titleCaseWords(value: string): string {
  return value.replace(
    /\b\p{L}[\p{L}\p{N}]*/gu,
    (word) => word.charAt(0).toUpperCase() + word.slice(1),
  );
}

export function normalizeQueryParamKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function isJobIdShapedParamKey(key: string): boolean {
  const normalized = normalizeQueryParamKey(key);
  return normalized.includes("jobid") || normalized.endsWith("jid");
}

export function isTrackingShapedParamKey(key: string): boolean {
  const normalized = normalizeQueryParamKey(key);
  return normalized.startsWith("utm") || normalized.includes("track");
}

function safeDecodeUriComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseHttpUrl(value: string, baseUrl?: string): URL | null {
  const normalized = cleanLine(value);
  if (!normalized) {
    return null;
  }

  try {
    const parsed = new URL(normalized, baseUrl);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed
      : null;
  } catch {
    return null;
  }
}

const LEARNED_DETAIL_TEMPLATE_PLACEHOLDER = "{sourceJobId}";
const DETAIL_ROUTE_ID_SEGMENT_PATTERN = /\d{4,}|[0-9a-f]{8,}/i;
const REWRITABLE_DETAIL_ID_SEGMENT_PATTERN = /^(?:\d{4,}|[0-9a-f]{8,})$/i;
const EMBEDDED_JOB_ID_VALUE_PATTERN = /^\d{3,}$/;

export function findDetailRouteIdSegment(pathname: string): string | null {
  const segments = pathname.split("/").filter(Boolean);
  const lastSegment = segments.at(-1);
  if (!lastSegment) {
    return null;
  }

  const decoded = safeDecodeUriComponent(lastSegment);
  return DETAIL_ROUTE_ID_SEGMENT_PATTERN.test(decoded) ? decoded : null;
}

export interface LearnedSearchSurfaceRouteEvidence {
  readonly sharedSurfaceUrls: ReadonlySet<string>;
  readonly detailTemplatesByOrigin: ReadonlyMap<string, string>;
  readonly observedDetailIdsByOrigin: ReadonlyMap<string, ReadonlySet<string>>;
}

interface LearnedDetailRouteObservation {
  readonly prefixSegments: readonly string[];
  readonly id: string;
  readonly endsWithSlash: boolean;
}

function normalizeRouteIdentityKey(url: URL): string {
  return `${url.origin}${url.pathname}`;
}

export function observeLearnedSearchSurfaceRoutes(input: {
  pageUrl?: string | null;
  observedUrls: readonly (string | null | undefined)[];
  detailOnlyUrls?: readonly (string | null | undefined)[];
}): LearnedSearchSurfaceRouteEvidence {
  const routeKeyMeta = new Map<
    string,
    { count: number; hasIdSegment: boolean }
  >();
  const observationsByOrigin = new Map<
    string,
    LearnedDetailRouteObservation[]
  >();
  const seenObservationKeys = new Set<string>();

  const countRouteKey = (routeKey: string, hasIdSegment: boolean) => {
    const existing = routeKeyMeta.get(routeKey);
    routeKeyMeta.set(routeKey, {
      count: (existing?.count ?? 0) + 1,
      hasIdSegment: (existing?.hasIdSegment ?? false) || hasIdSegment,
    });
  };

  const pageUrl = parseHttpUrl(input.pageUrl ?? "");
  if (pageUrl) {
    countRouteKey(
      normalizeRouteIdentityKey(pageUrl),
      findDetailRouteIdSegment(pageUrl.pathname) !== null,
    );
  }

  const observeDetailRoute = (parsed: URL) => {
    const segments = parsed.pathname.split("/").filter(Boolean);
    const lastSegment = segments.at(-1);
    if (!lastSegment) {
      return;
    }

    const decodedId = safeDecodeUriComponent(lastSegment);
    if (!REWRITABLE_DETAIL_ID_SEGMENT_PATTERN.test(decodedId)) {
      return;
    }

    const observationKey = `${normalizeRouteIdentityKey(parsed)}#${decodedId}`;
    if (seenObservationKeys.has(observationKey)) {
      return;
    }
    seenObservationKeys.add(observationKey);

    const bucket = observationsByOrigin.get(parsed.origin) ?? [];
    bucket.push({
      prefixSegments: segments
        .slice(0, -1)
        .map((segment) => safeDecodeUriComponent(segment)),
      id: decodedId,
      endsWithSlash: parsed.pathname.endsWith("/"),
    });
    observationsByOrigin.set(parsed.origin, bucket);
  };

  for (const observedUrl of input.observedUrls) {
    const parsed = parseHttpUrl(observedUrl ?? "");
    if (!parsed) {
      continue;
    }

    countRouteKey(
      normalizeRouteIdentityKey(parsed),
      findDetailRouteIdSegment(parsed.pathname) !== null,
    );
    observeDetailRoute(parsed);
  }

  for (const detailOnlyUrl of input.detailOnlyUrls ?? []) {
    const parsed = parseHttpUrl(detailOnlyUrl ?? "");
    if (!parsed) {
      continue;
    }

    observeDetailRoute(parsed);
  }

  const sharedSurfaceUrls = new Set<string>();
  for (const [routeKey, meta] of routeKeyMeta) {
    if (meta.count >= 2 && !meta.hasIdSegment) {
      sharedSurfaceUrls.add(routeKey);
    }
  }

  const detailTemplatesByOrigin = new Map<string, string>();
  const observedDetailIdsByOrigin = new Map<string, Set<string>>();
  for (const [origin, observations] of observationsByOrigin) {
    const firstObservation = observations[0];
    if (!firstObservation) {
      continue;
    }

    let commonPrefix = firstObservation.prefixSegments;
    let allEndsWithSlash = true;
    for (const observation of observations) {
      if (!observation.endsWithSlash) {
        allEndsWithSlash = false;
      }

      const nextPrefix: string[] = [];
      const sharedLength = Math.min(
        commonPrefix.length,
        observation.prefixSegments.length,
      );
      for (
        let index = 0;
        index < sharedLength &&
        commonPrefix[index] === observation.prefixSegments[index];
        index += 1
      ) {
        const segment = commonPrefix[index];
        if (segment === undefined) break;
        nextPrefix.push(segment);
      }
      commonPrefix = nextPrefix;
    }

    if (commonPrefix.length === 0) {
      continue;
    }

    detailTemplatesByOrigin.set(
      origin,
      `/${[...commonPrefix, LEARNED_DETAIL_TEMPLATE_PLACEHOLDER].join("/")}${allEndsWithSlash ? "/" : ""}`,
    );
    observedDetailIdsByOrigin.set(
      origin,
      new Set(observations.map((observation) => observation.id)),
    );
  }

  return {
    sharedSurfaceUrls,
    detailTemplatesByOrigin,
    observedDetailIdsByOrigin,
  };
}

export function isSharedLearnedSurfaceUrl(
  url: string | null | undefined,
  evidence: LearnedSearchSurfaceRouteEvidence,
): boolean {
  const parsed = parseHttpUrl(cleanLine(url));
  return (
    parsed !== null &&
    evidence.sharedSurfaceUrls.has(normalizeRouteIdentityKey(parsed))
  );
}

function formatLearnedDetailUrl(
  origin: string,
  template: string,
  jobId: string,
): string {
  return `${origin}${template.replace(LEARNED_DETAIL_TEMPLATE_PLACEHOLDER, encodeURIComponent(jobId))}`;
}

export function buildLearnedDetailUrlFromHint(input: {
  url: string | null | undefined;
  pageUrl: string;
  sourceJobIdHint?: string | null;
  searchableText?: string | null;
  evidence: LearnedSearchSurfaceRouteEvidence;
}): string | null {
  const parsed =
    parseHttpUrl(cleanLine(input.url), input.pageUrl) ??
    parseHttpUrl(input.pageUrl);
  if (!parsed) {
    return null;
  }

  const template = input.evidence.detailTemplatesByOrigin.get(parsed.origin);
  if (!template) {
    return null;
  }

  const hint = canonicalizeNumericJobIdHint(input.sourceJobIdHint);
  if (hint) {
    return formatLearnedDetailUrl(parsed.origin, template, hint);
  }

  const text = cleanLine(input.searchableText).toLowerCase();
  if (!text) {
    return null;
  }

  for (const value of parsed.searchParams.values()) {
    const paramValue = cleanLine(value);
    if (
      EMBEDDED_JOB_ID_VALUE_PATTERN.test(paramValue) &&
      text.includes(paramValue.toLowerCase())
    ) {
      return formatLearnedDetailUrl(parsed.origin, template, paramValue);
    }
  }

  return null;
}

function canonicalizeUrl(
  url: string | null | undefined,
  baseUrl: string,
): string {
  const normalizedUrl = cleanLine(url);

  if (!normalizedUrl) {
    return "";
  }

  const parsed = parseHttpUrl(normalizedUrl, baseUrl);
  if (!parsed) {
    return "";
  }

  for (const key of [...parsed.searchParams.keys()]) {
    if (
      isTrackingShapedParamKey(key) ||
      isJobIdShapedParamKey(key) ||
      normalizeQueryParamKey(key).includes("geo")
    ) {
      parsed.searchParams.delete(key);
    }
  }

  if (findDetailRouteIdSegment(parsed.pathname)) {
    for (const key of [...parsed.searchParams.keys()]) {
      parsed.searchParams.delete(key);
    }
  }

  parsed.hash = "";
  return parsed.toString();
}

function canonicalizeNumericJobIdHint(
  value: string | null | undefined,
): string | null {
  const normalized = cleanLine(value);
  return /^\d+$/.test(normalized) ? normalized : null;
}

function buildSearchResultCardFingerprint(
  candidate: SearchResultCardCandidate,
): string {
  const fingerprint = uniqueStrings(
    [candidate.anchorText, candidate.headingText, ...candidate.lines]
      .filter((value): value is string => Boolean(value))
      .map((value) => cleanLine(value).toLowerCase()),
  )
    .join(" ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);

  return fingerprint || "candidate";
}

export function buildSearchResultCardMergeKey(input: {
  pageUrl: string;
  candidate: SearchResultCardCandidate;
  canonicalUrl?: string | null;
  evidence?: LearnedSearchSurfaceRouteEvidence;
}): string {
  const baseCanonicalUrl = cleanLine(
    input.canonicalUrl ?? input.candidate.canonicalUrl,
  );
  if (!baseCanonicalUrl) {
    return `card:${buildSearchResultCardFingerprint(input.candidate)}`;
  }

  const resolvedEvidence =
    input.evidence ??
    observeLearnedSearchSurfaceRoutes({
      pageUrl: input.pageUrl,
      observedUrls: [baseCanonicalUrl],
    });

  if (
    isSharedLearnedSurfaceUrl(baseCanonicalUrl, resolvedEvidence) &&
    !shouldCanonicalizeSearchSurfaceDetailRoute({
      candidate: input.candidate,
      pageUrl: input.pageUrl,
      evidence: resolvedEvidence,
    })
  ) {
    return `${baseCanonicalUrl}::card:${buildSearchResultCardFingerprint(input.candidate)}`;
  }

  return baseCanonicalUrl;
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

function normalizeDetectedWorkMode(
  value: string,
): JobPosting["workMode"][number] | null {
  const normalized = cleanLine(value).toLowerCase();

  if (!normalized) {
    return null;
  }

  if (normalized.includes("remote")) {
    return "remote";
  }

  if (normalized.includes("hybrid") || normalized.includes("flexible")) {
    return "hybrid";
  }

  if (
    normalized.includes("in_office") ||
    normalized.includes("in office") ||
    normalized.includes("on-site") ||
    normalized.includes("onsite")
  ) {
    return "onsite";
  }

  return null;
}

function normalizeWorkModes(
  values: readonly string[] | null | undefined,
  text?: string,
): JobPosting["workMode"] {
  const detected = new Set<JobPosting["workMode"][number]>();

  for (const value of values ?? []) {
    const normalizedWorkMode = normalizeDetectedWorkMode(value);
    if (normalizedWorkMode) {
      detected.add(normalizedWorkMode);
    }
  }

  const haystack = cleanLine(text).toLowerCase();
  if (haystack) {
    const normalizedWorkMode = normalizeDetectedWorkMode(haystack);
    if (normalizedWorkMode) {
      detected.add(normalizedWorkMode);
    }
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

function preferLatestIsoDateTime(
  current: string | null | undefined,
  candidate: string | null | undefined,
): string | null {
  const currentIso = toIsoDateTimeOrNull(current);
  const candidateIso = toIsoDateTimeOrNull(candidate);
  if (!currentIso) {
    return candidateIso;
  }
  if (!candidateIso) {
    return currentIso;
  }
  return Date.parse(candidateIso) > Date.parse(currentIso)
    ? candidateIso
    : currentIso;
}

function trimToNull(value: string | null | undefined): string | null {
  const normalized = cleanLine(value);
  return normalized || null;
}

function stripCompanySuffix(value: string): string {
  return value.replace(/\s+[•·\-–—]\s+.*$/, "").trim();
}

function stripExtractionUiSuffix(value: string): string {
  return cleanLine(value)
    .replace(EXTRACTION_UI_SUFFIX_PATTERN, "")
    .replace(EXTRACTION_UI_INLINE_NOISE_PATTERN, " ")
    .replace(/\(\s*\)/g, " ")
    .replace(/\s*[•·|]\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function trimMalformedTrailingRoleRepeat(value: string): string {
  const normalized = cleanLine(value);
  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length < 4) {
    return normalized;
  }

  const firstToken = normalizePreferenceText(tokens[0] ?? "", "title");
  const lastToken = normalizePreferenceText(tokens.at(-1) ?? "", "title");
  if (
    !firstToken ||
    !lastToken ||
    firstToken !== lastToken ||
    !ROLE_SUFFIX_TOKENS.has(firstToken)
  ) {
    return normalized;
  }

  return cleanLine(tokens.slice(0, -1).join(" "));
}

function normalizePotentialCompanyCandidate(value: string): string {
  const normalized = cleanLine(value);
  if (!normalized) {
    return "";
  }

  const withoutAtPrefix = cleanLine(normalized.replace(/^at\s+/i, ""))
    .replace(/[\s•·|–—-]+$/u, "")
    .trim();
  return withoutAtPrefix || normalized;
}

const SALARY_PATTERN_GLOBAL = new RegExp(SALARY_PATTERN.source, "gi");

function stripSalaryArtifacts(value: string): string {
  return cleanLine(
    value
      .replace(SALARY_PATTERN_GLOBAL, " ")
      .replace(/\/\s*(?:yr|year|month|mo|week|wk|day|hour|hr)\b/gi, " ")
      .replace(/\b(?:yr|year|month|mo|week|wk|day|hour|hr)\b/gi, " ")
      .replace(/\s*(?:-|–|to)\s*$/gi, " "),
  );
}

function splitTrailingCompanyLocation(value: string): {
  company: string | null;
  location: string | null;
} {
  const normalized = cleanLine(value);
  const tokens = normalized.split(/\s+/).filter(Boolean);
  let bestMatch: { company: string; location: string; score: number } | null =
    null;

  for (let width = 1; width <= Math.min(4, tokens.length - 1); width += 1) {
    const locationCandidate = cleanLine(tokens.slice(-width).join(" "));
    if (
      !locationCandidate ||
      !isLocationLike(locationCandidate, { allowSingleTokenGeneric: false })
    ) {
      continue;
    }

    const companyCandidate = normalizePotentialCompanyCandidate(
      cleanLine(tokens.slice(0, Math.max(0, tokens.length - width)).join(" ")),
    );
    if (
      !companyCandidate ||
      COMPANY_NOISE_PATTERN.test(companyCandidate) ||
      SALARY_PATTERN.test(companyCandidate) ||
      POSTED_PATTERN.test(companyCandidate) ||
      isRoleLikePhrase(companyCandidate)
    ) {
      continue;
    }

    const companyWordCount = companyCandidate
      .split(/\s+/)
      .filter(Boolean).length;
    let score = scoreLocationCandidate(locationCandidate, {
      allowSingleTokenGeneric: false,
    });
    if (isLikelyCompanyName(companyCandidate)) {
      score += 40;
    }
    if (companyWordCount >= 2 && companyWordCount <= 4) {
      score += 10;
    } else if (
      companyWordCount === 1 &&
      !/^[A-Z]{2,6}$/u.test(companyCandidate)
    ) {
      score -= 8;
    }
    if (/[()]/.test(locationCandidate)) {
      score += 4;
    }

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = {
        company: companyCandidate,
        location: locationCandidate,
        score,
      };
    }
  }

  return bestMatch
    ? { company: bestMatch.company, location: bestMatch.location }
    : { company: null, location: null };
}

function isLikelyCompanyName(value: string): boolean {
  const normalized = normalizePotentialCompanyCandidate(value);
  if (!normalized || normalized.length > 80) {
    return false;
  }

  if (
    COMPANY_NOISE_PATTERN.test(normalized) ||
    POSTED_PATTERN.test(normalized) ||
    SALARY_PATTERN.test(normalized) ||
    APPLY_PATTERN.test(normalized) ||
    EXTRACTION_UI_NOISE_PATTERN.test(normalized)
  ) {
    return false;
  }

  if (/\bconfidential(?:\s+careers)?\b/i.test(normalized)) {
    return true;
  }

  if (
    COMPANY_LEGAL_SUFFIX_PATTERN.test(normalized) ||
    looksLikeCompanyTrailingSegment(normalized)
  ) {
    return true;
  }

  if (isLocationLike(normalized) || isRoleLikePhrase(normalized)) {
    return false;
  }

  const tokens = normalized.match(/[\p{L}\p{N}.+#&'’-]+/gu) ?? [];
  if (tokens.length === 0 || tokens.length > 6) {
    return false;
  }

  return tokens.some((token) => /^[A-Z\p{L}\p{N}]/u.test(token));
}

function splitContaminatedTitleCompanySuffix(value: string): {
  title: string;
  company: string | null;
} {
  const normalized = cleanLine(stripExtractionUiSuffix(value));
  if (!normalized) {
    return { title: "", company: null };
  }

  const match = normalized.match(
    /^(?<title>.+?)(?:\s*[|•·-]\s*|\s+)at\s+(?<company>.+)$/i,
  );
  const rawTitle = cleanLine(match?.groups?.title).replace(/[\s|•·-]+$/, "");
  const rawCompany = normalizePotentialCompanyCandidate(
    match?.groups?.company ?? "",
  );
  const cleanedRawTitle = stripSalaryArtifacts(rawTitle);
  const trailingRawTitleMetadata =
    splitTrailingCompanyLocation(cleanedRawTitle);
  const inferredRawTitleLocation = inferLocation(
    [cleanedRawTitle],
    normalizeWorkModes([], cleanedRawTitle),
    { allowSingleTokenGeneric: false },
  );
  const reversedTitle = rawCompany;
  const reversedTitleLooksLikeRole = scoreCardTitleCandidate(reversedTitle) > 0;
  const rawTitleLooksLikeRole = scoreCardTitleCandidate(rawTitle) > 0;
  const rawTitleLooksLikeLocationOrMetadata =
    isLocationLike(rawTitle) ||
    isLocationLike(cleanedRawTitle) ||
    SALARY_PATTERN.test(rawTitle) ||
    trailingRawTitleMetadata.location !== null ||
    inferredRawTitleLocation !== null ||
    !rawTitleLooksLikeRole;
  const reversedCompanyFromRawTitle = normalizePotentialCompanyCandidate(
    trailingRawTitleMetadata.company
      ? trailingRawTitleMetadata.company
      : cleanLine(
          inferredRawTitleLocation
            ? cleanedRawTitle
                .slice(
                  0,
                  Math.max(
                    0,
                    cleanedRawTitle.length - inferredRawTitleLocation.length,
                  ),
                )
                .replace(/[\s|•·–—-]+$/, "")
            : cleanedRawTitle,
        ),
  );
  const reversedCompanyLooksPlausible =
    Boolean(reversedCompanyFromRawTitle) &&
    (isLikelyCompanyName(reversedCompanyFromRawTitle) ||
      (trailingRawTitleMetadata.location !== null &&
        !COMPANY_NOISE_PATTERN.test(reversedCompanyFromRawTitle) &&
        !SALARY_PATTERN.test(reversedCompanyFromRawTitle) &&
        !POSTED_PATTERN.test(reversedCompanyFromRawTitle) &&
        !isRoleLikePhrase(reversedCompanyFromRawTitle)) ||
      (!isLocationLike(reversedCompanyFromRawTitle) &&
        !isRoleLikePhrase(reversedCompanyFromRawTitle)));

  if (
    reversedTitleLooksLikeRole &&
    reversedCompanyLooksPlausible &&
    rawTitleLooksLikeLocationOrMetadata
  ) {
    return {
      title: reversedTitle,
      company: stripCompanySuffix(reversedCompanyFromRawTitle),
    };
  }

  if (!rawTitle || !rawCompany) {
    return { title: normalized, company: null };
  }

  if (
    scoreCardTitleCandidate(rawTitle) <= 0 ||
    !isLikelyCompanyName(rawCompany)
  ) {
    if (
      reversedTitle &&
      reversedTitleLooksLikeRole &&
      reversedCompanyLooksPlausible
    ) {
      return {
        title: reversedTitle,
        company: stripCompanySuffix(reversedCompanyFromRawTitle),
      };
    }

    return { title: normalized, company: null };
  }

  return {
    title: rawTitle,
    company: stripCompanySuffix(rawCompany),
  };
}

function recoverBetterCardTitleFromLines(input: {
  lines: readonly string[];
  fallbackTitle: string;
}): string | null {
  const fallbackScore = scoreCardTitleCandidate(input.fallbackTitle);
  const bestCandidate =
    uniqueStrings(input.lines)
      .flatMap((line) => {
        const candidates: string[] = [];
        const recoveredMetadataTitle = recoverTitleFromMetadataLine(
          line,
          input.fallbackTitle,
        );
        if (recoveredMetadataTitle) {
          candidates.push(recoveredMetadataTitle);
        }

        const splitTitleCompany = splitContaminatedTitleCompanySuffix(line);
        if (splitTitleCompany.company) {
          candidates.push(splitTitleCompany.title);
        }

        return uniqueStrings(
          candidates.map((candidateTitle) =>
            sanitizeCardTitle(
              normalizeCompositeCardTitle(
                stripExtractionUiSuffix(candidateTitle),
              ).title,
            ),
          ),
        );
      })
      .filter((candidateTitle) => {
        if (!candidateTitle) {
          return false;
        }

        if (
          cleanLine(candidateTitle).toLowerCase() ===
          cleanLine(input.fallbackTitle).toLowerCase()
        ) {
          return false;
        }

        if (
          /\sat\s+/i.test(candidateTitle) ||
          SALARY_PATTERN.test(candidateTitle)
        ) {
          return false;
        }

        if (
          isLocationLike(candidateTitle) ||
          isLikelyCompanyName(candidateTitle)
        ) {
          return false;
        }

        return scoreCardTitleCandidate(candidateTitle) > 0;
      })
      .sort(
        (left, right) =>
          scoreCardTitleCandidate(right) - scoreCardTitleCandidate(left),
      )[0] ?? null;

  if (!bestCandidate) {
    return null;
  }

  return scoreCardTitleCandidate(bestCandidate) > fallbackScore
    ? bestCandidate
    : null;
}

function cardShowsRecoverableUiNoise(
  candidate: SearchResultCardCandidate,
): boolean {
  const textLines = uniqueStrings([
    candidate.anchorText,
    candidate.headingText ?? "",
    ...candidate.lines,
  ]);
  const joinedLines = textLines.join(" ");
  return (
    EXTRACTION_UI_NOISE_PATTERN.test(joinedLines) ||
    /\bdismiss\b[\s\S]*\bjob\b/i.test(joinedLines) ||
    SALARY_PATTERN.test(cleanLine(candidate.headingText)) ||
    SALARY_PATTERN.test(cleanLine(candidate.anchorText)) ||
    textLines.some((line) => findRepeatedLeadingPhrase(line) !== null)
  );
}

function removeLeadingTitleEcho(value: string, title: string): string {
  const normalizedValue = cleanLine(value);
  const normalizedTitle = cleanLine(title);
  if (
    !normalizedValue ||
    !normalizedTitle ||
    normalizedTitle.split(/\s+/).length < 2
  ) {
    return normalizedValue;
  }

  const escapedTitle = normalizedTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return cleanLine(
    normalizedValue.replace(
      new RegExp(`^(?:${escapedTitle})(?:\\s*${escapedTitle})*\\s*`, "i"),
      "",
    ),
  );
}

function removeLeadingTitleSuffixOverlap(value: string, title: string): string {
  const normalizedValue = cleanLine(value);
  const valueTokens = normalizedValue.match(/[\p{L}\p{N}.+#-]+/gu) ?? [];
  const titleTokens = cleanLine(title).match(/[\p{L}\p{N}.+#-]+/gu) ?? [];
  if (valueTokens.length < 3 || titleTokens.length < 3) {
    return normalizedValue;
  }

  for (
    let width = Math.min(3, titleTokens.length - 1, valueTokens.length - 1);
    width >= 2;
    width -= 1
  ) {
    const titleSuffix = titleTokens
      .slice(-width)
      .map((token) => token.toLowerCase());
    const valuePrefix = valueTokens
      .slice(0, width)
      .map((token) => token.toLowerCase());
    if (titleSuffix.join(" ") !== valuePrefix.join(" ")) {
      continue;
    }

    const remaining = cleanLine(valueTokens.slice(width).join(" "));
    if (remaining) {
      return remaining;
    }
  }

  return normalizedValue;
}

function expandCompositeMetadataLine(value: string): string[] {
  const cleaned = stripExtractionUiSuffix(value);
  if (!cleaned) {
    return [];
  }

  const withoutTrailingCount =
    cleaned.replace(/\s+\d+\s*$/, "").trim() || cleaned;

  if (
    !/[•·|]/.test(withoutTrailingCount) &&
    isLocationLike(withoutTrailingCount) &&
    countMeaningfulLocationTokens(withoutTrailingCount) > 0
  ) {
    return [withoutTrailingCount];
  }

  const segments = withoutTrailingCount
    .split(/\s*[•·|]\s*/)
    .map((segment) => cleanLine(segment))
    .filter(Boolean);

  if (segments.length > 1) {
    return uniqueStrings([...segments, withoutTrailingCount]);
  }

  const inferredTrailingLocation =
    inferTrailingCompositeLocation(withoutTrailingCount);
  if (inferredTrailingLocation) {
    const prefix = withoutTrailingCount
      .slice(
        0,
        Math.max(
          0,
          withoutTrailingCount.length - inferredTrailingLocation.length,
        ),
      )
      .replace(/[\s•·|–—-]+$/, "")
      .trim();
    if (prefix) {
      return uniqueStrings([
        prefix,
        inferredTrailingLocation,
        withoutTrailingCount,
        cleaned,
      ]);
    }
  }

  return [withoutTrailingCount];
}

function sanitizeCardTitle(value: string): string {
  const cleaned = stripExtractionUiSuffix(value).replace(
    /\(verified job\)/gi,
    " ",
  );
  const leadingSegment = cleaned.split(/\s*[•·|]\s*/)[0] ?? cleaned;
  return trimMalformedTrailingRoleRepeat(cleanLine(leadingSegment));
}

function findRepeatedLeadingPhrase(value: string): string | null {
  const words = cleanLine(value).split(/\s+/).filter(Boolean);
  for (let width = Math.floor(words.length / 2); width >= 2; width -= 1) {
    const left = words.slice(0, width).join(" ");
    const right = words.slice(width, width * 2).join(" ");
    if (left && left.toLowerCase() === right.toLowerCase()) {
      return left;
    }
  }

  return null;
}

function normalizeExtractedJobTitle(input: {
  value: string | null | undefined;
  company?: string | null | undefined;
  location?: string | null | undefined;
}): string {
  const normalized = cleanLine(input.value);
  const workModeQualifiedRepeat = normalized.match(
    /^(?<title>.+?)\s+(?:\((?:remote|hybrid|on[- ]?site|onsite)\)|[-–—|•·]\s*(?:remote|hybrid|on[- ]?site|onsite))\s+\k<title>$/iu,
  );
  const workModeQualifiedTitle = cleanLine(
    workModeQualifiedRepeat?.groups?.title,
  );
  if (
    workModeQualifiedTitle &&
    scoreCardTitleCandidate(workModeQualifiedTitle) > 0
  ) {
    return workModeQualifiedTitle;
  }

  const repeatedTitle = findRepeatedLeadingPhrase(normalized);
  if (!repeatedTitle || scoreCardTitleCandidate(repeatedTitle) <= 0) {
    return normalized;
  }

  const escapedTitle = repeatedTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const suffix = cleanLine(
    normalized
      .replace(
        new RegExp(`^(?:${escapedTitle})(?:\\s+${escapedTitle})+\\s*`, "iu"),
        "",
      )
      .replace(/^[\s|•·–—-]+/u, ""),
  );

  if (!suffix) {
    return repeatedTitle;
  }

  const normalizedSuffix = suffix.toLocaleLowerCase();
  const beginsWithKnownMetadata = [input.company, input.location]
    .map((value) => cleanLine(value).replace(/^[\s|•·–—-]+/u, ""))
    .filter(Boolean)
    .some((value) => {
      const normalizedValue = value.toLocaleLowerCase();
      return (
        normalizedSuffix === normalizedValue ||
        normalizedSuffix.startsWith(`${normalizedValue} `) ||
        normalizedSuffix.startsWith(`${normalizedValue} •`) ||
        normalizedSuffix.startsWith(`${normalizedValue} ·`) ||
        normalizedSuffix.startsWith(`${normalizedValue} |`)
      );
    });

  return beginsWithKnownMetadata ? repeatedTitle : normalized;
}

function recoverTitleFromMetadataLine(
  line: string,
  fallbackTitle: string,
): string | null {
  const normalized = cleanLine(line);
  if (!normalized) {
    return null;
  }

  const repeatedTitlePrefix = findRepeatedLeadingPhrase(
    cleanLine(
      normalized.split(
        /\b(?:with verification|verified job|recommended|promoted|viewed|works here|school alumni|connection(?:s)?|actively reviewing applicants|be an early applicant)\b/i,
      )[0],
    ),
  );

  if (repeatedTitlePrefix) {
    const recoveredRepeatedTitle = sanitizeCardTitle(repeatedTitlePrefix);
    const escapedRepeatedTitle = recoveredRepeatedTitle.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&",
    );
    const repeatsAtStart =
      Boolean(recoveredRepeatedTitle) &&
      new RegExp(
        `^(?:${escapedRepeatedTitle})(?:\\s+${escapedRepeatedTitle})+\\b`,
        "i",
      ).test(normalized);
    if (
      recoveredRepeatedTitle &&
      (scoreCardTitleCandidate(recoveredRepeatedTitle) >
        scoreCardTitleCandidate(fallbackTitle) ||
        repeatsAtStart)
    ) {
      return recoveredRepeatedTitle;
    }
  }

  const cleaned = stripExtractionUiSuffix(line);
  if (!cleaned) {
    return null;
  }

  const withoutEcho = removeLeadingTitleEcho(cleaned, fallbackTitle);
  const leadingSegment = cleanLine(
    withoutEcho.split(/\s*[•·|]\s*/)[0] ?? withoutEcho,
  );
  if (!leadingSegment) {
    return null;
  }

  const compositeTitle = normalizeCompositeCardTitle(leadingSegment).title;
  const recovered = sanitizeCardTitle(compositeTitle || leadingSegment);
  if (!recovered) {
    return null;
  }

  return scoreCardTitleCandidate(recovered) >
    scoreCardTitleCandidate(fallbackTitle)
    ? recovered
    : null;
}

function looksLikeRecoveredTitleSource(
  line: string,
  fallbackTitle: string,
): boolean {
  const normalized = cleanLine(line);
  if (!normalized) {
    return false;
  }

  if (/\bdismiss\b.*\bjob\b/i.test(normalized)) {
    return true;
  }

  if (
    /\b(?:with verification|verified job|recommended|promoted|viewed|works here|school alumni|connection(?:s)?|actively reviewing applicants|be an early applicant)\b/i.test(
      normalized,
    )
  ) {
    return true;
  }

  const repeatedPhrase = findRepeatedLeadingPhrase(
    stripExtractionUiSuffix(normalized),
  );
  if (repeatedPhrase) {
    const recoveredRepeatedTitle = sanitizeCardTitle(repeatedPhrase);
    if (scoreCardTitleCandidate(recoveredRepeatedTitle) > 0) {
      return true;
    }
  }

  const repeatedTitle = cleanLine(fallbackTitle);
  if (repeatedTitle && repeatedTitle.split(/\s+/).length >= 2) {
    const escapedTitle = repeatedTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`^(?:${escapedTitle})(?:\\s+${escapedTitle})+`, "i").test(
      normalized,
    );
  }

  return false;
}

function isRoleLikePhrase(value: string): boolean {
  const tokens =
    cleanLine(value)
      .toLowerCase()
      .match(/[\p{L}\p{N}.+#-]+/gu) ?? [];

  if (tokens.length === 0) {
    return false;
  }

  return tokens.every((token) => ROLE_SUFFIX_TOKENS.has(token));
}

function extractDismissTitle(value: string): string | null {
  const match = value.match(/\bdismiss\s+(.+?)\s+job\b/i);
  if (!match?.[1]) {
    return null;
  }

  return (
    cleanLine(match[1])
      .replace(/\(verified job\)/gi, " ")
      .replace(/\brecommended$/i, "")
      .trim() || null
  );
}

function collectDismissTitles(candidate: SearchResultCardCandidate): string[] {
  return uniqueStrings(
    [candidate.anchorText, ...candidate.lines]
      .map((value) => extractDismissTitle(value))
      .filter((value): value is string => Boolean(value)),
  );
}

function scoreCardTitleCandidate(value: string): number {
  const normalized = cleanLine(value);
  if (!normalized) {
    return 0;
  }

  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  const hasRoleHint =
    /\b(engineer|developer|manager|designer|analyst|architect|specialist|consultant|lead|qa|software|frontend|backend|full stack|react|node|typescript|\.net)\b/i.test(
      normalized,
    );
  const looksTruncated =
    /^(?:senior|mid|junior|staff|lead|principal|frontend|backend|full stack|software|developer|engineer|\.net)$/i.test(
      normalized,
    );

  return wordCount * 10 + (hasRoleHint ? 8 : 0) - (looksTruncated ? 12 : 0);
}

function looksLikeContaminatedTitleCandidate(
  candidateTitle: string,
  recoveredDismissTitle: string,
): boolean {
  const normalizedCandidate = cleanLine(candidateTitle);
  const normalizedRecovered = cleanLine(recoveredDismissTitle);
  if (!normalizedCandidate || !normalizedRecovered) {
    return false;
  }

  const normalizedCandidateLower = normalizedCandidate.toLowerCase();
  const normalizedRecoveredLower = normalizedRecovered.toLowerCase();
  if (
    !normalizedCandidateLower.startsWith(normalizedRecoveredLower) ||
    normalizedCandidateLower === normalizedRecoveredLower
  ) {
    return false;
  }

  const escapedRecoveredTitle = normalizedRecovered.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );
  const withoutRepeatedRecoveredTitle = cleanLine(
    normalizedCandidate.replace(
      new RegExp(
        `^(?:${escapedRecoveredTitle})(?:\\s+${escapedRecoveredTitle})+\\s*`,
        "i",
      ),
      "",
    ),
  );
  const trailingSegment = cleanLine(
    withoutRepeatedRecoveredTitle ||
      normalizedCandidate.slice(normalizedRecovered.length),
  );
  if (!trailingSegment) {
    return false;
  }

  if (
    looksLikeCompanyTrailingSegment(trailingSegment) ||
    COMPANY_LEGAL_SUFFIX_PATTERN.test(trailingSegment)
  ) {
    return true;
  }

  const trailingTokens = trailingSegment.match(/[\p{L}\p{N}.+#-]+/gu) ?? [];
  return (
    trailingTokens.length > 0 &&
    trailingTokens.length <= 4 &&
    !isRoleLikePhrase(trailingSegment) &&
    !isLocationLike(trailingSegment) &&
    !POSTED_PATTERN.test(trailingSegment) &&
    !SALARY_PATTERN.test(trailingSegment)
  );
}

function selectBestRawCardTitle(candidate: SearchResultCardCandidate): string {
  const headingTitle = sanitizeCardTitle(cleanLine(candidate.headingText));
  const anchorTitle = sanitizeCardTitle(cleanLine(candidate.anchorText));
  const dismissTitle =
    collectDismissTitles(candidate).sort(
      (left, right) =>
        scoreCardTitleCandidate(right) - scoreCardTitleCandidate(left),
    )[0] ?? null;
  const metadataRecoveredTitle = cardShowsRecoverableUiNoise(candidate)
    ? (uniqueStrings(candidate.lines)
        .filter((line) =>
          looksLikeRecoveredTitleSource(
            line,
            headingTitle || cleanLine(candidate.anchorText),
          ),
        )
        .map((line) =>
          recoverTitleFromMetadataLine(
            line,
            headingTitle || cleanLine(candidate.anchorText),
          ),
        )
        .filter((value): value is string => Boolean(value))
        .sort(
          (left, right) =>
            scoreCardTitleCandidate(right) - scoreCardTitleCandidate(left),
        )[0] ?? null)
    : null;

  // Search-result dismiss controls carry the clean visible job title even when
  // the surrounding card's accessibility text repeats the title and appends
  // verification/company/location metadata. Prefer that explicit label over
  // all composite text heuristics.
  if (dismissTitle && scoreCardTitleCandidate(dismissTitle) > 0) {
    return dismissTitle;
  }

  if (metadataRecoveredTitle) {
    const escapedRecoveredTitle = metadataRecoveredTitle.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&",
    );
    const repeatedRecoveredTitlePattern = new RegExp(
      `^(?:${escapedRecoveredTitle})(?:\\s+${escapedRecoveredTitle})+\\b`,
      "i",
    );

    if (
      repeatedRecoveredTitlePattern.test(headingTitle) ||
      repeatedRecoveredTitlePattern.test(anchorTitle)
    ) {
      return metadataRecoveredTitle;
    }
  }

  if (
    metadataRecoveredTitle &&
    scoreCardTitleCandidate(metadataRecoveredTitle) >
      Math.max(
        scoreCardTitleCandidate(dismissTitle ?? ""),
        scoreCardTitleCandidate(headingTitle),
      )
  ) {
    return metadataRecoveredTitle;
  }

  if (
    dismissTitle &&
    (looksLikeContaminatedTitleCandidate(headingTitle, dismissTitle) ||
      looksLikeContaminatedTitleCandidate(anchorTitle, dismissTitle))
  ) {
    return dismissTitle;
  }

  if (
    dismissTitle &&
    scoreCardTitleCandidate(dismissTitle) >
      scoreCardTitleCandidate(headingTitle)
  ) {
    return dismissTitle;
  }

  return headingTitle || cleanLine(candidate.anchorText);
}

function recoverSearchSurfaceCompositeMetadata(
  lines: readonly string[],
  title: string,
): { company: string; location: string } | null {
  const knownRemoteRegionPattern =
    /\b(?:United States|United Kingdom|European Union|North America|Latin America|South America|Middle East|Asia Pacific|EMEA|APAC|Europe|Worldwide|Global|Anywhere|Remote)\s*\((?:Remote|Hybrid|On[- ]?site)\)/i;
  const isPlausibleCompositeCompany = (value: string) =>
    Boolean(value) &&
    value.length <= 80 &&
    !COMPANY_NOISE_PATTERN.test(value) &&
    !POSTED_PATTERN.test(value) &&
    !SALARY_PATTERN.test(value) &&
    !isRoleLikePhrase(value);

  for (const line of uniqueStrings(lines)) {
    const cleaned = stripExtractionUiSuffix(line);
    const withoutTitle = removeLeadingTitleEcho(cleaned, title)
      .replace(
        /^(?:with verification|verified job|recommended|promoted|viewed)\b\s*/i,
        "",
      )
      .trim();
    if (!withoutTitle || withoutTitle === cleaned) {
      continue;
    }

    const workModeMatch = withoutTitle.match(
      /\((?:Remote|Hybrid|On[- ]?site)\)/i,
    );
    if (!workModeMatch || workModeMatch.index === undefined) {
      continue;
    }

    const throughWorkMode = cleanLine(
      withoutTitle.slice(0, workModeMatch.index + workModeMatch[0].length),
    );
    const knownLocationMatch = knownRemoteRegionPattern.exec(throughWorkMode);
    if (knownLocationMatch?.index !== undefined) {
      const company = normalizePotentialCompanyCandidate(
        throughWorkMode.slice(0, knownLocationMatch.index),
      );
      const location = cleanLine(knownLocationMatch[0]);
      if (isPlausibleCompositeCompany(company)) {
        return { company: stripCompanySuffix(company), location };
      }
    }

    if (throughWorkMode.includes(",")) {
      const tokens = throughWorkMode.split(/\s+/).filter(Boolean);
      for (let splitIndex = 1; splitIndex < tokens.length; splitIndex += 1) {
        const company = normalizePotentialCompanyCandidate(
          tokens.slice(0, splitIndex).join(" "),
        );
        const location = cleanLine(tokens.slice(splitIndex).join(" "));
        if (isPlausibleCompositeCompany(company) && location.includes(",")) {
          return { company: stripCompanySuffix(company), location };
        }
      }
      continue;
    }

    const singleTokenLocationMatch =
      /\s(?<location>[A-Z][\p{L}.'’-]+\s*\((?:Remote|Hybrid|On[- ]?site)\))$/u.exec(
        throughWorkMode,
      );
    if (
      singleTokenLocationMatch?.index !== undefined &&
      singleTokenLocationMatch.groups?.location
    ) {
      const company = normalizePotentialCompanyCandidate(
        throughWorkMode.slice(0, singleTokenLocationMatch.index),
      );
      const location = cleanLine(singleTokenLocationMatch.groups.location);
      if (isPlausibleCompositeCompany(company)) {
        return { company: stripCompanySuffix(company), location };
      }
    }
  }

  return null;
}

function isLocationLike(
  value: string,
  options?: { allowSingleTokenGeneric?: boolean },
): boolean {
  const normalized = cleanLine(value);
  if (!normalized || normalized.length > 80) {
    return false;
  }

  const tokens = normalized.split(/\s+/).filter(Boolean);
  const wordCount = tokens.length;

  if (COMPANY_LEGAL_SUFFIX_PATTERN.test(normalized)) {
    return false;
  }

  if (LOCATION_HINT_PATTERN.test(normalized)) {
    if (
      wordCount <= 4 &&
      !EXTRACTION_UI_NOISE_PATTERN.test(normalized) &&
      !/\bjob\b/i.test(normalized) &&
      !isRoleLikePhrase(normalized)
    ) {
      return true;
    }
  }

  if (SALARY_PATTERN.test(normalized) || POSTED_PATTERN.test(normalized)) {
    return false;
  }

  const allowSingleTokenGeneric = options?.allowSingleTokenGeneric ?? true;
  if (normalized.includes(",") && wordCount <= 8) {
    return true;
  }

  if (wordCount <= 3) {
    if (!allowSingleTokenGeneric && wordCount === 1) {
      return false;
    }

    return (
      tokens.every((token) => /^[A-Z][\p{L}\p{N}.'’-]*$/u.test(token)) &&
      !COMPANY_NOISE_PATTERN.test(normalized)
    );
  }

  return (
    /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}\b/.test(normalized) &&
    wordCount <= 6 &&
    !COMPANY_NOISE_PATTERN.test(normalized)
  );
}

function scoreLocationCandidate(
  value: string,
  options?: { allowSingleTokenGeneric?: boolean },
): number {
  const normalized = cleanLine(value);
  if (!isLocationLike(normalized, options)) {
    return 0;
  }

  let score = 1;

  if (LOCATION_HINT_PATTERN.test(normalized)) {
    score += 20;
  }

  if (normalized.includes(",")) {
    score += 10;
  }

  if (/[()]/.test(normalized)) {
    score += 5;
  }

  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  if (wordCount === 1) {
    score += 2;
  } else if (wordCount <= 3) {
    score += 1;
  }

  return score;
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
  for (const line of lines) {
    const normalized = cleanLine(line);
    if (!POSTED_PATTERN.test(normalized) || normalized.length > 80) {
      continue;
    }

    const compositePostedAtText =
      stripTrailingPostedAtText(normalized).postedAtText;
    return compositePostedAtText ?? normalized;
  }

  return null;
}

function findEmploymentType(lines: readonly string[]): string | null {
  const match = lines.find((line) => EMPLOYMENT_TYPE_PATTERN.test(line));
  return trimToNull(match);
}

function stripTrailingPostedAtText(value: string): {
  content: string;
  postedAtText: string | null;
} {
  const normalized = cleanLine(value);
  const match = normalized.match(COMPOSITE_POSTED_SUFFIX_PATTERN);

  if (!match || typeof match.index !== "number") {
    return { content: normalized, postedAtText: null };
  }

  return {
    content: normalized.slice(0, match.index).trim(),
    postedAtText: cleanLine(match[0]),
  };
}

function isPureWorkModeLocationLabel(value: string): boolean {
  const normalized = cleanLine(value)
    .replace(/[()]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  return (
    normalized === "remote" ||
    normalized === "hybrid" ||
    normalized === "on-site" ||
    normalized === "onsite" ||
    normalized === "on site" ||
    normalized === "work from home" ||
    normalized === "home office" ||
    normalized === "anywhere" ||
    normalized === "worldwide" ||
    normalized === "global"
  );
}

function countMeaningfulLocationTokens(value: string): number {
  return tokenizePreferenceValue(value, "location").length;
}

function looksLikeCompanyTrailingSegment(value: string): boolean {
  const normalized = cleanLine(value);
  if (!normalized) {
    return false;
  }

  if (COMPANY_LEGAL_SUFFIX_PATTERN.test(normalized)) {
    return true;
  }

  const tokens = normalized.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const lastToken = tokens.at(-1);
  return Boolean(lastToken && COMPANY_STYLE_SUFFIX_TOKENS.has(lastToken));
}

function hasRicherMeaningfulLocationSuffix(
  tokens: readonly string[],
  width: number,
): boolean {
  const maxExtraWidth = Math.min(2, tokens.length - width - 1);
  for (let extraWidth = 1; extraWidth <= maxExtraWidth; extraWidth += 1) {
    const candidate = tokens.slice(-(width + extraWidth)).join(" ");
    if (
      !candidate ||
      /[•·|]/.test(candidate) ||
      !isLocationLike(candidate) ||
      looksLikeCompanyTrailingSegment(candidate) ||
      countMeaningfulLocationTokens(candidate) === 0
    ) {
      continue;
    }

    return true;
  }

  return false;
}

function narrowVerificationNoiseLocationCandidate(
  value: string,
  candidate: string,
): string {
  if (
    !/\b(?:with verification|verified job|works here|school alumni|connection(?:s)?|promoted|viewed)\b/i.test(
      value,
    )
  ) {
    return candidate;
  }

  const tokens = cleanLine(candidate).split(/\s+/).filter(Boolean);
  for (let startIndex = 1; startIndex < tokens.length - 1; startIndex += 1) {
    const narrowedCandidate = tokens.slice(startIndex).join(" ");
    if (
      !narrowedCandidate ||
      /[•·|]/.test(narrowedCandidate) ||
      !isLocationLike(narrowedCandidate) ||
      looksLikeCompanyTrailingSegment(narrowedCandidate) ||
      countMeaningfulLocationTokens(narrowedCandidate) === 0
    ) {
      continue;
    }

    return narrowedCandidate;
  }

  return candidate;
}

function inferTrailingCompositeLocation(value: string): string | null {
  const tokens = cleanLine(value).split(/\s+/).filter(Boolean);
  const tailToken =
    cleanLine(tokens.at(-1) ?? "")
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu)
      ?.at(-1) ?? "";

  if (!tailToken || ROLE_TOKEN_PATTERN.test(tailToken)) {
    return null;
  }

  let bestCandidate: string | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let width = 1; width <= Math.min(3, tokens.length - 1); width += 1) {
    const candidate = tokens.slice(-width).join(" ");
    if (
      width === 1 &&
      !LOCATION_HINT_PATTERN.test(candidate) &&
      (tokens.length < 3 || ROLE_TOKEN_PATTERN.test(candidate))
    ) {
      continue;
    }

    if (isRoleLikePhrase(candidate)) {
      continue;
    }

    if (/[•·|]/.test(candidate) || looksLikeCompanyTrailingSegment(candidate)) {
      continue;
    }

    if (isLocationLike(candidate)) {
      if (
        isPureWorkModeLocationLabel(candidate) &&
        hasRicherMeaningfulLocationSuffix(tokens, width)
      ) {
        continue;
      }

      const score =
        scoreLocationCandidate(candidate) +
        countMeaningfulLocationTokens(candidate) * 5 -
        (isPureWorkModeLocationLabel(candidate) ? 15 : 0);

      if (score > bestScore) {
        bestCandidate = candidate;
        bestScore = score;
      }
    }
  }

  return bestCandidate
    ? narrowVerificationNoiseLocationCandidate(value, bestCandidate)
    : null;
}

function normalizeCompositeCardTitle(value: string): {
  title: string;
  location: string | null;
  postedAtText: string | null;
} {
  const { content, postedAtText } = stripTrailingPostedAtText(value);
  const location = inferTrailingCompositeLocation(content);
  const title = location
    ? content
        .slice(0, Math.max(0, content.length - location.length))
        .replace(/[\s•·|–—-]+$/, "")
        .trim()
    : content;

  return {
    title: title || content,
    location,
    postedAtText,
  };
}

function inferCompany(
  lines: readonly string[],
  title: string,
  location: string | null,
): string | null {
  const normalizedTitle = title.toLowerCase();
  const normalizedLocation = location?.toLowerCase() ?? null;
  const titleTokens = new Set(
    title.toLowerCase().match(/[\p{L}\p{N}.+#-]+/gu) ?? [],
  );

  for (const line of lines) {
    const normalized = normalizePotentialCompanyCandidate(
      removeLeadingTitleSuffixOverlap(
        removeLeadingTitleEcho(stripExtractionUiSuffix(line), title),
        title,
      ),
    );
    const splitTitleCompany = splitContaminatedTitleCompanySuffix(normalized);
    const lowered = normalized.toLowerCase();
    const candidateTokens =
      normalized.toLowerCase().match(/[\p{L}\p{N}.+#-]+/gu) ?? [];
    const sharesOnlyTitleTokens =
      candidateTokens.length > 0 &&
      candidateTokens.every((token) => titleTokens.has(token));
    const matchedTitleTokenCount = countMatchedPreferenceTokens(
      [...titleTokens],
      candidateTokens,
    );
    const titleEchoRatio =
      titleTokens.size > 0 ? matchedTitleTokenCount / titleTokens.size : 0;

    if (
      !normalized ||
      lowered === normalizedTitle ||
      lowered === normalizedLocation ||
      normalized.length > 80 ||
      normalized.split(/\s+/).length > 8 ||
      sharesOnlyTitleTokens ||
      titleEchoRatio >= 0.7 ||
      COMPANY_NOISE_PATTERN.test(normalized) ||
      SALARY_PATTERN.test(normalized) ||
      POSTED_PATTERN.test(normalized) ||
      (normalizedLocation === null && isLocationLike(normalized))
    ) {
      continue;
    }

    if (splitTitleCompany.company) {
      const splitTitleTokens =
        splitTitleCompany.title.toLowerCase().match(/[\p{L}\p{N}.+#-]+/gu) ??
        [];
      const splitTitleOverlapCount = countMatchedPreferenceTokens(
        [...titleTokens],
        splitTitleTokens,
      );
      if (splitTitleOverlapCount > 0) {
        return stripCompanySuffix(splitTitleCompany.company);
      }
    }

    return stripCompanySuffix(normalized);
  }

  return null;
}

/**
 * Employer name from an explicit employer profile or employer-job href.
 * Accepts hubs (`/company/{slug}`, `/employer/{slug}`, …) because those
 * links name the employer on job cards — unlike treating a hub page itself
 * as a job listing.
 */
export function inferEmployerFromCompanyProfileHref(
  url: string | null | undefined,
): string | null {
  const canonicalUrl = cleanLine(url ?? "");
  if (!canonicalUrl) {
    return null;
  }

  const employerProfilePathMarkers = new Set(["company", "employer"]);

  try {
    const parsed = new URL(canonicalUrl);
    const pathSegments = parsed.pathname
      .split("/")
      .map((segment) => cleanLine(decodeURIComponent(segment)))
      .filter(Boolean);
    const profileIndex = pathSegments.findIndex((segment) =>
      employerProfilePathMarkers.has(segment.toLowerCase()),
    );
    if (profileIndex < 0) {
      return null;
    }

    const slug = pathSegments[profileIndex + 1];
    if (
      !slug ||
      GENERIC_JOB_PATH_SEGMENTS.has(slug.toLowerCase()) ||
      SITE_UTILITY_PATH_SEGMENTS.has(slug.toLowerCase()) ||
      !/[a-z\p{L}]/iu.test(slug)
    ) {
      return null;
    }

    // Some boards append numeric disambiguators to profile slugs.
    const displaySlug = slug.replace(/-\d+$/u, "");
    return formatEmployerLabelFromSlug(displaySlug);
  } catch {
    return null;
  }
}

function inferCompanySlugFromCanonicalUrl(url: string): string | null {
  const canonicalUrl = cleanLine(url);
  if (!canonicalUrl) {
    return null;
  }

  try {
    const parsed = new URL(canonicalUrl);
    const pathSegments = parsed.pathname
      .split("/")
      .map((segment) => cleanLine(decodeURIComponent(segment)))
      .filter(Boolean);
    const companyMarkerIndex = pathSegments.findIndex(
      (segment) => segment.toLowerCase() === "company",
    );
    if (companyMarkerIndex < 0) {
      return null;
    }

    const slug = pathSegments[companyMarkerIndex + 1];
    if (
      !slug ||
      GENERIC_JOB_PATH_SEGMENTS.has(slug.toLowerCase()) ||
      !/[a-z\p{L}]/iu.test(slug)
    ) {
      return null;
    }

    // Job listing URLs must include a role segment after `/company/{slug}`
    // (or `/company/{slug}/jobs/{id}-…`). Pure hubs stay non-employers here.
    const rest = pathSegments.slice(companyMarkerIndex + 2);
    if (
      rest.length === 0 ||
      (rest.length === 1 && rest[0]?.toLowerCase() === "jobs")
    ) {
      return null;
    }

    return formatEmployerLabelFromSlug(slug);
  } catch {
    return null;
  }
}

function inferCompanyFromCanonicalUrl(url: string): string | null {
  const slugCompany = inferCompanySlugFromCanonicalUrl(url);
  if (slugCompany) {
    return slugCompany;
  }

  const canonicalUrl = cleanLine(url);
  if (!canonicalUrl) {
    return null;
  }

  try {
    const parsed = new URL(canonicalUrl);
    const pathSegments = parsed.pathname
      .split("/")
      .map((segment) => cleanLine(decodeURIComponent(segment)))
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

function recoverVerificationMetadata(
  lines: readonly string[],
  title: string,
): { company: string | null; location: string | null } | null {
  for (const line of uniqueStrings(lines)) {
    if (!/\bwith verification\b/i.test(line)) {
      continue;
    }

    const cleaned = cleanLine(
      stripExtractionUiSuffix(line).replace(/\s+\d+\s*$/, ""),
    );
    if (!cleaned) {
      continue;
    }

    const withoutTitleEcho = removeLeadingTitleEcho(cleaned, title);
    if (!withoutTitleEcho || withoutTitleEcho === cleaned) {
      continue;
    }

    const tokens = withoutTitleEcho.split(/\s+/).filter(Boolean);
    let location: string | null = null;
    let company: string | null = null;

    for (let width = Math.min(3, tokens.length - 1); width >= 1; width -= 1) {
      const locationCandidate = tokens.slice(-width).join(" ");
      if (!locationCandidate || !isLocationLike(locationCandidate)) {
        continue;
      }

      const companyCandidate = cleanLine(
        tokens.slice(0, Math.max(0, tokens.length - width)).join(" "),
      );
      if (!companyCandidate || isRoleLikePhrase(companyCandidate)) {
        continue;
      }

      location = locationCandidate;
      company = companyCandidate;
      break;
    }

    if (!location) {
      location = inferTrailingCompositeLocation(withoutTitleEcho);
      company = cleanLine(
        location
          ? withoutTitleEcho
              .slice(0, Math.max(0, withoutTitleEcho.length - location.length))
              .replace(/[\s•·|–—-]+$/, "")
          : withoutTitleEcho,
      );
    }

    return {
      company:
        company &&
        !COMPANY_NOISE_PATTERN.test(company) &&
        !POSTED_PATTERN.test(company) &&
        !SALARY_PATTERN.test(company)
          ? stripCompanySuffix(company)
          : null,
      location,
    };
  }

  return null;
}

function inferLocation(
  lines: readonly string[],
  workMode: JobPosting["workMode"],
  options?: { allowSingleTokenGeneric?: boolean },
): string | null {
  let bestLocationValue: string | null = null;
  let bestLocationScore = 0;

  const considerCandidate = (candidate: string) => {
    const score = scoreLocationCandidate(candidate, options);
    if (score <= 0) {
      return;
    }

    if (!bestLocationValue || score > bestLocationScore) {
      bestLocationValue = candidate;
      bestLocationScore = score;
    }
  };

  for (const line of lines) {
    const expandedCandidates = expandCompositeMetadataLine(line);
    for (const candidate of expandedCandidates) {
      considerCandidate(candidate);
    }
  }

  if (bestLocationValue) {
    return bestLocationValue;
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
  excludedLines?: readonly string[];
}): { summary: string; description: string } {
  const excluded = new Set(
    [input.title, input.company, input.location, ...(input.excludedLines ?? [])]
      .map((value) => value.toLowerCase())
      .filter(Boolean),
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

function preferHigherQualityField(current: string, candidate: string): string {
  const normalizedCurrent = cleanLine(current);
  const normalizedCandidate = cleanLine(candidate);

  if (!normalizedCurrent) {
    return normalizedCandidate;
  }

  if (!normalizedCandidate) {
    return normalizedCurrent;
  }

  const currentHasNoise = EXTRACTION_UI_NOISE_PATTERN.test(normalizedCurrent);
  const candidateHasNoise =
    EXTRACTION_UI_NOISE_PATTERN.test(normalizedCandidate);

  if (currentHasNoise !== candidateHasNoise) {
    return currentHasNoise ? normalizedCandidate : normalizedCurrent;
  }

  return normalizedCurrent.length >= normalizedCandidate.length
    ? normalizedCurrent
    : normalizedCandidate;
}

function preferHigherQualityLocation(
  current: string,
  candidate: string,
): string {
  const normalizedCurrent = cleanLine(current);
  const normalizedCandidate = cleanLine(candidate);

  if (!normalizedCurrent) {
    return normalizedCandidate;
  }

  if (!normalizedCandidate) {
    return normalizedCurrent;
  }

  const currentScore = scoreLocationCandidate(normalizedCurrent);
  const candidateScore = scoreLocationCandidate(normalizedCandidate);
  if (currentScore !== candidateScore) {
    return candidateScore > currentScore
      ? normalizedCandidate
      : normalizedCurrent;
  }

  return preferHigherQualityField(normalizedCurrent, normalizedCandidate);
}

function mergeJob(
  current: ExtractedJobInput | undefined,
  candidate: ExtractedJobInput,
): ExtractedJobInput {
  if (!current) {
    return candidate;
  }

  const mergedApplyPath =
    current.applyPath === "easy_apply" || candidate.applyPath === "easy_apply"
      ? "easy_apply"
      : current.applyPath !== "unknown"
        ? current.applyPath
        : candidate.applyPath !== "unknown"
          ? candidate.applyPath
          : current.applyPath;

  return {
    ...current,
    ...candidate,
    sourceJobId: current.sourceJobId || candidate.sourceJobId,
    title: preferHigherQualityField(current.title, candidate.title),
    company: preferHigherQualityField(current.company, candidate.company),
    location: preferHigherQualityLocation(current.location, candidate.location),
    summary:
      (candidate.summary &&
      candidate.summary.length > (current.summary?.length ?? 0)
        ? candidate.summary
        : current.summary) ?? null,
    description:
      candidate.description.length > current.description.length
        ? candidate.description
        : current.description,
    salaryText: candidate.salaryText ?? current.salaryText ?? null,
    postedAt: candidate.postedAt ?? current.postedAt ?? null,
    postedAtText: candidate.postedAtText ?? current.postedAtText ?? null,
    providerUpdatedAt: preferLatestIsoDateTime(
      current.providerUpdatedAt,
      candidate.providerUpdatedAt,
    ),
    workMode: uniqueStrings([
      ...(current.workMode ?? []),
      ...(candidate.workMode ?? []),
    ]).flatMap((value) => {
      const normalizedWorkMode = normalizeDetectedWorkMode(value);
      return normalizedWorkMode ? [normalizedWorkMode] : [];
    }),
    easyApplyEligible: current.easyApplyEligible || candidate.easyApplyEligible,
    applyPath: mergedApplyPath,
    keySkills: uniqueStrings([
      ...(current.keySkills ?? []),
      ...(candidate.keySkills ?? []),
    ]),
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
    employerWebsiteUrl:
      current.employerWebsiteUrl ?? candidate.employerWebsiteUrl ?? null,
    employerDomain: current.employerDomain ?? candidate.employerDomain ?? null,
    benefits: uniqueStrings([
      ...(current.benefits ?? []),
      ...(candidate.benefits ?? []),
    ]),
  };
}

/**
 * True for bare job-board index URLs such as `/jobs` that are not concrete
 * posting detail routes (no id-shaped segment after the jobs marker).
 */
export function isLikelyJobListingHubUrl(canonicalUrl: string): boolean {
  const raw = cleanLine(canonicalUrl);
  if (!raw) {
    return false;
  }

  try {
    const parsed = new URL(raw);
    const segments = parsed.pathname
      .split("/")
      .map((segment) => cleanLine(decodeURIComponent(segment)).toLowerCase())
      .filter(Boolean);
    return segments.length === 1 && segments[0] === "jobs";
  } catch {
    return false;
  }
}

export function isLikelySiteUtilityJob(input: {
  canonicalUrl: string;
  title?: string | null;
  captureMeta?: SearchResultCardCaptureMeta | null;
}): boolean {
  if (input.captureMeta?.inNavigation || input.captureMeta?.inHeader) {
    return true;
  }

  const title = cleanLine(input.title ?? "");
  if (
    title &&
    (SITE_UTILITY_TITLE_PATTERN.test(title) ||
      SITE_UTILITY_ALBANIAN_PRIVACY_TITLE_PATTERN.test(title) ||
      SITE_UTILITY_TITLE_PREFIX_PATTERN.test(title) ||
      SITE_UTILITY_OPEN_POSITIONS_TITLE_PATTERN.test(title))
  ) {
    return true;
  }

  if (isLikelyJobListingHubUrl(input.canonicalUrl)) {
    return true;
  }

  try {
    const parsed = new URL(input.canonicalUrl);
    const host = parsed.hostname.toLowerCase();
    if (
      host === "fb.com" ||
      host === "www.fb.com" ||
      host === "facebook.com" ||
      host === "www.facebook.com" ||
      host.endsWith(".facebook.com") ||
      host.startsWith("help.")
    ) {
      return true;
    }

    const segments = parsed.pathname
      .split("/")
      .map((segment) => cleanLine(decodeURIComponent(segment)).toLowerCase())
      .filter(Boolean);
    if (segments.some((segment) => SITE_UTILITY_PATH_SEGMENTS.has(segment))) {
      return true;
    }

    const companyIndex = segments.indexOf("company");
    if (companyIndex >= 0) {
      const rest = segments.slice(companyIndex + 2);
      // `/company/{slug}` hubs and `/company/{slug}/jobs` indexes are chrome.
      if (
        segments[companyIndex + 1] &&
        (rest.length === 0 || (rest.length === 1 && rest[0] === "jobs"))
      ) {
        return true;
      }
    }
  } catch {
    return false;
  }

  return false;
}

function isCompleteJob(
  job: ExtractedJobInput | undefined,
): job is ExtractedJobInput {
  return Boolean(
    job &&
    job.canonicalUrl &&
    job.sourceJobId &&
    job.title &&
    job.company &&
    job.location &&
    job.description &&
    !isLikelySiteUtilityJob({
      canonicalUrl: job.canonicalUrl,
      title: job.title,
    }),
  );
}

function buildJobFromStructuredData(
  candidate: StructuredDataJobCandidate,
  pageUrl: string,
  evidence: LearnedSearchSurfaceRouteEvidence,
): ExtractedJobInput | null {
  const canonicalUrl =
    buildLearnedDetailUrlFromHint({
      url: candidate.canonicalUrl,
      pageUrl,
      sourceJobIdHint: candidate.sourceJobId ?? null,
      evidence,
    }) || canonicalizeUrl(candidate.canonicalUrl, pageUrl);
  const title = normalizeExtractedJobTitle({
    value: candidate.title,
    company: candidate.company,
    location: candidate.location,
  });
  const company = cleanLine(candidate.company);
  const workMode = normalizeWorkModes(
    candidate.workMode,
    candidate.location ?? undefined,
  );
  const location = cleanLine(candidate.location) || inferLocation([], workMode);
  const description =
    cleanLine(candidate.description) || cleanLine(candidate.summary);

  if (
    isLikelySiteUtilityJob({
      canonicalUrl,
      title,
    })
  ) {
    return null;
  }

  return {
    sourceJobId:
      cleanLine(candidate.sourceJobId) ||
      buildGenericJobId(canonicalUrl || pageUrl),
    canonicalUrl,
    title,
    company,
    location: location || "",
    description,
    salaryText: trimToNull(candidate.salaryText),
    summary: trimToNull(candidate.summary) ?? description.slice(0, 280),
    postedAt: toIsoDateTimeOrNull(candidate.postedAt),
    postedAtText: trimToNull(candidate.postedAtText),
    providerUpdatedAt: toIsoDateTimeOrNull(candidate.providerUpdatedAt),
    workMode,
    applyPath: candidate.applyPath ?? "unknown",
    easyApplyEligible: candidate.easyApplyEligible === true,
    keySkills: normalizeStringArray(candidate.keySkills),
    responsibilities: normalizeStringArray(candidate.responsibilities),
    minimumQualifications: normalizeStringArray(
      candidate.minimumQualifications,
    ),
    preferredQualifications: normalizeStringArray(
      candidate.preferredQualifications,
    ),
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
  evidence: LearnedSearchSurfaceRouteEvidence,
): ExtractedJobInput | null {
  const shouldCanonicalizeCurrentJobIdRoute =
    shouldCanonicalizeSearchSurfaceDetailRoute({
      candidate,
      pageUrl,
      evidence,
    });
  const hasUnprovenSearchSurfaceRoute =
    !shouldCanonicalizeCurrentJobIdRoute &&
    isSharedLearnedSurfaceUrl(candidate.canonicalUrl, evidence);
  const hintedSourceJobId =
    shouldCanonicalizeCurrentJobIdRoute || !hasUnprovenSearchSurfaceRoute
      ? cleanLine(candidate.sourceJobIdHint)
      : "";
  const canonicalUrl =
    buildLearnedDetailUrlFromHint({
      url: candidate.canonicalUrl,
      pageUrl,
      ...(candidate.sourceJobIdHint !== undefined
        ? { sourceJobIdHint: candidate.sourceJobIdHint }
        : {}),
      searchableText: [
        candidate.anchorText,
        candidate.headingText ?? "",
        ...candidate.lines,
      ].join(" "),
      evidence,
    }) ?? canonicalizeUrl(candidate.canonicalUrl, pageUrl);
  if (
    isLikelySiteUtilityJob({
      canonicalUrl,
      title: candidate.anchorText ?? candidate.headingText,
      captureMeta: candidate.captureMeta ?? null,
    })
  ) {
    return null;
  }

  const candidateFingerprint = buildSearchResultCardFingerprint(candidate);
  const lines = uniqueStrings(candidate.lines);
  const rawHeadingOrAnchor = selectBestRawCardTitle(candidate);
  const explicitDismissTitle =
    collectDismissTitles(candidate).sort(
      (left, right) =>
        scoreCardTitleCandidate(right) - scoreCardTitleCandidate(left),
    )[0] ?? null;
  const isSearchSurfaceCandidate = cardShowsRecoverableUiNoise(candidate);
  const pollutedTitleCompanySplit = isSearchSurfaceCandidate
    ? splitContaminatedTitleCompanySuffix(rawHeadingOrAnchor)
    : { title: rawHeadingOrAnchor, company: null };
  const recoveredCardTitle = isSearchSurfaceCandidate
    ? recoverBetterCardTitleFromLines({
        lines,
        fallbackTitle: pollutedTitleCompanySplit.title,
      })
    : null;
  const rawTitle = sanitizeCardTitle(
    recoveredCardTitle ?? pollutedTitleCompanySplit.title,
  );
  const compositeTitle = explicitDismissTitle
    ? {
        title: trimMalformedTrailingRoleRepeat(
          stripExtractionUiSuffix(explicitDismissTitle)
            .replace(/\(verified job\)/gi, " ")
            .replace(
              /\s*[|•·]\s*(?:Remote|Hybrid|On[- ]?site|Onsite)\s*$/i,
              "",
            ),
        ),
        location: null,
        postedAtText: null,
      }
    : normalizeCompositeCardTitle(
        stripExtractionUiSuffix(
          recoveredCardTitle ?? pollutedTitleCompanySplit.title,
        ),
      );
  const title = explicitDismissTitle
    ? cleanLine(compositeTitle.title) || rawTitle
    : sanitizeCardTitle(compositeTitle.title) || rawTitle;
  const excludedTitleLines = new Set(
    [rawHeadingOrAnchor, rawTitle, title]
      .map((value) => cleanLine(value).toLowerCase())
      .filter(Boolean),
  );
  const metadataLines = uniqueStrings(
    lines
      .filter((line) => !excludedTitleLines.has(cleanLine(line).toLowerCase()))
      .flatMap((line) => expandCompositeMetadataLine(line)),
  );
  const workMode = normalizeWorkModes(
    metadataLines,
    [rawTitle, ...metadataLines].join(" "),
  );
  const verificationMetadata = isSearchSurfaceCandidate
    ? recoverVerificationMetadata(lines, title)
    : null;
  const compositeMetadata = isSearchSurfaceCandidate
    ? recoverSearchSurfaceCompositeMetadata(lines, title)
    : null;
  const hardLocation =
    trimToNull(candidate.locationText) ??
    compositeMetadata?.location ??
    verificationMetadata?.location ??
    inferLocation(metadataLines, workMode, {
      allowSingleTokenGeneric: false,
    }) ??
    compositeTitle.location;
  const urlCompany = inferCompanyFromCanonicalUrl(canonicalUrl);
  const urlCompanySlug = inferCompanySlugFromCanonicalUrl(canonicalUrl);
  const companyHrefEmployer = inferEmployerFromCompanyProfileHref(
    candidate.companyHref,
  );
  const initialCompany =
    sanitizeObservedEmployerLabel(trimToNull(candidate.companyText)) ??
    sanitizeObservedEmployerLabel(compositeMetadata?.company) ??
    companyHrefEmployer ??
    urlCompanySlug ??
    inferCompany(
      metadataLines.filter(
        (line) =>
          cleanLine(line).toLowerCase() !== (hardLocation?.toLowerCase() ?? ""),
      ),
      title,
      hardLocation,
    ) ??
    verificationMetadata?.company ??
    pollutedTitleCompanySplit.company ??
    urlCompany;
  const location =
    hardLocation ??
    inferLocation(
      metadataLines.filter(
        (line) =>
          cleanLine(line).toLowerCase() !==
          (initialCompany?.toLowerCase() ?? ""),
      ),
      workMode,
    ) ??
    verificationMetadata?.location;
  const company =
    sanitizeObservedEmployerLabel(
      initialCompany ??
        inferCompany(
          metadataLines.filter(
            (line) =>
              cleanLine(line).toLowerCase() !== (location?.toLowerCase() ?? ""),
          ),
          title,
          location ?? null,
        ) ??
        pollutedTitleCompanySplit.company ??
        urlCompany,
    ) ?? null;
  const canonicalTitle = normalizeExtractedJobTitle({
    value: title,
    company,
    location,
  });

  const { summary, description } = buildSummaryAndDescription({
    lines,
    title: canonicalTitle || cleanLine(candidate.anchorText),
    company: company || "",
    location: location || "",
    excludedLines: [rawTitle],
  });

  return {
    sourceJobId:
      hintedSourceJobId ||
      (hasUnprovenSearchSurfaceRoute
        ? `${buildGenericJobId(canonicalUrl || pageUrl)}_${candidateFingerprint}`.slice(
            0,
            160,
          )
        : buildGenericJobId(canonicalUrl || pageUrl)),
    canonicalUrl,
    title: canonicalTitle,
    company: company || "",
    location: location || "",
    description,
    salaryText: findSalaryText(lines),
    summary,
    postedAt: null,
    postedAtText: findPostedAtText(lines) ?? compositeTitle.postedAtText,
    workMode,
    applyPath: EASY_APPLY_PATTERN.test(lines.join(" "))
      ? "easy_apply"
      : "unknown",
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

export function scoreSearchResultCardForPreferences(input: {
  pageUrl: string;
  candidate: SearchResultCardCandidate;
  searchPreferences?: ExtractionSearchPreferences;
  prebuiltJob?: ExtractedJobInput;
}): number {
  if (!input.searchPreferences) {
    return 0;
  }

  const job =
    input.prebuiltJob ??
    buildJobFromCardCandidate(
      input.candidate,
      input.pageUrl,
      observeLearnedSearchSurfaceRoutes({
        pageUrl: input.pageUrl,
        observedUrls: [input.candidate.canonicalUrl],
      }),
    );
  if (!job) {
    return 0;
  }

  return Math.max(0, scoreJobForPreferences(job, input.searchPreferences));
}

export function scoreSearchResultCardTitleForPreferences(input: {
  pageUrl: string;
  candidate: SearchResultCardCandidate;
  searchPreferences?: ExtractionSearchPreferences;
  prebuiltJob?: ExtractedJobInput;
}): number {
  if (!input.searchPreferences) {
    return 0;
  }

  const job =
    input.prebuiltJob ??
    buildJobFromCardCandidate(
      input.candidate,
      input.pageUrl,
      observeLearnedSearchSurfaceRoutes({
        pageUrl: input.pageUrl,
        observedUrls: [input.candidate.canonicalUrl],
      }),
    );
  if (!job) {
    return 0;
  }

  return scoreJobTitleForPreferences(job, input.searchPreferences);
}

export function buildStructuredCandidateJobs(input: {
  pageUrl: string;
  maxJobs: number;
  structuredDataCandidates?: readonly StructuredDataJobCandidate[];
  cardCandidates?: readonly SearchResultCardCandidate[];
  searchPreferences?: ExtractionSearchPreferences;
}): ExtractedJobInput[] {
  if (input.maxJobs <= 0) {
    return [];
  }

  const jobsByKey = new Map<string, ExtractedJobInput>();
  const cardSurfaceScoreByMergeKey = new Map<string, number>();
  const learnedEvidence = observeLearnedSearchSurfaceRoutes({
    pageUrl: input.pageUrl,
    observedUrls: [
      input.pageUrl,
      ...(input.cardCandidates ?? []).map(
        (candidate) => candidate.canonicalUrl,
      ),
    ],
    detailOnlyUrls: (input.structuredDataCandidates ?? []).map(
      (candidate) => candidate.canonicalUrl,
    ),
  });
  const isSearchSurface = learnedEvidence.sharedSurfaceUrls.size > 0;
  const effectiveMaxJobs = Math.max(1, input.maxJobs);
  const targetCardCandidateBudget = isSearchSurface
    ? Math.max(96, effectiveMaxJobs * 8)
    : Math.max(20, effectiveMaxJobs * 3);

  for (const candidate of input.structuredDataCandidates ?? []) {
    const job = buildJobFromStructuredData(
      candidate,
      input.pageUrl,
      learnedEvidence,
    );
    if (!job) {
      continue;
    }

    jobsByKey.set(
      job.canonicalUrl,
      mergeJob(jobsByKey.get(job.canonicalUrl), job),
    );
  }

  for (const candidate of (input.cardCandidates ?? []).slice(
    0,
    targetCardCandidateBudget,
  )) {
    const job = buildJobFromCardCandidate(
      candidate,
      input.pageUrl,
      learnedEvidence,
    );
    if (!job) {
      continue;
    }

    const mergeKey = buildSearchResultCardMergeKey({
      pageUrl: input.pageUrl,
      candidate,
      canonicalUrl: job.canonicalUrl,
      evidence: learnedEvidence,
    });

    jobsByKey.set(mergeKey, mergeJob(jobsByKey.get(mergeKey), job));
    cardSurfaceScoreByMergeKey.set(
      mergeKey,
      Math.max(
        cardSurfaceScoreByMergeKey.get(mergeKey) ?? Number.NEGATIVE_INFINITY,
        scoreSearchResultCardSurfaceQuality(candidate),
      ),
    );
  }

  const rankedJobs = [...jobsByKey.entries()]
    .flatMap(([mergeKey, job], index) => {
      if (!isCompleteJob(job)) {
        return [];
      }

      const preferenceScore = scoreJobForPreferences(
        job,
        input.searchPreferences,
      );
      const surfaceScore = isSearchSurface
        ? (cardSurfaceScoreByMergeKey.get(mergeKey) ?? 0) *
          SEARCH_SURFACE_SCORE_WEIGHT
        : (cardSurfaceScoreByMergeKey.get(mergeKey) ?? 0);

      return [
        {
          job,
          index,
          titleScore: scoreJobTitleForPreferences(job, input.searchPreferences),
          preferenceScore,
          surfaceScore,
        },
      ];
    })
    .sort((left, right) => {
      if (input.searchPreferences) {
        const titleScoreDelta = right.titleScore - left.titleScore;
        if (Math.abs(titleScoreDelta) >= SEARCH_TITLE_DOMINANCE_THRESHOLD) {
          return titleScoreDelta;
        }
      }

      const combinedScoreDelta =
        right.preferenceScore +
        right.surfaceScore -
        (left.preferenceScore + left.surfaceScore);
      if (combinedScoreDelta !== 0) {
        return combinedScoreDelta;
      }

      const surfaceScoreDelta = right.surfaceScore - left.surfaceScore;
      if (surfaceScoreDelta !== 0) {
        return surfaceScoreDelta;
      }

      const preferenceScoreDelta = right.preferenceScore - left.preferenceScore;
      if (preferenceScoreDelta !== 0) {
        return preferenceScoreDelta;
      }

      return left.index - right.index;
    });

  return rankedJobs
    .map((entry) => entry.job)
    .slice(0, Math.max(0, input.maxJobs));
}

export function shouldCanonicalizeSearchSurfaceDetailRoute(input: {
  candidate: SearchResultCardCandidate;
  pageUrl: string;
  evidence: LearnedSearchSurfaceRouteEvidence;
}): boolean {
  const sourceJobIdHint = canonicalizeNumericJobIdHint(
    input.candidate.sourceJobIdHint,
  );
  if (sourceJobIdHint) {
    const parsed =
      parseHttpUrl(cleanLine(input.candidate.canonicalUrl), input.pageUrl) ??
      parseHttpUrl(input.pageUrl);
    return (
      parsed !== null &&
      input.evidence.detailTemplatesByOrigin.has(parsed.origin)
    );
  }

  const candidateUrl = cleanLine(input.candidate.canonicalUrl);
  if (!candidateUrl) {
    return false;
  }

  return (
    buildLearnedDetailUrlFromHint({
      url: candidateUrl,
      pageUrl: input.pageUrl,
      searchableText: [
        input.candidate.anchorText,
        input.candidate.headingText,
        ...input.candidate.lines,
      ]
        .filter((value): value is string => Boolean(value))
        .join(" "),
      evidence: input.evidence,
    }) !== null
  );
}
