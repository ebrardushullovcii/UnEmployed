// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProfileListEditor } from "./profile-list-editor";

describe("ProfileListEditor", () => {
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

    root = null;
    container?.remove();
    container = null;
    vi.clearAllMocks();
  });

  function renderEditor(props?: {
    displayMode?: "chips" | "rows";
    values?: readonly string[];
  }) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root?.render(
        <ProfileListEditor
          {...(props?.displayMode ? { displayMode: props.displayMode } : {})}
          label="Skills"
          onChange={vi.fn()}
          placeholder="Add a skill"
          values={props?.values ?? []}
        />,
      );
    });
  }

  it("rests on the neutral panel border instead of an active accent", () => {
    renderEditor();

    const section = container?.querySelector("section");
    expect(section?.className).toContain("border-(--surface-panel-border)");
    expect(section?.className).not.toContain("-active-soft");
  });

  it("keeps the value tray mounted while empty so adding items cannot shift the layout", () => {
    renderEditor();

    const tray = [...(container?.querySelectorAll("section > div") ?? [])].find(
      (element) => element.className.includes("min-h-"),
    );
    expect(tray).toBeDefined();
    expect(tray?.textContent).toContain("No items added yet.");
    expect(tray?.querySelector("p")?.className).toContain("m-auto");
  });

  it("collapses the empty chips tray to roughly one control height", () => {
    renderEditor();

    const tray = [...(container?.querySelectorAll("section > div") ?? [])].find(
      (element) => element.className.includes("min-h-"),
    );
    expect(tray?.className).toContain("min-h-14");
    expect(tray?.className).not.toContain("min-h-[8.6rem]");
    expect(tray?.className).not.toContain("8.6rem");
  });

  it("collapses the empty rows tray instead of reserving the tall list height", () => {
    renderEditor({ displayMode: "rows" });

    const tray = [...(container?.querySelectorAll("section > div") ?? [])].find(
      (element) => element.className.includes("min-h-"),
    );
    expect(tray?.textContent).toContain("No items added yet.");
    expect(tray?.className).toContain("min-h-14");
    expect(tray?.className).not.toContain("min-h-46");
  });

  it("keeps full scrollable sizing once chips are populated", () => {
    renderEditor({ values: ["Figma", "React"] });

    const tray = [...(container?.querySelectorAll("section > div") ?? [])].find(
      (element) => element.className.includes("min-h-"),
    );
    expect(tray?.textContent).toContain("Figma");
    expect(tray?.textContent).not.toContain("No items added yet.");
    expect(tray?.className).toContain("min-h-[8.6rem]");
    expect(tray?.className).toContain("max-h-[8.6rem]");
  });

  it("keeps full scrollable sizing once rows are populated", () => {
    renderEditor({ displayMode: "rows", values: ["Figma", "React"] });

    const tray = [...(container?.querySelectorAll("section > div") ?? [])].find(
      (element) => element.className.includes("min-h-"),
    );
    expect(tray?.className).toContain("min-h-46");
    expect(tray?.className).toContain("max-h-46");
  });
});
