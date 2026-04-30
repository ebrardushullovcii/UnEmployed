import {
  CandidateProfessionalSummarySchema,
  CandidateProfileSchema,
  CandidateWorkEligibilitySchema,
  JobSearchPreferencesSchema,
  ProfileSetupReviewActionSchema,
  ProfileSetupStateSchema,
  type CandidateProfile,
  type JobSearchPreferences,
  type ProfileSetupReviewAction,
  type ProfileSetupState,
} from "@unemployed/contracts";

import { deriveAndPersistProfileSetupState } from "./profile-workspace-state";
import { hasBlockingResumeImportCandidates } from "./resume-import-candidate-utils";
import { applyResolvedResumeImportCandidatesToWorkspace, countResumeImportCandidates } from "./resume-import-workflow";
import { hasResumeAffectingProfileChange } from "./resume-workspace-staleness";
import { normalizeSearchPreferences } from "./workspace-helpers";
import type { WorkspaceServiceContext } from "./workspace-service-context";

function isRequiredIdentityField(key: string): boolean {
  return ["firstName", "lastName", "fullName", "headline", "summary", "currentLocation"].includes(key);
}

function isNonClearableIdentityField(key: string): boolean {
  return key === "yearsExperience";
}

function getSafeRequiredIdentityFallback(
  key: string,
  profile: CandidateProfile,
): string | null {
  switch (key) {
    case "firstName":
      return profile.id === "candidate_fresh_start" ? "New" : profile.firstName;
    case "lastName":
      return profile.id === "candidate_fresh_start" ? "Candidate" : profile.lastName;
    case "fullName":
      return profile.id === "candidate_fresh_start" ? "New Candidate" : profile.fullName;
    case "headline":
      return "Import your resume to begin";
    case "summary":
      return "Import a resume or paste resume text to build your profile, targeting, and tailored documents.";
    case "currentLocation":
      return "Set your preferred location";
    default:
      return null;
  }
}

function getClearedStructuredFieldValue(currentValue: unknown): unknown {
  if (Array.isArray(currentValue)) {
    return [];
  }

  return null;
}

function clearProfileRecordValue(
  profile: CandidateProfile,
  domain: ProfileSetupState["reviewItems"][number]["target"]["domain"],
  recordId: string | null,
): CandidateProfile {
  if (!recordId) {
    return profile;
  }

  switch (domain) {
    case "experience":
      return CandidateProfileSchema.parse({
        ...profile,
        experiences: profile.experiences.filter((record) => record.id !== recordId),
      });
    case "education":
      return CandidateProfileSchema.parse({
        ...profile,
        education: profile.education.filter((record) => record.id !== recordId),
      });
    case "certification":
      return CandidateProfileSchema.parse({
        ...profile,
        certifications: profile.certifications.filter((record) => record.id !== recordId),
      });
    case "project":
      return CandidateProfileSchema.parse({
        ...profile,
        projects: profile.projects.filter((record) => record.id !== recordId),
      });
    case "link":
      return CandidateProfileSchema.parse({
        ...profile,
        links: profile.links.filter((record) => record.id !== recordId),
      });
    case "language":
      return CandidateProfileSchema.parse({
        ...profile,
        spokenLanguages: profile.spokenLanguages.filter((record) => record.id !== recordId),
      });
    case "proof_point":
      return CandidateProfileSchema.parse({
        ...profile,
        proofBank: profile.proofBank.filter((record) => record.id !== recordId),
      });
    default:
      return profile;
  }
}

export function createWorkspaceProfileSetupReviewMethods(input: {
  ctx: WorkspaceServiceContext;
  getCurrentSetupStateContext: () => Promise<{
    profile: CandidateProfile;
    searchPreferences: JobSearchPreferences;
    profileSetupState: ProfileSetupState;
    latestResumeImportRun: Awaited<ReturnType<WorkspaceServiceContext["repository"]["getLatestResumeImportRun"]>>;
    latestResumeImportAllCandidates: Awaited<
      ReturnType<WorkspaceServiceContext["repository"]["listResumeImportFieldCandidates"]>
    >;
    latestResumeImportBundles: readonly Awaited<
      ReturnType<WorkspaceServiceContext["repository"]["listResumeImportDocumentBundles"]>
    >[number][];
  }>;
  getWorkspaceSnapshot: () => Promise<Awaited<ReturnType<WorkspaceServiceContext["getWorkspaceSnapshot"]>>>;
}) {
  const { ctx, getCurrentSetupStateContext, getWorkspaceSnapshot } = input;

  async function applyProfileSetupReviewAction(
    reviewItemId: string,
    action: ProfileSetupReviewAction,
  ) {
    const parsedAction = ProfileSetupReviewActionSchema.parse(action);
    const currentSetupContext = await getCurrentSetupStateContext();
    const targetItem = currentSetupContext.profileSetupState.reviewItems.find(
      (item) => item.id === reviewItemId,
    );

    if (!targetItem) {
      throw new Error(`Unknown profile setup review item '${reviewItemId}'.`);
    }

    let nextProfile = currentSetupContext.profile;
    let nextSearchPreferences = currentSetupContext.searchPreferences;
    let nextProfileSetupState = currentSetupContext.profileSetupState;
    let nextCandidates = currentSetupContext.latestResumeImportAllCandidates;
    const now = new Date().toISOString();
    let nextStatus: ProfileSetupState["reviewItems"][number]["status"] =
      parsedAction === "dismiss" ? "dismissed" : "confirmed";
    const linkedCandidate = targetItem.sourceCandidateId
      ? nextCandidates.find((candidate) => candidate.id === targetItem.sourceCandidateId) ?? null
      : null;

    if (parsedAction === "confirm") {
      if (!linkedCandidate) {
        throw new Error(
          `Review item '${targetItem.label}' does not have a confirmable suggested value.`,
        );
      }

      nextCandidates = nextCandidates.map((candidate) =>
        candidate.id === linkedCandidate.id
          ? {
              ...candidate,
              resolution: "auto_applied",
              resolutionReason: "setup_confirmed",
              resolvedAt: now,
            }
          : candidate,
      );
      const mergedImportResult = applyResolvedResumeImportCandidatesToWorkspace({
        profile: nextProfile,
        searchPreferences: nextSearchPreferences,
        candidates: nextCandidates,
        analysisProviderKind: currentSetupContext.latestResumeImportRun?.analysisProviderKind ?? null,
        analysisProviderLabel: currentSetupContext.latestResumeImportRun?.analysisProviderLabel ?? null,
        analysisWarnings: nextProfile.baseResume.analysisWarnings,
      });

      nextProfile = mergedImportResult.profile;
      nextSearchPreferences = mergedImportResult.searchPreferences;
    }

    if (parsedAction === "dismiss" && linkedCandidate) {
      nextCandidates = nextCandidates.map((candidate) =>
        candidate.id === linkedCandidate.id
          ? {
              ...candidate,
              resolution: "rejected",
              resolutionReason: "setup_dismissed",
              resolvedAt: now,
            }
          : candidate,
      );
    }

    if (parsedAction === "clear_value") {
      nextStatus = "edited";

      if (linkedCandidate) {
        nextCandidates = nextCandidates.map((candidate) =>
          candidate.id === linkedCandidate.id
            ? {
                ...candidate,
                resolution: "rejected",
                resolutionReason: "setup_cleared_value",
                resolvedAt: now,
              }
            : candidate,
        );
      }

      if (targetItem.target.domain === "identity") {
        if (targetItem.target.key === "contactPath") {
          nextProfile = CandidateProfileSchema.parse({
            ...nextProfile,
            email: null,
            phone: null,
          });
        } else {
          if (isNonClearableIdentityField(targetItem.target.key)) {
            throw new Error("Years of experience cannot be cleared. Edit the value instead.");
          }

          const key = targetItem.target.key as keyof CandidateProfile;
          const nextValue = isRequiredIdentityField(targetItem.target.key)
            ? getSafeRequiredIdentityFallback(targetItem.target.key, currentSetupContext.profile)
            : null;

          nextProfile = CandidateProfileSchema.parse({
            ...nextProfile,
            [key]: nextValue,
          });
        }
      } else if (targetItem.target.domain === "search_preferences") {
        const key = targetItem.target.key as keyof JobSearchPreferences;
        const currentValue = nextSearchPreferences[key];
        const clearedValue = Array.isArray(currentValue)
          ? []
          : typeof currentValue === "number"
            ? null
            : null;

        nextSearchPreferences = normalizeSearchPreferences(
          JobSearchPreferencesSchema.parse({
            ...nextSearchPreferences,
            [key]: clearedValue,
          }),
        );
      } else if (targetItem.target.domain === "work_eligibility") {
        const currentValue = nextProfile.workEligibility[
          targetItem.target.key as keyof CandidateProfile["workEligibility"]
        ];
        nextProfile = CandidateProfileSchema.parse({
          ...nextProfile,
          workEligibility: CandidateWorkEligibilitySchema.parse({
            ...nextProfile.workEligibility,
            [targetItem.target.key]: getClearedStructuredFieldValue(currentValue),
          }),
        });
      } else if (targetItem.target.domain === "professional_summary") {
        const currentValue = nextProfile.professionalSummary[
          targetItem.target.key as keyof CandidateProfile["professionalSummary"]
        ];
        nextProfile = CandidateProfileSchema.parse({
          ...nextProfile,
          professionalSummary: CandidateProfessionalSummarySchema.parse({
            ...nextProfile.professionalSummary,
            [targetItem.target.key]: getClearedStructuredFieldValue(currentValue),
          }),
        });
      } else if (targetItem.target.domain === "narrative") {
        const currentValue = nextProfile.narrative[
          targetItem.target.key as keyof CandidateProfile["narrative"]
        ];
        nextProfile = CandidateProfileSchema.parse({
          ...nextProfile,
          narrative: {
            ...nextProfile.narrative,
            [targetItem.target.key]: getClearedStructuredFieldValue(currentValue),
          },
        });
      } else if (targetItem.target.domain === "answer_bank") {
        const currentValue = nextProfile.answerBank[
          targetItem.target.key as keyof CandidateProfile["answerBank"]
        ];
        nextProfile = CandidateProfileSchema.parse({
          ...nextProfile,
          answerBank: {
            ...nextProfile.answerBank,
            [targetItem.target.key]: getClearedStructuredFieldValue(currentValue),
          },
        });
      } else if (targetItem.target.domain === "application_identity") {
        const currentValue = nextProfile.applicationIdentity[
          targetItem.target.key as keyof CandidateProfile["applicationIdentity"]
        ];
        nextProfile = CandidateProfileSchema.parse({
          ...nextProfile,
          applicationIdentity: {
            ...nextProfile.applicationIdentity,
            [targetItem.target.key]: getClearedStructuredFieldValue(currentValue),
          },
        });
      } else {
        nextProfile = clearProfileRecordValue(
          nextProfile,
          targetItem.target.domain,
          targetItem.target.recordId,
        );
      }
    }

    if (
      currentSetupContext.latestResumeImportRun &&
      nextCandidates !== currentSetupContext.latestResumeImportAllCandidates
    ) {
      await ctx.repository.replaceResumeImportRunArtifacts({
        run: {
          ...currentSetupContext.latestResumeImportRun,
          status:
            hasBlockingResumeImportCandidates(nextCandidates)
              ? "review_ready"
              : "applied",
          candidateCounts: countResumeImportCandidates(nextCandidates),
        },
        documentBundles: currentSetupContext.latestResumeImportBundles,
        fieldCandidates: nextCandidates,
      });
    }

    if (hasResumeAffectingProfileChange(currentSetupContext.profile, nextProfile)) {
      await ctx.staleApprovedResumeDrafts(
        "Profile details changed after approval and the resume needs a fresh review.",
      );
    }

    if (
      JSON.stringify(nextProfile) !== JSON.stringify(currentSetupContext.profile) ||
      JSON.stringify(nextSearchPreferences) !==
        JSON.stringify(currentSetupContext.searchPreferences)
    ) {
      await ctx.repository.saveProfileAndSearchPreferences(
        nextProfile,
        nextSearchPreferences,
      );
    }

    nextProfileSetupState = ProfileSetupStateSchema.parse({
      ...nextProfileSetupState,
      reviewItems: nextProfileSetupState.reviewItems.map((item) =>
        item.id === reviewItemId
          ? {
              ...item,
              status: nextStatus,
              resolvedAt: now,
            }
          : item,
      ),
    });
    await deriveAndPersistProfileSetupState(ctx, {
      persistedState: nextProfileSetupState,
      profile: nextProfile,
      searchPreferences: nextSearchPreferences,
      latestResumeImportRunId: currentSetupContext.latestResumeImportRun?.id ?? null,
      latestResumeImportReviewCandidates: nextCandidates.filter(
        (candidate) => candidate.resolution === "needs_review" || candidate.resolution === "abstained",
      ),
    });

    return getWorkspaceSnapshot();
  }

  return {
    applyProfileSetupReviewAction,
  };
}
