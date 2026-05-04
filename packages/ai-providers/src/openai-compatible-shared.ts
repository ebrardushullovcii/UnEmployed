import { TailoredResumeDraftSchema, type TailoredResumeDraft } from "./shared";
import {
  buildDeterministicStructuredResumeDraft,
  composeDeterministicFullText,
  filterGroundedVisibleSkills,
  uniqueStrings,
} from "./deterministic";

// Keep this set in sync with the reference-only identifier fields on the
// structured draft payloads validated through TailoredResumeDraftSchema and the
// related draft entry contracts in packages/contracts/src/resume.ts.
const REFERENCE_ONLY_KEYS = new Set([
  "profileRecordId",
  "sourceId",
  "id",
  "draftId",
  "recordId",
]);

function sanitizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is string =>
          typeof entry === "string" && entry.trim().length > 0,
      )
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

    // This predicate intentionally treats only user-visible string content as meaningful.
    // Numeric or boolean fields do not currently count here, so revisit this block if
    // TEntry or TailoredResumeDraftSchema starts relying on non-string visible fields.
    const hasMeaningfulContent = Object.entries(normalizedEntry).some(
      ([fieldKey, fieldValue]) => {
        if (REFERENCE_ONLY_KEYS.has(fieldKey)) {
          return false;
        }

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
              (nestedValue) =>
                typeof nestedValue === "string" &&
                nestedValue.trim().length > 0,
            );
          });
        }

        return false;
      },
    );

    if (!hasMeaningfulContent) {
      return [];
    }

    return [normalizedEntry as TEntry];
  });
}

function normalizeNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function hasVisibleExperienceContent(entry: {
  title?: string | null;
  employer?: string | null;
  location?: string | null;
  dateRange?: string | null;
  summary?: string | null;
  bullets?: string[];
}): boolean {
  return Boolean(
    normalizeNullableString(entry.title) ||
      normalizeNullableString(entry.employer) ||
      normalizeNullableString(entry.location) ||
      normalizeNullableString(entry.dateRange) ||
      normalizeNullableString(entry.summary) ||
      sanitizeStringArray(entry.bullets).length > 0,
  );
}

type FallbackExperienceEntry = TailoredResumeDraft["experienceEntries"][number];

function normalizeComparableText(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function entryMatchesFallback(
  entry: {
    title?: string | null;
    employer?: string | null;
    dateRange?: string | null;
  },
  fallbackEntry: FallbackExperienceEntry,
): boolean {
  const entryTitle = normalizeComparableText(entry.title);
  const fallbackTitle = normalizeComparableText(fallbackEntry.title);
  const entryEmployer = normalizeComparableText(entry.employer);
  const fallbackEmployer = normalizeComparableText(fallbackEntry.employer);
  const entryDateRange = normalizeComparableText(entry.dateRange);
  const fallbackDateRange = normalizeComparableText(fallbackEntry.dateRange);

  if (entryTitle && fallbackTitle && entryEmployer && fallbackEmployer) {
    return entryTitle === fallbackTitle && entryEmployer === fallbackEmployer;
  }

  if (entryTitle && fallbackTitle && entryDateRange && fallbackDateRange) {
    return entryTitle === fallbackTitle && entryDateRange === fallbackDateRange;
  }

  return false;
}

function normalizeExperienceEntries(
  entries: Array<{
    title?: string | null;
    employer?: string | null;
    location?: string | null;
    dateRange?: string | null;
    summary?: string | null;
    bullets?: string[];
    profileRecordId?: string | null;
  }>,
  fallbackEntries: ReturnType<
    typeof buildDeterministicStructuredResumeDraft
  >["experienceEntries"],
) {
  const knownFallbackIds = new Set(
    fallbackEntries
      .map((entry) => entry.profileRecordId)
      .filter((value): value is string => Boolean(value)),
  );
  const entriesByFallbackId = new Map<string, typeof entries[number]>();
  const usedEntryIndexes = new Set<number>();

  entries.forEach((entry, index) => {
    const entryRecordId = normalizeNullableString(entry.profileRecordId);
    if (!entryRecordId || !knownFallbackIds.has(entryRecordId)) {
      return;
    }

    if (!entriesByFallbackId.has(entryRecordId)) {
      entriesByFallbackId.set(entryRecordId, entry);
      usedEntryIndexes.add(index);
    }
  });

  fallbackEntries.forEach((fallbackEntry) => {
    if (!fallbackEntry.profileRecordId || entriesByFallbackId.has(fallbackEntry.profileRecordId)) {
      return;
    }

    const matchedIndex = entries.findIndex((entry, index) => {
      if (usedEntryIndexes.has(index)) {
        return false;
      }

      return entryMatchesFallback(entry, fallbackEntry);
    });

    if (matchedIndex >= 0) {
      entriesByFallbackId.set(fallbackEntry.profileRecordId, entries[matchedIndex]!);
      usedEntryIndexes.add(matchedIndex);
    }
  });

  return fallbackEntries.map((fallbackEntry, index) => {
    const matchedEntry = fallbackEntry.profileRecordId
      ? entriesByFallbackId.get(fallbackEntry.profileRecordId) ??
        (!entries[index] || usedEntryIndexes.has(index) || !hasVisibleExperienceContent(entries[index])
          ? undefined
          : entries[index])
      : entries[index];

    if (!matchedEntry) {
      return fallbackEntry;
    }

    return {
      title:
        normalizeNullableString(matchedEntry.title) ?? fallbackEntry.title ?? null,
      employer:
        normalizeNullableString(matchedEntry.employer) ??
        fallbackEntry.employer ??
        null,
      location:
        normalizeNullableString(matchedEntry.location) ??
        fallbackEntry.location ??
        null,
      dateRange:
        normalizeNullableString(matchedEntry.dateRange) ??
        fallbackEntry.dateRange ??
        null,
      summary: normalizeNullableString(matchedEntry.summary) ?? fallbackEntry.summary,
      bullets: sanitizeStringArray(matchedEntry.bullets).length > 0
        ? sanitizeStringArray(matchedEntry.bullets)
        : fallbackEntry.bullets,
      profileRecordId: fallbackEntry.profileRecordId ?? null,
    };
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
  const sanitizedAdditionalSkills = sanitizeStringArray(
    normalizedPrimary.additionalSkills,
  );
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
  const experienceHighlights =
    sanitizedExperienceHighlights.length > 0
      ? sanitizedExperienceHighlights
      : fallback.experienceHighlights;
  const coreSkills =
    sanitizedCoreSkills.length > 0 ? sanitizedCoreSkills : fallback.coreSkills;
  const groundedCoreSkills = filterGroundedVisibleSkills(
    fallbackInput.profile,
    coreSkills,
    8,
  );
  const targetedKeywords =
    sanitizedTargetedKeywords.length > 0
      ? sanitizedTargetedKeywords
      : fallback.targetedKeywords;
  const groundedAdditionalSkills = filterGroundedVisibleSkills(
    fallbackInput.profile,
    sanitizedAdditionalSkills.length > 0
      ? sanitizedAdditionalSkills
      : fallback.additionalSkills,
    8,
  ).filter(
    (skill) =>
      !groundedCoreSkills.some(
        (coreSkill) => coreSkill.toLowerCase() === skill.toLowerCase(),
      ),
  );
  const notes = uniqueStrings([
    ...fallback.notes,
    ...(Array.isArray(normalizedPrimary.notes)
      ? normalizedPrimary.notes.filter(
          (note): note is string =>
            typeof note === "string" && note.trim().length > 0,
        )
      : []),
  ]);
  const experienceEntries = sanitizedExperienceEntries.length > 0
    ? normalizeExperienceEntries(
        sanitizedExperienceEntries,
        fallback.experienceEntries,
      )
    : fallback.experienceEntries;
  const fullText = composeDeterministicFullText({
    label,
    summary,
    experienceHighlights,
    coreSkills: groundedCoreSkills,
    experienceEntries,
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
              typeof entry.fieldOfStudy === "string"
                ? entry.fieldOfStudy
                : null,
            location:
              typeof entry.location === "string" ? entry.location : null,
            dateRange:
              typeof entry.dateRange === "string" ? entry.dateRange : null,
            summary: typeof entry.summary === "string" ? entry.summary : null,
          }))
        : fallback.educationEntries,
    certificationEntries:
      sanitizedCertificationEntries.length > 0
        ? sanitizedCertificationEntries.map((entry) => ({
            name: typeof entry.name === "string" ? entry.name : null,
            issuer: typeof entry.issuer === "string" ? entry.issuer : null,
            dateRange:
              typeof entry.dateRange === "string" ? entry.dateRange : null,
          }))
        : fallback.certificationEntries,
    additionalSkills: groundedAdditionalSkills,
    languages:
      sanitizedLanguages.length > 0 ? sanitizedLanguages : fallback.languages,
    targetedKeywords,
    notes,
  });

  return TailoredResumeDraftSchema.parse({
    ...fallback,
    label,
    summary,
    experienceHighlights,
    coreSkills: groundedCoreSkills,
    targetedKeywords,
    coverageMetadata: fallback.coverageMetadata,
    experienceEntries:
      experienceEntries,
    projectEntries:
      sanitizedProjectEntries.length > 0
        ? sanitizedProjectEntries.map((entry) => ({
            name: typeof entry.name === "string" ? entry.name : null,
            role: typeof entry.role === "string" ? entry.role : null,
            summary: typeof entry.summary === "string" ? entry.summary : null,
            outcome: typeof entry.outcome === "string" ? entry.outcome : null,
            bullets: sanitizeStringArray(entry.bullets),
            profileRecordId:
              typeof entry.profileRecordId === "string"
                ? entry.profileRecordId
                : null,
          }))
        : fallback.projectEntries,
    educationEntries:
      sanitizedEducationEntries.length > 0
        ? sanitizedEducationEntries.map((entry) => ({
            school: typeof entry.school === "string" ? entry.school : null,
            degree: typeof entry.degree === "string" ? entry.degree : null,
            fieldOfStudy:
              typeof entry.fieldOfStudy === "string"
                ? entry.fieldOfStudy
                : null,
            location:
              typeof entry.location === "string" ? entry.location : null,
            dateRange:
              typeof entry.dateRange === "string" ? entry.dateRange : null,
            summary: typeof entry.summary === "string" ? entry.summary : null,
            profileRecordId:
              typeof entry.profileRecordId === "string"
                ? entry.profileRecordId
                : null,
          }))
        : fallback.educationEntries,
    certificationEntries:
      sanitizedCertificationEntries.length > 0
        ? sanitizedCertificationEntries.map((entry) => ({
            name: typeof entry.name === "string" ? entry.name : null,
            issuer: typeof entry.issuer === "string" ? entry.issuer : null,
            dateRange:
              typeof entry.dateRange === "string" ? entry.dateRange : null,
            profileRecordId:
              typeof entry.profileRecordId === "string"
                ? entry.profileRecordId
                : null,
          }))
        : fallback.certificationEntries,
    additionalSkills: groundedAdditionalSkills,
    languages:
      sanitizedLanguages.length > 0 ? sanitizedLanguages : fallback.languages,
    fullText,
    compatibilityScore:
      typeof normalizedPrimary.compatibilityScore === "number"
        ? normalizedPrimary.compatibilityScore
        : fallback.compatibilityScore,
    notes,
  });
}
