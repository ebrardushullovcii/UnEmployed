import {
  PROFILE_SETUP_PLACEHOLDER_HEADLINE,
  PROFILE_SETUP_PLACEHOLDER_SUMMARY,
  type AssetStatus,
  type CandidateProfile,
  type ResumeExtractionStatus,
  type ResumeImportFieldCandidateSummary,
  type ResumeImportProgressEvent,
  type ResumeImportRun,
  type ResumeTimelineRepairAction,
} from "@unemployed/contracts";
import { Sparkles, Upload } from "lucide-react";
import { Button } from "@renderer/components/ui/button";
import {
  formatDateOnly,
  formatResumeAnalysisSummary,
  formatStatusLabel,
  getAssetTone,
} from "@renderer/features/job-finder/lib/job-finder-utils";
import { getVisibleYearsExperience } from "@renderer/features/job-finder/lib/profile-resume-panel-utils";
import { PreferenceList } from "../preference-list";
import { StatusBadge } from "../status-badge";
import { ProfileImportSuggestionList } from "./profile-import-suggestion-list";
import { ProfileTimelineRepairList } from "./profile-timeline-repair-list";
import { ResumeImportProgress } from "./resume-import-progress";

const PROFILE_PLACEHOLDER_HEADLINE = PROFILE_SETUP_PLACEHOLDER_HEADLINE;
const PROFILE_PLACEHOLDER_SUMMARY = PROFILE_SETUP_PLACEHOLDER_SUMMARY;
const RESUME_PLACEHOLDER_FILE_NAME = "No resume imported yet";

function isPlaceholderValue(
  value: string | null | undefined,
  placeholder: string,
) {
  return value?.trim().toLowerCase() === placeholder.toLowerCase();
}

function getImportedIdentityStatus(input: {
  headline: string;
  latestResumeImportReviewCandidates: readonly ResumeImportFieldCandidateSummary[];
  summary: string;
}) {
  const reviewKeys = new Set(
    input.latestResumeImportReviewCandidates
      .filter((candidate) => candidate.target.section === "identity")
      .map((candidate) => candidate.target.key),
  );

  const headlinePending =
    isPlaceholderValue(input.headline, PROFILE_PLACEHOLDER_HEADLINE) ||
    reviewKeys.has("headline");
  const summaryPending =
    isPlaceholderValue(input.summary, PROFILE_PLACEHOLDER_SUMMARY) ||
    reviewKeys.has("summary");

  if (headlinePending && summaryPending) {
    return {
      headline: "Imported identity still needs review",
      headlinePending,
      description:
        "Headline and summary still need a quick confirmation before this imported profile reads as complete.",
    };
  }

  if (headlinePending) {
    return {
      headline: "Imported headline still needs review",
      headlinePending,
      description:
        "Confirm or edit the imported headline so your profile and tailored resumes describe your target clearly.",
    };
  }

  if (summaryPending) {
    return {
      headline: "Imported summary still needs review",
      headlinePending,
      description:
        "Confirm or tighten the imported summary so this profile is ready to reuse across discovery and resumes.",
    };
  }

  return null;
}

interface ProfileResumePanelProps {
  importDisabledReason?: string | null;
  isProfileReady?: boolean;
  isAnalyzeProfilePending: boolean;
  isImportResumePending: boolean;
  latestResumeImportReviewCandidates: readonly ResumeImportFieldCandidateSummary[];
  resumeImportProgress: ResumeImportProgressEvent | null;
  latestResumeImportRun: ResumeImportRun | null;
  onAnalyzeProfileFromResume: () => void;
  onApplyTimelineRepairAction: (
    proposalId: string,
    action: ResumeTimelineRepairAction,
  ) => Promise<void>;
  onImportResume: () => void;
  onReviewImportSuggestion?: (
    candidate: ResumeImportFieldCandidateSummary,
  ) => void;
  profile: CandidateProfile;
}

const extractionStatusToAssetStatus: Record<
  ResumeExtractionStatus,
  AssetStatus
> = {
  ready: "ready",
  failed: "failed",
  needs_text: "queued",
  not_started: "not_started",
};

const extractionStatusToLabel: Record<ResumeExtractionStatus, string> = {
  ready: "Ready to review",
  failed: "Import failed",
  needs_text: "Needs better text",
  not_started: "Not imported",
};
function shouldHideAnalysisWarning(value: string): boolean {
  const normalized = value.trim().toLowerCase();

  return (
    normalized.includes("pdfplumber is unavailable") ||
    /^\d+ imported suggestions? still need review\b/.test(normalized) ||
    normalized.includes("pypdf is unavailable") ||
    normalized.includes(
      "python resume parser sidecar returned no usable parse",
    ) ||
    normalized.includes("python resume parser sidecar fallback:") ||
    normalized.includes(
      "fell back to the deterministic staged resume importer after the model call failed",
    ) ||
    normalized.includes("primary ai import stage failed:") ||
    normalized.includes(
      "fell back to the deterministic resume parser after the model call failed",
    ) ||
    normalized.includes("primary ai extraction failed:")
  );
}

function getFallbackResumeImportWarning(
  warnings: readonly string[],
): string | null {
  const normalizedWarnings = warnings.map((warning) =>
    warning.trim().toLowerCase(),
  );
  const usedFallback = normalizedWarnings.some(
    (warning) =>
      warning.includes("python resume parser sidecar fallback:") ||
      warning.includes(
        "python resume parser sidecar returned no usable parse",
      ) ||
      warning.includes(
        "fell back to the deterministic staged resume importer after the model call failed",
      ) ||
      warning.includes(
        "fell back to the deterministic resume parser after the model call failed",
      ) ||
      warning.includes("primary ai import stage failed:") ||
      warning.includes("primary ai extraction failed:"),
  );

  if (!usedFallback) {
    return null;
  }

  return "This import used a fallback parsing path, so review the imported details more closely before saving them.";
}

function getResumePanelCopy(input: {
  extractionStatus: ResumeExtractionStatus;
  hasImportedResume: boolean;
  isProfileReady: boolean;
  pendingReviewCount: number;
  resumeTextReadyToAnalyze: boolean;
}): { headline: string; description: string } {
  const {
    extractionStatus,
    hasImportedResume,
    isProfileReady,
    pendingReviewCount,
    resumeTextReadyToAnalyze,
  } = input;

  if (resumeTextReadyToAnalyze && pendingReviewCount > 0) {
    if (isProfileReady) {
      return {
        headline: "Resume ready — optional suggestions available",
        description: `${pendingReviewCount} optional imported suggestion${pendingReviewCount === 1 ? " is" : "s are"} saved for later review. ${pendingReviewCount === 1 ? "It does" : "They do"} not block job search or safe application preparation.`,
      };
    }

    return {
      headline: "Review imported suggestions",
      description: `${pendingReviewCount} imported suggestion${pendingReviewCount === 1 ? "" : "s"} still need${pendingReviewCount === 1 ? "s" : ""} your decision before this resume is ready to reuse everywhere.`,
    };
  }

  if (resumeTextReadyToAnalyze) {
    return {
      headline: "Your resume is ready to reuse",
      description:
        "Refresh profile suggestions after you update the file, then review the changes below.",
    };
  }

  if (hasImportedResume) {
    return extractionStatus === "failed"
      ? {
          headline:
            "This resume needs another import before it can help your profile",
          description:
            "The last import did not produce usable text. Replace the file, then refresh your profile suggestions once the text is ready.",
        }
      : {
          headline:
            "This resume needs cleaner text before it can help your profile",
          description:
            "This file was imported, but Job Finder still needs cleaner text before it can refresh your profile suggestions.",
        };
  }

  return {
    headline: "Import your resume to fill in your profile faster",
    description:
      "Job Finder suggests profile details from the imported text. You choose what to keep.",
  };
}

export function ProfileResumePanel({
  importDisabledReason,
  isProfileReady = false,
  isAnalyzeProfilePending,
  isImportResumePending,
  latestResumeImportReviewCandidates,
  resumeImportProgress,
  latestResumeImportRun,
  onAnalyzeProfileFromResume,
  onApplyTimelineRepairAction,
  onImportResume,
  onReviewImportSuggestion,
  profile,
}: ProfileResumePanelProps) {
  const resumeAnalysisSummary = formatResumeAnalysisSummary(profile);
  const resumeTextReadyToAnalyze = Boolean(
    profile.baseResume.textContent?.trim(),
  );
  const rawFileName = profile.baseResume.fileName.trim();
  const hasImportedResume =
    rawFileName.length > 0 &&
    rawFileName.toLowerCase() !== RESUME_PLACEHOLDER_FILE_NAME.toLowerCase();
  const resumeFileName = hasImportedResume
    ? rawFileName
    : RESUME_PLACEHOLDER_FILE_NAME;
  const originalFileNeedsReimport =
    hasImportedResume &&
    (!profile.baseResume.storagePath?.trim() || !profile.baseResume.sha256);
  const { headline: panelHeadline, description: panelDescription } =
    getResumePanelCopy({
      extractionStatus: profile.baseResume.extractionStatus,
      hasImportedResume,
      isProfileReady,
      pendingReviewCount: latestResumeImportReviewCandidates.length,
      resumeTextReadyToAnalyze,
    });
  const uploadedLabel =
    hasImportedResume && profile.baseResume.uploadedAt
      ? `Imported ${formatDateOnly(profile.baseResume.uploadedAt)}`
      : "Import your resume to fill in this profile faster.";
  const extractionStatusLabel = (() => {
    if (latestResumeImportReviewCandidates.length > 0) {
      return isProfileReady ? "Ready" : "Needs review";
    }

    if (!hasImportedResume) {
      return "Not imported";
    }

    if (latestResumeImportRun) {
      return latestResumeImportRun.status === "applied"
        ? "Imported into profile"
        : latestResumeImportRun.status === "review_ready"
          ? "Needs review"
          : formatStatusLabel(latestResumeImportRun.status);
    }

    const label = extractionStatusToLabel[profile.baseResume.extractionStatus];

    if (label) {
      return label;
    }

    console.warn(
      `Unexpected resume extraction status: ${profile.baseResume.extractionStatus}`,
    );
    return "Not imported";
  })();
  const displayName =
    profile.preferredDisplayName?.trim() ||
    profile.fullName?.trim() ||
    "Name not set yet";
  const importedIdentityStatus = hasImportedResume
    ? getImportedIdentityStatus({
        headline: profile.headline ?? "",
        latestResumeImportReviewCandidates,
        summary: profile.summary ?? "",
      })
    : null;
  const headline =
    !hasImportedResume &&
    isPlaceholderValue(profile.headline, PROFILE_PLACEHOLDER_HEADLINE)
      ? "Headline not set yet"
      : importedIdentityStatus?.headline &&
          importedIdentityStatus?.headlinePending &&
          isPlaceholderValue(profile.headline, PROFILE_PLACEHOLDER_HEADLINE)
        ? importedIdentityStatus.headline
        : profile.headline?.trim() || "Headline not set yet";
  const location = profile.currentLocation?.trim() || "Location not set yet";
  const visibleYearsExperience = getVisibleYearsExperience({
    profileYearsExperience: profile.yearsExperience,
    reviewCandidates: latestResumeImportReviewCandidates,
  });
  const experienceLabel =
    visibleYearsExperience === 1 ? "1 year" : `${visibleYearsExperience} years`;
  const latestRunSummary = latestResumeImportRun
    ? latestResumeImportRun.status === "review_ready"
      ? `${latestResumeImportRun.candidateCounts.autoApplied} imported automatically, ${latestResumeImportRun.candidateCounts.needsReview} waiting for review.`
      : latestResumeImportRun.status === "applied"
        ? `${latestResumeImportRun.candidateCounts.autoApplied} imported automatically; the resume is ready to use.`
        : latestResumeImportRun.status === "failed"
          ? "The latest resume import failed. Replace the file or refresh the import before relying on these details."
          : latestResumeImportRun.status === "queued" ||
              latestResumeImportRun.status === "parsing" ||
              latestResumeImportRun.status === "extracting" ||
              latestResumeImportRun.status === "reconciling"
            ? "The latest resume import is still in progress."
            : null
    : null;
  const pendingReviewLabels = new Set(
    latestResumeImportReviewCandidates.map((candidate) =>
      candidate.label.trim().toLowerCase(),
    ),
  );
  const visibleAnalysisWarnings = profile.baseResume.analysisWarnings.filter(
    (warning) =>
      !shouldHideAnalysisWarning(warning) &&
      !pendingReviewLabels.has(warning.trim().toLowerCase()),
  );
  const fallbackResumeImportWarning = getFallbackResumeImportWarning(
    profile.baseResume.analysisWarnings,
  );
  const resumeStatusTone =
    latestResumeImportReviewCandidates.length > 0 && !isProfileReady
      ? "queued"
      : hasImportedResume
        ? extractionStatusToAssetStatus[profile.baseResume.extractionStatus]
        : "not_started";

  return (
    <section className="relative overflow-hidden border-y border-(--surface-panel-border) bg-transparent py-4 sm:py-5">
      <div className="grid gap-5 xl:items-start xl:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)]">
        <div className="grid gap-5">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
            <div className="grid gap-2">
              <p className="text-(length:--text-eyebrow) font-medium uppercase tracking-(--tracking-mono) text-foreground-muted">
                Resume
              </p>
              <div className="grid gap-2">
                <h2 className="text-[1.35rem] font-semibold tracking-[-0.03em] text-(--text-headline)">
                  {panelHeadline}
                </h2>
                <p className="max-w-[62ch] text-(length:--text-description) leading-6 text-foreground-muted">
                  {panelDescription}
                </p>
              </div>
            </div>

            <StatusBadge tone={getAssetTone(resumeStatusTone)}>
              {extractionStatusLabel}
            </StatusBadge>
          </div>

          <article className="grid gap-4 rounded-(--radius-panel) border border-(--surface-panel-border-warm) bg-(--surface-overlay-heavy) p-4">
            <div className="grid gap-1.5">
              <strong className="text-[1.22rem] font-semibold text-(--text-headline)">
                {resumeFileName}
              </strong>
              <span className="text-(length:--text-body) text-foreground-soft">
                {uploadedLabel}
              </span>
              {resumeAnalysisSummary ? (
                <span className="text-(length:--text-description) leading-6 text-foreground-muted">
                  {resumeAnalysisSummary}
                </span>
              ) : latestRunSummary ? (
                <span className="text-(length:--text-description) leading-6 text-foreground-muted">
                  {latestRunSummary}
                </span>
              ) : (
                <span className="text-(length:--text-description) leading-6 text-foreground-muted">
                  {hasImportedResume
                    ? "Refresh your profile suggestions any time you want to pull in changes from the saved resume text."
                    : "Import a resume for faster suggestions, or continue entering profile details manually."}
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-2.5">
              <Button
                className="h-11 px-4"
                disabled={Boolean(importDisabledReason)}
                pending={isImportResumePending}
                onClick={onImportResume}
                type="button"
                variant="secondary"
              >
                <Upload className="size-4" />
                {hasImportedResume ? "Replace resume" : "Import resume"}
              </Button>
              <Button
                className="h-11 px-4"
                disabled={
                  isAnalyzeProfilePending ||
                  !resumeTextReadyToAnalyze ||
                  Boolean(importDisabledReason)
                }
                pending={isAnalyzeProfilePending}
                onClick={onAnalyzeProfileFromResume}
                type="button"
                variant="primary"
              >
                <Sparkles className="size-4" />
                Refresh from resume
              </Button>
            </div>
            <ResumeImportProgress
              isPending={isImportResumePending}
              progress={resumeImportProgress}
            />
            {importDisabledReason ? (
              <p className="text-sm leading-6 text-foreground-soft">
                {importDisabledReason}
              </p>
            ) : null}
            {originalFileNeedsReimport ? (
              <div
                className="rounded-(--radius-field) border border-(--warning-border) bg-(--warning-surface) px-4 py-3 text-sm leading-6 text-(--warning-text)"
                role="alert"
              >
                The saved original resume cannot be verified for applications.
                Replace it to create a new private copy; your extracted profile
                details will stay available until the new import finishes.
              </div>
            ) : null}
          </article>

          {visibleAnalysisWarnings.length > 0 ||
          fallbackResumeImportWarning ||
          latestResumeImportReviewCandidates.length > 0 ||
          (latestResumeImportRun?.timelineRepairProposals?.length ?? 0) > 0 ? (
            <article className="grid gap-3 rounded-(--radius-panel) border border-(--surface-panel-border-warm) bg-(--surface-overlay-strong) p-4">
              <p className="text-(length:--text-eyebrow) font-medium uppercase tracking-(--tracking-mono) text-foreground-muted">
                {isProfileReady ? "Optional review" : "Review before saving"}
              </p>
              {fallbackResumeImportWarning ? (
                <PreferenceList
                  label="Import quality note"
                  values={[fallbackResumeImportWarning]}
                />
              ) : null}
              {visibleAnalysisWarnings.length > 0 ? (
                <PreferenceList
                  label="Import notes"
                  values={visibleAnalysisWarnings}
                />
              ) : null}
              {importedIdentityStatus ? (
                <PreferenceList
                  label="What to confirm next"
                  values={[importedIdentityStatus.description]}
                />
              ) : null}
              {(latestResumeImportRun?.timelineRepairProposals?.length ?? 0) >
              0 ? (
                <ProfileTimelineRepairList
                  onAction={onApplyTimelineRepairAction}
                  proposals={
                    latestResumeImportRun?.timelineRepairProposals ?? []
                  }
                />
              ) : null}
              {latestResumeImportReviewCandidates.length > 0 ? (
                <div className="grid gap-3">
                  <p className="text-sm font-medium text-foreground">
                    {isProfileReady
                      ? "Optional imported suggestions"
                      : "Imported suggestions waiting for confirmation"}
                  </p>
                  <ProfileImportSuggestionList
                    candidates={latestResumeImportReviewCandidates}
                    {...(onReviewImportSuggestion
                      ? { onReviewCandidate: onReviewImportSuggestion }
                      : {})}
                  />
                </div>
              ) : null}
            </article>
          ) : null}
        </div>

        <aside className="grid gap-3 self-start rounded-(--radius-panel) border border-(--surface-panel-border) bg-(--surface-overlay-strong) p-4">
          <div className="grid gap-1">
            <p className="text-(length:--text-eyebrow) font-medium uppercase tracking-(--tracking-mono) text-foreground-muted">
              {hasImportedResume ? "Imported details" : "Profile details"}
            </p>
            <p className="text-(length:--text-description) leading-6 text-foreground-muted">
              {hasImportedResume
                ? "These details came from your resume. Use the tabs to confirm them and fix anything that needs a closer look."
                : "These are the details currently saved in your profile. Use the tabs to add or update them."}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <div className="rounded-(--radius-field) border border-(--surface-well-border) bg-(--surface-well) p-4">
              <span className="text-(length:--text-eyebrow) font-medium uppercase tracking-(--tracking-mono) text-foreground-muted">
                Name
              </span>
              <strong className="mt-2 block text-[1rem] text-(--text-headline)">
                {displayName}
              </strong>
            </div>
            <div className="rounded-(--radius-field) border border-(--surface-well-border) bg-(--surface-well) p-4">
              <span className="text-(length:--text-eyebrow) font-medium uppercase tracking-(--tracking-mono) text-foreground-muted">
                Headline
              </span>
              <strong className="mt-2 block text-[1rem] text-(--text-headline)">
                {headline}
              </strong>
            </div>
            <div className="rounded-(--radius-field) border border-(--surface-well-border) bg-(--surface-well) p-4">
              <span className="text-(length:--text-eyebrow) font-medium uppercase tracking-(--tracking-mono) text-foreground-muted">
                Location
              </span>
              <strong className="mt-2 block text-[1rem] text-(--text-headline)">
                {location}
              </strong>
            </div>
            <div className="rounded-(--radius-field) border border-(--surface-well-border) bg-(--surface-well) p-4">
              <span className="text-(length:--text-eyebrow) font-medium uppercase tracking-(--tracking-mono) text-foreground-muted">
                Experience
              </span>
              <strong className="mt-2 block text-[1rem] text-(--text-headline)">
                {experienceLabel}
              </strong>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
