import type { Page } from "playwright";
import { describe, expect, test, vi } from "vitest";
import { buildInteractionContext, getInteractionTool } from "./interaction-tools.test-helpers";

describe("fill", () => {
  test("blocks repeated fill failures across truncated searchbox-name variants", async () => {
    const page = {
      getByRole: vi.fn(),
      url: vi.fn(() => "https://example.com/jobs"),
    } as unknown as Page;

    const result = await getInteractionTool("fill").execute(
      {
        role: "searchbox",
        name: "Search by title, skill, or com",
        text: "frontend engineer",
        index: 0,
        submit: false,
      },
      buildInteractionContext(page, {
        failedInteractionAttempts: new Map([
          [
            "fill::searchbox::search by title skill or com::0",
            {
              count: 2,
              lastError: 'No textbox matched accessible name "Search by title, skill, or company".',
            },
          ],
        ]),
      }),
    );

    expect(result).toEqual({
      success: false,
      error:
        'Skipping repeated fill attempt for searchbox "Search by title, skill, or com" after 2 similar failures: No textbox matched accessible name "Search by title, skill, or company".',
      data: expect.objectContaining({
        role: "searchbox",
        index: 0,
        errorType: "repeated_fill_blocked",
      }),
    });
    expect(page.getByRole).not.toHaveBeenCalled();
  });

  test("records disallowed-url submit failures so repeated unsafe fills can be blocked", async () => {
    const locator = {
      count: vi.fn().mockResolvedValue(1),
      nth: vi.fn(),
      isVisible: vi.fn().mockResolvedValue(true),
      fill: vi.fn().mockResolvedValue(undefined),
      press: vi.fn().mockResolvedValue(undefined),
    };
    locator.nth.mockReturnValue(locator);

    let currentUrl = "https://example.com/jobs";
    const page = {
      evaluate: vi.fn().mockResolvedValue([]),
      getByRole: vi.fn(() => locator),
      goBack: vi.fn(async () => {
        currentUrl = "https://example.com/jobs";
        return null;
      }),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      url: vi.fn(() => currentUrl),
    } as unknown as Page;

    const state = {
      failedInteractionAttempts: new Map<string, { count: number; lastError: string }>(),
    };

    locator.press.mockImplementationOnce(async () => {
      currentUrl = "https://malicious.example.net/phish";
      return undefined;
    });

    const result = await getInteractionTool("fill").execute(
      {
        role: "searchbox",
        name: "Search jobs",
        text: "frontend engineer",
        index: 0,
        submit: true,
      },
      buildInteractionContext(page, state),
    );

    expect(result).toEqual({
      success: false,
      error: "Navigation went to disallowed URL: https://malicious.example.net/phish",
      data: expect.objectContaining({
        role: "searchbox",
        name: "Search jobs",
        index: 0,
        errorType: "fill_failed",
        repeatedFailureCount: 1,
        recovered: true,
      }),
    });
    expect(state.failedInteractionAttempts.get("fill::searchbox::search jobs::0")).toEqual({
      count: 1,
      lastError: "Navigation went to disallowed URL: https://malicious.example.net/phish",
    });
  });

  test("dismisses obstructive overlays before filling", async () => {
    const locator = {
      count: vi.fn().mockResolvedValue(1),
      nth: vi.fn(),
      isVisible: vi.fn().mockResolvedValue(true),
      fill: vi.fn().mockResolvedValue(undefined),
    };
    locator.nth.mockReturnValue(locator);

    const overlayButton = {
      count: vi.fn().mockResolvedValue(1),
      first: vi.fn(),
      click: vi.fn().mockResolvedValue(undefined),
    };
    overlayButton.first.mockReturnValue(overlayButton);

    const page = {
      evaluate: vi.fn().mockResolvedValue([{ label: 'X', role: 'button' }]),
      getByRole: vi.fn((role: string, options?: { name?: string; exact?: boolean }) => {
        if (role === 'button' && String(options?.name ?? '').toLowerCase() === 'x') {
          return overlayButton;
        }

        return locator;
      }),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      url: vi.fn(() => 'https://example.com/jobs'),
    } as unknown as Page;

    const result = await getInteractionTool('fill').execute(
      {
        role: 'searchbox',
        name: 'Search jobs',
        text: 'frontend engineer',
        index: 0,
        submit: false,
      },
      buildInteractionContext(page),
    );

    expect(result).toEqual({
      success: true,
      data: { role: 'searchbox', name: 'Search jobs', index: 0, submitted: false },
    });
    expect(overlayButton.click).toHaveBeenCalled();
    expect(locator.fill).toHaveBeenCalledWith('frontend engineer');
  });
});
