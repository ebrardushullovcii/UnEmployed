import { describe, expect, test } from "vitest";
import {
  ApplicationAttemptSchema,
  ApplicationStatusSchema,
  CandidateProfileSchema,
  DesktopWindowControlsStateSchema,
  DiscoveryRunResultSchema,
  JobFinderWorkspaceSnapshotSchema,
  JobSearchPreferencesSchema,
  SourceDebugRunRecordSchema,
  SourceInstructionArtifactSchema,
  applicationStatusValues,
} from "./index";

describe("contracts", () => {
  test("supports the full application status list", () => {
    expect(applicationStatusValues).toContain("submitted");
    expect(ApplicationStatusSchema.parse("interview")).toBe("interview");
  });

  test("parses an expanded candidate profile", () => {
    const profile = CandidateProfileSchema.parse({
      id: "candidate_1",
      firstName: "Alex",
      lastName: "Vanguard",
      middleName: null,
      fullName: "Alex Vanguard",
      headline: "Full-stack engineer",
      summary: "Builds reliable user-facing systems.",
      currentLocation: "London, UK",
      yearsExperience: 8,
      baseResume: {
        id: "resume_1",
        fileName: "alex-vanguard.pdf",
        uploadedAt: "2026-03-20T10:00:00.000Z",
        storagePath: "/tmp/alex-vanguard.pdf",
      },
      targetRoles: ["Frontend Engineer"],
      experiences: [],
      education: [],
      certifications: [],
      links: [],
      projects: [],
      spokenLanguages: [],
    });

    expect(profile.baseResume.storagePath).toBe("/tmp/alex-vanguard.pdf");
    expect(profile.baseResume.extractionStatus).toBe("not_started");
    expect(profile.email).toBeNull();
    expect(profile.locations).toEqual([]);
    expect(profile.skills).toEqual([]);
    expect(profile.experiences).toEqual([]);
    expect(profile.education).toEqual([]);
  });

  test("applies defaults for job search preferences", () => {
    const preferences = JobSearchPreferencesSchema.parse({
      approvalMode: "review_before_submit",
      tailoringMode: "balanced",
      minimumSalaryUsd: null,
    });

    expect(preferences.companyBlacklist).toEqual([]);
    expect(preferences.workModes).toEqual([]);
  });

  test("parses discovery targets with optional custom instructions", () => {
    const preferences = JobSearchPreferencesSchema.parse({
      approvalMode: "review_before_submit",
      tailoringMode: "balanced",
      minimumSalaryUsd: null,
      discovery: {
        targets: [
          {
            id: "target_1",
            label: "Primary target",
            startingUrl: "https://jobs.example.com/search",
            enabled: true,
            adapterKind: "auto",
            customInstructions:
              "Open the job cards from the homepage list before extracting details.",
          },
        ],
      },
    });

    expect(preferences.discovery.targets[0]?.customInstructions).toBe(
      "Open the job cards from the homepage list before extracting details.",
    );
    expect(preferences.discovery.targets[0]?.instructionStatus).toBe("missing");
    expect(preferences.discovery.targets[0]?.validatedInstructionId).toBeNull();
  });

  test("rejects malformed link metadata and url fields", () => {
    expect(() =>
      CandidateProfileSchema.parse({
        id: "candidate_1",
        firstName: "Alex",
        lastName: "Vanguard",
        middleName: null,
        fullName: "Alex Vanguard",
        headline: "Full-stack engineer",
        summary: "Builds reliable user-facing systems.",
        currentLocation: "London, UK",
        yearsExperience: 8,
        baseResume: {
          id: "resume_1",
          fileName: "alex-vanguard.pdf",
          uploadedAt: "2026-03-20T10:00:00.000Z",
          storagePath: "/tmp/alex-vanguard.pdf",
        },
        links: [
          {
            id: "link_1",
            label: "Portfolio",
            url: "not-a-url",
            kind: "custom",
          },
        ],
      }),
    ).toThrow();
  });

  test("parses a discovery run result and application attempt", () => {
    const discovery = DiscoveryRunResultSchema.parse({
      source: "target_site",
      startedAt: "2026-03-20T10:00:00.000Z",
      completedAt: "2026-03-20T10:01:00.000Z",
      querySummary: "Designer | Remote | remote",
      warning: null,
      agentMetadata: {
        transcriptMessageCount: 8,
        compactionState: {
          compactedAt: "2026-03-20T10:00:30.000Z",
          compactionCount: 1,
          summary: "Compacted execution summary.",
          confirmedFacts: ["Visited 3 pages."],
          blockerNotes: [],
          avoidStrategyFingerprints: [
            "search_filter_probe:target_site:search filter probe",
          ],
          preservedContext: ["Senior Product Designer at Signal Systems"],
        },
        debugFindings: {
          summary:
            "Keyword search on the jobs route returned stable detail pages.",
          reliableControls: ["Keyword search box on the jobs route"],
          trickyFilters: [
            "Homepage category chips did not reliably change the result set",
          ],
          navigationTips: [
            "Open the job card detail page to recover the canonical listing URL",
          ],
          applyTips: [],
          warnings: [],
        },
      },
      jobs: [
        {
          source: "target_site",
          sourceJobId: "target_job_1",
          canonicalUrl: "https://jobs.example.com/roles/target_job_1",
          title: "Senior Product Designer",
          company: "Signal Systems",
          location: "Remote",
          workMode: "remote",
          applyPath: "easy_apply",
          easyApplyEligible: true,
          postedAt: "2026-03-20T09:00:00.000Z",
          discoveredAt: "2026-03-20T10:01:00.000Z",
          salaryText: "$180k - $220k",
          summary: "Own the design system.",
          description: "Own the design system and workflow platform.",
          keySkills: ["Figma"],
        },
      ],
    });

    const attempt = ApplicationAttemptSchema.parse({
      id: "attempt_1",
      jobId: "job_1",
      state: "submitted",
      summary: "Easy Apply submitted",
      detail: "Submitted successfully.",
      startedAt: "2026-03-20T10:02:00.000Z",
      updatedAt: "2026-03-20T10:03:00.000Z",
      completedAt: "2026-03-20T10:03:00.000Z",
      outcome: "submitted",
      nextActionLabel: "Monitor inbox",
      checkpoints: [
        {
          id: "checkpoint_1",
          at: "2026-03-20T10:03:00.000Z",
          label: "Submission confirmed",
          detail: "The supported path completed successfully.",
          state: "submitted",
        },
      ],
    });

    expect(discovery.jobs[0]?.easyApplyEligible).toBe(true);
    expect(discovery.jobs[0]?.workMode).toEqual(["remote"]);
    expect(discovery.agentMetadata?.compactionState?.compactionCount).toBe(1);
    expect(
      discovery.agentMetadata?.debugFindings?.reliableControls[0],
    ).toContain("Keyword search box");
    expect(attempt.checkpoints[0]?.state).toBe("submitted");
  });

  test("parses source-debug runs and instruction artifacts", () => {
    const run = SourceDebugRunRecordSchema.parse({
      id: "source_debug_run_1",
      targetId: "target_1",
      state: "completed",
      startedAt: "2026-03-20T10:00:00.000Z",
      updatedAt: "2026-03-20T10:02:00.000Z",
      completedAt: "2026-03-20T10:02:00.000Z",
      activePhase: null,
      phases: [
        "access_auth_probe",
        "site_structure_mapping",
        "search_filter_probe",
        "job_detail_validation",
        "apply_path_validation",
        "replay_verification",
      ],
      targetLabel: "KosovaJob",
      targetUrl: "https://kosovajob.com/",
      targetHostname: "kosovajob.com",
      manualPrerequisiteSummary: null,
      finalSummary: "Replay verification reached jobs again.",
      attemptIds: ["source_debug_attempt_1"],
      phaseSummaries: [],
      instructionArtifactId: "source_instruction_1",
    });
    const artifact = SourceInstructionArtifactSchema.parse({
      id: "source_instruction_1",
      targetId: "target_1",
      status: "validated",
      createdAt: "2026-03-20T10:01:00.000Z",
      updatedAt: "2026-03-20T10:02:00.000Z",
      acceptedAt: "2026-03-20T10:02:00.000Z",
      basedOnRunId: run.id,
      basedOnAttemptIds: ["source_debug_attempt_1"],
      notes: "Validated source guidance.",
      navigationGuidance: ["Start from https://kosovajob.com/."],
      searchGuidance: ["Use the jobs listing path."],
      detailGuidance: ["Prefer stable job detail URLs."],
      applyGuidance: [
        "Prefer the inline apply button when the source exposes it.",
      ],
      warnings: [],
      versionInfo: {
        promptProfileVersion: "source-debug-v1",
        toolsetVersion: "browser-tools-v1",
        adapterVersion: "target_site",
        appSchemaVersion: "job-finder-source-debug-v1",
      },
      verification: {
        id: "source_instruction_verification_1",
        replayRunId: run.id,
        verifiedAt: "2026-03-20T10:02:00.000Z",
        outcome: "passed",
        proofSummary: "Replay verification reached jobs again.",
        reason: null,
        versionInfo: {
          promptProfileVersion: "source-debug-v1",
          toolsetVersion: "browser-tools-v1",
          adapterVersion: "target_site",
          appSchemaVersion: "job-finder-source-debug-v1",
        },
      },
    });

    expect(run.state).toBe("completed");
    expect(artifact.status).toBe("validated");
  });

  test("parses a job finder workspace snapshot", () => {
    const attempt = ApplicationAttemptSchema.parse({
      id: "attempt_1",
      jobId: "job_1",
      state: "submitted",
      summary: "Easy Apply submitted",
      detail: "Submitted successfully.",
      startedAt: "2026-03-20T10:02:00.000Z",
      updatedAt: "2026-03-20T10:03:00.000Z",
      completedAt: "2026-03-20T10:03:00.000Z",
      outcome: "submitted",
      nextActionLabel: "Monitor inbox",
      checkpoints: [
        {
          id: "checkpoint_1",
          at: "2026-03-20T10:03:00.000Z",
          label: "Submission confirmed",
          detail: "The supported path completed successfully.",
          state: "submitted",
        },
      ],
    });

    const workspace = JobFinderWorkspaceSnapshotSchema.parse({
      module: "job-finder",
      generatedAt: "2026-03-20T10:05:00.000Z",
      agentProvider: {
        kind: "deterministic",
        ready: true,
        label: "Built-in deterministic agent fallback",
        model: null,
        baseUrl: null,
        detail: "Tests",
      },
      availableResumeTemplates: [
        {
          id: "classic_ats",
          label: "Classic ATS",
          description: "Single-column and ATS-friendly.",
        },
      ],
      profile: {
        id: "candidate_1",
        firstName: "Alex",
        lastName: "Vanguard",
        middleName: null,
        fullName: "Alex Vanguard",
        headline: "Senior systems designer",
        summary: "Builds resilient workflows.",
        currentLocation: "London, UK",
        yearsExperience: 10,
        email: "alex@example.com",
        phone: null,
        portfolioUrl: null,
        linkedinUrl: null,
        baseResume: {
          id: "resume_1",
          fileName: "alex-vanguard.pdf",
          uploadedAt: "2026-03-20T10:00:00.000Z",
          storagePath: "/tmp/alex-vanguard.pdf",
          textContent: "Resume text",
          textUpdatedAt: "2026-03-20T10:00:00.000Z",
          extractionStatus: "ready",
          lastAnalyzedAt: "2026-03-20T10:01:00.000Z",
          analysisProviderKind: null,
          analysisProviderLabel: null,
          analysisWarnings: [],
        },
        targetRoles: ["Principal Designer"],
        locations: ["Remote"],
        skills: ["Figma", "React"],
        experiences: [
          {
            id: "experience_1",
            companyName: "Signal Systems",
            companyUrl: null,
            title: "Senior Product Designer",
            employmentType: "Full-time",
            location: "London, UK",
            workMode: "hybrid",
            startDate: "2021-01",
            endDate: null,
            isCurrent: true,
            summary: "Owns workflow tooling and design systems.",
            achievements: ["Improved designer-engineer handoff quality"],
            skills: ["Figma", "Design Systems"],
            domainTags: [],
            peopleManagementScope: null,
            ownershipScope: null,
          },
        ],
        education: [
          {
            id: "education_1",
            schoolName: "University of the Arts London",
            degree: "BA",
            fieldOfStudy: "Interaction Design",
            location: "London, UK",
            startDate: "2010-09",
            endDate: "2013-06",
            summary: null,
          },
        ],
        certifications: [
          {
            id: "certification_1",
            name: "UX Certification",
            issuer: "NN/g",
            issueDate: "2020-04",
            expiryDate: null,
            credentialUrl: null,
          },
        ],
        links: [
          {
            id: "link_1",
            label: "Portfolio",
            url: "https://alex.example.com",
            kind: "portfolio",
          },
        ],
        projects: [],
        spokenLanguages: [],
      },
      searchPreferences: {
        targetRoles: ["Principal Designer"],
        jobFamilies: [],
        locations: ["Remote"],
        excludedLocations: [],
        workModes: ["remote"],
        seniorityLevels: ["senior"],
        targetIndustries: [],
        targetCompanyStages: [],
        employmentTypes: [],
        minimumSalaryUsd: 170000,
        targetSalaryUsd: null,
        salaryCurrency: "USD",
        approvalMode: "review_before_submit",
        tailoringMode: "balanced",
        companyBlacklist: [],
        companyWhitelist: [],
      },
      browserSession: {
        source: "target_site",
        status: "ready",
        driver: "catalog_seed",
        label: "Browser session ready",
        detail: "Validated recently.",
        lastCheckedAt: "2026-03-20T10:04:00.000Z",
      },
      discoveryJobs: [
        {
          id: "job_1",
          source: "target_site",
          sourceJobId: "target_job_1",
          discoveryMethod: "catalog_seed",
          canonicalUrl: "https://jobs.example.com/roles/target_job_1",
          title: "Senior Product Designer",
          company: "Signal Systems",
          location: "Remote",
          workMode: "remote",
          applyPath: "easy_apply",
          easyApplyEligible: true,
          postedAt: "2026-03-20T09:00:00.000Z",
          discoveredAt: "2026-03-20T10:01:00.000Z",
          salaryText: "$180k - $220k",
          summary: "Own the design system.",
          description: "Own the design system and workflow platform.",
          keySkills: ["Figma"],
          status: "ready_for_review",
          matchAssessment: {
            score: 96,
            reasons: ["Strong product design overlap"],
            gaps: [],
          },
        },
      ],
      activeSourceDebugRun: {
        id: "source_debug_run_1",
        targetId: "target_1",
        state: "paused_manual",
        startedAt: "2026-03-20T10:00:00.000Z",
        updatedAt: "2026-03-20T10:01:00.000Z",
        completedAt: "2026-03-20T10:01:00.000Z",
        activePhase: "access_auth_probe",
        phases: [
          "access_auth_probe",
          "site_structure_mapping",
          "search_filter_probe",
          "job_detail_validation",
          "apply_path_validation",
          "replay_verification",
        ],
        targetLabel: "KosovaJob",
        targetUrl: "https://kosovajob.com/",
        targetHostname: "kosovajob.com",
        manualPrerequisiteSummary: "Please sign in first.",
        finalSummary: "Manual login is required before debugging can continue.",
        attemptIds: ["source_debug_attempt_1"],
        phaseSummaries: [],
        instructionArtifactId: null,
      },
      recentSourceDebugRuns: [],
      selectedDiscoveryJobId: "job_1",
      reviewQueue: [
        {
          jobId: "job_1",
          title: "Senior Product Designer",
          company: "Signal Systems",
          location: "Remote",
          matchScore: 96,
          applicationStatus: "ready_for_review",
          assetStatus: "ready",
          progressPercent: 100,
          resumeAssetId: "asset_1",
          updatedAt: "2026-03-20T10:03:00.000Z",
        },
      ],
      selectedReviewJobId: "job_1",
      tailoredAssets: [
        {
          id: "asset_1",
          jobId: "job_1",
          kind: "resume",
          status: "ready",
          label: "Tailored Resume",
          version: "v1",
          templateName: "Classic ATS",
          compatibilityScore: 98,
          progressPercent: 100,
          updatedAt: "2026-03-20T10:03:00.000Z",
          storagePath: null,
          contentText: "Tailored resume body",
          generationMethod: "ai_assisted",
          notes: ["Generated from stored resume text."],
          previewSections: [
            {
              heading: "Summary",
              lines: ["Lead cross-functional UX systems work."],
            },
          ],
        },
      ],
      applicationRecords: [
        {
          id: "application_1",
          jobId: "job_5",
          title: "Lead Product Designer",
          company: "Northwind Labs",
          status: "interview",
          lastActionLabel: "Technical screen scheduled",
          nextActionLabel: "Join meeting",
          lastUpdatedAt: "2026-03-20T10:04:00.000Z",
          lastAttemptState: "submitted",
          events: [
            {
              id: "event_1",
              at: "2026-03-20T10:04:00.000Z",
              title: "Technical screen scheduled",
              detail: "Interview confirmed for tomorrow.",
              emphasis: "positive",
            },
          ],
        },
      ],
      applicationAttempts: [attempt],
      selectedApplicationRecordId: "application_1",
      settings: {
        resumeFormat: "html",
        resumeTemplateId: "classic_ats",
        fontPreset: "inter_requisite",
        humanReviewRequired: true,
        allowAutoSubmitOverride: false,
        keepSessionAlive: true,
      },
    });

    expect(workspace.discoveryJobs).toHaveLength(1);
    expect(workspace.profile.experiences[0]?.workMode).toEqual(["hybrid"]);
    expect(workspace.discoveryJobs[0]?.workMode).toEqual(["remote"]);
    expect(workspace.reviewQueue[0]?.assetStatus).toBe("ready");
    expect(workspace.applicationAttempts[0]?.state).toBe("submitted");
    expect(workspace.activeSourceDebugRun?.state).toBe("paused_manual");
  });

  test("parses desktop window controls state", () => {
    const controlsState = DesktopWindowControlsStateSchema.parse({
      isMaximized: false,
      isMinimizable: true,
      isClosable: true,
    });

    expect(controlsState.isClosable).toBe(true);
  });
});
