// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { CandidateAsset } from "@unemployed/contracts";
import { afterEach, describe, expect, test, vi } from "vitest";

import { SettingsCandidateAssets } from "./settings-candidate-assets";

const asset: CandidateAsset = {
  id: "asset_1",
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

const trashedAsset: CandidateAsset = {
  ...asset,
  deletedAt: "2026-08-10T11:00:00.000Z",
  lifecycle: {
    retentionStartedAt: asset.createdAt,
    expiresAt: null,
    deletionReason: "removed",
    purgeAt: "2026-08-17T11:00:00.000Z",
  },
};

describe("SettingsCandidateAssets", () => {
  let root: Root | null = null;

  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  afterEach(() => {
    if (root) act(() => root?.unmount());
    document.body.replaceChildren();
    root = null;
    vi.restoreAllMocks();
  });

  test("imports with until-deleted retention and restores Trash through typed IPC", async () => {
    const listCandidateAssets = vi
      .fn()
      .mockResolvedValueOnce({ assets: [] })
      .mockResolvedValueOnce({ assets: [asset] })
      .mockResolvedValueOnce({ assets: [trashedAsset] })
      .mockResolvedValueOnce({ assets: [asset] });
    const importCandidateAsset = vi
      .fn()
      .mockResolvedValue({ status: "imported", asset });
    const deleteCandidateAsset = vi.fn().mockResolvedValue({
      asset: trashedAsset,
    });
    const restoreCandidateAsset = vi.fn().mockResolvedValue({ asset });
    Object.defineProperty(window, "unemployed", {
      configurable: true,
      value: {
        jobFinder: {
          listCandidateAssets,
          importCandidateAsset,
          deleteCandidateAsset,
          restoreCandidateAsset,
        },
      },
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<SettingsCandidateAssets />);
      await Promise.resolve();
    });
    const importButton = [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Choose file to import",
    ) as HTMLButtonElement;

    await act(async () => {
      importButton.click();
      await Promise.resolve();
    });

    expect(importCandidateAsset).toHaveBeenCalledWith({
      kind: "work_sample",
      sensitivity: "sensitive",
      consentScope: "job_application_attachment",
      retention: "until_deleted",
    });
    expect(document.body.textContent).toContain("case-study.pdf");
    expect(document.body.textContent).not.toMatch(/[A-Z]:\\|file:\/\//i);

    const removeButton = [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Remove",
    ) as HTMLButtonElement;
    expect(removeButton.getAttribute("aria-label")).toBe(
      "Remove case-study.pdf",
    );
    await act(async () => {
      removeButton.click();
      await Promise.resolve();
    });

    expect(deleteCandidateAsset).not.toHaveBeenCalled();
    const removalDialog = document.querySelector('[role="alertdialog"]');
    expect(removalDialog?.textContent).toContain("Remove case-study.pdf?");
    expect(removalDialog?.textContent).toContain("Trash for seven days");
    expect(removalDialog?.textContent).toContain(
      "Prepared applications that use this asset",
    );
    expect(document.activeElement).toBe(removalDialog);

    await act(async () => {
      const moveToTrashButton = [...document.querySelectorAll("button")].find(
        (button) => button.textContent?.trim() === "Move to Trash",
      ) as HTMLButtonElement;
      moveToTrashButton.click();
      await Promise.resolve();
    });

    expect(deleteCandidateAsset).toHaveBeenCalledWith({ assetId: "asset_1" });
    expect(document.body.textContent).toContain("case-study.pdf");
    expect(document.body.textContent).toContain("Trash");

    const restoreButton = [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Restore",
    ) as HTMLButtonElement;
    expect(restoreButton.getAttribute("aria-label")).toBe(
      "Restore case-study.pdf",
    );
    await act(async () => {
      restoreButton.click();
      await Promise.resolve();
    });

    expect(restoreCandidateAsset).toHaveBeenCalledWith({
      assetId: "asset_1",
      retention: "until_deleted",
    });
    expect(document.body.textContent).toContain("fresh retention clock");
    expect(listCandidateAssets).toHaveBeenCalledTimes(4);
    expect(listCandidateAssets).toHaveBeenCalledWith({
      includeDeleted: true,
    });
  });

  test("offers Retry after a load failure and replaces state from the authoritative list", async () => {
    const listCandidateAssets = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce({ assets: [asset] });
    Object.defineProperty(window, "unemployed", {
      configurable: true,
      value: {
        jobFinder: {
          listCandidateAssets,
          importCandidateAsset: vi.fn(),
          deleteCandidateAsset: vi.fn(),
          restoreCandidateAsset: vi.fn(),
        },
      },
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<SettingsCandidateAssets />);
      await Promise.resolve();
    });
    expect(document.body.textContent).toContain(
      "Could not load the asset library.",
    );
    const retryButton = [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Retry",
    ) as HTMLButtonElement;

    await act(async () => {
      retryButton.click();
      await Promise.resolve();
    });

    expect(listCandidateAssets).toHaveBeenCalledTimes(2);
    expect(document.body.textContent).toContain("case-study.pdf");
    expect(document.body.textContent).not.toContain(
      "Could not load the asset library.",
    );
  });

  test("keeps the asset toolbar and status content shrinkable", async () => {
    const listCandidateAssets = vi.fn().mockResolvedValue({ assets: [asset] });
    Object.defineProperty(window, "unemployed", {
      configurable: true,
      value: {
        jobFinder: {
          listCandidateAssets,
          importCandidateAsset: vi.fn(),
          deleteCandidateAsset: vi.fn(),
          restoreCandidateAsset: vi.fn(),
        },
      },
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<SettingsCandidateAssets />);
      await Promise.resolve();
    });

    const input = document.querySelector('[data-slot="input"]');
    const searchField = input?.parentElement;
    const toolbar = searchField?.parentElement?.parentElement;
    const assetPanel = container.firstElementChild;

    expect(assetPanel?.className).toContain("min-w-0");
    expect(searchField?.className).toContain("min-w-0");
    expect(searchField?.className).toContain("sm:min-w-56");
    expect(toolbar?.className).toContain("min-w-0");
    expect(
      [...container.querySelectorAll("p")].find((paragraph) =>
        paragraph.textContent?.includes("active;"),
      )?.className,
    ).toContain("break-words");
  });

  test("disables every control while a mutation and authoritative refresh are pending", async () => {
    let resolveDelete: ((value: { asset: CandidateAsset }) => void) | null =
      null;
    const listCandidateAssets = vi
      .fn()
      .mockResolvedValueOnce({ assets: [asset] })
      .mockResolvedValueOnce({ assets: [trashedAsset] });
    const deleteCandidateAsset = vi.fn(
      () =>
        new Promise<{ asset: CandidateAsset }>((resolve) => {
          resolveDelete = resolve;
        }),
    );
    Object.defineProperty(window, "unemployed", {
      configurable: true,
      value: {
        jobFinder: {
          listCandidateAssets,
          importCandidateAsset: vi.fn(),
          deleteCandidateAsset,
          restoreCandidateAsset: vi.fn(),
        },
      },
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<SettingsCandidateAssets />);
      await Promise.resolve();
    });
    const removeButton = [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Remove",
    ) as HTMLButtonElement;
    removeButton.focus();
    await act(async () => {
      removeButton.click();
      await Promise.resolve();
    });

    expect(deleteCandidateAsset).not.toHaveBeenCalled();

    await act(async () => {
      const moveToTrashButton = [...document.querySelectorAll("button")].find(
        (button) => button.textContent?.trim() === "Move to Trash",
      ) as HTMLButtonElement;
      moveToTrashButton.click();
      moveToTrashButton.click();
      await Promise.resolve();
    });

    expect(deleteCandidateAsset).toHaveBeenCalledOnce();
    expect(
      document.querySelector<HTMLButtonElement>(
        '[role="alertdialog"] button[data-pending="true"]',
      )?.textContent,
    ).toContain("Move to Trash");
    // Pending keeps the destructive control exposed but inert.
    expect(
      document
        .querySelector<HTMLButtonElement>(
          '[role="alertdialog"] button[data-pending="true"]',
        )
        ?.hasAttribute("disabled"),
    ).toBe(false);
    expect(
      document
        .querySelector<HTMLButtonElement>(
          '[role="alertdialog"] button[data-pending="true"]',
        )
        ?.getAttribute("aria-disabled"),
    ).toBe("true");

    await act(async () => {
      resolveDelete?.({ asset: trashedAsset });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(document.body.textContent).toContain("Trash");
  });

  test("cancels removal without invoking the delete mutation and restores focus", async () => {
    const listCandidateAssets = vi.fn().mockResolvedValue({ assets: [asset] });
    const deleteCandidateAsset = vi.fn();
    Object.defineProperty(window, "unemployed", {
      configurable: true,
      value: {
        jobFinder: {
          listCandidateAssets,
          importCandidateAsset: vi.fn(),
          deleteCandidateAsset,
          restoreCandidateAsset: vi.fn(),
        },
      },
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<SettingsCandidateAssets />);
      await Promise.resolve();
    });
    const removeButton = [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Remove",
    ) as HTMLButtonElement;
    removeButton.focus();

    await act(async () => {
      removeButton.click();
      await Promise.resolve();
    });
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      await Promise.resolve();
    });
    expect(deleteCandidateAsset).not.toHaveBeenCalled();
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    expect(document.activeElement).toBe(removeButton);

    await act(async () => {
      removeButton.click();
      await Promise.resolve();
    });
    const cancelButton = document.querySelector<HTMLButtonElement>(
      '[role="alertdialog"] button',
    );
    expect(cancelButton?.textContent?.trim()).toBe("Cancel");

    await act(async () => {
      cancelButton?.click();
      await Promise.resolve();
    });

    expect(deleteCandidateAsset).not.toHaveBeenCalled();
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    expect(document.activeElement).toBe(removeButton);
  });

  test("top-aligns the three import controls so the helper line cannot lift one", async () => {
    // The three cells are stretched grid items whose own rows are auto-sized,
    // so the leftover height was shared between each cell's label row and its
    // control row. Retention carries a third row of helper text, so it split
    // its slack three ways and floated its select 13px above the two
    // identically sized controls beside it.
    Object.defineProperty(window, "unemployed", {
      configurable: true,
      value: {
        jobFinder: {
          listCandidateAssets: vi.fn().mockResolvedValue({ assets: [] }),
        },
      },
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<SettingsCandidateAssets />);
      await Promise.resolve();
    });

    const labels = [
      "What is this file?",
      "How may Job Finder use it?",
      "How long should it be kept?",
    ].map(
      (text) =>
        [...document.querySelectorAll("label")].find(
          (label) => label.textContent?.trim() === text,
        ) as HTMLLabelElement,
    );

    expect(labels.every(Boolean)).toBe(true);

    const cells = labels.map((label) => label.parentElement);
    const row = cells[0]?.parentElement;

    // One row, three cells, and only the third carries helper text.
    expect(new Set(cells.map((cell) => cell?.parentElement)).size).toBe(1);
    expect(row?.className).toContain("items-start");
    expect(cells[2]?.textContent).toContain(
      "The countdown starts once the file finishes importing.",
    );
    expect(cells[0]?.textContent).not.toContain("Timed retention");
  });
});
