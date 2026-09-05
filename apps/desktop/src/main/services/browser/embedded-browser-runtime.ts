import type { BrowserSessionRuntime } from "@unemployed/browser-runtime";
import type { EmbeddedBrowser } from "./embedded-browser";

/** Desktop activity/lifecycle adapter; workflow and authority remain in the runtime. */
export function withEmbeddedBrowserActivity(
  runtime: BrowserSessionRuntime,
  browser: EmbeddedBrowser,
): BrowserSessionRuntime {
  return {
    ...runtime,
    async getSessionState(source) {
      const session = await runtime.getSessionState(source);
      const state = browser.getState();
      return state.phase === "closed" || state.phase === "closing"
        ? {
            ...session,
            status: "unknown",
            label: "Browser closed",
            detail:
              "Open the browser to visit a website. Saved sign-ins are kept.",
          }
        : session.status === "unknown"
          ? {
              ...session,
              status: "ready",
              label: "Browser open",
              detail:
                "The browser is available. A website may still require sign-in.",
            }
          : session;
    },
    async openSession(source, options) {
      if (options?.purpose === "automation") {
        return browser.runAutomation("Opening browser", undefined, () =>
          runtime.openSession(source, options),
        );
      }
      await browser.takeControl();
      await browser.command({
        type: "open",
        ...(options?.targetUrl ? { url: options.targetUrl } : {}),
      });
      // Human sign-in remains usable while agent activity is paused.
      return {
        ...(await runtime.getSessionState(source)),
        status: "ready",
        label: "Browser open",
        detail: "Sign in in the browser, then return to your workflow.",
      };
    },
    closeSession: (source) => runtime.closeSession(source),
    runDiscovery: (source, preferences) =>
      browser.runAutomation("Finding jobs", undefined, () =>
        runtime.runDiscovery(source, preferences),
      ),
    executeEasyApply: (source, input) =>
      browser.runAutomation("Preparing application", undefined, () =>
        runtime.executeEasyApply(source, input),
      ),
    executeApplicationFlow: (source, input, options) =>
      browser.runAutomation(
        "Preparing application",
        options?.signal,
        (signal) =>
          runtime.executeApplicationFlow(source, input, { ...options, signal }),
      ),
    ...(runtime.runAgentDiscovery
      ? ({
          runAgentDiscovery: (source, options) =>
            browser.runAutomation(
              `Browsing ${options.siteLabel}`.slice(0, 200),
              options.signal,
              (signal) =>
                runtime.runAgentDiscovery!(source, { ...options, signal }),
            ),
        } satisfies Partial<BrowserSessionRuntime>)
      : {}),
    ...(runtime.observeApplicationForm
      ? ({
          observeApplicationForm: (source, options) =>
            browser.runAutomation("Reading application", undefined, () =>
              runtime.observeApplicationForm!(source, options),
            ),
        } satisfies Partial<BrowserSessionRuntime>)
      : {}),
    ...(runtime.executeExactlyOneFinalAction
      ? ({
          executeExactlyOneFinalAction: (source, input) =>
            browser.runAutomation(
              "Reviewing authorized action",
              input.signal,
              (signal) =>
                runtime.executeExactlyOneFinalAction!(source, {
                  ...input,
                  signal,
                }),
            ),
        } satisfies Partial<BrowserSessionRuntime>)
      : {}),
    ...(runtime.captureVisualSnapshot
      ? ({
          captureVisualSnapshot: (source, request) =>
            browser.runAutomation("Reading browser page", undefined, () =>
              runtime.captureVisualSnapshot!(source, request),
            ),
        } satisfies Partial<BrowserSessionRuntime>)
      : {}),
  };
}
