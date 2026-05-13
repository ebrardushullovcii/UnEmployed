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

function createService() {
  return createInterviewHelperService({
    repository: createMemoryRepository(),
    audioCaptureAdapter: createStaticDesktopAudioCaptureAdapter("win32"),
    screenshotCaptureAdapter: createStaticDesktopScreenshotCaptureAdapter({
      now: () => "2026-05-13T05:00:00.000Z",
    }),
    protectedSurfaceAdapter: createStaticProtectedOverlaySurfaceAdapter({
      platform: "win32",
      now: () => "2026-05-13T05:00:00.000Z",
    }),
    cueCardProvider: createDeterministicInterviewCueCardProvider(),
    screenshotVisionProvider: createDeterministicInterviewScreenshotVisionProvider(),
    transcriptionProvider: createDeterministicInterviewTranscriptionProvider(),
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
    expect(active.answerOverlay.currentCue?.answerOutline[0]).toContain("direct");
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
    expect(withCue.activeSession?.visualBatches.at(-1)?.clearedAt).not.toBeNull();
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
});
