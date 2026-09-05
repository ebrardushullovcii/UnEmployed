// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  focusCollectionItem,
  getAdjacentCollectionItemId,
} from "./collection-keyboard-navigation";

describe("getAdjacentCollectionItemId", () => {
  const ids = ["one", "two", "three"];

  it("supports arrow and boundary navigation", () => {
    expect(getAdjacentCollectionItemId(ids, "one", "ArrowDown")).toBe("two");
    expect(getAdjacentCollectionItemId(ids, "three", "ArrowDown")).toBe(
      "three",
    );
    expect(getAdjacentCollectionItemId(ids, "two", "ArrowUp")).toBe("one");
    expect(getAdjacentCollectionItemId(ids, "two", "Home")).toBe("one");
    expect(getAdjacentCollectionItemId(ids, "two", "End")).toBe("three");
  });

  it("returns null for unrelated keys or an empty list", () => {
    expect(getAdjacentCollectionItemId(ids, "one", "Enter")).toBeNull();
    expect(getAdjacentCollectionItemId([], null, "ArrowDown")).toBeNull();
  });
});

describe("focusCollectionItem", () => {
  function createRow(region: ParentNode, itemId: string): HTMLElement {
    const row = document.createElement("button");
    row.dataset.collectionItemId = itemId;
    region.appendChild(row);
    return row;
  }

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("lands focus on the requested row inside its own region only", () => {
    // Deferred frames run synchronously so lookups observe committed DOM.
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 41;
    });

    const regionA = document.createElement("section");
    const regionB = document.createElement("section");
    document.body.append(regionA, regionB);
    const rowA = createRow(regionA, "shared_id");
    const rowB = createRow(regionB, "shared_id");

    const handle = focusCollectionItem("shared_id", { region: regionA });

    expect(handle).toBe(41);
    expect(document.activeElement).toBe(rowA);
    expect(rowB.matches(":focus")).toBe(false);
  });

  it("claims focus with preventScroll after an explicit contained reveal", () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });

    // A real vertical scrollport above the row: inline overflow plus an
    // overflow delta satisfy the shared scrollport predicate under jsdom.
    const scroller = document.createElement("div");
    scroller.style.overflowY = "auto";
    Object.defineProperty(scroller, "scrollHeight", { value: 4000 });
    Object.defineProperty(scroller, "clientHeight", { value: 300 });
    document.body.appendChild(scroller);

    const row = createRow(scroller, "row_id");
    const focusSpy = vi.spyOn(row, "focus");
    const scrollIntoViewMock = vi.fn();
    row.scrollIntoView = scrollIntoViewMock;
    vi.spyOn(row, "getBoundingClientRect").mockReturnValue({
      top: 5,
    } as DOMRect);
    scroller.scrollTop = 30;

    focusCollectionItem("row_id");

    // jsdom's 1024px viewport resolves to the sm fixed-header band
    // (132px clearance): errorPx = 5 - 132 = -127, clamped to the top.
    expect(scroller.scrollTop).toBe(0);
    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
    // The reveal is explicit scroller math, never a delegated native jump.
    expect(scrollIntoViewMock).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(row);
  });

  it("leaves focus untouched as the declared fallback when the row is absent", () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });

    const region = document.createElement("section");
    document.body.appendChild(region);
    createRow(region, "other_row");

    focusCollectionItem("missing_row", { region });

    expect(document.activeElement).toBe(document.body);
  });
});
