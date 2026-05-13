import { describe, expect, test } from "vitest";

import {
  InterviewAudioTranscriptionInputSchema,
  InterviewTranscriptAnnotationInputSchema,
  InterviewTranscriptSegmentInputSchema,
  InterviewWorkspaceSnapshotSchema,
  SaveInterviewSetupInputSchema,
} from "./interview-helper";

const now = "2026-05-13T05:00:00.000Z";

describe("interview helper contracts", () => {
  test("parses a full workspace snapshot with protected overlays", () => {
    const workspace = InterviewWorkspaceSnapshotSchema.parse({
      module: "interview-helper",
      generatedAt: now,
      setup: {
        consent: {
          microphoneCapture: true,
          meetingAudioCapture: true,
          screenshotCapture: true,
          modelTransmission: true,
          localRetention: true,
          overlayProtectionNotice: true,
          acceptedAt: now,
        },
        targetContext: {
          kind: "general_interview",
          id: "target_1",
          label: "General technical interview",
          confirmedAt: now,
        },
        rehearsal: {
          status: "degraded",
          language: "en-US",
          microphoneEngine: {
            kind: "deterministic",
            label: "Deterministic transcript engine",
            ready: true,
            privacy: "local",
            cost: "free",
            latency: "low",
          },
          meetingAudioEngine: {
            kind: "deterministic",
            label: "Deterministic meeting audio engine",
            ready: true,
            privacy: "local",
            cost: "free",
            latency: "low",
          },
          checks: [
            {
              id: "panic_hide",
              label: "Panic-hide hotkey",
              status: "available",
              required: true,
              checkedAt: now,
            },
          ],
          protectedSurfaces: [
            {
              id: "answer_surface",
              kind: "live_answer_overlay",
              requestedPolicy: "screen_share_private",
              protectionState: "requested_unverified",
              verificationMethod: "electron-content-protection-request",
              lastVerifiedAt: now,
            },
          ],
          updatedAt: now,
        },
      },
      activeSession: null,
      recentSessions: [],
      overlayPreferences: [
        {
          surfaceKind: "live_answer_overlay",
          mode: "compact",
          visible: true,
          interactionMode: false,
          opacity: 0.86,
        },
      ],
      answerOverlay: {
        surfaceKind: "live_answer_overlay",
        mode: "compact",
        visible: true,
        interactionMode: false,
        opacity: 0.86,
        protectionState: "requested_unverified",
        currentCue: null,
        transcriptSegments: [],
        queuedScreenshotCount: 0,
        statusLabel: "Ready",
      },
      transcriptOverlay: {
        surfaceKind: "live_transcript_overlay",
        mode: "compact",
        visible: true,
        interactionMode: false,
        opacity: 0.86,
        protectionState: "requested_unverified",
        currentCue: null,
        transcriptSegments: [],
        queuedScreenshotCount: 0,
        statusLabel: "Ready",
      },
    });

    expect(
      workspace.setup.rehearsal?.protectedSurfaces[0]?.protectionState,
    ).toBe("requested_unverified");
  });

  test("defaults setup inputs without widening unknown shape", () => {
    const input = SaveInterviewSetupInputSchema.parse({
      autoCaptureOnCue: true,
    });

    expect(input.autoCaptureOnCue).toBe(true);
    expect(input.consent).toBeUndefined();
  });

  test("parses transcript annotations as explicit post-session review data", () => {
    const input = InterviewTranscriptAnnotationInputSchema.parse({
      sessionId: "interview_session_1",
      transcriptSegmentId: "segment_1",
      kind: "correction",
      body: "The interviewer asked about IPC isolation, not API isolation.",
    });

    expect(input.kind).toBe("correction");
    expect(input.transcriptSegmentId).toBe("segment_1");
  });

  test("parses native transcript ingestion as a non-ai transcript source", () => {
    const input = InterviewTranscriptSegmentInputSchema.parse({
      sessionId: "interview_session_1",
      source: "meeting_native_transcript",
      text: "Can you compare browser speech recognition with a local model?",
      engineKind: "platform_local",
    });

    expect(input.state).toBe("final");
    expect(input.language).toBe("en-US");
    expect(input.confidence).toBeNull();
  });

  test("parses transient audio transcription input without broad source access", () => {
    const input = InterviewAudioTranscriptionInputSchema.parse({
      sessionId: "interview_session_1",
      source: "meeting_audio",
      mimeType: "audio/webm",
      audioBase64: "dGVzdCBhdWRpbw==",
    });

    expect(input.source).toBe("meeting_audio");
    expect(input.language).toBe("en-US");
  });
});
