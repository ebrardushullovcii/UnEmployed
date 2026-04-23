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
import { parseNormalizedCompensation, parseSalaryFloor } from "./matching-compensation";
export {
  buildApplicationRecords,
  buildDiscoveryJobs,
  buildReviewQueue,
} from "./matching-review-queue";
import { normalizeText, tokenize, uniqueStrings } from "./shared";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const remoteGeographyHints = [
  { pattern: /\b(united states|u\.s\.|u\.s|us only|usa only)\b/i, label: "United States" },
  { pattern: /\b(united kingdom|uk only|u\.k\.)\b/i, label: "United Kingdom" },
  { pattern: /\b(european union|europe|eu only)\b/i, label: "Europe" },
  { pattern: /\b(canada|canadian)\b/i, label: "Canada" },
] as const;

const ATS_PROVIDER_URL_PATTERNS = [
  { label: "Greenhouse", fragments: ["greenhouse.io"] },
  { label: "Lever", fragments: ["lever.co"] },
  { label: "Workday", fragments: ["myworkdayjobs.com", "workday"] },
  { label: "Ashby", fragments: ["ashbyhq.com", "ashby"] },
  { label: "iCIMS", fragments: ["icims.com"] },
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

    for (const provider of ATS_PROVIDER_URL_PATTERNS) {
      if (provider.fragments.some((fragment) => normalized.includes(fragment))) {
        return provider.label;
      }
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
  const remoteHintSource = [posting.location, posting.summary, posting.description]
    .filter(Boolean)
    .join(" ")
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
    /\bremote\b/i.test(remoteHintSource)

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

    if (new RegExp(`(^|\\s)${escapeRegex(normalizedDesired)}($|\\s)`).test(normalizedCandidate)) {
      return true;
    }

    return desiredTokens.every((token) => candidateTokens.has(token));
  });
}

export function matchesTitlePreference(
  candidate: string,
  targetRoles: readonly string[],
): boolean {
  return matchesAnyPhrase(candidate, targetRoles);
}

export function matchesLocationPreference(
  candidate: string,
  locations: readonly string[],
): boolean {
  return matchesAnyPhrase(candidate, locations);
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
