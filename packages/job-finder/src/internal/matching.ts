import type { JobFinderAiClient } from "@unemployed/ai-providers";
import {
  SavedJobDiscoveryProvenanceSchema,
  SavedJobSchema,
  type ApplicationStatus,
  type CandidateProfile,
  type JobKeywordSignal,
  type JobSearchPreferences,
  type JobPosting,
  type MatchAssessment,
  type SavedJob,
  type SavedJobDiscoveryProvenance,
} from "@unemployed/contracts";
import {
  parseNormalizedCompensation,
  parseSalaryFloor,
} from "./matching-compensation";
import {
  buildFitRecommendation,
  buildRequirementEvidenceAssessment,
} from "./matching-requirements";
export {
  buildApplicationRecords,
  compareDiscoveryJobs,
  buildDiscoveryJobs,
  buildReviewQueue,
} from "./matching-review-queue";
import { normalizeText, tokenize, uniqueStrings } from "./shared";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type PhraseMatchMode = "generic" | "title" | "location";

const titleTokenAliases = new Map<string, string>([
  ["developer", "engineer"],
  ["developers", "engineer"],
  ["dev", "engineer"],
]);

const genericTitleTokens = new Set([
  "junior",
  "senior",
  "staff",
  "lead",
  "principal",
  "engineer",
]);

const titleTechnologySpecializations = [
  "elixir",
  "ruby",
  "java",
  "kotlin",
  "golang",
  "rust",
  "php",
  "python",
  "react",
  "angular",
  "vue",
  "salesforce",
  "ios",
  "android",
] as const;

type RoleFamily =
  | "engineering"
  | "data"
  | "support"
  | "marketing"
  | "sales"
  | "people"
  | "finance"
  | "design"
  | "operations"
  | "healthcare";

const roleFamilyPatterns: Record<RoleFamily, readonly RegExp[]> = {
  engineering: [
    /\bengineer(?:ing)?\b/,
    /\bdeveloper\b/,
    /\bsoftware\b/,
    /\bfrontend\b/,
    /\bbackend\b/,
    /\bfull\s*stack\b/,
    /\bdevops\b/,
    /\bsite reliability\b/,
    /\bplatform engineer(?:ing)?\b/,
    /\barchitect\b/,
  ],
  data: [
    /\bdata (?:engineer|scientist|analyst)\b/,
    /\banalytics?\b/,
    /\bbusiness intelligence\b/,
    /\bmachine learning\b/,
  ],
  support: [
    /\bcustomer (?:support|service|success|experience)\b/,
    /\btechnical support\b/,
    /\bsupport specialist\b/,
    /\bhelp ?desk\b/,
    /\bclient services?\b/,
  ],
  marketing: [
    /\bmarketing\b/,
    /\bcontent\b/,
    /\bcopywriter\b/,
    /\bcommunications?\b/,
    /\bseo\b/,
    /\bbrand\b/,
    /\bgrowth\b/,
  ],
  sales: [
    /\bsales\b/,
    /\baccount executive\b/,
    /\bbusiness development\b/,
    /\b(?:sales|business) development representative\b/,
  ],
  people: [
    /\bhuman resources?\b/,
    /\bhr\b/,
    /\bpeople (?:operations|partner|business)\b/,
    /\brecruit(?:er|ing|ment)\b/,
    /\btalent (?:acquisition|partner)\b/,
    /\btotal rewards?\b/,
    /\bcompensation\b/,
  ],
  finance: [
    /\bfinance\b/,
    /\bfinancial\b/,
    /\baccountant\b/,
    /\baccounting\b/,
    /\bcontroller\b/,
    /\bpayroll\b/,
  ],
  design: [
    /\bdesigner\b/,
    /\bproduct design\b/,
    /\bux\b/,
    /\bui design\b/,
  ],
  operations: [
    /\boperations?\b/,
    /\bproject coordinator\b/,
    /\bprogram coordinator\b/,
    /\badministrative\b/,
    /\boffice manager\b/,
  ],
  healthcare: [
    /\bnurs(?:e|ing)\b/,
    /\bphysician\b/,
    /\btherap(?:ist|y)\b/,
    /\bclinical\b/,
    /\bmedical\b/,
  ],
};

function collectRoleFamilies(value: string): Set<RoleFamily> {
  const normalized = normalizeText(value);
  return new Set(
    (Object.entries(roleFamilyPatterns) as Array<
      [RoleFamily, readonly RegExp[]]
    >).flatMap(([family, patterns]) =>
      family === "engineering" &&
      /\b(?:data|analytics|machine learning|ml|ai) engineer\b/.test(normalized)
        ? []
        : patterns.some((pattern) => pattern.test(normalized))
          ? [family]
          : [],
    ),
  );
}

function hasRoleFamilyMismatch(
  candidateTitle: string,
  targetRoles: readonly string[],
): boolean {
  const candidateFamilies = collectRoleFamilies(candidateTitle);
  const targetFamilies = new Set(
    targetRoles.flatMap((role) => [...collectRoleFamilies(role)]),
  );

  return (
    candidateFamilies.size > 0 &&
    targetFamilies.size > 0 &&
    ![...candidateFamilies].some((family) => targetFamilies.has(family))
  );
}

const locationNoiseTokens = new Set([
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

type BroadLocationRegion = "europe" | "americas" | "apac" | "africa";
type EuropeanLocationRegion =
  | "northern_europe"
  | "southern_europe"
  | "western_europe"
  | "central_europe"
  | "eastern_europe";

const broadLocationRegionPatterns: Record<
  BroadLocationRegion,
  readonly RegExp[]
> = {
  europe: [
    /\beurope\b/,
    /\bemea\b/,
    /\buk\b|\bunited kingdom\b|\bireland\b/,
    /\bkosovo\b|\bprishtina\b|\bpristina\b|\balbania\b|\bbalkan(?:s)?\b/,
    /\bspain\b|\bportugal\b|\bfrance\b|\bgermany\b|\baustria\b|\bnetherlands\b/,
    /\bhungary\b|\bpoland\b|\bitaly\b|\bsweden\b|\bnorway\b|\bdenmark\b|\bfinland\b/,
  ],
  americas: [
    /\bamericas?\b|\blatam\b/,
    /\bunited states\b|\busa\b|\bu\s*s\b|\bcanada\b/,
    /\bbrazil\b|\bmexico\b|\bargentina\b|\bcolombia\b/,
  ],
  apac: [
    /\bapac\b|\basia\b/,
    /\baustralia\b|\bnew zealand\b|\bjapan\b|\bsingapore\b|\bindia\b/,
  ],
  africa: [/\bafrica\b|\bnigeria\b|\bkenya\b|\bsouth africa\b/],
};

const europeanLocationRegionPatterns: Record<
  EuropeanLocationRegion,
  readonly RegExp[]
> = {
  northern_europe: [
    /\bnorthern europe\b/,
    /\b(?:united kingdom|uk|ireland|sweden|norway|denmark|finland|iceland)\b/,
  ],
  southern_europe: [
    /\bsouthern europe\b/,
    /\b(?:kosovo|prishtina|pristina|albania|balkans?|spain|portugal|italy|greece|malta|cyprus)\b/,
  ],
  western_europe: [
    /\bwestern europe\b/,
    /\b(?:france|germany|austria|netherlands|belgium|luxembourg|switzerland)\b/,
  ],
  central_europe: [
    /\bcentral europe\b/,
    /\b(?:hungary|poland|czechia|czech republic|slovakia|slovenia|croatia)\b/,
  ],
  eastern_europe: [
    /\beastern europe\b/,
    /\b(?:romania|bulgaria|moldova|ukraine|estonia|latvia|lithuania)\b/,
  ],
};

function inferBroadLocationRegions(value: string): Set<BroadLocationRegion> {
  const normalized = normalizeText(value);
  return new Set(
    (
      Object.entries(broadLocationRegionPatterns) as Array<
        [BroadLocationRegion, readonly RegExp[]]
      >
    ).flatMap(([region, patterns]) =>
      patterns.some((pattern) => pattern.test(normalized)) ? [region] : [],
    ),
  );
}

function inferEuropeanLocationRegions(
  value: string,
): Set<EuropeanLocationRegion> {
  const normalized = normalizeText(value);
  return new Set(
    (
      Object.entries(europeanLocationRegionPatterns) as Array<
        [EuropeanLocationRegion, readonly RegExp[]]
      >
    ).flatMap(([region, patterns]) =>
      patterns.some((pattern) => pattern.test(normalized)) ? [region] : [],
    ),
  );
}

export function getBroadLocationCompatibility(
  candidate: string,
  desiredValues: readonly string[],
): boolean | null {
  const candidateRegions = inferBroadLocationRegions(candidate);
  const desiredRegions = new Set(
    desiredValues.flatMap((value) => [...inferBroadLocationRegions(value)]),
  );

  if (candidateRegions.size === 0 || desiredRegions.size === 0) {
    return null;
  }

  if (candidateRegions.has("europe") && desiredRegions.has("europe")) {
    const candidateEuropeanRegions = inferEuropeanLocationRegions(candidate);
    const desiredEuropeanRegions = new Set(
      desiredValues.flatMap((value) => [
        ...inferEuropeanLocationRegions(value),
      ]),
    );

    if (candidateEuropeanRegions.size > 0) {
      if (desiredEuropeanRegions.size === 0) {
        return null;
      }

      return [...candidateEuropeanRegions].some((region) =>
        desiredEuropeanRegions.has(region),
      );
    }
  }

  return [...candidateRegions].some((region) => desiredRegions.has(region));
}

function cleanTitleMatchCandidate(value: string): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  if (!collapsed) {
    return "";
  }

  const dismissMatch = collapsed.match(/\bdismiss\s+(.+?)\s+job\b/i);
  const candidate = dismissMatch?.[1] ?? collapsed;

  return candidate
    .replace(/\(verified job\)/gi, " ")
    .replace(/\bverified job\b/gi, " ")
    .replace(/\b\d+\s+connection(?:s)?\s+works\s+here\b/gi, " ")
    .replace(/\b\d+\s+school alumni\b/gi, " ")
    .replace(/\b(viewed|promoted)\b.*$/i, " ")
    .replace(/\s*[•·|]\s*$/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getTitleMatchCandidateVariants(value: string): string[] {
  const collapsed = value.replace(/\s+/g, " ").trim();
  const cleaned = cleanTitleMatchCandidate(value);

  if (!cleaned || cleaned === collapsed) {
    return collapsed ? [collapsed] : [];
  }

  return [cleaned, collapsed];
}

function normalizePhraseMatchInput(
  value: string,
  mode: PhraseMatchMode,
): string {
  const normalized = value
    .replace(/\bfullstack\b/gi, "full stack")
    .replace(/\bfront\s*end\b/gi, "frontend")
    .replace(/\bback\s*end\b/gi, "backend");

  if (mode !== "location") {
    return normalized;
  }

  return normalized
    .replace(/\bon\s*site\b/gi, "onsite")
    .replace(/\bwork\s+from\s+home\b/gi, "remote");
}

function tokenizePhraseMatchValue(
  value: string,
  mode: PhraseMatchMode,
): string[] {
  const tokens = tokenize(normalizePhraseMatchInput(value, mode)).flatMap(
    (token) => {
      if (mode === "location" && locationNoiseTokens.has(token)) {
        return [];
      }

      if (mode === "title") {
        return [titleTokenAliases.get(token) ?? token];
      }

      return [token];
    },
  );

  return [...new Set(tokens)];
}

function isRemoteOnlyLocation(value: string): boolean {
  const genericTokens = tokenizePhraseMatchValue(value, "generic");
  const locationTokens = tokenizePhraseMatchValue(value, "location");

  return (
    locationTokens.length === 0 &&
    genericTokens.length > 0 &&
    genericTokens.every((token) => locationNoiseTokens.has(token))
  );
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

// Avoid fuzzy title-token matching on short tokens where one edit would be too permissive.
const MIN_FUZZY_MATCH_TOKEN_LENGTH = 6;

function phraseMatchTokensEqual(left: string, right: string): boolean {
  if (left === right) {
    return true;
  }

  if (
    left.length < MIN_FUZZY_MATCH_TOKEN_LENGTH ||
    right.length < MIN_FUZZY_MATCH_TOKEN_LENGTH
  ) {
    return false;
  }

  return isEditDistanceAtMostOne(left, right);
}

function everyPhraseTokenMatches(
  sourceTokens: readonly string[],
  targetTokens: readonly string[],
): boolean {
  return sourceTokens.every((sourceToken) =>
    targetTokens.some((targetToken) =>
      phraseMatchTokensEqual(sourceToken, targetToken),
    ),
  );
}

function countMatchedPhraseTokens(
  desiredTokens: readonly string[],
  candidateTokens: readonly string[],
): number {
  const remainingCandidateTokens = [...candidateTokens];
  let matchedCount = 0;

  for (const desiredToken of desiredTokens) {
    const matchedIndex = remainingCandidateTokens.findIndex((candidateToken) =>
      phraseMatchTokensEqual(desiredToken, candidateToken),
    );

    if (matchedIndex === -1) {
      continue;
    }

    matchedCount += 1;
    remainingCandidateTokens.splice(matchedIndex, 1);
  }

  return matchedCount;
}

const remoteGeographyHints = [
  {
    pattern: /\b(united states|u\.s\.|u\.s|us only|usa only)\b/i,
    label: "United States",
  },
  { pattern: /\b(united kingdom|uk only|u\.k\.)\b/i, label: "United Kingdom" },
  { pattern: /\b(european union|europe|eu only)\b/i, label: "Europe" },
  { pattern: /\b(canada|canadian)\b/i, label: "Canada" },
] as const;

export interface MergeDiscoveryResult {
  mergedJobs: SavedJob[];
  newJobs: SavedJob[];
  validatedCount: number;
  duplicatesMerged: number;
  invalidSkipped: number;
}

export function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function detectAtsProvider(posting: JobPosting): string | null {
  const urlCandidates = [
    posting.applicationUrl,
    posting.canonicalUrl,
    posting.employerWebsiteUrl,
  ].filter((value): value is string => Boolean(value));

  for (const value of urlCandidates) {
    const normalized = value.toLowerCase();

    if (normalized.includes("greenhouse.io")) {
      return "Greenhouse";
    }
    if (normalized.includes("lever.co")) {
      return "Lever";
    }
    if (
      normalized.includes("myworkdayjobs.com") ||
      normalized.includes("workday")
    ) {
      return "Workday";
    }
    if (normalized.includes("ashbyhq.com") || normalized.includes("ashby")) {
      return "Ashby";
    }
    if (normalized.includes("icims.com")) {
      return "iCIMS";
    }
  }

  return null;
}

function buildKeywordSignals(posting: JobPosting): JobKeywordSignal[] {
  const buckets: Array<{
    values: readonly string[];
    kind: JobKeywordSignal["kind"];
    weight: number;
  }> = [
    { values: posting.keySkills, kind: "skill", weight: 5 },
    { values: posting.responsibilities, kind: "responsibility", weight: 3 },
    { values: posting.minimumQualifications, kind: "qualification", weight: 4 },
    {
      values: posting.preferredQualifications,
      kind: "qualification",
      weight: 2,
    },
    { values: posting.benefits, kind: "benefit", weight: 1 },
  ];
  const seen = new Set<string>();

  return buckets.flatMap(({ values, kind, weight }) =>
    values.flatMap((value, index) => {
      const label = value.trim();

      if (!label) {
        return [];
      }

      const key = `${kind}:${normalizeText(label)}`;
      if (seen.has(key)) {
        return [];
      }

      seen.add(key);
      return [
        {
          id: `job_keyword_${kind}_${index}_${normalizeText(label).replaceAll(" ", "_")}`,
          label,
          kind,
          weight,
        },
      ];
    }),
  );
}

function buildScreeningHints(posting: JobPosting): SavedJob["screeningHints"] {
  const remoteHintSource = [
    posting.location,
    posting.summary,
    posting.description,
  ]
    .filter(Boolean)
    .join(" ");
  const normalizedText = normalizeText(
    [
      posting.location,
      posting.summary,
      posting.description,
      ...posting.minimumQualifications,
      ...posting.preferredQualifications,
    ]
      .filter(Boolean)
      .join(" "),
  );
  const supportsRemoteGeographyHints =
    posting.workMode.includes("remote") ||
    posting.workMode.includes("flexible") ||
    /\bremote\b/i.test(remoteHintSource);

  return {
    sponsorshipText:
      normalizedText.includes("visa sponsorship") ||
      normalizedText.includes("work authorization")
        ? "Work authorization or sponsorship details are mentioned in the listing."
        : null,
    requiresSecurityClearance:
      normalizedText.includes("security clearance") ||
      normalizedText.includes("active clearance")
        ? true
        : null,
    relocationText:
      normalizedText.includes("relocation") ||
      normalizedText.includes("relocate")
        ? "Relocation support or requirements are mentioned in the listing."
        : null,
    travelText: normalizedText.includes("travel")
      ? "Travel expectations are mentioned in the listing."
      : null,
    remoteGeographies: supportsRemoteGeographyHints
      ? uniqueStrings(
          remoteGeographyHints.flatMap((entry) =>
            entry.pattern.test(remoteHintSource) ? [entry.label] : [],
          ),
        )
      : [],
    requiresConsentInterrupt: null,
    requiresConsentInterruptKind: null,
  };
}

function mergeKeywordSignals(
  existingSignals: readonly JobKeywordSignal[],
  nextSignals: readonly JobKeywordSignal[],
): JobKeywordSignal[] {
  const byKey = new Map<string, JobKeywordSignal>();

  for (const signal of [...existingSignals, ...nextSignals]) {
    byKey.set(`${signal.kind}:${normalizeText(signal.label)}`, signal);
  }

  return [...byKey.values()];
}

function enrichDiscoveredPosting(
  posting: JobPosting,
  existingJob: SavedJob | undefined,
): JobPosting {
  const normalizedCompensation = parseNormalizedCompensation(
    posting.salaryText,
  );
  const screeningHints = buildScreeningHints(posting);
  const existingCompensation = existingJob?.normalizedCompensation;
  const postingKeywordSignals = posting.keywordSignals ?? [];

  return {
    ...posting,
    applicationUrl:
      posting.applicationUrl ??
      existingJob?.applicationUrl ??
      (posting.applyPath === "external_redirect"
        ? posting.employerWebsiteUrl
        : null),
    firstSeenAt:
      existingJob?.firstSeenAt ?? posting.firstSeenAt ?? posting.discoveredAt,
    lastSeenAt: posting.lastSeenAt ?? posting.discoveredAt,
    lastVerifiedActiveAt: posting.lastVerifiedActiveAt ?? posting.discoveredAt,
    normalizedCompensation:
      existingCompensation &&
      (existingCompensation.minAmount !== null ||
        existingCompensation.maxAmount !== null)
        ? {
            ...existingCompensation,
            ...normalizedCompensation,
            currency:
              normalizedCompensation.currency ?? existingCompensation.currency,
            interval:
              normalizedCompensation.interval ?? existingCompensation.interval,
            minAmount:
              normalizedCompensation.minAmount ??
              existingCompensation.minAmount,
            maxAmount:
              normalizedCompensation.maxAmount ??
              existingCompensation.maxAmount,
            minAnnualUsd:
              normalizedCompensation.minAnnualUsd ??
              existingCompensation.minAnnualUsd,
            maxAnnualUsd:
              normalizedCompensation.maxAnnualUsd ??
              existingCompensation.maxAnnualUsd,
          }
        : normalizedCompensation,
    atsProvider:
      posting.atsProvider ??
      existingJob?.atsProvider ??
      detectAtsProvider(posting),
    screeningHints: {
      sponsorshipText:
        screeningHints.sponsorshipText ??
        existingJob?.screeningHints.sponsorshipText ??
        null,
      requiresSecurityClearance:
        screeningHints.requiresSecurityClearance ??
        existingJob?.screeningHints.requiresSecurityClearance ??
        null,
      relocationText:
        screeningHints.relocationText ??
        existingJob?.screeningHints.relocationText ??
        null,
      travelText:
        screeningHints.travelText ??
        existingJob?.screeningHints.travelText ??
        null,
      remoteGeographies: uniqueStrings([
        ...(existingJob?.screeningHints.remoteGeographies ?? []),
        ...screeningHints.remoteGeographies,
      ]),
      requiresConsentInterrupt:
        screeningHints.requiresConsentInterrupt ??
        existingJob?.screeningHints.requiresConsentInterrupt ??
        null,
      requiresConsentInterruptKind:
        screeningHints.requiresConsentInterruptKind ??
        existingJob?.screeningHints.requiresConsentInterruptKind ??
        null,
    },
    keywordSignals: mergeKeywordSignals(
      existingJob?.keywordSignals ?? [],
      postingKeywordSignals.length > 0
        ? postingKeywordSignals
        : buildKeywordSignals(posting),
    ),
  };
}

export function matchesAnyPhrase(
  candidate: string,
  desiredValues: readonly string[],
): boolean {
  if (desiredValues.length === 0) {
    return true;
  }

  const normalizedCandidate = normalizeText(candidate);
  const candidateTokens = new Set(tokenize(candidate));

  return desiredValues.some((desiredValue) => {
    const normalizedDesired = normalizeText(desiredValue);

    if (!normalizedDesired) {
      return false;
    }

    const desiredTokens = tokenize(desiredValue);

    if (desiredTokens.length === 0) {
      return false;
    }

    if (desiredTokens.length === 1 && candidateTokens.has(normalizedDesired)) {
      return true;
    }

    if (
      new RegExp(`(^|\\s)${escapeRegex(normalizedDesired)}($|\\s)`).test(
        normalizedCandidate,
      )
    ) {
      return true;
    }

    return desiredTokens.every((token) => candidateTokens.has(token));
  });
}

export function matchesTitlePreference(
  candidate: string,
  desiredValues: readonly string[],
): boolean {
  // Title matching is intentionally richer than matchesAnyPhrase and should stay aligned with
  // target-role semantics unless we explicitly choose to widen or narrow role-title behavior.
  if (desiredValues.length === 0) {
    return true;
  }

  return getTitleMatchCandidateVariants(candidate).some((candidateVariant) => {
    const candidateTokens = tokenizePhraseMatchValue(candidateVariant, "title");
    const normalizedCandidate = candidateTokens.join(" ");

    return desiredValues.some((desiredValue) => {
      const desiredTokens = tokenizePhraseMatchValue(desiredValue, "title");

      if (desiredTokens.length === 0) {
        return false;
      }

      if (desiredTokens.length === 1) {
        return candidateTokens.some((candidateToken) =>
          phraseMatchTokensEqual(candidateToken, desiredTokens[0]!),
        );
      }

      const normalizedDesired = desiredTokens.join(" ");
      if (
        new RegExp(`(^|\\s)${escapeRegex(normalizedDesired)}($|\\s)`).test(
          normalizedCandidate,
        )
      ) {
        return true;
      }

      if (everyPhraseTokenMatches(desiredTokens, candidateTokens)) {
        return true;
      }

      const matchedCount = countMatchedPhraseTokens(
        desiredTokens,
        candidateTokens,
      );
      const matchRatio = matchedCount / desiredTokens.length;

      if (desiredTokens.length === 3) {
        const hasSpecificTokenMatch = desiredTokens
          .filter((token) => !genericTitleTokens.has(token))
          .some((desiredToken) =>
            candidateTokens.some((candidateToken) =>
              phraseMatchTokensEqual(candidateToken, desiredToken),
            ),
          );
        return (
          matchedCount >= 2 && matchRatio >= 2 / 3 && hasSpecificTokenMatch
        );
      }

      return matchedCount >= 3 && matchRatio >= 0.6;
    });
  });
}

export function matchesLocationPreference(
  candidate: string,
  desiredValues: readonly string[],
): boolean {
  // Location matching is intentionally richer than matchesAnyPhrase and should stay aligned with
  // location semantics unless we explicitly choose to widen or narrow location behavior.
  if (desiredValues.length === 0) {
    return true;
  }

  const candidateTokens = tokenizePhraseMatchValue(candidate, "location");
  const fallbackCandidateTokens = tokenizePhraseMatchValue(
    candidate,
    "generic",
  );
  const normalizedCandidate = candidateTokens.join(" ");

  if (isRemoteOnlyLocation(candidate)) {
    return true;
  }

  const candidateUsesBroadRemoteGeography =
    /\bremote\b|\bhybrid\b|\bemea\b|\beurope\b|\bapac\b|\blatam\b|\bamericas?\b|\bworldwide\b|\bglobal\b/iu.test(
      candidate,
    );
  if (
    candidateUsesBroadRemoteGeography &&
    getBroadLocationCompatibility(candidate, desiredValues) === true
  ) {
    return true;
  }

  return desiredValues.some((desiredValue) => {
    const desiredTokens = tokenizePhraseMatchValue(desiredValue, "location");
    const fallbackDesiredTokens = tokenizePhraseMatchValue(
      desiredValue,
      "generic",
    );

    if (desiredTokens.length === 0) {
      if (fallbackDesiredTokens.length === 0) {
        return false;
      }

      if (fallbackDesiredTokens.length === 1) {
        return fallbackCandidateTokens.some((candidateToken) =>
          phraseMatchTokensEqual(candidateToken, fallbackDesiredTokens[0]!),
        );
      }

      return everyPhraseTokenMatches(
        fallbackDesiredTokens,
        fallbackCandidateTokens,
      );
    }

    if (desiredTokens.length === 1) {
      return candidateTokens.some((candidateToken) =>
        phraseMatchTokensEqual(candidateToken, desiredTokens[0]!),
      );
    }

    const normalizedDesired = desiredTokens.join(" ");
    if (
      new RegExp(`(^|\\s)${escapeRegex(normalizedDesired)}($|\\s)`).test(
        normalizedCandidate,
      )
    ) {
      return true;
    }

    return (
      everyPhraseTokenMatches(desiredTokens, candidateTokens) ||
      everyPhraseTokenMatches(candidateTokens, desiredTokens)
    );
  });
}

export function toSavedJobId(posting: JobPosting): string {
  return `job_${posting.source}_${posting.sourceJobId}`;
}

export function createMatchAssessment(
  profile: CandidateProfile,
  searchPreferences: JobSearchPreferences,
  posting: JobPosting,
): MatchAssessment {
  let score = 48;
  // Deterministic overlap is a shortlist signal, not proof that every listed requirement is met.
  let scoreCeiling = 94;
  const reasons: string[] = [];
  const gaps: string[] = [];

  const matchesRole = matchesTitlePreference(
    posting.title,
    searchPreferences.targetRoles,
  );
  const roleFamilyMismatch = hasRoleFamilyMismatch(
    posting.title,
    searchPreferences.targetRoles,
  );
  const roleFamilyUnclear =
    searchPreferences.targetRoles.some(
      (role) => collectRoleFamilies(role).size > 0,
    ) &&
    collectRoleFamilies(posting.title).size === 0;
  const matchesLocation = matchesLocationPreference(
    posting.location,
    searchPreferences.locations,
  );
  const matchesWorkMode =
    searchPreferences.workModes.length === 0 ||
    searchPreferences.workModes.includes("flexible") ||
    posting.workMode.some((mode) => searchPreferences.workModes.includes(mode));
  const salaryFloor = parseSalaryFloor(posting.salaryText);
  const meetsSalaryExpectation =
    searchPreferences.minimumSalaryUsd === null ||
    salaryFloor === null ||
    salaryFloor >= searchPreferences.minimumSalaryUsd;
  const isPreferredCompany = searchPreferences.companyWhitelist.some(
    (company) => normalizeText(company) === normalizeText(posting.company),
  );
  const profileSkills = uniqueStrings([
    ...profile.skills,
    ...profile.skillGroups.coreSkills,
    ...profile.skillGroups.tools,
    ...profile.skillGroups.languagesAndFrameworks,
    ...profile.skillGroups.highlightedSkills,
    ...profile.experiences.flatMap((experience) => experience.skills),
    ...profile.projects.flatMap((project) => project.skills),
  ]);
  const postingSkillEvidence = [
    ...posting.keySkills,
    ...posting.keywordSignals.map((signal) => signal.label),
    posting.description,
    ...posting.responsibilities,
    ...posting.minimumQualifications,
    ...posting.preferredQualifications,
  ].join(" ");
  const overlappingSkills = profileSkills.filter((skill) =>
    matchesAnyPhrase(postingSkillEvidence, [skill]),
  );
  const profileCapabilityEvidence = [
    ...profileSkills,
    profile.headline,
    ...profile.experiences.flatMap((experience) => [
      experience.title,
      experience.summary,
      ...experience.achievements,
    ]),
    ...profile.projects.flatMap((project) => [
      project.name,
      project.role,
      project.summary,
      project.outcome,
    ]),
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
  const requirements = buildRequirementEvidenceAssessment({
    profile,
    posting,
    matchesLocation,
    matchesWorkMode,
    hasLocationPreferences: searchPreferences.locations.length > 0,
    hasWorkModePreferences: searchPreferences.workModes.length > 0,
  });
  const missingCoreRequirements = requirements.filter(
    (requirement) =>
      requirement.importance === "required" &&
      requirement.status === "missing" &&
      (requirement.category === "skill" ||
        requirement.category === "domain" ||
        requirement.category === "experience" ||
        requirement.category === "work_authorization"),
  );
  if (missingCoreRequirements.length >= 2) {
    scoreCeiling = Math.min(scoreCeiling, 64);
  } else if (missingCoreRequirements.length === 1) {
    scoreCeiling = Math.min(scoreCeiling, 74);
  }

  if (matchesRole) {
    score += 16;
    reasons.push("Role title aligns closely with the current target roles.");
  } else if (roleFamilyMismatch) {
    score -= 28;
    scoreCeiling = Math.min(scoreCeiling, 46);
    gaps.push(
      "Role family is outside the current target roles, so this is unlikely to be a useful match.",
    );
  } else if (roleFamilyUnclear) {
    score -= 22;
    scoreCeiling = Math.min(scoreCeiling, 50);
    gaps.push(
      "The title does not show a clear connection to the current target role families.",
    );
  } else {
    score -= 12;
    gaps.push(
      "Role title is adjacent to the target list but not an exact fit.",
    );
  }

  if (searchPreferences.locations.length === 0) {
    // An unconstrained search is neutral. It is not evidence that the listing
    // matches a location the user explicitly chose.
  } else if (matchesLocation) {
    score += 10;
    reasons.push("Location fits the saved search preferences.");
  } else {
    score -= 10;
    gaps.push("Location falls outside the preferred search areas.");
  }

  if (searchPreferences.workModes.length === 0) {
    // An unconstrained work mode is neutral for the same reason.
  } else if (matchesWorkMode) {
    score += 8;
    reasons.push("Work mode matches the preferred operating model.");
  } else {
    score -= 8;
    gaps.push(
      "Work mode does not match the saved remote or hybrid preferences.",
    );
  }

  const postingRequestsElevatedSeniority =
    /\b(?:staff|principal|director|manager|head)\b/iu.test(posting.title);
  const currentEngineeringTitle = [
    profile.headline,
    profile.experiences[0]?.title ?? "",
  ].join(" ");
  const profileShowsElevatedSeniority =
    /\b(?:staff|principal|director|manager|head|chief)\b/iu.test(
      currentEngineeringTitle,
    );
  if (postingRequestsElevatedSeniority && !profileShowsElevatedSeniority) {
    score -= 8;
    gaps.push(
      "The title signals a staff-or-leadership scope not yet explicit in the current profile.",
    );
  }

  const missingTitleTechnology = titleTechnologySpecializations.find(
    (technology) =>
      matchesAnyPhrase(posting.title, [technology]) &&
      !matchesAnyPhrase(profileCapabilityEvidence, [technology]),
  );
  if (missingTitleTechnology) {
    score -= 16;
    scoreCeiling = Math.min(scoreCeiling, 84);
    gaps.push(
      `The title explicitly specializes in ${missingTitleTechnology}, which is not present in the current profile evidence.`,
    );
  }

  const postingIsSiteReliabilitySpecialist =
    /\b(?:site reliability|sre)\b/iu.test(posting.title);
  const profileShowsSiteReliabilityDepth =
    /\b(?:site reliability|sre|kubernetes|terraform|incident response|on[ -]?call|observability)\b/iu.test(
      profileCapabilityEvidence,
    );
  if (postingIsSiteReliabilitySpecialist && !profileShowsSiteReliabilityDepth) {
    score -= 12;
    scoreCeiling = Math.min(scoreCeiling, 72);
    gaps.push(
      "The role is explicitly site-reliability focused, but the profile does not yet show SRE, on-call, infrastructure-as-code, or production-operations depth.",
    );
  }

  if (searchPreferences.minimumSalaryUsd === null) {
    // Missing compensation preferences and missing listing salary data should
    // never manufacture positive fit evidence.
  } else if (meetsSalaryExpectation) {
    score += 6;
  } else {
    gaps.push("Compensation looks below the saved salary target.");
  }

  if (isPreferredCompany) {
    score += 8;
    reasons.push("Company appears in the current preferred-company list.");
  }

  if (overlappingSkills.length > 0) {
    score += Math.min(12, overlappingSkills.length * 4);
    reasons.push(
      `Skill overlap includes ${overlappingSkills.slice(0, 2).join(" and ")}.`,
    );
  } else {
    gaps.push(
      "The listing emphasizes skills that are not yet prominent in the current profile.",
    );
  }

  if (posting.easyApplyEligible) {
    score += 6;
    reasons.push(
      "Easy Apply is available for the listing, keeping the flow in scope.",
    );
  }

  const requirementEvidencePenalty = requirements.reduce(
    (total, requirement) => {
      if (
        requirement.category === "location" ||
        requirement.category === "work_mode" ||
        requirement.status === "supported"
      ) {
        return total;
      }

      if (requirement.status === "conflict") {
        return total + 16;
      }
      if (requirement.status === "unknown") {
        return total + (requirement.importance === "required" ? 4 : 1);
      }
      if (requirement.importance === "required") {
        return total + 8;
      }
      if (requirement.importance === "preferred") {
        return total + 3;
      }
      return total + 2;
    },
    0,
  );
  score -= Math.min(24, requirementEvidencePenalty);

  const finalScore = clampScore(Math.min(score, scoreCeiling));
  const recommendation = buildFitRecommendation({
    score: finalScore,
    requirements,
  });

  return {
    score: finalScore,
    reasons: reasons.slice(0, 3),
    gaps: gaps.slice(0, 3),
    recommendation: recommendation.recommendation,
    recommendationRationale: recommendation.rationale,
    requirements,
  };
}

export async function createMatchAssessmentAsync(
  aiClient: JobFinderAiClient,
  profile: CandidateProfile,
  searchPreferences: JobSearchPreferences,
  posting: JobPosting,
): Promise<MatchAssessment> {
  const fallbackAssessment = createMatchAssessment(
    profile,
    searchPreferences,
    posting,
  );
  const assistedAssessment = await aiClient.assessJobFit({
    profile,
    searchPreferences,
    job: posting,
  });

  if (!assistedAssessment) {
    return fallbackAssessment;
  }

  return {
    ...fallbackAssessment,
    score: clampScore(assistedAssessment.score),
    reasons: assistedAssessment.reasons.slice(0, 3),
    gaps: assistedAssessment.gaps.slice(0, 3),
  };
}

export function preserveJobStatus(
  existingJob: SavedJob | undefined,
): ApplicationStatus {
  if (!existingJob) {
    return "discovered";
  }

  if (
    existingJob.status === "archived" ||
    existingJob.status === "submitted" ||
    existingJob.status === "rejected"
  ) {
    return existingJob.status;
  }

  return existingJob.status;
}

export function mergeDiscoveredJob(
  matchAssessment: MatchAssessment,
  posting: JobPosting,
  existingJob: SavedJob | undefined,
): SavedJob {
  const enrichedPosting = enrichDiscoveredPosting(posting, existingJob);

  return SavedJobSchema.parse({
    ...enrichedPosting,
    id: existingJob?.id ?? toSavedJobId(posting),
    status: preserveJobStatus(existingJob),
    matchAssessment,
  });
}

// Helper to merge discovered postings with existing jobs
export function mergeDiscoveredPostings(
  profile: CandidateProfile,
  searchPreferences: JobSearchPreferences,
  savedJobs: readonly SavedJob[],
  discoveredPostings: readonly JobPosting[],
  provenanceBuilder: (posting: JobPosting) => SavedJobDiscoveryProvenance,
  signal?: AbortSignal,
): MergeDiscoveryResult {
  // Check if already aborted
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  const savedJobsByPostingKey = new Map<string, SavedJob>();
  const savedJobsBySourceId = new Map<string, SavedJob>();
  const newJobs: SavedJob[] = [];
  let validatedCount = 0;
  let duplicatesMerged = 0;
  let invalidSkipped = 0;

  for (const job of savedJobs) {
    // Full key with canonical URL
    const key = `${job.source}:${job.sourceJobId}:${job.canonicalUrl}`;
    savedJobsByPostingKey.set(key, job);
    // Fallback key without URL (for when canonical URL changes)
    const sourceIdKey = `${job.source}:${job.sourceJobId}`;
    savedJobsBySourceId.set(sourceIdKey, job);
  }

  const nextJobsById = new Map(savedJobs.map((job) => [job.id, job]));

  for (const posting of discoveredPostings) {
    // Check for cancellation periodically
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    const postingKey = `${posting.source}:${posting.sourceJobId}:${posting.canonicalUrl}`;
    const sourceIdKey = `${posting.source}:${posting.sourceJobId}`;

    // Try full key first, then fallback to source+sourceId
    const existingJob =
      savedJobsByPostingKey.get(postingKey) ??
      savedJobsBySourceId.get(sourceIdKey);
    const postingUrl = (() => {
      try {
        return new URL(posting.canonicalUrl);
      } catch {
        return null;
      }
    })();

    if (!posting.sourceJobId || !postingUrl) {
      invalidSkipped += 1;
      continue;
    }

    validatedCount += 1;

    const matchAssessment = createMatchAssessment(
      profile,
      searchPreferences,
      posting,
    );
    const provenance = provenanceBuilder(posting);
    const mergedJob = SavedJobSchema.parse({
      ...mergeDiscoveredJob(matchAssessment, posting, existingJob),
      provenance: uniqueProvenance([
        ...(existingJob?.provenance ?? []),
        provenance,
      ]),
    });

    if (existingJob) {
      duplicatesMerged += 1;
    } else {
      newJobs.push(mergedJob);
    }

    savedJobsByPostingKey.set(postingKey, mergedJob);
    savedJobsBySourceId.set(sourceIdKey, mergedJob);
    nextJobsById.set(mergedJob.id, mergedJob);
  }

  return {
    mergedJobs: [...nextJobsById.values()],
    newJobs,
    validatedCount,
    duplicatesMerged,
    invalidSkipped,
  };
}

export function uniqueProvenance(
  values: readonly SavedJobDiscoveryProvenance[],
): SavedJobDiscoveryProvenance[] {
  const seen = new Set<string>();

  return values.flatMap((value) => {
    const parsed = SavedJobDiscoveryProvenanceSchema.parse(value);
    const key = `${parsed.targetId}:${parsed.adapterKind}:${parsed.resolvedAdapterKind ?? "none"}:${parsed.startingUrl}`;

    if (seen.has(key)) {
      return [];
    }

    seen.add(key);
    return [parsed];
  });
}
