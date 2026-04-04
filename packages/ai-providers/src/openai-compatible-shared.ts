import { TailoredResumeDraftSchema } from "./shared";
import { buildDeterministicStructuredResumeDraft, uniqueStrings } from "./deterministic";

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

  return TailoredResumeDraftSchema.parse({
    ...fallback,
    label:
      typeof normalizedPrimary.label === "string" &&
      normalizedPrimary.label.trim().length > 0
        ? normalizedPrimary.label
        : fallback.label,
    summary:
      typeof normalizedPrimary.summary === "string" &&
      normalizedPrimary.summary.trim().length > 0
        ? normalizedPrimary.summary
        : fallback.summary,
    experienceHighlights: sanitizedExperienceHighlights.length > 0
      ? sanitizedExperienceHighlights
      : fallback.experienceHighlights,
    coreSkills: sanitizedCoreSkills.length > 0
      ? sanitizedCoreSkills
      : fallback.coreSkills,
    targetedKeywords: sanitizedTargetedKeywords.length > 0
      ? sanitizedTargetedKeywords
      : fallback.targetedKeywords,
    fullText:
      typeof normalizedPrimary.fullText === "string" &&
      normalizedPrimary.fullText.trim().length > 0
        ? normalizedPrimary.fullText
        : fallback.fullText,
    compatibilityScore:
      typeof normalizedPrimary.compatibilityScore === "number"
        ? normalizedPrimary.compatibilityScore
        : fallback.compatibilityScore,
    notes: uniqueStrings([
      ...fallback.notes,
      ...(Array.isArray(normalizedPrimary.notes)
        ? normalizedPrimary.notes.filter(
            (note): note is string => typeof note === "string" && note.trim().length > 0,
          )
        : []),
    ]),
  });
}
