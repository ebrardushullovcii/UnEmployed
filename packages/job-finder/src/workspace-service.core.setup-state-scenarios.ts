import { describe, expect, test } from "vitest";
import {
  createSeed,
  createWorkspaceServiceHarness,
} from "./workspace-service.test-support";

describe("createJobFinderWorkspaceService", () => {
  test("builds a snapshot with derived review queue ordering", async () => {
    const { workspaceService } = createWorkspaceServiceHarness();

    const snapshot = await workspaceService.getWorkspaceSnapshot();

    expect(snapshot.discoveryJobs).toHaveLength(2);
    expect(snapshot.reviewQueue).toHaveLength(2);
    expect(snapshot.reviewQueue[0]?.jobId).toBe("job_ready");
    expect(snapshot.reviewQueue[1]?.assetStatus).toBe("generating");
    expect(snapshot.profileSetupState.status).toBe("completed");
  });

  test("derives fresh setup state for seeded first-run workspaces", async () => {
    const { workspaceService } = createWorkspaceServiceHarness({
      seed: {
        ...createSeed(),
        profile: {
          ...createSeed().profile,
          id: "candidate_fresh_start",
          firstName: "New",
          lastName: "Candidate",
          fullName: "New Candidate",
          headline: "Import your resume to begin",
          currentLocation: "Set your preferred location",
          email: null,
          phone: null,
          narrative: {
            professionalStory: null,
            nextChapterSummary: null,
            careerTransitionSummary: null,
            differentiators: [],
            motivationThemes: [],
          },
          proofBank: [],
          answerBank: {
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
          },
          applicationIdentity: {
            preferredEmail: null,
            preferredPhone: null,
            preferredLinkIds: [],
          },
          targetRoles: [],
          experiences: [],
          projects: [],
          baseResume: {
            ...createSeed().profile.baseResume,
            textContent: null,
            extractionStatus: "needs_text",
            lastAnalyzedAt: null,
          },
        },
        searchPreferences: {
          ...createSeed().searchPreferences,
          targetRoles: [],
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

    const snapshot = await workspaceService.getWorkspaceSnapshot();

    expect(snapshot.profileSetupState.status).toBe("not_started");
    expect(snapshot.profileSetupState.currentStep).toBe("import");
  });

  test("persists an explicit in-progress setup step while the profile remains incomplete", async () => {
    const { workspaceService } = createWorkspaceServiceHarness({
      seed: {
        ...createSeed(),
        profile: {
          ...createSeed().profile,
          experiences: [],
          projects: [],
        },
        searchPreferences: {
          ...createSeed().searchPreferences,
          targetRoles: [],
          locations: [],
          workModes: [],
        },
        profileSetupState: {
          status: "in_progress",
          currentStep: "narrative",
          completedAt: null,
          reviewItems: [],
          lastResumedAt: null,
        },
      },
    });

    const updatedSnapshot = await workspaceService.saveProfileSetupState({
      status: "in_progress",
      currentStep: "answers",
      completedAt: null,
      reviewItems: [],
      lastResumedAt: "2026-04-11T12:00:00.000Z",
    });

    expect(updatedSnapshot.profileSetupState.status).toBe("in_progress");
    expect(updatedSnapshot.profileSetupState.currentStep).toBe("answers");
    expect(updatedSnapshot.profileSetupState.lastResumedAt).toBe(
      "2026-04-11T12:00:00.000Z",
    );
  });

  test("derives persistent setup review items from unresolved import candidates", async () => {
    const { workspaceService } = createWorkspaceServiceHarness({
      seed: {
        ...createSeed(),
        profile: {
          ...createSeed().profile,
          experiences: [],
          targetRoles: [],
          baseResume: {
            ...createSeed().profile.baseResume,
            textContent: [
              "Jamie Rivers",
              "Senior Product Designer",
              "Berlin, Germany",
              "jamie@example.com",
              "+49 555 1234",
            ].join("\n"),
            extractionStatus: "not_started",
            lastAnalyzedAt: null,
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

    expect(snapshot.profileSetupState.status).toBe("in_progress");
    expect(snapshot.profileSetupState.reviewItems.some((item) => item.status === "pending")).toBe(true);
    expect(snapshot.profileSetupState.reviewItems.map((item) => item.label)).toEqual(
      expect.arrayContaining(["Headline", "Work history"]),
    );
  });

  test("reopens setup after completion when a later import produces blocking review items", async () => {
    const seed = createSeed();
    const { workspaceService } = createWorkspaceServiceHarness({
      seed: {
        ...seed,
        profileSetupState: {
          status: "completed",
          currentStep: "ready_check",
          completedAt: "2026-04-11T10:00:00.000Z",
          reviewItems: [],
          lastResumedAt: null,
        },
      },
    });

    const snapshot = await workspaceService.runResumeImport({
      baseResume: {
        ...seed.profile.baseResume,
        id: "resume_reopen_setup",
        fileName: "resume.txt",
        textContent: [
          "Jamie Rivers",
          "Senior Product Designer",
          "Berlin, Germany",
          "jamie@example.com",
        ].join("\n"),
      },
      documentBundle: {
        id: "bundle_reopen_setup",
        runId: "bundle_run_reopen_setup",
        sourceResumeId: "resume_reopen_setup",
        sourceFileKind: "plain_text",
        primaryParserKind: "plain_text",
        parserKinds: ["plain_text"],
        createdAt: "2026-04-11T10:10:00.000Z",
        warnings: [],
        languageHints: [],
        pages: [
          {
            pageNumber: 1,
            text: [
              "Jamie Rivers",
              "Senior Product Designer",
              "Berlin, Germany",
              "jamie@example.com",
            ].join("\n"),
            charCount: 68,
            parserKinds: ["plain_text"],
            usedOcr: false,
          },
        ],
        blocks: [
          {
            id: "block_1",
            pageNumber: 1,
            readingOrder: 0,
            text: "Jamie Rivers",
            kind: "heading",
            sectionHint: "identity",
            bbox: null,
            sourceParserKinds: ["plain_text"],
            sourceConfidence: 1,
          },
          {
            id: "block_2",
            pageNumber: 1,
            readingOrder: 1,
            text: "Senior Product Designer",
            kind: "paragraph",
            sectionHint: "summary",
            bbox: null,
            sourceParserKinds: ["plain_text"],
            sourceConfidence: 1,
          },
        ],
        fullText: [
          "Jamie Rivers",
          "Senior Product Designer",
          "Berlin, Germany",
          "jamie@example.com",
        ].join("\n"),
      },
    });

    expect(snapshot.profileSetupState.status).toBe("in_progress");
    expect(snapshot.profileSetupState.currentStep).toBe("essentials");
    expect(snapshot.profileSetupState.reviewItems.some((item) => item.status === "pending")).toBe(true);
  });
});
