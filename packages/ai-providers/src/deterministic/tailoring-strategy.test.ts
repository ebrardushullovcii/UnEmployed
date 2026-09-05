import { describe, expect, test } from "vitest";
import { ResumeGenerationStrategyPolicySchema } from "../shared";
import {
  createJobPosting,
  createPreferences,
  createProfile,
  createSettings,
} from "../test-fixtures";
import { buildDeterministicTailoredResume } from "./tailoring";

function createStrategy(
  overrides: Partial<{
    headlinePolicy: "fixed" | "role_family_template" | "per_job_tailored";
    skillsPolicy: "base_only" | "role_family_expanded" | "per_job_tailored";
    coveragePolicy:
      | "base_omissions"
      | "role_family_recommended"
      | "full_tailoring";
  }> = {},
) {
  return ResumeGenerationStrategyPolicySchema.parse({
    strategyId: "strategy_frontend",
    strategyName: "Frontend platform",
    roleFamily: "Frontend Platform Engineering",
    baseResumeDocumentId: "resume_1",
    templateId: "classic_ats",
    headlinePolicy: "fixed",
    skillsPolicy: "base_only",
    coveragePolicy: "base_omissions",
    tailoringStrength: "balanced",
    evidenceBoundaries: {},
    effectiveSource: "selection",
    effectiveReason: "Selected for the target role family.",
    recommendationSource: "role_family",
    recommendationReason: "The role matches the selected family.",
    selectionSource: "user",
    selectionReason: "User selected this strategy.",
    ...overrides,
  });
}

describe("deterministic resume strategy policy", () => {
  test("changes headline, skills, and coverage instead of only annotating the draft", () => {
    const baseProfile = createProfile();
    const profile = {
      ...baseProfile,
      headline: "Workflow engineer",
      skills: ["React"],
      skillGroups: {
        ...baseProfile.skillGroups,
        coreSkills: ["TypeScript"],
        tools: ["Figma"],
      },
      experiences: [
        {
          id: "experience_current",
          companyName: "Current Systems",
          companyUrl: null,
          title: "Frontend Engineer",
          employmentType: "Full-time",
          location: "Remote",
          workMode: ["remote" as const],
          startDate: "2023-01",
          endDate: null,
          isCurrent: true,
          isDraft: false,
          summary: "Builds frontend platform systems.",
          achievements: ["Led React platform improvements."],
          skills: ["React", "TypeScript"],
          domainTags: [],
          peopleManagementScope: null,
          ownershipScope: null,
        },
        {
          id: "experience_older",
          companyName: "Earlier Systems",
          companyUrl: null,
          title: "Frontend Engineer",
          employmentType: "Full-time",
          location: "Remote",
          workMode: ["remote" as const],
          startDate: "2020-01",
          endDate: "2022-12",
          isCurrent: false,
          isDraft: false,
          summary: "Built frontend workflow tools.",
          achievements: ["Delivered React workflow improvements."],
          skills: ["React"],
          domainTags: [],
          peopleManagementScope: null,
          ownershipScope: null,
        },
      ],
    };
    const job = {
      ...createJobPosting(),
      title: "Frontend Engineer",
      keySkills: ["React", "TypeScript"],
    };
    const input = {
      profile,
      searchPreferences: createPreferences(),
      settings: createSettings(),
      job,
      resumeText: profile.baseResume.textContent,
    };

    const baseline = buildDeterministicTailoredResume(input);
    const strategyDraft = buildDeterministicTailoredResume({
      ...input,
      strategy: createStrategy({
        headlinePolicy: "role_family_template",
        skillsPolicy: "role_family_expanded",
        coveragePolicy: "base_omissions",
      }),
    });

    expect(
      baseline.experienceEntries.map((entry) => entry.profileRecordId),
    ).toEqual(expect.arrayContaining(["experience_older"]));
    expect(strategyDraft.fullText).toContain("Frontend Platform Engineering");
    expect(strategyDraft.coreSkills).toEqual(
      expect.arrayContaining(["React", "TypeScript", "Figma"]),
    );
    expect(
      strategyDraft.experienceEntries.map((entry) => entry.profileRecordId),
    ).not.toContain("experience_older");
    expect(strategyDraft.notes).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Applied resume strategy "Frontend platform"'),
      ]),
    );
  });

  test("uses selected base resume content as a bounded deterministic skill source", () => {
    const profile = createProfile();
    const input = {
      profile: {
        ...profile,
        skills: [],
        skillGroups: {
          ...profile.skillGroups,
          coreSkills: [],
          tools: [],
          languagesAndFrameworks: [],
          highlightedSkills: [],
        },
      },
      searchPreferences: createPreferences(),
      settings: createSettings(),
      job: {
        ...createJobPosting(),
        keySkills: ["Vue", "Svelte"],
      },
      strategy: createStrategy({
        skillsPolicy: "per_job_tailored",
      }),
    };

    const vueDraft = buildDeterministicTailoredResume({
      ...input,
      resumeText: "Alex Vanguard\nSkills\nVue",
    });
    const svelteDraft = buildDeterministicTailoredResume({
      ...input,
      resumeText: "Alex Vanguard\nSkills\nSvelte",
    });

    expect(vueDraft.coreSkills).toContain("Vue");
    expect(vueDraft.coreSkills).not.toContain("Svelte");
    expect(svelteDraft.coreSkills).toContain("Svelte");
    expect(svelteDraft.coreSkills).not.toContain("Vue");
  });
});
