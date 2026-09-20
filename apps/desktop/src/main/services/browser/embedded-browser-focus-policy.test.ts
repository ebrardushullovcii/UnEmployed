import { describe, expect, test } from "vitest";

import { getEmbeddedBrowserFocusAction } from "./embedded-browser-focus-policy";

describe("getEmbeddedBrowserFocusAction", () => {
  test("keeps unrelated work running while the user helps a parked tab", () => {
    expect(
      getEmbeddedBrowserFocusAction({
        activeOperationCount: 1,
        attentionTabId: "tab_needs_you",
        focusedTabId: "tab_needs_you",
        handoverPending: false,
        hasAttention: true,
        paused: false,
      }),
    ).toBe("resolve_task_attention");
  });

  test("still hands over an actively automated tab when the user steps in", () => {
    expect(
      getEmbeddedBrowserFocusAction({
        activeOperationCount: 1,
        attentionTabId: null,
        focusedTabId: "tab_running",
        handoverPending: false,
        hasAttention: false,
        paused: false,
      }),
    ).toBe("take_global_control");
  });
});
