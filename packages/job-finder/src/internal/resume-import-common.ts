import type { ResumeImportFieldCandidate } from "@unemployed/contracts";

export function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function stringifyCandidateTarget(candidate: ResumeImportFieldCandidate): string {
  return [candidate.target.section, candidate.target.key, candidate.target.recordId ?? ""]
    .join("|")
    .trim();
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
