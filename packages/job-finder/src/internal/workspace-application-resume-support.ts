import {
  JobFinderResumeWorkspaceSchema,
  type JobFinderResumeWorkspace,
  type JobFinderResumeWorkspaceStrategyContext,
  type JobFinderResumePreview,
  type CandidateProfile,
  type ResumeDraft,
  type ResumeTemplateDefinition,
  type SavedJob,
  type TailoredAsset,
  type WorkHistoryReviewSuggestion,
} from "@unemployed/contracts";
import { fnv1a32 } from "@unemployed/core";
import {
  buildResumeRenderDocument,
  buildTailoredAssetBridge,
  hasBlockingResumeIdentityMismatch,
  listUnresolvedWorkHistoryOmissionSuggestions,
  sanitizeResumeDraft,
  seedResumeDraft,
  validateResumeDraft,
} from "./resume-workspace-helpers";
import { buildResumeDraftIdentity } from "./resume-workspace-structure";
import {
  buildResumeStrategyContext,
  resolveCampaignDefaultResumeStrategyId,
} from "./resume-strategy-application";
import {
  normalizeJobFinderSettings,
  normalizeResumeDraftTemplate,
  wasResumeDraftApproved,
} from "./workspace-helpers";
import type { WorkspaceServiceContext } from "./workspace-service-context";

const RESEARCH_REUSE_WINDOW_MS = 15 * 60 * 1_000;
const RESEARCH_CLOCK_SKEW_MS = 60 * 1_000;

interface ResearchReuseProvenance {
  jobFingerprint: string;
  artifacts: readonly {
    id: string;
    fetchedAt: string;
  }[];
}

const researchReuseProvenance = new WeakMap<
  WorkspaceServiceContext,
  Map<string, ResearchReuseProvenance>
>();

function createResearchJobFingerprint(job: SavedJob): string {
  return JSON.stringify({
    source: job.source,
    sourceJobId: job.sourceJobId,
    canonicalUrl: job.canonicalUrl,
    applicationUrl: job.applicationUrl,
    title: job.title,
    company: job.company,
    location: job.location,
    workMode: job.workMode,
    postedAt: job.postedAt,
    providerUpdatedAt: job.providerUpdatedAt,
    salaryText: job.salaryText,
    normalizedCompensation: job.normalizedCompensation,
    detailQuality: job.detailQuality,
    summary: job.summary,
    description: job.description,
    keySkills: job.keySkills,
    responsibilities: job.responsibilities,
    minimumQualifications: job.minimumQualifications,
    preferredQualifications: job.preferredQualifications,
    seniority: job.seniority,
    employmentType: job.employmentType,
    department: job.department,
    team: job.team,
    employerWebsiteUrl: job.employerWebsiteUrl,
    employerDomain: job.employerDomain,
    atsProvider: job.atsProvider,
    providerKey: job.providerKey,
    providerBoardToken: job.providerBoardToken,
    providerIdentifier: job.providerIdentifier,
    sourceIntelligence: job.sourceIntelligence,
    screeningHints: job.screeningHints,
    keywordSignals: job.keywordSignals,
    benefits: job.benefits,
  });
}

function canReuseResearch(input: {
  job: SavedJob;
  artifacts: Awaited<
    ReturnType<
      WorkspaceServiceContext["repository"]["listResumeResearchArtifacts"]
    >
  >;
  provenance: ResearchReuseProvenance | undefined;
}): boolean {
  if (
    !input.provenance ||
    input.provenance.jobFingerprint !==
      createResearchJobFingerprint(input.job) ||
    input.provenance.artifacts.length === 0
  ) {
    return false;
  }

  const now = Date.now();
  return input.provenance.artifacts.every((expected) => {
    const artifact = input.artifacts.find(
      (candidate) =>
        candidate.id === expected.id &&
        candidate.fetchedAt === expected.fetchedAt,
    );
    const fetchedAt = artifact ? Date.parse(artifact.fetchedAt) : Number.NaN;

    return (
      artifact?.fetchStatus === "success" &&
      Number.isFinite(fetchedAt) &&
      fetchedAt <= now + RESEARCH_CLOCK_SKEW_MS &&
      now - fetchedAt <= RESEARCH_REUSE_WINDOW_MS
    );
  });
}

export async function resolveResumeStrategyContextForJob(
  ctx: WorkspaceServiceContext,
  jobId: string,
): Promise<JobFinderResumeWorkspaceStrategyContext | null> {
  const [intelligenceState, campaignState, savedJobs] = await Promise.all([
    ctx.repository.getIntelligenceState(),
    ctx.repository.getCampaignState(),
    ctx.repository.listSavedJobs(),
  ]);
  const job = savedJobs.find((entry) => entry.id === jobId);

  if (!job) {
    return null;
  }

  return buildResumeStrategyContext({
    state: intelligenceState,
    job,
    campaignDefaultResumeStrategyId: resolveCampaignDefaultResumeStrategyId(
      campaignState,
      jobId,
    ),
  });
}

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

export function buildWorkHistoryReviewSuggestionsFromValidation(input: {
  draft: ResumeDraft;
  validation: Awaited<ReturnType<typeof validateResumeDraft>> | null;
}) {
  const structuredEntries = input.draft.sections.flatMap((section) =>
    section.entries.map((entry) => ({
      sectionId: section.id,
      entry,
    })),
  );
  const experienceSectionId =
    input.draft.sections.find((section) => section.kind === "experience")?.id ??
    null;

  return (input.validation?.issues ?? [])
    .filter(
      (issue) =>
        issue.category === "work_history_review" ||
        issue.category === "date_quality",
    )
    .flatMap((issue): WorkHistoryReviewSuggestion[] => {
      const matchedEntry =
        structuredEntries.find(({ entry }) => entry.id === issue.entryId) ??
        (issue.category === "work_history_review"
          ? (structuredEntries.find(
              ({ entry }) =>
                entry.profileRecordId &&
                issue.id ===
                  `issue_work_history_review_${entry.profileRecordId}`,
            ) ?? null)
          : null);
      const profileRecordId =
        matchedEntry?.entry.profileRecordId ??
        (issue.category === "work_history_review"
          ? issue.id.match(/^issue_work_history_review_(.+)$/)?.[1]
          : null);

      if (!matchedEntry && issue.category !== "work_history_review") {
        return [];
      }

      if (issue.category === "date_quality") {
        if (!matchedEntry) {
          return [];
        }

        return [
          {
            id: issue.id.replace(/^issue_/, ""),
            profileRecordId: profileRecordId ?? matchedEntry.entry.id,
            sectionId: issue.sectionId ?? matchedEntry.sectionId,
            entryId: issue.entryId,
            kind: "date_quality" as const,
            action: "fix_dates" as const,
            severity: issue.severity,
            message: issue.message,
            messageContentHash: fnv1a32(issue.message),
          },
        ];
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
      const action = matchedEntry?.entry.included
        ? "keep_compact"
        : "consider_showing";

      return [
        {
          id: issue.id.replace(/^issue_/, ""),
          profileRecordId,
          sectionId:
            issue.sectionId ?? matchedEntry?.sectionId ?? experienceSectionId,
          entryId: issue.entryId,
          kind,
          action,
          severity: issue.severity,
          message: issue.message,
          messageContentHash: fnv1a32(issue.message),
        },
      ];
    });
}

/**
 * Canonical gate input: projects the work-history review suggestions exactly
 * as the Resume Studio workspace does (from the persisted draft plus its
 * latest persisted validation) and keeps only omission-class suggestions that
 * no exact current acknowledgment satisfies.
 */
export async function loadUnresolvedWorkHistoryOmissionSuggestions(
  ctx: WorkspaceServiceContext,
  draft: ResumeDraft,
): Promise<WorkHistoryReviewSuggestion[]> {
  const validation =
    (await ctx.repository.listResumeValidationResults(draft.id))[0] ?? null;

  return listUnresolvedWorkHistoryOmissionSuggestions({
    draftId: draft.id,
    suggestions: buildWorkHistoryReviewSuggestionsFromValidation({
      draft,
      validation,
    }),
    acknowledgments: draft.workHistoryReviewAcknowledgments,
  });
}

export interface LoadedResumeWorkspaceState {
  profile: Awaited<
    ReturnType<WorkspaceServiceContext["repository"]["getProfile"]>
  >;
  /** Profile singleton epoch captured with the profile snapshot above. */
  profileRevision: number;
  settings: Awaited<
    ReturnType<WorkspaceServiceContext["repository"]["getSettings"]>
  >;
  templates: readonly ResumeTemplateDefinition[];
  job: SavedJob;
  draft: ResumeDraft | null;
  tailoredAsset: TailoredAsset | null;
}

export interface EnsuredResumeDraftState extends LoadedResumeWorkspaceState {
  draft: ResumeDraft;
}

/**
 * Resume generation/rendering inputs are assembled asynchronously. Recheck
 * the shared profile epoch before any result is committed so a concurrent
 * profile, preference, or setup edit cannot be paired with stale identity
 * evidence.
 */
export async function assertResumeProfileRevisionCurrent(
  ctx: WorkspaceServiceContext,
  expectedRevision: number,
  operation: string,
): Promise<
  Awaited<
    ReturnType<WorkspaceServiceContext["repository"]["getProfileWithRevision"]>
  >
> {
  const current = await ctx.repository.getProfileWithRevision();
  if (current.revision !== expectedRevision) {
    throw new Error(
      `The candidate profile changed while ${operation} was in progress. Review the latest profile and retry so resume identity stays current.`,
    );
  }

  return current;
}

export async function loadResumeWorkspaceState(
  ctx: WorkspaceServiceContext,
  jobId: string,
): Promise<LoadedResumeWorkspaceState> {
  const templates = ctx.documentManager.listResumeTemplates();
  const [profileState, rawSettings, savedJobs, tailoredAssets, draft] =
    await Promise.all([
      ctx.repository.getProfileWithRevision(),
      ctx.repository.getSettings(),
      ctx.repository.listSavedJobs(),
      ctx.repository.listTailoredAssets(),
      ctx.repository.getResumeDraftByJobId(jobId),
    ]);
  const settings = normalizeJobFinderSettings(rawSettings, templates);
  const job = savedJobs.find((entry) => entry.id === jobId);

  if (!job) {
    throw new Error(`Unknown Job Finder job '${jobId}'.`);
  }

  return {
    profile: profileState.profile,
    profileRevision: profileState.revision,
    settings,
    templates,
    job,
    draft,
    tailoredAsset:
      tailoredAssets.find((entry) => entry.jobId === jobId) ?? null,
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

  // A fresh draft may start from the strategy's template default, but the
  // strategy never approves or readies anything: the seeded draft is created
  // unapproved and the exact per-job approval/staleness checks stay
  // authoritative.
  const strategyContext = await resolveResumeStrategyContextForJob(ctx, jobId);
  const seededDraft = seedResumeDraft({
    profile: state.profile,
    job: state.job,
    templateId: strategyContext?.templateId ?? state.settings.resumeTemplateId,
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

  await assertResumeProfileRevisionCurrent(
    ctx,
    state.profileRevision,
    "creating the initial resume draft",
  );

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
    profile: Awaited<
      ReturnType<WorkspaceServiceContext["repository"]["getProfile"]>
    >;
    settings: Awaited<
      ReturnType<WorkspaceServiceContext["repository"]["getSettings"]>
    >;
    draft: ResumeDraft;
    outputPath?: string | null;
  },
) {
  return ctx.documentManager.renderResumeArtifact({
    job: input.job,
    profile: input.profile,
    renderDocument: buildResumeRenderDocument(input.profile, input.draft),
    templateId: input.draft.templateId,
    settings: input.settings,
    targetPath: input.outputPath ?? null,
  });
}

function throwIfResumePreviewAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) {
    return;
  }

  throw new DOMException("Resume preview was superseded.", "AbortError");
}

export async function previewResumeDraft(
  ctx: WorkspaceServiceContext,
  draft: ResumeDraft,
  signal?: AbortSignal,
): Promise<JobFinderResumePreview> {
  throwIfResumePreviewAborted(signal);
  const state = await loadResumeWorkspaceState(ctx, draft.jobId);
  throwIfResumePreviewAborted(signal);
  await assertResumeProfileRevisionCurrent(
    ctx,
    state.profileRevision,
    "preparing this resume preview",
  );
  const persistedDraft = state.draft
    ? normalizeResumeDraftTemplate(state.draft, state.templates)
    : null;
  const parsedDraft = normalizeResumeDraftTemplate(draft, state.templates);
  const hadApprovedExport = wasResumeDraftApproved(persistedDraft);
  const approvedDraftChanged = Boolean(
    hadApprovedExport &&
    persistedDraft &&
    JSON.stringify(
      toComparableDraftPreviewSignature(persistedDraft, state.profile),
    ) !==
      JSON.stringify(
        toComparableDraftPreviewSignature(parsedDraft, state.profile),
      ),
  );
  const normalizedDraft =
    hadApprovedExport && !approvedDraftChanged
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
  if (hasBlockingResumeIdentityMismatch(validation)) {
    throw new Error(
      validation.issues.find((issue) => issue.category === "identity_mismatch")
        ?.message ??
        "Resume identity mismatch: review the visible profile and imported resume before previewing.",
    );
  }
  throwIfResumePreviewAborted(signal);
  const preview = await ctx.documentManager.renderResumePreview(
    {
      job: state.job,
      profile: state.profile,
      renderDocument: buildResumeRenderDocument(state.profile, sanitizedDraft, {
        includePreviewAnchors: true,
      }),
      templateId: sanitizedDraft.templateId,
      settings: state.settings,
    },
    signal,
  );
  throwIfResumePreviewAborted(signal);
  await assertResumeProfileRevisionCurrent(
    ctx,
    state.profileRevision,
    "completing this resume preview",
  );

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
      sectionCount: sanitizedDraft.sections.filter(
        (section) => section.included,
      ).length,
      entryCount: countVisibleEntries(sanitizedDraft),
    },
  };
}

export async function fetchAndPersistResearch(
  ctx: WorkspaceServiceContext,
  job: SavedJob,
  expectedProfileRevision?: number,
) {
  const persistedArtifacts = await ctx.repository.listResumeResearchArtifacts(
    job.id,
  );

  if (!ctx.researchAdapter) {
    return persistedArtifacts;
  }

  const provenance = researchReuseProvenance.get(ctx)?.get(job.id);
  if (canReuseResearch({ job, artifacts: persistedArtifacts, provenance })) {
    return persistedArtifacts;
  }

  const profileState = await ctx.repository.getProfileWithRevision();
  if (
    expectedProfileRevision !== undefined &&
    profileState.revision !== expectedProfileRevision
  ) {
    await assertResumeProfileRevisionCurrent(
      ctx,
      expectedProfileRevision,
      "preparing resume research",
    );
  }
  const fetchedArtifacts = await ctx.researchAdapter.fetchResearchPages({
    job,
    profile: profileState.profile,
  });

  if (expectedProfileRevision !== undefined) {
    await assertResumeProfileRevisionCurrent(
      ctx,
      expectedProfileRevision,
      "saving resume research",
    );
  }

  await Promise.all(
    fetchedArtifacts.map((artifact) =>
      ctx.repository.upsertResumeResearchArtifact(artifact),
    ),
  );

  const refreshedArtifacts = await ctx.repository.listResumeResearchArtifacts(
    job.id,
  );
  if (
    fetchedArtifacts.length > 0 &&
    fetchedArtifacts.every((artifact) => artifact.fetchStatus === "success")
  ) {
    const provenanceByJob =
      researchReuseProvenance.get(ctx) ??
      new Map<string, ResearchReuseProvenance>();
    provenanceByJob.set(job.id, {
      jobFingerprint: createResearchJobFingerprint(job),
      artifacts: fetchedArtifacts.map((artifact) => ({
        id: artifact.id,
        fetchedAt: artifact.fetchedAt,
      })),
    });
    researchReuseProvenance.set(ctx, provenanceByJob);
  } else {
    researchReuseProvenance.get(ctx)?.delete(job.id);
  }

  return refreshedArtifacts;
}

export async function buildResumeWorkspace(
  ctx: WorkspaceServiceContext,
  jobId: string,
): Promise<JobFinderResumeWorkspace> {
  const { job, draft, profile, tailoredAsset } = await ensureResumeDraft(
    ctx,
    jobId,
  );
  const [
    validations,
    exports,
    research,
    assistantMessages,
    revisions,
    strategyContext,
  ] = await Promise.all([
    ctx.repository.listResumeValidationResults(draft.id),
    ctx.repository.listResumeExportArtifacts({ jobId }),
    ctx.repository.listResumeResearchArtifacts(jobId),
    ctx.repository.listResumeAssistantMessages(jobId),
    ctx.repository.listResumeDraftRevisions(draft.id),
    resolveResumeStrategyContextForJob(ctx, jobId),
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
    revisions,
    tailoredAsset,
    sharedProfile: buildResumeWorkspaceSharedProfile(profile),
    workHistoryReviewSuggestions:
      buildWorkHistoryReviewSuggestionsFromValidation({
        draft,
        validation: validations[0] ?? null,
      }),
    strategyContext,
  });
}
