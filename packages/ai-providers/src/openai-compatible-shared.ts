import { TailoredResumeDraftSchema } from "./shared";
import { buildDeterministicStructuredResumeDraft, uniqueStrings } from "./deterministic";

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

  return TailoredResumeDraftSchema.parse({
    ...fallback,
    ...normalizedPrimary,
    label:
      typeof normalizedPrimary.label === "string"
        ? normalizedPrimary.label
        : fallback.label,
    summary:
      typeof normalizedPrimary.summary === "string" &&
      normalizedPrimary.summary.trim().length > 0
        ? normalizedPrimary.summary
        : fallback.summary,
    experienceHighlights: Array.isArray(normalizedPrimary.experienceHighlights)
      ? normalizedPrimary.experienceHighlights
      : fallback.experienceHighlights,
    coreSkills: Array.isArray(normalizedPrimary.coreSkills)
      ? normalizedPrimary.coreSkills
      : fallback.coreSkills,
    targetedKeywords: Array.isArray(normalizedPrimary.targetedKeywords)
      ? normalizedPrimary.targetedKeywords
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
