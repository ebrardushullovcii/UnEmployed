// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResumeWorkspaceStudioShell } from "./resume-workspace-studio-shell";

describe("ResumeWorkspaceStudioShell", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("takes a template-blocked user directly to the chooser and blocks premature export", () => {
    const onExportPdf = vi.fn();
    const onSetMobileStudioTab = vi.fn();
    const scrollIntoView = vi.fn();

    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });

    render(
      <ResumeWorkspaceStudioShell
        approvalStateLabel={null}
        assistantRail={<div>Assistant</div>}
        canApproveCurrentPdf={false}
        canClearApproval={false}
        editorPanel={<div>Editor</div>}
        exportBlockedReason={null}
        hasUnsavedChanges={false}
        historyPanel={<div>History</div>}
        isWorkspacePending={false}
        mobileStudioTab="preview"
        onApproveCurrentPdf={vi.fn()}
        onClearApproval={vi.fn()}
        onContinueToShortlisted={vi.fn()}
        onExportPdf={onExportPdf}
        onReviewBlockingIssues={vi.fn()}
        onRegenerateDraft={vi.fn()}
        onSaveDraft={vi.fn()}
        onSetMobileStudioTab={onSetMobileStudioTab}
        previewPane={<div>Preview</div>}
        selectedTemplateApprovalEligible={false}
        studioStatusMessage="Choose a template"
        templatePanel={<button type="button">Use this template</button>}
      />,
    );

    expect(
      document.querySelector("[data-resume-workspace-top-actions]"),
    ).toBeTruthy();

    const exportButtons = screen.getAllByRole("button", {
      name: "Export PDF",
    });
    expect(exportButtons).toHaveLength(2);
    expect(
      exportButtons.every((button) => button.hasAttribute("disabled")),
    ).toBe(true);

    fireEvent.click(
      screen.getByRole("button", { name: "Choose an apply-safe template" }),
    );

    expect(onSetMobileStudioTab).toHaveBeenCalledWith("editor");
    expect(onExportPdf).not.toHaveBeenCalled();
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start",
    });
    expect(
      document.activeElement?.hasAttribute("data-resume-template-chooser"),
    ).toBe(true);
  });

  it("blocks every export entry point and links directly to unsupported claims", () => {
    const onExportPdf = vi.fn();
    const onReviewBlockingIssues = vi.fn();

    render(
      <ResumeWorkspaceStudioShell
        approvalStateLabel={null}
        assistantRail={<div>Assistant</div>}
        canApproveCurrentPdf={false}
        canClearApproval={false}
        editorPanel={<div>Editor</div>}
        exportBlockedReason="2 generated or unsupported claims must be grounded before export."
        hasUnsavedChanges={false}
        historyPanel={<div>History</div>}
        isWorkspacePending={false}
        mobileStudioTab="preview"
        onApproveCurrentPdf={vi.fn()}
        onClearApproval={vi.fn()}
        onContinueToShortlisted={vi.fn()}
        onExportPdf={onExportPdf}
        onRegenerateDraft={vi.fn()}
        onReviewBlockingIssues={onReviewBlockingIssues}
        onSaveDraft={vi.fn()}
        onSetMobileStudioTab={vi.fn()}
        previewPane={<div>Preview</div>}
        selectedTemplateApprovalEligible
        studioStatusMessage="Review claims"
        templatePanel={<div>Templates</div>}
      />,
    );

    expect(screen.getByRole("alert").textContent).toContain(
      "2 generated or unsupported claims",
    );
    const exportButtons = screen.getAllByRole("button", { name: "Export PDF" });
    expect(exportButtons.length).toBeGreaterThanOrEqual(2);
    expect(
      exportButtons.every((button) => button.hasAttribute("disabled")),
    ).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Review blocked claims" }),
    );
    expect(onReviewBlockingIssues).toHaveBeenCalledOnce();
    expect(onExportPdf).not.toHaveBeenCalled();
  });
});
