// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { ApplicationRecordSchema } from "@unemployed/contracts";
import { afterEach, describe, expect, test, vi } from "vitest";

import { ApplicationsCrmViews } from "./applications-crm-views";

function record(id: string, title: string, company: string) {
  return ApplicationRecordSchema.parse({
    id,
    jobId: `job_${id}`,
    title,
    company,
    status: "approved",
    lastActionLabel: "Prepared",
    nextActionLabel: "Review",
    lastUpdatedAt: "2026-08-15T10:00:00.000Z",
    crm: {
      stage: "ready_for_approval",
      stageChangedAt: "2026-08-15T10:00:00.000Z",
      tags: company === "Acme" ? ["priority"] : [],
    },
  });
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("ApplicationsCrmViews", () => {
  test("searches locally without resetting the selected application", () => {
    const onSelectRecord = vi.fn();
    render(
      <ApplicationsCrmViews
        onSelectRecord={onSelectRecord}
        onViewChange={vi.fn()}
        records={[
          record("application_1", "Frontend Engineer", "Acme"),
          record("application_2", "Backend Engineer", "Beta"),
        ]}
        selectedRecordId="application_2"
        view="table"
      />,
    );

    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search applications" }),
      {
        target: { value: "priority" },
      },
    );
    expect(screen.getByText("Frontend Engineer")).toBeTruthy();
    expect(screen.queryByText("Backend Engineer")).toBeNull();
    expect(onSelectRecord).not.toHaveBeenCalled();
  });

  test("offers table, Kanban, calendar, columns, saved views, and a sticky bulk action", async () => {
    const onBulkStageChange = vi.fn(() => Promise.resolve());
    render(
      <ApplicationsCrmViews
        onBulkStageChange={onBulkStageChange}
        onSelectRecord={vi.fn()}
        onViewChange={vi.fn()}
        records={[record("application_1", "Frontend Engineer", "Acme")]}
        selectedRecordId={null}
        view="table"
      />,
    );

    expect(screen.getByRole("button", { name: "Table" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Kanban" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Calendar" })).toBeTruthy();
    expect(screen.getByText("Columns")).toBeTruthy();
    expect(screen.getByText("Saved views")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Select Frontend Engineer at Acme",
      }),
    );
    expect(screen.getByText("1 selected")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Move to Reviewing" }));
    await waitFor(() =>
      expect(onBulkStageChange).toHaveBeenCalledWith(
        ["application_1"],
        "reviewing",
      ),
    );
  });
});
