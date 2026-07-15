// @vitest-environment jsdom

import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { InterviewWorkspaceSnapshot } from "@unemployed/contracts";

import { InterviewVisibleChat } from "./interview-visible-chat";

vi.mock("./interview-media-stream-probes", () => ({
  InterviewMediaStreamProbes: (props: { listening: boolean }) => (
    <div data-listening={String(props.listening)} data-testid="media-probes" />
  ),
}));

const originalScrollTo = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "scrollTo",
);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  if (originalScrollTo) {
    Object.defineProperty(HTMLElement.prototype, "scrollTo", originalScrollTo);
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, "scrollTo");
  }
});

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function createWorkspace(): InterviewWorkspaceSnapshot {
  return {
    module: "interview-helper",
    generatedAt: "2026-05-13T05:00:00.000Z",
    setup: {
      consent: {
        microphoneCapture: true,
        meetingAudioCapture: true,
        screenshotCapture: true,
        modelTransmission: true,
        localRetention: true,
        overlayProtectionNotice: true,
        acceptedAt: "2026-05-13T04:59:00.000Z",
      },
      transcriptionLanguage: "en-US",
    },
    activeSession: {
      id: "session_1",
      listening: true,
      cueCards: [],
      chatConversation: null,
      transcriptSegments: [],
    },
    answerOverlay: {
      queuedScreenshotCount: 0,
      visible: true,
    },
    transcriptOverlay: {
      visible: true,
    },
  } as unknown as InterviewWorkspaceSnapshot;
}

describe("InterviewVisibleChat capture controls", () => {
  test("suspends local capture before the pause IPC resolves", async () => {
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: vi.fn(),
    });
    const pauseGate = createDeferred();
    const onPerform = vi.fn(() => pauseGate.promise);
    const rendered = render(
      <InterviewVisibleChat
        audioTranscriptionAvailable
        onPerform={onPerform}
        onWorkspaceChange={() => undefined}
        pendingAction={null}
        workspace={createWorkspace()}
      />,
    );

    expect(
      rendered.getByTestId("media-probes").getAttribute("data-listening"),
    ).toBe("true");
    fireEvent.click(rendered.getByRole("button", { name: "Pause" }));

    expect(onPerform).toHaveBeenCalledWith("toggle_listening");
    expect(
      rendered.getByTestId("media-probes").getAttribute("data-listening"),
    ).toBe("false");

    await act(async () => {
      pauseGate.resolve();
      await pauseGate.promise;
    });
  });
});
