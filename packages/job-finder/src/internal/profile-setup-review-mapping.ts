import type {
  ProfileReviewItem,
  ProfileReviewTargetDomain,
  ResumeDocumentBundle,
  ResumeImportFieldCandidate,
} from "@unemployed/contracts";
import { uniqueStrings } from "./shared";

export type DerivedReviewDraft = {
  step: ProfileReviewItem["step"];
  target: ProfileReviewItem["target"];
  label: string;
  reason: string;
  severity: ProfileReviewItem["severity"];
  proposedValue?: string | null;
  sourceSnippet?: string | null;
  sourceCandidateId?: string | null;
  sourceRunId?: string | null;
};

function humanizeRecordFieldKey(key: string): string {
  switch (key) {
    case "companyName":
      return "Company";
    case "isCurrent":
      return "Current role";
    case "startDate":
      return "Start";
    case "endDate":
      return "End";
    case "fieldOfStudy":
      return "Field of study";
    case "workMode":
      return "Work mode";
    case "dateEarned":
      return "Date earned";
    default:
      return key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, " $1").trim();
  }
}

function humanizePrimitive(value: boolean | number): string {
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  return String(value);
}

export function summarizeValue(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return humanizePrimitive(value);
  }

  if (Array.isArray(value)) {
    const parts = value
      .flatMap((entry) => summarizeValue(entry) ?? [])
      .filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : null;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value)
      .flatMap(([key, entry]) => {
        const summarized = summarizeValue(entry);
        return summarized ? [`${humanizeRecordFieldKey(key)}: ${summarized}`] : [];
      })
      .filter(Boolean);
    return entries.length > 0 ? entries.join(" · ") : null;
  }

  return null;
}

function getSourceSnippet(
  candidate: ResumeImportFieldCandidate,
  documentBundle: ResumeDocumentBundle | null,
): string | null {
  if (candidate.evidenceText && candidate.evidenceText.trim().length > 0) {
    return candidate.evidenceText.trim();
  }

  const blockTexts = uniqueStrings(
    candidate.sourceBlockIds
      .map((blockId) => documentBundle?.blocks.find((block) => block.id === blockId)?.text ?? null)
      .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0),
  );

  if (blockTexts.length === 0) {
    return null;
  }

  return blockTexts.join(" ").slice(0, 400);
}

function mapTargetDomain(
  candidate: ResumeImportFieldCandidate,
): ProfileReviewTargetDomain | null {
  switch (candidate.target.section) {
    case "identity":
    case "experience":
    case "education":
    case "certification":
    case "project":
    case "link":
    case "language":
    case "narrative":
    case "proof_point":
    case "answer_bank":
    case "application_identity":
      return candidate.target.section;
    case "location":
      return "identity";
    case "contact":
      return "identity";
    case "search_preferences":
      return "search_preferences";
    default:
      return null;
  }
}

function mapCandidateToStep(
  candidate: ResumeImportFieldCandidate,
): ProfileReviewItem["step"] | null {
  switch (candidate.target.section) {
    case "identity":
      return candidate.target.key === "summary" ? "narrative" : "essentials";
    case "contact":
    case "location":
      return "essentials";
    case "application_identity":
      return "answers";
    case "experience":
    case "education":
    case "certification":
    case "project":
    case "link":
    case "language":
      return "background";
    case "search_preferences":
      return "targeting";
    case "narrative":
    case "proof_point":
      return "narrative";
    case "answer_bank":
      return "answers";
    default:
      return null;
  }
}

function mapCandidateToSeverity(
  candidate: ResumeImportFieldCandidate,
): ProfileReviewItem["severity"] {
  if (candidate.target.section === "experience" || candidate.target.section === "education") {
    return "critical";
  }

  if (
    candidate.target.section === "identity" ||
    candidate.target.section === "contact" ||
    candidate.target.section === "location" ||
    candidate.target.section === "search_preferences" ||
    candidate.target.section === "application_identity"
  ) {
    return "recommended";
  }

  return "optional";
}

function buildCandidateReason(candidate: ResumeImportFieldCandidate): string {
  switch (candidate.target.section) {
    case "identity":
    case "contact":
    case "location":
      return "Imported profile details need confirmation before discovery, resumes, and applications rely on them everywhere.";
    case "experience":
      return "Work-history records stay review-first so resume tailoring and fit scoring do not assume the wrong role details.";
    case "education":
      return "Education records stay review-first until the imported school and degree details are confirmed.";
    case "search_preferences":
      return "Targeting details need review so discovery avoids generic or mismatched searches.";
    case "narrative":
    case "proof_point":
      return "Narrative suggestions should be reviewed before they shape resume summaries or proof selection.";
    case "answer_bank":
      return "Reusable screener answers should be confirmed before apply flows reuse them.";
    case "application_identity":
      return "Application identity defaults should be confirmed before forms reuse them automatically.";
    default:
      return "This imported suggestion should be reviewed before setup is complete.";
  }
}

export function shouldIncludeCandidateInSetupReview(
  candidate: ResumeImportFieldCandidate,
): boolean {
  switch (candidate.target.section) {
    case "identity":
      return ["fullName", "headline", "summary", "yearsExperience"].includes(
        candidate.target.key,
      );
    case "contact":
      return ["email", "phone", "linkedinUrl", "portfolioUrl"].includes(
        candidate.target.key,
      );
    case "location":
      return candidate.target.key === "currentLocation";
    case "search_preferences":
      return ["targetRoles", "locations"].includes(candidate.target.key);
    case "experience":
    case "education":
    case "certification":
    case "project":
    case "link":
    case "language":
    case "narrative":
    case "proof_point":
    case "answer_bank":
    case "application_identity":
      return true;
    default:
      return false;
  }
}

export function toReviewDraft(
  candidate: ResumeImportFieldCandidate,
  documentBundle: ResumeDocumentBundle | null,
): DerivedReviewDraft | null {
  const step = mapCandidateToStep(candidate);
  const domain = mapTargetDomain(candidate);

  if (!step || !domain) {
    return null;
  }

  return {
    step,
    target: {
      domain,
      key: candidate.target.key,
      recordId: candidate.target.recordId,
    },
    label: candidate.label,
    reason: buildCandidateReason(candidate),
    severity: mapCandidateToSeverity(candidate),
    proposedValue: summarizeValue(candidate.value),
    sourceSnippet: getSourceSnippet(candidate, documentBundle),
    sourceCandidateId: candidate.id,
    sourceRunId: candidate.runId,
  };
}
