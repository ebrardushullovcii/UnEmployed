import type { ResumeDraft } from "@unemployed/contracts";

export function formatTimestamp(value: string | null): string {
  if (!value) {
    return "Not set";
  }

  return new Date(value).toLocaleString();
}

export function formatOptionalDate(
  value: string | null,
  fallback?: string | null,
): string {
  if (value) {
    return new Date(value).toLocaleDateString();
  }

  return fallback ?? "Unknown";
}

export function formatDraftStatusLabel(status: ResumeDraft["status"]): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "approved":
      return "Approved";
    case "needs_review":
      return "Needs review";
    case "stale":
      return "Out of date";
  }

  const exhaustiveStatus: never = status;
  void exhaustiveStatus;
  throw new Error("Unhandled draft status.");
}

export function toDraftStatusTone(
  status: ResumeDraft["status"],
): "active" | "critical" | "muted" | "neutral" | "positive" {
  if (status === "approved") {
    return "positive";
  }

  if (status === "stale") {
    return "critical";
  }

  if (status === "needs_review") {
    return "active";
  }

  return "muted";
}

export function cloneDraft(draft: ResumeDraft): ResumeDraft {
  return {
    ...draft,
    sections: draft.sections.map((section) => ({
      ...section,
      bullets: section.bullets.map((bullet) => ({ ...bullet })),
      sourceRefs: [...section.sourceRefs],
    })),
  };
}
