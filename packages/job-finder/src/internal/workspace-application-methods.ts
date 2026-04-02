import { ApplicationAttemptSchema, ApplicationRecordSchema, SavedJobSchema, TailoredAssetSchema } from "@unemployed/contracts";
import { buildPreviewSectionsFromDraft, buildTailoredResumeText } from "./profile-merge";
import { mergeSavedJobs } from "./workspace-service-helpers";
import { buildInstructionGuidance, mergeEvents, nextAssetVersion, nextJobStatusFromAttempt, resolveActiveSourceInstructionArtifact, toApplicationEvents } from "./workspace-helpers";
import { normalizeText, uniqueStrings } from "./shared";
import type { WorkspaceServiceContext } from "./workspace-service-context";
import type { JobFinderWorkspaceService } from "./workspace-service-contracts";

export function createWorkspaceApplicationMethods(
  ctx: WorkspaceServiceContext,
): Pick<
  JobFinderWorkspaceService,
  | "queueJobForReview"
  | "dismissDiscoveryJob"
  | "generateResume"
  | "approveApply"
> {
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
      const draft = await ctx.aiClient.tailorResume({
        profile,
        searchPreferences,
        settings,
        job,
        resumeText: profile.baseResume.textContent,
      });
      const generationMethod = draft.notes.some((note: string) =>
        normalizeText(note).includes("deterministic"),
      )
        ? "deterministic"
        : ctx.aiClient.getStatus().kind === "openai_compatible"
          ? "ai_assisted"
          : "deterministic";
      const previewSections = buildPreviewSectionsFromDraft(draft);
      const contentText =
        draft.fullText || buildTailoredResumeText(profile, job, previewSections);
      const renderedArtifact = await ctx.documentManager.renderResumeArtifact({
        job,
        profile,
        previewSections,
        settings,
        textContent: contentText,
      });
      const selectedTemplate = ctx.documentManager
        .listResumeTemplates()
        .find((template) => template.id === settings.resumeTemplateId);
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
            ? [`Rendered into template file ${renderedArtifact.fileName}.`]
            : []),
        ]),
      });

      await ctx.repository.upsertTailoredAsset(nextAsset);
      await ctx.updateJob(jobId, (currentJob) => ({
        ...currentJob,
        status: "ready_for_review",
      }));

      return ctx.getWorkspaceSnapshot();
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
      ] = await Promise.all([
        ctx.repository.getProfile(),
        ctx.repository.getSearchPreferences(),
        ctx.repository.getSettings(),
        ctx.repository.listSavedJobs(),
        ctx.repository.listTailoredAssets(),
        ctx.repository.listApplicationRecords(),
        ctx.repository.listSourceInstructionArtifacts(),
      ]);
      const job = savedJobs.find((entry) => entry.id === jobId);
      const asset = tailoredAssets.find((entry) => entry.jobId === jobId);

      if (!job) {
        throw new Error(
          `Unable to approve apply flow for unknown job '${jobId}'.`,
        );
      }

      if (!asset || asset.status !== "ready") {
        throw new Error(
          `A ready tailored resume is required before applying to '${job.title}'.`,
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
        asset,
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
