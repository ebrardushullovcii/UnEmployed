import type { BrowserSessionRuntime } from "@unemployed/browser-runtime";
import type { DiscoveryActivityEvent } from "@unemployed/contracts";
import { describe, expect, test } from "vitest";
import {
  createAgentAiClient,
  createAgentBrowserRuntime,
  createSeed,
  createWorkspaceServiceHarness,
} from "./workspace-service.test-support";

function createDiscoveryOnlySeed() {
  return {
    ...createSeed(),
    settings: {
      resumeFormat: "html" as const,
      resumeTemplateId: "classic_ats" as const,
      fontPreset: "inter_requisite" as const,
      humanReviewRequired: true,
      allowAutoSubmitOverride: false,
      keepSessionAlive: true,
      discoveryOnly: true,
    },
    savedJobs: [],
    tailoredAssets: [],
    applicationRecords: [],
    applicationAttempts: [],
  };
}

describe("createJobFinderWorkspaceService", () => {
  test("builds a snapshot with derived review queue ordering", async () => {
    const { workspaceService } = createWorkspaceServiceHarness();

    const snapshot = await workspaceService.getWorkspaceSnapshot();

    expect(snapshot.discoveryJobs).toHaveLength(2);
    expect(snapshot.reviewQueue).toHaveLength(2);
    expect(snapshot.reviewQueue[0]?.jobId).toBe("job_ready");
    expect(snapshot.reviewQueue[1]?.assetStatus).toBe("generating");
  });

  test("runs discovery and upserts saved jobs from the adapter", async () => {
    const { workspaceService } = createWorkspaceServiceHarness({
      seed: {
        ...createSeed(),
        savedJobs: [],
        tailoredAssets: [],
        applicationRecords: [],
        applicationAttempts: [],
      },
    });

    const snapshot = await workspaceService.runDiscovery();

    expect(snapshot.discoveryJobs).toHaveLength(2);
    expect(snapshot.discoveryJobs[0]?.canonicalUrl).toContain(
      "linkedin_signal_ready",
    );
    expect(snapshot.discoveryJobs[0]?.matchAssessment.reasons.length).toBeGreaterThan(0);
  });

  test("discovery-only mode treats jobs as pending and does not persist to saved jobs", async () => {
    const { repository, workspaceService } = createWorkspaceServiceHarness({
      seed: createDiscoveryOnlySeed(),
    });

    const snapshot = await workspaceService.runDiscovery();

    expect(snapshot.discoveryJobs).toHaveLength(2);
    expect(snapshot.discoveryJobs[0]?.status).toBe("discovered");
    expect(snapshot.discoveryJobs[0]?.provenance).toHaveLength(1);
    expect(snapshot.reviewQueue).toHaveLength(0);
    await expect(repository.listSavedJobs()).resolves.toHaveLength(0);
    expect(snapshot.applicationRecords).toHaveLength(0);
    expect(snapshot.applicationAttempts).toHaveLength(0);

    const secondSnapshot = await workspaceService.runDiscovery();

    expect(secondSnapshot.discoveryJobs).toHaveLength(2);
    expect(
      secondSnapshot.discoveryJobs.filter(
        (job) => job.sourceJobId === "linkedin_signal_ready",
      ),
    ).toHaveLength(1);
    expect(secondSnapshot.discoveryJobs[0]?.provenance).toHaveLength(1);
    expect(secondSnapshot.reviewQueue).toHaveLength(0);
    await expect(repository.listSavedJobs()).resolves.toHaveLength(0);
  });

  test("agent discovery streams activity and keeps discovery-only jobs pending", async () => {
    const seed = createDiscoveryOnlySeed();
    const catalog = await createWorkspaceServiceHarness().browserRuntime.runDiscovery(
      "target_site",
      createSeed().searchPreferences,
    );
    const baseAgentRuntime = createAgentBrowserRuntime(catalog.jobs);
    let openSessionCalls = 0;
    let closeSessionCalls = 0;
    const browserRuntime: BrowserSessionRuntime = {
      ...baseAgentRuntime,
      openSession(source) {
        openSessionCalls += 1;
        return baseAgentRuntime.openSession(source);
      },
      closeSession(source) {
        closeSessionCalls += 1;
        return baseAgentRuntime.closeSession(source);
      },
    };
    const { repository, workspaceService } = createWorkspaceServiceHarness({
      seed,
      browserRuntime,
      aiClient: createAgentAiClient(),
    });
    const streamedEvents: DiscoveryActivityEvent[] = [];

    const snapshot = await workspaceService.runAgentDiscovery(
      (event) => {
        streamedEvents.push(event);
      },
      new AbortController().signal,
    );

    expect(streamedEvents.length).toBeGreaterThan(0);
    expect(streamedEvents.some((event) => event.kind === "progress")).toBe(true);
    expect(snapshot.discoveryJobs).toHaveLength(2);
    expect(snapshot.discoveryJobs.every((job) => job.status === "discovered")).toBe(
      true,
    );
    expect(snapshot.reviewQueue).toHaveLength(0);
    await expect(repository.listSavedJobs()).resolves.toHaveLength(0);
    expect(snapshot.applicationRecords).toHaveLength(0);
    expect(snapshot.applicationAttempts).toHaveLength(0);
    expect(openSessionCalls).toBe(1);
    expect(closeSessionCalls).toBe(1);
  });

  test("agent discovery abort keeps streamed activity and avoids persistence", async () => {
    const discoveryResult = await createWorkspaceServiceHarness().browserRuntime.runDiscovery(
      "target_site",
      createSeed().searchPreferences,
    );
    const { repository, workspaceService } = createWorkspaceServiceHarness({
      seed: createDiscoveryOnlySeed(),
      browserRuntime: createAgentBrowserRuntime(discoveryResult.jobs),
      aiClient: createAgentAiClient(),
    });
    const streamedEvents: DiscoveryActivityEvent[] = [];
    const controller = new AbortController();

    const snapshot = await workspaceService.runAgentDiscovery(
      (event) => {
        streamedEvents.push(event);
        if (event.kind === "progress") {
          controller.abort();
        }
      },
      controller.signal,
    );

    expect(streamedEvents.some((event) => event.kind === "progress")).toBe(true);
    expect(snapshot.discoveryJobs).toHaveLength(0);
    expect(snapshot.reviewQueue).toHaveLength(0);
    await expect(repository.listSavedJobs()).resolves.toHaveLength(0);
    expect(snapshot.applicationRecords).toHaveLength(0);
    expect(snapshot.applicationAttempts).toHaveLength(0);
  });

  test("generates a tailored resume and submits a supported Easy Apply attempt", async () => {
    const { workspaceService } = createWorkspaceServiceHarness();

    await workspaceService.generateResume("job_ready");
    const snapshot = await workspaceService.approveApply("job_ready");
    const tailoredAsset = snapshot.tailoredAssets.find(
      (asset) => asset.jobId === "job_ready",
    );

    expect(snapshot.discoveryJobs.some((job) => job.id === "job_ready")).toBe(false);
    expect(
      snapshot.applicationRecords.some((record) => record.jobId === "job_ready"),
    ).toBe(true);
    expect(snapshot.applicationAttempts[0]?.state).toBe("submitted");
    expect(tailoredAsset?.storagePath).toBe("/tmp/generated-resume.html");
  });

  test("pauses unsupported Easy Apply branches instead of submitting blindly", async () => {
    const seed = createSeed();
    seed.savedJobs.push({
      source: "target_site",
      sourceJobId: "linkedin_pause_case",
      discoveryMethod: "catalog_seed",
      canonicalUrl: "https://www.linkedin.com/jobs/view/linkedin_pause_case",
      id: "job_pause_case",
      title: "Principal UX Engineer",
      company: "Void Industries",
      location: "Remote",
      workMode: ["remote"],
      applyPath: "easy_apply",
      easyApplyEligible: true,
      postedAt: "2026-03-20T09:30:00.000Z",
      discoveredAt: "2026-03-20T10:04:00.000Z",
      salaryText: "$185k - $210k",
      summary: "Lead UI platform work.",
      description:
        "Lead UI platform work. Additional work authorization details are required during apply.",
      keySkills: ["React", "Design Systems"],
      status: "approved",
      matchAssessment: {
        score: 91,
        reasons: ["Strong UI platform overlap"],
        gaps: [],
      },
      provenance: [],
    });
    seed.tailoredAssets.push({
      id: "asset_pause_case",
      jobId: "job_pause_case",
      kind: "resume",
      status: "ready",
      label: "Tailored Resume",
      version: "v1",
      templateName: "Classic ATS",
      compatibilityScore: 94,
      progressPercent: 100,
      updatedAt: "2026-03-20T10:04:00.000Z",
      storagePath: null,
      contentText: "Resume text",
      previewSections: [],
      generationMethod: "deterministic",
      notes: [],
    });

    const { workspaceService } = createWorkspaceServiceHarness({ seed });

    const snapshot = await workspaceService.approveApply("job_pause_case");
    const applicationRecord = snapshot.applicationRecords.find(
      (record) => record.jobId === "job_pause_case",
    );

    expect(applicationRecord?.lastAttemptState).toBe("paused");
    expect(applicationRecord?.status).toBe("approved");
    expect(snapshot.applicationAttempts.some((attempt) => attempt.state === "paused")).toBe(
      true,
    );
  });
});
