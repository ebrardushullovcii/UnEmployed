import { describe, expect, test } from "vitest";

import { getEmbeddedBrowserFocusAction } from "./embedded-browser-focus-policy";

const base = {
  parked: false,
  held: false,
  bannerOnTab: false,
  handoverPending: false,
};

describe("getEmbeddedBrowserFocusAction", () => {
  test("helping a parked tab never stops work in other tabs, on any keystroke", () => {
    const operations = [
      { id: "search_b", tabIds: ["tab_b"] },
      { id: "apply", tabIds: ["tab_apply"] },
    ];
    // First click: the banner goes away.
    expect(
      getEmbeddedBrowserFocusAction({
        ...base,
        focusedTabId: "tab_signin",
        operations,
        parked: true,
        bannerOnTab: true,
      }),
    ).toEqual({ type: "dismiss_attention" });
    // Every later click or keystroke on the same tab: nothing stops.
    expect(
      getEmbeddedBrowserFocusAction({
        ...base,
        focusedTabId: "tab_signin",
        operations,
        parked: true,
      }),
    ).toEqual({ type: "none" });
  });

  test("stepping into a run's tab stops that run only", () => {
    expect(
      getEmbeddedBrowserFocusAction({
        ...base,
        focusedTabId: "tab_apply",
        operations: [
          { id: "search_b", tabIds: ["tab_b"] },
          { id: "apply", tabIds: ["tab_apply"] },
        ],
      }),
    ).toEqual({ type: "take_tab", operationIds: ["apply"] });
  });

  test("a tab no run claims stops only runs that have not said where they work", () => {
    expect(
      getEmbeddedBrowserFocusAction({
        ...base,
        focusedTabId: "tab_other",
        operations: [
          { id: "search_b", tabIds: ["tab_b"] },
          { id: "reading", tabIds: [] },
        ],
      }),
    ).toEqual({ type: "take_tab", operationIds: ["reading"] });
    expect(
      getEmbeddedBrowserFocusAction({
        ...base,
        focusedTabId: "tab_other",
        operations: [{ id: "search_b", tabIds: ["tab_b"] }],
      }),
    ).toEqual({ type: "none" });
  });

  test("a tab the person already holds changes nothing", () => {
    expect(
      getEmbeddedBrowserFocusAction({
        ...base,
        focusedTabId: "tab_apply",
        held: true,
        operations: [{ id: "apply", tabIds: ["tab_apply"] }],
      }),
    ).toEqual({ type: "none" });
  });
});
