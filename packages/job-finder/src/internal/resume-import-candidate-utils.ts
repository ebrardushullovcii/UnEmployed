import {
  ResumeImportExtractionStageSchema,
  buildCandidateConfidenceBreakdown,
  buildValuePreview,
} from "@unemployed/ai-providers";
import {
  ResumeImportFieldCandidateSchema,
  type ResumeDocumentBundle,
  type ResumeImportFieldCandidate,
  type ResumeImportFieldCandidateDraft,
} from "@unemployed/contracts";

import { buildExtractionId } from "./profile-merge";

export const RESUME_IMPORT_STAGES = ResumeImportExtractionStageSchema.options;

function createCandidateId(
  runId: string,
  index: number,
  draft: ResumeImportFieldCandidateDraft,
): string {
  return buildExtractionId(`resume_import_${runId}`, index, [
    draft.target.section,
    draft.target.key,
    draft.target.recordId,
    draft.label,
  ]);
}

export function toCandidate(
  documentBundle: ResumeDocumentBundle,
  runId: string,
  sourceKind: ResumeImportFieldCandidate["sourceKind"],
  createdAt: string,
  draft: ResumeImportFieldCandidateDraft,
  index: number,
): ResumeImportFieldCandidate {
  const confidenceBreakdown =
    draft.confidenceBreakdown ??
    buildCandidateConfidenceBreakdown({
      candidate: draft,
      bundle: documentBundle,
    });

  return ResumeImportFieldCandidateSchema.parse({
    ...draft,
    id: createCandidateId(runId, index, draft),
    runId,
    sourceKind,
    resolution:
      sourceKind === "parser_literal"
        ? confidenceBreakdown.recommendation === "abstain"
          ? "abstained"
          : "auto_applied"
        : confidenceBreakdown.recommendation === "abstain"
          ? "abstained"
          : "needs_review",
    resolutionReason:
      sourceKind === "parser_literal"
        ? "high_confidence_literal_with_direct_evidence"
        : confidenceBreakdown.recommendation === "abstain"
          ? "composite_confidence_recommended_abstain"
          : null,
    confidenceBreakdown,
    createdAt,
    resolvedAt: sourceKind === "parser_literal" ? createdAt : null,
    valuePreview: draft.valuePreview ?? buildValuePreview(draft.value),
  });
}

function toCandidateCounts(candidates: readonly ResumeImportFieldCandidate[]) {
  return {
    total: candidates.length,
    autoApplied: candidates.filter((candidate) => candidate.resolution === "auto_applied").length,
    needsReview: candidates.filter((candidate) => candidate.resolution === "needs_review").length,
    rejected: candidates.filter((candidate) => candidate.resolution === "rejected").length,
    abstained: candidates.filter((candidate) => candidate.resolution === "abstained").length,
  };
}

export function countResumeImportCandidates(
  candidates: readonly ResumeImportFieldCandidate[],
) {
  return toCandidateCounts(candidates);
}

function isBlockingReviewCandidate(candidate: ResumeImportFieldCandidate): boolean {
  if (candidate.resolution !== "needs_review" && candidate.resolution !== "abstained") {
    return false;
  }

  return candidate.target.section !== "proof_point";
}

function isOptionalProofCandidate(candidate: ResumeImportFieldCandidate): boolean {
  return (
    (candidate.resolution === "needs_review" || candidate.resolution === "abstained") &&
    candidate.target.section === "proof_point"
  );
}

export function countBlockingResumeImportCandidates(
  candidates: readonly ResumeImportFieldCandidate[],
): number {
  return candidates.filter(isBlockingReviewCandidate).length;
}

export function hasBlockingResumeImportCandidates(
  candidates: readonly ResumeImportFieldCandidate[],
): boolean {
  return candidates.some(isBlockingReviewCandidate);
}

export function summarizeCandidateWarnings(
  candidates: readonly ResumeImportFieldCandidate[],
): string[] {
  const blockingReviewCandidates = candidates.filter(isBlockingReviewCandidate);
  const leadingLabels = blockingReviewCandidates
    .slice(0, 5)
    .map((candidate) => candidate.label);
  const optionalProofCandidates = candidates.filter(isOptionalProofCandidate);

  if (blockingReviewCandidates.length === 0 && optionalProofCandidates.length === 0) {
    return [];
  }

  if (blockingReviewCandidates.length === 0) {
    return [
      `${optionalProofCandidates.length} optional proof suggestion${optionalProofCandidates.length === 1 ? " is" : "s are"} available to review before using ${optionalProofCandidates.length === 1 ? "it" : "them"} in tailored resume narratives.`,
    ];
  }

  return [
    `${blockingReviewCandidates.length} imported suggestion${blockingReviewCandidates.length === 1 ? " still needs" : "s still need"} review before the app should rely on it everywhere.`,
    ...leadingLabels,
  ];
}
