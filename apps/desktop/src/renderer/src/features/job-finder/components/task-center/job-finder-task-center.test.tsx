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
import type { TailoredDraftPreparationViewState } from "../../screens/review-queue/review-queue-status";

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

function createQuietWorkspace(): JobFinderWorkspaceSnapshot {
  return {
    applicationRecords: [],
    applyRuns: [],
    discoveryJobs: [],
    latestResumeImportRun: null,
    recentDiscoveryRuns: [],
    searchPreferences: {
      discovery: { targets: [] },
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

    const summary = screen.getByLabelText("Tasks: 2 active");
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

    const summary = screen.getByLabelText(/Tasks:/);
    fireEvent.click(summary);
    fireEvent.click(screen.getByRole("button", { name: "Open Find jobs" }));
    expect(onNavigate).toHaveBeenCalledWith("/job-finder/discovery");
    await waitFor(() =>
      expect(
        (document.querySelector("details") as HTMLDetailsElement).open,
      ).toBe(false),
    );
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
    const summary = screen.getByLabelText("Tasks: 2 active");

    fireEvent.click(summary);
    expect(details.open).toBe(true);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(details.open).toBe(false);
    expect(document.activeElement).toBe(summary);

    fireEvent.click(summary);
    fireEvent.pointerDown(
      screen.getByRole("button", { name: "Outside control" }),
    );
    expect(details.open).toBe(false);

    fireEvent.click(summary);
    fireEvent.pointerDown(screen.getByRole("region", { name: "Tasks" }), {
      bubbles: true,
    });
    expect(details.open).toBe(true);

    fireEvent.click(summary);
    fireEvent.click(screen.getByRole("button", { name: "Close Tasks" }));
    expect(details.open).toBe(false);
    expect(document.activeElement).toBe(summary);

    const panel = screen.getByRole("region", { name: "Tasks" });
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
    fireEvent.click(screen.getByLabelText(/Tasks:/));
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

    expect(screen.getByText("Tasks", { selector: "h2" })).toBeInstanceOf(
      HTMLElement,
    );
    expect(screen.getAllByText("Progress").length).toBeGreaterThan(0);
    expect(screen.queryByText("Pause")).toBeNull();
    expect(screen.queryByText("Not available")).toBeNull();
  });

  test("tracks an active tailored-drafts batch with progress, failures, and a working Stop control", async () => {
    const onStopTailoredDraftPreparation = vi.fn();
    const preparation: TailoredDraftPreparationViewState = {
      attemptedCount: 3,
      completedCount: 2,
      currentIndex: 3,
      eligibleRemainingCount: 0,
      failedCount: 1,
      status: "running",
      totalCount: 5,
    };

    const { rerender } = render(
      <JobFinderTaskCenter
        isDiscoveryPending={false}
        isResumeImportPending={false}
        onStopTailoredDraftPreparation={onStopTailoredDraftPreparation}
        tailoredDraftPreparation={preparation}
        workspace={createQuietWorkspace()}
      />,
    );

    const summary = screen.getByLabelText("Tasks: 1 active");
    expect(summary).toBeInstanceOf(HTMLElement);
    const task = document.querySelector('[data-task-kind="tailored_drafts"]');
    expect(task).not.toBeNull();
    expect(
      within(task as HTMLElement).getByText("2 of 5 prepared · 1 failed"),
    ).toBeInstanceOf(HTMLElement);

    const stopButton = within(task as HTMLElement).getByRole("button", {
      name: "Stop",
    });
    fireEvent.click(stopButton);
    expect(onStopTailoredDraftPreparation).toHaveBeenCalledOnce();
    expect(
      within(task as HTMLElement).getByRole<HTMLButtonElement>("button", {
        name: "Stop",
      }).disabled,
    ).toBe(true);

    rerender(
      <JobFinderTaskCenter
        isDiscoveryPending={false}
        isResumeImportPending={false}
        onStopTailoredDraftPreparation={onStopTailoredDraftPreparation}
        tailoredDraftPreparation={{
          ...preparation,
          status: "stopped",
        }}
        workspace={createQuietWorkspace()}
      />,
    );
    await waitFor(() =>
      expect(
        document.querySelector('[data-task-kind="tailored_drafts"]'),
      ).toBeNull(),
    );
  });

  test("hides the tailored-drafts task when no batch run is active", () => {
    render(
      <JobFinderTaskCenter
        isDiscoveryPending={false}
        isResumeImportPending={false}
        tailoredDraftPreparation={{
          attemptedCount: 3,
          completedCount: 3,
          currentIndex: null,
          eligibleRemainingCount: 0,
          failedCount: 0,
          status: "completed",
          totalCount: 3,
        }}
        workspace={createQuietWorkspace()}
      />,
    );

    expect(
      document.querySelector('[data-task-kind="tailored_drafts"]'),
    ).toBeNull();
    expect(screen.getByLabelText("Tasks: 0 active")).toBeTruthy();
  });
});
