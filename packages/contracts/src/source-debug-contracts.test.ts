import { describe, expect, test } from "vitest";
import {
  ApplicationAttemptSchema,
  DiscoveryRunResultSchema,
  JobFinderPerformanceSnapshotSchema,
  SourceDebugEvidenceRefSchema,
  SourceDebugProgressEventSchema,
  SourceDebugRunRecordSchema,
  SourceInstructionArtifactSchema,
  SourceInstructionVerificationSchema,
} from "./index";
import {
  createSubmittedAttempt,
  sourceDebugVersionInfo,
} from "./test-fixtures";

describe("contracts source-debug schemas", () => {
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
          postedAtText: null,
          discoveredAt: "2026-03-20T10:01:00.000Z",
          salaryText: "$180k - $220k",
          summary: "Own the design system.",
          description: "Own the design system and workflow platform.",
          keySkills: ["Figma"],
          responsibilities: [],
          minimumQualifications: [],
          preferredQualifications: [],
          seniority: null,
          employmentType: null,
          department: null,
          team: null,
          employerWebsiteUrl: null,
          employerDomain: null,
          benefits: [],
        },
      ],
    });

    const attempt = ApplicationAttemptSchema.parse(createSubmittedAttempt());

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
      phaseSummaries: [
        {
          phase: "replay_verification",
          summary: "Replay verification reached jobs again.",
          completionMode: "structured_finish",
          completionReason: null,
          confirmedFacts: [],
          blockerNotes: [],
          nextRecommendedStrategies: [],
          avoidStrategyFingerprints: [],
          producedAttemptIds: ["source_debug_attempt_1"],
          timing: {
            totalDurationMs: 60000,
            firstProgressMs: 500,
            longestGapMs: 12000,
            eventCount: 4,
            waitReasonDurations: [
              {
                waitReason: "waiting_on_ai",
                durationMs: 30000,
              },
              {
                waitReason: "executing_tool",
                durationMs: 30000,
              },
            ],
          },
        },
      ],
      instructionArtifactId: "source_instruction_1",
      timing: {
        totalDurationMs: 120000,
        firstProgressMs: 250,
        longestGapMs: 18000,
        eventCount: 9,
        browserSetupMs: 1500,
        finalReviewMs: 22000,
        finalizationMs: 9000,
        waitReasonDurations: [
          {
            waitReason: "starting_browser",
            durationMs: 1500,
          },
          {
            waitReason: "waiting_on_ai",
            durationMs: 60000,
          },
          {
            waitReason: "finalizing",
            durationMs: 9000,
          },
        ],
      },
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
      versionInfo: sourceDebugVersionInfo,
      verification: {
        id: "source_instruction_verification_1",
        replayRunId: run.id,
        verifiedAt: "2026-03-20T10:02:00.000Z",
        outcome: "passed",
        proofSummary: "Replay verification reached jobs again.",
        reason: null,
        versionInfo: sourceDebugVersionInfo,
      },
    });

    expect(run.state).toBe("completed");
    expect(artifact.status).toBe("validated");
  });

  test("parses test-only performance snapshots", () => {
    const snapshot = JobFinderPerformanceSnapshotSchema.parse({
      generatedAt: "2026-03-20T10:02:00.000Z",
      latestDiscoveryRun: null,
      latestSourceDebugRun: null,
    });

    expect(snapshot.generatedAt).toBe("2026-03-20T10:02:00.000Z");
  });

  test("parses live source-debug progress events", () => {
    const progressEvent = SourceDebugProgressEventSchema.parse({
      runId: "source_debug_run_1",
      targetId: "target_1",
      phase: "search_filter_probe",
      waitReason: "waiting_on_ai",
      timestamp: "2026-03-20T10:01:30.000Z",
      elapsedMs: 90000,
      lastActivityAt: "2026-03-20T10:01:30.000Z",
      message:
        "Search filter probe is running. Waiting on AI to choose the next browser action.",
      currentUrl: "https://jobs.example.com/search",
      stepCount: 4,
      jobsFound: 2,
    });

    expect(progressEvent.waitReason).toBe("waiting_on_ai");
    expect(progressEvent.phase).toBe("search_filter_probe");
  });

  test("rejects impossible validated source-instruction lifecycle states", () => {
    expect(() =>
      SourceInstructionArtifactSchema.parse({
        id: "source_instruction_invalid",
        targetId: "target_1",
        status: "validated",
        createdAt: "2026-03-20T10:01:00.000Z",
        updatedAt: "2026-03-20T10:02:00.000Z",
        acceptedAt: null,
        basedOnRunId: "source_debug_run_1",
        basedOnAttemptIds: ["source_debug_attempt_1"],
        notes: null,
        navigationGuidance: ["Use the jobs route first."],
        searchGuidance: [],
        detailGuidance: [],
        applyGuidance: [],
        warnings: [],
        versionInfo: sourceDebugVersionInfo,
        verification: {
          id: "source_instruction_verification_invalid",
          replayRunId: null,
          verifiedAt: null,
          outcome: "unverified",
          proofSummary: null,
          reason: null,
          versionInfo: sourceDebugVersionInfo,
        },
      }),
    ).toThrow();
  });

  test("rejects impossible source-debug run lifecycle states", () => {
    expect(() =>
      SourceDebugRunRecordSchema.parse({
        id: "source_debug_run_invalid",
        targetId: "target_1",
        state: "completed",
        startedAt: "2026-03-20T10:00:00.000Z",
        updatedAt: "2026-03-20T10:02:00.000Z",
        completedAt: null,
        activePhase: "replay_verification",
        phases: ["replay_verification"],
        targetLabel: "KosovaJob",
        targetUrl: "https://kosovajob.com/",
        targetHostname: "kosovajob.com",
        manualPrerequisiteSummary: null,
        finalSummary: "Done",
        attemptIds: ["source_debug_attempt_1"],
        phaseSummaries: [],
        instructionArtifactId: "source_instruction_1",
      }),
    ).toThrow();
  });

  test("requires evidence-specific fields for source-debug evidence refs", () => {
    expect(
      SourceDebugEvidenceRefSchema.parse({
        id: "source_debug_evidence_url",
        runId: "source_debug_run_1",
        attemptId: "source_debug_attempt_1",
        targetId: "target_1",
        phase: "job_detail_validation",
        kind: "url",
        label: "Validated job detail",
        capturedAt: "2026-03-20T10:01:15.000Z",
        url: "https://jobs.example.com/roles/1",
        storagePath: null,
        excerpt: "Stable target-site job detail URL.",
      }).kind,
    ).toBe("url");

    expect(() =>
      SourceDebugEvidenceRefSchema.parse({
        id: "source_debug_evidence_note_invalid",
        runId: "source_debug_run_1",
        attemptId: "source_debug_attempt_1",
        targetId: "target_1",
        phase: "job_detail_validation",
        kind: "note",
        label: "Missing excerpt",
        capturedAt: "2026-03-20T10:01:15.000Z",
        url: null,
        storagePath: null,
        excerpt: null,
      }),
    ).toThrow();
  });

  test("requires replay metadata for verified source-instruction outcomes", () => {
    expect(() =>
      SourceInstructionVerificationSchema.parse({
        id: "source_instruction_verification_invalid",
        replayRunId: null,
        verifiedAt: null,
        outcome: "passed",
        proofSummary: null,
        reason: null,
        versionInfo: sourceDebugVersionInfo,
      }),
    ).toThrow();
  });
});
