// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetJobFinderOverlaysForTests } from "../features/job-finder/lib/job-finder-overlay-ownership";
import { ApplyCopilotVisualCheckpointDialog } from "./job-finder-page";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  resetJobFinderOverlaysForTests();
});

function renderConsentDialog() {
  const onClose = vi.fn();
  const onResolve = vi.fn();
  // Controller-held callbacks: only the page-level onClose/onResolve bridge
  // may ever reach them, so these double as contract-boundary tripwires.
  const requestOnCancel = vi.fn();
  const requestOnResolve = vi.fn();

  const appRoot = document.createElement("div");
  appRoot.id = "root";
  const trigger = document.createElement("button");
  trigger.textContent = "Prepare application";
  appRoot.append(trigger);
  document.body.append(appRoot);
  trigger.focus();

  const rendered = render(
    <ApplyCopilotVisualCheckpointDialog
      onClose={onClose}
      onResolve={onResolve}
      request={{
        jobId: "job_consent_dialog",
        onCancel: requestOnCancel,
        onResolve: requestOnResolve,
      }}
    />,
  );

  return {
    onClose,
    onResolve,
    rendered,
    requestOnCancel,
    requestOnResolve,
    trigger,
  };
}

describe("ApplyCopilotVisualCheckpointDialog consent hierarchy", () => {
  it("keeps Continue without visually primary and Enable checkpoints secondary", () => {
    renderConsentDialog();

    const dialog = screen.getByRole("dialog", {
      name: "Use visual checkpoints?",
    });
    expect(dialog.textContent).toContain("Optional visual checkpoints");
    expect(dialog.textContent).toContain(
      "Job Finder cannot submit the application.",
    );

    const continueWithout = screen.getByRole("button", {
      name: "Continue without",
    });
    const enable = screen.getByRole("button", { name: "Enable checkpoints" });

    // The privacy-preserving action carries the filled primary treatment;
    // sharing sensitive screenshots stays an explicit secondary opt-in.
    expect(continueWithout.getAttribute("data-variant")).toBe("primary");
    expect(enable.getAttribute("data-variant")).toBe("secondary");

    // Safe action owns the first position in the action row's tab order.
    expect(
      continueWithout.compareDocumentPosition(enable) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
  });

  it("opens with initial focus on Continue without, so Enter cannot enable sharing", () => {
    const { onResolve } = renderConsentDialog();

    const continueWithout = screen.getByRole("button", {
      name: "Continue without",
    });
    expect(document.activeElement).toBe(continueWithout);

    // A stray Enter on the initially focused control must not enable
    // checkpoints; only an explicit activation of Enable checkpoints may.
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Enter" });
    expect(onResolve).not.toHaveBeenCalled();

    fireEvent.click(continueWithout);
    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(onResolve).toHaveBeenCalledWith(false);
  });

  it("cancels on Escape without resolving and restores focus when closed", () => {
    const {
      onClose,
      onResolve,
      rendered,
      requestOnCancel,
      requestOnResolve,
      trigger,
    } = renderConsentDialog();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onResolve).not.toHaveBeenCalled();
    // Dismissal routes exclusively through the page-level onClose contract.
    expect(requestOnCancel).not.toHaveBeenCalled();
    expect(requestOnResolve).not.toHaveBeenCalled();

    rendered.rerender(
      <ApplyCopilotVisualCheckpointDialog
        onClose={onClose}
        onResolve={onResolve}
        request={null}
      />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("cancels on the header close button and scrim without resolving", () => {
    const { onClose, onResolve, rendered, requestOnCancel } =
      renderConsentDialog();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onResolve).not.toHaveBeenCalled();
    expect(requestOnCancel).not.toHaveBeenCalled();

    rendered.rerender(
      <ApplyCopilotVisualCheckpointDialog
        onClose={onClose}
        onResolve={onResolve}
        request={null}
      />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();

    rendered.rerender(
      <ApplyCopilotVisualCheckpointDialog
        onClose={onClose}
        onResolve={onResolve}
        request={{
          jobId: "job_consent_dialog",
          onCancel: requestOnCancel,
          onResolve: vi.fn(),
        }}
      />,
    );
    expect(screen.getByRole("dialog", { name: "Use visual checkpoints?" }))
      .toBeTruthy();

    const scrim = screen.getByRole("dialog").parentElement;
    if (!scrim) throw new Error("scrim container missing");
    fireEvent.click(scrim);

    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onResolve).not.toHaveBeenCalled();
  });

  it("resolves true only through the explicit Enable checkpoints activation", () => {
    const { onClose, onResolve } = renderConsentDialog();

    fireEvent.click(screen.getByRole("button", { name: "Enable checkpoints" }));

    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(onResolve).toHaveBeenCalledWith(true);
    expect(onClose).not.toHaveBeenCalled();
  });
});
