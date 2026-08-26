// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  COPILOT_LAUNCHER_MIN_INTERACTIVE_GAP,
  getCollapsedLauncherStackSize,
} from "./profile-copilot-rail-layout";
import { ProfileCopilotRail } from "./profile-copilot-rail";

describe("ProfileCopilotRail", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }

    root = null;
    container?.remove();
    container = null;
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it("floats at the right edge without reserving page space and exposes a draggable open panel", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root?.render(
        <ProfileCopilotRail
          busy={false}
          context={{ surface: "setup", step: "targeting" }}
          emptyStateDescription="Ask why a field matters."
          emptyStateTitle="No requests yet"
          messages={[]}
          onApplyPatchGroup={vi.fn()}
          onRejectPatchGroup={vi.fn()}
          onSendMessage={vi.fn()}
          onUndoRevision={vi.fn()}
          pendingContextKey={null}
          placeholder="Ask for an edit"
          revisions={[]}
          title="Profile Copilot"
        />,
      );
    });

    const bubble = document.body.querySelector<HTMLButtonElement>(
      'button[aria-haspopup="dialog"]',
    );
    const rail = bubble?.parentElement;

    expect(bubble).not.toBeNull();
    expect(bubble?.className).toContain("cursor-pointer");
    expect(bubble?.className).toContain("size-12");
    expect(rail?.className).toContain("fixed");
    expect(rail?.style.left).toBe("");
    expect(rail?.style.right).toBe("16px");
    expect(rail?.style.bottom).toBe("16px");
    expect(rail?.style.top).toBe("");
    expect(container?.children).toHaveLength(0);

    act(() => {
      bubble?.click();
    });

    const panel = document.body.querySelector<HTMLElement>(
      'aside[role="dialog"]',
    );
    const dragHandle = panel?.querySelector<HTMLElement>(
      'header[aria-label="Drag Profile Copilot"]',
    );

    expect(panel).not.toBeNull();
    expect(dragHandle?.className).toContain("cursor-grab");
    expect(
      document.body.querySelector('button[aria-haspopup="dialog"]'),
    ).toBeNull();
    expect(document.activeElement).toBe(
      document.getElementById(panel?.querySelector("textarea")?.id ?? ""),
    );
    expect(rail?.style.left).not.toBe("");
    expect(
      panel?.querySelector('button[aria-label="Maximize Profile Copilot"]'),
    ).not.toBeNull();
    expect(
      panel?.querySelector('button[aria-label="Minimize Profile Copilot"]'),
    ).not.toBeNull();

    act(() => {
      panel
        ?.querySelector<HTMLButtonElement>(
          'button[aria-label="Maximize Profile Copilot"]',
        )
        ?.click();
    });

    expect(panel?.getAttribute("data-profile-copilot-maximized")).toBe("true");
    expect(rail?.style.width).toBe("calc(100vw - 32px)");
    expect(rail?.style.maxWidth).toBe("calc(100vw - 32px)");
    expect(panel?.style.width).toBe("100%");
    expect(
      panel?.querySelector('button[aria-label="Restore Profile Copilot"]'),
    ).not.toBeNull();

    act(() => {
      panel
        ?.querySelector<HTMLButtonElement>(
          'button[aria-label="Restore Profile Copilot"]',
        )
        ?.click();
    });

    expect(panel?.getAttribute("data-profile-copilot-maximized")).toBe("false");
    expect(rail?.style.width).toBe("");
    expect(rail?.style.maxWidth).toBe("");
    expect(panel?.style.width).not.toBe("100%");

    act(() => {
      panel
        ?.querySelector<HTMLButtonElement>(
          'button[aria-label="Minimize Profile Copilot"]',
        )
        ?.click();
    });

    expect(rail?.style.bottom).toBe("16px");
    expect(document.activeElement).toBe(
      document.body.querySelector('button[aria-haspopup="dialog"]'),
    );

    act(() => {
      document.body
        .querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]')
        ?.click();
    });

    expect(document.activeElement?.tagName).toBe("TEXTAREA");

    act(() => {
      const handledEscape = new KeyboardEvent("keydown", {
        cancelable: true,
        key: "Escape",
      });
      handledEscape.preventDefault();
      window.dispatchEvent(handledEscape);
    });

    expect(document.body.querySelector('aside[role="dialog"]')).not.toBeNull();

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(document.body.querySelector('aside[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(
      document.body.querySelector('button[aria-haspopup="dialog"]'),
    );
  });

  it("lifts the launcher above a visible Profile action footer", () => {
    const actions = document.createElement("div");
    actions.setAttribute("data-profile-workspace-actions", "");
    actions.getBoundingClientRect = () =>
      ({
        bottom: window.innerHeight,
        height: 100,
        left: 0,
        right: window.innerWidth,
        top: window.innerHeight - 100,
        width: window.innerWidth,
        x: 0,
        y: window.innerHeight - 100,
        toJSON: () => ({}),
      }) as DOMRect;
    document.body.appendChild(actions);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root?.render(
        <ProfileCopilotRail
          busy={false}
          context={{ surface: "profile", section: "basics" }}
          emptyStateDescription="Ask why a field matters."
          emptyStateTitle="No requests yet"
          messages={[]}
          onApplyPatchGroup={vi.fn()}
          onRejectPatchGroup={vi.fn()}
          onSendMessage={vi.fn()}
          onUndoRevision={vi.fn()}
          pendingContextKey={null}
          placeholder="Ask for an edit"
          revisions={[]}
          title="Profile Copilot"
        />,
      );
    });

    const bubble = document.body.querySelector<HTMLButtonElement>(
      'button[aria-haspopup="dialog"]',
    );
    expect(bubble?.parentElement?.style.bottom).toBe("124px");

    act(() => {
      actions.remove();
    });
  });

  it("lifts the launcher above Profile section tabs in the bottom corner", () => {
    const tabs = document.createElement("div");
    tabs.setAttribute("data-profile-section-tabs", "");
    tabs.getBoundingClientRect = () =>
      ({
        bottom: window.innerHeight - 20,
        height: 68,
        left: 0,
        right: window.innerWidth,
        top: window.innerHeight - 88,
        width: window.innerWidth,
        x: 0,
        y: window.innerHeight - 88,
        toJSON: () => ({}),
      }) as DOMRect;
    document.body.appendChild(tabs);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root?.render(
        <ProfileCopilotRail
          busy={false}
          context={{ surface: "profile", section: "basics" }}
          emptyStateDescription="Ask why a field matters."
          emptyStateTitle="No requests yet"
          messages={[]}
          onApplyPatchGroup={vi.fn()}
          onRejectPatchGroup={vi.fn()}
          onSendMessage={vi.fn()}
          onUndoRevision={vi.fn()}
          pendingContextKey={null}
          placeholder="Ask for an edit"
          revisions={[]}
          title="Profile Copilot"
        />,
      );
    });

    const bubble = document.body.querySelector<HTMLButtonElement>(
      'button[aria-haspopup="dialog"]',
    );
    expect(bubble?.parentElement?.style.bottom).toBe("112px");

    act(() => {
      tabs.remove();
    });
  });

  it("lifts the suggestion pill clear of section tabs inside the old 64px probe blind zone", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1440,
      writable: true,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 920,
      writable: true,
    });
    const tabs = document.createElement("div");
    tabs.setAttribute("data-profile-section-tabs", "");
    const tabsBottom = 840;
    tabs.getBoundingClientRect = () =>
      ({
        bottom: tabsBottom,
        height: 68,
        left: 0,
        right: 1440,
        top: tabsBottom - 68,
        width: 1440,
        x: 0,
        y: tabsBottom - 68,
        toJSON: () => ({}),
      }) as DOMRect;
    document.body.appendChild(tabs);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root?.render(
        <ProfileCopilotRail
          busy={false}
          context={{ surface: "profile", section: "basics" }}
          emptyStateDescription="Ask why a field matters."
          emptyStateTitle="No requests yet"
          messages={[]}
          onApplyPatchGroup={vi.fn()}
          onRejectPatchGroup={vi.fn()}
          onSendMessage={vi.fn()}
          onUndoRevision={vi.fn()}
          pendingContextKey={null}
          placeholder="Ask for an edit"
          revisions={[]}
          starterQuestion="How should I tighten my headline?"
          title="Profile Copilot"
        />,
      );
    });

    const rail = document.body.querySelector<HTMLButtonElement>(
      'button[aria-haspopup="dialog"]',
    )?.parentElement;
    expect(rail).not.toBeNull();
    expect(rail?.querySelector(".max-sm\\:hidden")).not.toBeNull();

    const launcherStack = getCollapsedLauncherStackSize({
      showSuggestionPill: true,
    });
    const clearance = Number.parseInt(rail?.style.bottom ?? "0", 10);
    const stackBottom = window.innerHeight - clearance;

    expect(stackBottom).toBeLessThanOrEqual(
      tabsBottom - 68 - COPILOT_LAUNCHER_MIN_INTERACTIVE_GAP,
    );
    expect(
      window.innerHeight - clearance - launcherStack.height,
    ).toBeGreaterThanOrEqual(0);

    act(() => {
      tabs.remove();
    });
  });

  it("ignores old saved placement and keeps the collapsed launcher docked after maximize", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1440,
      writable: true,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 920,
      writable: true,
    });
    window.localStorage.setItem(
      "unemployed.profile-copilot-position-v7",
      JSON.stringify({
        x: 1168,
        y: 840,
        viewportHeight: 920,
        viewportWidth: 1440,
      }),
    );
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root?.render(
        <ProfileCopilotRail
          busy={false}
          context={{ surface: "profile", section: "basics" }}
          emptyStateDescription="Ask why a field matters."
          emptyStateTitle="No requests yet"
          messages={[]}
          onApplyPatchGroup={vi.fn()}
          onRejectPatchGroup={vi.fn()}
          onSendMessage={vi.fn()}
          onUndoRevision={vi.fn()}
          pendingContextKey={null}
          placeholder="Ask for an edit"
          revisions={[]}
          title="Profile Copilot"
        />,
      );
    });

    const rail = document.body.querySelector<HTMLButtonElement>(
      'button[aria-haspopup="dialog"]',
    )?.parentElement;
    expect(rail?.style.left).toBe("");
    expect(rail?.style.top).toBe("");
    expect(rail?.style.right).toBe("16px");
    expect(rail?.style.bottom).toBe("16px");
    expect(
      window.localStorage.getItem("unemployed.profile-copilot-position-v7"),
    ).toBeNull();

    act(() => {
      window.innerWidth = 1920;
      window.innerHeight = 1033;
      window.dispatchEvent(new Event("resize"));
    });

    expect(rail?.style.left).toBe("");
    expect(rail?.style.top).toBe("");
    expect(rail?.style.right).toBe("16px");
    expect(rail?.style.bottom).toBe("16px");

    act(() => {
      window.innerWidth = 1440;
      window.innerHeight = 920;
      window.dispatchEvent(new Event("resize"));
    });

    expect(rail?.style.left).toBe("");
    expect(rail?.style.top).toBe("");
    expect(rail?.style.right).toBe("16px");
    expect(rail?.style.bottom).toBe("16px");
  });

  it("lets Escape minimize an automatically opened pending conversation", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root?.render(
        <ProfileCopilotRail
          busy={false}
          context={{ surface: "setup", step: "targeting" }}
          emptyStateDescription="Ask why a field matters."
          emptyStateTitle="No requests yet"
          messages={[]}
          onApplyPatchGroup={vi.fn()}
          onRejectPatchGroup={vi.fn()}
          onSendMessage={vi.fn()}
          onUndoRevision={vi.fn()}
          pendingContextKey="setup:targeting"
          placeholder="Ask for an edit"
          revisions={[]}
          title="Profile Copilot"
        />,
      );
    });

    expect(document.body.querySelector('aside[role="dialog"]')).not.toBeNull();
    expect(document.activeElement?.tagName).toBe("TEXTAREA");

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(document.body.querySelector('aside[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(
      document.body.querySelector('button[aria-haspopup="dialog"]'),
    );
  });
});
