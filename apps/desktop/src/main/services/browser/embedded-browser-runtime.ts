import type {
  BrowserSessionRuntime,
  OpenBrowserSessionOptions,
} from "@unemployed/browser-runtime";
import type {
  ApplyExecutionResult,
  BrowserSessionState,
  DiscoveryRunResult,
  JobSource,
} from "@unemployed/contracts";
import type { EmbeddedBrowser } from "./embedded-browser";

/**
 * Desktop activity/lifecycle adapter; workflow and authority remain in the
 * runtime. When a run stops because only the user can continue (sign-in, a
 * human-verification challenge), the browser keeps that page and asks for
 * attention so the launcher can show it; the runtime never enters credentials.
 */
export function withEmbeddedBrowserActivity(
  runtime: BrowserSessionRuntime,
  browser: EmbeddedBrowser,
): BrowserSessionRuntime {
  const flagSession = (session: BrowserSessionState): BrowserSessionState => {
    if (session.status === "login_required")
      browser.requestAttention({
        kind: "sign_in",
        title: "Sign in to continue",
        detail:
          "This site needs you to sign in. Your password stays with you; the agent picks up again afterwards.",
      });
    return session;
  };
  const flagResult = (result: ApplyExecutionResult): ApplyExecutionResult => {
    const code = result.blocker?.code;
    if (code === "site_login_required")
      browser.requestAttention({
        kind: "sign_in",
        title: "Sign in to continue",
        detail:
          "This application needs you to sign in. Your password stays with you; run preparation again afterwards.",
      });
    else if (code === "requires_manual_review" && result.blocker?.summary)
      browser.requestAttention({
        kind: "challenge",
        title: "This page needs a human",
        detail: result.blocker.summary,
      });
    return result;
  };
  const attachParkedTab = (result: DiscoveryRunResult): DiscoveryRunResult => {
    const parked = result.agentMetadata?.parkedTab;
    if (!parked) return result;
    const tab = browser
      .getState()
      .tabs.find((candidate) => candidate.url === parked.url);
    browser.requestAttention({
      kind:
        result.agentMetadata?.accessBlockerReason === "auth_required"
          ? "sign_in"
          : "challenge",
      title:
        result.agentMetadata?.accessBlockerReason === "auth_required"
          ? "Sign in to continue"
          : "This page needs a human",
      detail:
        result.warning?.slice(0, 500) ??
        "Finish the step in this browser tab, then search this source again.",
    });
    return {
      ...result,
      agentMetadata: result.agentMetadata
        ? {
            ...result.agentMetadata,
            parkedTab: {
              ...parked,
              tabId: tab?.id ?? null,
              title: tab?.title ?? null,
            },
          }
        : null,
    };
  };
  const flagAfter = async <T>(source: JobSource, work: Promise<T>) => {
    const result = await work;
    await runtime.getSessionState(source).then(flagSession, () => undefined);
    return result;
  };
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
    async openSession(source, options?: OpenBrowserSessionOptions) {
      if (options?.purpose === "automation") {
        return browser.runAutomation("Opening browser", undefined, () =>
          runtime.openSession(source, options).then(flagSession),
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
    async closeParkedTab(source, tab) {
      if (tab.tabId) {
        browser.closeParkedTab(tab.tabId);
        return;
      }
      await runtime.closeParkedTab?.(source, tab);
    },
    runDiscovery: (source, preferences) =>
      browser.runAutomation("Finding jobs", undefined, () =>
        flagAfter(source, runtime.runDiscovery(source, preferences)),
      ),
    executeEasyApply: (source, input) =>
      browser.runAutomation("Preparing application", undefined, () =>
        runtime.executeEasyApply(source, input).then(flagResult),
      ),
    executeApplicationFlow: (source, input, options) =>
      browser.runAutomation(
        "Preparing application",
        options?.signal,
        (signal) =>
          runtime
            .executeApplicationFlow(source, input, { ...options, signal })
            .then(flagResult),
      ),
    ...(runtime.runAgentDiscovery
      ? ({
          runAgentDiscovery: (source, options) =>
            browser.runAutomation(
              `Browsing ${options.siteLabel}`.slice(0, 200),
              options.signal,
              (signal) => {
                const currentTabs = browser.getState().tabs;
                const protectedPages = (options.protectedPages ?? []).map(
                  (protectedPage) => {
                    const currentTab = protectedPage.tabId
                      ? currentTabs.find(
                          (candidate) => candidate.id === protectedPage.tabId,
                        )
                      : null;
                    return currentTab
                      ? {
                          ...protectedPage,
                          url: currentTab.url,
                          title: currentTab.title,
                        }
                      : protectedPage;
                  },
                );
                return flagAfter(
                  source,
                  runtime
                    .runAgentDiscovery!(source, {
                      ...options,
                      protectedPages,
                      signal,
                    })
                    .then(attachParkedTab),
                );
              },
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
