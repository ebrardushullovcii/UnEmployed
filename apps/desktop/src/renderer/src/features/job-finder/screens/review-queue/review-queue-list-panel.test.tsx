// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import type { ReviewQueueItem } from "@unemployed/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReviewQueueListPanel } from "./review-queue-list-panel";

afterEach(cleanup);

describe("ReviewQueueListPanel", () => {
  it("associates a disabled queue checkbox with its readiness explanation", () => {
    const item = {
      jobId: "job_1",
      title: "Product Engineer",
      company: "Acme",
      location: "Remote",
      resumeApplicationMode: "tailored_resume",
      resumeReview: { status: "draft" },
      assetStatus: "missing",
      progressPercent: 0,
    } as unknown as ReviewQueueItem;

    render(
      <ReviewQueueListPanel
        isJobPending={() => false}
        onSelectItem={vi.fn()}
        onToggleQueueSelection={vi.fn()}
        queue={[item]}
        queueSelection={[]}
        selectedItem={item}
      />,
    );

    const checkbox = screen.getByRole("checkbox", { name: "Queue" });
    const descriptionId = checkbox.getAttribute("aria-describedby");
    expect(checkbox).toHaveProperty("disabled", true);
    expect(descriptionId).toBeTruthy();
    expect(document.getElementById(descriptionId ?? "")?.textContent).toMatch(
      /approved ready PDF/i,
    );
  });
});
