import { describe, expect, test } from "vitest";
import {
  canNestedPaneConsumeWheel,
  getLockedHeaderWheelTarget,
  getNestedPaneWheelTarget,
  getLockedScreenLayoutHeight,
} from "./locked-screen-layout";

describe("canNestedPaneConsumeWheel", () => {
  test("gives the pane under the pointer first priority while it can move", () => {
    expect(
      canNestedPaneConsumeWheel({
        clientHeight: 400,
        deltaY: 120,
        scrollHeight: 1_200,
        scrollTop: 300,
      }),
    ).toBe(true);
    expect(
      canNestedPaneConsumeWheel({
        clientHeight: 400,
        deltaY: -120,
        scrollHeight: 1_200,
        scrollTop: 300,
      }),
    ).toBe(true);
  });

  test("hands wheel input back at the pane boundary", () => {
    expect(
      canNestedPaneConsumeWheel({
        clientHeight: 400,
        deltaY: 120,
        scrollHeight: 1_200,
        scrollTop: 800,
      }),
    ).toBe(false);
    expect(
      canNestedPaneConsumeWheel({
        clientHeight: 400,
        deltaY: -120,
        scrollHeight: 1_200,
        scrollTop: 0,
      }),
    ).toBe(false);
  });
});

describe("getNestedPaneWheelTarget", () => {
  test("moves the pane under the pointer without requiring focus", () => {
    expect(
      getNestedPaneWheelTarget({
        clientHeight: 400,
        deltaMode: 0,
        deltaY: 120,
        scrollHeight: 1_200,
        scrollTop: 300,
      }),
    ).toBe(420);
  });

  test("normalizes line and page wheel input and clamps to the pane", () => {
    expect(
      getNestedPaneWheelTarget({
        clientHeight: 400,
        deltaMode: 1,
        deltaY: 3,
        scrollHeight: 1_200,
        scrollTop: 300,
      }),
    ).toBe(348);
    expect(
      getNestedPaneWheelTarget({
        clientHeight: 400,
        deltaMode: 2,
        deltaY: 2,
        scrollHeight: 1_200,
        scrollTop: 300,
      }),
    ).toBe(800);
  });

  test("hands input back when the pane has reached its boundary", () => {
    expect(
      getNestedPaneWheelTarget({
        clientHeight: 400,
        deltaMode: 0,
        deltaY: 120,
        scrollHeight: 1_200,
        scrollTop: 800,
      }),
    ).toBeNull();
  });
});

describe("getLockedScreenLayoutHeight", () => {
  test("adds one viewport below a measured header only when a body pane exists", () => {
    expect(getLockedScreenLayoutHeight(704, true)).toBe("calc(100% + 704px)");
    expect(getLockedScreenLayoutHeight(704, false)).toBeUndefined();
    expect(getLockedScreenLayoutHeight(0, true)).toBeUndefined();
  });
});

describe("getLockedHeaderWheelTarget", () => {
  test("moves the wide locked layout header before a nested pane consumes downward wheel input", () => {
    expect(
      getLockedHeaderWheelTarget({
        deltaY: 120,
        scrollTop: 0,
        topHeight: 240,
        viewportWidth: 1440,
      }),
    ).toBe(120);
  });

  test("stops at the header boundary so the next wheel event reaches the nested pane", () => {
    expect(
      getLockedHeaderWheelTarget({
        deltaY: 120,
        scrollTop: 180,
        topHeight: 240,
        viewportWidth: 1440,
      }),
    ).toBe(240);
    expect(
      getLockedHeaderWheelTarget({
        deltaY: 120,
        scrollTop: 240,
        topHeight: 240,
        viewportWidth: 1440,
      }),
    ).toBeNull();
  });

  test("leaves narrow layouts alone and restores the wide header upward", () => {
    expect(
      getLockedHeaderWheelTarget({
        deltaY: 120,
        scrollTop: 0,
        topHeight: 240,
        viewportWidth: 1024,
      }),
    ).toBeNull();
    expect(
      getLockedHeaderWheelTarget({
        deltaY: -120,
        scrollTop: 120,
        topHeight: 240,
        viewportWidth: 1440,
      }),
    ).toBe(0);
    expect(
      getLockedHeaderWheelTarget({
        deltaY: -120,
        scrollTop: 0,
        topHeight: 240,
        viewportWidth: 1440,
      }),
    ).toBeNull();
  });
});
