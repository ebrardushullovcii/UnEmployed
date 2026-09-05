import { describe, expect, it } from "vitest";

import {
  BOTTOM_RIGHT_DOCK_ORDER,
  BOUNDED_FLOATING_SURFACE_MIN_USABLE_HEIGHT_PX,
  resolveBoundedFloatingSurfacePlacement,
  resolveBottomRightDockPlacement,
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

describe("resolveBottomRightDockPlacement", () => {
  const NOTICE = {
    height: 140,
    id: "notice",
    order: BOTTOM_RIGHT_DOCK_ORDER.notice,
    width: 384,
  };
  // A second transient status surface. The dock holds only these now: the
  // Assistant/Copilot launcher left it entirely and is an ordinary button in
  // each screen's action row.
  const TOAST = { height: 60, id: "toast", order: 1, width: 384 };

  it("stacks two status surfaces instead of painting one over the other", () => {
    // The startup recovery notice was `fixed bottom-4 right-4`, the same
    // corner every other bottom-right surface claimed, and simply covered
    // whatever was already there.
    const placement = resolveBottomRightDockPlacement({
      minTopOffset: 112,
      noCoverRects: [],
      occupants: [TOAST, NOTICE],
      viewport: { height: 920, width: 1440 },
    });

    const notice = placement.slots.find((slot) => slot.id === "notice");
    const toast = placement.slots.find((slot) => slot.id === "toast");

    expect(notice?.bottom).toBe(16);
    // 16 inset + 140 notice + 12 stack gap.
    expect(toast?.bottom).toBe(168);
    expect(toast?.bottom).toBeGreaterThan(notice?.bottom ?? 0);
    expect(notice?.right).toBe(toast?.right);
  });

  it("lifts the whole stack above an action row in its column", () => {
    // REACH-04: at 640px the pill landed on a section's own `Add experience`.
    const placement = resolveBottomRightDockPlacement({
      minTopOffset: 112,
      noCoverRects: [{ bottom: 600, left: 1200, right: 1424, top: 560 }],
      occupants: [NOTICE],
      viewport: { height: 640, width: 1440 },
    });

    const noticeTop = 640 - (placement.slots[0]?.bottom ?? 0) - NOTICE.height;

    expect(noticeTop).toBeLessThanOrEqual(560 - 24);
  });

  it("ignores a row that is nowhere near the dock's column", () => {
    const placement = resolveBottomRightDockPlacement({
      minTopOffset: 112,
      noCoverRects: [{ bottom: 600, left: 0, right: 300, top: 560 }],
      occupants: [NOTICE],
      viewport: { height: 640, width: 1440 },
    });

    expect(placement.slots[0]?.bottom).toBe(16);
  });

  it("reports a stack top at the window edge, never above it", () => {
    // A tall occupant in a short window used to make `stackTop` negative, so a
    // reader bounding its own height against it computed a negative height
    // instead of stopping at the edge.
    const placement = resolveBottomRightDockPlacement({
      minTopOffset: 0,
      noCoverRects: [],
      occupants: [{ height: 900, id: "tall", order: 0, width: 384 }],
      viewport: { height: 400, width: 1440 },
    });

    expect(placement.stackTop).toBe(0);
    expect(placement.stackTop).toBeGreaterThanOrEqual(0);
  });

  it("never lifts the stack past its own ceiling", () => {
    const placement = resolveBottomRightDockPlacement({
      minTopOffset: 112,
      // A row filling the whole window would otherwise push the dock off-screen.
      noCoverRects: [{ bottom: 620, left: 0, right: 1440, top: 0 }],
      occupants: [NOTICE],
      viewport: { height: 640, width: 1440 },
    });

    expect(placement.stackTop).toBeGreaterThanOrEqual(112);
  });

  it("reports the top of the stack so non-occupants can stop above it", () => {
    // The save lane is a right-edge surface whose height ran to the window
    // bottom, straight through this corner.
    const placement = resolveBottomRightDockPlacement({
      minTopOffset: 112,
      noCoverRects: [],
      occupants: [NOTICE, TOAST],
      viewport: { height: 920, width: 1440 },
    });

    // 920 - (16 clearance + 140 + 12 + 60).
    expect(placement.stackTop).toBe(692);
  });
});
