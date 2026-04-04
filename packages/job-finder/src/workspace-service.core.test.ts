import type { BrowserSessionRuntime } from "@unemployed/browser-runtime";
import type { DiscoveryActivityEvent } from "@unemployed/contracts";
import { describe, expect, test } from "vitest";
import {
  createAgentAiClient,
  createAgentBrowserRuntime,
  createBrowserRuntime,
  createDocumentManager,
  createSeed,
  createWorkspaceServiceHarness,
} from "./workspace-service.test-support";

function createDiscoveryOnlySeed() {
  return {
    ...createSeed(),
    settings: {
      resumeFormat: "pdf" as const,
      resumeTemplateId: "classic_ats" as const,
      fontPreset: "inter_requisite" as const,
      humanReviewRequired: true,
      allowAutoSubmitOverride: false,
      keepSessionAlive: true,
      discoveryOnly: true,
    },
    savedJobs: [],
    tailoredAssets: [],
    resumeDrafts: [],
    resumeDraftRevisions: [],
    resumeExportArtifacts: [],
    resumeResearchArtifacts: [],
    resumeValidationResults: [],
    resumeAssistantMessages: [],
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
        resumeDrafts: [],
        resumeDraftRevisions: [],
        resumeExportArtifacts: [],
        resumeResearchArtifacts: [],
        resumeValidationResults: [],
        resumeAssistantMessages: [],
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
    const exportedSnapshot = await workspaceService.exportResumePdf("job_ready");
    const approvedExport = exportedSnapshot.resumeExportArtifacts.find(
      (artifact) => artifact.jobId === "job_ready",
    );

    expect(approvedExport).toBeTruthy();

    await workspaceService.approveResume("job_ready", approvedExport!.id);
    const snapshot = await workspaceService.approveApply("job_ready");
    const tailoredAsset = snapshot.tailoredAssets.find(
      (asset) => asset.jobId === "job_ready",
    );

    expect(snapshot.discoveryJobs.some((job) => job.id === "job_ready")).toBe(false);
    expect(
      snapshot.applicationRecords.some((record) => record.jobId === "job_ready"),
    ).toBe(true);
    expect(snapshot.applicationAttempts[0]?.state).toBe("submitted");
    expect(tailoredAsset?.storagePath).toBe("/tmp/generated-resume.pdf");
    expect(tailoredAsset?.notes).toEqual(
      expect.arrayContaining([
        "Generated PDF resume artifact generated-resume.pdf.",
        "Saved HTML debug render generated-resume.html.",
        "Generated PDF page count: 2.",
      ]),
    );
  });

  test("captures research artifacts and applies assistant resume patches", async () => {
    const { workspaceService } = createWorkspaceServiceHarness();

    await workspaceService.generateResume("job_ready");
    const beforeWorkspace = await workspaceService.getResumeWorkspace("job_ready");
    const messages = await workspaceService.sendResumeAssistantMessage(
      "job_ready",
      "Shorten the summary and tighten one experience bullet for ATS readability.",
    );
    const afterWorkspace = await workspaceService.getResumeWorkspace("job_ready");

    expect(beforeWorkspace.research.length).toBeGreaterThan(0);
    expect(messages.some((message) => message.role === "assistant")).toBe(true);
    expect(afterWorkspace.draft.updatedAt).not.toBe(beforeWorkspace.draft.updatedAt);
    expect(afterWorkspace.assistantMessages.at(-1)?.patches.length).toBeGreaterThan(0);
  });

  test("rejects resume approval when exported validation still has blocking errors", async () => {
    const { workspaceService } = createWorkspaceServiceHarness({
      documentManager: {
        ...createDocumentManager(),
        renderResumeArtifact() {
          return Promise.resolve({
            fileName: "generated-resume.pdf",
            storagePath: "/tmp/generated-resume.pdf",
            format: "pdf" as const,
            intermediateFileName: "generated-resume.html",
            intermediateStoragePath: "/tmp/generated-resume.html",
            pageCount: 3,
            warnings: [],
          });
        },
      },
    });

    await workspaceService.generateResume("job_ready");
    const exportedSnapshot = await workspaceService.exportResumePdf("job_ready");
    const exportedArtifact = exportedSnapshot.resumeExportArtifacts.find(
      (artifact) => artifact.jobId === "job_ready",
    );

    await expect(
      workspaceService.approveResume("job_ready", exportedArtifact!.id),
    ).rejects.toThrow(/blocking validation errors/i);
  });

  test("rejects resume approval when the export is older than the current draft state", async () => {
    const { workspaceService } = createWorkspaceServiceHarness();

    await workspaceService.generateResume("job_ready");
    const exportedSnapshot = await workspaceService.exportResumePdf("job_ready");
    const exportedArtifact = exportedSnapshot.resumeExportArtifacts.find(
      (artifact) => artifact.jobId === "job_ready",
    );

    const workspace = await workspaceService.getResumeWorkspace("job_ready");
    await workspaceService.saveResumeDraft({
      ...workspace.draft,
      sections: workspace.draft.sections.map((section, index) =>
        index === 0 && section.text
          ? { ...section, text: `${section.text} Updated after export.` }
          : section,
      ),
    });

    await expect(
      workspaceService.approveResume("job_ready", exportedArtifact!.id),
    ).rejects.toThrow(/older than the current draft/i);
  });

  test("clears previous approved export flags after the approved draft changes", async () => {
    const { workspaceService } = createWorkspaceServiceHarness();

    await workspaceService.generateResume("job_ready");
    const exportedSnapshot = await workspaceService.exportResumePdf("job_ready");
    const approvedExport = exportedSnapshot.resumeExportArtifacts.find(
      (artifact) => artifact.jobId === "job_ready",
    );

    expect(approvedExport).toBeTruthy();

    await workspaceService.approveResume("job_ready", approvedExport!.id);

    const workspace = await workspaceService.getResumeWorkspace("job_ready");
    await workspaceService.saveResumeDraft({
      ...workspace.draft,
      sections: workspace.draft.sections.map((section, index) =>
        index === 0 && section.text
          ? { ...section, text: `${section.text} Edited after approval.` }
          : section,
      ),
    });

    const staleWorkspace = await workspaceService.getResumeWorkspace("job_ready");

    expect(staleWorkspace.draft.status).toBe("stale");
    expect(staleWorkspace.draft.approvedExportId).toBeNull();
    expect(staleWorkspace.exports.some((artifact) => artifact.isApproved)).toBe(false);
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
      postedAtText: null,
      discoveredAt: "2026-03-20T10:04:00.000Z",
      salaryText: "$185k - $210k",
      summary: "Lead UI platform work.",
      description:
        "Lead UI platform work. Additional work authorization details are required during apply.",
      keySkills: ["React", "Design Systems"],
      responsibilities: ["Lead UI platform architecture."],
      minimumQualifications: ["Deep React experience."],
      preferredQualifications: ["Accessibility leadership experience."],
      seniority: "Principal",
      employmentType: "Full-time",
      department: "Engineering",
      team: "UI Platform",
      employerWebsiteUrl: "https://void.example.com",
      employerDomain: "void.example.com",
      benefits: ["Remote-first collaboration"],
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
      storagePath: "/tmp/job-pause-case-resume.pdf",
      contentText: "Resume text",
      previewSections: [],
      generationMethod: "deterministic",
      notes: [],
    });
    seed.resumeDrafts.push({
      id: "resume_draft_job_pause_case",
      jobId: "job_pause_case",
      status: "approved",
      templateId: "classic_ats",
      sections: [],
      targetPageCount: 2,
      generationMethod: "deterministic",
      approvedAt: "2026-03-20T10:04:00.000Z",
      approvedExportId: "resume_export_pause_case",
      staleReason: null,
      createdAt: "2026-03-20T10:00:00.000Z",
      updatedAt: "2026-03-20T10:04:00.000Z",
    });
    seed.resumeExportArtifacts.push({
      id: "resume_export_pause_case",
      draftId: "resume_draft_job_pause_case",
      jobId: "job_pause_case",
      format: "pdf",
      filePath: "/tmp/job-pause-case-resume.pdf",
      pageCount: 2,
      templateId: "classic_ats",
      exportedAt: "2026-03-20T10:04:00.000Z",
      isApproved: true,
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

  test("stales approved resume drafts when profile changes affect resume inputs", async () => {
    const { workspaceService } = createWorkspaceServiceHarness();

    await workspaceService.generateResume("job_ready");
    const exportedSnapshot = await workspaceService.exportResumePdf("job_ready");
    const approvedExport = exportedSnapshot.resumeExportArtifacts.find(
      (artifact) => artifact.jobId === "job_ready",
    );

    await workspaceService.approveResume("job_ready", approvedExport!.id);

    await workspaceService.saveProfile({
      ...(await workspaceService.getWorkspaceSnapshot()).profile,
      headline: "Senior systems designer and workflow platform lead",
    });

    const workspace = await workspaceService.getResumeWorkspace("job_ready");

    expect(workspace.draft.status).toBe("stale");
    expect(workspace.draft.staleReason).toMatch(/profile details changed after approval/i);
    expect(workspace.exports.some((artifact) => artifact.isApproved)).toBe(false);
  });

  test("stales approved resume drafts when settings change affect resume output", async () => {
    const { workspaceService } = createWorkspaceServiceHarness();

    await workspaceService.generateResume("job_ready");
    const exportedSnapshot = await workspaceService.exportResumePdf("job_ready");
    const approvedExport = exportedSnapshot.resumeExportArtifacts.find(
      (artifact) => artifact.jobId === "job_ready",
    );

    await workspaceService.approveResume("job_ready", approvedExport!.id);

    const snapshot = await workspaceService.getWorkspaceSnapshot();
    await workspaceService.saveSettings({
      ...snapshot.settings,
      resumeTemplateId: "modern_split",
    });

    const workspace = await workspaceService.getResumeWorkspace("job_ready");

    expect(workspace.draft.status).toBe("stale");
    expect(workspace.draft.staleReason).toMatch(/resume settings changed after approval/i);
    expect(workspace.exports.some((artifact) => artifact.isApproved)).toBe(false);
  });

  test("stales approved resume drafts when saved job details change materially", async () => {
    let useChangedDiscovery = false;
    const baseRuntime = createBrowserRuntime();
    const browserRuntime: BrowserSessionRuntime = {
      ...baseRuntime,
      runDiscovery(source, searchPreferences) {
        if (!useChangedDiscovery) {
          return baseRuntime.runDiscovery(source, searchPreferences);
        }

        return Promise.resolve({
          source,
          startedAt: "2026-03-20T10:00:00.000Z",
          completedAt: "2026-03-20T10:01:00.000Z",
          querySummary: "Changed discovery test run",
          warning: null,
          agentMetadata: null,
          jobs: [
            {
              source: "target_site" as const,
              sourceJobId: "linkedin_signal_ready",
              discoveryMethod: "catalog_seed" as const,
              canonicalUrl: "https://www.linkedin.com/jobs/view/linkedin_signal_ready",
              title: "Senior Product Designer",
              company: "Signal Systems",
              location: "Remote",
              workMode: ["remote"],
              applyPath: "easy_apply" as const,
              easyApplyEligible: true,
              postedAt: "2026-03-20T09:00:00.000Z",
              postedAtText: null,
              discoveredAt: "2026-03-20T10:04:00.000Z",
              salaryText: "$180k - $220k",
              summary: "Own the design system for AI operations.",
              description:
                "Own the design system and workflow platform for AI operations.",
              keySkills: ["Figma", "Design Systems", "AI Operations"],
              responsibilities: ["Own the design system roadmap for AI operations."],
              minimumQualifications: ["Strong product design systems experience."],
              preferredQualifications: [
                "Workflow-platform and AI operations background.",
              ],
              seniority: "Senior",
              employmentType: "Full-time",
              department: "Design",
              team: "Design Systems",
              employerWebsiteUrl: "https://signalsystems.example.com",
              employerDomain: "signalsystems.example.com",
              benefits: ["Remote-first collaboration"],
            },
          ],
        });
      },
    };

    const { workspaceService } = createWorkspaceServiceHarness({
      browserRuntime,
    });

    await workspaceService.generateResume("job_ready");
    const exportedSnapshot = await workspaceService.exportResumePdf("job_ready");
    const approvedExport = exportedSnapshot.resumeExportArtifacts.find(
      (artifact) => artifact.jobId === "job_ready",
    );

    await workspaceService.approveResume("job_ready", approvedExport!.id);

    useChangedDiscovery = true;
    const snapshot = await workspaceService.runDiscovery();

    const reviewItem = snapshot.reviewQueue.find((item) => item.jobId === "job_ready");

    expect(reviewItem?.resumeIsStale).toBe(true);
    expect(reviewItem?.resumeDraftStatus).toBe("stale");
  });

  test("rejects apply approval when the approved export file is missing on disk", async () => {
    const { workspaceService } = createWorkspaceServiceHarness({
      exportFileVerifier: {
        exists: () => Promise.resolve(false),
      },
    });

    await workspaceService.generateResume("job_ready");
    const exportedSnapshot = await workspaceService.exportResumePdf("job_ready");
    const approvedExport = exportedSnapshot.resumeExportArtifacts.find(
      (artifact) => artifact.jobId === "job_ready",
    );

    await workspaceService.approveResume("job_ready", approvedExport!.id);

    await expect(workspaceService.approveApply("job_ready")).rejects.toThrow(
      /missing on disk/i,
    );
  });
});
