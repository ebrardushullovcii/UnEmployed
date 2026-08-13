// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { LockedScreenLayout } from "./locked-screen-layout";

describe("LockedScreenLayout pointer-owned scrolling", () => {
  beforeEach(() => {
    class ResizeObserverMock {
      observe() {}
      disconnect() {}
      unobserve() {}
    }

    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test("moves the page header out of the way before scrolling a nested pane", () => {
    vi.stubGlobal("innerWidth", 1440);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      bottom: 200,
      height: 200,
      left: 0,
      right: 100,
      top: 0,
      width: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    const { container, getByTestId } = render(
      <LockedScreenLayout topContent={<div>Find jobs</div>}>
        <div data-locked-pane-scroll-region data-testid="left-pane">
          <span data-testid="left-pane-content">Search filters</span>
        </div>
      </LockedScreenLayout>,
    );
    const outerScroller = container.querySelector<HTMLElement>(
      ".screen-scroll-area",
    );
    const pane = getByTestId("left-pane");

    expect(outerScroller).toBeTruthy();
    Object.defineProperties(pane, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 500 },
    });
    pane.scrollTop = 40;

    getByTestId("left-pane-content").dispatchEvent(
      new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        deltaY: 80,
      }),
    );

    expect(outerScroller?.scrollTop).toBe(80);
    expect(pane.scrollTop).toBe(40);
  });

  test("scrolls the nested pane under the wheel without a prior click", () => {
    vi.stubGlobal("innerWidth", 1440);
    const { getByTestId } = render(
      <LockedScreenLayout topContent={<div>Find jobs</div>}>
        <div data-locked-pane-scroll-region data-testid="left-pane">
          <span data-testid="left-pane-content">Search filters</span>
        </div>
      </LockedScreenLayout>,
    );
    const pane = getByTestId("left-pane");
    const paneContent = getByTestId("left-pane-content");

    Object.defineProperties(pane, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 500 },
    });
    pane.scrollTop = 40;

    const wheelEvent = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaMode: WheelEvent.DOM_DELTA_PIXEL,
      deltaY: 80,
    });
    paneContent.dispatchEvent(wheelEvent);

    expect(wheelEvent.defaultPrevented).toBe(true);
    expect(pane.scrollTop).toBe(120);
  });

  test("hands wheel input to the nested pane at a fractional header boundary", () => {
    vi.stubGlobal("innerWidth", 1440);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      bottom: 177.484,
      height: 177.484,
      left: 0,
      right: 100,
      top: 0,
      width: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    const { container, getByTestId } = render(
      <LockedScreenLayout topContent={<div>Find jobs</div>}>
        <div data-locked-pane-scroll-region data-testid="results-pane">
          <span data-testid="result-card">Software engineer</span>
        </div>
      </LockedScreenLayout>,
    );
    const outerScroller = container.querySelector<HTMLElement>(
      ".screen-scroll-area",
    );
    const pane = getByTestId("results-pane");

    expect(outerScroller).toBeTruthy();
    Object.defineProperties(pane, {
      clientHeight: { configurable: true, value: 688 },
      scrollHeight: { configurable: true, value: 8553 },
    });
    if (outerScroller) {
      outerScroller.scrollTop = 177;
    }
    pane.scrollTop = 0;

    const wheelEvent = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaMode: WheelEvent.DOM_DELTA_PIXEL,
      deltaY: 600,
    });
    getByTestId("result-card").dispatchEvent(wheelEvent);

    expect(wheelEvent.defaultPrevented).toBe(true);
    expect(outerScroller?.scrollTop).toBe(177);
    expect(pane.scrollTop).toBe(600);
  });

  test("restores the wide page header when an upward wheel reaches the pane top", () => {
    vi.stubGlobal("innerWidth", 1440);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      bottom: 200,
      height: 200,
      left: 0,
      right: 100,
      top: 0,
      width: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    const { container, getByTestId } = render(
      <LockedScreenLayout topContent={<div>Find jobs</div>}>
        <div data-locked-pane-scroll-region data-testid="left-pane">
          <span data-testid="left-pane-content">Search filters</span>
        </div>
      </LockedScreenLayout>,
    );
    const outerScroller = container.querySelector<HTMLElement>(
      ".screen-scroll-area",
    );
    const pane = getByTestId("left-pane");
    Object.defineProperties(pane, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 500 },
    });
    if (outerScroller) {
      outerScroller.scrollTop = 200;
    }
    pane.scrollTop = 0;

    const wheelEvent = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: -80,
    });
    getByTestId("left-pane-content").dispatchEvent(wheelEvent);

    expect(wheelEvent.defaultPrevented).toBe(true);
    expect(outerScroller?.scrollTop).toBe(120);
    expect(pane.scrollTop).toBe(0);
  });

  test("leaves downward input unblocked at the pane and page bottom", () => {
    vi.stubGlobal("innerWidth", 1440);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      bottom: 200,
      height: 200,
      left: 0,
      right: 100,
      top: 0,
      width: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    const { container, getByTestId } = render(
      <LockedScreenLayout topContent={<div>Find jobs</div>}>
        <div data-locked-pane-scroll-region data-testid="left-pane">
          <span data-testid="left-pane-content">Search filters</span>
        </div>
      </LockedScreenLayout>,
    );
    const outerScroller = container.querySelector<HTMLElement>(
      ".screen-scroll-area",
    );
    const pane = getByTestId("left-pane");
    Object.defineProperties(pane, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 500 },
    });
    if (outerScroller) {
      outerScroller.scrollTop = 200;
    }
    pane.scrollTop = 400;

    const wheelEvent = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: 80,
    });
    getByTestId("left-pane-content").dispatchEvent(wheelEvent);

    expect(wheelEvent.defaultPrevented).toBe(false);
    expect(outerScroller?.scrollTop).toBe(200);
    expect(pane.scrollTop).toBe(400);
  });

  test.each([
    ["control", { ctrlKey: true }],
    ["command", { metaKey: true }],
  ])("does not block %s-wheel browser zoom", (_label, modifier) => {
    vi.stubGlobal("innerWidth", 1440);
    const { container, getByTestId } = render(
      <LockedScreenLayout topContent={<div>Find jobs</div>}>
        <div data-locked-pane-scroll-region data-testid="left-pane">
          <span data-testid="left-pane-content">Search filters</span>
        </div>
      </LockedScreenLayout>,
    );
    const outerScroller = container.querySelector<HTMLElement>(
      ".screen-scroll-area",
    );
    const pane = getByTestId("left-pane");
    Object.defineProperties(pane, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 500 },
    });
    pane.scrollTop = 40;

    const wheelEvent = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: 80,
      ...modifier,
    });
    getByTestId("left-pane-content").dispatchEvent(wheelEvent);

    expect(wheelEvent.defaultPrevented).toBe(false);
    expect(outerScroller?.scrollTop).toBe(0);
    expect(pane.scrollTop).toBe(40);
  });

  test("leaves narrow layouts to normal browser scrolling", () => {
    vi.stubGlobal("innerWidth", 1024);
    const { getByTestId } = render(
      <LockedScreenLayout topContent={<div>Find jobs</div>}>
        <div data-locked-pane-scroll-region data-testid="left-pane">
          <span data-testid="left-pane-content">Search filters</span>
        </div>
      </LockedScreenLayout>,
    );
    const pane = getByTestId("left-pane");
    Object.defineProperties(pane, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 500 },
    });
    pane.scrollTop = 40;
    const wheelEvent = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: 80,
    });

    getByTestId("left-pane-content").dispatchEvent(wheelEvent);

    expect(wheelEvent.defaultPrevented).toBe(false);
    expect(pane.scrollTop).toBe(40);
  });
});
