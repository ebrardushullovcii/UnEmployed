// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProfileSourceDebugReviewModal } from "./profile-source-debug-review-modal";

// jsdom reports offsetParent === null everywhere, which would make the trap's
// legacy first-control mode fall back to the container too. Stubbing layout
// pins this test to real behaviour: without initialFocus="dialog" the
// "Check again" button would receive the initial focus.
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

afterEach(() => {
  cleanup();
  restoreElementLayout();
});

describe("ProfileSourceDebugReviewModal", () => {
  it("associates the visible review description with the dialog", () => {
    render(
      <ProfileSourceDebugReviewModal
        details={null}
        errorMessage={null}
        isSourceDebugPending={false}
        isVerifyPending={() => false}
        loading={false}
        onClose={vi.fn()}
        onLoadRun={vi.fn()}
        onRerun={vi.fn()}
        onVerify={vi.fn()}
        open
        recentRuns={[]}
        selectedRunId={null}
        targetLabel="Greenhouse roles"
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Greenhouse roles" });
    const descriptionId = dialog.getAttribute("aria-describedby");

    expect(descriptionId).toBeTruthy();
    expect(document.getElementById(descriptionId ?? "")?.textContent).toContain(
      "Review what the latest source check found",
    );
  });

  it("opens with focus on the dialog so heading and description are announced first", () => {
    stubElementLayout();
    const onClose = vi.fn();

    const opener = document.createElement("button");
    opener.textContent = "Open source debug";
    document.body.append(opener);
    opener.focus();

    const view = render(
      <ProfileSourceDebugReviewModal
        details={null}
        errorMessage={null}
        isSourceDebugPending={false}
        isVerifyPending={() => false}
        loading={false}
        onClose={onClose}
        onLoadRun={vi.fn()}
        onRerun={vi.fn()}
        onVerify={vi.fn()}
        open
        recentRuns={[]}
        selectedRunId={null}
        targetLabel="Greenhouse roles"
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Greenhouse roles" });
    // The rerun action must not steal the initial announcement.
    expect(document.activeElement).toBe(dialog);
    expect(document.activeElement).not.toBe(
      screen.getByRole("button", { name: "Check again" }),
    );

    // Escape still closes the dialog through the same trap.
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();

    view.unmount();
    // Focus returns to the trigger after close.
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
