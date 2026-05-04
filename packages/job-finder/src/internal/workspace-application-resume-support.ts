import {
  JobFinderResumeWorkspaceSchema,
  type JobFinderResumeWorkspace,
  type JobFinderResumePreview,
  type CandidateProfile,
  type ResumeDraft,
  type ResumeTemplateDefinition,
  type SavedJob,
  type TailoredAsset,
} from "@unemployed/contracts";
import {
  buildResumeRenderDocument,
  buildTailoredAssetBridge,
  sanitizeResumeDraft,
  seedResumeDraft,
  validateResumeDraft,
} from "./resume-workspace-helpers";
import { buildResumeDraftIdentity } from "./resume-workspace-structure";
import {
  normalizeJobFinderSettings,
  normalizeResumeDraftTemplate,
  wasResumeDraftApproved,
} from "./workspace-helpers";
import type { WorkspaceServiceContext } from "./workspace-service-context";

function countVisibleEntries(draft: ResumeDraft): number {
  return draft.sections
    .filter((section) => section.included)
    .reduce(
      (count, section) =>
        count + section.entries.filter((entry) => entry.included).length,
      0,
    );
}

function createDraftRevisionKey(draft: ResumeDraft): string {
  const serializedDraft = JSON.stringify(draft);
  let hash = 2166136261;

  for (let index = 0; index < serializedDraft.length; index += 1) {
    hash ^= serializedDraft.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `resume_preview_${draft.id}_${(hash >>> 0).toString(16)}`;
}

function toDraftPreviewSignature(draft: ResumeDraft) {
  return {
    templateId: draft.templateId,
    identity: draft.identity,
    sections: draft.sections,
    targetPageCount: draft.targetPageCount,
    generationMethod: draft.generationMethod,
  };
}

function toComparableDraftPreviewSignature(
  draft: ResumeDraft,
  profile: CandidateProfile,
) {
  return {
    ...toDraftPreviewSignature(draft),
    identity: draft.identity ?? buildResumeDraftIdentity(profile),
  };
}

function buildPreviewWarnings(input: {
  validationIssues: Awaited<ReturnType<typeof validateResumeDraft>>["issues"];
  renderWarnings: readonly string[];
}) {
  return [
    ...input.validationIssues.map((issue) => ({
      id: `preview_${issue.id}`,
      source: "validation" as const,
      severity: issue.severity,
      category: issue.category,
      sectionId: issue.sectionId,
      entryId: issue.entryId,
      bulletId: issue.bulletId,
      message: issue.message,
    })),
    ...input.renderWarnings.map((message, index) => ({
      id: `preview_render_warning_${index + 1}`,
      source: "render" as const,
      severity: "warning" as const,
      category: null,
      sectionId: null,
      entryId: null,
      bulletId: null,
      message,
    })),
  ];
}

function buildResumeWorkspaceSharedProfile(profile: CandidateProfile) {
  const linksById = new Map(
    profile.links.map((link) => [link.id, link.label ?? link.url ?? link.id]),
  );

  return {
    narrativeSummary:
      profile.narrative.professionalStory ??
      profile.narrative.nextChapterSummary ??
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

function buildWorkHistoryReviewSuggestionsFromValidation(input: {
  draft: ResumeDraft;
  validation: Awaited<ReturnType<typeof validateResumeDraft>> | null;
}) {
  const structuredEntries = input.draft.sections
    .flatMap((section) =>
      section.entries.map((entry) => ({
        sectionId: section.id,
        entry,
      })),
    );

  return (input.validation?.issues ?? [])
    .filter((issue) => issue.category === "work_history_review" || issue.category === "date_quality")
    .flatMap((issue) => {
      const matchedEntry = structuredEntries.find(
        ({ entry }) => entry.id === issue.entryId,
      ) ?? null;
      const profileRecordId = matchedEntry?.entry.profileRecordId;

      if (!matchedEntry) {
        return [];
      }

      if (issue.category === "date_quality") {
        return [{
          id: issue.id.replace(/^issue_/, ""),
          profileRecordId: profileRecordId ?? matchedEntry.entry.id,
          sectionId: issue.sectionId ?? matchedEntry.sectionId,
          entryId: issue.entryId,
          kind: "date_quality" as const,
          action: "fix_dates" as const,
          severity: issue.severity,
          message: issue.message,
        }];
      }

      if (!profileRecordId) {
        return [];
      }

      const normalizedMessage = issue.message.toLowerCase();
      const kind = normalizedMessage.includes("gap")
        ? "gap_coverage"
        : normalizedMessage.includes("compact")
          ? "compact_recommended"
          : "weak_fit";
      const action = matchedEntry.entry.included ? "keep_compact" : "consider_showing";

      return [{
        id: issue.id.replace(/^issue_/, ""),
        profileRecordId,
        sectionId: issue.sectionId ?? matchedEntry.sectionId,
        entryId: issue.entryId,
        kind,
        action,
        severity: issue.severity,
        message: issue.message,
      }];
    });
}

export interface LoadedResumeWorkspaceState {
  profile: Awaited<ReturnType<WorkspaceServiceContext["repository"]["getProfile"]>>;
  settings: Awaited<ReturnType<WorkspaceServiceContext["repository"]["getSettings"]>>;
  templates: readonly ResumeTemplateDefinition[];
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
  const templates = ctx.documentManager.listResumeTemplates();
  const [profile, rawSettings, savedJobs, tailoredAssets, draft] = await Promise.all([
    ctx.repository.getProfile(),
    ctx.repository.getSettings(),
    ctx.repository.listSavedJobs(),
    ctx.repository.listTailoredAssets(),
    ctx.repository.getResumeDraftByJobId(jobId),
  ]);
  const settings = normalizeJobFinderSettings(
    rawSettings,
    templates,
  );
  const job = savedJobs.find((entry) => entry.id === jobId);

  if (!job) {
    throw new Error(`Unknown Job Finder job '${jobId}'.`);
  }

  return {
    profile,
    settings,
    templates,
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
    const normalizedDraft = normalizeResumeDraftTemplate(
      state.draft,
      state.templates,
    );

    return {
      ...state,
      draft: normalizedDraft,
    };
  }

  const seededDraft = seedResumeDraft({
    profile: state.profile,
    job: state.job,
    templateId: state.settings.resumeTemplateId,
    tailoredAsset: state.tailoredAsset,
  });
  const sanitizedDraft = sanitizeResumeDraft({
    draft: seededDraft,
    job: state.job,
    profile: state.profile,
  });
  const validation = validateResumeDraft({
    draft: sanitizedDraft,
    job: state.job,
    profile: state.profile,
    validatedAt: seededDraft.updatedAt,
  });
  const tailoredAsset = buildTailoredAssetBridge({
    draft: sanitizedDraft,
    job: state.job,
    profile: state.profile,
    existingAsset: state.tailoredAsset,
    storagePath: state.tailoredAsset?.storagePath ?? null,
    templates: state.templates,
  });

  await ctx.repository.saveResumeDraftWithValidation({
    draft: sanitizedDraft,
    validation,
    tailoredAsset,
  });

  return {
      ...state,
      draft: sanitizedDraft,
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
  const sanitizedDraft = sanitizeResumeDraft({
    draft: input.draft,
    job: input.job,
    profile: input.profile,
  });

  return ctx.documentManager.renderResumeArtifact({
    job: input.job,
    profile: input.profile,
    renderDocument: buildResumeRenderDocument(input.profile, sanitizedDraft),
    templateId: sanitizedDraft.templateId,
    settings: input.settings,
    targetPath: input.outputPath ?? null,
  });
}

export async function previewResumeDraft(
  ctx: WorkspaceServiceContext,
  draft: ResumeDraft,
): Promise<JobFinderResumePreview> {
  const state = await loadResumeWorkspaceState(ctx, draft.jobId);
  const persistedDraft = state.draft
    ? normalizeResumeDraftTemplate(state.draft, state.templates)
    : null;
  const parsedDraft = normalizeResumeDraftTemplate(
    draft,
    state.templates,
  );
  const hadApprovedExport = wasResumeDraftApproved(persistedDraft);
  const approvedDraftChanged = Boolean(
    hadApprovedExport &&
      persistedDraft &&
      JSON.stringify(toComparableDraftPreviewSignature(persistedDraft, state.profile)) !==
        JSON.stringify(toComparableDraftPreviewSignature(parsedDraft, state.profile)),
  );
  const normalizedDraft = hadApprovedExport && !approvedDraftChanged
    ? ({
        ...parsedDraft,
        status: persistedDraft?.status ?? parsedDraft.status,
        approvedAt: persistedDraft?.approvedAt ?? parsedDraft.approvedAt,
        approvedExportId:
          persistedDraft?.approvedExportId ?? parsedDraft.approvedExportId,
        staleReason: null,
      } satisfies ResumeDraft)
    : ({
        ...parsedDraft,
        status: hadApprovedExport ? "stale" : "needs_review",
        approvedAt: null,
        approvedExportId: null,
        staleReason: hadApprovedExport
          ? "Unsaved changes differ from the last approved export. Save and export a fresh PDF before applying."
          : null,
      } satisfies ResumeDraft);
  const sanitizedDraft = sanitizeResumeDraft({
    draft: normalizedDraft,
    job: state.job,
    profile: state.profile,
  });
  const renderedAt = new Date().toISOString();
  const validation = validateResumeDraft({
    draft: sanitizedDraft,
    job: state.job,
    profile: state.profile,
    validatedAt: renderedAt,
  });
  const preview = await ctx.documentManager.renderResumePreview({
    job: state.job,
    profile: state.profile,
    renderDocument: buildResumeRenderDocument(state.profile, sanitizedDraft, {
      includePreviewAnchors: true,
    }),
    templateId: sanitizedDraft.templateId,
    settings: state.settings,
  });

  return {
    draftId: sanitizedDraft.id,
    revisionKey: createDraftRevisionKey(sanitizedDraft),
    html: preview.html,
    warnings: buildPreviewWarnings({
      validationIssues: validation.issues,
      renderWarnings: preview.warnings ?? [],
    }),
    metadata: {
      templateId: sanitizedDraft.templateId,
      renderedAt,
      pageCount: null,
      sectionCount: sanitizedDraft.sections.filter((section) => section.included).length,
      entryCount: countVisibleEntries(sanitizedDraft),
    },
  };
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
    draft: {
      ...draft,
      identity: draft.identity ?? buildResumeDraftIdentity(profile),
    },
    validation: validations[0] ?? null,
    exports: normalizedExports,
    research,
    assistantMessages,
    tailoredAsset,
    sharedProfile: buildResumeWorkspaceSharedProfile(profile),
    workHistoryReviewSuggestions: buildWorkHistoryReviewSuggestionsFromValidation({
      draft,
      validation: validations[0] ?? null,
    }),
  });
}
