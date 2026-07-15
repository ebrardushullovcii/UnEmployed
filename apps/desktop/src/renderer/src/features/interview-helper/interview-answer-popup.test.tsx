// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { InterviewWorkspaceSnapshot } from "@unemployed/contracts";
import { InterviewAnswerPopup } from "./interview-answer-popup";

function createWorkspace(): InterviewWorkspaceSnapshot {
  return {
    module: "interview-helper",
    generatedAt: "2026-07-14T18:00:00.000Z",
    setup: {
      consent: {
        screenshotCapture: true,
      },
    },
    activeSession: {
      id: "session_popup",
      cueCards: [
        {
          id: "cue_1",
          question: "Tell me about a difficult project.",
          answerOutline: ["Set the context", "Explain the decision", "Share the result"],
        },
      ],
      chatConversation: null,
      transcriptSegments: [],
    },
    answerOverlay: {
      statusLabel: "Live",
      protectionState: "best_effort",
    },
  } as unknown as InterviewWorkspaceSnapshot;
}

function installDesktopApi(workspace: InterviewWorkspaceSnapshot) {
  const interviewHelper = {
    getWorkspace: vi.fn().mockResolvedValue(workspace),
    sendChatMessage: vi.fn().mockResolvedValue({}),
    performAction: vi.fn().mockResolvedValue(workspace),
    updateOverlayPreference: vi.fn().mockResolvedValue(workspace),
    writeClipboardText: vi.fn().mockResolvedValue({ written: true }),
    moveOverlayWindow: vi.fn().mockResolvedValue({ moved: true }),
  };
  Object.defineProperty(window, "unemployed", {
    configurable: true,
    value: { interviewHelper },
  });
  return interviewHelper;
}

beforeEach(() => {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:preview"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("InterviewAnswerPopup", () => {
  test("sends typed questions directly from the popup", async () => {
    const workspace = createWorkspace();
    const api = installDesktopApi(workspace);
    const onWorkspaceChange = vi.fn();
    const rendered = render(
      <InterviewAnswerPopup
        onWorkspaceChange={onWorkspaceChange}
        workspace={workspace}
      />,
    );

    const input = rendered.getByRole("textbox", {
      name: "Ask Interview Copilot",
    });
    fireEvent.change(input, { target: { value: "Give me a stronger answer" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(api.sendChatMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "session_popup",
          content: "Give me a stronger answer",
          attachments: [],
        }),
      );
    });
    expect(onWorkspaceChange).toHaveBeenCalledWith(workspace);
  });

  test("attaches an image and copies or hides the current answer", async () => {
    const workspace = createWorkspace();
    const api = installDesktopApi(workspace);
    const rendered = render(
      <InterviewAnswerPopup
        onWorkspaceChange={() => undefined}
        workspace={workspace}
      />,
    );

    const input = rendered.container.querySelector('input[type="file"]');
    expect(input).not.toBeNull();
    const image = new File([new Uint8Array([1, 2, 3])], "screen.png", {
      type: "image/png",
    });

    act(() => {
      fireEvent.change(input as HTMLInputElement, {
        target: { files: [image] },
      });
    });
    await rendered.findByAltText("screen.png");
    fireEvent.click(rendered.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(api.sendChatMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          attachments: [
            expect.objectContaining({
              fileName: "screen.png",
              mimeType: "image/png",
            }),
          ],
        }),
      );
    });

    fireEvent.click(rendered.getByRole("button", { name: "Copy answer" }));
    await waitFor(() => {
      expect(api.writeClipboardText).toHaveBeenCalledWith({
        text: "Tell me about a difficult project.\nSet the context\nExplain the decision\nShare the result",
      });
    });

    fireEvent.click(rendered.getByRole("button", { name: "Hide answer popup" }));
    await waitFor(() => {
      expect(api.updateOverlayPreference).toHaveBeenCalledWith({
        surfaceKind: "live_answer_overlay",
        visible: false,
      });
    });
  });
});
