import { z } from "zod";

import { IsoDateTimeSchema, NonEmptyStringSchema } from "./base";
import {
  isRunnableJobDiscoveryTarget,
  type JobSearchPreferences,
} from "./discovery";
import { CandidateProfileSchema, type CandidateProfile } from "./profile";

export const profileSetupStepValues = [
  "import",
  "essentials",
  "background",
  "targeting",
  "narrative",
  "answers",
  "ready_check",
] as const;
export const ProfileSetupStepSchema = z.enum(profileSetupStepValues);
export type ProfileSetupStep = z.infer<typeof ProfileSetupStepSchema>;

const profileSetupStepOrder = new Map(
  profileSetupStepValues.map((step, index) => [step, index]),
);

export const ProfileSetupStatusSchema = z.enum([
  "not_started",
  "in_progress",
  "completed",
]);
export type ProfileSetupStatus = z.infer<typeof ProfileSetupStatusSchema>;

export const ProfileReviewItemStatusSchema = z.enum([
  "pending",
  "confirmed",
  "edited",
  "dismissed",
]);
export type ProfileReviewItemStatus = z.infer<
  typeof ProfileReviewItemStatusSchema
>;

export const ProfileReviewItemSeveritySchema = z.enum([
  "critical",
  "recommended",
  "optional",
]);
export type ProfileReviewItemSeverity = z.infer<
  typeof ProfileReviewItemSeveritySchema
>;

export const profileReviewTargetDomainValues = [
  "identity",
  "application_identity",
  "work_eligibility",
  "professional_summary",
  "search_preferences",
  "experience",
  "education",
  "certification",
  "project",
  "link",
  "language",
  "narrative",
  "proof_point",
  "answer_bank",
] as const;
export const ProfileReviewTargetDomainSchema = z.enum(
  profileReviewTargetDomainValues,
);
export type ProfileReviewTargetDomain = z.infer<
  typeof ProfileReviewTargetDomainSchema
>;

export const ProfileReviewTargetSchema = z.object({
  domain: ProfileReviewTargetDomainSchema,
  key: NonEmptyStringSchema,
  recordId: NonEmptyStringSchema.nullable().default(null),
});
export type ProfileReviewTarget = z.infer<typeof ProfileReviewTargetSchema>;

export const ProfileReviewItemSchema = z.object({
  id: NonEmptyStringSchema,
  step: ProfileSetupStepSchema,
  target: ProfileReviewTargetSchema,
  label: NonEmptyStringSchema,
  reason: NonEmptyStringSchema,
  severity: ProfileReviewItemSeveritySchema,
  status: ProfileReviewItemStatusSchema,
  proposedValue: NonEmptyStringSchema.nullable().default(null),
  sourceSnippet: NonEmptyStringSchema.nullable().default(null),
  sourceCandidateId: NonEmptyStringSchema.nullable().default(null),
  sourceRunId: NonEmptyStringSchema.nullable().default(null),
  createdAt: IsoDateTimeSchema,
  resolvedAt: IsoDateTimeSchema.nullable().default(null),
});
export type ProfileReviewItem = z.infer<typeof ProfileReviewItemSchema>;

export const profileSetupReviewActionValues = [
  "confirm",
  "dismiss",
  "clear_value",
] as const;
export const ProfileSetupReviewActionSchema = z.enum(
  profileSetupReviewActionValues,
);
export type ProfileSetupReviewAction = z.infer<
  typeof ProfileSetupReviewActionSchema
>;

export const ProfileSetupReviewActionOptionsSchema = z
  .object({
    selectedConflictChoiceId: NonEmptyStringSchema.optional(),
  })
  .default({});
export type ProfileSetupReviewActionOptions = z.infer<
  typeof ProfileSetupReviewActionOptionsSchema
>;

export const ProfileSetupStateSchema = z.object({
  status: ProfileSetupStatusSchema.default("not_started"),
  currentStep: ProfileSetupStepSchema.default("import"),
  completedAt: IsoDateTimeSchema.nullable().default(null),
  reviewItems: z.array(ProfileReviewItemSchema).default([]),
  lastResumedAt: IsoDateTimeSchema.nullable().default(null),
});
export type ProfileSetupState = z.infer<typeof ProfileSetupStateSchema>;

export interface ProfileSetupReadiness {
  freshStart: boolean;
  hasAnswerBank: boolean;
  hasContactPath: boolean;
  hasCoreIdentity: boolean;
  hasDiscoverySource: boolean;
  hasEligibilityPreferences: boolean;
  hasMeaningfulBackground: boolean;
  hasNarrative: boolean;
  hasResumeText: boolean;
  hasTargeting: boolean;
  hasWorkModePreference: boolean;
  materiallyComplete: boolean;
  recommendedStep: ProfileSetupStep;
  started: boolean;
}

/** Canonical setup blockers, ordered by the step that resolves them. */
export const profileSetupReadinessBlockerValues = [
  "identity_contact",
  "background",
  "eligibility_preferences",
  "work_mode_preference",
  "discovery_source",
] as const;
export type ProfileSetupReadinessBlockerId =
  (typeof profileSetupReadinessBlockerValues)[number];

export interface ProfileSetupReadinessBlocker {
  id: ProfileSetupReadinessBlockerId;
  step: ProfileSetupStep;
}

const PROFILE_SETUP_READINESS_BLOCKER_STEPS: Record<
  ProfileSetupReadinessBlockerId,
  ProfileSetupStep
> = {
  background: "background",
  discovery_source: "targeting",
  eligibility_preferences: "targeting",
  identity_contact: "essentials",
  work_mode_preference: "targeting",
};

/**
 * The single canonical blocker list for first-run readiness. Every readiness
 * surface (setup summary cards, ready check, and derived setup state) must
 * derive its "ready" claim from this list so no surface can report ready
 * while a blocker remains.
 */
export function getProfileSetupReadinessBlockers(
  readiness: Pick<
    ProfileSetupReadiness,
    | "hasCoreIdentity"
    | "hasContactPath"
    | "hasMeaningfulBackground"
    | "hasEligibilityPreferences"
    | "hasWorkModePreference"
    | "hasDiscoverySource"
  >,
): ProfileSetupReadinessBlocker[] {
  const blockers: ProfileSetupReadinessBlocker[] = [];

  if (!readiness.hasCoreIdentity || !readiness.hasContactPath) {
    blockers.push({
      id: "identity_contact",
      step: PROFILE_SETUP_READINESS_BLOCKER_STEPS.identity_contact,
    });
  }
  if (!readiness.hasMeaningfulBackground) {
    blockers.push({
      id: "background",
      step: PROFILE_SETUP_READINESS_BLOCKER_STEPS.background,
    });
  }
  if (!readiness.hasEligibilityPreferences) {
    blockers.push({
      id: "eligibility_preferences",
      step: PROFILE_SETUP_READINESS_BLOCKER_STEPS.eligibility_preferences,
    });
  }
  if (!readiness.hasWorkModePreference) {
    blockers.push({
      id: "work_mode_preference",
      step: PROFILE_SETUP_READINESS_BLOCKER_STEPS.work_mode_preference,
    });
  }
  if (!readiness.hasDiscoverySource) {
    blockers.push({
      id: "discovery_source",
      step: PROFILE_SETUP_READINESS_BLOCKER_STEPS.discovery_source,
    });
  }

  return blockers;
}

export interface DeriveProfileSetupStateOptions {
  currentState?: ProfileSetupState | null;
  now?: string | null;
}

const FRESH_START_DISPLAY_NAME = "new candidate";
const FRESH_START_FIRST_NAME = "new";
export const PROFILE_SETUP_PLACEHOLDER_HEADLINE = "Import your resume to begin";
export const PROFILE_SETUP_PLACEHOLDER_LOCATION = "Set your preferred location";
export const PROFILE_SETUP_PLACEHOLDER_SUMMARY =
  "Import a resume or paste resume text to build your profile, targeting, and tailored documents.";
const FRESH_START_HEADLINE = PROFILE_SETUP_PLACEHOLDER_HEADLINE.toLowerCase();
const FRESH_START_LAST_NAME = "candidate";
const FRESH_START_LOCATION = PROFILE_SETUP_PLACEHOLDER_LOCATION.toLowerCase();
const FRESH_START_SUMMARY = PROFILE_SETUP_PLACEHOLDER_SUMMARY.toLowerCase();

export type ProfileSetupPlaceholderField =
  | "fullName"
  | "headline"
  | "currentLocation"
  | "summary";

export const FRESH_START_CANDIDATE_PROFILE_ID = "candidate_fresh_start";
const FRESH_START_RESUME_ID = "resume_fresh_start";

/**
 * Canonical first-run profile seed. Factual identity fields stay null so no
 * instructional placeholder string is ever persisted as a candidate fact;
 * surfaces render their own placeholders for the missing values.
 */
export function createFreshStartCandidateProfile(): CandidateProfile {
  return CandidateProfileSchema.parse({
    id: FRESH_START_CANDIDATE_PROFILE_ID,
    baseResume: {
      id: FRESH_START_RESUME_ID,
      fileName: "No resume imported yet",
      uploadedAt: new Date(0).toISOString(),
      extractionStatus: "needs_text",
    },
    // No experience has been recorded yet; the schema requires a number, so
    // the seed supplies the neutral zero rather than omitting the field and
    // failing the entire first-run bootstrap.
    yearsExperience: 0,
  });
}

function normalizeProfileSetupPlaceholderValue(
  value: string | null | undefined,
): string {
  return value?.trim().toLowerCase() ?? "";
}

/**
 * True only when a stored identity string is one of the instructional
 * first-run placeholder strings. Legacy workspaces that already persisted
 * these strings keep parsing, but no readiness signal treats them as facts.
 */
export function hasProfileSetupPlaceholderValue(
  field: ProfileSetupPlaceholderField,
  value: string | null | undefined,
): boolean {
  const normalized = normalizeProfileSetupPlaceholderValue(value);

  switch (field) {
    case "fullName":
      return normalized === FRESH_START_DISPLAY_NAME;
    case "headline":
      return normalized === FRESH_START_HEADLINE;
    case "currentLocation":
      return normalized === FRESH_START_LOCATION;
    case "summary":
      return normalized === FRESH_START_SUMMARY;
  }
}

function getHighestPriorityPendingStep(
  reviewItems: readonly ProfileReviewItem[],
): ProfileSetupStep | null {
  const pendingItems = reviewItems
    .filter((item) => item.status === "pending")
    .sort((left, right) => {
      const leftIndex =
        profileSetupStepOrder.get(left.step) ?? Number.MAX_SAFE_INTEGER;
      const rightIndex =
        profileSetupStepOrder.get(right.step) ?? Number.MAX_SAFE_INTEGER;

      return leftIndex - rightIndex;
    });

  return pendingItems[0]?.step ?? null;
}

function hasBlockingPendingReviewItems(
  reviewItems: readonly ProfileReviewItem[],
): boolean {
  return reviewItems.some(
    (item) => item.status === "pending" && item.severity !== "optional",
  );
}

function hasMeaningfulText(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function hasMeaningfulStringList(
  values: readonly string[] | null | undefined,
): boolean {
  return (
    Array.isArray(values) &&
    values.some(
      (value) => typeof value === "string" && hasMeaningfulText(value),
    )
  );
}

function hasMeaningfulExperience(profile: CandidateProfile): boolean {
  return profile.experiences.some((experience) =>
    Boolean(
      hasMeaningfulText(experience.companyName) ||
      hasMeaningfulText(experience.title) ||
      hasMeaningfulText(experience.summary) ||
      hasMeaningfulStringList(experience.achievements) ||
      hasMeaningfulStringList(experience.skills),
    ),
  );
}

function hasMeaningfulProject(profile: CandidateProfile): boolean {
  return profile.projects.some((project) =>
    Boolean(
      hasMeaningfulText(project.name) ||
      hasMeaningfulText(project.summary) ||
      hasMeaningfulText(project.role) ||
      hasMeaningfulText(project.outcome) ||
      hasMeaningfulStringList(project.skills),
    ),
  );
}

function hasMeaningfulNarrative(profile: CandidateProfile): boolean {
  return Boolean(
    hasMeaningfulText(profile.professionalSummary.shortValueProposition) ||
    hasMeaningfulText(profile.professionalSummary.fullSummary) ||
    hasMeaningfulStringList(profile.professionalSummary.careerThemes) ||
    hasMeaningfulText(profile.professionalSummary.leadershipSummary) ||
    hasMeaningfulText(profile.professionalSummary.domainFocusSummary) ||
    hasMeaningfulStringList(profile.professionalSummary.strengths) ||
    hasMeaningfulText(profile.narrative.professionalStory) ||
    hasMeaningfulText(profile.narrative.nextChapterSummary) ||
    hasMeaningfulText(profile.narrative.careerTransitionSummary) ||
    hasMeaningfulStringList(profile.narrative.differentiators) ||
    hasMeaningfulStringList(profile.narrative.motivationThemes) ||
    profile.proofBank.length > 0,
  );
}

function hasMeaningfulAnswerBank(profile: CandidateProfile): boolean {
  const answerBank = profile.answerBank ?? {};

  return Boolean(
    hasMeaningfulText(answerBank.workAuthorization) ||
    hasMeaningfulText(answerBank.visaSponsorship) ||
    hasMeaningfulText(answerBank.relocation) ||
    hasMeaningfulText(answerBank.travel) ||
    hasMeaningfulText(answerBank.noticePeriod) ||
    hasMeaningfulText(answerBank.availability) ||
    hasMeaningfulText(answerBank.salaryExpectations) ||
    hasMeaningfulText(answerBank.selfIntroduction) ||
    hasMeaningfulText(answerBank.careerTransition) ||
    (Array.isArray(answerBank.customAnswers) &&
      answerBank.customAnswers.length > 0),
  );
}

/**
 * True when this profile is still the untouched first-run seed, detected by
 * the reserved fresh-start id or by the exact legacy placeholder identity
 * values that older seeds persisted.
 */
export function isFreshStartCandidateProfile(
  profile: CandidateProfile,
): boolean {
  if (profile.id === FRESH_START_CANDIDATE_PROFILE_ID) {
    return true;
  }

  const normalizedFullName = profile.fullName?.trim().toLowerCase() ?? "";
  const normalizedFirstName = profile.firstName?.trim().toLowerCase() ?? "";
  const normalizedLastName = profile.lastName?.trim().toLowerCase() ?? "";

  return (
    normalizedFullName === FRESH_START_DISPLAY_NAME &&
    normalizedFirstName === FRESH_START_FIRST_NAME &&
    normalizedLastName === FRESH_START_LAST_NAME &&
    hasProfileSetupPlaceholderValue("headline", profile.headline) &&
    hasProfileSetupPlaceholderValue("currentLocation", profile.currentLocation)
  );
}

export function evaluateProfileSetupReadiness(
  profile: CandidateProfile,
  searchPreferences: JobSearchPreferences,
): ProfileSetupReadiness {
  const freshStart = isFreshStartCandidateProfile(profile);
  const hasResumeText = hasMeaningfulText(profile.baseResume.textContent);
  const hasRealIdentityText =
    hasMeaningfulText(profile.fullName) &&
    hasMeaningfulText(profile.headline) &&
    hasMeaningfulText(profile.currentLocation);
  // Placeholder strings left over from legacy first-run seeds are not facts.
  const hasPlaceholderOnlyIdentity = Boolean(
    (profile.fullName === null ||
      hasProfileSetupPlaceholderValue("fullName", profile.fullName)) &&
    (profile.headline === null ||
      hasProfileSetupPlaceholderValue("headline", profile.headline)) &&
    (profile.currentLocation === null ||
      hasProfileSetupPlaceholderValue(
        "currentLocation",
        profile.currentLocation,
      )),
  );
  const hasCoreIdentity = Boolean(
    hasRealIdentityText &&
    (!freshStart || profile.yearsExperience > 0) &&
    (!freshStart || !hasPlaceholderOnlyIdentity),
  );

  const hasContactPath = Boolean(
    hasMeaningfulText(profile.email) || hasMeaningfulText(profile.phone),
  );
  const hasMeaningfulBackground =
    hasMeaningfulExperience(profile) || hasMeaningfulProject(profile);
  const hasTargeting = Boolean(
    hasMeaningfulStringList(searchPreferences.targetRoles) ||
    hasMeaningfulStringList(searchPreferences.jobFamilies) ||
    hasMeaningfulStringList(profile.targetRoles) ||
    hasMeaningfulBackground,
  );
  const hasDiscoverySource = searchPreferences.discovery.targets.some(
    isRunnableJobDiscoveryTarget,
  );
  const hasEligibilityPreferences = Boolean(
    hasMeaningfulStringList(profile.workEligibility.authorizedWorkCountries) ||
    profile.workEligibility.requiresVisaSponsorship !== null ||
    profile.workEligibility.willingToRelocate !== null ||
    hasMeaningfulStringList(
      profile.workEligibility.preferredRelocationRegions,
    ) ||
    profile.workEligibility.willingToTravel !== null ||
    profile.workEligibility.remoteEligible !== null ||
    profile.workEligibility.noticePeriodDays !== null ||
    hasMeaningfulText(profile.workEligibility.availableStartDate) ||
    hasMeaningfulText(profile.workEligibility.securityClearance) ||
    hasMeaningfulStringList(searchPreferences.locations) ||
    hasMeaningfulStringList(searchPreferences.workModes),
  );
  const hasWorkModePreference = hasMeaningfulStringList(
    searchPreferences.workModes,
  );
  const hasNarrative = hasMeaningfulNarrative(profile);
  const hasAnswerBank = hasMeaningfulAnswerBank(profile);
  const materiallyComplete =
    hasCoreIdentity &&
    hasContactPath &&
    hasMeaningfulBackground &&
    hasTargeting &&
    hasEligibilityPreferences &&
    hasWorkModePreference &&
    hasDiscoverySource;
  const started = Boolean(
    hasResumeText ||
    hasCoreIdentity ||
    hasContactPath ||
    hasMeaningfulBackground ||
    hasTargeting ||
    hasEligibilityPreferences ||
    hasNarrative ||
    hasAnswerBank,
  );

  let recommendedStep: ProfileSetupStep = "ready_check";
  if (!hasResumeText) {
    recommendedStep = "import";
  } else if (!hasCoreIdentity || !hasContactPath) {
    recommendedStep = "essentials";
  } else if (!hasMeaningfulBackground) {
    recommendedStep = "background";
  } else if (
    !hasEligibilityPreferences ||
    !hasWorkModePreference ||
    !hasDiscoverySource
  ) {
    recommendedStep = "targeting";
  } else if (!hasNarrative) {
    recommendedStep = "narrative";
  } else if (!hasAnswerBank) {
    recommendedStep = "answers";
  }

  return {
    freshStart,
    hasAnswerBank,
    hasContactPath,
    hasCoreIdentity,
    hasDiscoverySource,
    hasEligibilityPreferences,
    hasMeaningfulBackground,
    hasNarrative,
    hasResumeText,
    hasTargeting,
    hasWorkModePreference,
    materiallyComplete,
    recommendedStep,
    started,
  };
}

export function deriveProfileSetupState(
  profile: CandidateProfile,
  searchPreferences: JobSearchPreferences,
  options: DeriveProfileSetupStateOptions = {},
): ProfileSetupState {
  const readiness = evaluateProfileSetupReadiness(profile, searchPreferences);
  const currentState = options.currentState
    ? ProfileSetupStateSchema.parse(options.currentState)
    : null;
  const pendingReviewItems = currentState?.reviewItems ?? [];
  const highestPriorityPendingStep =
    getHighestPriorityPendingStep(pendingReviewItems);

  const canBeCompleted =
    readiness.materiallyComplete &&
    !hasBlockingPendingReviewItems(pendingReviewItems);

  let status: ProfileSetupStatus = "not_started";
  if (canBeCompleted && currentState?.status !== "in_progress") {
    status = "completed";
  } else if (
    readiness.started ||
    pendingReviewItems.length > 0 ||
    currentState?.status === "in_progress"
  ) {
    status = "in_progress";
  }

  const currentStep =
    status === "completed"
      ? "ready_check"
      : status === "not_started"
        ? "import"
        : currentState?.status === "in_progress"
          ? currentState.currentStep
          : (highestPriorityPendingStep ?? readiness.recommendedStep);

  return ProfileSetupStateSchema.parse({
    status,
    currentStep,
    completedAt:
      status === "completed"
        ? (currentState?.completedAt ?? options.now ?? null)
        : null,
    reviewItems: currentState?.reviewItems ?? [],
    lastResumedAt: currentState?.lastResumedAt ?? null,
  });
}
