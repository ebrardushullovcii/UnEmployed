import type { JobDiscoveryTarget, JobSource } from "@unemployed/contracts";

/**
 * Naming for job sources on user-facing surfaces.
 *
 * Internal target ids and the recorded source enum are storage facts, never
 * names a job seeker chose to read. Everything the user sees is either the
 * label they saved for the source or a plain fallback phrase.
 */

/** Used when a source no longer carries the label the user saved. */
export const UNNAMED_JOB_SOURCE_NAME = "A job source";

/**
 * Plain names for the recorded source value on a saved job. The record is
 * exhaustive so a new source kind cannot silently leak its enum name.
 */
const JOB_SOURCE_NAMES: Record<JobSource, string> = {
  target_site: "Job sites you added",
};

/**
 * Resolves a saved source target id to the label the user gave it, falling
 * back to a plain phrase when the source (or its label) is gone.
 */
export function jobSourceLabel(
  sourceTargetId: string,
  targets: readonly Pick<JobDiscoveryTarget, "id" | "label">[],
): string {
  const id = sourceTargetId.trim();
  const saved = targets.find((target) => target.id === id)?.label.trim() ?? "";
  if (saved.length > 0) return saved;
  return UNNAMED_JOB_SOURCE_NAME;
}

/**
 * Names the source recorded on an outcome event. Saved jobs record the source
 * kind rather than the individual site, so the name describes that kind in
 * plain language instead of printing the stored value.
 */
export function recordedJobSourceName(recordedSource: string): string {
  const value = recordedSource.trim();
  const known = JOB_SOURCE_NAMES[value as JobSource];
  if (known) return known;
  return UNNAMED_JOB_SOURCE_NAME;
}
