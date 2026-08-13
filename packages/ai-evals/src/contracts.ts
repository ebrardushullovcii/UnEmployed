import { z } from "zod";

export const evalCapabilityValues = [
  "resume_text_import",
  "resume_vision",
  "resume_generation",
  "guided_resume_edits",
  "profile_copilot",
  "job_page_extraction",
  "agentic_job_discovery",
  "source_debug",
  "browser_visual_analysis",
  "interview_cue",
  "interview_screenshot_vision",
] as const;

export const EvalCapabilitySchema = z.enum(evalCapabilityValues);
export type EvalCapability = z.infer<typeof EvalCapabilitySchema>;

export const evalLaneValues = [
  "luna_high",
  "luna_max",
  "sol_low",
  "codex_agent_reference",
] as const;

export const EvalLaneIdSchema = z.enum(evalLaneValues);
export type EvalLaneId = z.infer<typeof EvalLaneIdSchema>;

export const EvalLaneSchema = z.object({
  id: EvalLaneIdSchema,
  model: z.string().min(1),
  reasoningEffort: z.enum(["low", "medium", "high", "max"]),
  apiMode: z.literal("responses"),
  kind: z.enum(["system", "codex_agent_reference"]),
});
export type EvalLane = z.infer<typeof EvalLaneSchema>;

export const EvalRubricDimensionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  weight: z.number().positive(),
  kind: z.enum(["objective", "qualitative", "safety"]),
});

const JsonValueSchema: z.ZodType<
  null | boolean | number | string | unknown[] | Record<string, unknown>
> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number(),
    z.string(),
    z.array(JsonValueSchema),
    z.record(JsonValueSchema),
  ]),
);

export const EvalCaseSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  capability: EvalCapabilitySchema,
  title: z.string().min(1),
  description: z.string().min(1),
  privacy: z.enum(["synthetic", "public_frozen"]),
  input: JsonValueSchema,
  expected: JsonValueSchema,
  forbiddenClaims: z.array(z.string().min(1)).default([]),
  rubric: z.array(EvalRubricDimensionSchema).min(1),
});
export type EvalCase = z.infer<typeof EvalCaseSchema>;

export const EvalHttpCaptureSchema = z.object({
  sequence: z.number().int().positive(),
  startedAt: z.string().datetime(),
  durationMs: z.number().nonnegative(),
  url: z.string().url(),
  method: z.string().min(1),
  requestBody: z.string(),
  responseStatus: z.number().int().nullable(),
  responseBody: z.string().nullable(),
  error: z.string().nullable(),
});
export type EvalHttpCapture = z.infer<typeof EvalHttpCaptureSchema>;

export const EvalAttemptSchema = z.object({
  runId: z.string().min(1),
  caseId: z.string().min(1),
  laneId: EvalLaneIdSchema,
  startedAt: z.string().datetime(),
  durationMs: z.number().nonnegative(),
  status: z.enum([
    "succeeded",
    "fallback_succeeded",
    "failed",
    "unsupported",
    "timed_out",
  ]),
  providerCallCount: z.number().int().nonnegative(),
  fallbackDetected: z.boolean(),
  guardedRejectionDetected: z.boolean(),
  rawHttp: z.array(EvalHttpCaptureSchema),
  modelOutput: JsonValueSchema.nullable(),
  productOutput: JsonValueSchema.nullable(),
  error: z.string().nullable(),
});
export type EvalAttempt = z.infer<typeof EvalAttemptSchema>;

export const EvalOutputGradeSchema = z.object({
  expectedEvidenceScore: z.number().min(0).max(100),
  forbiddenClaimCount: z.number().int().nonnegative(),
  observedExpectedItems: z.number().int().nonnegative(),
  totalExpectedItems: z.number().int().nonnegative(),
});

export const EvalGradeSchema = z.object({
  caseId: z.string().min(1),
  laneId: EvalLaneIdSchema,
  statusScore: z.number().min(0).max(100),
  modelContribution: EvalOutputGradeSchema,
  guardedProduct: EvalOutputGradeSchema,
  fallbackPenalty: z.number().min(0).max(100),
  guardedRejectionPenalty: z.number().min(0).max(100),
  objectiveModelScore: z.number().min(0).max(100),
  objectiveProductScore: z.number().min(0).max(100),
  requiresQualitativeReview: z.boolean(),
  notes: z.array(z.string()),
});
export type EvalGrade = z.infer<typeof EvalGradeSchema>;

export const EvalRunManifestSchema = z.object({
  schemaVersion: z.literal(1),
  runId: z.string().min(1),
  createdAt: z.string().datetime(),
  repositoryHead: z.string().min(1),
  corpusDigest: z.string().min(1),
  randomizedCaseIds: z.array(z.string().min(1)),
  lanes: z.array(EvalLaneSchema),
  caseCount: z.number().int().positive(),
  safety: z.object({
    syntheticOnly: z.literal(true),
    store: z.literal(false),
    realWorkspaceAllowed: z.literal(false),
    externalWritesAllowed: z.literal(false),
  }),
});
export type EvalRunManifest = z.infer<typeof EvalRunManifestSchema>;

export const systemEvalLanes: readonly EvalLane[] = [
  {
    id: "luna_high",
    model: "gpt-5.6-luna",
    reasoningEffort: "high",
    apiMode: "responses",
    kind: "system",
  },
  {
    id: "luna_max",
    model: "gpt-5.6-luna",
    reasoningEffort: "max",
    apiMode: "responses",
    kind: "system",
  },
  {
    id: "sol_low",
    model: "gpt-5.6-sol",
    reasoningEffort: "low",
    apiMode: "responses",
    kind: "system",
  },
] as const;

export const codexAgentReferenceLane: EvalLane = {
  id: "codex_agent_reference",
  model: "gpt-5.6-sol",
  reasoningEffort: "medium",
  apiMode: "responses",
  kind: "codex_agent_reference",
};
