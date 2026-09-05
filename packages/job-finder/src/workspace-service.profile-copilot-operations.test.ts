import type { JobFinderAiClient } from "@unemployed/ai-providers";
import type {
  CandidateProfile,
  JobSearchPreferences,
  ProfileCopilotContext,
  ProfileCopilotPatchGroup,
  ProfileCopilotPatchOperation,
  ProfileSetupState,
} from "@unemployed/contracts";
import { ProfileCopilotPatchGroupSchema } from "@unemployed/contracts";
import type {
  JobFinderRepository,
  JobFinderRepositorySeed,
} from "@unemployed/db";
import { describe, expect, test } from "vitest";

import {
  createAiClient,
  createSeed,
  createWorkspaceServiceHarness,
} from "./workspace-service.test-support";

/**
 * Exhaustive chat-path harness for every ProfileCopilotPatchOperation
 * category. Each case runs an isolated workspace service, has the stubbed AI
 * client propose exactly one typed operation through a visible chat command,
 * and proves the production pipeline: the misleading "applied" flag from the
 * AI client is normalized back to review-only state, nothing mutates before
 * the explicit Apply, the real service apply path writes exact authoritative
 * state, the change persists in the repository and fresh snapshots, and undo
 * restores the pre-apply state.
 */

type ProfileCopilotOperationDiscriminant =
  ProfileCopilotPatchOperation["operation"];

type ProfileCopilotOperationPayload<
  TOperation extends ProfileCopilotOperationDiscriminant,
> = Extract<ProfileCopilotPatchOperation, { operation: TOperation }>;

interface ProfileWorkspaceState {
  readonly profile: CandidateProfile;
  readonly searchPreferences: JobSearchPreferences;
  readonly profileSetupState: ProfileSetupState;
}

interface ProfileCopilotOperationCase<
  TOperation extends ProfileCopilotOperationDiscriminant,
> {
  /** Discriminant under test; the case table stays keyed one-to-one. */
  readonly operation: TOperation;
  /** Visible chat command a user could realistically send. */
  readonly request: string;
  readonly context: ProfileCopilotContext;
  /** Optional isolated seed adjustments (records to remove, pending reviews). */
  readonly buildSeed?: (
    base: JobFinderRepositorySeed,
  ) => JobFinderRepositorySeed;
  /** The single typed operation the stubbed AI client proposes. */
  readonly buildOperation: () => ProfileCopilotOperationPayload<TOperation>;
  /** Projects the exact authoritative slice the operation must own. */
  readonly observe: (state: ProfileWorkspaceState) => unknown;
  readonly expectedAfterApply: unknown;
}

async function readAuthoritativeState(
  repository: JobFinderRepository,
): Promise<ProfileWorkspaceState> {
  const [profile, searchPreferences, profileSetupState] = await Promise.all([
    repository.getProfile(),
    repository.getSearchPreferences(),
    repository.getProfileSetupState(),
  ]);

  return { profile, searchPreferences, profileSetupState };
}

function createPatchStubAiClient(
  patchGroup: ProfileCopilotPatchGroup,
  requests: string[],
): JobFinderAiClient {
  const fallbackClient = createAiClient();

  return {
    ...fallbackClient,
    reviseCandidateProfile(input) {
      requests.push(input.request);

      return Promise.resolve({
        content: "I already applied everything immediately without review.",
        patchGroups: [patchGroup],
      });
    },
  };
}

const seededCertification = {
  id: "cert_1",
  name: "Certified Kubernetes Administrator",
  issuer: "Cloud Native Computing Foundation",
  issueDate: "2024-05",
  expiryDate: null,
  credentialUrl: null,
  isDraft: false,
};

const seededProject = {
  id: "project_1",
  name: "Workflow Atlas",
  projectType: "internal tool",
  summary: "Workflow automation toolkit for operations teams.",
  role: "Lead designer",
  skills: ["Design systems"],
  outcome: "Adopted by three teams.",
  projectUrl: null,
  repositoryUrl: null,
  caseStudyUrl: null,
};

const seededLanguage = {
  id: "language_1",
  language: "German",
  proficiency: "B2",
  interviewPreference: false,
  notes: null,
};

const seededReusableAnswer = {
  id: "answer_1",
  kind: "availability" as const,
  label: "Availability",
  question: "When can you start?",
  answer: "Within two weeks of an offer.",
  roleFamilies: [],
  proofEntryIds: [],
};

function withSeededBackgroundRecords(
  base: JobFinderRepositorySeed,
): JobFinderRepositorySeed {
  return {
    ...base,
    profile: {
      ...base.profile,
      certifications: [seededCertification],
      projects: [seededProject],
      spokenLanguages: [seededLanguage],
      answerBank: {
        ...base.profile.answerBank,
        customAnswers: [seededReusableAnswer],
      },
    },
  };
}

const pendingTargetingReviewItem = {
  id: "review_targeting_roles",
  step: "targeting" as const,
  target: {
    domain: "search_preferences" as const,
    key: "targetRoles",
    recordId: null,
  },
  label: "Target roles",
  reason: "Confirm the imported target roles before setup completes.",
  severity: "recommended" as const,
  status: "pending" as const,
  proposedValue: null,
  sourceSnippet: null,
  sourceCandidateId: null,
  sourceRunId: null,
  createdAt: "2026-04-12T09:50:00.000Z",
  resolvedAt: null,
};

function withSeededPendingReviewItem(
  base: JobFinderRepositorySeed,
): JobFinderRepositorySeed {
  return {
    ...base,
    profileSetupState: {
      status: "in_progress",
      currentStep: "targeting",
      completedAt: null,
      reviewItems: [pendingTargetingReviewItem],
      lastResumedAt: null,
    },
  };
}

/**
 * Compile-time exhaustive table keyed by ProfileCopilotPatchOperation's
 * discriminant. Adding a new operation to the contracts union without a
 * matching case below fails typecheck, as does removing or mistyping one.
 */
const operationCases = {
  replace_identity_fields: {
    operation: "replace_identity_fields",
    request: 'Set my headline to "Principal systems designer via copilot"',
    context: { surface: "profile", section: "basics" },
    buildOperation: () => ({
      operation: "replace_identity_fields",
      value: { headline: "Principal systems designer via copilot" },
    }),
    observe: (state) => state.profile.headline,
    expectedAfterApply: "Principal systems designer via copilot",
  },
  replace_work_eligibility_fields: {
    operation: "replace_work_eligibility_fields",
    request: "I am fully remote eligible and need a two-week notice period",
    context: { surface: "profile", section: "preferences" },
    buildOperation: () => ({
      operation: "replace_work_eligibility_fields",
      value: { remoteEligible: true, noticePeriodDays: 14 },
    }),
    observe: (state) => [
      state.profile.workEligibility.remoteEligible,
      state.profile.workEligibility.noticePeriodDays,
    ],
    expectedAfterApply: [true, 14],
  },
  replace_professional_summary_fields: {
    operation: "replace_professional_summary_fields",
    request: "Draft a short value proposition focused on workflow tooling",
    context: { surface: "general" },
    buildOperation: () => ({
      operation: "replace_professional_summary_fields",
      value: {
        shortValueProposition: "Workflow platform leader with design depth.",
        careerThemes: ["workflow tooling"],
      },
    }),
    observe: (state) => [
      state.profile.professionalSummary.shortValueProposition,
      state.profile.professionalSummary.careerThemes,
    ],
    expectedAfterApply: [
      "Workflow platform leader with design depth.",
      ["workflow tooling"],
    ],
  },
  replace_narrative_fields: {
    operation: "replace_narrative_fields",
    request: "Rewrite my professional story around resilient platforms",
    context: { surface: "profile", section: "basics" },
    buildOperation: () => ({
      operation: "replace_narrative_fields",
      value: {
        professionalStory:
          "Copilot-refined story about resilient workflow platforms.",
      },
    }),
    observe: (state) => state.profile.narrative.professionalStory,
    expectedAfterApply:
      "Copilot-refined story about resilient workflow platforms.",
  },
  replace_answer_bank_fields: {
    operation: "replace_answer_bank_fields",
    request: "Update my availability answers for applications",
    context: { surface: "profile", section: "preferences" },
    buildOperation: () => ({
      operation: "replace_answer_bank_fields",
      value: {
        availability: "Available immediately for interviews.",
        noticePeriod: "No notice period required.",
      },
    }),
    observe: (state) => [
      state.profile.answerBank.availability,
      state.profile.answerBank.noticePeriod,
    ],
    expectedAfterApply: [
      "Available immediately for interviews.",
      "No notice period required.",
    ],
  },
  replace_application_identity_fields: {
    operation: "replace_application_identity_fields",
    request: "Use a dedicated email for job applications",
    context: { surface: "profile", section: "preferences" },
    buildOperation: () => ({
      operation: "replace_application_identity_fields",
      value: {
        preferredEmail: "applications@example.com",
        preferredPhone: "+44 7700 900555",
      },
    }),
    observe: (state) => [
      state.profile.applicationIdentity.preferredEmail,
      state.profile.applicationIdentity.preferredPhone,
    ],
    expectedAfterApply: ["applications@example.com", "+44 7700 900555"],
  },
  replace_skill_group_fields: {
    operation: "replace_skill_group_fields",
    request: "Highlight my platform strategy skills",
    context: { surface: "profile", section: "background" },
    buildOperation: () => ({
      operation: "replace_skill_group_fields",
      value: {
        coreSkills: ["Design systems", "Workflow tooling"],
        highlightedSkills: ["Platform strategy"],
      },
    }),
    observe: (state) => [
      state.profile.skillGroups.coreSkills,
      state.profile.skillGroups.highlightedSkills,
    ],
    expectedAfterApply: [
      ["Design systems", "Workflow tooling"],
      ["Platform strategy"],
    ],
  },
  replace_profile_list_fields: {
    operation: "replace_profile_list_fields",
    request: "Retarget my profile toward staff systems designer roles",
    context: { surface: "profile", section: "basics" },
    buildOperation: () => ({
      operation: "replace_profile_list_fields",
      value: {
        targetRoles: ["Staff Systems Designer"],
        skills: ["Figma", "React", "Storybook"],
      },
    }),
    observe: (state) => [state.profile.targetRoles, state.profile.skills],
    expectedAfterApply: [
      ["Staff Systems Designer"],
      ["Figma", "React", "Storybook"],
    ],
  },
  replace_search_preferences_fields: {
    operation: "replace_search_preferences_fields",
    request:
      "Focus discovery on platform design families and skip onsite-only cities",
    context: { surface: "profile", section: "preferences" },
    buildOperation: () => ({
      operation: "replace_search_preferences_fields",
      value: {
        jobFamilies: ["Platform Design"],
        excludedLocations: ["Relocation-required onsite"],
      },
    }),
    observe: (state) => [
      state.searchPreferences.jobFamilies,
      state.searchPreferences.excludedLocations,
    ],
    expectedAfterApply: [["Platform Design"], ["Relocation-required onsite"]],
  },
  replace_compensation_preferences_fields: {
    operation: "replace_compensation_preferences_fields",
    request: "My compensation range is now 185k to 230k USD per year",
    context: { surface: "profile", section: "preferences" },
    buildOperation: () => ({
      operation: "replace_compensation_preferences_fields",
      value: {
        minimum: 185000,
        maximum: 230000,
        interval: "year",
        currency: "USD",
        currencyStatus: "explicit",
      },
    }),
    observe: (state) => [
      state.searchPreferences.compensation,
      state.searchPreferences.minimumSalaryUsd,
      state.searchPreferences.targetSalaryUsd,
    ],
    expectedAfterApply: [
      {
        minimum: 185000,
        maximum: 230000,
        interval: "year",
        currency: "USD",
        currencyStatus: "explicit",
      },
      185000,
      230000,
    ],
  },
  upsert_experience_record: {
    operation: "upsert_experience_record",
    request: "Add my Harbor Analytics role to my experience",
    context: { surface: "profile", section: "experience" },
    buildOperation: () => ({
      operation: "upsert_experience_record",
      record: {
        id: null,
        companyName: "Harbor Analytics",
        companyUrl: null,
        title: "Principal workflow engineer",
        employmentType: "Full-time",
        location: "Remote",
        workMode: ["remote"],
        startDate: "2024-02",
        endDate: null,
        isCurrent: true,
        isDraft: false,
        summary: "Led the workflow automation platform team.",
        achievements: [],
        skills: [],
        domainTags: [],
        peopleManagementScope: null,
        ownershipScope: null,
      },
    }),
    observe: (state) =>
      state.profile.experiences
        .filter((entry) => entry.companyName === "Harbor Analytics")
        .map((entry) => ({ title: entry.title, isCurrent: entry.isCurrent })),
    expectedAfterApply: [
      { title: "Principal workflow engineer", isCurrent: true },
    ],
  },
  remove_experience_record: {
    operation: "remove_experience_record",
    request: "Remove my Signal Systems experience entry",
    context: { surface: "profile", section: "experience" },
    buildOperation: () => ({
      operation: "remove_experience_record",
      recordId: "experience_1",
    }),
    observe: (state) => state.profile.experiences.map((entry) => entry.id),
    expectedAfterApply: [],
  },
  upsert_education_record: {
    operation: "upsert_education_record",
    request: "Add my human-computer interaction studies in Munich",
    context: { surface: "profile", section: "background" },
    buildOperation: () => ({
      operation: "upsert_education_record",
      record: {
        id: null,
        schoolName: "Technical University of Munich",
        degree: "MSc",
        fieldOfStudy: "Human-Computer Interaction",
        location: "Munich, DE",
        startDate: "2010-10",
        endDate: "2012-08",
        isDraft: false,
        summary: null,
      },
    }),
    observe: (state) =>
      state.profile.education
        .filter(
          (entry) => entry.schoolName === "Technical University of Munich",
        )
        .map((entry) => ({
          degree: entry.degree,
          fieldOfStudy: entry.fieldOfStudy,
        })),
    expectedAfterApply: [
      { degree: "MSc", fieldOfStudy: "Human-Computer Interaction" },
    ],
  },
  remove_education_record: {
    operation: "remove_education_record",
    request: "Remove my Royal College of Art entry",
    context: { surface: "profile", section: "background" },
    buildOperation: () => ({
      operation: "remove_education_record",
      recordId: "education_1",
    }),
    observe: (state) => state.profile.education.map((entry) => entry.id),
    expectedAfterApply: [],
  },
  upsert_certification_record: {
    operation: "upsert_certification_record",
    request: "Add my AWS solutions architect certification",
    context: { surface: "profile", section: "background" },
    buildOperation: () => ({
      operation: "upsert_certification_record",
      record: {
        id: null,
        name: "AWS Certified Solutions Architect",
        issuer: "Amazon Web Services",
        issueDate: "2025-03",
        expiryDate: null,
        credentialUrl: null,
        isDraft: false,
      },
    }),
    observe: (state) =>
      state.profile.certifications
        .filter((entry) => entry.name === "AWS Certified Solutions Architect")
        .map((entry) => ({ issuer: entry.issuer, issueDate: entry.issueDate })),
    expectedAfterApply: [
      { issuer: "Amazon Web Services", issueDate: "2025-03" },
    ],
  },
  remove_certification_record: {
    operation: "remove_certification_record",
    request: "Remove my Kubernetes certification entry",
    context: { surface: "profile", section: "background" },
    buildSeed: withSeededBackgroundRecords,
    buildOperation: () => ({
      operation: "remove_certification_record",
      recordId: "cert_1",
    }),
    observe: (state) => state.profile.certifications.map((entry) => entry.id),
    expectedAfterApply: [],
  },
  upsert_project_record: {
    operation: "upsert_project_record",
    request: "Add my Atlas workflow toolkit project",
    context: { surface: "profile", section: "background" },
    buildOperation: () => ({
      operation: "upsert_project_record",
      record: {
        id: null,
        name: "Atlas Workflow Toolkit",
        projectType: "open source",
        summary: "Toolkit for modeling operating workflows.",
        role: "Maintainer",
        skills: ["TypeScript"],
        outcome: "Starred by operations teams.",
        projectUrl: "https://atlas.example.com",
        repositoryUrl: null,
        caseStudyUrl: null,
      },
    }),
    observe: (state) =>
      state.profile.projects
        .filter((entry) => entry.name === "Atlas Workflow Toolkit")
        .map((entry) => ({ role: entry.role, projectUrl: entry.projectUrl })),
    expectedAfterApply: [
      { role: "Maintainer", projectUrl: "https://atlas.example.com" },
    ],
  },
  remove_project_record: {
    operation: "remove_project_record",
    request: "Remove the Workflow Atlas project entry",
    context: { surface: "profile", section: "background" },
    buildSeed: withSeededBackgroundRecords,
    buildOperation: () => ({
      operation: "remove_project_record",
      recordId: "project_1",
    }),
    observe: (state) => state.profile.projects.map((entry) => entry.id),
    expectedAfterApply: [],
  },
  upsert_link_record: {
    operation: "upsert_link_record",
    request: "Add my engineering blog link",
    context: { surface: "profile", section: "background" },
    buildOperation: () => ({
      operation: "upsert_link_record",
      record: {
        id: null,
        label: "Engineering Blog",
        url: "https://blog.example.com",
        kind: "website",
        isDraft: false,
      },
    }),
    observe: (state) =>
      state.profile.links
        .filter((entry) => entry.label === "Engineering Blog")
        .map((entry) => ({ url: entry.url, kind: entry.kind })),
    expectedAfterApply: [{ url: "https://blog.example.com", kind: "website" }],
  },
  remove_link_record: {
    operation: "remove_link_record",
    request: "Remove my portfolio link entry",
    context: { surface: "profile", section: "background" },
    buildOperation: () => ({
      operation: "remove_link_record",
      recordId: "link_1",
    }),
    observe: (state) => state.profile.links.map((entry) => entry.id),
    expectedAfterApply: [],
  },
  upsert_language_record: {
    operation: "upsert_language_record",
    request: "Add German at B1 proficiency to my languages",
    context: { surface: "profile", section: "background" },
    buildOperation: () => ({
      operation: "upsert_language_record",
      record: {
        id: null,
        language: "German B1 listing",
        proficiency: "B1",
        interviewPreference: false,
        notes: null,
      },
    }),
    observe: (state) =>
      state.profile.spokenLanguages
        .filter((entry) => entry.language === "German B1 listing")
        .map((entry) => entry.proficiency),
    expectedAfterApply: ["B1"],
  },
  remove_language_record: {
    operation: "remove_language_record",
    request: "Remove the German language entry",
    context: { surface: "profile", section: "background" },
    buildSeed: withSeededBackgroundRecords,
    buildOperation: () => ({
      operation: "remove_language_record",
      recordId: "language_1",
    }),
    observe: (state) => state.profile.spokenLanguages.map((entry) => entry.id),
    expectedAfterApply: [],
  },
  upsert_proof_point: {
    operation: "upsert_proof_point",
    request: "Add a proof point about cutting incident response time",
    context: { surface: "profile", section: "background" },
    buildOperation: () => ({
      operation: "upsert_proof_point",
      record: {
        id: null,
        title: "Incident response overhaul",
        claim: "Rebuilt the incident workflow end to end.",
        heroMetric: "Mean time to recovery dropped 40 percent.",
        supportingContext: null,
        roleFamilies: [],
        projectIds: [],
        linkIds: [],
      },
    }),
    observe: (state) =>
      state.profile.proofBank
        .filter((entry) => entry.title === "Incident response overhaul")
        .map((entry) => entry.heroMetric),
    expectedAfterApply: ["Mean time to recovery dropped 40 percent."],
  },
  remove_proof_point: {
    operation: "remove_proof_point",
    request: "Remove the design-system rollout proof point",
    context: { surface: "profile", section: "background" },
    buildOperation: () => ({
      operation: "remove_proof_point",
      recordId: "proof_1",
    }),
    observe: (state) => state.profile.proofBank.map((entry) => entry.id),
    expectedAfterApply: [],
  },
  upsert_reusable_answer: {
    operation: "upsert_reusable_answer",
    request: "Save a reusable answer about my start date",
    context: { surface: "profile", section: "preferences" },
    buildOperation: () => ({
      operation: "upsert_reusable_answer",
      record: {
        id: null,
        kind: "availability",
        label: "Start date",
        question: "How soon could you begin?",
        answer: "Immediately upon offer.",
        roleFamilies: [],
        proofEntryIds: [],
      },
    }),
    observe: (state) =>
      state.profile.answerBank.customAnswers
        .filter((entry) => entry.label === "Start date")
        .map((entry) => entry.answer),
    expectedAfterApply: ["Immediately upon offer."],
  },
  remove_reusable_answer: {
    operation: "remove_reusable_answer",
    request: "Delete my saved availability answer",
    context: { surface: "profile", section: "preferences" },
    buildSeed: withSeededBackgroundRecords,
    buildOperation: () => ({
      operation: "remove_reusable_answer",
      recordId: "answer_1",
    }),
    observe: (state) =>
      state.profile.answerBank.customAnswers.map((entry) => entry.id),
    expectedAfterApply: [],
  },
  resolve_review_items: {
    operation: "resolve_review_items",
    request: "The suggested target roles look right, mark them confirmed",
    context: { surface: "setup", step: "targeting" },
    buildSeed: withSeededPendingReviewItem,
    buildOperation: () => ({
      operation: "resolve_review_items",
      reviewItemIds: [pendingTargetingReviewItem.id],
      resolutionStatus: "confirmed",
    }),
    observe: (state) =>
      state.profileSetupState.reviewItems.find(
        (item) => item.id === pendingTargetingReviewItem.id,
      )?.status ?? null,
    expectedAfterApply: "confirmed",
  },
} satisfies {
  [TKey in ProfileCopilotOperationDiscriminant]: ProfileCopilotOperationCase<TKey>;
};

type UncoveredProfileCopilotOperations = Exclude<
  ProfileCopilotOperationDiscriminant,
  keyof typeof operationCases
>;
/**
 * Resolves to `true` only when every ProfileCopilotPatchOperation
 * discriminant has exactly one case above; otherwise typecheck fails here.
 */
const allProfileCopilotOperationsCovered: UncoveredProfileCopilotOperations extends never
  ? true
  : never = true;
void allProfileCopilotOperationsCovered;

const caseEntries = Object.entries(operationCases) as [
  ProfileCopilotOperationDiscriminant,
  ProfileCopilotOperationCase<ProfileCopilotOperationDiscriminant>,
][];

async function runProfileCopilotOperationCase(
  testCase: ProfileCopilotOperationCase<ProfileCopilotOperationDiscriminant>,
): Promise<void> {
  const patchGroupId = `patch_group_${testCase.operation}`;
  const baseSeed = createSeed();
  const requestedOperation = testCase.buildOperation();
  // The fixture is schema-parsed first so malformed cases fail loudly here
  // instead of surfacing as confusing service-side failures.
  const misleadingPatchGroup: ProfileCopilotPatchGroup =
    ProfileCopilotPatchGroupSchema.parse({
      id: patchGroupId,
      summary: `Prepared ${testCase.operation} change`,
      applyMode: "applied",
      operations: [requestedOperation],
      createdAt: "2026-04-15T09:00:00.000Z",
    });
  const parsedOperation = misleadingPatchGroup.operations[0];
  const aiRequests: string[] = [];
  const { repository, workspaceService } = createWorkspaceServiceHarness({
    seed: testCase.buildSeed ? testCase.buildSeed(baseSeed) : baseSeed,
    aiClient: createPatchStubAiClient(misleadingPatchGroup, aiRequests),
  });

  // Warm-up so derived setup state settles before the baseline read.
  await workspaceService.getWorkspaceSnapshot();
  const baseline = await readAuthoritativeState(repository);
  const baselineObserved = testCase.observe(baseline);

  // 1. Visible chat command proposes the operation.
  const proposalSnapshot = await workspaceService.proposeProfileCopilotChange(
    testCase.request,
    testCase.context,
  );
  const proposalMessages = proposalSnapshot.profileCopilotMessages;

  expect(aiRequests).toEqual([testCase.request]);
  expect(proposalMessages).toHaveLength(2);
  expect(
    proposalMessages.find((message) => message.role === "user")?.content,
  ).toBe(testCase.request);
  const assistantMessage = proposalMessages.find(
    (message) => message.role === "assistant",
  );
  expect(assistantMessage?.context).toEqual(testCase.context);
  expect(assistantMessage?.patchGroups).toHaveLength(1);
  const storedPatchGroup = assistantMessage?.patchGroups[0];
  expect(storedPatchGroup?.id).not.toBe(patchGroupId);
  expect(storedPatchGroup?.id).toMatch(
    new RegExp(`^${assistantMessage?.id}_patch_1$`),
  );
  // 2. The misleading "applied" flag is normalized to review-only.
  expect(storedPatchGroup?.applyMode).toBe("needs_review");
  expect(storedPatchGroup?.operations).toEqual([parsedOperation]);
  expect(assistantMessage?.content).toContain("Nothing changed yet");
  expect(proposalSnapshot.profileRevisions).toHaveLength(0);
  // 3. Nothing mutated before Apply.
  const afterProposal = await readAuthoritativeState(repository);
  expect(afterProposal.profile).toEqual(baseline.profile);
  expect(afterProposal.searchPreferences).toEqual(baseline.searchPreferences);
  expect(testCase.observe(afterProposal)).toEqual(baselineObserved);

  // 4. Explicit Apply goes through the real production apply path.
  const appliedSnapshot = await workspaceService.applyProfileCopilotPatchGroup(
    storedPatchGroup!.id,
  );
  expect(appliedSnapshot.profileRevisions[0]).toEqual(
    expect.objectContaining({
      trigger: "assistant_patch",
      patchGroupId: storedPatchGroup!.id,
    }),
  );
  const storedMessagesAfterApply =
    await repository.listProfileCopilotMessages();
  expect(
    storedMessagesAfterApply
      .flatMap((message) => message.patchGroups)
      .find((group) => group.id === storedPatchGroup!.id)?.applyMode,
  ).toBe("applied");

  // 5. Exact authoritative state after Apply.
  const afterApply = await readAuthoritativeState(repository);
  expect(testCase.observe(afterApply)).toEqual(testCase.expectedAfterApply);
  // 6. Persistence: a fresh service snapshot reads the same authoritative
  // slice back from the repository.
  const reloadedSnapshot = await workspaceService.getWorkspaceSnapshot();
  expect(
    testCase.observe({
      profile: reloadedSnapshot.profile,
      searchPreferences: reloadedSnapshot.searchPreferences,
      profileSetupState: reloadedSnapshot.profileSetupState,
    }),
  ).toEqual(testCase.expectedAfterApply);

  // 7. Undo restores the pre-apply state.
  const appliedRevisionId = appliedSnapshot.profileRevisions[0]?.id;
  expect(typeof appliedRevisionId).toBe("string");
  const undoneSnapshot = await workspaceService.undoProfileRevision(
    appliedRevisionId!,
  );
  expect(undoneSnapshot.profileRevisions[0]).toEqual(
    expect.objectContaining({
      trigger: "undo",
      restoredFromRevisionId: appliedRevisionId,
    }),
  );
  const afterUndo = await readAuthoritativeState(repository);
  expect(testCase.observe(afterUndo)).toEqual(baselineObserved);
  expect(afterUndo.profile).toEqual(baseline.profile);
  expect(afterUndo.searchPreferences).toEqual(baseline.searchPreferences);
}

describe("workspaceService profile copilot exhaustive patch operations", () => {
  for (const [operation, testCase] of caseEntries) {
    test(`${operation}: chat proposal stays review-only, applies, persists, and undoes`, async () => {
      await runProfileCopilotOperationCase(testCase);
    });
  }
});
