// @vitest-environment jsdom

import { afterEach, describe, expect, test, vi } from "vitest";
import {
  COPILOT_BOTTOM_OFFSET,
  COPILOT_NAV_SAFE_OFFSET,
  clampCopilotPosition,
  getDefaultCopilotPosition,
  getDraggedCopilotPosition,
  getCopilotPanelDimensions,
  getCopilotViewportInset,
  getProfileCopilotSafeTopOffset,
  parseCopilotPosition,
  resizeCopilotPosition,
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

  test("defaults the collapsed chat flush to the bottom-right safe inset", () => {
    setViewportSize(1024, 720);

    expect(getDefaultCopilotPosition()).toEqual({
      x: 960,
      y: 656,
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

    expect(position).toEqual({ x: 16, y: 244 });
    expect(getCopilotPanelDimensions().expandedHeight).toBe(460);
  });

  test("uses the compact the Assistant limits at desktop widths", () => {
    setViewportSize(1175, 843);

    const compactPanelSizeLimits = {
      maxHeight: 420,
      maxWidth: 340,
    };
    const genericDimensions = getCopilotPanelDimensions(240, 16);
    const compactDimensions = getCopilotPanelDimensions(
      240,
      16,
      compactPanelSizeLimits,
    );

    expect(genericDimensions).toMatchObject({
      expandedHeight: 460,
      expandedWidth: 360,
    });
    expect(compactDimensions).toMatchObject({
      expandedHeight: 420,
      expandedWidth: 340,
    });

    expect(
      clampCopilotPosition({
        x: 2000,
        y: 2000,
        isOpen: true,
        minBottomOffset: 16,
        minTopOffset: 240,
      }),
    ).toEqual({ x: 799, y: 367 });
    expect(
      clampCopilotPosition({
        x: 2000,
        y: 2000,
        isOpen: true,
        minBottomOffset: 16,
        minTopOffset: 240,
        panelSizeLimits: compactPanelSizeLimits,
      }),
    ).toEqual({ x: 819, y: 407 });
  });

  test.each([
    { width: 1175, expectedX: 799 },
    { width: 1280, expectedX: 904 },
    { width: 1440, expectedX: 1064 },
  ])(
    "docks the default panel at $width px without reflow",
    ({ width, expectedX }) => {
      setViewportSize(width, 800);

      expect(getCopilotPanelDimensions(240, 16)).toMatchObject({
        expandedHeight: 460,
        expandedWidth: 360,
      });
      expect(
        clampCopilotPosition({
          x: 0,
          y: 0,
          isOpen: true,
          minBottomOffset: 16,
          minTopOffset: 240,
        }),
      ).toEqual({ x: 16, y: 240 });
      expect(
        clampCopilotPosition({
          x: 2000,
          y: 999,
          isOpen: true,
          minBottomOffset: 16,
          minTopOffset: 240,
        }),
      ).toEqual({ x: expectedX, y: 324 });
    },
  );

  test("uses 12px horizontal insets for a mobile-width panel", () => {
    setViewportSize(375, 800);

    expect(getCopilotViewportInset(375)).toBe(12);
    expect(getCopilotPanelDimensions(240, 16)).toMatchObject({
      expandedHeight: 460,
      expandedWidth: 351,
    });
    expect(
      clampCopilotPosition({
        x: 999,
        y: 999,
        isOpen: true,
        minBottomOffset: 16,
        minTopOffset: 240,
      }),
    ).toEqual({ x: 12, y: 324 });
  });

  test("reserves the compact footer/toast clearance for an open panel", () => {
    setViewportSize(1280, 800);

    const bottomSafeOffset = 124;
    const position = clampCopilotPosition({
      x: 768,
      y: 700,
      isOpen: true,
      minBottomOffset: bottomSafeOffset,
      minTopOffset: 240,
    });
    const dimensions = getCopilotPanelDimensions(240, bottomSafeOffset);

    expect(dimensions.expandedHeight).toBe(436);
    expect(position.y + dimensions.expandedHeight).toBeLessThanOrEqual(
      800 - bottomSafeOffset,
    );
  });

  test("keeps the compact collapsed bubble inside the viewport", () => {
    setViewportSize(1024, 720);

    const position = clampCopilotPosition({
      x: 900,
      y: 900,
      isOpen: false,
      minBottomOffset: COPILOT_BOTTOM_OFFSET,
    });

    expect(position).toEqual({ x: 900, y: 656 });
  });

  test("uses a shell-safe inset that clears the fixed navigation", () => {
    expect(COPILOT_NAV_SAFE_OFFSET).toBeGreaterThanOrEqual(112);
  });

  test("keeps the expanded panel below the Profile section tabs", () => {
    expect(
      getProfileCopilotSafeTopOffset({
        profileTabsBottom: 181,
        shellHeaderBottom: 118,
      }),
    ).toBe(197);
  });

  test("falls back to the shell-safe inset when layout bounds are unavailable", () => {
    expect(
      getProfileCopilotSafeTopOffset({
        profileTabsBottom: Number.NaN,
        shellHeaderBottom: Number.NaN,
      }),
    ).toBe(COPILOT_NAV_SAFE_OFFSET);
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

  test("keeps a compact launcher on the same viewport edges after maximize", () => {
    expect(
      resizeCopilotPosition({
        isOpen: false,
        minBottomOffset: COPILOT_BOTTOM_OFFSET,
        minTopOffset: 112,
        nextViewport: { width: 1920, height: 1033 },
        position: { x: 16, y: 856 },
        previousViewport: { width: 1440, height: 920 },
      }),
    ).toEqual({ x: 16, y: 969 });
  });

  test("keeps a compact launcher on the right edge after the window grows", () => {
    expect(
      resizeCopilotPosition({
        isOpen: false,
        minBottomOffset: COPILOT_BOTTOM_OFFSET,
        minTopOffset: 112,
        nextViewport: { width: 1920, height: 1033 },
        position: { x: 1376, y: 856 },
        previousViewport: { width: 1440, height: 920 },
      }),
    ).toEqual({ x: 1856, y: 969 });
  });

  test("uses compact limits when resizing an open panel", () => {
    const compactPanelSizeLimits = {
      maxHeight: 420,
      maxWidth: 340,
    };

    expect(
      resizeCopilotPosition({
        isOpen: true,
        minBottomOffset: 16,
        minTopOffset: 240,
        nextViewport: { width: 1175, height: 843 },
        panelSizeLimits: compactPanelSizeLimits,
        position: { x: 1040, y: 384 },
        previousViewport: { width: 1440, height: 920 },
      }),
    ).toEqual({ x: 775, y: 307 });

    expect(
      resizeCopilotPosition({
        isOpen: true,
        minBottomOffset: 16,
        minTopOffset: 240,
        nextViewport: { width: 1175, height: 843 },
        position: { x: 944, y: 240 },
        previousViewport: { width: 1440, height: 920 },
      }),
    ).toEqual({ x: 679, y: 240 });
  });

  test("restores viewport metadata when it is present and accepts old positions", () => {
    expect(
      parseCopilotPosition(
        '{"x":120,"y":148,"viewportWidth":1440,"viewportHeight":920}',
      ),
    ).toEqual({
      x: 120,
      y: 148,
      viewportHeight: 920,
      viewportWidth: 1440,
    });
    expect(parseCopilotPosition('{"x":120,"y":148}')).toEqual({
      x: 120,
      y: 148,
    });
  });
});
