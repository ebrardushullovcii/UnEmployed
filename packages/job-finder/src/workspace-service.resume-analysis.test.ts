import { describe, expect, test } from "vitest";
import {
  createDocumentManager,
  createExtractionAiClient,
  createResumeExtraction,
  createSeed,
  createWorkspaceServiceHarness,
} from "./workspace-service.test-support";

describe("createJobFinderWorkspaceService", () => {
  test("extracts profile details from stored resume text", async () => {
    const { workspaceService } = createWorkspaceServiceHarness({
      seed: {
        ...createSeed(),
        profile: {
          ...createSeed().profile,
          fullName: "Candidate",
          headline: "Placeholder headline",
          email: null,
          phone: null,
          portfolioUrl: null,
          linkedinUrl: null,
          baseResume: {
            ...createSeed().profile.baseResume,
            extractionStatus: "not_started",
            lastAnalyzedAt: null,
            textContent:
              "Jamie Rivers\nStaff Frontend Engineer\nBerlin, Germany\njamie@example.com\n+49 555 1234\nhttps://jamie.dev\nhttps://www.linkedin.com/in/jamie-rivers\n\n12 years of experience building React, TypeScript, and design systems for product teams.",
          },
        },
      },
    });

    const snapshot = await workspaceService.analyzeProfileFromResume();

    expect(snapshot.profile.fullName).toBe("Jamie Rivers");
    expect(snapshot.profile.headline).toContain("Engineer");
    expect(snapshot.profile.email).toBe("jamie@example.com");
    expect(snapshot.profile.baseResume.extractionStatus).toBe("ready");
    expect(snapshot.profile.skillGroups.highlightedSkills.length).toBeGreaterThan(0);
    expect(snapshot.profile.professionalSummary.fullSummary).toContain(
      "12 years of experience",
    );
    expect(snapshot.searchPreferences.salaryCurrency).toBe("EUR");
  });

  test("maps two-part locations to city and region without forcing a country", async () => {
    const { workspaceService } = createWorkspaceServiceHarness({
      aiClient: createExtractionAiClient(
        createResumeExtraction({
          currentLocation: "New York, NY",
        }),
      ),
      documentManager: createDocumentManager(),
    });

    const snapshot = await workspaceService.analyzeProfileFromResume();

    expect(snapshot.profile.currentCity).toBe("New York");
    expect(snapshot.profile.currentRegion).toBe("NY");
    expect(snapshot.profile.currentCountry).toBeNull();
  });

  test("keeps saved links, projects, and languages when extracted records are invalid", async () => {
    const seed = createSeed();
    seed.profile.projects = [
      {
        id: "project_1",
        name: "Signal Design System",
        projectType: "Product",
        summary: "Unified the product UI layer.",
        role: "Lead designer",
        skills: ["Figma", "React"],
        outcome: "Improved release speed.",
        projectUrl: null,
        repositoryUrl: null,
        caseStudyUrl: null,
      },
    ];
    seed.profile.spokenLanguages = [
      {
        id: "language_1",
        language: "English",
        proficiency: "Native",
        interviewPreference: true,
        notes: null,
      },
    ];

    const { workspaceService } = createWorkspaceServiceHarness({
      seed,
      aiClient: createExtractionAiClient(
        createResumeExtraction({
          links: [{ label: "Broken link", url: "notaurl", kind: "portfolio" }],
          projects: [
            {
              name: null,
              projectType: "Portfolio",
              summary: "Ignored project",
              role: null,
              skills: [],
              outcome: null,
              projectUrl: null,
              repositoryUrl: null,
              caseStudyUrl: null,
            },
          ],
          spokenLanguages: [
            {
              language: null,
              proficiency: null,
              interviewPreference: false,
              notes: null,
            },
          ],
        }),
      ),
    });

    const snapshot = await workspaceService.analyzeProfileFromResume();

    expect(snapshot.profile.links).toEqual(seed.profile.links);
    expect(snapshot.profile.projects).toEqual(seed.profile.projects);
    expect(snapshot.profile.spokenLanguages).toEqual(seed.profile.spokenLanguages);
  });
});
