import { z } from "zod";

import { IsoDateTimeSchema, NonEmptyStringSchema } from "./base";
import {
  CandidateAnswerBankSchema,
  CandidateApplicationIdentitySchema,
  CandidateCertificationSchema,
  CandidateEducationSchema,
  CandidateExperienceSchema,
  CandidateLanguageSchema,
  CandidateLinkSchema,
  CandidateProfessionalSummarySchema,
  CandidateProjectSchema,
  CandidateProofBankEntrySchema,
  CandidateReusableAnswerSchema,
  CandidateSkillGroupSchema,
  CandidateWorkEligibilitySchema,
  CandidateNarrativeSchema,
  CandidateProfileSchema,
} from "./profile";
import {
  ProfileReviewItemSchema,
  ProfileSetupStateSchema,
  ProfileSetupStepSchema,
} from "./profile-setup";
import { JobSearchPreferencesSchema } from "./discovery";

export const profileCopilotRoleValues = ["user", "assistant"] as const;
export const ProfileCopilotRoleSchema = z.enum(profileCopilotRoleValues);
export type ProfileCopilotRole = z.infer<typeof ProfileCopilotRoleSchema>;

export const profileCopilotPatchApplyModeValues = [
  "applied",
  "needs_review",
  "rejected",
] as const;
export const ProfileCopilotPatchApplyModeSchema = z.enum(
  profileCopilotPatchApplyModeValues,
);
export type ProfileCopilotPatchApplyMode = z.infer<
  typeof ProfileCopilotPatchApplyModeSchema
>;

export const profileCopilotProfileSectionValues = [
  "basics",
  "experience",
  "background",
  "preferences",
] as const;
export const ProfileCopilotProfileSectionSchema = z.enum(
  profileCopilotProfileSectionValues,
);
export type ProfileCopilotProfileSection = z.infer<
  typeof ProfileCopilotProfileSectionSchema
>;

export const ProfileCopilotContextSchema = z.discriminatedUnion("surface", [
  z.object({
    surface: z.literal("general"),
  }),
  z.object({
    surface: z.literal("setup"),
    step: ProfileSetupStepSchema,
  }),
  z.object({
    surface: z.literal("profile"),
    section: ProfileCopilotProfileSectionSchema,
  }),
]);
export type ProfileCopilotContext = z.infer<typeof ProfileCopilotContextSchema>;

function requireAtLeastOneField<TSchema extends z.ZodRawShape>(
  schema: z.ZodObject<TSchema>,
  message: string,
) {
  return schema.refine(
    (value) =>
      Object.entries(value).some(([, fieldValue]) => {
        if (fieldValue === undefined || fieldValue === null) {
          return false;
        }

        if (typeof fieldValue === "string") {
          return fieldValue.trim().length > 0;
        }

        if (Array.isArray(fieldValue)) {
          return fieldValue.length > 0;
        }

        return true;
      }),
    {
      message,
    },
  );
}

export const ProfileIdentityPatchFieldsSchema = requireAtLeastOneField(
  CandidateProfileSchema.pick({
    currentCity: true,
    currentCountry: true,
    currentLocation: true,
    currentRegion: true,
    email: true,
    firstName: true,
    fullName: true,
    githubUrl: true,
    headline: true,
    lastName: true,
    linkedinUrl: true,
    middleName: true,
    personalWebsiteUrl: true,
    phone: true,
    portfolioUrl: true,
    preferredDisplayName: true,
    secondaryEmail: true,
    summary: true,
    timeZone: true,
    yearsExperience: true,
  }).partial(),
  "Identity updates must include at least one field.",
);
export type ProfileIdentityPatchFields = z.infer<
  typeof ProfileIdentityPatchFieldsSchema
>;

export const ProfileWorkEligibilityPatchFieldsSchema = requireAtLeastOneField(
  CandidateWorkEligibilitySchema.partial(),
  "Work eligibility updates must include at least one field.",
);
export type ProfileWorkEligibilityPatchFields = z.infer<
  typeof ProfileWorkEligibilityPatchFieldsSchema
>;

export const ProfileProfessionalSummaryPatchFieldsSchema = requireAtLeastOneField(
  CandidateProfessionalSummarySchema.partial(),
  "Professional summary updates must include at least one field.",
);
export type ProfileProfessionalSummaryPatchFields = z.infer<
  typeof ProfileProfessionalSummaryPatchFieldsSchema
>;

export const ProfileNarrativePatchFieldsSchema = requireAtLeastOneField(
  CandidateNarrativeSchema.partial(),
  "Narrative updates must include at least one field.",
);
export type ProfileNarrativePatchFields = z.infer<
  typeof ProfileNarrativePatchFieldsSchema
>;

export const ProfileAnswerBankPatchFieldsSchema = requireAtLeastOneField(
  CandidateAnswerBankSchema.omit({ customAnswers: true }).partial(),
  "Answer bank updates must include at least one field.",
);
export type ProfileAnswerBankPatchFields = z.infer<
  typeof ProfileAnswerBankPatchFieldsSchema
>;

export const ProfileApplicationIdentityPatchFieldsSchema = requireAtLeastOneField(
  CandidateApplicationIdentitySchema.partial(),
  "Application identity updates must include at least one field.",
);
export type ProfileApplicationIdentityPatchFields = z.infer<
  typeof ProfileApplicationIdentityPatchFieldsSchema
>;

export const ProfileSkillGroupsPatchFieldsSchema = requireAtLeastOneField(
  CandidateSkillGroupSchema.partial(),
  "Skill-group updates must include at least one field.",
);
export type ProfileSkillGroupsPatchFields = z.infer<
  typeof ProfileSkillGroupsPatchFieldsSchema
>;

export const ProfileCoreListPatchFieldsSchema = requireAtLeastOneField(
  CandidateProfileSchema.pick({
    locations: true,
    skills: true,
    targetRoles: true,
  }).partial(),
  "Profile list updates must include at least one field.",
);
export type ProfileCoreListPatchFields = z.infer<
  typeof ProfileCoreListPatchFieldsSchema
>;

export const ProfileSearchPreferencesPatchFieldsSchema = requireAtLeastOneField(
  JobSearchPreferencesSchema.pick({
    approvalMode: true,
    companyBlacklist: true,
    companyWhitelist: true,
    discovery: true,
    employmentTypes: true,
    excludedLocations: true,
    jobFamilies: true,
    locations: true,
    minimumSalaryUsd: true,
    salaryCurrency: true,
    seniorityLevels: true,
    tailoringMode: true,
    targetCompanyStages: true,
    targetIndustries: true,
    targetRoles: true,
    targetSalaryUsd: true,
    workModes: true,
  }).partial(),
  "Search-preference updates must include at least one field.",
);
export type ProfileSearchPreferencesPatchFields = z.infer<
  typeof ProfileSearchPreferencesPatchFieldsSchema
>;

export const ProfileCopilotReviewResolutionStatusSchema = z.enum([
  "confirmed",
  "edited",
  "dismissed",
]);
export type ProfileCopilotReviewResolutionStatus = z.infer<
  typeof ProfileCopilotReviewResolutionStatusSchema
>;

const UpsertCandidateExperienceInputSchema = CandidateExperienceSchema.extend({
  id: NonEmptyStringSchema.nullable().default(null),
});
const UpsertCandidateEducationInputSchema = CandidateEducationSchema.extend({
  id: NonEmptyStringSchema.nullable().default(null),
});
const UpsertCandidateCertificationInputSchema = CandidateCertificationSchema.extend({
  id: NonEmptyStringSchema.nullable().default(null),
});
const UpsertCandidateLinkInputSchema = CandidateLinkSchema.extend({
  id: NonEmptyStringSchema.nullable().default(null),
});
const UpsertCandidateProjectInputSchema = CandidateProjectSchema.extend({
  id: NonEmptyStringSchema.nullable().default(null),
});
const UpsertCandidateLanguageInputSchema = CandidateLanguageSchema.extend({
  id: NonEmptyStringSchema.nullable().default(null),
});
const UpsertCandidateProofBankEntryInputSchema = CandidateProofBankEntrySchema.extend({
  id: NonEmptyStringSchema.nullable().default(null),
});
const UpsertCandidateReusableAnswerInputSchema = CandidateReusableAnswerSchema.extend({
  id: NonEmptyStringSchema.nullable().default(null),
});

export const ProfileCopilotPatchOperationSchema = z.discriminatedUnion(
  "operation",
  [
    z.object({
      operation: z.literal("replace_identity_fields"),
      value: ProfileIdentityPatchFieldsSchema,
    }),
    z.object({
      operation: z.literal("replace_work_eligibility_fields"),
      value: ProfileWorkEligibilityPatchFieldsSchema,
    }),
    z.object({
      operation: z.literal("replace_professional_summary_fields"),
      value: ProfileProfessionalSummaryPatchFieldsSchema,
    }),
    z.object({
      operation: z.literal("replace_narrative_fields"),
      value: ProfileNarrativePatchFieldsSchema,
    }),
    z.object({
      operation: z.literal("replace_answer_bank_fields"),
      value: ProfileAnswerBankPatchFieldsSchema,
    }),
    z.object({
      operation: z.literal("replace_application_identity_fields"),
      value: ProfileApplicationIdentityPatchFieldsSchema,
    }),
    z.object({
      operation: z.literal("replace_skill_group_fields"),
      value: ProfileSkillGroupsPatchFieldsSchema,
    }),
    z.object({
      operation: z.literal("replace_profile_list_fields"),
      value: ProfileCoreListPatchFieldsSchema,
    }),
    z.object({
      operation: z.literal("replace_search_preferences_fields"),
      value: ProfileSearchPreferencesPatchFieldsSchema,
    }),
    z.object({
      operation: z.literal("upsert_experience_record"),
      record: UpsertCandidateExperienceInputSchema,
    }),
    z.object({
      operation: z.literal("remove_experience_record"),
      recordId: NonEmptyStringSchema,
    }),
    z.object({
      operation: z.literal("upsert_education_record"),
      record: UpsertCandidateEducationInputSchema,
    }),
    z.object({
      operation: z.literal("remove_education_record"),
      recordId: NonEmptyStringSchema,
    }),
    z.object({
      operation: z.literal("upsert_certification_record"),
      record: UpsertCandidateCertificationInputSchema,
    }),
    z.object({
      operation: z.literal("remove_certification_record"),
      recordId: NonEmptyStringSchema,
    }),
    z.object({
      operation: z.literal("upsert_project_record"),
      record: UpsertCandidateProjectInputSchema,
    }),
    z.object({
      operation: z.literal("remove_project_record"),
      recordId: NonEmptyStringSchema,
    }),
    z.object({
      operation: z.literal("upsert_link_record"),
      record: UpsertCandidateLinkInputSchema,
    }),
    z.object({
      operation: z.literal("remove_link_record"),
      recordId: NonEmptyStringSchema,
    }),
    z.object({
      operation: z.literal("upsert_language_record"),
      record: UpsertCandidateLanguageInputSchema,
    }),
    z.object({
      operation: z.literal("remove_language_record"),
      recordId: NonEmptyStringSchema,
    }),
    z.object({
      operation: z.literal("upsert_proof_point"),
      record: UpsertCandidateProofBankEntryInputSchema,
    }),
    z.object({
      operation: z.literal("remove_proof_point"),
      recordId: NonEmptyStringSchema,
    }),
    z.object({
      operation: z.literal("upsert_reusable_answer"),
      record: UpsertCandidateReusableAnswerInputSchema,
    }),
    z.object({
      operation: z.literal("remove_reusable_answer"),
      recordId: NonEmptyStringSchema,
    }),
    z.object({
      operation: z.literal("resolve_review_items"),
      reviewItemIds: z.array(NonEmptyStringSchema).min(1),
      resolutionStatus: ProfileCopilotReviewResolutionStatusSchema,
    }),
  ],
);
export type ProfileCopilotPatchOperation = z.infer<
  typeof ProfileCopilotPatchOperationSchema
>;

export const ProfileCopilotPatchGroupSchema = z.object({
  id: NonEmptyStringSchema,
  summary: NonEmptyStringSchema,
  applyMode: ProfileCopilotPatchApplyModeSchema.default("needs_review"),
  operations: z.array(ProfileCopilotPatchOperationSchema).min(1),
  createdAt: IsoDateTimeSchema,
});
export type ProfileCopilotPatchGroup = z.infer<
  typeof ProfileCopilotPatchGroupSchema
>;

export const ProfileCopilotMessageSchema = z.object({
  id: NonEmptyStringSchema,
  role: ProfileCopilotRoleSchema,
  content: NonEmptyStringSchema,
  context: ProfileCopilotContextSchema.default({ surface: "general" }),
  patchGroups: z.array(ProfileCopilotPatchGroupSchema).default([]),
  createdAt: IsoDateTimeSchema,
});
export type ProfileCopilotMessage = z.infer<typeof ProfileCopilotMessageSchema>;

export const profileRevisionTriggerValues = [
  "assistant_patch",
  "undo",
] as const;
export const ProfileRevisionTriggerSchema = z.enum(profileRevisionTriggerValues);
export type ProfileRevisionTrigger = z.infer<typeof ProfileRevisionTriggerSchema>;

export const ProfileRevisionSchema = z.object({
  id: NonEmptyStringSchema,
  createdAt: IsoDateTimeSchema,
  reason: NonEmptyStringSchema.nullable().default(null),
  trigger: ProfileRevisionTriggerSchema,
  messageId: NonEmptyStringSchema.nullable().default(null),
  patchGroupId: NonEmptyStringSchema.nullable().default(null),
  restoredFromRevisionId: NonEmptyStringSchema.nullable().default(null),
  snapshotProfile: CandidateProfileSchema,
  snapshotSearchPreferences: JobSearchPreferencesSchema,
  snapshotProfileSetupState: ProfileSetupStateSchema,
});
export type ProfileRevision = z.infer<typeof ProfileRevisionSchema>;

export const ProfileRevisionSummarySchema = ProfileRevisionSchema.pick({
  id: true,
  createdAt: true,
  reason: true,
  trigger: true,
  messageId: true,
  patchGroupId: true,
  restoredFromRevisionId: true,
});
export type ProfileRevisionSummary = z.infer<
  typeof ProfileRevisionSummarySchema
>;

export const ProfileCopilotReplySchema = z.object({
  content: NonEmptyStringSchema,
  patchGroups: z.array(ProfileCopilotPatchGroupSchema).default([]),
});
export type ProfileCopilotReply = z.infer<typeof ProfileCopilotReplySchema>;

export const ProfileCopilotRelevantReviewItemSchema = ProfileReviewItemSchema;
export type ProfileCopilotRelevantReviewItem = z.infer<
  typeof ProfileCopilotRelevantReviewItemSchema
>;
