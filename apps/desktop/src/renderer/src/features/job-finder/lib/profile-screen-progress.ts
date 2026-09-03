export type ProfileSection =
  | "basics"
  | "experience"
  | "background"
  | "preferences"
  | "sources";

export interface SectionProgress {
  filled: number;
  percent: number;
  total: number;
  /**
   * The section's minimal required fields, modelled separately from the
   * overall filled/total count so the visible tab signal counts only what
   * the journey actually needs instead of every optional field.
   */
  required?: SectionRequiredProgress;
}

export interface SectionRequiredProgress {
  filled: number;
  total: number;
}

export type SectionProgressState =
  | "complete"
  | "remaining"
  | "optional"
  | "empty";

function createSectionProgress(filled: number, total: number): SectionProgress {
  if (total <= 0) {
    return { filled: 0, percent: 0, total: 0 };
  }

  return {
    filled,
    percent: Math.round((filled / total) * 100),
    total,
  };
}

export function withRequiredProgress(
  progress: SectionProgress,
  requiredValues: readonly unknown[],
): SectionProgress {
  return {
    ...progress,
    required: {
      filled: requiredValues.filter((value) => isFilledValue(value)).length,
      total: requiredValues.length,
    },
  };
}

export function getSectionProgressState(
  progress: SectionProgress,
): SectionProgressState {
  const required = progress.required;

  if (required && required.total > 0) {
    return required.filled >= required.total ? "complete" : "remaining";
  }

  if (progress.total === 0) {
    return "empty";
  }

  return progress.filled > 0 ? "complete" : "optional";
}

function isFilledValue(value: unknown): boolean {
  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (typeof value === "boolean") {
    return true;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return value !== null && value !== undefined;
}

export function countFilledFields(values: readonly unknown[]): SectionProgress {
  return createSectionProgress(
    values.filter((value) => isFilledValue(value)).length,
    values.length,
  );
}

export function countFilledRecordFields(
  records: ReadonlyArray<Record<string, unknown>>,
  ignoredKeys: readonly string[] = [],
): SectionProgress {
  const ignored = new Set(ignoredKeys);
  let filled = 0;
  let total = 0;

  for (const record of records) {
    for (const [key, value] of Object.entries(record)) {
      if (ignored.has(key)) {
        continue;
      }

      total += 1;

      if (isFilledValue(value)) {
        filled += 1;
      }
    }
  }

  return createSectionProgress(filled, total);
}

export function combineSectionProgress(
  ...stats: readonly SectionProgress[]
): SectionProgress {
  return createSectionProgress(
    stats.reduce((sum, stat) => sum + stat.filled, 0),
    stats.reduce((sum, stat) => sum + stat.total, 0),
  );
}

/**
 * True only when the section models required fields and every one is filled.
 * The completion check glyph and success color follow this, not the broader
 * "complete" state, so a purely optional section cannot show a finished tick
 * over a partly filled bar.
 */
export function isSectionRequiredComplete(progress: SectionProgress): boolean {
  return (
    getSectionProgressState(progress) === "complete" &&
    progress.required !== undefined &&
    progress.required.total > 0
  );
}

export function formatSectionProgressLabel(
  section: ProfileSection,
  progress: SectionProgress,
): string {
  switch (getSectionProgressState(progress)) {
    case "complete":
      // "Required done" instead of "Complete": optional fields may still be
      // empty, and claiming the whole section is complete is not truthful.
      // A section with no required model has nothing to have finished, so it
      // reports what it is — optional, partly filled — instead of claiming
      // "Complete" over a half-filled bar beside four "Required done" tabs.
      return isSectionRequiredComplete(progress)
        ? "Required done"
        : "Optional added";
    case "remaining": {
      const remaining = Math.max(
        0,
        (progress.required?.total ?? 0) - (progress.required?.filled ?? 0),
      );
      return `${remaining} to fill`;
    }
    case "optional":
      return "Optional";
    case "empty":
      return section === "experience" || section === "background"
        ? "Empty"
        : "Not started";
  }
}
