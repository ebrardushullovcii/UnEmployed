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
        <div
          data-locked-pane-scroll-region
          data-testid="left-pane"
          tabIndex={0}
        >
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

    pane.focus();
    const keyEvent = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "PageDown",
    });
    pane.dispatchEvent(keyEvent);

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
        <div
          data-locked-pane-scroll-region
          data-testid="left-pane"
          tabIndex={0}
        >
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

    pane.focus();
    const keyEvent = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "ArrowUp",
    });
    pane.dispatchEvent(keyEvent);

    expect(keyEvent.defaultPrevented).toBe(true);
    expect(outerScroller?.scrollTop).toBe(200);
    expect(pane.scrollTop).toBe(0);
  });

  test("leaves result-list arrow navigation with a focused pane descendant", () => {
    vi.stubGlobal("innerWidth", 1440);
    const onKeyDown = vi.fn();
    const { getByTestId } = render(
      <LockedScreenLayout topContent={<div>Find jobs</div>}>
        <div
          data-locked-pane-scroll-region
          data-testid="results-pane"
          tabIndex={0}
        >
          <button data-testid="result" onKeyDown={onKeyDown} type="button">
            Software engineer
          </button>
        </div>
      </LockedScreenLayout>,
    );
    const pane = getByTestId("results-pane");
    const result = getByTestId("result");
    Object.defineProperties(pane, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 500 },
    });
    pane.scrollTop = 40;
    result.focus();

    const keyEvent = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "ArrowDown",
    });
    result.dispatchEvent(keyEvent);

    expect(keyEvent.defaultPrevented).toBe(false);
    expect(onKeyDown).toHaveBeenCalledTimes(1);
    expect(pane.scrollTop).toBe(40);
  });

  test.each([
    ["Home", 160, 0],
    ["End", 160, 400],
  ])(
    "handles %s from the focused pane",
    (key, initialPaneTop, expectedPaneTop) => {
      vi.stubGlobal("innerWidth", 1440);
      const { getByTestId } = render(
        <LockedScreenLayout topContent={<div>Find jobs</div>}>
          <div
            data-locked-pane-scroll-region
            data-testid="left-pane"
            tabIndex={0}
          >
            Search filters
          </div>
        </LockedScreenLayout>,
      );
      const pane = getByTestId("left-pane");
      Object.defineProperties(pane, {
        clientHeight: { configurable: true, value: 100 },
        scrollHeight: { configurable: true, value: 500 },
      });
      pane.scrollTop = initialPaneTop;
      pane.focus();

      const keyEvent = new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key,
      });
      pane.dispatchEvent(keyEvent);

      expect(keyEvent.defaultPrevented).toBe(true);
      expect(pane.scrollTop).toBe(expectedPaneTop);
    },
  );

  test("leaves focused-pane keyboard scrolling native in compact layouts", () => {
    vi.stubGlobal("innerWidth", 1024);
    const { getByTestId } = render(
      <LockedScreenLayout topContent={<div>Find jobs</div>}>
        <div
          data-locked-pane-scroll-region
          data-testid="left-pane"
          tabIndex={0}
        >
          Search filters
        </div>
      </LockedScreenLayout>,
    );
    const pane = getByTestId("left-pane");
    Object.defineProperties(pane, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 500 },
    });
    pane.scrollTop = 40;
    pane.focus();

    const keyEvent = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "PageDown",
    });
    pane.dispatchEvent(keyEvent);

    expect(keyEvent.defaultPrevented).toBe(false);
    expect(pane.scrollTop).toBe(40);
  });
});

describe("LockedScreenLayout inner scroller ownership", () => {
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

  function stubHeaderGeometry(height: number) {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      bottom: height,
      height,
      left: 0,
      right: 100,
      top: 0,
      width: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
  }

  function stubScrollMetrics(
    element: Element,
    metrics: { clientHeight: number; scrollHeight: number },
  ) {
    Object.defineProperties(element, {
      clientHeight: { configurable: true, value: metrics.clientHeight },
      scrollHeight: { configurable: true, value: metrics.scrollHeight },
    });
  }

  function dispatchWheel(target: Element, init?: WheelEventInit) {
    const wheelEvent = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      ...init,
    });
    target.dispatchEvent(wheelEvent);
    return wheelEvent;
  }

  function renderKanbanBoard() {
    return render(
      <LockedScreenLayout topContent={<div>Find jobs</div>}>
        <div data-locked-pane-scroll-region data-testid="board-pane">
          <div data-testid="column-list" style={{ overflowY: "auto" }}>
            <span data-testid="kanban-card">Phone screen</span>
          </div>
        </div>
      </LockedScreenLayout>,
    );
  }

  test("gives a kanban-style inner scroller ownership before its marked pane", () => {
    vi.stubGlobal("innerWidth", 1440);
    stubHeaderGeometry(200);
    const { container, getByTestId } = renderKanbanBoard();

    const outerScroller = container.querySelector<HTMLElement>(
      ".screen-scroll-area",
    );
    const boardPane = getByTestId("board-pane");
    const columnList = getByTestId("column-list");
    if (outerScroller) {
      outerScroller.scrollTop = 200;
    }
    stubScrollMetrics(boardPane, {
      clientHeight: 400,
      scrollHeight: 1_200,
    });
    stubScrollMetrics(columnList, {
      clientHeight: 300,
      scrollHeight: 900,
    });
    boardPane.scrollTop = 30;
    columnList.scrollTop = 50;

    const wheelEvent = dispatchWheel(getByTestId("kanban-card"), {
      deltaY: 80,
    });

    expect(wheelEvent.defaultPrevented).toBe(true);
    expect(columnList.scrollTop).toBe(130);
    expect(boardPane.scrollTop).toBe(30);
    expect(outerScroller?.scrollTop).toBe(200);
  });

  test("scrolls a CV preview well before its marked pane at both boundaries", () => {
    vi.stubGlobal("innerWidth", 1440);
    stubHeaderGeometry(200);
    const { container, getByTestId } = render(
      <LockedScreenLayout topContent={<div>Find jobs</div>}>
        <div data-locked-pane-scroll-region data-testid="cv-pane">
          <pre data-testid="cv-preview" style={{ overflowY: "auto" }}>
            Senior frontend engineer with ten years of experience.
          </pre>
        </div>
      </LockedScreenLayout>,
    );

    const outerScroller = container.querySelector<HTMLElement>(
      ".screen-scroll-area",
    );
    const cvPane = getByTestId("cv-pane");
    const cvPreview = getByTestId("cv-preview");
    if (outerScroller) {
      outerScroller.scrollTop = 200;
    }
    stubScrollMetrics(cvPane, { clientHeight: 600, scrollHeight: 3_000 });
    stubScrollMetrics(cvPreview, { clientHeight: 500, scrollHeight: 2_500 });

    cvPane.scrollTop = 100;
    cvPreview.scrollTop = 2_000;

    const bottomEvent = dispatchWheel(getByTestId("cv-preview"), {
      deltaY: 90,
    });

    expect(bottomEvent.defaultPrevented).toBe(true);
    expect(cvPreview.scrollTop).toBe(2_000);
    expect(cvPane.scrollTop).toBe(190);
    expect(outerScroller?.scrollTop).toBe(200);

    cvPane.scrollTop = 100;
    cvPreview.scrollTop = 30;

    const topEvent = dispatchWheel(getByTestId("cv-preview"), {
      deltaY: -90,
    });

    expect(topEvent.defaultPrevented).toBe(true);
    expect(cvPreview.scrollTop).toBe(0);
    expect(cvPane.scrollTop).toBe(40);
    expect(outerScroller?.scrollTop).toBe(200);
  });

  test("hands a maxed deepest scroller back through each ancestor owner", () => {
    vi.stubGlobal("innerWidth", 1440);
    stubHeaderGeometry(200);
    const { container, getByTestId } = render(
      <LockedScreenLayout topContent={<div>Find jobs</div>}>
        <div data-locked-pane-scroll-region data-testid="board-pane">
          <div data-testid="column-list" style={{ overflowY: "auto" }}>
            <div data-testid="result-card">
              <div data-testid="card-details" style={{ overflowY: "auto" }}>
                <span data-testid="detail-line">Led migration</span>
              </div>
            </div>
          </div>
        </div>
      </LockedScreenLayout>,
    );

    const outerScroller = container.querySelector<HTMLElement>(
      ".screen-scroll-area",
    );
    const boardPane = getByTestId("board-pane");
    const columnList = getByTestId("column-list");
    const cardDetails = getByTestId("card-details");
    if (outerScroller) {
      outerScroller.scrollTop = 200;
    }
    stubScrollMetrics(boardPane, {
      clientHeight: 400,
      scrollHeight: 1_600,
    });
    stubScrollMetrics(columnList, {
      clientHeight: 300,
      scrollHeight: 900,
    });
    stubScrollMetrics(cardDetails, {
      clientHeight: 200,
      scrollHeight: 800,
    });
    boardPane.scrollTop = 50;
    columnList.scrollTop = 100;
    cardDetails.scrollTop = 600;

    const detailEvent = dispatchWheel(getByTestId("detail-line"), {
      deltaY: 80,
    });

    expect(detailEvent.defaultPrevented).toBe(true);
    expect(cardDetails.scrollTop).toBe(600);
    expect(columnList.scrollTop).toBe(180);
    expect(boardPane.scrollTop).toBe(50);
    expect(outerScroller?.scrollTop).toBe(200);

    columnList.scrollTop = 600;
    const columnEvent = dispatchWheel(getByTestId("detail-line"), {
      deltaY: 80,
    });

    expect(columnEvent.defaultPrevented).toBe(true);
    expect(cardDetails.scrollTop).toBe(600);
    expect(columnList.scrollTop).toBe(600);
    expect(boardPane.scrollTop).toBe(130);
    expect(outerScroller?.scrollTop).toBe(200);
  });

  test("restores upward through a topped inner scroller, its pane, then the header", () => {
    vi.stubGlobal("innerWidth", 1440);
    stubHeaderGeometry(200);
    const { container, getByTestId } = render(
      <LockedScreenLayout topContent={<div>Find jobs</div>}>
        <div data-locked-pane-scroll-region data-testid="board-pane">
          <div data-testid="column-list" style={{ overflowY: "auto" }}>
            <div data-testid="result-card">
              <div data-testid="card-details" style={{ overflowY: "auto" }}>
                <span data-testid="detail-line">Led migration</span>
              </div>
            </div>
          </div>
        </div>
      </LockedScreenLayout>,
    );

    const outerScroller = container.querySelector<HTMLElement>(
      ".screen-scroll-area",
    );
    const boardPane = getByTestId("board-pane");
    const columnList = getByTestId("column-list");
    const cardDetails = getByTestId("card-details");
    stubScrollMetrics(boardPane, {
      clientHeight: 400,
      scrollHeight: 1_600,
    });
    stubScrollMetrics(columnList, {
      clientHeight: 300,
      scrollHeight: 900,
    });
    stubScrollMetrics(cardDetails, {
      clientHeight: 200,
      scrollHeight: 800,
    });

    boardPane.scrollTop = 260;
    columnList.scrollTop = 120;
    cardDetails.scrollTop = 0;
    if (outerScroller) {
      outerScroller.scrollTop = 200;
    }

    const detailEvent = dispatchWheel(getByTestId("detail-line"), {
      deltaY: -80,
    });

    expect(detailEvent.defaultPrevented).toBe(true);
    expect(cardDetails.scrollTop).toBe(0);
    expect(columnList.scrollTop).toBe(40);
    expect(boardPane.scrollTop).toBe(260);

    columnList.scrollTop = 0;
    boardPane.scrollTop = 260;
    if (outerScroller) {
      outerScroller.scrollTop = 200;
    }
    const columnEvent = dispatchWheel(getByTestId("detail-line"), {
      deltaY: -80,
    });

    expect(columnEvent.defaultPrevented).toBe(true);
    expect(cardDetails.scrollTop).toBe(0);
    expect(columnList.scrollTop).toBe(0);
    expect(boardPane.scrollTop).toBe(180);

    boardPane.scrollTop = 0;
    if (outerScroller) {
      outerScroller.scrollTop = 200;
    }
    const headerEvent = dispatchWheel(getByTestId("detail-line"), {
      deltaY: -80,
    });

    expect(headerEvent.defaultPrevented).toBe(true);
    expect(cardDetails.scrollTop).toBe(0);
    expect(columnList.scrollTop).toBe(0);
    expect(boardPane.scrollTop).toBe(0);
    expect(outerScroller?.scrollTop).toBe(120);
  });

  test("absorbs a fractional momentum burst across inner and marked owners", () => {
    vi.stubGlobal("innerWidth", 1440);
    stubHeaderGeometry(200);
    const { container, getByTestId } = renderKanbanBoard();

    const outerScroller = container.querySelector<HTMLElement>(
      ".screen-scroll-area",
    );
    const boardPane = getByTestId("board-pane");
    const columnList = getByTestId("column-list");
    if (outerScroller) {
      outerScroller.scrollTop = 200;
    }
    stubScrollMetrics(boardPane, {
      clientHeight: 400,
      scrollHeight: 1_600,
    });
    stubScrollMetrics(columnList, {
      clientHeight: 300,
      scrollHeight: 900,
    });
    boardPane.scrollTop = 20;
    columnList.scrollTop = 480;

    const firstBurst = dispatchWheel(getByTestId("kanban-card"), {
      deltaY: 55.5,
    });
    expect(firstBurst.defaultPrevented).toBe(true);
    expect(columnList.scrollTop).toBeCloseTo(535.5, 6);
    expect(boardPane.scrollTop).toBe(20);

    const secondBurst = dispatchWheel(getByTestId("kanban-card"), {
      deltaY: 64.25,
    });
    expect(secondBurst.defaultPrevented).toBe(true);
    expect(columnList.scrollTop).toBeCloseTo(599.75, 6);
    expect(boardPane.scrollTop).toBe(20);

    const thirdBurst = dispatchWheel(getByTestId("kanban-card"), {
      deltaY: 48.75,
    });
    expect(thirdBurst.defaultPrevented).toBe(true);
    expect(columnList.scrollTop).toBeCloseTo(599.75, 6);
    expect(boardPane.scrollTop).toBeCloseTo(68.75, 6);
    expect(outerScroller?.scrollTop).toBe(200);

    columnList.scrollTop = 0;
    const reverseBurst = dispatchWheel(getByTestId("kanban-card"), {
      deltaY: -12.5,
    });
    expect(reverseBurst.defaultPrevented).toBe(true);
    expect(columnList.scrollTop).toBe(0);
    expect(boardPane.scrollTop).toBeCloseTo(56.25, 6);
  });

  test.each([
    ["line", WheelEvent.DOM_DELTA_LINE, 2, 132],
    ["page", WheelEvent.DOM_DELTA_PAGE, 1, 400],
  ])(
    "normalizes %s-mode deltas against the inner scroller metrics",
    (_mode, deltaMode, deltaY, expectedColumnTop) => {
      vi.stubGlobal("innerWidth", 1440);
      const { getByTestId } = renderKanbanBoard();

      const boardPane = getByTestId("board-pane");
      const columnList = getByTestId("column-list");
      stubScrollMetrics(boardPane, {
        clientHeight: 400,
        scrollHeight: 1_200,
      });
      stubScrollMetrics(columnList, {
        clientHeight: 300,
        scrollHeight: 900,
      });
      boardPane.scrollTop = 0;
      columnList.scrollTop = 100;

      const wheelEvent = dispatchWheel(getByTestId("kanban-card"), {
        deltaMode,
        deltaY,
      });

      expect(wheelEvent.defaultPrevented).toBe(true);
      expect(columnList.scrollTop).toBe(expectedColumnTop);
      expect(boardPane.scrollTop).toBe(0);
    },
  );

  test.each([
    ["control", { ctrlKey: true }],
    ["command", { metaKey: true }],
  ])("does not intercept %s-wheel zoom over an inner scroller", (_label, modifier) => {
    vi.stubGlobal("innerWidth", 1440);
    stubHeaderGeometry(200);
    const { container, getByTestId } = renderKanbanBoard();

    const outerScroller = container.querySelector<HTMLElement>(
      ".screen-scroll-area",
    );
    const boardPane = getByTestId("board-pane");
    const columnList = getByTestId("column-list");
    stubScrollMetrics(boardPane, {
      clientHeight: 400,
      scrollHeight: 1_200,
    });
    stubScrollMetrics(columnList, {
      clientHeight: 300,
      scrollHeight: 900,
    });
    boardPane.scrollTop = 30;
    columnList.scrollTop = 50;

    const wheelEvent = dispatchWheel(getByTestId("kanban-card"), {
      deltaY: 80,
      ...modifier,
    });

    expect(wheelEvent.defaultPrevented).toBe(false);
    expect(columnList.scrollTop).toBe(50);
    expect(boardPane.scrollTop).toBe(30);
    expect(outerScroller?.scrollTop).toBe(0);
  });

  test("leaves inner scrollers to native scrolling below the breakpoint", () => {
    vi.stubGlobal("innerWidth", 1024);
    const { getByTestId } = renderKanbanBoard();

    const boardPane = getByTestId("board-pane");
    const columnList = getByTestId("column-list");
    stubScrollMetrics(boardPane, {
      clientHeight: 400,
      scrollHeight: 1_200,
    });
    stubScrollMetrics(columnList, {
      clientHeight: 300,
      scrollHeight: 900,
    });
    boardPane.scrollTop = 30;
    columnList.scrollTop = 50;

    const wheelEvent = dispatchWheel(getByTestId("kanban-card"), {
      deltaY: 80,
    });

    expect(wheelEvent.defaultPrevented).toBe(false);
    expect(columnList.scrollTop).toBe(50);
    expect(boardPane.scrollTop).toBe(30);
  });

  test.each([
    ["textarea", "cover-note"],
    ["select", "locale-picker"],
  ])("leaves %s wheel input with the browser inside a marked pane", (_label, controlTestId) => {
    vi.stubGlobal("innerWidth", 1440);
    stubHeaderGeometry(200);
    const { container, getByTestId } = render(
      <LockedScreenLayout topContent={<div>Find jobs</div>}>
        <div data-locked-pane-scroll-region data-testid="notes-pane">
          {controlTestId === "cover-note" ? (
            <textarea data-testid="cover-note" readOnly />
          ) : (
            <select data-testid="locale-picker" />
          )}
        </div>
      </LockedScreenLayout>,
    );

    const outerScroller = container.querySelector<HTMLElement>(
      ".screen-scroll-area",
    );
    const notesPane = getByTestId("notes-pane");
    stubScrollMetrics(notesPane, {
      clientHeight: 300,
      scrollHeight: 1_500,
    });
    notesPane.scrollTop = 60;

    const controlEvent = dispatchWheel(getByTestId(controlTestId), {
      deltaY: 80,
    });

    expect(controlEvent.defaultPrevented).toBe(false);
    expect(notesPane.scrollTop).toBe(60);
    expect(outerScroller?.scrollTop).toBe(0);
  });
});
