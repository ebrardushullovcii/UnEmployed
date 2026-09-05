// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  type CandidateProfile,
  CandidateProfileSchema,
  JobSearchPreferencesSchema,
  createFreshStartCandidateProfile,
  PROFILE_SETUP_PLACEHOLDER_HEADLINE,
} from "@unemployed/contracts";
import {
  createProfileEditorValues,
  createSearchPreferencesEditorValues,
} from "../../../lib/profile-editor";
import {
  buildProfileSetupIdentityBlockerReason,
  formatProfileSetupReviewValue,
  getReviewItemEditActionLabel,
  getReviewItemEditHint,
  getProfileSetupReviewItemCopy,
  isBlockingPendingReviewItem,
  isFinishBlockingReviewItem,
  isReviewableSuggestionItem,
  buildProfileSetupReadinessPresentation,
  isProfileSetupMissingFieldReviewItem,
  isOptionalPendingReviewItem,
  isProfileSetupPathStepComplete,
  PROFILE_SETUP_VALIDATION_ALERT_ID,
  type ProfileSetupPathStepReadiness,
} from "./profile-setup-screen-helpers";
import { getReviewItemScrollTargetId } from "./profile-setup-review-scroll-targets";
import { profileSetupSteps } from "./profile-setup-steps";
import {
  buildProfileSetupPayload,
  revealProfileSetupValidationAlert,
  useProfileSetupScreenActions,
} from "./profile-setup-screen-actions";

function stubScrollIntoView() {
  const scrollIntoView = vi.fn();
  (Element.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView =
    scrollIntoView;
  return scrollIntoView;
}

function createTestSearchPreferences() {
  return JobSearchPreferencesSchema.parse({
    targetRoles: [],
    jobFamilies: [],
    locations: [],
    excludedLocations: [],
    workModes: [],
    seniorityLevels: [],
    targetIndustries: [],
    targetCompanyStages: [],
    employmentTypes: [],
    minimumSalaryUsd: null,
    targetSalaryUsd: null,
    salaryCurrency: "USD",
    approvalMode: "review_before_submit",
    tailoringMode: "balanced",
    companyBlacklist: [],
    companyWhitelist: [],
    discovery: {
      historyLimit: 5,
      targets: [],
    },
  });
}

function createLocationProfile(
  overrides: Partial<CandidateProfile> = {},
): CandidateProfile {
  return CandidateProfileSchema.parse({
    ...createFreshStartCandidateProfile(),
    id: "candidate_location_normalization",
    firstName: "Avery",
    lastName: "Reed",
    fullName: "Avery Reed",
    headline: "Administrative Coordinator",
    currentLocation: "Seattle, Washington",
    currentCity: "Seattle",
    currentRegion: "Washington",
    currentCountry: "United States",
    email: "avery.reed@example.test",
    yearsExperience: 7,
    ...overrides,
  });
}

function buildLocationPayload(
  profile: CandidateProfile,
  currentLocation: string,
): CandidateProfile {
  const values = createProfileEditorValues(profile);
  values.identity.currentLocation = currentLocation;

  const result = buildProfileSetupPayload(profile, values);
  if (!result.payload) {
    throw new Error(
      result.validationMessage ??
        "Expected the setup location draft to build a valid payload.",
    );
  }

  return result.payload;
}

describe("guided setup location normalization", () => {
  it("clears a prior country when a two-part London, UK value is edited", () => {
    const payload = buildLocationPayload(createLocationProfile(), "London, UK");

    expect(payload.currentLocation).toBe("London, UK");
    expect(payload.currentCity).toBe("London");
    expect(payload.currentRegion).toBe("UK");
    expect(payload.currentCountry).toBeNull();
  });

  it("keeps Remote as the one-part location instead of retaining a prior country", () => {
    const payload = buildLocationPayload(createLocationProfile(), "Remote");

    expect(payload.currentLocation).toBe("Remote");
    expect(payload.currentCity).toBe("Remote");
    expect(payload.currentRegion).toBeNull();
    expect(payload.currentCountry).toBeNull();
  });

  it("maps a two-part City/State value to city and region", () => {
    const payload = buildLocationPayload(
      createLocationProfile(),
      "City, State",
    );

    expect(payload.currentLocation).toBe("City, State");
    expect(payload.currentCity).toBe("City");
    expect(payload.currentRegion).toBe("State");
    expect(payload.currentCountry).toBeNull();
  });

  it("maps a three-part City/Region/Country value to all structured fields", () => {
    const payload = buildLocationPayload(
      createLocationProfile(),
      "City, Region, Country",
    );

    expect(payload.currentLocation).toBe("City, Region, Country");
    expect(payload.currentCity).toBe("City");
    expect(payload.currentRegion).toBe("Region");
    expect(payload.currentCountry).toBe("Country");
  });

  it("preserves structured location data when the compact value is unedited", () => {
    const profile = createLocationProfile({
      currentLocation: "Seattle, Washington",
      currentCity: "Seattle",
      currentRegion: "Washington",
      currentCountry: "United States",
    });
    const payload = buildLocationPayload(profile, "Seattle, Washington");

    expect(payload.currentLocation).toBe(profile.currentLocation);
    expect(payload.currentCity).toBe(profile.currentCity);
    expect(payload.currentRegion).toBe(profile.currentRegion);
    expect(payload.currentCountry).toBe(profile.currentCountry);
  });
});

describe("formatProfileSetupReviewValue", () => {
  it("renders serialized education records as readable details without internal ids", () => {
    const formatted = formatProfileSetupReviewValue(
      JSON.stringify({
        id: "education_internal_1",
        schoolName: "University of Prishtina",
        degree: "Bachelor of Science",
        fieldOfStudy: "Computer Science",
        location: "Prishtina, Kosovo",
      }),
    );

    expect(formatted).toBe(
      "School name: University of Prishtina · Degree: Bachelor of Science · Field of study: Computer Science · Location: Prishtina, Kosovo",
    );
    expect(formatted).not.toContain("education_internal_1");
    expect(formatted).not.toContain("{");
  });

  it("renders structured language values with human labels", () => {
    expect(
      formatProfileSetupReviewValue({
        id: "language_internal_1",
        language: "English",
        proficiency: "fluent",
        interviewPreference: true,
      }),
    ).toBe(
      "Language: English · Proficiency: fluent · Interview preference: Yes",
    );
  });

  it("leaves ordinary text untouched and safely handles malformed JSON-like text", () => {
    expect(formatProfileSetupReviewValue("Senior Software Engineer")).toBe(
      "Senior Software Engineer",
    );
    expect(formatProfileSetupReviewValue("{not json")).toBe("{not json");
  });
});

describe("getProfileSetupReviewItemCopy", () => {
  it("explains how to handle unknown legal work details", () => {
    const copy = getProfileSetupReviewItemCopy({
      label: "Work eligibility",
      reason: "The imported resume did not provide this answer.",
      target: {
        domain: "work_eligibility",
        key: "remoteEligible",
        recordId: null,
      },
    });

    expect(copy).toEqual({
      label: "Check legal work details",
      reason:
        "The imported resume did not provide this answer. If no legal work-authorization fact is available, leave this Not set; Job Finder will not guess.",
    });
  });
});

describe("work history review item guidance", () => {
  const missingWorkHistoryItem = {
    id: "review_missing_work_history",
    step: "background" as const,
    target: { domain: "experience" as const, key: "record", recordId: null },
    label: "Work history",
    reason: "Add or confirm at least one meaningful experience record.",
    severity: "critical" as const,
    status: "pending" as const,
    proposedValue: null,
    sourceSnippet: null,
    sourceCandidateId: null,
    sourceRunId: null,
    createdAt: "2026-08-31T00:00:00.000Z",
    resolvedAt: null,
  };

  it("routes a missing role to adding a role instead of an absent work-mode field", () => {
    const hint = getReviewItemEditHint(missingWorkHistoryItem);

    expect(hint).toContain("Add a role in Work history");
    expect(hint).not.toContain("role's Work mode field");
    expect(getReviewItemEditActionLabel(missingWorkHistoryItem)).toBe(
      "Add a role",
    );
    expect(getReviewItemScrollTargetId(missingWorkHistoryItem)).toBe(
      "profile-setup-experience",
    );
    expect(isProfileSetupMissingFieldReviewItem(missingWorkHistoryItem)).toBe(
      true,
    );
  });

  it("keeps field-specific guidance for an existing role", () => {
    const existingRoleWorkModeItem = {
      ...missingWorkHistoryItem,
      id: "review_work_mode",
      label: "Work mode",
      reason: "Choose the role's Work mode.",
      target: {
        domain: "experience" as const,
        key: "workMode",
        recordId: "experience_1",
      },
    };
    const hint = getReviewItemEditHint(existingRoleWorkModeItem);

    expect(hint).toContain("role's Work mode field");
    expect(getReviewItemEditActionLabel(existingRoleWorkModeItem)).toBe(
      "Edit this",
    );
    expect(getReviewItemScrollTargetId(existingRoleWorkModeItem)).toBe(
      "experience-record-experience_1-work-mode",
    );
    expect(isProfileSetupMissingFieldReviewItem(existingRoleWorkModeItem)).toBe(
      false,
    );
  });
});

describe("profile setup review priority", () => {
  it("keeps pending optional suggestions out of blocking counts", () => {
    const optionalItem = {
      severity: "optional" as const,
      status: "pending" as const,
    };
    const recommendedItem = {
      severity: "recommended" as const,
      status: "pending" as const,
    };
    const resolvedCriticalItem = {
      severity: "critical" as const,
      status: "confirmed" as const,
    };

    expect(isOptionalPendingReviewItem(optionalItem)).toBe(true);
    expect(isBlockingPendingReviewItem(optionalItem)).toBe(false);
    expect(isBlockingPendingReviewItem(recommendedItem)).toBe(true);
    expect(isBlockingPendingReviewItem(resolvedCriticalItem)).toBe(false);
  });

  it("never lets a pending recommended imported suggestion gate finishing setup", () => {
    const recommendedImportedLocation = {
      id: "review_locations",
      severity: "recommended" as const,
      status: "pending" as const,
      target: {
        domain: "search_preferences" as const,
        key: "locations",
        recordId: null,
      },
      proposedValue: "Cedar Park, TX 78613",
      sourceCandidateId: "candidate_locations",
      sourceRunId: "run_1",
      sourceSnippet: null,
    };
    const requiredMissingWorkMode = {
      id: "review_work_modes",
      severity: "recommended" as const,
      status: "pending" as const,
      target: {
        domain: "search_preferences" as const,
        key: "workModes",
        recordId: null,
      },
      proposedValue: null,
      sourceCandidateId: null,
      sourceRunId: null,
      sourceSnippet: null,
    };
    const criticalPending = {
      severity: "critical" as const,
      status: "pending" as const,
    };

    expect(isFinishBlockingReviewItem(recommendedImportedLocation)).toBe(false);
    expect(isReviewableSuggestionItem(recommendedImportedLocation)).toBe(true);
    expect(isFinishBlockingReviewItem(requiredMissingWorkMode)).toBe(true);
    expect(isFinishBlockingReviewItem(criticalPending)).toBe(true);
    expect(isReviewableSuggestionItem(criticalPending)).toBe(false);

    const presentation = buildProfileSetupReadinessPresentation({
      readiness: {
        hasCoreIdentity: true,
        hasContactPath: true,
        hasMeaningfulBackground: true,
        hasEligibilityPreferences: true,
        hasWorkModePreference: true,
        hasDiscoverySource: true,
      },
      reviewItems: [recommendedImportedLocation, requiredMissingWorkMode],
    });
    expect(presentation.blockingPendingReviewItemCount).toBe(1);
    expect(presentation.remainingBlockerCount).toBe(1);
  });
});

describe("isProfileSetupPathStepComplete", () => {
  const baseInput = {
    pendingBlockingReviewCount: 0,
    // Legacy callers without draft evidence keep the chronology-only rule.
    readiness: null,
    setupStatus: "in_progress" as const,
  };

  it("never reports Import complete without an imported resume", () => {
    expect(
      isProfileSetupPathStepComplete({
        ...baseInput,
        stepId: "import",
        currentStep: "essentials",
        hasImportedResume: false,
      }),
    ).toBe(false);

    expect(
      isProfileSetupPathStepComplete({
        ...baseInput,
        stepId: "import",
        currentStep: "essentials",
        hasImportedResume: true,
      }),
    ).toBe(true);
  });

  it("keeps Import open while setup has not moved past it yet", () => {
    expect(
      isProfileSetupPathStepComplete({
        ...baseInput,
        stepId: "import",
        currentStep: "import",
        hasImportedResume: true,
      }),
    ).toBe(false);
  });

  it("keeps manual-setup later steps chronological without faking the import row", () => {
    expect(
      isProfileSetupPathStepComplete({
        ...baseInput,
        stepId: "essentials",
        currentStep: "targeting",
        hasImportedResume: false,
      }),
    ).toBe(true);
    expect(
      isProfileSetupPathStepComplete({
        ...baseInput,
        stepId: "import",
        currentStep: "targeting",
        hasImportedResume: false,
      }),
    ).toBe(false);
  });

  it("still blocks rows behind pending critical or recommended review items", () => {
    expect(
      isProfileSetupPathStepComplete({
        ...baseInput,
        pendingBlockingReviewCount: 1,
        stepId: "essentials",
        currentStep: "targeting",
        hasImportedResume: false,
      }),
    ).toBe(false);
  });

  it("reports every reached row complete for completed setup", () => {
    expect(
      isProfileSetupPathStepComplete({
        pendingBlockingReviewCount: 0,
        setupStatus: "completed",
        stepId: "background",
        currentStep: "extras",
        hasImportedResume: true,
        readiness: null,
      }),
    ).toBe(true);
  });
});

describe("isProfileSetupPathStepComplete domain evidence", () => {
  const untouchedReadiness: ProfileSetupPathStepReadiness = {
    hasAnswerBank: false,
    hasContactPath: false,
    hasCoreIdentity: false,
    hasDiscoverySource: false,
    hasEligibilityPreferences: false,
    hasMeaningfulBackground: false,
    hasNarrative: false,
    hasWorkModePreference: false,
  };
  const completeReadiness: ProfileSetupPathStepReadiness = {
    hasAnswerBank: true,
    hasContactPath: true,
    hasCoreIdentity: true,
    hasDiscoverySource: true,
    hasEligibilityPreferences: true,
    hasMeaningfulBackground: true,
    hasNarrative: true,
    hasWorkModePreference: true,
  };

  it("never marks untouched steps complete after blitz-clicking to the last step", () => {
    for (const stepId of profileSetupSteps) {
      expect(
        isProfileSetupPathStepComplete({
          currentStep: "extras",
          hasImportedResume: false,
          pendingBlockingReviewCount: 0,
          readiness: untouchedReadiness,
          setupStatus: "in_progress",
          stepId,
        }),
      ).toBe(false);
    }

    // Finishing setup cannot promote rows whose domain content never existed.
    expect(
      isProfileSetupPathStepComplete({
        currentStep: "extras",
        hasImportedResume: false,
        pendingBlockingReviewCount: 0,
        readiness: untouchedReadiness,
        setupStatus: "completed",
        stepId: "background",
      }),
    ).toBe(false);
  });

  it("keeps genuinely satisfied steps complete while they sit behind the current step", () => {
    const baseInput = {
      currentStep: "extras" as const,
      hasImportedResume: true,
      pendingBlockingReviewCount: 0,
      readiness: completeReadiness,
      setupStatus: "in_progress" as const,
    };

    expect(
      isProfileSetupPathStepComplete({ ...baseInput, stepId: "import" }),
    ).toBe(true);
    expect(
      isProfileSetupPathStepComplete({ ...baseInput, stepId: "essentials" }),
    ).toBe(true);
    expect(
      isProfileSetupPathStepComplete({ ...baseInput, stepId: "background" }),
    ).toBe(true);
    expect(
      isProfileSetupPathStepComplete({ ...baseInput, stepId: "targeting" }),
    ).toBe(true);
    // The optional last step is never complete by chronology while it is the
    // current step; finishing setup promotes it once its content exists.
    expect(
      isProfileSetupPathStepComplete({ ...baseInput, stepId: "extras" }),
    ).toBe(false);
    expect(
      isProfileSetupPathStepComplete({
        ...baseInput,
        setupStatus: "completed",
        stepId: "extras",
      }),
    ).toBe(true);
  });

  it("judges each step by its own signals instead of the strongest one", () => {
    const identityWithoutContact: ProfileSetupPathStepReadiness = {
      ...completeReadiness,
      hasContactPath: false,
    };
    expect(
      isProfileSetupPathStepComplete({
        currentStep: "extras",
        hasImportedResume: true,
        pendingBlockingReviewCount: 0,
        readiness: identityWithoutContact,
        setupStatus: "in_progress",
        stepId: "essentials",
      }),
    ).toBe(false);

    const targetingWithoutWorkMode: ProfileSetupPathStepReadiness = {
      ...completeReadiness,
      hasWorkModePreference: false,
    };
    expect(
      isProfileSetupPathStepComplete({
        currentStep: "extras",
        hasImportedResume: true,
        pendingBlockingReviewCount: 0,
        readiness: targetingWithoutWorkMode,
        setupStatus: "in_progress",
        stepId: "targeting",
      }),
    ).toBe(false);
  });

  it("leaves empty optional steps unbadged without turning them into blockers", () => {
    const readiness: ProfileSetupPathStepReadiness = {
      ...completeReadiness,
      hasAnswerBank: false,
      hasNarrative: false,
    };
    const baseInput = {
      currentStep: "extras" as const,
      hasImportedResume: true,
      pendingBlockingReviewCount: 0,
      readiness,
      setupStatus: "in_progress" as const,
    };

    expect(
      isProfileSetupPathStepComplete({ ...baseInput, stepId: "narrative" }),
    ).toBe(false);
    expect(
      isProfileSetupPathStepComplete({ ...baseInput, stepId: "answers" }),
    ).toBe(false);

    // Required neighbors stay honestly complete beside the empty optionals.
    expect(
      isProfileSetupPathStepComplete({ ...baseInput, stepId: "essentials" }),
    ).toBe(true);
    expect(
      isProfileSetupPathStepComplete({ ...baseInput, stepId: "targeting" }),
    ).toBe(true);
  });

  it("still lets pending blocking reviews outrank any evidence", () => {
    expect(
      isProfileSetupPathStepComplete({
        currentStep: "extras",
        hasImportedResume: true,
        pendingBlockingReviewCount: 1,
        readiness: completeReadiness,
        setupStatus: "completed",
        stepId: "essentials",
      }),
    ).toBe(false);
  });

  it("keeps manual-setup import rows honest even with otherwise full evidence", () => {
    expect(
      isProfileSetupPathStepComplete({
        currentStep: "extras",
        hasImportedResume: false,
        pendingBlockingReviewCount: 0,
        readiness: completeReadiness,
        setupStatus: "completed",
        stepId: "import",
      }),
    ).toBe(false);
  });
});

describe("buildProfileSetupIdentityBlockerReason", () => {
  it("enumerates full name, headline, location, contact, and fresh-start years when they miss", () => {
    const reason = buildProfileSetupIdentityBlockerReason(
      createFreshStartCandidateProfile(),
    );

    expect(reason).toContain("your full name");
    expect(reason).toContain("a headline");
    expect(reason).toContain("your location");
    expect(reason).toContain("at least one contact method");
    expect(reason).toContain("your years of experience");
  });

  it("names only the requirements that are still missing", () => {
    const reason = buildProfileSetupIdentityBlockerReason({
      ...createFreshStartCandidateProfile(),
      firstName: "Alex",
      lastName: "Vanguard",
      fullName: "Alex Vanguard",
      headline: "Senior systems designer",
      currentLocation: "London, UK",
      yearsExperience: 7,
    });

    expect(reason).not.toContain("your full name");
    expect(reason).not.toContain("a headline");
    expect(reason).not.toContain("your location");
    expect(reason).toContain("at least one contact method");
    expect(reason).not.toContain("your years of experience");
  });

  it("says exactly add a headline when only the headline is missing", () => {
    const reason = buildProfileSetupIdentityBlockerReason({
      ...createFreshStartCandidateProfile(),
      id: "candidate_complete_identity",
      firstName: "Alex",
      lastName: "Vanguard",
      middleName: null,
      fullName: "Alex Vanguard",
      currentLocation: "London, UK",
      email: "alex@example.com",
      yearsExperience: 7,
      headline: null,
    });

    expect(reason).toBe(
      "Add a headline before discovery and applications rely on your identity.",
    );
    expect(reason).not.toContain("your full name");
    expect(reason).not.toContain("your location");
    expect(reason).not.toContain("at least one contact method");
  });

  it("treats a first-run placeholder headline as a missing headline", () => {
    const reason = buildProfileSetupIdentityBlockerReason({
      ...createFreshStartCandidateProfile(),
      id: "candidate_placeholder_headline",
      firstName: "Alex",
      lastName: "Vanguard",
      middleName: null,
      fullName: "Alex Vanguard",
      currentLocation: "London, UK",
      email: "alex@example.com",
      yearsExperience: 7,
      headline: PROFILE_SETUP_PLACEHOLDER_HEADLINE,
    });

    expect(reason).toBe(
      "Add a headline before discovery and applications rely on your identity.",
    );
  });

  it("requires fresh-start years only for fresh-start profiles", () => {
    const reason = buildProfileSetupIdentityBlockerReason({
      ...createFreshStartCandidateProfile(),
      id: "candidate_legacy_import",
      email: "alex@example.com",
      yearsExperience: 0,
    });

    expect(reason).toContain("your full name");
    expect(reason).toContain("a headline");
    expect(reason).not.toContain("your years of experience");
  });
});

describe("aborted save-and-move validation alert", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    delete (Element.prototype as unknown as { scrollIntoView?: unknown })
      .scrollIntoView;
    vi.restoreAllMocks();
  });

  it("keeps failed values on the current step and reveals one canonical alert", () => {
    const scrollIntoView = stubScrollIntoView();
    document.body.innerHTML = `<p id="${PROFILE_SETUP_VALIDATION_ALERT_ID}" role="alert"></p>`;

    const profile = createFreshStartCandidateProfile();
    const searchPreferences = createTestSearchPreferences();
    const onResumeSetup = vi.fn();
    const onSaveSetupStep = vi.fn();
    const onContinueToProfile = vi.fn();
    const setValidationMessage = vi.fn();

    const { result } = renderHook(() =>
      useProfileSetupScreenActions({
        draftAwareReviewItems: [],
        hasUnsavedChanges: true,
        onContinueToProfile,
        onResumeSetup,
        onSaveSetupStep,
        profile,
        profileFormValues: () => ({
          ...createProfileEditorValues(profile),
          identity: {
            ...createProfileEditorValues(profile).identity,
            yearsExperience: "-2",
          },
        }),
        profileSetupCurrentStep: "essentials",
        searchPreferences,
        preferencesFormValues: () =>
          createSearchPreferencesEditorValues(searchPreferences),
        setValidationMessage,
      }),
    );

    act(() => {
      result.current.goToStep("background");
    });

    expect(onResumeSetup).not.toHaveBeenCalled();
    expect(onSaveSetupStep).not.toHaveBeenCalled();
    expect(setValidationMessage).toHaveBeenCalledTimes(1);
    expect(setValidationMessage).toHaveBeenCalledWith(
      expect.stringContaining("Years of experience"),
    );
    expect(scrollIntoView).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.openProfile();
    });

    expect(onContinueToProfile).not.toHaveBeenCalled();
    expect(onSaveSetupStep).not.toHaveBeenCalled();
  });

  it("scrolls immediately when the alert is mounted and defers when it is not", () => {
    const scrollIntoView = stubScrollIntoView();
    document.body.innerHTML = `<p id="${PROFILE_SETUP_VALIDATION_ALERT_ID}" role="alert"></p>`;

    revealProfileSetupValidationAlert();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);

    document.body.innerHTML = "";
    const rafCallbacks: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      rafCallbacks.push(callback);
      return rafCallbacks.length;
    });

    revealProfileSetupValidationAlert();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);

    document.body.innerHTML = `<p id="${PROFILE_SETUP_VALIDATION_ALERT_ID}" role="alert"></p>`;
    for (const callback of rafCallbacks) {
      callback(0);
    }
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
  });
});

describe("guided setup profile continuity", () => {
  it("keeps compact essentials visible in Profile Basics after save and reload", () => {
    const profile = createFreshStartCandidateProfile();
    const searchPreferences = createTestSearchPreferences();
    const editedValues = createProfileEditorValues(profile);
    const summary =
      "Operations leader who turns complex workflows into dependable systems.";
    Object.assign(editedValues.identity, {
      currentLocation: "Madison, Wisconsin",
      email: "avery.reed@example.test",
      firstName: "Avery",
      headline: "Administrative Coordinator",
      lastName: "Reed",
      summary,
    });

    const onSaveSetupStep = vi.fn();
    const { result } = renderHook(() =>
      useProfileSetupScreenActions({
        draftAwareReviewItems: [
          {
            id: "review_locations",
            step: "targeting",
            target: {
              domain: "search_preferences",
              key: "locations",
              recordId: null,
            },
            label: "Preferred locations",
            reason: "Confirm the imported location.",
            severity: "recommended",
            status: "edited",
            savedStatus: "pending",
            statusSource: "draft",
            proposedValue: "Cedar Park, TX 78613",
            sourceSnippet: null,
            sourceCandidateId: "candidate_locations",
            sourceRunId: "run_1",
            createdAt: "2026-07-16T10:00:00.000Z",
            resolvedAt: null,
          },
          {
            id: "review_roles",
            step: "targeting",
            target: {
              domain: "search_preferences",
              key: "targetRoles",
              recordId: null,
            },
            label: "Target roles",
            reason: "Add target roles.",
            severity: "recommended",
            status: "pending",
            savedStatus: "pending",
            statusSource: "saved",
            proposedValue: null,
            sourceSnippet: null,
            sourceCandidateId: null,
            sourceRunId: null,
            createdAt: "2026-07-16T10:00:00.000Z",
            resolvedAt: null,
          },
        ],
        hasUnsavedChanges: true,
        onContinueToProfile: vi.fn(),
        onResumeSetup: vi.fn(),
        onSaveSetupStep,
        profile,
        profileFormValues: () => editedValues,
        profileSetupCurrentStep: "essentials",
        searchPreferences,
        preferencesFormValues: () =>
          createSearchPreferencesEditorValues(searchPreferences),
        setValidationMessage: vi.fn(),
      }),
    );

    act(() => {
      result.current.handleSaveCurrentStep();
    });

    // Suggestions the draft already edited travel with the save so the
    // persisted setup state does not keep them pending.
    expect(onSaveSetupStep.mock.calls[0]?.[3]).toMatchObject({
      resolvedReviewItems: [{ id: "review_locations", status: "edited" }],
    });

    const savedProfile = onSaveSetupStep.mock.calls[0]?.[0] as
      | CandidateProfile
      | undefined;
    expect(savedProfile).toMatchObject({
      currentCity: "Madison",
      currentLocation: "Madison, Wisconsin",
      currentRegion: "Wisconsin",
      professionalSummary: { shortValueProposition: summary },
      summary,
    });
    if (!savedProfile) {
      throw new Error("Expected guided setup to emit a saved profile.");
    }

    // The Profile route reconstructs its form from the committed workspace
    // snapshot. These values are the same source used by Profile Basics.
    const reloadedValues = createProfileEditorValues(savedProfile);
    expect(reloadedValues.identity.currentCity).toBe("Madison");
    expect(reloadedValues.identity.currentRegion).toBe("Wisconsin");
    expect(reloadedValues.summary.shortValueProposition).toBe(summary);
  });
});
