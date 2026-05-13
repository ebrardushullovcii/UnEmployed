import { z } from "zod";

import { IsoDateTimeSchema, NonEmptyStringSchema } from "./base";
import { CandidateProfileSchema } from "./profile";
import { SavedJobSchema } from "./discovery";

export const InterviewSessionLifecycleSchema = z.enum([
  "draft_setup",
  "rehearsing",
  "ready",
  "active",
  "paused",
  "panic_hidden",
  "reconfiguring",
  "ending",
  "ended",
  "interrupted",
  "failed",
]);
export type InterviewSessionLifecycle = z.infer<
  typeof InterviewSessionLifecycleSchema
>;

export const InterviewTargetContextKindSchema = z.enum([
  "job_application",
  "saved_job",
  "general_interview",
]);
export type InterviewTargetContextKind = z.infer<
  typeof InterviewTargetContextKindSchema
>;

export const InterviewTranscriptSourceSchema = z.enum([
  "microphone",
  "meeting_audio",
  "meeting_native_transcript",
]);
export type InterviewTranscriptSource = z.infer<
  typeof InterviewTranscriptSourceSchema
>;

export const InterviewTranscriptSegmentStateSchema = z.enum([
  "partial",
  "stable_partial",
  "final",
]);
export type InterviewTranscriptSegmentState = z.infer<
  typeof InterviewTranscriptSegmentStateSchema
>;

export const InterviewTranscriptionEngineKindSchema = z.enum([
  "platform_local",
  "local_model",
  "browser_speech",
  "cloud_ai",
  "deterministic",
]);
export type InterviewTranscriptionEngineKind = z.infer<
  typeof InterviewTranscriptionEngineKindSchema
>;

export const InterviewCapabilityStatusSchema = z.enum([
  "available",
  "degraded",
  "unavailable",
  "unsupported",
  "permission_denied",
  "unknown",
]);
export type InterviewCapabilityStatus = z.infer<
  typeof InterviewCapabilityStatusSchema
>;

export const InterviewProtectedSurfaceKindSchema = z.enum([
  "live_answer_overlay",
  "live_transcript_overlay",
]);
export type InterviewProtectedSurfaceKind = z.infer<
  typeof InterviewProtectedSurfaceKindSchema
>;

export const InterviewCaptureProtectionStateSchema = z.enum([
  "verified_protected",
  "requested_unverified",
  "best_effort",
  "unsupported",
  "failed",
  "unknown",
]);
export type InterviewCaptureProtectionState = z.infer<
  typeof InterviewCaptureProtectionStateSchema
>;

export const InterviewCueTriggerKindSchema = z.enum([
  "automatic_question",
  "force_cue",
  "capture_and_force_cue",
  "rehearsal_sample",
]);
export type InterviewCueTriggerKind = z.infer<
  typeof InterviewCueTriggerKindSchema
>;

export const InterviewCueSensitivitySchema = z.enum([
  "conservative",
  "balanced",
  "manual_only",
]);
export type InterviewCueSensitivity = z.infer<
  typeof InterviewCueSensitivitySchema
>;

export const InterviewHotkeyActionSchema = z.enum([
  "toggle_listening",
  "force_cue",
  "capture_screenshot",
  "capture_screenshot_and_force_cue",
  "toggle_answer_overlay",
  "toggle_transcript_overlay",
  "toggle_overlay_interaction_mode",
  "panic_hide",
  "end_session",
]);
export type InterviewHotkeyAction = z.infer<typeof InterviewHotkeyActionSchema>;

export const InterviewOverlayModeSchema = z.enum([
  "hidden",
  "compact",
  "expanded",
]);
export type InterviewOverlayMode = z.infer<typeof InterviewOverlayModeSchema>;

export const InterviewSetupConsentSchema = z.object({
  microphoneCapture: z.boolean().default(false),
  meetingAudioCapture: z.boolean().default(false),
  screenshotCapture: z.boolean().default(false),
  modelTransmission: z.boolean().default(false),
  localRetention: z.boolean().default(false),
  overlayProtectionNotice: z.boolean().default(false),
  acceptedAt: IsoDateTimeSchema.nullable().default(null),
});
export type InterviewSetupConsent = z.infer<
  typeof InterviewSetupConsentSchema
>;

export const InterviewTargetContextSchema = z.object({
  kind: InterviewTargetContextKindSchema,
  id: NonEmptyStringSchema,
  label: NonEmptyStringSchema,
  role: NonEmptyStringSchema.nullable().default(null),
  company: NonEmptyStringSchema.nullable().default(null),
  sourceUrl: NonEmptyStringSchema.nullable().default(null),
  notes: NonEmptyStringSchema.nullable().default(null),
  savedJob: SavedJobSchema.nullable().default(null),
  profileSnapshot: CandidateProfileSchema.nullable().default(null),
  confirmedAt: IsoDateTimeSchema.nullable().default(null),
});
export type InterviewTargetContext = z.infer<
  typeof InterviewTargetContextSchema
>;

export const InterviewPrepArtifactSchema = z.object({
  id: NonEmptyStringSchema,
  title: NonEmptyStringSchema,
  body: NonEmptyStringSchema,
  sourceSessionId: NonEmptyStringSchema.nullable().default(null),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type InterviewPrepArtifact = z.infer<
  typeof InterviewPrepArtifactSchema
>;

export const InterviewTranscriptionEngineSchema = z.object({
  kind: InterviewTranscriptionEngineKindSchema,
  label: NonEmptyStringSchema,
  ready: z.boolean(),
  privacy: z.enum(["local", "cloud", "unknown"]),
  cost: z.enum(["free", "metered", "unknown"]),
  latency: z.enum(["low", "medium", "high", "unknown"]),
  detail: NonEmptyStringSchema.nullable().default(null),
});
export type InterviewTranscriptionEngine = z.infer<
  typeof InterviewTranscriptionEngineSchema
>;

export const InterviewCapabilityCheckSchema = z.object({
  id: NonEmptyStringSchema,
  label: NonEmptyStringSchema,
  status: InterviewCapabilityStatusSchema,
  required: z.boolean(),
  detail: NonEmptyStringSchema.nullable().default(null),
  checkedAt: IsoDateTimeSchema,
});
export type InterviewCapabilityCheck = z.infer<
  typeof InterviewCapabilityCheckSchema
>;

export const InterviewProtectedSurfaceSchema = z.object({
  id: NonEmptyStringSchema,
  kind: InterviewProtectedSurfaceKindSchema,
  requestedPolicy: z.enum(["screen_share_private", "none"]),
  protectionState: InterviewCaptureProtectionStateSchema,
  verificationMethod: NonEmptyStringSchema.nullable().default(null),
  displayLabel: NonEmptyStringSchema.nullable().default(null),
  detail: NonEmptyStringSchema.nullable().default(null),
  lastVerifiedAt: IsoDateTimeSchema.nullable().default(null),
});
export type InterviewProtectedSurface = z.infer<
  typeof InterviewProtectedSurfaceSchema
>;

export const InterviewOverlayPreferenceSchema = z.object({
  surfaceKind: InterviewProtectedSurfaceKindSchema,
  mode: InterviewOverlayModeSchema.default("compact"),
  visible: z.boolean().default(true),
  interactionMode: z.boolean().default(false),
  opacity: z.number().min(0.35).max(1).default(0.86),
  bounds: z
    .object({
      x: z.number().int(),
      y: z.number().int(),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    })
    .nullable()
    .default(null),
  displayId: NonEmptyStringSchema.nullable().default(null),
  requestedProtectionPolicy: z
    .enum(["screen_share_private", "none"])
    .default("screen_share_private"),
});
export type InterviewOverlayPreference = z.infer<
  typeof InterviewOverlayPreferenceSchema
>;

export const UpdateInterviewOverlayPreferenceInputSchema = z.object({
  surfaceKind: InterviewProtectedSurfaceKindSchema,
  mode: InterviewOverlayModeSchema.optional(),
  visible: z.boolean().optional(),
  interactionMode: z.boolean().optional(),
  opacity: z.number().min(0.35).max(1).optional(),
  bounds: z
    .object({
      x: z.number().int(),
      y: z.number().int(),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    })
    .nullable()
    .optional(),
  displayId: NonEmptyStringSchema.nullable().optional(),
  requestedProtectionPolicy: z
    .enum(["screen_share_private", "none"])
    .optional(),
});
export type UpdateInterviewOverlayPreferenceInput = z.infer<
  typeof UpdateInterviewOverlayPreferenceInputSchema
>;

export const InterviewRehearsalChecklistSchema = z.object({
  status: z.enum(["not_run", "running", "passed", "degraded", "blocked"]),
  language: NonEmptyStringSchema.default("en-US"),
  microphoneEngine: InterviewTranscriptionEngineSchema,
  meetingAudioEngine: InterviewTranscriptionEngineSchema,
  checks: z.array(InterviewCapabilityCheckSchema).default([]),
  protectedSurfaces: z.array(InterviewProtectedSurfaceSchema).default([]),
  updatedAt: IsoDateTimeSchema,
});
export type InterviewRehearsalChecklist = z.infer<
  typeof InterviewRehearsalChecklistSchema
>;

export const InterviewVisualObservationSchema = z.object({
  id: NonEmptyStringSchema,
  summary: NonEmptyStringSchema,
  source: z.enum(["screenshot", "deterministic"]),
  confidence: z.enum(["low", "medium", "high"]).default("medium"),
  createdAt: IsoDateTimeSchema,
});
export type InterviewVisualObservation = z.infer<
  typeof InterviewVisualObservationSchema
>;

export const InterviewCueVisualBatchSchema = z.object({
  id: NonEmptyStringSchema,
  screenshotCount: z.number().int().nonnegative(),
  overlayContaminated: z.boolean().default(false),
  observations: z.array(InterviewVisualObservationSchema).default([]),
  pinnedScreenshotIds: z.array(NonEmptyStringSchema).default([]),
  createdAt: IsoDateTimeSchema,
  clearedAt: IsoDateTimeSchema.nullable().default(null),
});
export type InterviewCueVisualBatch = z.infer<
  typeof InterviewCueVisualBatchSchema
>;

export const InterviewTranscriptSegmentSchema = z.object({
  id: NonEmptyStringSchema,
  sessionId: NonEmptyStringSchema,
  source: InterviewTranscriptSourceSchema,
  state: InterviewTranscriptSegmentStateSchema,
  text: NonEmptyStringSchema,
  startedAt: IsoDateTimeSchema,
  endedAt: IsoDateTimeSchema.nullable().default(null),
  language: NonEmptyStringSchema.default("en-US"),
  confidence: z.number().min(0).max(1).nullable().default(null),
  engineKind: InterviewTranscriptionEngineKindSchema,
  usedInCueIds: z.array(NonEmptyStringSchema).default([]),
});
export type InterviewTranscriptSegment = z.infer<
  typeof InterviewTranscriptSegmentSchema
>;

export const InterviewTranscriptAnnotationSchema = z.object({
  id: NonEmptyStringSchema,
  sessionId: NonEmptyStringSchema,
  transcriptSegmentId: NonEmptyStringSchema.nullable().default(null),
  kind: z.enum(["correction", "note"]),
  originalText: NonEmptyStringSchema.nullable().default(null),
  body: NonEmptyStringSchema,
  createdAt: IsoDateTimeSchema,
});
export type InterviewTranscriptAnnotation = z.infer<
  typeof InterviewTranscriptAnnotationSchema
>;

export const InterviewCueInputDisclosureSchema = z.object({
  transcriptWindow: NonEmptyStringSchema,
  triggerSource: InterviewTranscriptSourceSchema.nullable().default(null),
  targetContextKind: InterviewTargetContextKindSchema,
  screenshotCount: z.number().int().nonnegative(),
  overlayContaminated: z.boolean(),
  degradedCapabilityIds: z.array(NonEmptyStringSchema).default([]),
  usedPartialTranscript: z.boolean().default(false),
});
export type InterviewCueInputDisclosure = z.infer<
  typeof InterviewCueInputDisclosureSchema
>;

export const InterviewCueCardSchema = z.object({
  id: NonEmptyStringSchema,
  sessionId: NonEmptyStringSchema,
  title: NonEmptyStringSchema,
  question: NonEmptyStringSchema,
  answerOutline: z.array(NonEmptyStringSchema).min(1),
  supportingPoints: z.array(NonEmptyStringSchema).default([]),
  clarifyingQuestion: NonEmptyStringSchema.nullable().default(null),
  avoidSaying: NonEmptyStringSchema.nullable().default(null),
  expandedContent: NonEmptyStringSchema.nullable().default(null),
  triggerKind: InterviewCueTriggerKindSchema,
  disclosure: InterviewCueInputDisclosureSchema,
  createdAt: IsoDateTimeSchema,
  rating: z.enum(["up", "down"]).nullable().default(null),
});
export type InterviewCueCard = z.infer<typeof InterviewCueCardSchema>;

export const InterviewDiagnosticEventSchema = z.object({
  id: NonEmptyStringSchema,
  sessionId: NonEmptyStringSchema.nullable().default(null),
  kind: z.enum([
    "capability",
    "permission",
    "latency",
    "hotkey",
    "capture_protection",
    "screenshot",
    "provider",
    "cue",
    "display",
    "lifecycle",
  ]),
  severity: z.enum(["info", "warning", "error"]),
  label: NonEmptyStringSchema,
  detail: NonEmptyStringSchema.nullable().default(null),
  occurredAt: IsoDateTimeSchema,
});
export type InterviewDiagnosticEvent = z.infer<
  typeof InterviewDiagnosticEventSchema
>;

export const InterviewLiveSessionSchema = z.object({
  id: NonEmptyStringSchema,
  status: InterviewSessionLifecycleSchema,
  targetContext: InterviewTargetContextSchema,
  startedAt: IsoDateTimeSchema,
  endedAt: IsoDateTimeSchema.nullable().default(null),
  listening: z.boolean().default(true),
  automaticCueSensitivity: InterviewCueSensitivitySchema.default("conservative"),
  cueSummary: NonEmptyStringSchema.default("No summary yet."),
  transcriptSegments: z.array(InterviewTranscriptSegmentSchema).default([]),
  transcriptAnnotations: z
    .array(InterviewTranscriptAnnotationSchema)
    .default([]),
  cueCards: z.array(InterviewCueCardSchema).default([]),
  visualBatches: z.array(InterviewCueVisualBatchSchema).default([]),
  diagnostics: z.array(InterviewDiagnosticEventSchema).default([]),
  protectedSurfaces: z.array(InterviewProtectedSurfaceSchema).default([]),
});
export type InterviewLiveSession = z.infer<typeof InterviewLiveSessionSchema>;

export const InterviewSetupStateSchema = z.object({
  consent: InterviewSetupConsentSchema.default({}),
  targetContext: InterviewTargetContextSchema.nullable().default(null),
  prepArtifacts: z.array(InterviewPrepArtifactSchema).default([]),
  rehearsal: InterviewRehearsalChecklistSchema.nullable().default(null),
  cueSensitivity: InterviewCueSensitivitySchema.default("conservative"),
  autoCaptureOnCue: z.boolean().default(false),
});
export type InterviewSetupState = z.infer<typeof InterviewSetupStateSchema>;

export const InterviewOverlaySnapshotSchema = z.object({
  surfaceKind: InterviewProtectedSurfaceKindSchema,
  mode: InterviewOverlayModeSchema,
  visible: z.boolean(),
  interactionMode: z.boolean(),
  opacity: z.number().min(0.35).max(1),
  protectionState: InterviewCaptureProtectionStateSchema,
  currentCue: InterviewCueCardSchema.nullable().default(null),
  transcriptSegments: z.array(InterviewTranscriptSegmentSchema).default([]),
  queuedScreenshotCount: z.number().int().nonnegative().default(0),
  statusLabel: NonEmptyStringSchema,
  confidenceLabel: NonEmptyStringSchema.nullable().default(null),
});
export type InterviewOverlaySnapshot = z.infer<
  typeof InterviewOverlaySnapshotSchema
>;

export const InterviewWorkspaceSnapshotSchema = z.object({
  module: z.literal("interview-helper"),
  generatedAt: IsoDateTimeSchema,
  setup: InterviewSetupStateSchema,
  activeSession: InterviewLiveSessionSchema.nullable().default(null),
  recentSessions: z.array(InterviewLiveSessionSchema).default([]),
  overlayPreferences: z.array(InterviewOverlayPreferenceSchema).default([]),
  answerOverlay: InterviewOverlaySnapshotSchema,
  transcriptOverlay: InterviewOverlaySnapshotSchema,
});
export type InterviewWorkspaceSnapshot = z.infer<
  typeof InterviewWorkspaceSnapshotSchema
>;

export const SaveInterviewSetupInputSchema = z.object({
  consent: InterviewSetupConsentSchema.optional(),
  targetContext: InterviewTargetContextSchema.nullable().optional(),
  cueSensitivity: InterviewCueSensitivitySchema.optional(),
  autoCaptureOnCue: z.boolean().optional(),
});
export type SaveInterviewSetupInput = z.infer<
  typeof SaveInterviewSetupInputSchema
>;

export const InterviewSessionActionInputSchema = z.object({
  action: InterviewHotkeyActionSchema,
});
export type InterviewSessionActionInput = z.infer<
  typeof InterviewSessionActionInputSchema
>;

export const InterviewSessionIdInputSchema = z.object({
  sessionId: NonEmptyStringSchema,
});
export type InterviewSessionIdInput = z.infer<
  typeof InterviewSessionIdInputSchema
>;

export const InterviewPrepArtifactFromCueInputSchema = z.object({
  sessionId: NonEmptyStringSchema,
  cueCardId: NonEmptyStringSchema,
});
export type InterviewPrepArtifactFromCueInput = z.infer<
  typeof InterviewPrepArtifactFromCueInputSchema
>;

export const InterviewTranscriptAnnotationInputSchema = z.object({
  sessionId: NonEmptyStringSchema,
  transcriptSegmentId: NonEmptyStringSchema.nullable().default(null),
  kind: z.enum(["correction", "note"]),
  body: NonEmptyStringSchema,
});
export type InterviewTranscriptAnnotationInput = z.infer<
  typeof InterviewTranscriptAnnotationInputSchema
>;

export const InterviewTranscriptSegmentInputSchema = z.object({
  sessionId: NonEmptyStringSchema,
  transcriptSegmentId: NonEmptyStringSchema.nullable().default(null),
  source: InterviewTranscriptSourceSchema,
  state: InterviewTranscriptSegmentStateSchema.default("final"),
  text: NonEmptyStringSchema,
  startedAt: IsoDateTimeSchema.optional(),
  endedAt: IsoDateTimeSchema.nullable().optional(),
  language: NonEmptyStringSchema.default("en-US"),
  confidence: z.number().min(0).max(1).nullable().default(null),
  engineKind: InterviewTranscriptionEngineKindSchema,
});
export type InterviewTranscriptSegmentInput = z.input<
  typeof InterviewTranscriptSegmentInputSchema
>;

export const InterviewExportFormatSchema = z.enum(["markdown", "json"]);
export type InterviewExportFormat = z.infer<typeof InterviewExportFormatSchema>;

export const InterviewExportSessionInputSchema = z.object({
  sessionId: NonEmptyStringSchema,
  format: InterviewExportFormatSchema.default("markdown"),
});
export type InterviewExportSessionInput = z.infer<
  typeof InterviewExportSessionInputSchema
>;

export const InterviewExportResultSchema = z.object({
  fileName: NonEmptyStringSchema,
  mimeType: NonEmptyStringSchema,
  content: NonEmptyStringSchema,
});
export type InterviewExportResult = z.infer<
  typeof InterviewExportResultSchema
>;
