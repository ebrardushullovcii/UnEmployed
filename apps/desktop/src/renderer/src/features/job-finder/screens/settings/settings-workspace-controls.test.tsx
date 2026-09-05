// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, test, vi } from "vitest";
import { SettingsWorkspaceControls } from "./settings-workspace-controls";

describe("SettingsWorkspaceControls", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }

    document.body.replaceChildren();
    container = null;
    root = null;
    vi.clearAllMocks();
  });

  function renderControls(onResetWorkspace = vi.fn()) {
    container = document.createElement("div");
    container.id = "root";
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root?.render(
        <SettingsWorkspaceControls
          isWorkspaceResetPending={false}
          onResetWorkspace={onResetWorkspace}
        />,
      );
    });

    return onResetWorkspace;
  }

  test("requires an explicit, clearly labeled confirmation before resetting", () => {
    const onResetWorkspace = renderControls();
    const resetEntryButton = [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Reset everything",
    );

    expect(resetEntryButton).toBeDefined();

    act(() => {
      resetEntryButton?.click();
    });

    const dialog = document.querySelector('[role="dialog"]');
    const confirmButton = [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Reset workspace",
    );

    expect(dialog?.textContent).toContain("This cannot be undone.");
    const descriptionId = dialog?.getAttribute("aria-describedby");
    expect(descriptionId).toBeTruthy();
    expect(document.getElementById(descriptionId ?? "")?.textContent).toContain(
      "This permanently deletes your profile",
    );
    expect(confirmButton).toBeDefined();
    expect(onResetWorkspace).not.toHaveBeenCalled();

    act(() => {
      confirmButton?.click();
    });

    expect(onResetWorkspace).toHaveBeenCalledOnce();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  test("cancels without invoking the destructive action", () => {
    const onResetWorkspace = renderControls();
    const resetEntryButton = [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Reset everything",
    );

    act(() => {
      resetEntryButton?.click();
    });

    const cancelButton = [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Cancel",
    );

    act(() => {
      cancelButton?.click();
    });

    expect(onResetWorkspace).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});
