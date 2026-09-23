import type { BrowserSessionRuntime } from "@unemployed/browser-runtime";
import type {
  DesktopBrowserState,
  UserActionCommandInput,
} from "@unemployed/contracts";
import type { JobFinderRepository } from "@unemployed/db";
import type { EmbeddedBrowser } from "../browser/embedded-browser";

type BrowserStateListener = Pick<
  EmbeddedBrowser,
  "getState" | "onStateChanged"
>;

/**
 * A successful browser sign-in is already the person's action. Once the exact
 * parked tab finishes navigating, read its access state and resume its search
 * without asking for a second confirmation click. No probe runs while a page
 * is still loading or merely receiving focus/typing.
 */
export function installAutomaticSourceAccessResume(input: {
  browser: BrowserStateListener;
  browserRuntime: Pick<BrowserSessionRuntime, "inspectSourceAccess">;
  repository: Pick<
    JobFinderRepository,
    "getActivityControl" | "listUserActionRequests"
  >;
  performUserAction: (command: UserActionCommandInput) => Promise<unknown>;
  delayMs?: number;
}): () => void {
  const signatures = new Map<string, string>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const inFlight = new Set<string>();
  let disposed = false;

  function remember(state: DesktopBrowserState): void {
    for (const tab of state.tabs) {
      signatures.set(tab.id, `${tab.url}\n${tab.title}\n${tab.loading}`);
    }
  }

  async function inspect(tabId: string, signature: string): Promise<void> {
    if (disposed || inFlight.has(tabId)) return;
    inFlight.add(tabId);
    try {
      const state = input.browser.getState();
      const tab = state.tabs.find((candidate) => candidate.id === tabId);
      if (
        state.activeTabId !== tabId ||
        state.phase !== "needs_you" ||
        !tab ||
        tab.loading ||
        `${tab.url}\n${tab.title}\n${tab.loading}` !== signature ||
        (await input.repository.getActivityControl()).paused
      ) {
        return;
      }

      const requests = await input.repository.listUserActionRequests({
        states: ["pending", "page_opened"],
      });
      const request = requests.find(
        (candidate) =>
          candidate.scope.type === "discovery_source" &&
          candidate.scope.parkedTab?.tabId === tabId &&
          candidate.verification.type === "source_access" &&
          candidate.verification.expectedOrigin,
      );
      if (
        !request ||
        request.scope.type !== "discovery_source" ||
        request.verification.type !== "source_access" ||
        !request.verification.expectedOrigin ||
        !input.browserRuntime.inspectSourceAccess
      ) {
        return;
      }
      const expectedOrigin = request.verification.expectedOrigin;

      // The shared runtime probes an open page by origin. Do not let another
      // tab at that origin stand in for the exact tab parked for this request.
      if (
        state.tabs.filter((candidate) => {
          try {
            return (
              new URL(candidate.url).origin === new URL(expectedOrigin).origin
            );
          } catch {
            return false;
          }
        }).length !== 1
      ) {
        return;
      }

      const access = await input.browserRuntime.inspectSourceAccess(
        request.scope.source,
        { expectedOrigin },
      );
      if (
        access.state !== "authenticated" ||
        access.currentOrigin !== expectedOrigin
      ) {
        return;
      }

      const currentState = input.browser.getState();
      const currentTab = currentState.tabs.find(
        (candidate) => candidate.id === tabId,
      );
      if (
        disposed ||
        currentState.activeTabId !== tabId ||
        currentState.phase !== "needs_you" ||
        !currentTab ||
        currentTab.loading ||
        `${currentTab.url}\n${currentTab.title}\n${currentTab.loading}` !==
          signature
      ) {
        return;
      }
      if ((await input.repository.getActivityControl()).paused) return;

      await input.performUserAction({
        action: "confirm_done",
        requestId: request.id,
        commandId: `auto_source_access_${request.id}_r${request.revision}`,
        expectedRevision: request.revision,
        credentialsPolicy: "browser_only",
        submitAuthorized: false,
        accountCreationAuthorized: false,
      });
    } catch {
      // A read-only probe can be inconclusive while a page settles. A later
      // completed navigation gives it another chance; the card stays visible.
    } finally {
      inFlight.delete(tabId);
    }
  }

  remember(input.browser.getState());
  const unsubscribe = input.browser.onStateChanged((state) => {
    const tab = state.tabs.find(
      (candidate) => candidate.id === state.activeTabId,
    );
    const previous = tab ? signatures.get(tab.id) : undefined;
    remember(state);
    if (!tab || tab.loading || state.phase !== "needs_you") return;
    const signature = signatures.get(tab.id);
    if (!signature || !previous || signature === previous) return;
    const existing = timers.get(tab.id);
    if (existing) clearTimeout(existing);
    timers.set(
      tab.id,
      setTimeout(() => {
        timers.delete(tab.id);
        void inspect(tab.id, signature);
      }, input.delayMs ?? 500),
    );
  });

  return () => {
    disposed = true;
    unsubscribe();
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
  };
}
