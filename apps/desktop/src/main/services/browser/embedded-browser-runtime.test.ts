import {
  createStubBrowserSessionRuntime,
  type AgentDiscoveryOptions,
  type BrowserSessionRuntime,
} from "@unemployed/browser-runtime";
import { DiscoveryRunResultSchema } from "@unemployed/contracts";
import { describe, expect, test, vi } from "vitest";

import type { EmbeddedBrowser } from "./embedded-browser";
import { withEmbeddedBrowserActivity } from "./embedded-browser-runtime";

describe("withEmbeddedBrowserActivity", () => {
  test("closes an exact parked tab without closing the shared runtime session", async () => {
    const baseRuntime = createStubBrowserSessionRuntime({
      sessions: [],
      catalog: [],
    });
    const closeSession = vi.fn<BrowserSessionRuntime["closeSession"]>(
      (source) => baseRuntime.closeSession(source),
    );
    const closeParkedTab = vi.fn();
    const browser = { closeParkedTab } as unknown as EmbeddedBrowser;
    const wrapped = withEmbeddedBrowserActivity(
      { ...baseRuntime, closeSession },
      browser,
    );

    await wrapped.closeParkedTab?.("target_site", {
      tabId: "tab_second_handoff",
      url: "https://jobs.example.com/verify",
      title: "Verify",
    });

    expect(closeParkedTab).toHaveBeenCalledWith("tab_second_handoff");
    expect(closeSession).not.toHaveBeenCalled();
  });

  test("refreshes a protected parked page by tab identity before discovery", async () => {
    const baseRuntime = createStubBrowserSessionRuntime({
      sessions: [],
      catalog: [],
    });
    const result = DiscoveryRunResultSchema.parse({
      source: "target_site",
      startedAt: "2026-09-12T10:00:00.000Z",
      completedAt: "2026-09-12T10:00:01.000Z",
      querySummary: "Second source",
      warning: null,
      inventoryCompleteness: "complete",
      jobs: [],
    });
    const runAgentDiscovery = vi.fn<
      NonNullable<BrowserSessionRuntime["runAgentDiscovery"]>
    >((_source, options) => {
      expect(options.protectedPages).toEqual([
        {
          tabId: "tab_verification",
          url: "https://jobs.example.com/challenge/continued",
          title: "Challenge continued",
        },
      ]);
      return Promise.resolve(result);
    });
    const runtime: BrowserSessionRuntime = {
      ...baseRuntime,
      runAgentDiscovery,
    };
    const browser = {
      getState: () => ({
        phase: "open",
        tabs: [
          {
            id: "tab_verification",
            url: "https://jobs.example.com/challenge/continued",
            title: "Challenge continued",
          },
        ],
      }),
      requestAttention: vi.fn(),
      runAutomation: async (
        _label: string,
        _signal: AbortSignal | undefined,
        work: (signal: AbortSignal) => Promise<unknown>,
      ) => work(new AbortController().signal),
    } as unknown as EmbeddedBrowser;
    const wrapped = withEmbeddedBrowserActivity(runtime, browser);
    if (!wrapped.runAgentDiscovery) {
      throw new Error("Expected agent discovery support.");
    }

    await wrapped.runAgentDiscovery("target_site", {
      userProfile: {} as AgentDiscoveryOptions["userProfile"],
      searchPreferences: { targetRoles: [], locations: [] },
      targetJobCount: 1,
      maxSteps: 1,
      startingUrls: ["https://second.example.com/jobs"],
      protectedPages: [
        {
          tabId: "tab_verification",
          url: "https://jobs.example.com/verify",
          title: "Verify you are human",
        },
      ],
      siteLabel: "Second source",
      navigationHostnames: ["second.example.com"],
    });

    expect(runAgentDiscovery).toHaveBeenCalledOnce();
  });

  test("records the live embedded tab when discovery stops at a wall", async () => {
    const session = {
      source: "target_site" as const,
      status: "ready" as const,
      driver: "catalog_seed" as const,
      label: "Browser open",
      detail: "The saved verification tab is open.",
      lastCheckedAt: "2026-09-12T10:00:00.000Z",
    };
    const baseRuntime = createStubBrowserSessionRuntime({
      sessions: [session],
      catalog: [],
    });
    const closeSession = vi.fn<BrowserSessionRuntime["closeSession"]>(
      (source) => baseRuntime.closeSession(source),
    );
    const discoveryResult = DiscoveryRunResultSchema.parse({
      source: "target_site",
      startedAt: "2026-09-12T10:00:00.000Z",
      completedAt: "2026-09-12T10:00:01.000Z",
      querySummary: "Example Jobs",
      warning: "The source stopped at a human-verification page.",
      inventoryCompleteness: "partial",
      jobs: [],
      agentMetadata: {
        accessBlockerReason: "site_protection",
        parkedTab: {
          tabId: null,
          url: "https://jobs.example.com/verify",
          title: null,
        },
      },
    });
    const runtime: BrowserSessionRuntime = {
      ...baseRuntime,
      closeSession,
      runAgentDiscovery: vi.fn(() => Promise.resolve(discoveryResult)),
    };
    const requestAttention = vi.fn();
    const browser = {
      getState: () => ({
        phase: "attention",
        tabs: [
          {
            id: "tab_verification",
            url: "https://jobs.example.com/verify",
            title: "Verify you are human",
          },
        ],
      }),
      requestAttention,
      runAutomation: async (
        _label: string,
        _signal: AbortSignal | undefined,
        work: (signal: AbortSignal) => Promise<unknown>,
      ) => work(new AbortController().signal),
    } as unknown as EmbeddedBrowser;
    const wrapped = withEmbeddedBrowserActivity(runtime, browser);
    if (!wrapped.runAgentDiscovery) {
      throw new Error("Expected agent discovery support.");
    }

    const result = await wrapped.runAgentDiscovery(
      "target_site",
      {} as AgentDiscoveryOptions,
    );
    expect(result.agentMetadata?.parkedTab).toMatchObject({
      tabId: "tab_verification",
      title: "Verify you are human",
    });

    expect(closeSession).not.toHaveBeenCalled();
    expect(requestAttention).toHaveBeenCalledOnce();
  });
});
