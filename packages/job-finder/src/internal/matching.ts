import type { JobFinderAiClient } from "@unemployed/ai-providers";
import {
  SavedJobDiscoveryProvenanceSchema,
  SavedJobSchema,
  jobPostingDetailQualityValues,
  type ApplicationStatus,
  type CandidateProfile,
  type JobKeywordSignal,
  type JobSearchPreferences,
  type JobPosting,
  type JobPostingDetailQuality,
  type MatchAssessment,
  type SavedJob,
  type SavedJobDiscoveryProvenance,
  type WorkMode,
} from "@unemployed/contracts";
import {
  evaluateCompensationFit,
  parseNormalizedCompensation,
} from "./matching-compensation";
import type { MatchAssessmentPostingInput } from "./match-assessment-posting-input";
import { createMatchAssessmentChangeAudit } from "./match-assessment-change-audit";
import { MATCH_ASSESSMENT_SCORER_VERSION } from "./match-assessment-session";
import { buildMatchDimensionsAssessment } from "./matching-dimensions";
import {
  buildFitRecommendation,
  buildRequirementEvidenceAssessment,
} from "./matching-requirements";
import { canonicalizeLocationAliases } from "./location-normalization";
import {
  createJobIdentityDigest,
  createJobIdentityIndex,
} from "./job-identity";
import { assessJobPostingDetailQuality } from "./job-posting-detail-quality";
import { buildDiscoveryJobs as orderVisibleDiscoveryJobs } from "./matching-review-queue";
export {
  buildApplicationRecords,
  compareDiscoveryJobs,
  buildDiscoveryJobs,
  buildReviewQueue,
} from "./matching-review-queue";
import {
  isAbsentFieldText,
  normalizeText,
  tokenize,
  uniqueStrings,
} from "./shared";

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
  | "product"
  | "marketing"
  | "sales"
  | "people"
  | "finance"
  | "legal"
  | "risk_compliance"
  | "security"
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
  product: [
    /\bproduct (?:manager|management|owner|operations?)\b/,
    /\bproduct strategy\b/,
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
    /\baccount manager\b/,
    /\bbusiness development\b/,
    /\b(?:sales|business) development representative\b/,
    /\bgo[ -]?to[ -]?market\b/,
    /\bgtm\b/,
  ],
  people: [
    /\bhuman resources?\b/,
    /\bhr\b/,
    /\bpeople (?:operations|partner|business)\b/,
    /\brecruit(?:er|ing|ment)\b/,
    /\btalent (?:acquisition|partner)\b/,
    /\btotal rewards?\b/,
    /\bcompensation\b/,
    /\b(?:global )?mobility specialist\b/,
    /\btime (?:and )?attendance\b/,
    /\bemployee relations?\b/,
    /\bemployee (?:lifecycle|transitions?)\b/,
    /\blabou?r relations?\b/,
  ],
  finance: [
    /\bfinance\b/,
    /\bfinancial\b/,
    /\baccountant\b/,
    /\baccounting\b/,
    /\bcontroller\b/,
    /\bpayroll\b/,
    /\bbilling\b/,
    /\baccounts? (?:payable|receivable)\b/,
    /\btreasury\b/,
    /\btax\b/,
  ],
  legal: [
    /\blegal\b/,
    /\bcounsel\b/,
    /\battorney\b/,
    /\blawyer\b/,
    /\bparalegal\b/,
    /\bsolicitor\b/,
  ],
  risk_compliance: [
    /\brisk\b/,
    /\baudit(?:or|ing)?\b/,
    /\bcompliance\b/,
    /\bfraud\b/,
    /\banti money laundering\b/,
    /\baml\b/,
    /\bedd analyst\b/,
    /\benhanced due diligence\b/,
    /\bkyc\b/,
    /\bohs\b/,
    /\boccupational (?:health (?:and )?)?safety\b/,
    /\b(?:workplace|health (?:and )?)safety\b/,
    /\bsafety (?:officer|specialist|manager|advisor|coordinator)\b/,
    /\bprevenci n de riesgos laborales\b/,
  ],
  security: [
    /\bciso\b/,
    /\bchief information security officer\b/,
    /\bcyber ?security\b/,
    /\binformation security\b/,
  ],
  design: [/\bdesigner\b/, /\bproduct design\b/, /\bux\b/, /\bui design\b/],
  operations: [
    /\boperations?\b/,
    /\bproject coordinator\b/,
    /\bprogram coordinator\b/,
    /\badministrative\b/,
    /\boffice manager\b/,
    /\bprocurement\b/,
    /\bsupply chain\b/,
    /\blogistics\b/,
    /\bcontracts? management\b/,
    /\bcontracts? (?:manager|specialist|administrator)\b/,
    /\bvendor management\b/,
  ],
  healthcare: [
    /\bnurs(?:e|ing)\b/,
    /\bphysician\b/,
    /\btherap(?:ist|y)\b/,
    /\bclinical\b/,
    /\bmedical\b/,
  ],
};

const primaryRoleFamilyPatterns: ReadonlyArray<readonly [RoleFamily, RegExp]> =
  [
    [
      "data",
      /\b(?:data engineer|data scientist|data analyst|analytics engineer|machine learning engineer|ml engineer|ai engineer)\b/iu,
    ],
    [
      "engineering",
      /\b(?:software|frontend|front[- ]end|backend|back[- ]end|full[- ]?stack|platform|site reliability|devops) engineer\b|\bsoftware developer\b/iu,
    ],
    [
      "sales",
      /\b(?:account executive|sales engineer|sales manager|business development|sales development representative)\b/iu,
    ],
    [
      "support",
      /\b(?:customer success|customer support|customer service|technical support|support specialist|client services?)\b/iu,
    ],
    [
      "design",
      /\b(?:product|ux|ui|interaction|visual) designer\b|\bux researcher\b/iu,
    ],
    [
      "finance",
      /\b(?:financial analyst|accountant|controller|payroll specialist|financial engineer)\b/iu,
    ],
    [
      "people",
      /\b(?:recruiter|talent acquisition|human resources|people operations)\b/iu,
    ],
    ["healthcare", /\b(?:nurse|physician|therapist|clinical engineer)\b/iu],
  ];

function getPrimaryRoleFamily(value: string): RoleFamily | null {
  return (
    primaryRoleFamilyPatterns.find(([, pattern]) => pattern.test(value))?.[0] ??
    null
  );
}

function collectRoleFamilies(value: string): Set<RoleFamily> {
  const normalized = normalizeText(value);
  // Classify reusable occupational phrases rather than complete listing titles.
  // A title may belong to more than one family; an explicit target anchor such
  // as "Software Engineer" or "Customer Support" therefore still wins when a
  // second phrase only describes the product domain. Generic wrappers such as
  // "Lifecycle" and "Specialist" intentionally carry no family on their own.
  return new Set(
    (
      Object.entries(roleFamilyPatterns) as Array<
        [RoleFamily, readonly RegExp[]]
      >
    ).flatMap(([family, patterns]) =>
      family === "engineering" &&
      /\b(?:data|analytics|machine learning|ml|ai) engineer\b/.test(normalized)
        ? []
        : patterns.some((pattern) => pattern.test(normalized))
          ? [family]
          : [],
    ),
  );
}

const engineeringVocationalTitlePatterns: ReadonlyArray<
  readonly [RoleFamily, RegExp]
> = [
  ["sales", /\bsales engineer\b/iu],
  ["support", /\b(?:technical |customer )?support engineer\b/iu],
  ["finance", /\bfinancial engineer\b/iu],
  ["healthcare", /\bclinical engineer\b/iu],
];

function hasRoleFamilyMismatch(
  candidateTitle: string,
  targetRoles: readonly string[],
): boolean {
  const candidateFamilies = collectRoleFamilies(candidateTitle);
  const targetFamilies = new Set(
    targetRoles.flatMap((role) => [...collectRoleFamilies(role)]),
  );
  if (candidateFamilies.size === 0 || targetFamilies.size === 0) {
    return false;
  }
  if (![...candidateFamilies].some((family) => targetFamilies.has(family))) {
    return true;
  }

  // Generic targets such as "Senior Engineer" must not collapse vocationally
  // distinct Sales Engineer or Support Engineer roles into software matches.
  const candidatePrimaryFamily = getPrimaryRoleFamily(candidateTitle);
  const targetPrimaryFamilies = new Set(
    targetRoles
      .map(getPrimaryRoleFamily)
      .filter((family): family is RoleFamily => family !== null),
  );
  if (
    candidatePrimaryFamily &&
    targetPrimaryFamilies.size > 0 &&
    !targetPrimaryFamilies.has(candidatePrimaryFamily)
  ) {
    return true;
  }
  // Match the occupational phrase, not a domain qualifier such as
  // "Software Engineer, Sales Platform".
  return engineeringVocationalTitlePatterns.some(
    ([family, pattern]) =>
      !targetFamilies.has(family) && pattern.test(candidateTitle),
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

  return canonicalizeLocationAliases(normalized)
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

// Noise tokens that assert availability across every geography rather than a
// work mode alone.
const worldwideLocationNoiseTokens = new Set([
  "anywhere",
  "worldwide",
  "global",
]);

const broadRemoteGeographyPattern =
  /\bremote\b|\bhybrid\b|\bemea\b|\beurope\b|\bapac\b|\blatam\b|\bamericas?\b|\bworldwide\b|\bglobal\b/iu;

type LocationGeographySignal = {
  rawText: string;
  tokens: readonly string[];
  genericTokens: readonly string[];
  workModeTokens: readonly string[];
  noiseOnly: boolean;
  regions: ReadonlySet<BroadLocationRegion>;
  europeanRegions: ReadonlySet<EuropeanLocationRegion>;
};

function readLocationGeographySignal(value: string): LocationGeographySignal {
  // Work-mode phrases normalize into noise tokens ("work from home" reads as
  // "remote"), so classification and the retained work-mode tokens share one
  // view of the value.
  const workModeTokens = tokenize(normalizePhraseMatchInput(value, "location"));

  return {
    rawText: value,
    tokens: tokenizePhraseMatchValue(value, "location"),
    genericTokens: tokenizePhraseMatchValue(value, "generic"),
    workModeTokens,
    noiseOnly:
      workModeTokens.length > 0 &&
      workModeTokens.every((token) => locationNoiseTokens.has(token)),
    regions: inferBroadLocationRegions(value),
    europeanRegions: inferEuropeanLocationRegions(value),
  };
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

type AtsProviderHostRule = {
  provider: string;
  exact?: readonly string[];
  suffixes?: readonly string[];
};

// Metadata taxonomy only: these hosts label saved jobs with the ATS provider
// that hosted the listing. Discovery routing and workflow policy never branch
// on them.
const ATS_PROVIDER_HOST_RULES: readonly AtsProviderHostRule[] = [
  { provider: "Greenhouse", suffixes: ["greenhouse.io"] },
  { provider: "Lever", suffixes: ["lever.co"] },
  { provider: "Workday", suffixes: ["myworkdayjobs.com"] },
  { provider: "Ashby", suffixes: ["ashbyhq.com"] },
  { provider: "iCIMS", suffixes: ["icims.com", "icims.eu"] },
];

function parseHttpUrlHostname(value: string | null): string | null {
  if (!value) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }

  // URL.hostname already lowercases and IDN-encodes special-scheme hosts;
  // only a trailing root dot survives parsing, so strip it explicitly.
  const hostname = parsed.hostname.toLowerCase().replace(/\.+$/u, "");
  return hostname.length > 0 ? hostname : null;
}

function matchesAtsProviderHostRule(
  hostname: string,
  rule: AtsProviderHostRule,
): boolean {
  if (rule.exact?.includes(hostname)) {
    return true;
  }

  return (
    rule.suffixes?.some(
      (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
    ) ?? false
  );
}

function detectAtsProvider(posting: JobPosting): string | null {
  const urlCandidates = [
    posting.applicationUrl,
    posting.canonicalUrl,
    posting.employerWebsiteUrl,
  ];

  for (const value of urlCandidates) {
    const hostname = parseHttpUrlHostname(value);
    if (hostname === null) {
      continue;
    }

    const matchedRule = ATS_PROVIDER_HOST_RULES.find((rule) =>
      matchesAtsProviderHostRule(hostname, rule),
    );
    if (matchedRule) {
      return matchedRule.provider;
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

function selectLatestProviderUpdate(
  incoming: string | null,
  existing: string | null | undefined,
): string | null {
  if (!incoming) {
    return existing ?? null;
  }
  if (!existing) {
    return incoming;
  }
  return Date.parse(incoming) >= Date.parse(existing) ? incoming : existing;
}

function jobPostingDetailQualityRank(quality: JobPostingDetailQuality): number {
  return jobPostingDetailQualityValues.indexOf(quality);
}

function strongestDetailQuality(
  left: JobPostingDetailQuality,
  right: JobPostingDetailQuality,
): JobPostingDetailQuality {
  return jobPostingDetailQualityRank(left) >= jobPostingDetailQualityRank(right)
    ? left
    : right;
}

// Historical quality metadata remains evidence even if the current rubric
// cannot reconstruct it. Incoming strength is grounded in current content.
function hasWeakerIncomingDetailEvidence(
  posting: JobPosting,
  existingJob: SavedJob,
): boolean {
  const existingQuality = strongestDetailQuality(
    existingJob.detailQuality,
    assessJobPostingDetailQuality(existingJob),
  );

  return (
    jobPostingDetailQualityRank(assessJobPostingDetailQuality(posting)) <
    jobPostingDetailQualityRank(existingQuality)
  );
}

// Preserved groups cover every resume-affecting content field verbatim so a
// weaker recrawl leaves the stored resume-staleness signature untouched.
// Card-level freshness (lastSeenAt, providerUpdatedAt, provenance) still flows;
// nullable evidence links only fall back when the thinner recrawl dropped them.
function preserveRicherExistingDetail(
  enrichedPosting: JobPosting,
  existingJob: SavedJob,
): JobPosting {
  const existingQuality = strongestDetailQuality(
    existingJob.detailQuality,
    assessJobPostingDetailQuality(existingJob),
  );

  return {
    ...enrichedPosting,
    summary: existingJob.summary,
    description: existingJob.description,
    keySkills: [...existingJob.keySkills],
    responsibilities: [...existingJob.responsibilities],
    minimumQualifications: [...existingJob.minimumQualifications],
    preferredQualifications: [...existingJob.preferredQualifications],
    benefits: [...existingJob.benefits],
    seniority: existingJob.seniority,
    employmentType: existingJob.employmentType,
    department: existingJob.department,
    team: existingJob.team,
    salaryText: enrichedPosting.salaryText ?? existingJob.salaryText,
    employerWebsiteUrl:
      enrichedPosting.employerWebsiteUrl ?? existingJob.employerWebsiteUrl,
    employerDomain:
      enrichedPosting.employerDomain ?? existingJob.employerDomain,
    detailQuality: existingQuality,
    keywordSignals: [...existingJob.keywordSignals],
  };
}

export function enrichDiscoveredPosting(
  posting: JobPosting,
  existingJob: SavedJob | undefined,
): JobPosting {
  const normalizedCompensation = parseNormalizedCompensation(
    posting.salaryText,
  );
  const screeningHints = buildScreeningHints(posting);
  const existingCompensation = existingJob?.normalizedCompensation;
  const postingKeywordSignals = posting.keywordSignals ?? [];

  const enrichedPosting: JobPosting = {
    ...posting,
    providerUpdatedAt: selectLatestProviderUpdate(
      posting.providerUpdatedAt,
      existingJob?.providerUpdatedAt,
    ),
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

  if (existingJob && hasWeakerIncomingDetailEvidence(posting, existingJob)) {
    return preserveRicherExistingDetail(enrichedPosting, existingJob);
  }

  return enrichedPosting;
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

function matchesLocationPhrase(
  candidateSignal: LocationGeographySignal,
  desiredSignal: LocationGeographySignal,
): boolean {
  const candidateTokens = candidateSignal.tokens;
  const normalizedCandidate = candidateTokens.join(" ");
  const desiredTokens = desiredSignal.tokens;

  if (desiredTokens.length === 0) {
    const fallbackDesiredTokens = desiredSignal.genericTokens;
    if (fallbackDesiredTokens.length === 0) {
      return false;
    }

    if (fallbackDesiredTokens.length === 1) {
      return candidateSignal.genericTokens.some((candidateToken) =>
        phraseMatchTokensEqual(candidateToken, fallbackDesiredTokens[0]!),
      );
    }

    return everyPhraseTokenMatches(
      fallbackDesiredTokens,
      candidateSignal.genericTokens,
    );
  }

  // An empty candidate side cannot match a concrete place; the symmetric
  // token comparison below would otherwise hold vacuously.
  if (candidateTokens.length === 0) {
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

  return (
    everyPhraseTokenMatches(desiredTokens, candidateTokens) ||
    everyPhraseTokenMatches(candidateTokens, desiredTokens)
  );
}

function isCoarseRegionalSignal(signal: LocationGeographySignal): boolean {
  // Only europe has a finer subregion layer; every other broad region is
  // terminal, so any signal resolving to it is coarse by definition.
  return signal.europeanRegions.size === 0;
}

// Conservative containment for exclusion decisions: possible regional overlap
// conflicts, proven separation does not. Two fine-grained places in the same
// subregion are not enough evidence; at least one side must stop at the
// region level.
function locationRegionsPossiblyOverlap(
  left: LocationGeographySignal,
  right: LocationGeographySignal,
): boolean {
  if (left.regions.size === 0 || right.regions.size === 0) {
    return false;
  }

  if (![...left.regions].some((region) => right.regions.has(region))) {
    return false;
  }

  if (!isCoarseRegionalSignal(left) && !isCoarseRegionalSignal(right)) {
    return false;
  }

  if (
    left.regions.has("europe") &&
    right.regions.has("europe") &&
    left.europeanRegions.size > 0 &&
    right.europeanRegions.size > 0 &&
    ![...left.europeanRegions].some((region) =>
      right.europeanRegions.has(region),
    )
  ) {
    return false;
  }

  return true;
}

export type LocationCompatibilityState =
  | "compatible"
  | "incompatible"
  | "unknown";

/**
 * The saved places that actually constrain a search.
 *
 * An imported profile can push a stored absence placeholder ("Location not
 * stated") into the preferred locations, and a user can type "N/A"; neither
 * states a place. `assessLocationCompatibility` answers "compatible" for both
 * "no constraint" and "verified match", so every caller that distinguishes
 * those two must count the constraints here rather than the raw saved list —
 * otherwise a placeholder-only preference reads as a location the user chose
 * and the listing met.
 */
function getSavedLocationConstraints(
  desiredValues: readonly string[],
): readonly string[] {
  if (desiredValues.every((value) => !isAbsentFieldText(value))) {
    return desiredValues;
  }
  return desiredValues.filter((value) => !isAbsentFieldText(value));
}

// Positive preference fit only. Work-mode noise ("Remote", "Hybrid") states
// how a job is done, never where, so it cannot confirm geographic
// compatibility; "worldwide"/"anywhere" coverage is the documented exception
// because it includes every saved area.
export function assessLocationCompatibility(
  candidate: string,
  desiredValues: readonly string[],
): LocationCompatibilityState {
  // An absence placeholder is not a place on either side. A saved preference
  // that reads "N/A" or "Location not stated" states no geographic constraint,
  // so tokenising it would fabricate a conflict against every real listing.
  const desiredPlaces = getSavedLocationConstraints(desiredValues);
  if (desiredPlaces.length === 0) {
    return "compatible";
  }

  // An absence placeholder is not a place. Comparing it against a saved city
  // can only ever produce a conflict the app never actually observed.
  if (isAbsentFieldText(candidate)) {
    return "unknown";
  }

  const candidateSignal = readLocationGeographySignal(candidate);
  const desiredSignals = desiredPlaces.map(readLocationGeographySignal);

  if (candidateSignal.genericTokens.length === 0) {
    return "unknown";
  }

  if (candidateSignal.noiseOnly) {
    if (desiredSignals.some((signal) => signal.noiseOnly)) {
      return "compatible";
    }

    if (
      candidateSignal.genericTokens.some((token) =>
        worldwideLocationNoiseTokens.has(token),
      )
    ) {
      return "compatible";
    }

    return "unknown";
  }

  if (
    broadRemoteGeographyPattern.test(candidateSignal.rawText) &&
    getBroadLocationCompatibility(candidate, desiredPlaces) === true
  ) {
    return "compatible";
  }

  const hasGeographicDesired = desiredSignals.some(
    (signal) => !signal.noiseOnly,
  );
  const matched = desiredSignals.some((desiredSignal) =>
    matchesLocationPhrase(candidateSignal, desiredSignal),
  );

  if (matched) {
    return "compatible";
  }

  // Without any geographic constraint to compare against, a failed
  // work-mode token overlap is neutral rather than a conflict.
  return hasGeographicDesired ? "incompatible" : "unknown";
}

export interface PostingLocationCompatibility {
  state: LocationCompatibilityState;
  /**
   * True when the saved places alone would have read as outside or unknown,
   * but the listing is remote and remote is one of the preferred work modes,
   * so the place comparison no longer decides fit.
   */
  remotePreferenceApplied: boolean;
}

/**
 * Location fit for a posting, honoring the saved work modes. A user who
 * prefers remote work has said that where the employer sits matters less than
 * how the job is done, so a remote listing must not be scored as "outside the
 * saved areas" merely because its stated place is not the saved city. An
 * explicit regional restriction that excludes every saved area (for example
 * "Remote - United States" against a European place) still needs the user's
 * confirmation and stays unknown rather than compatible.
 */
export function assessPostingLocationCompatibility(
  posting: Pick<MatchAssessmentPostingInput, "location" | "workMode">,
  searchPreferences: Pick<JobSearchPreferences, "locations" | "workModes">,
): PostingLocationCompatibility {
  const savedPlaces = getSavedLocationConstraints(searchPreferences.locations);
  const state = assessLocationCompatibility(posting.location, savedPlaces);
  if (state === "compatible" || savedPlaces.length === 0) {
    return { state, remotePreferenceApplied: false };
  }

  const listingIsRemote =
    posting.workMode.includes("remote") ||
    /\bremote\b/iu.test(posting.location);
  const prefersRemote = searchPreferences.workModes.includes("remote");
  if (!listingIsRemote || !prefersRemote) {
    return { state, remotePreferenceApplied: false };
  }

  const broadCompatibility = getBroadLocationCompatibility(
    posting.location,
    savedPlaces,
  );
  return {
    state: broadCompatibility === false ? "unknown" : "compatible",
    remotePreferenceApplied: true,
  };
}

export function matchesLocationPreference(
  candidate: string,
  desiredValues: readonly string[],
): boolean {
  // Location matching is intentionally richer than matchesAnyPhrase and should stay aligned with
  // location semantics unless we explicitly choose to widen or narrow location behavior.
  return assessLocationCompatibility(candidate, desiredValues) === "compatible";
}

export type WorkModeCompatibilityState = "compatible" | "conflict" | "unknown";

/**
 * Positive preference fit only, from concrete listing evidence. A listing that
 * names no concrete mode (empty or "flexible" alone) stays unknown rather than
 * compatible: offered flexibility is not evidence of any specific accepted
 * mode. The same unknown applies when unpreferred concrete modes are listed
 * alongside "flexible", so ambiguity is never hardened into a conflict. An
 * all-concrete mismatch remains a real conflict.
 */
export function assessWorkModeCompatibility(
  listingWorkModes: readonly WorkMode[],
  preferredWorkModes: readonly WorkMode[],
): WorkModeCompatibilityState {
  if (
    preferredWorkModes.length === 0 ||
    preferredWorkModes.includes("flexible")
  ) {
    return "compatible";
  }

  const concreteListingModes = listingWorkModes.filter(
    (mode) => mode !== "flexible",
  );
  if (concreteListingModes.length === 0) {
    return "unknown";
  }

  if (concreteListingModes.some((mode) => preferredWorkModes.includes(mode))) {
    return "compatible";
  }

  return listingWorkModes.includes("flexible") ? "unknown" : "conflict";
}

// Exclusion conflicts are a different question from positive fit: they skip
// listings and must rest on concrete or conservatively contained geography.
// Noise-only listings never conflict with an arbitrary excluded place; they
// can only conflict when an exclusion targets that same work-mode noise.
export function matchesExcludedLocation(
  candidate: string,
  excludedValues: readonly string[],
): boolean {
  if (excludedValues.length === 0) {
    return false;
  }

  // An absence placeholder cannot be excluded: nothing was observed to exclude.
  if (isAbsentFieldText(candidate)) {
    return false;
  }

  const candidateSignal = readLocationGeographySignal(candidate);
  const matchesWorkModeExclusion = (excludedSignal: LocationGeographySignal) =>
    excludedSignal.noiseOnly &&
    excludedSignal.workModeTokens.length > 0 &&
    excludedSignal.workModeTokens.every((token) =>
      candidateSignal.workModeTokens.includes(token),
    );

  if (candidateSignal.noiseOnly) {
    return excludedValues.some((value) =>
      matchesWorkModeExclusion(readLocationGeographySignal(value)),
    );
  }

  return excludedValues.some((value) => {
    const excludedSignal = readLocationGeographySignal(value);
    if (excludedSignal.noiseOnly) {
      return matchesWorkModeExclusion(excludedSignal);
    }

    if (matchesLocationPhrase(candidateSignal, excludedSignal)) {
      return true;
    }

    return (
      broadRemoteGeographyPattern.test(candidateSignal.rawText) &&
      locationRegionsPossiblyOverlap(candidateSignal, excludedSignal)
    );
  });
}

export function toSavedJobId(posting: JobPosting): string {
  return `job_${posting.source}_${posting.sourceJobId}`;
}

function isSalesOrientedEngineeringListing(
  posting: MatchAssessmentPostingInput,
): boolean {
  if (!/\b(?:solutions?|sales) engineer\b/iu.test(posting.title)) {
    return false;
  }

  const evidence = [
    posting.summary,
    posting.description,
    ...posting.responsibilities,
    ...posting.minimumQualifications,
    ...posting.preferredQualifications,
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
  const decisiveSalesSignals = [
    /\b(?:carry|own|meet)\s+(?:a\s+)?(?:sales\s+)?quota\b/iu,
    /\b(?:pre[- ]sales|presales)\b/iu,
  ];
  if (decisiveSalesSignals.some((pattern) => pattern.test(evidence))) {
    return true;
  }

  const independentSalesCycleSignals = [
    /\b(?:sales|revenue)\s+pipeline\b|\bqualif(?:y|ying) opportunities\b/iu,
    /\b(?:technical|product) demos?\b.{0,48}\b(?:prospects?|customers?)\b|\b(?:prospects?|customers?)\b.{0,48}\b(?:technical|product) demos?\b/iu,
    /\b(?:partner|work|collaborate)\w*\b.{0,32}\b(?:account executives?|sales team)\b/iu,
    /\b(?:technical discovery|proofs? of concept|pocs?|rfps?|rfis?)\b/iu,
    /\b(?:close|win)\w*\b.{0,24}\b(?:deals?|revenue|opportunities)\b/iu,
  ];
  return (
    independentSalesCycleSignals.filter((pattern) => pattern.test(evidence))
      .length >= 2
  );
}

function isNonOpeningListing(posting: MatchAssessmentPostingInput): boolean {
  const title = normalizeText(posting.title);
  const evidence = normalizeText(
    [posting.title, posting.summary, posting.description]
      .filter((value): value is string => typeof value === "string")
      .join(" "),
  );
  const titleSignalsTalentPool =
    /\b(?:talent (?:community|network|pool)|future opportunities|general application|open application|expression of interest)\b/iu.test(
      title,
    );
  const explicitlyNotOpen =
    /\b(?:not|isn t)\s+(?:an?\s+)?(?:active|current)\s+(?:vacancy|opening|role|position)\b/iu.test(
      evidence,
    );
  const invitesFutureInterest =
    /\b(?:join|register|submit)\b.{0,48}\b(?:talent|future|interest|network|community)\b/iu.test(
      evidence,
    );

  return titleSignalsTalentPool || (explicitlyNotOpen && invitesFutureInterest);
}

function hasExplicitPreferenceConflict(
  listingValue: string | null,
  savedValues: readonly string[],
): boolean {
  return (
    savedValues.length > 0 &&
    listingValue !== null &&
    !savedValues.some(
      (savedValue) => normalizeText(savedValue) === normalizeText(listingValue),
    )
  );
}

export function createMatchAssessment<
  TPosting extends MatchAssessmentPostingInput,
>(
  profile: CandidateProfile,
  searchPreferences: JobSearchPreferences,
  posting: TPosting,
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
  const nonOpeningListing = isNonOpeningListing(posting);
  const roleFamilyMismatch =
    hasRoleFamilyMismatch(posting.title, searchPreferences.targetRoles) ||
    isSalesOrientedEngineeringListing(posting);
  const roleFamilyUnclear =
    searchPreferences.targetRoles.some(
      (role) => collectRoleFamilies(role).size > 0,
    ) && collectRoleFamilies(posting.title).size === 0;
  // "compatible" covers both "no saved constraint" and "verified match", so
  // every branch below that distinguishes the two counts the real saved
  // places rather than the raw list: a placeholder-only preference states no
  // constraint and must not be credited as a location the listing met.
  const savedLocationConstraints = getSavedLocationConstraints(
    searchPreferences.locations,
  );
  const hasSavedLocationConstraint = savedLocationConstraints.length > 0;
  const {
    state: locationCompatibility,
    remotePreferenceApplied: locationRemotePreferenceApplied,
  } = assessPostingLocationCompatibility(posting, searchPreferences);
  const workModeCompatibility = assessWorkModeCompatibility(
    posting.workMode,
    searchPreferences.workModes,
  );
  const explicitSeniorityConflict = hasExplicitPreferenceConflict(
    posting.seniority,
    searchPreferences.seniorityLevels,
  );
  const explicitEmploymentTypeConflict = hasExplicitPreferenceConflict(
    posting.employmentType,
    searchPreferences.employmentTypes,
  );
  const compensationFit = evaluateCompensationFit(
    posting.salaryText,
    searchPreferences.compensation,
  );
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
    locationCompatibility,
    locationRemotePreferenceApplied,
    workModeCompatibility,
    hasLocationPreferences: hasSavedLocationConstraint,
    hasWorkModePreferences: searchPreferences.workModes.length > 0,
    targetRoles: searchPreferences.targetRoles,
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

  if (nonOpeningListing) {
    score -= 40;
    scoreCeiling = Math.min(scoreCeiling, 39);
    gaps.push(
      "The listing is a talent pool or future-interest form rather than a current vacancy.",
    );
  } else if (roleFamilyMismatch) {
    score -= 28;
    scoreCeiling = Math.min(scoreCeiling, 39);
    gaps.push(
      "Role family is outside the current target roles, so this is unlikely to be a useful match.",
    );
  } else if (matchesRole) {
    score += 16;
    reasons.push("Role title aligns closely with the current target roles.");
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

  if (!hasSavedLocationConstraint) {
    // An unconstrained search is neutral. It is not evidence that the listing
    // matches a location the user explicitly chose.
  } else if (locationCompatibility === "compatible") {
    score += 10;
    reasons.push(
      locationRemotePreferenceApplied
        ? "Remote listing; remote is one of your preferred work modes."
        : "Location fits the saved search preferences.",
    );
  } else if (locationCompatibility === "incompatible") {
    score -= 10;
    gaps.push("Location falls outside the preferred search areas.");
  }
  // Geographically unspecified listings stay neutral: work-mode noise alone
  // is not evidence for or against the saved areas.

  if (searchPreferences.workModes.length === 0) {
    // An unconstrained work mode is neutral for the same reason.
  } else if (workModeCompatibility === "compatible") {
    score += 8;
    reasons.push("Work mode matches the preferred operating model.");
  } else if (workModeCompatibility === "conflict") {
    score -= 8;
    gaps.push(
      "Work mode does not match the saved remote or hybrid preferences.",
    );
  }
  // Flexible or unspecified listings stay neutral: offered flexibility alone
  // is not evidence for or against the saved operating model.

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
  const elevatedScopeGap =
    postingRequestsElevatedSeniority && !profileShowsElevatedSeniority;
  if (elevatedScopeGap) {
    score -= 8;
    gaps.push(
      "The title signals a staff-or-leadership scope not yet explicit in the current profile.",
    );
  }
  if (explicitSeniorityConflict) {
    score -= 8;
    gaps.push(
      "The listing seniority conflicts with the saved seniority preferences.",
    );
  }
  if (explicitEmploymentTypeConflict) {
    score -= 8;
    gaps.push(
      "The listing employment type conflicts with the saved employment preferences.",
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

  if (compensationFit.state === "meets_minimum") {
    score += 6;
    reasons.push("Compensation meets the saved salary minimum.");
  } else if (compensationFit.state === "below_minimum") {
    score -= 14;
    scoreCeiling = Math.min(scoreCeiling, 71);
    gaps.push("Compensation is below the saved salary minimum.");
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

  const dimensions = buildMatchDimensionsAssessment({
    posting,
    // The preference facets read the saved locations directly, both to decide
    // whether a location facet exists at all and to name the places in its
    // evidence line. Hand them the real constraints so a placeholder never
    // becomes "compared with Location not stated: aligned."
    searchPreferences:
      savedLocationConstraints.length === searchPreferences.locations.length
        ? searchPreferences
        : { ...searchPreferences, locations: [...savedLocationConstraints] },
    requirements,
    matchesRole,
    roleFamilyMismatch,
    roleFamilyUnclear,
    locationCompatibility,
    locationRemotePreferenceApplied,
    workModeCompatibility,
    isPreferredCompany,
  });
  const hasHardConflict = requirements.some(
    (requirement) =>
      requirement.importance === "required" &&
      requirement.status === "conflict",
  );
  const hasUnresolvedRequired = requirements.some(
    (requirement) =>
      requirement.importance === "required" &&
      (requirement.status === "missing" || requirement.status === "unknown"),
  );
  if (nonOpeningListing || roleFamilyMismatch || hasHardConflict) {
    scoreCeiling = Math.min(scoreCeiling, 39);
  } else if (
    compensationFit.state === "below_minimum" ||
    explicitSeniorityConflict ||
    explicitEmploymentTypeConflict ||
    elevatedScopeGap ||
    hasUnresolvedRequired ||
    dimensions.roleSuitability.state === "unknown" ||
    dimensions.evidenceConfidence.level === "low" ||
    dimensions.evidenceConfidence.level === "unavailable"
  ) {
    scoreCeiling = Math.min(scoreCeiling, 71);
  } else if (dimensions.roleSuitability.state === "adjacent") {
    scoreCeiling = Math.min(scoreCeiling, 85);
  }

  const finalScore = clampScore(Math.min(score, scoreCeiling));
  const evidenceRecommendation = buildFitRecommendation({
    score: finalScore,
    requirements,
  });
  const recommendation = nonOpeningListing
    ? {
        recommendation: "skip" as const,
        rationale:
          "This is a talent-pool or future-interest listing, not a current vacancy.",
      }
    : roleFamilyMismatch
      ? {
          recommendation: "skip" as const,
          rationale: "The listing belongs to a different occupational role.",
        }
      : compensationFit.state === "below_minimum" &&
          evidenceRecommendation.recommendation !== "skip"
        ? {
            recommendation: "review_before_applying" as const,
            rationale:
              "The listing compensation is below the saved salary minimum.",
          }
        : evidenceRecommendation;

  return {
    scorerVersion: MATCH_ASSESSMENT_SCORER_VERSION,
    contextFingerprint: null,
    postingFingerprint: null,
    score: finalScore,
    compensationFit,
    dimensions,
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
  return assembleMergedDiscoveredJob({
    matchAssessment,
    enrichedPosting: enrichDiscoveredPosting(posting, existingJob),
    posting,
    existingJob,
  });
}

// Shared assembly so callers that already enriched the posting (the merge
// pipeline) and the direct helper above stay byte-for-byte identical.
function assembleMergedDiscoveredJob(input: {
  matchAssessment: MatchAssessment;
  enrichedPosting: JobPosting;
  posting: JobPosting;
  existingJob: SavedJob | undefined;
}): SavedJob {
  const { matchAssessment, enrichedPosting, posting, existingJob } = input;

  return SavedJobSchema.parse({
    ...enrichedPosting,
    id: existingJob?.id ?? toSavedJobId(posting),
    status: preserveJobStatus(existingJob),
    matchAssessment,
    discoveryFeedback: existingJob?.discoveryFeedback ?? null,
    resumeApplicationMode: existingJob?.resumeApplicationMode ?? null,
    latestMatchAssessmentAudit: existingJob?.latestMatchAssessmentAudit ?? null,
  });
}

function buildVisibleDiscoveryRankById(
  jobs: readonly SavedJob[],
): ReadonlyMap<string, number> {
  return new Map(
    orderVisibleDiscoveryJobs(jobs).map((job, index) => [job.id, index + 1]),
  );
}

function selectLatestDiscoveryTimestamp(
  postings: readonly JobPosting[],
): string | null {
  return postings.reduce<string | null>((latest, posting) => {
    const candidate = posting.lastSeenAt ?? posting.discoveredAt;
    if (!latest) {
      return candidate;
    }

    return Date.parse(candidate) > Date.parse(latest) ? candidate : latest;
  }, null);
}

function hasMeaningfulMatchAssessmentChange(
  audit: ReturnType<typeof createMatchAssessmentChangeAudit>,
): boolean {
  return audit.status !== "unchanged" && audit.status !== "metadata_incomplete";
}

// Helper to merge discovered postings with existing jobs
export function mergeDiscoveredPostings(
  profile: CandidateProfile,
  searchPreferences: JobSearchPreferences,
  savedJobs: readonly SavedJob[],
  discoveredPostings: readonly JobPosting[],
  provenanceBuilder: (posting: JobPosting) => SavedJobDiscoveryProvenance,
  signal?: AbortSignal,
  assessPosting?: (posting: JobPosting) => MatchAssessment,
): MergeDiscoveryResult {
  // Check if already aborted
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  const identityIndex = createJobIdentityIndex(savedJobs, (job) => job);
  const previousJobsById = new Map(savedJobs.map((job) => [job.id, job]));
  const previousRankById = buildVisibleDiscoveryRankById(savedJobs);
  const newJobIds = new Set<string>();
  let validatedCount = 0;
  let duplicatesMerged = 0;
  let invalidSkipped = 0;

  const nextJobsById = new Map(savedJobs.map((job) => [job.id, job]));

  for (const posting of discoveredPostings) {
    // Check for cancellation periodically
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

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
    const existingJob = identityIndex.find(posting) ?? undefined;

    // Enrich before assessing so the stored assessment fingerprint describes
    // exactly the content this merge persists. Enrichment derives fields the
    // fingerprint covers (keyword signals, screening hints, ATS provider);
    // assessing the raw posting instead stamps a fingerprint that can never
    // match the persisted job, forcing a full re-score of every staged job on
    // the next discovery run.
    const enrichedPosting = enrichDiscoveredPosting(posting, existingJob);
    const matchAssessment = assessPosting
      ? assessPosting(enrichedPosting)
      : createMatchAssessment(profile, searchPreferences, enrichedPosting);
    const provenance = provenanceBuilder(posting);
    let mergedJob = SavedJobSchema.parse({
      ...assembleMergedDiscoveredJob({
        matchAssessment,
        enrichedPosting,
        posting,
        existingJob,
      }),
      provenance: uniqueProvenance([
        ...(existingJob?.provenance ?? []),
        provenance,
      ]),
    });

    if (!existingJob && nextJobsById.has(mergedJob.id)) {
      const baseId = `${mergedJob.id}_${createJobIdentityDigest(posting)}`;
      let availableId = baseId;
      let collisionIndex = 2;
      while (nextJobsById.has(availableId)) {
        availableId = `${baseId}_${collisionIndex}`;
        collisionIndex += 1;
      }
      mergedJob = SavedJobSchema.parse({ ...mergedJob, id: availableId });
    }

    if (existingJob) {
      duplicatesMerged += 1;
      identityIndex.replace(existingJob, mergedJob);
    } else {
      newJobIds.add(mergedJob.id);
      identityIndex.add(mergedJob);
    }

    nextJobsById.set(mergedJob.id, mergedJob);
  }

  const jobsBeforeAudit = [...nextJobsById.values()];
  const currentRankById = buildVisibleDiscoveryRankById(jobsBeforeAudit);
  const auditRecordedAt = selectLatestDiscoveryTimestamp(discoveredPostings);
  const mergedJobs = jobsBeforeAudit.map((job) => {
    const previousJob = previousJobsById.get(job.id);
    if (!previousJob) {
      return job;
    }

    const audit = createMatchAssessmentChangeAudit({
      previous: previousJob.matchAssessment,
      current: job.matchAssessment,
      previousRank: previousRankById.get(job.id) ?? null,
      currentRank: currentRankById.get(job.id) ?? null,
      recordedAt: auditRecordedAt,
    });

    return SavedJobSchema.parse({
      ...job,
      latestMatchAssessmentAudit: hasMeaningfulMatchAssessmentChange(audit)
        ? audit
        : previousJob.latestMatchAssessmentAudit,
    });
  });

  return {
    mergedJobs,
    newJobs: mergedJobs.filter((job) => newJobIds.has(job.id)),
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
