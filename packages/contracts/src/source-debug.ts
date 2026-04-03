import { z } from "zod";

import {
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  SourceDebugAttemptOutcomeSchema,
  SourceDebugPhaseCompletionModeSchema,
  SourceDebugPhaseSchema,
  SourceDebugRunStateSchema,
  SourceInstructionStatusSchema,
  SourceInstructionVerificationOutcomeSchema,
  UrlStringSchema,
} from "./base";

export const SourceInstructionVersionInfoSchema = z.object({
  promptProfileVersion: NonEmptyStringSchema,
  toolsetVersion: NonEmptyStringSchema,
  adapterVersion: NonEmptyStringSchema,
  appSchemaVersion: NonEmptyStringSchema.nullable().default(null),
});
export type SourceInstructionVersionInfo = z.infer<
  typeof SourceInstructionVersionInfoSchema
>;

export const SourceDebugCompactionStateSchema = z.object({
  compactedAt: IsoDateTimeSchema,
  compactionCount: z.number().int().nonnegative().default(0),
  summary: NonEmptyStringSchema,
  confirmedFacts: z.array(NonEmptyStringSchema).default([]),
  blockerNotes: z.array(NonEmptyStringSchema).default([]),
  avoidStrategyFingerprints: z.array(NonEmptyStringSchema).default([]),
  preservedContext: z.array(NonEmptyStringSchema).default([]),
});
export type SourceDebugCompactionState = z.infer<
  typeof SourceDebugCompactionStateSchema
>;

export const SourceDebugPhaseEvidenceSchema = z.object({
  visibleControls: z.array(NonEmptyStringSchema).default([]),
  successfulInteractions: z.array(NonEmptyStringSchema).default([]),
  routeSignals: z.array(NonEmptyStringSchema).default([]),
  attemptedControls: z.array(NonEmptyStringSchema).default([]),
  warnings: z.array(NonEmptyStringSchema).default([]),
});
export type SourceDebugPhaseEvidence = z.infer<
  typeof SourceDebugPhaseEvidenceSchema
>;

const SourceDebugEvidenceRefBaseSchema = z.object({
  id: NonEmptyStringSchema,
  runId: NonEmptyStringSchema,
  attemptId: NonEmptyStringSchema,
  targetId: NonEmptyStringSchema,
  phase: SourceDebugPhaseSchema,
  label: NonEmptyStringSchema,
  capturedAt: IsoDateTimeSchema,
});

const SourceDebugUrlEvidenceRefSchema = SourceDebugEvidenceRefBaseSchema.extend({
  kind: z.literal("url"),
  url: UrlStringSchema,
  storagePath: z.null().default(null),
  excerpt: NonEmptyStringSchema.nullable().default(null),
});

const SourceDebugScreenshotEvidenceRefSchema =
  SourceDebugEvidenceRefBaseSchema.extend({
    kind: z.literal("screenshot"),
    url: UrlStringSchema.nullable().default(null),
    storagePath: NonEmptyStringSchema,
    excerpt: NonEmptyStringSchema.nullable().default(null),
  });

const SourceDebugNoteEvidenceRefSchema = SourceDebugEvidenceRefBaseSchema.extend(
  {
    kind: z.literal("note"),
    url: UrlStringSchema.nullable().default(null),
    storagePath: z.null().default(null),
    excerpt: NonEmptyStringSchema,
  },
);

export const SourceDebugEvidenceRefSchema = z.discriminatedUnion("kind", [
  SourceDebugUrlEvidenceRefSchema,
  SourceDebugScreenshotEvidenceRefSchema,
  SourceDebugNoteEvidenceRefSchema,
]);
export type SourceDebugEvidenceRef = z.infer<
  typeof SourceDebugEvidenceRefSchema
>;

export const SourceDebugWorkerAttemptSchema = z.object({
  id: NonEmptyStringSchema,
  runId: NonEmptyStringSchema,
  targetId: NonEmptyStringSchema,
  phase: SourceDebugPhaseSchema,
  startedAt: IsoDateTimeSchema,
  completedAt: IsoDateTimeSchema.nullable().default(null),
  outcome: SourceDebugAttemptOutcomeSchema,
  completionMode:
    SourceDebugPhaseCompletionModeSchema.default("structured_finish"),
  completionReason: NonEmptyStringSchema.nullable().default(null),
  strategyLabel: NonEmptyStringSchema,
  strategyFingerprint: NonEmptyStringSchema,
  confirmedFacts: z.array(NonEmptyStringSchema).default([]),
  attemptedActions: z.array(NonEmptyStringSchema).default([]),
  blockerSummary: NonEmptyStringSchema.nullable().default(null),
  resultSummary: NonEmptyStringSchema,
  confidenceScore: z.number().int().min(0).max(100).default(0),
  nextRecommendedStrategies: z.array(NonEmptyStringSchema).default([]),
  avoidStrategyFingerprints: z.array(NonEmptyStringSchema).default([]),
  evidenceRefIds: z.array(NonEmptyStringSchema).default([]),
  phaseEvidence: SourceDebugPhaseEvidenceSchema.nullable().default(null),
  compactionState: SourceDebugCompactionStateSchema.nullable().default(null),
});
export type SourceDebugWorkerAttempt = z.infer<
  typeof SourceDebugWorkerAttemptSchema
>;

export const SourceDebugPhaseSummarySchema = z.object({
  phase: SourceDebugPhaseSchema,
  summary: NonEmptyStringSchema,
  completionMode:
    SourceDebugPhaseCompletionModeSchema.default("structured_finish"),
  completionReason: NonEmptyStringSchema.nullable().default(null),
  confirmedFacts: z.array(NonEmptyStringSchema).default([]),
  blockerNotes: z.array(NonEmptyStringSchema).default([]),
  nextRecommendedStrategies: z.array(NonEmptyStringSchema).default([]),
  avoidStrategyFingerprints: z.array(NonEmptyStringSchema).default([]),
  producedAttemptIds: z.array(NonEmptyStringSchema).default([]),
});
export type SourceDebugPhaseSummary = z.infer<
  typeof SourceDebugPhaseSummarySchema
>;

export const SourceInstructionVerificationSchema = z
  .object({
    id: NonEmptyStringSchema,
    replayRunId: NonEmptyStringSchema.nullable().default(null),
    verifiedAt: IsoDateTimeSchema.nullable().default(null),
    outcome: SourceInstructionVerificationOutcomeSchema.default("unverified"),
    proofSummary: NonEmptyStringSchema.nullable().default(null),
    reason: NonEmptyStringSchema.nullable().default(null),
    versionInfo: SourceInstructionVersionInfoSchema,
  })
  .superRefine((value, ctx) => {
    if (value.outcome === "unverified") {
      if (value.replayRunId !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Unverified source-instruction verification cannot point at a replay run.",
          path: ["replayRunId"],
        });
      }

      if (value.verifiedAt !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Unverified source-instruction verification cannot have a verified timestamp.",
          path: ["verifiedAt"],
        });
      }

      if (value.proofSummary !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Unverified source-instruction verification cannot include proof summary text.",
          path: ["proofSummary"],
        });
      }

      if (value.reason !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Unverified source-instruction verification cannot include a failure reason.",
          path: ["reason"],
        });
      }

      return;
    }

    if (value.replayRunId === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Verified source-instruction outcomes must reference the replay run.",
        path: ["replayRunId"],
      });
    }

    if (value.verifiedAt === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Verified source-instruction outcomes must include a verified timestamp.",
        path: ["verifiedAt"],
      });
    }

    if (value.outcome === "passed" && value.proofSummary === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Passed source-instruction verification must include a proof summary.",
        path: ["proofSummary"],
      });
    }
  });
export type SourceInstructionVerification = z.infer<
  typeof SourceInstructionVerificationSchema
>;

export const SourceInstructionArtifactSchema = z
  .object({
    id: NonEmptyStringSchema,
    targetId: NonEmptyStringSchema,
    status: SourceInstructionStatusSchema.default("draft"),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
    acceptedAt: IsoDateTimeSchema.nullable().default(null),
    basedOnRunId: NonEmptyStringSchema,
    basedOnAttemptIds: z.array(NonEmptyStringSchema).default([]),
    notes: NonEmptyStringSchema.nullable().default(null),
    navigationGuidance: z.array(NonEmptyStringSchema).default([]),
    searchGuidance: z.array(NonEmptyStringSchema).default([]),
    detailGuidance: z.array(NonEmptyStringSchema).default([]),
    applyGuidance: z.array(NonEmptyStringSchema).default([]),
    warnings: z.array(NonEmptyStringSchema).default([]),
    versionInfo: SourceInstructionVersionInfoSchema,
    verification: SourceInstructionVerificationSchema.nullable().default(null),
  })
  .superRefine((value, ctx) => {
    if (value.status !== "validated") {
      return;
    }

    if (value.acceptedAt === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Validated source instructions must record when they were accepted.",
        path: ["acceptedAt"],
      });
    }

    if (!value.verification || value.verification.outcome !== "passed") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Validated source instructions must carry a passed verification record.",
        path: ["verification"],
      });
    }
  });
export type SourceInstructionArtifact = z.infer<
  typeof SourceInstructionArtifactSchema
>;

export const EditableSourceInstructionArtifactSchema = z.object({
  id: NonEmptyStringSchema,
  notes: NonEmptyStringSchema.nullable().default(null),
  navigationGuidance: z.array(NonEmptyStringSchema).default([]),
  searchGuidance: z.array(NonEmptyStringSchema).default([]),
  detailGuidance: z.array(NonEmptyStringSchema).default([]),
  applyGuidance: z.array(NonEmptyStringSchema).default([]),
  warnings: z.array(NonEmptyStringSchema).default([]),
});
export type EditableSourceInstructionArtifact = z.infer<
  typeof EditableSourceInstructionArtifactSchema
>;

export const SourceDebugRunRecordSchema = z
  .object({
    id: NonEmptyStringSchema,
    targetId: NonEmptyStringSchema,
    state: SourceDebugRunStateSchema.default("idle"),
    startedAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
    completedAt: IsoDateTimeSchema.nullable().default(null),
    activePhase: SourceDebugPhaseSchema.nullable().default(null),
    phases: z.array(SourceDebugPhaseSchema).default([]),
    targetLabel: NonEmptyStringSchema,
    targetUrl: UrlStringSchema,
    targetHostname: NonEmptyStringSchema,
    manualPrerequisiteSummary: NonEmptyStringSchema.nullable().default(null),
    finalSummary: NonEmptyStringSchema.nullable().default(null),
    attemptIds: z.array(NonEmptyStringSchema).default([]),
    phaseSummaries: z.array(SourceDebugPhaseSummarySchema).default([]),
    instructionArtifactId: NonEmptyStringSchema.nullable().default(null),
  })
  .superRefine((value, ctx) => {
    const isTerminalState =
      value.state === "completed" ||
      value.state === "cancelled" ||
      value.state === "failed" ||
      value.state === "interrupted";

    if (value.state === "idle") {
      if (value.completedAt !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Idle source-debug runs cannot have a completion timestamp.",
          path: ["completedAt"],
        });
      }

      if (value.activePhase !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Idle source-debug runs cannot have an active phase.",
          path: ["activePhase"],
        });
      }

      return;
    }

    if (value.state === "running") {
      if (value.completedAt !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Running source-debug runs cannot have a completion timestamp.",
          path: ["completedAt"],
        });
      }

      if (value.activePhase === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Running source-debug runs must keep track of the active phase.",
          path: ["activePhase"],
        });
      }

      return;
    }

    if (value.state === "paused_manual") {
      if (value.completedAt === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Manually paused source-debug runs must record when the pause happened.",
          path: ["completedAt"],
        });
      }

      if (value.activePhase === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Manually paused source-debug runs must keep the phase that needs attention.",
          path: ["activePhase"],
        });
      }

      return;
    }

    if (isTerminalState && value.completedAt === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Finished source-debug runs must record a completion timestamp.",
        path: ["completedAt"],
      });
    }

    if (isTerminalState && value.activePhase !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Finished source-debug runs cannot keep an active phase.",
        path: ["activePhase"],
      });
    }
  });
export type SourceDebugRunRecord = z.infer<typeof SourceDebugRunRecordSchema>;

export const SourceDebugRunDetailsSchema = z.object({
  run: SourceDebugRunRecordSchema,
  attempts: z.array(SourceDebugWorkerAttemptSchema).default([]),
  evidenceRefs: z.array(SourceDebugEvidenceRefSchema).default([]),
  instructionArtifact: SourceInstructionArtifactSchema.nullable().default(null),
});
export type SourceDebugRunDetails = z.infer<typeof SourceDebugRunDetailsSchema>;
