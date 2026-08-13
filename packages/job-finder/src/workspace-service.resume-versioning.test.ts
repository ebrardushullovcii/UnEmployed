import { describe, expect, test } from "vitest";
import { buildResumeDraftStateHash } from "./internal/resume-workspace-helpers";
import { createAiClient } from "./workspace-service.test-runtimes";
import { createWorkspaceServiceHarness } from "./workspace-service.test-support";

function findEditableTextSection(
  sections: readonly { id: string; text: string | null }[],
) {
  const section = sections.find((entry) => entry.text?.trim());
  if (!section) {
    throw new Error(
      "Expected an editable text section in the generated resume.",
    );
  }
  return section;
}

describe("resume draft versioning", () => {
  test("captures the exact pre-save draft and skips no-op revisions", async () => {
    const { repository, workspaceService } = createWorkspaceServiceHarness();
    await workspaceService.generateResume("job_ready");
    const before = await workspaceService.getResumeWorkspace("job_ready");

    await workspaceService.saveResumeDraft({
      ...before.draft,
      identity: {
        ...before.draft.identity!,
        fullName: before.draft.identity?.fullName ?? "Alex Vanguard",
        headline: "Senior workflow systems designer",
      },
    });

    const after = await workspaceService.getResumeWorkspace("job_ready");
    const revisions = await repository.listResumeDraftRevisions(
      before.draft.id,
    );

    expect(revisions).toHaveLength(1);
    expect(revisions[0]).toMatchObject({
      actor: "user",
      mutationKind: "manual_save",
      parentRevisionId: null,
      restoredFromRevisionId: null,
      diff: { identityChanged: true },
    });
    expect(revisions[0]?.snapshotDraft).toEqual(before.draft);
    expect(revisions[0]?.beforeHash).toBe(
      buildResumeDraftStateHash(before.draft),
    );
    expect(revisions[0]?.afterHash).toBe(
      buildResumeDraftStateHash(after.draft),
    );

    await workspaceService.saveResumeDraft(after.draft);
    expect(
      await repository.listResumeDraftRevisions(before.draft.id),
    ).toHaveLength(1);
  });

  test("assistant edits stay proposed until selected changes are approved into version history", async () => {
    const baseAiClient = createAiClient();
    const { repository, workspaceService } = createWorkspaceServiceHarness({
      aiClient: {
        ...baseAiClient,
        reviseResumeDraft(input) {
          const section = findEditableTextSection(input.draft.sections);
          return Promise.resolve({
            content: "Updated one grounded section.",
            patches: [
              {
                id: "assistant_versioning_patch",
                draftId: input.draft.id,
                operation: "replace_section_text" as const,
                targetSectionId: section.id,
                targetEntryId: null,
                anchorEntryId: null,
                targetBulletId: null,
                anchorBulletId: null,
                position: null,
                newText: `${section.text} Refined for clarity.`,
                newIncluded: null,
                newLocked: null,
                newBullets: null,
                appliedAt: new Date().toISOString(),
                origin: "assistant" as const,
                conflictReason: null,
              },
              {
                id: "assistant_versioning_patch_unselected",
                draftId: input.draft.id,
                operation: "replace_section_text" as const,
                targetSectionId: section.id,
                targetEntryId: null,
                anchorEntryId: null,
                targetBulletId: null,
                anchorBulletId: null,
                position: null,
                newText: `${section.text} This alternative must stay unselected.`,
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
    const before = await workspaceService.getResumeWorkspace("job_ready");

    const messages = await workspaceService.sendResumeAssistantMessage(
      "job_ready",
      "Make one section clearer.",
    );

    const proposed = await workspaceService.getResumeWorkspace("job_ready");
    const proposal = messages.find(
      (message) => message.role === "assistant" && message.patches.length > 0,
    );
    expect(proposal).toMatchObject({
      proposalStatus: "pending",
      baseDraftUpdatedAt: before.draft.updatedAt,
      resolvedPatchIds: [],
    });
    expect(proposal?.content).toMatch(/prepared.*nothing changed yet/i);
    expect(proposal?.content).not.toMatch(/\bapplied\b/i);
    expect(proposed.draft).toEqual(before.draft);
    expect(
      await repository.listResumeDraftRevisions(before.draft.id),
    ).toHaveLength(0);

    await workspaceService.resolveResumeAssistantProposal(
      "job_ready",
      proposal!.id,
      "accept",
      [proposal!.patches[0]!.id],
    );

    const after = await workspaceService.getResumeWorkspace("job_ready");
    const revisions = await repository.listResumeDraftRevisions(
      before.draft.id,
    );

    expect(revisions).toHaveLength(1);
    expect(revisions[0]).toMatchObject({
      actor: "assistant",
      mutationKind: "assistant_patch",
    });
    expect(revisions[0]?.snapshotDraft).toEqual(before.draft);
    expect(revisions[0]?.snapshotDraft?.sections).not.toEqual(
      after.draft.sections,
    );
    expect(revisions[0]?.afterHash).toBe(
      buildResumeDraftStateHash(after.draft),
    );
    expect(JSON.stringify(after.draft.sections)).not.toContain(
      "This alternative must stay unselected.",
    );
    const resolved = (
      await workspaceService.getResumeAssistantMessages("job_ready")
    ).find((message) => message.id === proposal!.id);
    expect(resolved).toMatchObject({
      proposalStatus: "accepted",
      resolvedPatchIds: [proposal!.patches[0]!.id],
      proposalError: null,
    });
  });

  test("rejects a proposal without mutating the draft", async () => {
    const baseAiClient = createAiClient();
    const { repository, workspaceService } = createWorkspaceServiceHarness({
      aiClient: {
        ...baseAiClient,
        reviseResumeDraft(input) {
          const section = findEditableTextSection(input.draft.sections);
          return Promise.resolve({
            content: "One optional rewrite.",
            patches: [
              {
                id: "assistant_rejected_patch",
                draftId: input.draft.id,
                operation: "replace_section_text" as const,
                targetSectionId: section.id,
                targetEntryId: null,
                anchorEntryId: null,
                targetBulletId: null,
                anchorBulletId: null,
                position: null,
                newText: `${section.text} Optional rewrite.`,
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
    const before = await workspaceService.getResumeWorkspace("job_ready");
    const messages = await workspaceService.sendResumeAssistantMessage(
      "job_ready",
      "Offer a rewrite.",
    );
    const proposal = messages.find(
      (message) => message.proposalStatus === "pending",
    )!;

    await workspaceService.resolveResumeAssistantProposal(
      "job_ready",
      proposal.id,
      "reject",
      [],
    );

    expect(
      (await workspaceService.getResumeWorkspace("job_ready")).draft,
    ).toEqual(before.draft);
    expect(
      await repository.listResumeDraftRevisions(before.draft.id),
    ).toHaveLength(0);
    expect(
      (await workspaceService.getResumeAssistantMessages("job_ready")).find(
        (message) => message.id === proposal.id,
      )?.proposalStatus,
    ).toBe("rejected");
  });

  test("does not offer an empty text replacement for approval", async () => {
    const baseAiClient = createAiClient();
    const { workspaceService } = createWorkspaceServiceHarness({
      aiClient: {
        ...baseAiClient,
        reviseResumeDraft(input) {
          const section = findEditableTextSection(input.draft.sections);
          return Promise.resolve({
            content: "Prepared a shorter summary.",
            patches: [
              {
                id: "assistant_empty_replacement",
                draftId: input.draft.id,
                operation: "replace_section_text" as const,
                targetSectionId: section.id,
                targetEntryId: null,
                anchorEntryId: null,
                targetBulletId: null,
                anchorBulletId: null,
                position: null,
                newText: null,
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
    const before = await workspaceService.getResumeWorkspace("job_ready");

    const messages = await workspaceService.sendResumeAssistantMessage(
      "job_ready",
      "Shorten the summary.",
    );
    const reply = messages.find((message) => message.role === "assistant");

    expect(reply).toMatchObject({
      proposalStatus: "none",
      patches: [],
    });
    expect(reply?.content).toMatch(/no resume change was proposed/i);
    expect(
      (await workspaceService.getResumeWorkspace("job_ready")).draft,
    ).toEqual(before.draft);
  });

  test("keeps a stale proposal pending and visible after a newer manual edit", async () => {
    const baseAiClient = createAiClient();
    const { repository, workspaceService } = createWorkspaceServiceHarness({
      aiClient: {
        ...baseAiClient,
        reviseResumeDraft(input) {
          const section = findEditableTextSection(input.draft.sections);
          return Promise.resolve({
            content: "One grounded rewrite is ready for review.",
            patches: [
              {
                id: "assistant_stale_proposal_patch",
                draftId: input.draft.id,
                operation: "replace_section_text" as const,
                targetSectionId: section.id,
                targetEntryId: null,
                anchorEntryId: null,
                targetBulletId: null,
                anchorBulletId: null,
                position: null,
                newText: `${section.text} Proposed wording.`,
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
    const messages = await workspaceService.sendResumeAssistantMessage(
      "job_ready",
      "Shorten the summary and tighten one experience bullet for ATS readability.",
    );
    const proposal = messages.find(
      (message) => message.proposalStatus === "pending",
    );
    expect(proposal).toBeTruthy();

    const current = await workspaceService.getResumeWorkspace("job_ready");
    const section = findEditableTextSection(current.draft.sections);
    await workspaceService.applyResumePatch({
      id: "newer_edit_before_proposal_acceptance",
      draftId: current.draft.id,
      operation: "replace_section_text",
      targetSectionId: section.id,
      targetEntryId: null,
      anchorEntryId: null,
      targetBulletId: null,
      anchorBulletId: null,
      position: null,
      newText: `${section.text} Newer manual wording.`,
      newIncluded: null,
      newLocked: null,
      newBullets: null,
      appliedAt: new Date().toISOString(),
      origin: "user",
      conflictReason: null,
    });

    await expect(
      workspaceService.resolveResumeAssistantProposal(
        "job_ready",
        proposal!.id,
        "accept",
        proposal!.patches.map((patch) => patch.id),
      ),
    ).rejects.toThrow(/changed after this proposal was created/i);

    const persistedProposal = (
      await workspaceService.getResumeAssistantMessages("job_ready")
    ).find((message) => message.id === proposal!.id);
    expect(persistedProposal).toMatchObject({
      proposalStatus: "pending",
    });
    expect(persistedProposal?.proposalError).toMatch(
      /changed after this proposal was created/i,
    );
    expect(
      await repository.listResumeDraftRevisions(current.draft.id),
    ).toHaveLength(1);
  });

  test("rejects a stale editor save without overwriting newer work", async () => {
    const { repository, workspaceService } = createWorkspaceServiceHarness();
    await workspaceService.generateResume("job_ready");
    const staleWorkspace =
      await workspaceService.getResumeWorkspace("job_ready");
    const section = findEditableTextSection(staleWorkspace.draft.sections);

    await workspaceService.applyResumePatch(
      {
        id: "newer_manual_patch",
        draftId: staleWorkspace.draft.id,
        operation: "replace_section_text",
        targetSectionId: section.id,
        targetEntryId: null,
        anchorEntryId: null,
        targetBulletId: null,
        anchorBulletId: null,
        position: null,
        newText: `${section.text} Newer saved edit.`,
        newIncluded: null,
        newLocked: null,
        newBullets: null,
        appliedAt: new Date().toISOString(),
        origin: "user",
        conflictReason: null,
      },
      "Newer manual edit",
    );
    const newerWorkspace =
      await workspaceService.getResumeWorkspace("job_ready");

    await expect(
      workspaceService.saveResumeDraft({
        ...staleWorkspace.draft,
        identity: {
          ...staleWorkspace.draft.identity!,
          fullName: staleWorkspace.draft.identity?.fullName ?? "Alex Vanguard",
          headline: "Stale editor overwrite attempt",
        },
      }),
    ).rejects.toThrow(/changed before this edit could be saved/i);

    const persisted = await workspaceService.getResumeWorkspace("job_ready");
    expect(buildResumeDraftStateHash(persisted.draft)).toBe(
      buildResumeDraftStateHash(newerWorkspace.draft),
    );
    expect(
      await repository.listResumeDraftRevisions(staleWorkspace.draft.id),
    ).toHaveLength(1);
  });
  test("rejects a slow regeneration when a newer edit wins the draft CAS", async () => {
    const baseAiClient = createAiClient();
    let generationCount = 0;
    let releaseSecondGeneration!: () => void;
    let markSecondGenerationStarted!: () => void;
    const secondGenerationGate = new Promise<void>((resolve) => {
      releaseSecondGeneration = resolve;
    });
    const secondGenerationStarted = new Promise<void>((resolve) => {
      markSecondGenerationStarted = resolve;
    });
    const { repository, workspaceService } = createWorkspaceServiceHarness({
      aiClient: {
        ...baseAiClient,
        async createResumeDraft(input) {
          generationCount += 1;
          if (generationCount === 2) {
            markSecondGenerationStarted();
            await secondGenerationGate;
          }
          const result = await baseAiClient.createResumeDraft(input);
          return {
            ...result,
            summary: `${result.summary} Generation ${generationCount}.`,
          };
        },
      },
    });
    await workspaceService.generateResume("job_ready");
    const before = await workspaceService.getResumeWorkspace("job_ready");
    const section = findEditableTextSection(before.draft.sections);

    const regeneration = workspaceService.regenerateResumeDraft("job_ready");
    await secondGenerationStarted;
    await workspaceService.applyResumePatch(
      {
        id: "edit_while_regeneration_runs",
        draftId: before.draft.id,
        operation: "replace_section_text",
        targetSectionId: section.id,
        targetEntryId: null,
        anchorEntryId: null,
        targetBulletId: null,
        anchorBulletId: null,
        position: null,
        newText: `${section.text} User edit wins.`,
        newIncluded: null,
        newLocked: null,
        newBullets: null,
        appliedAt: new Date().toISOString(),
        origin: "user",
        conflictReason: null,
      },
      "Edit while regeneration runs",
    );
    const afterUserEdit =
      await workspaceService.getResumeWorkspace("job_ready");
    releaseSecondGeneration();

    await expect(regeneration).rejects.toThrow(
      /changed before this edit could be saved/i,
    );
    const persisted = await workspaceService.getResumeWorkspace("job_ready");
    expect(buildResumeDraftStateHash(persisted.draft)).toBe(
      buildResumeDraftStateHash(afterUserEdit.draft),
    );
    expect(
      await repository.listResumeDraftRevisions(before.draft.id),
    ).toHaveLength(1);
  });
  test("restores a prior draft as a new revision while invalidating approval and preserving the original CV", async () => {
    const { repository, workspaceService } = createWorkspaceServiceHarness();
    const profileBefore = await repository.getProfile();
    await workspaceService.generateResume("job_ready");
    const initial = await workspaceService.getResumeWorkspace("job_ready");

    await workspaceService.saveResumeDraft({
      ...initial.draft,
      identity: {
        ...initial.draft.identity!,
        headline: "First saved headline",
      },
    });
    const firstEdit = await workspaceService.getResumeWorkspace("job_ready");
    await workspaceService.saveResumeDraft({
      ...firstEdit.draft,
      identity: {
        ...firstEdit.draft.identity!,
        headline: "Second saved headline",
      },
    });
    const secondEdit = await workspaceService.getResumeWorkspace("job_ready");
    const targetRevision = secondEdit.revisions.find(
      (revision) => revision.parentRevisionId === null,
    );
    expect(targetRevision?.snapshotDraft).toEqual(initial.draft);

    const exported = await workspaceService.exportResumePdf("job_ready");
    const exportArtifact = exported.resumeExportArtifacts.find(
      (artifact) => artifact.jobId === "job_ready",
    );
    expect(exportArtifact).toBeTruthy();
    await workspaceService.approveResume("job_ready", exportArtifact!.id);
    const approved = await workspaceService.getResumeWorkspace("job_ready");

    await workspaceService.restoreResumeDraftRevision(
      "job_ready",
      targetRevision!.id,
    );
    const restored = await workspaceService.getResumeWorkspace("job_ready");
    const profileAfter = await repository.getProfile();

    expect(buildResumeDraftStateHash(restored.draft)).toBe(
      buildResumeDraftStateHash(initial.draft),
    );
    expect(restored.draft).toMatchObject({
      status: "needs_review",
      approvedAt: null,
      approvedExportId: null,
      staleReason: "Restored from resume history and needs a fresh review.",
    });
    expect(restored.exports.every((artifact) => !artifact.isApproved)).toBe(
      true,
    );
    expect(restored.tailoredAsset?.storagePath).toBeNull();
    expect(restored.validation?.draftContentHash).toBeTruthy();
    expect(restored.revisions[0]).toMatchObject({
      actor: "restore",
      mutationKind: "restore",
      parentRevisionId: secondEdit.revisions[0]?.id,
      restoredFromRevisionId: targetRevision?.id,
      snapshotDraft: approved.draft,
    });
    expect(profileAfter.baseResume).toEqual(profileBefore.baseResume);
  });
});
