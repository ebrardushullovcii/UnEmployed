import { z } from "zod";

import { IsoDateTimeSchema, NonEmptyStringSchema } from "./base";
import type { JobSearchPreferences } from "./discovery";
import type { CandidateProfile } from "./profile";

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
  hasEligibilityPreferences: boolean;
  hasMeaningfulBackground: boolean;
  hasNarrative: boolean;
  hasResumeText: boolean;
  hasTargeting: boolean;
  materiallyComplete: boolean;
  recommendedStep: ProfileSetupStep;
  started: boolean;
}

export interface DeriveProfileSetupStateOptions {
  currentState?: ProfileSetupState | null;
  now?: string | null;
}

const FRESH_START_DISPLAY_NAME = "new candidate";
const FRESH_START_FIRST_NAME = "new";
const FRESH_START_HEADLINE = "import your resume to begin";
const FRESH_START_LAST_NAME = "candidate";
const FRESH_START_LOCATION = "set your preferred location";

function getHighestPriorityPendingStep(
  reviewItems: readonly ProfileReviewItem[],
): ProfileSetupStep | null {
  const pendingItems = reviewItems
    .filter((item) => item.status === "pending")
    .sort((left, right) => {
      const leftIndex = profileSetupStepOrder.get(left.step) ?? Number.MAX_SAFE_INTEGER;
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

function hasMeaningfulStringList(values: readonly string[] | null | undefined): boolean {
  return (
    Array.isArray(values) &&
    values.some((value) => typeof value === "string" && hasMeaningfulText(value))
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

function isFreshStartProfile(profile: CandidateProfile): boolean {
  const normalizedFullName = profile.fullName.trim().toLowerCase();
  const normalizedFirstName = profile.firstName.trim().toLowerCase();
  const normalizedLastName = profile.lastName.trim().toLowerCase();
  const normalizedHeadline = profile.headline.trim().toLowerCase();
  const normalizedLocation = profile.currentLocation.trim().toLowerCase();

  return (
    profile.id === "candidate_fresh_start" ||
    (normalizedFullName === FRESH_START_DISPLAY_NAME &&
      normalizedFirstName === FRESH_START_FIRST_NAME &&
      normalizedLastName === FRESH_START_LAST_NAME &&
      normalizedHeadline === FRESH_START_HEADLINE &&
      normalizedLocation === FRESH_START_LOCATION)
  );
}

export function evaluateProfileSetupReadiness(
  profile: CandidateProfile,
  searchPreferences: JobSearchPreferences,
): ProfileSetupReadiness {
  const freshStart = isFreshStartProfile(profile);
  const hasResumeText = hasMeaningfulText(profile.baseResume.textContent);
  const hasCoreIdentity = Boolean(
    hasMeaningfulText(profile.fullName) &&
      hasMeaningfulText(profile.headline) &&
      hasMeaningfulText(profile.currentLocation) &&
      (!freshStart || profile.yearsExperience > 0) &&
      (!freshStart ||
        profile.headline.trim().toLowerCase() !== FRESH_START_HEADLINE ||
        profile.currentLocation.trim().toLowerCase() !== FRESH_START_LOCATION),
  );
  const hasContactPath = Boolean(
    hasMeaningfulText(profile.email) || hasMeaningfulText(profile.phone),
  );
  const hasMeaningfulBackground =
    hasMeaningfulExperience(profile) || hasMeaningfulProject(profile);
  const hasTargeting = Boolean(
    hasMeaningfulStringList(searchPreferences.targetRoles) ||
      hasMeaningfulStringList(searchPreferences.jobFamilies) ||
      hasMeaningfulStringList(profile.targetRoles),
  );
  const hasEligibilityPreferences = Boolean(
    hasMeaningfulStringList(profile.workEligibility.authorizedWorkCountries) ||
      profile.workEligibility.requiresVisaSponsorship !== null ||
      profile.workEligibility.willingToRelocate !== null ||
      hasMeaningfulStringList(profile.workEligibility.preferredRelocationRegions) ||
      profile.workEligibility.willingToTravel !== null ||
      profile.workEligibility.remoteEligible !== null ||
      profile.workEligibility.noticePeriodDays !== null ||
      hasMeaningfulText(profile.workEligibility.availableStartDate) ||
      hasMeaningfulText(profile.workEligibility.securityClearance) ||
      hasMeaningfulStringList(searchPreferences.locations) ||
      hasMeaningfulStringList(searchPreferences.workModes),
  );
  const hasNarrative = hasMeaningfulNarrative(profile);
  const hasAnswerBank = hasMeaningfulAnswerBank(profile);
  const materiallyComplete =
    hasCoreIdentity &&
    hasContactPath &&
    hasMeaningfulBackground &&
    hasTargeting &&
    hasEligibilityPreferences;
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
  } else if (!hasTargeting || !hasEligibilityPreferences) {
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
    hasEligibilityPreferences,
    hasMeaningfulBackground,
    hasNarrative,
    hasResumeText,
    hasTargeting,
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
  const highestPriorityPendingStep = getHighestPriorityPendingStep(
    pendingReviewItems,
  );

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
          : highestPriorityPendingStep ?? readiness.recommendedStep;

  return ProfileSetupStateSchema.parse({
    status,
    currentStep,
    completedAt:
      status === "completed"
        ? currentState?.completedAt ?? options.now ?? null
        : null,
    reviewItems: currentState?.reviewItems ?? [],
    lastResumedAt: currentState?.lastResumedAt ?? null,
  });
}
