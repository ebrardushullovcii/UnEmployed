// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JobFinderStartupDatabaseRecoveryFact } from "../../../../../shared/job-finder-startup-db-recovery";
import { StartupDatabaseRecoveryNotice } from "./startup-database-recovery-notice";

function configureBridge(overrides: {
  getStartupDatabaseRecovery?: () => Promise<unknown>;
  dismissStartupDatabaseRecoveryNotice?: () => Promise<unknown>;
}) {
  Object.defineProperty(window, "unemployed", {
    configurable: true,
    value: {
      jobFinder: {
        ...(overrides.getStartupDatabaseRecovery
          ? {
              getStartupDatabaseRecovery: overrides.getStartupDatabaseRecovery,
            }
          : {}),
        ...(overrides.dismissStartupDatabaseRecoveryNotice
          ? {
              dismissStartupDatabaseRecoveryNotice:
                overrides.dismissStartupDatabaseRecoveryNotice,
            }
          : {}),
      },
    },
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete (window as { unemployed?: unknown }).unemployed;
});

describe("StartupDatabaseRecoveryNotice", () => {
  it("stays hidden for idle and blocked facts", async () => {
    configureBridge({
      getStartupDatabaseRecovery: vi.fn(() =>
        Promise.resolve({
          status: "idle",
        } satisfies JobFinderStartupDatabaseRecoveryFact),
      ),
    });
    const { container } = render(<StartupDatabaseRecoveryNotice />);

    await waitFor(() => {
      expect(
        (container.querySelector("[data-startup-database-recovery-notice]") ??
          null) === null,
      ).toBe(true);
    });
    expect(container.textContent).not.toContain("recovered from");
  });

  it("shows the database-only recovery disclosure for an undismissed restore", async () => {
    configureBridge({
      getStartupDatabaseRecovery: vi.fn(() =>
        Promise.resolve({
          status: "restored",
          incidentId: "incident-7",
          restoredFrom: "backup",
          lossWindow: {
            detectedAtIso: "2026-08-20T10:00:00.000Z",
            quarantinedDatabaseModifiedAtIso: null,
            restoredSnapshotModifiedAtIso: "2026-08-19T10:00:00.000Z",
          },
          quarantinedArtifactBasenames: [],
          restoredAtIso: "2026-08-20T10:05:00.000Z",
          dismissedAtIso: null,
        } satisfies JobFinderStartupDatabaseRecoveryFact),
      ),
    });
    render(<StartupDatabaseRecoveryNotice />);

    await screen.findByRole("status");
    expect(
      screen.getByText(/recovered from an automatic snapshot/),
    ).toBeTruthy();
    expect(screen.getByText(/Only the saved workspace database/)).toBeTruthy();
    expect(screen.queryByText("incident-7")).toBeNull();
  });

  it("stays hidden when the restore was already dismissed", async () => {
    configureBridge({
      getStartupDatabaseRecovery: vi.fn(() =>
        Promise.resolve({
          status: "restored",
          incidentId: "incident-8",
          restoredFrom: "backup-prev",
          lossWindow: {
            detectedAtIso: "2026-08-20T10:00:00.000Z",
            quarantinedDatabaseModifiedAtIso: null,
            restoredSnapshotModifiedAtIso: null,
          },
          quarantinedArtifactBasenames: [],
          restoredAtIso: "2026-08-20T10:05:00.000Z",
          dismissedAtIso: "2026-08-20T11:00:00.000Z",
        } satisfies JobFinderStartupDatabaseRecoveryFact),
      ),
    });
    const { container } = render(<StartupDatabaseRecoveryNotice />);

    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(
      container.querySelector("[data-startup-database-recovery-notice]"),
    ).toBeNull();
  });

  it("dismisses through the desktop bridge and hides immediately", async () => {
    const dismissStartupDatabaseRecoveryNotice = vi.fn(() =>
      Promise.resolve({ status: "idle" }),
    );
    configureBridge({
      getStartupDatabaseRecovery: vi.fn(() =>
        Promise.resolve({
          status: "restored",
          incidentId: "incident-9",
          restoredFrom: "backup",
          lossWindow: {
            detectedAtIso: "2026-08-20T10:00:00.000Z",
            quarantinedDatabaseModifiedAtIso: null,
            restoredSnapshotModifiedAtIso: null,
          },
          quarantinedArtifactBasenames: [],
          restoredAtIso: "2026-08-20T10:05:00.000Z",
          dismissedAtIso: null,
        } satisfies JobFinderStartupDatabaseRecoveryFact),
      ),
      dismissStartupDatabaseRecoveryNotice,
    });
    render(<StartupDatabaseRecoveryNotice />);

    await screen.findByRole("status");
    fireEvent.click(
      screen.getByRole("button", {
        name: "Dismiss workspace recovery message",
      }),
    );

    await waitFor(() => {
      expect(dismissStartupDatabaseRecoveryNotice).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("stays hidden when the bridge returns a malformed fact", async () => {
    configureBridge({
      getStartupDatabaseRecovery: vi.fn(() =>
        Promise.resolve({ status: "restored" }),
      ),
    });
    const { container } = render(<StartupDatabaseRecoveryNotice />);

    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(
      container.querySelector("[data-startup-database-recovery-notice]"),
    ).toBeNull();
  });

  it("stays hidden without a desktop bridge", async () => {
    Object.defineProperty(window, "unemployed", {
      configurable: true,
      value: {},
    });
    const { container } = render(<StartupDatabaseRecoveryNotice />);

    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(
      container.querySelector("[data-startup-database-recovery-notice]"),
    ).toBeNull();
  });
});
