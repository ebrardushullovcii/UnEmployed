import type {
  CandidateProfile,
  JobSearchPreferences,
  ResumeDocumentBlock,
  ResumeDocumentBundle,
  ResumeImportTargetSection,
} from "@unemployed/contracts";
import {
  NonEmptyStringSchema,
  ResumeImportFieldCandidateDraftSchema,
  type AgentProviderStatus,
} from "@unemployed/contracts";
import { z } from "zod";

import { buildCandidateConfidenceBreakdown } from "./resume-import-helpers";

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

function matchesAnyPattern(value: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

function findHeadingIndex(
  blocks: readonly ResumeDocumentBlock[],
  startIndex: number,
  patterns: readonly RegExp[],
): number {
  for (let index = startIndex; index < blocks.length; index += 1) {
    const block = blocks[index];

    if (!block) {
      continue;
    }

    if (matchesAnyPattern(block.text.trim(), patterns)) {
      return index;
    }
  }

  return -1;
}

function sliceHeadingRange(
  blocks: readonly ResumeDocumentBlock[],
  startPatterns: readonly RegExp[],
  stopPatterns: readonly RegExp[],
): ResumeDocumentBlock[] {
  const startIndex = findHeadingIndex(blocks, 0, startPatterns);

  if (startIndex === -1) {
    return [];
  }

  const stopIndex = findHeadingIndex(blocks, startIndex + 1, stopPatterns);
  return blocks.slice(startIndex, stopIndex === -1 ? undefined : stopIndex);
}

function dedupeBlocks(blocks: readonly ResumeDocumentBlock[]): ResumeDocumentBlock[] {
  const seen = new Set<string>();

  return blocks.filter((block) => {
    if (seen.has(block.id)) {
      return false;
    }

    seen.add(block.id);
    return true;
  });
}

function sortBlocksForStructuredExtraction(
  blocks: readonly ResumeDocumentBlock[],
): ResumeDocumentBlock[] {
  return [...blocks].sort((left, right) => {
    if (left.pageNumber !== right.pageNumber) {
      return left.pageNumber - right.pageNumber;
    }

    const topDelta = (left.bbox?.top ?? left.readingOrder) - (right.bbox?.top ?? right.readingOrder);
    if (Math.abs(topDelta) > 1) {
      return topDelta;
    }

    const leftColumn = left.bbox?.left ?? 0;
    const rightColumn = right.bbox?.left ?? 0;

    if (Math.abs(leftColumn - rightColumn) > 14) {
      return leftColumn - rightColumn;
    }

    return left.readingOrder - right.readingOrder;
  });
}

const stageTargetSections: Record<
  ResumeImportExtractionStage,
  readonly ResumeImportTargetSection[]
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
  const blocks = sortBlocksForStructuredExtraction(documentBundle.blocks);
  const experienceBlocks = sliceHeadingRange(
    blocks,
    [/^work experience$/i, /^experience$/i],
    [/^education(?: and training)?$/i, /^language skills$/i, /^certifications?$/i],
  );
  const skillsBlocks = sliceHeadingRange(
    blocks,
    [/^skills$/i, /^technical skills$/i, /^core skills$/i, /^key skills$/i],
    [/^work experience$/i, /^experience$/i],
  );
  const educationBlocks = sliceHeadingRange(
    blocks,
    [/^education(?: and training)?$/i, /^education$/i],
    [/^language skills$/i, /^certifications?$/i],
  );
  const languageBlocks = sliceHeadingRange(
    blocks,
    [/^language skills$/i],
    [/^certifications?$/i],
  );
  const preSkillsCutoff = findHeadingIndex(blocks, 0, [/^skills$/i, /^work experience$/i, /^experience$/i]);
  const introBlocks = blocks.slice(0, preSkillsCutoff === -1 ? Math.min(blocks.length, 16) : preSkillsCutoff);

  if (stage === "identity_summary") {
    const selected = dedupeBlocks([
      ...introBlocks,
      ...blocks.filter((block) => block.kind === "contact"),
    ]);

    if (selected.length > 0) {
      return selected;
    }
  }

  if (stage === "experience" && experienceBlocks.length > 0) {
    return experienceBlocks;
  }

  if (stage === "background") {
    const selected = dedupeBlocks([
      ...skillsBlocks,
      ...educationBlocks,
      ...languageBlocks,
    ]);

    if (selected.length > 0) {
      return selected;
    }
  }

  if (stage === "shared_memory") {
    const selected = dedupeBlocks([
      ...introBlocks,
      ...experienceBlocks.slice(0, 28),
    ]);

    if (selected.length > 0) {
      return selected;
    }
  }

  const preferredHints = new Set(stageSectionHints[stage]);
  const preferredBlocks = blocks.filter((block) => preferredHints.has(block.sectionHint));

  if (preferredBlocks.length > 0) {
    return preferredBlocks;
  }

  return blocks.slice(0, 40);
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
        confidenceBreakdown:
          candidate.confidenceBreakdown ??
          buildCandidateConfidenceBreakdown({
            candidate,
            bundle: input.documentBundle,
          }),
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
