// @vitest-environment jsdom

import { afterEach, describe, expect, test, vi } from "vitest";
import {
  COPILOT_BOTTOM_OFFSET,
  COPILOT_NAV_SAFE_OFFSET,
  clampCopilotPosition,
  getDefaultCopilotPosition,
  getDraggedCopilotPosition,
  getCopilotPanelDimensions,
  parseCopilotPosition,
} from "./profile-copilot-rail-layout";

describe("profile copilot rail layout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function setViewportSize(width: number, height: number) {
    vi.stubGlobal("window", {
      innerWidth: width,
      innerHeight: height,
    });
  }

  test("defaults the collapsed chat to the bottom-left", () => {
    setViewportSize(1024, 720);

    expect(getDefaultCopilotPosition()).toEqual({
      x: 16,
      y: 640,
    });
  });

  test("keeps an open panel fully inside the usable viewport", () => {
    setViewportSize(1024, 720);

    const position = clampCopilotPosition({
      x: -20,
      y: 900,
      isOpen: true,
      minBottomOffset: COPILOT_BOTTOM_OFFSET,
    });

    expect(position).toEqual({ x: 16, y: 240 });
    expect(getCopilotPanelDimensions().expandedHeight).toBe(464);
  });

  test("lets the collapsed bubble move without leaving the viewport", () => {
    setViewportSize(1024, 720);

    const position = clampCopilotPosition({
      x: 900,
      y: 900,
      isOpen: false,
      minBottomOffset: COPILOT_BOTTOM_OFFSET,
    });

    expect(position).toEqual({ x: 688, y: 640 });
  });

  test("uses a shell-safe inset that clears the fixed navigation", () => {
    expect(COPILOT_NAV_SAFE_OFFSET).toBeGreaterThanOrEqual(112);
  });

  test("uses the final pointer coordinate for a fast left-to-right drag", () => {
    expect(
      getDraggedCopilotPosition({
        clientX: 980,
        clientY: 680,
        originX: 320,
        originY: 280,
        startX: 20,
        startY: 20,
      }),
    ).toEqual({
      moved: true,
      position: { x: 680, y: 420 },
    });
  });

  test("parses only finite persisted positions", () => {
    expect(parseCopilotPosition('{"x":120,"y":148}')).toEqual({
      x: 120,
      y: 148,
    });
    expect(parseCopilotPosition('{"x":"120","y":148}')).toBeNull();
    expect(parseCopilotPosition("not-json")).toBeNull();
  });
});
