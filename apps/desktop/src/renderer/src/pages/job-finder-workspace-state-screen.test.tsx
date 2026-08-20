// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { JobFinderWorkspaceSnapshot } from "@unemployed/contracts";
import {
  JobFinderHydrationGate,
  WorkspaceStateScreen,
} from "./job-finder-page-routes";

function workspace(
  phase: "bootstrap" | "complete",
): JobFinderWorkspaceSnapshot {
  return {
    hydration: {
      phase,
      deferredCollections: phase === "bootstrap" ? ["discovery_jobs"] : [],
    },
  } as unknown as JobFinderWorkspaceSnapshot;
}

describe("WorkspaceStateScreen", () => {
  it("offers an explicit retry after the initial workspace load fails", () => {
    const onRetry = vi.fn();
    render(
      <WorkspaceStateScreen
        action={{ label: "Retry opening Job Finder", onClick: onRetry }}
        kicker="Workspace error"
        message="The saved workspace could not be read."
        title="Couldn't open Job Finder"
        tone="error"
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Retry opening Job Finder" }),
    );
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("keeps deferred routes honest until the bootstrap becomes complete", () => {
    const { rerender } = render(
      <JobFinderHydrationGate
        collections={["discovery_jobs"]}
        workspace={workspace("bootstrap")}
      >
        <div>Loaded results</div>
      </JobFinderHydrationGate>,
    );

    expect(screen.getByRole("status").textContent).toContain(
      "Loading your workspace",
    );
    expect(screen.queryByText("Loaded results")).toBeNull();

    rerender(
      <JobFinderHydrationGate
        collections={["discovery_jobs"]}
        workspace={workspace("complete")}
      >
        <div>Loaded results</div>
      </JobFinderHydrationGate>,
    );

    expect(screen.getByText("Loaded results")).toBeTruthy();
  });
});
