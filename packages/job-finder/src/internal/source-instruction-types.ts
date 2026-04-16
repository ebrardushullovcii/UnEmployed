import { SourceIntelligenceArtifactSchema } from "@unemployed/contracts";
import type {
  SourceIntelligenceArtifact,
  SourceDebugCompactionState,
  SourceDebugPhase,
  SourceDebugPhaseCompletionMode,
  SourceDebugPhaseEvidence,
  SourceDebugWorkerAttempt,
} from "@unemployed/contracts";
import { uniqueStrings } from "./shared";

export interface SourceInstructionQualityAssessment {
  highSignalNavigationOrSearch: string[];
  highSignalDetailOrApply: string[];
  qualifiesForValidation: boolean;
  qualityWarnings: string[];
}

export interface SourceInstructionReviewOverride {
  navigationGuidance: string[] | null;
  searchGuidance: string[] | null;
  detailGuidance: string[] | null;
  applyGuidance: string[] | null;
  warnings: string[] | null;
  intelligence: SourceIntelligenceArtifact | null;
}

export interface SourceInstructionFinalReviewPhaseContext {
  phase: SourceDebugPhase;
  phaseGoal: string;
  successCriteria: string[];
  stopConditions: string[];
  knownFactsAtStart: string[];
  startedAt: string;
  completedAt: string | null;
  outcome: SourceDebugWorkerAttempt["outcome"];
  completionMode: SourceDebugPhaseCompletionMode;
  completionReason: string | null;
  resultSummary: string;
  blockerSummary: string | null;
  confirmedFacts: string[];
  attemptedActions: string[];
  phaseEvidence: SourceDebugPhaseEvidence | null;
  compactionState: SourceDebugCompactionState | null;
  reviewTranscript: string[];
}

export function readReviewOverrideStringArray(
  payload: Record<string, unknown>,
  key: keyof SourceInstructionReviewOverride,
): string[] | null {
  if (!(key in payload)) {
    return null;
  }

  const value = payload[key];

  if (!Array.isArray(value)) {
    return null;
  }

  return uniqueStrings(
    value.flatMap((entry) => (typeof entry === "string" ? [entry.trim()] : [])),
  );
}

export function parseSourceInstructionReviewOverride(
  raw: unknown,
): SourceInstructionReviewOverride | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const payload = raw as Record<string, unknown>;

  const intelligence = (() => {
    if (!("intelligence" in payload)) {
      return null;
    }

    try {
      return SourceIntelligenceArtifactSchema.parse(payload.intelligence);
    } catch {
      return null;
    }
  })();

  return {
    navigationGuidance: readReviewOverrideStringArray(
      payload,
      "navigationGuidance",
    ),
    searchGuidance: readReviewOverrideStringArray(payload, "searchGuidance"),
    detailGuidance: readReviewOverrideStringArray(payload, "detailGuidance"),
    applyGuidance: readReviewOverrideStringArray(payload, "applyGuidance"),
    warnings: readReviewOverrideStringArray(payload, "warnings"),
    intelligence,
  };
}
