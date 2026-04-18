import {
  SourceInstructionArtifactSchema,
  type JobDiscoveryTarget,
  type JobSource,
  type SourceDebugRunRecord,
  type SourceDebugWorkerAttempt,
  type SourceInstructionArtifact,
} from "@unemployed/contracts";
import {
  collectAttemptInstructionGuidance,
  evaluateSourceInstructionQuality,
  filterSourceDebugWarnings,
  filterSourceInstructionLines,
  isExplicitSearchProbeDisproof,
  isPositiveReusableSearchSignal,
  isVisibilityOnlySearchSignal,
  reconcileApplyGuidance,
  reconcileFinalSourceInstructionGuidance,
  reconcileMixedAccessGuidance,
  reconcileVisibleControlEvidence,
  type SourceInstructionReviewOverride,
} from "./source-instructions";
import { normalizeText, uniqueStrings } from "./shared";
import { buildSourceInstructionVersionInfo } from "./workspace-helpers";
import { buildSourceIntelligenceArtifact } from "./workspace-source-intelligence";

export function synthesizeSourceInstructionArtifact(
  target: JobDiscoveryTarget,
  run: SourceDebugRunRecord,
  attempts: readonly SourceDebugWorkerAttempt[],
  adapterKind: JobSource,
  verification: SourceInstructionArtifact["verification"],
  reviewOverride?: SourceInstructionReviewOverride | null,
  currentArtifact?: SourceInstructionArtifact | null,
): SourceInstructionArtifact {
  const byPhase = new Map(attempts.map((attempt) => [attempt.phase, attempt]));
  const accessAttempt = byPhase.get("access_auth_probe");
  const structureAttempt = byPhase.get("site_structure_mapping");
  const searchAttempt = byPhase.get("search_filter_probe");
  const detailAttempt = byPhase.get("job_detail_validation");
  const applyAttempt = byPhase.get("apply_path_validation");
  const hasPartialTimeoutEvidence = attempts.some(
    (attempt) => attempt.completionMode === "timed_out_with_partial_evidence",
  );
  const hasUnstructuredFailure = attempts.some(
    (attempt) =>
      attempt.completionMode === "timed_out_without_evidence" ||
      attempt.completionMode === "runtime_failed" ||
      attempt.completionMode === "interrupted",
  );
  const draftWarnings = filterSourceDebugWarnings(
    attempts.flatMap((attempt) => [attempt.blockerSummary]),
  );
  const usedGuidance = new Set<string>();
  const takeUniqueGuidance = (lines: readonly string[]) =>
    lines.filter((line) => {
      const key = normalizeText(line);

      if (usedGuidance.has(key)) {
        return false;
      }

      usedGuidance.add(key);
      return true;
    });
  const rawNavigationGuidance = takeUniqueGuidance(
    uniqueStrings([
      ...collectAttemptInstructionGuidance(accessAttempt),
      ...collectAttemptInstructionGuidance(structureAttempt),
    ]),
  );
  const rawSearchGuidance = takeUniqueGuidance(
    uniqueStrings([...collectAttemptInstructionGuidance(searchAttempt)]),
  );
  const rawDetailGuidance = takeUniqueGuidance(
    uniqueStrings([...collectAttemptInstructionGuidance(detailAttempt)]),
  );
  const rawApplyGuidance = takeUniqueGuidance(
    reconcileApplyGuidance(
      uniqueStrings([...collectAttemptInstructionGuidance(applyAttempt)]),
    ),
  );
  const visibleControlReconciledGuidance = reconcileVisibleControlEvidence({
    attempts,
    navigationGuidance: rawNavigationGuidance,
    searchGuidance: rawSearchGuidance,
    detailGuidance: rawDetailGuidance,
    applyGuidance: rawApplyGuidance,
  });
  const reconciledGuidance = reconcileMixedAccessGuidance({
    navigationGuidance: visibleControlReconciledGuidance.navigationGuidance,
    searchGuidance: visibleControlReconciledGuidance.searchGuidance,
    detailGuidance: visibleControlReconciledGuidance.detailGuidance,
    applyGuidance: visibleControlReconciledGuidance.applyGuidance,
  });
  const finalReconciledGuidance = reconcileFinalSourceInstructionGuidance({
    navigationGuidance: reconciledGuidance.navigationGuidance,
    searchGuidance: reconciledGuidance.searchGuidance,
    detailGuidance: reconciledGuidance.detailGuidance,
    applyGuidance: reconciledGuidance.applyGuidance,
  });
  const reviewedGuidance = reconcileFinalSourceInstructionGuidance({
    navigationGuidance:
      reviewOverride && reviewOverride.navigationGuidance !== null
        ? filterSourceInstructionLines(reviewOverride.navigationGuidance)
        : finalReconciledGuidance.navigationGuidance,
    searchGuidance:
      reviewOverride && reviewOverride.searchGuidance !== null
        ? filterSourceInstructionLines(reviewOverride.searchGuidance)
        : finalReconciledGuidance.searchGuidance,
    detailGuidance:
      reviewOverride && reviewOverride.detailGuidance !== null
        ? filterSourceInstructionLines(reviewOverride.detailGuidance)
        : finalReconciledGuidance.detailGuidance,
    applyGuidance:
      reviewOverride && reviewOverride.applyGuidance !== null
        ? filterSourceInstructionLines(reviewOverride.applyGuidance)
        : finalReconciledGuidance.applyGuidance,
  });
  const navigationGuidance = reviewedGuidance.navigationGuidance;
  const searchGuidance = reviewedGuidance.searchGuidance;
  const detailGuidance = reviewedGuidance.detailGuidance;
  const applyGuidance = reviewedGuidance.applyGuidance;
  const hasPositiveReusableSearchGuidance = searchGuidance.some(
    isPositiveReusableSearchSignal,
  );
  const hasExplicitSearchDisproof = searchGuidance.some(isExplicitSearchProbeDisproof);
  const hasVisibilityOnlySearchSignals = searchGuidance.some(
    isVisibilityOnlySearchSignal,
  );
  const hasConclusiveSearchDisproof =
    hasExplicitSearchDisproof && !hasVisibilityOnlySearchSignals;
  const hasSearchGuidanceWithoutPositiveProof =
    searchGuidance.length > 0 &&
    !hasPositiveReusableSearchGuidance &&
    !hasConclusiveSearchDisproof;
  const hasOnlyVisibilitySearchGuidance =
    searchGuidance.length > 0 &&
    !hasPositiveReusableSearchGuidance &&
    !hasConclusiveSearchDisproof &&
    searchGuidance.every(
      (line) =>
        isVisibilityOnlySearchSignal(line) || isExplicitSearchProbeDisproof(line),
    );
  const quality = evaluateSourceInstructionQuality({
    navigationGuidance,
    searchGuidance,
    detailGuidance,
    applyGuidance,
  });
  const warnings = uniqueStrings([
    ...filterSourceDebugWarnings(reviewOverride?.warnings ?? []),
    ...draftWarnings,
    ...(hasPartialTimeoutEvidence
      ? [
          "A source-debug phase timed out before structured conclusion; keep this source in draft until a rerun confirms the partial evidence with an explicit finish.",
        ]
      : []),
    ...(hasUnstructuredFailure
      ? [
          "A source-debug phase ended without structured evidence; keep this source in draft until the failing phase is rerun successfully.",
        ]
      : []),
    ...(hasSearchGuidanceWithoutPositiveProof
      ? [
          "Search and filter behavior is still unproven; this run mentioned controls or routes but did not confirm a positive reusable search/filter action.",
        ]
      : []),
    ...(hasOnlyVisibilitySearchGuidance
      ? [
          "Search and filter behavior is still unproven; visible controls were seen but no reusable result-changing control was confirmed in this run.",
        ]
      : []),
    ...reconciledGuidance.warnings,
    ...quality.qualityWarnings,
  ]);
  const hasPromotionBlocker =
    hasPartialTimeoutEvidence ||
    hasUnstructuredFailure ||
    hasSearchGuidanceWithoutPositiveProof ||
    hasOnlyVisibilitySearchGuidance;
  const status =
    verification?.outcome === "passed" &&
    quality.qualifiesForValidation &&
    !hasPromotionBlocker
      ? "validated"
      : warnings.some((warning) => warning.toLowerCase().includes("unsupported"))
        ? "unsupported"
        : "draft";
  const intelligence =
    reviewOverride?.intelligence ??
    buildSourceIntelligenceArtifact({
      target,
      attempts,
      currentArtifact: currentArtifact ?? null,
    });

  return SourceInstructionArtifactSchema.parse({
    id: run.instructionArtifactId ?? `source_instruction_${target.id}_${Date.now()}`,
    targetId: target.id,
    status,
    createdAt: attempts[0]?.startedAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    acceptedAt: status === "validated" ? new Date().toISOString() : null,
    basedOnRunId: run.id,
    basedOnAttemptIds: attempts.map((attempt) => attempt.id),
    notes: run.finalSummary ?? null,
    navigationGuidance,
    searchGuidance,
    detailGuidance,
    applyGuidance,
    warnings,
    intelligence,
    versionInfo: buildSourceInstructionVersionInfo(adapterKind),
    verification,
  });
}
