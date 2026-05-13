import { describe, expect, test } from "vitest";

import {
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

    expect(workspace.setup.rehearsal?.protectedSurfaces[0]?.protectionState).toBe(
      "requested_unverified",
    );
  });

  test("defaults setup inputs without widening unknown shape", () => {
    const input = SaveInterviewSetupInputSchema.parse({
      autoCaptureOnCue: true,
    });

    expect(input.autoCaptureOnCue).toBe(true);
    expect(input.consent).toBeUndefined();
  });
});
