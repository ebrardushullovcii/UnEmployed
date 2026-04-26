import { describe, expect, test } from "vitest";
import {
  buildDeterministicStructuredResumeDraft,
  completeTailoredResumeDraft,
} from "./index";
import {
  createJobPosting,
  createPreferences,
  createProfile,
  createSettings,
} from "./test-fixtures";

describe("resume generation quality", () => {
  test("keeps visible skills grounded to the candidate instead of job-only terms", () => {
    const baseProfile = createProfile();
    const profile = {
      ...baseProfile,
      skills: ["React", "TypeScript"],
      skillGroups: {
        ...baseProfile.skillGroups,
        tools: ["Figma"],
      },
    };
    const input = {
      profile,
      searchPreferences: createPreferences(),
      settings: createSettings(),
      job: {
        ...createJobPosting(),
        company: "Northwind Labs",
        keySkills: ["React", "Northwind Labs", "Greenhouse", "Remote-first collaboration"],
        benefits: ["Remote-first collaboration"],
        atsProvider: "Greenhouse",
      },
      resumeText: profile.baseResume.textContent,
      evidence: {
        summary: [],
        candidateSummary: [],
        experience: [],
        skills: ["React", "Northwind Labs", "Greenhouse"],
        keywords: ["React", "Greenhouse"],
      },
      researchContext: {
        companyNotes: ["Northwind Labs builds internal tooling for design teams."],
        domainVocabulary: ["workflow systems"],
        priorityThemes: ["platform ownership"],
      },
    };

    const result = buildDeterministicStructuredResumeDraft(input);

    expect(result.coreSkills).toEqual(["React", "TypeScript"]);
    expect(result.additionalSkills).toEqual(["Figma"]);
    expect(result.targetedKeywords).toEqual(
      expect.arrayContaining(["React", "Greenhouse", "workflow systems"]),
    );
    expect(result.coreSkills).not.toEqual(
      expect.arrayContaining(["Northwind Labs", "Greenhouse"]),
    );
    expect(result.additionalSkills).not.toEqual(
      expect.arrayContaining(["Northwind Labs", "Remote-first collaboration"]),
    );
  });

  test("does not fall back to employer research prose for the candidate summary", () => {
    const baseProfile = createProfile();
    const profile = {
      ...baseProfile,
      headline: "Staff Frontend Engineer",
      yearsExperience: 9,
      professionalSummary: {
        ...baseProfile.professionalSummary,
        fullSummary: null,
      },
    };
    const input = {
      profile,
      searchPreferences: createPreferences(),
      settings: createSettings(),
      job: {
        ...createJobPosting(),
        title: "Staff Frontend Engineer",
        company: "Acme Cloud",
        keySkills: ["React", "TypeScript"],
      },
      resumeText: profile.baseResume.textContent,
      evidence: {
        summary: [],
        candidateSummary: [],
        experience: [],
        skills: ["React"],
        keywords: ["React"],
      },
      researchContext: {
        companyNotes: ["Acme Cloud is redefining enterprise workflow orchestration for distributed teams."],
        domainVocabulary: ["workflow orchestration"],
        priorityThemes: ["enterprise platform"],
      },
    };

    const result = buildDeterministicStructuredResumeDraft(input);

    expect(result.summary).not.toContain("Acme Cloud is redefining enterprise workflow orchestration");
    expect(result.summary).toContain("Staff Frontend Engineer");
  });

  test("does not surface raw experience evidence as visible experience bullets", () => {
    const baseProfile = createProfile();
    const profile: typeof baseProfile = {
      ...baseProfile,
      experiences: [
        {
          id: "experience_signal_systems",
          companyName: "Signal Systems",
          companyUrl: null,
          title: "Senior Frontend Engineer",
          employmentType: null,
          location: "Remote",
          workMode: ["remote"],
          startDate: "2022-01",
          endDate: null,
          isCurrent: true,
          isDraft: false,
          summary: "Led frontend delivery for workflow tooling.",
          achievements: ["Shipped recruiter-safe resume workflows."],
          skills: ["React"],
          domainTags: [],
          peopleManagementScope: null,
          ownershipScope: null,
        },
      ],
    };
    const rawEvidenceLine =
      "Signal Systems | Senior Frontend Engineer | Built resume tooling from raw imported evidence blobs and copied employer notes.";
    const input: Parameters<typeof buildDeterministicStructuredResumeDraft>[0] = {
      profile,
      searchPreferences: createPreferences(),
      settings: createSettings(),
      job: {
        ...createJobPosting(),
        title: "Senior Frontend Engineer",
        company: "Northwind Labs",
      },
      resumeText: profile.baseResume.textContent,
      evidence: {
        summary: [],
        candidateSummary: [],
        experience: [rawEvidenceLine],
        skills: ["React"],
        keywords: ["React"],
      },
      researchContext: {
        companyNotes: ["Northwind Labs is hiring for workflow tooling."],
        domainVocabulary: ["workflow tooling"],
        priorityThemes: ["frontend platform"],
      },
    };

    const result = buildDeterministicStructuredResumeDraft(input);

    expect(result.experienceHighlights).not.toContain(rawEvidenceLine);
    expect(result.fullText).not.toContain(rawEvidenceLine);
    expect(result.experienceEntries[0]?.summary).toBe(
      "Led frontend delivery for workflow tooling.",
    );
    expect(result.experienceEntries[0]?.bullets).toContain(
      "Shipped recruiter-safe resume workflows.",
    );
  });

  test("prefers stronger candidate summary evidence and avoids project skill-tag bullets", () => {
    const baseProfile = createProfile();
    const profile: typeof baseProfile = {
      ...baseProfile,
      headline: "Senior systems designer",
      summary: "Builds resilient workflow systems and design tooling.",
      professionalSummary: {
        ...baseProfile.professionalSummary,
        shortValueProposition: "Systems-focused product designer for workflow platforms.",
        fullSummary:
          "Systems-focused product designer with 10 years of experience building workflow tools, design systems, and platform operating models.",
      },
      projects: [
        {
          id: "project_workflow_os",
          name: "Workflow OS",
          projectType: "product",
          summary: "Scaled an internal design system.",
          role: "Design lead",
          skills: ["Figma", "Design Systems", "Accessibility"],
          outcome: "Reduced release churn for operations teams.",
          projectUrl: null,
          repositoryUrl: null,
          caseStudyUrl: null,
        },
      ],
    };
    const input: Parameters<typeof buildDeterministicStructuredResumeDraft>[0] = {
      profile,
      searchPreferences: createPreferences(),
      settings: createSettings(),
      job: {
        ...createJobPosting(),
        title: "Senior Product Designer",
        keySkills: ["Figma", "Design Systems", "Accessibility"],
      },
      resumeText: profile.baseResume.textContent,
      evidence: {
        summary: [],
        candidateSummary: [],
        experience: [],
        skills: ["Figma"],
        keywords: ["Figma", "Design Systems"],
      },
      researchContext: {
        companyNotes: [],
        domainVocabulary: ["workflow platforms"],
        priorityThemes: ["design systems"],
      },
    };

    const result = buildDeterministicStructuredResumeDraft(input);

    expect(result.summary).toBe(
      "Systems-focused product designer with 10 years of experience building workflow tools, design systems, and platform operating models.",
    );
    expect(result.projectEntries[0]?.bullets).toEqual([]);
    expect(result.fullText).not.toContain("- Figma");
    expect(result.fullText).toContain(
      "Scaled an internal design system. Reduced release churn for operations teams.",
    );
  });

  test("enriches overlapping experience bullets with grounded proof metrics", () => {
    const baseProfile = createProfile();
    const profile: typeof baseProfile = {
      ...baseProfile,
      proofBank: [
        {
          id: "proof_design_system_rollout",
          title: "Design-system rollout",
          claim:
            "Led design-system rollout across core product surfaces used by design and operations teams.",
          heroMetric:
            "Adoption reached 80% of core product surfaces within two quarters.",
          supportingContext:
            "Worked across product, engineering, and operations to standardize component and content patterns.",
          roleFamilies: ["product design", "design systems"],
          projectIds: [],
          linkIds: [],
        },
      ],
      experiences: [
        {
          id: "experience_orbit",
          companyName: "Orbit Commerce",
          companyUrl: null,
          title: "Senior systems designer",
          employmentType: "Full-time",
          location: "London, UK",
          workMode: ["hybrid"],
          startDate: "2020-01",
          endDate: null,
          isCurrent: true,
          isDraft: false,
          summary: "Builds resilient workflow tools.",
          achievements: ["Led design-system rollout across core surfaces."],
          skills: ["Figma", "Design Systems"],
          domainTags: [],
          peopleManagementScope: null,
          ownershipScope: null,
        },
      ],
    };
    const input: Parameters<typeof buildDeterministicStructuredResumeDraft>[0] = {
      profile,
      searchPreferences: createPreferences(),
      settings: createSettings(),
      job: {
        ...createJobPosting(),
        title: "Senior Product Designer",
        keySkills: ["Figma", "Design Systems"],
      },
      resumeText: profile.baseResume.textContent,
      evidence: {
        summary: [],
        candidateSummary: [],
        experience: [],
        skills: ["Figma"],
        keywords: ["Figma"],
      },
      researchContext: {
        companyNotes: [],
        domainVocabulary: [],
        priorityThemes: [],
      },
    };

    const result = buildDeterministicStructuredResumeDraft(input);

    expect(result.experienceEntries[0]?.bullets[0]).toBe(
      "Led design-system rollout across core product surfaces used by design and operations teams. Adoption reached 80% of core product surfaces within two quarters.",
    );
  });

  test("adds grounded proof supporting context when it strengthens flat experience bullets", () => {
    const baseProfile = createProfile();
    const profile: typeof baseProfile = {
      ...baseProfile,
      proofBank: [
        {
          id: "proof_frontend_platform_context",
          title: "Frontend platform consolidation",
          claim:
            "Unified fragmented frontend foundations across product teams into a shared platform adoption program.",
          heroMetric:
            "Cut release regressions by 42% across three product lines in two quarters.",
          supportingContext:
            "Partnered with product, design, and platform engineering to standardize components, testing, and performance budgets.",
          roleFamilies: ["frontend engineering", "platform"],
          projectIds: [],
          linkIds: [],
        },
      ],
      experiences: [
        {
          id: "experience_frontend_platform",
          companyName: "Northstar Cloud",
          companyUrl: null,
          title: "Staff frontend engineer",
          employmentType: "Full-time",
          location: "Toronto, Canada",
          workMode: ["remote"],
          startDate: "2021-03",
          endDate: null,
          isCurrent: true,
          isDraft: false,
          summary: "Leads frontend platform modernization across product teams.",
          achievements: [
            "Unified fragmented frontend foundations across product teams into a shared platform adoption program.",
            "Improved accessibility review coverage across customer-facing releases.",
          ],
          skills: ["React", "TypeScript", "Design Systems", "Playwright"],
          domainTags: ["frontend platform"],
          peopleManagementScope: null,
          ownershipScope: null,
        },
      ],
    };
    const input: Parameters<typeof buildDeterministicStructuredResumeDraft>[0] = {
      profile,
      searchPreferences: createPreferences(),
      settings: createSettings(),
      job: {
        ...createJobPosting(),
        title: "Staff Frontend Engineer",
        keySkills: ["React", "TypeScript", "Accessibility", "Performance"],
      },
      resumeText: profile.baseResume.textContent,
      evidence: {
        summary: [],
        candidateSummary: [],
        experience: [],
        skills: ["React", "TypeScript"],
        keywords: ["React", "TypeScript"],
      },
      researchContext: {
        companyNotes: [],
        domainVocabulary: [],
        priorityThemes: [],
      },
    };

    const result = buildDeterministicStructuredResumeDraft(input);

    expect(result.experienceEntries[0]?.bullets).toEqual([
      "Unified fragmented frontend foundations across product teams into a shared platform adoption program. Cut release regressions by 42% across three product lines in two quarters.",
      "Improved accessibility review coverage across customer-facing releases.",
      "Partnered with product, design, and platform engineering to standardize components, testing, and performance budgets.",
    ]);
    expect(result.experienceEntries[0]?.dateRange).toBe("Mar 2021 – Present");
    expect(result.fullText).toContain("Toronto, Canada | Mar 2021 – Present");
    expect(result.fullText).not.toContain("2021-03 – Present");
  });

  test("filters model-supplied job and company terms out of visible skills", () => {
    const baseProfile = createProfile();
    const profile = {
      ...baseProfile,
      skills: ["React", "TypeScript"],
      skillGroups: {
        ...baseProfile.skillGroups,
        tools: ["Playwright"],
      },
    };
    const fallbackInput = {
      profile,
      searchPreferences: createPreferences(),
      settings: createSettings(),
      job: {
        ...createJobPosting(),
        company: "Contoso",
        keySkills: ["React", "Contoso", "Greenhouse"],
        atsProvider: "Greenhouse",
      },
      resumeText: profile.baseResume.textContent,
      evidence: {
        summary: [],
        candidateSummary: [],
        experience: [],
        skills: ["React", "Contoso"],
        keywords: ["React", "Greenhouse"],
      },
      researchContext: {
        companyNotes: ["Contoso is hiring for platform modernization."],
        domainVocabulary: ["platform modernization"],
        priorityThemes: [],
      },
    };

    const result = completeTailoredResumeDraft(
      {
        label: "Tailored Resume",
        summary: "Grounded summary",
        experienceHighlights: ["Built reliable frontend systems."],
        coreSkills: ["React", "Contoso", "Greenhouse"],
        additionalSkills: ["Playwright", "Remote-first collaboration"],
        targetedKeywords: ["React", "Greenhouse"],
      },
      fallbackInput,
    );

    expect(result.coreSkills).toEqual(["React"]);
    expect(result.additionalSkills).toEqual(["Playwright"]);
    expect(result.fullText).toContain("Core skills: React");
    expect(result.fullText).not.toContain("Contoso");
    expect(result.fullText).not.toContain("Remote-first collaboration");
  });
});
