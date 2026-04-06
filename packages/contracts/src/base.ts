import { z } from "zod";

export const IsoDateTimeSchema = z.string().datetime();
export const NonEmptyStringSchema = z.string().trim().min(1);
export const UrlStringSchema = z.string().trim().url();

export const suiteModules = ["job-finder", "interview-helper"] as const;
export type SuiteModule = (typeof suiteModules)[number];

export const applicationStatusValues = [
  "discovered",
  "shortlisted",
  "drafting",
  "ready_for_review",
  "approved",
  "submitted",
  "assessment",
  "interview",
  "rejected",
  "offer",
  "withdrawn",
  "archived",
] as const;

export const ApplicationStatusSchema = z.enum(applicationStatusValues);
export type ApplicationStatus = z.infer<typeof ApplicationStatusSchema>;

export const approvalModeValues = [
  "draft_only",
  "review_before_submit",
  "one_click_approve",
  "full_auto",
] as const;

export const ApprovalModeSchema = z.enum(approvalModeValues);
export type ApprovalMode = z.infer<typeof ApprovalModeSchema>;

export const tailoringModeValues = [
  "conservative",
  "balanced",
  "aggressive",
] as const;

export const TailoringModeSchema = z.enum(tailoringModeValues);
export type TailoringMode = z.infer<typeof TailoringModeSchema>;

export const appearanceThemeValues = ["dark", "light", "system"] as const;

export const AppearanceThemeSchema = z.enum(appearanceThemeValues);
export type AppearanceTheme = z.infer<typeof AppearanceThemeSchema>;

export const jobSourceValues = ["target_site"] as const;

function normalizeLegacyJobSource(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "generic_site" || normalized === "linkedin") {
    return "target_site";
  }

  return value;
}

export const JobSourceSchema = z.preprocess(
  normalizeLegacyJobSource,
  z.enum(jobSourceValues),
);
export type JobSource = z.infer<typeof JobSourceSchema>;

export const jobSourceAdapterKindValues = ["auto"] as const;

function normalizeLegacyJobSourceAdapterKind(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim().toLowerCase();

  if (
    normalized === "linkedin" ||
    normalized === "generic_site" ||
    normalized === "target_site"
  ) {
    return "auto";
  }

  return value;
}

export const JobSourceAdapterKindSchema = z.preprocess(
  normalizeLegacyJobSourceAdapterKind,
  z.enum(jobSourceAdapterKindValues),
);
export type JobSourceAdapterKind = z.infer<typeof JobSourceAdapterKindSchema>;

export const workModeValues = [
  "remote",
  "hybrid",
  "onsite",
  "flexible",
] as const;

export const WorkModeSchema = z.enum(workModeValues);
export type WorkMode = z.infer<typeof WorkModeSchema>;

function normalizeWorkModeValue(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "in_office" || normalized === "in office") {
    return "onsite";
  }

  return normalized;
}

export function normalizeWorkModeList(value: unknown): unknown {
  if (value == null) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map((entry) => normalizeWorkModeValue(entry));
  }

  if (typeof value === "string") {
    if (!value.trim()) return [];
    return value.split(/\s*,\s*/).filter(Boolean).map(normalizeWorkModeValue);
  }

  return value;
}

export const WorkModeListSchema = z.preprocess(
  normalizeWorkModeList,
  z.array(WorkModeSchema).default([]),
);

export const jobApplyPathValues = [
  "easy_apply",
  "external_redirect",
  "unknown",
] as const;

export const JobApplyPathSchema = z.enum(jobApplyPathValues);
export type JobApplyPath = z.infer<typeof JobApplyPathSchema>;

export const assetStatusValues = [
  "not_started",
  "queued",
  "generating",
  "ready",
  "failed",
] as const;

export const AssetStatusSchema = z.enum(assetStatusValues);
export type AssetStatus = z.infer<typeof AssetStatusSchema>;

export const browserSessionStatusValues = [
  "unknown",
  "ready",
  "login_required",
  "blocked",
] as const;

export const BrowserSessionStatusSchema = z.enum(browserSessionStatusValues);
export type BrowserSessionStatus = z.infer<typeof BrowserSessionStatusSchema>;

export const browserDriverValues = [
  "catalog_seed",
  "chrome_profile_agent",
] as const;

export const BrowserDriverSchema = z.enum(browserDriverValues);
export type BrowserDriver = z.infer<typeof BrowserDriverSchema>;

export const resumeExtractionStatusValues = [
  "not_started",
  "needs_text",
  "ready",
  "failed",
] as const;

export const ResumeExtractionStatusSchema = z.enum(
  resumeExtractionStatusValues,
);
export type ResumeExtractionStatus = z.infer<
  typeof ResumeExtractionStatusSchema
>;

export const jobDiscoveryMethodValues = [
  "catalog_seed",
  "browser_agent",
] as const;

export const JobDiscoveryMethodSchema = z.enum(jobDiscoveryMethodValues);
export type JobDiscoveryMethod = z.infer<typeof JobDiscoveryMethodSchema>;

export const discoveryRunStateValues = [
  "idle",
  "running",
  "completed",
  "cancelled",
  "failed",
] as const;

export const DiscoveryRunStateSchema = z.enum(discoveryRunStateValues);
export type DiscoveryRunState = z.infer<typeof DiscoveryRunStateSchema>;

export const sourceDebugRunStateValues = [
  "idle",
  "running",
  "paused_manual",
  "completed",
  "cancelled",
  "failed",
  "interrupted",
] as const;

export const SourceDebugRunStateSchema = z.enum(sourceDebugRunStateValues);
export type SourceDebugRunState = z.infer<typeof SourceDebugRunStateSchema>;

export const sourceDebugPhaseValues = [
  "access_auth_probe",
  "site_structure_mapping",
  "search_filter_probe",
  "job_detail_validation",
  "apply_path_validation",
  "replay_verification",
] as const;

export const SourceDebugPhaseSchema = z.enum(sourceDebugPhaseValues);
export type SourceDebugPhase = z.infer<typeof SourceDebugPhaseSchema>;

export const browserRunWaitReasonValues = [
  "starting_browser",
  "attaching_browser",
  "waiting_on_page",
  "waiting_on_ai",
  "retrying_ai",
  "executing_tool",
  "retrying_tool",
  "extracting_jobs",
  "merging_results",
  "persisting_results",
  "manual_prerequisite",
  "finalizing",
] as const;

export const BrowserRunWaitReasonSchema = z.enum(browserRunWaitReasonValues);
export type BrowserRunWaitReason = z.infer<typeof BrowserRunWaitReasonSchema>;

export const sourceDebugAttemptOutcomeValues = [
  "succeeded",
  "partial",
  "blocked_auth",
  "blocked_manual_step",
  "blocked_site_protection",
  "unsupported_layout",
  "exhausted_duplicate_paths",
  "exhausted_no_progress",
  "failed_runtime",
  "interrupted",
] as const;

export const SourceDebugAttemptOutcomeSchema = z.enum(
  sourceDebugAttemptOutcomeValues,
);
export type SourceDebugAttemptOutcome = z.infer<
  typeof SourceDebugAttemptOutcomeSchema
>;

export const sourceDebugPhaseCompletionModeValues = [
  "structured_finish",
  "forced_finish",
  "timed_out_with_partial_evidence",
  "timed_out_without_evidence",
  "blocked_auth",
  "blocked_manual_step",
  "blocked_site_protection",
  "runtime_failed",
  "interrupted",
] as const;

export const SourceDebugPhaseCompletionModeSchema = z.enum(
  sourceDebugPhaseCompletionModeValues,
);
export type SourceDebugPhaseCompletionMode = z.infer<
  typeof SourceDebugPhaseCompletionModeSchema
>;

export const sourceInstructionStatusValues = [
  "missing",
  "draft",
  "validated",
  "stale",
  "unsupported",
] as const;

export const SourceInstructionStatusSchema = z.enum(
  sourceInstructionStatusValues,
);
export type SourceInstructionStatus = z.infer<
  typeof SourceInstructionStatusSchema
>;

export const sourceInstructionVerificationOutcomeValues = [
  "unverified",
  "passed",
  "failed",
  "stale",
] as const;

export const SourceInstructionVerificationOutcomeSchema = z.enum(
  sourceInstructionVerificationOutcomeValues,
);
export type SourceInstructionVerificationOutcome = z.infer<
  typeof SourceInstructionVerificationOutcomeSchema
>;

export const sourceDebugEvidenceKindValues = [
  "url",
  "screenshot",
  "note",
] as const;

export const SourceDebugEvidenceKindSchema = z.enum(
  sourceDebugEvidenceKindValues,
);
export type SourceDebugEvidenceKind = z.infer<
  typeof SourceDebugEvidenceKindSchema
>;

export const discoveryTargetExecutionStateValues = [
  "planned",
  "running",
  "completed",
  "cancelled",
  "failed",
  "skipped",
] as const;

export const DiscoveryTargetExecutionStateSchema = z.enum(
  discoveryTargetExecutionStateValues,
);
export type DiscoveryTargetExecutionState = z.infer<
  typeof DiscoveryTargetExecutionStateSchema
>;

export const discoveryActivityKindValues = [
  "info",
  "progress",
  "warning",
  "success",
  "error",
] as const;

export const DiscoveryActivityKindSchema = z.enum(discoveryActivityKindValues);
export type DiscoveryActivityKind = z.infer<typeof DiscoveryActivityKindSchema>;

export const discoveryActivityTerminalStateValues = [
  "completed",
  "failed",
  "cancelled",
  "skipped",
] as const;

export const DiscoveryActivityTerminalStateSchema = z.enum(
  discoveryActivityTerminalStateValues,
);
export type DiscoveryActivityTerminalState = z.infer<
  typeof DiscoveryActivityTerminalStateSchema
>;

export const discoveryActivityStageValues = [
  "planning",
  "target",
  "navigation",
  "extraction",
  "scoring",
  "persistence",
  "run",
] as const;

export const DiscoveryActivityStageSchema = z.enum(
  discoveryActivityStageValues,
);
export type DiscoveryActivityStage = z.infer<
  typeof DiscoveryActivityStageSchema
>;

export const assetGenerationMethodValues = [
  "deterministic",
  "ai_assisted",
] as const;

export const AssetGenerationMethodSchema = z.enum(assetGenerationMethodValues);
export type AssetGenerationMethod = z.infer<typeof AssetGenerationMethodSchema>;

export const aiProviderKindValues = [
  "deterministic",
  "openai_compatible",
] as const;

export const AiProviderKindSchema = z.enum(aiProviderKindValues);
export type AiProviderKind = z.infer<typeof AiProviderKindSchema>;

export const applicationAttemptStateValues = [
  "not_started",
  "ready",
  "in_progress",
  "paused",
  "submitted",
  "failed",
  "unsupported",
] as const;

export const ApplicationAttemptStateSchema = z.enum(
  applicationAttemptStateValues,
);
export type ApplicationAttemptState = z.infer<
  typeof ApplicationAttemptStateSchema
>;

export const documentFormatValues = ["html", "pdf", "docx"] as const;

export const DocumentFormatSchema = z.enum(documentFormatValues);
export type DocumentFormat = z.infer<typeof DocumentFormatSchema>;

export const resumeTemplateIdValues = [
  "classic_ats",
  "modern_split",
  "compact_exec",
] as const;

export const ResumeTemplateIdSchema = z.enum(resumeTemplateIdValues);
export type ResumeTemplateId = z.infer<typeof ResumeTemplateIdSchema>;

export const documentFontPresetValues = [
  "inter_requisite",
  "space_grotesk_display",
] as const;

export const DocumentFontPresetSchema = z.enum(documentFontPresetValues);
export type DocumentFontPreset = z.infer<typeof DocumentFontPresetSchema>;

export const applicationEventEmphasisValues = [
  "neutral",
  "positive",
  "warning",
  "critical",
] as const;

export const ApplicationEventEmphasisSchema = z.enum(
  applicationEventEmphasisValues,
);
export type ApplicationEventEmphasis = z.infer<
  typeof ApplicationEventEmphasisSchema
>;
