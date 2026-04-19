const DEFAULT_MODEL_CONTEXT_WINDOW_TOKENS = 196_000;
const APPROX_CHARS_PER_TOKEN = 3;
const INPUT_BUDGET_RATIO = 0.72;
const MIN_USER_PAYLOAD_CHARS = 8_000;

import {
  ResumeImportJsonValueSchema,
  type ResumeImportJsonValue,
} from "@unemployed/contracts";

export type OpenAiCompatibleJsonOperation =
  | "extractProfileFromResume"
  | "extractResumeImportStage"
  | "createResumeDraft"
  | "reviseResumeDraft"
  | "reviseCandidateProfile"
  | "tailorResume"
  | "assessJobFit"
  | "extractJobsFromPage";

function estimateSerializedLength(value: unknown): number {
  try {
    return JSON.stringify(value).length;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

function pickLevelValue(level: number, values: readonly number[]): number {
  const index = Math.max(0, Math.min(values.length - 1, level - 1));
  return values[index] ?? values[values.length - 1] ?? Number.MAX_SAFE_INTEGER;
}

function truncateMiddle(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }

  const omittedCount = value.length - maxChars;
  const marker = ` ...[truncated ${omittedCount} chars for model fit]... `;

  if (maxChars <= marker.length + 2) {
    return value.slice(0, maxChars);
  }

  const available = maxChars - marker.length;
  const headLength = Math.max(1, Math.ceil(available * 0.65));
  const tailLength = Math.max(1, available - headLength);

  return `${value.slice(0, headLength)}${marker}${value.slice(value.length - tailLength)}`;
}

function matchesPathSuffix(path: readonly string[], suffix: readonly string[]): boolean {
  if (suffix.length > path.length) {
    return false;
  }

  return suffix.every(
    (segment, index) => path[path.length - suffix.length + index] === segment,
  );
}

function stringLimitForPath(path: readonly string[], level: number): number {
  const key = path[path.length - 1] ?? "";

  if (!Number.isFinite(level) || level < 1) {
    return Number.MAX_SAFE_INTEGER;
  }

  if (
    key === "id" ||
    key === "jobId" ||
    key === "draftId" ||
    key === "runId" ||
    key === "recordId" ||
    key.endsWith("Id") ||
    key === "email" ||
    key === "phone" ||
    key === "pageUrl" ||
    key.endsWith("Url")
  ) {
    return 512;
  }

  if (key === "request") {
    return pickLevelValue(level, [16_000, 10_000, 6_000]);
  }

  if (key === "resumeText" || key === "textContent" || key === "fullText") {
    return pickLevelValue(level, [28_000, 16_000, 9_000]);
  }

  if (matchesPathSuffix(path, ["documentBundle", "blocks", "text"])) {
    return pickLevelValue(level, [2_400, 1_400, 800]);
  }

  if (key === "description") {
    return pickLevelValue(level, [12_000, 7_000, 4_000]);
  }

  if (key === "content") {
    return pickLevelValue(level, [6_000, 3_000, 1_600]);
  }

  if (key === "summary" || key.endsWith("Summary")) {
    return pickLevelValue(level, [2_400, 1_200, 700]);
  }

  if (key === "text" || key === "evidenceText") {
    return pickLevelValue(level, [1_400, 800, 500]);
  }

  if (key === "valuePreview" || key === "reason" || key === "supportingContext") {
    return pickLevelValue(level, [800, 500, 300]);
  }

  return pickLevelValue(level, [600, 360, 220]);
}

function arrayLimitForPath(path: readonly string[], level: number, value: readonly unknown[]): number {
  const key = path[path.length - 1] ?? "";
  const containsObjects = value.some(
    (entry) => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry),
  );

  if (!Number.isFinite(level) || level < 1) {
    return Number.MAX_SAFE_INTEGER;
  }

  if (matchesPathSuffix(path, ["documentBundle", "blocks"])) {
    return pickLevelValue(level, [32, 24, 20]);
  }

  if (key === "sections") {
    return pickLevelValue(level, [8, 7, 6]);
  }

  if (key === "entries") {
    return pickLevelValue(level, [8, 6, 4]);
  }

  if (key === "bullets") {
    return pickLevelValue(level, [8, 6, 4]);
  }

  if (key === "experiences") {
    return pickLevelValue(level, [8, 6, 4]);
  }

  if (key === "projects") {
    return pickLevelValue(level, [6, 4, 3]);
  }

  if (key === "education") {
    return pickLevelValue(level, [4, 4, 3]);
  }

  if (key === "certifications") {
    return pickLevelValue(level, [6, 4, 3]);
  }

  if (key === "links" || key === "targets") {
    return pickLevelValue(level, [10, 8, 6]);
  }

  if (key === "spokenLanguages" || key === "proofBank") {
    return pickLevelValue(level, [8, 6, 4]);
  }

  if (
    key === "validationIssues" ||
    key === "conversationFacts" ||
    key === "relevantReviewItems" ||
    key === "companyNotes" ||
    key === "domainVocabulary" ||
    key === "priorityThemes" ||
    key === "responsibilities" ||
    key === "minimumQualifications" ||
    key === "preferredQualifications" ||
    key === "benefits" ||
    key === "skills" ||
    key === "targetRoles" ||
    key === "locations" ||
    key === "excludedLocations" ||
    key === "jobFamilies" ||
    key === "targetIndustries" ||
    key === "targetCompanyStages" ||
    key === "employmentTypes" ||
    key === "companyBlacklist" ||
    key === "companyWhitelist" ||
    key === "experienceHighlights" ||
    key === "coreSkills" ||
    key === "targetedKeywords" ||
    key === "additionalSkills" ||
    key === "languages" ||
    key === "customAnswers" ||
    key === "notes" ||
    key === "warnings"
  ) {
    return pickLevelValue(level, [20, 12, 8]);
  }

  return containsObjects
    ? pickLevelValue(level, [12, 8, 6])
    : pickLevelValue(level, [20, 12, 8]);
}

function shouldDropKey(path: readonly string[], level: number): boolean {
  const key = path[path.length - 1] ?? "";

  if (level < 1) {
    return false;
  }

  if (key === "sourceRefs" || key === "alternatives" || key === "confidenceBreakdown") {
    return true;
  }

  if (level >= 2 && key === "analysisWarnings") {
    return true;
  }

  return false;
}

function compactValue(
  value: ResumeImportJsonValue,
  path: readonly string[],
  level: number,
): ResumeImportJsonValue {
  if (typeof value === "string") {
    return truncateMiddle(value, stringLimitForPath(path, level));
  }

  if (Array.isArray(value)) {
    const limited = value.slice(0, arrayLimitForPath(path, level, value));
    return limited.map((entry) => compactValue(entry, path, level));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const record = value as Record<string, ResumeImportJsonValue>;
  const nextRecord: Record<string, ResumeImportJsonValue> = {};

  for (const [key, nestedValue] of Object.entries(record)) {
    const nextPath = [...path, key];

    if (shouldDropKey(nextPath, level)) {
      continue;
    }

    nextRecord[key] = compactValue(nestedValue, nextPath, level);
  }

  return nextRecord;
}

function responseHeadroomTokensForOperation(
  operation: OpenAiCompatibleJsonOperation,
): number {
  switch (operation) {
    case "extractProfileFromResume":
    case "extractResumeImportStage":
    case "createResumeDraft":
    case "tailorResume":
      return 4_096;
    case "reviseResumeDraft":
    case "reviseCandidateProfile":
      return 2_048;
    case "assessJobFit":
    case "extractJobsFromPage":
      return 1_024;
  }
}

function computeUserPayloadCharBudget(input: {
  operation: OpenAiCompatibleJsonOperation;
  modelContextWindowTokens: number | null;
  systemPrompt: string;
}): number {
  const modelContextWindowTokens =
    input.modelContextWindowTokens ?? DEFAULT_MODEL_CONTEXT_WINDOW_TOKENS;
  const reservedOutputTokens = responseHeadroomTokensForOperation(input.operation);
  const promptTokens = Math.ceil(input.systemPrompt.length / APPROX_CHARS_PER_TOKEN);
  const availableInputTokens =
    Math.floor(modelContextWindowTokens * INPUT_BUDGET_RATIO) - reservedOutputTokens - promptTokens;

  if (availableInputTokens * APPROX_CHARS_PER_TOKEN < MIN_USER_PAYLOAD_CHARS) {
    throw new Error(
      `OpenAI-compatible request budget is too small for ${input.operation} after reserving prompt and response tokens.`,
    );
  }

  return Math.max(MIN_USER_PAYLOAD_CHARS, availableInputTokens * APPROX_CHARS_PER_TOKEN);
}

export function compactOpenAiCompatibleUserPayload(input: {
  operation: OpenAiCompatibleJsonOperation;
  modelContextWindowTokens: number | null;
  systemPrompt: string;
  userPayload: unknown;
}): ResumeImportJsonValue {
  const parsedPayload = ResumeImportJsonValueSchema.safeParse(input.userPayload);

  if (!parsedPayload.success) {
    throw new Error(
      `OpenAI-compatible payload for ${input.operation} must be JSON-serializable before compaction.`,
    );
  }

  const charBudget = computeUserPayloadCharBudget(input);
  const levelOneCompacted = compactValue(parsedPayload.data, [], 1);
  const levelOneSize = estimateSerializedLength(levelOneCompacted);

  if (levelOneSize <= charBudget) {
    return levelOneCompacted;
  }

  let lastCompacted: ResumeImportJsonValue = levelOneCompacted;

  for (const level of [2, 3]) {
    const compacted = compactValue(parsedPayload.data, [], level);
    lastCompacted = compacted;

    if (estimateSerializedLength(compacted) <= charBudget) {
      return compacted;
    }
  }

  if (estimateSerializedLength(lastCompacted) <= charBudget) {
    return lastCompacted;
  }

  throw new Error(
    `OpenAI-compatible payload exceeds charBudget after compaction for ${input.operation}.`,
  );
}
