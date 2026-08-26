import type { Event, Input, WebContents } from "electron";
import { describe, expect, test, vi } from "vitest";
import {
  bindMainWindowZoomShortcuts,
  getMainWindowZoomCommand,
  getNextMainWindowZoomFactor,
  MAIN_WINDOW_DEFAULT_ZOOM_FACTOR,
  MAIN_WINDOW_MAX_ZOOM_FACTOR,
  MAIN_WINDOW_MIN_ZOOM_FACTOR,
} from "./window-zoom";

function createInput(overrides: Partial<Input> = {}): Input {
  return {
    alt: false,
    code: "Equal",
    control: false,
    isAutoRepeat: false,
    isComposing: false,
    key: "=",
    location: 0,
    meta: false,
    modifiers: [],
    shift: false,
    type: "keyDown",
    ...overrides,
  };
}

describe("main window zoom shortcuts", () => {
  test.each([
    [createInput({ control: true, key: "=", code: "Equal" }), "in"],
    [
      createInput({ control: true, key: "+", code: "Equal", shift: true }),
      "in",
    ],
    [createInput({ control: true, key: "-", code: "Minus" }), "out"],
    [createInput({ control: true, key: "0", code: "Digit0" }), "reset"],
    [createInput({ control: true, key: "+", code: "NumpadAdd" }), "in"],
    [createInput({ control: true, key: "Unidentified", code: "Equal" }), "in"],
    [createInput({ control: true, key: "Unidentified", code: "Minus" }), "out"],
    [
      createInput({ control: true, key: "Unidentified", code: "Digit0" }),
      "reset",
    ],
  ] as const)("maps Windows and Linux %s to %s", (input, expected) => {
    expect(getMainWindowZoomCommand(input, "win32")).toBe(expected);
  });

  test("uses Command instead of Control on macOS", () => {
    expect(
      getMainWindowZoomCommand(createInput({ meta: true }), "darwin"),
    ).toBe("in");
    expect(
      getMainWindowZoomCommand(createInput({ control: true }), "darwin"),
    ).toBeNull();
  });

  test.each([
    createInput(),
    createInput({ alt: true, control: true }),
    createInput({ control: true, meta: true }),
    createInput({ control: true, isComposing: true }),
    createInput({ control: true, type: "keyUp" }),
    createInput({ control: true, key: "x", code: "KeyX" }),
  ])("ignores unrelated or unsafe input %#", (input) => {
    expect(getMainWindowZoomCommand(input, "win32")).toBeNull();
  });

  test("steps predictably, resets to 100%, and stays within 50%–200%", () => {
    expect(getNextMainWindowZoomFactor(1, "in")).toBe(1.1);
    expect(getNextMainWindowZoomFactor(1, "out")).toBe(0.9);
    expect(getNextMainWindowZoomFactor(1.7, "reset")).toBe(
      MAIN_WINDOW_DEFAULT_ZOOM_FACTOR,
    );
    expect(getNextMainWindowZoomFactor(2, "in")).toBe(
      MAIN_WINDOW_MAX_ZOOM_FACTOR,
    );
    expect(getNextMainWindowZoomFactor(0.5, "out")).toBe(
      MAIN_WINDOW_MIN_ZOOM_FACTOR,
    );
  });

  test("normalizes a fresh window, prevents Chromium handling, and applies only recognized zoom changes", () => {
    const listeners = new Map<string, (...args: unknown[]) => void>();
    let zoomFactor = 1.5;
    const setZoomFactor = vi.fn((factor: number) => {
      zoomFactor = factor;
    });
    const webContents = {
      getZoomFactor: () => zoomFactor,
      on: vi.fn(
        (eventName: string, nextListener: (...args: unknown[]) => void) => {
          listeners.set(eventName, nextListener);
          return webContents;
        },
      ),
      setZoomFactor,
    } as unknown as Pick<WebContents, "getZoomFactor" | "on" | "setZoomFactor">;
    const preventDefault = vi.fn();

    bindMainWindowZoomShortcuts(webContents, "win32");
    expect(listeners.get("before-input-event")).toBeTypeOf("function");
    expect(zoomFactor).toBe(MAIN_WINDOW_DEFAULT_ZOOM_FACTOR);
    expect(setZoomFactor).toHaveBeenCalledTimes(1);
    expect(setZoomFactor).toHaveBeenLastCalledWith(
      MAIN_WINDOW_DEFAULT_ZOOM_FACTOR,
    );

    const dispatch = listeners.get("before-input-event") as unknown as (
      event: Event,
      input: Input,
    ) => void;
    dispatch(
      { preventDefault } as unknown as Event,
      createInput({ control: true }),
    );
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(setZoomFactor).toHaveBeenLastCalledWith(1.1);

    dispatch(
      { preventDefault } as unknown as Event,
      createInput({ control: true, key: "x", code: "KeyX" }),
    );
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(setZoomFactor).toHaveBeenCalledTimes(2);
  });

  test("preserves the current window zoom across hash routes with stale Chromium zoom history", () => {
    const listeners = new Map<string, (...args: unknown[]) => void>();
    let zoomFactor = 1.5;
    const setZoomFactor = vi.fn((factor: number) => {
      zoomFactor = factor;
    });
    const webContents = {
      getZoomFactor: () => zoomFactor,
      on: vi.fn((eventName: string, listener: (...args: unknown[]) => void) => {
        listeners.set(eventName, listener);
        return webContents;
      }),
      setZoomFactor,
    } as unknown as Pick<WebContents, "getZoomFactor" | "on" | "setZoomFactor">;

    bindMainWindowZoomShortcuts(webContents, "win32");

    // A test or user zoom change on the current route is observed before the
    // same-document navigation starts.
    zoomFactor = 1.5;
    const didStartNavigation = listeners.get("did-start-navigation");
    expect(didStartNavigation).toBeTypeOf("function");
    didStartNavigation?.({
      isMainFrame: true,
      isSameDocument: true,
    });

    // Chromium then restores an old factor associated with the target hash.
    zoomFactor = 2;
    const didNavigateInPage = listeners.get("did-navigate-in-page");
    expect(didNavigateInPage).toBeTypeOf("function");
    didNavigateInPage?.(
      { preventDefault: vi.fn() },
      "file:///app/#/job-finder/actions",
      true,
      1,
      1,
    );

    expect(zoomFactor).toBe(1.5);
    expect(setZoomFactor).toHaveBeenLastCalledWith(1.5);

    zoomFactor = 2;
    didNavigateInPage?.(
      { preventDefault: vi.fn() },
      "file:///frame",
      false,
      2,
      2,
    );
    expect(zoomFactor).toBe(2);
  });

  function createLoadLifecycleHarness() {
    const listeners = new Map<string, (...args: unknown[]) => void>();
    let zoomFactor = 1;
    const setZoomFactor = vi.fn((factor: number) => {
      zoomFactor = factor;
    });
    const webContents = {
      getZoomFactor: () => zoomFactor,
      on: vi.fn((eventName: string, listener: (...args: unknown[]) => void) => {
        listeners.set(eventName, listener);
        return webContents;
      }),
      setZoomFactor,
    } as unknown as Pick<WebContents, "getZoomFactor" | "on" | "setZoomFactor">;

    return {
      applyCommitTimeHostZoom(factor: number) {
        // Chromium restores the persisted per-origin zoom after binding and
        // right before did-finish-load; nothing in the app caused this write.
        zoomFactor = factor;
      },
      finishLoad() {
        listeners.get("did-finish-load")?.();
      },
      pressShortcut(input: Input) {
        listeners.get("before-input-event")?.(
          { preventDefault: vi.fn() } as unknown as Event,
          input,
        );
      },
      setZoomFactor,
      webContents,
      zoomFactor: () => zoomFactor,
    };
  }

  test("beats persisted Chromium host zoom by re-asserting after every completed load", () => {
    const harness = createLoadLifecycleHarness();

    // Pre-load normalization alone cannot win: Chromium reapplies the value
    // persisted in the reused user-data root at navigation-commit time.
    bindMainWindowZoomShortcuts(harness.webContents, "win32");
    harness.applyCommitTimeHostZoom(1.25);
    expect(harness.zoomFactor()).toBe(1.25);

    harness.finishLoad();
    expect(harness.zoomFactor()).toBe(MAIN_WINDOW_DEFAULT_ZOOM_FACTOR);
    expect(harness.setZoomFactor).toHaveBeenLastCalledWith(
      MAIN_WINDOW_DEFAULT_ZOOM_FACTOR,
    );

    // Recovery reloads restore the stale factor again; the owned factor wins
    // every time without user input.
    harness.applyCommitTimeHostZoom(1.5);
    harness.finishLoad();
    expect(harness.zoomFactor()).toBe(MAIN_WINDOW_DEFAULT_ZOOM_FACTOR);
  });

  test("adopts an explicit tester startup request and defends it against host zoom", () => {
    const harness = createLoadLifecycleHarness();

    bindMainWindowZoomShortcuts(harness.webContents, "win32", {
      initialZoomFactor: 1.25,
    });
    expect(harness.setZoomFactor).toHaveBeenNthCalledWith(1, 1.25);

    harness.applyCommitTimeHostZoom(1);
    harness.finishLoad();
    expect(harness.zoomFactor()).toBe(1.25);
    expect(harness.setZoomFactor).toHaveBeenLastCalledWith(1.25);
  });

  test("keeps the user's own zoom choice across full reloads", () => {
    const harness = createLoadLifecycleHarness();

    bindMainWindowZoomShortcuts(harness.webContents, "win32");
    harness.pressShortcut(createInput({ control: true }));
    expect(harness.zoomFactor()).toBe(1.1);

    // A post-user-zoom reload must not silently drop the user's factor back
    // to either Chromium's stale history or the launch default.
    harness.applyCommitTimeHostZoom(0.75);
    harness.finishLoad();
    expect(harness.zoomFactor()).toBe(1.1);
    expect(harness.setZoomFactor).toHaveBeenLastCalledWith(1.1);
  });
});
