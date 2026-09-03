import { describe, expect, it } from "vitest";

import {
  BOUNDED_FLOATING_SURFACE_MIN_USABLE_HEIGHT_PX,
  resolveBoundedFloatingSurfacePlacement,
} from "./bounded-floating-surface";

/**
 * The sidebar More menu's real geometry: the trigger sits low in the sidebar,
 * so the space under it shrinks fast as the window gets shorter.
 */
function moreMenuAnchor(triggerBottom: number) {
  return {
    bottom: triggerBottom,
    left: 16,
    right: 264,
    top: triggerBottom - 40,
  };
}

describe("bounded floating surface placement", () => {
  it("stays below the trigger when the content genuinely fits there", () => {
    const placement = resolveBoundedFloatingSurfacePlacement({
      anchor: moreMenuAnchor(391),
      desiredHeight: 440,
      preferredWidth: 264,
      viewport: { height: 920, width: 1440 },
    });

    expect(placement.side).toBe("bottom");
    expect(placement.top).toBe(395);
    expect(placement.maxHeight).toBe(517);
    expect(placement.width).toBe(264);
  });

  it("flips above the trigger instead of squeezing into the space below", () => {
    // The reported defect: anchored at y=391 in a 640px window the menu took
    // 241px and showed 2 of 7 destinations while 391px sat unused above it.
    const placement = resolveBoundedFloatingSurfacePlacement({
      anchor: moreMenuAnchor(391),
      desiredHeight: 440,
      preferredWidth: 264,
      viewport: { height: 640, width: 1440 },
    });

    expect(placement.side).toBe("top");
    expect(placement.maxHeight).toBe(339);
    expect(placement.maxHeight).toBeGreaterThan(640 - 391 - 12);
    expect(placement.top).toBeGreaterThanOrEqual(8);
    expect(placement.top + placement.maxHeight).toBeLessThanOrEqual(391 - 4);
  });

  it("measures the flipped side from the trigger's top edge, not the window's", () => {
    // A wide + short window is where an off-by-one-edge would show: the space
    // above the trigger is `anchor.top - gap - margin`, not the whole window
    // and not the space below. 1440x640 with the sidebar trigger at y=354:
    // 342px above, 234px below.
    const anchor = { bottom: 390, left: 16, right: 264, top: 354 };
    const placement = resolveBoundedFloatingSurfacePlacement({
      anchor,
      desiredHeight: 440,
      preferredWidth: 264,
      viewport: { height: 640, width: 1440 },
    });

    expect(placement.side).toBe("top");
    expect(placement.maxHeight).toBe(anchor.top - 4 - 8);
    expect(placement.maxHeight).toBe(342);
    // Painted inside the window on both edges, and never over its own trigger.
    expect(placement.top).toBe(8);
    expect(placement.top + placement.maxHeight).toBe(anchor.top - 4);
    expect(placement.top + placement.maxHeight).toBeLessThanOrEqual(640 - 8);
    // The bound is real, so the surface must scroll internally rather than
    // letting its content grow past the box it was given.
    expect(placement.maxHeight).toBeLessThan(440);
  });

  it("never paints outside the window at the shortest supported heights", () => {
    for (const height of [560, 600, 640, 720]) {
      for (const triggerBottom of [120, 391, height - 40]) {
        const placement = resolveBoundedFloatingSurfacePlacement({
          anchor: moreMenuAnchor(triggerBottom),
          desiredHeight: 440,
          preferredWidth: 264,
          viewport: { height, width: 1440 },
        });
        expect(placement.top).toBeGreaterThanOrEqual(8);
        expect(placement.top + placement.maxHeight).toBeLessThanOrEqual(height);
        expect(placement.maxHeight).toBeGreaterThan(0);
      }
    }
  });

  it("takes the roomier side when neither side is usable", () => {
    const placement = resolveBoundedFloatingSurfacePlacement({
      anchor: moreMenuAnchor(180),
      desiredHeight: 440,
      preferredWidth: 264,
      viewport: { height: 300, width: 1440 },
    });

    // 112px below, 128px above: both under the usable floor, so the solver
    // takes the larger side and hands back a scrollable box, not a sliver.
    expect(placement.availableHeight).toBeLessThan(
      BOUNDED_FLOATING_SURFACE_MIN_USABLE_HEIGHT_PX,
    );
    expect(placement.side).toBe("top");
    expect(placement.maxHeight).toBeGreaterThan(0);
    expect(placement.top).toBeGreaterThanOrEqual(8);
  });

  it("shifts back inside the viewport instead of overflowing horizontally", () => {
    const placement = resolveBoundedFloatingSurfacePlacement({
      alignment: "end",
      anchor: { bottom: 120, left: 1000, right: 1016, top: 80 },
      preferredWidth: 264,
      viewport: { height: 768, width: 1024 },
    });

    expect(placement.left).toBeGreaterThanOrEqual(8);
    expect(placement.left + placement.width).toBeLessThanOrEqual(1024 - 8);
  });

  it("narrows only when the viewport itself is narrower than the surface", () => {
    const placement = resolveBoundedFloatingSurfacePlacement({
      anchor: { bottom: 60, left: 4, right: 40, top: 20 },
      minWidth: 96,
      preferredWidth: 264,
      viewport: { height: 700, width: 200 },
    });

    expect(placement.width).toBe(184);
    expect(placement.left).toBe(8);
  });
});
