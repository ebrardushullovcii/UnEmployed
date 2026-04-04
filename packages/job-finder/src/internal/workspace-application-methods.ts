import {
  ApplicationAttemptSchema,
  ApplicationRecordSchema,
  JobFinderResumeWorkspaceSchema,
  ResumeAssistantMessageSchema,
  ResumeDraftPatchSchema,
  ResumeDraftSchema,
  SavedJobSchema,
  TailoredAssetSchema,
  type JobFinderResumeWorkspace,
  type ResumeDraft,
  type ResumeDraftPatch,
  type SavedJob,
  type TailoredAsset,
} from "@unemployed/contracts";
import { mergeSavedJobs } from "./workspace-service-helpers";
import { buildInstructionGuidance, mergeEvents, nextAssetVersion, nextJobStatusFromAttempt, resolveActiveSourceInstructionArtifact, toApplicationEvents } from "./workspace-helpers";
import { normalizeText, uniqueStrings } from "./shared";
import {
  applyPatchToResumeDraft,
  buildAssistantReplyMessage,
  buildResumeDraftFromTailoredDraft,
  buildResumeDraftRevision,
  buildResumeExportArtifact,
  buildTailoredResumeTextFromResumeDraft,
  buildTailoredAssetBridge,
  buildUnavailableAssistantReply,
  collectResearchContext,
  collectResumeWorkspaceEvidence,
  seedResumeDraft,
  validateResumeDraft,
} from "./resume-workspace-helpers";
import type { WorkspaceServiceContext } from "./workspace-service-context";
import type { JobFinderWorkspaceService } from "./workspace-service-contracts";

export function createWorkspaceApplicationMethods(
  ctx: WorkspaceServiceContext,
): Pick<
  JobFinderWorkspaceService,
  | "queueJobForReview"
  | "dismissDiscoveryJob"
  | "generateResume"
  | "getResumeWorkspace"
  | "saveResumeDraft"
  | "regenerateResumeDraft"
  | "regenerateResumeSection"
  | "exportResumePdf"
  | "approveResume"
  | "clearResumeApproval"
  | "applyResumePatch"
  | "getResumeAssistantMessages"
  | "sendResumeAssistantMessage"
  | "approveApply"
> {
  async function loadResumeWorkspaceState(jobId: string): Promise<{
    profile: Awaited<ReturnType<typeof ctx.repository.getProfile>>;
    settings: Awaited<ReturnType<typeof ctx.repository.getSettings>>;
    job: SavedJob;
    draft: ResumeDraft | null;
    tailoredAsset: TailoredAsset | null;
  }> {
    const [profile, settings, savedJobs, tailoredAssets, draft] = await Promise.all([
      ctx.repository.getProfile(),
      ctx.repository.getSettings(),
      ctx.repository.listSavedJobs(),
      ctx.repository.listTailoredAssets(),
      ctx.repository.getResumeDraftByJobId(jobId),
    ]);
    const job = savedJobs.find((entry) => entry.id === jobId);

    if (!job) {
      throw new Error(`Unknown Job Finder job '${jobId}'.`);
    }

    return {
      profile,
      settings,
      job,
      draft,
      tailoredAsset: tailoredAssets.find((entry) => entry.jobId === jobId) ?? null,
    };
  }

  async function ensureResumeDraft(jobId: string): Promise<{
    profile: Awaited<ReturnType<typeof ctx.repository.getProfile>>;
    settings: Awaited<ReturnType<typeof ctx.repository.getSettings>>;
    job: SavedJob;
    draft: ResumeDraft;
    tailoredAsset: TailoredAsset | null;
  }> {
    const state = await loadResumeWorkspaceState(jobId);

    if (state.draft) {
      return {
        ...state,
        draft: state.draft,
      };
    }

    const seededDraft = seedResumeDraft({
      profile: state.profile,
      job: state.job,
      settings: state.settings,
      tailoredAsset: state.tailoredAsset,
    });
    const validation = validateResumeDraft({
      draft: seededDraft,
      job: state.job,
      validatedAt: seededDraft.updatedAt,
    });
    const tailoredAsset = buildTailoredAssetBridge({
      draft: seededDraft,
      job: state.job,
      profile: state.profile,
      existingAsset: state.tailoredAsset,
      storagePath: state.tailoredAsset?.storagePath ?? null,
    });

    await ctx.repository.saveResumeDraftWithValidation({
      draft: seededDraft,
      validation,
      tailoredAsset,
    });

    return {
      ...state,
      draft: seededDraft,
      tailoredAsset,
    };
  }

  async function renderDraftToPdf(input: {
    job: SavedJob;
    profile: Awaited<ReturnType<typeof ctx.repository.getProfile>>;
    settings: Awaited<ReturnType<typeof ctx.repository.getSettings>>;
    draft: ResumeDraft;
    outputPath?: string | null;
  }) {
    const previewSections = buildTailoredAssetBridge({
      draft: input.draft,
      job: input.job,
      profile: input.profile,
    }).previewSections;
    const textContent = buildTailoredResumeTextFromResumeDraft(
      input.profile,
      input.job,
      input.draft,
    );

    return ctx.documentManager.renderResumeArtifact({
      job: input.job,
      profile: input.profile,
      previewSections,
      settings: input.settings,
      textContent,
      targetPath: input.outputPath ?? null,
    });
  }

  async function fetchAndPersistResearch(job: SavedJob) {
    if (!ctx.researchAdapter) {
      return ctx.repository.listResumeResearchArtifacts(job.id);
    }

    const profile = await ctx.repository.getProfile();
    const fetchedArtifacts = await ctx.researchAdapter.fetchResearchPages({
      job,
      profile,
    });

    for (const artifact of fetchedArtifacts) {
      await ctx.repository.upsertResumeResearchArtifact(artifact);
    }

    return ctx.repository.listResumeResearchArtifacts(job.id);
  }

  async function buildResumeWorkspace(jobId: string): Promise<JobFinderResumeWorkspace> {
    const { job, draft, tailoredAsset } = await ensureResumeDraft(jobId);
    const [validations, exports, research, assistantMessages] = await Promise.all([
      ctx.repository.listResumeValidationResults(draft.id),
      ctx.repository.listResumeExportArtifacts({ jobId }),
      ctx.repository.listResumeResearchArtifacts(jobId),
      ctx.repository.listResumeAssistantMessages(jobId),
    ]);
    const normalizedExports = exports.map((artifact) => ({
      ...artifact,
      isApproved: draft.approvedExportId === artifact.id,
    }));

    return JobFinderResumeWorkspaceSchema.parse({
      job,
      draft,
      validation: validations[0] ?? null,
      exports: normalizedExports,
      research,
      assistantMessages,
      tailoredAsset,
    });
  }

  return {
    async queueJobForReview(jobId) {
      const discoveryState = await ctx.repository.getDiscoveryState();
      const pendingIndex = discoveryState.pendingDiscoveryJobs.findIndex(
        (job) => job.id === jobId,
      );

      if (pendingIndex >= 0) {
        const pendingJob = discoveryState.pendingDiscoveryJobs[pendingIndex];
        const savedJobs = await ctx.repository.listSavedJobs();
        const nextJob = SavedJobSchema.parse({
          ...pendingJob,
          status: "shortlisted",
        });
        await ctx.repository.replaceSavedJobs(mergeSavedJobs(savedJobs, [nextJob]));
        await ctx.persistDiscoveryState((current) => ({
          ...current,
          pendingDiscoveryJobs: current.pendingDiscoveryJobs.filter(
            (job) => job.id !== jobId,
          ),
        }));
      } else {
        const tailoredAssets = await ctx.repository.listTailoredAssets();
        const asset = tailoredAssets.find((entry) => entry.jobId === jobId);

        await ctx.updateJob(jobId, (job) => ({
          ...job,
          status: asset?.status === "ready" ? "ready_for_review" : "drafting",
        }));
      }

      return ctx.getWorkspaceSnapshot();
    },
    async dismissDiscoveryJob(jobId) {
      const discoveryState = await ctx.repository.getDiscoveryState();
      const pendingIndex = discoveryState.pendingDiscoveryJobs.findIndex(
        (job) => job.id === jobId,
      );

      if (pendingIndex >= 0) {
        await ctx.persistDiscoveryState((current) => ({
          ...current,
          pendingDiscoveryJobs: current.pendingDiscoveryJobs.filter(
            (job) => job.id !== jobId,
          ),
        }));
      } else {
        await ctx.updateJob(jobId, (job) => ({
          ...job,
          status: "archived",
        }));
      }

      return ctx.getWorkspaceSnapshot();
    },
    async generateResume(jobId) {
      const [profile, searchPreferences, settings, savedJobs, tailoredAssets] =
        await Promise.all([
          ctx.repository.getProfile(),
          ctx.repository.getSearchPreferences(),
          ctx.repository.getSettings(),
          ctx.repository.listSavedJobs(),
          ctx.repository.listTailoredAssets(),
        ]);
      const job = savedJobs.find((entry) => entry.id === jobId);

      if (!job) {
        throw new Error(
          `Unable to generate a resume for unknown job '${jobId}'.`,
        );
      }

      const existingAsset = tailoredAssets.find((asset) => asset.jobId === jobId);
      const existingDraft = await ctx.repository.getResumeDraftByJobId(jobId);
      const research = await fetchAndPersistResearch(job);
      const evidence = collectResumeWorkspaceEvidence({
        profile,
        job,
        research,
      });
      const researchContext = collectResearchContext(research);
      const draft = await ctx.aiClient.createResumeDraft({
        profile,
        searchPreferences,
        settings,
        job,
        resumeText: profile.baseResume.textContent,
        evidence,
        researchContext,
      });
      const generationMethod = draft.notes.some((note: string) =>
        normalizeText(note).includes("deterministic"),
      )
        ? "deterministic"
        : ctx.aiClient.getStatus().kind === "openai_compatible"
          ? "ai_assisted"
          : "deterministic";
      const now = new Date().toISOString();
      const resumeDraft = buildResumeDraftFromTailoredDraft({
        job,
        settings,
        draft,
        createdAt: existingDraft?.createdAt ?? now,
        existingDraftId: existingDraft?.id ?? null,
        generationMethod: generationMethod === "ai_assisted" ? "ai" : "deterministic",
        profile,
        research,
      });
      const previewSections = buildTailoredAssetBridge({
        draft: resumeDraft,
        job,
        profile,
      }).previewSections;
      const contentText =
        draft.fullText ||
        buildTailoredResumeTextFromResumeDraft(profile, job, resumeDraft);
      const renderedArtifact = await ctx.documentManager.renderResumeArtifact({
        job,
        profile,
        previewSections,
        settings,
        textContent: contentText,
      });

      if (!renderedArtifact.storagePath) {
        throw new Error(
          `Resume export failed for '${job.title}' at '${job.company}'.`,
        );
      }

      const selectedTemplate = ctx.documentManager
        .listResumeTemplates()
        .find((template) => template.id === settings.resumeTemplateId);
      const validation = validateResumeDraft({
        draft: resumeDraft,
        job,
        pageCount: renderedArtifact.pageCount ?? null,
        validatedAt: now,
      });
      const nextAsset = TailoredAssetSchema.parse({
        id: existingAsset?.id ?? `resume_${jobId}`,
        jobId,
        kind: "resume",
        status: "ready",
        label: draft.label ?? "Tailored Resume",
        version: nextAssetVersion(existingAsset),
        templateName:
          selectedTemplate?.label ?? existingAsset?.templateName ?? "Classic ATS",
        compatibilityScore:
          draft.compatibilityScore ?? Math.min(100, job.matchAssessment.score + 3),
        progressPercent: 100,
        updatedAt: new Date().toISOString(),
        storagePath: renderedArtifact.storagePath,
        contentText,
        previewSections,
        generationMethod,
        notes: uniqueStrings([
          ...draft.notes,
          ...(renderedArtifact.fileName
            ? [
                `Generated ${renderedArtifact.format.toUpperCase()} resume artifact ${renderedArtifact.fileName}.`,
              ]
            : []),
          ...(renderedArtifact.intermediateFileName
            ? [
                `Saved HTML debug render ${renderedArtifact.intermediateFileName}.`,
              ]
            : []),
          ...(renderedArtifact.pageCount !== null &&
          renderedArtifact.pageCount !== undefined
            ? [`Generated PDF page count: ${renderedArtifact.pageCount}.`]
            : []),
          ...(renderedArtifact.warnings ?? []),
          ...(renderedArtifact.pageCount !== null &&
          renderedArtifact.pageCount !== undefined &&
          renderedArtifact.pageCount > 2
            ? [
                renderedArtifact.pageCount >= 3
                  ? "Resume export reached 3 or more pages and needs review before apply."
                  : "Resume export exceeded the 2-page target and should be reviewed.",
              ]
            : []),
        ]),
      });

      await ctx.repository.saveResumeDraftWithValidation({
        draft: resumeDraft,
        validation,
        tailoredAsset: nextAsset,
      });
      await ctx.updateJob(jobId, (currentJob) => ({
        ...currentJob,
        status: "ready_for_review",
      }));

      return ctx.getWorkspaceSnapshot();
    },
    async getResumeWorkspace(jobId) {
      return buildResumeWorkspace(jobId);
    },
    async saveResumeDraft(draft) {
      const parsedDraft = ResumeDraftSchema.parse(draft);
      const { job, profile, tailoredAsset } = await ensureResumeDraft(parsedDraft.jobId);
      const now = new Date().toISOString();
      const nextDraft = ResumeDraftSchema.parse({
        ...parsedDraft,
        status:
          parsedDraft.approvedAt || parsedDraft.approvedExportId ? "stale" : "needs_review",
        approvedAt: null,
        approvedExportId: null,
        staleReason:
          parsedDraft.approvedAt || parsedDraft.approvedExportId
            ? "Draft changed after approval and needs a fresh review."
            : null,
        updatedAt: now,
      });
      const validation = validateResumeDraft({
        draft: nextDraft,
        job,
        validatedAt: now,
      });
      const nextAsset = buildTailoredAssetBridge({
        draft: nextDraft,
        job,
        profile,
        existingAsset: tailoredAsset,
        storagePath: tailoredAsset?.storagePath ?? null,
      });

      await ctx.repository.saveResumeDraftWithValidation({
        draft: nextDraft,
        validation,
        tailoredAsset: nextAsset,
      });

      return ctx.getWorkspaceSnapshot();
    },
    async regenerateResumeDraft(jobId) {
      return this.generateResume(jobId);
    },
    async regenerateResumeSection(jobId, sectionId) {
      const state = await ensureResumeDraft(jobId);
      const { draft } = state;
      const targetSection = draft.sections.find((section) => section.id === sectionId);

      if (!targetSection) {
        throw new Error(`Unable to regenerate unknown resume section '${sectionId}'.`);
      }

      const research = await fetchAndPersistResearch(state.job);
      const assistantReply = await ctx.aiClient.reviseResumeDraft({
        draft,
        job: state.job,
        request: `Regenerate the ${targetSection.label} section for stronger alignment with ${state.job.title} at ${state.job.company}.`,
        validationIssues: (await ctx.repository.listResumeValidationResults(draft.id))[0]?.issues.map((issue) => issue.message) ?? [],
        researchContext: collectResearchContext(research),
      });
      const sectionPatch = assistantReply.patches.find(
        (patch) => patch.targetSectionId === sectionId,
      );

      if (!sectionPatch) {
        return this.applyResumePatch({
          id: `resume_patch_regen_${sectionId}_${Date.now()}`,
          draftId: draft.id,
          operation: targetSection.text ? "replace_section_text" : "replace_section_bullets",
          targetSectionId: sectionId,
          targetBulletId: null,
          anchorBulletId: null,
          position: null,
          newText: targetSection.text,
          newIncluded: null,
          newLocked: null,
          newBullets: targetSection.bullets,
          appliedAt: new Date().toISOString(),
          origin: "user",
          conflictReason: null,
        }, "Regenerated section fallback");
      }

      return this.applyResumePatch(sectionPatch, "Regenerated section");
    },
    async exportResumePdf(jobId, outputPath) {
      const { draft, job, profile, settings, tailoredAsset } = await ensureResumeDraft(jobId);
      const renderedArtifact = await renderDraftToPdf({
        job,
        profile,
        settings,
        draft,
        outputPath: outputPath ?? null,
      });

      if (!renderedArtifact.storagePath) {
        throw new Error(`Resume export failed for '${job.title}' at '${job.company}'.`);
      }

      const exportedAt = new Date().toISOString();
      const exportArtifact = buildResumeExportArtifact({
        draft,
        job,
        filePath: renderedArtifact.storagePath,
        pageCount: renderedArtifact.pageCount ?? null,
        exportedAt,
      });
      const validation = validateResumeDraft({
        draft,
        job,
        pageCount: renderedArtifact.pageCount ?? null,
        validatedAt: exportedAt,
      });
      const nextAsset = buildTailoredAssetBridge({
        draft,
        job,
        profile,
        existingAsset: tailoredAsset,
        storagePath: renderedArtifact.storagePath,
        pageCount: renderedArtifact.pageCount ?? null,
        notes: uniqueStrings([
          ...(renderedArtifact.fileName
            ? [`Generated PDF resume artifact ${renderedArtifact.fileName}.`]
            : []),
          ...(renderedArtifact.intermediateFileName
            ? [`Saved HTML debug render ${renderedArtifact.intermediateFileName}.`]
            : []),
          ...(renderedArtifact.warnings ?? []),
        ]),
      });

      await ctx.repository.upsertResumeExportArtifact(exportArtifact);
      await ctx.repository.saveResumeDraftWithValidation({
        draft,
        validation,
        tailoredAsset: nextAsset,
      });

      return ctx.getWorkspaceSnapshot();
    },
    async approveResume(jobId, exportId) {
      const { draft, job, profile, tailoredAsset } = await ensureResumeDraft(jobId);
      const [exports, validations] = await Promise.all([
        ctx.repository.listResumeExportArtifacts({ jobId }),
        ctx.repository.listResumeValidationResults(draft.id),
      ]);
      const targetExport = exports.find((artifact) => artifact.id === exportId);
      const latestValidation = validations[0] ?? null;

      if (!targetExport) {
        throw new Error(`Unable to approve unknown resume export '${exportId}'.`);
      }

      if (targetExport.draftId !== draft.id) {
        throw new Error(
          `Resume export '${exportId}' does not belong to the current draft and cannot be approved.`,
        );
      }

      if (
        new Date(targetExport.exportedAt).getTime() <
        new Date(draft.updatedAt).getTime()
      ) {
        throw new Error(
          `Resume export '${exportId}' is older than the current draft and cannot be approved. Export a fresh PDF first.`,
        );
      }

      if (latestValidation?.issues.some((issue) => issue.severity === "error")) {
        throw new Error(
          `Resume export '${exportId}' still has blocking validation errors and cannot be approved yet.`,
        );
      }

      const approvedAt = new Date().toISOString();
      const approvedDraft = ResumeDraftSchema.parse({
        ...draft,
        status: "approved",
        approvedAt,
        approvedExportId: targetExport.id,
        staleReason: null,
        updatedAt: approvedAt,
      });
      const nextAsset = buildTailoredAssetBridge({
        draft: approvedDraft,
        job,
        profile,
        existingAsset: tailoredAsset,
        storagePath: targetExport.filePath,
        pageCount: targetExport.pageCount,
      });

      await ctx.repository.approveResumeExport({
        draft: approvedDraft,
        exportArtifact: {
          ...targetExport,
          isApproved: true,
        },
        validation: latestValidation,
        tailoredAsset: nextAsset,
      });

      return ctx.getWorkspaceSnapshot();
    },
    async clearResumeApproval(jobId) {
      const { draft, job, profile, tailoredAsset } = await ensureResumeDraft(jobId);
      const nextDraft = ResumeDraftSchema.parse({
        ...draft,
        status: "stale",
        approvedAt: null,
        approvedExportId: null,
        staleReason: "Resume approval was cleared and needs a fresh review.",
        updatedAt: new Date().toISOString(),
      });
      const nextAsset = buildTailoredAssetBridge({
        draft: nextDraft,
        job,
        profile,
        existingAsset: tailoredAsset,
        clearStoragePath: true,
      });

      await ctx.repository.clearResumeApproval({
        draft: nextDraft,
        staleReason: nextDraft.staleReason ?? "Resume approval cleared.",
        tailoredAsset: nextAsset,
      });

      return ctx.getWorkspaceSnapshot();
    },
    async applyResumePatch(patch, revisionReason) {
      const parsedPatch = ResumeDraftPatchSchema.parse(patch);
      const currentDraft = (await ctx.repository.listResumeDrafts()).find(
        (entry) => entry.id === parsedPatch.draftId,
      ) ?? null;

      if (!currentDraft) {
        throw new Error(`Unable to find resume draft '${parsedPatch.draftId}'.`);
      }

      const state = await ensureResumeDraft(currentDraft.jobId);

      const updatedAt = new Date().toISOString();
      const nextDraft = applyPatchToResumeDraft({
        draft: currentDraft,
        patch: parsedPatch,
        updatedAt,
      });
      const revision = buildResumeDraftRevision({
        draft: currentDraft,
        createdAt: updatedAt,
        reason: revisionReason ?? null,
      });
      const validation = validateResumeDraft({
        draft: nextDraft,
        job: state.job,
        validatedAt: updatedAt,
      });
      const nextAsset = buildTailoredAssetBridge({
        draft: nextDraft,
        job: state.job,
        profile: state.profile,
        existingAsset: state.tailoredAsset,
        clearStoragePath: true,
      });

      await ctx.repository.applyResumePatchWithRevision({
        draft: nextDraft,
        revision,
        validation,
        tailoredAsset: nextAsset,
      });

      return ctx.getWorkspaceSnapshot();
    },
    async getResumeAssistantMessages(jobId) {
      await ensureResumeDraft(jobId);
      return ctx.repository.listResumeAssistantMessages(jobId);
    },
    async sendResumeAssistantMessage(jobId, content) {
      const workspaceState = await ensureResumeDraft(jobId);
      const userMessage = ResumeAssistantMessageSchema.parse({
        id: `resume_message_user_${jobId}_${Date.now()}`,
        jobId,
        role: "user",
        content,
        patches: [],
        createdAt: new Date().toISOString(),
      });
      const validations = await ctx.repository.listResumeValidationResults(workspaceState.draft.id);
      const research = await fetchAndPersistResearch(workspaceState.job);
      const assistantReply = await ctx.aiClient.reviseResumeDraft({
        draft: workspaceState.draft,
        job: workspaceState.job,
        request: content,
        validationIssues: validations[0]?.issues.map((issue) => issue.message) ?? [],
        researchContext: collectResearchContext(research),
      });
      const assistantMessage = assistantReply.patches.length > 0
        ? buildAssistantReplyMessage({
            jobId,
            content: assistantReply.content,
            patches: assistantReply.patches,
          })
        : buildUnavailableAssistantReply(jobId);

      const appliedPatches: ResumeDraftPatch[] = [];

      for (const patch of assistantReply.patches) {
        try {
          await this.applyResumePatch(patch, `Assistant request: ${content}`);
          appliedPatches.push(patch);
        } catch (error) {
          const failureMessage = buildAssistantReplyMessage({
            jobId,
            content: `${assistantReply.content}\n\nAssistant patch application stopped after ${appliedPatches.length} change${appliedPatches.length === 1 ? "" : "s"}. ${error instanceof Error ? error.message : "A resume patch could not be applied."}`,
            patches: appliedPatches,
          });

          await ctx.repository.upsertResumeAssistantMessage(userMessage);
          await ctx.repository.upsertResumeAssistantMessage(failureMessage);
          return ctx.repository.listResumeAssistantMessages(jobId);
        }
      }

      await ctx.repository.upsertResumeAssistantMessage(userMessage);
      await ctx.repository.upsertResumeAssistantMessage(assistantMessage);

      return ctx.repository.listResumeAssistantMessages(jobId);
    },
    async approveApply(jobId) {
      const [
        profile,
        searchPreferences,
        settings,
        savedJobs,
        tailoredAssets,
        applicationRecords,
        sourceInstructionArtifacts,
        draft,
        approvedExports,
      ] = await Promise.all([
        ctx.repository.getProfile(),
        ctx.repository.getSearchPreferences(),
        ctx.repository.getSettings(),
        ctx.repository.listSavedJobs(),
        ctx.repository.listTailoredAssets(),
        ctx.repository.listApplicationRecords(),
        ctx.repository.listSourceInstructionArtifacts(),
        ctx.repository.getResumeDraftByJobId(jobId),
        ctx.repository.listResumeExportArtifacts({ jobId }),
      ]);
      const job = savedJobs.find((entry) => entry.id === jobId);
      const asset = tailoredAssets.find((entry) => entry.jobId === jobId);
      const approvedExport = draft?.approvedExportId
        ? (approvedExports.find((entry) => entry.id === draft.approvedExportId) ?? null)
        : null;

      if (!job) {
        throw new Error(
          `Unable to approve apply flow for unknown job '${jobId}'.`,
        );
      }

      if (!draft || draft.status !== "approved" || !approvedExport) {
        throw new Error(
          `An approved tailored PDF is required before applying to '${job.title}'.`,
        );
      }

      if (ctx.exportFileVerifier) {
        const approvedFileExists = await ctx.exportFileVerifier.exists(
          approvedExport.filePath,
        );

        if (!approvedFileExists) {
          throw new Error(
            `The approved tailored PDF is missing on disk for '${job.title}'. Re-export and approve the resume again before applying.`,
          );
        }
      }

      if (!asset || asset.status !== "ready" || asset.storagePath !== approvedExport.filePath) {
        throw new Error(
          `A ready approved tailored resume is required before applying to '${job.title}'.`,
        );
      }

      const provenanceTargetId =
        job.provenance[job.provenance.length - 1]?.targetId ??
        job.provenance[0]?.targetId ??
        null;
      const provenanceTarget = provenanceTargetId
        ? (searchPreferences.discovery.targets.find(
            (target) => target.id === provenanceTargetId,
          ) ?? null)
        : null;
      const activeInstruction = provenanceTarget
        ? resolveActiveSourceInstructionArtifact(
            provenanceTarget,
            sourceInstructionArtifacts,
          )
        : null;
      const applyInstructions = uniqueStrings([
        ...buildInstructionGuidance(activeInstruction),
      ]);

      const executionResult = await ctx.browserRuntime.executeEasyApply(job.source, {
        job,
        resumeExport: approvedExport,
        resumeFilePath: approvedExport.filePath,
        profile,
        settings,
        ...(applyInstructions.length > 0 ? { instructions: applyInstructions } : {}),
      });
      const now = new Date().toISOString();
      const attempt = ApplicationAttemptSchema.parse({
        id: `attempt_${jobId}_${Date.now()}`,
        jobId,
        state: executionResult.state,
        summary: executionResult.summary,
        detail: executionResult.detail,
        startedAt: executionResult.checkpoints[0]?.at ?? now,
        updatedAt: executionResult.submittedAt ?? now,
        completedAt:
          executionResult.state === "in_progress"
            ? null
            : (executionResult.submittedAt ?? now),
        outcome: executionResult.outcome,
        checkpoints: executionResult.checkpoints,
        nextActionLabel: executionResult.nextActionLabel,
      });

      await ctx.repository.upsertApplicationAttempt(attempt);

      const existingRecord = applicationRecords.find((record) => record.jobId === jobId);
      const nextRecord = ApplicationRecordSchema.parse({
        id: existingRecord?.id ?? `application_${jobId}`,
        jobId,
        title: job.title,
        company: job.company,
        status: nextJobStatusFromAttempt(job, executionResult.state),
        lastActionLabel: executionResult.summary,
        nextActionLabel: executionResult.nextActionLabel,
        lastUpdatedAt: executionResult.submittedAt ?? now,
        lastAttemptState: executionResult.state,
        events: mergeEvents(
          existingRecord?.events ?? [],
          toApplicationEvents(job, executionResult.checkpoints),
        ),
      });

      await ctx.repository.upsertApplicationRecord(nextRecord);
      await ctx.updateJob(jobId, (currentJob) => ({
        ...currentJob,
        status: nextJobStatusFromAttempt(currentJob, executionResult.state),
      }));

      return ctx.getWorkspaceSnapshot();
    },
  };
}
