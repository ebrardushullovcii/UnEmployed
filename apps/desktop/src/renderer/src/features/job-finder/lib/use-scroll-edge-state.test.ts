import { describe, expect, test } from "vitest";
import { __testing } from "./use-scroll-edge-state";

const { areEdgeStatesEqual, readScrollEdgeState } = __testing;

function scroller(metrics: {
  clientHeight: number;
  scrollHeight: number;
  scrollTop: number;
}): HTMLElement {
  return metrics as unknown as HTMLElement;
}

describe("readScrollEdgeState", () => {
  test("reports no range when the content fits", () => {
    expect(
      readScrollEdgeState(
        scroller({ clientHeight: 400, scrollHeight: 400, scrollTop: 0 }),
      ),
    ).toEqual({
      canScrollDown: false,
      canScrollUp: false,
      isScrollable: false,
    });
  });

  test("reports only downward range at the top", () => {
    expect(
      readScrollEdgeState(
        scroller({ clientHeight: 400, scrollHeight: 1_200, scrollTop: 0 }),
      ),
    ).toEqual({
      canScrollDown: true,
      canScrollUp: false,
      isScrollable: true,
    });
  });

  test("reports only upward range at the bottom", () => {
    expect(
      readScrollEdgeState(
        scroller({ clientHeight: 400, scrollHeight: 1_200, scrollTop: 800 }),
      ),
    ).toEqual({
      canScrollDown: false,
      canScrollUp: true,
      isScrollable: true,
    });
  });

  test("tolerates a sub-pixel shortfall at the bottom", () => {
    expect(
      readScrollEdgeState(
        scroller({
          clientHeight: 400,
          scrollHeight: 1_200,
          scrollTop: 799.4,
        }),
      ).canScrollDown,
    ).toBe(false);
  });

  test("treats a one-pixel range as unscrollable", () => {
    expect(
      readScrollEdgeState(
        scroller({ clientHeight: 400, scrollHeight: 401, scrollTop: 0 }),
      ).isScrollable,
    ).toBe(false);
  });
});

describe("areEdgeStatesEqual", () => {
  test("collapses every mid-scroll position to one state", () => {
    // The whole point of the hook: scrolling from 100 to 700 in a 1,200px
    // owner changes nothing observable, so it must not render.
    const first = readScrollEdgeState(
      scroller({ clientHeight: 400, scrollHeight: 1_200, scrollTop: 100 }),
    );
    const later = readScrollEdgeState(
      scroller({ clientHeight: 400, scrollHeight: 1_200, scrollTop: 700 }),
    );

    expect(areEdgeStatesEqual(first, later)).toBe(true);
  });

  test("separates a true edge transition", () => {
    const midway = readScrollEdgeState(
      scroller({ clientHeight: 400, scrollHeight: 1_200, scrollTop: 700 }),
    );
    const atEnd = readScrollEdgeState(
      scroller({ clientHeight: 400, scrollHeight: 1_200, scrollTop: 800 }),
    );

    expect(areEdgeStatesEqual(midway, atEnd)).toBe(false);
  });
});
