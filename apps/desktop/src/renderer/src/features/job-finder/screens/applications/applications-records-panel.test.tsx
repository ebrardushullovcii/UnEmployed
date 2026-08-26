// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import type { ApplicationRecord } from "@unemployed/contracts";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApplicationsRecordsPanel } from "./applications-records-panel";

afterEach(cleanup);

describe("ApplicationsRecordsPanel", () => {
  it("titles the preparation workspace after its own view instead of the tracker", () => {
    render(
      <MemoryRouter>
        <ApplicationsRecordsPanel
          activeFilter="all"
          applicationRecords={[]}
          filterCounts={{
            all: 0,
            needs_action: 0,
            in_progress: 0,
            submitted: 0,
            manual_only: 0,
          }}
          hasAnyApplications={false}
          onFilterChange={vi.fn()}
          onSelectRecord={vi.fn()}
          selectedRecord={null}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Preparation" })).toBeTruthy();
    expect(screen.queryByText("Application tracker")).toBeNull();
    expect(screen.getByText("Start your first application")).toBeTruthy();
    expect(
      screen.queryByRole("group", { name: "Application filters" }),
    ).toBeNull();
  });

  it("shows stage filters only when there are applications to filter", () => {
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
      crm: null,
    };

    render(
      <MemoryRouter>
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
          selectedRecord={null}
        />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("group", { name: "Application filters" }),
    ).toBeTruthy();
  });

  it("gives each row one clear whole-row details action", () => {
    const onSelectRecord = vi.fn();
    const applicationRecords: ApplicationRecord[] = ["1", "2", "3"].map(
      (suffix) =>
        ({
          id: `application_${suffix}`,
          jobId: `job_${suffix}`,
          title: `Product Engineer ${suffix}`,
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
          crm: null,
        }) as ApplicationRecord,
    );

    render(
      <MemoryRouter>
        <ApplicationsRecordsPanel
          activeFilter="all"
          applicationRecords={applicationRecords}
          filterCounts={{
            all: applicationRecords.length,
            needs_action: 0,
            in_progress: applicationRecords.length,
            submitted: 0,
            manual_only: 0,
          }}
          hasAnyApplications
          onFilterChange={vi.fn()}
          onSelectRecord={onSelectRecord}
          selectedRecord={null}
        />
      </MemoryRouter>,
    );

    const firstRowAction = screen.getByRole("button", {
      name: "View details for Product Engineer 1 at Acme",
    });
    expect(firstRowAction.className).toContain("absolute");
    expect(firstRowAction.className).toContain("inset-0");
    fireEvent.click(firstRowAction);
    expect(onSelectRecord).toHaveBeenCalledWith("application_1");

    // The visible Stage and attempt badges must be heard with the identity.
    const stateDescriptionId = firstRowAction.getAttribute("aria-describedby");
    expect(stateDescriptionId).toBeTruthy();
    expect(document.getElementById(stateDescriptionId!)?.textContent).toBe(
      "Stage Needs you. Preparation attempt Needs follow-up.",
    );
    expect(firstRowAction.getAttribute("aria-keyshortcuts")).toBe(
      "ArrowUp ArrowDown Home End",
    );

    fireEvent.keyDown(firstRowAction, { key: "ArrowDown" });
    expect(onSelectRecord).toHaveBeenLastCalledWith("application_2");

    const secondRowAction = screen.getByRole("button", {
      name: "View details for Product Engineer 2 at Acme",
    });
    expect(secondRowAction.getAttribute("data-collection-item-id")).toBe(
      "application_2",
    );
    fireEvent.keyDown(secondRowAction, { key: "End" });
    expect(onSelectRecord).toHaveBeenLastCalledWith("application_3");
    fireEvent.keyDown(secondRowAction, { key: "Home" });
    expect(onSelectRecord).toHaveBeenLastCalledWith("application_1");
    expect(onSelectRecord).toHaveBeenCalledTimes(4);
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
      crm: null,
    };

    render(
      <MemoryRouter>
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
        />
      </MemoryRouter>,
    );

    expect(screen.queryByRole("table")).toBeNull();
    const applications = screen.getByRole("list", { name: "Applications" });
    expect(applications.className).toContain("overflow-x-hidden");

    const application = within(applications).getByRole("listitem");
    expect(application.textContent).toContain(record.title);
    expect(application.textContent).toContain(record.company);
    expect(application.textContent).toContain(record.nextActionLabel);
    expect(
      within(application)
        .getByRole("button", {
          name: `View details for ${record.title} at ${record.company}`,
        })
        .getAttribute("aria-current"),
    ).toBe("true");

    const rowGrid = application.querySelector(":scope > div");
    expect(rowGrid?.className).toContain("grid-cols-[minmax(0,1fr)_auto]");
    expect(rowGrid?.className).toContain("px-4 py-3");
    expect(rowGrid?.className).not.toContain("py-4");
    expect(within(application).queryByText("Job")).toBeNull();
    expect(within(application).queryByText("Latest activity")).toBeNull();
    expect(within(application).getByText("Stage")).toBeTruthy();
    expect(within(application).getByText("Apply attempt")).toBeTruthy();
  });

  it("keeps the preparation header compact with one reachable filter row", () => {
    const onFilterChange = vi.fn();
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
      crm: null,
    };

    const { container } = render(
      <MemoryRouter>
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
          onFilterChange={onFilterChange}
          onSelectRecord={vi.fn()}
          selectedRecord={null}
        />
      </MemoryRouter>,
    );

    const headerBar = container.querySelector(":scope > section > div");
    expect(headerBar?.className).toContain("px-5");
    expect(headerBar?.className).toContain("py-3");

    const filterGroup = screen.getByRole("group", {
      name: "Application filters",
    });
    expect(filterGroup.className).toContain("flex-nowrap");
    expect(filterGroup.className).toContain("overflow-x-auto");

    const filterButtons = within(filterGroup).getAllByRole("button");
    expect(filterButtons.length).toBeGreaterThan(1);
    for (const filterButton of filterButtons) {
      expect(filterButton.className).toContain("shrink-0");
    }

    fireEvent.click(screen.getByRole("button", { name: /submitted/i }));
    expect(onFilterChange).toHaveBeenCalledWith("submitted");
  });

  it("keeps a large application list bounded to one page", () => {
    const applicationRecords = Array.from(
      { length: 226 },
      (_, index) =>
        ({
          id: `application_${index}`,
          jobId: `job_${index}`,
          title: `Product Engineer ${index}`,
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
          crm: null,
        }) as ApplicationRecord,
    );

    render(
      <MemoryRouter>
        <ApplicationsRecordsPanel
          activeFilter="all"
          applicationRecords={applicationRecords}
          filterCounts={{
            all: 226,
            needs_action: 0,
            in_progress: 226,
            submitted: 0,
            manual_only: 0,
          }}
          hasAnyApplications
          onFilterChange={vi.fn()}
          onSelectRecord={vi.fn()}
          selectedRecord={null}
        />
      </MemoryRouter>,
    );

    expect(screen.getAllByRole("listitem")).toHaveLength(40);
    expect(
      screen.getByRole("navigation", { name: "applications pagination" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(40);
    expect(screen.getByText("Product Engineer 40")).toBeTruthy();
  });

  it("marks the records list as the locked pane scroll region", () => {
    const record: ApplicationRecord = {
      id: "application_scroll_region",
      jobId: "job_scroll_region",
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
      crm: null,
    };

    const { container } = render(
      <MemoryRouter>
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
          selectedRecord={null}
        />
      </MemoryRouter>,
    );

    expect(
      container.querySelectorAll("[data-locked-pane-scroll-region]"),
    ).toHaveLength(1);
    const region = container.querySelector<HTMLElement>(
      "[data-locked-pane-scroll-region]",
    );
    expect(region?.tagName).toBe("UL");
    expect(region?.getAttribute("aria-label")).toBe("Applications");
    expect(region?.className).toContain("overflow-y-auto");
  });

  it("announces an interrupted attempt as failed and never as in progress", () => {
    const record: ApplicationRecord = {
      id: "application_interrupted",
      jobId: "job_1",
      title: "Staff Product Designer",
      company: "Consent Labs",
      status: "approved",
      lastActionLabel: "Preparation stopped when the app closed.",
      nextActionLabel: "Retry preparation when you are ready.",
      lastUpdatedAt: "2026-08-25T23:45:00.000Z",
      lastAttemptState: "failed",
      questionSummary: {
        total: 2,
        required: 2,
        answered: 1,
        unansweredRequired: 1,
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
      crm: null,
    };

    render(
      <MemoryRouter>
        <ApplicationsRecordsPanel
          activeFilter="all"
          applicationRecords={[record]}
          filterCounts={{
            all: 1,
            needs_action: 1,
            in_progress: 0,
            submitted: 0,
            manual_only: 0,
          }}
          hasAnyApplications
          onFilterChange={vi.fn()}
          onSelectRecord={vi.fn()}
          selectedRecord={null}
        />
      </MemoryRouter>,
    );

    // The filter chip label legitimately says "In progress" (with a zero
    // count); the row surfaces themselves must never claim it.
    const rowRegion = document.querySelector(
      "[data-locked-pane-scroll-region]",
    );
    expect(rowRegion?.textContent ?? "").not.toMatch(/In progress/);
    expect(screen.getByText("Needs recovery")).not.toBeNull();
    expect(screen.getByText("Attempt failed")).not.toBeNull();

    const rowAction = screen.getByRole("button", {
      name: "View details for Staff Product Designer at Consent Labs",
    });
    const stateDescriptionId = rowAction.getAttribute("aria-describedby");
    expect(stateDescriptionId).toBeTruthy();
    expect(document.getElementById(stateDescriptionId!)?.textContent).toBe(
      "Stage Needs recovery. Preparation attempt Attempt failed.",
    );
  });
});
