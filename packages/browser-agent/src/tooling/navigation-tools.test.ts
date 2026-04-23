import type { Page } from "playwright";
import { describe, expect, test, vi } from "vitest";
import { navigationTools } from "./navigation-tools";

describe("navigate", () => {
  test("treats capped networkidle timeouts as partial success when the page is already usable", async () => {
    const goto = vi
      .fn()
      .mockRejectedValue(new Error('page.goto: Timeout 7000ms exceeded.'));
    const page = {
      goto,
      url: vi.fn(() => "https://www.linkedin.com/jobs"),
      title: vi.fn().mockResolvedValue("Jobs | LinkedIn"),
      evaluate: vi.fn().mockResolvedValue("interactive"),
    } as unknown as Page;

    const tool = navigationTools.find((candidate) => candidate.name === "navigate");
    if (!tool) {
      throw new Error("navigate tool is not registered");
    }

    const state = {
      currentUrl: "https://www.linkedin.com/jobs/search",
      visitedUrls: new Set<string>(),
      failedInteractionAttempts: new Map([
        ["fill::input::search by title skill::0", {
          count: 2,
          lastError: 'No textbox matched accessible name "Search by title, skill, or company".',
        }],
      ]),
    };

    const result = await tool.execute(
      {
        url: "https://www.linkedin.com/jobs",
        waitFor: "networkidle",
        timeout: 30000,
      },
      {
        page,
        state: state as never,
        config: {
          navigationPolicy: {
            allowedHostnames: ["www.linkedin.com"],
          },
        } as never,
      },
    );

    expect(goto).toHaveBeenCalledWith("https://www.linkedin.com/jobs", {
      waitUntil: "networkidle",
      timeout: 7000,
    });
    expect(result).toEqual({
      success: true,
      data: expect.objectContaining({
        url: "https://www.linkedin.com/jobs",
        waitState: "networkidle",
        waitStateReached: false,
        partialLoad: true,
        readyState: "interactive",
      }),
    });
    expect(state.currentUrl).toBe("https://www.linkedin.com/jobs");
    expect(state.visitedUrls.has("https://www.linkedin.com/jobs")).toBe(true);
    expect(state.failedInteractionAttempts.size).toBe(0);
  });

  test("clears repeated interaction failures after a successful navigation to a new page", async () => {
    const page = {
      goto: vi.fn().mockResolvedValue(undefined),
      url: vi.fn(() => "https://www.linkedin.com/jobs/collections/recommended"),
      title: vi.fn().mockResolvedValue("Recommended jobs | LinkedIn"),
      evaluate: vi.fn().mockResolvedValue([]),
    } as unknown as Page;

    const tool = navigationTools.find((candidate) => candidate.name === "navigate");
    if (!tool) {
      throw new Error("navigate tool is not registered");
    }

    const state = {
      currentUrl: "https://www.linkedin.com/jobs/search",
      visitedUrls: new Set<string>(),
      failedInteractionAttempts: new Map([
        ["fill::input::search by title skill::0", {
          count: 2,
          lastError: 'No textbox matched accessible name "Search by title, skill, or company".'
        }]
      ]),
    };

    const result = await tool.execute(
      {
        url: "https://www.linkedin.com/jobs/collections/recommended",
        waitFor: "domcontentloaded",
        timeout: 5000,
      },
      {
        page,
        state: state as never,
        config: {
          navigationPolicy: {
            allowedHostnames: ["www.linkedin.com"],
          },
        } as never,
      },
    );

    expect(result).toEqual({
      success: true,
      data: expect.objectContaining({
        url: "https://www.linkedin.com/jobs/collections/recommended",
      }),
    });
    expect(state.failedInteractionAttempts.size).toBe(0);
  });

  test("dismisses obstructive overlays after successful navigation", async () => {
    const overlayButton = {
      count: vi.fn().mockResolvedValue(1),
      first: vi.fn(),
      click: vi.fn().mockResolvedValue(undefined),
    };
    overlayButton.first.mockReturnValue(overlayButton);

    const page = {
      goto: vi.fn().mockResolvedValue(undefined),
      url: vi.fn(() => 'https://example.com/jobs'),
      title: vi.fn().mockResolvedValue('Jobs'),
      evaluate: vi.fn().mockResolvedValue([{ label: 'Close', role: 'button' }]),
      getByRole: vi.fn((role: string, options?: { name?: string; exact?: boolean }) => {
        if (role === 'button' && String(options?.name ?? '').toLowerCase() === 'close') {
          return overlayButton;
        }

        return overlayButton;
      }),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
    } as unknown as Page;

    const tool = navigationTools.find((candidate) => candidate.name === 'navigate');
    if (!tool) {
      throw new Error('navigate tool is not registered');
    }

    const state = {
      currentUrl: 'https://example.com',
      visitedUrls: new Set<string>(),
      failedInteractionAttempts: new Map(),
    };

    const result = await tool.execute(
      {
        url: 'https://example.com/jobs',
        waitFor: 'domcontentloaded',
        timeout: 5000,
      },
      {
        page,
        state: state as never,
        config: {
          navigationPolicy: {
            allowedHostnames: ['example.com'],
          },
        } as never,
      },
    );

    expect(result).toEqual({
      success: true,
      data: expect.objectContaining({
        url: 'https://example.com/jobs',
      }),
    });
    expect(overlayButton.click).toHaveBeenCalled();
  });
});
