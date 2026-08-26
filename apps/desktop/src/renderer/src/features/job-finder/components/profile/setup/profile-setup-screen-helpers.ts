import type { DiscoveryTargetEditorValue } from "../../../lib/job-finder-types";
import {
  evaluateProfileSetupReadiness,
  findStarterJobSourceByStartingUrl,
  hasProfileSetupPlaceholderValue,
  isFreshStartCandidateProfile,
  type CandidateProfile,
  type JobSearchPreferences,
  type ProfileCopilotContext,
  type ProfileSetupReadiness,
  type ProfileSetupState,
  type ProfileSetupStep,
} from "@unemployed/contracts";
import { profileSetupStepDefinitions } from "./profile-setup-steps";

/** Keep setup source editing bounded while leaving the complete catalog searchable. */
export const PROFILE_SETUP_SOURCE_PAGE_SIZE = 25;

/** Stable id of the single canonical setup validation alert element. */
export const PROFILE_SETUP_VALIDATION_ALERT_ID =
  "profile-setup-validation-alert";

export function filterProfileSetupSources(
  targets: readonly DiscoveryTargetEditorValue[],
  query: string,
): Array<{ index: number; target: DiscoveryTargetEditorValue }> {
  const normalizedQuery = query.trim().toLocaleLowerCase();

  return targets.flatMap((target, index) => {
    const matchesQuery =
      normalizedQuery.length === 0 ||
      target.label.toLocaleLowerCase().includes(normalizedQuery) ||
      target.startingUrl.toLocaleLowerCase().includes(normalizedQuery);

    return matchesQuery ? [{ index, target }] : [];
  });
}

export function isValidProfileSetupSourceUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function getProfileSetupSourceHost(startingUrl: string): string {
  try {
    return new URL(startingUrl.trim()).hostname.replace(/^www\./, "");
  } catch {
    return startingUrl.trim() || "URL not set";
  }
}

/** Hedged sign-in/public access expectation for known starter sources. */
export function getProfileSetupStarterAccessNote(
  startingUrl: string,
): string | null {
  return findStarterJobSourceByStartingUrl(startingUrl)?.accessNote ?? null;
}

export type ProfileSetupSourceGuidance = {
  detail: string | null;
  label: string;
};

/**
 * Predicted access/method copy derived only from data already saved on the
 * target. Setup performs no live checks and never promises one.
 */
export function getProfileSetupSourceGuidance(
  target: Pick<DiscoveryTargetEditorValue, "instructionStatus">,
): ProfileSetupSourceGuidance {
  switch (target.instructionStatus) {
    case "validated":
      return {
        label: "Guidance ready",
        detail: "Can run with guidance saved from an earlier check.",
      };
    case "draft":
      return {
        label: "Draft guidance",
        detail: "A recent check saved draft guidance for this source.",
      };
    case "stale":
      return {
        label: "Guidance needs review",
        detail: "The saved guidance no longer matches this page.",
      };
    case "unsupported":
      return {
        label: "Unsupported for checks",
        detail: "Automated checks could not read this site reliably yet.",
      };
    default:
      return {
        label: "No guidance yet",
        detail: "The first check learns how to read this source.",
      };
  }
}

export type ProfileSetupReviewItem = ProfileSetupState["reviewItems"][number];
export type ProfileSetupReviewItemDisplay = ProfileSetupReviewItem & {
  savedStatus: ProfileSetupReviewItem["status"];
  statusSource: "saved" | "draft";
};
export function isBlockingPendingReviewItem(
  item: Pick<ProfileSetupReviewItem, "severity" | "status">,
): boolean {
  return item.status === "pending" && item.severity !== "optional";
}

export function isOptionalPendingReviewItem(
  item: Pick<ProfileSetupReviewItem, "severity" | "status">,
): boolean {
  return item.status === "pending" && item.severity === "optional";
}

function hasMeaningfulText(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getPreferredApplicationLinkUrls(profile: CandidateProfile): string[] {
  return Array.from(
    new Set(
      profile.applicationIdentity.preferredLinkIds.flatMap((linkId) => {
        const url = profile.links.find((entry) => entry.id === linkId)?.url;
        return typeof url === "string" && url.trim().length > 0 ? [url] : [];
      }),
    ),
  );
}

function getCurrentTargetValue(
  profile: CandidateProfile,
  searchPreferences: JobSearchPreferences,
  target: ProfileSetupReviewItem["target"],
): unknown {
  switch (target.domain) {
    case "identity": {
      if (target.key === "contactPath") {
        return [profile.email ?? "", profile.phone ?? ""].filter((value) =>
          hasMeaningfulText(value),
        );
      }

      return (profile as Record<string, unknown>)[target.key] ?? null;
    }
    case "application_identity":
      if (target.key === "preferredLinkUrls") {
        return getPreferredApplicationLinkUrls(profile);
      }

      return (
        (profile.applicationIdentity as Record<string, unknown>)[target.key] ??
        null
      );
    case "work_eligibility":
      return (
        (profile.workEligibility as Record<string, unknown>)[target.key] ?? null
      );
    case "professional_summary":
      return (
        (profile.professionalSummary as Record<string, unknown>)[target.key] ??
        null
      );
    case "search_preferences":
      return (searchPreferences as Record<string, unknown>)[target.key] ?? null;
    case "narrative":
      return (profile.narrative as Record<string, unknown>)[target.key] ?? null;
    case "answer_bank":
      return (
        (profile.answerBank as Record<string, unknown>)[target.key] ?? null
      );
    case "experience": {
      const record = target.recordId
        ? (profile.experiences.find((entry) => entry.id === target.recordId) ??
          null)
        : profile.experiences;

      return target.key === "record" || !isObjectRecord(record)
        ? record
        : ((record as Record<string, unknown>)[target.key] ?? null);
    }
    case "education": {
      const record = target.recordId
        ? (profile.education.find((entry) => entry.id === target.recordId) ??
          null)
        : profile.education;

      return target.key === "record" || !isObjectRecord(record)
        ? record
        : ((record as Record<string, unknown>)[target.key] ?? null);
    }
    case "certification": {
      const record = target.recordId
        ? (profile.certifications.find(
            (entry) => entry.id === target.recordId,
          ) ?? null)
        : profile.certifications;

      return target.key === "record" || !isObjectRecord(record)
        ? record
        : ((record as Record<string, unknown>)[target.key] ?? null);
    }
    case "project": {
      const record = target.recordId
        ? (profile.projects.find((entry) => entry.id === target.recordId) ??
          null)
        : profile.projects;

      return target.key === "record" || !isObjectRecord(record)
        ? record
        : ((record as Record<string, unknown>)[target.key] ?? null);
    }
    case "link": {
      const record = target.recordId
        ? (profile.links.find((entry) => entry.id === target.recordId) ?? null)
        : profile.links;

      return target.key === "record" || !isObjectRecord(record)
        ? record
        : ((record as Record<string, unknown>)[target.key] ?? null);
    }
    case "language": {
      const record = target.recordId
        ? (profile.spokenLanguages.find(
            (entry) => entry.id === target.recordId,
          ) ?? null)
        : profile.spokenLanguages;

      return target.key === "record" || !isObjectRecord(record)
        ? record
        : ((record as Record<string, unknown>)[target.key] ?? null);
    }
    case "proof_point": {
      const record = target.recordId
        ? (profile.proofBank.find((entry) => entry.id === target.recordId) ??
          null)
        : profile.proofBank;

      return target.key === "record" || !isObjectRecord(record)
        ? record
        : ((record as Record<string, unknown>)[target.key] ?? null);
    }
  }
}

function hasCurrentTargetValue(
  profile: CandidateProfile,
  searchPreferences: JobSearchPreferences,
  target: ProfileSetupReviewItem["target"],
): boolean {
  const value = getCurrentTargetValue(profile, searchPreferences, target);

  if (typeof value === "string") {
    return hasMeaningfulText(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return true;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (isObjectRecord(value)) {
    return Object.values(value).some((entry) => {
      if (typeof entry === "string") {
        return hasMeaningfulText(entry);
      }

      if (typeof entry === "number" || typeof entry === "boolean") {
        return true;
      }

      return Array.isArray(entry) ? entry.length > 0 : false;
    });
  }

  return false;
}

function humanizeRecordFieldKey(key: string): string {
  switch (key) {
    case "schoolName":
      return "School name";
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
    case "interviewPreference":
      return "Interview preference";
    case "workMode":
      return "Work mode";
    case "dateEarned":
      return "Date earned";
    default:
      return (
        key.charAt(0).toUpperCase() +
        key
          .slice(1)
          .replace(/([A-Z])/g, " $1")
          .trim()
      );
  }
}

function humanizePrimitive(value: boolean | number): string {
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  return String(value);
}

function summarizeValue(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return humanizePrimitive(value);
  }

  if (Array.isArray(value)) {
    const parts = value.flatMap((entry) => summarizeValue(entry) ?? []);
    return parts.length > 0 ? parts.join(", ") : null;
  }

  if (isObjectRecord(value)) {
    const parts = Object.entries(value).flatMap(([key, entry]) => {
      if (key === "id" || key === "recordId" || key.endsWith("Id")) {
        return [];
      }

      const summary = summarizeValue(entry);
      return summary ? [`${humanizeRecordFieldKey(key)}: ${summary}`] : [];
    });

    return parts.length > 0 ? parts.join(" · ") : null;
  }

  return null;
}

/** Formats imported structured values for people instead of exposing serialized storage objects. */
export function formatProfileSetupReviewValue(value: unknown): string | null {
  if (typeof value !== "string") {
    return summarizeValue(value);
  }

  const trimmed = value.trim();
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) {
    return summarizeValue(value);
  }

  try {
    return summarizeValue(JSON.parse(trimmed)) ?? summarizeValue(value);
  } catch {
    return summarizeValue(value);
  }
}

function normalizeComparableSummary(value: string | null): string | null {
  return value ? value.trim().replace(/\s+/g, " ").toLowerCase() : null;
}

export function buildDraftAwareSetupReviewItems(input: {
  currentProfile: CandidateProfile;
  currentSearchPreferences: JobSearchPreferences;
  draftProfile: CandidateProfile;
  draftSearchPreferences: JobSearchPreferences;
  reviewItems: readonly ProfileSetupReviewItem[];
}): ProfileSetupReviewItemDisplay[] {
  return input.reviewItems.map((item) => {
    if (item.status !== "pending") {
      return {
        ...item,
        savedStatus: item.status,
        statusSource: "saved",
      };
    }

    const previousValue = getCurrentTargetValue(
      input.currentProfile,
      input.currentSearchPreferences,
      item.target,
    );
    const draftValue = getCurrentTargetValue(
      input.draftProfile,
      input.draftSearchPreferences,
      item.target,
    );

    if (
      !hasCurrentTargetValue(
        input.draftProfile,
        input.draftSearchPreferences,
        item.target,
      )
    ) {
      return {
        ...item,
        savedStatus: item.status,
        statusSource: "saved",
      };
    }

    const previousSummary = normalizeComparableSummary(
      summarizeValue(previousValue),
    );
    const draftSummary = normalizeComparableSummary(summarizeValue(draftValue));

    if (!draftSummary || previousSummary === draftSummary) {
      return {
        ...item,
        savedStatus: item.status,
        statusSource: "saved",
      };
    }

    const proposedSummary = normalizeComparableSummary(
      item.proposedValue ?? null,
    );

    return {
      ...item,
      savedStatus: item.status,
      status:
        proposedSummary && proposedSummary === draftSummary
          ? "confirmed"
          : "edited",
      statusSource: "draft",
    };
  });
}

export function formatReviewStatus(
  status: ProfileSetupReviewItem["status"],
): string {
  return status.replace("_", " ");
}

export function formatReviewSeverity(
  severity: ProfileSetupReviewItem["severity"],
): string {
  return severity === "critical"
    ? "Critical"
    : severity === "recommended"
      ? "Recommended"
      : "Optional";
}

export function badgeVariantForSeverity(
  severity: ProfileSetupReviewItem["severity"],
): "destructive" | "status" | "outline" {
  if (severity === "critical") {
    return "destructive";
  }

  return severity === "recommended" ? "status" : "outline";
}

export function canConfirmReviewItem(item: ProfileSetupReviewItem): boolean {
  return item.sourceCandidateId !== null && item.status === "pending";
}

export function canClearReviewItem(item: ProfileSetupReviewItem): boolean {
  return !(
    item.target.domain === "identity" && item.target.key === "yearsExperience"
  );
}

export function getReviewItemEditHint(
  item: ProfileSetupReviewItem,
): string | null {
  if (item.target.domain === "experience") {
    return "Edit this in Work history on the left. Use the role's Work mode field to mark it Remote, Hybrid, or Onsite. Keep Location for the city or region you want shown, and use Targeting later if you also want future job searches to prefer remote roles.";
  }

  if (
    item.target.domain === "search_preferences" ||
    item.target.domain === "work_eligibility"
  ) {
    return "Edit this in the Targeting step. Preferred work modes controls Remote, Hybrid, or Onsite for future job searches, while Preferred locations narrows where you want those roles to be based.";
  }

  if (
    item.target.domain === "identity" &&
    item.target.key === "currentLocation"
  ) {
    return "Edit this in Essentials. Displayed location is the location shown on your profile and generated resumes, not your remote-job preference.";
  }

  return null;
}

export function buildSetupCopilotPlaceholder(step: ProfileSetupStep): string {
  switch (step) {
    case "essentials":
      return 'Example: update my headline to "Principal product designer focused on workflow systems"';
    case "targeting":
      return "Example: help me tighten my target roles for remote design systems work";
    case "narrative":
      return 'Example: rewrite my professional story: "..."';
    case "answers":
      return 'Example: draft a stronger short self-introduction: "..."';
    default:
      return "Ask for a grounded profile improvement or a structured edit for this setup step.";
  }
}

/**
 * Derives the setup summary cards from the shared canonical readiness rule so
 * the summary strip can never report "Ready to search" while the ready check
 * still reports blockers (for example, a missing work-mode preference).
 */
export function buildProfileSetupSummaryCards(input: {
  draftProfile: CandidateProfile;
  draftSearchPreferences: JobSearchPreferences;
  hasImportedResume: boolean;
  profileSetupStateStatus: ProfileSetupState["status"];
}): Array<{ label: string; value: string }> {
  const readiness = evaluateProfileSetupReadiness(
    input.draftProfile,
    input.draftSearchPreferences,
  );
  const notProvidedYet =
    !input.hasImportedResume && input.profileSetupStateStatus === "not_started";
  const discoveryBlockers = [
    !readiness.hasTargeting && ("Needs a target role" as const),
    !readiness.hasEligibilityPreferences &&
      ("Needs real work constraints" as const),
    readiness.hasEligibilityPreferences &&
      !readiness.hasWorkModePreference &&
      ("Needs a work mode" as const),
    !readiness.hasDiscoverySource && ("Needs a job source" as const),
  ].filter(
    (reason): reason is Exclude<typeof reason, false> => reason !== false,
  );

  return [
    {
      label: "Discovery",
      value: notProvidedYet
        ? "Not provided yet"
        : discoveryBlockers.length === 0
          ? "Ready to search"
          : discoveryBlockers[0]!,
    },
    {
      label: "Resume quality",
      value: notProvidedYet
        ? "Not analyzed yet"
        : input.draftProfile.experiences.length > 0
          ? "Structured background available"
          : "Needs stronger work history",
    },
    {
      label: "Apply readiness",
      value: notProvidedYet
        ? "Not provided yet"
        : readiness.hasContactPath
          ? "Contact path ready"
          : "Missing contact details",
    },
  ];
}

export function buildStepEditorContext(
  step: ProfileSetupStep,
): ProfileCopilotContext {
  return {
    surface: "setup",
    step,
  };
}

function formatRequirementList(values: readonly string[]): string {
  if (values.length <= 1) {
    return values[0] ?? "";
  }

  return `${values.slice(0, -1).join(", ")}, and ${
    values[values.length - 1] as string
  }`;
}

/**
 * One honest identity-blocker sentence for every surface that shows why the
 * essentials step still blocks setup. It names exactly what is missing — full
 * name, headline, location, contact, and years of experience only for
 * fresh-start profiles — instead of hiding behind a generic "identity" label
 * or listing requirements that are already satisfied.
 */
export function buildProfileSetupIdentityBlockerReason(
  profile: CandidateProfile,
): string {
  const missingRequirements: string[] = [];

  if (
    !hasMeaningfulText(profile.fullName) ||
    hasProfileSetupPlaceholderValue("fullName", profile.fullName)
  ) {
    missingRequirements.push("your full name");
  }

  // Same canonical placeholder-aware rule readiness uses: a missing or
  // first-run placeholder headline still blocks core identity.
  if (
    !hasMeaningfulText(profile.headline) ||
    hasProfileSetupPlaceholderValue("headline", profile.headline)
  ) {
    missingRequirements.push("a headline");
  }

  if (
    !hasMeaningfulText(profile.currentLocation) ||
    hasProfileSetupPlaceholderValue("currentLocation", profile.currentLocation)
  ) {
    missingRequirements.push("your location");
  }

  if (!hasMeaningfulText(profile.email) && !hasMeaningfulText(profile.phone)) {
    missingRequirements.push("at least one contact method");
  }

  if (isFreshStartCandidateProfile(profile) && profile.yearsExperience <= 0) {
    missingRequirements.push("your years of experience");
  }

  if (missingRequirements.length === 0) {
    return "Add a real identity, location, and at least one contact method.";
  }

  return `Add ${formatRequirementList(missingRequirements)} before discovery and applications rely on your identity.`;
}

/**
 * Narrow slice of the canonical setup readiness evaluation that the setup
 * path rows use as per-step completion evidence. The full
 * `evaluateProfileSetupReadiness` output satisfies it structurally, so
 * callers can pass that result without reshaping anything.
 */
export type ProfileSetupPathStepReadiness = Pick<
  ProfileSetupReadiness,
  | "hasAnswerBank"
  | "hasContactPath"
  | "hasCoreIdentity"
  | "hasDiscoverySource"
  | "hasEligibilityPreferences"
  | "hasMeaningfulBackground"
  | "hasNarrative"
  | "hasWorkModePreference"
>;

/**
 * Per-step domain evidence for the setup path rows, mapped to the same
 * canonical signals the ready check and derived setup state already use.
 * Import keeps its dedicated imported-asset guard and the ready check row is
 * complete only when setup itself finished.
 */
function hasProfileSetupPathStepEvidence(input: {
  hasImportedResume: boolean;
  readiness: ProfileSetupPathStepReadiness | null;
  setupCompleted: boolean;
  stepId: ProfileSetupStep;
}): boolean {
  if (input.stepId === "import") {
    return input.hasImportedResume;
  }

  if (input.stepId === "ready_check") {
    return input.setupCompleted;
  }

  // Callers without draft evidence keep the legacy chronology-only rule
  // instead of guessing at domain completeness.
  if (input.readiness === null) {
    return true;
  }

  switch (input.stepId) {
    case "essentials":
      return input.readiness.hasCoreIdentity && input.readiness.hasContactPath;
    case "background":
      return input.readiness.hasMeaningfulBackground;
    case "targeting":
      return (
        input.readiness.hasEligibilityPreferences &&
        input.readiness.hasWorkModePreference &&
        input.readiness.hasDiscoverySource
      );
    // Narrative and answers stay optional by product semantics: real content
    // earns a Complete claim, while an empty optional step simply earns no
    // claim instead of becoming a new obligation.
    case "narrative":
      return input.readiness.hasNarrative;
    case "answers":
      return input.readiness.hasAnswerBank;
  }
}

/**
 * Shared completion rule for the setup path rows so no row can present
 * chronology alone as completion. Reaching a step (or finishing setup) only
 * makes it eligible; each row must additionally prove its own domain content
 * through the shared canonical readiness evaluation, so blitz-clicking
 * through untouched steps can never mint false Complete badges. Blocking
 * review items always hold their row open regardless of evidence.
 */
export function isProfileSetupPathStepComplete(input: {
  currentStep: ProfileSetupStep;
  hasImportedResume: boolean;
  pendingBlockingReviewCount: number;
  readiness: ProfileSetupPathStepReadiness | null;
  setupStatus: ProfileSetupState["status"];
  stepId: ProfileSetupStep;
}): boolean {
  if (input.pendingBlockingReviewCount > 0) {
    return false;
  }

  const setupCompleted = input.setupStatus === "completed";
  const chronologicallyReached =
    setupCompleted ||
    profileSetupStepDefinitions.findIndex(
      (entry) => entry.id === input.currentStep,
    ) >
      profileSetupStepDefinitions.findIndex(
        (entry) => entry.id === input.stepId,
      );

  return (
    chronologicallyReached &&
    hasProfileSetupPathStepEvidence({
      hasImportedResume: input.hasImportedResume,
      readiness: input.readiness,
      setupCompleted,
      stepId: input.stepId,
    })
  );
}
