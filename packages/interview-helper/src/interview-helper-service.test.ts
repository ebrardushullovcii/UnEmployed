import { describe, expect, test } from "vitest";

import {
  createInterviewHelperService,
  type InterviewCueCardProvider,
  type InterviewHelperRepository,
} from "./index";
import {
  createStaticDesktopAudioCaptureAdapter,
  createStaticDesktopScreenshotCaptureAdapter,
  createStaticProtectedOverlaySurfaceAdapter,
} from "@unemployed/os-integration";
import {
  createDeterministicInterviewCueCardProvider,
  createDeterministicInterviewScreenshotVisionProvider,
  createDeterministicInterviewSummaryProvider,
  createDeterministicInterviewTranscriptionProvider,
  type InterviewTranscriptionProvider,
} from "@unemployed/ai-providers";
import type { InterviewWorkspaceSnapshot } from "@unemployed/contracts";

function createMemoryRepository(): InterviewHelperRepository {
  let snapshot: InterviewWorkspaceSnapshot | null = null;

  return {
    load() {
      return Promise.resolve(snapshot);
    },
    save(nextSnapshot) {
      snapshot = nextSnapshot;
      return Promise.resolve();
    },
    close() {
      return Promise.resolve();
    },
  };
}

function createService(
  repository: InterviewHelperRepository = createMemoryRepository(),
  options: {
    cueCardProvider?: InterviewCueCardProvider;
    transcriptionProvider?: InterviewTranscriptionProvider;
  } = {},
) {
  return createInterviewHelperService({
    repository,
    audioCaptureAdapter: createStaticDesktopAudioCaptureAdapter("win32"),
    screenshotCaptureAdapter: createStaticDesktopScreenshotCaptureAdapter({
      now: () => "2026-05-13T05:00:00.000Z",
    }),
    protectedSurfaceAdapter: createStaticProtectedOverlaySurfaceAdapter({
      platform: "win32",
      now: () => "2026-05-13T05:00:00.000Z",
    }),
    cueCardProvider:
      options.cueCardProvider ?? createDeterministicInterviewCueCardProvider(),
    screenshotVisionProvider:
      createDeterministicInterviewScreenshotVisionProvider(),
    transcriptionProvider:
      options.transcriptionProvider ??
      createDeterministicInterviewTranscriptionProvider(),
    summaryProvider: createDeterministicInterviewSummaryProvider(),
    now: () => "2026-05-13T05:00:00.000Z",
  });
}

async function acceptSetup(service: ReturnType<typeof createService>) {
  await service.saveSetup({
    consent: {
      microphoneCapture: true,
      meetingAudioCapture: true,
      screenshotCapture: true,
      modelTransmission: true,
      localRetention: true,
      overlayProtectionNotice: true,
      acceptedAt: "2026-05-13T05:00:00.000Z",
    },
  });
}

describe("interview helper service", () => {
  test("blocks session start until setup consent is explicit", async () => {
    const service = createService();

    await service.runRehearsal();
    const blocked = await service.startSession();

    expect(blocked.activeSession).toBeNull();
    expect(
      blocked.setup.rehearsal?.checks.some((check) =>
        check.label.includes("Accept setup disclosures"),
      ),
    ).toBe(true);
  });

  test("runs rehearsal and starts a transcript-first live session", async () => {
    const service = createService();

    await acceptSetup(service);
    const rehearsed = await service.runRehearsal();
    expect(rehearsed.setup.rehearsal?.status).toBe("degraded");
    expect(rehearsed.setup.rehearsal?.protectedSurfaces).toHaveLength(2);

    const active = await service.startSession();
    expect(active.activeSession?.status).toBe("active");
    expect(active.activeSession?.transcriptSegments).toHaveLength(2);
    expect(active.activeSession?.cueCards).toHaveLength(1);
    expect(
      active.activeSession?.transcriptSegments.every(
        (segment) => segment.usedInCueIds.length === 1,
      ),
    ).toBe(true);
    expect(active.answerOverlay.currentCue?.answerOutline[0]).toContain(
      "direct",
    );
  });

  test("persists setup preferences into rehearsal and session behavior", async () => {
    const service = createService();

    await acceptSetup(service);
    const saved = await service.saveSetup({
      transcriptionLanguage: "en-GB",
      cueSensitivity: "manual_only",
      autoCaptureOnCue: true,
    });
    const rehearsed = await service.runRehearsal();
    const active = await service.startSession();

    expect(saved.setup.transcriptionLanguage).toBe("en-GB");
    expect(saved.setup.cueSensitivity).toBe("manual_only");
    expect(saved.setup.autoCaptureOnCue).toBe(true);
    expect(rehearsed.setup.rehearsal?.language).toBe("en-GB");
    expect(active.activeSession?.automaticCueSensitivity).toBe("manual_only");
    expect(active.activeSession?.transcriptSegments[0]?.language).toBe("en-GB");
  });

  test("queues contaminated screenshot context and discloses it in a forced cue", async () => {
    const service = createService();

    await acceptSetup(service);
    await service.runRehearsal();
    await service.startSession();
    const withCue = await service.performAction({
      action: "capture_screenshot_and_force_cue",
    });

    const latestCue = withCue.activeSession?.cueCards.at(-1);
    expect(latestCue?.disclosure.screenshotCount).toBe(1);
    expect(latestCue?.disclosure.overlayContaminated).toBe(true);
    expect(
      withCue.activeSession?.visualBatches.at(-1)?.clearedAt,
    ).not.toBeNull();
  });

  test("panic-hide hides overlays without ending the session", async () => {
    const service = createService();

    await acceptSetup(service);
    await service.runRehearsal();
    await service.startSession();
    const hidden = await service.performAction({ action: "panic_hide" });

    expect(hidden.activeSession?.status).toBe("panic_hidden");
    expect(hidden.answerOverlay.visible).toBe(false);
    expect(hidden.transcriptOverlay.visible).toBe(false);
  });

  test("reconfigures a live session through an explicitly paused flow", async () => {
    const service = createService();

    await acceptSetup(service);
    await service.runRehearsal();
    const active = await service.startSession();
    expect(active.activeSession?.status).toBe("active");

    const reconfiguring = await service.beginSessionReconfiguration();
    expect(reconfiguring.activeSession?.status).toBe("reconfiguring");
    expect(reconfiguring.activeSession?.listening).toBe(false);

    await service.saveSetup({ cueSensitivity: "manual_only" });
    await service.runRehearsal();
    const closed = await service.finishSessionReconfiguration();

    expect(closed.activeSession?.status).toBe("paused");
    expect(closed.activeSession?.listening).toBe(false);
    expect(closed.activeSession?.automaticCueSensitivity).toBe("manual_only");
    expect(closed.activeSession?.diagnostics.at(-1)?.label).toBe(
      "Session reconfiguration closed",
    );
  });

  test("adds transcript annotations without overwriting original segments", async () => {
    const service = createService();

    await acceptSetup(service);
    await service.runRehearsal();
    await service.startSession();
    const ended = await service.performAction({ action: "end_session" });
    const session = ended.recentSessions[0];
    const segment = session?.transcriptSegments[0];
    if (!session || !segment) {
      throw new Error("Expected an ended session with transcript segments.");
    }

    const annotated = await service.addTranscriptAnnotation({
      sessionId: session.id,
      transcriptSegmentId: segment.id,
      kind: "correction",
      body: "The interviewer asked about Electron IPC isolation.",
    });

    const annotatedSession = annotated.recentSessions[0];
    expect(annotatedSession?.transcriptSegments[0]?.text).toBe(segment.text);
    expect(annotatedSession?.transcriptAnnotations).toHaveLength(1);
    expect(annotatedSession?.transcriptAnnotations[0]?.originalText).toBe(
      segment.text,
    );

    const exportResult = await service.exportSession({
      sessionId: session.id,
      format: "markdown",
    });
    expect(exportResult.content).toContain("## Transcript Annotations");
    expect(exportResult.content).toContain("Electron IPC isolation");
  });

  test("ingests native live transcript segments and generates a cue", async () => {
    const service = createService();

    await acceptSetup(service);
    await service.runRehearsal();
    const active = await service.startSession();
    const activeSession = active.activeSession;
    if (!activeSession) {
      throw new Error("Expected an active session.");
    }

    const updated = await service.addTranscriptSegment({
      sessionId: activeSession.id,
      source: "meeting_native_transcript",
      text: "How would you keep Electron overlay IPC isolated from the main app?",
      engineKind: "platform_local",
    });

    expect(updated.activeSession?.transcriptSegments.at(-1)?.source).toBe(
      "meeting_native_transcript",
    );
    expect(updated.activeSession?.cueCards.at(-1)?.question).toContain(
      "overlay IPC",
    );
    expect(
      updated.activeSession?.transcriptSegments.at(-1)?.usedInCueIds.at(-1),
    ).toBe(updated.activeSession?.cueCards.at(-1)?.id);
    expect(updated.transcriptOverlay.transcriptSegments.at(-1)?.text).toContain(
      "overlay IPC",
    );
  });

  test("captures a temporary visual batch for automatic cues when enabled", async () => {
    const service = createService();

    await acceptSetup(service);
    await service.saveSetup({ autoCaptureOnCue: true });
    await service.runRehearsal();
    const active = await service.startSession();
    const activeSession = active.activeSession;
    if (!activeSession) {
      throw new Error("Expected an active session.");
    }

    const updated = await service.addTranscriptSegment({
      sessionId: activeSession.id,
      source: "meeting_native_transcript",
      text: "How would you use screenshot context without leaking overlay content?",
      engineKind: "platform_local",
    });

    expect(updated.activeSession?.visualBatches.at(-1)?.clearedAt).not.toBeNull();
    expect(updated.activeSession?.cueCards.at(-1)?.disclosure).toMatchObject({
      screenshotCount: 1,
      overlayContaminated: true,
    });
    expect(
      updated.activeSession?.diagnostics.some(
        (diagnostic) =>
          diagnostic.kind === "screenshot" &&
          diagnostic.label === "Screenshot captured for automatic cue",
      ),
    ).toBe(true);
  });

  test("updates partial transcript segments without duplicating them", async () => {
    const service = createService();

    await acceptSetup(service);
    await service.runRehearsal();
    const active = await service.startSession();
    const activeSession = active.activeSession;
    if (!activeSession) {
      throw new Error("Expected an active session.");
    }

    const partial = await service.addTranscriptSegment({
      sessionId: activeSession.id,
      transcriptSegmentId: "native_segment_1",
      source: "meeting_native_transcript",
      state: "partial",
      text: "How would you keep",
      engineKind: "platform_local",
    });
    const final = await service.addTranscriptSegment({
      sessionId: activeSession.id,
      transcriptSegmentId: "native_segment_1",
      source: "meeting_native_transcript",
      state: "final",
      text: "How would you keep transcript ingestion typed?",
      engineKind: "platform_local",
    });

    expect(
      partial.activeSession?.transcriptSegments.filter(
        (segment) => segment.id === "native_segment_1",
      ),
    ).toHaveLength(1);
    expect(
      final.activeSession?.transcriptSegments.filter(
        (segment) => segment.id === "native_segment_1",
      ),
    ).toHaveLength(1);
    expect(final.activeSession?.transcriptSegments.at(-1)?.state).toBe("final");
  });

  test("transcribes transient meeting audio chunks without retaining raw audio", async () => {
    const transcriptionProvider =
      createDeterministicInterviewTranscriptionProvider();
    const service = createService(createMemoryRepository(), {
      transcriptionProvider: {
        ...transcriptionProvider,
        transcribeAudioChunk: () =>
          Promise.resolve({
            text: "How would you design a capture-safe overlay system?",
            confidence: 0.91,
            language: "en-US",
            engineKind: "cloud_ai",
          }),
      },
    });

    await acceptSetup(service);
    await service.runRehearsal();
    const active = await service.startSession();
    const activeSession = active.activeSession;
    if (!activeSession) {
      throw new Error("Expected an active session.");
    }

    const updated = await service.transcribeAudioChunk({
      sessionId: activeSession.id,
      source: "meeting_audio",
      mimeType: "audio/webm",
      audioBase64: "dGVzdCBhdWRpbw==",
      startedAt: "2026-05-13T05:00:00.000Z",
      endedAt: "2026-05-13T05:00:05.000Z",
    });

    const transcript = updated.activeSession?.transcriptSegments.at(-1);
    expect(transcript).toMatchObject({
      source: "meeting_audio",
      text: "How would you design a capture-safe overlay system?",
      engineKind: "cloud_ai",
    });
    expect(JSON.stringify(updated)).not.toContain("dGVzdCBhdWRpbw==");
    expect(updated.activeSession?.cueCards.at(-1)?.question).toContain(
      "capture-safe overlay",
    );
  });

  test("shows a quiet fallback cue card when provider output fails validation", async () => {
    const invalidCueProvider: InterviewCueCardProvider = {
      getStatus() {
        return {
          ready: true,
          label: "Invalid cue provider",
          detail: null,
        };
      },
      generateCueCard() {
        return Promise.resolve({
          id: "",
        } as unknown as Awaited<
          ReturnType<InterviewCueCardProvider["generateCueCard"]>
        >);
      },
    };
    const service = createService(createMemoryRepository(), {
      cueCardProvider: invalidCueProvider,
    });

    await acceptSetup(service);
    await service.runRehearsal();
    const updated = await service.startSession();

    const cue = updated.activeSession?.cueCards.at(-1);
    expect(cue?.title).toBe("Cue unavailable");
    expect(cue?.answerOutline).toContain(
      "Ask for a moment to think, then answer from your own experience.",
    );
    expect(updated.activeSession?.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "provider",
          severity: "warning",
          label: "Cue provider failed",
        }),
        expect.objectContaining({
          kind: "cue",
          severity: "warning",
          label: "Cue fallback card shown",
        }),
      ]),
    );
  });

  test("records runtime overlay protection verification evidence", async () => {
    const service = createService();

    await acceptSetup(service);
    await service.runRehearsal();
    await service.startSession();
    const updated = await service.recordProtectedSurfaceVerification({
      protectedSurfaces: [
        {
          id: "live_answer_overlay_interview-answer-overlay",
          kind: "live_answer_overlay",
          requestedPolicy: "screen_share_private",
          protectionState: "verified_protected",
          verificationMethod:
            "electron-desktopCapturer-screen-thumbnail-vs-overlay-window-pixels",
          displayLabel: "Screen 1",
          detail:
            "Overlay pixels were not detected in ordinary Electron screen capture. Meeting-app-specific exclusion is not verified.",
          lastVerifiedAt: "2026-05-13T05:00:00.000Z",
        },
      ],
    });

    expect(
      updated.activeSession?.protectedSurfaces.find(
        (surface) => surface.kind === "live_answer_overlay",
      )?.protectionState,
    ).toBe("verified_protected");
    expect(
      updated.activeSession?.diagnostics.at(-1)?.kind,
    ).toBe("capture_protection");
    expect(updated.activeSession?.diagnostics.at(-1)?.detail).toContain(
      "ordinary Electron screen-capture verification",
    );
  });

  test("marks overlay protection stale when display topology changes", async () => {
    const service = createService();

    await acceptSetup(service);
    await service.runRehearsal();
    await service.startSession();
    await service.recordProtectedSurfaceVerification({
      protectedSurfaces: [
        {
          id: "live_answer_overlay_interview-answer-overlay",
          kind: "live_answer_overlay",
          requestedPolicy: "screen_share_private",
          protectionState: "verified_protected",
          verificationMethod:
            "electron-desktopCapturer-screen-thumbnail-vs-overlay-window-pixels",
          displayLabel: "Screen 1",
          detail: "Verified before display change.",
          lastVerifiedAt: "2026-05-13T05:00:00.000Z",
        },
      ],
    });

    const updated = await service.recordDisplayChange({
      reason: "display_metrics_changed",
      detail: "Primary display bounds changed.",
    });
    const surface = updated.activeSession?.protectedSurfaces.find(
      (entry) => entry.kind === "live_answer_overlay",
    );

    expect(surface).toMatchObject({
      protectionState: "requested_unverified",
      verificationMethod: "display-change-revalidation-required",
      detail: "Primary display bounds changed.",
      lastVerifiedAt: null,
    });
    expect(updated.activeSession?.diagnostics.at(-1)).toMatchObject({
      kind: "display",
      severity: "warning",
      label: "Display change requires overlay revalidation",
    });
  });

  test("persists overlay layout preferences independently of session history", async () => {
    const service = createService();

    await acceptSetup(service);
    await service.runRehearsal();
    await service.startSession();
    const updated = await service.updateOverlayPreference({
      surfaceKind: "live_answer_overlay",
      bounds: { x: 80, y: 96, width: 460, height: 280 },
      displayId: "display_1",
    });

    expect(updated.overlayPreferences).toContainEqual(
      expect.objectContaining({
        surfaceKind: "live_answer_overlay",
        bounds: { x: 80, y: 96, width: 460, height: 280 },
        displayId: "display_1",
      }),
    );
    expect(updated.activeSession?.status).toBe("active");
    expect(updated.recentSessions).toHaveLength(0);
  });

  test("resets overlay layout preferences without deleting session history", async () => {
    const service = createService();

    await acceptSetup(service);
    await service.runRehearsal();
    await service.startSession();
    const moved = await service.updateOverlayPreference({
      surfaceKind: "live_transcript_overlay",
      bounds: { x: 120, y: 140, width: 520, height: 320 },
      displayId: "display_2",
    });
    const ended = await service.performAction({ action: "end_session" });
    const reset = await service.resetOverlayPreferences();

    expect(
      moved.overlayPreferences.find(
        (preference) => preference.surfaceKind === "live_transcript_overlay",
      )?.bounds,
    ).toEqual({ x: 120, y: 140, width: 520, height: 320 });
    expect(reset.recentSessions).toHaveLength(ended.recentSessions.length);
    expect(
      reset.overlayPreferences.find(
        (preference) => preference.surfaceKind === "live_transcript_overlay",
      )?.bounds,
    ).toBeNull();
  });

  test("marks persisted active sessions interrupted instead of resuming capture", async () => {
    const repository = createMemoryRepository();
    const firstService = createService(repository);

    await acceptSetup(firstService);
    await firstService.runRehearsal();
    const active = await firstService.startSession();
    expect(active.activeSession?.status).toBe("active");

    const restartedService = createService(repository);
    const recovered = await restartedService.getWorkspace();

    expect(recovered.activeSession).toBeNull();
    expect(recovered.recentSessions[0]?.status).toBe("interrupted");
    expect(recovered.recentSessions[0]?.listening).toBe(false);
    expect(recovered.recentSessions[0]?.diagnostics.at(-1)?.label).toContain(
      "interrupted",
    );
  });
});
