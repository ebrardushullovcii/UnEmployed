import type { ResumeImportFieldCandidate } from "@unemployed/contracts";

import {
  areEquivalentEducationRecords,
  areEquivalentExperienceRecords,
} from "./resume-record-identity";

export function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function stringifyCandidateTarget(
  candidate: ResumeImportFieldCandidate,
): string {
  return [
    candidate.target.section,
    candidate.target.key,
    candidate.target.recordId ?? "",
  ]
    .join("|")
    .trim();
}

export function areEquivalentRecordCandidates(
  left: ResumeImportFieldCandidate,
  right: ResumeImportFieldCandidate,
): boolean {
  if (
    left.target.section !== right.target.section ||
    left.target.key !== right.target.key
  ) {
    return false;
  }

  switch (left.target.section) {
    case "experience":
      return areEquivalentExperienceRecords(left.value, right.value);
    case "education":
      return areEquivalentEducationRecords(left.value, right.value);
    default:
      return false;
  }
}

export function toStringArray(value: unknown): string[] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? splitListString(trimmed) : [];
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .flatMap((entry) =>
      typeof entry === "string" ? splitListString(entry.trim()) : [],
    )
    .filter(Boolean);
}

export function toCandidateListValues(
  candidate: Pick<ResumeImportFieldCandidate, "target" | "value">,
): string[] {
  if (
    candidate.target.key === "locations" ||
    candidate.target.key === "targetRoles"
  ) {
    const entries =
      typeof candidate.value === "string"
        ? [candidate.value]
        : Array.isArray(candidate.value)
          ? candidate.value.filter(
              (entry): entry is string => typeof entry === "string",
            )
          : [];

    return entries.map((entry) => entry.trim()).filter(Boolean);
  }

  return toStringArray(candidate.value);
}

export function toNarrativeStringArray(value: unknown): string[] {
  const entries =
    typeof value === "string"
      ? [value]
      : Array.isArray(value)
        ? value.filter((entry): entry is string => typeof entry === "string")
        : [];

  return entries
    .flatMap((entry) => entry.split(/\r?\n+/))
    // Inline bullet glyphs ("• a • b") and long multi-sentence blobs are one
    // resume's ten bullets glued together; downstream tailoring can only
    // select, reorder and rewrite what arrives as separate entries.
    .flatMap((entry) => entry.split(/\s+[•·▪◦‣]\s+/u))
    .flatMap((entry) => splitLongNarrativeBlob(entry))
    .map((entry) => entry.trim().replace(/^(?:[-*•·▪◦‣]\s+|\d+[.)]\s+)/u, ""))
    .filter(Boolean);
}

const LONG_NARRATIVE_BLOB_MIN_LENGTH = 240;

function splitLongNarrativeBlob(entry: string): string[] {
  const trimmed = entry.trim();
  if (trimmed.length < LONG_NARRATIVE_BLOB_MIN_LENGTH) {
    return [trimmed];
  }
  const sentences = trimmed
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  return sentences.length >= 3 ? sentences : [trimmed];
}

function splitListString(value: string): string[] {
  if (!value.includes(",")) {
    return value ? [value] : [];
  }

  const parts = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  return parts.length > 0 ? parts : [];
}
