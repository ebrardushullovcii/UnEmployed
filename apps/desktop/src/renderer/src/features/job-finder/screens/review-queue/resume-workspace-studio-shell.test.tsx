// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LockedScreenLayout } from "../../components/locked-screen-layout";
import { ResumeWorkspaceStudioShell } from "./resume-workspace-studio-shell";

describe("ResumeWorkspaceStudioShell", () => {
  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(window, "matchMedia");
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
        approvalBlockedReason={null}
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

  it("uses instant navigation for the template chooser when reduced motion is requested", () => {
    const scrollIntoView = vi.fn();

    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({ matches: true })),
    });
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
        approvalBlockedReason={null}
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
        onExportPdf={vi.fn()}
        onReviewBlockingIssues={vi.fn()}
        onRegenerateDraft={vi.fn()}
        onSaveDraft={vi.fn()}
        onSetMobileStudioTab={vi.fn()}
        previewPane={<div>Preview</div>}
        selectedTemplateApprovalEligible={false}
        studioStatusMessage="Choose a template"
        templatePanel={<button type="button">Use this template</button>}
      />,
    );

    fireEvent.click(
      screen.getAllByRole("button", {
        name: "Choose an apply-safe template",
      })[0]!,
    );

    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "auto",
      block: "start",
    });
  });

  it("blocks every export entry point and links directly to unsupported claims", () => {
    const onExportPdf = vi.fn();
    const onReviewBlockingIssues = vi.fn();

    render(
      <ResumeWorkspaceStudioShell
        approvalBlockedReason={null}
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

  it("retains every lifecycle action while dropping decorative status chips", () => {
    render(
      <ResumeWorkspaceStudioShell
        approvalBlockedReason={null}
        approvalStateLabel={null}
        assistantRail={<div>Assistant</div>}
        canApproveCurrentPdf
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
        onExportPdf={vi.fn()}
        onRegenerateDraft={vi.fn()}
        onReviewBlockingIssues={vi.fn()}
        onSaveDraft={vi.fn()}
        onSetMobileStudioTab={vi.fn()}
        previewPane={<div>Preview</div>}
        selectedTemplateApprovalEligible
        studioStatusMessage="Ready to approve."
        templatePanel={<div>Templates</div>}
      />,
    );

    expect(screen.getAllByRole("button", { name: "Save draft" })).toHaveLength(
      2,
    );
    expect(
      screen.getAllByRole("button", { name: "Refresh draft" }),
    ).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Export PDF" })).toHaveLength(
      2,
    );

    const enabledExportButtons = screen
      .getAllByRole("button", { name: "Export PDF" })
      .filter((button) => !button.hasAttribute("disabled"));
    expect(enabledExportButtons).toHaveLength(2);

    expect(
      screen
        .getAllByRole("button", { name: "Save draft" })
        .every((button) => button.getAttribute("data-variant") === "secondary"),
    ).toBe(true);
    expect(
      screen.queryByRole("button", { name: "Approve current PDF" }),
    ).toBeNull();

    const primaryButtons = Array.from(
      document.querySelectorAll<HTMLButtonElement>('[data-variant="primary"]'),
    ).filter((button) => !button.hasAttribute("disabled"));
    expect(primaryButtons).toHaveLength(1);
    expect(primaryButtons[0]!.textContent).toContain("Approve this PDF");

    expect(screen.queryByText("Preview-led review")).toBeNull();
    expect(screen.queryByText("Approval eligible")).toBeNull();
    expect(screen.queryByText("Approval blocked")).toBeNull();
    expect(screen.queryByText("Saved draft")).toBeNull();
    expect(screen.getByText(/Review → export → approve/)).toBeTruthy();
  });

  it("moves clear approval behind its explanation and keeps approval out of the toolbars", () => {
    const onClearApproval = vi.fn();
    render(
      <ResumeWorkspaceStudioShell
        approvalBlockedReason={null}
        approvalStateLabel="Approved"
        assistantRail={<div>Assistant</div>}
        canApproveCurrentPdf={false}
        canClearApproval
        editorPanel={<div>Editor</div>}
        exportBlockedReason={null}
        hasUnsavedChanges={false}
        historyPanel={<div>History</div>}
        isWorkspacePending={false}
        mobileStudioTab="preview"
        onApproveCurrentPdf={vi.fn()}
        onClearApproval={onClearApproval}
        onContinueToShortlisted={vi.fn()}
        onExportPdf={vi.fn()}
        onRegenerateDraft={vi.fn()}
        onReviewBlockingIssues={vi.fn()}
        onSaveDraft={vi.fn()}
        onSetMobileStudioTab={vi.fn()}
        previewPane={<div>Preview</div>}
        selectedTemplateApprovalEligible
        studioStatusMessage="A PDF from this saved draft is already approved."
        templatePanel={<div>Templates</div>}
      />,
    );

    const clearButtons = screen.getAllByRole("button", {
      name: "Clear approval",
    });
    expect(clearButtons).toHaveLength(2);
    for (const button of clearButtons) {
      expect(button.getAttribute("data-variant")).toBe("ghost");
      const statusRow = button.closest('[role="status"]');
      expect(statusRow?.textContent).toContain(
        "A PDF from this saved draft is already approved.",
      );
    }

    fireEvent.click(clearButtons[0]!);
    expect(onClearApproval).toHaveBeenCalledOnce();
  });

  it("lists named validation issues before export and deep-links into the matching field", () => {
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
        approvalBlockedReason={null}
        approvalStateLabel={null}
        assistantRail={<div>Assistant</div>}
        canApproveCurrentPdf={false}
        canClearApproval={false}
        editorPanel={
          <textarea
            data-resume-editor-target="entry:section_experience:entry_1:summary"
            aria-label="Entry summary target"
            readOnly
          />
        }
        exportBlockedReason={null}
        hasUnsavedChanges={false}
        historyPanel={<div>History</div>}
        isWorkspacePending={false}
        mobileStudioTab="preview"
        onApproveCurrentPdf={vi.fn()}
        onClearApproval={vi.fn()}
        onContinueToShortlisted={vi.fn()}
        onExportPdf={vi.fn()}
        onRegenerateDraft={vi.fn()}
        onReviewBlockingIssues={vi.fn()}
        onSaveDraft={vi.fn()}
        onSetMobileStudioTab={onSetMobileStudioTab}
        previewPane={<div>Preview</div>}
        selectedTemplateApprovalEligible
        studioStatusMessage="Ready."
        templatePanel={<div>Templates</div>}
        validationIssues={[
          {
            id: "issue_warning_1",
            severity: "warning",
            category: "thin_output",
            sectionId: "section_summary",
            entryId: null,
            bulletId: null,
            message: "The summary reads thin for this seniority.",
          },
          {
            id: "issue_error_1",
            severity: "error",
            category: "invented_metric",
            sectionId: "section_experience",
            entryId: "entry_1",
            bulletId: null,
            message: "Bullet cites a metric that is not in your evidence.",
          },
        ]}
      />,
    );

    const issueRegion = document.querySelector(
      "[data-resume-validation-issues]",
    );
    expect(issueRegion?.textContent).toContain("Validation issues");
    expect(issueRegion?.textContent).toContain("1 approval blocker");
    expect(issueRegion?.textContent).toContain(
      "Bullet cites a metric that is not in your evidence.",
    );
    const issueRows = document.querySelectorAll(
      "[data-resume-validation-issue]",
    );
    expect(issueRows[0]?.getAttribute("data-resume-validation-issue")).toBe(
      "issue_error_1",
    );

    fireEvent.click(
      screen.getAllByRole("button", { name: "Fix in editor" })[0]!,
    );

    expect(onSetMobileStudioTab).toHaveBeenCalledWith("editor");
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start",
    });
    expect(
      document.activeElement?.getAttribute("data-resume-editor-target"),
    ).toBe("entry:section_experience:entry_1:summary");
  });

  it("replaces approval/export with recovery that focuses the first blocker", () => {
    const onExportPdf = vi.fn();
    const onApproveCurrentPdf = vi.fn();
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
        approvalBlockedReason={null}
        approvalStateLabel={null}
        assistantRail={<div>Assistant</div>}
        canApproveCurrentPdf
        canClearApproval={false}
        editorPanel={<div>Editor</div>}
        exportBlockedReason={null}
        hasUnsavedChanges={false}
        historyPanel={<div>History</div>}
        isWorkspacePending={false}
        mobileStudioTab="preview"
        onApproveCurrentPdf={onApproveCurrentPdf}
        onClearApproval={vi.fn()}
        onContinueToShortlisted={vi.fn()}
        onExportPdf={onExportPdf}
        onRegenerateDraft={vi.fn()}
        onReviewBlockingIssues={vi.fn()}
        onSaveDraft={vi.fn()}
        onSetMobileStudioTab={vi.fn()}
        previewPane={<div>Preview</div>}
        selectedTemplateApprovalEligible
        studioStatusMessage="Ready."
        templatePanel={<div>Templates</div>}
        validationIssues={[
          {
            id: "issue_error_2",
            severity: "error",
            category: "unsupported_claim",
            sectionId: "section_summary",
            entryId: null,
            bulletId: null,
            message: "Claim has no candidate evidence.",
          },
        ]}
      />,
    );

    expect(
      screen.getByText("Fix the first validation error before approval."),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Approve this PDF" }),
    ).toBeNull();
    const recovery = screen.getByRole("button", {
      name: "Fix approval blocker",
    });
    expect(recovery.getAttribute("data-variant")).toBe("primary");

    fireEvent.click(recovery);
    expect(
      document.activeElement?.getAttribute("data-resume-validation-issue"),
    ).toBe("issue_error_2");
    expect(onApproveCurrentPdf).not.toHaveBeenCalled();
    expect(onExportPdf).not.toHaveBeenCalled();
  });

  it("keeps a warning-only exported PDF approvable", () => {
    render(
      <ResumeWorkspaceStudioShell
        approvalBlockedReason={null}
        approvalStateLabel={null}
        assistantRail={<div>Assistant</div>}
        canApproveCurrentPdf
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
        onExportPdf={vi.fn()}
        onRegenerateDraft={vi.fn()}
        onReviewBlockingIssues={vi.fn()}
        onSaveDraft={vi.fn()}
        onSetMobileStudioTab={vi.fn()}
        previewPane={<div>Preview</div>}
        selectedTemplateApprovalEligible
        studioStatusMessage="Ready."
        templatePanel={<div>Templates</div>}
        validationIssues={[
          {
            id: "issue_warning_only",
            severity: "warning",
            category: "thin_output",
            sectionId: null,
            entryId: null,
            bulletId: null,
            message: "Review the short summary.",
          },
        ]}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Approve this PDF" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Fix approval blocker" }),
    ).toBeNull();
  });

  it("blocks approval with a separate decisions reason and focuses the work-history list", () => {
    const onExportPdf = vi.fn();
    const onApproveCurrentPdf = vi.fn();
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
        approvalBlockedReason="1 hidden work-history role is waiting on an explicit kept-omitted decision. Approval stays disabled until every entry below has one."
        approvalStateLabel="Approval needs decisions"
        assistantRail={<div>Assistant</div>}
        canApproveCurrentPdf={false}
        canClearApproval={false}
        editorPanel={
          <section data-resume-work-history-decisions tabIndex={-1}>
            Work-history decisions
          </section>
        }
        exportBlockedReason={null}
        hasUnsavedChanges={false}
        historyPanel={<div>History</div>}
        isWorkspacePending={false}
        mobileStudioTab="preview"
        onApproveCurrentPdf={onApproveCurrentPdf}
        onClearApproval={vi.fn()}
        onContinueToShortlisted={vi.fn()}
        onExportPdf={onExportPdf}
        onRegenerateDraft={vi.fn()}
        onReviewBlockingIssues={vi.fn()}
        onSaveDraft={vi.fn()}
        onSetMobileStudioTab={vi.fn()}
        previewPane={<div>Preview</div>}
        selectedTemplateApprovalEligible
        studioStatusMessage="Decide first"
        templatePanel={<div>Templates</div>}
      />,
    );

    expect(screen.getAllByRole("alert").length).toBe(1);
    expect(
      screen
        .getAllByRole("alert")[0]!
        .textContent.includes("kept-omitted decision"),
    ).toBe(true);
    expect(
      screen.queryByRole("button", { name: "Approve this PDF" }),
    ).toBeNull();
    expect(
      screen
        .getAllByRole("button", { name: "Review work-history decisions" })
        .every((button) => !button.hasAttribute("disabled")),
    ).toBe(true);

    fireEvent.click(
      screen.getAllByRole("button", {
        name: "Review work-history decisions",
      })[0]!,
    );

    expect(scrollIntoView).toHaveBeenCalled();
    expect(
      document.activeElement?.hasAttribute(
        "data-resume-work-history-decisions",
      ),
    ).toBe(true);
    expect(onApproveCurrentPdf).not.toHaveBeenCalled();
    expect(onExportPdf).not.toHaveBeenCalled();
  });
});

describe("ResumeWorkspaceStudioShell locked-pane ownership", () => {
  class ResizeObserverMock {
    observe() {}
    disconnect() {}
    unobserve() {}
  }

  function buildStudioShellProps() {
    return {
      approvalBlockedReason: null,
      approvalStateLabel: null,
      assistantRail: <div>Assistant</div>,
      canApproveCurrentPdf: false,
      canClearApproval: false,
      editorPanel: <div>Editor</div>,
      exportBlockedReason: null,
      hasUnsavedChanges: false,
      historyPanel: <div>History</div>,
      isWorkspacePending: false,
      mobileStudioTab: "preview" as const,
      onApproveCurrentPdf: vi.fn(),
      onClearApproval: vi.fn(),
      onContinueToShortlisted: vi.fn(),
      onExportPdf: vi.fn(),
      onRegenerateDraft: vi.fn(),
      onReviewBlockingIssues: vi.fn(),
      onSaveDraft: vi.fn(),
      onSetMobileStudioTab: vi.fn(),
      previewPane: <div>Preview</div>,
      selectedTemplateApprovalEligible: true,
      studioStatusMessage: "Ready.",
      templatePanel: (
        <button data-testid="rail-action" type="button">
          Use this template
        </button>
      ),
    };
  }

  function stubCollapsedHeaderMetrics() {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      bottom: 200,
      height: 200,
      left: 0,
      right: 100,
      top: 0,
      width: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
  }

  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    vi.stubGlobal("innerWidth", 1440);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("marks the desktop studio rail as the only owned scroll pane", () => {
    const { container } = render(
      <ResumeWorkspaceStudioShell {...buildStudioShellProps()} />,
    );

    const rail = container.querySelector<HTMLElement>(
      "[data-resume-workspace-scroll-region]",
    );

    expect(rail?.hasAttribute("data-locked-pane-scroll-region")).toBe(true);
    expect(rail?.getAttribute("role")).toBe("region");
    expect(rail?.getAttribute("aria-label")).toBe("Resume studio tools");
    expect(rail?.getAttribute("tabindex")).toBe("0");
    expect(
      container.querySelectorAll("[data-locked-pane-scroll-region]"),
    ).toHaveLength(1);
    expect(
      rail?.querySelectorAll("[data-locked-pane-scroll-region]"),
    ).toHaveLength(0);
  });

  it("consumes wheel input with the rail once the header has collapsed", () => {
    stubCollapsedHeaderMetrics();

    const { container } = render(
      <LockedScreenLayout topContent={<div>Workspace context</div>}>
        <ResumeWorkspaceStudioShell {...buildStudioShellProps()} />
      </LockedScreenLayout>,
    );
    const outerScroller = container.querySelector<HTMLElement>(
      ".screen-scroll-area",
    );
    const rail = container.querySelector<HTMLElement>(
      "[data-resume-workspace-scroll-region]",
    );
    if (!(rail instanceof HTMLElement)) {
      throw new Error("Expected the desktop studio rail to render.");
    }
    Object.defineProperties(rail, {
      clientHeight: { configurable: true, value: 300 },
      scrollHeight: { configurable: true, value: 900 },
    });
    if (outerScroller) {
      outerScroller.scrollTop = 200;
    }
    rail.scrollTop = 250;

    const wheelEvent = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaMode: WheelEvent.DOM_DELTA_PIXEL,
      deltaY: 100,
    });
    rail
      .querySelector<HTMLElement>("[data-resume-template-chooser]")
      ?.dispatchEvent(wheelEvent);

    expect(wheelEvent.defaultPrevented).toBe(true);
    expect(rail.scrollTop).toBe(350);
    expect(outerScroller?.scrollTop).toBe(200);
  });

  it("chains wheel residual outward when the rail hits its bottom boundary", () => {
    stubCollapsedHeaderMetrics();

    const { container } = render(
      <LockedScreenLayout topContent={<div>Workspace context</div>}>
        <ResumeWorkspaceStudioShell {...buildStudioShellProps()} />
      </LockedScreenLayout>,
    );
    const outerScroller = container.querySelector<HTMLElement>(
      ".screen-scroll-area",
    );
    const rail = container.querySelector<HTMLElement>(
      "[data-resume-workspace-scroll-region]",
    );
    if (!(rail instanceof HTMLElement)) {
      throw new Error("Expected the desktop studio rail to render.");
    }
    Object.defineProperties(outerScroller as HTMLElement, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 1_000 },
    });
    Object.defineProperties(rail, {
      clientHeight: { configurable: true, value: 300 },
      scrollHeight: { configurable: true, value: 900 },
    });
    if (outerScroller) {
      outerScroller.scrollTop = 200;
    }
    rail.scrollTop = 550;

    const wheelEvent = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaMode: WheelEvent.DOM_DELTA_PIXEL,
      deltaY: 120,
    });
    rail
      .querySelector<HTMLElement>("[data-resume-template-chooser]")
      ?.dispatchEvent(wheelEvent);

    expect(wheelEvent.defaultPrevented).toBe(true);
    expect(rail.scrollTop).toBe(600);
    expect(outerScroller?.scrollTop).toBe(270);
  });

  it("keeps keyboard scrolling with the focused rail and Space with buttons", () => {
    stubCollapsedHeaderMetrics();

    const { container } = render(
      <LockedScreenLayout topContent={<div>Workspace context</div>}>
        <ResumeWorkspaceStudioShell {...buildStudioShellProps()} />
      </LockedScreenLayout>,
    );
    const outerScroller = container.querySelector<HTMLElement>(
      ".screen-scroll-area",
    );
    const rail = container.querySelector<HTMLElement>(
      "[data-resume-workspace-scroll-region]",
    );
    if (!(rail instanceof HTMLElement)) {
      throw new Error("Expected the desktop studio rail to render.");
    }
    Object.defineProperties(rail, {
      clientHeight: { configurable: true, value: 300 },
      scrollHeight: { configurable: true, value: 900 },
    });
    if (outerScroller) {
      outerScroller.scrollTop = 200;
    }
    rail.focus();

    const pageDown = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "PageDown",
    });
    rail.dispatchEvent(pageDown);
    expect(pageDown.defaultPrevented).toBe(true);
    expect(rail.scrollTop).toBe(300);

    const arrowUp = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "ArrowUp",
    });
    rail.scrollTop = 600;
    rail.dispatchEvent(arrowUp);
    expect(arrowUp.defaultPrevented).toBe(true);
    expect(rail.scrollTop).toBe(560);

    const action = rail.querySelector<HTMLElement>(
      '[data-testid="rail-action"]',
    );
    if (!(action instanceof HTMLElement)) {
      throw new Error("Expected the rail template action button to render.");
    }
    expect(fireEvent.keyDown(action, { key: " " })).toBe(true);
    fireEvent.click(action);
    expect(screen.getByText("Use this template")).toBeTruthy();
  });
});

describe("ResumeWorkspaceStudioShell focus ring contrast", () => {
  it("uses full-strength ring for all keyboard focus targets (diluted primary <3:1)", () => {
    // Audit: ring-primary/60 at 60% composites to 2.42:1 dark / 2.42:1 light worst-case,
    // well below WCAG 2.4.11 3:1. Full --ring is proven >=3:1 in both themes.
    const { container } = render(
      <ResumeWorkspaceStudioShell
        approvalBlockedReason={null}
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
        onExportPdf={vi.fn()}
        onRegenerateDraft={vi.fn()}
        onReviewBlockingIssues={vi.fn()}
        onSaveDraft={vi.fn()}
        onSetMobileStudioTab={vi.fn()}
        previewPane={<div>Preview</div>}
        selectedTemplateApprovalEligible
        studioStatusMessage="Ready."
        templatePanel={<div>Templates</div>}
      />,
    );

    const summaries = container.querySelectorAll("summary");
    expect(summaries.length).toBeGreaterThanOrEqual(1);
    const historySummaries = Array.from(summaries).filter((el) =>
      el.textContent?.includes("Version history"),
    );
    expect(historySummaries.length).toBeGreaterThanOrEqual(1);
    for (const historySummary of historySummaries) {
      expect(historySummary.className).toContain("focus-visible:ring-2");
      expect(historySummary.className).toContain("focus-visible:ring-ring");
      expect(historySummary.className).not.toMatch(/ring-primary\/\d/);
    }

    const templateChoosers = container.querySelectorAll(
      "[data-resume-template-chooser]",
    );
    // preview tab hides the mobile chooser; at least the desktop chooser must be present
    expect(templateChoosers.length).toBeGreaterThanOrEqual(1);
    for (const chooser of Array.from(templateChoosers)) {
      expect((chooser as HTMLElement).className).toContain(
        "focus-visible:ring-2",
      );
      expect((chooser as HTMLElement).className).toContain(
        "focus-visible:ring-ring",
      );
      expect((chooser as HTMLElement).className).not.toMatch(
        /ring-primary\/\d/,
      );
    }

    // Non-focus decoration stays diluted by design — capture before unmount.
    const previewHtml = container.innerHTML;
    expect(previewHtml).toContain("border-primary/25");
    expect(previewHtml).toContain("bg-primary/5");

    // Also verify the editor tab exposes the mobile chooser with the same token.
    cleanup();
    const { container: editorContainer } = render(
      <ResumeWorkspaceStudioShell
        approvalBlockedReason={null}
        approvalStateLabel={null}
        assistantRail={<div>Assistant</div>}
        canApproveCurrentPdf={false}
        canClearApproval={false}
        editorPanel={<div>Editor</div>}
        exportBlockedReason={null}
        hasUnsavedChanges={false}
        historyPanel={<div>History</div>}
        isWorkspacePending={false}
        mobileStudioTab="editor"
        onApproveCurrentPdf={vi.fn()}
        onClearApproval={vi.fn()}
        onContinueToShortlisted={vi.fn()}
        onExportPdf={vi.fn()}
        onRegenerateDraft={vi.fn()}
        onReviewBlockingIssues={vi.fn()}
        onSaveDraft={vi.fn()}
        onSetMobileStudioTab={vi.fn()}
        previewPane={<div>Preview</div>}
        selectedTemplateApprovalEligible
        studioStatusMessage="Ready."
        templatePanel={<div>Templates</div>}
      />,
    );
    const editorChoosers = editorContainer.querySelectorAll(
      "[data-resume-template-chooser]",
    );
    expect(editorChoosers.length).toBe(2);
    for (const chooser of Array.from(editorChoosers)) {
      expect((chooser as HTMLElement).className).toContain(
        "focus-visible:ring-ring",
      );
    }
  });
});
