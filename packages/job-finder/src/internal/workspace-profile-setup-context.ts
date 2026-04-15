import {
  CandidateProfileSchema,
  JobSearchPreferencesSchema,
  ProfileSetupStateSchema,
  ResumeDocumentBundleSchema,
  type CandidateProfile,
  type ProfileSetupState,
  type ResumeDocumentBundle,
} from "@unemployed/contracts";

import { deriveAndPersistProfileSetupState, summarizeReviewCandidates } from "./profile-workspace-state";
import { countResumeImportCandidates } from "./resume-import-workflow";
import { normalizeSearchPreferences } from "./workspace-helpers";
import type { WorkspaceServiceContext } from "./workspace-service-context";

function buildBundleFromStoredResume(profile: CandidateProfile): ResumeDocumentBundle {
  const createdAt = profile.baseResume.textUpdatedAt ?? new Date().toISOString();
  const text = profile.baseResume.textContent?.trim() ?? null;
  const blocks = text
    ? text
        .split(/\r?\n/)
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry, index) => ({
          id: `resume_block_${index + 1}`,
          pageNumber: 1,
          readingOrder: index,
          text: entry,
          kind: index === 0 ? "heading" : "paragraph",
          sectionHint: index === 0 ? "identity" : "other",
          bbox: null,
          sourceParserKinds: ["plain_text"],
          sourceConfidence: 1,
        }))
    : [];

  return ResumeDocumentBundleSchema.parse({
    id: `resume_bundle_${profile.baseResume.id}`,
    runId: `resume_import_refresh_${Date.now()}`,
    sourceResumeId: profile.baseResume.id,
    sourceFileKind: "plain_text",
    primaryParserKind: "plain_text",
    parserKinds: ["plain_text"],
    createdAt,
    warnings: [],
    pages: [
      {
        pageNumber: 1,
        text,
        charCount: text?.length ?? 0,
        parserKinds: ["plain_text"],
        usedOcr: false,
      },
    ],
    blocks,
    fullText: text,
  });
}

function getCandidateResolutionForReviewStatus(
  status: ProfileSetupState["reviewItems"][number]["status"],
) {
  switch (status) {
    case "confirmed":
      return {
        resolution: "auto_applied" as const,
        resolutionReason: "review_confirmed",
      };
    case "edited":
      return {
        resolution: "rejected" as const,
        resolutionReason: "review_edited",
      };
    case "dismissed":
      return {
        resolution: "rejected" as const,
        resolutionReason: "review_dismissed",
      };
    default:
      return null;
  }
}

async function syncLatestResumeImportCandidatesWithSetupState(
  ctx: WorkspaceServiceContext,
  input: {
    documentBundles: readonly ResumeDocumentBundle[];
    latestResumeImportRun: Awaited<ReturnType<WorkspaceServiceContext["repository"]["getLatestResumeImportRun"]>>;
    profileSetupState: ProfileSetupState;
    candidates: readonly Awaited<
      ReturnType<WorkspaceServiceContext["repository"]["listResumeImportFieldCandidates"]>
    >[number][];
  },
) {
  const { latestResumeImportRun } = input;

  if (!latestResumeImportRun || input.candidates.length === 0) {
    return {
      latestResumeImportRun,
      latestResumeImportAllCandidates: [...input.candidates],
      latestResumeImportReviewCandidates: input.candidates.filter(
        (candidate) =>
          candidate.resolution === "needs_review" || candidate.resolution === "abstained",
      ),
    };
  }

  const resolutionByCandidateId = new Map(
    input.profileSetupState.reviewItems
      .filter(
        (item) => item.sourceCandidateId !== null && item.status !== "pending",
      )
      .map((item) => [item.sourceCandidateId!, item]),
  );
  let changed = false;
  const nextCandidates = input.candidates.map((candidate) => {
    const linkedReviewItem = resolutionByCandidateId.get(candidate.id);
    const nextResolution = linkedReviewItem
      ? getCandidateResolutionForReviewStatus(linkedReviewItem.status)
      : null;

    if (!linkedReviewItem || !nextResolution) {
      return candidate;
    }

    const nextResolvedAt = linkedReviewItem.resolvedAt ?? new Date().toISOString();

    if (
      candidate.resolution === nextResolution.resolution &&
      candidate.resolutionReason === nextResolution.resolutionReason &&
      candidate.resolvedAt === nextResolvedAt
    ) {
      return candidate;
    }

    changed = true;
    return {
      ...candidate,
      resolution: nextResolution.resolution,
      resolutionReason: nextResolution.resolutionReason,
      resolvedAt: nextResolvedAt,
    };
  });

  if (!changed) {
    return {
      latestResumeImportRun,
      latestResumeImportAllCandidates: [...input.candidates],
      latestResumeImportReviewCandidates: input.candidates.filter(
        (candidate) =>
          candidate.resolution === "needs_review" || candidate.resolution === "abstained",
      ),
    };
  }

  const nextRun = {
    ...latestResumeImportRun,
    status: nextCandidates.some(
      (candidate) =>
        candidate.resolution === "needs_review" || candidate.resolution === "abstained",
    )
      ? ("review_ready" as const)
      : ("applied" as const),
    candidateCounts: countResumeImportCandidates(nextCandidates),
  };

  await ctx.repository.replaceResumeImportRunArtifacts({
    run: nextRun,
    documentBundles: input.documentBundles,
    fieldCandidates: nextCandidates,
  });

  return {
    latestResumeImportRun: nextRun,
    latestResumeImportAllCandidates: nextCandidates,
    latestResumeImportReviewCandidates: nextCandidates.filter(
      (candidate) =>
        candidate.resolution === "needs_review" || candidate.resolution === "abstained",
    ),
  };
}

export function createWorkspaceProfileSetupContextHelpers(
  ctx: WorkspaceServiceContext,
) {
  async function getCurrentSetupStateContext() {
    const [profile, rawSearchPreferences, persistedState, latestResumeImportRun] = await Promise.all([
      ctx.repository.getProfile(),
      ctx.repository.getSearchPreferences(),
      ctx.repository.getProfileSetupState(),
      ctx.repository.getLatestResumeImportRun(),
    ]);
    const searchPreferences = normalizeSearchPreferences(rawSearchPreferences);
    const [latestResumeImportAllCandidates, latestResumeImportBundles] = latestResumeImportRun
      ? await Promise.all([
          ctx.repository.listResumeImportFieldCandidates({
            runId: latestResumeImportRun.id,
          }),
          ctx.repository.listResumeImportDocumentBundles({
            runId: latestResumeImportRun.id,
          }),
        ])
      : [[], []] as const;
    const latestResumeImportReviewCandidates = latestResumeImportAllCandidates.filter(
      (candidate) =>
        candidate.resolution === "needs_review" || candidate.resolution === "abstained",
    );
    const profileSetupState = await deriveAndPersistProfileSetupState(ctx, {
      persistedState,
      profile,
      searchPreferences,
      latestResumeImportRunId: latestResumeImportRun?.id ?? null,
      latestResumeImportReviewCandidates,
    });
    const syncedImportState = await syncLatestResumeImportCandidatesWithSetupState(ctx, {
      profileSetupState,
      latestResumeImportRun,
      candidates: latestResumeImportAllCandidates,
      documentBundles: latestResumeImportBundles,
    });

    return {
      profile: CandidateProfileSchema.parse(profile),
      searchPreferences: JobSearchPreferencesSchema.parse(searchPreferences),
      profileSetupState: ProfileSetupStateSchema.parse(profileSetupState),
      latestResumeImportRun: syncedImportState.latestResumeImportRun,
      latestResumeImportAllCandidates: syncedImportState.latestResumeImportAllCandidates,
      latestResumeImportReviewCandidates:
        syncedImportState.latestResumeImportReviewCandidates,
      latestResumeImportReviewCandidateSummaries: summarizeReviewCandidates(
        syncedImportState.latestResumeImportReviewCandidates,
      ),
      latestResumeImportBundles,
    };
  }

  return {
    buildBundleFromStoredResume,
    getCurrentSetupStateContext,
  };
}
