import { describe, expect, test } from "vitest";

import {
  createMatchAssessment,
  getBroadLocationCompatibility,
  matchesAnyPhrase,
  matchesLocationPreference,
  matchesTitlePreference,
} from "./matching";
import { createSeed } from "../workspace-service.test-fixtures";
import { selectDiscoveryBudgetPostings } from "./workspace-discovery-methods";

describe("matching helpers", () => {
  test("uses a limited source budget for distinct role options instead of duplicate titles", () => {
    const seed = createSeed();
    const basePosting = seed.savedJobs[0]!;
    const postings = [
      {
        ...basePosting,
        sourceJobId: "duplicate_a",
        canonicalUrl: "https://example.com/jobs/duplicate-a",
        title: "Senior Software Engineer",
        company: "Example Co",
      },
      {
        ...basePosting,
        sourceJobId: "duplicate_b",
        canonicalUrl: "https://example.com/jobs/duplicate-b",
        title: "Senior Software Engineer",
        company: "Example Co",
      },
      {
        ...basePosting,
        sourceJobId: "distinct_frontend",
        canonicalUrl: "https://example.com/jobs/frontend",
        title: "Senior Frontend Engineer",
        company: "Example Co",
      },
    ];

    const selected = selectDiscoveryBudgetPostings({
      postings,
      profile: seed.profile,
      searchPreferences: {
        ...seed.searchPreferences,
        targetRoles: ["Senior Software Engineer", "Senior Frontend Engineer"],
      },
      limit: 3,
    });

    expect(selected.map((posting) => posting.sourceJobId)).toEqual([
      "duplicate_a",
      "distinct_frontend",
    ]);
  });

  test("keeps an exact configured job ahead of a higher-scoring duplicate title", () => {
    const seed = createSeed();
    const exactUrl = "https://example.com/jobs/exact";
    const selected = selectDiscoveryBudgetPostings({
      postings: [
        {
          ...seed.savedJobs[0]!,
          sourceJobId: "higher_score_duplicate",
          canonicalUrl: "https://example.com/jobs/higher-score",
          title: "Senior Software Engineer",
          company: "Example Co",
          keySkills: ["TypeScript", "React"],
        },
        {
          ...seed.savedJobs[0]!,
          sourceJobId: "exact_duplicate",
          canonicalUrl: exactUrl,
          title: "Senior Software Engineer",
          company: "Example Co",
          keySkills: [],
          description: "Software engineering role.",
        },
      ],
      profile: seed.profile,
      searchPreferences: seed.searchPreferences,
      preferredCanonicalUrls: [`${exactUrl}#details`],
      limit: 1,
    });

    expect(selected[0]?.sourceJobId).toBe("exact_duplicate");
  });

  test("keeps the generic phrase matcher strict for whole-token matches", () => {
    expect(matchesAnyPhrase("Senior Java Engineer", ["java"])).toBe(true);
    expect(matchesAnyPhrase("Senior JavaScript Engineer", ["java"])).toBe(false);
  });

  test("matches common full-stack role variants for discovery triage", () => {
    expect(
      matchesTitlePreference("Senior Full Stack Engineer (Typescript)", [
        "Senior Full-Stack Software Engineer",
      ]),
    ).toBe(true);
    expect(
      matchesTitlePreference("Full Stack Developer (AI-First)", [
        "Senior Full-Stack Software Engineer",
      ]),
    ).toBe(true);
    expect(
      matchesTitlePreference("Senior Frontend Engineer", [
        "Senior Full-Stack Software Engineer",
      ]),
    ).toBe(false);
    expect(
      matchesTitlePreference("Senior Data Engineer", [
        "Senior Software Engineer",
      ]),
    ).toBe(false);
  });

  test("ranks an adjacent generic developer title below an explicit target role", () => {
    const seed = createSeed();
    const preferences = {
      ...seed.searchPreferences,
      targetRoles: ["Senior Software Engineer"],
      locations: [],
      workModes: [],
      minimumSalaryUsd: null,
      companyWhitelist: [],
    };
    const basePosting = {
      ...seed.savedJobs[0]!,
      easyApplyEligible: false,
      description: "Build web products with TypeScript and React.",
      keySkills: [],
      keywordSignals: [],
    };

    const exact = createMatchAssessment(seed.profile, preferences, {
      ...basePosting,
      title: "Senior Software Engineer",
    });
    const adjacent = createMatchAssessment(seed.profile, preferences, {
      ...basePosting,
      title: "Website Developer",
    });

    expect(adjacent.score).toBeLessThan(exact.score);
    expect(adjacent.gaps).toContain(
      "Role title is adjacent to the target list but not an exact fit.",
    );
  });

  test("matches linkedin noisy dismiss-title strings without letting adjacent frontend roles through", () => {
    expect(
      matchesTitlePreference(
        "Full Circle Agency • Pristina (Remote) Dismiss Full Stack Developer (AI-First) job Viewed · Posted 1 month ago",
        ["Senior Full-Stack Software Engineer"],
      ),
    ).toBe(true);
    expect(
      matchesTitlePreference(
        "Senior Full Stack Engineer (Typescript) (Verified job) Fresha • Pristina (On-site) Dismiss Senior Full Stack Engineer (Typescript) job 1 connection works here Viewed · Promoted",
        ["Senior Full-Stack Software Engineer"],
      ),
    ).toBe(true);
    expect(
      matchesTitlePreference(
        "Senior Frontend Engineer (Verified job) Fresha • Pristina (On-site) Dismiss Senior Frontend Engineer job 1 connection works here Viewed · Promoted",
        ["Senior Full-Stack Software Engineer"],
      ),
    ).toBe(false);
  });

  test("matches close location variants while ignoring work-mode noise", () => {
    expect(
      matchesLocationPreference("Pristina (On-site)", ["Prishtina, Kosovo"]),
    ).toBe(true);
    expect(matchesLocationPreference("Remote", ["Prishtina, Kosovo"])).toBe(true);
    expect(
      matchesLocationPreference("Prishtina, Kosovo (Remote)", [
        "Prishtina, Kosovo",
      ]),
    ).toBe(true);
    expect(matchesLocationPreference("Tirana, Albania", ["Prishtina, Kosovo"])).toBe(
      false,
    );
    expect(
      matchesLocationPreference("Remote-Eastern Europe", [
        "Prishtina, Kosovo",
      ]),
    ).toBe(false);
    expect(
      matchesLocationPreference("Remote-Southern Europe", [
        "Prishtina, Kosovo",
      ]),
    ).toBe(true);
    expect(
      matchesLocationPreference("Remote-Northern Europe", [
        "Prishtina, Kosovo",
      ]),
    ).toBe(false);
    expect(
      matchesLocationPreference("Remote-Austria", ["Prishtina, Kosovo"]),
    ).toBe(false);
    expect(
      matchesLocationPreference("Remote-EMEA", ["Prishtina, Kosovo"]),
    ).toBe(true);
    expect(
      getBroadLocationCompatibility("Remote-APAC", ["Prishtina, Kosovo"]),
    ).toBe(false);
  });

  test("scores profile skills found in a rich provider description even when structured skill fields are empty", () => {
    const seed = createSeed();
    const posting = {
      ...seed.savedJobs[0]!,
      title: "Senior Software Engineer",
      description:
        "Build a desktop product with TypeScript, React, Electron, and WebSockets.",
      keySkills: [],
      keywordSignals: [],
      easyApplyEligible: false,
    };
    const assessment = createMatchAssessment(
      {
        ...seed.profile,
        skills: ["TypeScript", "React", "Electron"],
      },
      {
        ...seed.searchPreferences,
        targetRoles: ["Senior Software Engineer"],
        locations: [],
        workModes: [],
        minimumSalaryUsd: null,
        companyWhitelist: [],
      },
      posting,
    );

    expect(assessment.score).toBe(76);
    expect(assessment.reasons).not.toContain(
      "Location fits the saved search preferences.",
    );
    expect(assessment.reasons).not.toContain(
      "Work mode matches the preferred operating model.",
    );
    expect(assessment.gaps).not.toContain(
      "The listing emphasizes skills that are not yet prominent in the current profile.",
    );
  });

  test("penalizes explicit location and staff-scope mismatches instead of only withholding bonuses", () => {
    const seed = createSeed();
    const assessment = createMatchAssessment(
      {
        ...seed.profile,
        headline: "Senior Software Engineer",
        experiences: seed.profile.experiences.map((experience, index) => ({
          ...experience,
          title: index === 0 ? "Senior Software Engineer" : experience.title,
        })),
      },
      {
        ...seed.searchPreferences,
        targetRoles: ["Senior Software Engineer"],
        locations: ["Prishtina, Kosovo"],
        workModes: ["remote"],
      },
      {
        ...seed.savedJobs[0]!,
        title: "Staff Software Engineer",
        location: "Madrid, Spain",
        workMode: ["onsite"],
        description: "Build software with React and TypeScript.",
        keySkills: [],
        keywordSignals: [],
      },
    );

    expect(assessment.score).toBeLessThan(70);
    expect(assessment.gaps).toContain(
      "The title signals a staff-or-leadership scope not yet explicit in the current engineering profile.",
    );
  });

  test("does not award perfect scores to explicit technology or SRE specializations missing from the profile", () => {
    const seed = createSeed();
    const profile = {
      ...seed.profile,
      headline: "Senior Full-Stack Software Engineer",
      skills: ["TypeScript", "React", "Node.js", "AWS", "Docker"],
      experiences: seed.profile.experiences.map((experience) => ({
        ...experience,
        summary: null,
        achievements: [],
        skills: ["TypeScript", "React", "Node.js"],
      })),
      projects: [],
    };
    const preferences = {
      ...seed.searchPreferences,
      targetRoles: ["Senior Backend Engineer", "Senior Software Engineer"],
      locations: ["Prishtina, Kosovo"],
      workModes: ["remote" as const],
    };
    const basePosting = {
      ...seed.savedJobs[0]!,
      location: "Remote-EMEA",
      workMode: ["remote" as const],
      description: "Build distributed services using Node.js, AWS, and Docker.",
      keySkills: [],
      keywordSignals: [],
    };

    const elixir = createMatchAssessment(profile, preferences, {
      ...basePosting,
      title: "Senior Backend Engineer (Elixir)",
    });
    const sre = createMatchAssessment(profile, preferences, {
      ...basePosting,
      title: "Senior Site Reliability Engineer",
    });

    expect(elixir.score).toBeLessThanOrEqual(84);
    expect(elixir.gaps.some((gap) => gap.includes("specializes in elixir"))).toBe(
      true,
    );
    expect(sre.score).toBeLessThanOrEqual(72);
    expect(sre.gaps.some((gap) => gap.includes("site-reliability"))).toBe(true);
    expect(sre.recommendation).toBe("review_before_applying");
    expect(
      sre.requirements.some(
        (requirement) =>
          requirement.label === "Site reliability operations" &&
          requirement.status === "missing",
      ),
    ).toBe(true);
  });

  test("builds requirement evidence and withholds an apply recommendation when a required framework is unsupported", () => {
    const seed = createSeed();
    const assessment = createMatchAssessment(
      {
        ...seed.profile,
        headline: "Senior Backend Engineer",
        yearsExperience: 8,
        skills: ["Python", "AWS"],
        skillGroups: {
          ...seed.profile.skillGroups,
          coreSkills: [],
          tools: ["AWS"],
          languagesAndFrameworks: ["Python"],
        },
        experiences: [],
        projects: [],
      },
      {
        ...seed.searchPreferences,
        targetRoles: ["Senior Backend Engineer"],
        locations: [],
        workModes: [],
      },
      {
        ...seed.savedJobs[0]!,
        title: "Senior Backend Engineer",
        description:
          "&lt;h2&gt;Requirements&lt;/h2&gt;&lt;ul&gt;&lt;li&gt;You must have production experience with Python and FastAPI.&lt;/li&gt;&lt;li&gt;At least 5 years of backend engineering experience.&lt;/li&gt;&lt;/ul&gt;&lt;h2&gt;Nice to have&lt;/h2&gt;&lt;p&gt;AWS experience.&lt;/p&gt;",
        keySkills: [],
        keywordSignals: [],
      },
    );

    const python = assessment.requirements.find(
      (requirement) => requirement.label === "Python",
    );
    const fastApi = assessment.requirements.find(
      (requirement) => requirement.label === "FastAPI",
    );
    const experience = assessment.requirements.find(
      (requirement) => requirement.category === "experience",
    );

    expect(python?.status).toBe("supported");
    expect(python?.resumeEvidence[0]?.detail).toContain("Python");
    expect(fastApi).toMatchObject({
      importance: "required",
      status: "missing",
    });
    expect(fastApi?.jobEvidence).toContain("FastAPI");
    expect(fastApi?.jobEvidence).not.toContain("&lt;");
    expect(experience?.status).toBe("supported");
    expect(assessment.recommendation).toBe("review_before_applying");
    expect(assessment.recommendationRationale).toContain("FastAPI");
  });

  test("reflects several unsupported technologies in both the score and recommendation", () => {
    const seed = createSeed();
    const assessment = createMatchAssessment(
      {
        ...seed.profile,
        headline: "Senior Backend Engineer",
        skills: ["Node.js", "AWS", "PostgreSQL"],
        skillGroups: {
          ...seed.profile.skillGroups,
          coreSkills: [],
          tools: ["AWS", "PostgreSQL"],
          languagesAndFrameworks: ["Node.js"],
        },
        experiences: [],
        projects: [],
      },
      {
        ...seed.searchPreferences,
        targetRoles: ["Senior Backend Engineer"],
        locations: [],
        workModes: [],
      },
      {
        ...seed.savedJobs[0]!,
        title: "Senior Backend Engineer",
        description:
          "Our services use Node.js and AWS. The wider platform includes Elixir, Phoenix, Kubernetes, and PostgreSQL.",
        keySkills: [],
        keywordSignals: [],
      },
    );
    const supportedAssessment = createMatchAssessment(
      {
        ...seed.profile,
        headline: "Senior Backend Engineer",
        skills: ["Node.js", "AWS", "PostgreSQL"],
        skillGroups: {
          ...seed.profile.skillGroups,
          coreSkills: [],
          tools: ["AWS", "PostgreSQL"],
          languagesAndFrameworks: ["Node.js"],
        },
        experiences: [],
        projects: [],
      },
      {
        ...seed.searchPreferences,
        targetRoles: ["Senior Backend Engineer"],
        locations: [],
        workModes: [],
      },
      {
        ...seed.savedJobs[0]!,
        title: "Senior Backend Engineer",
        description: "Our services use Node.js, AWS, and PostgreSQL.",
        keySkills: [],
        keywordSignals: [],
      },
    );

    expect(assessment.score).toBeLessThan(supportedAssessment.score);
    expect(assessment.recommendation).toBe("review_before_applying");
    expect(assessment.recommendationRationale).toContain(
      "3 detected requirements",
    );
  });
});
