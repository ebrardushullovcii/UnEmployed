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

function sanitizeStructuredEntries<TEntry extends Record<string, unknown>>(
  value: unknown,
  requiredArrayKey?: keyof TEntry,
): TEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return [];
    }

    const normalizedEntry = entry as Record<string, unknown>;

    if (requiredArrayKey) {
      const candidate = normalizedEntry[String(requiredArrayKey)];
      if (candidate !== undefined && !Array.isArray(candidate)) {
        return [];
      }
    }

    const hasMeaningfulContent = Object.values(normalizedEntry).some((fieldValue) => {
      if (typeof fieldValue === "string") {
        return fieldValue.trim().length > 0;
      }

      if (Array.isArray(fieldValue)) {
        return fieldValue.some((item) => {
          if (typeof item === "string") {
            return item.trim().length > 0;
          }

          if (!item || typeof item !== "object" || Array.isArray(item)) {
            return false;
          }

          const normalizedItem = item as Record<string, unknown>;

          return Object.values(normalizedItem).some(
            (nestedValue) => typeof nestedValue === "string" && nestedValue.trim().length > 0,
          );
        });
      }

      return false;
    });

    if (!hasMeaningfulContent) {
      return [];
    }

    return [normalizedEntry as TEntry];
  });
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
  const sanitizedExperienceEntries = sanitizeStructuredEntries<{
    title?: string | null;
    employer?: string | null;
    location?: string | null;
    dateRange?: string | null;
    summary?: string | null;
    bullets?: string[];
    profileRecordId?: string | null;
  }>(normalizedPrimary.experienceEntries, "bullets");
  const sanitizedProjectEntries = sanitizeStructuredEntries<{
    name?: string | null;
    role?: string | null;
    summary?: string | null;
    outcome?: string | null;
    bullets?: string[];
    profileRecordId?: string | null;
  }>(normalizedPrimary.projectEntries, "bullets");
  const sanitizedEducationEntries = sanitizeStructuredEntries<{
    school?: string | null;
    degree?: string | null;
    fieldOfStudy?: string | null;
    location?: string | null;
    dateRange?: string | null;
    summary?: string | null;
    profileRecordId?: string | null;
  }>(normalizedPrimary.educationEntries);
  const sanitizedCertificationEntries = sanitizeStructuredEntries<{
    name?: string | null;
    issuer?: string | null;
    dateRange?: string | null;
    profileRecordId?: string | null;
  }>(normalizedPrimary.certificationEntries);
  const sanitizedAdditionalSkills = sanitizeStringArray(normalizedPrimary.additionalSkills);
  const sanitizedLanguages = sanitizeStringArray(normalizedPrimary.languages);
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
    experienceEntries:
      sanitizedExperienceEntries.length > 0
        ? sanitizedExperienceEntries.map((entry) => ({
            title: typeof entry.title === "string" ? entry.title : null,
            employer: typeof entry.employer === "string" ? entry.employer : null,
            location: typeof entry.location === "string" ? entry.location : null,
            dateRange: typeof entry.dateRange === "string" ? entry.dateRange : null,
            summary: typeof entry.summary === "string" ? entry.summary : null,
            bullets: sanitizeStringArray(entry.bullets),
          }))
        : fallback.experienceEntries,
    projectEntries:
      sanitizedProjectEntries.length > 0
        ? sanitizedProjectEntries.map((entry) => ({
            name: typeof entry.name === "string" ? entry.name : null,
            role: typeof entry.role === "string" ? entry.role : null,
            summary: typeof entry.summary === "string" ? entry.summary : null,
            outcome: typeof entry.outcome === "string" ? entry.outcome : null,
            bullets: sanitizeStringArray(entry.bullets),
          }))
        : fallback.projectEntries,
    educationEntries:
      sanitizedEducationEntries.length > 0
        ? sanitizedEducationEntries.map((entry) => ({
            school: typeof entry.school === "string" ? entry.school : null,
            degree: typeof entry.degree === "string" ? entry.degree : null,
            fieldOfStudy:
              typeof entry.fieldOfStudy === "string" ? entry.fieldOfStudy : null,
            location: typeof entry.location === "string" ? entry.location : null,
            dateRange: typeof entry.dateRange === "string" ? entry.dateRange : null,
            summary: typeof entry.summary === "string" ? entry.summary : null,
          }))
        : fallback.educationEntries,
    certificationEntries:
      sanitizedCertificationEntries.length > 0
        ? sanitizedCertificationEntries.map((entry) => ({
            name: typeof entry.name === "string" ? entry.name : null,
            issuer: typeof entry.issuer === "string" ? entry.issuer : null,
            dateRange: typeof entry.dateRange === "string" ? entry.dateRange : null,
          }))
        : fallback.certificationEntries,
    additionalSkills:
      sanitizedAdditionalSkills.length > 0
        ? sanitizedAdditionalSkills
        : fallback.additionalSkills,
    languages: sanitizedLanguages.length > 0 ? sanitizedLanguages : fallback.languages,
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
    experienceEntries:
      sanitizedExperienceEntries.length > 0
        ? sanitizedExperienceEntries.map((entry) => ({
            title: typeof entry.title === "string" ? entry.title : null,
            employer: typeof entry.employer === "string" ? entry.employer : null,
            location: typeof entry.location === "string" ? entry.location : null,
            dateRange: typeof entry.dateRange === "string" ? entry.dateRange : null,
            summary: typeof entry.summary === "string" ? entry.summary : null,
            bullets: sanitizeStringArray(entry.bullets),
            profileRecordId:
              typeof entry.profileRecordId === "string" ? entry.profileRecordId : null,
          }))
        : fallback.experienceEntries,
    projectEntries:
      sanitizedProjectEntries.length > 0
        ? sanitizedProjectEntries.map((entry) => ({
            name: typeof entry.name === "string" ? entry.name : null,
            role: typeof entry.role === "string" ? entry.role : null,
            summary: typeof entry.summary === "string" ? entry.summary : null,
            outcome: typeof entry.outcome === "string" ? entry.outcome : null,
            bullets: sanitizeStringArray(entry.bullets),
            profileRecordId:
              typeof entry.profileRecordId === "string" ? entry.profileRecordId : null,
          }))
        : fallback.projectEntries,
    educationEntries:
      sanitizedEducationEntries.length > 0
        ? sanitizedEducationEntries.map((entry) => ({
            school: typeof entry.school === "string" ? entry.school : null,
            degree: typeof entry.degree === "string" ? entry.degree : null,
            fieldOfStudy:
              typeof entry.fieldOfStudy === "string" ? entry.fieldOfStudy : null,
            location: typeof entry.location === "string" ? entry.location : null,
            dateRange: typeof entry.dateRange === "string" ? entry.dateRange : null,
            summary: typeof entry.summary === "string" ? entry.summary : null,
            profileRecordId:
              typeof entry.profileRecordId === "string" ? entry.profileRecordId : null,
          }))
        : fallback.educationEntries,
    certificationEntries:
      sanitizedCertificationEntries.length > 0
        ? sanitizedCertificationEntries.map((entry) => ({
            name: typeof entry.name === "string" ? entry.name : null,
            issuer: typeof entry.issuer === "string" ? entry.issuer : null,
            dateRange: typeof entry.dateRange === "string" ? entry.dateRange : null,
            profileRecordId:
              typeof entry.profileRecordId === "string" ? entry.profileRecordId : null,
          }))
        : fallback.certificationEntries,
    additionalSkills:
      sanitizedAdditionalSkills.length > 0
        ? sanitizedAdditionalSkills
        : fallback.additionalSkills,
    languages: sanitizedLanguages.length > 0 ? sanitizedLanguages : fallback.languages,
    fullText,
    compatibilityScore:
      typeof normalizedPrimary.compatibilityScore === "number"
        ? normalizedPrimary.compatibilityScore
        : fallback.compatibilityScore,
    notes,
  });
}
