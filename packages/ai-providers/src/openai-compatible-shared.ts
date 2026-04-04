import { TailoredResumeDraftSchema } from "./shared";
import {
  buildDeterministicStructuredResumeDraft,
  composeDeterministicFullText,
  uniqueStrings,
} from "./deterministic";

function sanitizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
}

export function summarizeError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return "Unknown error";
}

export function logFallbackError(operation: string, error: unknown): void {
  console.error(
    `[AI Provider] ${operation} failed; falling back to deterministic client. ${summarizeError(error)}`,
  );
}

export function completeTailoredResumeDraft(
  primary: unknown,
  fallbackInput: Parameters<typeof buildDeterministicStructuredResumeDraft>[0],
) {
  const fallback = buildDeterministicStructuredResumeDraft(fallbackInput);
  const normalizedPrimary =
    primary && typeof primary === "object" && !Array.isArray(primary)
      ? (primary as Record<string, unknown>)
      : {};
  const sanitizedExperienceHighlights = sanitizeStringArray(
    normalizedPrimary.experienceHighlights,
  );
  const sanitizedCoreSkills = sanitizeStringArray(normalizedPrimary.coreSkills);
  const sanitizedTargetedKeywords = sanitizeStringArray(
    normalizedPrimary.targetedKeywords,
  );
  const label =
    typeof normalizedPrimary.label === "string" &&
    normalizedPrimary.label.trim().length > 0
      ? normalizedPrimary.label
      : fallback.label;
  const summary =
    typeof normalizedPrimary.summary === "string" &&
    normalizedPrimary.summary.trim().length > 0
      ? normalizedPrimary.summary
      : fallback.summary;
  const experienceHighlights = sanitizedExperienceHighlights.length > 0
    ? sanitizedExperienceHighlights
    : fallback.experienceHighlights;
  const coreSkills = sanitizedCoreSkills.length > 0
    ? sanitizedCoreSkills
    : fallback.coreSkills;
  const targetedKeywords = sanitizedTargetedKeywords.length > 0
    ? sanitizedTargetedKeywords
    : fallback.targetedKeywords;
  const notes = uniqueStrings([
    ...fallback.notes,
    ...(Array.isArray(normalizedPrimary.notes)
      ? normalizedPrimary.notes.filter(
          (note): note is string => typeof note === "string" && note.trim().length > 0,
        )
      : []),
  ]);
  const fullText = composeDeterministicFullText({
    label,
    summary,
    experienceHighlights,
    coreSkills,
    targetedKeywords,
    notes,
  });

  return TailoredResumeDraftSchema.parse({
    ...fallback,
    label,
    summary,
    experienceHighlights,
    coreSkills,
    targetedKeywords,
    fullText,
    compatibilityScore:
      typeof normalizedPrimary.compatibilityScore === "number"
        ? normalizedPrimary.compatibilityScore
        : fallback.compatibilityScore,
    notes,
  });
}
