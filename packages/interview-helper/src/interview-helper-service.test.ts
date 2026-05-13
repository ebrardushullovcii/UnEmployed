import { describe, expect, test } from "vitest";

import {
  createInterviewHelperService,
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
    cueCardProvider: createDeterministicInterviewCueCardProvider(),
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
