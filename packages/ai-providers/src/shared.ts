import {
  AssetGenerationReasonSchema,
  type AiProfileAssistantBehavior,
  type AgentProviderStatus,
  AgentTaskExecutionReceiptSchema,
  BrowserVisualObservationSetSchema,
  type BrowserVisualAnalysisInput,
  type BrowserVisualObservationSet,
  NonEmptyStringSchema,
  type ProfileCopilotContext,
  type ProfileCopilotRelevantReviewItem,
  type ProfileCopilotReply,
  type ResumeDocumentBundle,
  type ResumeCareerFamilyFit,
  type ResumeCoverageClassification,
  ResumeDraftPatchSchema,
  TailoredResumeCoverageMetadataSchema,
  type TailoredResumeCoverageMetadata,
  WorkModeListSchema,
  candidateLinkKindValues,
  type CandidateProfile,
  type JobFinderSettings,
  type JobPosting,
  type JobSearchPreferences,
  type ResumeDraft,
  type ResumeTemplateDefinition,
  type ResumeValidationIssue,
  ResumeStrategyCoveragePolicySchema,
  ResumeStrategyEvidenceBoundariesSchema,
  ResumeStrategyHeadlinePolicySchema,
  ResumeStrategyRecommendationSourceSchema,
  ResumeStrategySkillsPolicySchema,
  ResumeTemplateIdSchema,
  TailoringModeSchema,
  type TailoringMode,
  type Tool,
  type ToolCall,
} from "@unemployed/contracts";
import { z } from "zod";
import {
  modelApiModes,
  modelReasoningEfforts,
} from "./openai-compatible-transport";
import type {
  AdjudicateResumeImportCandidatesInput,
  ExtractResumeImportStageInput,
  ResumeImportAdjudicationResult,
  ResumeImportStageExtractionResult,
} from "./resume-import";

const NullableStringSchema = NonEmptyStringSchema.nullable().default(null);
const ResumeExtractionWorkModeSchema = z.preprocess((value) => {
  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.map((entry): unknown => entry);
  }

  return [];
}, WorkModeListSchema);

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
  workMode: ResumeExtractionWorkModeSchema,
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

export type {
  ResumeCareerFamilyFit,
  ResumeCoverageClassification,
  TailoredResumeCoverageMetadata,
};

export const TailoredResumeGenerationProvenanceSchema = z.object({
  method: z.enum(["ai", "deterministic"]),
  reason: AssetGenerationReasonSchema.nullable().default(null),
  detail: NullableStringSchema,
});
export type TailoredResumeGenerationProvenance = z.infer<
  typeof TailoredResumeGenerationProvenanceSchema
>;

export const TailoredResumeDraftSchema = z.object({
  recommendedTemplateId: ResumeTemplateIdSchema.nullable().optional(),
  label: NullableStringSchema,
  summary: NonEmptyStringSchema,
  experienceHighlights: z.array(NonEmptyStringSchema).default([]),
  coreSkills: z.array(NonEmptyStringSchema).default([]),
  targetedKeywords: z.array(NonEmptyStringSchema).default([]),
  experienceEntries: z
    .array(
      z.object({
        title: NullableStringSchema,
        employer: NullableStringSchema,
        location: NullableStringSchema,
        dateRange: NullableStringSchema,
        summary: NullableStringSchema,
        bullets: z.array(NonEmptyStringSchema).default([]),
        profileRecordId: NullableStringSchema,
      }),
    )
    .default([]),
  projectEntries: z
    .array(
      z.object({
        name: NullableStringSchema,
        role: NullableStringSchema,
        summary: NullableStringSchema,
        outcome: NullableStringSchema,
        bullets: z.array(NonEmptyStringSchema).default([]),
        profileRecordId: NullableStringSchema,
      }),
    )
    .default([]),
  educationEntries: z
    .array(
      z.object({
        school: NullableStringSchema,
        degree: NullableStringSchema,
        fieldOfStudy: NullableStringSchema,
        location: NullableStringSchema,
        dateRange: NullableStringSchema,
        summary: NullableStringSchema,
        profileRecordId: NullableStringSchema,
      }),
    )
    .default([]),
  certificationEntries: z
    .array(
      z.object({
        name: NullableStringSchema,
        issuer: NullableStringSchema,
        dateRange: NullableStringSchema,
        profileRecordId: NullableStringSchema,
      }),
    )
    .default([]),
  coverageMetadata: z.array(TailoredResumeCoverageMetadataSchema).default([]),
  additionalSkills: z.array(NonEmptyStringSchema).default([]),
  languages: z.array(NonEmptyStringSchema).default([]),
  fullText: NonEmptyStringSchema,
  compatibilityScore: z.number().int().min(0).max(100).nullable(),
  generationQuality: z
    .object({
      strategy: z.enum(["deterministic", "evidence_linked"]),
      proposedRewriteCount: z.number().int().min(0),
      acceptedRewriteCount: z.number().int().min(0),
      rejectedRewriteCount: z.number().int().min(0),
      acceptedRewriteCharacters: z.number().int().min(0),
    })
    .optional(),
  /**
   * Structured provenance recorded by the boundary that chose the generation
   * path. Product code must read this instead of string-matching note prose.
   */
  generationProvenance: TailoredResumeGenerationProvenanceSchema.optional(),
  notes: z.array(NonEmptyStringSchema).default([]),
});

export type TailoredResumeDraft = z.infer<typeof TailoredResumeDraftSchema>;

/**
 * The resolved, enabled resume strategy that the generation boundary is
 * allowed to consume. Selection and recommendation provenance stay attached so
 * generated artifacts can explain which policy was used without granting any
 * approval or application authority.
 */
export const ResumeGenerationStrategyPolicySchema = z
  .object({
    strategyId: NonEmptyStringSchema,
    strategyName: NonEmptyStringSchema,
    roleFamily: NonEmptyStringSchema,
    baseResumeDocumentId: NonEmptyStringSchema,
    templateId: ResumeTemplateIdSchema,
    headlinePolicy: ResumeStrategyHeadlinePolicySchema,
    skillsPolicy: ResumeStrategySkillsPolicySchema,
    coveragePolicy: ResumeStrategyCoveragePolicySchema,
    tailoringStrength: TailoringModeSchema,
    evidenceBoundaries: ResumeStrategyEvidenceBoundariesSchema,
    effectiveSource: z.enum(["selection", "recommendation"]),
    effectiveReason: NonEmptyStringSchema,
    recommendationSource: ResumeStrategyRecommendationSourceSchema,
    recommendationReason: NonEmptyStringSchema.nullable().default(null),
    selectionSource: z
      .enum(["user", "campaign_default", "rule_match"])
      .nullable()
      .default(null),
    selectionReason: NonEmptyStringSchema.nullable().default(null),
  })
  .strict();
export type ResumeGenerationStrategyPolicy = z.infer<
  typeof ResumeGenerationStrategyPolicySchema
>;

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
  apiMode: z.enum(modelApiModes).optional(),
  reasoningEffort: z.enum(modelReasoningEfforts).optional(),
  /**
   * Effort for the many short turns of a browser agent (search, source
   * check, apply) and for reading a page's job list. These are "what do I
   * press next" decisions; deep reasoning on each one made a search take
   * minutes per page. Resume writing keeps `reasoningEffort`.
   */
  agentReasoningEffort: z.enum(modelReasoningEfforts).optional(),
  contextWindowTokens: z.number().int().min(1_000).optional(),
  requestTimeoutMs: z.number().int().min(1_000).optional(),
  resumeExtractionTimeoutMs: z.number().int().min(1_000).optional(),
  /** Longest silence tolerated on a streamed request before it is retried. */
  idleTimeoutMs: z.number().int().min(1_000).optional(),
  /** Attempts per logical request, including the first. */
  maxAttempts: z.number().int().min(1).max(10).optional(),
  /** Stream responses (server-sent events) for liveness. Default true. */
  streaming: z.boolean().optional(),
  retryBaseDelayMs: z.number().int().min(0).optional(),
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
  availableTemplates?: readonly ResumeTemplateDefinition[];
  selectedTemplateId?: string | null;
  templateSelectionLocked?: boolean;
  renderPreview?: (input: {
    draft: TailoredResumeDraft;
    templateId: string;
  }) => Promise<{
    templateId: string;
    pageCount: number | null;
    warnings: readonly string[];
    fileName: string | null;
    requiredModelRepairs?: readonly ResumeValidationIssue[];
    personConfirmationCount?: number;
  }>;
  strategy?: ResumeGenerationStrategyPolicy | null;
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
  executionReceipt: AgentTaskExecutionReceiptSchema.nullable().optional(),
});
export type ResumeAssistantReply = z.infer<typeof ResumeAssistantReplySchema>;

export interface ReviseResumeDraftInput {
  draft: ResumeDraft;
  job: JobPosting;
  request: string;
  validationIssues?: readonly string[];
  /**
   * The job's effective tailoring strength when known. Model-backed review
   * and section-regeneration passes route through the aggressive model for
   * aggressive drafts so the whole lifecycle stays on one provider; when
   * absent the primary provider is used.
   */
  tailoringStrength?: TailoringMode | null;
  researchContext?: {
    companyNotes: readonly string[];
    domainVocabulary: readonly string[];
    priorityThemes: readonly string[];
  };
}

export interface ReviseCandidateProfileInput {
  profile: CandidateProfile;
  searchPreferences: JobSearchPreferences;
  context: ProfileCopilotContext;
  relevantReviewItems: readonly ProfileCopilotRelevantReviewItem[];
  request: string;
  conversationFacts?: readonly string[];
  /** The saved AI behavior for the Profile chat (Settings). */
  assistantBehavior?: AiProfileAssistantBehavior;
}

/**
 * The Profile chat's saved behavior, as prompt sentences.
 *
 * Absent behavior means the product's original manner: propose the edits the
 * request implies and keep replies short. Each sentence changes what the
 * assistant volunteers or how long it talks, never what it may invent.
 */
export function describeProfileAssistantBehavior(
  behavior: AiProfileAssistantBehavior | undefined,
): string[] {
  const initiative = behavior?.initiative ?? "suggest";
  const replyStyle = behavior?.replyStyle ?? "brief";
  return [
    initiative === "answer_only"
      ? "Do only what the person asked. Do not volunteer other edits, gaps, or advice; if you notice something else, at most mention it in one clause and leave it."
      : initiative === "proactive"
        ? "Be proactive: after doing what was asked, also propose the further profile improvements the saved facts support (gaps, weak wording, missing strengths), each as its own reviewable change with a one-line reason."
        : "Do what the person asked, and propose one closely related improvement when the saved facts clearly support it; otherwise stop there.",
    replyStyle === "conversational"
      ? "Reply in a conversational tone with the reasoning behind each change, a short paragraph at most."
      : "Reply briefly: one or two plain sentences that say what changed or what you found, with no preamble.",
  ];
}

/** User-facing Settings names that differ from stored preference values. */
export const PROFILE_RESUME_APPROACH_VOCABULARY =
  "When the person asks to change the default resume approach, map the Settings names Light to tailoringMode conservative, Tailored to tailoringMode balanced, and Aggressive to tailoringMode aggressive. Original is a separate Settings choice and cannot be changed through a profile search-preference patch.";

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
  signal?: AbortSignal;
}

export const BrowserVisualAnalysisResultSchema =
  BrowserVisualObservationSetSchema;
export type BrowserVisualAnalysisResult = z.infer<
  typeof BrowserVisualAnalysisResultSchema
>;

export type { BrowserVisualAnalysisInput, BrowserVisualObservationSet };

export interface ExtractResumeImportStageTransportInput extends ExtractResumeImportStageInput {
  documentBundle: ResumeDocumentBundle;
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
  extractResumeImportStage(
    input: ExtractResumeImportStageTransportInput,
  ): Promise<ResumeImportStageExtractionResult>;
  adjudicateResumeImportCandidates?(
    input: AdjudicateResumeImportCandidatesInput,
  ): Promise<ResumeImportAdjudicationResult>;
  createResumeDraft(
    input: CreateResumeDraftInput,
  ): Promise<TailoredResumeDraft>;
  reviseResumeDraft(
    input: ReviseResumeDraftInput,
  ): Promise<ResumeAssistantReply>;
  reviseCandidateProfile(
    input: ReviseCandidateProfileInput,
  ): Promise<ProfileCopilotReply>;
  tailorResume(input: TailorResumeInput): Promise<TailoredResumeDraft>;
  assessJobFit(input: AssessJobFitInput): Promise<JobFitAssessment | null>;
  extractJobsFromPage(input: ExtractJobsFromPageInput): Promise<JobPosting[]>;
  analyzeBrowserVisualSnapshot?(
    input: BrowserVisualAnalysisInput,
  ): Promise<BrowserVisualObservationSet>;
  chatWithTools?: AgentCapableJobFinderAiClient["chatWithTools"];
}

export interface ChatWithToolsOptions {
  signal?: AbortSignal;
  maxOutputTokens?: number;
  /** Which product conversation this turn continues; see model-request-identity. */
  conversationKey?: string;
}

export interface AgentCapableJobFinderAiClient extends JobFinderAiClient {
  chatWithTools(
    messages: AgentMessage[],
    tools: Tool[],
    options?: ChatWithToolsOptions,
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
