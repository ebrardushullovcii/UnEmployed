import {
  type AgentProviderStatus,
  NonEmptyStringSchema,
  ResumeDraftPatchSchema,
  candidateLinkKindValues,
  type CandidateProfile,
  type JobFinderSettings,
  type JobPosting,
  type JobSearchPreferences,
  type ResumeDraft,
  type Tool,
  type ToolCall,
  workModeValues,
} from "@unemployed/contracts";
import { z } from "zod";

const NullableStringSchema = NonEmptyStringSchema.nullable().default(null);

const ResumeExtractionProfessionalSummarySchema = z.object({
  shortValueProposition: NullableStringSchema,
  fullSummary: NullableStringSchema,
  careerThemes: z.array(NonEmptyStringSchema).default([]),
  leadershipSummary: NullableStringSchema,
  domainFocusSummary: NullableStringSchema,
  strengths: z.array(NonEmptyStringSchema).default([]),
});

const ResumeExtractionSkillGroupSchema = z.object({
  coreSkills: z.array(NonEmptyStringSchema).default([]),
  tools: z.array(NonEmptyStringSchema).default([]),
  languagesAndFrameworks: z.array(NonEmptyStringSchema).default([]),
  softSkills: z.array(NonEmptyStringSchema).default([]),
  highlightedSkills: z.array(NonEmptyStringSchema).default([]),
});

const ResumeExtractionExperienceSchema = z.object({
  companyName: NullableStringSchema,
  companyUrl: NullableStringSchema,
  title: NullableStringSchema,
  employmentType: NullableStringSchema,
  location: NullableStringSchema,
  workMode: z.enum(workModeValues).nullable().default(null),
  startDate: NullableStringSchema,
  endDate: NullableStringSchema,
  isCurrent: z.boolean().default(false),
  summary: NullableStringSchema,
  achievements: z.array(NonEmptyStringSchema).default([]),
  skills: z.array(NonEmptyStringSchema).default([]),
  domainTags: z.array(NonEmptyStringSchema).default([]),
  peopleManagementScope: NullableStringSchema,
  ownershipScope: NullableStringSchema,
});

const ResumeExtractionEducationSchema = z.object({
  schoolName: NullableStringSchema,
  degree: NullableStringSchema,
  fieldOfStudy: NullableStringSchema,
  location: NullableStringSchema,
  startDate: NullableStringSchema,
  endDate: NullableStringSchema,
  summary: NullableStringSchema,
});

const ResumeExtractionCertificationSchema = z.object({
  name: NullableStringSchema,
  issuer: NullableStringSchema,
  issueDate: NullableStringSchema,
  expiryDate: NullableStringSchema,
  credentialUrl: NullableStringSchema,
});

const ResumeExtractionLinkSchema = z.object({
  label: NullableStringSchema,
  url: NullableStringSchema,
  kind: z.enum(candidateLinkKindValues).nullable().default(null),
});

const ResumeExtractionProjectSchema = z.object({
  name: NullableStringSchema,
  projectType: NullableStringSchema,
  summary: NullableStringSchema,
  role: NullableStringSchema,
  skills: z.array(NonEmptyStringSchema).default([]),
  outcome: NullableStringSchema,
  projectUrl: NullableStringSchema,
  repositoryUrl: NullableStringSchema,
  caseStudyUrl: NullableStringSchema,
});

const ResumeExtractionLanguageSchema = z.object({
  language: NullableStringSchema,
  proficiency: NullableStringSchema,
  interviewPreference: z.boolean().default(false),
  notes: NullableStringSchema,
});

export const ResumeProfileExtractionSchema = z.object({
  firstName: NullableStringSchema,
  lastName: NullableStringSchema,
  middleName: NullableStringSchema,
  fullName: NullableStringSchema,
  headline: NullableStringSchema,
  summary: NullableStringSchema,
  currentLocation: NullableStringSchema,
  timeZone: NullableStringSchema,
  salaryCurrency: NullableStringSchema,
  yearsExperience: z.number().int().min(0).nullable().optional(),
  email: NullableStringSchema,
  phone: NullableStringSchema,
  portfolioUrl: NullableStringSchema,
  linkedinUrl: NullableStringSchema,
  githubUrl: NullableStringSchema,
  personalWebsiteUrl: NullableStringSchema,
  professionalSummary: ResumeExtractionProfessionalSummarySchema.default({}),
  skillGroups: ResumeExtractionSkillGroupSchema.default({}),
  skills: z.array(NonEmptyStringSchema).default([]),
  targetRoles: z.array(NonEmptyStringSchema).default([]),
  preferredLocations: z.array(NonEmptyStringSchema).default([]),
  experiences: z.array(ResumeExtractionExperienceSchema).default([]),
  education: z.array(ResumeExtractionEducationSchema).default([]),
  certifications: z.array(ResumeExtractionCertificationSchema).default([]),
  links: z.array(ResumeExtractionLinkSchema).default([]),
  projects: z.array(ResumeExtractionProjectSchema).default([]),
  spokenLanguages: z.array(ResumeExtractionLanguageSchema).default([]),
  analysisProviderKind: z.enum(["deterministic", "openai_compatible"]),
  analysisProviderLabel: NonEmptyStringSchema,
  notes: z.array(NonEmptyStringSchema).default([]),
});

export type ResumeProfileExtraction = z.infer<
  typeof ResumeProfileExtractionSchema
>;

export const TailoredResumeDraftSchema = z.object({
  label: NullableStringSchema,
  summary: NonEmptyStringSchema,
  experienceHighlights: z.array(NonEmptyStringSchema).min(1),
  coreSkills: z.array(NonEmptyStringSchema).default([]),
  targetedKeywords: z.array(NonEmptyStringSchema).default([]),
  fullText: NonEmptyStringSchema,
  compatibilityScore: z.number().int().min(0).max(100).nullable(),
  notes: z.array(NonEmptyStringSchema).default([]),
});

export type TailoredResumeDraft = z.infer<typeof TailoredResumeDraftSchema>;

export const JobFitAssessmentSchema = z.object({
  score: z.number().int().min(0).max(100),
  reasons: z.array(NonEmptyStringSchema).default([]),
  gaps: z.array(NonEmptyStringSchema).default([]),
});

export type JobFitAssessment = z.infer<typeof JobFitAssessmentSchema>;

export const OpenAiCompatibleJobFinderAiClientOptionsSchema = z.object({
  apiKey: NonEmptyStringSchema,
  baseUrl: z.string().trim().url(),
  model: NonEmptyStringSchema,
  label: NonEmptyStringSchema.optional(),
});

export interface ExtractProfileFromResumeInput {
  existingProfile: CandidateProfile;
  existingSearchPreferences: JobSearchPreferences;
  resumeText: string;
}

export interface TailorResumeInput {
  profile: CandidateProfile;
  searchPreferences: JobSearchPreferences;
  settings: JobFinderSettings;
  job: JobPosting;
  resumeText: string | null;
}

export interface CreateResumeDraftInput extends TailorResumeInput {
  evidence?: {
    summary: readonly string[];
    candidateSummary: readonly string[];
    experience: readonly string[];
    skills: readonly string[];
    keywords: readonly string[];
  };
  researchContext?: {
    companyNotes: readonly string[];
    domainVocabulary: readonly string[];
    priorityThemes: readonly string[];
  };
}

export const ResumeAssistantReplySchema = z.object({
  content: NonEmptyStringSchema,
  patches: z.array(ResumeDraftPatchSchema).default([]),
});
export type ResumeAssistantReply = z.infer<typeof ResumeAssistantReplySchema>;

export interface ReviseResumeDraftInput {
  draft: ResumeDraft;
  job: JobPosting;
  request: string;
  validationIssues?: readonly string[];
  researchContext?: {
    companyNotes: readonly string[];
    domainVocabulary: readonly string[];
    priorityThemes: readonly string[];
  };
}

export interface AssessJobFitInput {
  profile: CandidateProfile;
  searchPreferences: JobSearchPreferences;
  job: JobPosting;
}

export interface ExtractJobsFromPageInput {
  pageText: string;
  pageUrl: string;
  pageType: "search_results" | "job_detail";
  maxJobs: number;
}

export type AgentMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[] }
  | { role: "tool"; toolCallId: string; content: string };

export interface JobFinderAiClient {
  getStatus(): AgentProviderStatus;
  extractProfileFromResume(
    input: ExtractProfileFromResumeInput,
  ): Promise<ResumeProfileExtraction>;
  createResumeDraft(input: CreateResumeDraftInput): Promise<TailoredResumeDraft>;
  reviseResumeDraft(input: ReviseResumeDraftInput): Promise<ResumeAssistantReply>;
  tailorResume(input: TailorResumeInput): Promise<TailoredResumeDraft>;
  assessJobFit(input: AssessJobFitInput): Promise<JobFitAssessment | null>;
  extractJobsFromPage(input: ExtractJobsFromPageInput): Promise<JobPosting[]>;
  chatWithTools?: AgentCapableJobFinderAiClient["chatWithTools"];
}

export interface AgentCapableJobFinderAiClient extends JobFinderAiClient {
  chatWithTools(
    messages: AgentMessage[],
    tools: Tool[],
    signal?: AbortSignal,
  ): Promise<{
    content?: string;
    toolCalls?: ToolCall[];
    reasoning?: string;
  }>;
}

export type OpenAiCompatibleJobFinderAiClientOptions = z.infer<
  typeof OpenAiCompatibleJobFinderAiClientOptionsSchema
>;

export type StringMap = Record<string, string | undefined>;
