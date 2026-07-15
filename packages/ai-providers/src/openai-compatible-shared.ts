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

type FallbackExperienceEntry = TailoredResumeDraft["experienceEntries"][number];

interface CanonicalExperienceEvidence {
  summary: string | null;
  bullets: readonly string[];
}

function normalizeComparableText(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function canonicalizeComparableDatePart(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return null;
  }

  if (/^present$/i.test(trimmed)) {
    return "present";
  }

  if (/^\d{4}$/.test(trimmed)) {
    return trimmed;
  }

  const yearMonthMatch = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(trimmed);
  if (yearMonthMatch) {
    const month = Number(yearMonthMatch[2]);
    return month >= 1 && month <= 12 ? `${yearMonthMatch[1]}-${yearMonthMatch[2]}` : null;
  }

  const monthYearSlashMatch = /^(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (monthYearSlashMatch) {
    const month = Number(monthYearSlashMatch[1]);
    return month >= 1 && month <= 12
      ? `${monthYearSlashMatch[2]}-${String(month).padStart(2, "0")}`
      : null;
  }

  const namedMonthMatch = /^([A-Za-z]+)\.?\s+(\d{4})$/.exec(trimmed);
  if (namedMonthMatch) {
    const monthByName: Record<string, number> = {
      jan: 1,
      january: 1,
      feb: 2,
      february: 2,
      mar: 3,
      march: 3,
      apr: 4,
      april: 4,
      may: 5,
      jun: 6,
      june: 6,
      jul: 7,
      july: 7,
      aug: 8,
      august: 8,
      sep: 9,
      sept: 9,
      september: 9,
      oct: 10,
      october: 10,
      nov: 11,
      november: 11,
      dec: 12,
      december: 12,
    };
    const month = monthByName[namedMonthMatch[1]?.toLowerCase() ?? ""] ?? null;
    return month
      ? `${namedMonthMatch[2]}-${String(month).padStart(2, "0")}`
      : null;
  }

  return normalizeComparableText(trimmed) || null;
}

function canonicalizeComparableDateRange(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return null;
  }

  const parts = trimmed
    .split(/\s*[–—]\s*|\s+-\s+/)
    .map((part) => canonicalizeComparableDatePart(part));
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return `${parts[0]}__${parts[1]}`;
  }

  return canonicalizeComparableDatePart(trimmed);
}

function isPlausibleResumeDateRange(value: string | null | undefined): boolean {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return false;
  }

  const parts = trimmed
    .split(/\s*[–—]\s*|\s+-\s+/)
    .map((part) => canonicalizeComparableDatePart(part));
  if (parts.length >= 2) {
    return Boolean(parts[0] && parts[1]);
  }

  return Boolean(canonicalizeComparableDatePart(trimmed));
}

function selectCanonicalDateRange(input: {
  generated: string | null | undefined;
  fallback: string | null | undefined;
}): string | null {
  if (input.fallback && isPlausibleResumeDateRange(input.fallback)) {
    return input.fallback;
  }

  return input.generated && isPlausibleResumeDateRange(input.generated)
    ? input.generated
    : null;
}

function findCanonicalProse(
  generated: string | null | undefined,
  canonicalCandidates: readonly string[],
): string | null {
  const normalizedGenerated = normalizeComparableText(generated);
  if (!normalizedGenerated) {
    return null;
  }

  return (
    canonicalCandidates.find(
      (candidate) => normalizeComparableText(candidate) === normalizedGenerated,
    ) ?? null
  );
}

function selectCanonicalSummary(input: {
  generated: string | null | undefined;
  fallback: string | null | undefined;
  canonical: string | null | undefined;
}): string | null {
  const candidates = uniqueStrings(
    [input.fallback, input.canonical].filter(
      (value): value is string => Boolean(value?.trim()),
    ),
  );

  return (
    findCanonicalProse(input.generated, candidates) ??
    normalizeNullableString(input.fallback) ??
    normalizeNullableString(input.canonical)
  );
}

function selectCanonicalBullets(
  generatedBullets: unknown,
  fallbackBullets: readonly string[],
  canonicalBullets: readonly string[],
  maxBullets = 3,
): string[] {
  const canonicalCandidates = uniqueStrings([
    ...fallbackBullets,
    ...canonicalBullets,
  ]);
  const selectedBullets = uniqueStrings(
    sanitizeStringArray(generatedBullets).flatMap((generatedBullet) => {
      const canonicalBullet = findCanonicalProse(
        generatedBullet,
        canonicalCandidates,
      );
      return canonicalBullet ? [canonicalBullet] : [];
    }),
  );

  return uniqueStrings([...selectedBullets, ...fallbackBullets]).slice(
    0,
    maxBullets,
  );
}

function selectCanonicalStringList(
  generatedValues: unknown,
  fallbackValues: readonly string[],
): string[] {
  const selectedValues = uniqueStrings(
    sanitizeStringArray(generatedValues).flatMap((generatedValue) => {
      const canonicalValue = findCanonicalProse(
        generatedValue,
        fallbackValues,
      );
      return canonicalValue ? [canonicalValue] : [];
    }),
  );

  return selectedValues.length > 0 ? selectedValues : [...fallbackValues];
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
  const entryDateRange = canonicalizeComparableDateRange(entry.dateRange);
  const fallbackDateRange = canonicalizeComparableDateRange(fallbackEntry.dateRange);

  if (
    entryTitle &&
    fallbackTitle &&
    entryEmployer &&
    fallbackEmployer &&
    entryDateRange &&
    fallbackDateRange
  ) {
    return (
      entryTitle === fallbackTitle &&
      entryEmployer === fallbackEmployer &&
      entryDateRange === fallbackDateRange
    );
  }

  if (entryTitle && fallbackTitle && entryEmployer && fallbackEmployer) {
    return entryTitle === fallbackTitle && entryEmployer === fallbackEmployer;
  }

  if (entryTitle && fallbackTitle && entryDateRange && fallbackDateRange) {
    return entryTitle === fallbackTitle && entryDateRange === fallbackDateRange;
  }

  return false;
}

function entryConflictsWithFallback(
  entry: {
    title?: string | null;
    employer?: string | null;
    dateRange?: string | null;
  },
  fallbackEntry: FallbackExperienceEntry,
): boolean {
  const entryTitle = normalizeComparableText(entry.title);
  const fallbackTitle = normalizeComparableText(fallbackEntry.title);
  if (entryTitle && fallbackTitle && entryTitle !== fallbackTitle) {
    return true;
  }

  const entryEmployer = normalizeComparableText(entry.employer);
  const fallbackEmployer = normalizeComparableText(fallbackEntry.employer);
  if (entryEmployer && fallbackEmployer && entryEmployer !== fallbackEmployer) {
    return true;
  }

  const entryDateRange = canonicalizeComparableDateRange(entry.dateRange);
  const fallbackDateRange = canonicalizeComparableDateRange(fallbackEntry.dateRange);
  if (
    isPlausibleResumeDateRange(entry.dateRange) &&
    isPlausibleResumeDateRange(fallbackEntry.dateRange) &&
    entryDateRange &&
    fallbackDateRange &&
    entryDateRange !== fallbackDateRange
  ) {
    return true;
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
  canonicalEvidenceByRecordId: ReadonlyMap<
    string,
    CanonicalExperienceEvidence
  >,
) {
  const knownFallbackIds = new Set(
    fallbackEntries
      .map((entry) => entry.profileRecordId)
      .filter((value): value is string => Boolean(value)),
  );
  const fallbackEntriesById = new Map(
    fallbackEntries.flatMap((entry) =>
      entry.profileRecordId ? [[entry.profileRecordId, entry] as const] : [],
    ),
  );
  const entriesByFallbackId = new Map<string, typeof entries[number]>();
  const usedEntryIndexes = new Set<number>();

  entries.forEach((entry, index) => {
    const entryRecordId = normalizeNullableString(entry.profileRecordId);
    if (!entryRecordId || !knownFallbackIds.has(entryRecordId)) {
      return;
    }

    const fallbackEntry = fallbackEntriesById.get(entryRecordId);
    if (!fallbackEntry || entryConflictsWithFallback(entry, fallbackEntry)) {
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

      const entryRecordId = normalizeNullableString(entry.profileRecordId);
      if (entryRecordId && knownFallbackIds.has(entryRecordId)) {
        return false;
      }

      return entryMatchesFallback(entry, fallbackEntry);
    });

    if (matchedIndex >= 0) {
      entriesByFallbackId.set(fallbackEntry.profileRecordId, entries[matchedIndex]!);
      usedEntryIndexes.add(matchedIndex);
    }
  });

  let nextUnusedEntryIndex = 0;

  return fallbackEntries.map((fallbackEntry, index) => {
    let matchedEntry: typeof entries[number] | null;

    if (fallbackEntry.profileRecordId) {
      matchedEntry = entriesByFallbackId.get(fallbackEntry.profileRecordId) ?? null;
    } else {
      const directMatch = usedEntryIndexes.has(index) ? null : entries[index] ?? null;
      if (directMatch) {
        usedEntryIndexes.add(index);
        matchedEntry = directMatch;
      } else {
        while (nextUnusedEntryIndex < entries.length && usedEntryIndexes.has(nextUnusedEntryIndex)) {
          nextUnusedEntryIndex += 1;
        }

        matchedEntry = entries[nextUnusedEntryIndex] ?? null;
        if (matchedEntry) {
          usedEntryIndexes.add(nextUnusedEntryIndex);
          nextUnusedEntryIndex += 1;
        }
      }
    }

    if (!matchedEntry) {
      return fallbackEntry;
    }

    const fallbackDateRange = fallbackEntry.dateRange ?? null;
    const dateRange = selectCanonicalDateRange({
      generated: matchedEntry.dateRange,
      fallback: fallbackDateRange,
    });
    const canonicalEvidence = fallbackEntry.profileRecordId
      ? canonicalEvidenceByRecordId.get(fallbackEntry.profileRecordId)
      : null;
    const bullets = selectCanonicalBullets(
      matchedEntry.bullets,
      fallbackEntry.bullets,
      canonicalEvidence?.bullets ?? [],
    );

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
      dateRange,
      summary: selectCanonicalSummary({
        generated: matchedEntry.summary,
        fallback: fallbackEntry.summary,
        canonical: canonicalEvidence?.summary,
      }),
      bullets,
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
  const sanitizedCoreSkills = sanitizeStringArray(normalizedPrimary.coreSkills);
  const sanitizedExperienceEntries = sanitizeStructuredEntries<{
    title?: string | null;
    employer?: string | null;
    location?: string | null;
    dateRange?: string | null;
    summary?: string | null;
    bullets?: string[];
    profileRecordId?: string | null;
  }>(normalizedPrimary.experienceEntries, "bullets");
  const sanitizedTargetedKeywords = sanitizeStringArray(
    normalizedPrimary.targetedKeywords,
  );
  const sanitizedAdditionalSkills = sanitizeStringArray(
    normalizedPrimary.additionalSkills,
  );
  const label = fallback.label;
  const summary = fallback.summary;
  const experienceHighlights = fallback.experienceHighlights;
  const coreSkills =
    sanitizedCoreSkills.length > 0 ? sanitizedCoreSkills : fallback.coreSkills;
  const groundedCoreSkills = filterGroundedVisibleSkills(
    fallbackInput.profile,
    coreSkills,
    8,
  );
  const targetedKeywords = selectCanonicalStringList(
    sanitizedTargetedKeywords,
    fallback.targetedKeywords,
  );
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
  const notes = fallback.notes;
  const canonicalExperienceEvidenceByRecordId = new Map(
    fallbackInput.profile.experiences.map((experience) => [
      experience.id,
      {
        summary: experience.summary,
        bullets: experience.achievements,
      } satisfies CanonicalExperienceEvidence,
    ]),
  );
  const experienceEntries = sanitizedExperienceEntries.length > 0
    ? normalizeExperienceEntries(
        sanitizedExperienceEntries,
        fallback.experienceEntries,
        canonicalExperienceEvidenceByRecordId,
      )
    : fallback.experienceEntries;
  const fullText = composeDeterministicFullText({
    label,
    summary,
    experienceHighlights,
    coreSkills: groundedCoreSkills,
    experienceEntries,
    projectEntries: fallback.projectEntries,
    educationEntries: fallback.educationEntries,
    certificationEntries: fallback.certificationEntries,
    additionalSkills: groundedAdditionalSkills,
    languages: fallback.languages,
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
    experienceEntries,
    projectEntries: fallback.projectEntries,
    educationEntries: fallback.educationEntries,
    certificationEntries: fallback.certificationEntries,
    additionalSkills: groundedAdditionalSkills,
    languages: fallback.languages,
    fullText,
    compatibilityScore:
      typeof normalizedPrimary.compatibilityScore === "number"
        ? normalizedPrimary.compatibilityScore
        : fallback.compatibilityScore,
    notes,
  });
}
