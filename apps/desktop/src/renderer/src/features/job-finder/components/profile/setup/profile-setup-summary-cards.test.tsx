// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
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

  function renderSummary(
    hasImportedResume: boolean,
    reviewItemCount: number,
    optionalReviewItemCount = 0,
    isImportResumePending = false,
  ) {
    const onResumeCurrentStep = vi.fn();
    const onImportResume = vi.fn();
    const onStartManually = vi.fn();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root?.render(
        <ProfileSetupSummaryCards
          actionMessage={null}
          hasImportedResume={hasImportedResume}
          importDisabledReason={null}
          isImportResumePending={isImportResumePending}
          isProfileSetupPending={false}
          resumeImportProgress={null}
          onImportResume={onImportResume}
          onOpenProfile={vi.fn()}
          onResumeCurrentStep={onResumeCurrentStep}
          onStartManually={onStartManually}
          profileSetupState={{
            status: hasImportedResume ? "in_progress" : "not_started",
            currentStep: hasImportedResume ? "background" : "import",
            completedAt: null,
            lastResumedAt: null,
            reviewItems: [],
          }}
          readinessCards={
            hasImportedResume
              ? []
              : [
                  { label: "Discovery", value: "Not provided yet" },
                  { label: "Resume quality", value: "Not analyzed yet" },
                  { label: "Apply readiness", value: "Not provided yet" },
                ]
          }
          reviewItemCount={reviewItemCount}
          optionalReviewItemCount={optionalReviewItemCount}
        />,
      );
    });

    return { onImportResume, onResumeCurrentStep, onStartManually };
  }

  it("uses truthful neutral language before any resume analysis", () => {
    const { onImportResume, onResumeCurrentStep, onStartManually } =
      renderSummary(false, 0);

    expect(container?.textContent).toContain(
      "Start with the résumé you already have.",
    );
    expect(container?.textContent).toContain("asks only about important gaps");
    expect(container?.textContent).toContain(
      "extracted content may be sent to that provider",
    );
    expect(container?.textContent).not.toContain("in good shape");
    expect(
      [...container!.querySelectorAll("button")].map(
        (button) => button.textContent,
      ),
    ).toEqual([
      "Import my résuméPDF, DOCX, TXT, or Markdown · review before anything is approved",
      "Enter details manuallyBegin with contact details and target roles; add the rest when it becomes useful.",
    ]);

    act(() => {
      (container!.querySelectorAll("button")[0] as HTMLButtonElement).click();
      (container!.querySelectorAll("button")[1] as HTMLButtonElement).click();
    });
    expect(onImportResume).toHaveBeenCalledTimes(1);
    expect(onStartManually).toHaveBeenCalledTimes(1);
    expect(onResumeCurrentStep).not.toHaveBeenCalled();
  });

  it("locks both first-run choices while a resume import is pending", () => {
    const { onImportResume, onStartManually } = renderSummary(false, 0, 0, true);
    const buttons = [
      ...(container?.querySelectorAll("button") ?? []),
    ] as HTMLButtonElement[];

    expect(buttons).toHaveLength(2);
    expect(buttons.every((button) => button.disabled)).toBe(true);
    expect(buttons[0]?.getAttribute("aria-busy")).toBe("true");
    expect(onImportResume).not.toHaveBeenCalled();
    expect(onStartManually).not.toHaveBeenCalled();
  });

  it("promotes review and demotes re-import after a successful import", () => {
    renderSummary(true, 2);

    expect(container?.textContent).toContain("Review Background.");
    expect(container?.textContent).not.toContain("Finish the essentials.");
    expect(
      [...container!.querySelectorAll("button")].map(
        (button) => button.textContent,
      ),
    ).toEqual(["Review Background", "Replace resume", "Open full Profile"]);
  });

  it("keeps optional suggestions visible without presenting them as blockers", () => {
    renderSummary(true, 0, 2);

    expect(container?.textContent).toContain("2 optional suggestions");
    expect(container?.textContent).toContain(
      "Optional suggestions are available, but they do not block setup.",
    );
    expect(container?.textContent).not.toContain("review items waiting");
    expect(
      [...container!.querySelectorAll("button")].map(
        (button) => button.textContent,
      ),
    ).toEqual(["Continue Background", "Replace resume", "Open full Profile"]);
  });
});
