import type { BrowserSessionRuntime } from "@unemployed/browser-runtime";
import {
  JobPostingSchema,
  type ResumeTemplateId,
  ResumeTemplateDefinitionSchema,
  SavedJobSchema,
} from "@unemployed/contracts";
import { describe, expect, test } from "vitest";
import { createAiClient } from "./workspace-service.test-runtimes";
import {
  createBrowserRuntime,
  createDocumentManager,
  createWorkspaceServiceHarness,
  createSeed,
} from "./workspace-service.test-support";

function buildRecordQuery(input: {
  jobId: string;
  runId?: string | undefined;
  resultId?: string | undefined;
}) {
  return {
    jobId: input.jobId,
    ...(input.runId ? { runId: input.runId } : {}),
    ...(input.resultId ? { resultId: input.resultId } : {}),
  };
}

describe("createJobFinderWorkspaceService", () => {
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
    expect(snapshot.applicationAttempts[0]?.questions[0]?.kind).toBe("resume");
    expect(snapshot.applicationAttempts[0]?.consentDecisions.length).toBeGreaterThan(0);
    expect(snapshot.applicationAttempts[0]?.replay.lastUrl).toContain("/apply");
    expect(snapshot.applicationRecords[0]?.questionSummary.total).toBe(1);
    expect(snapshot.applicationRecords[0]?.replaySummary.lastUrl).toContain("/apply");
    expect(tailoredAsset?.storagePath).toBe("/tmp/generated-classic_ats.pdf");
    expect(tailoredAsset?.notes).toEqual(
      expect.arrayContaining([
        "Generated PDF resume artifact generated-classic_ats.pdf.",
        "Saved HTML debug render generated-classic_ats.html.",
        "Generated PDF page count: 2.",
      ]),
    );
  });

  test("creates a non-submitting apply copilot foundation run when resume approval is missing", async () => {
    const { workspaceService, repository } = createWorkspaceServiceHarness();

    const snapshot = await workspaceService.startApplyCopilotRun("job_ready");
    const runs = await repository.listApplyRuns();
    const results = await repository.listApplyJobResults();
    const questions = await repository.listApplicationQuestionRecords(
      buildRecordQuery({ jobId: "job_ready", runId: runs[0]?.id }),
    );
    const consentRequests = await repository.listApplicationConsentRequests(
      buildRecordQuery({ jobId: "job_ready", runId: runs[0]?.id }),
    );

    expect(snapshot.applyRuns).toHaveLength(1);
    expect(snapshot.selectedApplyRunId).toBe(snapshot.applyRuns[0]?.id ?? null);
    expect(snapshot.applyRuns[0]).toMatchObject({
      mode: "copilot",
      state: "paused_for_consent",
      currentJobId: "job_ready",
      blockedJobs: 1,
    });
    expect(snapshot.applyJobResults).toHaveLength(1);
    expect(snapshot.applyJobResults[0]).toMatchObject({
      jobId: "job_ready",
      state: "blocked",
      blockerReason: "resume_missing",
    });
    expect(runs[0]?.id).toBe(snapshot.applyRuns[0]?.id);
    expect(results[0]?.id).toBe(snapshot.applyJobResults[0]?.id);
    expect(questions[0]).toMatchObject({
      jobId: "job_ready",
      kind: "resume",
      status: "skipped",
    });
    expect(consentRequests[0]).toMatchObject({
      jobId: "job_ready",
      kind: "resume_use",
      status: "pending",
    });
    expect(snapshot.applicationAttempts).toHaveLength(0);
    expect(snapshot.applicationRecords).toHaveLength(1);
    expect(snapshot.applicationRecords[0]).toMatchObject({
      jobId: "job_ready",
      lastActionLabel: "Apply copilot blocked before launch.",
      nextActionLabel: "Export and approve a tailored resume before retrying apply copilot.",
      latestBlocker: {
        code: "missing_resume",
      },
      consentSummary: {
        status: "requested",
        pendingCount: 1,
      },
    });
  });

  test("starts a non-submitting apply copilot run when the job has an approved resume", async () => {
    const { workspaceService } = createWorkspaceServiceHarness();

    await workspaceService.generateResume("job_ready");
    const exportedSnapshot = await workspaceService.exportResumePdf("job_ready");
    const approvedExport = exportedSnapshot.resumeExportArtifacts.find(
      (artifact) => artifact.jobId === "job_ready",
    );
    expect(approvedExport).toBeTruthy();

    await workspaceService.approveResume("job_ready", approvedExport!.id);

    const snapshot = await workspaceService.startApplyCopilotRun("job_ready");
    const applyRun = snapshot.applyRuns[0];
    const applyResult = snapshot.applyJobResults[0];
    const applicationAttempt = snapshot.applicationAttempts[0];
    const applicationRecord = snapshot.applicationRecords[0];

    expect(applyRun).toMatchObject({
      mode: "copilot",
      state: "paused_for_user_review",
      currentJobId: "job_ready",
    });
    expect(applyResult).toMatchObject({
      jobId: "job_ready",
      state: "awaiting_review",
      latestQuestionCount: 1,
      latestAnswerCount: 1,
    });
    expect(applicationAttempt).toMatchObject({
      state: "paused",
      outcome: null,
      nextActionLabel: expect.stringMatching(/submit manually when ready/i) as string,
    });
    expect(applicationAttempt?.questions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "resume",
          submittedAnswer: "/tmp/generated-classic_ats.pdf",
        }),
      ]),
    );
    expect(applicationAttempt?.checkpoints.at(-1)).toEqual(
      expect.objectContaining({
        label: "Prepared application for final review",
        state: "paused",
      }),
    );
    expect(applicationRecord).toMatchObject({
      lastAttemptState: "paused",
      questionSummary: expect.objectContaining({ total: 1, answered: 1 }) as {
        total: number;
        answered: number;
      },
    });
  });

  test("captures apply copilot answer, artifact, checkpoint, and consent records for review-ready questions", async () => {
    const seed = createSeed();
    seed.savedJobs.push(SavedJobSchema.parse({
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
    }));
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

    const { workspaceService, repository } = createWorkspaceServiceHarness({ seed });

    const snapshot = await workspaceService.startApplyCopilotRun("job_pause_case");
    const runId = snapshot.applyRuns[0]?.id;
    const resultId = snapshot.applyJobResults[0]?.id;
    const recordQuery = buildRecordQuery({
      jobId: "job_pause_case",
      runId,
      resultId,
    });
    const questions = await repository.listApplicationQuestionRecords(
      recordQuery,
    );
    const answers = await repository.listApplicationAnswerRecords(
      recordQuery,
    );
    const artifacts = await repository.listApplicationArtifactRefs(
      recordQuery,
    );
    const checkpoints = await repository.listApplicationReplayCheckpoints(
      recordQuery,
    );
    const consentRequests = await repository.listApplicationConsentRequests(
      recordQuery,
    );

    expect(snapshot.applyRuns[0]?.state).toBe("paused_for_user_review");
    expect(snapshot.applyJobResults[0]).toMatchObject({
      state: "awaiting_review",
      blockerReason: "required_human_input",
      latestQuestionCount: 2,
      latestAnswerCount: 3,
    });
    expect(questions.map((question) => question.kind)).toEqual(
      expect.arrayContaining(["resume", "work_authorization"]),
    );
    expect(answers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "filled",
          sourceKind: "resume",
        }),
      ]),
    );
    expect(artifacts.length).toBeGreaterThan(0);
    expect(checkpoints.some((checkpoint) => checkpoint.jobState === "awaiting_review")).toBe(
      true,
    );
    expect(consentRequests).toEqual([]);
    expect(snapshot.applicationAttempts[0]?.state).toBe("paused");
    expect(snapshot.applicationAttempts[0]?.questions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "resume" }),
        expect.objectContaining({ kind: "work_authorization" }),
      ]),
    );
  });

  test("returns persisted apply run details for a completed copilot review run", async () => {
    const { workspaceService } = createWorkspaceServiceHarness();

    await workspaceService.generateResume("job_ready");
    const exportedSnapshot = await workspaceService.exportResumePdf("job_ready");
    const approvedExport = exportedSnapshot.resumeExportArtifacts.find(
      (artifact) => artifact.jobId === "job_ready",
    );
    expect(approvedExport).toBeTruthy();

    await workspaceService.approveResume("job_ready", approvedExport!.id);
    const snapshot = await workspaceService.startApplyCopilotRun("job_ready");
    const runId = snapshot.applyRuns[0]?.id;

    expect(runId).toBeTruthy();
    if (!runId) {
      return;
    }

    const details = await workspaceService.getApplyRunDetails(runId, "job_ready");

    expect(details.run.id).toBe(runId);
    expect(details.run.mode).toBe("copilot");
    expect(details.result).toMatchObject({
      runId,
      jobId: "job_ready",
      state: "awaiting_review",
    });
    expect(details.questionRecords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          jobId: "job_ready",
          kind: "resume",
        }),
      ]),
    );
    expect(details.answerRecords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          jobId: "job_ready",
          status: "filled",
        }),
      ]),
    );
    expect(details.checkpoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          jobId: "job_ready",
          jobState: "awaiting_review",
        }),
      ]),
    );
  });

  test("reuses retained checkpoint context when a job is retried through apply copilot", async () => {
    const { workspaceService } = createWorkspaceServiceHarness();

    await workspaceService.generateResume("job_ready");
    const exportedSnapshot = await workspaceService.exportResumePdf("job_ready");
    const approvedExport = exportedSnapshot.resumeExportArtifacts.find(
      (artifact) => artifact.jobId === "job_ready",
    );
    expect(approvedExport).toBeTruthy();

    await workspaceService.approveResume("job_ready", approvedExport!.id);
    const initialSnapshot = await workspaceService.startApplyCopilotRun("job_ready");
    const initialRunId = initialSnapshot.applyRuns[0]?.id;

    expect(initialRunId).toBeTruthy();
    if (!initialRunId) {
      return;
    }

    const retrySnapshot = await workspaceService.startApplyCopilotRun("job_ready");
    const latestRun = retrySnapshot.applyRuns[0];
    const details = await workspaceService.getApplyRunDetails(latestRun!.id, "job_ready");

    expect(latestRun?.id).not.toBe(initialRunId);
    expect(details.checkpoints.some((checkpoint) => checkpoint.label === "Resumed from retained apply context")).toBe(true);
    const resumedCheckpoint = details.checkpoints.find(
      (checkpoint) => checkpoint.label === "Resumed from retained apply context",
    );

    expect(resumedCheckpoint).toMatchObject({
      label: "Resumed from retained apply context",
      jobState: "filling",
    });
    expect(resumedCheckpoint?.detail).toMatch(/retained context/i);
    expect(details.result?.latestCheckpointId).toBeTruthy();
    expect(
      details.checkpoints.some(
        (checkpoint) => checkpoint.id === details.result?.latestCheckpointId,
      ),
    ).toBe(true);
    expect(details.result?.runId).toBe(latestRun?.id);
  });

  test("rejects apply run details lookup when the run does not include the requested job", async () => {
    const { workspaceService } = createWorkspaceServiceHarness();

    await workspaceService.generateResume("job_ready");
    const exportedSnapshot = await workspaceService.exportResumePdf("job_ready");
    const approvedExport = exportedSnapshot.resumeExportArtifacts.find(
      (artifact) => artifact.jobId === "job_ready",
    );
    expect(approvedExport).toBeTruthy();

    await workspaceService.approveResume("job_ready", approvedExport!.id);
    const snapshot = await workspaceService.startApplyCopilotRun("job_ready");
    const runId = snapshot.applyRuns[0]?.id;

    expect(runId).toBeTruthy();
    if (!runId) {
      return;
    }

    await expect(
      workspaceService.getApplyRunDetails(runId, "job_generating"),
    ).rejects.toThrow(`Apply run '${runId}' does not include job 'job_generating'.`);
  });

  test("captures research artifacts and returns grounded assistant resume feedback", async () => {
    const { workspaceService } = createWorkspaceServiceHarness();

    await workspaceService.generateResume("job_ready");
    const beforeWorkspace = await workspaceService.getResumeWorkspace("job_ready");
    const messages = await workspaceService.sendResumeAssistantMessage(
      "job_ready",
      "Shorten the summary and tighten one experience bullet for ATS readability.",
    );
    const afterWorkspace = await workspaceService.getResumeWorkspace("job_ready");
    const assistantPatchedMessage = messages.find(
      (message) => message.role === "assistant" && message.patches.length > 0,
    );

    expect(beforeWorkspace.research.length).toBeGreaterThan(0);
    expect(messages.some((message) => message.role === "assistant")).toBe(true);
    if (assistantPatchedMessage) {
      expect(afterWorkspace.draft.updatedAt).not.toBe(beforeWorkspace.draft.updatedAt);
    } else {
      expect(
        messages.some(
          (message) =>
            message.role === "assistant" && /no changes were applied/i.test(message.content),
        ),
      ).toBe(true);
    }
    expect(
      afterWorkspace.draft.sections
        .find((section) => section.kind === "experience")
        ?.entries.some((entry) => entry.bullets.length > 0),
    ).toBe(true);
    expect(afterWorkspace.assistantMessages.some((message) => message.role === "assistant")).toBe(
      true,
    );
  });

  test("sanitizes duplicate and copied job-description resume content before persistence", async () => {
    const { workspaceService } = createWorkspaceServiceHarness();

    await workspaceService.generateResume("job_ready");
    const workspace = await workspaceService.getResumeWorkspace("job_ready");
    const experienceSection = workspace.draft.sections.find((section) => section.kind === "experience");

    expect(experienceSection).toBeTruthy();

    await workspaceService.saveResumeDraft({
      ...workspace.draft,
      sections: workspace.draft.sections.map((section) => {
        if (section.id !== experienceSection?.id) {
          return section;
        }

        return {
          ...section,
          bullets: [
            ...section.bullets,
            {
              id: "duplicate_bullet_1",
              text: "Own the design system roadmap.",
              origin: "user_edited" as const,
              locked: false,
              included: true,
              sourceRefs: [],
              updatedAt: new Date().toISOString(),
            },
            {
              id: "duplicate_bullet_2",
              text: "Own the design system roadmap.",
              origin: "user_edited" as const,
              locked: false,
              included: true,
              sourceRefs: [],
              updatedAt: new Date().toISOString(),
            },
          ],
        };
      }),
    });

    const refreshedWorkspace = await workspaceService.getResumeWorkspace("job_ready");
    const refreshedExperienceSection = refreshedWorkspace.draft.sections.find(
      (section) => section.kind === "experience",
    );

    expect(
      refreshedExperienceSection?.bullets.filter(
        (bullet) => bullet.text === "Own the design system roadmap.",
      ).length,
    ).toBeLessThanOrEqual(1);
  });

  test("removes company and job-only phrases from visible skill sections", async () => {
    const { workspaceService } = createWorkspaceServiceHarness({
      aiClient: {
        ...createAiClient(),
        createResumeDraft(input) {
          return Promise.resolve({
            label: "Tailored Resume",
            summary: "Grounded systems summary.",
            experienceHighlights: ["Built resilient workflow tooling."],
            coreSkills: ["Figma", "Signal Systems", "Design Systems"],
            targetedKeywords: ["Design Systems", "Workflow platform"],
            experienceEntries: input.profile.experiences.slice(0, 1).map((experience) => ({
              title: experience.title,
              employer: experience.companyName,
              location: experience.location,
              dateRange: "2020-01 – Present",
              summary: experience.summary,
              bullets: experience.achievements,
              profileRecordId: experience.id,
            })),
            projectEntries: [],
            educationEntries: [],
            certificationEntries: [],
            additionalSkills: ["Remote-first collaboration", "Figma"],
            languages: [],
            fullText: "placeholder",
            compatibilityScore: 92,
            notes: ["Injected by test AI client."],
          });
        },
      },
    });

    await workspaceService.generateResume("job_ready");
    const workspace = await workspaceService.getResumeWorkspace("job_ready");
    const skillBullets = workspace.draft.sections
      .filter((section) => section.kind === "skills")
      .flatMap((section) => section.bullets.filter((bullet) => bullet.included).map((bullet) => bullet.text));

    expect(skillBullets).toEqual(expect.arrayContaining(["Figma", "Design Systems"]));
    expect(skillBullets).not.toContain("Signal Systems");
    expect(skillBullets).not.toContain("Remote-first collaboration");
  });

  test("fails assistant edits as a batch when one patch targets missing content", async () => {
    const baseAiClient = createAiClient();
    const { workspaceService } = createWorkspaceServiceHarness({
      aiClient: {
        ...baseAiClient,
        reviseResumeDraft() {
          return Promise.resolve({
            content: "Attempted two edits.",
            patches: [
              {
                id: "assistant_patch_ok",
                draftId: "resume_draft_job_ready",
                operation: "replace_section_text" as const,
                targetSectionId: "section_summary",
                targetEntryId: null,
                targetBulletId: null,
                anchorBulletId: null,
                position: null,
                newText: "Shortened summary.",
                newIncluded: null,
                newLocked: null,
                newBullets: null,
                appliedAt: new Date().toISOString(),
                origin: "assistant" as const,
                conflictReason: null,
              },
              {
                id: "assistant_patch_bad",
                draftId: "resume_draft_job_ready",
                operation: "update_bullet" as const,
                targetSectionId: "section_experience",
                targetEntryId: "missing_entry",
                targetBulletId: "missing_bullet",
                anchorBulletId: null,
                position: null,
                newText: "Impossible update",
                newIncluded: null,
                newLocked: null,
                newBullets: null,
                appliedAt: new Date().toISOString(),
                origin: "assistant" as const,
                conflictReason: null,
              },
            ],
          });
        },
      },
    });

    await workspaceService.generateResume("job_ready");
    const beforeWorkspace = await workspaceService.getResumeWorkspace("job_ready");
    const messages = await workspaceService.sendResumeAssistantMessage(
      "job_ready",
      "Apply these edits.",
    );
    const afterWorkspace = await workspaceService.getResumeWorkspace("job_ready");

    expect(afterWorkspace.draft.updatedAt).toBe(beforeWorkspace.draft.updatedAt);
    const assistantMessages = messages.filter((message) => message.role === "assistant");
    expect(assistantMessages.at(-1)?.content).toMatch(/No assistant changes were applied/i);
  });

  test("resume workspace exposes shared profile narrative and proof summaries", async () => {
    const { workspaceService } = createWorkspaceServiceHarness();

    await workspaceService.generateResume("job_ready");
    const workspace = await workspaceService.getResumeWorkspace("job_ready");

    expect(workspace.sharedProfile.narrativeSummary).toMatch(/design systems/i);
    expect(workspace.sharedProfile.selfIntroduction).toMatch(/systems-focused product designer/i);
    expect(workspace.sharedProfile.highlightedProofs[0]?.title).toBe("Design-system rollout");
  });

  test("previews an unsaved draft without persisting intermediate changes", async () => {
    const { repository, workspaceService } = createWorkspaceServiceHarness();

    await workspaceService.generateResume("job_ready");
    const workspace = await workspaceService.getResumeWorkspace("job_ready");
    const previewDraft = {
      ...workspace.draft,
      sections: workspace.draft.sections.map((section, index) =>
        index === 0 && section.text
          ? {
              ...section,
              text: `${section.text} Preview-only edit.`,
            }
          : section,
      ),
    };

    const preview = await workspaceService.previewResumeDraft(previewDraft);
    const persistedDraft = await repository.getResumeDraftByJobId("job_ready");

    expect(preview.draftId).toBe(workspace.draft.id);
    expect(preview.html).toContain("Preview-only edit.");
    expect(preview.html).toContain("data-resume-section-id");
    expect(preview.revisionKey).not.toBe(`resume_preview_${workspace.draft.id}`);
    expect(persistedDraft?.sections[0]?.text).toBe(workspace.draft.sections[0]?.text ?? null);
    expect(persistedDraft?.updatedAt).toBe(workspace.draft.updatedAt);
  });

  test("rejects resume approval when exported validation still has blocking errors", async () => {
    const { workspaceService } = createWorkspaceServiceHarness({
      documentManager: {
        ...createDocumentManager(),
        renderResumePreview(input: { templateId: ResumeTemplateId }) {
          return Promise.resolve({
            html: `<!doctype html><html><body><article data-template-id="${input.templateId}">Preview</article></body></html>`,
            warnings: [],
          });
        },
        renderResumeArtifact(input: { templateId: ResumeTemplateId }) {
          return Promise.resolve({
            fileName: `generated-${input.templateId}.pdf`,
            storagePath: `/tmp/generated-${input.templateId}.pdf`,
            format: "pdf" as const,
            intermediateFileName: `generated-${input.templateId}.html`,
            intermediateStoragePath: `/tmp/generated-${input.templateId}.html`,
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
    seed.savedJobs.push(SavedJobSchema.parse({
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
    }));
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
    expect(snapshot.applicationAttempts.find((attempt) => attempt.state === "paused")?.blocker?.code).toBe(
      "requires_manual_review",
    );
    expect(snapshot.applicationAttempts.find((attempt) => attempt.state === "paused")?.questions.length).toBeGreaterThan(0);
    expect(applicationRecord?.latestBlocker?.code).toBe("requires_manual_review");
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

  test("stages a single-job auto apply run with pending submit approval", async () => {
    const { repository, workspaceService } = createWorkspaceServiceHarness();

    await workspaceService.generateResume("job_ready");
    const exportedSnapshot = await workspaceService.exportResumePdf("job_ready");
    const approvedExport = exportedSnapshot.resumeExportArtifacts.find(
      (artifact) => artifact.jobId === "job_ready",
    );

    await workspaceService.approveResume("job_ready", approvedExport!.id);

    const snapshot = await workspaceService.startAutoApplyRun("job_ready");
    const run = snapshot.applyRuns[0];
    const result = snapshot.applyJobResults[0];
    const approvals = await repository.listApplySubmitApprovals();

    expect(run).toMatchObject({
      mode: "single_job_auto",
      state: "awaiting_submit_approval",
      currentJobId: "job_ready",
      pendingJobs: 1,
    });
    expect(result).toMatchObject({
      jobId: "job_ready",
      state: "planned",
    });
    expect(approvals[0]).toMatchObject({
      runId: run?.id,
      mode: "single_job_auto",
      status: "pending",
      jobIds: ["job_ready"],
    });
    expect(snapshot.applicationAttempts).toHaveLength(0);
    expect(snapshot.applicationRecords[0]).toMatchObject({
      jobId: "job_ready",
      nextActionLabel: expect.stringMatching(/pending submit approval/i) as string,
    });
  });

  test("records submit approval and exposes it through apply run details", async () => {
    const { repository, workspaceService } = createWorkspaceServiceHarness();

    await workspaceService.generateResume("job_ready");
    const exportedSnapshot = await workspaceService.exportResumePdf("job_ready");
    const approvedExport = exportedSnapshot.resumeExportArtifacts.find(
      (artifact) => artifact.jobId === "job_ready",
    );

    await workspaceService.approveResume("job_ready", approvedExport!.id);

    const startedSnapshot = await workspaceService.startAutoApplyRun("job_ready");
    const runId = startedSnapshot.applyRuns[0]?.id;
    expect(runId).toBeTruthy();

    const approvedSnapshot = await workspaceService.approveApplyRun(runId!);
    const approval = (await repository.listApplySubmitApprovals())[0];
    const details = await workspaceService.getApplyRunDetails(runId!, "job_ready");

    expect(approvedSnapshot.applyRuns[0]).toMatchObject({
      id: runId,
      state: "paused_for_user_review",
    });
    expect(approval).toMatchObject({
      runId,
      status: "approved",
    });
    expect(details.submitApproval).toMatchObject({
      runId,
      status: "approved",
    });
  });

  test("keeps apply browser sessions warm across queue jobs when keepSessionAlive is enabled", async () => {
    const seed = createSeed();
    seed.settings.keepSessionAlive = true;
    seed.savedJobs = [
      {
        ...seed.savedJobs[0]!,
        id: "job_queue_first",
        sourceJobId: "linkedin_queue_first",
        canonicalUrl: "https://www.linkedin.com/jobs/view/linkedin_queue_first",
        applicationUrl: "https://www.linkedin.com/jobs/view/linkedin_queue_first/apply",
        title: "Staff Product Designer",
        company: "Queue Labs",
        status: "ready_for_review",
      },
      {
        ...seed.savedJobs[0]!,
        id: "job_queue_second",
        sourceJobId: "linkedin_queue_second",
        canonicalUrl: "https://www.linkedin.com/jobs/view/linkedin_queue_second",
        applicationUrl: "https://www.linkedin.com/jobs/view/linkedin_queue_second/apply",
        title: "Senior Product Designer",
        company: "Queue Labs",
        status: "ready_for_review",
      },
    ];
    seed.tailoredAssets = [
      {
        ...seed.tailoredAssets[0]!,
        id: "asset_queue_first",
        jobId: "job_queue_first",
        storagePath: "/tmp/job-queue-first-resume.pdf",
      },
      {
        ...seed.tailoredAssets[0]!,
        id: "asset_queue_second",
        jobId: "job_queue_second",
        storagePath: "/tmp/job-queue-second-resume.pdf",
      },
    ];
    seed.resumeDrafts = [
      {
        id: "resume_draft_queue_first",
        jobId: "job_queue_first",
        status: "approved",
        templateId: "classic_ats",
        sections: [],
        targetPageCount: 2,
        generationMethod: "deterministic",
        approvedAt: "2026-03-20T10:04:00.000Z",
        approvedExportId: "resume_export_queue_first",
        staleReason: null,
        createdAt: "2026-03-20T10:00:00.000Z",
        updatedAt: "2026-03-20T10:04:00.000Z",
      },
      {
        id: "resume_draft_queue_second",
        jobId: "job_queue_second",
        status: "approved",
        templateId: "classic_ats",
        sections: [],
        targetPageCount: 2,
        generationMethod: "deterministic",
        approvedAt: "2026-03-20T10:04:00.000Z",
        approvedExportId: "resume_export_queue_second",
        staleReason: null,
        createdAt: "2026-03-20T10:00:00.000Z",
        updatedAt: "2026-03-20T10:04:00.000Z",
      },
    ];
    seed.resumeExportArtifacts = [
      {
        id: "resume_export_queue_first",
        draftId: "resume_draft_queue_first",
        jobId: "job_queue_first",
        format: "pdf",
        filePath: "/tmp/job-queue-first-resume.pdf",
        pageCount: 2,
        templateId: "classic_ats",
        exportedAt: "2026-03-20T10:04:00.000Z",
        isApproved: true,
      },
      {
        id: "resume_export_queue_second",
        draftId: "resume_draft_queue_second",
        jobId: "job_queue_second",
        format: "pdf",
        filePath: "/tmp/job-queue-second-resume.pdf",
        pageCount: 2,
        templateId: "classic_ats",
        exportedAt: "2026-03-20T10:04:00.000Z",
        isApproved: true,
      },
    ];

    let openSessionCalls = 0;
    let closeSessionCalls = 0;
    const fallbackRuntime = createBrowserRuntime();
    const browserRuntime: BrowserSessionRuntime = {
      ...fallbackRuntime,
      async openSession(source) {
        openSessionCalls += 1;
        return fallbackRuntime.openSession(source);
      },
      async closeSession(source) {
        closeSessionCalls += 1;
        return fallbackRuntime.closeSession(source);
      },
    };
    const { workspaceService } = createWorkspaceServiceHarness({
      seed,
      browserRuntime,
      aiClient: createAiClient(),
    });

    const startedSnapshot = await workspaceService.startAutoApplyQueueRun([
      "job_queue_first",
      "job_queue_second",
    ]);
    const runId = startedSnapshot.applyRuns[0]?.id;

    expect(runId).toBeTruthy();

    const approvedSnapshot = await workspaceService.approveApplyRun(runId!);

    expect(approvedSnapshot.applyRuns[0]).toMatchObject({
      id: runId,
      state: "paused_for_user_review",
      submittedJobs: 0,
      pendingJobs: 2,
    });
    expect(approvedSnapshot.applyJobResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ jobId: "job_queue_first", state: "awaiting_review" }),
        expect.objectContaining({ jobId: "job_queue_second", state: "awaiting_review" }),
      ]),
    );
    expect(openSessionCalls).toBe(1);
    expect(closeSessionCalls).toBe(0);
  });

  test("replaces an approved single-job auto apply run with a fresh pending approval when revoked", async () => {
    const { repository, workspaceService } = createWorkspaceServiceHarness();

    await workspaceService.generateResume("job_ready");
    const exportedSnapshot = await workspaceService.exportResumePdf("job_ready");
    const approvedExport = exportedSnapshot.resumeExportArtifacts.find(
      (artifact) => artifact.jobId === "job_ready",
    );

    await workspaceService.approveResume("job_ready", approvedExport!.id);

    const startedSnapshot = await workspaceService.startAutoApplyRun("job_ready");
    const runId = startedSnapshot.applyRuns[0]?.id;
    expect(runId).toBeTruthy();

    await workspaceService.approveApplyRun(runId!);
    const revokedSnapshot = await workspaceService.revokeApplyRunApproval(runId!);

    const approvals = await repository.listApplySubmitApprovals();
    const pendingApproval = approvals.find((approval) => approval.status === 'pending')
    const revokedApproval = approvals.find((approval) => approval.status === 'revoked')

    expect(revokedSnapshot.applyRuns[0]).toMatchObject({
      id: runId,
      state: 'awaiting_submit_approval',
    });
    expect(approvals).toHaveLength(2);
    expect(pendingApproval).toMatchObject({
      runId,
      status: 'pending',
    });
    expect(revokedApproval).toMatchObject({
      runId,
      status: 'revoked',
    });
    expect(revokedSnapshot.applicationRecords[0]).toMatchObject({
      jobId: 'job_ready',
      lastActionLabel: 'Submit approval revoked for this automatic apply run.',
      nextActionLabel: 'Re-approve this run before any later submit-enabled execution.',
    });
    expect(revokedSnapshot.applyRuns[0]?.submitApprovalId).toBe(pendingApproval?.id);
    expect(revokedApproval?.revokedAt).toBeTruthy();
  });

  test("stages a queue auto apply run with one approval record per run", async () => {
    const seed = createSeed();
    seed.savedJobs = [
      {
        ...seed.savedJobs[0]!,
        id: "job_consent_queue",
        sourceJobId: "linkedin_consent_queue",
        canonicalUrl: "https://www.linkedin.com/jobs/view/linkedin_consent_queue",
        applicationUrl:
          "https://www.linkedin.com/jobs/view/linkedin_consent_queue/apply",
        title: "Staff Product Designer",
        company: "Consent Labs",
        description:
          "Design the workflow system. This application asks whether you already have an account before continuing.",
        status: "ready_for_review",
      },
      seed.savedJobs[0]!,
    ];
    seed.tailoredAssets = [
      {
        ...seed.tailoredAssets[0]!,
        id: "asset_consent_queue",
        jobId: "job_consent_queue",
        storagePath: "/tmp/job-consent-queue-resume.pdf",
      },
      seed.tailoredAssets[0]!,
    ];
    seed.resumeDrafts = [
      {
        id: "resume_draft_consent_queue",
        jobId: "job_consent_queue",
        status: "approved",
        templateId: "classic_ats",
        sections: [],
        targetPageCount: 2,
        generationMethod: "deterministic",
        approvedAt: "2026-03-20T10:04:00.000Z",
        approvedExportId: "resume_export_consent_queue",
        staleReason: null,
        createdAt: "2026-03-20T10:00:00.000Z",
        updatedAt: "2026-03-20T10:04:00.000Z",
      },
      {
        id: "resume_draft_job_ready",
        jobId: "job_ready",
        status: "approved",
        templateId: "classic_ats",
        sections: [],
        targetPageCount: 2,
        generationMethod: "deterministic",
        approvedAt: "2026-03-20T10:04:00.000Z",
        approvedExportId: "resume_export_job_ready",
        staleReason: null,
        createdAt: "2026-03-20T10:00:00.000Z",
        updatedAt: "2026-03-20T10:04:00.000Z",
      },
    ];
    seed.resumeExportArtifacts = [
      {
        id: "resume_export_consent_queue",
        draftId: "resume_draft_consent_queue",
        jobId: "job_consent_queue",
        format: "pdf",
        filePath: "/tmp/job-consent-queue-resume.pdf",
        pageCount: 2,
        templateId: "classic_ats",
        exportedAt: "2026-03-20T10:04:00.000Z",
        isApproved: true,
      },
      {
        id: "resume_export_job_ready",
        draftId: "resume_draft_job_ready",
        jobId: "job_ready",
        format: "pdf",
        filePath: "/tmp/job-ready-resume.pdf",
        pageCount: 2,
        templateId: "classic_ats",
        exportedAt: "2026-03-20T10:04:00.000Z",
        isApproved: true,
      },
    ];

    const { repository, workspaceService } = createWorkspaceServiceHarness({ seed });

    const snapshot = await workspaceService.startAutoApplyQueueRun([
      "job_consent_queue",
      "job_ready",
    ]);
    const approval = (await repository.listApplySubmitApprovals())[0];

    expect(snapshot.applyRuns[0]).toMatchObject({
      mode: "queue_auto",
      state: "awaiting_submit_approval",
      totalJobs: 2,
      pendingJobs: 2,
    });
    expect(snapshot.applyJobResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ jobId: "job_consent_queue", state: "planned" }),
        expect.objectContaining({ jobId: "job_ready", state: "planned" }),
      ]),
    );
    expect(approval).toMatchObject({
      mode: "queue_auto",
      status: "pending",
      jobIds: ["job_consent_queue", "job_ready"],
    });
  });

  test("approved queue run pauses for consent and keeps later jobs pending", async () => {
    const seed = createSeed();
    seed.savedJobs = [
      {
        ...seed.savedJobs[0]!,
        id: "job_consent_queue",
        sourceJobId: "linkedin_consent_queue",
        canonicalUrl: "https://www.linkedin.com/jobs/view/linkedin_consent_queue",
        applicationUrl:
          "https://www.linkedin.com/jobs/view/linkedin_consent_queue/apply",
        title: "Staff Product Designer",
        company: "Consent Labs",
        description:
          "Design the workflow system. This application asks whether you already have an account before continuing.",
        status: "ready_for_review",
      },
      seed.savedJobs[0]!,
    ];
    seed.tailoredAssets = [
      {
        ...seed.tailoredAssets[0]!,
        id: "asset_consent_queue",
        jobId: "job_consent_queue",
        storagePath: "/tmp/job-consent-queue-resume.pdf",
      },
      seed.tailoredAssets[0]!,
    ];
    seed.resumeDrafts = [
      {
        id: "resume_draft_consent_queue",
        jobId: "job_consent_queue",
        status: "approved",
        templateId: "classic_ats",
        sections: [],
        targetPageCount: 2,
        generationMethod: "deterministic",
        approvedAt: "2026-03-20T10:04:00.000Z",
        approvedExportId: "resume_export_consent_queue",
        staleReason: null,
        createdAt: "2026-03-20T10:00:00.000Z",
        updatedAt: "2026-03-20T10:04:00.000Z",
      },
      {
        id: "resume_draft_job_ready",
        jobId: "job_ready",
        status: "approved",
        templateId: "classic_ats",
        sections: [],
        targetPageCount: 2,
        generationMethod: "deterministic",
        approvedAt: "2026-03-20T10:04:00.000Z",
        approvedExportId: "resume_export_job_ready",
        staleReason: null,
        createdAt: "2026-03-20T10:00:00.000Z",
        updatedAt: "2026-03-20T10:04:00.000Z",
      },
    ];
    seed.resumeExportArtifacts = [
      {
        id: "resume_export_consent_queue",
        draftId: "resume_draft_consent_queue",
        jobId: "job_consent_queue",
        format: "pdf",
        filePath: "/tmp/job-consent-queue-resume.pdf",
        pageCount: 2,
        templateId: "classic_ats",
        exportedAt: "2026-03-20T10:04:00.000Z",
        isApproved: true,
      },
      {
        id: "resume_export_job_ready",
        draftId: "resume_draft_job_ready",
        jobId: "job_ready",
        format: "pdf",
        filePath: "/tmp/job-ready-resume.pdf",
        pageCount: 2,
        templateId: "classic_ats",
        exportedAt: "2026-03-20T10:04:00.000Z",
        isApproved: true,
      },
    ];

    const { repository, workspaceService } = createWorkspaceServiceHarness({ seed });

    const startedSnapshot = await workspaceService.startAutoApplyQueueRun([
      "job_consent_queue",
      "job_ready",
    ]);
    const runId = startedSnapshot.applyRuns[0]?.id;
    expect(runId).toBeTruthy();

    const snapshot = await workspaceService.approveApplyRun(runId!);
    const consentRequests = await repository.listApplicationConsentRequests({
      runId: runId!,
      jobId: "job_consent_queue",
    });

    expect(snapshot.applyRuns[0]).toMatchObject({
      id: runId,
      mode: "queue_auto",
      state: "paused_for_consent",
    });
    expect(snapshot.applyJobResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ jobId: "job_consent_queue", state: "blocked" }),
        expect.objectContaining({ jobId: "job_ready", state: "planned" }),
      ]),
    );
    expect(consentRequests[0]).toMatchObject({
      status: "pending",
    });
  });

  test("declining queue consent skips the blocked job and continues safely", async () => {
    const seed = createSeed();
    seed.savedJobs = [
      {
        ...seed.savedJobs[0]!,
        id: "job_consent_queue",
        sourceJobId: "linkedin_consent_queue",
        canonicalUrl: "https://www.linkedin.com/jobs/view/linkedin_consent_queue",
        applicationUrl:
          "https://www.linkedin.com/jobs/view/linkedin_consent_queue/apply",
        title: "Staff Product Designer",
        company: "Consent Labs",
        description:
          "Design the workflow system. This application asks whether you already have an account before continuing.",
        status: "ready_for_review",
      },
      seed.savedJobs[0]!,
    ];
    seed.tailoredAssets = [
      {
        ...seed.tailoredAssets[0]!,
        id: "asset_consent_queue",
        jobId: "job_consent_queue",
        storagePath: "/tmp/job-consent-queue-resume.pdf",
      },
      seed.tailoredAssets[0]!,
    ];
    seed.resumeDrafts = [
      {
        id: "resume_draft_consent_queue",
        jobId: "job_consent_queue",
        status: "approved",
        templateId: "classic_ats",
        sections: [],
        targetPageCount: 2,
        generationMethod: "deterministic",
        approvedAt: "2026-03-20T10:04:00.000Z",
        approvedExportId: "resume_export_consent_queue",
        staleReason: null,
        createdAt: "2026-03-20T10:00:00.000Z",
        updatedAt: "2026-03-20T10:04:00.000Z",
      },
      {
        id: "resume_draft_job_ready",
        jobId: "job_ready",
        status: "approved",
        templateId: "classic_ats",
        sections: [],
        targetPageCount: 2,
        generationMethod: "deterministic",
        approvedAt: "2026-03-20T10:04:00.000Z",
        approvedExportId: "resume_export_job_ready",
        staleReason: null,
        createdAt: "2026-03-20T10:00:00.000Z",
        updatedAt: "2026-03-20T10:04:00.000Z",
      },
    ];
    seed.resumeExportArtifacts = [
      {
        id: "resume_export_consent_queue",
        draftId: "resume_draft_consent_queue",
        jobId: "job_consent_queue",
        format: "pdf",
        filePath: "/tmp/job-consent-queue-resume.pdf",
        pageCount: 2,
        templateId: "classic_ats",
        exportedAt: "2026-03-20T10:04:00.000Z",
        isApproved: true,
      },
      {
        id: "resume_export_job_ready",
        draftId: "resume_draft_job_ready",
        jobId: "job_ready",
        format: "pdf",
        filePath: "/tmp/job-ready-resume.pdf",
        pageCount: 2,
        templateId: "classic_ats",
        exportedAt: "2026-03-20T10:04:00.000Z",
        isApproved: true,
      },
    ];

    const { repository, workspaceService } = createWorkspaceServiceHarness({ seed });

    const startedSnapshot = await workspaceService.startAutoApplyQueueRun([
      "job_consent_queue",
      "job_ready",
    ]);
    const runId = startedSnapshot.applyRuns[0]?.id;
    expect(runId).toBeTruthy();
    await workspaceService.approveApplyRun(runId!);

    const pendingConsentRequest = (
      await repository.listApplicationConsentRequests({
        runId: runId!,
        jobId: "job_consent_queue",
      })
    )[0];
    expect(pendingConsentRequest).toBeTruthy();

    const snapshot = await workspaceService.resolveApplyConsentRequest(
      pendingConsentRequest!.id,
      "decline",
    );

    expect(snapshot.applyRuns[0]).toMatchObject({
      id: runId,
      mode: "queue_auto",
    });
    expect(snapshot.applyJobResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ jobId: "job_consent_queue", state: "skipped" }),
        expect.objectContaining({ jobId: "job_ready", state: "awaiting_review" }),
      ]),
    );
  });

  test("can cancel a staged queue run", async () => {
    const seed = createSeed();
    seed.resumeDrafts = [
      {
        id: "resume_draft_job_ready",
        jobId: "job_ready",
        status: "approved",
        templateId: "classic_ats",
        sections: [],
        targetPageCount: 2,
        generationMethod: "deterministic",
        approvedAt: "2026-03-20T10:04:00.000Z",
        approvedExportId: "resume_export_job_ready",
        staleReason: null,
        createdAt: "2026-03-20T10:00:00.000Z",
        updatedAt: "2026-03-20T10:04:00.000Z",
      },
    ];
    seed.resumeExportArtifacts = [
      {
        id: "resume_export_job_ready",
        draftId: "resume_draft_job_ready",
        jobId: "job_ready",
        format: "pdf",
        filePath: "/tmp/job-ready-resume.pdf",
        pageCount: 2,
        templateId: "classic_ats",
        exportedAt: "2026-03-20T10:04:00.000Z",
        isApproved: true,
      },
    ];

    const { repository, workspaceService } = createWorkspaceServiceHarness({ seed });

    const startedSnapshot = await workspaceService.startAutoApplyQueueRun(["job_ready"]);
    const runId = startedSnapshot.applyRuns[0]?.id;
    expect(runId).toBeTruthy();

    const snapshot = await workspaceService.cancelApplyRun(runId!);
    const run = (await repository.listApplyRuns())[0];

    expect(snapshot.applyRuns[0]).toMatchObject({
      id: runId,
      state: "cancelled",
    });
    expect(run).toMatchObject({
      id: runId,
      state: "cancelled",
    });
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
      fontPreset: "space_grotesk_display",
    });

    const workspace = await workspaceService.getResumeWorkspace("job_ready");

    expect(workspace.draft.status).toBe("stale");
    expect(workspace.draft.staleReason).toMatch(/resume settings changed after approval/i);
    expect(workspace.exports.some((artifact) => artifact.isApproved)).toBe(false);
  });

  test("accepts Modern Split ATS as a supported default theme", async () => {
    const { workspaceService } = createWorkspaceServiceHarness();

    const snapshot = await workspaceService.saveSettings({
      ...(await workspaceService.getWorkspaceSnapshot()).settings,
      resumeTemplateId: "modern_split",
    });

    expect(snapshot.settings.resumeTemplateId).toBe("modern_split");
    expect(snapshot.availableResumeTemplates).toHaveLength(6);
    expect(snapshot.availableResumeTemplates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "classic_ats",
          label: "Classic ATS",
        }),
        expect.objectContaining({
          id: "compact_exec",
          label: "Compact ATS",
        }),
        expect.objectContaining({
          id: "modern_split",
          label: "Modern Split ATS",
        }),
        expect.objectContaining({
          id: "technical_matrix",
          label: "Technical Matrix",
        }),
        expect.objectContaining({
          id: "project_showcase",
          label: "Project Showcase",
        }),
        expect.objectContaining({
          id: "credentials_focus",
          label: "Credentials Focus",
        }),
      ]),
    );
  });

  test("keeps Compact ATS when it is part of the supported theme set", async () => {
    const { workspaceService } = createWorkspaceServiceHarness();

    const snapshot = await workspaceService.saveSettings({
      ...(await workspaceService.getWorkspaceSnapshot()).settings,
      resumeTemplateId: "compact_exec",
    });

    expect(snapshot.settings.resumeTemplateId).toBe("compact_exec");
  });

  test("keeps existing Modern Split drafts because the theme is shipped", async () => {
    const seed = createSeed();
    seed.resumeDrafts = [
      {
        id: "resume_draft_job_ready",
        jobId: "job_ready",
        status: "approved",
        templateId: "modern_split",
        sections: [
          {
            id: "section_summary",
            kind: "summary",
            label: "Summary",
            text: "Legacy template summary.",
            bullets: [],
            entries: [],
            origin: "user_edited",
            locked: false,
            included: true,
            sortOrder: 0,
            profileRecordId: null,
            sourceRefs: [],
            updatedAt: "2026-04-18T12:00:00.000Z",
          },
        ],
        targetPageCount: 2,
        generationMethod: "manual",
        approvedAt: "2026-04-18T12:00:00.000Z",
        approvedExportId: "resume_export_legacy",
        staleReason: null,
        createdAt: "2026-04-18T12:00:00.000Z",
        updatedAt: "2026-04-18T12:00:00.000Z",
      },
    ];
    seed.resumeExportArtifacts = [
      {
        id: "resume_export_legacy",
        draftId: "resume_draft_job_ready",
        jobId: "job_ready",
        format: "pdf",
        filePath: "/tmp/legacy-modern-split.pdf",
        pageCount: 1,
        templateId: "modern_split",
        exportedAt: "2026-04-18T12:00:00.000Z",
        isApproved: true,
      },
    ];
    const { workspaceService } = createWorkspaceServiceHarness({ seed });

    const workspace = await workspaceService.getResumeWorkspace("job_ready");

    expect(workspace.draft.templateId).toBe("modern_split");
    expect(workspace.draft.status).toBe("approved");
    expect(workspace.draft.approvedAt).toBe("2026-04-18T12:00:00.000Z");
    expect(workspace.draft.approvedExportId).toBe("resume_export_legacy");
    expect(workspace.draft.staleReason).toBeNull();
  });

  test("refuses approval when the selected template is not approval eligible", async () => {
    const { workspaceService } = createWorkspaceServiceHarness({
      documentManager: {
        ...createDocumentManager(),
        listResumeTemplates() {
          return ResumeTemplateDefinitionSchema.array().parse([
            {
              id: "classic_ats",
              label: "Swiss Minimal - Standard",
              familyId: "swiss_minimal",
              familyLabel: "Swiss Minimal",
              familyDescription: "Calm ATS-safe layouts.",
              variantLabel: "Standard",
              description: "Low-risk ATS-safe default.",
              bestFor: ["General applications"],
              visualTags: ["Minimal"],
              density: "balanced",
              deliveryLane: "apply_safe",
              atsConfidence: "high",
              applyEligible: true,
              approvalEligible: true,
              benchmarkEligible: true,
              sortOrder: 10,
            },
            {
              id: "modern_split",
              label: "Swiss Minimal - Accent",
              familyId: "swiss_minimal",
              familyLabel: "Swiss Minimal",
              familyDescription: "Calm ATS-safe layouts.",
              variantLabel: "Accent",
              description: "Expressive preview-forward variant.",
              bestFor: ["Share links"],
              visualTags: ["Accent header"],
              density: "balanced",
              deliveryLane: "share_ready",
              atsConfidence: "medium",
              applyEligible: false,
              approvalEligible: false,
              benchmarkEligible: false,
              sortOrder: 20,
            },
          ]);
        },
      },
    });

    await workspaceService.saveSettings({
      ...(await workspaceService.getWorkspaceSnapshot()).settings,
      resumeTemplateId: "classic_ats",
    });
    await workspaceService.generateResume("job_ready");
    let exportedSnapshot = await workspaceService.exportResumePdf("job_ready");
    let approvedExport = exportedSnapshot.resumeExportArtifacts.find(
      (artifact) => artifact.jobId === "job_ready",
    );

    expect(approvedExport).toBeTruthy();
    await workspaceService.approveResume("job_ready", approvedExport!.id);

    const workspace = await workspaceService.getResumeWorkspace("job_ready");
    await workspaceService.saveResumeDraft({
      ...workspace.draft,
      templateId: "modern_split",
    });
    exportedSnapshot = await workspaceService.exportResumePdf("job_ready");
    approvedExport = exportedSnapshot.resumeExportArtifacts.find(
      (artifact) => artifact.jobId === "job_ready",
    );

    await expect(
      workspaceService.approveResume("job_ready", approvedExport!.id),
    ).rejects.toThrow(/share-ready template/i);
  });

  test("refuses auto-apply staging when an approved draft uses a non-apply template", async () => {
    const seed = createSeed();
    seed.resumeDrafts = [
      {
        id: "resume_draft_job_ready",
        jobId: "job_ready",
        status: "approved",
        templateId: "modern_split",
        sections: [],
        targetPageCount: 2,
        generationMethod: "deterministic",
        approvedAt: "2026-04-18T12:00:00.000Z",
        approvedExportId: "resume_export_share_ready",
        staleReason: null,
        createdAt: "2026-04-18T12:00:00.000Z",
        updatedAt: "2026-04-18T12:00:00.000Z",
      },
    ];
    seed.resumeExportArtifacts = [
      {
        id: "resume_export_share_ready",
        draftId: "resume_draft_job_ready",
        jobId: "job_ready",
        format: "pdf",
        filePath: "/tmp/generated-modern_split.pdf",
        pageCount: 1,
        templateId: "modern_split",
        exportedAt: "2026-04-18T12:00:00.000Z",
        isApproved: true,
      },
    ];
    seed.tailoredAssets = [
      {
        id: "resume_job_ready",
        jobId: "job_ready",
        kind: "resume",
        status: "ready",
        label: "Tailored Resume",
        version: "v1",
        templateName: "Swiss Minimal - Accent",
        compatibilityScore: 95,
        progressPercent: 100,
        updatedAt: "2026-04-18T12:00:00.000Z",
        storagePath: "/tmp/generated-modern_split.pdf",
        contentText: "Resume text",
        previewSections: [],
        generationMethod: "deterministic",
        notes: [],
      },
    ];

    const { workspaceService } = createWorkspaceServiceHarness({
      seed,
      documentManager: {
        ...createDocumentManager(),
        listResumeTemplates() {
          return ResumeTemplateDefinitionSchema.array().parse([
            {
              id: "classic_ats",
              label: "Swiss Minimal - Standard",
              familyId: "swiss_minimal",
              familyLabel: "Swiss Minimal",
              familyDescription: "Calm ATS-safe layouts.",
              variantLabel: "Standard",
              description: "Low-risk ATS-safe default.",
              bestFor: ["General applications"],
              visualTags: ["Minimal"],
              density: "balanced",
              deliveryLane: "apply_safe",
              atsConfidence: "high",
              applyEligible: true,
              approvalEligible: true,
              benchmarkEligible: true,
              sortOrder: 10,
            },
            {
              id: "modern_split",
              label: "Swiss Minimal - Accent",
              familyId: "swiss_minimal",
              familyLabel: "Swiss Minimal",
              familyDescription: "Calm ATS-safe layouts.",
              variantLabel: "Accent",
              description: "Expressive preview-forward variant.",
              bestFor: ["Share links"],
              visualTags: ["Accent header"],
              density: "balanced",
              deliveryLane: "share_ready",
              atsConfidence: "medium",
              applyEligible: false,
              approvalEligible: false,
              benchmarkEligible: false,
              sortOrder: 20,
            },
          ]);
        },
      },
    });

    await expect(
      workspaceService.startAutoApplyRun("job_ready"),
    ).rejects.toThrow(/not eligible for automatic apply/i);
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
            JobPostingSchema.parse({
              source: "target_site",
              sourceJobId: "linkedin_signal_ready",
              discoveryMethod: "catalog_seed",
              canonicalUrl: "https://www.linkedin.com/jobs/view/linkedin_signal_ready",
              title: "Senior Product Designer",
              company: "Signal Systems",
              location: "Remote",
              workMode: ["remote"],
              applyPath: "easy_apply",
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
            }),
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

    expect(reviewItem?.resumeReview.status).toBe("stale");
  });

  test("blocks full-draft regeneration when locked resume content exists", async () => {
    const { workspaceService } = createWorkspaceServiceHarness();

    await workspaceService.generateResume("job_ready");
    const workspace = await workspaceService.getResumeWorkspace("job_ready");

    await workspaceService.saveResumeDraft({
      ...workspace.draft,
      sections: workspace.draft.sections.map((section, index) =>
        index === 0 ? { ...section, locked: true } : section,
      ),
    });

    await expect(workspaceService.regenerateResumeDraft("job_ready")).rejects.toThrow(
      /unlock pinned resume sections or bullets/i,
    );
  });

  test("blocks section regeneration when the target section has locked content", async () => {
    const { workspaceService } = createWorkspaceServiceHarness();

    await workspaceService.generateResume("job_ready");
    const workspace = await workspaceService.getResumeWorkspace("job_ready");
    const targetSection =
      workspace.draft.sections.find((section) => section.bullets.length > 0) ??
      workspace.draft.sections[0];

    expect(targetSection).toBeTruthy();

    await workspaceService.saveResumeDraft({
      ...workspace.draft,
      sections: workspace.draft.sections.map((section) =>
        section.id === targetSection!.id
          ? {
              ...section,
              bullets: section.bullets.map((bullet, index) =>
                index === 0 ? { ...bullet, locked: true } : bullet,
              ),
            }
          : section,
      ),
    });

    await expect(
      workspaceService.regenerateResumeSection("job_ready", targetSection!.id),
    ).rejects.toThrow(/unlock the .* section before regenerating it/i);
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

  test("dismissing and applying jobs writes durable discovery-ledger statuses", async () => {
    const { repository, workspaceService } = createWorkspaceServiceHarness({
      seed: {
        ...createSeed(),
        tailoredAssets: [],
        resumeDrafts: [],
        resumeDraftRevisions: [],
        resumeExportArtifacts: [],
        resumeResearchArtifacts: [],
        resumeValidationResults: [],
        resumeAssistantMessages: [],
        applicationRecords: [],
        applicationAttempts: [],
        discovery: {
          sessions: [],
          runState: "idle",
          activeRun: null,
          recentRuns: [],
          activeSourceDebugRun: null,
          recentSourceDebugRuns: [],
          discoveryLedger: [],
          pendingDiscoveryJobs: [
            SavedJobSchema.parse({
              id: "pending_job_1",
              source: "target_site",
              sourceJobId: "pending_job_1",
              discoveryMethod: "catalog_seed",
              collectionMethod: "careers_page",
              canonicalUrl: "https://example.com/jobs/pending-job-1",
              applicationUrl: "https://example.com/jobs/pending-job-1/apply",
              title: "Principal Designer",
              company: "Acme",
              location: "Remote",
              workMode: ["remote"],
              applyPath: "easy_apply",
              easyApplyEligible: true,
              postedAt: null,
              postedAtText: null,
              discoveredAt: "2026-03-20T10:00:00.000Z",
              salaryText: null,
              summary: "Pending job summary",
              description: "Pending job description",
              keySkills: ["React"],
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
              status: "discovered",
              matchAssessment: {
                score: 90,
                reasons: ["Strong overlap"],
                gaps: [],
              },
              provenance: [
                {
                  targetId: "target_linkedin_default",
                  adapterKind: "auto",
                  resolvedAdapterKind: "target_site",
                  startingUrl: "https://www.linkedin.com/jobs/search/",
                  discoveredAt: "2026-03-20T10:00:00.000Z",
                  collectionMethod: "careers_page",
                  providerKey: null,
                  providerBoardToken: null,
                  titleTriageOutcome: "pass",
                },
              ],
            }),
          ],
        },
      },
    });

    await workspaceService.dismissDiscoveryJob("pending_job_1");
    let discoveryState = await repository.getDiscoveryState();
    expect(discoveryState.discoveryLedger).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          canonicalUrl: "https://example.com/jobs/pending-job-1",
          latestStatus: "skipped",
          skipReason: "Dismissed from discovery results.",
        }),
      ]),
    );

    await workspaceService.generateResume("job_ready");
    const exportedSnapshot = await workspaceService.exportResumePdf("job_ready");
    const approvedExport = exportedSnapshot.resumeExportArtifacts.find(
      (artifact) => artifact.jobId === "job_ready",
    );
    await workspaceService.approveResume("job_ready", approvedExport!.id);
    await workspaceService.approveApply("job_ready");

    discoveryState = await repository.getDiscoveryState();
    expect(discoveryState.discoveryLedger).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          canonicalUrl: "https://www.linkedin.com/jobs/view/linkedin_signal_ready",
          latestStatus: "applied",
          lastAppliedAt: expect.any(String) as string,
        }),
      ]),
    );
  });
});
