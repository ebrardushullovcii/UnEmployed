import type { ProfileCopilotPatchGroup } from "@unemployed/contracts";

import type { ReviseCandidateProfileInput } from "../shared";
import {
  createUniqueId,
  deriveRequestedDetail,
  detectRequestedRemoteEligibility,
  detectRequestedTargetSalary,
  detectRequestedVisaSponsorship,
  detectRequestedWorkMode,
  detectRequestedYearsExperience,
  findMentionedExperience,
  findPendingRelevantReviewItem,
  findPendingRelevantReviewItems,
  formatIdentityFieldLabel,
  getMatchingResolutionStatus,
  looksLikeExplicitAnswer,
  normalizeFactText,
  requestLooksLikeLocationListEdit,
  requestLooksLikeWorkModePreferenceEdit,
  trimNonEmptyString,
} from "./profile-copilot-helpers";

function buildYearsExperiencePatchGroup(
  input: ReviseCandidateProfileInput,
): ProfileCopilotPatchGroup | null {
  const requestedYearsExperience = detectRequestedYearsExperience(input.request);

  if (requestedYearsExperience === null) {
    return null;
  }

  const item = findPendingRelevantReviewItem(
    input,
    (reviewItem) =>
      reviewItem.target.domain === "identity" &&
      reviewItem.target.key === "yearsExperience",
  );
  const operations: ProfileCopilotPatchGroup["operations"] = [];

  if (requestedYearsExperience !== input.profile.yearsExperience) {
    operations.push({
      operation: "replace_identity_fields",
      value: {
        yearsExperience: requestedYearsExperience,
      },
    });
  }

  if (item) {
    operations.push({
      operation: "resolve_review_items",
      reviewItemIds: [item.id],
      resolutionStatus: getMatchingResolutionStatus(item, requestedYearsExperience),
    });
  }

  if (operations.length === 0) {
    return null;
  }

  return {
    id: createUniqueId("profile_patch_group"),
    summary: "Update years of experience",
    applyMode: "applied",
    operations,
    createdAt: new Date().toISOString(),
  };
}

function buildTargetSalaryPatchGroup(
  input: ReviseCandidateProfileInput,
): ProfileCopilotPatchGroup | null {
  const requestedTargetSalary = detectRequestedTargetSalary(input.request);

  if (
    requestedTargetSalary === null ||
    requestedTargetSalary === input.searchPreferences.targetSalaryUsd
  ) {
    return null;
  }

  return {
    id: createUniqueId("profile_patch_group"),
    summary: "Update expected salary",
    applyMode: "applied",
    operations: [
      {
        operation: "replace_search_preferences_fields",
        value: {
          targetSalaryUsd: requestedTargetSalary,
        },
      },
    ],
    createdAt: new Date().toISOString(),
  };
}

function buildExperienceWorkModePatchGroup(
  input: ReviseCandidateProfileInput,
): ProfileCopilotPatchGroup | null {
  const requestedWorkMode = detectRequestedWorkMode(input.request);
  const matchingExperience = findMentionedExperience(input);

  if (!requestedWorkMode || !matchingExperience) {
    return null;
  }

  const matchingItem = findPendingRelevantReviewItem(
    input,
    (item) =>
      item.target.domain === "experience" &&
      item.target.key === "record" &&
      item.target.recordId === matchingExperience.id,
  );
  const operations: ProfileCopilotPatchGroup["operations"] = [
    {
      operation: "upsert_experience_record",
      record: {
        ...matchingExperience,
        workMode: [requestedWorkMode],
      },
    },
  ];

  if (matchingItem) {
    operations.push({
      operation: "resolve_review_items",
      reviewItemIds: [matchingItem.id],
      resolutionStatus: "edited",
    });
  }

  return {
    id: createUniqueId("profile_patch_group"),
    summary: `Mark ${matchingExperience.companyName ?? "role"} as ${requestedWorkMode}`,
    applyMode: "needs_review",
    operations,
    createdAt: new Date().toISOString(),
  };
}

function buildCurrentLocationPatchGroup(
  input: ReviseCandidateProfileInput,
): ProfileCopilotPatchGroup | null {
  const normalizedRequest = input.request.toLowerCase();

  if (
    !/location/.test(normalizedRequest) ||
    /preferred locations|excluded locations|relocation locations|relocation regions/.test(normalizedRequest)
  ) {
    return null;
  }

  const detail = deriveRequestedDetail(input.request) ?? trimNonEmptyString(input.request);

  if (!detail || !looksLikeExplicitAnswer(input.request)) {
    return null;
  }

  const item = findPendingRelevantReviewItem(
    input,
    (reviewItem) =>
      reviewItem.target.domain === "identity" &&
      reviewItem.target.key === "currentLocation",
  );
  const operations: ProfileCopilotPatchGroup["operations"] = [
    {
      operation: "replace_identity_fields",
      value: {
        currentLocation: detail,
      },
    },
  ];

  if (item) {
    operations.push({
      operation: "resolve_review_items",
      reviewItemIds: [item.id],
      resolutionStatus: getMatchingResolutionStatus(item, detail),
    });
  }

  return {
    id: createUniqueId("profile_patch_group"),
    summary: "Update displayed location",
    applyMode: "applied",
    operations,
    createdAt: new Date().toISOString(),
  };
}

function buildTargetRolesPatchGroup(
  input: ReviseCandidateProfileInput,
): ProfileCopilotPatchGroup | null {
  const normalizedRequest = normalizeFactText(input.request);

  if (!/target role|target roles|looking for/.test(normalizedRequest)) {
    return null;
  }

  const detail = deriveRequestedDetail(input.request) ?? trimNonEmptyString(input.request);

  if (!detail || !looksLikeExplicitAnswer(input.request)) {
    return null;
  }

  const item = findPendingRelevantReviewItem(
    input,
    (reviewItem) =>
      reviewItem.target.domain === "search_preferences" &&
      reviewItem.target.key === "targetRoles",
  );
  const operations: ProfileCopilotPatchGroup["operations"] = [
    {
      operation: "replace_search_preferences_fields",
      value: {
        targetRoles: [detail],
      },
    },
  ];

  if (item) {
    operations.push({
      operation: "resolve_review_items",
      reviewItemIds: [item.id],
      resolutionStatus: getMatchingResolutionStatus(item, detail),
    });
  }

  return {
    id: createUniqueId("profile_patch_group"),
    summary: "Update target roles",
    applyMode: "applied",
    operations,
    createdAt: new Date().toISOString(),
  };
}

function buildWorkEligibilityPatchGroup(
  input: ReviseCandidateProfileInput,
): ProfileCopilotPatchGroup | null {
  const requestedVisaSponsorship = detectRequestedVisaSponsorship(input.request);
  const requestedRemoteEligibility = detectRequestedRemoteEligibility(input.request);
  const matchingExperience = findMentionedExperience(input);
  const workEligibilityValue: Record<string, boolean> = {};
  const workEligibilityReviewItemIds = new Set<string>();

  if (
    requestedVisaSponsorship !== null &&
    requestedVisaSponsorship !== input.profile.workEligibility.requiresVisaSponsorship
  ) {
    workEligibilityValue.requiresVisaSponsorship = requestedVisaSponsorship;
    findPendingRelevantReviewItems(
      input,
      (reviewItem) =>
        reviewItem.target.domain === "work_eligibility" &&
        reviewItem.target.key === "requiresVisaSponsorship",
    ).forEach((item) => workEligibilityReviewItemIds.add(item.id));
  }

  if (
    requestedRemoteEligibility !== null &&
    !matchingExperience &&
    !requestLooksLikeLocationListEdit(input.request) &&
    !requestLooksLikeWorkModePreferenceEdit(input.request) &&
    requestedRemoteEligibility !== input.profile.workEligibility.remoteEligible
  ) {
    workEligibilityValue.remoteEligible = requestedRemoteEligibility;
    findPendingRelevantReviewItems(
      input,
      (reviewItem) =>
        reviewItem.target.domain === "work_eligibility" &&
        reviewItem.target.key === "remoteEligible",
    ).forEach((item) => workEligibilityReviewItemIds.add(item.id));
  }

  if (Object.keys(workEligibilityValue).length === 0) {
    return null;
  }

  const operations: ProfileCopilotPatchGroup["operations"] = [
    {
      operation: "replace_work_eligibility_fields",
      value: workEligibilityValue,
    },
  ];

  if (workEligibilityReviewItemIds.size > 0) {
    operations.push({
      operation: "resolve_review_items",
      reviewItemIds: [...workEligibilityReviewItemIds],
      resolutionStatus: "edited",
    });
  }

  const updatedFields = Object.keys(workEligibilityValue) as Array<
    "requiresVisaSponsorship" | "remoteEligible"
  >;

  return {
    id: createUniqueId("profile_patch_group"),
    summary: `Update ${updatedFields.map(formatIdentityFieldLabel).join(" and ")}`,
    applyMode: "applied",
    operations,
    createdAt: new Date().toISOString(),
  };
}

function buildPreferredWorkModePatchGroup(
  input: ReviseCandidateProfileInput,
): ProfileCopilotPatchGroup | null {
  const requestedWorkMode = detectRequestedWorkMode(input.request);
  const matchingExperience = findMentionedExperience(input);

  if (
    !requestedWorkMode ||
    matchingExperience ||
    !requestLooksLikeWorkModePreferenceEdit(input.request)
  ) {
    return null;
  }

  const item = findPendingRelevantReviewItem(
    input,
    (reviewItem) => reviewItem.target.domain === "work_eligibility",
  );
  const nextRemoteEligible =
    requestedWorkMode === "remote"
      ? true
      : requestedWorkMode === "hybrid" || requestedWorkMode === "onsite"
        ? false
        : input.profile.workEligibility.remoteEligible;
  const operations: ProfileCopilotPatchGroup["operations"] = [];

  if (
    input.searchPreferences.workModes.length !== 1 ||
    input.searchPreferences.workModes[0] !== requestedWorkMode
  ) {
    operations.push({
      operation: "replace_search_preferences_fields",
      value: {
        workModes: [requestedWorkMode],
      },
    });
  }

  if (nextRemoteEligible !== input.profile.workEligibility.remoteEligible) {
    operations.push({
      operation: "replace_work_eligibility_fields",
      value: {
        remoteEligible: nextRemoteEligible,
      },
    });
  }

  if (item) {
    operations.push({
      operation: "resolve_review_items",
      reviewItemIds: [item.id],
      resolutionStatus: "edited",
    });
  }

  if (operations.length === 0) {
    return null;
  }

  return {
    id: createUniqueId("profile_patch_group"),
    summary: `Prefer ${requestedWorkMode} work mode`,
    applyMode: "needs_review",
    operations,
    createdAt: new Date().toISOString(),
  };
}

export function buildSpecializedPatchGroups(
  input: ReviseCandidateProfileInput,
): ProfileCopilotPatchGroup[] | null {
  const groups = [
    buildExperienceWorkModePatchGroup(input),
    buildYearsExperiencePatchGroup(input),
    buildCurrentLocationPatchGroup(input),
    buildTargetRolesPatchGroup(input),
    buildTargetSalaryPatchGroup(input),
    buildWorkEligibilityPatchGroup(input),
    buildPreferredWorkModePatchGroup(input),
  ].filter((group): group is ProfileCopilotPatchGroup => group !== null);

  return groups.length > 0 ? groups : null;
}
