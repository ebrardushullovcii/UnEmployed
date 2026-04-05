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
  });
});
