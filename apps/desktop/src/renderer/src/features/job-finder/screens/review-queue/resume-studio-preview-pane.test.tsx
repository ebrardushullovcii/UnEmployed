// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JobFinderResumePreview } from "@unemployed/contracts";
import { LockedScreenLayout } from "../../components/locked-screen-layout";
import { ResumeStudioPreviewPane } from "./resume-studio-preview-pane";

const preview: JobFinderResumePreview = {
  draftId: "draft_1",
  revisionKey: "resume_preview_draft_1_abc123",
  html: '<!doctype html><html><body><article data-resume-section-id="section_summary">Preview body</article></body></html>',
  warnings: [
    {
      id: "preview_warning_1",
      source: "validation",
      severity: "warning",
      category: "poor_keyword_coverage",
      sectionId: "section_summary",
      entryId: null,
      bulletId: null,
      message: "Add one more role-specific keyword to the summary.",
    },
  ],
  metadata: {
    templateId: "classic_ats",
    renderedAt: "2026-04-27T00:00:00.000Z",
    pageCount: null,
    sectionCount: 2,
    entryCount: 1,
  },
};

describe("ResumeStudioPreviewPane", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("surfaces compact preview warnings and unsaved live-preview status", () => {
    const rendered = render(
      <ResumeStudioPreviewPane
        isDirty
        isPending={false}
        onRetry={vi.fn()}
        onSelectTarget={vi.fn()}
        preview={preview}
        previewError={null}
        previewStatus="ready"
        selectedEntryId={null}
        selectedSectionId="section_summary"
        selectedTargetId={null}
        templateLabel="Chronology Classic"
      />,
    );

    expect(screen.getByText("Unsaved edits rendered")).toBeTruthy();
    expect(screen.getByText(/1 warning/i)).toBeTruthy();
    expect(
      screen.queryByText(/Add one more role-specific keyword to the summary/i),
    ).toBeNull();
    expect(screen.getByText("Chronology Classic")).toBeTruthy();
    expect(screen.getByTitle("Live resume preview")).toBeTruthy();
    const previewContent = rendered.container.querySelector(
      "[data-resume-preview-scroll-region] > div",
    );
    expect(previewContent?.classList.contains("min-h-full")).toBe(true);
    expect(previewContent?.classList.contains("pb-4")).toBe(true);
    const iframe = screen.getByTitle("Live resume preview");
    if (!(iframe instanceof HTMLIFrameElement)) {
      throw new Error("Expected the live preview element to be an iframe.");
    }
    expect(iframe.contentDocument?.documentElement.style.overflow).toBe(
      "hidden",
    );
    expect(iframe.contentDocument?.body.style.overflow).toBe("hidden");
    expect(
      iframe.contentDocument?.body.style.getPropertyValue("--preview-scale"),
    ).not.toBe("");
  });

  it("shows the preview failure fallback with the renderer error message", () => {
    const onRetry = vi.fn();
    render(
      <ResumeStudioPreviewPane
        isDirty={false}
        isPending={false}
        onRetry={onRetry}
        onSelectTarget={vi.fn()}
        preview={null}
        previewError="Preview rendering failed in desktop test mode."
        previewStatus="error"
        selectedEntryId={null}
        selectedSectionId={null}
        selectedTargetId={null}
        templateLabel={null}
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert.getAttribute("aria-atomic")).toBe("true");
    expect(alert.textContent).toContain("Preview unavailable");
    expect(
      screen.getByText("Preview rendering failed in desktop test mode."),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Your edits are still in the studio and nothing was discarded. You can retry the preview at any time.",
      ),
    ).toBeTruthy();

    const retryButton = screen.getByRole("button", { name: /retry preview/i });
    expect(alert.contains(retryButton)).toBe(true);
    expect(retryButton.hasAttribute("disabled")).toBe(false);
    fireEvent.click(retryButton);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("keeps preview retry controls consistent with in-flight preview state", () => {
    const onRetry = vi.fn();
    const loadingRender = render(
      <ResumeStudioPreviewPane
        isDirty={false}
        isPending={false}
        onRetry={onRetry}
        onSelectTarget={vi.fn()}
        preview={preview}
        previewError={null}
        previewStatus="loading"
        selectedEntryId={null}
        selectedSectionId={null}
        selectedTargetId={null}
        templateLabel="Chronology Classic"
      />,
    );

    const refreshWhileLoading = screen.getByRole("button", {
      name: /refresh preview/i,
    });
    expect(refreshWhileLoading.hasAttribute("disabled")).toBe(true);
    expect(screen.queryByRole("alert")).toBeNull();
    loadingRender.unmount();

    render(
      <ResumeStudioPreviewPane
        isDirty={false}
        isPending
        onRetry={onRetry}
        onSelectTarget={vi.fn()}
        preview={preview}
        previewError="Preview rendering failed in desktop test mode."
        previewStatus="error"
        selectedEntryId={null}
        selectedSectionId={null}
        selectedTargetId={null}
        templateLabel="Chronology Classic"
      />,
    );

    expect(screen.getByRole("status").textContent).toContain(
      "Updating your resume",
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("replaces the iframe with a progress state while the workspace is busy", () => {
    render(
      <ResumeStudioPreviewPane
        isDirty={false}
        isPending
        onRetry={vi.fn()}
        onSelectTarget={vi.fn()}
        preview={preview}
        previewError={null}
        previewStatus="ready"
        selectedEntryId={null}
        selectedSectionId={null}
        selectedTargetId={null}
        templateLabel="Chronology Classic"
      />,
    );

    expect(screen.getByRole("status").textContent).toContain(
      "Updating your resume",
    );
    expect(screen.queryByTitle("Live resume preview")).toBeNull();
  });

  it("contains the preview frame within the pane without horizontal escape", () => {
    const rendered = render(
      <ResumeStudioPreviewPane
        isDirty={false}
        isPending={false}
        onRetry={vi.fn()}
        onSelectTarget={vi.fn()}
        preview={preview}
        previewError={null}
        previewStatus="ready"
        selectedEntryId={null}
        selectedSectionId={null}
        selectedTargetId={null}
        templateLabel="Chronology Classic"
      />,
    );

    const region = rendered.container.querySelector(
      "[data-resume-preview-scroll-region]",
    );
    expect(region?.classList.contains("overflow-x-hidden")).toBe(true);
    expect(region?.classList.contains("overflow-y-auto")).toBe(true);

    const frame = rendered.container.querySelector<HTMLDivElement>(
      "[data-resume-preview-scroll-region] > div > div",
    );
    expect(frame?.classList.contains("w-full")).toBe(true);
    expect(frame?.classList.contains("min-w-0")).toBe(true);
    expect(frame?.classList.contains("overflow-hidden")).toBe(true);

    const iframe = screen.getByTitle("Live resume preview");
    if (!(iframe instanceof HTMLIFrameElement)) {
      throw new Error("Expected the live preview element to be an iframe.");
    }
    expect(iframe.className).toContain("max-w-full");
    expect(iframe.style.maxWidth).toBe("100%");
  });

  it("forwards preview iframe clicks to the editor targeting callback", async () => {
    const onSelectTarget = vi.fn();
    const rendered = render(
      <ResumeStudioPreviewPane
        isDirty={false}
        isPending={false}
        onRetry={vi.fn()}
        onSelectTarget={onSelectTarget}
        preview={preview}
        previewError={null}
        previewStatus="ready"
        selectedEntryId={null}
        selectedSectionId="section_experience"
        selectedTargetId={null}
        templateLabel="Chronology Classic"
      />,
    );

    const iframe = rendered.getByTitle("Live resume preview");
    if (!(iframe instanceof HTMLIFrameElement)) {
      throw new Error("Expected the live preview element to be an iframe.");
    }

    const frameDocument =
      iframe.contentDocument ??
      document.implementation.createHTMLDocument("preview");
    const frameDocumentAddEventListener = vi.spyOn(
      frameDocument,
      "addEventListener",
    );

    if (!iframe.contentDocument) {
      Object.defineProperty(iframe, "contentDocument", {
        configurable: true,
        value: frameDocument,
      });
    }

    await act(async () => {
      iframe.dispatchEvent(new Event("load"));
      await Promise.resolve();
    });

    frameDocument.body.innerHTML =
      '<article data-resume-section-id="section_experience" data-resume-entry-id="entry_signal_systems" data-resume-target-id="entry:section_experience:entry_signal_systems:summary">Signal Systems</article>';

    const previewTarget = frameDocument.querySelector(
      '[data-resume-entry-id="entry_signal_systems"]',
    );
    if (!previewTarget) {
      throw new Error(
        "Expected preview target to exist in iframe test document.",
      );
    }

    const clickListener = frameDocumentAddEventListener.mock.calls.find(
      (call) => call[0] === "click",
    )?.[1];

    if (typeof clickListener !== "function") {
      throw new Error(
        "Expected preview pane to register a click listener on the iframe document.",
      );
    }

    clickListener({
      target: previewTarget,
      preventDefault: vi.fn(),
    } as unknown as MouseEvent);

    expect(onSelectTarget).toHaveBeenCalledWith({
      sectionId: "section_experience",
      entryId: "entry_signal_systems",
      targetId: "entry:section_experience:entry_signal_systems:summary",
    });
  });
});

describe("ResumeStudioPreviewPane locked-pane ownership", () => {
  class ResizeObserverMock {
    observe() {}
    disconnect() {}
    unobserve() {}
  }

  function renderReadyPreviewInLayout() {
    return render(
      <LockedScreenLayout topContent={<div>Workspace context</div>}>
        <ResumeStudioPreviewPane
          isDirty
          isPending={false}
          onRetry={vi.fn()}
          onSelectTarget={vi.fn()}
          preview={preview}
          previewError={null}
          previewStatus="ready"
          selectedEntryId={null}
          selectedSectionId="section_summary"
          selectedTargetId={null}
          templateLabel="Chronology Classic"
        />
      </LockedScreenLayout>,
    );
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

  it("marks the preview scroller as an owned locked-pane region", () => {
    const rendered = render(
      <ResumeStudioPreviewPane
        isDirty
        isPending={false}
        onRetry={vi.fn()}
        onSelectTarget={vi.fn()}
        preview={preview}
        previewError={null}
        previewStatus="ready"
        selectedEntryId={null}
        selectedSectionId="section_summary"
        selectedTargetId={null}
        templateLabel="Chronology Classic"
      />,
    );

    const region = rendered.container.querySelector<HTMLElement>(
      "[data-resume-preview-scroll-region]",
    );

    expect(region?.hasAttribute("data-locked-pane-scroll-region")).toBe(true);
    expect(region?.getAttribute("role")).toBe("region");
    expect(region?.getAttribute("aria-label")).toBe("Live resume preview");
    expect(region?.getAttribute("tabindex")).toBe("0");
    expect(
      region?.querySelectorAll("[data-locked-pane-scroll-region]"),
    ).toHaveLength(0);
  });

  it("consumes wheel input with the preview scroller under the locked layout", () => {
    const rendered = renderReadyPreviewInLayout();

    const region = rendered.container.querySelector<HTMLElement>(
      "[data-resume-preview-scroll-region]",
    );
    if (!(region instanceof HTMLElement)) {
      throw new Error("Expected the preview scroll region to render.");
    }
    Object.defineProperties(region, {
      clientHeight: { configurable: true, value: 400 },
      scrollHeight: { configurable: true, value: 1_600 },
    });
    region.scrollTop = 100;

    const wheelEvent = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaMode: WheelEvent.DOM_DELTA_PIXEL,
      deltaY: 120,
    });
    if (!(region.firstElementChild instanceof HTMLElement)) {
      throw new Error("Expected preview content under the scroll region.");
    }
    region.firstElementChild.dispatchEvent(wheelEvent);

    expect(wheelEvent.defaultPrevented).toBe(true);
    expect(region.scrollTop).toBe(220);
  });

  it("keeps preview keyboard scrolling on the focused region and Space with controls", () => {
    const rendered = renderReadyPreviewInLayout();

    const region = rendered.container.querySelector<HTMLElement>(
      "[data-resume-preview-scroll-region]",
    );
    if (!(region instanceof HTMLElement)) {
      throw new Error("Expected the preview scroll region to render.");
    }
    Object.defineProperties(region, {
      clientHeight: { configurable: true, value: 400 },
      scrollHeight: { configurable: true, value: 1_600 },
    });
    region.focus();

    const arrowDown = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "ArrowDown",
    });
    region.dispatchEvent(arrowDown);
    expect(arrowDown.defaultPrevented).toBe(true);
    expect(region.scrollTop).toBe(40);

    const refreshButton = screen.getByRole("button", {
      name: /refresh preview/i,
    });
    expect(fireEvent.keyDown(refreshButton, { key: " " })).toBe(true);
  });
});
