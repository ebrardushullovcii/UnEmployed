// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
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

  it("floats on the left without reserving page space and exposes a draggable open panel", () => {
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
    expect(bubble?.className).toContain("cursor-grab");
    expect(rail?.className).toContain("fixed");
    expect(rail?.style.left).toBe("16px");
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
    expect(rail?.style.left).toBe("16px");
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
