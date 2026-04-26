import type { ResumeImportFieldCandidate } from "@unemployed/contracts";

import {
  areEquivalentEducationRecords,
  areEquivalentExperienceRecords,
} from "./resume-record-identity";

export function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function stringifyCandidateTarget(candidate: ResumeImportFieldCandidate): string {
  return [candidate.target.section, candidate.target.key, candidate.target.recordId ?? ""]
    .join("|")
    .trim();
}

export function areEquivalentRecordCandidates(
  left: ResumeImportFieldCandidate,
  right: ResumeImportFieldCandidate,
): boolean {
  if (
    left.target.section !== right.target.section ||
    left.target.key !== right.target.key ||
    left.target.section === "identity" ||
    left.target.section === "contact" ||
    left.target.section === "location" ||
    left.target.section === "search_preferences" ||
    left.target.section === "skill" ||
    left.target.section === "narrative" ||
    left.target.section === "proof_point" ||
    left.target.section === "answer_bank" ||
    left.target.section === "application_identity"
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
    return trimmed ? [trimmed] : [];
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .flatMap((entry) => (typeof entry === "string" ? [entry.trim()] : []))
    .filter(Boolean);
}
