import type {
  CandidateProfile,
  JobSearchPreferences,
  ResumeDocumentBlock,
  ResumeDocumentBundle,
} from "@unemployed/contracts";
import {
  NonEmptyStringSchema,
  ResumeImportFieldCandidateDraftSchema,
  ResumeImportTargetSectionSchema,
  type AgentProviderStatus,
  type ResumeImportFieldCandidateDraft,
} from "@unemployed/contracts";
import { z } from "zod";

export const resumeImportExtractionStageValues = [
  "identity_summary",
  "experience",
  "background",
  "shared_memory",
] as const;
export const ResumeImportExtractionStageSchema = z.enum(
  resumeImportExtractionStageValues,
);
export type ResumeImportExtractionStage = z.infer<
  typeof ResumeImportExtractionStageSchema
>;

export const ResumeImportStageExtractionResultSchema = z.object({
  stage: ResumeImportExtractionStageSchema,
  analysisProviderKind: z.enum(["deterministic", "openai_compatible"]),
  analysisProviderLabel: NonEmptyStringSchema,
  candidates: z.array(ResumeImportFieldCandidateDraftSchema).default([]),
  notes: z.array(NonEmptyStringSchema).default([]),
});
export type ResumeImportStageExtractionResult = z.infer<
  typeof ResumeImportStageExtractionResultSchema
>;

export interface ExtractResumeImportStageInput {
  stage: ResumeImportExtractionStage;
  existingProfile: CandidateProfile;
  existingSearchPreferences: JobSearchPreferences;
  documentBundle: ResumeDocumentBundle;
}

const stageSectionHints: Record<
  ResumeImportExtractionStage,
  readonly ResumeDocumentBlock["sectionHint"][]
> = {
  identity_summary: ["identity", "summary", "contact"],
  experience: ["experience"],
  background: ["skills", "education", "certifications", "projects", "languages"],
  shared_memory: ["summary", "experience", "projects", "skills", "contact"],
};

const stageTargetSections: Record<
  ResumeImportExtractionStage,
  readonly z.infer<typeof ResumeImportTargetSectionSchema>[]
> = {
  identity_summary: ["identity", "contact", "location", "search_preferences"],
  experience: ["experience"],
  background: ["education", "certification", "link", "project", "language", "skill"],
  shared_memory: ["narrative", "proof_point", "answer_bank", "application_identity"],
};

export function buildValuePreview(value: unknown): string | null {
  if (typeof value === "string") {
    return value.trim() || null;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    const preview = value
      .map((entry) => buildValuePreview(entry))
      .filter((entry): entry is string => Boolean(entry))
      .slice(0, 4)
      .join(", ");
    return preview || null;
  }

  if (value && typeof value === "object") {
    const preview = Object.values(value as Record<string, unknown>)
      .map((entry) => buildValuePreview(entry))
      .filter((entry): entry is string => Boolean(entry))
      .slice(0, 4)
      .join(" | ");
    return preview || null;
  }

  return null;
}

export function selectBlocksForResumeImportStage(
  documentBundle: ResumeDocumentBundle,
  stage: ResumeImportExtractionStage,
): ResumeDocumentBlock[] {
  const preferredHints = new Set(stageSectionHints[stage]);
  const preferredBlocks = documentBundle.blocks.filter((block) =>
    preferredHints.has(block.sectionHint),
  );

  if (preferredBlocks.length > 0) {
    return preferredBlocks;
  }

  return documentBundle.blocks.slice(0, 40);
}

export function sanitizeStageCandidates(
  input: ExtractResumeImportStageInput,
  output: ResumeImportStageExtractionResult,
): ResumeImportStageExtractionResult {
  const validBlockIds = new Set(input.documentBundle.blocks.map((block) => block.id));
  const validSections = new Set(stageTargetSections[input.stage]);

  const candidates = output.candidates.flatMap((candidate) => {
    if (!validSections.has(candidate.target.section)) {
      return [];
    }

    return [
      ResumeImportFieldCandidateDraftSchema.parse({
        ...candidate,
        valuePreview: candidate.valuePreview ?? buildValuePreview(candidate.value),
        sourceBlockIds: candidate.sourceBlockIds.filter((id) => validBlockIds.has(id)),
      }),
    ];
  });

  return ResumeImportStageExtractionResultSchema.parse({
    ...output,
    stage: input.stage,
    candidates,
  });
}

export function createEmptyStageExtractionResult(
  stage: ResumeImportExtractionStage,
  status: AgentProviderStatus,
): ResumeImportStageExtractionResult {
  return ResumeImportStageExtractionResultSchema.parse({
    stage,
    analysisProviderKind: status.kind,
    analysisProviderLabel: status.label,
    candidates: [],
    notes: [],
  });
}
