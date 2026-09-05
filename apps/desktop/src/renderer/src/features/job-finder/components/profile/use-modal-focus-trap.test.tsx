// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useEffect, useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  acquireJobFinderOverlay,
  hasOpenJobFinderOverlays,
  resetJobFinderOverlaysForTests,
} from "../../lib/job-finder-overlay-ownership";
import { useModalFocusTrap } from "./use-modal-focus-trap";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  resetJobFinderOverlaysForTests();
});

function TrapDialog(props: { label: string; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useModalFocusTrap(true, dialogRef, props.onClose);
  return (
    <div ref={dialogRef} role="dialog" aria-label={props.label} tabIndex={-1}>
      <button type="button">{`${props.label} primary`}</button>
      <button type="button">{`${props.label} secondary`}</button>
    </div>
  );
}

function AnnouncedDialog(props: { label: string; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useModalFocusTrap(true, dialogRef, props.onClose, {
    initialFocus: "dialog",
  });
  return (
    <div
      aria-describedby="announced-dialog-description"
      aria-label={props.label}
      aria-modal="true"
      ref={dialogRef}
      role="dialog"
      tabIndex={-1}
    >
      <p id="announced-dialog-description">{props.label} description</p>
      <button type="button">{`${props.label} primary`}</button>
      <button type="button">{`${props.label} secondary`}</button>
    </div>
  );
}

// jsdom reports offsetParent === null for every element, which makes the trap
// fall back to the container. Stubbing real layout lets these tests pin the
// difference between the first-control and dialog focus modes.
function stubElementLayout() {
  Object.defineProperty(HTMLElement.prototype, "offsetParent", {
    configurable: true,
    get() {
      return document.body;
    },
  });
}

function restoreElementLayout() {
  delete (HTMLElement.prototype as unknown as { offsetParent?: unknown })
    .offsetParent;
}

function TwoStackedTraps(props: {
  onCloseA: () => void;
  onCloseB: () => void;
}) {
  const [secondOpen, setSecondOpen] = useState(false);
  useEffect(() => {
    setSecondOpen(true);
  }, []);
  return (
    <div>
      <TrapDialog label="Bottom modal" onClose={props.onCloseA} />
      {secondOpen ? (
        <TrapDialog
          label="Top modal"
          onClose={() => {
            setSecondOpen(false);
            props.onCloseB();
          }}
        />
      ) : null}
    </div>
  );
}

describe("useModalFocusTrap overlay ownership", () => {
  it("keeps single-layer behavior: focus, inert root, Escape close, focus restore", () => {
    const onClose = vi.fn();
    const appRoot = document.createElement("div");
    appRoot.id = "root";
    const opener = document.createElement("button");
    opener.textContent = "Opener";
    // Outside the container: RTL clears the provided container on unmount.
    document.body.append(opener);
    document.body.append(appRoot);
    opener.focus();

    const view = render(<TrapDialog label="Solo modal" onClose={onClose} />, {
      container: appRoot,
    });

    expect(hasOpenJobFinderOverlays()).toBe(true);
    expect(appRoot.getAttribute("inert")).toBe("");
    // The dialog lives inside the aria-hidden root, so role queries cannot
    // see it; assert against the DOM instead.
    const dialog = appRoot.querySelector<HTMLElement>('[role="dialog"]');
    expect(document.activeElement).toBe(dialog);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();

    view.unmount();
    expect(appRoot.hasAttribute("inert")).toBe(false);
    expect(document.activeElement).toBe(opener);
    expect(hasOpenJobFinderOverlays()).toBe(false);
  });

  it("closes stacked modals one per Escape, newest first", () => {
    const onCloseBottom = vi.fn();
    const onCloseTop = vi.fn();
    render(<TwoStackedTraps onCloseA={onCloseBottom} onCloseB={onCloseTop} />);

    // The later-mounted modal owns the first Escape.
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCloseTop).toHaveBeenCalledOnce();
    expect(onCloseBottom).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Bottom modal" })).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCloseBottom).toHaveBeenCalledOnce();
  });

  it("ignores Escape that another surface already consumed", () => {
    const onClose = vi.fn();
    render(<TrapDialog label="Guarded modal" onClose={onClose} />);

    const blocked = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Escape",
    });
    blocked.preventDefault();
    document.dispatchEvent(blocked);

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Guarded modal" })).toBeTruthy();
  });

  it("defers to an overlay opened above it before reclaiming Escape", () => {
    const onClose = vi.fn();
    const view = render(<TrapDialog label="Lower modal" onClose={onClose} />);

    const higherLayer = acquireJobFinderOverlay(vi.fn());
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Lower modal" })).toBeTruthy();

    higherLayer.release();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
    expect(view).toBeTruthy();
  });

  it("keeps inert/sentinels/focus stable when onClose identity changes and calls latest handler", () => {
    const onCloseFirst = vi.fn();
    const onCloseSecond = vi.fn();
    const appRoot = document.createElement("div");
    appRoot.id = "root";
    const opener = document.createElement("button");
    opener.textContent = "Opener";
    document.body.append(opener);
    document.body.append(appRoot);
    opener.focus();

    const { rerender, unmount } = render(
      <TrapDialog label="Stable modal" onClose={onCloseFirst} />,
      {
        container: appRoot,
      },
    );

    const dialog = appRoot.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog).toBeTruthy();
    if (!dialog) throw new Error("dialog missing");
    expect(hasOpenJobFinderOverlays()).toBe(true);
    expect(appRoot.getAttribute("inert")).toBe("");
    expect(document.activeElement).toBe(dialog);
    const sentinelStartBefore = dialog.querySelector(
      '[data-focus-sentinel="start"]',
    );
    const sentinelEndBefore = dialog.querySelector(
      '[data-focus-sentinel="end"]',
    );
    expect(sentinelStartBefore).toBeTruthy();
    expect(sentinelEndBefore).toBeTruthy();
    expect(dialog.querySelectorAll("[data-focus-sentinel]").length).toBe(2);

    rerender(<TrapDialog label="Stable modal" onClose={onCloseSecond} />);

    const dialogAfter = appRoot.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialogAfter).toBe(dialog);
    expect(appRoot.getAttribute("inert")).toBe("");
    expect(document.activeElement).toBe(dialog);
    expect(dialog.querySelector('[data-focus-sentinel="start"]')).toBe(
      sentinelStartBefore,
    );
    expect(dialog.querySelector('[data-focus-sentinel="end"]')).toBe(
      sentinelEndBefore,
    );
    expect(dialog.querySelectorAll("[data-focus-sentinel]").length).toBe(2);
    expect(hasOpenJobFinderOverlays()).toBe(true);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCloseFirst).not.toHaveBeenCalled();
    expect(onCloseSecond).toHaveBeenCalledOnce();

    unmount();
    expect(appRoot.hasAttribute("inert")).toBe(false);
    expect(document.activeElement).toBe(opener);
    expect(hasOpenJobFinderOverlays()).toBe(false);
  });

  it("keeps legacy first-control initial focus when layout is real", () => {
    stubElementLayout();
    try {
      const onClose = vi.fn();
      render(<TrapDialog label="Legacy modal" onClose={onClose} />);

      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Legacy modal primary" }),
      );
    } finally {
      restoreElementLayout();
    }
  });

  it("supports initialFocus on the labelled dialog container and routes Tab from it", () => {
    stubElementLayout();
    try {
      const onClose = vi.fn();
      render(<AnnouncedDialog label="Announced modal" onClose={onClose} />);

      // Focus sits on the container itself, so screen readers announce the
      // dialog name/description instead of the first action button.
      const dialog = screen.getByRole("dialog", { name: "Announced modal" });
      expect(dialog.getAttribute("aria-describedby")).toBe(
        "announced-dialog-description",
      );
      expect(document.activeElement).toBe(dialog);

      // Forward Tab from the container reaches the first control, never the
      // hidden start sentinel; Shift+Tab from the container reaches the last.
      fireEvent.keyDown(document, { key: "Tab" });
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Announced modal primary" }),
      );

      dialog.focus();
      fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Announced modal secondary" }),
      );
    } finally {
      restoreElementLayout();
    }
  });
});
