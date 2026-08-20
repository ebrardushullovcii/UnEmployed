import type * as FsPromises from "node:fs/promises";
import { describe, expect, test, vi } from "vitest";

const {
  mockGetBrowserAgentProfileDirectory,
  mockGetJobFinderDocumentsDirectory,
  mockGetJobFinderWorkspaceService,
  mockRm,
  mockResetWorkspace,
} = vi.hoisted(() => ({
  mockGetBrowserAgentProfileDirectory: vi.fn(() => "browser-profile"),
  mockGetJobFinderDocumentsDirectory: vi.fn(() => "job-finder-documents"),
  mockGetJobFinderWorkspaceService: vi.fn(),
  mockResetWorkspace: vi.fn(),
  mockRm: vi.fn(),
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromises>();

  return {
    ...actual,
    rm: mockRm,
  };
});

vi.mock("./paths", () => ({
  getBrowserAgentProfileDirectory: mockGetBrowserAgentProfileDirectory,
  getJobFinderDocumentsDirectory: mockGetJobFinderDocumentsDirectory,
}));

vi.mock("./workspace-service", () => ({
  getJobFinderWorkspaceService: mockGetJobFinderWorkspaceService,
}));

import { resetJobFinderWorkspace } from "./reset-workspace";

describe("resetJobFinderWorkspace", () => {
  test("does not remove app-owned files when the workspace reset is blocked", async () => {
    const resetError = new Error(
      "Job Finder workspace reset is unavailable while discovery is still running.",
    );
    mockResetWorkspace.mockRejectedValueOnce(resetError);
    mockGetJobFinderWorkspaceService.mockResolvedValueOnce({
      resetWorkspace: mockResetWorkspace,
    });

    await expect(resetJobFinderWorkspace()).rejects.toThrow(
      "workspace reset is unavailable while discovery is still running",
    );

    expect(mockResetWorkspace).toHaveBeenCalledTimes(1);
    expect(mockRm).not.toHaveBeenCalled();
  });
});
