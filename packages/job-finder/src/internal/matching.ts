import type { JobFinderAiClient } from "@unemployed/ai-providers";
import {
  SavedJobDiscoveryProvenanceSchema,
  SavedJobSchema,
  type ApplicationRecord,
  type ApplicationStatus,
  type AssetStatus,
  type CandidateProfile,
  type JobKeywordSignal,
  type JobSearchPreferences,
  type JobPosting,
  type MatchAssessment,
  type NormalizedCompensation,
  type ResumeDraft,
  type ResumeExportArtifact,
  type ReviewQueueItem,
  type SavedJob,
  type SavedJobDiscoveryProvenance,
  type TailoredAsset,
} from "@unemployed/contracts";
import { normalizeText, tokenize, uniqueStrings } from "./shared";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const knownCompensationPeriods = new Set(["yr", "year", "years", "annual", "annum", "mo", "month", "months", "wk", "week", "weeks", "day", "days", "hr", "hrs", "hour", "hours"]);
const annualCompensationMultipliers: Record<string, number> = {
  yr: 1,
  year: 1,
  years: 1,
  annual: 1,
  annum: 1,
  mo: 12,
  month: 12,
  months: 12,
  wk: 52,
  week: 52,
  weeks: 52,
  day: 260,
  days: 260,
  hr: 2080,
  hrs: 2080,
  hour: 2080,
  hours: 2080,
};
const salaryNumberPattern = /(\d[\d,]*(?:\.\d+)?)(?:\s*)([km])?/gi;
const secondaryCompensationBeforePattern = /\b(bonus|commission|sign[- ]?on|equity|ote)\b/i;
const secondaryCompensationAfterPattern = /^(?:[:-]\s*)?(bonus|commission|sign[- ]?on|equity|ote)\b/i;

const remoteGeographyHints = [
  { pattern: /\b(united states|u\.s\.|u\.s|us only|usa only)\b/i, label: "United States" },
  { pattern: /\b(united kingdom|uk only|u\.k\.)\b/i, label: "United Kingdom" },
  { pattern: /\b(european union|europe|eu only)\b/i, label: "Europe" },
  { pattern: /\b(canada|canadian)\b/i, label: "Canada" },
] as const;

function readPeriodUnit(salaryText: string, startIndex: number): string | null {
  const followingText = salaryText.slice(startIndex).trimStart().toLowerCase();

  if (!followingText.startsWith("/")) {
    return null;
  }

  const periodUnit = followingText.match(/^\/\s*([a-z]+)/)?.[1] ?? "";
  return knownCompensationPeriods.has(periodUnit) ? periodUnit : null;
}

function isCompactRangeSeparator(text: string): boolean {
  return /^\s*[-–—/]\s*$/.test(text);
}

const reviewableStatuses = new Set<ApplicationStatus>([
  "drafting",
  "ready_for_review",
  "approved",
]);

const discoveryVisibleStatuses = new Set<ApplicationStatus>([
  "discovered",
  "shortlisted",
  "drafting",
  "ready_for_review",
  "approved",
]);

const assetStatusPriority: Record<AssetStatus, number> = {
  ready: 0,
  generating: 1,
  queued: 2,
  failed: 3,
  not_started: 4,
};

function getLatestApprovedExport(
  current: ResumeExportArtifact | null,
  candidate: ResumeExportArtifact,
): ResumeExportArtifact {
  if (!current) {
    return candidate;
  }

  return new Date(candidate.exportedAt).getTime() >
    new Date(current.exportedAt).getTime()
    ? candidate
    : current;
}

function buildResumeReviewState(
  draft: ResumeDraft | null,
  approvedExport: ResumeExportArtifact | null,
): ReviewQueueItem["resumeReview"] {
  if (!draft) {
    return { status: "not_started" };
  }

  if (draft.status === "approved" && draft.approvedAt && approvedExport) {
    return {
      status: "approved",
      approvedAt: draft.approvedAt,
      approvedExportId: approvedExport.id,
      approvedFormat: approvedExport.format,
      approvedFilePath: approvedExport.filePath,
    };
  }

  if (draft.status === "stale") {
    return {
      status: "stale",
      staleReason: draft.staleReason ?? null,
    };
  }

  // An approved draft should always resolve to a concrete approved export.
  // Treat any missing export metadata as needing review so downstream apply
  // flows fail safe instead of assuming approval still points at a live file.
  if (draft.status === "approved") {
    return {
      status: "needs_review",
    };
  }

  return {
    status: draft.status,
  };
}

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

export function parseSalaryFloor(salaryText: string | null): number | null {
  if (!salaryText) {
    return null;
  }

  const matches = [...salaryText.matchAll(salaryNumberPattern)];

  if (matches.length === 0) {
    return null;
  }

  const parsed = matches
    .map((match, index) => {
      const baseValue = parseFloat((match[1] ?? "").replaceAll(",", ""));
      const rawSuffix = (match[2] ?? "").toLowerCase();
      const currentIndex = match.index ?? 0;
      const nextMatch = matches[index + 1];
      const nextIndex = nextMatch?.index ?? -1;
      const betweenText = nextMatch ? salaryText.slice(currentIndex + match[0].length, nextIndex) : "";
      const suffix = !rawSuffix && nextMatch?.[2] && isCompactRangeSeparator(betweenText)
        ? nextMatch[2].toLowerCase()
        : rawSuffix;
      const periodUnit = readPeriodUnit(salaryText, currentIndex + match[0].length)
        ?? (nextMatch && isCompactRangeSeparator(betweenText)
          ? readPeriodUnit(salaryText, (nextMatch.index ?? 0) + nextMatch[0].length)
          : null);
      const precedingText = salaryText.slice(Math.max(0, currentIndex - 24), currentIndex).toLowerCase();
      const followingText = salaryText.slice(currentIndex + match[0].length).trimStart().toLowerCase();

      if (!Number.isFinite(baseValue) || baseValue <= 0) {
        return null;
      }

      if (followingText.startsWith("%")) {
        return null;
      }

      const trailingContext = followingText.slice(0, 24);
      const leadingContext = precedingText.trim().split(/\s+/).at(-1) ?? "";

      if (secondaryCompensationBeforePattern.test(leadingContext) || secondaryCompensationAfterPattern.test(trailingContext)) {
        return null;
      }

      if (!suffix && !periodUnit && baseValue < 1000) {
        return null;
      }

      const scaledValue = suffix === "k"
        ? baseValue * 1000
        : suffix === "m"
          ? baseValue * 1_000_000
          : baseValue;

      return periodUnit
        ? scaledValue * (annualCompensationMultipliers[periodUnit] ?? 1)
        : scaledValue;
    })
    .filter((value): value is number => value !== null);

  if (parsed.length === 0) {
    return null;
  }

  return Math.min(...parsed);
}

function detectCurrencyCode(salaryText: string | null): string | null {
  if (!salaryText) {
    return null;
  }

  const normalized = salaryText.toLowerCase();

  if (normalized.includes("usd") || salaryText.includes("$")) {
    return "USD";
  }

  if (normalized.includes("eur") || salaryText.includes("€")) {
    return "EUR";
  }

  if (normalized.includes("gbp") || salaryText.includes("£")) {
    return "GBP";
  }

  return null;
}

function detectCompensationInterval(
  salaryText: string | null,
): NormalizedCompensation["interval"] {
  if (!salaryText) {
    return null;
  }

  const normalized = salaryText.toLowerCase();

  if (/\b(hour|hr|hrs)\b|\//.test(normalized) && /\/(?:\s*)(hour|hr|hrs)\b/.test(normalized)) {
    return "hour";
  }

  if (/\b(day|days)\b|\/(?:\s*)(day|days)\b/.test(normalized)) {
    return "day";
  }

  if (/\b(week|weeks|wk)\b|\/(?:\s*)(week|weeks|wk)\b/.test(normalized)) {
    return "week";
  }

  if (/\b(month|months|mo)\b|\/(?:\s*)(month|months|mo)\b/.test(normalized)) {
    return "month";
  }

  return "year";
}

function parseNormalizedCompensation(
  salaryText: string | null,
): NormalizedCompensation {
  if (!salaryText) {
    return {
      currency: null,
      interval: null,
      minAmount: null,
      maxAmount: null,
      minAnnualUsd: null,
      maxAnnualUsd: null,
    };
  }

  const matches = [...salaryText.matchAll(salaryNumberPattern)];
  const parsedValues = matches
    .map((match, index) => {
      const baseValue = parseFloat((match[1] ?? "").replaceAll(",", ""));
      const rawSuffix = (match[2] ?? "").toLowerCase();
      const currentIndex = match.index ?? 0;
      const nextMatch = matches[index + 1];
      const nextIndex = nextMatch?.index ?? -1;
      const betweenText = nextMatch
        ? salaryText.slice(currentIndex + match[0].length, nextIndex)
        : "";
      const suffix =
        !rawSuffix && nextMatch?.[2] && isCompactRangeSeparator(betweenText)
          ? nextMatch[2].toLowerCase()
          : rawSuffix;
      const precedingText = salaryText
        .slice(Math.max(0, currentIndex - 24), currentIndex)
        .toLowerCase();
      const followingText = salaryText
        .slice(currentIndex + match[0].length)
        .trimStart()
        .toLowerCase();

      if (!Number.isFinite(baseValue) || baseValue <= 0 || followingText.startsWith("%")) {
        return null;
      }

      const trailingContext = followingText.slice(0, 24);
      const leadingContext = precedingText.trim().split(/\s+/).at(-1) ?? "";

      if (
        secondaryCompensationBeforePattern.test(leadingContext) ||
        secondaryCompensationAfterPattern.test(trailingContext)
      ) {
        return null;
      }

      if (!suffix && baseValue < 1000) {
        return null;
      }

      return suffix === "k"
        ? baseValue * 1000
        : suffix === "m"
          ? baseValue * 1_000_000
          : baseValue;
    })
    .filter((value): value is number => value !== null)
    .sort((left, right) => left - right);

  const minAmount = parsedValues[0] ?? null;
  const maxAmount = parsedValues.at(-1) ?? minAmount;
  const interval = detectCompensationInterval(salaryText);
  const multiplier = interval ? (annualCompensationMultipliers[interval] ?? 1) : null;

  return {
    currency: detectCurrencyCode(salaryText),
    interval,
    minAmount,
    maxAmount,
    minAnnualUsd:
      multiplier && minAmount !== null ? Math.round(minAmount * multiplier) : null,
    maxAnnualUsd:
      multiplier && maxAmount !== null ? Math.round(maxAmount * multiplier) : null,
  };
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
    if (normalized.includes("myworkdayjobs.com") || normalized.includes("workday")) {
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
  const buckets: Array<{ values: readonly string[]; kind: JobKeywordSignal["kind"]; weight: number }> = [
    { values: posting.keySkills, kind: "skill", weight: 5 },
    { values: posting.responsibilities, kind: "responsibility", weight: 3 },
    { values: posting.minimumQualifications, kind: "qualification", weight: 4 },
    { values: posting.preferredQualifications, kind: "qualification", weight: 2 },
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
    relocationText: normalizedText.includes("relocation") || normalizedText.includes("relocate")
      ? "Relocation support or requirements are mentioned in the listing."
      : null,
    travelText: normalizedText.includes("travel")
      ? "Travel expectations are mentioned in the listing."
      : null,
    remoteGeographies: uniqueStrings(
      remoteGeographyHints.flatMap((entry) =>
        entry.pattern.test(
          [posting.location, posting.description, posting.summary]
            .filter(Boolean)
            .join(" "),
        )
          ? [entry.label]
          : [],
      ),
    ),
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
  const normalizedCompensation = parseNormalizedCompensation(posting.salaryText);
  const screeningHints = buildScreeningHints(posting);
  const existingCompensation = existingJob?.normalizedCompensation;
  const postingKeywordSignals = posting.keywordSignals ?? [];

  return {
    ...posting,
    applicationUrl:
      posting.applicationUrl ??
      existingJob?.applicationUrl ??
      (posting.applyPath === "external_redirect" ? posting.employerWebsiteUrl : null),
    firstSeenAt: existingJob?.firstSeenAt ?? posting.firstSeenAt ?? posting.discoveredAt,
    lastSeenAt: posting.lastSeenAt ?? posting.discoveredAt,
    lastVerifiedActiveAt:
      posting.lastVerifiedActiveAt ?? posting.discoveredAt,
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
              normalizedCompensation.minAmount ?? existingCompensation.minAmount,
            maxAmount:
              normalizedCompensation.maxAmount ?? existingCompensation.maxAmount,
            minAnnualUsd:
              normalizedCompensation.minAnnualUsd ?? existingCompensation.minAnnualUsd,
            maxAnnualUsd:
              normalizedCompensation.maxAnnualUsd ?? existingCompensation.maxAnnualUsd,
          }
        : normalizedCompensation,
    atsProvider: posting.atsProvider ?? existingJob?.atsProvider ?? detectAtsProvider(posting),
    screeningHints: {
      sponsorshipText:
        screeningHints.sponsorshipText ?? existingJob?.screeningHints.sponsorshipText ?? null,
      requiresSecurityClearance:
        screeningHints.requiresSecurityClearance ??
        existingJob?.screeningHints.requiresSecurityClearance ??
        null,
      relocationText:
        screeningHints.relocationText ?? existingJob?.screeningHints.relocationText ?? null,
      travelText:
        screeningHints.travelText ?? existingJob?.screeningHints.travelText ?? null,
      remoteGeographies: uniqueStrings([
        ...(existingJob?.screeningHints.remoteGeographies ?? []),
        ...screeningHints.remoteGeographies,
      ]),
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

    if (new RegExp(`(^|\\s)${escapeRegex(normalizedDesired)}($|\\s)`).test(normalizedCandidate)) {
      return true;
    }

    return desiredTokens.every((token) => candidateTokens.has(token));
  });
}

export function toSavedJobId(posting: JobPosting): string {
  return `job_${posting.source}_${posting.sourceJobId}`;
}

export function buildReviewQueue(
  savedJobs: readonly SavedJob[],
  tailoredAssets: readonly TailoredAsset[],
  resumeDrafts: readonly ResumeDraft[],
  resumeExportArtifacts: readonly ResumeExportArtifact[],
): ReviewQueueItem[] {
  const assetsByJobId = new Map(
    tailoredAssets.map((asset) => [asset.jobId, asset]),
  );
  const draftsByJobId = new Map(
    resumeDrafts.map((draft) => [draft.jobId, draft]),
  );
  const approvedExportsByJobId = new Map<string, ResumeExportArtifact>();

  for (const artifact of resumeExportArtifacts) {
    if (!artifact.isApproved) {
      continue;
    }

    approvedExportsByJobId.set(
      artifact.jobId,
      getLatestApprovedExport(
        approvedExportsByJobId.get(artifact.jobId) ?? null,
        artifact,
      ),
    );
  }

  return savedJobs
    .filter((job) => reviewableStatuses.has(job.status))
    .map<ReviewQueueItem>((job) => {
      const asset = assetsByJobId.get(job.id) ?? null;
      const draft = draftsByJobId.get(job.id) ?? null;
      const approvedExport = approvedExportsByJobId.get(job.id) ?? null;
      const resumeReview = buildResumeReviewState(draft, approvedExport);
      const updatedAtCandidates = [
        asset?.updatedAt,
        draft?.updatedAt,
        approvedExport?.exportedAt,
        job.discoveredAt,
      ].filter((value): value is string => Boolean(value));

      return {
        jobId: job.id,
        title: job.title,
        company: job.company,
        location: job.location,
        matchScore: job.matchAssessment.score,
        applicationStatus: job.status,
        assetStatus: asset?.status ?? "not_started",
        progressPercent: asset?.progressPercent ?? null,
        resumeAssetId: asset?.id ?? null,
        resumeReview,
        updatedAt: updatedAtCandidates.sort().at(-1) ?? job.discoveredAt,
      };
    })
    .sort((left, right) => {
      const assetDelta =
        assetStatusPriority[left.assetStatus] -
        assetStatusPriority[right.assetStatus];

      if (assetDelta !== 0) {
        return assetDelta;
      }

      return right.matchScore - left.matchScore;
    });
}

export function buildDiscoveryJobs(savedJobs: readonly SavedJob[]): SavedJob[] {
  return [...savedJobs]
    .filter((job) => discoveryVisibleStatuses.has(job.status))
    .sort(
      (left, right) => right.matchAssessment.score - left.matchAssessment.score,
    );
}

export function buildApplicationRecords(
  savedApplicationRecords: readonly ApplicationRecord[],
): ApplicationRecord[] {
  return [...savedApplicationRecords].sort(
    (left, right) =>
      new Date(right.lastUpdatedAt).getTime() -
      new Date(left.lastUpdatedAt).getTime(),
  );
}

export function createMatchAssessment(
  profile: CandidateProfile,
  searchPreferences: JobSearchPreferences,
  posting: JobPosting,
): MatchAssessment {
  let score = 48;
  const reasons: string[] = [];
  const gaps: string[] = [];

  const matchesRole = matchesAnyPhrase(
    posting.title,
    searchPreferences.targetRoles,
  );
  const matchesLocation = matchesAnyPhrase(
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
  const profileSkills = new Set(
    profile.skills.map((skill) => normalizeText(skill)),
  );
  const overlappingSkills = posting.keySkills.filter((skill) =>
    profileSkills.has(normalizeText(skill)),
  );

  if (matchesRole) {
    score += 16;
    reasons.push("Role title aligns closely with the current target roles.");
  } else {
    gaps.push(
      "Role title is adjacent to the target list but not an exact fit.",
    );
  }

  if (matchesLocation) {
    score += 10;
    reasons.push("Location fits the saved search preferences.");
  } else {
    gaps.push("Location falls outside the preferred search areas.");
  }

  if (matchesWorkMode) {
    score += 8;
    reasons.push("Work mode matches the preferred operating model.");
  } else {
    gaps.push(
      "Work mode does not match the saved remote or hybrid preferences.",
    );
  }

  if (meetsSalaryExpectation) {
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

  return {
    score: clampScore(score),
    reasons: reasons.slice(0, 3),
    gaps: gaps.slice(0, 3),
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

