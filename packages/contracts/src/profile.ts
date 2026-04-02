import { z } from "zod";

import {
  AiProviderKindSchema,
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  ResumeExtractionStatusSchema,
  UrlStringSchema,
  WorkModeListSchema,
} from "./base";

export const ResumeSourceDocumentSchema = z.object({
  id: NonEmptyStringSchema,
  fileName: NonEmptyStringSchema,
  uploadedAt: IsoDateTimeSchema,
  storagePath: NonEmptyStringSchema.nullable().default(null),
  textContent: NonEmptyStringSchema.nullable().default(null),
  textUpdatedAt: IsoDateTimeSchema.nullable().default(null),
  extractionStatus: ResumeExtractionStatusSchema.default("not_started"),
  lastAnalyzedAt: IsoDateTimeSchema.nullable().default(null),
  analysisProviderKind: AiProviderKindSchema.nullable().default(null),
  analysisProviderLabel: NonEmptyStringSchema.nullable().default(null),
  analysisWarnings: z.array(NonEmptyStringSchema).default([]),
});
export type ResumeSourceDocument = z.infer<typeof ResumeSourceDocumentSchema>;

export const CandidateExperienceSchema = z.object({
  id: NonEmptyStringSchema,
  companyName: NonEmptyStringSchema.nullable().default(null),
  companyUrl: NonEmptyStringSchema.nullable().default(null),
  title: NonEmptyStringSchema.nullable().default(null),
  employmentType: NonEmptyStringSchema.nullable().default(null),
  location: NonEmptyStringSchema.nullable().default(null),
  workMode: WorkModeListSchema,
  startDate: NonEmptyStringSchema.nullable().default(null),
  endDate: NonEmptyStringSchema.nullable().default(null),
  isCurrent: z.boolean().default(false),
  isDraft: z.boolean().default(false),
  summary: NonEmptyStringSchema.nullable().default(null),
  achievements: z.array(NonEmptyStringSchema).default([]),
  skills: z.array(NonEmptyStringSchema).default([]),
  domainTags: z.array(NonEmptyStringSchema).default([]),
  peopleManagementScope: NonEmptyStringSchema.nullable().default(null),
  ownershipScope: NonEmptyStringSchema.nullable().default(null),
});
export type CandidateExperience = z.infer<typeof CandidateExperienceSchema>;

export const CandidateEducationSchema = z.object({
  id: NonEmptyStringSchema,
  schoolName: NonEmptyStringSchema.nullable().default(null),
  degree: NonEmptyStringSchema.nullable().default(null),
  fieldOfStudy: NonEmptyStringSchema.nullable().default(null),
  location: NonEmptyStringSchema.nullable().default(null),
  startDate: NonEmptyStringSchema.nullable().default(null),
  endDate: NonEmptyStringSchema.nullable().default(null),
  isDraft: z.boolean().default(false),
  summary: NonEmptyStringSchema.nullable().default(null),
});
export type CandidateEducation = z.infer<typeof CandidateEducationSchema>;

export const CandidateCertificationSchema = z.object({
  id: NonEmptyStringSchema,
  name: NonEmptyStringSchema.nullable().default(null),
  issuer: NonEmptyStringSchema.nullable().default(null),
  issueDate: NonEmptyStringSchema.nullable().default(null),
  expiryDate: NonEmptyStringSchema.nullable().default(null),
  credentialUrl: UrlStringSchema.nullable().default(null),
  isDraft: z.boolean().default(false),
});
export type CandidateCertification = z.infer<
  typeof CandidateCertificationSchema
>;

export const candidateLinkKindValues = [
  "portfolio",
  "linkedin",
  "github",
  "website",
  "repository",
  "case_study",
  "other",
] as const;
export const CandidateLinkKindSchema = z.enum(candidateLinkKindValues);
export type CandidateLinkKind = z.infer<typeof CandidateLinkKindSchema>;

export const CandidateLinkSchema = z.object({
  id: NonEmptyStringSchema,
  label: NonEmptyStringSchema.nullable().default(null),
  url: UrlStringSchema.nullable().default(null),
  kind: CandidateLinkKindSchema.nullable().default(null),
  isDraft: z.boolean().default(false),
});
export type CandidateLink = z.infer<typeof CandidateLinkSchema>;

export const CandidateProjectSchema = z.object({
  id: NonEmptyStringSchema,
  name: NonEmptyStringSchema,
  projectType: NonEmptyStringSchema.nullable().default(null),
  summary: NonEmptyStringSchema.nullable().default(null),
  role: NonEmptyStringSchema.nullable().default(null),
  skills: z.array(NonEmptyStringSchema).default([]),
  outcome: NonEmptyStringSchema.nullable().default(null),
  projectUrl: NonEmptyStringSchema.nullable().default(null),
  repositoryUrl: NonEmptyStringSchema.nullable().default(null),
  caseStudyUrl: NonEmptyStringSchema.nullable().default(null),
});
export type CandidateProject = z.infer<typeof CandidateProjectSchema>;

export const CandidateLanguageSchema = z.object({
  id: NonEmptyStringSchema,
  language: NonEmptyStringSchema,
  proficiency: NonEmptyStringSchema.nullable().default(null),
  interviewPreference: z.boolean().default(false),
  notes: NonEmptyStringSchema.nullable().default(null),
});
export type CandidateLanguage = z.infer<typeof CandidateLanguageSchema>;

export const CandidateWorkEligibilitySchema = z.object({
  authorizedWorkCountries: z.array(NonEmptyStringSchema).default([]),
  requiresVisaSponsorship: z.boolean().nullable().default(null),
  willingToRelocate: z.boolean().nullable().default(null),
  preferredRelocationRegions: z.array(NonEmptyStringSchema).default([]),
  willingToTravel: z.boolean().nullable().default(null),
  remoteEligible: z.boolean().nullable().default(null),
  noticePeriodDays: z.number().int().min(0).nullable().default(null),
  availableStartDate: NonEmptyStringSchema.nullable().default(null),
  securityClearance: NonEmptyStringSchema.nullable().default(null),
});
export type CandidateWorkEligibility = z.infer<
  typeof CandidateWorkEligibilitySchema
>;

export const CandidateProfessionalSummarySchema = z.object({
  shortValueProposition: NonEmptyStringSchema.nullable().default(null),
  fullSummary: NonEmptyStringSchema.nullable().default(null),
  careerThemes: z.array(NonEmptyStringSchema).default([]),
  leadershipSummary: NonEmptyStringSchema.nullable().default(null),
  domainFocusSummary: NonEmptyStringSchema.nullable().default(null),
  strengths: z.array(NonEmptyStringSchema).default([]),
});
export type CandidateProfessionalSummary = z.infer<
  typeof CandidateProfessionalSummarySchema
>;

export const CandidateSkillGroupSchema = z.object({
  coreSkills: z.array(NonEmptyStringSchema).default([]),
  tools: z.array(NonEmptyStringSchema).default([]),
  languagesAndFrameworks: z.array(NonEmptyStringSchema).default([]),
  softSkills: z.array(NonEmptyStringSchema).default([]),
  highlightedSkills: z.array(NonEmptyStringSchema).default([]),
});
export type CandidateSkillGroup = z.infer<typeof CandidateSkillGroupSchema>;

export const CandidateProfileSchema = z.object({
  id: NonEmptyStringSchema,
  firstName: NonEmptyStringSchema,
  lastName: NonEmptyStringSchema,
  middleName: NonEmptyStringSchema.nullable().default(null),
  fullName: NonEmptyStringSchema,
  preferredDisplayName: NonEmptyStringSchema.nullable().default(null),
  headline: NonEmptyStringSchema,
  summary: NonEmptyStringSchema,
  currentLocation: NonEmptyStringSchema,
  currentCity: NonEmptyStringSchema.nullable().default(null),
  currentRegion: NonEmptyStringSchema.nullable().default(null),
  currentCountry: NonEmptyStringSchema.nullable().default(null),
  timeZone: NonEmptyStringSchema.nullable().default(null),
  yearsExperience: z.number().int().min(0),
  email: NonEmptyStringSchema.nullable().default(null),
  secondaryEmail: NonEmptyStringSchema.nullable().default(null),
  phone: NonEmptyStringSchema.nullable().default(null),
  portfolioUrl: NonEmptyStringSchema.nullable().default(null),
  linkedinUrl: NonEmptyStringSchema.nullable().default(null),
  githubUrl: NonEmptyStringSchema.nullable().default(null),
  personalWebsiteUrl: NonEmptyStringSchema.nullable().default(null),
  baseResume: ResumeSourceDocumentSchema,
  workEligibility: CandidateWorkEligibilitySchema.default({}),
  professionalSummary: CandidateProfessionalSummarySchema.default({}),
  skillGroups: CandidateSkillGroupSchema.default({}),
  targetRoles: z.array(NonEmptyStringSchema).default([]),
  locations: z.array(NonEmptyStringSchema).default([]),
  skills: z.array(NonEmptyStringSchema).default([]),
  experiences: z.array(CandidateExperienceSchema).default([]),
  education: z.array(CandidateEducationSchema).default([]),
  certifications: z.array(CandidateCertificationSchema).default([]),
  links: z.array(CandidateLinkSchema).default([]),
  projects: z.array(CandidateProjectSchema).default([]),
  spokenLanguages: z.array(CandidateLanguageSchema).default([]),
});
export type CandidateProfile = z.infer<typeof CandidateProfileSchema>;
