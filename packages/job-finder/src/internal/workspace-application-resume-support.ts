import {
  JobFinderResumeWorkspaceSchema,
  type JobFinderResumeWorkspace,
  type CandidateProfile,
  type ResumeDraft,
  type SavedJob,
  type TailoredAsset,
} from "@unemployed/contracts";
import {
  buildTailoredAssetBridge,
  buildTailoredResumeTextFromResumeDraft,
  seedResumeDraft,
  validateResumeDraft,
} from "./resume-workspace-helpers";
import type { WorkspaceServiceContext } from "./workspace-service-context";

function buildResumeWorkspaceSharedProfile(profile: CandidateProfile) {
  const linksById = new Map(
    profile.links.map((link) => [link.id, link.label ?? link.url ?? link.id]),
  );

  return {
    narrativeSummary:
      profile.narrative.professionalStory ??
      profile.professionalSummary.fullSummary ??
      profile.summary ??
      null,
    nextChapterSummary:
      profile.narrative.nextChapterSummary ??
      profile.narrative.careerTransitionSummary ??
      null,
    selfIntroduction: profile.answerBank.selfIntroduction,
    highlightedProofs: profile.proofBank.slice(0, 4).map((proof) => ({
      id: proof.id,
      title: proof.title,
      claim: proof.claim,
      heroMetric: proof.heroMetric,
      roleFamilies: proof.roleFamilies,
      supportingLinks: proof.linkIds
        .map((linkId) => linksById.get(linkId) ?? null)
        .filter((value): value is string => value !== null),
    })),
  };
}

export interface LoadedResumeWorkspaceState {
  profile: Awaited<ReturnType<WorkspaceServiceContext["repository"]["getProfile"]>>;
  settings: Awaited<ReturnType<WorkspaceServiceContext["repository"]["getSettings"]>>;
  job: SavedJob;
  draft: ResumeDraft | null;
  tailoredAsset: TailoredAsset | null;
}

export interface EnsuredResumeDraftState extends LoadedResumeWorkspaceState {
  draft: ResumeDraft;
}

export async function loadResumeWorkspaceState(
  ctx: WorkspaceServiceContext,
  jobId: string,
): Promise<LoadedResumeWorkspaceState> {
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

export async function ensureResumeDraft(
  ctx: WorkspaceServiceContext,
  jobId: string,
): Promise<EnsuredResumeDraftState> {
  const state = await loadResumeWorkspaceState(ctx, jobId);

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

export async function renderDraftToPdf(
  ctx: WorkspaceServiceContext,
  input: {
    job: SavedJob;
    profile: Awaited<ReturnType<WorkspaceServiceContext["repository"]["getProfile"]>>;
    settings: Awaited<ReturnType<WorkspaceServiceContext["repository"]["getSettings"]>>;
    draft: ResumeDraft;
    outputPath?: string | null;
  },
) {
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

export async function fetchAndPersistResearch(
  ctx: WorkspaceServiceContext,
  job: SavedJob,
) {
  if (!ctx.researchAdapter) {
    return ctx.repository.listResumeResearchArtifacts(job.id);
  }

  const profile = await ctx.repository.getProfile();
  const fetchedArtifacts = await ctx.researchAdapter.fetchResearchPages({
    job,
    profile,
  });

  await Promise.all(
    fetchedArtifacts.map((artifact) =>
      ctx.repository.upsertResumeResearchArtifact(artifact),
    ),
  );

  return ctx.repository.listResumeResearchArtifacts(job.id);
}

export async function buildResumeWorkspace(
  ctx: WorkspaceServiceContext,
  jobId: string,
): Promise<JobFinderResumeWorkspace> {
  const { job, draft, profile, tailoredAsset } = await ensureResumeDraft(ctx, jobId);
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
    sharedProfile: buildResumeWorkspaceSharedProfile(profile),
  });
}
