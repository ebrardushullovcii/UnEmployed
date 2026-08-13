import { z } from "zod";

import { IsoDateTimeSchema, NonEmptyStringSchema } from "./base";

export const agentTaskFailureKindValues = [
  "cancelled",
  "transient_provider",
  "transient_network",
  "validation",
  "stale_state",
  "user_action_required",
  "safety_boundary",
  "permanent",
  "unknown",
] as const;
export const AgentTaskFailureKindSchema = z.enum(agentTaskFailureKindValues);
export type AgentTaskFailureKind = z.infer<typeof AgentTaskFailureKindSchema>;

export const agentToolPermissionValues = [
  "read",
  "draft_write",
  "canonical_write",
  "external_action",
] as const;
export const AgentToolPermissionSchema = z.enum(agentToolPermissionValues);
export type AgentToolPermission = z.infer<typeof AgentToolPermissionSchema>;

export const agentTaskStopReasonValues = [
  "completed",
  "cancelled",
  "time_budget",
  "cost_budget",
  "no_progress",
  "user_action_required",
  "safety_boundary",
  "permanent_failure",
  "emergency_ceiling",
] as const;
export const AgentTaskStopReasonSchema = z.enum(agentTaskStopReasonValues);
export type AgentTaskStopReason = z.infer<typeof AgentTaskStopReasonSchema>;

export const AgentTaskValidationIssueSchema = z.object({
  code: NonEmptyStringSchema,
  message: NonEmptyStringSchema,
  path: z.array(z.union([z.string(), z.number().int()])).default([]),
});
export type AgentTaskValidationIssue = z.infer<
  typeof AgentTaskValidationIssueSchema
>;

export const AgentTaskProgressSchema = z.object({
  phase: NonEmptyStringSchema,
  message: NonEmptyStringSchema,
  completedUnits: z.number().int().nonnegative().nullable().default(null),
  totalUnits: z.number().int().positive().nullable().default(null),
  distinctResults: z.number().int().nonnegative().default(0),
  validationIssuesRemaining: z.number().int().nonnegative().default(0),
  elapsedMs: z.number().nonnegative(),
  updatedAt: IsoDateTimeSchema,
});
export type AgentTaskProgress = z.infer<typeof AgentTaskProgressSchema>;

export const AgentTaskToolReceiptSchema = z.object({
  toolCallId: NonEmptyStringSchema,
  toolName: NonEmptyStringSchema,
  permission: AgentToolPermissionSchema,
  startedAt: IsoDateTimeSchema,
  durationMs: z.number().nonnegative(),
  outcome: z.enum(["succeeded", "rejected", "failed"]),
  failureKind: AgentTaskFailureKindSchema.nullable().default(null),
  progressMade: z.boolean(),
  resultHandle: NonEmptyStringSchema.nullable().default(null),
  validationIssues: z.array(AgentTaskValidationIssueSchema).default([]),
});
export type AgentTaskToolReceipt = z.infer<typeof AgentTaskToolReceiptSchema>;

export const AgentTaskExecutionReceiptSchema = z.object({
  taskId: NonEmptyStringSchema,
  capability: NonEmptyStringSchema,
  startedAt: IsoDateTimeSchema,
  completedAt: IsoDateTimeSchema,
  durationMs: z.number().nonnegative(),
  model: NonEmptyStringSchema.nullable().default(null),
  reasoningEffort: NonEmptyStringSchema.nullable().default(null),
  providerCalls: z.number().int().nonnegative(),
  repairAttempts: z.number().int().nonnegative(),
  fallbackUsed: z.boolean(),
  stopReason: AgentTaskStopReasonSchema,
  finalValidationIssues: z.array(AgentTaskValidationIssueSchema).default([]),
  toolReceipts: z.array(AgentTaskToolReceiptSchema).default([]),
});
export type AgentTaskExecutionReceipt = z.infer<
  typeof AgentTaskExecutionReceiptSchema
>;

export const AgentTaskMessageAttributionSchema =
  AgentTaskExecutionReceiptSchema.pick({
    taskId: true,
    capability: true,
    durationMs: true,
    model: true,
    reasoningEffort: true,
    providerCalls: true,
    repairAttempts: true,
    fallbackUsed: true,
    stopReason: true,
  });
export type AgentTaskMessageAttribution = z.infer<
  typeof AgentTaskMessageAttributionSchema
>;

export const AgentTaskCheckpointSchema = z.object({
  taskId: NonEmptyStringSchema,
  capability: NonEmptyStringSchema,
  revision: z.number().int().nonnegative(),
  updatedAt: IsoDateTimeSchema,
  state: z.unknown(),
  draft: z.unknown(),
  progress: AgentTaskProgressSchema,
  toolReceipts: z.array(AgentTaskToolReceiptSchema).default([]),
});
export type AgentTaskCheckpoint = z.infer<typeof AgentTaskCheckpointSchema>;

export const AgentTaskResultReferenceSchema = z.object({
  handle: NonEmptyStringSchema,
  summary: NonEmptyStringSchema,
  itemCount: z.number().int().nonnegative().nullable().default(null),
  nextCursor: NonEmptyStringSchema.nullable().default(null),
});
export type AgentTaskResultReference = z.infer<
  typeof AgentTaskResultReferenceSchema
>;
