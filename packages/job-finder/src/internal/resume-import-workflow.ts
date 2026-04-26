import { CandidateProfileSchema, ResumeDocumentBundleSchema, ResumeImportRunSchema, type CandidateProfile, type JobSearchPreferences, type ResumeDocumentBundle, type ResumeImportFieldCandidate, type ResumeImportRun } from "@unemployed/contracts";

import type { WorkspaceServiceContext } from "./workspace-service-context";
export {
  applyResolvedResumeImportCandidatesToWorkspace,
} from "./resume-import-apply";
export {
  countResumeImportCandidates,
  hasBlockingResumeImportCandidates,
  summarizeCandidateWarnings,
} from "./resume-import-candidate-utils";
import { applyResolvedResumeImportCandidatesToWorkspace } from "./resume-import-apply";
import {
  countResumeImportCandidates,
  hasBlockingResumeImportCandidates,
  RESUME_IMPORT_STAGES,
  summarizeCandidateWarnings,
  toCandidate,
} from "./resume-import-candidate-utils";
import { extractLiteralCandidates } from "./resume-import-literal-extraction";
import { enrichExperienceCandidatesFromNearbyMarkers } from "./resume-import-experience-markers";
import {
  normalizeSharedMemoryCandidates,
  promoteGroundedSharedMemoryCandidates,
  reconcileCandidates,
} from "./resume-import-reconciliation";
import { createUniqueId, uniqueStrings } from "./shared";

type ResumeImportTrigger = ResumeImportRun["trigger"];

export async function runResumeImportWorkflow(
  ctx: WorkspaceServiceContext,
  input: {
    profile: CandidateProfile;
    searchPreferences: JobSearchPreferences;
    documentBundle: ResumeDocumentBundle;
    trigger: ResumeImportTrigger;
    importWarnings?: readonly string[];
  },
): Promise<{
  profile: CandidateProfile;
  searchPreferences: JobSearchPreferences;
  run: ResumeImportRun;
  candidates: ResumeImportFieldCandidate[];
}> {
  const now = new Date().toISOString();
  const runId = createUniqueId("resume_import_run");
  const bundle = ResumeDocumentBundleSchema.parse({
    ...input.documentBundle,
    id: createUniqueId("resume_bundle"),
    runId,
    sourceResumeId: input.profile.baseResume.id,
  });

  let run = ResumeImportRunSchema.parse({
    id: runId,
    sourceResumeId: input.profile.baseResume.id,
    sourceResumeFileName: input.profile.baseResume.fileName,
    trigger: input.trigger,
    status: "parsing",
    startedAt: now,
    completedAt: null,
    primaryParserKind: bundle.primaryParserKind,
    parserKinds: bundle.parserKinds,
    analysisProviderKind: null,
    analysisProviderLabel: null,
    warnings: uniqueStrings([...(input.importWarnings ?? []), ...bundle.warnings]),
    errorMessage: null,
    candidateCounts: {
      total: 0,
      autoApplied: 0,
      needsReview: 0,
      rejected: 0,
      abstained: 0,
    },
  });

  await ctx.repository.replaceResumeImportRunArtifacts({
    run,
    documentBundles: [bundle],
    fieldCandidates: [],
  });

  try {
    const literalCandidates = extractLiteralCandidates(runId, bundle, now);
    const stageResults = await Promise.all(
      RESUME_IMPORT_STAGES.map(async (stage) => {
        const result = await ctx.aiClient.extractResumeImportStage({
          stage,
          existingProfile: input.profile,
          existingSearchPreferences: input.searchPreferences,
          documentBundle: bundle,
        });
        return {
          stage,
          result,
        };
      }),
    );

    run = ResumeImportRunSchema.parse({
      ...run,
      status: "extracting",
      analysisProviderKind:
        stageResults.find((entry) => entry.result.analysisProviderKind !== null)?.result
          .analysisProviderKind ?? null,
      analysisProviderLabel:
        stageResults.find((entry) => entry.result.analysisProviderLabel)?.result
          .analysisProviderLabel ?? null,
    });

    const stageCandidates = stageResults.flatMap(({ stage, result }) => {
      const sourceKind = (() => {
        switch (stage) {
          case "identity_summary":
            return "model_identity_summary" as const;
          case "experience":
            return "model_experience" as const;
          case "background":
            return "model_background" as const;
          case "shared_memory":
            return "model_shared_memory" as const;
          default:
            return "reconciler" as const;
        }
      })();

      return result.candidates.map((candidate, index) =>
        toCandidate(bundle, runId, sourceKind, now, candidate, index),
      );
    });

    const provisionalCandidates = normalizeSharedMemoryCandidates(
      enrichExperienceCandidatesFromNearbyMarkers(bundle, [
        ...literalCandidates,
        ...stageCandidates,
      ]),
    );
    await ctx.repository.replaceResumeImportRunArtifacts({
      run,
      documentBundles: [bundle],
      fieldCandidates: provisionalCandidates,
    });

    const reconciledCandidates = promoteGroundedSharedMemoryCandidates(
      reconcileCandidates(input.profile, input.searchPreferences, provisionalCandidates),
    );
    const stageNotes = uniqueStrings(
      stageResults.flatMap((entry) => entry.result.notes),
    );
    const analysisWarnings = uniqueStrings([
      ...run.warnings,
      ...stageNotes,
      ...summarizeCandidateWarnings(reconciledCandidates),
    ]);
    const merged = applyResolvedResumeImportCandidatesToWorkspace({
      profile: input.profile,
      searchPreferences: input.searchPreferences,
      candidates: reconciledCandidates,
      analysisProviderKind: run.analysisProviderKind,
      analysisProviderLabel: run.analysisProviderLabel,
      analysisWarnings,
    });
    const candidateCounts = countResumeImportCandidates(reconciledCandidates);
    const hasBlockingReviewCandidates =
      hasBlockingResumeImportCandidates(reconciledCandidates);

    run = ResumeImportRunSchema.parse({
      ...run,
      status: hasBlockingReviewCandidates ? "review_ready" : "applied",
      completedAt: new Date().toISOString(),
      warnings: analysisWarnings,
      candidateCounts,
    });

    await ctx.repository.finalizeResumeImportRun({
      profile: merged.profile,
      searchPreferences: merged.searchPreferences,
      run,
      documentBundles: [bundle],
      fieldCandidates: reconciledCandidates,
    });

    return {
      profile: merged.profile,
      searchPreferences: merged.searchPreferences,
      run,
      candidates: reconciledCandidates,
    };
  } catch (error) {
    run = ResumeImportRunSchema.parse({
      ...run,
      status: "failed",
      completedAt: new Date().toISOString(),
      errorMessage:
        error instanceof Error
          ? error.message
          : "Resume import failed before candidate extraction could finish.",
    });

    await ctx.repository.replaceResumeImportRunArtifacts({
      run,
      documentBundles: [bundle],
      fieldCandidates: [],
    });

    await ctx.repository.saveProfile(
      CandidateProfileSchema.parse({
        ...input.profile,
        baseResume: {
          ...input.profile.baseResume,
          extractionStatus: bundle.fullText ? "failed" : "needs_text",
          lastAnalyzedAt: null,
          analysisWarnings: uniqueStrings([
            ...(input.importWarnings ?? []),
            ...bundle.warnings,
            run.errorMessage ?? "Resume import failed.",
          ]),
        },
      }),
    );

    throw error;
  }
}
