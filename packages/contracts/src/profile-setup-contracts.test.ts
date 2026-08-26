import { describe, expect, test } from "vitest";

import {
  ProfileSetupReviewActionSchema,
  ProfileSetupReviewActionOptionsSchema,
  ProfileSetupStateSchema,
  ProfileReviewItemSchema,
  CandidateProfileSchema,
  JobSearchPreferencesSchema,
  createFreshStartCandidateProfile,
  evaluateProfileSetupReadiness,
  deriveProfileSetupState,
  getProfileSetupReadinessBlockers,
  hasProfileSetupPlaceholderValue,
} from "./index";

const emptyProfessionalSummary = {
  shortValueProposition: null,
  fullSummary: null,
  careerThemes: [],
  leadershipSummary: null,
  domainFocusSummary: null,
  strengths: [],
};

const emptyNarrative = {
  professionalStory: null,
  nextChapterSummary: null,
  careerTransitionSummary: null,
  differentiators: [],
  motivationThemes: [],
};

const emptyAnswerBank = {
  workAuthorization: null,
  visaSponsorship: null,
  relocation: null,
  travel: null,
  noticePeriod: null,
  availability: null,
  salaryExpectations: null,
  selfIntroduction: null,
  careerTransition: null,
  customAnswers: [],
};

const emptyApplicationIdentity = {
  preferredEmail: null,
  preferredPhone: null,
  preferredLinkIds: [],
};

const emptySkillGroups = {
  coreSkills: [],
  tools: [],
  languagesAndFrameworks: [],
  softSkills: [],
  highlightedSkills: [],
};

// A materially complete profile/preferences pair; only the work-mode
// preference is toggled by the canonical-rule tests below.
const completeProfileFixture = CandidateProfileSchema.parse({
  id: "candidate_1",
  firstName: "Alex",
  lastName: "Vanguard",
  fullName: "Alex Vanguard",
  headline: "Senior systems designer",
  summary: "Builds resilient workflows.",
  currentLocation: "London, UK",
  yearsExperience: 10,
  email: "alex@example.com",
  phone: "+44 000 0000",
  baseResume: {
    id: "resume_1",
    fileName: "alex.pdf",
    uploadedAt: "2026-04-11T10:00:00.000Z",
    textContent: "Alex Vanguard",
    extractionStatus: "ready",
  },
  workEligibility: {
    authorizedWorkCountries: ["United Kingdom"],
    requiresVisaSponsorship: false,
    remoteEligible: true,
  },
  targetRoles: ["Principal Designer"],
  experiences: [
    {
      id: "experience_1",
      companyName: "Signal Systems",
      title: "Senior Product Designer",
      startDate: "2022-01",
      isCurrent: true,
      summary: "Owned workflow tooling.",
    },
  ],
});

const blankSearchPreferencesFixture = JobSearchPreferencesSchema.parse({
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
  compensation: {
    minimum: null,
    maximum: null,
    interval: "year",
    currency: null,
    currencyStatus: "needs_clarification",
  },
  approvalMode: "review_before_submit",
  tailoringMode: "balanced",
  companyBlacklist: [],
  companyWhitelist: [],
  discovery: { historyLimit: 5, targets: [] },
});

const completeSearchPreferencesFixture = JobSearchPreferencesSchema.parse({
  targetRoles: ["Principal Designer"],
  jobFamilies: [],
  locations: ["Remote"],
  excludedLocations: [],
  workModes: ["remote"],
  seniorityLevels: [],
  targetIndustries: [],
  targetCompanyStages: [],
  employmentTypes: [],
  minimumSalaryUsd: null,
  targetSalaryUsd: null,
  salaryCurrency: "USD",
  compensation: {
    minimum: null,
    maximum: null,
    interval: "year",
    currency: null,
    currencyStatus: "needs_clarification",
  },
  approvalMode: "review_before_submit",
  tailoringMode: "balanced",
  companyBlacklist: [],
  companyWhitelist: [],
  discovery: {
    historyLimit: 5,
    targets: [
      {
        id: "source_1",
        label: "Signal Systems careers",
        startingUrl: "https://signal.example/careers",
      },
    ],
  },
});

describe("contracts profile setup schemas", () => {
  test("parses profile setup workflow state", () => {
    const setupState = ProfileSetupStateSchema.parse({
      status: "in_progress",
      currentStep: "targeting",
      completedAt: null,
      reviewItems: [
        {
          id: "review_1",
          step: "essentials",
          target: {
            domain: "identity",
            key: "headline",
            recordId: null,
          },
          label: "Headline",
          reason: "Headline still needs confirmation after import.",
          severity: "recommended",
          status: "pending",
          proposedValue: "Senior Product Designer",
          sourceSnippet: "Senior Product Designer",
          sourceCandidateId: "candidate_import_1",
          sourceRunId: "resume_import_run_1",
          createdAt: "2026-04-11T10:00:00.000Z",
          resolvedAt: null,
        },
      ],
      lastResumedAt: "2026-04-11T10:05:00.000Z",
    });

    expect(setupState.currentStep).toBe("targeting");
    expect(setupState.reviewItems[0]?.target.domain).toBe("identity");
  });

  test("parses a profile review item", () => {
    expect(
      ProfileReviewItemSchema.parse({
        id: "review_2",
        step: "background",
        target: {
          domain: "experience",
          key: "companyName",
          recordId: "experience_1",
        },
        label: "Current role",
        reason:
          "Experience details should be confirmed before setup is complete.",
        severity: "critical",
        status: "edited",
        proposedValue: null,
        sourceSnippet: null,
        sourceCandidateId: null,
        sourceRunId: null,
        createdAt: "2026-04-11T10:00:00.000Z",
        resolvedAt: "2026-04-11T10:08:00.000Z",
      }).status,
    ).toBe("edited");
  });

  test("parses supported setup review actions", () => {
    expect(ProfileSetupReviewActionSchema.parse("confirm")).toBe("confirm");
    expect(ProfileSetupReviewActionSchema.parse("dismiss")).toBe("dismiss");
    expect(ProfileSetupReviewActionSchema.parse("clear_value")).toBe(
      "clear_value",
    );
    expect(
      ProfileSetupReviewActionOptionsSchema.parse({
        selectedConflictChoiceId: "choice_visual_scan",
      }).selectedConflictChoiceId,
    ).toBe("choice_visual_scan");
  });

  test("derives completed setup state from materially complete profile inputs", () => {
    const state = deriveProfileSetupState(
      {
        id: "candidate_1",
        firstName: "Alex",
        lastName: "Vanguard",
        middleName: null,
        fullName: "Alex Vanguard",
        preferredDisplayName: null,
        headline: "Senior systems designer",
        summary: "Builds resilient workflows.",
        currentLocation: "London, UK",
        currentCity: null,
        currentRegion: null,
        currentCountry: null,
        timeZone: null,
        yearsExperience: 10,
        email: "alex@example.com",
        secondaryEmail: null,
        phone: "+44 000 0000",
        portfolioUrl: null,
        linkedinUrl: null,
        githubUrl: null,
        personalWebsiteUrl: null,
        baseResume: {
          id: "resume_1",
          fileName: "alex.pdf",
          uploadedAt: "2026-04-11T10:00:00.000Z",
          storagePath: "/tmp/alex.pdf",
          textContent: "Alex Vanguard",
          textUpdatedAt: "2026-04-11T10:00:00.000Z",
          extractionStatus: "ready",
          lastAnalyzedAt: "2026-04-11T10:00:00.000Z",
          analysisProviderKind: null,
          analysisProviderLabel: null,
          analysisWarnings: [],
        },
        workEligibility: {
          authorizedWorkCountries: ["United Kingdom"],
          requiresVisaSponsorship: false,
          willingToRelocate: null,
          preferredRelocationRegions: [],
          willingToTravel: null,
          remoteEligible: true,
          noticePeriodDays: null,
          availableStartDate: null,
          securityClearance: null,
        },
        professionalSummary: emptyProfessionalSummary,
        narrative: emptyNarrative,
        proofBank: [],
        answerBank: emptyAnswerBank,
        applicationIdentity: emptyApplicationIdentity,
        skillGroups: emptySkillGroups,
        targetRoles: ["Principal Designer"],
        locations: ["Remote"],
        skills: [],
        experiences: [
          {
            id: "experience_1",
            companyName: "Signal Systems",
            companyUrl: null,
            title: "Senior Product Designer",
            employmentType: null,
            location: "London, UK",
            workMode: [],
            startDate: "2022-01",
            endDate: null,
            isCurrent: true,
            isDraft: false,
            summary: "Owned workflow tooling.",
            achievements: [],
            skills: [],
            domainTags: [],
            peopleManagementScope: null,
            ownershipScope: null,
          },
        ],
        education: [],
        certifications: [],
        links: [],
        projects: [],
        spokenLanguages: [],
      },
      {
        targetRoles: ["Principal Designer"],
        jobFamilies: [],
        locations: ["Remote"],
        excludedLocations: [],
        workModes: ["remote"],
        seniorityLevels: [],
        targetIndustries: [],
        targetCompanyStages: [],
        employmentTypes: [],
        minimumSalaryUsd: null,
        targetSalaryUsd: null,
        salaryCurrency: "USD",
        compensation: {
          minimum: null,
          maximum: null,
          interval: "year",
          currency: null,
          currencyStatus: "needs_clarification",
        },
        approvalMode: "review_before_submit",
        tailoringMode: "balanced",
        companyBlacklist: [],
        companyWhitelist: [],
        discovery: {
          historyLimit: 5,
          targets: [
            {
              id: "source_1",
              label: "Signal Systems careers",
              startingUrl: "https://signal.example/careers",
              enabled: true,
              adapterKind: "auto",
              customInstructions: null,
              instructionStatus: "missing",
              validatedInstructionId: null,
              draftInstructionId: null,
              lastDebugRunId: null,
              lastVerifiedAt: null,
              staleReason: null,
            },
          ],
        },
      },
      { now: "2026-04-11T10:15:00.000Z" },
    );

    expect(state.status).toBe("completed");
    expect(state.currentStep).toBe("ready_check");
    expect(state.completedAt).toBe("2026-04-11T10:15:00.000Z");
  });

  test("keeps setup in progress when pending critical review items remain", () => {
    const state = deriveProfileSetupState(
      {
        id: "candidate_1",
        firstName: "Alex",
        lastName: "Vanguard",
        middleName: null,
        fullName: "Alex Vanguard",
        preferredDisplayName: null,
        headline: "Senior systems designer",
        summary: "Builds resilient workflows.",
        currentLocation: "London, UK",
        currentCity: null,
        currentRegion: null,
        currentCountry: null,
        timeZone: null,
        yearsExperience: 10,
        email: "alex@example.com",
        secondaryEmail: null,
        phone: "+44 000 0000",
        portfolioUrl: null,
        linkedinUrl: null,
        githubUrl: null,
        personalWebsiteUrl: null,
        baseResume: {
          id: "resume_1",
          fileName: "alex.pdf",
          uploadedAt: "2026-04-11T10:00:00.000Z",
          storagePath: "/tmp/alex.pdf",
          textContent: "Alex Vanguard",
          textUpdatedAt: "2026-04-11T10:00:00.000Z",
          extractionStatus: "ready",
          lastAnalyzedAt: "2026-04-11T10:00:00.000Z",
          analysisProviderKind: null,
          analysisProviderLabel: null,
          analysisWarnings: [],
        },
        workEligibility: {
          authorizedWorkCountries: ["United Kingdom"],
          requiresVisaSponsorship: false,
          willingToRelocate: null,
          preferredRelocationRegions: [],
          willingToTravel: null,
          remoteEligible: true,
          noticePeriodDays: null,
          availableStartDate: null,
          securityClearance: null,
        },
        professionalSummary: emptyProfessionalSummary,
        narrative: emptyNarrative,
        proofBank: [],
        answerBank: emptyAnswerBank,
        applicationIdentity: emptyApplicationIdentity,
        skillGroups: emptySkillGroups,
        targetRoles: ["Principal Designer"],
        locations: ["Remote"],
        skills: [],
        experiences: [
          {
            id: "experience_1",
            companyName: "Signal Systems",
            companyUrl: null,
            title: "Senior Product Designer",
            employmentType: null,
            location: "London, UK",
            workMode: [],
            startDate: "2022-01",
            endDate: null,
            isCurrent: true,
            isDraft: false,
            summary: "Owned workflow tooling.",
            achievements: [],
            skills: [],
            domainTags: [],
            peopleManagementScope: null,
            ownershipScope: null,
          },
        ],
        education: [],
        certifications: [],
        links: [],
        projects: [],
        spokenLanguages: [],
      },
      {
        targetRoles: ["Principal Designer"],
        jobFamilies: [],
        locations: ["Remote"],
        excludedLocations: [],
        workModes: ["remote"],
        seniorityLevels: [],
        targetIndustries: [],
        targetCompanyStages: [],
        employmentTypes: [],
        minimumSalaryUsd: null,
        targetSalaryUsd: null,
        salaryCurrency: "USD",
        compensation: {
          minimum: null,
          maximum: null,
          interval: "year",
          currency: null,
          currencyStatus: "needs_clarification",
        },
        approvalMode: "review_before_submit",
        tailoringMode: "balanced",
        companyBlacklist: [],
        companyWhitelist: [],
        discovery: { historyLimit: 5, targets: [] },
      },
      {
        currentState: {
          status: "in_progress",
          currentStep: "background",
          completedAt: null,
          reviewItems: [
            {
              id: "review_1",
              step: "essentials",
              target: {
                domain: "identity",
                key: "headline",
                recordId: null,
              },
              label: "Headline",
              reason: "Confirm the imported headline before setup is complete.",
              severity: "critical",
              status: "pending",
              proposedValue: "Senior systems designer",
              sourceSnippet: "Senior systems designer",
              sourceCandidateId: null,
              sourceRunId: null,
              createdAt: "2026-04-11T10:00:00.000Z",
              resolvedAt: null,
            },
          ],
          lastResumedAt: null,
        },
        now: "2026-04-11T10:15:00.000Z",
      },
    );

    expect(state.status).toBe("in_progress");
    expect(state.currentStep).toBe("background");
    expect(state.completedAt).toBeNull();
  });

  test("keeps explicit in-progress step even when readiness becomes materially complete", () => {
    const state = deriveProfileSetupState(
      {
        id: "candidate_1",
        firstName: "Alex",
        lastName: "Vanguard",
        middleName: null,
        fullName: "Alex Vanguard",
        preferredDisplayName: null,
        headline: "Senior systems designer",
        summary: "Builds resilient workflows.",
        currentLocation: "London, UK",
        currentCity: null,
        currentRegion: null,
        currentCountry: null,
        timeZone: null,
        yearsExperience: 10,
        email: "alex@example.com",
        secondaryEmail: null,
        phone: "+44 000 0000",
        portfolioUrl: null,
        linkedinUrl: null,
        githubUrl: null,
        personalWebsiteUrl: null,
        baseResume: {
          id: "resume_1",
          fileName: "alex.pdf",
          uploadedAt: "2026-04-11T10:00:00.000Z",
          storagePath: "/tmp/alex.pdf",
          textContent: "Alex Vanguard",
          textUpdatedAt: "2026-04-11T10:00:00.000Z",
          extractionStatus: "ready",
          lastAnalyzedAt: "2026-04-11T10:00:00.000Z",
          analysisProviderKind: null,
          analysisProviderLabel: null,
          analysisWarnings: [],
        },
        workEligibility: {
          authorizedWorkCountries: ["United Kingdom"],
          requiresVisaSponsorship: false,
          willingToRelocate: null,
          preferredRelocationRegions: [],
          willingToTravel: null,
          remoteEligible: true,
          noticePeriodDays: null,
          availableStartDate: null,
          securityClearance: null,
        },
        professionalSummary: emptyProfessionalSummary,
        narrative: emptyNarrative,
        proofBank: [],
        answerBank: emptyAnswerBank,
        applicationIdentity: emptyApplicationIdentity,
        skillGroups: emptySkillGroups,
        targetRoles: ["Principal Designer"],
        locations: ["Remote"],
        skills: [],
        experiences: [
          {
            id: "experience_1",
            companyName: "Signal Systems",
            companyUrl: null,
            title: "Senior Product Designer",
            employmentType: null,
            location: "London, UK",
            workMode: [],
            startDate: "2022-01",
            endDate: null,
            isCurrent: true,
            isDraft: false,
            summary: "Owned workflow tooling.",
            achievements: [],
            skills: [],
            domainTags: [],
            peopleManagementScope: null,
            ownershipScope: null,
          },
        ],
        education: [],
        certifications: [],
        links: [],
        projects: [],
        spokenLanguages: [],
      },
      {
        targetRoles: ["Principal Designer"],
        jobFamilies: [],
        locations: ["Remote"],
        excludedLocations: [],
        workModes: ["remote"],
        seniorityLevels: [],
        targetIndustries: [],
        targetCompanyStages: [],
        employmentTypes: [],
        minimumSalaryUsd: null,
        targetSalaryUsd: null,
        salaryCurrency: "USD",
        compensation: {
          minimum: null,
          maximum: null,
          interval: "year",
          currency: null,
          currencyStatus: "needs_clarification",
        },
        approvalMode: "review_before_submit",
        tailoringMode: "balanced",
        companyBlacklist: [],
        companyWhitelist: [],
        discovery: { historyLimit: 5, targets: [] },
      },
      {
        currentState: {
          status: "in_progress",
          currentStep: "background",
          completedAt: null,
          reviewItems: [],
          lastResumedAt: "2026-04-11T10:20:00.000Z",
        },
        now: "2026-04-11T10:30:00.000Z",
      },
    );

    expect(state.status).toBe("in_progress");
    expect(state.currentStep).toBe("background");
    expect(state.completedAt).toBeNull();
  });

  test("treats fresh-start zero years of experience as incomplete core identity", () => {
    const readiness = evaluateProfileSetupReadiness(
      {
        id: "candidate_fresh_start",
        firstName: "New",
        lastName: "Candidate",
        middleName: null,
        fullName: "New Candidate",
        preferredDisplayName: null,
        headline: "Senior systems designer",
        summary: "Builds resilient workflows.",
        currentLocation: "London, UK",
        currentCity: null,
        currentRegion: null,
        currentCountry: null,
        timeZone: null,
        yearsExperience: 0,
        email: "alex@example.com",
        secondaryEmail: null,
        phone: null,
        portfolioUrl: null,
        linkedinUrl: null,
        githubUrl: null,
        personalWebsiteUrl: null,
        baseResume: {
          id: "resume_1",
          fileName: "alex.pdf",
          uploadedAt: "2026-04-11T10:00:00.000Z",
          storagePath: "/tmp/alex.pdf",
          textContent: "Alex Vanguard",
          textUpdatedAt: "2026-04-11T10:00:00.000Z",
          extractionStatus: "ready",
          lastAnalyzedAt: "2026-04-11T10:00:00.000Z",
          analysisProviderKind: null,
          analysisProviderLabel: null,
          analysisWarnings: [],
        },
        workEligibility: {
          authorizedWorkCountries: ["United Kingdom"],
          requiresVisaSponsorship: false,
          willingToRelocate: null,
          preferredRelocationRegions: [],
          willingToTravel: null,
          remoteEligible: true,
          noticePeriodDays: null,
          availableStartDate: null,
          securityClearance: null,
        },
        professionalSummary: emptyProfessionalSummary,
        narrative: emptyNarrative,
        proofBank: [],
        answerBank: emptyAnswerBank,
        applicationIdentity: emptyApplicationIdentity,
        skillGroups: emptySkillGroups,
        targetRoles: ["Principal Designer"],
        locations: ["Remote"],
        skills: [],
        experiences: [
          {
            id: "experience_1",
            companyName: "Signal Systems",
            companyUrl: null,
            title: "Senior Product Designer",
            employmentType: null,
            location: "London, UK",
            workMode: [],
            startDate: "2022-01",
            endDate: null,
            isCurrent: true,
            isDraft: false,
            summary: "Owned workflow tooling.",
            achievements: [],
            skills: [],
            domainTags: [],
            peopleManagementScope: null,
            ownershipScope: null,
          },
        ],
        education: [],
        certifications: [],
        links: [],
        projects: [],
        spokenLanguages: [],
      },
      {
        targetRoles: ["Principal Designer"],
        jobFamilies: [],
        locations: ["Remote"],
        excludedLocations: [],
        workModes: ["remote"],
        seniorityLevels: [],
        targetIndustries: [],
        targetCompanyStages: [],
        employmentTypes: [],
        minimumSalaryUsd: null,
        targetSalaryUsd: null,
        salaryCurrency: "USD",
        compensation: {
          minimum: null,
          maximum: null,
          interval: "year",
          currency: null,
          currencyStatus: "needs_clarification",
        },
        approvalMode: "review_before_submit",
        tailoringMode: "balanced",
        companyBlacklist: [],
        companyWhitelist: [],
        discovery: { historyLimit: 5, targets: [] },
      },
    );

    expect(readiness.freshStart).toBe(true);
    expect(readiness.hasCoreIdentity).toBe(false);
    expect(readiness.hasDiscoverySource).toBe(false);
    expect(readiness.recommendedStep).toBe("essentials");
  });

  test("downgrades completed setup when new pending review items appear", () => {
    const state = deriveProfileSetupState(
      {
        id: "candidate_1",
        firstName: "Alex",
        lastName: "Vanguard",
        middleName: null,
        fullName: "Alex Vanguard",
        preferredDisplayName: null,
        headline: "Senior systems designer",
        summary: "Builds resilient workflows.",
        currentLocation: "London, UK",
        currentCity: null,
        currentRegion: null,
        currentCountry: null,
        timeZone: null,
        yearsExperience: 10,
        email: "alex@example.com",
        secondaryEmail: null,
        phone: "+44 000 0000",
        portfolioUrl: null,
        linkedinUrl: null,
        githubUrl: null,
        personalWebsiteUrl: null,
        baseResume: {
          id: "resume_1",
          fileName: "alex.pdf",
          uploadedAt: "2026-04-11T10:00:00.000Z",
          storagePath: "/tmp/alex.pdf",
          textContent: "Alex Vanguard",
          textUpdatedAt: "2026-04-11T10:00:00.000Z",
          extractionStatus: "ready",
          lastAnalyzedAt: "2026-04-11T10:00:00.000Z",
          analysisProviderKind: null,
          analysisProviderLabel: null,
          analysisWarnings: [],
        },
        workEligibility: {
          authorizedWorkCountries: ["United Kingdom"],
          requiresVisaSponsorship: false,
          willingToRelocate: null,
          preferredRelocationRegions: [],
          willingToTravel: null,
          remoteEligible: true,
          noticePeriodDays: null,
          availableStartDate: null,
          securityClearance: null,
        },
        professionalSummary: emptyProfessionalSummary,
        narrative: emptyNarrative,
        proofBank: [],
        answerBank: emptyAnswerBank,
        applicationIdentity: emptyApplicationIdentity,
        skillGroups: emptySkillGroups,
        targetRoles: ["Principal Designer"],
        locations: ["Remote"],
        skills: [],
        experiences: [
          {
            id: "experience_1",
            companyName: "Signal Systems",
            companyUrl: null,
            title: "Senior Product Designer",
            employmentType: null,
            location: "London, UK",
            workMode: [],
            startDate: "2022-01",
            endDate: null,
            isCurrent: true,
            isDraft: false,
            summary: "Owned workflow tooling.",
            achievements: [],
            skills: [],
            domainTags: [],
            peopleManagementScope: null,
            ownershipScope: null,
          },
        ],
        education: [],
        certifications: [],
        links: [],
        projects: [],
        spokenLanguages: [],
      },
      {
        targetRoles: ["Principal Designer"],
        jobFamilies: [],
        locations: ["Remote"],
        excludedLocations: [],
        workModes: ["remote"],
        seniorityLevels: [],
        targetIndustries: [],
        targetCompanyStages: [],
        employmentTypes: [],
        minimumSalaryUsd: null,
        targetSalaryUsd: null,
        salaryCurrency: "USD",
        compensation: {
          minimum: null,
          maximum: null,
          interval: "year",
          currency: null,
          currencyStatus: "needs_clarification",
        },
        approvalMode: "review_before_submit",
        tailoringMode: "balanced",
        companyBlacklist: [],
        companyWhitelist: [],
        discovery: { historyLimit: 5, targets: [] },
      },
      {
        currentState: {
          status: "completed",
          currentStep: "ready_check",
          completedAt: "2026-04-11T10:15:00.000Z",
          reviewItems: [
            {
              id: "review_1",
              step: "background",
              target: {
                domain: "experience",
                key: "record",
                recordId: "experience_2",
              },
              label: "Current role",
              reason: "Confirm the imported experience record.",
              severity: "critical",
              status: "pending",
              proposedValue: "Product lead",
              sourceSnippet: "Product lead at New Company",
              sourceCandidateId: null,
              sourceRunId: null,
              createdAt: "2026-04-11T10:20:00.000Z",
              resolvedAt: null,
            },
          ],
          lastResumedAt: null,
        },
        now: "2026-04-11T10:30:00.000Z",
      },
    );

    expect(state.status).toBe("in_progress");
    expect(state.currentStep).toBe("background");
    expect(state.completedAt).toBeNull();
  });

  test("parses the canonical fresh-start seed with no persisted placeholder facts", () => {
    const profile = createFreshStartCandidateProfile();

    expect(profile.id).toBe("candidate_fresh_start");
    expect(profile.firstName).toBeNull();
    expect(profile.lastName).toBeNull();
    expect(profile.fullName).toBeNull();
    expect(profile.headline).toBeNull();
    expect(profile.summary).toBeNull();
    expect(profile.currentLocation).toBeNull();

    // Legacy workspaces that already stored the instructional strings still
    // parse, and the shared detector recognizes them as placeholders.
    const legacy = CandidateProfileSchema.parse({
      ...profile,
      firstName: "New",
      lastName: "Candidate",
      fullName: "New Candidate",
      headline: "Import your resume to begin",
      summary:
        "Import a resume or paste resume text to build your profile, targeting, and tailored documents.",
      currentLocation: "Set your preferred location",
    });
    expect(legacy.fullName).toBe("New Candidate");
    expect(hasProfileSetupPlaceholderValue("fullName", legacy.fullName)).toBe(
      true,
    );
    expect(hasProfileSetupPlaceholderValue("headline", legacy.headline)).toBe(
      true,
    );
    expect(
      hasProfileSetupPlaceholderValue(
        "currentLocation",
        legacy.currentLocation,
      ),
    ).toBe(true);
    expect(hasProfileSetupPlaceholderValue("summary", legacy.summary)).toBe(
      true,
    );
    expect(hasProfileSetupPlaceholderValue("fullName", "Alex Vanguard")).toBe(
      false,
    );
  });

  test("reports a null-identity fresh start as not started with canonical blockers", () => {
    const readiness = evaluateProfileSetupReadiness(
      createFreshStartCandidateProfile(),
      blankSearchPreferencesFixture,
    );

    expect(readiness.freshStart).toBe(true);
    expect(readiness.hasCoreIdentity).toBe(false);
    expect(readiness.started).toBe(false);
    expect(readiness.materiallyComplete).toBe(false);
    expect(readiness.recommendedStep).toBe("import");
    expect(getProfileSetupReadinessBlockers(readiness)).toEqual([
      { id: "identity_contact", step: "essentials" },
      { id: "background", step: "background" },
      { id: "eligibility_preferences", step: "targeting" },
      { id: "work_mode_preference", step: "targeting" },
      { id: "discovery_source", step: "targeting" },
    ]);
  });

  test("keeps setup incomplete until the work-mode preference is chosen", () => {
    const preferencesWithoutWorkMode = {
      ...completeSearchPreferencesFixture,
      workModes: [],
    };
    const readinessWithoutWorkMode = evaluateProfileSetupReadiness(
      completeProfileFixture,
      preferencesWithoutWorkMode,
    );

    expect(readinessWithoutWorkMode.hasWorkModePreference).toBe(false);
    expect(readinessWithoutWorkMode.materiallyComplete).toBe(false);
    expect(
      getProfileSetupReadinessBlockers(readinessWithoutWorkMode).map(
        (blocker) => blocker.id,
      ),
    ).toEqual(["work_mode_preference"]);

    const stateWithoutWorkMode = deriveProfileSetupState(
      completeProfileFixture,
      preferencesWithoutWorkMode,
      { now: "2026-04-11T10:15:00.000Z" },
    );
    expect(stateWithoutWorkMode.status).not.toBe("completed");

    const readinessWithWorkMode = evaluateProfileSetupReadiness(
      completeProfileFixture,
      completeSearchPreferencesFixture,
    );
    expect(readinessWithWorkMode.hasWorkModePreference).toBe(true);
    expect(readinessWithWorkMode.materiallyComplete).toBe(true);
    expect(getProfileSetupReadinessBlockers(readinessWithWorkMode)).toEqual([]);
  });
});
