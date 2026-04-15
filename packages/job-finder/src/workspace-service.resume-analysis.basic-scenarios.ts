import { describe, expect, test } from "vitest";
import {
  createExtractionAiClient,
  createResumeExtraction,
  createSeed,
  createWorkspaceServiceHarness,
} from "./workspace-service.test-support";

describe("createJobFinderWorkspaceService", () => {
  test("auto-applies safe literals from stored resume text while leaving higher-risk fields reviewable", async () => {
    const { repository, workspaceService } = createWorkspaceServiceHarness({
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
    const run = await repository.getLatestResumeImportRun();
    const candidates = await repository.listResumeImportFieldCandidates({
      runId: run?.id ?? "",
    });

    expect(snapshot.profile.fullName).toBe("Jamie Rivers");
    expect(snapshot.profile.currentLocation).toBe("Berlin, Germany");
    expect(snapshot.profile.email).toBe("jamie@example.com");
    expect(snapshot.profile.phone).toBe("+49 555 1234");
    expect(snapshot.profile.headline).toBe("Placeholder headline");
    expect(snapshot.profile.baseResume.extractionStatus).toBe("ready");
    expect(snapshot.searchPreferences.salaryCurrency).toBe("USD");
    expect(snapshot.latestResumeImportRun?.status).toBe("review_ready");
    expect(snapshot.latestResumeImportReviewCandidates.map((candidate) => candidate.label)).toEqual(
      expect.arrayContaining(["Headline", "Summary"]),
    );
    expect(
      candidates.some(
        (candidate) =>
          candidate.target.section === "identity" &&
          candidate.target.key === "fullName" &&
          candidate.value === "Jamie Rivers" &&
          candidate.resolution === "auto_applied",
      ),
    ).toBe(true);
    expect(
      candidates.some(
        (candidate) =>
          candidate.target.section === "identity" &&
          candidate.target.key === "headline" &&
          candidate.resolution === "needs_review",
      ),
    ).toBe(true);
  });

  test("maps two-part locations to city and region without forcing a country", async () => {
    const seed = createSeed();
    const { workspaceService } = createWorkspaceServiceHarness({
      seed: {
        ...seed,
        profile: {
          ...seed.profile,
          baseResume: {
            ...seed.profile.baseResume,
            extractionStatus: "not_started",
            lastAnalyzedAt: null,
            textContent: [
              "Jamie Rivers",
              "Staff Product Designer",
              "New York, NY",
              "jamie@example.com",
            ].join("\n"),
          },
        },
      },
    });

    const snapshot = await workspaceService.analyzeProfileFromResume();

    expect(snapshot.profile.currentLocation).toBe("New York, NY");
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

  test("retains the latest import run summary and unresolved candidate previews", async () => {
    const { workspaceService } = createWorkspaceServiceHarness({
      seed: {
        ...createSeed(),
        profile: {
          ...createSeed().profile,
          baseResume: {
            ...createSeed().profile.baseResume,
            extractionStatus: "not_started",
            lastAnalyzedAt: null,
            textContent:
              "Alex Vanguard\nFrontend Engineer\nBerlin, Germany\nalex@example.com\nBuilds resilient workflows for product teams.",
          },
        },
      },
    });

    const snapshot = await workspaceService.analyzeProfileFromResume();

    expect(snapshot.latestResumeImportRun?.status).toBe("review_ready");
    expect(snapshot.latestResumeImportRun?.candidateCounts.autoApplied).toBeGreaterThan(0);
    expect(snapshot.latestResumeImportReviewCandidates.length).toBeGreaterThan(0);
    expect(snapshot.latestResumeImportReviewCandidates[0]?.label).toBeTruthy();
  });

  test("maps unresolved import candidates into persisted profile setup review items", async () => {
    const { workspaceService } = createWorkspaceServiceHarness({
      seed: {
        ...createSeed(),
        profile: {
          ...createSeed().profile,
          experiences: [],
          targetRoles: [],
          baseResume: {
            ...createSeed().profile.baseResume,
            extractionStatus: "not_started",
            lastAnalyzedAt: null,
            textContent:
              "Alex Vanguard\nFrontend Engineer\nBerlin, Germany\nalex@example.com\nBuilds resilient workflows for product teams.",
          },
        },
        searchPreferences: {
          ...createSeed().searchPreferences,
          targetRoles: [],
          jobFamilies: [],
          locations: [],
          workModes: [],
        },
        profileSetupState: {
          status: "not_started",
          currentStep: "import",
          completedAt: null,
          reviewItems: [],
          lastResumedAt: null,
        },
      },
    });

    const snapshot = await workspaceService.analyzeProfileFromResume();

    expect(snapshot.profileSetupState.reviewItems.map((item) => item.label)).toEqual(
      expect.arrayContaining(["Headline", "Work history"]),
    );
    expect(
      snapshot.profileSetupState.reviewItems.find((item) => item.label === "Headline"),
    ).toEqual(
      expect.objectContaining({
        status: "pending",
        step: "essentials",
      }),
    );
  });

  test("reopens a previously resolved setup review item when the underlying field is cleared", async () => {
    const seed = createSeed();
    const latestRunId = "resume_import_run_email_reopen";
    const { workspaceService } = createWorkspaceServiceHarness({
      seed: {
        ...seed,
        profile: {
          ...seed.profile,
          email: "alex@example.com",
        },
        profileSetupState: {
          status: "in_progress",
          currentStep: "answers",
          completedAt: null,
          reviewItems: [
            {
              id: "review_email",
              step: "essentials",
              target: {
                domain: "identity",
                key: "email",
                recordId: null,
              },
              label: "Email",
              reason: "Confirm the imported email before setup is complete.",
              severity: "recommended",
              status: "confirmed",
              proposedValue: "alex@example.com",
              sourceSnippet: "alex@example.com",
              sourceCandidateId: null,
              sourceRunId: null,
              createdAt: "2026-04-11T10:00:00.000Z",
              resolvedAt: "2026-04-11T10:05:00.000Z",
            },
          ],
          lastResumedAt: null,
        },
        resumeImportRuns: [
          {
            id: latestRunId,
            sourceResumeId: seed.profile.baseResume.id,
            sourceResumeFileName: seed.profile.baseResume.fileName,
            trigger: "refresh",
            status: "review_ready",
            startedAt: "2026-04-11T10:00:00.000Z",
            completedAt: "2026-04-11T10:04:00.000Z",
            primaryParserKind: "plain_text",
            parserKinds: ["plain_text"],
            analysisProviderKind: "deterministic",
            analysisProviderLabel: "Test AI",
            warnings: [],
            errorMessage: null,
            candidateCounts: {
              total: 1,
              autoApplied: 0,
              needsReview: 1,
              rejected: 0,
              abstained: 0,
            },
          },
        ],
        resumeImportFieldCandidates: [
          {
            id: "candidate_email_reopen",
            runId: latestRunId,
            target: {
              section: "contact",
              key: "email",
              recordId: null,
            },
            label: "Email",
            sourceKind: "model_identity_summary",
            value: "alex@example.com",
            normalizedValue: null,
            valuePreview: "alex@example.com",
            evidenceText: "alex@example.com",
            sourceBlockIds: [],
            confidence: 0.88,
            confidenceBreakdown: {
              overall: 0.88,
              parserQuality: 0.92,
              evidenceQuality: 0.9,
              agreementScore: 0.86,
              normalizationRisk: 0.04,
              conflictRisk: 0.08,
              fieldSensitivity: "medium",
              recommendation: "needs_review",
            },
            notes: [],
            alternatives: [],
            resolution: "needs_review",
            resolutionReason: null,
            createdAt: "2026-04-11T10:02:00.000Z",
            resolvedAt: null,
          },
        ],
      },
    });

    await workspaceService.saveProfile({
      ...seed.profile,
      email: null,
    });
    const snapshot = await workspaceService.getWorkspaceSnapshot();
    const emailReviewItem = snapshot.profileSetupState.reviewItems.find(
      (item) => item.label === "Email",
    );

    expect(snapshot.profileSetupState.currentStep).toBe("answers");
    expect(emailReviewItem?.status).toBe("pending");
  });
});
