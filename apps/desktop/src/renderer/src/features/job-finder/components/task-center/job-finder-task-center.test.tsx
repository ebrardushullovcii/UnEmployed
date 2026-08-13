// @vitest-environment jsdom

import type {
  ApplyRunSummary,
  DiscoveryRunRecord,
  JobFinderWorkspaceSnapshot,
} from "@unemployed/contracts";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { JobFinderTaskCenter } from "./job-finder-task-center";

function createWorkspace(): JobFinderWorkspaceSnapshot {
  const discoveryRun = {
    id: "discovery_running",
    state: "running",
    startedAt: "2026-07-31T10:00:00.000Z",
    completedAt: null,
    targetIds: ["source_1"],
    targetExecutions: [],
    activity: [],
    summary: {
      targetsPlanned: 1,
      targetsCompleted: 0,
      validJobsFound: 2,
      durationMs: 0,
    },
  } as unknown as DiscoveryRunRecord;
  const applyRun = {
    id: "apply_running",
    mode: "copilot",
    state: "running",
    jobIds: ["job_1"],
    currentJobId: "job_1",
    createdAt: "2026-07-31T10:00:00.000Z",
    updatedAt: "2026-07-31T10:00:04.000Z",
    completedAt: null,
    totalJobs: 1,
    pendingJobs: 1,
    blockedJobs: 0,
    failedJobs: 0,
  } as ApplyRunSummary;

  return {
    activeDiscoveryRun: discoveryRun,
    applicationRecords: [],
    applyRuns: [applyRun],
    discoveryJobs: [
      { id: "job_1", company: "Mercury", title: "Software Engineer" },
    ],
    latestResumeImportRun: null,
    recentDiscoveryRuns: [],
    searchPreferences: {
      discovery: { targets: [{ id: "source_1", label: "Mercury careers" }] },
    },
  } as unknown as JobFinderWorkspaceSnapshot;
}

describe("JobFinderTaskCenter", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  test("exposes native keyboard focus and dispatches only supported cancel actions once", () => {
    const onCancelApplyRun = vi.fn();
    const onCancelDiscovery = vi.fn();

    render(
      <JobFinderTaskCenter
        isDiscoveryPending
        isResumeImportPending={false}
        onCancelApplyRun={onCancelApplyRun}
        onCancelDiscovery={onCancelDiscovery}
        workspace={createWorkspace()}
      />,
    );

    const summary = screen.getByLabelText("Task center: 2 active");
    expect(summary).toBeInstanceOf(HTMLElement);
    summary?.focus();
    expect(document.activeElement).toBe(summary);

    const discoveryTask = document.querySelector(
      '[data-task-kind="discovery"]',
    );
    const applyTask = document.querySelector('[data-task-kind="apply"]');
    expect(discoveryTask).not.toBeNull();
    expect(applyTask).not.toBeNull();

    fireEvent.click(
      within(discoveryTask as HTMLElement).getByRole("button", {
        name: "Cancel task",
      }),
    );
    fireEvent.click(
      within(applyTask as HTMLElement).getByRole("button", {
        name: "Cancel task",
      }),
    );

    expect(onCancelDiscovery).toHaveBeenCalledOnce();
    expect(onCancelApplyRun).toHaveBeenCalledOnce();
    expect(onCancelApplyRun).toHaveBeenCalledWith("apply_running");
    expect(
      within(discoveryTask as HTMLElement).getByRole<HTMLButtonElement>(
        "button",
      ).disabled,
    ).toBe(true);
    expect(
      within(applyTask as HTMLElement).getByRole<HTMLButtonElement>("button")
        .disabled,
    ).toBe(true);
    expect(screen.queryByText("History estimate")).toBeNull();
  });

  test("routes a cancelled task to its truthful restart surface and closes the popover", async () => {
    const onNavigate = vi.fn();
    const workspace = createWorkspace();
    workspace.activeDiscoveryRun = null;
    workspace.recentDiscoveryRuns = [
      {
        ...(workspace.recentDiscoveryRuns[0] as DiscoveryRunRecord),
        id: "discovery_cancelled",
        state: "cancelled",
        startedAt: "2026-07-31T10:00:00.000Z",
        completedAt: "2026-07-31T10:00:02.000Z",
        targetIds: ["source_1"],
        targetExecutions: [],
        activity: [],
        summary: {
          targetsPlanned: 1,
          targetsCompleted: 0,
          validJobsFound: 2,
          durationMs: 2_000,
        },
      } as unknown as DiscoveryRunRecord,
    ];
    workspace.applyRuns = [];

    render(
      <JobFinderTaskCenter
        isDiscoveryPending={false}
        isResumeImportPending={false}
        onNavigate={onNavigate}
        workspace={workspace}
      />,
    );

    const details = document.querySelector("details");
    expect(details).not.toBeNull();
    if (details) {
      details.open = true;
    }
    fireEvent.click(screen.getByRole("button", { name: "Open Find jobs" }));
    expect(onNavigate).toHaveBeenCalledWith("/job-finder/discovery");
    await waitFor(() => expect(details?.open).toBe(false));
  });

  test("closes predictably with Escape, outside interaction, and the visible close control", () => {
    render(
      <>
        <button type="button">Outside control</button>
        <JobFinderTaskCenter
          isDiscoveryPending
          isResumeImportPending={false}
          workspace={createWorkspace()}
        />
      </>,
    );

    const details = document.querySelector("details") as HTMLDetailsElement;
    const summary = screen.getByLabelText("Task center: 2 active");

    details.open = true;
    fireEvent.keyDown(document, { key: "Escape" });
    expect(details.open).toBe(false);
    expect(document.activeElement).toBe(summary);

    details.open = true;
    fireEvent.pointerDown(
      screen.getByRole("button", { name: "Outside control" }),
    );
    expect(details.open).toBe(false);

    details.open = true;
    fireEvent.click(screen.getByRole("button", { name: "Close Task center" }));
    expect(details.open).toBe(false);
    expect(document.activeElement).toBe(summary);

    const panel = screen.getByRole("region", { name: "Task center" });
    expect(panel.className).toContain("max-h-[calc(100vh-14rem)]");
  });

  test("re-enables cancellation when the owning operation reports a failure", async () => {
    const onCancelDiscovery = vi.fn(() => Promise.resolve(false));

    render(
      <JobFinderTaskCenter
        isDiscoveryPending
        isResumeImportPending={false}
        onCancelDiscovery={onCancelDiscovery}
        workspace={createWorkspace()}
      />,
    );

    const discoveryTask = document.querySelector(
      '[data-task-kind="discovery"]',
    );
    expect(discoveryTask).not.toBeNull();
    const cancelButton = within(discoveryTask as HTMLElement).getByRole(
      "button",
      { name: "Cancel task" },
    );
    fireEvent.click(cancelButton);
    await waitFor(() => expect(cancelButton).toHaveProperty("disabled", false));
    expect(
      within(discoveryTask as HTMLElement).getByRole("status").textContent,
    ).toContain(
      "Cancellation did not complete. Check the task, then try again.",
    );
    fireEvent.click(cancelButton);
    expect(onCancelDiscovery).toHaveBeenCalledTimes(2);
  });

  test("keeps the panel open and explains when task navigation fails", async () => {
    const onNavigate = vi.fn(() => Promise.reject(new Error("route failed")));
    const workspace = createWorkspace();
    workspace.activeDiscoveryRun = null;
    workspace.recentDiscoveryRuns = [
      {
        id: "discovery_failed",
        state: "failed",
        startedAt: "2026-07-31T10:00:00.000Z",
        completedAt: "2026-07-31T10:00:02.000Z",
        targetIds: ["source_1"],
        targetExecutions: [],
        activity: [],
        summary: {
          targetsPlanned: 1,
          targetsCompleted: 0,
          validJobsFound: 0,
          durationMs: 2_000,
        },
      } as unknown as DiscoveryRunRecord,
    ];
    workspace.applyRuns = [];

    render(
      <JobFinderTaskCenter
        isDiscoveryPending={false}
        isResumeImportPending={false}
        onNavigate={onNavigate}
        workspace={workspace}
      />,
    );

    const details = document.querySelector("details") as HTMLDetailsElement;
    details.open = true;
    fireEvent.click(screen.getByRole("button", { name: "Open Find jobs" }));

    expect((await screen.findByRole("status")).textContent).toContain(
      "That page could not open. Try again.",
    );
    expect(details.open).toBe(true);
  });

  test("shows useful progress without unavailable capability clutter", () => {
    render(
      <JobFinderTaskCenter
        isDiscoveryPending
        isResumeImportPending={false}
        workspace={createWorkspace()}
      />,
    );

    expect(screen.getByText("Task center", { selector: "h2" })).toBeInstanceOf(
      HTMLElement,
    );
    expect(screen.getAllByText("Progress").length).toBeGreaterThan(0);
    expect(screen.queryByText("Pause")).toBeNull();
    expect(screen.queryByText("Not available")).toBeNull();
  });
});
