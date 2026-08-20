// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/react";
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

  test("transfers the residual of one large wheel delta after collapsing the header", () => {
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
    Object.defineProperties(pane, {
      clientHeight: { configurable: true, value: 688 },
      scrollHeight: { configurable: true, value: 8553 },
    });
    pane.scrollTop = 0;

    const wheelEvent = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: 600,
    });
    getByTestId("result-card").dispatchEvent(wheelEvent);

    expect(wheelEvent.defaultPrevented).toBe(true);
    expect(outerScroller?.scrollTop).toBe(177.484);
    expect(pane.scrollTop).toBeCloseTo(422.516, 6);
  });

  test("normalizes line-mode wheel input once before handing it to the header", () => {
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
    pane.scrollTop = 40;

    const wheelEvent = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaMode: WheelEvent.DOM_DELTA_LINE,
      deltaY: 3,
    });
    getByTestId("left-pane-content").dispatchEvent(wheelEvent);

    expect(wheelEvent.defaultPrevented).toBe(true);
    expect(outerScroller?.scrollTop).toBe(48);
    expect(pane.scrollTop).toBe(40);
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

  test("chains the pane start back to the header and releases the pane end", () => {
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
      outerScroller.scrollTop = 120;
    }
    pane.scrollTop = 0;

    const startEvent = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: -80,
    });
    getByTestId("left-pane-content").dispatchEvent(startEvent);

    expect(startEvent.defaultPrevented).toBe(true);
    expect(outerScroller?.scrollTop).toBe(40);
    expect(pane.scrollTop).toBe(0);

    if (outerScroller) {
      outerScroller.scrollTop = 200;
    }
    pane.scrollTop = 400;
    const endEvent = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: 80,
    });
    getByTestId("left-pane-content").dispatchEvent(endEvent);

    expect(endEvent.defaultPrevented).toBe(false);
    expect(outerScroller?.scrollTop).toBe(200);
    expect(pane.scrollTop).toBe(400);
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

  test("leaves Space activation with interactive descendants", () => {
    vi.stubGlobal("innerWidth", 1440);
    const onClick = vi.fn();
    const { getByTestId } = render(
      <LockedScreenLayout topContent={<div>Find jobs</div>}>
        <button data-testid="action" onClick={onClick} type="button">
          <span>Open details</span>
        </button>
      </LockedScreenLayout>,
    );
    const action = getByTestId("action");
    action.focus();

    expect(fireEvent.keyDown(action, { key: " " })).toBe(true);
    fireEvent.click(action);

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test("chains PageDown from a pane bottom to the collapsed outer owner", () => {
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
    Object.defineProperties(outerScroller as HTMLElement, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 1_000 },
    });
    Object.defineProperties(pane, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 500 },
    });
    if (outerScroller) {
      outerScroller.scrollTop = 200;
    }
    pane.scrollTop = 400;

    const keyEvent = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "PageDown",
    });
    getByTestId("left-pane-content").dispatchEvent(keyEvent);

    expect(keyEvent.defaultPrevented).toBe(true);
    expect(outerScroller?.scrollTop).toBe(300);
    expect(pane.scrollTop).toBe(400);
  });

  test("chains ArrowUp from a pane top back through the collapsed header", () => {
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
      outerScroller.scrollTop = 240;
    }
    pane.scrollTop = 0;

    const keyEvent = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "ArrowUp",
    });
    getByTestId("left-pane-content").dispatchEvent(keyEvent);

    expect(keyEvent.defaultPrevented).toBe(true);
    expect(outerScroller?.scrollTop).toBe(200);
    expect(pane.scrollTop).toBe(0);
  });
});
