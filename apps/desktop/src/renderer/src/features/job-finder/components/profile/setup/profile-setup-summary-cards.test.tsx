// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProfileSetupState } from "@unemployed/contracts";
import { ProfileSetupSummaryCards } from "./profile-setup-screen-sections";

describe("ProfileSetupSummaryCards", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
    }
    root = null;
    container?.remove();
    container = null;
  });

  type SummaryProps = {
    actionMessage: string | null;
    hasImportedResume: boolean;
    importDisabledReason: string | null;
    isImportResumePending: boolean;
    isProfileSetupPending: boolean;
    resumeImportProgress: null;
    profileSetupState: ProfileSetupState;
    readinessCards: ReadonlyArray<{ label: string; value: string }>;
    reviewItemCount: number;
    optionalReviewItemCount: number;
  };

  function buildSummaryProps(options: {
    hasImportedResume: boolean;
    reviewItemCount: number;
    optionalReviewItemCount?: number;
    isImportResumePending?: boolean;
    isProfileSetupPending?: boolean;
    actionMessage?: string | null;
    importDisabledReason?: string | null;
  }): SummaryProps {
    const profileSetupState: ProfileSetupState = {
      status: options.hasImportedResume ? "in_progress" : "not_started",
      currentStep: options.hasImportedResume ? "background" : "import",
      completedAt: null,
      lastResumedAt: null,
      reviewItems: [],
    };

    const readinessCards: ReadonlyArray<{ label: string; value: string }> =
      options.hasImportedResume
        ? [
            {
              label: "Profile",
              value: "Alex Vanguard · Principal Designer",
            },
          ]
        : [
            { label: "Discovery", value: "Not provided yet" },
            { label: "Resume quality", value: "Not analyzed yet" },
            { label: "Apply readiness", value: "Not provided yet" },
          ];

    return {
      actionMessage: options.actionMessage ?? null,
      hasImportedResume: options.hasImportedResume,
      importDisabledReason: options.importDisabledReason ?? null,
      isImportResumePending: options.isImportResumePending ?? false,
      isProfileSetupPending: options.isProfileSetupPending ?? false,
      resumeImportProgress: null,
      profileSetupState,
      readinessCards,
      reviewItemCount: options.reviewItemCount,
      optionalReviewItemCount: options.optionalReviewItemCount ?? 0,
    };
  }

  function getContainerOrThrow(): HTMLDivElement {
    if (!container) {
      throw new Error("Expected container to be mounted");
    }
    return container;
  }

  function getRootOrThrow(): Root {
    if (!root) {
      throw new Error("Expected root to be mounted");
    }
    return root;
  }

  function getButtonOrThrow(
    buttons: HTMLButtonElement[],
    index: number,
  ): HTMLButtonElement {
    const button = buttons[index];
    if (!button) {
      throw new Error(`Expected button at index ${index} to exist`);
    }
    return button;
  }

  function mountSummary(
    props: SummaryProps,
    handlers: {
      onImportResume: ReturnType<typeof vi.fn>;
      onResumeCurrentStep: ReturnType<typeof vi.fn>;
      onStartManually: ReturnType<typeof vi.fn>;
    },
  ) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      getRootOrThrow().render(
        <ProfileSetupSummaryCards
          {...props}
          onImportResume={handlers.onImportResume}
          onOpenProfile={vi.fn()}
          onResumeCurrentStep={handlers.onResumeCurrentStep}
          onStartManually={handlers.onStartManually}
        />,
      );
    });
  }

  function renderSummary(
    hasImportedResume: boolean,
    reviewItemCount: number,
    optionalReviewItemCount = 0,
    isImportResumePending = false,
    actionMessage: string | null = null,
    importDisabledReason: string | null = null,
    isProfileSetupPending = false,
  ) {
    const onResumeCurrentStep = vi.fn();
    const onImportResume = vi.fn();
    const onStartManually = vi.fn();
    const handlers = { onResumeCurrentStep, onImportResume, onStartManually };
    mountSummary(
      buildSummaryProps({
        hasImportedResume,
        reviewItemCount,
        optionalReviewItemCount,
        isImportResumePending,
        actionMessage,
        importDisabledReason,
        isProfileSetupPending,
      }),
      handlers,
    );

    return handlers;
  }

  function listButtons(): HTMLButtonElement[] {
    const currentContainer = getContainerOrThrow();
    return Array.from(currentContainer.querySelectorAll("button")).filter(
      (element): element is HTMLButtonElement =>
        element instanceof HTMLButtonElement,
    );
  }

  function dispatchClick(button: HTMLButtonElement): MouseEvent {
    const event = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    });
    button.dispatchEvent(event);
    return event;
  }

  it("uses truthful neutral language before any resume analysis", () => {
    const { onImportResume, onResumeCurrentStep, onStartManually } =
      renderSummary(false, 0);

    expect(container?.textContent).toContain("Start with the resume you already have.");
    expect(container?.textContent).toContain("asks only about important gaps");
    expect(container?.textContent).toContain(
      "extracted text may be sent to that provider",
    );
    // The AI-provider statement appears once; the footer keeps only the
    // employer-access commitment instead of repeating provider wording.
    expect(container?.textContent).toContain("Employer access stays off");
    expect(container?.textContent).not.toContain("connected in Settings");
    expect(container?.textContent).not.toContain("in good shape");
    // The recommended import choice names the file-picker affordance while
    // keeping formats and review truth visible.
    expect(
      [...getContainerOrThrow().querySelectorAll("button")].map(
        (button) => button.textContent,
      ),
    ).toEqual([
      "RecommendedChoose my resume file…Opens a file browser · PDF, DOCX, TXT, or Markdown · review before anything is approved",
      "Enter details manuallyBegin with contact details and target roles; add the rest when it becomes useful.",
    ]);

    act(() => {
      const buttons = listButtons();
      const importButton = getButtonOrThrow(buttons, 0);
      const manualButton = getButtonOrThrow(buttons, 1);
      importButton.click();
      manualButton.click();
    });
    expect(onImportResume).toHaveBeenCalledTimes(1);
    expect(onStartManually).toHaveBeenCalledTimes(1);
    expect(onResumeCurrentStep).not.toHaveBeenCalled();
  });

  it("prepares recovery up front for files without readable text", () => {
    renderSummary(false, 0);

    const text = container?.textContent ?? "";

    // A persisted import can end in needs_text; the pristine card must name
    // that outcome and its nearest recovery instead of promising extraction.
    expect(text).toContain("contain no readable text");
    expect(text).toContain("Job Finder says so and extracts nothing");
    expect(text).toContain("pick a text-based file or continue manually");
  });

  it("explains commitments with plain language and compact effort framing", () => {
    renderSummary(false, 0);

    const text = container?.textContent ?? "";

    // No dangling internal references before steps have been introduced.
    expect(text).not.toContain("enabled in Targeting");
    expect(text).not.toContain("follows your configured provider");
    expect(text).toContain(
      "One public job page for Job Finder to search",
    );

    // Effort framing stays compact: total size plus recoverability, without
    // enumerating individual steps before the first choice is made.
    expect(text).toContain("seven short steps, saved as you go");
    expect(text).toContain("stop after any step and pick back up later");
    expect(text).not.toContain("in this order");

    // Commitment model stays honest about effort and outcomes.
    expect(text).toContain("not a promise of job results");
  });

  it("locks both first-run choices while a resume import is pending", () => {
    const { onImportResume, onStartManually } = renderSummary(
      false,
      0,
      0,
      true,
    );
    const buttons = listButtons();

    expect(buttons).toHaveLength(2);
    // Pending keeps both controls exposed and focusable instead of flipping
    // them to native disabled (which would drop focus mid-import).
    expect(buttons.every((button) => !button.hasAttribute("disabled"))).toBe(
      true,
    );
    expect(
      buttons.every((button) => button.getAttribute("aria-disabled") === "true"),
    ).toBe(true);
    const importButton = getButtonOrThrow(buttons, 0);
    const manualButton = getButtonOrThrow(buttons, 1);
    expect(importButton.getAttribute("aria-busy")).toBe("true");
    expect(manualButton.getAttribute("aria-busy")).toBeNull();
    expect(onImportResume).not.toHaveBeenCalled();
    expect(onStartManually).not.toHaveBeenCalled();

    act(() => {
      dispatchClick(importButton);
      dispatchClick(manualButton);
    });
    expect(onImportResume).not.toHaveBeenCalled();
    expect(onStartManually).not.toHaveBeenCalled();
  });

  it("keeps focus on the import control across the pending transition and restores activation", () => {
    const onResumeCurrentStep = vi.fn();
    const onImportResume = vi.fn();
    const onStartManually = vi.fn();
    const handlers = { onResumeCurrentStep, onImportResume, onStartManually };

    mountSummary(buildSummaryProps({ hasImportedResume: false, reviewItemCount: 0 }), handlers);
    const buttonsBefore = listButtons();
    const importButton = getButtonOrThrow(buttonsBefore, 0);
    const manualButton = getButtonOrThrow(buttonsBefore, 1);

    act(() => {
      importButton.focus();
      manualButton.focus();
    });
    expect(document.activeElement).toBe(manualButton);

    act(() => {
      getRootOrThrow().render(
        <ProfileSetupSummaryCards
          {...buildSummaryProps({
            hasImportedResume: false,
            reviewItemCount: 0,
            isImportResumePending: true,
          })}
          onImportResume={onImportResume}
          onOpenProfile={vi.fn()}
          onResumeCurrentStep={onResumeCurrentStep}
          onStartManually={onStartManually}
        />,
      );
    });

    // The busy transition must not throw keyboard focus back to <body>.
    expect(document.activeElement).toBe(manualButton);
    expect(manualButton.hasAttribute("disabled")).toBe(false);
    expect(importButton.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    )).toBe(false);
    expect(onImportResume).not.toHaveBeenCalled();
    expect(onStartManually).not.toHaveBeenCalled();

    act(() => {
      getRootOrThrow().render(
        <ProfileSetupSummaryCards
          {...buildSummaryProps({ hasImportedResume: false, reviewItemCount: 0 })}
          onImportResume={onImportResume}
          onOpenProfile={vi.fn()}
          onResumeCurrentStep={onResumeCurrentStep}
          onStartManually={onStartManually}
        />,
      );
    });

    expect(manualButton.getAttribute("aria-disabled")).toBeNull();
    expect(manualButton.getAttribute("aria-busy")).toBeNull();
    act(() => {
      manualButton.click();
    });
    expect(onStartManually).toHaveBeenCalledTimes(1);
  });

  it("associates the visible import guard reason with the import control", () => {
    const reason =
      "Save your current profile or setup draft before importing so those unsaved edits do not get overwritten.";
    const { onImportResume, onStartManually } = renderSummary(
      false,
      0,
      0,
      false,
      null,
      reason,
    );
    const buttons = listButtons();
    const importButton = getButtonOrThrow(buttons, 0);
    const manualButton = getButtonOrThrow(buttons, 1);

    // A hard import guard keeps native disabled semantics.
    expect(importButton.disabled).toBe(true);
    expect(manualButton.hasAttribute("disabled")).toBe(false);

    const describedById = importButton.getAttribute("aria-describedby");
    expect(describedById).toBeTruthy();
    const describedElement = describedById
      ? document.getElementById(describedById)
      : null;
    if (!describedElement) {
      throw new Error("Expected aria-describedby element to exist");
    }
    expect(describedElement.textContent).toBe(reason);

    act(() => {
      importButton.click();
      manualButton.click();
    });
    expect(onImportResume).not.toHaveBeenCalled();
    expect(onStartManually).toHaveBeenCalledTimes(1);
  });

  it("prefers pending semantics over the hard guard so in-flight imports keep focus", () => {
    renderSummary(
      false,
      0,
      0,
      true,
      null,
      "Save your current profile or setup draft before importing.",
    );
    const buttons = listButtons();
    const importButton = getButtonOrThrow(buttons, 0);

    expect(importButton.hasAttribute("disabled")).toBe(false);
    expect(importButton.getAttribute("aria-disabled")).toBe("true");
    expect(importButton.getAttribute("aria-busy")).toBe("true");
    expect(importButton.getAttribute("aria-describedby")).toBeTruthy();
  });

  it("promotes review and demotes re-import after a successful import", () => {
    renderSummary(true, 2);

    expect(container?.textContent).toContain("Review Background.");
    expect(container?.textContent).not.toContain("Finish the essentials.");
    expect(
      [...getContainerOrThrow().querySelectorAll("button")].map(
        (button) => button.textContent,
      ),
    ).toEqual(["Review Background", "Replace resume", "Open full Profile"]);
  });

  it("preserves saved import details and exposes an accessible replace retry after failure", () => {
    const { onImportResume } = renderSummary(
      true,
      2,
      0,
      false,
      "Resume import failed. Your saved profile was not changed. Choose Replace resume to try again.",
    );

    expect(container?.textContent).toContain(
      "Alex Vanguard · Principal Designer",
    );
    const status = getContainerOrThrow().querySelector('[role="status"]');
    expect(status?.textContent).toContain("Resume import failed");
    expect(status?.textContent).toContain("saved profile was not changed");

    const safeContainer = getContainerOrThrow();
    const replaceButton = [...safeContainer.querySelectorAll("button")].find(
      (button) => button.textContent === "Replace resume",
    );
    if (!replaceButton) {
      throw new Error("Expected Replace resume button to exist");
    }
    if (!(replaceButton instanceof HTMLButtonElement)) {
      throw new Error("Expected Replace resume to be a button element");
    }
    expect(replaceButton.hasAttribute("disabled")).toBe(false);
    act(() => replaceButton.click());
    expect(onImportResume).toHaveBeenCalledOnce();
  });

  it("keeps optional suggestions visible without presenting them as blockers", () => {
    renderSummary(true, 0, 2);

    expect(container?.textContent).toContain("2 optional suggestions");
    expect(container?.textContent).toContain(
      "Optional suggestions are available, but they do not block setup.",
    );
    expect(container?.textContent).not.toContain("review items waiting");
    expect(
      [...getContainerOrThrow().querySelectorAll("button")].map(
        (button) => button.textContent,
      ),
    ).toEqual(["Continue Background", "Replace resume", "Open full Profile"]);
  });
});
