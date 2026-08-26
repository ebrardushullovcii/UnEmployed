import {
  CandidateProfileSchema,
  JobSearchPreferencesSchema,
  ProfileCopilotPatchGroupSchema,
  ProfileSetupStateSchema,
  type CandidateProfile,
  type JobSearchPreferences,
  type ProfileCopilotContext,
  type ProfileCopilotRelevantReviewItem,
  type ProfileCopilotMessage,
  type ProfileCopilotPatchGroup,
  type ProfileRevision,
  type ProfileSetupState,
} from "@unemployed/contracts";

import { resolvePendingReviewItemsAfterExplicitSave } from "./profile-setup-review-items";
import { deriveAndPersistProfileSetupState } from "./profile-workspace-state";
import {
  commitProfileCopilotStateWithStaleRetry,
  type CommitProfileCopilotStateInput,
} from "./profile-commit-stale-conflict";
import { hasResumeAffectingProfileChange } from "./resume-workspace-staleness";
import { createUniqueId } from "./shared";
import { normalizeSearchPreferences } from "./workspace-helpers";
import type { WorkspaceServiceContext } from "./workspace-service-context";

function isSearchPreferencesPatchSafeForAutoApply(
  value: Extract<
    ProfileCopilotPatchGroup["operations"][number],
    { operation: "replace_search_preferences_fields" }
  >["value"],
): boolean {
  const safeScalarFields = new Set([
    "minimumSalaryUsd",
    "salaryCurrency",
    "tailoringMode",
    "targetSalaryUsd",
  ]);

  const currencyIsValid =
    value.salaryCurrency === undefined ||
    value.salaryCurrency === null ||
    /^[A-Z]{3}$/.test(value.salaryCurrency.trim().toUpperCase());
  const salaryValuesAreValid = [value.minimumSalaryUsd, value.targetSalaryUsd]
    .filter((entry): entry is number => entry !== undefined && entry !== null)
    .every((entry) => Number.isInteger(entry) && entry >= 0);

  return (
    currencyIsValid &&
    salaryValuesAreValid &&
    Object.keys(value).every((key) => safeScalarFields.has(key))
  );
}

function isCompensationPatchSafeForAutoApply(
  value: Extract<
    ProfileCopilotPatchGroup["operations"][number],
    { operation: "replace_compensation_preferences_fields" }
  >["value"],
): boolean {
  const amountsAreValid = [value.minimum, value.maximum]
    .filter((entry): entry is number => entry !== undefined && entry !== null)
    .every((entry) => Number.isInteger(entry) && entry >= 0);
  const currencyIsComparable =
    value.currencyStatus !== "needs_clarification" &&
    value.currency !== null &&
    value.currency !== undefined &&
    /^[A-Z]{3}$/.test(value.currency);

  return amountsAreValid && currencyIsComparable;
}

function hasValidPatchValues(patchGroup: ProfileCopilotPatchGroup): boolean {
  return patchGroup.operations.every((operation) => {
    if (operation.operation !== "replace_search_preferences_fields") {
      if (operation.operation !== "replace_compensation_preferences_fields") {
        return true;
      }

      return [operation.value.minimum, operation.value.maximum]
        .filter(
          (entry): entry is number => entry !== undefined && entry !== null,
        )
        .every((entry) => Number.isInteger(entry) && entry >= 0);
    }

    const currencyIsValid =
      operation.value.salaryCurrency === undefined ||
      operation.value.salaryCurrency === null ||
      /^[A-Z]{3}$/.test(operation.value.salaryCurrency.trim().toUpperCase());
    const salaryValuesAreValid = [
      operation.value.minimumSalaryUsd,
      operation.value.targetSalaryUsd,
    ]
      .filter((entry): entry is number => entry !== undefined && entry !== null)
      .every((entry) => Number.isInteger(entry) && entry >= 0);

    return currencyIsValid && salaryValuesAreValid;
  });
}

function isPatchGroupSafeForAutoApply(
  patchGroup: ProfileCopilotPatchGroup,
): boolean {
  return patchGroup.operations.every((operation) => {
    if (operation.operation === "replace_search_preferences_fields") {
      return isSearchPreferencesPatchSafeForAutoApply(operation.value);
    }

    if (operation.operation === "replace_compensation_preferences_fields") {
      return isCompensationPatchSafeForAutoApply(operation.value);
    }

    return (
      operation.operation === "replace_identity_fields" ||
      operation.operation === "replace_profile_list_fields" ||
      operation.operation === "replace_work_eligibility_fields" ||
      operation.operation === "replace_professional_summary_fields" ||
      operation.operation === "replace_narrative_fields" ||
      operation.operation === "replace_answer_bank_fields" ||
      operation.operation === "replace_application_identity_fields" ||
      operation.operation === "replace_skill_group_fields" ||
      operation.operation === "resolve_review_items"
    );
  });
}

function describeCopilotContext(context: ProfileCopilotContext): string {
  if (context.surface === "setup") {
    return `setup ${context.step.replaceAll("_", " ")}`;
  }

  if (context.surface === "profile") {
    return `${context.section} profile section`;
  }

  return "profile";
}

function formatPatchGroupSummaryList(
  patchGroups: readonly ProfileCopilotPatchGroup[],
): string {
  const summaries = patchGroups
    .slice(0, 2)
    .map((patchGroup) => patchGroup.summary);

  if (summaries.length === 0) {
    return "";
  }

  if (patchGroups.length > summaries.length) {
    return `${summaries.join(" and ")} and ${patchGroups.length - summaries.length} more`;
  }

  return summaries.join(" and ");
}

function normalizeAssistantPatchGroups(input: {
  patchGroups: readonly ProfileCopilotPatchGroup[];
  context: ProfileCopilotContext;
  content: string;
}): {
  patchGroups: ProfileCopilotPatchGroup[];
  content: string;
} {
  const normalizedPatchGroups = input.patchGroups.map((patchGroup) => {
    const normalizedPatchGroup =
      ProfileCopilotPatchGroupSchema.parse(patchGroup);

    if (
      normalizedPatchGroup.applyMode === "applied" &&
      !isPatchGroupSafeForAutoApply(normalizedPatchGroup)
    ) {
      return {
        ...normalizedPatchGroup,
        applyMode: "needs_review",
      } satisfies ProfileCopilotPatchGroup;
    }

    return normalizedPatchGroup;
  });

  const downgradedPatchGroups = normalizedPatchGroups.filter(
    (patchGroup, index) => {
      const originalPatchGroup = input.patchGroups[index];
      return (
        originalPatchGroup?.applyMode === "applied" &&
        patchGroup.applyMode === "needs_review"
      );
    },
  );

  if (downgradedPatchGroups.length === 0) {
    return {
      patchGroups: normalizedPatchGroups,
      content: input.content,
    };
  }

  const contextLabel = describeCopilotContext(input.context);
  const downgradedSummary = formatPatchGroupSummaryList(downgradedPatchGroups);
  const downgradedSuffix = downgradedSummary ? `: ${downgradedSummary}.` : ".";
  const appliedCount = normalizedPatchGroups.filter(
    (patchGroup) => patchGroup.applyMode === "applied",
  ).length;

  return {
    patchGroups: normalizedPatchGroups,
    content:
      appliedCount > 0
        ? `I applied the safest changes automatically and left higher-risk edits for review in the ${contextLabel} context${downgradedSuffix}`
        : `I prepared higher-risk edits for review in the ${contextLabel} context instead of auto-applying them${downgradedSuffix}`,
  };
}

function getStoredPatchGroupApplyMode(
  patchGroup: ProfileCopilotPatchGroup,
): ProfileCopilotPatchGroup["applyMode"] {
  return patchGroup.applyMode === "applied"
    ? "needs_review"
    : patchGroup.applyMode;
}

function setPatchGroupApplyMode(
  patchGroup: ProfileCopilotPatchGroup,
  applyMode: ProfileCopilotPatchGroup["applyMode"],
): ProfileCopilotPatchGroup {
  return {
    ...patchGroup,
    applyMode,
  };
}

function formatCopilotFactLabel(value: string): string {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (segment) => segment.toUpperCase());
}

function isBasicsSectionItem(item: ProfileCopilotRelevantReviewItem): boolean {
  return (
    item.target.domain === "identity" ||
    item.target.domain === "professional_summary"
  );
}

function isExperienceSectionItem(
  item: ProfileCopilotRelevantReviewItem,
): boolean {
  return item.target.domain === "experience";
}

function isBackgroundSectionItem(
  item: ProfileCopilotRelevantReviewItem,
): boolean {
  return [
    "education",
    "certification",
    "project",
    "link",
    "language",
    "proof_point",
  ].includes(item.target.domain);
}

function isPreferencesSectionItem(
  item: ProfileCopilotRelevantReviewItem,
): boolean {
  return [
    "search_preferences",
    "work_eligibility",
    "answer_bank",
    "application_identity",
  ].includes(item.target.domain);
}

function filterRelevantReviewItemsForContext(input: {
  context: ProfileCopilotContext;
  reviewItems: ProfileSetupState["reviewItems"];
}): ProfileCopilotRelevantReviewItem[] {
  const { context, reviewItems } = input;

  if (context.surface === "setup") {
    return reviewItems.filter((item) => item.step === context.step);
  }

  if (context.surface === "profile") {
    switch (context.section) {
      case "basics":
        return reviewItems.filter(isBasicsSectionItem);
      case "experience":
        return reviewItems.filter(isExperienceSectionItem);
      case "background":
        return reviewItems.filter(isBackgroundSectionItem);
      case "preferences":
        return reviewItems.filter(isPreferencesSectionItem);
    }
  }

  return reviewItems.filter((item) => item.status === "pending");
}

function buildConversationFacts(input: {
  profile: CandidateProfile;
  searchPreferences: JobSearchPreferences;
  relevantReviewItems: readonly ProfileCopilotRelevantReviewItem[];
}): string[] {
  const facts: string[] = [];

  if (input.profile.headline?.trim()) {
    facts.push(`Headline: ${input.profile.headline.trim()}`);
  }

  if (input.profile.currentLocation?.trim()) {
    facts.push(`Location: ${input.profile.currentLocation.trim()}`);
  }

  const compensation = input.searchPreferences.compensation;
  if (compensation.minimum !== null || compensation.maximum !== null) {
    facts.push(
      `Compensation preference: ${compensation.minimum ?? "unset"} to ${compensation.maximum ?? "unset"} per ${compensation.interval} | currency: ${compensation.currency ?? "unset"} | currency status: ${compensation.currencyStatus}`,
    );
  }

  input.profile.experiences.slice(0, 6).forEach((experience) => {
    const company = experience.companyName ?? "Unknown company";
    const title = experience.title ?? "Unknown title";
    const startDate = experience.startDate ?? "unknown start";
    const endDate = experience.isCurrent
      ? "present"
      : (experience.endDate ?? "unknown end");
    const workMode =
      experience.workMode.length > 0
        ? experience.workMode.map(formatCopilotFactLabel).join(", ")
        : "not set";
    facts.push(
      `Experience: ${title} at ${company} (${startDate} to ${endDate}) | work mode: ${workMode}`,
    );
  });

  input.relevantReviewItems.slice(0, 6).forEach((item) => {
    facts.push(
      `Review item: ${item.label} | status: ${item.status} | step: ${item.step}${item.proposedValue ? ` | proposed: ${item.proposedValue}` : ""}`,
    );
  });

  return facts;
}

function buildProfileRevision(input: {
  trigger: ProfileRevision["trigger"];
  profile: CandidateProfile;
  searchPreferences: JobSearchPreferences;
  profileSetupState: ProfileSetupState;
  reason?: string | null;
  messageId?: string | null;
  patchGroupId?: string | null;
  restoredFromRevisionId?: string | null;
}): ProfileRevision {
  return {
    id: createUniqueId("profile_revision"),
    createdAt: new Date().toISOString(),
    reason: input.reason ?? null,
    trigger: input.trigger,
    messageId: input.messageId ?? null,
    patchGroupId: input.patchGroupId ?? null,
    restoredFromRevisionId: input.restoredFromRevisionId ?? null,
    snapshotProfile: CandidateProfileSchema.parse(input.profile),
    snapshotSearchPreferences: JobSearchPreferencesSchema.parse(
      input.searchPreferences,
    ),
    snapshotProfileSetupState: ProfileSetupStateSchema.parse(
      input.profileSetupState,
    ),
  };
}

function replaceOrInsertRecord<TRecord extends { id: string }>(
  records: readonly TRecord[],
  record: TRecord,
): TRecord[] {
  const existingIndex = records.findIndex((entry) => entry.id === record.id);

  if (existingIndex >= 0) {
    const next = [...records];
    next[existingIndex] = record;
    return next;
  }

  return [...records, record];
}

function removeRecord<TRecord extends { id: string }>(
  records: readonly TRecord[],
  recordId: string,
): TRecord[] {
  return records.filter((entry) => entry.id !== recordId);
}

export function createWorkspaceProfileCopilotMethods(input: {
  ctx: WorkspaceServiceContext;
  getCurrentSetupStateContext: () => Promise<{
    profile: CandidateProfile;
    searchPreferences: JobSearchPreferences;
    profileSetupState: ProfileSetupState;
    latestResumeImportRun: Awaited<
      ReturnType<
        WorkspaceServiceContext["repository"]["getLatestResumeImportRun"]
      >
    >;
    latestResumeImportAllCandidates: Awaited<
      ReturnType<
        WorkspaceServiceContext["repository"]["listResumeImportFieldCandidates"]
      >
    >;
  }>;
  getWorkspaceSnapshot: () => Promise<
    Awaited<ReturnType<WorkspaceServiceContext["getWorkspaceSnapshot"]>>
  >;
}) {
  const { ctx, getCurrentSetupStateContext, getWorkspaceSnapshot } = input;

  async function persistProfileCopilotMessage(
    content: string,
    context: ProfileCopilotContext,
    autoApplySafeGroups: boolean,
  ) {
    const { profile, searchPreferences, profileSetupState } =
      await getCurrentSetupStateContext();
    const userMessage: ProfileCopilotMessage = {
      id: createUniqueId("profile_copilot_user_message"),
      role: "user",
      content,
      context,
      patchGroups: [],
      createdAt: new Date().toISOString(),
    };
    const relevantReviewItems = filterRelevantReviewItemsForContext({
      context,
      reviewItems: profileSetupState.reviewItems,
    });
    const assistantReply = await ctx.aiClient.reviseCandidateProfile({
      profile,
      searchPreferences,
      context,
      relevantReviewItems,
      request: content,
      conversationFacts: buildConversationFacts({
        profile,
        searchPreferences,
        relevantReviewItems,
      }),
    });
    const normalizedAssistantReply = normalizeAssistantPatchGroups({
      patchGroups: assistantReply.patchGroups,
      context,
      content: assistantReply.content,
    });
    const assistantContent =
      !autoApplySafeGroups && normalizedAssistantReply.patchGroups.length > 0
        ? `I prepared ${normalizedAssistantReply.patchGroups.length === 1 ? "this change" : `${normalizedAssistantReply.patchGroups.length} changes`} for your review: ${normalizedAssistantReply.patchGroups.map((patchGroup) => patchGroup.summary).join("; ")}. Nothing changed yet.`
        : normalizedAssistantReply.content;
    const assistantMessage: ProfileCopilotMessage = {
      id: createUniqueId("profile_copilot_assistant_message"),
      role: "assistant",
      content: assistantContent,
      context,
      patchGroups: normalizedAssistantReply.patchGroups.map((patchGroup) => {
        const storedMode = getStoredPatchGroupApplyMode(patchGroup);
        return setPatchGroupApplyMode(
          patchGroup,
          autoApplySafeGroups ? storedMode : "needs_review",
        );
      }),
      executionAttribution: assistantReply.executionReceipt ?? null,
      createdAt: new Date().toISOString(),
    };

    await ctx.repository.upsertProfileCopilotMessage(userMessage);
    await ctx.repository.upsertProfileCopilotMessage(assistantMessage);

    for (const patchGroup of normalizedAssistantReply.patchGroups) {
      if (autoApplySafeGroups && patchGroup.applyMode === "applied") {
        await applyProfileCopilotPatchGroupInternal(patchGroup.id, {
          messageId: assistantMessage.id,
          patchGroup,
        });
      }
    }

    return getWorkspaceSnapshot();
  }

  function sendProfileCopilotMessage(
    content: string,
    context: ProfileCopilotContext = { surface: "general" },
  ) {
    return persistProfileCopilotMessage(content, context, true);
  }

  function proposeProfileCopilotChange(
    content: string,
    context: ProfileCopilotContext = { surface: "general" },
  ) {
    return persistProfileCopilotMessage(content, context, false);
  }

  function applyPatchGroupOperationsToWorkspace(
    workspace: {
      profile: CandidateProfile;
      searchPreferences: JobSearchPreferences;
      profileSetupState: ProfileSetupState;
    },
    patchGroup: ProfileCopilotPatchGroup,
    now: string,
  ): {
    profile: CandidateProfile;
    searchPreferences: JobSearchPreferences;
    profileSetupState: ProfileSetupState;
  } {
    let nextProfile = workspace.profile;
    let nextSearchPreferences = workspace.searchPreferences;
    let nextProfileSetupState = workspace.profileSetupState;

    for (const operation of patchGroup.operations) {
      switch (operation.operation) {
        case "replace_identity_fields":
          nextProfile = CandidateProfileSchema.parse({
            ...nextProfile,
            ...operation.value,
          });
          break;
        case "replace_work_eligibility_fields":
          nextProfile = CandidateProfileSchema.parse({
            ...nextProfile,
            workEligibility: {
              ...nextProfile.workEligibility,
              ...operation.value,
            },
          });
          break;
        case "replace_profile_list_fields":
          nextProfile = CandidateProfileSchema.parse({
            ...nextProfile,
            ...operation.value,
          });
          break;
        case "replace_professional_summary_fields":
          nextProfile = CandidateProfileSchema.parse({
            ...nextProfile,
            professionalSummary: {
              ...nextProfile.professionalSummary,
              ...operation.value,
            },
          });
          break;
        case "replace_narrative_fields":
          nextProfile = CandidateProfileSchema.parse({
            ...nextProfile,
            narrative: {
              ...nextProfile.narrative,
              ...operation.value,
            },
          });
          break;
        case "replace_answer_bank_fields":
          nextProfile = CandidateProfileSchema.parse({
            ...nextProfile,
            answerBank: {
              ...nextProfile.answerBank,
              ...operation.value,
            },
          });
          break;
        case "replace_application_identity_fields":
          nextProfile = CandidateProfileSchema.parse({
            ...nextProfile,
            applicationIdentity: {
              ...nextProfile.applicationIdentity,
              ...operation.value,
            },
          });
          break;
        case "replace_skill_group_fields":
          nextProfile = CandidateProfileSchema.parse({
            ...nextProfile,
            skillGroups: {
              ...nextProfile.skillGroups,
              ...operation.value,
            },
          });
          break;
        case "replace_search_preferences_fields": {
          const hasLegacyCompensationAmount =
            operation.value.minimumSalaryUsd !== undefined ||
            operation.value.targetSalaryUsd !== undefined;
          const hasLegacyCurrency =
            operation.value.salaryCurrency !== undefined;
          const requestedCurrency = hasLegacyCurrency
            ? (operation.value.salaryCurrency?.trim().toUpperCase() ?? null)
            : hasLegacyCompensationAmount
              ? "USD"
              : nextSearchPreferences.compensation.currency;

          nextSearchPreferences = normalizeSearchPreferences(
            JobSearchPreferencesSchema.parse({
              ...nextSearchPreferences,
              ...operation.value,
              compensation:
                hasLegacyCompensationAmount || hasLegacyCurrency
                  ? {
                      ...nextSearchPreferences.compensation,
                      ...(operation.value.minimumSalaryUsd !== undefined
                        ? { minimum: operation.value.minimumSalaryUsd }
                        : {}),
                      ...(operation.value.targetSalaryUsd !== undefined
                        ? { maximum: operation.value.targetSalaryUsd }
                        : {}),
                      ...(hasLegacyCompensationAmount
                        ? { interval: "year" }
                        : {}),
                      currency: requestedCurrency,
                      currencyStatus:
                        requestedCurrency === null
                          ? "needs_clarification"
                          : hasLegacyCurrency
                            ? "explicit"
                            : "inherited",
                    }
                  : nextSearchPreferences.compensation,
            }),
          );
          break;
        }
        case "replace_compensation_preferences_fields":
          nextSearchPreferences = normalizeSearchPreferences(
            JobSearchPreferencesSchema.parse({
              ...nextSearchPreferences,
              compensation: {
                ...nextSearchPreferences.compensation,
                ...operation.value,
              },
            }),
          );
          break;
        case "upsert_experience_record":
          nextProfile = CandidateProfileSchema.parse({
            ...nextProfile,
            experiences: replaceOrInsertRecord(nextProfile.experiences, {
              ...operation.record,
              id: operation.record.id ?? createUniqueId("experience"),
            }),
          });
          break;
        case "remove_experience_record":
          nextProfile = CandidateProfileSchema.parse({
            ...nextProfile,
            experiences: removeRecord(
              nextProfile.experiences,
              operation.recordId,
            ),
          });
          break;
        case "upsert_education_record":
          nextProfile = CandidateProfileSchema.parse({
            ...nextProfile,
            education: replaceOrInsertRecord(nextProfile.education, {
              ...operation.record,
              id: operation.record.id ?? createUniqueId("education"),
            }),
          });
          break;
        case "remove_education_record":
          nextProfile = CandidateProfileSchema.parse({
            ...nextProfile,
            education: removeRecord(nextProfile.education, operation.recordId),
          });
          break;
        case "upsert_certification_record":
          nextProfile = CandidateProfileSchema.parse({
            ...nextProfile,
            certifications: replaceOrInsertRecord(nextProfile.certifications, {
              ...operation.record,
              id: operation.record.id ?? createUniqueId("certification"),
            }),
          });
          break;
        case "remove_certification_record":
          nextProfile = CandidateProfileSchema.parse({
            ...nextProfile,
            certifications: removeRecord(
              nextProfile.certifications,
              operation.recordId,
            ),
          });
          break;
        case "upsert_project_record":
          nextProfile = CandidateProfileSchema.parse({
            ...nextProfile,
            projects: replaceOrInsertRecord(nextProfile.projects, {
              ...operation.record,
              id: operation.record.id ?? createUniqueId("project"),
            }),
          });
          break;
        case "remove_project_record":
          nextProfile = CandidateProfileSchema.parse({
            ...nextProfile,
            projects: removeRecord(nextProfile.projects, operation.recordId),
          });
          break;
        case "upsert_link_record":
          nextProfile = CandidateProfileSchema.parse({
            ...nextProfile,
            links: replaceOrInsertRecord(nextProfile.links, {
              ...operation.record,
              id: operation.record.id ?? createUniqueId("link"),
            }),
          });
          break;
        case "remove_link_record":
          nextProfile = CandidateProfileSchema.parse({
            ...nextProfile,
            links: removeRecord(nextProfile.links, operation.recordId),
          });
          break;
        case "upsert_language_record":
          nextProfile = CandidateProfileSchema.parse({
            ...nextProfile,
            spokenLanguages: replaceOrInsertRecord(
              nextProfile.spokenLanguages,
              {
                ...operation.record,
                id: operation.record.id ?? createUniqueId("language"),
              },
            ),
          });
          break;
        case "remove_language_record":
          nextProfile = CandidateProfileSchema.parse({
            ...nextProfile,
            spokenLanguages: removeRecord(
              nextProfile.spokenLanguages,
              operation.recordId,
            ),
          });
          break;
        case "upsert_proof_point":
          nextProfile = CandidateProfileSchema.parse({
            ...nextProfile,
            proofBank: replaceOrInsertRecord(nextProfile.proofBank, {
              ...operation.record,
              id: operation.record.id ?? createUniqueId("proof"),
            }),
          });
          break;
        case "remove_proof_point":
          nextProfile = CandidateProfileSchema.parse({
            ...nextProfile,
            proofBank: removeRecord(nextProfile.proofBank, operation.recordId),
          });
          break;
        case "upsert_reusable_answer":
          nextProfile = CandidateProfileSchema.parse({
            ...nextProfile,
            answerBank: {
              ...nextProfile.answerBank,
              customAnswers: replaceOrInsertRecord(
                nextProfile.answerBank.customAnswers,
                {
                  ...operation.record,
                  id: operation.record.id ?? createUniqueId("answer"),
                },
              ),
            },
          });
          break;
        case "remove_reusable_answer":
          nextProfile = CandidateProfileSchema.parse({
            ...nextProfile,
            answerBank: {
              ...nextProfile.answerBank,
              customAnswers: removeRecord(
                nextProfile.answerBank.customAnswers,
                operation.recordId,
              ),
            },
          });
          break;
        case "resolve_review_items":
          nextProfileSetupState = ProfileSetupStateSchema.parse({
            ...nextProfileSetupState,
            reviewItems: nextProfileSetupState.reviewItems.map((item) =>
              operation.reviewItemIds.includes(item.id)
                ? {
                    ...item,
                    status: operation.resolutionStatus,
                    resolvedAt: now,
                  }
                : item,
            ),
          });
          break;
      }
    }

    return {
      profile: nextProfile,
      searchPreferences: nextSearchPreferences,
      profileSetupState: nextProfileSetupState,
    };
  }

  async function applyProfileCopilotPatchGroupInternal(
    patchGroupId: string,
    options?: {
      messageId?: string | null;
      patchGroup?: ProfileCopilotPatchGroup;
    },
  ) {
    const prepareAttempt =
      async (): Promise<CommitProfileCopilotStateInput> => {
        const [messages, currentSetupContext] = await Promise.all([
          ctx.repository.listProfileCopilotMessages(),
          getCurrentSetupStateContext(),
        ]);
        const captured = await ctx.repository.getProfileWithRevision();
        const now = new Date().toISOString();
        const patchGroup =
          options?.patchGroup ??
          messages
            .flatMap((message) => message.patchGroups)
            .find((group) => group.id === patchGroupId);

        if (!patchGroup) {
          throw new Error(
            `Unknown profile copilot patch group '${patchGroupId}'.`,
          );
        }

        if (!hasValidPatchValues(patchGroup)) {
          throw new Error(
            "Profile Copilot returned a malformed field value. Rewrite the request with the field and value stated directly.",
          );
        }

        const sourceMessage =
          messages.find((message) =>
            message.patchGroups.some((group) => group.id === patchGroupId),
          ) ?? null;

        const patched = applyPatchGroupOperationsToWorkspace(
          {
            profile: captured.profile,
            searchPreferences: currentSetupContext.searchPreferences,
            profileSetupState: currentSetupContext.profileSetupState,
          },
          patchGroup,
          now,
        );

        const nextProfileSetupState =
          resolvePendingReviewItemsAfterExplicitSave({
            currentProfile: captured.profile,
            currentSearchPreferences: currentSetupContext.searchPreferences,
            nextProfile: patched.profile,
            nextSearchPreferences: patched.searchPreferences,
            profileSetupState: patched.profileSetupState,
            now,
          });

        if (
          hasResumeAffectingProfileChange(captured.profile, patched.profile)
        ) {
          await ctx.staleApprovedResumeDrafts(
            "Profile details changed after approval and the resume needs a fresh review.",
          );
        }

        const refreshedLatestResumeImportReviewCandidates =
          currentSetupContext.latestResumeImportAllCandidates.filter(
            (candidate) =>
              candidate.resolution === "needs_review" ||
              candidate.resolution === "abstained",
          );
        const derivedProfileSetupState =
          await deriveAndPersistProfileSetupState(ctx, {
            persistedState: nextProfileSetupState,
            profile: patched.profile,
            searchPreferences: patched.searchPreferences,
            latestResumeImportRunId:
              currentSetupContext.latestResumeImportRun?.id ?? null,
            latestResumeImportReviewCandidates:
              refreshedLatestResumeImportReviewCandidates,
            persist: false,
          });

        return {
          profile: patched.profile,
          searchPreferences: patched.searchPreferences,
          profileSetupState: derivedProfileSetupState,
          // A flag delta instead of a whole-message snapshot: sibling groups
          // keep their transaction-current apply/reject status even if they
          // change between this capture and the commit.
          ...(sourceMessage
            ? {
                messagePatchFlags: [
                  {
                    messageId: sourceMessage.id,
                    patchGroupId,
                    applyMode: "applied",
                  },
                ],
              }
            : {}),
          revisions: [
            buildProfileRevision({
              trigger: "assistant_patch",
              profile: captured.profile,
              searchPreferences: currentSetupContext.searchPreferences,
              profileSetupState: currentSetupContext.profileSetupState,
              reason: `Assistant patch: ${patchGroup.summary}`,
              messageId: options?.messageId ?? sourceMessage?.id ?? null,
              patchGroupId,
            }),
          ],
          expectedProfileRevision: captured.revision,
        };
      };

    await commitProfileCopilotStateWithStaleRetry(
      ctx.repository,
      prepareAttempt,
    );
  }

  async function applyProfileCopilotPatchGroup(patchGroupId: string) {
    await applyProfileCopilotPatchGroupInternal(patchGroupId);
    return getWorkspaceSnapshot();
  }

  async function rejectProfileCopilotPatchGroup(patchGroupId: string) {
    const messages = await ctx.repository.listProfileCopilotMessages();
    const message = messages.find((entry) =>
      entry.patchGroups.some((group) => group.id === patchGroupId),
    );

    if (!message) {
      throw new Error(`Unknown profile copilot patch group '${patchGroupId}'.`);
    }

    // The flag flip resolves against transaction-current persisted state, so
    // a sibling group applied or rejected while this call was in flight keeps
    // its status instead of being reverted by a stale whole-message write.
    const didUpdate =
      await ctx.repository.commitProfileCopilotPatchFlagUpdate({
        patchGroupId,
        applyMode: "rejected",
      });

    if (!didUpdate) {
      throw new Error(`Unknown profile copilot patch group '${patchGroupId}'.`);
    }

    return getWorkspaceSnapshot();
  }

  async function undoProfileRevision(revisionId: string) {
    const currentSetupContext = await getCurrentSetupStateContext();
    const revisions = await ctx.repository.listProfileRevisions();
    const targetRevision = revisions.find(
      (revision) => revision.id === revisionId,
    );

    if (!targetRevision) {
      throw new Error(`Unknown profile revision '${revisionId}'.`);
    }

    const undoRevision = buildProfileRevision({
      trigger: "undo",
      profile: targetRevision.snapshotProfile,
      searchPreferences: targetRevision.snapshotSearchPreferences,
      profileSetupState: targetRevision.snapshotProfileSetupState,
      reason: targetRevision.reason
        ? `Undo: ${targetRevision.reason}`
        : "Undo profile revision",
      restoredFromRevisionId: targetRevision.id,
    });

    if (
      hasResumeAffectingProfileChange(
        currentSetupContext.profile,
        targetRevision.snapshotProfile,
      )
    ) {
      await ctx.staleApprovedResumeDrafts(
        "Profile details changed after approval and the resume needs a fresh review.",
      );
    }

    await commitProfileCopilotStateWithStaleRetry(ctx.repository, async () => {
      const captured = await ctx.repository.getProfileWithRevision();
      return {
        profile: targetRevision.snapshotProfile,
        searchPreferences: normalizeSearchPreferences(
          targetRevision.snapshotSearchPreferences,
        ),
        profileSetupState: targetRevision.snapshotProfileSetupState,
        revisions: [undoRevision],
        expectedProfileRevision: captured.revision,
      };
    });

    return getWorkspaceSnapshot();
  }

  return {
    sendProfileCopilotMessage,
    proposeProfileCopilotChange,
    applyProfileCopilotPatchGroup,
    rejectProfileCopilotPatchGroup,
    undoProfileRevision,
  };
}
