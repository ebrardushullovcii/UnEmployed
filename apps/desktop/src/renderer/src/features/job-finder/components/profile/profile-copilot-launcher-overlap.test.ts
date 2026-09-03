// @vitest-environment jsdom

import { describe, expect, test } from "vitest";
import {
  COPILOT_BOTTOM_OFFSET,
  COPILOT_LAUNCHER_MIN_INTERACTIVE_GAP,
  type CopilotRect,
  type CopilotViewport,
  classifyCopilotFocusTarget,
  getCollapsedLauncherClearance,
  getCollapsedLauncherStackSize,
  shouldYieldCollapsedLauncher,
} from "./profile-copilot-rail-layout";

const REPRESENTATIVE_VIEWPORTS: readonly {
  label: string;
  viewport: CopilotViewport;
}[] = [
  { label: "desktop 1440x920", viewport: { height: 920, width: 1440 } },
  {
    label: "compact boundary 1280x800",
    viewport: { height: 800, width: 1280 },
  },
  { label: "minimum 1024x768", viewport: { height: 768, width: 1024 } },
  {
    label: "native zoom 200 effective CSS viewport of a 1440x920 window",
    viewport: { height: 460, width: 720 },
  },
];

function buildTabsRect(
  viewport: CopilotViewport,
  tabsBottom: number,
  tabsHeight = 68,
): CopilotRect {
  return {
    bottom: tabsBottom,
    left: 0,
    right: viewport.width,
    top: tabsBottom - tabsHeight,
  };
}

function buildFooterRect(viewport: CopilotViewport): CopilotRect {
  return {
    bottom: viewport.height,
    left: 0,
    right: viewport.width,
    top: viewport.height - 72,
  };
}

function getLauncherGeometry(input: {
  clearance: number;
  stackHeight: number;
  stackWidth: number;
  viewport: CopilotViewport;
}) {
  const bottom = input.viewport.height - input.clearance;

  return {
    left: input.viewport.width - COPILOT_BOTTOM_OFFSET - input.stackWidth,
    right: input.viewport.width - COPILOT_BOTTOM_OFFSET,
    top: bottom - input.stackHeight,
    bottom,
  };
}

describe("profile copilot launcher overlap guard", () => {
  const collapsedStack = getCollapsedLauncherStackSize({
    showSuggestionPill: false,
  });
  const stackWithSuggestion = getCollapsedLauncherStackSize({
    showSuggestionPill: true,
  });

  test("measures the full interactive launcher stack including the suggestion pill", () => {
    expect(collapsedStack).toEqual({ height: 48, width: 48 });
    expect(stackWithSuggestion.height).toBeGreaterThan(collapsedStack.height);
    expect(stackWithSuggestion.height).toBeGreaterThan(64);
  });

  test.each(REPRESENTATIVE_VIEWPORTS)(
    "keeps the launcher clear of tab strips crossing the docked zone ($label)",
    ({ viewport }) => {
      const minTopOffset = 88;
      const stackTopWhenDocked =
        viewport.height - COPILOT_BOTTOM_OFFSET - stackWithSuggestion.height;

      for (
        let tabsBottom = Math.ceil(stackTopWhenDocked) + 1;
        tabsBottom <= viewport.height;
        tabsBottom += 4
      ) {
        const tabs = buildTabsRect(viewport, tabsBottom);
        const clearance = getCollapsedLauncherClearance({
          launcherHeight: stackWithSuggestion.height,
          launcherWidth: stackWithSuggestion.width,
          minTopOffset,
          targets: [tabs],
          viewportHeight: viewport.height,
          viewportWidth: viewport.width,
        });
        const launcher = getLauncherGeometry({
          clearance,
          stackHeight: stackWithSuggestion.height,
          stackWidth: stackWithSuggestion.width,
          viewport,
        });
        const needed =
          viewport.height - tabs.top + COPILOT_LAUNCHER_MIN_INTERACTIVE_GAP;
        const feasible =
          needed <= viewport.height - stackWithSuggestion.height - minTopOffset;

        expect(launcher.right).toBeLessThanOrEqual(viewport.width);
        expect(launcher.left).toBeGreaterThanOrEqual(0);
        expect(launcher.top).toBeGreaterThanOrEqual(minTopOffset);

        if (feasible) {
          expect(needed).toBeGreaterThan(COPILOT_BOTTOM_OFFSET);
          expect(clearance).toBeGreaterThanOrEqual(needed);
          expect(launcher.bottom).toBeLessThanOrEqual(
            tabs.top - COPILOT_LAUNCHER_MIN_INTERACTIVE_GAP,
          );
          expect(launcher.top).toBeGreaterThanOrEqual(minTopOffset);
        } else {
          expect(launcher.top).toBe(minTopOffset);
        }
      }
    },
  );

  test.each(REPRESENTATIVE_VIEWPORTS)(
    "keeps the launcher clear of the save footer before any tab lift ($label)",
    ({ viewport }) => {
      const footer = buildFooterRect(viewport);
      const clearance = getCollapsedLauncherClearance({
        launcherHeight: collapsedStack.height,
        launcherWidth: collapsedStack.width,
        minTopOffset: 88,
        targets: [footer],
        viewportHeight: viewport.height,
        viewportWidth: viewport.width,
      });
      const launcher = getLauncherGeometry({
        clearance,
        stackHeight: collapsedStack.height,
        stackWidth: collapsedStack.width,
        viewport,
      });

      expect(launcher.bottom).toBeLessThanOrEqual(
        footer.top - COPILOT_LAUNCHER_MIN_INTERACTIVE_GAP,
      );
      expect(launcher.top).toBeGreaterThanOrEqual(88);
    },
  );

  test.each(REPRESENTATIVE_VIEWPORTS)(
    "applies the largest required lift when tabs and footer collide together ($label)",
    ({ viewport }) => {
      const tabs = buildTabsRect(
        viewport,
        viewport.height - COPILOT_BOTTOM_OFFSET - 8,
      );
      const footer = buildFooterRect(viewport);
      const clearance = getCollapsedLauncherClearance({
        launcherHeight: stackWithSuggestion.height,
        launcherWidth: stackWithSuggestion.width,
        minTopOffset: 88,
        targets: [tabs, footer],
        viewportHeight: viewport.height,
        viewportWidth: viewport.width,
      });
      const footerOnly = getCollapsedLauncherClearance({
        launcherHeight: stackWithSuggestion.height,
        launcherWidth: stackWithSuggestion.width,
        minTopOffset: 88,
        targets: [footer],
        viewportHeight: viewport.height,
        viewportWidth: viewport.width,
      });

      expect(clearance).toBeGreaterThanOrEqual(footerOnly);
    },
  );

  test("leaves the launcher docked when the overlapping target sits outside its column", () => {
    const viewport = { height: 920, width: 1440 };
    const sideWidget = {
      bottom: viewport.height - 20,
      left: 0,
      right: 600,
      top: viewport.height - 88,
    } satisfies CopilotRect;
    const clearance = getCollapsedLauncherClearance({
      launcherHeight: collapsedStack.height,
      launcherWidth: collapsedStack.width,
      minTopOffset: 240,
      targets: [sideWidget],
      viewportHeight: viewport.height,
      viewportWidth: viewport.width,
    });

    expect(clearance).toBe(COPILOT_BOTTOM_OFFSET);
  });

  test("keeps the launcher inside the viewport when no lift can satisfy both constraints", () => {
    const viewport = { height: 460, width: 720 };
    const minTopOffset = 300;
    const lowTabs = {
      bottom: 430,
      left: 0,
      right: viewport.width,
      top: 380,
    } satisfies CopilotRect;
    const clearance = getCollapsedLauncherClearance({
      launcherHeight: stackWithSuggestion.height,
      launcherWidth: stackWithSuggestion.width,
      minTopOffset,
      targets: [lowTabs],
      viewportHeight: viewport.height,
      viewportWidth: viewport.width,
    });
    const launcher = getLauncherGeometry({
      clearance,
      stackHeight: stackWithSuggestion.height,
      stackWidth: stackWithSuggestion.width,
      viewport,
    });

    expect(clearance).toBe(
      viewport.height - stackWithSuggestion.height - minTopOffset,
    );
    expect(launcher.top).toBe(minTopOffset);
    expect(launcher.bottom).toBeLessThanOrEqual(viewport.height);
  });
});

describe("collapsed launcher focus yielding", () => {
  function createElement(html: string): Element {
    const host = document.createElement("div");
    host.innerHTML = html;
    return host.firstElementChild as Element;
  }

  test("classifies the focused element", () => {
    expect(classifyCopilotFocusTarget(null)).toBe("none");
    expect(classifyCopilotFocusTarget(document.body)).toBe("none");
    expect(
      classifyCopilotFocusTarget(createElement("<textarea></textarea>")),
    ).toBe("form_field");
    expect(classifyCopilotFocusTarget(createElement("<input />"))).toBe(
      "form_field",
    );
    expect(
      classifyCopilotFocusTarget(
        createElement('<button data-profile-copilot-launcher="true"></button>'),
      ),
    ).toBe("copilot");
    expect(
      classifyCopilotFocusTarget(
        createElement(
          '<div data-profile-copilot-panel="true"><textarea></textarea></div>',
        ).querySelector("textarea"),
      ),
    ).toBe("copilot");
    expect(classifyCopilotFocusTarget(createElement("<a href='#'></a>"))).toBe(
      "other",
    );
  });

  test("steps aside only for a focused form field on the page", () => {
    // The pill sat on top of the self-introduction textarea and hid the text
    // the user had just typed.
    expect(
      shouldYieldCollapsedLauncher({
        focusKind: "form_field",
        isOpen: false,
        isPendingHere: false,
      }),
    ).toBe(true);
    expect(
      shouldYieldCollapsedLauncher({
        focusKind: "copilot",
        isOpen: false,
        isPendingHere: false,
      }),
    ).toBe(false);
    expect(
      shouldYieldCollapsedLauncher({
        focusKind: "none",
        isOpen: false,
        isPendingHere: false,
      }),
    ).toBe(false);
    // A reply in flight must stay visible, and an open panel is not the pill.
    expect(
      shouldYieldCollapsedLauncher({
        focusKind: "form_field",
        isOpen: false,
        isPendingHere: true,
      }),
    ).toBe(false);
    expect(
      shouldYieldCollapsedLauncher({
        focusKind: "form_field",
        isOpen: true,
        isPendingHere: false,
      }),
    ).toBe(false);
  });
});
