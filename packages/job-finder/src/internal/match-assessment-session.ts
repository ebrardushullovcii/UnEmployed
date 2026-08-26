import type {
  CandidateProfile,
  JobPosting,
  JobSearchPreferences,
  MatchAssessment,
} from "@unemployed/contracts";
import {
  createMatchAssessmentPostingInput,
  type MatchAssessmentPostingInput,
} from "./match-assessment-posting-input";

export const MATCH_ASSESSMENT_SCORER_VERSION = 6;
const MATCH_ASSESSMENT_LOGIC_REVISION = 5;

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
    .join(",")}}`;
}

function createFingerprint(prefix: string, value: unknown): string {
  const serialized = stableSerialize(value);
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= BigInt(serialized.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `${prefix}_${hash.toString(16).padStart(16, "0")}`;
}

export function createMatchAssessmentContextFingerprint(
  profile: CandidateProfile,
  searchPreferences: JobSearchPreferences,
): string {
  return createFingerprint(
    `match_context_v4_logic${MATCH_ASSESSMENT_LOGIC_REVISION}`,
    {
      profile,
      searchPreferences,
    },
  );
}

export function createMatchAssessmentPostingFingerprint(
  posting: MatchAssessmentPostingInput,
): string {
  return createFingerprint(
    `match_posting_v4_logic${MATCH_ASSESSMENT_LOGIC_REVISION}`,
    createMatchAssessmentPostingInput(posting),
  );
}

export type MatchAssessmentCalculator = (
  profile: CandidateProfile,
  searchPreferences: JobSearchPreferences,
  posting: MatchAssessmentPostingInput,
) => MatchAssessment;

export function createMatchAssessmentSession(input: {
  profile: CandidateProfile;
  searchPreferences: JobSearchPreferences;
  calculate: MatchAssessmentCalculator;
}) {
  const contextFingerprint = createMatchAssessmentContextFingerprint(
    input.profile,
    input.searchPreferences,
  );
  const cache = new Map<string, MatchAssessment>();
  let computationCount = 0;

  const assess = (posting: JobPosting): MatchAssessment => {
    const postingInput = createMatchAssessmentPostingInput(posting);
    const postingFingerprint =
      createMatchAssessmentPostingFingerprint(postingInput);
    const cached = cache.get(postingFingerprint);
    if (cached) {
      return cached;
    }

    computationCount += 1;
    const assessment = {
      ...input.calculate(input.profile, input.searchPreferences, postingInput),
      scorerVersion: MATCH_ASSESSMENT_SCORER_VERSION,
      contextFingerprint,
      postingFingerprint,
    };
    cache.set(postingFingerprint, assessment);
    return assessment;
  };

  const assessPersisted = (
    posting: JobPosting,
    persistedAssessment: MatchAssessment | null | undefined,
  ): MatchAssessment => {
    const postingFingerprint = createMatchAssessmentPostingFingerprint(
      createMatchAssessmentPostingInput(posting),
    );
    if (
      persistedAssessment?.scorerVersion === MATCH_ASSESSMENT_SCORER_VERSION &&
      persistedAssessment.contextFingerprint === contextFingerprint &&
      persistedAssessment.postingFingerprint === postingFingerprint
    ) {
      cache.set(postingFingerprint, persistedAssessment);
      return persistedAssessment;
    }

    return assess(posting);
  };

  return {
    assess,
    assessPersisted,
    contextFingerprint,
    getComputationCount: () => computationCount,
  };
}

export type MatchAssessmentSession = ReturnType<
  typeof createMatchAssessmentSession
>;
