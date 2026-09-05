import { describe, expect, it, vi } from "vitest";
import {
  acquireJobFinderOverlay,
  hasOpenJobFinderOverlays,
  resetJobFinderOverlaysForTests,
  subscribeToJobFinderOverlays,
} from "./job-finder-overlay-ownership";

describe("job finder overlay ownership", () => {
  it("treats the most recently opened layer as topmost", () => {
    const taskCenter = acquireJobFinderOverlay(vi.fn());
    const searchDialog = acquireJobFinderOverlay(vi.fn());

    expect(taskCenter.isTopmost()).toBe(false);
    expect(searchDialog.isTopmost()).toBe(true);
    expect(hasOpenJobFinderOverlays()).toBe(true);

    searchDialog.release();
    expect(taskCenter.isTopmost()).toBe(true);
    expect(hasOpenJobFinderOverlays()).toBe(true);

    taskCenter.release();
    expect(hasOpenJobFinderOverlays()).toBe(false);
  });

  it("keeps lower layers owned when a middle layer releases first", () => {
    const bottom = acquireJobFinderOverlay(vi.fn());
    const middle = acquireJobFinderOverlay(vi.fn());
    const top = acquireJobFinderOverlay(vi.fn());

    middle.release();

    expect(top.isTopmost()).toBe(true);
    expect(bottom.isTopmost()).toBe(false);
    expect(hasOpenJobFinderOverlays()).toBe(true);

    top.release();
    expect(bottom.isTopmost()).toBe(true);

    resetJobFinderOverlaysForTests();
    expect(hasOpenJobFinderOverlays()).toBe(false);
    expect(bottom.isTopmost()).toBe(false);
  });

  it("notifies subscribers while the stack changes and stops after unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToJobFinderOverlays(listener);

    const layer = acquireJobFinderOverlay(vi.fn());
    expect(listener).toHaveBeenCalledTimes(1);

    layer.release();
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    const silent = acquireJobFinderOverlay(vi.fn());
    expect(listener).toHaveBeenCalledTimes(2);
    silent.release();
  });

  it("reports released layers as never topmost again", () => {
    const layer = acquireJobFinderOverlay(vi.fn());
    expect(layer.isTopmost()).toBe(true);

    layer.release();
    layer.release();
    expect(layer.isTopmost()).toBe(false);
    expect(hasOpenJobFinderOverlays()).toBe(false);
  });
});
