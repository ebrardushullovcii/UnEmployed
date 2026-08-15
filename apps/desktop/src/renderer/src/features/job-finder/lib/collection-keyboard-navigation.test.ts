import { describe, expect, it } from "vitest";
import { getAdjacentCollectionItemId } from "./collection-keyboard-navigation";

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
