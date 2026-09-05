import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Globe2,
  Hand,
  Import,
  LoaderCircle,
  Maximize2,
  Minimize2,
  Plus,
  RotateCw,
  ShieldCheck,
  Square,
  X,
} from "lucide-react";
import type {
  DesktopBrowserCommand,
  DesktopBrowserState,
} from "@unemployed/contracts";
import {
  JOB_FINDER_BROWSER_LABEL,
  OPEN_JOB_FINDER_BROWSER_ACTION,
} from "../lib/job-finder-browser-handoff-copy";
import {
  subscribeToJobFinderOverlays,
  useJobFinderOverlayOwnership,
} from "../lib/job-finder-overlay-ownership";
import "./browser-peek.css";

const initialState: DesktopBrowserState = {
  revision: 0,
  phase: "closed",
  presentation: "minimized",
  tabs: [],
  activeTabId: null,
  activity: null,
  attention: null,
  automationPaused: false,
};

export function BrowserPeek() {
  const bridge = window.unemployed?.browser;
  const [state, setState] = useState(initialState);
  const [address, setAddress] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const addressRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const active = state.tabs.find((tab) => tab.id === state.activeTabId);
  const shown = state.presentation !== "minimized" && state.phase !== "closed";
  const busy = state.phase === "working";
  const accept = useCallback(
    (next: DesktopBrowserState) =>
      setState((current) =>
        next.revision >= current.revision ? next : current,
      ),
    [],
  );
  const command = useCallback(
    async (input: DesktopBrowserCommand) => {
      if (!bridge) return;
      try {
        accept(await bridge.command(input));
        setMessage(null);
      } catch {
        setMessage(
          "The browser couldn’t complete that action. Try again or close and reopen it.",
        );
      }
    },
    [bridge, accept],
  );
  const minimize = useCallback(() => {
    void command({ type: "minimize" });
  }, [command]);
  const { isTopmost } = useJobFinderOverlayOwnership({
    active: shown,
    close: minimize,
    modal: true,
  });

  useEffect(() => {
    if (!bridge) return;
    const unsubscribe = bridge.onStateChanged(accept);
    void bridge
      .getState()
      .then(accept)
      .catch(() => setMessage("Browser controls are unavailable."));
    const focus = bridge.onFocusAddress(() => {
      addressRef.current?.focus();
      addressRef.current?.select();
    });
    return () => {
      unsubscribe();
      focus();
    };
  }, [bridge, accept]);
  useEffect(() => {
    setAddress(active?.url === "about:blank" ? "" : (active?.url ?? ""));
  }, [active?.url, active?.id]);
  useEffect(() => {
    if (!bridge || !shown) return;
    const measure = () => {
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect) return;
      void bridge
        .setViewport({
          x: Math.max(0, rect.x),
          y: Math.max(0, rect.y),
          width: rect.width,
          height: rect.height,
          visible: isTopmost() && !!active && active.url !== "about:blank",
        })
        .catch(() => undefined);
    };
    const observer = new ResizeObserver(measure);
    if (viewportRef.current) observer.observe(viewportRef.current);
    const unsubscribe = subscribeToJobFinderOverlays(measure);
    window.addEventListener("resize", measure);
    const frame = requestAnimationFrame(measure);
    return () => {
      observer.disconnect();
      unsubscribe();
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      void bridge
        .setViewport({ x: 0, y: 0, width: 0, height: 0, visible: false })
        .catch(() => undefined);
    };
  }, [bridge, shown, active?.id, active?.url, state.presentation, isTopmost]);
  useEffect(() => {
    if (!shown) return;
    const root = document.getElementById("root");
    const wasInert = root?.inert ?? false;
    if (root) root.inert = true;
    addressRef.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || !isTopmost()) return;
      if (event.key === "Escape") {
        event.preventDefault();
        minimize();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "l") {
        event.preventDefault();
        addressRef.current?.focus();
        addressRef.current?.select();
      }
      if (event.key === "Tab") {
        const items = [
          ...(dialogRef.current?.querySelectorAll<HTMLElement>(
            "button:not(:disabled), input:not(:disabled), a[href]",
          ) ?? []),
        ].filter((item) => item.getClientRects().length > 0);
        const first = items[0];
        const last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      if (root) root.inert = wasInert;
      triggerRef.current?.focus();
    };
  }, [shown, isTopmost, minimize]);

  async function importSession() {
    if (!bridge || importing) return;
    setImporting(true);
    try {
      const result = await bridge.importSession();
      setMessage(result.message);
    } catch {
      setMessage(
        "The import couldn’t finish. Your existing sign-ins are still available.",
      );
    } finally {
      setImporting(false);
    }
  }
  const status =
    state.phase === "closing"
      ? "Closing browser"
      : state.phase === "closed"
        ? "Browser closed"
        : state.phase === "pausing"
          ? "Pausing activity…"
          : busy
            ? (state.activity ?? "Agent browsing")
            : state.attention
              ? "Needs you"
              : state.automationPaused
                ? "Activity paused"
                : "Ready when you are";
  return (
    <>
      <button
        ref={triggerRef}
        className="browser-peek-trigger"
        type="button"
        disabled={!bridge}
        aria-label={`${OPEN_JOB_FINDER_BROWSER_ACTION} · ${status}`}
        title={`${JOB_FINDER_BROWSER_LABEL} · ${status}`}
        onClick={() => void command({ type: "open" })}
      >
        <Globe2 size={16} aria-hidden="true" />
        <span className="browser-trigger-label">Browser</span>
        {state.phase !== "closed" && (
          <span
            className={`browser-status-dot ${busy ? "is-working" : state.attention ? "needs-you" : ""}`}
          />
        )}
      </button>
      {shown &&
        createPortal(
          <div
            className="browser-peek-backdrop"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && isTopmost())
                minimize();
            }}
          >
            <div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-label="Job Finder browser"
              className={`browser-peek ${state.presentation === "expanded" ? "is-expanded" : ""}`}
            >
              <div className="browser-peek-heading">
                <div className="browser-peek-brand">
                  <Globe2 size={17} />
                  <span>Browser</span>
                  <span className="browser-peek-divider" />
                  <span className="browser-peek-status" aria-live="polite">
                    {busy && (
                      <LoaderCircle size={13} className="browser-spin" />
                    )}
                    {status}
                  </span>
                </div>
                <div className="browser-window-actions">
                  <button
                    type="button"
                    title="Minimize · keep tabs and activity running"
                    aria-label="Minimize browser"
                    onClick={minimize}
                  >
                    <ChevronDown size={18} />
                  </button>
                  <button
                    type="button"
                    title={
                      state.presentation === "expanded"
                        ? "Return to Peek"
                        : "Expand browser"
                    }
                    aria-label={
                      state.presentation === "expanded"
                        ? "Return to Peek"
                        : "Expand browser"
                    }
                    onClick={() =>
                      void command({
                        type: "expand",
                        expanded: state.presentation !== "expanded",
                      })
                    }
                  >
                    {state.presentation === "expanded" ? (
                      <Minimize2 size={15} />
                    ) : (
                      <Maximize2 size={15} />
                    )}
                  </button>
                  <button
                    className="browser-close"
                    type="button"
                    title="Close · stop activity and release browser pages; keep sign-ins"
                    aria-label="Close browser"
                    onClick={() => void command({ type: "close" })}
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>
              {state.tabs.length > 0 && (
                <div
                  className="browser-tabs"
                  role="tablist"
                  aria-label="Browser tabs"
                >
                  {state.tabs.map((tab) => (
                    <div
                      className={`browser-tab ${tab.id === active?.id ? "is-active" : ""}`}
                      key={tab.id}
                    >
                      <button
                        type="button"
                        role="tab"
                        aria-selected={tab.id === active?.id}
                        title={tab.title}
                        onClick={() =>
                          void command({ type: "select_tab", tabId: tab.id })
                        }
                      >
                        {tab.loading ? (
                          <LoaderCircle size={12} className="browser-spin" />
                        ) : (
                          <Globe2 size={12} />
                        )}
                        <span>{tab.title}</span>
                      </button>
                      <button
                        type="button"
                        aria-label={`Close tab ${tab.title}`}
                        onClick={() =>
                          void command({ type: "close_tab", tabId: tab.id })
                        }
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  <button
                    className="browser-add-tab"
                    type="button"
                    disabled={state.tabs.length >= 8}
                    aria-label="New browser tab"
                    onClick={() => void command({ type: "new_tab" })}
                  >
                    <Plus size={15} />
                  </button>
                </div>
              )}
              <div className="browser-address-row">
                <button
                  type="button"
                  aria-label="Go back"
                  disabled={!active?.canGoBack || busy}
                  onClick={() => void command({ type: "back" })}
                >
                  <ArrowLeft size={16} />
                </button>
                <button
                  type="button"
                  aria-label="Go forward"
                  disabled={!active?.canGoForward || busy}
                  onClick={() => void command({ type: "forward" })}
                >
                  <ArrowRight size={16} />
                </button>
                <button
                  type="button"
                  aria-label={active?.loading ? "Stop loading" : "Reload page"}
                  disabled={!active || busy}
                  onClick={() =>
                    void command({ type: active?.loading ? "stop" : "reload" })
                  }
                >
                  {active?.loading ? (
                    <Square size={13} />
                  ) : (
                    <RotateCw size={15} />
                  )}
                </button>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (address.trim())
                      void command({ type: "navigate", url: address });
                  }}
                >
                  <Globe2 size={14} aria-hidden="true" />
                  <input
                    ref={addressRef}
                    aria-label="Website address"
                    placeholder="Enter a website address"
                    value={address}
                    onChange={(event) => setAddress(event.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    disabled={busy}
                  />
                  <button
                    type="submit"
                    aria-label="Go to website"
                    disabled={!address.trim() || busy}
                  >
                    <ArrowUpRight size={16} />
                  </button>
                </form>
              </div>
              {(state.attention || message) && (
                <div className="browser-notice" role="status">
                  <div>
                    {state.attention && (
                      <strong>{state.attention.title}. </strong>
                    )}
                    {message ?? state.attention?.detail}
                  </div>
                  <button
                    type="button"
                    aria-label="Dismiss browser message"
                    onClick={() => setMessage(null)}
                    hidden={!message}
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
              <div ref={viewportRef} className="browser-page-viewport">
                {(!active || active.url === "about:blank") && (
                  <div className="browser-welcome">
                    <div className="browser-welcome-icon">
                      <Globe2 size={32} strokeWidth={1.35} />
                    </div>
                    <h2>Your browser, right here.</h2>
                    <p>
                      Visit job sites, sign in once, and stay close to your
                      search.
                    </p>
                    <button
                      type="button"
                      className="browser-welcome-go"
                      onClick={() => addressRef.current?.focus()}
                    >
                      Open a website <ArrowUpRight size={15} />
                    </button>
                    <div className="browser-welcome-notes">
                      <span>
                        <ShieldCheck size={15} /> Sign-ins stay on this device
                      </span>
                      <span>
                        <Check size={15} /> Minimize to keep things running
                      </span>
                    </div>
                  </div>
                )}
              </div>
              <div className="browser-peek-footer">
                <button
                  type="button"
                  className="browser-import"
                  disabled={importing || busy}
                  onClick={() => void importSession()}
                  title="Import cookies from a JSON export. Browser profile folders and passwords aren’t supported."
                >
                  {importing ? (
                    <LoaderCircle size={14} className="browser-spin" />
                  ) : (
                    <Import size={14} />
                  )}
                  <span>Import sessions</span>
                </button>
                <span className="browser-footer-hint">
                  {busy
                    ? "Take control before interacting with the page."
                    : state.automationPaused
                      ? "If a prepared form won’t save, reload it. Unsaved fields may reset."
                      : "Your workspace stays right behind this window."}
                </span>
                <button
                  type="button"
                  className="browser-control"
                  disabled={
                    state.phase === "pausing" || state.phase === "closing"
                  }
                  onClick={() =>
                    void command({
                      type: state.automationPaused ? "resume" : "take_control",
                    })
                  }
                >
                  <Hand size={14} />
                  {state.phase === "pausing"
                    ? "Pausing…"
                    : state.automationPaused
                      ? "Resume activity"
                      : "Take control"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
