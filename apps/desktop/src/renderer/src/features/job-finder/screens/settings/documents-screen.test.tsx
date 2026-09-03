// @vitest-environment jsdom

import type { CandidateAsset } from "@unemployed/contracts";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentsScreen } from "./documents-screen";

const importedAsset: CandidateAsset = {
  id: "asset_documents_1",
  kind: "work_sample",
  originalName: "case-study.pdf",
  mime: "application/pdf",
  byteSize: 2048,
  sha256: "a".repeat(64),
  createdAt: "2026-08-10T10:00:00.000Z",
  sensitivity: "sensitive",
  consentScope: "private_storage_only",
  retention: "until_deleted",
  deletedAt: null,
  extractedText: null,
};

function stubCandidateAssets(
  assets: readonly CandidateAsset[],
): ReturnType<typeof vi.fn> {
  const listCandidateAssets = vi.fn().mockResolvedValue({ assets });
  Object.defineProperty(window, "unemployed", {
    configurable: true,
    value: {
      jobFinder: {
        deleteCandidateAsset: vi.fn(),
        importCandidateAsset: vi.fn(),
        listCandidateAssets,
        restoreCandidateAsset: vi.fn(),
      },
    },
  });
  return listCandidateAssets;
}

describe("DocumentsScreen", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("renders a standalone page header above the candidate asset lifecycle UI", async () => {
    stubCandidateAssets([importedAsset]);

    render(<DocumentsScreen />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveProperty(
      "textContent",
      "Documents",
    );
    await waitFor(() =>
      expect(screen.getByText("case-study.pdf")).toBeTruthy(),
    );
    // The full lifecycle UI is preserved on the standalone screen.
    expect(
      screen.getByRole("button", { name: "Choose file to import" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Remove case-study.pdf" }),
    ).toBeTruthy();
    expect(document.body.textContent).toContain("Trash");
  });

  it("loads the asset library through the typed preload bridge", async () => {
    const listCandidateAssets = stubCandidateAssets([]);

    render(<DocumentsScreen />);

    await waitFor(() => expect(listCandidateAssets).toHaveBeenCalledOnce());
    expect(listCandidateAssets).toHaveBeenCalledWith({
      includeDeleted: true,
    });
    // Wait for the async refresh to leave the loading status, not just the
    // preload call — under suite load the empty-state copy can lag the mock.
    await waitFor(() =>
      expect(document.body.textContent).toContain(
        "No extra documents or assets have been imported.",
      ),
    );
  });
});
