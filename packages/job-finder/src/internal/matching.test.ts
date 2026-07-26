import { describe, expect, test } from "vitest";

import {
  createMatchAssessment,
  buildDiscoveryJobs,
  getBroadLocationCompatibility,
  matchesAnyPhrase,
  matchesLocationPreference,
  matchesTitlePreference,
} from "./matching";
import { createSeed } from "../workspace-service.test-fixtures";
import { selectDiscoveryBudgetPostings } from "./workspace-discovery-methods";

describe("matching helpers", () => {
  test("orders equal-score discovery jobs by recommendation, detail quality, and recency", () => {
    const seed = createSeed();
    const base = seed.savedJobs[0]!;
    const jobs = buildDiscoveryJobs([
      {
        ...base,
        id: "older_enriched",
        sourceJobId: "older_enriched",
        detailQuality: "detail_enriched",
        postedAt: "2026-01-01T00:00:00.000Z",
        matchAssessment: {
          ...base.matchAssessment,
          score: 80,
          recommendation: "strong_fit",
        },
      },
      {
        ...base,
        id: "newer_enriched",
        sourceJobId: "newer_enriched",
        detailQuality: "detail_enriched",
        postedAt: "2026-02-01T00:00:00.000Z",
        matchAssessment: {
          ...base.matchAssessment,
          score: 80,
          recommendation: "strong_fit",
        },
      },
      {
        ...base,
        id: "newer_card",
        sourceJobId: "newer_card",
        detailQuality: "card_only",
        postedAt: "2026-03-01T00:00:00.000Z",
        matchAssessment: {
          ...base.matchAssessment,
          score: 80,
          recommendation: "strong_fit",
        },
      },
      {
        ...base,
        id: "review_first",
        sourceJobId: "review_first",
        detailQuality: "detail_enriched",
        postedAt: "2026-04-01T00:00:00.000Z",
        matchAssessment: {
          ...base.matchAssessment,
          score: 80,
          recommendation: "review_before_applying",
        },
      },
    ]);

    expect(jobs.map((job) => job.id)).toEqual([
      "newer_enriched",
      "older_enriched",
      "newer_card",
      "review_first",
    ]);
  });

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
    expect(matchesAnyPhrase("Senior JavaScript Engineer", ["java"])).toBe(
      false,
    );
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
    expect(matchesLocationPreference("Remote", ["Prishtina, Kosovo"])).toBe(
      true,
    );
    expect(
      matchesLocationPreference("Prishtina, Kosovo (Remote)", [
        "Prishtina, Kosovo",
      ]),
    ).toBe(true);
    expect(
      matchesLocationPreference("Tirana, Albania", ["Prishtina, Kosovo"]),
    ).toBe(false);
    expect(
      matchesLocationPreference("Remote-Eastern Europe", ["Prishtina, Kosovo"]),
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
    expect(
      elixir.gaps.some((gap) => gap.includes("specializes in elixir")),
    ).toBe(true);
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

  test("does not mistake ordinary Go or net prose for technology requirements", () => {
    const seed = createSeed();
    const assessment = createMatchAssessment(
      {
        ...seed.profile,
        skills: ["TypeScript"],
        experiences: [],
        projects: [],
      },
      {
        ...seed.searchPreferences,
        targetRoles: ["Senior Software Engineer"],
        locations: [],
        workModes: [],
      },
      {
        ...seed.savedJobs[0]!,
        title: "Senior Software Engineer",
        description:
          "Go beyond customer expectations and improve net revenue retention. React to feedback with empathy.",
        keySkills: [],
        keywordSignals: [],
      },
    );

    expect(
      assessment.requirements.some((requirement) =>
        ["Go", ".NET", "React"].includes(requirement.label),
      ),
    ).toBe(false);
  });

  test("does not use React Native alone as evidence for a React web requirement", () => {
    const seed = createSeed();
    const assessment = createMatchAssessment(
      {
        ...seed.profile,
        skills: ["React Native"],
        skillGroups: {
          ...seed.profile.skillGroups,
          coreSkills: ["React Native"],
          languagesAndFrameworks: ["React Native"],
        },
        experiences: [],
        projects: [],
      },
      {
        ...seed.searchPreferences,
        targetRoles: ["Senior Frontend Engineer"],
        locations: [],
        workModes: [],
      },
      {
        ...seed.savedJobs[0]!,
        title: "Senior Frontend Engineer",
        description:
          "Required: production experience with React web applications.",
        keySkills: [],
        keywordSignals: [],
      },
    );

    expect(
      assessment.requirements.find(
        (requirement) => requirement.label === "React",
      ),
    ).toMatchObject({ importance: "required", status: "missing" });
    expect(
      assessment.requirements.some(
        (requirement) => requirement.label === "React Native",
      ),
    ).toBe(false);
  });

  test("detects punctuation-heavy C# and .NET requirements with grounded profile evidence", () => {
    const seed = createSeed();
    const assessment = createMatchAssessment(
      {
        ...seed.profile,
        skills: ["C#", ".NET"],
        skillGroups: {
          ...seed.profile.skillGroups,
          coreSkills: ["C#", ".NET"],
        },
        experiences: [],
        projects: [],
      },
      {
        ...seed.searchPreferences,
        targetRoles: ["Senior Software Engineer"],
        locations: [],
        workModes: [],
      },
      {
        ...seed.savedJobs[0]!,
        title: "Senior Software Engineer",
        description:
          "Required: production experience with C# and .NET services.",
        keySkills: [],
        keywordSignals: [],
      },
    );

    expect(
      assessment.requirements.find((requirement) => requirement.label === "C#"),
    ).toMatchObject({ importance: "required", status: "supported" });
    expect(
      assessment.requirements.find(
        (requirement) => requirement.label === ".NET",
      ),
    ).toMatchObject({ importance: "required", status: "supported" });
  });

  test("treats listed language alternatives as one requirement instead of separate hard gaps", () => {
    const seed = createSeed();
    const assessment = createMatchAssessment(
      {
        ...seed.profile,
        skills: ["Node.js"],
        skillGroups: {
          ...seed.profile.skillGroups,
          coreSkills: ["Node.js"],
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
          "Experience with 1+ backend programming language (Elixir, Python, Go, Java, Node.js, etc.).",
        keySkills: [],
        keywordSignals: [],
      },
    );

    const languageRequirement = assessment.requirements.find((requirement) =>
      requirement.label.startsWith("One of:"),
    );
    expect(languageRequirement).toMatchObject({
      importance: "required",
      status: "supported",
    });
    expect(languageRequirement?.label).toContain("Node.js");
    expect(
      assessment.requirements.some(
        (requirement) =>
          ["Elixir", "Python", "Go", "Java", "Node.js"].includes(
            requirement.label,
          ) && requirement.status === "missing",
      ),
    ).toBe(false);
    expect(assessment.recommendation).not.toBe("review_before_applying");
  });

  test("caps the official Circle Applied AI listing when core Rails, production AI, and scaling evidence are missing", () => {
    const seed = createSeed();
    const assessment = createMatchAssessment(
      {
        ...seed.profile,
        headline: "Senior Full-Stack Software Engineer",
        yearsExperience: 9,
        skills: ["TypeScript", "React", "Node.js", "PostgreSQL"],
        skillGroups: {
          ...seed.profile.skillGroups,
          coreSkills: ["TypeScript", "React", "Node.js", "PostgreSQL"],
          tools: ["PostgreSQL"],
          languagesAndFrameworks: ["TypeScript", "React", "Node.js"],
        },
        experiences: seed.profile.experiences.map((experience) => ({
          ...experience,
          summary: "Built and maintained full-stack business applications.",
          achievements: [
            "Improved application response times through targeted refactoring.",
            "Designed and measured A/B campaigns to validate customer messaging.",
          ],
          skills: ["TypeScript", "React", "Node.js", "PostgreSQL"],
        })),
        projects: [],
        spokenLanguages: [
          {
            id: "language_english",
            language: "English",
            proficiency: "C2",
            interviewPreference: true,
            notes: null,
          },
        ],
      },
      {
        ...seed.searchPreferences,
        targetRoles: ["Senior Full-Stack Software Engineer"],
        locations: [],
        workModes: [],
      },
      {
        ...seed.savedJobs[0]!,
        sourceJobId: "5112809008",
        canonicalUrl:
          "https://job-boards.greenhouse.io/circleso/jobs/5112809008",
        applicationUrl:
          "https://job-boards.greenhouse.io/circleso/jobs/5112809008",
        title: "Senior Full-Stack Software Engineer, Applied AI",
        company: "Circle.so",
        description: [
          "The Applied AI team builds full-stack AI solutions including AI agents and Retrieval-Augmented Generation.",
          "Some team members joined with deep Rails experience and solid AI fundamentals, while others joined with deep AI experience and ramped up on Rails.",
          "6+ years experience working as a full-stack engineer on high-traffic production applications. You've dealt with the challenges that come with scale — query optimization, careful migrations, performance bottlenecks.",
          "Strong proficiency in Ruby on Rails, MySQL / Postgresql, ReactJS.",
          "Hands-on experience building AI features in production — whether RAG systems, AI agents, or LLM-powered tools. You've shipped at least one real AI use case, not just prototypes.",
          "Strong experimentation mindset — you're comfortable designing and running A/B tests, measuring results, and iterating quickly.",
          "You are proficient in English (spoken, written, and reading) at a CEFR Level C2.",
        ].join("\n"),
        keySkills: ["React", "PostgreSQL"],
        minimumQualifications: [],
        preferredQualifications: [],
        responsibilities: [],
        keywordSignals: [],
      },
    );

    const ruby = assessment.requirements.find(
      (requirement) => requirement.label === "Ruby",
    );
    const rails = assessment.requirements.find(
      (requirement) => requirement.label === "Rails",
    );
    const productionAi = assessment.requirements.find(
      (requirement) => requirement.label === "Production AI feature delivery",
    );
    const productionScale = assessment.requirements.find(
      (requirement) => requirement.label === "High-traffic production scaling",
    );
    const experimentation = assessment.requirements.find(
      (requirement) => requirement.label === "Experimentation and measurement",
    );
    const english = assessment.requirements.find((requirement) =>
      requirement.label.startsWith("English proficiency"),
    );

    expect(ruby).toMatchObject({ importance: "required", status: "missing" });
    expect(rails).toMatchObject({ importance: "required", status: "missing" });
    expect(ruby?.jobEvidence).toContain("Strong proficiency in Ruby on Rails");
    expect(rails?.jobEvidence).toContain("Strong proficiency in Ruby on Rails");
    expect(productionAi).toMatchObject({
      importance: "required",
      status: "missing",
    });
    expect(productionAi?.jobEvidence).toContain("shipped at least one real AI use case");
    expect(productionScale).toMatchObject({
      importance: "required",
      status: "missing",
    });
    expect(productionScale?.jobEvidence).toContain("high-traffic production applications");
    expect(experimentation).toMatchObject({
      importance: "required",
      status: "supported",
    });
    expect(english).toMatchObject({
      importance: "required",
      status: "supported",
    });
    expect(assessment.score).toBeLessThanOrEqual(64);
    expect(assessment.recommendation).toBe("review_before_applying");
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

  test("does not call a remote requirement supported when remote eligibility is unknown", () => {
    const seed = createSeed();
    const assessment = createMatchAssessment(
      {
        ...seed.profile,
        workEligibility: {
          ...seed.profile.workEligibility,
          remoteEligible: null,
        },
      },
      {
        ...seed.searchPreferences,
        targetRoles: ["Senior Software Engineer"],
        locations: [],
        workModes: ["remote"],
      },
      {
        ...seed.savedJobs[0]!,
        title: "Senior Software Engineer",
        location: "Remote",
        workMode: ["remote"],
        description: "Build software with TypeScript and React.",
      },
    );

    const workMode = assessment.requirements.find(
      (requirement) => requirement.category === "work_mode",
    );

    expect(workMode).toMatchObject({
      status: "unknown",
      jobEvidence: "Remote",
    });
    expect(workMode?.explanation).toContain("eligibility is not confirmed");
    expect(assessment.recommendation).toBe("review_before_applying");
  });
});
