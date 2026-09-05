// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { usePersistedCollectionView } from "./use-persisted-collection-view";

afterEach(() => window.localStorage.clear());

describe("usePersistedCollectionView", () => {
  it("persists query, density, and bounded saved views", () => {
    const { result, unmount } = renderHook(() =>
      usePersistedCollectionView("test-view"),
    );
    act(() => {
      result.current.setQuery("typescript");
      result.current.setDensity("compact");
    });
    act(() => result.current.saveCurrentView("Engineering"));
    expect(result.current.savedViews[0]).toMatchObject({
      density: "compact",
      name: "Engineering",
      query: "typescript",
    });
    unmount();

    const restored = renderHook(() => usePersistedCollectionView("test-view"));
    expect(restored.result.current.query).toBe("typescript");
    expect(restored.result.current.density).toBe("compact");
    expect(restored.result.current.savedViews).toHaveLength(1);
  });
});
