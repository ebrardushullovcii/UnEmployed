import { describe, expect, test } from "vitest";
import {
  buildResumeDraftContentHash,
  buildResumeDraftStateHash,
  buildResumeRenderDocument,
} from "./internal/resume-workspace-helpers";
import {
  createDocumentManager,
  createSeed,
  createWorkspaceServiceHarness,
} from "./workspace-service.test-support";

describe("resume pdf export binding", () => {
  test("fails closed when sanitization would change the persisted draft before export", async () => {
    const seed = createSeed();
    const groundedProfile = {
      ...seed.profile,
      skills: [...seed.profile.skills, "Prototyping"],
    };
    const { repository, workspaceService } = createWorkspaceServiceHarness();

    await repository.saveProfile(groundedProfile);
    await workspaceService.getResumeWorkspace("job_ready");

    const persistedBefore = await repository.getResumeDraftByJobId("job_ready");
    const persistedSkillsBefore = persistedBefore?.sections.find(
      (section) => section.kind === "skills",
    );
    expect(
      persistedSkillsBefore?.bullets.some(
        (bullet) => bullet.text === "Prototyping",
      ),
    ).toBe(true);

    await repository.saveProfile(seed.profile);

    const failure = await workspaceService.exportResumePdf("job_ready").then(
      () => null,
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toMatch(/no longer matches/i);

    const after = await workspaceService.getResumeWorkspace("job_ready");
    const persistedAfter = await repository.getResumeDraftByJobId("job_ready");
    const jobExports = after.exports.filter(
      (artifact) => artifact.jobId === "job_ready",
    );

    expect(jobExports).toHaveLength(0);
    expect(persistedAfter).not.toBeNull();
    expect(buildResumeDraftStateHash(persistedAfter!)).toBe(
      buildResumeDraftStateHash(persistedBefore!),
    );
    await expect(
      workspaceService.approveResume("job_ready", "resume_export_missing"),
    ).rejects.toThrow(/unknown resume export/i);
  });

  test("exports and approves the exact sanitized draft whose claims were validated", async () => {
    const baseDocumentManager = createDocumentManager();
    let capturedRenderDocument:
      | Parameters<
          typeof baseDocumentManager.renderResumeArtifact
        >[0]["renderDocument"]
      | null = null;
    const documentManager = {
      ...baseDocumentManager,
      renderResumeArtifact(
        input: Parameters<typeof baseDocumentManager.renderResumeArtifact>[0],
      ) {
        capturedRenderDocument = input.renderDocument;
        return baseDocumentManager.renderResumeArtifact(input);
      },
    };
    const { repository, workspaceService } = createWorkspaceServiceHarness({
      documentManager,
    });

    await workspaceService.getResumeWorkspace("job_ready");
    const exported = await workspaceService.exportResumePdf("job_ready");
    const exportArtifact = exported.resumeExportArtifacts.find(
      (artifact) => artifact.jobId === "job_ready",
    );
    const persistedDraft = await repository.getResumeDraftByJobId("job_ready");
    const [validation] = await repository.listResumeValidationResults(
      persistedDraft!.id,
    );
    const profile = await repository.getProfile();

    expect(exportArtifact).toBeTruthy();
    expect(validation?.draftContentHash).toBe(
      buildResumeDraftContentHash(persistedDraft!),
    );
    expect(capturedRenderDocument).toEqual(
      buildResumeRenderDocument(profile, persistedDraft!),
    );

    await repository.saveResumeDraftWithValidation({
      draft: persistedDraft!,
      validation: {
        ...validation!,
        id: "resume_validation_warning_only",
        issues: [
          {
            id: "issue_warning_only",
            severity: "warning",
            category: "thin_output",
            sectionId: null,
            entryId: null,
            bulletId: null,
            message: "Review the concise summary before applying.",
          },
        ],
      },
    });

    await workspaceService.approveResume("job_ready", exportArtifact!.id);
    const approved = await workspaceService.getResumeWorkspace("job_ready");

    expect(approved.draft.status).toBe("approved");
    expect(approved.draft.approvedExportId).toBe(exportArtifact!.id);
  });

  test("rejects approval when current validation contains an error", async () => {
    const { repository, workspaceService } = createWorkspaceServiceHarness();

    await workspaceService.getResumeWorkspace("job_ready");
    const exported = await workspaceService.exportResumePdf("job_ready");
    const exportArtifact = exported.resumeExportArtifacts.find(
      (artifact) => artifact.jobId === "job_ready",
    );
    const draft = await repository.getResumeDraftByJobId("job_ready");
    const [validation] = await repository.listResumeValidationResults(
      draft!.id,
    );

    await repository.saveResumeDraftWithValidation({
      draft: draft!,
      validation: {
        ...validation!,
        id: "resume_validation_blocking_error",
        issues: [
          {
            id: "issue_blocking_error",
            severity: "error",
            category: "invented_metric",
            sectionId: null,
            entryId: null,
            bulletId: null,
            message: "A metric is not grounded in candidate evidence.",
          },
        ],
      },
    });

    await expect(
      workspaceService.approveResume("job_ready", exportArtifact!.id),
    ).rejects.toThrow(/blocking validation errors/i);
  });
});
