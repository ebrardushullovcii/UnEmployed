import type { Page } from "playwright";
import { describe, expect, test, vi } from "vitest";
import { buildInteractionContext, getInteractionTool } from "./interaction-tools.test-helpers";

describe("select_option", () => {
  test("fails safely instead of selecting an arbitrary combobox option", async () => {
    const popupOptions = {
      count: vi.fn().mockResolvedValue(0),
      first: vi.fn(),
    };
    const fallbackOptions = {
      count: vi.fn().mockResolvedValue(0),
      first: vi.fn(),
    };
    const popupScope = {
      getByRole: vi.fn(() => popupOptions),
      locator: vi.fn(() => ({
        filter: vi.fn(() => fallbackOptions),
      })),
    };
    const inputLocator = {
      count: vi.fn().mockResolvedValue(1),
      click: vi.fn().mockResolvedValue(undefined),
      fill: vi.fn().mockResolvedValue(undefined),
    };
    const locator = {
      count: vi.fn().mockResolvedValue(1),
      nth: vi.fn(),
      isVisible: vi.fn().mockResolvedValue(true),
      elementHandle: vi.fn().mockResolvedValue({
        evaluate: vi.fn().mockResolvedValue({
          selected: false,
          controlType: "combobox",
          popupId: "location-popup",
        }),
      }),
      click: vi.fn().mockResolvedValue(undefined),
      focus: vi.fn().mockResolvedValue(undefined),
      locator: vi.fn(() => ({
        first: () => inputLocator,
      })),
      evaluate: vi.fn().mockResolvedValue({
        selectedLabel: "Hybrid",
        selectedValue: "Hybrid",
      }),
      press: vi.fn().mockResolvedValue(undefined),
    };
    locator.nth.mockReturnValue(locator);

    const keyboardPress = vi.fn().mockResolvedValue(undefined);
    const page = {
      getByRole: vi.fn(() => locator),
      locator: vi.fn(() => popupScope),
      keyboard: {
        press: keyboardPress,
        type: vi.fn().mockResolvedValue(undefined),
      },
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      url: vi.fn(() => "https://example.com/jobs"),
    } as unknown as Page;

    const result = await getInteractionTool("select_option").execute(
      {
        role: "combobox",
        name: "Location",
        optionText: "Remote",
        index: 0,
        submit: false,
      },
      buildInteractionContext(page),
    );

    expect(result).toEqual({
      success: false,
      error: 'Option "Remote" was not found',
      data: expect.objectContaining({
        role: "combobox",
        name: "Location",
        index: 0,
        optionText: "Remote",
        selectedLabel: "Hybrid",
        selectedValue: "Hybrid",
      }),
    });
    expect(keyboardPress).not.toHaveBeenCalled();
  });
});

describe("select_option navigation state", () => {
  test("clears repeated interaction failures after select_option navigates successfully", async () => {
    const locator = {
      count: vi.fn().mockResolvedValue(1),
      nth: vi.fn(),
      isVisible: vi.fn().mockResolvedValue(true),
      elementHandle: vi.fn().mockResolvedValue({
        evaluate: vi.fn().mockResolvedValue({
          selected: true,
          controlType: "native_select",
          selectedValue: "remote",
          selectedLabel: "Remote",
        }),
      }),
      press: vi.fn().mockResolvedValue(undefined),
    };
    locator.nth.mockReturnValue(locator);

    let currentUrl = "https://example.com/jobs";
    const page = {
      getByRole: vi.fn(() => locator),
      waitForTimeout: vi.fn(async () => {
        currentUrl = "https://example.com/jobs?workMode=remote";
        return undefined;
      }),
      url: vi.fn(() => currentUrl),
    } as unknown as Page;

    const state = {
      failedInteractionAttempts: new Map([
        [
          "fill::input::search by title skill::0",
          {
            count: 2,
            lastError: 'No textbox matched accessible name "Search by title, skill, or company".',
          },
        ],
      ]),
    };

    const result = await getInteractionTool("select_option").execute(
      {
        role: "combobox",
        name: "Work mode",
        optionText: "Remote",
        index: 0,
        submit: false,
      },
      buildInteractionContext(page, state),
    );

    expect(result).toEqual({
      success: true,
      data: expect.objectContaining({
        navigated: true,
        newUrl: "https://example.com/jobs?workMode=remote",
      }),
    });
    expect(state.failedInteractionAttempts.size).toBe(0);
  });

  test("clears repeated interaction failures when the page-state token changes without a URL change", async () => {
    const locator = {
      count: vi.fn().mockResolvedValue(1),
      nth: vi.fn(),
      isVisible: vi.fn().mockResolvedValue(true),
      elementHandle: vi.fn().mockResolvedValue({
        evaluate: vi.fn().mockResolvedValue({
          selected: true,
          controlType: "native_select",
          selectedValue: "remote",
          selectedLabel: "Remote",
        }),
      }),
      press: vi.fn().mockResolvedValue(undefined),
    };
    locator.nth.mockReturnValue(locator);

    const page = {
      evaluate: vi.fn().mockResolvedValueOnce("https://example.com/jobs::before"),
      getByRole: vi.fn(() => locator),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      url: vi.fn(() => "https://example.com/jobs"),
    } as unknown as Page;

    const state = {
      failedInteractionAttempts: new Map([
        [
          "fill::searchbox::search jobs::0",
          {
            count: 2,
            lastError: 'No textbox matched accessible name "Search jobs".',
          },
        ],
      ]),
      failedInteractionPageStateToken: "https://example.com/jobs::after",
    };

    const result = await getInteractionTool("select_option").execute(
      {
        role: "combobox",
        name: "Work mode",
        optionText: "Remote",
        index: 0,
        submit: false,
      },
      buildInteractionContext(page, state),
    );

    expect(result).toEqual({
      success: true,
      data: expect.objectContaining({
        navigated: false,
        selectedLabel: "Remote",
      }),
    });
    expect(state.failedInteractionAttempts.size).toBe(0);
  });
});
