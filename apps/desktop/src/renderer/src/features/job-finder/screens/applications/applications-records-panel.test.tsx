// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import type { ApplicationRecord } from "@unemployed/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApplicationsRecordsPanel } from "./applications-records-panel";

afterEach(cleanup);

describe("ApplicationsRecordsPanel", () => {
  it("gives each row one clear whole-row details action", () => {
    const onSelectRecord = vi.fn();
    const record: ApplicationRecord = {
      id: "application_1",
      jobId: "job_1",
      title: "Product Engineer",
      company: "Acme",
      status: "ready_for_review",
      lastActionLabel: "Resume approved",
      nextActionLabel: "Prepare application",
      lastUpdatedAt: "2026-08-09T08:00:00.000Z",
      lastAttemptState: "paused",
      questionSummary: {
        total: 0,
        required: 0,
        answered: 0,
        unansweredRequired: 0,
      },
      latestBlocker: null,
      consentSummary: { status: "none", pendingCount: 0 },
      replaySummary: {
        sourceInstructionArtifactId: null,
        lastUrl: null,
        checkpointCount: 0,
        evidenceCount: 0,
      },
      events: [],
    };

    render(
      <ApplicationsRecordsPanel
        activeFilter="all"
        applicationRecords={[record]}
        filterCounts={{
          all: 1,
          needs_action: 0,
          in_progress: 1,
          submitted: 0,
          manual_only: 0,
        }}
        hasAnyApplications
        onFilterChange={vi.fn()}
        onSelectRecord={onSelectRecord}
        selectedRecord={null}
      />,
    );

    const detailsAction = screen.getByRole("button", {
      name: "View details for Product Engineer at Acme",
    });
    expect(detailsAction.className).toContain("absolute");
    expect(detailsAction.className).toContain("inset-0");
    fireEvent.click(detailsAction);
    expect(onSelectRecord).toHaveBeenCalledWith("application_1");
  });

  it("uses a labeled responsive summary instead of a horizontally scrolling table", () => {
    const record: ApplicationRecord = {
      id: "application_1",
      jobId: "job_1",
      title: "Senior Product Engineer for Developer Experience",
      company: "Acme International Technology Group",
      status: "ready_for_review",
      lastActionLabel: "A detailed resume was approved for this application",
      nextActionLabel: "Prepare application",
      lastUpdatedAt: "2026-08-09T08:00:00.000Z",
      lastAttemptState: "paused",
      questionSummary: {
        total: 0,
        required: 0,
        answered: 0,
        unansweredRequired: 0,
      },
      latestBlocker: null,
      consentSummary: { status: "none", pendingCount: 0 },
      replaySummary: {
        sourceInstructionArtifactId: null,
        lastUrl: null,
        checkpointCount: 0,
        evidenceCount: 0,
      },
      events: [],
    };

    render(
      <ApplicationsRecordsPanel
        activeFilter="all"
        applicationRecords={[record]}
        filterCounts={{
          all: 1,
          needs_action: 0,
          in_progress: 1,
          submitted: 0,
          manual_only: 0,
        }}
        hasAnyApplications
        onFilterChange={vi.fn()}
        onSelectRecord={vi.fn()}
        selectedRecord={record}
      />,
    );

    expect(screen.queryByRole("table")).toBeNull();
    const applications = screen.getByRole("list", { name: "Applications" });
    expect(applications.className).toContain("overflow-x-hidden");

    const application = within(applications).getByRole("listitem");
    expect(application.textContent).toContain("Job");
    expect(application.textContent).toContain(record.title);
    expect(application.textContent).toContain(record.company);
    expect(application.textContent).toContain("Latest activity");
    expect(application.textContent).toContain("Stage");
    expect(application.textContent).toContain("Apply attempt");
    expect(application.querySelector(".grid-cols-2")?.className).toContain(
      "@[42rem]/tracker:grid-cols-",
    );
    expect(
      within(application)
        .getByRole("button", {
          name: `View details for ${record.title} at ${record.company}`,
        })
        .getAttribute("aria-current"),
    ).toBe("true");
  });
});
