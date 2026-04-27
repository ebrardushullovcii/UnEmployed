import {
  ProfileReviewItemSchema,
  ProfileSetupStateSchema,
  evaluateProfileSetupReadiness,
  type CandidateProfile,
  type JobSearchPreferences,
  type ProfileReviewItem,
  type ProfileSetupState,
  type ResumeDocumentBundle,
  type ResumeImportFieldCandidate,
} from "@unemployed/contracts";
import { buildExtractionId } from "./profile-merge";
import {
  shouldIncludeCandidateInSetupReview,
  summarizeValue,
  toReviewDraft,
  type DerivedReviewDraft,
} from "./profile-setup-review-mapping";
import { normalizeText, uniqueStrings } from "./shared";
import {
  PROFILE_PLACEHOLDER_HEADLINE,
  PROFILE_PLACEHOLDER_LOCATION,
} from "./workspace-defaults";

interface BuildProfileSetupReviewItemsInput {
  currentState: ProfileSetupState | null;
  documentBundle: ResumeDocumentBundle | null;
  now: string;
  profile: CandidateProfile;
  candidates: readonly ResumeImportFieldCandidate[];
  searchPreferences: JobSearchPreferences;
}

function getPreferredApplicationLinkUrls(profile: CandidateProfile): string[] {
  return uniqueStrings(
    profile.applicationIdentity.preferredLinkIds.flatMap((linkId) => {
      const url = profile.links.find((entry) => entry.id === linkId)?.url;
      return typeof url === "string" && url.trim().length > 0 ? [url] : [];
    }),
  );
}

function getCurrentTargetValue(
  profile: CandidateProfile,
  searchPreferences: JobSearchPreferences,
  target: ProfileReviewItem["target"],
): unknown {
  switch (target.domain) {
    case "identity":
      if (target.key === "contactPath") {
        return uniqueStrings([profile.email ?? "", profile.phone ?? ""]);
      }

      return (profile as Record<string, unknown>)[target.key] ?? null;
    case "application_identity":
      if (target.key === "preferredLinkUrls") {
        return getPreferredApplicationLinkUrls(profile);
      }

      return (
        profile.applicationIdentity as Record<string, unknown>
      )[target.key] ?? null;
    case "work_eligibility":
      switch (target.key) {
        case "authorizedWorkCountries":
          return profile.workEligibility.authorizedWorkCountries;
        case "requiresVisaSponsorship":
          return profile.workEligibility.requiresVisaSponsorship;
        case "willingToRelocate":
          return profile.workEligibility.willingToRelocate;
        case "willingToTravel":
          return profile.workEligibility.willingToTravel;
        case "remoteEligible":
          return profile.workEligibility.remoteEligible;
        case "availableStartDate":
          return profile.workEligibility.availableStartDate;
        default:
          return null;
      }
    case "professional_summary":
      return profile.professionalSummary[
        target.key as keyof CandidateProfile["professionalSummary"]
      ];
    case "search_preferences":
      return searchPreferences[
        target.key as keyof JobSearchPreferences
      ];
    case "narrative":
      return profile.narrative[target.key as keyof CandidateProfile["narrative"]];
    case "answer_bank":
      return profile.answerBank[target.key as keyof CandidateProfile["answerBank"]];
    case "experience":
      if (target.key !== "record") {
        return null;
      }
      return target.recordId
        ? profile.experiences.find((record) => record.id === target.recordId) ?? null
        : profile.experiences;
    case "education":
      if (target.key !== "record") {
        return null;
      }
      return target.recordId
        ? profile.education.find((record) => record.id === target.recordId) ?? null
        : profile.education;
    case "certification":
      if (target.key !== "record") {
        return null;
      }
      return target.recordId
        ? profile.certifications.find((record) => record.id === target.recordId) ?? null
        : profile.certifications;
    case "project":
      if (target.key !== "record") {
        return null;
      }
      return target.recordId
        ? profile.projects.find((record) => record.id === target.recordId) ?? null
        : profile.projects;
    case "link":
      if (target.key !== "record") {
        return null;
      }
      return target.recordId
        ? profile.links.find((record) => record.id === target.recordId) ?? null
        : profile.links;
    case "language":
      if (target.key !== "record") {
        return null;
      }
      return target.recordId
        ? profile.spokenLanguages.find((record) => record.id === target.recordId) ?? null
        : profile.spokenLanguages;
    case "proof_point":
      if (target.key !== "record") {
        return null;
      }
      return target.recordId
        ? profile.proofBank.find((record) => record.id === target.recordId) ?? null
        : profile.proofBank;
    default:
      return null;
  }
}

function hasCurrentTargetValue(
  profile: CandidateProfile,
  searchPreferences: JobSearchPreferences,
  target: ProfileReviewItem["target"],
): boolean {
  const value = getCurrentTargetValue(profile, searchPreferences, target);

  if (typeof value === "string") {
    if (
      target.domain === "identity" &&
      target.key === "headline" &&
      !hasPlaceholderAwareIdentityValue(value, PROFILE_PLACEHOLDER_HEADLINE)
    ) {
      return false;
    }

    if (
      target.domain === "identity" &&
      target.key === "currentLocation" &&
      !hasPlaceholderAwareIdentityValue(value, PROFILE_PLACEHOLDER_LOCATION)
    ) {
      return false;
    }

    return hasMeaningfulText(value);
  }

  if (typeof value === "number") {
    return true;
  }

  if (typeof value === "boolean") {
    return true;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (value && typeof value === "object") {
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

function normalizeComparableSummary(value: string | null): string | null {
  return value ? normalizeText(value) : null;
}

export function resolvePendingReviewItemsAfterExplicitSave(input: {
  currentProfile: CandidateProfile;
  currentSearchPreferences: JobSearchPreferences;
  nextProfile: CandidateProfile;
  nextSearchPreferences: JobSearchPreferences;
  profileSetupState: ProfileSetupState;
  now: string;
}): ProfileSetupState {
  return ProfileSetupStateSchema.parse({
    ...input.profileSetupState,
    reviewItems: input.profileSetupState.reviewItems.map((item) => {
      if (item.status !== "pending") {
        return item;
      }

      const previousValue = getCurrentTargetValue(
        input.currentProfile,
        input.currentSearchPreferences,
        item.target,
      );
      const nextValue = getCurrentTargetValue(
        input.nextProfile,
        input.nextSearchPreferences,
        item.target,
      );

      if (
        !hasCurrentTargetValue(
          input.nextProfile,
          input.nextSearchPreferences,
          item.target,
        )
      ) {
        return item;
      }

      const previousSummary = normalizeComparableSummary(summarizeValue(previousValue));
      const nextSummary = normalizeComparableSummary(summarizeValue(nextValue));

      if (!nextSummary || previousSummary === nextSummary) {
        return item;
      }

      const proposedSummary = normalizeComparableSummary(item.proposedValue ?? null);
      const nextStatus = proposedSummary && proposedSummary === nextSummary
        ? "confirmed"
        : "edited";

      return ProfileReviewItemSchema.parse({
        ...item,
        status: nextStatus,
        resolvedAt: item.resolvedAt ?? input.now,
      });
    }),
  });
}

function resolvePendingItemIfSatisfied(input: {
  item: ProfileReviewItem;
  draft: DerivedReviewDraft;
  now: string;
  profile: CandidateProfile;
  searchPreferences: JobSearchPreferences;
}): ProfileReviewItem {
  const currentValue = getCurrentTargetValue(
    input.profile,
    input.searchPreferences,
    input.draft.target,
  );
  const currentSummary = summarizeValue(currentValue);
  const proposedSummary = input.draft.proposedValue ?? null;
  const sourceCandidateId = input.draft.sourceCandidateId ?? input.item.sourceCandidateId;

  if (!hasCurrentTargetValue(input.profile, input.searchPreferences, input.draft.target)) {
    return ProfileReviewItemSchema.parse({
      ...input.item,
      step: input.draft.step,
      target: input.draft.target,
      label: input.draft.label,
      reason: input.draft.reason,
      severity: input.draft.severity,
      proposedValue: proposedSummary,
      sourceSnippet: input.draft.sourceSnippet ?? null,
      sourceCandidateId,
      sourceRunId: input.draft.sourceRunId ?? null,
    });
  }

  if (sourceCandidateId) {
    return ProfileReviewItemSchema.parse({
      ...input.item,
      step: input.draft.step,
      target: input.draft.target,
      label: input.draft.label,
      reason: input.draft.reason,
      severity: input.draft.severity,
      proposedValue: proposedSummary,
      sourceSnippet: input.draft.sourceSnippet ?? null,
      sourceCandidateId,
      sourceRunId: input.draft.sourceRunId ?? null,
    });
  }

  return ProfileReviewItemSchema.parse({
    ...input.item,
    step: input.draft.step,
    target: input.draft.target,
    label: input.draft.label,
    reason: input.draft.reason,
    severity: input.draft.severity,
    status:
      proposedSummary && currentSummary
        ? normalizeText(proposedSummary) === normalizeText(currentSummary)
          ? "confirmed"
          : "edited"
        : "edited",
    proposedValue: proposedSummary,
    sourceSnippet: input.draft.sourceSnippet ?? null,
    sourceCandidateId,
    sourceRunId: input.draft.sourceRunId ?? null,
    resolvedAt: input.item.resolvedAt ?? input.now,
  });
}

function hasMeaningfulText(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function hasMeaningfulStringList(values: readonly string[] | null | undefined): boolean {
  return values?.some((value) => hasMeaningfulText(value)) ?? false;
}

function hasPlaceholderAwareIdentityValue(
  value: string | null | undefined,
  placeholder: string,
): boolean {
  return Boolean(
    hasMeaningfulText(value) &&
      normalizeText(value ?? "") !== normalizeText(placeholder),
  );
}

function hasDraftForTarget(
  candidateDrafts: readonly DerivedReviewDraft[],
  domain: string,
  key?: string,
): boolean {
  return candidateDrafts.some(
    (draft) =>
      draft.target.domain === domain &&
      (key === undefined || draft.target.key === key),
  );
}

function buildMissingFieldDrafts(
  profile: CandidateProfile,
  searchPreferences: JobSearchPreferences,
  candidateDrafts: readonly DerivedReviewDraft[],
): DerivedReviewDraft[] {
  const drafts: DerivedReviewDraft[] = [];

  if (
    !hasPlaceholderAwareIdentityValue(profile.headline, PROFILE_PLACEHOLDER_HEADLINE) &&
    !hasDraftForTarget(candidateDrafts, "identity", "headline")
  ) {
    drafts.push({
      step: "essentials",
      target: { domain: "identity", key: "headline", recordId: null },
      label: "Headline",
      reason:
        "Add a headline so discovery, resume exports, and profile reviews can describe your target focus clearly.",
      severity: "critical",
      proposedValue: null,
      sourceSnippet: null,
    });
  }

  if (
    !hasPlaceholderAwareIdentityValue(profile.currentLocation, PROFILE_PLACEHOLDER_LOCATION) &&
    !hasDraftForTarget(candidateDrafts, "identity", "currentLocation")
  ) {
    drafts.push({
      step: "essentials",
      target: { domain: "identity", key: "currentLocation", recordId: null },
      label: "Location",
      reason:
        "Add your current location so discovery and application defaults can respect where you can realistically work.",
      severity: "critical",
      proposedValue: null,
      sourceSnippet: null,
    });
  }

  if (
    profile.yearsExperience <= 0 &&
    !hasDraftForTarget(candidateDrafts, "identity", "yearsExperience")
  ) {
    drafts.push({
      step: "essentials",
      target: { domain: "identity", key: "yearsExperience", recordId: null },
      label: "Years of experience",
      reason:
        "Add your years of experience so setup, search targeting, and resume outputs have a grounded seniority signal.",
      severity: "recommended",
      proposedValue: null,
      sourceSnippet: null,
    });
  }

  if (!hasMeaningfulText(profile.email) && !hasMeaningfulText(profile.phone)) {
    drafts.push({
      step: "essentials",
      target: { domain: "identity", key: "contactPath", recordId: null },
      label: "Contact details",
      reason:
        "Add at least one contact path before applications and recruiter follow-up flows can work reliably.",
      severity: "critical",
      proposedValue: null,
      sourceSnippet: null,
    });
  }

  if (
    !profile.experiences.some(
      (experience) =>
        hasMeaningfulText(experience.companyName) || hasMeaningfulText(experience.title),
    ) &&
    !hasDraftForTarget(candidateDrafts, "experience", "record")
  ) {
    drafts.push({
      step: "background",
      target: { domain: "experience", key: "record", recordId: null },
      label: "Work history",
      reason:
        "Add or confirm at least one meaningful experience record so resumes and fit scoring have grounded background to work from.",
      severity: "critical",
      proposedValue: null,
      sourceSnippet: null,
    });
  }

  if (
    !hasMeaningfulStringList(searchPreferences.targetRoles) &&
    !hasMeaningfulStringList(searchPreferences.jobFamilies) &&
    !hasMeaningfulStringList(profile.targetRoles) &&
    !hasDraftForTarget(candidateDrafts, "search_preferences", "targetRoles")
  ) {
    drafts.push({
      step: "targeting",
      target: { domain: "search_preferences", key: "targetRoles", recordId: null },
      label: "Target roles",
      reason:
        "Choose target roles or job families so discovery and resume tailoring are not generic.",
      severity: "critical",
      proposedValue: null,
      sourceSnippet: null,
    });
  }

  const hasEligibility =
    hasMeaningfulStringList(profile.workEligibility.authorizedWorkCountries) ||
    profile.workEligibility.requiresVisaSponsorship !== null ||
    profile.workEligibility.willingToRelocate !== null ||
    profile.workEligibility.willingToTravel !== null ||
    profile.workEligibility.remoteEligible !== null ||
    profile.workEligibility.noticePeriodDays !== null ||
    hasMeaningfulText(profile.workEligibility.availableStartDate) ||
    hasMeaningfulStringList(searchPreferences.locations) ||
    hasMeaningfulStringList(searchPreferences.workModes);

  if (
    !hasEligibility &&
    !(
      hasDraftForTarget(candidateDrafts, "work_eligibility") ||
      hasDraftForTarget(candidateDrafts, "search_preferences", "locations")
    )
  ) {
    drafts.push({
      step: "targeting",
      target: { domain: "work_eligibility", key: "authorizedWorkCountries", recordId: null },
      label: "Work eligibility",
      reason:
        "Capture work eligibility or location preferences so discovery and application defaults reflect real constraints.",
      severity: "recommended",
      proposedValue: null,
      sourceSnippet: null,
    });
  }

  return drafts;
}

function reviewIdentityKey(item: Pick<ProfileReviewItem, "target" | "label">): string {
  return normalizeText(
    `${item.target.domain}|${item.target.key}|${item.target.recordId ?? ""}|${item.label}`,
  );
}

function rebuildResolvedItem(
  item: ProfileReviewItem,
  nextDraft: DerivedReviewDraft,
): ProfileReviewItem {
  return ProfileReviewItemSchema.parse({
    ...item,
    step: nextDraft.step,
    target: nextDraft.target,
    label: nextDraft.label,
    reason: nextDraft.reason,
    severity: nextDraft.severity,
    proposedValue: nextDraft.proposedValue ?? null,
    sourceSnippet: nextDraft.sourceSnippet ?? null,
    sourceCandidateId: nextDraft.sourceCandidateId ?? null,
    sourceRunId: nextDraft.sourceRunId ?? null,
  });
}

function shouldReopenResolvedItem(input: {
  item: ProfileReviewItem;
  draft: DerivedReviewDraft;
  profile: CandidateProfile;
  searchPreferences: JobSearchPreferences;
}): boolean {
  const currentValue = getCurrentTargetValue(
    input.profile,
    input.searchPreferences,
    input.draft.target,
  );
  const currentSummary = summarizeValue(currentValue);
  const proposedSummary = input.draft.proposedValue ?? null;
  const previousProposedSummary = input.item.proposedValue ?? null;

  if (!hasCurrentTargetValue(input.profile, input.searchPreferences, input.draft.target)) {
    return true;
  }

  if (!proposedSummary && !previousProposedSummary) {
    return false;
  }

  if (
    proposedSummary &&
    previousProposedSummary &&
    normalizeText(proposedSummary) === normalizeText(previousProposedSummary)
  ) {
    return false;
  }

  if (
    proposedSummary &&
    currentSummary &&
    normalizeText(proposedSummary) === normalizeText(currentSummary)
  ) {
    return false;
  }

  if (input.item.status === "dismissed" && !proposedSummary) {
    return false;
  }

  if (proposedSummary || previousProposedSummary) {
    return true;
  }

  return false;
}

function buildPendingItem(
  draft: DerivedReviewDraft,
  now: string,
): ProfileReviewItem {
  const id = buildExtractionId("profile_setup_review", 0, [
    draft.step,
    draft.target.domain,
    draft.target.key,
    draft.target.recordId,
    draft.label,
  ]);

  return ProfileReviewItemSchema.parse({
    id,
    step: draft.step,
    target: draft.target,
    label: draft.label,
    reason: draft.reason,
    severity: draft.severity,
    status: "pending",
    proposedValue: draft.proposedValue ?? null,
    sourceSnippet: draft.sourceSnippet ?? null,
    sourceCandidateId: draft.sourceCandidateId ?? null,
    sourceRunId: draft.sourceRunId ?? null,
    createdAt: now,
    resolvedAt: null,
  });
}

export function buildProfileSetupReviewItems(
  input: BuildProfileSetupReviewItemsInput,
): ProfileReviewItem[] {
  const readiness = evaluateProfileSetupReadiness(
    input.profile,
    input.searchPreferences,
  );
  const unresolvedCandidateDrafts = input.candidates
    .filter(
      (candidate) =>
        (candidate.resolution === "needs_review" || candidate.resolution === "abstained") &&
        shouldIncludeCandidateInSetupReview(candidate),
    )
    .map((candidate) => toReviewDraft(candidate, input.documentBundle))
    .filter((draft): draft is DerivedReviewDraft => draft !== null);
  const missingFieldDrafts =
    readiness.started || unresolvedCandidateDrafts.length > 0
      ? buildMissingFieldDrafts(
          input.profile,
          input.searchPreferences,
          unresolvedCandidateDrafts,
        )
      : [];
  const nextDrafts = [...unresolvedCandidateDrafts, ...missingFieldDrafts];
  const currentItems = input.currentState?.reviewItems ?? [];
  const currentByIdentity = new Map(
    currentItems.map((item) => [reviewIdentityKey(item), item]),
  );
  const seenIdentities = new Set<string>();
  const nextItems: ProfileReviewItem[] = [];

  for (const draft of nextDrafts) {
    const identity = reviewIdentityKey({ target: draft.target, label: draft.label });
    if (seenIdentities.has(identity)) {
      continue;
    }

    seenIdentities.add(identity);
    const existing = currentByIdentity.get(identity);

    if (existing && existing.status !== "pending") {
      if (
        shouldReopenResolvedItem({
          item: existing,
          draft,
          profile: input.profile,
          searchPreferences: input.searchPreferences,
        })
      ) {
        nextItems.push(buildPendingItem(draft, input.now));
        continue;
      }

      nextItems.push(rebuildResolvedItem(existing, draft));
      continue;
    }

    if (existing) {
      nextItems.push(
        resolvePendingItemIfSatisfied({
          item: existing,
          draft,
          now: input.now,
          profile: input.profile,
          searchPreferences: input.searchPreferences,
        }),
      );
      continue;
    }

    nextItems.push(buildPendingItem(draft, input.now));
  }

  for (const item of currentItems) {
    const identity = reviewIdentityKey(item);

    if (seenIdentities.has(identity)) {
      continue;
    }

    if (item.status !== "pending") {
      nextItems.push(item);
      continue;
    }

    if (
      hasCurrentTargetValue(
        input.profile,
        input.searchPreferences,
        item.target,
      )
    ) {
      nextItems.push(
        resolvePendingItemIfSatisfied({
          item,
          draft: {
            step: item.step,
            target: item.target,
            label: item.label,
            reason: item.reason,
            severity: item.severity,
            proposedValue: item.proposedValue,
            sourceSnippet: item.sourceSnippet,
            sourceCandidateId: item.sourceCandidateId,
            sourceRunId: item.sourceRunId,
          },
          now: input.now,
          profile: input.profile,
          searchPreferences: input.searchPreferences,
        }),
      );
    }
  }

  return nextItems.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}
