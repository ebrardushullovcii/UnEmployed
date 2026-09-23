import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  DesktopBrowserState,
  UserActionRequest,
} from "@unemployed/contracts";
import { installAutomaticSourceAccessResume } from "./automatic-source-access-resume";

const origin = "http://127.0.0.1:47950/";
const request = {
  id: "discovery_access_fixture",
  revision: 2,
  state: "page_opened",
  scope: {
    type: "discovery_source",
    source: "target_site",
    parkedTab: { tabId: "parked_tab", url: origin, title: "Sign in" },
  },
  verification: { type: "source_access", expectedOrigin: origin },
} as UserActionRequest;

function browserState(
  overrides: Partial<DesktopBrowserState> = {},
): DesktopBrowserState {
  return {
    revision: 1,
    phase: "needs_you",
    presentation: "peek",
    activeTabId: "parked_tab",
    activity: null,
    attention: {
      kind: "sign_in",
      title: "Sign in",
      detail: "Sign in to continue",
    },
    automationPaused: false,
    tabs: [
      {
        id: "parked_tab",
        title: "Sign in",
        url: `${origin}authboard/`,
        loading: false,
        canGoBack: false,
        canGoForward: false,
      },
    ],
    ...overrides,
  };
}

function setup() {
  let state = browserState();
  let listener: ((state: DesktopBrowserState) => void) | null = null;
  let paused = false;
  const inspectSourceAccess = vi.fn().mockResolvedValue({
    state: "authenticated",
    currentOrigin: origin,
    signals: ["sign_out_control"],
  });
  const performUserAction = vi.fn().mockResolvedValue(undefined);
  const input = {
    browser: {
      getState: () => state,
      onStateChanged: (next: (state: DesktopBrowserState) => void) => {
        listener = next;
        return () => {
          listener = null;
        };
      },
    },
    browserRuntime: { inspectSourceAccess },
    repository: {
      getActivityControl: () => Promise.resolve({ paused }),
      listUserActionRequests: () => Promise.resolve([request]),
    },
    performUserAction,
    delayMs: 10,
  } as unknown as Parameters<typeof installAutomaticSourceAccessResume>[0];
  const dispose = installAutomaticSourceAccessResume(input);
  return {
    emit(next: DesktopBrowserState) {
      state = next;
      listener?.(next);
    },
    setPaused(value: boolean) {
      paused = value;
    },
    inspectSourceAccess,
    performUserAction,
    dispose,
  };
}

afterEach(() => vi.useRealTimers());

describe("automatic source access resume", () => {
  it("resumes the exact parked source request after a completed sign-in navigation", async () => {
    vi.useFakeTimers();
    const flow = setup();
    flow.emit(browserState({ revision: 2 })); // Focus/typing alone changes no page signature.
    await vi.advanceTimersByTimeAsync(20);
    expect(flow.inspectSourceAccess).not.toHaveBeenCalled();

    flow.emit(
      browserState({
        revision: 3,
        tabs: [{ ...browserState().tabs[0]!, loading: true }],
      }),
    );
    flow.emit(
      browserState({
        revision: 4,
        tabs: [{ ...browserState().tabs[0]!, title: "Signed-in jobs" }],
      }),
    );
    await vi.advanceTimersByTimeAsync(20);
    expect(flow.performUserAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "confirm_done",
        requestId: request.id,
        expectedRevision: 2,
        submitAuthorized: false,
      }),
    );
    flow.dispose();
  });

  it("keeps the card when activity is paused or another same-origin tab can stand in", async () => {
    vi.useFakeTimers();
    const flow = setup();
    flow.setPaused(true);
    flow.emit(
      browserState({
        tabs: [{ ...browserState().tabs[0]!, title: "Signed-in jobs" }],
      }),
    );
    await vi.advanceTimersByTimeAsync(20);
    expect(flow.inspectSourceAccess).not.toHaveBeenCalled();
    flow.setPaused(false);
    flow.emit(
      browserState({
        tabs: [
          { ...browserState().tabs[0]!, title: "Signed-in jobs 2" },
          { ...browserState().tabs[0]!, id: "other_tab" },
        ],
      }),
    );
    await vi.advanceTimersByTimeAsync(20);
    expect(flow.inspectSourceAccess).not.toHaveBeenCalled();
    expect(flow.performUserAction).not.toHaveBeenCalled();
    flow.dispose();
  });

  it("does not resume after the person leaves the parked tab during a slow probe", async () => {
    vi.useFakeTimers();
    const flow = setup();
    let finishProbe: ((value: unknown) => void) | undefined;
    flow.inspectSourceAccess.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishProbe = resolve;
        }),
    );
    flow.emit(
      browserState({
        tabs: [{ ...browserState().tabs[0]!, title: "Signed-in jobs" }],
      }),
    );
    await vi.advanceTimersByTimeAsync(20);
    expect(flow.inspectSourceAccess).toHaveBeenCalledOnce();

    flow.emit(
      browserState({
        activeTabId: "other_tab",
        tabs: [
          { ...browserState().tabs[0]!, title: "Signed-in jobs" },
          {
            ...browserState().tabs[0]!,
            id: "other_tab",
            url: "http://other.test/",
          },
        ],
      }),
    );
    finishProbe?.({
      state: "authenticated",
      currentOrigin: origin,
      signals: ["sign_out_control"],
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(flow.performUserAction).not.toHaveBeenCalled();
    flow.dispose();
  });
});
