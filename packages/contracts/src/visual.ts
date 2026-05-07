import { z } from "zod";

import {
  AiProviderKindSchema,
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  SourceDebugPhaseSchema,
  UrlStringSchema,
} from "./base";

export const browserVisualSnapshotModeValues = [
  "viewport",
  "region",
  "full_page",
] as const;
export const BrowserVisualSnapshotModeSchema = z.enum(
  browserVisualSnapshotModeValues,
);
export type BrowserVisualSnapshotMode = z.infer<
  typeof BrowserVisualSnapshotModeSchema
>;

export const browserVisualSnapshotPurposeValues = [
  "normal_discovery",
  "source_debug",
  "apply_checkpoint",
  "apply_recovery",
  "debug_benchmark",
] as const;
export const BrowserVisualSnapshotPurposeSchema = z.enum(
  browserVisualSnapshotPurposeValues,
);
export type BrowserVisualSnapshotPurpose = z.infer<
  typeof BrowserVisualSnapshotPurposeSchema
>;

export const browserVisualRetentionKindValues = [
  "temporary",
  "retained",
  "debug",
] as const;
export const BrowserVisualRetentionKindSchema = z.enum(
  browserVisualRetentionKindValues,
);
export type BrowserVisualRetentionKind = z.infer<
  typeof BrowserVisualRetentionKindSchema
>;

export const browserVisualRedactionLevelValues = [
  "none",
  "standard",
  "sensitive",
] as const;
export const BrowserVisualRedactionLevelSchema = z.enum(
  browserVisualRedactionLevelValues,
);
export type BrowserVisualRedactionLevel = z.infer<
  typeof BrowserVisualRedactionLevelSchema
>;

export const BrowserVisualRegionSchema = z.object({
  x: z.number().nonnegative(),
  y: z.number().nonnegative(),
  width: z.number().positive(),
  height: z.number().positive(),
});
export type BrowserVisualRegion = z.infer<typeof BrowserVisualRegionSchema>;

export const BrowserVisualRetentionPolicySchema = z.object({
  retention: BrowserVisualRetentionKindSchema.default("temporary"),
  redactionLevel: BrowserVisualRedactionLevelSchema.default("standard"),
  reason: NonEmptyStringSchema,
  expiresAt: IsoDateTimeSchema.nullable().default(null),
});
export type BrowserVisualRetentionPolicy = z.infer<
  typeof BrowserVisualRetentionPolicySchema
>;

export const BrowserVisualSnapshotRequestSchema = z
  .object({
    purpose: BrowserVisualSnapshotPurposeSchema,
    mode: BrowserVisualSnapshotModeSchema.default("viewport"),
    label: NonEmptyStringSchema,
    region: BrowserVisualRegionSchema.nullable().default(null),
    retention: BrowserVisualRetentionPolicySchema,
    reason: NonEmptyStringSchema,
  })
  .superRefine((value, ctx) => {
    if (value.mode === "region" && value.region === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Region visual snapshots must include a bounded region.",
        path: ["region"],
      });
    }

    if (value.mode !== "region" && value.region !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Only region visual snapshots can include a region box.",
        path: ["region"],
      });
    }

    if (
      value.mode === "full_page" &&
      value.retention.retention !== "temporary" &&
      value.retention.redactionLevel === "none"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Retained full-page screenshots must declare a redaction level.",
        path: ["retention", "redactionLevel"],
      });
    }
  });
export type BrowserVisualSnapshotRequest = z.infer<
  typeof BrowserVisualSnapshotRequestSchema
>;

export const BrowserVisualSnapshotRefSchema = z.object({
  id: NonEmptyStringSchema,
  capturedAt: IsoDateTimeSchema,
  url: UrlStringSchema.nullable().default(null),
  pageTitle: NonEmptyStringSchema.nullable().default(null),
  mode: BrowserVisualSnapshotModeSchema.default("viewport"),
  purpose: BrowserVisualSnapshotPurposeSchema,
  label: NonEmptyStringSchema,
  region: BrowserVisualRegionSchema.nullable().default(null),
  viewport: BrowserVisualRegionSchema.nullable().default(null),
  mimeType: z.enum(["image/png", "image/jpeg"]).default("image/png"),
  dataUrl: NonEmptyStringSchema.nullable().default(null),
  storagePath: NonEmptyStringSchema.nullable().default(null),
  retention: BrowserVisualRetentionPolicySchema,
  warnings: z.array(NonEmptyStringSchema).default([]),
});
export type BrowserVisualSnapshotRef = z.infer<
  typeof BrowserVisualSnapshotRefSchema
>;

export const browserVisualObservationKindValues = [
  "blocker",
  "visible_control",
  "job_card_clue",
  "apply_path_clue",
  "field_control",
  "validation_error",
  "button_state",
  "upload_control",
  "question_context",
  "recovery_note",
  "uncertainty",
] as const;
export const BrowserVisualObservationKindSchema = z.enum(
  browserVisualObservationKindValues,
);
export type BrowserVisualObservationKind = z.infer<
  typeof BrowserVisualObservationKindSchema
>;

export const browserVisualObservationSeverityValues = [
  "info",
  "warning",
  "critical",
] as const;
export const BrowserVisualObservationSeveritySchema = z.enum(
  browserVisualObservationSeverityValues,
);
export type BrowserVisualObservationSeverity = z.infer<
  typeof BrowserVisualObservationSeveritySchema
>;

const CSS_SELECTOR_PATTERN =
  /(?:^|\s)(?:#[A-Za-z][\w-]+|\.[a-z][\w-]{2,}|\[[^\]]+\]|(?:button|input|textarea|select|a|div|span|form)[#.][A-Za-z])/;
const DIRECT_ACTION_PATTERN =
  /\b(?:click|press|tap|type|fill|choose|navigate|go\s+to)\b/i;
const SELECT_ACTION_PATTERN =
  /\bselect\s+(?:the\s+|an?\s+|this\s+|that\s+)?(?:option|answer|field|input|dropdown|checkbox|radio|value|item)\b/i;
const OPEN_ACTION_PATTERN =
  /\bopen\s+(?:the\s+|an?\s+|this\s+|that\s+)?(?:easy\s+apply|apply|application|form|link|page|job|listing)\b/i;
const SUBMIT_ACTION_PATTERN =
  /\bsubmit\s+(?:the\s+)?(?:application|form|answer|response)\b|\bfinal[-\s]?submit\b/i;
const SAVE_JOB_PATTERN =
  /\bsave\s+(?:this\s+|the\s+|a\s+)?job\b|\bsave-job\b|\bsaved-job\b/i;
const GENERATED_ANSWER_PATTERN =
  /\b(?:answer|respond)\s+(?:with|as)\b|\buse\s+this\s+answer\b|\bgenerated\s+answer\b/i;
const SITE_SPECIFIC_WORKFLOW_RULE_PATTERN =
  /\b(?:linkedin|indeed|greenhouse|lever|workday|ashby|smartrecruiters|icims|bamboohr|jobvite|kosovajob|wellfound|glassdoor|ziprecruiter)\b/i;

export function validateBrowserVisualObservationText(
  value: string,
): string[] {
  const issues: string[] = [];

  if (CSS_SELECTOR_PATTERN.test(value)) {
    issues.push("Visual observations cannot include selectors.");
  }

  if (
    DIRECT_ACTION_PATTERN.test(value) ||
    SELECT_ACTION_PATTERN.test(value) ||
    OPEN_ACTION_PATTERN.test(value) ||
    SUBMIT_ACTION_PATTERN.test(value)
  ) {
    issues.push("Visual observations cannot direct browser actions.");
  }

  if (SAVE_JOB_PATTERN.test(value)) {
    issues.push("Visual observations cannot direct saved-job behavior.");
  }

  if (GENERATED_ANSWER_PATTERN.test(value)) {
    issues.push(
      "Visual observations cannot include generated answers or final-submit guidance.",
    );
  }

  if (SITE_SPECIFIC_WORKFLOW_RULE_PATTERN.test(value)) {
    issues.push(
      "Visual observations cannot include site-specific workflow rules.",
    );
  }

  return issues;
}

function addVisualTextIssues(
  ctx: z.RefinementCtx,
  path: (string | number)[],
  value: string | null | undefined,
) {
  if (!value) {
    return;
  }

  for (const message of validateBrowserVisualObservationText(value)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message,
      path,
    });
  }
}

export const BrowserVisualObservationSchema = z
  .object({
    id: NonEmptyStringSchema,
    kind: BrowserVisualObservationKindSchema,
    label: NonEmptyStringSchema,
    description: NonEmptyStringSchema,
    confidence: z.number().min(0).max(1).default(0.5),
    severity: BrowserVisualObservationSeveritySchema.default("info"),
    evidenceRegion: BrowserVisualRegionSchema.nullable().default(null),
    relatedText: NonEmptyStringSchema.nullable().default(null),
    tags: z.array(NonEmptyStringSchema).default([]),
  })
  .superRefine((value, ctx) => {
    addVisualTextIssues(ctx, ["label"], value.label);
    addVisualTextIssues(ctx, ["description"], value.description);
    addVisualTextIssues(ctx, ["relatedText"], value.relatedText);
    value.tags.forEach((tag, index) => {
      addVisualTextIssues(ctx, ["tags", index], tag);
    });
  });
export type BrowserVisualObservation = z.infer<
  typeof BrowserVisualObservationSchema
>;

export const BrowserVisualQuestionContextSchema = z
  .object({
    id: NonEmptyStringSchema,
    snapshotId: NonEmptyStringSchema,
    observationSetId: NonEmptyStringSchema,
    promptHint: NonEmptyStringSchema,
    fieldKindHint: NonEmptyStringSchema.nullable().default(null),
    isRequiredHint: z.boolean().nullable().default(null),
    confidence: z.number().min(0).max(1).default(0.5),
  })
  .superRefine((value, ctx) => {
    addVisualTextIssues(ctx, ["promptHint"], value.promptHint);
    addVisualTextIssues(ctx, ["fieldKindHint"], value.fieldKindHint);
  });
export type BrowserVisualQuestionContext = z.infer<
  typeof BrowserVisualQuestionContextSchema
>;

export const browserVisualReconciliationStatusValues = [
  "agreement",
  "dom_weak_visual_support",
  "conflict",
  "visual_only",
  "dom_only",
  "not_compared",
] as const;
export const BrowserVisualReconciliationStatusSchema = z.enum(
  browserVisualReconciliationStatusValues,
);
export type BrowserVisualReconciliationStatus = z.infer<
  typeof BrowserVisualReconciliationStatusSchema
>;

export const BrowserVisualReconciliationSchema = z
  .object({
    id: NonEmptyStringSchema,
    targetKind: z.enum([
      "job_card",
      "control",
      "apply_field",
      "blocker",
      "button_state",
      "question",
    ]),
    status: BrowserVisualReconciliationStatusSchema.default("not_compared"),
    domSummary: NonEmptyStringSchema.nullable().default(null),
    visualSummary: NonEmptyStringSchema.nullable().default(null),
    confidence: z.number().min(0).max(1).default(0.5),
    recommendedHandling: NonEmptyStringSchema.nullable().default(null),
  })
  .superRefine((value, ctx) => {
    addVisualTextIssues(ctx, ["domSummary"], value.domSummary);
    addVisualTextIssues(ctx, ["visualSummary"], value.visualSummary);
    addVisualTextIssues(
      ctx,
      ["recommendedHandling"],
      value.recommendedHandling,
    );
  });
export type BrowserVisualReconciliation = z.infer<
  typeof BrowserVisualReconciliationSchema
>;

export const BrowserVisualObservationSetSchema = z
  .object({
    id: NonEmptyStringSchema,
    snapshotId: NonEmptyStringSchema,
    observedAt: IsoDateTimeSchema,
    url: UrlStringSchema.nullable().default(null),
    purpose: BrowserVisualSnapshotPurposeSchema,
    providerKind: AiProviderKindSchema.default("deterministic"),
    providerLabel: NonEmptyStringSchema,
    summary: NonEmptyStringSchema.nullable().default(null),
    observations: z.array(BrowserVisualObservationSchema).default([]),
    blockers: z.array(NonEmptyStringSchema).default([]),
    visibleControls: z.array(NonEmptyStringSchema).default([]),
    jobCardClues: z.array(NonEmptyStringSchema).default([]),
    applyPathClues: z.array(NonEmptyStringSchema).default([]),
    fieldControls: z.array(NonEmptyStringSchema).default([]),
    validationErrors: z.array(NonEmptyStringSchema).default([]),
    buttonStates: z.array(NonEmptyStringSchema).default([]),
    questionContexts: z.array(BrowserVisualQuestionContextSchema).default([]),
    recoveryNotes: z.array(NonEmptyStringSchema).default([]),
    uncertainty: z.array(NonEmptyStringSchema).default([]),
    reconciliations: z.array(BrowserVisualReconciliationSchema).default([]),
    rejectedOutputReasons: z.array(NonEmptyStringSchema).default([]),
  })
  .superRefine((value, ctx) => {
    addVisualTextIssues(ctx, ["summary"], value.summary);
    const textArrays = [
      ["blockers", value.blockers],
      ["visibleControls", value.visibleControls],
      ["jobCardClues", value.jobCardClues],
      ["applyPathClues", value.applyPathClues],
      ["fieldControls", value.fieldControls],
      ["validationErrors", value.validationErrors],
      ["buttonStates", value.buttonStates],
      ["recoveryNotes", value.recoveryNotes],
      ["uncertainty", value.uncertainty],
    ] as const;

    for (const [key, entries] of textArrays) {
      entries.forEach((entry, index) => {
        addVisualTextIssues(ctx, [key, index], entry);
      });
    }
  });
export type BrowserVisualObservationSet = z.infer<
  typeof BrowserVisualObservationSetSchema
>;

export const BrowserVisualAnalysisContextSchema = z.object({
  purpose: BrowserVisualSnapshotPurposeSchema,
  taskGoal: NonEmptyStringSchema,
  pageUrl: UrlStringSchema.nullable().default(null),
  pageTitle: NonEmptyStringSchema.nullable().default(null),
  visibleTextSample: NonEmptyStringSchema.nullable().default(null),
  domSignals: z.array(NonEmptyStringSchema).default([]),
  sourceDebug: z
    .object({
      phase: SourceDebugPhaseSchema,
      targetLabel: NonEmptyStringSchema,
      knownFacts: z.array(NonEmptyStringSchema).default([]),
    })
    .nullable()
    .default(null),
  apply: z
    .object({
      jobTitle: NonEmptyStringSchema,
      company: NonEmptyStringSchema,
      checkpointLabel: NonEmptyStringSchema,
      recoveryMode: z.boolean().default(false),
    })
    .nullable()
    .default(null),
});
export type BrowserVisualAnalysisContext = z.infer<
  typeof BrowserVisualAnalysisContextSchema
>;

export const ApplyVisualCheckpointSchema = z.object({
  id: NonEmptyStringSchema,
  label: NonEmptyStringSchema,
  purpose: BrowserVisualSnapshotPurposeSchema,
  snapshotId: NonEmptyStringSchema,
  observationSetId: NonEmptyStringSchema,
  summary: NonEmptyStringSchema,
  capturedAt: IsoDateTimeSchema,
  retained: z.boolean().default(false),
  storagePath: NonEmptyStringSchema.nullable().default(null),
  blockers: z.array(NonEmptyStringSchema).default([]),
  fieldControls: z.array(NonEmptyStringSchema).default([]),
  validationErrors: z.array(NonEmptyStringSchema).default([]),
  buttonStates: z.array(NonEmptyStringSchema).default([]),
  questionContextIds: z.array(NonEmptyStringSchema).default([]),
  reconciliations: z.array(BrowserVisualReconciliationSchema).default([]),
});
export type ApplyVisualCheckpoint = z.infer<
  typeof ApplyVisualCheckpointSchema
>;

export const BrowserVisualAnalysisInputSchema = z.object({
  snapshot: BrowserVisualSnapshotRefSchema,
  context: BrowserVisualAnalysisContextSchema,
});
export type BrowserVisualAnalysisInput = z.infer<
  typeof BrowserVisualAnalysisInputSchema
>;

export const BrowserVisualEvidenceSummarySchema = z.object({
  snapshotId: NonEmptyStringSchema,
  observationSetId: NonEmptyStringSchema,
  summary: NonEmptyStringSchema,
  capturedAt: IsoDateTimeSchema,
  storagePath: NonEmptyStringSchema.nullable().default(null),
  retention: BrowserVisualRetentionKindSchema,
  redactionLevel: BrowserVisualRedactionLevelSchema,
  confidence: z.number().min(0).max(1).default(0.5),
  reconciliationStatus: BrowserVisualReconciliationStatusSchema.nullable().default(
    null,
  ),
});
export type BrowserVisualEvidenceSummary = z.infer<
  typeof BrowserVisualEvidenceSummarySchema
>;

export const SourceDebugVisualFindingSchema = z.object({
  id: NonEmptyStringSchema,
  phase: SourceDebugPhaseSchema,
  snapshotId: NonEmptyStringSchema,
  observationSetId: NonEmptyStringSchema,
  kind: BrowserVisualObservationKindSchema.default("recovery_note"),
  summary: NonEmptyStringSchema,
  capturedAt: IsoDateTimeSchema,
  storagePath: NonEmptyStringSchema.nullable().default(null),
  retention: BrowserVisualRetentionKindSchema,
  redactionLevel: BrowserVisualRedactionLevelSchema,
  confidence: z.number().min(0).max(1).default(0.5),
  reconciliationStatus: BrowserVisualReconciliationStatusSchema.nullable().default(
    null,
  ),
});
export type SourceDebugVisualFinding = z.infer<
  typeof SourceDebugVisualFindingSchema
>;
