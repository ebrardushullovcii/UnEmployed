// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProfileSourceDebugReviewModal } from "./profile-source-debug-review-modal";

afterEach(() => {
  cleanup();
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
});
