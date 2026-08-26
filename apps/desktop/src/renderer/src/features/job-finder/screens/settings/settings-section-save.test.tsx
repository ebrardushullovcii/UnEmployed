// @vitest-environment jsdom

import { act } from "react";
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  idleSettingsSectionSaveState,
  useSettingsSectionSave,
} from "./settings-section-save";

const globalActScope = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

beforeAll(() => {
  globalActScope.IS_REACT_ACT_ENVIRONMENT = true;
});

describe("useSettingsSectionSave", () => {
  afterEach(cleanup);

  it("starts from the idle save state", () => {
    const { result } = renderHook(() => useSettingsSectionSave());

    expect(result.current.saveState).toEqual(idleSettingsSectionSaveState);
  });

  it("reports saved only after the save promise settles", async () => {
    const { result } = renderHook(() => useSettingsSectionSave());
    let resolveSave: ((saved: boolean) => void) | null = null;
    let pendingSave: Promise<void> | undefined;

    act(() => {
      pendingSave = result.current.runSectionSave({
        execute: () =>
          new Promise<boolean>((resolve) => {
            resolveSave = resolve;
          }),
        failedMessage: "Not saved.",
        savedMessage: "Saved.",
      });
    });

    // Pending must last for the whole save promise, not just the call.
    expect(result.current.saveState.status).toBe("saving");

    await act(async () => {
      resolveSave?.(true);
      await pendingSave;
    });

    expect(result.current.saveState).toEqual({
      message: "Saved.",
      status: "saved",
    });
  });

  it("treats a resolved false as a failed save", async () => {
    const { result } = renderHook(() => useSettingsSectionSave());

    await act(async () => {
      await result.current.runSectionSave({
        execute: () => Promise.resolve(false),
        failedMessage: "Not saved. Retry before leaving this page.",
        savedMessage: "Saved.",
      });
    });

    expect(result.current.saveState).toEqual({
      message: "Not saved. Retry before leaving this page.",
      status: "failed",
    });
  });

  it("treats a resolved true as a saved section", async () => {
    const { result } = renderHook(() => useSettingsSectionSave());

    await act(async () => {
      await result.current.runSectionSave({
        execute: () => Promise.resolve(true),
        failedMessage: "Not saved.",
        savedMessage: "Saved.",
      });
    });

    expect(result.current.saveState).toEqual({
      message: "Saved.",
      status: "saved",
    });
  });

  it("reports a failed save when the promise rejects", async () => {
    const { result } = renderHook(() => useSettingsSectionSave());

    await act(async () => {
      await result.current.runSectionSave({
        execute: () => Promise.reject(new Error("offline")),
        failedMessage: "Not saved. Retry.",
        savedMessage: "Saved.",
      });
    });

    expect(result.current.saveState).toEqual({
      message: "Not saved. Retry.",
      status: "failed",
    });
  });
});
