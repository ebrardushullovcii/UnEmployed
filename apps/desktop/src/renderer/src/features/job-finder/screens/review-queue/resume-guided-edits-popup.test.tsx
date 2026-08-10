// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResumeGuidedEditsPopup } from "./resume-guided-edits-popup";

describe("ResumeGuidedEditsPopup", () => {
  beforeEach(() => {
    class ResizeObserverMock {
      observe() {}
      disconnect() {}
      unobserve() {}
    }

    class PointerEventMock extends MouseEvent {
      readonly isPrimary: boolean;
      readonly pointerId: number;

      constructor(
        type: string,
        init: MouseEventInit & { isPrimary?: boolean; pointerId?: number },
      ) {
        super(type, init);
        this.isPrimary = init.isPrimary ?? true;
        this.pointerId = init.pointerId ?? 1;
      }
    }

    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    vi.stubGlobal("PointerEvent", PointerEventMock);
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1280,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 800,
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function renderPopup() {
    render(
      <>
        <section data-resume-workspace-top-actions />
        <ResumeGuidedEditsPopup
          assistantMessages={[]}
          assistantPending={false}
          isWorkspacePending={false}
          onSendAssistantMessage={vi.fn()}
        />
      </>,
    );
  }

  it("keeps the expanded panel below the measured workspace actions", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function getBoundingClientRect(this: HTMLElement) {
        const bottom = this.hasAttribute("data-resume-workspace-top-actions")
          ? 204
          : 0;

        return {
          bottom,
          height: bottom,
          left: 0,
          right: 1280,
          top: 0,
          width: 1280,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        };
      },
    );
    renderPopup();

    fireEvent.click(screen.getByRole("button", { name: "Open guided edits" }));

    const popupRoot = document.querySelector<HTMLElement>(
      "[data-resume-guided-edits-open]",
    );
    const dialog = screen.getByRole("dialog", { name: "Guided edits" });

    expect(popupRoot?.style.top).toBe("220px");
    expect(dialog.style.maxHeight).toBe("calc(100vh - 236px)");
  });

  it("keeps the desktop launcher bottom-left while hiding it below the desktop studio breakpoint", () => {
    renderPopup();

    const popupRoot = document.querySelector<HTMLElement>(
      "[data-resume-guided-edits-open]",
    );

    expect(popupRoot?.parentElement).toBe(document.body);
    expect(popupRoot?.className).toContain("hidden");
    expect(popupRoot?.className).toContain("xl:flex");
    expect(popupRoot?.style.left).toBe("16px");
    expect(popupRoot?.style.bottom).toBe("16px");
    const launcher = screen.getByRole("button", {
      name: "Open guided edits",
    });

    expect(launcher.className).toContain("size-12");
    expect(launcher.className).toContain("p-0");
    expect(launcher.getAttribute("title")).toBe("Open guided edits");
  });

  it("uses top-right panel controls and removes the duplicate launcher while open", () => {
    renderPopup();
    fireEvent.click(screen.getByRole("button", { name: "Open guided edits" }));

    const dialog = screen.getByRole("dialog", { name: "Guided edits" });
    const header = screen.getByLabelText("Drag guided edits");

    expect(header.className).toContain("cursor-grab");
    expect(
      screen.getByRole("button", { name: "Maximize guided edits" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Minimize guided edits" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Open guided edits" }),
    ).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByTestId("resume-assistant-input"),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Maximize guided edits" }),
    );
    expect(dialog.getAttribute("data-resume-guided-edits-maximized")).toBe(
      "true",
    );
    expect(dialog.style.width).toBe("calc(100vw - 32px)");
    expect(
      screen.getByRole("button", { name: "Restore guided edits" }),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Restore guided edits" }),
    );
    expect(dialog.getAttribute("data-resume-guided-edits-maximized")).toBe(
      "false",
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Minimize guided edits" }),
    );
    expect(screen.queryByRole("dialog", { name: "Guided edits" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Open guided edits" }),
    ).toBeTruthy();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Open guided edits" }),
    );
  });

  it("closes on Escape and restores focus to the launcher", () => {
    renderPopup();
    fireEvent.click(screen.getByRole("button", { name: "Open guided edits" }));

    expect(document.activeElement).toBe(
      screen.getByTestId("resume-assistant-input"),
    );

    const handledEscape = new KeyboardEvent("keydown", {
      cancelable: true,
      key: "Escape",
    });
    handledEscape.preventDefault();
    fireEvent(window, handledEscape);

    expect(screen.getByRole("dialog", { name: "Guided edits" })).toBeTruthy();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: "Guided edits" })).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Open guided edits" }),
    );
  });

  it("keeps native keyboard activation and does not swallow the next mouse click", () => {
    renderPopup();
    const launcher = screen.getByRole("button", { name: "Open guided edits" });
    const enterEvent = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Enter",
    });

    launcher.dispatchEvent(enterEvent);
    expect(enterEvent.defaultPrevented).toBe(false);

    fireEvent.click(launcher);
    expect(screen.getByRole("dialog", { name: "Guided edits" })).toBeTruthy();

    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Open guided edits" }));

    expect(screen.getByRole("dialog", { name: "Guided edits" })).toBeTruthy();
  });

  it("keeps existing and newly arriving messages minimized until the user opens them", () => {
    const onSendAssistantMessage = vi.fn();
    const firstMessage = {
      id: "assistant_existing",
      jobId: "job_ready",
      role: "assistant" as const,
      content: "Existing grounded edit guidance.",
      patches: [],
      proposalStatus: "none" as const,
      baseDraftUpdatedAt: null,
      resolvedPatchIds: [],
      resolvedAt: null,
      proposalError: null,
      createdAt: "2026-08-09T20:00:00.000Z",
    };
    const { rerender } = render(
      <ResumeGuidedEditsPopup
        assistantMessages={[firstMessage]}
        assistantPending={false}
        isWorkspacePending={false}
        onSendAssistantMessage={onSendAssistantMessage}
      />,
    );

    expect(screen.queryByRole("dialog", { name: "Guided edits" })).toBeNull();
    expect(
      screen.getByRole("button", {
        name: "Open guided edits, continue thread",
      }),
    ).toBeTruthy();

    rerender(
      <ResumeGuidedEditsPopup
        assistantMessages={[
          firstMessage,
          {
            id: "assistant_new",
            jobId: "job_ready",
            role: "assistant",
            content: "A newer reply arrived.",
            patches: [],
            proposalStatus: "none",
            baseDraftUpdatedAt: null,
            resolvedPatchIds: [],
            resolvedAt: null,
            proposalError: null,
            createdAt: "2026-08-09T20:01:00.000Z",
          },
        ]}
        assistantPending={true}
        isWorkspacePending={false}
        onSendAssistantMessage={onSendAssistantMessage}
      />,
    );

    expect(screen.queryByRole("dialog", { name: "Guided edits" })).toBeNull();
    expect(
      screen.getByRole("button", {
        name: "Open guided edits, reply in progress",
      }),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Open guided edits, reply in progress",
      }),
    );
    const dialog = screen.getByRole("dialog", { name: "Guided edits" });
    expect(dialog.className).toContain("surface-popover-solid");
    expect(dialog.className).not.toContain("surface-panel-shell");
    expect(dialog.className).not.toContain("backdrop-blur");
  });

  it("moves the expanded panel by its header while keeping it in the viewport", () => {
    renderPopup();
    fireEvent.click(screen.getByRole("button", { name: "Open guided edits" }));

    const popupRoot = document.querySelector<HTMLElement>(
      "[data-resume-guided-edits-open]",
    );
    const header = screen.getByLabelText("Drag guided edits");
    const initialLeft = popupRoot?.style.left;

    fireEvent.pointerDown(header, {
      button: 0,
      clientX: 24,
      clientY: 160,
      isPrimary: true,
      pointerId: 1,
    });
    fireEvent.pointerMove(header, {
      button: 0,
      clientX: 124,
      clientY: 210,
      isPrimary: true,
      pointerId: 1,
    });
    fireEvent.pointerUp(header, {
      button: 0,
      clientX: 124,
      clientY: 210,
      isPrimary: true,
      pointerId: 1,
    });

    expect(popupRoot?.style.left).not.toBe(initialLeft);
    expect(
      Number.parseInt(popupRoot?.style.left ?? "0", 10),
    ).toBeGreaterThanOrEqual(16);
    expect(
      Number.parseInt(popupRoot?.style.top ?? "0", 10),
    ).toBeGreaterThanOrEqual(112);

    fireEvent.click(
      screen.getByRole("button", { name: "Minimize guided edits" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Open guided edits" }));
    expect(screen.getByRole("dialog", { name: "Guided edits" })).toBeTruthy();
  });
});
