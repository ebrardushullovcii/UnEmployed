import { describe, expect, test } from "vitest";

import {
  mergeEducationRecords,
  mergeExperienceRecords,
} from "./internal/profile-merge";
import { createSeed } from "./workspace-service.test-fixtures";
import {
  createAiClient,
  createWorkspaceServiceHarness,
} from "./workspace-service.test-support";
import { createStageCandidate, createTestBundle } from "./workspace-service.resume-analysis.shared";

describe("resume import deduplication", () => {
  test("reconciles duplicate experience candidates with different record ids into one review item", async () => {
    const seed = createSeed();
    const { repository, workspaceService } = createWorkspaceServiceHarness({
      seed: {
        ...seed,
        profile: {
          ...seed.profile,
          experiences: [],
        },
      },
      aiClient: {
        ...createAiClient(),
        extractResumeImportStage(input) {
          if (input.stage !== "experience") {
            return Promise.resolve({
              stage: input.stage,
              analysisProviderKind: "deterministic",
              analysisProviderLabel: "Test AI",
              candidates: [],
              notes: [],
            });
          }

          return Promise.resolve({
            stage: input.stage,
            analysisProviderKind: "deterministic",
            analysisProviderLabel: "Test AI",
            candidates: [
              createStageCandidate({
                target: { section: "experience", key: "record", recordId: "experience_1" },
                label: "Senior Software Engineer at Mercury",
                value: {
                  companyName: "Mercury",
                  companyUrl: null,
                  title: "Senior Software Engineer",
                  employmentType: null,
                  location: "New York City Metropolitan Area",
                  workMode: [],
                  startDate: "Aug 2024",
                  endDate: "",
                  isCurrent: true,
                  summary: null,
                  achievements: [],
                  skills: [],
                  domainTags: [],
                  peopleManagementScope: null,
                  ownershipScope: null,
                },
                sourceBlockIds: ["page_1_block_3"],
                confidence: 0.8,
                recommendation: "needs_review",
                overall: 0.76,
              }),
              createStageCandidate({
                target: { section: "experience", key: "record", recordId: "experience_8" },
                label: "Senior Software Engineer at Mercury",
                value: {
                  companyName: "Mercury",
                  companyUrl: null,
                  title: "Senior Software Engineer",
                  employmentType: null,
                  location: "New York City Metropolitan Area",
                  workMode: ["remote"],
                  startDate: "2024-08",
                  endDate: null,
                  isCurrent: true,
                  summary: "Leads core product work.",
                  achievements: ["Improved frontend performance."],
                  skills: ["React"],
                  domainTags: [],
                  peopleManagementScope: null,
                  ownershipScope: null,
                },
                sourceBlockIds: ["page_1_block_3"],
                confidence: 0.86,
                recommendation: "needs_review",
                overall: 0.81,
              }),
            ],
            notes: [],
          });
        },
      },
    });

    const snapshot = await workspaceService.runResumeImport({
      baseResume: {
        ...seed.profile.baseResume,
        id: "resume_duplicate_experience_ids",
        fileName: "resume.pdf",
        textContent: [
          "Jamie Rivers",
          "MERCURY - NEW YORK CITY METROPOLITAN AREA",
          "SENIOR SOFTWARE ENGINEER - 2024-08 - Current",
          "Leads core product work.",
        ].join("\n"),
      },
      documentBundle: createTestBundle({
        fullText: [
          "Jamie Rivers",
          "MERCURY - NEW YORK CITY METROPOLITAN AREA",
          "SENIOR SOFTWARE ENGINEER - 2024-08 - Current",
          "Leads core product work.",
        ].join("\n"),
      }),
    });

    const run = await repository.getLatestResumeImportRun();
    const candidates = await repository.listResumeImportFieldCandidates({
      runId: run?.id ?? "",
    });
    const experienceCandidates = candidates.filter(
      (candidate) => candidate.target.section === "experience" && candidate.target.key === "record",
    );

    expect(snapshot.latestResumeImportReviewCandidates.filter((candidate) => candidate.target.section === "experience")).toHaveLength(1);
    expect(experienceCandidates).toHaveLength(2);
    expect(experienceCandidates.filter((candidate) => candidate.resolution === "needs_review")).toHaveLength(1);
    expect(experienceCandidates.filter((candidate) => candidate.resolution === "rejected")).toHaveLength(1);
  });

  test("mergeExperienceRecords treats current and empty-end-date duplicates as the same record", () => {
    const merged = mergeExperienceRecords([], [
      {
        companyName: "Mercury",
        companyUrl: null,
        title: "Senior Software Engineer",
        employmentType: null,
        location: "New York City Metropolitan Area",
        workMode: [],
        startDate: "Aug 2024",
        endDate: "",
        isCurrent: true,
        summary: null,
        achievements: [],
        skills: [],
        domainTags: [],
        peopleManagementScope: null,
        ownershipScope: null,
      },
      {
        companyName: "Mercury",
        companyUrl: null,
        title: "Senior Software Engineer",
        employmentType: null,
        location: "New York City Metropolitan Area",
        workMode: ["remote"],
        startDate: "2024-08",
        endDate: null,
        isCurrent: true,
        summary: "Leads core product work.",
        achievements: ["Improved frontend performance."],
        skills: ["React"],
        domainTags: [],
        peopleManagementScope: null,
        ownershipScope: null,
      },
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      companyName: "Mercury",
      title: "Senior Software Engineer",
      startDate: "2024-08",
      isCurrent: true,
      summary: "Leads core product work.",
      workMode: ["remote"],
    });
  });

  test("mergeEducationRecords dedupes equivalent education records with different date formats", () => {
    const merged = mergeEducationRecords([], [
      {
        schoolName: "Florida State University",
        degree: "Bachelor's Degree",
        fieldOfStudy: "Computer Science",
        location: null,
        startDate: "May 2011",
        endDate: "Sept 2015",
        summary: null,
      },
      {
        schoolName: "Florida State University",
        degree: "Bachelor's Degree",
        fieldOfStudy: "Computer Science",
        location: null,
        startDate: "2011-05",
        endDate: "2015-09",
        summary: "Graduated with honors.",
      },
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      schoolName: "Florida State University",
      degree: "Bachelor's Degree",
      startDate: "2011-05",
      endDate: "2015-09",
      summary: "Graduated with honors.",
    });
  });

  test("mergeExperienceRecords dedupes equivalent records across single-digit slash and iso month formats", () => {
    const merged = mergeExperienceRecords([], [
      {
        companyName: "Mercury",
        companyUrl: null,
        title: "Senior Software Engineer",
        employmentType: null,
        location: "Remote",
        workMode: [],
        startDate: "7/2023",
        endDate: "6/2024",
        isCurrent: false,
        summary: null,
        achievements: [],
        skills: [],
        domainTags: [],
        peopleManagementScope: null,
        ownershipScope: null,
      },
      {
        companyName: "Mercury",
        companyUrl: null,
        title: "Senior Software Engineer",
        employmentType: null,
        location: "Remote",
        workMode: ["remote"],
        startDate: "2023-07",
        endDate: "2024-06",
        isCurrent: false,
        summary: "Led core product work.",
        achievements: ["Improved frontend performance."],
        skills: ["React"],
        domainTags: [],
        peopleManagementScope: null,
        ownershipScope: null,
      },
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      companyName: "Mercury",
      title: "Senior Software Engineer",
      startDate: "2023-07",
      endDate: "2024-06",
      summary: "Led core product work.",
      workMode: ["remote"],
    });
  });

  test("auto-applies grounded placeholder replacements on a fresh-start profile while leaving experience review-first", async () => {
    const seed = createSeed();
    const { workspaceService } = createWorkspaceServiceHarness({
      seed: {
        ...seed,
        profile: {
          ...seed.profile,
          id: "candidate_fresh_start",
          firstName: "New",
          lastName: "Candidate",
          fullName: "New Candidate",
          headline: "Import your resume to begin",
          summary:
            "Import a resume or paste resume text to build your profile, targeting, and tailored documents.",
          currentLocation: "Set your preferred location",
          yearsExperience: 0,
          experiences: [],
          targetRoles: [],
        },
        searchPreferences: {
          ...seed.searchPreferences,
          targetRoles: [],
          locations: [],
          workModes: [],
        },
      },
      aiClient: createAiClient(),
    });

    const snapshot = await workspaceService.runResumeImport({
      baseResume: {
        ...seed.profile.baseResume,
        id: "resume_placeholder_replace",
        fileName: "Ryan Holstien Resume.pdf",
        textContent: [
          "Ryan Holstien",
          "+1 650-353-7911",
          "Cedar Park, TX 78613",
          "linkedin.com/in/ryan-holstien-7954b665",
          "Senior Software Engineer",
          "ryanholstien993@outlook.com",
          "Senior Software Engineer with 10+ years of experience building secure, scalable healthcare and SaaS platforms with C#,.NET, ASP.NET Core, REST APIs, MongoDB, SQL Server, and cloud-native services on Azure and AWS. Proven record",
          "delivering microservices, third-party integrations, CI/CD automation, observability, and production support in Agile teams.",
          "PROFESSIONAL EXPERIENCE",
          "Senior Software Engineer — DataHub, Remote, CA (Dec 2021–Feb 2026)",
          "Designed C# and .NET services for a behavioral-health platform.",
        ].join("\n"),
      },
      documentBundle: createTestBundle({
        primaryParserKind: "local_pdf_layout",
        parserKinds: ["local_pdf_layout"],
        fullText: [
          "Ryan Holstien",
          "+1 650-353-7911",
          "Cedar Park, TX 78613",
          "linkedin.com/in/ryan-holstien-7954b665",
          "Senior Software Engineer",
          "ryanholstien993@outlook.com",
          "Senior Software Engineer with 10+ years of experience building secure, scalable healthcare and SaaS platforms with C#,.NET, ASP.NET Core, REST APIs, MongoDB, SQL Server, and cloud-native services on Azure and AWS. Proven record",
          "delivering microservices, third-party integrations, CI/CD automation, observability, and production support in Agile teams.",
          "PROFESSIONAL EXPERIENCE",
          "Senior Software Engineer — DataHub, Remote, CA (Dec 2021–Feb 2026)",
          "Designed C# and .NET services for a behavioral-health platform.",
        ].join("\n"),
      }),
    });

    expect(snapshot.profile.fullName).toBe("Ryan Holstien");
    expect(snapshot.profile.headline).toBe("Import your resume to begin");
    expect(snapshot.profile.summary).toContain("Import a resume or paste resume text");
    expect(snapshot.profile.currentLocation).toBe("Cedar Park, TX 78613");
    expect(snapshot.profile.yearsExperience).toBe(0);
    expect(snapshot.profile.experiences).toEqual([
      expect.objectContaining({
        companyName: "DataHub",
        title: "Senior Software Engineer",
      }),
    ]);
    expect(
      snapshot.latestResumeImportReviewCandidates.some(
        (candidate) => candidate.target.section === "experience",
      ),
    ).toBe(false);
    expect(snapshot.latestResumeImportRun?.status).toBe("review_ready");
    expect(snapshot.profileSetupState.reviewItems.map((item) => item.label)).not.toContain(
      "Work history",
    );
    expect(snapshot.profileSetupState.reviewItems.map((item) => item.label)).toEqual(
      expect.arrayContaining(["Headline", "Years of experience"]),
    );
  });

  test("derives and auto-applies years of experience from dated work history on fresh-start imports", async () => {
    const seed = createSeed();
    const { workspaceService } = createWorkspaceServiceHarness({
      seed: {
        ...seed,
        profile: {
          ...seed.profile,
          id: "candidate_fresh_start",
          firstName: "New",
          lastName: "Candidate",
          fullName: "New Candidate",
          headline: "Import your resume to begin",
          summary:
            "Import a resume or paste resume text to build your profile, targeting, and tailored documents.",
          currentLocation: "Set your preferred location",
          yearsExperience: 0,
          experiences: [],
          targetRoles: [],
        },
        searchPreferences: {
          ...seed.searchPreferences,
          targetRoles: [],
          locations: [],
          workModes: [],
        },
      },
      aiClient: createAiClient(),
    });

    const text = [
      "Aaron Murphy",
      "Tampa, FL",
      "+1 615-378-5538",
      "murphyaron12@gmail.com",
      "Senior Software Engineer",
      "PROFESSIONAL SUMMARY",
      "Experienced Staff Engineer with a focus on leading complex, high-impact initiatives across full-stack systems.",
      "EXPERIENCE",
      "EdSights, Remote, NY — Staff/Senior Software Engineer",
      "Sep 2021 – Feb 2026",
      "Agile Thought, Tampa, FL — Senior Software Developer",
      "Jul 2019 - Sep 2021",
      "Agile Thought, Tampa, FL — Software Developer",
      "Sep 2016 - Jul 2019",
      "Three Five Two, Tampa, FL — Software Developer",
      "Jun 2015 - Aug 2016",
    ].join("\n");

    const snapshot = await workspaceService.runResumeImport({
      baseResume: {
        ...seed.profile.baseResume,
        id: "resume_date_derived_years_experience",
        fileName: "Aaron Murphy Resume.pdf",
        textContent: text,
      },
      documentBundle: createTestBundle({
        primaryParserKind: "local_pdf_layout",
        parserKinds: ["local_pdf_layout"],
        fullText: text,
      }),
    });

    expect(snapshot.profile.yearsExperience).toBe(0);
    expect(snapshot.latestResumeImportRun?.status).toBe("review_ready");
    expect(snapshot.profileSetupState.reviewItems.map((item) => item.label)).toContain(
      "Years of experience",
    );
  });
});
